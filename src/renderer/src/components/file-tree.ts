import type { Workspace } from '../../../shared/api'

export interface FileTreeNode {
  path: string
  name: string
  kind: 'directory' | 'file'
  children: FileTreeNode[]
}

export function buildFileTree(workspace: Pick<Workspace, 'files' | 'directories'>): FileTreeNode[] {
  const children = new Map<string, FileTreeNode[]>()
  children.set('', [])
  const add = (path: string, kind: FileTreeNode['kind']): void => {
    const slash = path.lastIndexOf('/')
    const parent = path.slice(0, Math.max(0, slash))
    const node: FileTreeNode = { path, name: path.slice(slash + 1), kind, children: [] }
    if (kind === 'directory') children.set(path, node.children)
    children.get(parent)?.push(node)
  }
  // Parents precede their children, independent of discovery order.
  for (const path of [...workspace.directories].sort()) add(path, 'directory')
  for (const path of workspace.files) add(path, 'file')
  for (const nodes of children.values()) {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name) || a.path.localeCompare(b.path)
    })
  }
  return children.get('')!
}

export interface FileTreeRow {
  node: FileTreeNode
  parent: string | null
  level: number
  position: number
  siblings: number
}

export function visibleFileTreeRows(
  nodes: FileTreeNode[],
  expanded: ReadonlySet<string>,
  parent: string | null = null,
  level = 1
): FileTreeRow[] {
  return nodes.flatMap((node, index) => [
    { node, parent, level, position: index + 1, siblings: nodes.length },
    ...(expanded.has(node.path)
      ? visibleFileTreeRows(node.children, expanded, node.path, level + 1)
      : [])
  ])
}
