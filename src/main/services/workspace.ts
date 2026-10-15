import { readdir, realpath, stat, lstat } from 'node:fs/promises'
import { basename, relative, resolve, sep } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import type {
  Workspace,
  WorkspaceChange,
  WorkspaceCreateRequest,
  WorkspaceRenameRequest,
  WorkspaceItemRequest,
  WorkspaceEntry,
  WorkspaceMutation,
  WorkspaceResult
} from '../../shared/api'
import { isWithinPath, remapPath } from '../../shared/workspace-paths'
import {
  WorkspaceFiles,
  WorkspaceFileError,
  workspaceError,
  sameIdentity,
  ignoredDirectories,
  isMarkdown
} from './workspace-files'
export { ignoredDirectories, isMarkdown } from './workspace-files'

export class WorkspaceService {
  private workspace: Workspace | null = null
  private paths: WorkspaceFiles | null = null
  private watcher: FSWatcher | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private changed = new Set<string>()
  private listener: (change: WorkspaceChange) => void = () => {}
  private pending: Promise<void> = Promise.resolve()
  private ready: Promise<void> = Promise.resolve()
  private finishReady: () => void = () => {}

  constructor(
    private readonly trashItem: (absolute: string) => Promise<void> = async () => {
      throw new WorkspaceFileError(
        'filesystem',
        'Trash is unavailable. The item was kept in place.'
      )
    }
  ) {}

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.pending.then(task)
    this.pending = result.then(
      () => {},
      () => {}
    )
    return result
  }

  onChanged(listener: (change: WorkspaceChange) => void): void {
    this.listener = listener
  }

  async close(): Promise<void> {
    clearTimeout(this.timer)
    this.changed.clear()
    this.finishReady()
    const watcher = this.watcher
    this.watcher = null
    await watcher?.close()
  }

  current(): Workspace | null {
    return this.workspace
      ? {
          ...this.workspace,
          files: [...this.workspace.files],
          directories: [...this.workspace.directories],
          warnings: [...this.workspace.warnings]
        }
      : null
  }

  open(directory: string): Promise<Workspace> {
    return this.enqueue(async () => {
      const root = await realpath(resolve(directory))
      const identity = await stat(root)
      if (!identity.isDirectory()) throw new Error('Choose a directory as the workspace.')
      const files: string[] = []
      const directories: string[] = []
      const warnings: string[] = []
      const scan = async (directory: string): Promise<void> => {
        let entries
        try {
          entries = await readdir(directory, { withFileTypes: true })
        } catch (error) {
          if (directory === root) throw error
          warnings.push(`Could not scan ${relative(root, directory)}.`)
          return
        }
        for (const entry of entries) {
          const path = resolve(directory, entry.name)
          // Symlinks never grant access outside the workspace.
          if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
            directories.push(relative(root, path).split(sep).join('/'))
            await scan(path)
          } else if (entry.isFile() && isMarkdown(entry.name))
            files.push(relative(root, path).split(sep).join('/'))
        }
      }
      await scan(root)
      await this.close()
      this.paths = new WorkspaceFiles(root, identity)
      this.workspace = {
        root,
        version: 0,
        name: basename(root),
        files: files.sort(),
        directories: directories.sort(),
        warnings
      }
      this.startWatching(root)
      return this.current()!
    })
  }

  private publish(operation?: WorkspaceChange['operation']): WorkspaceChange {
    clearTimeout(this.timer)
    this.workspace!.version++
    const change: WorkspaceChange = {
      workspace: this.current()!,
      changedPaths: [...this.changed],
      ...(operation ? { operation } : {})
    }
    this.changed.clear()
    this.listener(change)
    return change
  }

  private remove(path: string): void {
    this.workspace!.files = this.workspace!.files.filter((file) => {
      if (!isWithinPath(file, path)) return true
      this.changed.add(file)
      return false
    })
    this.workspace!.directories = this.workspace!.directories.filter(
      (folder) => !isWithinPath(folder, path)
    )
  }

  private startWatching(root: string): void {
    this.ready = new Promise((resolve) => {
      this.finishReady = resolve
    })
    const watcher = watch(root, {
      ignoreInitial: false,
      followSymlinks: false,
      ignored: (path, stats) =>
        relative(root, path)
          .split(sep)
          .some((part) => ignoredDirectories.has(part)) ||
        Boolean(stats?.isSymbolicLink()) ||
        Boolean(stats?.isFile() && !isMarkdown(path)),
      atomic: 100,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
    })
    this.watcher = watcher
    const discovered = new Set<string>()
    const discoveredDirectories = new Set<string>()
    watcher.on('all', (_event, absolute) => {
      void this.enqueue(async () => {
        if (this.watcher !== watcher || !this.workspace) return
        const local = relative(root, absolute).split(sep).join('/')
        let stats
        try {
          stats = await lstat(absolute)
        } catch (error) {
          if (!(
            error &&
            typeof error === 'object' &&
            'code' in error &&
            ['ENOENT', 'ENOTDIR'].includes(String(error.code))
          ))
            throw error
        }
        // Reconcile against the filesystem, not a delayed event's former meaning.
        // This prevents stale add/unlink events from undoing our own rename/create.
        if (!local) {
          if (!stats || stats.isSymbolicLink() || !stats.isDirectory()) {
            this.workspace.warnings = ['The workspace folder was removed. Open another folder.']
            this.changed = new Set(this.workspace.files)
            this.workspace.files = []
            this.workspace.directories = []
          } else return
        } else if (!stats || stats.isSymbolicLink()) {
          this.remove(local)
          for (const path of discovered) if (isWithinPath(path, local)) discovered.delete(path)
          for (const path of discoveredDirectories)
            if (isWithinPath(path, local)) discoveredDirectories.delete(path)
        } else if (stats.isDirectory()) {
          this.workspace.directories = [...new Set([...this.workspace.directories, local])].sort()
          discoveredDirectories.add(local)
        } else if (stats.isFile() && isMarkdown(local)) {
          this.workspace.files = [...new Set([...this.workspace.files, local])].sort()
          discovered.add(local)
          this.changed.add(local)
        } else return
        clearTimeout(this.timer)
        this.timer = setTimeout(() => {
          void this.enqueue(async () => {
            if (this.watcher === watcher && this.workspace) this.publish()
          })
        }, 100)
      }).catch((error) => this.watchError(watcher, error))
    })
    watcher.on('error', (error) => this.watchError(watcher, error))
    watcher.once('ready', () => {
      void this.enqueue(async () => {
        if (this.watcher !== watcher || !this.workspace) return
        this.changed = new Set([...this.workspace.files, ...discovered])
        this.workspace.files = [...discovered].sort()
        this.workspace.directories = [...discoveredDirectories].sort()
        this.publish()
        this.finishReady()
      }).catch((error) => this.watchError(watcher, error))
    })
  }

  private watchError(watcher: FSWatcher, error: unknown): void {
    console.error('Workspace watcher failed.', error)
    if (this.watcher !== watcher || !this.workspace) return
    this.workspace.warnings = ['File watching failed. Reopen the folder to retry.']
    this.publish()
    this.finishReady()
  }

  private async mutate(
    root: string,
    action: (
      paths: WorkspaceFiles
    ) => Promise<{ entry: WorkspaceEntry; operation?: WorkspaceChange['operation'] }>
  ): Promise<WorkspaceResult<WorkspaceMutation>> {
    await this.ready
    return this.enqueue(async () => {
      try {
        if (!this.workspace || !this.paths || this.workspace.root !== root)
          throw new WorkspaceFileError(
            'changed',
            'The workspace changed. Choose an item in the current folder.'
          )
        const { entry, operation } = await action(this.paths)
        if (operation?.kind === 'rename') {
          this.workspace.files = this.workspace.files
            .map((path) => remapPath(path, operation.from, operation.to))
            .sort()
          this.workspace.directories = this.workspace.directories
            .map((path) => remapPath(path, operation.from, operation.to))
            .sort()
        }
        if (entry.kind === 'file')
          this.workspace.files = [...new Set([...this.workspace.files, entry.path])].sort()
        else
          this.workspace.directories = [
            ...new Set([...this.workspace.directories, entry.path])
          ].sort()
        this.changed.add(entry.path)
        return { ok: true, value: { entry, change: this.publish(operation) } }
      } catch (error) {
        return { ok: false, error: workspaceError(error) }
      }
    })
  }

  createFile(request: WorkspaceCreateRequest): Promise<WorkspaceResult<WorkspaceMutation>> {
    return this.mutate(request.root, async (paths) => ({
      entry: await paths.create(request.parentPath, request.name, 'file')
    }))
  }
  createFolder(request: WorkspaceCreateRequest): Promise<WorkspaceResult<WorkspaceMutation>> {
    return this.mutate(request.root, async (paths) => ({
      entry: await paths.create(request.parentPath, request.name, 'directory')
    }))
  }
  rename(request: WorkspaceRenameRequest): Promise<WorkspaceResult<WorkspaceMutation>> {
    return this.mutate(request.root, async (paths) => {
      const entry = await paths.rename(request.path, request.name)
      return { entry, operation: { kind: 'rename', from: request.path, to: entry.path } }
    })
  }

  async trash(
    request: WorkspaceItemRequest,
    confirm: (entry: WorkspaceEntry) => Promise<boolean>
  ): Promise<WorkspaceResult<WorkspaceMutation | null>> {
    await this.ready
    return this.enqueue(async () => {
      try {
        if (!this.workspace || !this.paths || this.workspace.root !== request.root) {
          throw new WorkspaceFileError(
            'changed',
            'The workspace changed. Choose an item in the current folder.'
          )
        }
        const source = await this.paths.entry(request.path)
        if (!(await confirm(source.entry))) return { ok: true, value: null }
        // A confirmation must not authorize a different item swapped into this path.
        const latest = await this.paths.entry(request.path)
        if (
          !sameIdentity(source.stats, latest.stats) ||
          source.stats.mtimeMs !== latest.stats.mtimeMs ||
          source.stats.size !== latest.stats.size
        ) {
          throw new WorkspaceFileError(
            'changed',
            'This item changed while confirming. Review it and try again.'
          )
        }
        await this.trashItem(latest.absolute)
        this.remove(request.path)
        return {
          ok: true,
          value: {
            entry: source.entry,
            change: this.publish({ kind: 'trash', path: request.path })
          }
        }
      } catch (error) {
        return { ok: false, error: workspaceError(error) }
      }
    })
  }

  async resolveDocument(path: string): Promise<string> {
    if (!this.paths) throw new Error('Open a workspace first.')
    if (!isMarkdown(path)) throw new Error('Invalid Markdown path.')
    const { absolute, stats } = await this.paths.resolve(path)
    if (!stats.isFile()) throw new Error('Invalid Markdown file.')
    return absolute
  }
}
