import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { dirname, join } from 'node:path'
import {
  channels,
  type MarginAPI,
  type Workspace,
  type SaveRequest,
  type WorkspaceCreateRequest,
  type WorkspaceItemRequest,
  type WorkspaceRenameRequest,
  type WorkspaceMutation,
  type WorkspaceResult
} from '../shared/api'
import { confirmWindowClose } from './window-lifecycle'
import { WorkspaceService } from './services/workspace'
import { AppStateService } from './services/app-state'
import { AppearanceService } from './services/appearance'
import { DocumentService } from './services/documents'

export function registerIPC(version: string, stateFile: string): WorkspaceService {
  const workspaces = new WorkspaceService((path) => shell.trashItem(path))
  const state = new AppStateService(stateFile)
  const appearance = new AppearanceService(join(dirname(stateFile), 'appearance.json'))
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
    appearance: { read: () => appearance.read(), save: (settings) => appearance.save(settings) },
    window: { onClosing: () => () => {}, confirmClose: async () => {} },
    workspace: {
      createFile: (request) => workspaces.createFile(request),
      createFolder: (request) => workspaces.createFolder(request),
      rename: (request) => workspaces.rename(request),
      trash: (request) =>
        workspaces.trash(request, async (entry) => {
          const name = entry.path.slice(entry.path.lastIndexOf('/') + 1)
          const confirmation = await dialog.showMessageBox({
            type: 'warning',
            buttons: ['Cancel', 'Move to Trash'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
            message:
              entry.kind === 'directory'
                ? `Move “${name}” and all of its contents to Trash?`
                : `Move “${name}” to Trash?`,
            detail:
              entry.kind === 'directory'
                ? 'The folder may contain files that Margin does not display.'
                : undefined
          })
          return confirmation.response === 1
        }),
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
    document: {
      read: (path) => documents.read(path),
      save: (request) => documents.save(request),
      saveCopy: async (content) => {
        const result = await dialog.showSaveDialog({
          title: 'Save your edits as a new Markdown file',
          defaultPath: 'Recovered.md',
          filters: [{ name: 'Markdown', extensions: ['md'] }]
        })
        if (result.canceled || !result.filePath) return null
        await documents.saveCopy(result.filePath, content)
        return result.filePath
      }
    }
  }
  const trusted = (event: IpcMainInvokeEvent): void => {
    if (
      !BrowserWindow.fromWebContents(event.sender) ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error('Untrusted IPC sender.')
    }
  }
  ipcMain.handle(channels.appearanceRead, (event) => {
    trusted(event)
    return appearance.read()
  })
  ipcMain.handle(channels.appearanceSave, (event, settings: unknown) => {
    trusted(event)
    return appearance.save(settings)
  })
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
  const invalidWorkspaceRequest: WorkspaceResult<WorkspaceMutation> = {
    ok: false,
    error: {
      code: 'invalid-path',
      message: 'Choose a valid name and item in the current workspace.'
    }
  }
  const createRequest = (input: unknown): input is WorkspaceCreateRequest => {
    if (!input || typeof input !== 'object') return false
    return (
      'root' in input &&
      typeof input.root === 'string' &&
      'parentPath' in input &&
      typeof input.parentPath === 'string' &&
      'name' in input &&
      typeof input.name === 'string'
    )
  }
  const renameRequest = (input: unknown): input is WorkspaceRenameRequest => {
    if (!input || typeof input !== 'object') return false
    return (
      'root' in input &&
      typeof input.root === 'string' &&
      'path' in input &&
      typeof input.path === 'string' &&
      'name' in input &&
      typeof input.name === 'string'
    )
  }
  const itemRequest = (input: unknown): input is WorkspaceItemRequest => {
    return Boolean(
      input &&
      typeof input === 'object' &&
      'root' in input &&
      typeof input.root === 'string' &&
      'path' in input &&
      typeof input.path === 'string'
    )
  }
  ipcMain.handle(channels.workspaceTrash, (event, input: unknown) => {
    trusted(event)
    return itemRequest(input) ? api.workspace.trash(input) : invalidWorkspaceRequest
  })
  ipcMain.handle(channels.workspaceCreateFile, (event, input: unknown) => {
    trusted(event)
    return createRequest(input) ? api.workspace.createFile(input) : invalidWorkspaceRequest
  })
  ipcMain.handle(channels.workspaceCreateFolder, (event, input: unknown) => {
    trusted(event)
    return createRequest(input) ? api.workspace.createFolder(input) : invalidWorkspaceRequest
  })
  ipcMain.handle(channels.workspaceRename, (event, input: unknown) => {
    trusted(event)
    return renameRequest(input) ? api.workspace.rename(input) : invalidWorkspaceRequest
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
  ipcMain.handle(channels.documentSaveCopy, (event, content: unknown) => {
    trusted(event)
    if (typeof content !== 'string') throw new Error('Invalid document contents.')
    return api.document.saveCopy(content)
  })
  ipcMain.handle(channels.windowConfirmClose, (event, saved: unknown) => {
    trusted(event)
    if (typeof saved !== 'boolean') throw new Error('Invalid close response.')
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) confirmWindowClose(window, saved)
  })
  return workspaces
}
