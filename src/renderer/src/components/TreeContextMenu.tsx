import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { commandDefinitions, type FileTreeCommandId } from '../commands'

export function TreeContextMenu({
  x,
  y,
  actions,
  onChoose,
  onClose
}: {
  x: number
  y: number
  actions: readonly FileTreeCommandId[]
  onChoose(id: FileTreeCommandId): void
  onClose(): void
}): React.JSX.Element {
  const menu = useRef<HTMLDivElement>(null)
  const restore = useRef<HTMLElement | null>(null)
  const closed = useRef(false)
  const close = useCallback((): void => {
    closed.current = true
    restore.current?.focus()
    onClose()
  }, [onClose])
  useLayoutEffect(() => {
    closed.current = false
    restore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = menu.current
    if (!element) return
    const bounds = element.getBoundingClientRect()
    element.style.left = `${Math.max(0, Math.min(x, window.innerWidth - bounds.width))}px`
    element.style.top = `${Math.max(0, Math.min(y, window.innerHeight - bounds.height))}px`
    element.querySelector('button')?.focus()
    return () => {
      if (!closed.current) restore.current?.focus()
    }
  }, [x, y])
  useEffect(() => {
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) close()
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [close])
  return (
    <div
      ref={menu}
      className="tree-context-menu"
      role="menu"
      aria-label="File actions"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault()
          event.stopPropagation()
          close()
          return
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const buttons = [...event.currentTarget.querySelectorAll('button')]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
      }}
    >
      {actions.map((id) => (
        <button
          key={id}
          role="menuitem"
          onClick={() => {
            close()
            onChoose(id)
          }}
        >
          <span>{commandDefinitions[id].title}</span>
          {id === 'workspace.rename' && (
            <span className="tree-menu-shortcut">{commandDefinitions[id].shortcut}</span>
          )}
          {id === 'workspace.trash' && (
            <span className="tree-menu-shortcut">{commandDefinitions[id].shortcut}</span>
          )}
        </button>
      ))}
    </div>
  )
}
