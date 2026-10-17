import { contextBridge, ipcRenderer } from 'electron'
import { channels, type MarginAPI, type WorkspaceChange, type WindowState } from '../shared/api'

const api: MarginAPI = {
  app: { info: () => ipcRenderer.invoke(channels.appInfo) },
  appearance: {
    read: () => ipcRenderer.invoke(channels.appearanceRead),
    save: (settings) => ipcRenderer.invoke(channels.appearanceSave, settings)
  },
  window: {
    state: () => ipcRenderer.invoke(channels.windowState),
    action: (action) => ipcRenderer.invoke(channels.windowAction, action),
    onStateChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, state: WindowState): void =>
        callback(state)
      ipcRenderer.on(channels.windowStateChanged, listener)
      return () => {
        ipcRenderer.removeListener(channels.windowStateChanged, listener)
      }
    },
    platform: process.platform,
    setTheme: (theme) => ipcRenderer.invoke(channels.windowTheme, theme),
    onClosing: (callback) => {
      const listener = (): void => callback()
      ipcRenderer.on(channels.windowClosing, listener)
      return () => {
        ipcRenderer.removeListener(channels.windowClosing, listener)
      }
    },
    confirmClose: (saved) => ipcRenderer.invoke(channels.windowConfirmClose, saved)
  },
  workspace: {
    search: (request) => ipcRenderer.invoke(channels.workspaceSearch, request),
    cancelSearch: (id) => ipcRenderer.invoke(channels.workspaceCancelSearch, id),
    createFile: (request) => ipcRenderer.invoke(channels.workspaceCreateFile, request),
    createFolder: (request) => ipcRenderer.invoke(channels.workspaceCreateFolder, request),
    rename: (request) => ipcRenderer.invoke(channels.workspaceRename, request),
    trash: (request) => ipcRenderer.invoke(channels.workspaceTrash, request),
    open: () => ipcRenderer.invoke(channels.workspaceOpen),
    current: () => ipcRenderer.invoke(channels.workspaceCurrent),
    onChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, change: WorkspaceChange): void =>
        callback(change)
      ipcRenderer.on(channels.workspaceChanged, listener)
      return () => {
        ipcRenderer.removeListener(channels.workspaceChanged, listener)
      }
    }
  },
  document: {
    read: (path) => ipcRenderer.invoke(channels.documentRead, path),
    save: (request) => ipcRenderer.invoke(channels.documentSave, request),
    saveCopy: (content) => ipcRenderer.invoke(channels.documentSaveCopy, content)
  }
}

contextBridge.exposeInMainWorld('margin', api)
