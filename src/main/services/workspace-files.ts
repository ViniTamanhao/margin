import { lstat, realpath, open, mkdir, rename } from 'node:fs/promises'
import { isAbsolute, resolve, extname } from 'node:path'
import type { Stats } from 'node:fs'
import type { WorkspaceEntry, WorkspaceError } from '../../shared/api'
import { parentPath } from '../../shared/workspace-paths'

export const ignoredDirectories = new Set(['.git', 'node_modules', '.hg', '.svn'])
export const isMarkdown = (path: string): boolean => path.toLowerCase().endsWith('.md')

export class WorkspaceFileError extends Error {
  constructor(
    readonly code: WorkspaceError['code'],
    message: string
  ) {
    super(message)
  }
}

export function workspaceError(error: unknown): WorkspaceError {
  if (error instanceof WorkspaceFileError) return { code: error.code, message: error.message }
  const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
  if (code === 'EEXIST' || code === 'ENOTEMPTY')
    return { code: 'collision', message: 'An item with that name already exists.' }
  if (code === 'ENOENT' || code === 'ENOTDIR')
    return {
      code: 'unavailable',
      message:
        'This item or its parent is no longer available. Refresh the Files panel and try again.'
    }
  console.error('Workspace file operation failed.', error)
  return {
    code: 'filesystem',
    message: 'Could not change this item. Check folder permissions and try again.'
  }
}

export function validateName(name: string, markdownFile: boolean): string {
  if (
    !name ||
    name !== name.trim() ||
    name === '.' ||
    name === '..' ||
    /[<>:"/\\|?*]/.test(name) ||
    [...name].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    ) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ||
    ignoredDirectories.has(name)
  ) {
    throw new WorkspaceFileError(
      'invalid-name',
      'Use a single name without path separators, reserved names, or trailing spaces/dots.'
    )
  }
  if (!markdownFile) return name
  if (name.toLowerCase() === '.md')
    throw new WorkspaceFileError('invalid-name', 'Enter a filename before .md.')
  const extension = extname(name)
  if (extension && extension.toLowerCase() !== '.md')
    throw new WorkspaceFileError(
      'invalid-name',
      'Margin creates Markdown files. Use a name ending in .md.'
    )
  return extension ? name : `${name}.md`
}

function segments(path: string, allowRoot: boolean): string[] {
  if (
    (path === '' && !allowRoot) ||
    isAbsolute(path) ||
    path.includes('\\') ||
    path.includes('\0')
  ) {
    throw new WorkspaceFileError('invalid-path', 'Choose an item inside the current workspace.')
  }
  if (!path && allowRoot) return []
  const parts = path.split('/')
  if (
    parts.some(
      (part) =>
        !part || part === '.' || part === '..' || part.includes(':') || ignoredDirectories.has(part)
    )
  ) {
    throw new WorkspaceFileError(
      'invalid-path',
      'Choose an item inside the current workspace, outside ignored folders.'
    )
  }
  return parts
}

export function sameIdentity(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.isDirectory() === b.isDirectory()
}

// Every component is checked, including the root, to reject replaced parents and
// symlinks. The filesystem remains authoritative; discovered paths grant no access.
export class WorkspaceFiles {
  constructor(
    readonly root: string,
    private readonly identity: Stats
  ) {}

  async resolve(path: string, allowRoot = false): Promise<{ absolute: string; stats: Stats }> {
    const parts = segments(path, allowRoot)
    let absolute = this.root
    let stats = await lstat(absolute)
    if (
      stats.isSymbolicLink() ||
      !sameIdentity(stats, this.identity) ||
      (await realpath(absolute)) !== this.root
    ) {
      throw new WorkspaceFileError(
        'changed',
        'The workspace folder changed. Reopen it before changing files.'
      )
    }
    for (const part of parts) {
      if (!stats.isDirectory())
        throw new WorkspaceFileError('invalid-path', 'The parent is not a folder.')
      absolute = resolve(absolute, part)
      stats = await lstat(absolute)
      if (stats.isSymbolicLink())
        throw new WorkspaceFileError('invalid-path', 'Symbolic links cannot be changed.')
    }
    return { absolute, stats }
  }

  async entry(path: string): Promise<{ entry: WorkspaceEntry; absolute: string; stats: Stats }> {
    const resolved = await this.resolve(path)
    if (!resolved.stats.isDirectory() && !(resolved.stats.isFile() && isMarkdown(path))) {
      throw new WorkspaceFileError('invalid-path', 'Choose a folder or Markdown file.')
    }
    return {
      ...resolved,
      entry: { path, kind: resolved.stats.isDirectory() ? 'directory' : 'file' }
    }
  }

  private async destination(
    parent: string,
    name: string
  ): Promise<{ path: string; absolute: string }> {
    const { absolute, stats } = await this.resolve(parent, true)
    if (!stats.isDirectory())
      throw new WorkspaceFileError('invalid-path', 'Choose a folder for this item.')
    return { path: parent ? `${parent}/${name}` : name, absolute: resolve(absolute, name) }
  }

  async create(
    parent: string,
    name: string,
    kind: WorkspaceEntry['kind']
  ): Promise<WorkspaceEntry> {
    const target = await this.destination(parent, validateName(name, kind === 'file'))
    if (kind === 'directory') await mkdir(target.absolute)
    else {
      // Exclusive creation is atomic: a concurrent creator can never be overwritten.
      const handle = await open(target.absolute, 'wx')
      await handle.close()
    }
    return { path: target.path, kind }
  }

  async rename(path: string, name: string): Promise<WorkspaceEntry> {
    const source = await this.entry(path)
    const target = await this.destination(
      parentPath(path),
      validateName(name, source.entry.kind === 'file')
    )
    if (path === target.path) return source.entry
    try {
      await lstat(target.absolute)
      throw new WorkspaceFileError('collision', 'An item with that name already exists.')
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
        throw error
    }
    const latest = await this.entry(path)
    if (!sameIdentity(source.stats, latest.stats))
      throw new WorkspaceFileError('changed', 'This item changed. Try again with its current name.')
    // Node exposes ordinary filesystem rename, not a portable no-replace syscall.
    // Serialize Margin operations and reject existing destinations immediately before it.
    await rename(latest.absolute, target.absolute)
    return { path: target.path, kind: source.entry.kind }
  }
}
