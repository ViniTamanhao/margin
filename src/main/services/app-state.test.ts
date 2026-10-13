import { expect, test } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppStateService } from './app-state'

test('remembers only the workspace and tolerates missing or malformed state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'margin-state-'))
  try {
    const file = join(directory, 'state.json')
    const state = new AppStateService(file)
    expect(await state.lastWorkspace()).toBeNull()
    await state.remember('/notes')
    expect(await new AppStateService(file).lastWorkspace()).toBe('/notes')
    await writeFile(file, '{"workspace":42}')
    expect(await state.lastWorkspace()).toBeNull()
    await state.remember(null)
    expect(await state.lastWorkspace()).toBeNull()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
