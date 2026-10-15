import {
  Fragment,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref
} from 'react'
import type { Workspace, WorkspaceChange, WorkspaceEntry } from '../../../shared/api'
import { remapPath } from '../../../shared/workspace-paths'
import { Icon } from './Icon'
import { buildFileTree, visibleFileTreeRows } from './file-tree'
import { ancestorPaths, treeEdit, type TreeEdit, type TreeEditKind } from './tree-edit'
import { InlineTreeName } from './InlineTreeName'
import { TreeContextMenu } from './TreeContextMenu'
import { commandTooltip, type FileTreeCommandId } from '../commands'
import './FileTree.css'

export interface FileTreeHandle {
  beginEdit(kind: TreeEditKind, target: WorkspaceEntry | null): void
  reveal(entry: WorkspaceEntry | null, focus: boolean): void
  applyOperation(operation: WorkspaceChange['operation']): void
}
interface FileTreeProps {
  ref?: Ref<FileTreeHandle>
  workspace: Workspace
  activePath: string | null
  selection: WorkspaceEntry | null
  disabled: boolean
  onSelect(entry: WorkspaceEntry | null): void
  onOpen(path: string): void
  onCommand(id: FileTreeCommandId, target?: WorkspaceEntry | null): void
  onCommit(edit: TreeEdit, name: string): Promise<string | null>
  onEditingChange(editing: boolean): void
}

