import { Compartment, EditorSelection, EditorState, type Text } from '@codemirror/state'
import { EditorView, keymap, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { contextualMarkdown } from './markdown-presentation'
import { extractHeadings, type HeadingSnapshot } from './headings'
import {
  NavigationSession,
  type NavigationLocation,
  type NavigationDirection
} from '../navigation/session'
import { isWithinPath, remapPath } from '../../../shared/workspace-paths'
import type { WorkspaceChange, WorkspaceMutation, WorkspaceResult } from '../../../shared/api'
import type { MarginAPI, DocumentSnapshot } from '../../../shared/api'

type DocumentStatus = 'saved' | 'dirty' | 'saving' | 'conflict' | 'missing' | 'error'
interface EditorSession {
  state: EditorState
  savedDoc: Text
  revision: string
  status: DocumentStatus
  error: string
  timer?: ReturnType<typeof setTimeout>
  saving?: Promise<boolean>
}
export interface EditorPresentation {
  path: string | null
  locked: boolean
  status: DocumentStatus | 'idle'
  error: string
  openError: string
  canGoBack: boolean
  canGoForward: boolean
  recents: readonly string[]
}

// CodeMirror owns documents, selections and history; React only subscribes to presentation.
export class EditorController {
  private headingVersion = 0
  private headingSource: { path: string; doc: Text; version: number } | null = null
  private changingWorkspace = false
  private deferredRefresh = false
  private navigation = new NavigationSession()
  private sessions = new Map<string, EditorSession>()
  private view: EditorView | null = null
  private generation = 0
  private locked = false
  private editability = new Compartment()
  private listeners = new Set<() => void>()
  private presentation: EditorPresentation = {
    path: null,
    status: 'idle',
    error: '',
    openError: '',
    locked: false,
    canGoBack: false,
    canGoForward: false,
    recents: []
  }

  constructor(private readonly api: MarginAPI['document']) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  snapshot = (): EditorPresentation => this.presentation

  private present(patch: Partial<EditorPresentation>): void {
    const next = { ...this.presentation, ...patch }
    if (
      next.locked === this.presentation.locked &&
      next.path === this.presentation.path &&
      next.status === this.presentation.status &&
      next.error === this.presentation.error &&
      next.openError === this.presentation.openError &&
      next.canGoBack === this.presentation.canGoBack &&
      next.canGoForward === this.presentation.canGoForward &&
      next.recents === this.presentation.recents
    )
      return
    this.presentation = next
    for (const listener of this.listeners) listener()
  }
  private show(path: string, session: EditorSession): void {
    if (this.presentation.path === path)
      this.present({ status: session.status, error: session.error })
  }
  private state(content: string): EditorState {
    return EditorState.create({
      doc: content,
      extensions: [
        this.editability.of([
          EditorState.readOnly.of(this.locked),
          EditorView.editable.of(!this.locked)
        ]),
        markdown(),
        contextualMarkdown,
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        ...(content.includes('\r\n') ? [EditorState.lineSeparator.of('\r\n')] : []),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              void this.flush()
              return true
            }
          },
          ...defaultKeymap,
          ...historyKeymap
        ]),
        EditorView.contentAttributes.of({ 'aria-label': 'Markdown editor', spellcheck: 'true' }),
        EditorView.updateListener.of((update) => {
          const path = this.presentation.path
          const session = path ? this.sessions.get(path) : undefined
          if (!session || !path) return
          session.state = update.state
          if (!update.docChanged) return
          if (session.status !== 'conflict' && session.status !== 'missing') {
            session.status = session.state.doc.eq(session.savedDoc) ? 'saved' : 'dirty'
            session.error = ''
            this.schedule(path, session)
          }
          this.show(path, session)
        })
      ]
    })
  }

  attach(element: HTMLElement): () => void {
    const session = this.presentation.path ? this.sessions.get(this.presentation.path) : undefined
    const view = new EditorView({ parent: element, state: session?.state ?? this.state('') })
    this.view = view
    return () => {
      view.destroy()
      if (this.view === view) this.view = null
    }
  }

  focus(): void {
    this.view?.focus()
  }

  location(): NavigationLocation | null {
    const path = this.presentation.path
    const session = path ? this.sessions.get(path) : undefined
    return path && session ? { path, position: session.state.selection.main.head } : null
  }

  applyWorkspaceOperation(operation: WorkspaceChange['operation']): void {
    if (!operation) return
    this.generation++
    if (operation.kind === 'rename') {
      for (const [path, session] of [...this.sessions]) {
        if (!isWithinPath(path, operation.from)) continue
        clearTimeout(session.timer)
        this.sessions.delete(path)
        const next = remapPath(path, operation.from, operation.to)
        this.sessions.set(next, session)
        this.schedule(next, session)
      }
      this.navigation.remap(operation.from, operation.to)
      if (this.headingSource)
        this.headingSource.path = remapPath(this.headingSource.path, operation.from, operation.to)
      if (this.presentation.path)
        this.present({ path: remapPath(this.presentation.path, operation.from, operation.to) })
    } else {
      this.navigation.remove(operation.path)
      for (const [path, session] of this.sessions) {
        if (!isWithinPath(path, operation.path)) continue
        clearTimeout(session.timer)
        this.sessions.delete(path)
      }
      if (this.headingSource && isWithinPath(this.headingSource.path, operation.path))
        this.headingSource = null
      if (this.presentation.path && isWithinPath(this.presentation.path, operation.path)) {
        this.present({ path: null, status: 'idle', error: '', openError: '' })
        this.view?.setState(this.state(''))
      }
    }
    this.presentNavigation()
  }

  async changeWorkspaceItem(
    path: string,
    operation: 'rename' | 'trash',
    execute: () => Promise<WorkspaceResult<WorkspaceMutation | null>>
  ): Promise<WorkspaceResult<WorkspaceMutation | null>> {
    if (this.locked)
      return {
        ok: false,
        error: { code: 'changed', message: 'Wait for the current operation to finish.' }
      }
    this.setLocked(true)
    const blocked: WorkspaceResult<WorkspaceMutation | null> = {
      ok: false,
      error: {
        code: 'changed',
        message: `Resolve or save the affected document before ${operation === 'rename' ? 'renaming this item' : 'moving this item to Trash'}.`
      }
    }
    try {
      const affected = [...this.sessions.keys()].filter((cached) => isWithinPath(cached, path))
      for (const cached of affected) {
        const session = this.sessions.get(cached)!
        if (session.saving) await session.saving
        await this.refresh([cached])
        if (['conflict', 'missing', 'error'].includes(session.status)) return blocked
        if (!(await this.save(cached))) return blocked
      }
      // Delay watcher refreshes until old cache keys have been remapped or removed.
      this.changingWorkspace = true
      const result = await execute()
      if (result.ok && result.value) this.applyWorkspaceOperation(result.value.change.operation)
      return result
    } catch (error) {
      console.error('Workspace item operation failed.', error)
      return {
        ok: false,
        error: {
          code: 'filesystem',
          message: 'Could not change this item. Check that the folder is accessible and try again.'
        }
      }
    } finally {
      this.changingWorkspace = false
      this.setLocked(false)
      if (this.deferredRefresh) {
        this.deferredRefresh = false
        await this.refresh()
      }
    }
  }

  async headings(signal?: AbortSignal): Promise<HeadingSnapshot | null> {
    const path = this.presentation.path
    const session = path ? this.sessions.get(path) : undefined
    if (!path || !session) return null
    const source = { path, doc: session.state.doc, version: ++this.headingVersion }
    this.headingSource = source
    const isCancelled = (): boolean =>
      Boolean(signal?.aborted) ||
      this.headingSource !== source ||
      this.presentation.path !== path ||
      this.sessions.get(path)?.state.doc !== source.doc
    const headings = await extractHeadings(session.state, isCancelled)
    return headings && !isCancelled() ? { path, version: source.version, headings } : null
  }

  jumpToHeading(version: number, position: number): boolean {
    const source = this.headingSource
    const session = source ? this.sessions.get(source.path) : undefined
    if (this.locked) return false
    if (
      !source ||
      !session ||
      source.version !== version ||
      this.presentation.path !== source.path ||
      session.state.doc !== source.doc
    ) {
      this.present({ openError: 'This document changed. Reopen Go to Heading.' })
      return false
    }
    const previous = this.location()
    const anchor = Math.max(0, Math.min(session.state.doc.length, Math.trunc(position)))
    this.generation++
    const transaction = {
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor, { y: 'center' })
    }
    if (this.view) this.view.dispatch(transaction)
    else session.state = session.state.update(transaction).state
    this.navigation.record(previous, { path: source.path, position: anchor })
    this.present({ openError: '' })
    this.presentNavigation()
    this.focus()
    return true
  }

  private presentNavigation(): void {
    this.present({
      canGoBack: Boolean(this.navigation.target('back')),
      canGoForward: Boolean(this.navigation.target('forward')),
      recents: this.navigation.recents
    })
  }

  open(path: string): Promise<boolean> {
    return this.openDocument(path, 'record')
  }

  async navigate(direction: NavigationDirection): Promise<void> {
    const target = this.navigation.target(direction)
    if (target) await this.openDocument(target.path, direction, target.position)
  }

  private async openDocument(
    path: string,
    history: 'record' | 'none' | NavigationDirection,
    position?: number
  ): Promise<boolean> {
    if (this.locked && history !== 'none') return false
    const generation = ++this.generation
    try {
      let session = this.sessions.get(path)
      if (session && path !== this.presentation.path && history !== 'none') {
        await this.refresh([path])
        if (session.status === 'missing') throw new Error('Document unavailable.')
      }
      if (!session) {
        const snapshot = await this.api.read(path)
        if (generation !== this.generation || (this.locked && history !== 'none')) return false
        const state = this.state(snapshot.content)
        session = {
          state,
          savedDoc: state.doc,
          revision: snapshot.revision,
          status: 'saved',
          error: ''
        }
        this.sessions.set(path, session)
      }
      if (generation !== this.generation || (this.locked && history !== 'none')) return false
      const previous = this.location()
      if (position !== undefined) {
        const anchor = Math.max(0, Math.min(session.state.doc.length, Math.trunc(position)))
        session.state = session.state.update({ selection: { anchor } }).state
      }
      const destination = { path, position: session.state.selection.main.head }
      if (history === 'record') this.navigation.record(previous, destination)
      else if (history !== 'none') this.navigation.travel(history, previous)
      // Commit the switch only after the target is available. Open failures are
      // independent of the active session's save/conflict status.
      this.present({ path, status: session.status, error: session.error, openError: '' })
      this.view?.setState(session.state)
      if (position !== undefined) {
        this.view?.dispatch({
          effects: EditorView.scrollIntoView(destination.position, { y: 'center' })
        })
      }
      this.view?.focus()
      this.presentNavigation()
      if (previous && previous.path !== path) void this.save(previous.path)
      void this.refresh([path])
      return true
    } catch {
      if (generation === this.generation)
        this.present({
          openError: `Could not open “${path}”. It may have moved, been deleted, or become unreadable.`
        })
      return false
    }
  }

  private schedule(path: string, session: EditorSession): void {
    clearTimeout(session.timer)
    if (session.status === 'dirty')
      session.timer = setTimeout(() => {
        void this.save(path)
      }, 650)
  }

  private async save(path: string): Promise<boolean> {
    const session = this.sessions.get(path)
    if (!session) return true
    clearTimeout(session.timer)
    if (session.saving) {
      await session.saving
      return this.save(path)
    }
    if (
      session.status === 'saved' ||
      (session.status === 'missing' && session.state.doc.eq(session.savedDoc))
    )
      return true
    if (session.status === 'conflict' || session.status === 'missing') return false
    const state = session.state
    session.status = 'saving'
    session.error = ''
    this.show(path, session)
    const saving = (async (): Promise<boolean> => {
      try {
        const result = await this.api.save({
          path,
          content: state.sliceDoc(),
          revision: session.revision
        })
        if (result.kind === 'saved') {
          session.revision = result.revision
          session.savedDoc = state.doc
          session.status = session.state.doc.eq(state.doc) ? 'saved' : 'dirty'
          this.schedule(path, session)
          return true
        }
        session.status = result.kind
        session.error =
          result.kind === 'conflict'
            ? 'This file changed outside Margin. Your edits are kept here; autosave is paused.'
            : 'This file was removed or renamed. Your edits are kept here; autosave is paused.'
        return false
      } catch {
        session.status = 'error'
        session.error =
          'Could not save this file. Your edits are kept here. Check permissions and retry.'
        return false
      } finally {
        this.show(path, session)
      }
    })()
    session.saving = saving
    try {
      return await saving
    } finally {
      session.saving = undefined
    }
  }

  async flush(): Promise<boolean> {
    for (const [path, session] of this.sessions) {
      if (!(await this.save(path))) {
        await this.openDocument(path, 'none')
        return false
      }
      // Edits arriving during a pending write need another pass before closing.
      while (session.status === 'dirty') {
        if (!(await this.save(path))) {
          await this.openDocument(path, 'none')
          return false
        }
      }
    }
    return true
  }

  setLocked(locked: boolean): void {
    this.locked = locked
    this.present({ locked })
    for (const session of this.sessions.values()) {
      session.state = session.state.update({
        effects: this.editability.reconfigure([
          EditorState.readOnly.of(locked),
          EditorView.editable.of(!locked)
        ])
      }).state
    }
    const active = this.presentation.path ? this.sessions.get(this.presentation.path) : undefined
    if (active) this.view?.setState(active.state)
  }

  async refresh(paths: readonly string[] = [...this.sessions.keys()]): Promise<void> {
    if (this.changingWorkspace) {
      this.deferredRefresh = true
      return
    }
    await Promise.all(
      paths.map(async (path) => {
        const session = this.sessions.get(path)
        if (!session) return
        if (session.saving) await session.saving
        const revision = session.revision
        try {
          const snapshot = await this.api.read(path)
          if (
            this.sessions.get(path) !== session ||
            session.saving ||
            session.revision !== revision
          )
            return
          if (snapshot.revision === session.revision) {
            if (
              session.status === 'missing' ||
              (session.status === 'conflict' && !session.state.doc.eq(session.savedDoc))
            ) {
              session.status = session.state.doc.eq(session.savedDoc) ? 'saved' : 'dirty'
              session.error = ''
              this.schedule(path, session)
            }
          } else if (!session.state.doc.eq(session.savedDoc)) {
            clearTimeout(session.timer)
            session.status = 'conflict'
            session.error =
              'This file changed outside Margin. Your edits are kept here; autosave is paused.'
          } else this.adopt(path, session, snapshot)
        } catch {
          if (
            this.sessions.get(path) !== session ||
            session.saving ||
            session.revision !== revision
          )
            return
          clearTimeout(session.timer)
          session.status = 'missing'
          session.error =
            'This file is unavailable (removed, renamed, or unreadable). Your text is kept here.'
        }
        this.show(path, session)
      })
    )
  }

  private adopt(path: string, session: EditorSession, snapshot: DocumentSnapshot): void {
    clearTimeout(session.timer)
    const state = this.state(snapshot.content)
    const selection = EditorSelection.create(
      session.state.selection.ranges.map((range) =>
        EditorSelection.range(
          Math.min(range.anchor, state.doc.length),
          Math.min(range.head, state.doc.length)
        )
      ),
      session.state.selection.mainIndex
    )
    session.state = state.update({ selection }).state
    session.savedDoc = session.state.doc
    session.revision = snapshot.revision
    session.status = 'saved'
    session.error = ''
    if (this.presentation.path === path) this.view?.setState(session.state)
  }

  async resolveConflict(choice: 'disk' | 'local'): Promise<void> {
    const path = this.presentation.path
    const session = path ? this.sessions.get(path) : undefined
    if (!path || !session || session.status !== 'conflict') return
    this.setLocked(true)
    try {
      const latest = await this.api.read(path)
      if (choice === 'disk') this.adopt(path, session, latest)
      else {
        // This is an explicit user decision. A further disk change still causes a conflict.
        session.revision = latest.revision
        session.status = 'dirty'
        session.error = ''
        await this.save(path)
      }
      this.show(path, session)
    } catch {
      session.error = 'Could not resolve this file. Save a copy of your edits instead.'
      this.show(path, session)
    } finally {
      this.setLocked(false)
      this.view?.focus()
    }
  }

  async saveCopy(): Promise<void> {
    const path = this.presentation.path
    const session = path ? this.sessions.get(path) : undefined
    if (!path || !session) return
    this.setLocked(true)
    try {
      if (await this.api.saveCopy(session.state.sliceDoc())) this.closeDocument(path)
    } catch {
      session.error = 'Could not save a copy. Choose a new filename in a writable folder.'
      this.show(path, session)
    } finally {
      this.setLocked(false)
    }
  }

  closeUnavailable(): void {
    const path = this.presentation.path
    const session = path ? this.sessions.get(path) : undefined
    if (path && session?.status === 'missing' && session.state.doc.eq(session.savedDoc))
      this.closeDocument(path)
  }

  private closeDocument(path: string): void {
    const session = this.sessions.get(path)
    clearTimeout(session?.timer)
    this.sessions.delete(path)
    this.generation++
    this.present({ path: null, status: 'idle', error: '', openError: '' })
    this.view?.setState(this.state(''))
  }

  reset(): void {
    this.headingSource = null
    this.navigation.reset()
    this.presentNavigation()
    this.generation++
    for (const session of this.sessions.values()) clearTimeout(session.timer)
    this.sessions.clear()
    this.present({ path: null, status: 'idle', error: '', openError: '' })
    this.view?.setState(this.state(''))
  }
}
