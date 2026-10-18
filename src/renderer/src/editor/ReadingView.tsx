import { useCallback, useMemo } from 'react'
import type { EditorState } from '@codemirror/state'
import type { EditorController } from './controller'
import { renderMarkdown } from './render-markdown'

export function ReadingView({
  state,
  controller
}: {
  state: EditorState
  controller: EditorController
}): React.JSX.Element {
  const attach = useCallback(
    (element: HTMLElement | null) => controller.attachReadingSurface(element),
    [controller]
  )
  const content = useMemo(() => renderMarkdown(state.doc.toString()), [state.doc])
  return (
    <article className="reading-view" aria-label="Markdown reading view" tabIndex={0} ref={attach}>
      <div className="reading-content">{content}</div>
    </article>
  )
}
