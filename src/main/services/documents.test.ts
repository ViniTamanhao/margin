import { afterEach, expect, test } from 'vitest'
import { mkdtemp, writeFile, readFile, rm, readdir, chmod, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceService } from './workspace'
import { DocumentService } from './documents'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
async function fixture(): Promise<{ root: string; documents: DocumentService }> {
  const root = await mkdtemp(join(tmpdir(), 'margin-save-'))
  const service = new WorkspaceService()
  await writeFile(join(root, 'a.md'), '# Original\r\n')
  await service.open(root)
  cleanups.push(async () => {
    await service.close()
    await rm(root, { recursive: true, force: true })
  })
  return { root, documents: new DocumentService(service, join(root, 'recovery')) }
}
test('saves exact UTF-8 contents, preserves permissions and retains recovery versions', async () => {
  const { root, documents } = await fixture()
  await chmod(join(root, 'a.md'), 0o640)
  const original = await documents.read('a.md')
  const result = await documents.save({
    path: 'a.md',
    revision: original.revision,
    content: '# Café\r\n'
  })
  expect(result.kind).toBe('saved')
  expect(await readFile(join(root, 'a.md'), 'utf8')).toBe('# Café\r\n')
  expect((await stat(join(root, 'a.md'))).mode & 0o777).toBe(0o640)
  const versions = await readdir(join(root, 'recovery', (await readdir(join(root, 'recovery')))[0]))
  expect(versions.filter((name) => name.endsWith('.md'))).toHaveLength(2)
  expect((await readdir(root)).some((name) => name.endsWith('.tmp'))).toBe(false)
})
test('refuses stale saves and never recreates an externally deleted document', async () => {
  const { root, documents } = await fixture()
  const original = await documents.read('a.md')
  await writeFile(join(root, 'a.md'), 'External')
  const result = await documents.save({ ...original, content: 'Local' })
  expect(result.kind).toBe('conflict')
  expect(await readFile(join(root, 'a.md'), 'utf8')).toBe('External')
  await rm(join(root, 'a.md'))
  expect(await documents.save({ ...original, content: 'Local' })).toEqual({ kind: 'missing' })
})
test('serializes competing saves so an older revision cannot replace a newer save', async () => {
  const { root, documents } = await fixture()
  const original = await documents.read('a.md')
  const results = await Promise.all([
    documents.save({ ...original, content: 'First' }),
    documents.save({ ...original, content: 'Second' })
  ])
  expect(results.map((result) => result.kind)).toEqual(['saved', 'conflict'])
  expect(await readFile(join(root, 'a.md'), 'utf8')).toBe('First')
})
test('rejects non-UTF-8 files instead of replacing invalid bytes', async () => {
  const { root, documents } = await fixture()
  await writeFile(join(root, 'a.md'), Buffer.from([0xff, 0xfe]))
  await expect(documents.read('a.md')).rejects.toThrow('UTF-8')
})
