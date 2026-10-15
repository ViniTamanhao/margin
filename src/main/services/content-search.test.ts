import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { WorkspaceService } from './workspace'
import { ContentSearchService } from './content-search'

test('literal search returns bounded ordered Markdown locations, excluding ignored and symlink paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'margin-search-'))
  const workspace = new WorkspaceService()
  try {
    await mkdir(join(root, '.git'))
    await mkdir(join(root, 'nested'))
    await writeFile(join(root, 'a.md'), '# Title\r\narmor armor\r\nArmor\r\n[$(echo)]')
    await writeFile(join(root, 'nested/b.MD'), 'armor')
    await writeFile(join(root, 'other.txt'), 'armor')
    await writeFile(join(root, '.git/ignored.md'), 'armor')
    await symlink(join(root, 'a.md'), join(root, 'link.md'))
    await symlink(join(root, 'nested'), join(root, 'linked'))
    await workspace.open(root)
    const service = new ContentSearchService(workspace)
    const search = (query: string, limit = 100, signal = new AbortController().signal) =>
      service.search({ root, query, limit, requestId: 'test' }, signal)
    const results = await search('armor')
    expect(results.map(({ path, line, column }) => [path, line, column])).toEqual([
      ['a.md', 2, 1],
      ['a.md', 2, 7],
      ['a.md', 3, 1],
      ['nested/b.MD', 1, 1]
    ])
    expect(results[0].position).toBe(8)
    expect(await search('Armor')).toHaveLength(1)
    expect(await search('[$(echo)]')).toHaveLength(1)
    expect(await search('armor', 2)).toHaveLength(2)
    expect(await search('   ')).toEqual([])
    const abort = new AbortController()
    abort.abort()
    expect(await search('armor', 100, abort.signal)).toEqual([])
    await writeFile(join(root, 'a.md'), 'armor\n'.repeat(20000))
    const pending = search('not present', 100, abortSignal())
    function abortSignal(): AbortSignal {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 1)
      return controller.signal
    }
    expect(await pending).toEqual([])
    expect(await search('Armor')).toEqual([])
  } finally {
    await workspace.close()
    await rm(root, { recursive: true, force: true })
  }
})
