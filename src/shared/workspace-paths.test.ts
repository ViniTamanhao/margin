import { expect, test } from 'vitest'
import { isWithinPath, remapPath, parentPath } from './workspace-paths'

test('remaps exact files and folder descendants at path boundaries only', () => {
  expect(remapPath('a.md', 'a.md', 'b.md')).toBe('b.md')
  expect(remapPath('folder/a.md', 'folder', 'renamed')).toBe('renamed/a.md')
  expect(remapPath('folder/nested/b.md', 'folder', 'renamed')).toBe('renamed/nested/b.md')
  expect(remapPath('folder-other/a.md', 'folder', 'renamed')).toBe('folder-other/a.md')
  expect(isWithinPath('folder.md', 'folder')).toBe(false)
  expect(parentPath('a.md')).toBe('')
  expect(parentPath('folder/a.md')).toBe('folder')
})
