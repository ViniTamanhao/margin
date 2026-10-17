// Test-only access through CodeMirror's public DOM lookup API.
import { EditorView } from '@codemirror/view'

declare global {
  interface Window {
    marginInsertAboveAndSearch(text: string): void
    marginEditorLocation(): { position: number; text: string } | null
  }
}
window.marginEditorLocation = () => {
  const dom = document.querySelector('.cm-editor')
  const view = dom ? EditorView.findFromDOM(dom as HTMLElement) : null
  if (!view) return null
  const position = view.state.selection.main.head
  return { position, text: view.state.doc.lineAt(position).text }
}

window.marginInsertAboveAndSearch = (text) => {
  const dom = document.querySelector('.cm-editor')
  const view = dom ? EditorView.findFromDOM(dom as HTMLElement) : null
  if (!view) throw new Error('No active editor')
  view.dispatch({ changes: { from: 0, insert: text } })
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, shiftKey: true, bubbles: true })
  )
}