export function FileTree({
  ref,
  workspace,
  activePath,
  selection,
  disabled,
  onSelect,
  onOpen,
  onCommand,
  onCommit,
  onEditingChange
}: FileTreeProps): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [edit, setEdit] = useState<TreeEdit | null>(null)
  const [context, setContext] = useState<{
    x: number
    y: number
    target: WorkspaceEntry | null
  } | null>(null)
  const closeContext = useCallback((): void => setContext(null), [])
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const lastFocused = useRef<HTMLButtonElement | null>(null)
  const pendingFocus = useRef<string | null | undefined>(undefined)
  const nodes = useMemo(
    () => buildFileTree({ files: workspace.files, directories: workspace.directories }),
    [workspace.files, workspace.directories]
  )
  const rows = useMemo(() => visibleFileTreeRows(nodes, expanded), [nodes, expanded])
  let focusPath = selection?.path ?? null
  while (focusPath && !rows.some(({ node }) => node.path === focusPath)) {
    focusPath = ancestorPaths(focusPath).at(-1) ?? null
  }
  focusPath ??= rows[0]?.node.path ?? null

  useImperativeHandle(
    ref,
    () => ({
      beginEdit(kind, target) {
        if (disabled || edit || (kind === 'rename' && !target)) return
        const next = treeEdit(kind, target)
        const reveal = next.parent ? [...ancestorPaths(next.parent), next.parent] : []
        setExpanded((previous) => new Set([...previous, ...reveal]))
        setEdit(next)
        onEditingChange(true)
      },
      reveal(entry, focus) {
        if (entry) setExpanded((previous) => new Set([...previous, ...ancestorPaths(entry.path)]))
        if (focus) pendingFocus.current = entry?.path ?? null
      },
      applyOperation(operation) {
        if (operation?.kind === 'rename')
          setExpanded(
            (previous) =>
              new Set([...previous].map((path) => remapPath(path, operation.from, operation.to)))
          )
        else if (operation?.kind === 'trash')
          setExpanded(
            (previous) =>
              new Set(
                [...previous].filter(
                  (path) => path !== operation.path && !path.startsWith(`${operation.path}/`)
                )
              )
          )
      }
    }),
    [disabled, edit, onEditingChange]
  )

  useLayoutEffect(() => {
    const requested = pendingFocus.current
    if (requested !== undefined && !edit) {
      if (requested === null) {
        document.getElementById('workspace-files')?.focus()
        pendingFocus.current = undefined
      } else if (buttons.current.has(requested)) {
        buttons.current.get(requested)?.focus()
        pendingFocus.current = undefined
      }
    } else if (
      !edit &&
      lastFocused.current &&
      !lastFocused.current.isConnected &&
      document.activeElement === document.body
    ) {
      if (focusPath) buttons.current.get(focusPath)?.focus()
      else document.getElementById('workspace-files')?.focus()
    }
  }, [rows, focusPath, edit])

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
  const finishEdit = (cancel: boolean): void => {
    if (cancel) pendingFocus.current = selection?.path ?? null
    setEdit(null)
    onEditingChange(false)
  }
  const inlineName = (level: number): React.JSX.Element => (
    <div
      className="file-tree-item file-tree-edit"
      role="treeitem"
      aria-level={level}
      style={{ '--file-depth': level - 1 } as CSSProperties}
    >
      <InlineTreeName
        edit={edit!}
        onCancel={() => finishEdit(true)}
        onConfirm={async (name) => {
          const error = await onCommit(edit!, name)
          if (!error) finishEdit(false)
          return error
        }}
      />
    </div>
  )
  let insertAt = rows.length
  let insertLevel = 1
  if (edit && edit.kind !== 'rename' && edit.parent) {
    const parentIndex = rows.findIndex(({ node }) => node.path === edit.parent)
    if (parentIndex >= 0) {
      insertLevel = rows[parentIndex].level + 1
      insertAt = parentIndex + 1
      while (insertAt < rows.length && rows[insertAt].level >= insertLevel) insertAt++
    }
  }

  return (
    <>
      <div className="files-panel-heading">
        <span>Files</span>
        <div className="files-panel-actions">
          <button
            className="icon-button"
            aria-label="New File"
            title={commandTooltip('workspace.new-file')}
            disabled={disabled || Boolean(edit)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onCommand('workspace.new-file')}
          >
            <Icon name="new-file" />
          </button>
          <button
            className="icon-button"
            aria-label="New Folder"
            title={commandTooltip('workspace.new-folder')}
            disabled={disabled || Boolean(edit)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onCommand('workspace.new-folder')}
          >
            <Icon name="new-folder" />
          </button>
        </div>
      </div>
      <div
        className="file-tree-scroll"
        onClick={(event) => {
          if (
            event.target === event.currentTarget ||
            (event.target instanceof HTMLElement && event.target.getAttribute('role') === 'tree')
          ) {
            onSelect(null)
            document.getElementById('workspace-files')?.focus()
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          if (disabled || edit) return
          onSelect(null)
          document.getElementById('workspace-files')?.focus()
          setContext({ x: event.clientX, y: event.clientY, target: null })
        }}
      >
        <div role="tree" aria-label="Folders and Markdown files">
          {rows.map(({ node, parent, level, position, siblings }, index) => (
            <Fragment key={node.path}>
              {edit?.kind === 'rename' && edit.target?.path === node.path ? (
                inlineName(level)
              ) : (
                <button
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
                  aria-selected={selection?.path === node.path}
                  aria-current={
                    node.kind === 'file' && activePath === node.path ? 'page' : undefined
                  }
                  aria-disabled={disabled || Boolean(edit) ? true : undefined}
                  tabIndex={node.path === focusPath ? 0 : -1}
                  title={node.path}
                  onFocus={(event) => {
                    onSelect({ path: node.path, kind: node.kind })
                    lastFocused.current = event.currentTarget
                  }}
                  onClick={() => {
                    if (disabled || edit) return
                    onSelect({ path: node.path, kind: node.kind })
                    if (node.kind === 'directory') toggle(node.path)
                    else onOpen(node.path)
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    if (disabled || edit) return
                    event.currentTarget.focus()
                    onSelect({ path: node.path, kind: node.kind })
                    setContext({
                      x: event.clientX,
                      y: event.clientY,
                      target: { path: node.path, kind: node.kind }
                    })
                  }}
                  onKeyDown={(event) => {
                    if (disabled || edit) return
                    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
                      event.preventDefault()
                      const bounds = event.currentTarget.getBoundingClientRect()
                      setContext({
                        x: bounds.left,
                        y: bounds.bottom,
                        target: { path: node.path, kind: node.kind }
                      })
                      return
                    }
                    switch (event.key) {
                      case 'F2':
                        onCommand('workspace.rename', { path: node.path, kind: node.kind })
                        break
                      case 'Delete':
                        onCommand('workspace.trash', { path: node.path, kind: node.kind })
                        break
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
              )}
              {edit && edit.kind !== 'rename' && insertAt === index + 1 && inlineName(insertLevel)}
            </Fragment>
          ))}
          {edit && edit.kind !== 'rename' && insertAt === 0 && inlineName(insertLevel)}
        </div>
        {!rows.length && !edit && <p className="file-list-empty">No folders or Markdown files.</p>}
      </div>
      {context &&
        !disabled &&
        !edit &&
        (!context.target ||
          (context.target.kind === 'directory' ? workspace.directories : workspace.files).includes(
            context.target.path
          )) && (
          <TreeContextMenu
            x={context.x}
            y={context.y}
            onClose={closeContext}
            onChoose={(id) => onCommand(id, context.target)}
            actions={
              context.target?.kind === 'file'
                ? ['workspace.rename', 'workspace.trash']
                : context.target
                  ? [
                      'workspace.new-file',
                      'workspace.new-folder',
                      'workspace.rename',
                      'workspace.trash'
                    ]
                  : ['workspace.new-file', 'workspace.new-folder']
            }
          />
        )}
    </>
  )
}
