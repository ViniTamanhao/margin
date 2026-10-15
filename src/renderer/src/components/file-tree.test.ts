import { expect, test } from 'vitest'
import { buildFileTree, visibleFileTreeRows } from './file-tree'

const tree = buildFileTree({
  directories: ['zebra/nested', 'empty', 'zebra', 'a.md'],
  files: ['zebra/nested/deep.md', 'zebra/note.md', 'root.md', 'a.md/child.md']
})

test('builds folders first with empty folders and file basenames', () => {
  expect(tree.map(({ name, kind }) => [name, kind])).toEqual([
    ['a.md', 'directory'],
    ['empty', 'directory'],
    ['zebra', 'directory'],
    ['root.md', 'file']
  ])
  expect(tree[1].children).toEqual([])
  expect(tree[2].children.map(({ name }) => name)).toEqual(['nested', 'note.md'])
  expect(tree[2].children[0].children[0].path).toBe('zebra/nested/deep.md')
})

test('only expanded folders expose children, with correct tree navigation metadata', () => {
  expect(visibleFileTreeRows(tree, new Set()).map(({ node }) => node.path)).toEqual([
    'a.md',
    'empty',
    'zebra',
    'root.md'
  ])
  const rows = visibleFileTreeRows(tree, new Set(['zebra', 'zebra/nested']))
  expect(rows.map(({ node }) => node.path)).toEqual([
    'a.md',
    'empty',
    'zebra',
    'zebra/nested',
    'zebra/nested/deep.md',
    'zebra/note.md',
    'root.md'
  ])
  expect(rows[4]).toMatchObject({ parent: 'zebra/nested', level: 3, position: 1, siblings: 1 })
  expect(visibleFileTreeRows(tree, new Set(['zebra/nested']))).toHaveLength(4)
})
