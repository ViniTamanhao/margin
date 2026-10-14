import { expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppearanceService } from './appearance'
import { defaultAppearance, parseAppearance } from '../../shared/appearance'

test('validates settings, font bounds and all semantic color overrides', () => {
  expect(parseAppearance(defaultAppearance)).toEqual(defaultAppearance)
  for (const patch of [
    { theme: 'unknown' },
    { fontSize: 11 },
    { fontSize: 33 },
    { fontSize: 18.5 },
    { fontFamily: 'url(secret)' },
    { colors: { bg: 'red' } },
    { colors: { unknown: '#ffffff' } },
    { colors: [] }
  ])
    expect(parseAppearance({ ...defaultAppearance, ...patch })).toBeNull()
  expect(parseAppearance(null)).toBeNull()
})
test('defaults to dark, serializes writes and persists independently of workspace state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'margin-appearance-'))
  const file = join(directory, 'appearance.json')
  const service = new AppearanceService(file)
  try {
    expect(await service.read()).toEqual(defaultAppearance)
    const first = { ...defaultAppearance, theme: 'light' as const }
    const last = { ...first, fontSize: 22, colors: { accent: '#123456' } }
    await Promise.all([service.save(first), service.save(last)])
    expect(await new AppearanceService(file).read()).toEqual(last)
    await expect(service.save({ ...last, fontSize: 99 })).rejects.toThrow('Invalid')
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(last)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await writeFile(file, '{broken')
      expect(await service.read()).toEqual(defaultAppearance)
      await writeFile(file, JSON.stringify({ ...last, colors: { bg: 'bad' } }))
      expect(await service.read()).toEqual(defaultAppearance)
      expect(warn).toHaveBeenCalledTimes(2)
    } finally {
      warn.mockRestore()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
