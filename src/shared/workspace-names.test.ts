import { expect, test } from 'vitest'
import { normalizeEntryName } from './workspace-names'

test('normalizes Markdown names while directories retain the complete name', () => {
  expect(normalizeEntryName('notes', 'file')).toEqual({ ok: true, value: 'notes.md' })
  expect(normalizeEntryName('Notes.MD', 'file')).toEqual({ ok: true, value: 'Notes.MD' })
  expect(normalizeEntryName('folder.md', 'directory')).toEqual({ ok: true, value: 'folder.md' })
  expect(normalizeEntryName('.hidden', 'file')).toEqual({ ok: true, value: '.hidden.md' })
})
test('rejects unsafe names and non-Markdown extensions', () => {
  for (const name of [
    '',
    '.',
    '..',
    'a/b',
    'a\\b',
    'a.txt',
    '.md',
    'NUL.md',
    'a.',
    'a ',
    'a\0.md',
    '../a',
    '.git'
  ]) {
    expect(normalizeEntryName(name, 'file').ok).toBe(false)
  }
})
