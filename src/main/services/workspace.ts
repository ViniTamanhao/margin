import { readdir, realpath, stat, lstat } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import type { Workspace } from '../../shared/api'

export const ignoredDirectories = new Set(['.git', 'node_modules', '.hg', '.svn'])
export const isMarkdown = (path: string): boolean => path.toLowerCase().endsWith('.md')

export class WorkspaceService {
  private workspace: Workspace | null = null

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
    this.workspace = { root, name: basename(root), files: files.sort(), warnings }
    return this.workspace
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
