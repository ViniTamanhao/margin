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
      static scrollIntoView = actual.EditorView.scrollIntoView
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
  let savedA = original
  api.save.mockImplementation(async (request) => {
    savedA = { path: request.path, content: request.content, revision: 'local' }
    return { kind: 'saved', revision: 'local' }
  })
  api.read.mockImplementation(async (path) =>
    path === 'b.md' ? { path, content: '# Second', revision: 'B' } : savedA
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

test('A → B → A clears conflict and resumes revision-checked autosave of local edits', async () => {
  const view = views[0]
  view.dispatch({ changes: { from: 0, insert: 'Local ' }, selection: { anchor: 4 } })
  const state = view.state
  api.read.mockResolvedValue({ ...original, content: 'External', revision: 'B' })
  await controller.refresh()
  expect(controller.snapshot().status).toBe('conflict')
  expect(controller.snapshot().error).not.toBe('')
  await vi.advanceTimersByTimeAsync(650)
  expect(api.save).not.toHaveBeenCalled()

  api.read.mockResolvedValue(original)
  await controller.refresh()
  expect(controller.snapshot()).toMatchObject({ path: 'a.md', status: 'dirty', error: '' })
  expect(view.state).toBe(state)
  expect(view.state.selection.main.anchor).toBe(4)
  expect(undoDepth(view.state)).toBe(1)
  await vi.advanceTimersByTimeAsync(649)
  expect(api.save).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(api.save).toHaveBeenCalledExactlyOnceWith({
    path: 'a.md',
    content: state.sliceDoc(),
    revision: 'A'
  })
  expect(controller.snapshot()).toMatchObject({ status: 'saved', error: '' })
})

test('conflict stays paused while disk differs from the known base revision', async () => {
  const view = views[0]
  view.dispatch({ changes: { from: 0, insert: 'Local ' } })
  const state = view.state
  api.read.mockResolvedValue({ ...original, content: 'External', revision: 'B' })
  await controller.refresh()
  api.read.mockResolvedValue({ ...original, content: 'Another external edit', revision: 'C' })
  await controller.refresh()
  expect(controller.snapshot().status).toBe('conflict')
  expect(controller.snapshot().error).not.toBe('')
  await vi.advanceTimersByTimeAsync(1300)
  expect(api.save).not.toHaveBeenCalled()
  expect(view.state).toBe(state)
})

test('navigation records explicit opens and restores cursor locations across files', async () => {
  const view = views[0]
  api.read.mockImplementation(async (path) =>
    path === 'a.md' ? original : { path, content: '# Second document', revision: 'B' }
  )
  view.dispatch({ selection: { anchor: 6 } })
  expect(controller.snapshot().canGoBack).toBe(false)
  await controller.open('b.md')
  view.dispatch({ selection: { anchor: 10 } })
  await controller.navigate('back')
  expect(controller.location()).toEqual({ path: 'a.md', position: 6 })
  await controller.navigate('forward')
  expect(controller.location()).toEqual({ path: 'b.md', position: 10 })
  expect(controller.snapshot().recents).toEqual(['b.md', 'a.md'])
  await controller.open('b.md')
  await controller.navigate('back')
  expect(controller.location()?.path).toBe('a.md')
  await controller.open('c.md')
  expect(controller.snapshot().canGoForward).toBe(false)
})

test('failed or superseded opens do not record navigation or recents', async () => {
  api.read.mockRejectedValueOnce(new Error('ENOENT'))
  expect(await controller.open('missing.md')).toBe(false)
  expect(controller.snapshot().canGoBack).toBe(false)
  expect(controller.snapshot().recents).toEqual(['a.md'])
  const read = deferred<DocumentSnapshot>()
  api.read.mockImplementation(async (path) =>
    path === 'slow.md' ? read.promise : { ...original, path }
  )
  const slow = controller.open('slow.md')
  await controller.open('c.md')
  read.resolve({ ...original, path: 'slow.md' })
  expect(await slow).toBe(false)
  expect(controller.snapshot().recents).toEqual(['c.md', 'a.md'])
  await controller.navigate('back')
  expect(controller.location()?.path).toBe('a.md')
  expect(controller.snapshot().canGoBack).toBe(false)
})

test('history clamps positions after external edits and preserves stacks on missing targets', async () => {
  api.read.mockImplementation(async (path) => ({ ...original, path }))
  views[0].dispatch({ selection: { anchor: 9 } })
  await controller.open('b.md')
  api.read.mockImplementation(async (path) =>
    path === 'a.md' ? { path, content: 'Hi', revision: 'short' } : { ...original, path }
  )
  await controller.navigate('back')
  expect(controller.location()).toEqual({ path: 'a.md', position: 2 })
  api.read.mockImplementation(async (path) => {
    if (path === 'b.md') throw new Error('ENOENT')
    return { path, content: 'Hi', revision: 'short' }
  })
  await controller.navigate('forward')
  expect(controller.location()?.path).toBe('a.md')
  expect(controller.snapshot().canGoForward).toBe(true)
  expect(controller.snapshot().openError).toContain('b.md')
  controller.reset()
  expect(controller.snapshot()).toMatchObject({
    canGoBack: false,
    canGoForward: false,
    recents: []
  })
})

test('heading jumps use live unsaved Markdown, preserve undo and record a return location', async () => {
  const view = views[0]
  view.dispatch({
    changes: { from: view.state.doc.length, insert: '\n\n## Armor\n' },
    selection: { anchor: 4 }
  })
  const snapshot = await controller.headings()
  const target = snapshot!.headings.find(({ title }) => title === 'Armor')!
  const readCount = api.read.mock.calls.length
  expect(controller.jumpToHeading(snapshot!.version, target.position)).toBe(true)
  expect(controller.location()).toEqual({ path: 'a.md', position: original.content.length + 2 })
  expect(api.read).toHaveBeenCalledTimes(readCount)
  expect(undoDepth(view.state)).toBe(1)
  await controller.navigate('back')
  expect(controller.location()).toEqual({ path: 'a.md', position: 4 })
  await controller.navigate('forward')
  expect(controller.location()?.position).toBe(target.position)
})

test('heading jump refuses stale positions after edits or workspace reset', async () => {
  const snapshot = await controller.headings()
  views[0].dispatch({ changes: { from: 0, insert: 'Changed ' }, selection: { anchor: 5 } })
  expect(controller.jumpToHeading(snapshot!.version, 0)).toBe(false)
  expect(controller.location()?.position).toBe(5)
  expect(controller.snapshot().openError).toContain('changed')
  controller.reset()
  expect(controller.jumpToHeading(snapshot!.version, 0)).toBe(false)
})
