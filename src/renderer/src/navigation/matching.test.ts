import { expect, test } from 'vitest'
import { fuzzyScore, matchFiles } from './matching'

const files = ['Notes/Dragons.md', 'Campaign/Dragonfire Mechanics.md', 'Dragon.md', 'Other.md']
test('fuzzy filename initials and relative paths match without case sensitivity', () => {
  expect(matchFiles('dfm', files).map(({ path }) => path)).toEqual([
    'Campaign/Dragonfire Mechanics.md'
  ])
  expect(matchFiles('campaign/dfm', files).map(({ path }) => path)).toEqual([
    'Campaign/Dragonfire Mechanics.md'
  ])
  expect(matchFiles('DRAGON', files)).toHaveLength(3)
})
test('ranking favors filename prefixes and contiguous matches, and is deterministic', () => {
  expect(matchFiles('dragon', files)[0].path).toBe('Dragon.md')
  expect(matchFiles('dragon', files)).toEqual(matchFiles('dragon', [...files].reverse()))
  expect(fuzzyScore('arm', 'Armor')!).toBeGreaterThan(fuzzyScore('arm', 'A room')!)
})
test('empty queries prefer recent known files then stable paths; missing recents are ignored', () => {
  expect(
    matchFiles('  ', files, ['missing.md', 'Other.md', 'Notes/Dragons.md']).map(({ path }) => path)
  ).toEqual(['Other.md', 'Notes/Dragons.md', 'Campaign/Dragonfire Mechanics.md', 'Dragon.md'])
})
test('no match and empty workspaces produce no results', () => {
  expect(matchFiles('zzz', files)).toEqual([])
  expect(matchFiles('', [])).toEqual([])
})
