import { afterEach, expect, test } from 'vitest'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceService } from './workspace'
import { DocumentService } from './documents'

const directories: string[] = []
afterEach(async () => {
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
  await writeFile(join(root, 'UPPER.MD'), 'Uppercase')
  await writeFile(join(root, 'plain.txt'), 'Ignore')
  await symlink(join(root, 'notes'), join(root, 'link'))
  const service = new WorkspaceService()
  expect((await service.open(root)).files).toEqual(['UPPER.MD', 'notes/a.md'])
  expect((await new DocumentService(service).read('notes/a.md')).content).toBe('# Hello')
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
  await service.open(root)
  await symlink(outside, join(root, 'escape'))
  await expect(service.resolveDocument('escape/a.md')).rejects.toThrow('Symbolic')
})
