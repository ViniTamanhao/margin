import type { WorkspaceEntry } from '../../../shared/api'
import { parentPath, entryName } from '../../../shared/workspace-paths'

export type TreeEditKind = 'new-file' | 'new-folder' | 'rename'
export interface TreeEdit {
  kind: TreeEditKind
  target: WorkspaceEntry | null
  parent: string
  initialName: string
}

export function creationParent(target: WorkspaceEntry | null): string {
  return target?.kind === 'directory' ? target.path : parentPath(target?.path ?? '')
}
export function treeEdit(kind: TreeEditKind, target: WorkspaceEntry | null): TreeEdit {
  return {
    kind,
    target,
    parent: kind === 'rename' ? parentPath(target?.path ?? '') : creationParent(target),
    initialName: kind === 'rename' && target ? entryName(target.path) : ''
  }
}
export function ancestorPaths(path: string): string[] {
  const parts = path.split('/')
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'))
}
