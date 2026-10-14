import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { EditorState, type TransactionSpec } from '@codemirror/state'
import { undo, undoDepth } from '@codemirror/commands'
import type { DocumentSnapshot, MarginAPI, SaveResult } from '../../../shared/api'
import { EditorController } from './controller'

// Keep real CodeMirror states/history, replacing only the DOM-dependent view.
const views = vi.hoisted(
  () =>
    [] as {
      state: EditorState
      dispatch: (spec: TransactionSpec) => void
    }[]
)
vi.mock('@codemirror/view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@codemirror/view')>()
  return {
    ...actual,
    EditorView: class {
      static editable = actual.EditorView.editable
      static lineWrapping = actual.EditorView.lineWrapping
      static contentAttributes = actual.EditorView.contentAttributes
      static updateListener = actual.EditorView.updateListener
      state: EditorState
      constructor(config: { state: EditorState }) {
        this.state = config.state
        views.push(this)
      }
      setState(state: EditorState): void {
        this.state = state
      }
      dispatch = (spec: TransactionSpec): void => {
        const transaction = this.state.update(spec)
        this.state = transaction.state
        for (const listener of this.state.facet(actual.EditorView.updateListener)) {
          listener({ state: this.state, docChanged: transaction.docChanged } as Parameters<
            typeof listener
          >[0])
        }
      }
      focus(): void {
        // No DOM focus in the headless view.
      }
      destroy(): void {
        // No DOM resources in the headless view.
      }
    }
  }
})

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: Error) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const original = { path: 'a.md', content: '# Original', revision: 'A' }
let controller: EditorController
let detach: () => void
const api = {
  read: vi.fn<MarginAPI['document']['read']>(),
  save: vi.fn<MarginAPI['document']['save']>(),
  saveCopy: vi.fn<MarginAPI['document']['saveCopy']>()
}
beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  views.length = 0
  api.read.mockResolvedValue(original)
  api.save.mockResolvedValue({ kind: 'saved', revision: 'local' })
  controller = new EditorController(api)
  detach = controller.attach({} as HTMLElement)
  await controller.open('a.md')
  await controller.refresh()
})
afterEach(() => {
  controller.reset()
  detach()
  vi.useRealTimers()
})

test('failed open preserves active document, selection, undo history and dirty session', async () => {
  const view = views[0]
  view.dispatch({
    changes: { from: view.state.doc.length, insert: ' local' },
    selection: { anchor: 3 }
  })
  const state = view.state
  const presentation = controller.snapshot()
  const read = deferred<DocumentSnapshot>()
  api.read.mockImplementation((path) =>
    path === 'b.md' ? read.promise : Promise.resolve(original)
  )
  const opening = controller.open('b.md')
  expect(controller.snapshot()).toBe(presentation)
  expect(view.state).toBe(state)
  expect(api.save).not.toHaveBeenCalled()

  read.reject(new Error('ENOENT'))
  await opening
  expect(controller.snapshot()).toMatchObject({
    ...presentation,
    openError: expect.stringContaining('b.md')
  })
  expect(view.state).toBe(state)
  expect(view.state.selection.main.anchor).toBe(3)
  expect(undoDepth(view.state)).toBe(1)
  expect(undo(view)).toBe(true)
  expect(view.state.sliceDoc()).toBe(original.content)
  expect(controller.snapshot().status).toBe('saved')
  expect(controller.snapshot().openError).toContain('b.md')
})

test.each(['saved', 'conflict', 'error'] as const)(
  'pending save ending in %s cannot erase an open failure',
  async (outcome) => {
    const view = views[0]
    view.dispatch({ changes: { from: 0, insert: 'Local ' } })
    const state = view.state
    const save = deferred<SaveResult>()
    api.save.mockReturnValue(save.promise)
    await vi.advanceTimersByTimeAsync(650)
    expect(controller.snapshot().status).toBe('saving')
    api.read.mockRejectedValue(new Error('EACCES'))
    await controller.open('b.md')
    const openError = controller.snapshot().openError
    expect(controller.snapshot()).toMatchObject({ path: 'a.md', status: 'saving', error: '' })
    expect(openError).toContain('b.md')
    if (outcome === 'error') save.reject(new Error('EACCES'))
    else
      save.resolve(
        outcome === 'saved'
          ? { kind: 'saved', revision: 'local' }
          : { kind: 'conflict', current: original }
      )
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.snapshot()).toMatchObject({ path: 'a.md', status: outcome, openError })
    expect(view.state).toBe(state)
    if (outcome !== 'saved') expect(controller.snapshot().error).not.toBe('')
  }
)

test('successful open clears open failure and restores cached selection and history', async () => {
  const view = views[0]
  view.dispatch({ changes: { from: 0, insert: 'Local ' }, selection: { anchor: 4 } })
  const state = view.state
  api.read.mockRejectedValueOnce(new Error('ENOENT'))
  await controller.open('b.md')
  api.read.mockImplementation(async (path) =>
    path === 'b.md' ? { path, content: '# Second', revision: 'B' } : original
  )
  await controller.open('b.md')
  expect(controller.snapshot()).toMatchObject({ path: 'b.md', status: 'saved', openError: '' })
  expect(view.state.sliceDoc()).toBe('# Second')
  await controller.open('a.md')
  expect(view.state).toBe(state)
  expect(view.state.selection.main.anchor).toBe(4)
  expect(undoDepth(view.state)).toBe(1)
})

test('a stale failed open cannot replace a newer successful open presentation', async () => {
  const read = deferred<DocumentSnapshot>()
  api.read.mockImplementation(async (path) =>
    path === 'b.md' ? read.promise : { path, content: '# Third', revision: 'C' }
  )
  const opening = controller.open('b.md')
  await controller.open('c.md')
  const presentation = controller.snapshot()
  read.reject(new Error('ENOENT'))
  await opening
  expect(controller.snapshot()).toBe(presentation)
  expect(views[0].state.sliceDoc()).toBe('# Third')
})
