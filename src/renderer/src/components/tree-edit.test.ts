import { expect, test } from 'vitest'
import { creationParent, treeEdit, ancestorPaths } from './tree-edit'

test('creation chooses selected folder, selected file parent or workspace root', () => {
  expect(creationParent({ path: 'Campaign/Notes', kind: 'directory' })).toBe('Campaign/Notes')
  expect(creationParent({ path: 'Campaign/a.md', kind: 'file' })).toBe('Campaign')
  expect(creationParent({ path: 'a.md', kind: 'file' })).toBe('')
  expect(creationParent(null)).toBe('')
  expect(treeEdit('rename', { path: 'Campaign/Folder.md', kind: 'directory' })).toMatchObject({
    parent: 'Campaign',
    initialName: 'Folder.md'
  })
  expect(ancestorPaths('Campaign/Notes/a.md')).toEqual(['Campaign', 'Campaign/Notes'])
})
