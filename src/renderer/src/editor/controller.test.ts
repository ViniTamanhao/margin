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

const renamed = (
  from: string,
  to: string
): import('../../../shared/api').WorkspaceResult<
  import('../../../shared/api').WorkspaceMutation
> => ({
  ok: true,
  value: {
    entry: { path: to, kind: 'file' },
    change: {
      workspace: {
        root: '/test',
        version: 1,
        name: 'test',
        files: [to],
        directories: [],
        warnings: []
      },
      changedPaths: [to],
      operation: { kind: 'rename', from, to }
    }
  }
})

test('rename flushes dirty content first and preserves active selection, undo and future autosave path', async () => {
  const view = views[0]
  view.dispatch({ changes: { from: 0, insert: 'Local ' }, selection: { anchor: 4 } })
  const save = deferred<SaveResult>()
  api.save.mockReturnValueOnce(save.promise)
  const execute = vi.fn(async () => renamed('a.md', 'renamed.md'))
  const changing = controller.changeWorkspaceItem('a.md', 'rename', execute)
  await vi.advanceTimersByTimeAsync(0)
  expect(execute).not.toHaveBeenCalled()
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'a.md', content: 'Local # Original' })
  )
  api.read.mockResolvedValue({ path: 'renamed.md', content: 'Local # Original', revision: 'local' })
  save.resolve({ kind: 'saved', revision: 'local' })
  expect((await changing).ok).toBe(true)
  expect(execute).toHaveBeenCalledOnce()
  expect(controller.location()).toEqual({ path: 'renamed.md', position: 4 })
  expect(view.state.sliceDoc()).toBe('Local # Original')
  expect(undoDepth(view.state)).toBe(1)
  view.dispatch({ changes: { from: 0, insert: 'More ' } })
  await vi.advanceTimersByTimeAsync(650)
  expect(api.save).toHaveBeenLastCalledWith(expect.objectContaining({ path: 'renamed.md' }))
})

test.each(['rename', 'trash'] as const)(
  '%s blocks conflict, missing and failed-save sessions',
  async (operation) => {
    const execute = vi.fn(async () => renamed('a.md', 'b.md'))
    views[0].dispatch({ changes: { from: 0, insert: 'Dirty ' } })
    api.read.mockResolvedValue({ ...original, content: 'External', revision: 'B' })
    await controller.refresh()
    expect((await controller.changeWorkspaceItem('a.md', operation, execute)).ok).toBe(false)
    expect(execute).not.toHaveBeenCalled()
    api.read.mockRejectedValue(new Error('ENOENT'))
    await controller.refresh()
    expect((await controller.changeWorkspaceItem('a.md', operation, execute)).ok).toBe(false)
    expect(execute).not.toHaveBeenCalled()
    controller.reset()
    api.read.mockResolvedValue(original)
    await controller.open('a.md')
    views[0].dispatch({ changes: { from: 0, insert: 'Dirty ' } })
    api.save.mockRejectedValue(new Error('EACCES'))
    await vi.advanceTimersByTimeAsync(650)
    expect(controller.snapshot().status).toBe('error')
    expect((await controller.changeWorkspaceItem('a.md', operation, execute)).ok).toBe(false)
    expect(execute).not.toHaveBeenCalled()
  }
)

test('folder rename remaps active/cached documents, heading source, recents and Back/Forward', async () => {
  api.read.mockImplementation(async (path) => ({ path, content: '# Heading', revision: 'same' }))
  await controller.open('folder/a.md')
  views[0].dispatch({ selection: { anchor: 3 } })
  await controller.open('folder/nested/b.md')
  const heading = await controller.headings()
  views[0].dispatch({ selection: { anchor: 6 } })
  controller.applyWorkspaceOperation({ kind: 'rename', from: 'folder', to: 'world' })
  expect(controller.location()).toEqual({ path: 'world/nested/b.md', position: 6 })
  expect(controller.snapshot().recents).toEqual(['world/nested/b.md', 'world/a.md', 'a.md'])
  expect(controller.jumpToHeading(heading!.version, 0)).toBe(true)
  await controller.navigate('back')
  expect(controller.location()).toEqual({ path: 'world/nested/b.md', position: 6 })
  await controller.navigate('back')
  expect(controller.location()).toEqual({ path: 'world/a.md', position: 3 })
  await controller.navigate('forward')
  expect(controller.location()?.path).toBe('world/nested/b.md')
})

test('Trash flushes cached descendants, closes affected active documents and purges navigation', async () => {
  api.read.mockImplementation(async (path) => ({ ...original, path }))
  await controller.open('folder/a.md')
  views[0].dispatch({ changes: { from: 0, insert: 'Draft ' } })
  const execute = vi.fn(async () => ({
    ok: true as const,
    value: {
      entry: { path: 'folder', kind: 'directory' as const },
      change: {
        workspace: {
          root: '/test',
          version: 1,
          name: 'test',
          files: [],
          directories: [],
          warnings: []
        },
        changedPaths: [],
        operation: { kind: 'trash' as const, path: 'folder' }
      }
    }
  }))
  await controller.changeWorkspaceItem('folder', 'trash', execute)
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'folder/a.md', content: 'Draft # Original' })
  )
  expect(execute).toHaveBeenCalledOnce()
  expect(controller.snapshot().path).toBeNull()
  expect(controller.snapshot().recents).not.toContain('folder/a.md')
  api.save.mockClear()
  await vi.advanceTimersByTimeAsync(1300)
  expect(api.save).not.toHaveBeenCalled()
})

