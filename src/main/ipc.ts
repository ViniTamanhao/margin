import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { channels, type MarginAPI } from '../shared/api'
import { WorkspaceService } from './services/workspace'
import { AppStateService } from './services/app-state'
import { DocumentService } from './services/documents'

export function registerIPC(version: string, stateFile: string): WorkspaceService {
  const workspaces = new WorkspaceService()
  const state = new AppStateService(stateFile)
  const remember = async (workspace: import('../shared/api').Workspace): Promise<void> => {
    try {
      await state.remember(workspace.root)
    } catch (error) {
      console.error('Could not remember workspace.', error)
      workspace.warnings.push('Could not remember this folder for next launch.')
    }
  }
  const restored = (async () => {
    const previous = await state.lastWorkspace()
    if (!previous) return null
    try {
      return await workspaces.open(previous)
    } catch (error) {
      console.warn('Previous workspace is unavailable.', error)
      await state
        .remember(null)
        .catch((error) => console.warn('Could not clear previous workspace.', error))
      return null
    }
  })()
  workspaces.onChanged((change) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(channels.workspaceChanged, change)
    }
  })
  const documents = new DocumentService(workspaces)
  const api: MarginAPI = {
    app: { info: async () => ({ name: 'Margin', version }) },
    workspace: {
      current: async () => {
        await restored
        return workspaces.current()
      },
      onChanged: () => () => {},
      open: async () => {
        await restored
        const result = await dialog.showOpenDialog({
          title: 'Open Markdown folder',
          properties: ['openDirectory']
        })
        if (result.canceled) return null
        const workspace = await workspaces.open(result.filePaths[0])
        await remember(workspace)
        return workspace
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
  return workspaces
}
