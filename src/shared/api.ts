export const channels = {
  appInfo: 'app:info',
  workspaceOpen: 'workspace:open',
  workspaceCurrent: 'workspace:current',
  documentRead: 'document:read',
  documentSave: 'document:save',
  workspaceChanged: 'workspace:changed',
  windowClosing: 'window:closing',
  windowConfirmClose: 'window:confirm-close'
} as const

export interface AppInfo {
  name: string
  version: string
}
export interface Workspace {
  root: string
  name: string
  files: string[]
  warnings: string[]
}
export interface WorkspaceChange {
  workspace: Workspace
  changedPaths: string[]
}
export interface DocumentSnapshot {
  path: string
  content: string
  revision: string
}
export interface SaveRequest {
  path: string
  content: string
  revision: string
}
export type SaveResult =
  | { kind: 'saved'; revision: string }
  | { kind: 'conflict'; current: DocumentSnapshot }
  | { kind: 'missing' }
export interface MarginAPI {
  app: { info(): Promise<AppInfo> }
  window: {
    onClosing(callback: () => void): () => void
    confirmClose(saved: boolean): Promise<void>
  }
  workspace: {
    open(): Promise<Workspace | null>
    current(): Promise<Workspace | null>
    onChanged(callback: (change: WorkspaceChange) => void): () => void
  }
  document: {
    read(path: string): Promise<DocumentSnapshot>
    save(request: SaveRequest): Promise<SaveResult>
  }
}
