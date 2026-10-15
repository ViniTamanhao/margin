import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { setImmediate } from 'node:timers/promises'
import type { WorkspaceSearchRequest, WorkspaceSearchResult } from '../../shared/api'
import type { WorkspaceService } from './workspace'

// Replaceable lexical backend. Streams one validated workspace file at a time;
// no workspace contents or index are retained in the renderer or service.
export class ContentSearchService {
  constructor(private readonly workspaces: WorkspaceService) {}

  async search(
    request: WorkspaceSearchRequest,
    signal: AbortSignal
  ): Promise<WorkspaceSearchResult[]> {
    const workspace = this.workspaces.current()
    if (!workspace || workspace.root !== request.root) throw new Error('Workspace changed.')
    const query = request.query.trim()
    if (!query || signal.aborted) return []
    const limit = Math.max(1, Math.min(200, request.limit ?? 100))
    const sensitive = query !== query.toLowerCase()
    const needle = sensitive ? query : query.toLowerCase()
    const matches: WorkspaceSearchResult[] = []
    for (const path of workspace.files) {
      if (signal.aborted || !this.workspaces.isCurrentRoot(request.root)) return []
      let stream: ReturnType<typeof createReadStream> | undefined
      try {
        const absolute = await this.workspaces.resolveDocument(path)
        if (signal.aborted) return []
        stream = createReadStream(absolute, { encoding: 'utf8', signal })
        const lines = createInterface({ input: stream, crlfDelay: Infinity })
        // Keep error listeners installed when cancellation closes the iterator.
        stream.on('error', () => {})
        lines.on('error', () => {})
        let position = 0
        let line = 0
        for await (const text of lines) {
          if (signal.aborted) return []
          line++
          const haystack = sensitive ? text : text.toLowerCase()
          let from = 0
          for (;;) {
            const column = haystack.indexOf(needle, from)
            if (column < 0) break
            matches.push({
              path,
              line,
              column: column + 1,
              position: position + column,
              length: query.length,
              preview: text.slice(Math.max(0, column - 60), column + query.length + 120)
            })
            if (matches.length >= limit) return matches
            from = column + Math.max(1, needle.length)
          }
          // CodeMirror uses normalized line breaks for document positions.
          position += text.length + 1
          if (line % 128 === 0) await setImmediate()
        }
      } catch (error) {
        if (signal.aborted) return []
        // External deletions are expected; other failures remain visible in logs.
        console.warn('Content search could not read workspace file.', { path, error })
      } finally {
        stream?.destroy()
      }
      await setImmediate()
    }
    return signal.aborted ? [] : matches
  }
}
