import { contextBridge, ipcRenderer } from 'electron'
import { channels, type MarginAPI } from '../shared/api'

const api: MarginAPI = {
  app: { info: () => ipcRenderer.invoke(channels.appInfo) }
}

contextBridge.exposeInMainWorld('margin', api)
