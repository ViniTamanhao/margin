import { contextBridge, ipcRenderer } from 'electron'
import { channels, type MarginAPI } from '../shared/api'

const api: MarginAPI = {
  app: { info: () => ipcRenderer.invoke(channels.appInfo) },
  workspace: {
    open: () => ipcRenderer.invoke(channels.workspaceOpen),
    current: () => ipcRenderer.invoke(channels.workspaceCurrent)
  },
  document: { read: (path) => ipcRenderer.invoke(channels.documentRead, path) }
}

contextBridge.exposeInMainWorld('margin', api)