test('rename refuses a destination with another cached session, even if absent from the tree', async () => {
  api.read.mockImplementation(async (path) => ({ ...original, path }))
  await controller.open('destination.md')
  views[0].dispatch({ changes: { from: 0, insert: 'Unsaved destination ' } })
  await controller.open('a.md')
  const execute = vi.fn(async () => renamed('a.md', 'destination.md'))
  const result = await controller.changeWorkspaceItem('a.md', 'rename', execute, 'destination.md')
  expect(result).toMatchObject({ ok: false, error: { code: 'collision' } })
  expect(execute).not.toHaveBeenCalled()
  expect(controller.snapshot().path).toBe('a.md')
  expect(controller.snapshot().recents).toContain('destination.md')
})

test('failed rename keeps original editor state and does not remap navigation', async () => {
  views[0].dispatch({ selection: { anchor: 5 } })
  const result = await controller.changeWorkspaceItem(
    'a.md',
    'rename',
    async () => ({ ok: false, error: { code: 'collision', message: 'Already exists.' } }),
    'b.md'
  )
  expect(result.ok).toBe(false)
  expect(controller.location()).toEqual({ path: 'a.md', position: 5 })
  expect(controller.snapshot().recents).toEqual(['a.md'])
})

test('content result navigation records and restores the previous cursor, including same-file jumps', async () => {
  views[0].dispatch({ selection: { anchor: 4 } })
  api.read.mockImplementation(async (path) =>
    path === 'b.md' ? { path, content: '# B\narmor resistance', revision: 'B' } : original
  )
  expect(await controller.open('b.md', 8)).toBe(true)
  expect(views[0].state.selection.main.head).toBe(8)
  expect(controller.snapshot().recents).toEqual(['b.md', 'a.md'])
  await controller.navigate('back')
  expect(controller.snapshot().path).toBe('a.md')
  expect(views[0].state.selection.main.head).toBe(4)
  await controller.open('a.md', 9)
  await controller.navigate('back')
  expect(views[0].state.selection.main.head).toBe(4)
})

test('Read / Write projects unsaved content without changing session, history, recents or save timing', async () => {
  const view = views[0]
  view.dispatch({ changes: { from: 0, insert: '# Unsaved\n' }, selection: { anchor: 2, head: 7 } })
  const state = view.state
  const before = controller.snapshot()
  const location = controller.location()
  const reads = api.read.mock.calls.length
  controller.setMode('read')
  expect(controller.snapshot().readingState).toBe(state)
  expect(controller.snapshot().readingState?.doc.toString()).toContain('# Unsaved')
  expect(controller.snapshot().recents).toBe(before.recents)
  expect(controller.snapshot().canGoBack).toBe(before.canGoBack)
  expect(controller.snapshot().canGoForward).toBe(before.canGoForward)
  controller.setMode('write')
  expect(view.state).toBe(state)
  expect(controller.location()).toEqual(location)
  expect(undoDepth(view.state)).toBe(1)
  expect(api.read).toHaveBeenCalledTimes(reads)
  expect(api.save).not.toHaveBeenCalled()
  controller.setMode('read')
  await vi.advanceTimersByTimeAsync(1000)
  expect(api.save).toHaveBeenCalledOnce()
  expect(controller.snapshot().status).toBe('saved')
  controller.setMode('write')
  expect(undo({ state: view.state, dispatch: view.dispatch })).toBe(true)
  expect(view.state.doc.toString()).toBe(original.content)
})

test('Read mode follows clean external reloads and flush still saves the live session', async () => {
  controller.setMode('read')
  api.read.mockResolvedValue({ ...original, content: '# External', revision: 'external' })
  await controller.refresh()
  expect(controller.snapshot().readingState?.doc.toString()).toBe('# External')
  controller.setMode('write')
  views[0].dispatch({ changes: { from: 0, insert: 'local ' } })
  controller.setMode('read')
  expect(await controller.flush()).toBe(true)
  expect(api.save).toHaveBeenCalledOnce()
  expect(controller.snapshot().readingState?.doc.toString()).toBe('local # External')
})

test('conflicts in Read mode retain local content and keep close flush blocked', async () => {
  views[0].dispatch({ changes: { from: 0, insert: 'local ' } })
  const local = views[0].state
  controller.setMode('read')
  api.read.mockResolvedValue({ ...original, content: 'External conflict', revision: 'external' })
  await controller.refresh()
  expect(controller.snapshot().status).toBe('conflict')
  expect(controller.snapshot().readingState).toBe(local)
  expect(await controller.flush()).toBe(false)
  expect(api.save).not.toHaveBeenCalled()
  controller.setMode('write')
  expect(views[0].state).toBe(local)
})
