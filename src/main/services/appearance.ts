import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  defaultAppearance,
  parseAppearance,
  type PersistedAppearanceSettings,
  type AppearanceSettings
} from '../../shared/appearance'

function parsePersistedAppearance(input: unknown): AppearanceSettings | null {
  if (typeof input !== 'object' || input === null) return null
  if ('version' in input) {
    if (input.version !== 1 || !('appearance' in input)) return null
    return parseAppearance(input.appearance)
  }
  const legacy = parseAppearance(input)
  if (!legacy) return null
  // Only the unversioned file format treats this stack as a former default.
  // Version 1 and IPC inputs preserve it as an intentional custom font.
  if (legacy.fontFamily === "'Iowan Old Style', 'Palatino Linotype', Georgia, serif")
    legacy.fontFamily = defaultAppearance.fontFamily
  return legacy
}

export class AppearanceService {
  private pending: Promise<void> = Promise.resolve()
  constructor(private readonly file: string) {}
  async read(): Promise<AppearanceSettings> {
    await this.pending
    try {
      const settings = parsePersistedAppearance(JSON.parse(await readFile(this.file, 'utf8')))
      if (!settings) console.warn('Invalid appearance settings; using defaults.')
      return settings ?? { ...defaultAppearance }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.warn('Could not restore appearance settings.', error)
      return { ...defaultAppearance }
    }
  }
  save(input: unknown): Promise<void> {
    const settings = parseAppearance(input)
    if (!settings) return Promise.reject(new Error('Invalid appearance settings.'))
    const persisted: PersistedAppearanceSettings = { version: 1, appearance: settings }
    const write = this.pending.then(async () => {
      await mkdir(dirname(this.file), { recursive: true })
      await writeFile(`${this.file}.tmp`, JSON.stringify(persisted), 'utf8')
      await rename(`${this.file}.tmp`, this.file)
    })
    // Keep the queue usable after a failed write; the caller still receives
    // the rejecting promise and presents the save failure.
    this.pending = write.catch(() => {})
    return write
  }
}
