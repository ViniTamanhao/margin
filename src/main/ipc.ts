import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { channels, type MarginAPI } from '../shared/api'
import { WorkspaceService } from './services/workspace'
import { DocumentService } from './services/documents'

export function registerIPC(version: string): void {
  const workspaces = new WorkspaceService()
  const documents = new DocumentService(workspaces)
  const api: MarginAPI = {
    app: { info: async () => ({ name: 'Margin', version }) },
    workspace: {
      current: async () => workspaces.current(),
      open: async () => {
        const result = await dialog.showOpenDialog({
          title: 'Open Markdown folder',
          properties: ['openDirectory']
        })
        return result.canceled ? null : workspaces.open(result.filePaths[0])
      }
    },
    document: { read: (path) => documents.read(path) }
  }
  const trusted = (event: IpcMainInvokeEvent): void => {
    if (
      !BrowserWindow.fromWebContents(event.sender) ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error('Untrusted IPC sender.')
    }
  }
  ipcMain.handle(channels.appInfo, (event) => {
    trusted(event)
    return api.app.info()
  })
  ipcMain.handle(channels.workspaceOpen, (event) => {
    trusted(event)
    return api.workspace.open()
  })
  ipcMain.handle(channels.workspaceCurrent, (event) => {
    trusted(event)
    return api.workspace.current()
  })
  ipcMain.handle(channels.documentRead, (event, path: unknown) => {
    trusted(event)
    if (typeof path !== 'string') throw new Error('Invalid document path.')
    return api.document.read(path)
  })
}
