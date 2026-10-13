import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'

export class AppStateService {
  constructor(private readonly file: string) {}

  async lastWorkspace(): Promise<string | null> {
    try {
      const state: unknown = JSON.parse(await readFile(this.file, 'utf8'))
      if (
        typeof state === 'object' &&
        state !== null &&
        'workspace' in state &&
        typeof state.workspace === 'string'
      )
        return state.workspace
      return null
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.warn('Could not restore application state.', error)
      return null
    }
  }

  async remember(workspace: string | null): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(`${this.file}.tmp`, JSON.stringify({ workspace }), 'utf8')
    await rename(`${this.file}.tmp`, this.file)
  }
}
