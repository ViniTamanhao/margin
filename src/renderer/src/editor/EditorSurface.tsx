import { useEffect, useLayoutEffect, useRef } from 'react'
import type { EditorController } from './controller'

export function EditorSurface({
  controller,
  activePath,
  mode
}: {
  controller: EditorController
  mode: 'read' | 'write'
  activePath: string | null
}): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (container.current) return controller.attach(container.current)
    return undefined
  }, [controller])
  useLayoutEffect(() => {
    if (activePath) controller.focus()
  }, [activePath, controller, mode])
  return <div ref={container} className="editor-surface" />
}
