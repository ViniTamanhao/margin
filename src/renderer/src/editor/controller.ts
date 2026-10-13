import { EditorState } from '@codemirror/state'
import { EditorView, keymap, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import type { MarginAPI } from '../../../shared/api'

interface EditorSession {
  state: EditorState
  revision: string
  dirty: boolean
}
export interface EditorPresentation {
  path: string | null
  status: 'idle' | 'loading' | 'saved' | 'dirty'
  error: string
}

// Documents and selections live in CodeMirror states, not React state.
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

  private state(content: string): EditorState {
    return EditorState.create({
      doc: content,
      extensions: [
        markdown(),
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.contentAttributes.of({ 'aria-label': 'Markdown editor', spellcheck: 'true' }),
        EditorView.updateListener.of((update) => {
          const path = this.presentation.path
          const session = path ? this.sessions.get(path) : undefined
          if (!session) return
          session.state = update.state
          if (update.docChanged) {
            session.dirty = true
            this.present({ status: 'dirty' })
          }
        })
      ]
    })
  }

  attach(element: HTMLElement): () => void {
    const session = this.presentation.path ? this.sessions.get(this.presentation.path) : undefined
    this.view = new EditorView({ parent: element, state: session?.state ?? this.state('') })
    return () => {
      this.view?.destroy()
      this.view = null
    }
  }

  async open(path: string): Promise<void> {
    const generation = ++this.generation
    this.present({ status: 'loading', error: '' })
    try {
      let session = this.sessions.get(path)
      if (!session) {
        const snapshot = await this.api.read(path)
        if (generation !== this.generation) return
        session = { state: this.state(snapshot.content), revision: snapshot.revision, dirty: false }
        this.sessions.set(path, session)
      }
      if (generation !== this.generation) return
      this.present({ path, status: session.dirty ? 'dirty' : 'saved' })
      this.view?.setState(session.state)
      this.view?.focus()
    } catch {
      if (generation === this.generation)
        this.present({
          status: 'idle',
          error: 'Could not open this file. It may have moved or been deleted.'
        })
    }
  }

  reset(): void {
    this.generation++
    this.sessions.clear()
    this.present({ path: null, status: 'idle', error: '' })
    this.view?.setState(this.state(''))
  }
}
