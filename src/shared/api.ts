export const channels = {
  appInfo: 'app:info',
  workspaceOpen: 'workspace:open',
  workspaceCurrent: 'workspace:current',
  documentRead: 'document:read'
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
export interface DocumentSnapshot {
  path: string
  content: string
  revision: string
}
export interface MarginAPI {
  app: { info(): Promise<AppInfo> }
  workspace: {
    open(): Promise<Workspace | null>
    current(): Promise<Workspace | null>
  }
  document: { read(path: string): Promise<DocumentSnapshot> }
}
