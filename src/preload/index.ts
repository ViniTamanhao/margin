import { contextBridge, ipcRenderer } from 'electron'
import { channels, type MarginAPI, type WorkspaceChange } from '../shared/api'

const api: MarginAPI = {
  app: { info: () => ipcRenderer.invoke(channels.appInfo) },
  window: {
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
    save: (request) => ipcRenderer.invoke(channels.documentSave, request)
  }
}

contextBridge.exposeInMainWorld('margin', api)
