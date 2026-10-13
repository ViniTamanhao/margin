import { contextBridge, ipcRenderer } from 'electron'
import { channels, type MarginAPI, type WorkspaceChange } from '../shared/api'

const api: MarginAPI = {
  app: { info: () => ipcRenderer.invoke(channels.appInfo) },
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
  document: { read: (path) => ipcRenderer.invoke(channels.documentRead, path) }
}

contextBridge.exposeInMainWorld('margin', api)
