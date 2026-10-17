import type { AppearanceSettings, ThemeName } from './appearance'

export const channels = {
  appInfo: 'app:info',
  appearanceRead: 'appearance:read',
  appearanceSave: 'appearance:save',
  workspaceSearch: 'workspace:search',
  workspaceCancelSearch: 'workspace:cancel-search',
  workspaceOpen: 'workspace:open',
  workspaceCurrent: 'workspace:current',
  workspaceCreateFile: 'workspace:create-file',
  workspaceCreateFolder: 'workspace:create-folder',
  workspaceRename: 'workspace:rename',
  workspaceTrash: 'workspace:trash',
  documentRead: 'document:read',
  documentSave: 'document:save',
  documentSaveCopy: 'document:save-copy',
  workspaceChanged: 'workspace:changed',
  windowTheme: 'window:theme',
  windowClosing: 'window:closing',
  windowConfirmClose: 'window:confirm-close'
} as const

export interface AppInfo {
  name: string
  version: string
}
export interface Workspace {
  root: string
  version: number
  name: string
  files: string[]
  directories: string[]
  warnings: string[]
}
export interface WorkspaceChange {
  workspace: Workspace
  changedPaths: string[]
  operation?: { kind: 'rename'; from: string; to: string } | { kind: 'trash'; path: string }
}
export interface WorkspaceEntry {
  path: string
  kind: 'file' | 'directory'
}
export interface WorkspaceCreateRequest {
  root: string
  parentPath: string
  name: string
}
export interface WorkspaceItemRequest {
  root: string
  path: string
}
export interface WorkspaceRenameRequest {
  root: string
  path: string
  name: string
}
export interface WorkspaceError {
  code: 'invalid-path' | 'invalid-name' | 'collision' | 'unavailable' | 'changed' | 'filesystem'
  message: string
}
export type WorkspaceResult<T> = { ok: true; value: T } | { ok: false; error: WorkspaceError }
export interface WorkspaceMutation {
  change: WorkspaceChange
  entry: WorkspaceEntry
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
export interface WorkspaceSearchRequest {
  root: string
  query: string
  requestId: string
  limit?: number
}
export interface WorkspaceSearchResult {
  path: string
  line: number
  column: number
  position: number
  length: number
  preview: string
  previewMatchStart: number
}
export interface MarginAPI {
  app: { info(): Promise<AppInfo> }
  appearance: {
    read(): Promise<AppearanceSettings>
    save(settings: AppearanceSettings): Promise<void>
  }
  window: {
    platform: string
    setTheme(theme: ThemeName): Promise<void>
    onClosing(callback: () => void): () => void
    confirmClose(saved: boolean): Promise<void>
  }
  workspace: {
    search(request: WorkspaceSearchRequest): Promise<WorkspaceSearchResult[]>
    cancelSearch(requestId: string): Promise<void>
    open(): Promise<Workspace | null>
    current(): Promise<Workspace | null>
    createFile(request: WorkspaceCreateRequest): Promise<WorkspaceResult<WorkspaceMutation>>
    createFolder(request: WorkspaceCreateRequest): Promise<WorkspaceResult<WorkspaceMutation>>
    rename(request: WorkspaceRenameRequest): Promise<WorkspaceResult<WorkspaceMutation>>
    trash(request: WorkspaceItemRequest): Promise<WorkspaceResult<WorkspaceMutation | null>>
    onChanged(callback: (change: WorkspaceChange) => void): () => void
  }
  document: {
    read(path: string): Promise<DocumentSnapshot>
    save(request: SaveRequest): Promise<SaveResult>
    saveCopy(content: string): Promise<string | null>
  }
}
