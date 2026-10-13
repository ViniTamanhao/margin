import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { DocumentSnapshot } from '../../shared/api'
import type { WorkspaceService } from './workspace'

export const revisionOf = (content: string): string =>
  createHash('sha256').update(content).digest('hex')

export class DocumentService {
  constructor(private readonly workspaces: WorkspaceService) {}

  async read(path: string): Promise<DocumentSnapshot> {
    const target = await this.workspaces.resolveDocument(path)
    const content = await readFile(target, 'utf8')
    return { path, content, revision: revisionOf(content) }
  }
}
