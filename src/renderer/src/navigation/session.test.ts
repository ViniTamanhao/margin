import { expect, test } from 'vitest'
import { NavigationSession } from './session'
const a = { path: 'a.md', position: 12 }
const b = { path: 'b.md', position: 30 }
const heading = { path: 'b.md', position: 80 }

test('Back/Forward restores document and position, including same-document jumps', () => {
  const session = new NavigationSession()
  session.record(null, a)
  session.record(a, b)
  session.record(b, heading)
  expect(session.target('back')).toEqual(b)
  session.travel('back', heading)
  expect(session.target('back')).toEqual(a)
  expect(session.target('forward')).toEqual(heading)
  session.travel('back', b)
  expect(session.target('back')).toBeUndefined()
  expect(session.target('forward')).toEqual(b)
  session.travel('forward', a)
  expect(session.target('back')).toEqual(a)
  expect(session.target('forward')).toEqual(heading)
})
test('duplicates are suppressed and new navigation clears Forward', () => {
  const session = new NavigationSession()
  session.record(null, a)
  session.record(a, a)
  expect(session.target('back')).toBeUndefined()
  session.record(a, b)
  session.record(b, b)
  session.travel('back', b)
  session.record(a, a)
  expect(session.target('forward')).toEqual(b)
  session.record(a, { path: 'c.md', position: 0 })
  expect(session.target('forward')).toBeUndefined()
  session.travel('back', { path: 'c.md', position: 0 })
  expect(session.target('back')).toBeUndefined()
})
test('recents are unique, reordered on revisit, bounded and cleared with history', () => {
  const session = new NavigationSession()
  for (let i = 0; i < 60; i++) session.record(null, { path: `${i}.md`, position: 0 })
  expect(session.recents).toHaveLength(50)
  session.record(null, { path: '20.md', position: 3 })
  expect(session.recents.slice(0, 3)).toEqual(['20.md', '59.md', '58.md'])
  expect(session.recents.filter((path) => path === '20.md')).toHaveLength(1)
  session.reset()
  expect(session.recents).toEqual([])
  expect(session.target('back')).toBeUndefined()
})

test('file and folder rename remap recents and both history directions, Trash removes descendants', () => {
  const session = new NavigationSession()
  const nested = { path: 'folder/nested/b.md', position: 9 }
  const file = { path: 'folder/a.md', position: 3 }
  session.record(null, file)
  session.record(file, nested)
  session.record(nested, { path: 'outside.md', position: 0 })
  session.travel('back', { path: 'outside.md', position: 4 })
  session.remap('folder/a.md', 'folder/renamed.md')
  expect(session.target('back')).toEqual({ path: 'folder/renamed.md', position: 3 })
  session.remap('folder', 'world')
  expect(session.target('back')).toEqual({ path: 'world/renamed.md', position: 3 })
  expect(session.recents).toContain('world/nested/b.md')
  session.travel('back', { path: 'world/nested/b.md', position: 9 })
  expect(session.target('forward')).toEqual({ path: 'world/nested/b.md', position: 9 })
  session.remove('world')
  expect(session.recents).toEqual(['outside.md'])
  expect(session.target('back')).toBeUndefined()
  expect(session.target('forward')).toEqual({ path: 'outside.md', position: 4 })
})
