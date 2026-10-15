import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Workspace } from '../../../shared/api'
import { Icon } from './Icon'
import { buildFileTree, visibleFileTreeRows } from './file-tree'

interface FileTreeProps {
  workspace: Workspace
  activePath: string | null
  disabled: boolean
  onOpen(path: string): void
}

export function FileTree({
  workspace,
  activePath,
  disabled,
  onOpen
}: FileTreeProps): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [focusedPath, setFocusedPath] = useState<string | null>(activePath)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const lastFocused = useRef<HTMLButtonElement | null>(null)
  const nodes = useMemo(
    () => buildFileTree({ files: workspace.files, directories: workspace.directories }),
    [workspace.files, workspace.directories]
  )
  const rows = useMemo(() => visibleFileTreeRows(nodes, expanded), [nodes, expanded])
  // If a focused file is hidden or removed, prefer its nearest visible ancestor.
  let focusPath = focusedPath
  while (focusPath && !rows.some(({ node }) => node.path === focusPath)) {
    const slash = focusPath.lastIndexOf('/')
    focusPath = slash < 0 ? null : focusPath.slice(0, slash)
  }
  focusPath ??= rows[0]?.node.path ?? null

  useLayoutEffect(() => {
    if (
      lastFocused.current &&
      !lastFocused.current.isConnected &&
      document.activeElement === document.body
    ) {
      if (focusPath) buttons.current.get(focusPath)?.focus()
      else document.getElementById('workspace-files')?.focus()
    }
  }, [rows, focusPath])

  const focus = (path: string): void => {
    buttons.current.get(path)?.focus()
  }
  const toggle = (path: string): void => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  if (!rows.length) return <p className="file-list-empty">No folders or Markdown files.</p>

  return (
    <div role="tree" aria-label="Folders and Markdown files">
      {rows.map(({ node, parent, level, position, siblings }, index) => (
        <button
          key={node.path}
          ref={(element) => {
            if (element) buttons.current.set(node.path, element)
            else buttons.current.delete(node.path)
          }}
          className="file-tree-item"
          style={{ '--file-depth': level - 1 } as CSSProperties}
          role="treeitem"
          aria-level={level}
          aria-posinset={position}
          aria-setsize={siblings}
          aria-expanded={node.kind === 'directory' ? expanded.has(node.path) : undefined}
          aria-selected={node.kind === 'file' && activePath === node.path}
          aria-current={node.kind === 'file' && activePath === node.path ? 'page' : undefined}
          aria-disabled={node.kind === 'file' && disabled ? true : undefined}
          tabIndex={node.path === focusPath ? 0 : -1}
          title={node.path}
          onFocus={(event) => {
            setFocusedPath(node.path)
            lastFocused.current = event.currentTarget
          }}
          onClick={() => {
            if (node.kind === 'directory') toggle(node.path)
            else if (!disabled) onOpen(node.path)
          }}
          onKeyDown={(event) => {
            switch (event.key) {
              case 'ArrowDown':
                focus(rows[Math.min(index + 1, rows.length - 1)].node.path)
                break
              case 'ArrowUp':
                focus(rows[Math.max(index - 1, 0)].node.path)
                break
              case 'Home':
                focus(rows[0].node.path)
                break
              case 'End':
                focus(rows[rows.length - 1].node.path)
                break
              case 'ArrowRight':
                if (node.kind === 'directory') {
                  if (!expanded.has(node.path)) toggle(node.path)
                  else if (node.children[0]) focus(node.children[0].path)
                }
                break
              case 'ArrowLeft':
                if (node.kind === 'directory' && expanded.has(node.path)) toggle(node.path)
                else if (parent) focus(parent)
                break
              default:
                return
            }
            event.preventDefault()
          }}
        >
          <span className="file-tree-disclosure" aria-hidden="true">
            {node.kind === 'directory' && (
              <Icon name={expanded.has(node.path) ? 'chevron-down' : 'chevron-right'} />
            )}
          </span>
          <Icon name={node.kind === 'directory' ? 'folder' : 'files'} />
          <span className="file-tree-name">{node.name}</span>
        </button>
      ))}
    </div>
  )
}
