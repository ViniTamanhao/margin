import { EditorState, type Text } from '@codemirror/state'
import { EditorView, keymap, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import type { MarginAPI } from '../../../shared/api'

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
  status: DocumentStatus | 'idle' | 'loading'
  error: string
}

// CodeMirror owns documents, selections and history; React only subscribes to presentation.
export class EditorController {
  private sessions = new Map<string, EditorSession>()
  private view: EditorView | null = null
  private generation = 0
  private listeners = new Set<() => void>()
  private presentation: EditorPresentation = { path: null, status: 'idle', error: '' }

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
      next.path === this.presentation.path &&
      next.status === this.presentation.status &&
      next.error === this.presentation.error
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
        markdown(),
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        syntaxHighlighting(defaultHighlightStyle),
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

  async open(path: string): Promise<void> {
    const generation = ++this.generation
    const previous = this.presentation.path
    if (previous) void this.save(previous)
    this.present({ status: 'loading', error: '' })
    try {
      let session = this.sessions.get(path)
      if (!session) {
        const snapshot = await this.api.read(path)
        if (generation !== this.generation) return
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
      if (generation !== this.generation) return
      this.present({ path, status: session.status, error: session.error })
      this.view?.setState(session.state)
      this.view?.focus()
    } catch {
      if (generation === this.generation)
        this.present({
          status: 'error',
          error: 'Could not open this file. It may have moved or been deleted.'
        })
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
    if (session.status === 'saved') return true
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
        await this.open(path)
        return false
      }
      // Edits arriving during a pending write need another pass before closing.
      while (session.status === 'dirty') {
        if (!(await this.save(path))) {
          await this.open(path)
          return false
        }
      }
    }
    return true
  }

  reset(): void {
    this.generation++
    for (const session of this.sessions.values()) clearTimeout(session.timer)
    this.sessions.clear()
    this.present({ path: null, status: 'idle', error: '' })
    this.view?.setState(this.state(''))
  }
}
