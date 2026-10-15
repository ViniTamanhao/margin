import type { AppearanceSettings } from './appearance'

export const channels = {
  appInfo: 'app:info',
  appearanceRead: 'appearance:read',
  appearanceSave: 'appearance:save',
  workspaceOpen: 'workspace:open',
  workspaceCurrent: 'workspace:current',
  documentRead: 'document:read',
  documentSave: 'document:save',
  documentSaveCopy: 'document:save-copy',
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
  directories: string[]
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
  appearance: {
    read(): Promise<AppearanceSettings>
    save(settings: AppearanceSettings): Promise<void>
  }
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
    saveCopy(content: string): Promise<string | null>
  }
}
