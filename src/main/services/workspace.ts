import { readdir, realpath, stat, lstat } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import type { Workspace, WorkspaceChange } from '../../shared/api'

export const ignoredDirectories = new Set(['.git', 'node_modules', '.hg', '.svn'])
export const isMarkdown = (path: string): boolean => path.toLowerCase().endsWith('.md')

export class WorkspaceService {
  private workspace: Workspace | null = null

  private watcher: FSWatcher | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private changed = new Set<string>()
  private listener: (change: WorkspaceChange) => void = () => {}

  onChanged(listener: (change: WorkspaceChange) => void): void {
    this.listener = listener
  }

  async close(): Promise<void> {
    clearTimeout(this.timer)
    this.changed.clear()
    await this.watcher?.close()
    this.watcher = null
  }

  current(): Workspace | null {
    return this.workspace
  }

  async open(directory: string): Promise<Workspace> {
    const root = await realpath(resolve(directory))
    if (!(await stat(root)).isDirectory()) throw new Error('Choose a directory as the workspace.')
    const files: string[] = []
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
        // Do not traverse symlinks: a workspace must never grant access outside its root.
        if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) await scan(path)
        else if (entry.isFile() && isMarkdown(entry.name))
          files.push(relative(root, path).split(sep).join('/'))
      }
    }
    await scan(root)
    await this.close()
    this.workspace = { root, name: basename(root), files: files.sort(), warnings }
    this.startWatching(root)
    return this.workspace
  }

  private startWatching(root: string): void {
    const watcher = watch(root, {
      ignoreInitial: false,
      followSymlinks: false,
      ignored: (path, stats) => {
        const parts = relative(root, path).split(sep)
        return (
          parts.some((part) => ignoredDirectories.has(part)) ||
          Boolean(stats?.isSymbolicLink()) ||
          Boolean(stats?.isFile() && !isMarkdown(path))
        )
      },
      atomic: 100,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
    })
    const discovered = new Set<string>()
    this.watcher = watcher
    const publish = (): void => {
      if (this.watcher !== watcher || !this.workspace) return
      this.listener({
        workspace: {
          ...this.workspace,
          files: [...this.workspace.files],
          warnings: [...this.workspace.warnings]
        },
        changedPaths: [...this.changed]
      })
      this.changed.clear()
    }
    watcher.on('all', (event, path) => {
      if (this.watcher !== watcher || !this.workspace) return
      const local = relative(root, path).split(sep).join('/')
      if (!local && event === 'unlinkDir') {
        this.workspace.warnings = ['The workspace folder was removed. Open another folder.']
        this.changed = new Set(this.workspace.files)
        this.workspace.files = []
      } else if (isMarkdown(local)) {
        const files = new Set(this.workspace.files)
        if (event === 'unlink') {
          files.delete(local)
          discovered.delete(local)
        } else if (event === 'add') {
          files.add(local)
          discovered.add(local)
        } else if (event !== 'change') return
        this.workspace.files = [...files].sort()
        this.changed.add(local)
      } else return
      clearTimeout(this.timer)
      this.timer = setTimeout(publish, 100)
    })
    watcher.on('error', (error) => {
      console.error('Workspace watcher failed.', error)
      if (this.watcher !== watcher || !this.workspace) return
      this.workspace.warnings = ['File watching failed. Reopen the folder to retry.']
      publish()
    })
    // Reconcile the initial async scan with the watcher's own discovery, closing the startup gap.
    watcher.once('ready', () => {
      if (this.watcher !== watcher || !this.workspace) return
      this.changed = new Set([...this.workspace.files, ...discovered])
      this.workspace.files = [...discovered].sort()
      publish()
    })
  }

  async resolveDocument(path: string): Promise<string> {
    const workspace = this.workspace
    if (!workspace) throw new Error('Open a workspace first.')
    if (!path || isAbsolute(path) || !isMarkdown(path) || path.includes('\\')) {
      throw new Error('Invalid Markdown path.')
    }
    const parts = path.split('/')
    if (
      parts.some((part) => part === '..' || part === '.' || !part || ignoredDirectories.has(part))
    ) {
      throw new Error('Invalid Markdown path.')
    }
    const target = resolve(workspace.root, ...parts)
    const local = relative(workspace.root, target)
    if (local.startsWith(`..${sep}`) || isAbsolute(local))
      throw new Error('Path is outside the workspace.')
    // Reject symlinks at every level, including a directory replaced after discovery.
    for (let index = 1; index <= parts.length; index++) {
      if ((await lstat(resolve(workspace.root, ...parts.slice(0, index)))).isSymbolicLink()) {
        throw new Error('Symbolic links cannot be edited.')
      }
    }
    const canonical = await realpath(target)
    if (canonical !== target || !(await stat(target)).isFile())
      throw new Error('Invalid Markdown file.')
    return target
  }
}
