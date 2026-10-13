import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { dirname, join } from 'node:path'
import { channels, type MarginAPI, type Workspace, type SaveRequest } from '../shared/api'
import { confirmWindowClose } from './window-lifecycle'
import { WorkspaceService } from './services/workspace'
import { AppStateService } from './services/app-state'
import { DocumentService } from './services/documents'

export function registerIPC(version: string, stateFile: string): WorkspaceService {
  const workspaces = new WorkspaceService()
  const state = new AppStateService(stateFile)
  const remember = async (workspace: Workspace): Promise<void> => {
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
  const documents = new DocumentService(workspaces, join(dirname(stateFile), 'recovery'))
  const api: MarginAPI = {
    app: { info: async () => ({ name: 'Margin', version }) },
    window: { onClosing: () => () => {}, confirmClose: async () => {} },
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
    document: { read: (path) => documents.read(path), save: (request) => documents.save(request) }
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
  ipcMain.handle(channels.documentSave, (event, input: unknown) => {
    trusted(event)
    if (typeof input !== 'object' || input === null) throw new Error('Invalid save request.')
    const request = input as Partial<SaveRequest>
    if (
      typeof request.path !== 'string' ||
      typeof request.content !== 'string' ||
      typeof request.revision !== 'string' ||
      !/^[a-f0-9]{64}$/.test(request.revision)
    )
      throw new Error('Invalid save request.')
    return api.document.save({
      path: request.path,
      content: request.content,
      revision: request.revision
    })
  })
  ipcMain.handle(channels.windowConfirmClose, (event, saved: unknown) => {
    trusted(event)
    if (typeof saved !== 'boolean') throw new Error('Invalid close response.')
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) confirmWindowClose(window, saved)
  })
  return workspaces
}
