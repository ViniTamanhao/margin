import { useEffect, useRef } from 'react'
import type { EditorController } from './controller'

export function EditorSurface({ controller }: { controller: EditorController }): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (container.current) return controller.attach(container.current)
    return undefined
  }, [controller])
  return <div ref={container} className="editor-surface" />
}
