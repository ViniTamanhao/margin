import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  defaultAppearance,
  parseAppearance,
  type AppearanceSettings
} from '../../shared/appearance'

export class AppearanceService {
  private pending: Promise<void> = Promise.resolve()
  constructor(private readonly file: string) {}
  async read(): Promise<AppearanceSettings> {
    await this.pending
    try {
      const settings = parseAppearance(JSON.parse(await readFile(this.file, 'utf8')))
      if (!settings) console.warn('Invalid appearance settings; using defaults.')
      return settings ?? { ...defaultAppearance, colors: {} }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.warn('Could not restore appearance settings.', error)
      return { ...defaultAppearance, colors: {} }
    }
  }
  save(input: unknown): Promise<void> {
    const settings = parseAppearance(input)
    if (!settings) return Promise.reject(new Error('Invalid appearance settings.'))
    const write = this.pending.then(async () => {
      await mkdir(dirname(this.file), { recursive: true })
      await writeFile(`${this.file}.tmp`, JSON.stringify(settings), 'utf8')
      await rename(`${this.file}.tmp`, this.file)
    })
    this.pending = write.catch(() => {})
    return write
  }
}
