import { readFile, writeFile, mkdir, open, rename, unlink, stat } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { DocumentSnapshot, SaveRequest, SaveResult } from '../../shared/api'
import type { WorkspaceService } from './workspace'

export const revisionOf = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex')
const missing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT'

export class DocumentService {
  private writes = new Map<string, Promise<SaveResult>>()
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly recoveryDirectory: string
  ) {}

  private async snapshot(path: string, target: string): Promise<DocumentSnapshot> {
    const bytes = await readFile(target)
    const content = bytes.toString('utf8')
    if (!Buffer.from(content, 'utf8').equals(bytes))
      throw new Error('This file is not valid UTF-8 Markdown.')
    return { path, content, revision: revisionOf(bytes) }
  }

  async read(path: string): Promise<DocumentSnapshot> {
    return this.snapshot(path, await this.workspaces.resolveDocument(path))
  }

  async save(request: SaveRequest): Promise<SaveResult> {
    let target: string
    try {
      target = await this.workspaces.resolveDocument(request.path)
    } catch (error) {
      if (missing(error)) return { kind: 'missing' }
      throw error
    }
    const previous = this.writes.get(target)
    const write = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(() =>
      this.write(request, target)
    )
    this.writes.set(target, write)
    try {
      return await write
    } finally {
      if (this.writes.get(target) === write) this.writes.delete(target)
    }
  }

  async saveCopy(target: string, content: string): Promise<void> {
    // Recovery copies never replace an existing file, even if it appears after the dialog.
    const handle = await open(target, 'wx')
    try {
      await handle.writeFile(content, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
  }

  private async preserve(target: string, content: string): Promise<void> {
    const directory = join(this.recoveryDirectory, revisionOf(target))
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await writeFile(join(directory, 'source.json'), JSON.stringify({ path: target }), {
      mode: 0o600
    })
    try {
      await writeFile(join(directory, `${revisionOf(content)}.md`), content, {
        flag: 'wx',
        mode: 0o600
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }

  private async write(request: SaveRequest, target: string): Promise<SaveResult> {
    let temporary: string | undefined
    try {
      const current = await this.snapshot(request.path, target)
      if (current.revision !== request.revision) return { kind: 'conflict', current }
      if (current.content === request.content) return { kind: 'saved', revision: current.revision }
      const metadata = await stat(target)
      if (metadata.nlink > 1) throw new Error('Hard-linked documents cannot be safely replaced.')
      // Normal filesystems have no compare-and-swap rename. Preserve both versions before
      // replacement so both the observed disk version and proposed edits remain recoverable.
      await this.preserve(target, current.content)
      await this.preserve(target, request.content)
      temporary = join(dirname(target), `.margin-${randomUUID()}.tmp`)
      const handle = await open(temporary, 'wx', metadata.mode)
      try {
        await handle.writeFile(request.content, 'utf8')
        await handle.chmod(metadata.mode)
        await handle.sync()
      } finally {
        await handle.close()
      }
      // Revalidate paths and content immediately before atomic replacement.
      if ((await this.workspaces.resolveDocument(request.path)) !== target)
        throw new Error('Workspace changed during save.')
      const latest = await this.snapshot(request.path, target)
      if (latest.revision !== request.revision) return { kind: 'conflict', current: latest }
      await rename(temporary, target)
      temporary = undefined
      return { kind: 'saved', revision: revisionOf(request.content) }
    } catch (error) {
      if (missing(error)) return { kind: 'missing' }
      throw error
    } finally {
      if (temporary)
        await unlink(temporary).catch((error) => {
          if (!missing(error)) console.warn('Could not remove save staging file.', error)
        })
    }
  }
}
