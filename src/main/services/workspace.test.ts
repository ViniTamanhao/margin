import { afterEach, expect, test } from 'vitest'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceService } from './workspace'
import { DocumentService } from './documents'

const services: WorkspaceService[] = []
const directories: string[] = []
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()))
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'margin-test-'))
  directories.push(root)
  return root
}
test('discovers nested Markdown, ignores dependencies and symlinks, reads original files', async () => {
  const root = await fixture()
  for (const directory of ['notes', '.git', 'node_modules']) {
    await mkdir(join(root, directory))
    await writeFile(join(root, directory, 'a.md'), '# Hello')
  }
  await mkdir(join(root, 'empty'))
  await mkdir(join(root, 'assets'))
  await writeFile(join(root, 'assets/image.png'), 'image')
  await mkdir(join(root, 'folder.md'))
  await writeFile(join(root, 'UPPER.MD'), 'Uppercase')
  await writeFile(join(root, 'plain.txt'), 'Ignore')
  await symlink(join(root, 'notes'), join(root, 'link'))
  const service = new WorkspaceService()
  services.push(service)
  const workspace = await service.open(root)
  expect(workspace.files).toEqual(['UPPER.MD', 'notes/a.md'])
  expect(workspace.directories).toEqual(['assets', 'empty', 'folder.md', 'notes'])
  expect(
    (await new DocumentService(service, join(root, '.recovery')).read('notes/a.md')).content
  ).toBe('# Hello')
  for (const path of [
    '../a.md',
    '/tmp/a.md',
    'link/a.md',
    '.git/a.md',
    'notes/../UPPER.MD',
    'plain.txt'
  ]) {
    await expect(service.resolveDocument(path)).rejects.toThrow()
  }
})
test('rejects directory symlinks introduced after scanning', async () => {
  const root = await fixture()
  const outside = await fixture()
  await writeFile(join(outside, 'a.md'), 'Private')
  const service = new WorkspaceService()
  services.push(service)
  await service.open(root)
  await symlink(outside, join(root, 'escape'))
  await expect(service.resolveDocument('escape/a.md')).rejects.toThrow('Symbolic')
})

test('watches creates, edits, renames, deletes and stops the previous watcher', async () => {
  const root = await fixture()
  const other = await fixture()
  const service = new WorkspaceService()
  services.push(service)
  const events: import('../../shared/api').WorkspaceChange[] = []
  service.onChanged((change) => events.push(change))
  await service.open(root)
  await expect.poll(() => events.length).toBeGreaterThan(0)
  await writeFile(join(root, 'a.md'), 'one')
  await expect.poll(() => service.current()?.files).toEqual(['a.md'])
  events.length = 0
  await writeFile(join(root, 'a.md'), 'two')
  await expect.poll(() => events.some((change) => change.changedPaths.includes('a.md'))).toBe(true)
  const { rename } = await import('node:fs/promises')
  await rename(join(root, 'a.md'), join(root, 'b.md'))
  await expect.poll(() => service.current()?.files).toEqual(['b.md'])
  await rm(join(root, 'b.md'))
  await expect.poll(() => service.current()?.files).toEqual([])
  await service.open(other)
  await writeFile(join(root, 'ignored.md'), 'old workspace')
  await writeFile(join(other, 'current.md'), 'new workspace')
  await expect.poll(() => service.current()?.files).toEqual(['current.md'])
})

test('watches empty folders, nested folder renames and removal', async () => {
  const root = await fixture()
  await mkdir(join(root, 'initial/empty'), { recursive: true })
  const service = new WorkspaceService()
  services.push(service)
  const events: import('../../shared/api').WorkspaceChange[] = []
  service.onChanged((change) => events.push(change))
  await service.open(root)
  await expect.poll(() => events.length).toBeGreaterThan(0)
  expect(service.current()?.directories).toEqual(['initial', 'initial/empty'])
  await mkdir(join(root, 'new.md/nested'), { recursive: true })
  await writeFile(join(root, 'new.md/nested/a.md'), 'Hello')
  await expect
    .poll(() => service.current()?.directories)
    .toEqual(['initial', 'initial/empty', 'new.md', 'new.md/nested'])
  await expect.poll(() => service.current()?.files).toEqual(['new.md/nested/a.md'])
  const { rename } = await import('node:fs/promises')
  await rename(join(root, 'new.md'), join(root, 'renamed'))
  await expect
    .poll(() => service.current()?.directories)
    .toEqual(['initial', 'initial/empty', 'renamed', 'renamed/nested'])
  await expect.poll(() => service.current()?.files).toEqual(['renamed/nested/a.md'])
  await rm(join(root, 'renamed'), { recursive: true })
  await expect.poll(() => service.current()?.directories).toEqual(['initial', 'initial/empty'])
  await expect.poll(() => service.current()?.files).toEqual([])
  await expect
    .poll(() =>
      events.some(
        (change) =>
          change.changedPaths.includes('renamed/nested/a.md') && change.workspace.files.length === 0
      )
    )
    .toBe(true)
  await rm(root, { recursive: true })
  await expect.poll(() => service.current()?.directories).toEqual([])
})
