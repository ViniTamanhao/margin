import { expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppearanceService } from './appearance'
import { defaultAppearance, parseAppearance } from '../../shared/appearance'

test('validates the two themes and font family', () => {
  expect(parseAppearance(defaultAppearance)).toEqual(defaultAppearance)
  for (const patch of [
    { theme: 'unknown' },
    { fontFamily: 'url(secret)' },
    { fontFamily: '' },
    { fontFamily: '   ' },
    { fontFamily: 'a'.repeat(201) },
    { fontFamily: 18 },
    { customTitleBar: 'true' },
    { customTitleBar: null },
    { customTitleBar: 1 }
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
    const last = {
      ...first,
      customTitleBar: false,
      fontFamily: 'Georgia, serif',
      editorFontSize: 24,
      uiFontSize: 16
    }
    await Promise.all([service.save(first), service.save(last)])
    expect(await new AppearanceService(file).read()).toEqual(last)
    await expect(service.save({ ...last, fontFamily: 'url(secret)' })).rejects.toThrow('Invalid')
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ version: 1, appearance: last })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await writeFile(file, '{broken')
      expect(await service.read()).toEqual(defaultAppearance)
      await writeFile(file, JSON.stringify({ ...last, theme: 'unknown' }))
      expect(await service.read()).toEqual(defaultAppearance)
      expect(warn).toHaveBeenCalledTimes(2)
    } finally {
      warn.mockRestore()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

const formerDefault = "'Iowan Old Style', 'Palatino Linotype', Georgia, serif"
test('appearance validation preserves the exact former default as a custom font', () => {
  expect(parseAppearance({ ...defaultAppearance, fontFamily: formerDefault })?.fontFamily).toBe(
    formerDefault
  )
})
test('loads legacy fonts only through the unversioned migration boundary', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'margin-migration-'))
  const file = join(directory, 'appearance.json')
  const service = new AppearanceService(file)
  try {
    for (const theme of ['dark', 'light'] as const) {
      await writeFile(
        file,
        JSON.stringify({ ...defaultAppearance, theme, fontFamily: formerDefault })
      )
      expect((await service.read()).fontFamily).toBe(defaultAppearance.fontFamily)
      await writeFile(
        file,
        JSON.stringify({ ...defaultAppearance, theme, fontFamily: 'Georgia, serif' })
      )
      expect((await service.read()).fontFamily).toBe('Georgia, serif')
      const intentional = { ...defaultAppearance, theme, fontFamily: formerDefault }
      await service.save(intentional)
      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
        version: 1,
        appearance: intentional
      })
      expect(await new AppearanceService(file).read()).toEqual(intentional)
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      for (const invalid of [
        null,
        {},
        { version: 1 },
        { version: 2, appearance: defaultAppearance },
        { version: 1, appearance: { ...defaultAppearance, fontFamily: '' } }
      ]) {
        await writeFile(file, JSON.stringify(invalid))
        expect(await service.read()).toEqual(defaultAppearance)
      }
    } finally {
      warn.mockRestore()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('drops obsolete font sizes and color overrides when loading and saving', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'margin-old-appearance-'))
  const file = join(directory, 'appearance.json')
  const service = new AppearanceService(file)
  const expected = { ...defaultAppearance, theme: 'light' as const, fontFamily: 'Georgia, serif' }
  const oldSettings = { ...expected, fontSize: 30, colors: { selection: '#00ff00' } }
  try {
    for (const stored of [oldSettings, { version: 1, appearance: oldSettings }]) {
      await writeFile(file, JSON.stringify(stored))
      expect(await service.read()).toEqual(expected)
    }
    await service.save(oldSettings)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ version: 1, appearance: expected })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('font sizes default for existing settings and reject invalid values', () => {
  expect(parseAppearance({ theme: 'light', fontFamily: 'Georgia' })).toEqual({
    ...defaultAppearance,
    theme: 'light',
    fontFamily: 'Georgia'
  })
  for (const [key, values] of Object.entries({
    editorFontSize: [11, 33, 18.5, NaN, Infinity, null, '18'],
    uiFontSize: [10, 21, 13.5, NaN, Infinity, null, '13']
  })) {
    for (const value of values)
      expect(parseAppearance({ ...defaultAppearance, [key]: value })).toBeNull()
  }
})
