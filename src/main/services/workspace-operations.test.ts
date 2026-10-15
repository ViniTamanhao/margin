import { afterEach, expect, test } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceService } from './workspace'
import type { WorkspaceMutation, WorkspaceResult } from '../../shared/api'

const fixtures: { root: string; service: WorkspaceService }[] = []
afterEach(async () => {
  for (const { root, service } of fixtures.splice(0)) {
    await service.close()
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture(): Promise<{ root: string; service: WorkspaceService }> {
  const root = await mkdtemp(join(tmpdir(), 'margin-operations-'))
  const service = new WorkspaceService()
  fixtures.push({ root, service })
  await service.open(root)
  return { root, service }
}
const value = (result: WorkspaceResult<WorkspaceMutation>): WorkspaceMutation => {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

test('creates empty Markdown files, appends .md, preserves explicit extension and rejects others', async () => {
  const { root, service } = await fixture()
  const created = value(await service.createFile({ root, parentPath: '', name: 'notes' }))
  expect(created.entry).toEqual({ path: 'notes.md', kind: 'file' })
  expect(created.change.workspace.files).toEqual(['notes.md'])
  expect(await readFile(join(root, 'notes.md'), 'utf8')).toBe('')
  expect(
    value(await service.createFile({ root, parentPath: '', name: 'exact.md' })).entry.path
  ).toBe('exact.md')
  expect(await service.createFile({ root, parentPath: '', name: 'notes.txt' })).toMatchObject({
    ok: false,
    error: { code: 'invalid-name' }
  })
  expect(await service.createFile({ root, parentPath: '', name: '.md' })).toMatchObject({
    ok: false
  })
  await writeFile(join(root, 'notes.md'), 'Keep me')
  expect(await service.createFile({ root, parentPath: '', name: 'notes' })).toMatchObject({
    ok: false,
    error: { code: 'collision' }
  })
  expect(await readFile(join(root, 'notes.md'), 'utf8')).toBe('Keep me')
})

test('exclusive creates remain safe when requests race', async () => {
  const { root, service } = await fixture()
  const results = await Promise.all([
    service.createFile({ root, parentPath: '', name: 'race' }),
    service.createFile({ root, parentPath: '', name: 'race.md' })
  ])
  expect(results.filter((result) => result.ok)).toHaveLength(1)
  expect(results.filter((result) => !result.ok)).toHaveLength(1)
})

test('creates folders, including directories named .md, then files inside them', async () => {
  const { root, service } = await fixture()
  expect(
    value(await service.createFolder({ root, parentPath: '', name: 'folder.md' })).entry.kind
  ).toBe('directory')
  expect(
    value(await service.createFolder({ root, parentPath: 'folder.md', name: 'Nested' })).entry.path
  ).toBe('folder.md/Nested')
  expect(
    value(await service.createFile({ root, parentPath: 'folder.md/Nested', name: 'a' })).entry.path
  ).toBe('folder.md/Nested/a.md')
  expect(await service.createFolder({ root, parentPath: '', name: 'folder.md' })).toMatchObject({
    ok: false,
    error: { code: 'collision' }
  })
})

test('renames files and whole folders with nested and undisplayed contents, updates metadata immediately', async () => {
  const { root, service } = await fixture()
  value(await service.createFolder({ root, parentPath: '', name: 'Campaign' }))
  value(await service.createFolder({ root, parentPath: 'Campaign', name: 'Nested' }))
  value(await service.createFile({ root, parentPath: 'Campaign/Nested', name: 'a' }))
  await writeFile(join(root, 'Campaign/image.png'), 'unseen')
  await writeFile(join(root, 'Campaign/Nested/a.md'), 'User text')
  expect(
    value(await service.rename({ root, path: 'Campaign/Nested/a.md', name: 'b' })).entry.path
  ).toBe('Campaign/Nested/b.md')
  const renamed = value(await service.rename({ root, path: 'Campaign', name: 'World' }))
  expect(renamed.change.operation).toEqual({ kind: 'rename', from: 'Campaign', to: 'World' })
  expect(renamed.change.workspace.files).toEqual(['World/Nested/b.md'])
  expect(await readFile(join(root, 'World/Nested/b.md'), 'utf8')).toBe('User text')
  expect(await readFile(join(root, 'World/image.png'), 'utf8')).toBe('unseen')
  await expect.poll(() => service.current()?.files).toEqual(['World/Nested/b.md'])
  await new Promise((resolve) => setTimeout(resolve, 400))
  expect(service.current()?.files).toEqual(['World/Nested/b.md'])
  expect(service.current()?.directories).toEqual(['World', 'World/Nested'])
})

test('rename rejects collisions, non-Markdown names, traversal, symlinks and stale workspaces', async () => {
  const { root, service } = await fixture()
  await mkdir(join(root, 'notes'))
  await writeFile(join(root, 'a.md'), 'A')
  await writeFile(join(root, 'b.md'), 'B')
  await symlink(join(root, 'notes'), join(root, 'link'))
  expect(await service.rename({ root, path: 'a.md', name: 'b.md' })).toMatchObject({
    ok: false,
    error: { code: 'collision' }
  })
  await mkdir(join(root, 'other'))
  expect(await service.rename({ root, path: 'notes', name: 'other' })).toMatchObject({
    ok: false,
    error: { code: 'collision' }
  })
  for (const name of ['../escape', 'x/y', 'x\\y', '.', '..', 'a.txt', 'node_modules', 'NUL']) {
    expect(await service.rename({ root, path: 'b.md', name })).toMatchObject({ ok: false })
  }
  for (const parentPath of ['..', '/tmp', 'notes/..', 'link', '.git', 'C:/outside']) {
    expect(await service.createFile({ root, parentPath, name: 'escape' })).toMatchObject({
      ok: false
    })
  }
  expect(await service.rename({ root, path: 'link', name: 'renamed' })).toMatchObject({ ok: false })
  expect(await service.rename({ root: '/other-workspace', path: 'b.md', name: 'c' })).toMatchObject(
    { ok: false, error: { code: 'changed' } }
  )
  expect(await readFile(join(root, 'b.md'), 'utf8')).toBe('B')
  expect(await readdir(join(root, 'notes'))).toEqual([])
})
