import { useCallback, useEffect, useRef, useState } from 'react'
import type { Workspace, WorkspaceChange, WorkspaceEntry } from '../../shared/api'
import { isWithinPath, remapPath, parentPath } from '../../shared/workspace-paths'
import { normalizeEntryName } from '../../shared/workspace-names'
import type { EditorController } from './editor/controller'
import type { FileTreeHandle } from './components/FileTree'
import type { TreeEdit, TreeEditKind } from './components/tree-edit'

function selectedEntry(workspace: Workspace, path: string): WorkspaceEntry | null {
  while (path) {
    if (workspace.directories.includes(path)) return { path, kind: 'directory' }
    if (workspace.files.includes(path)) return { path, kind: 'file' }
    path = parentPath(path)
  }
  return null
}

// Workspace metadata and the current filesystem target live here; documents stay
// in CodeMirror. Operation replies and watcher notifications share one transition.
export function useWorkspaceFiles(controller: EditorController): {
  workspace: Workspace | null
  busy: boolean
  error: string
  selection: WorkspaceEntry | null
  setSelection: (entry: WorkspaceEntry | null) => void
  editing: boolean
  setEditing: (editing: boolean) => void
  treeRef: React.RefObject<FileTreeHandle | null>
  openFolder(): Promise<void>
  beginEdit(kind: TreeEditKind, target?: WorkspaceEntry | null): void
  commitEdit(edit: TreeEdit, name: string): Promise<string | null>
  trash(target?: WorkspaceEntry | null): Promise<void>
} {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const current = useRef<Workspace | null>(null)
  const operationVersion = useRef({ root: '', version: -1 })
  const [selection, setSelection] = useState<WorkspaceEntry | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const tree = useRef<FileTreeHandle | null>(null)

  const adopt = useCallback(
    (change: WorkspaceChange): void => {
      const next = change.workspace
      const operation = change.operation
      if (
        operation &&
        (operationVersion.current.root !== next.root ||
          operationVersion.current.version < next.version)
      ) {
        operationVersion.current = { root: next.root, version: next.version }
        controller.applyWorkspaceOperation(operation)
        tree.current?.applyOperation(operation)
        setSelection((previous) => {
          if (!previous) return null
          const path =
            operation.kind === 'rename'
              ? remapPath(previous.path, operation.from, operation.to)
              : isWithinPath(previous.path, operation.path)
                ? parentPath(operation.path)
                : previous.path
          return selectedEntry(next, path)
        })
      }
      if (current.current?.root === next.root && current.current.version > next.version) return
      current.current = next
      setWorkspace(next)
      setSelection((previous) => (previous ? selectedEntry(next, previous.path) : null))
      void controller.refresh(change.changedPaths)
    },
    [controller]
  )

  useEffect(() => {
    let alive = true
    const unsubscribe = window.margin.workspace.onChanged((change) => {
      if (alive) adopt(change)
    })
    void window.margin.workspace
      .current()
      .then((next) => {
        if (alive && next) adopt({ workspace: next, changedPaths: [] })
      })
      .catch(() => {
        if (alive) setError('Could not restore the workspace. Open a folder to continue.')
      })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [adopt])

  const openFolder = useCallback(async (): Promise<void> => {
    controller.setLocked(true)
    setBusy(true)
    setError('')
    try {
      if (!(await controller.flush())) return
      const next = await window.margin.workspace.open()
      if (next) {
        if (current.current?.root === next.root && current.current.version > next.version) {
          setWorkspace(current.current)
        } else {
          current.current = next
          setWorkspace(next)
        }
        setSelection(null)
        setEditing(false)
        controller.reset()
      }
    } catch {
      setError('Could not open this folder. Check that it is accessible.')
    } finally {
      setBusy(false)
      controller.setLocked(false)
    }
  }, [controller])

  const beginEdit = useCallback(
    (kind: TreeEditKind, target: WorkspaceEntry | null = selection): void => {
      if (workspace && !busy && !editing) {
        setError('')
        setSelection(target)
        tree.current?.beginEdit(kind, target)
      }
    },
    [workspace, busy, editing, selection]
  )

  const commitEdit = useCallback(
    async (edit: TreeEdit, name: string): Promise<string | null> => {
      if (!workspace || busy) return 'Wait for the current operation to finish.'
      const normalized = normalizeEntryName(
        name,
        edit.kind === 'new-folder' || (edit.kind === 'rename' && edit.target?.kind === 'directory')
          ? 'directory'
          : 'file'
      )
      if (!normalized.ok) return normalized.error.message
      const destination = edit.parent ? `${edit.parent}/${normalized.value}` : normalized.value
      setBusy(true)
      setError('')
      try {
        const result =
          edit.kind === 'rename' && edit.target
            ? await controller.changeWorkspaceItem(
                edit.target.path,
                'rename',
                () =>
                  window.margin.workspace.rename({
                    root: workspace.root,
                    path: edit.target!.path,
                    name
                  }),
                destination
              )
            : edit.kind === 'new-folder'
              ? await window.margin.workspace.createFolder({
                  root: workspace.root,
                  parentPath: edit.parent,
                  name
                })
              : await window.margin.workspace.createFile({
                  root: workspace.root,
                  parentPath: edit.parent,
                  name
                })
        if (!result.ok) return result.error.message
        if (!result.value) return null
        const { entry, change } = result.value
        adopt(change)
        setSelection(entry)
        tree.current?.reveal(entry, edit.kind !== 'new-file')
        if (edit.kind === 'new-file') await controller.open(entry.path)
        return null
      } catch {
        return 'Could not change this item. Check that the folder is accessible and try again.'
      } finally {
        setBusy(false)
      }
    },
    [workspace, busy, controller, adopt]
  )

  const trash = useCallback(
    async (target: WorkspaceEntry | null = selection): Promise<void> => {
      if (!workspace || !target || busy || editing) return
      setSelection(target)
      setBusy(true)
      setError('')
      try {
        const result = await controller.changeWorkspaceItem(target.path, 'trash', () =>
          window.margin.workspace.trash({ root: workspace.root, path: target.path })
        )
        if (!result.ok) setError(result.error.message)
        else if (result.value) adopt(result.value.change)
        const next = current.current
        tree.current?.reveal(
          next
            ? selectedEntry(next, result.ok && result.value ? parentPath(target.path) : target.path)
            : null,
          true
        )
      } catch {
        setError('Could not move this item to Trash. It was kept in place.')
      } finally {
        setBusy(false)
      }
    },
    [workspace, selection, busy, editing, controller, adopt]
  )

  return {
    workspace,
    busy,
    error,
    selection,
    setSelection,
    editing,
    setEditing,
    treeRef: tree,
    openFolder,
    beginEdit,
    commitEdit,
    trash
  }
}
