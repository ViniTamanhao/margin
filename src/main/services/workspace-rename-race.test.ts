import { afterEach, expect, test, vi } from 'vitest'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as native from '../rename-no-replace'
import { WorkspaceService } from './workspace'
import type { WorkspaceChange } from '../../shared/api'

const fixtures: { root: string; service: WorkspaceService }[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const { root, service } of fixtures.splice(0)) {
    await service.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture(): Promise<{ root: string; service: WorkspaceService }> {
  const root = await mkdtemp(join(tmpdir(), 'margin-rename-race-'))
  const service = new WorkspaceService()
  fixtures.push({ root, service })
  return { root, service }
}

test.each(['file', 'empty folder', 'populated folder', 'symlink'])(
  'a %s created after rename preflight cannot be replaced',
  async (kind) => {
    const { root, service } = await fixture()
    const directory = kind.includes('folder')
    const from = directory ? 'Campaign' : 'a.md'
    const to = directory ? 'World' : 'b.md'
    if (directory) {
      await mkdir(join(root, from))
      await writeFile(join(root, from, 'a.md'), 'Original nested content')
    } else await writeFile(join(root, from), 'Original content')
    await service.open(root)
    const changes: WorkspaceChange[] = []
    service.onChanged((change) => changes.push(change))
    const sourceIdentity = await lstat(join(root, from))
    let destinationIdentity: Awaited<ReturnType<typeof lstat>> | undefined
    const exclusiveRename = native.renameNoReplace
    const mutation = vi.spyOn(native, 'renameNoReplace').mockImplementationOnce(async (a, b) => {
      // WorkspaceFiles has already observed ENOENT at the destination. Create
      // the external item immediately before the real native mutation.
      await expect(lstat(b)).rejects.toMatchObject({ code: 'ENOENT' })
      if (directory) {
        await mkdir(b)
        if (kind === 'populated folder') await writeFile(join(b, 'external.bin'), 'External data')
      } else if (kind === 'symlink') await symlink(a, b)
      else await writeFile(b, 'External content', { flag: 'wx' })
      destinationIdentity = await lstat(b)
      await exclusiveRename(a, b)
    })

    expect(await service.rename({ root, path: from, name: to })).toMatchObject({
      ok: false,
      error: { code: 'collision' }
    })
    expect(mutation).toHaveBeenCalledOnce()
    expect(await lstat(join(root, from))).toMatchObject({
      ino: sourceIdentity.ino,
      dev: sourceIdentity.dev
    })
    expect(await lstat(join(root, to))).toMatchObject({
      ino: destinationIdentity!.ino,
      dev: destinationIdentity!.dev
    })
    if (directory) {
      expect(await readFile(join(root, from, 'a.md'), 'utf8')).toBe('Original nested content')
      if (kind === 'populated folder')
        expect(await readFile(join(root, to, 'external.bin'), 'utf8')).toBe('External data')
      else expect(await readdir(join(root, to))).toEqual([])
    } else {
      expect(await readFile(join(root, from), 'utf8')).toBe('Original content')
      if (kind === 'symlink') expect((await lstat(join(root, to))).isSymbolicLink()).toBe(true)
      else expect(await readFile(join(root, to), 'utf8')).toBe('External content')
    }
    expect(service.current()?.files).toContain(directory ? 'Campaign/a.md' : 'a.md')
    expect(changes.some((change) => change.operation?.kind === 'rename')).toBe(false)
  }
)

test.each(['file', 'directory'])(
  'successful exclusive %s rename preserves identity',
  async (kind) => {
    const { root, service } = await fixture()
    const from = kind === 'file' ? 'a é.md' : 'Campaign å'
    const to = kind === 'file' ? 'b 曲.md' : 'World 龍'
    if (kind === 'file') await writeFile(join(root, from), 'Original content')
    else await mkdir(join(root, from))
    await service.open(root)
    const identity = await lstat(join(root, from))
    expect(await service.rename({ root, path: from, name: to })).toMatchObject({
      ok: true,
      value: { change: { operation: { kind: 'rename', from, to } } }
    })
    expect(await lstat(join(root, to))).toMatchObject({
      ino: identity.ino,
      dev: identity.dev,
      nlink: identity.nlink,
      mode: identity.mode
    })
    await expect(lstat(join(root, from))).rejects.toMatchObject({ code: 'ENOENT' })
  }
)

test('unsupported exclusive rename fails closed without changing paths or publishing a rename', async () => {
  const { root, service } = await fixture()
  await writeFile(join(root, 'a.md'), 'Keep me')
  await service.open(root)
  const changes: WorkspaceChange[] = []
  service.onChanged((change) => changes.push(change))
  vi.spyOn(native, 'renameNoReplace').mockRejectedValueOnce(
    Object.assign(new Error('Unsupported filesystem'), { code: 'ENOTSUP' })
  )
  expect(await service.rename({ root, path: 'a.md', name: 'b.md' })).toMatchObject({
    ok: false,
    error: {
      code: 'filesystem',
      message: expect.stringContaining('does not support safe renaming')
    }
  })
  expect(await readFile(join(root, 'a.md'), 'utf8')).toBe('Keep me')
  await expect(lstat(join(root, 'b.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(service.current()?.files).toEqual(['a.md'])
  expect(changes.some((change) => change.operation?.kind === 'rename')).toBe(false)
})

test('native missing-source errors are returned without creating a destination', async () => {
  const { root } = await fixture()
  await expect(
    native.renameNoReplace(join(root, 'missing.md'), join(root, 'b.md'))
  ).rejects.toMatchObject({
    code: 'ENOENT'
  })
  expect(await readdir(root)).toEqual([])
})
