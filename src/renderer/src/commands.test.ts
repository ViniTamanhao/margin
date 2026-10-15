import { expect, test, vi } from 'vitest'
import {
  createCommandRegistry,
  commandForKey,
  matchCommands,
  shortcutGroups,
  commandDefinitions
} from './commands'

test('stable lookup, availability and execution share enabled checks', async () => {
  let enabled = false
  const execute = vi.fn()
  const commands = createCommandRegistry([
    { id: 'workspace.open', title: 'Open Folder', isEnabled: () => enabled, execute }
  ])
  expect(commands.get('workspace.open')?.title).toBe('Open Folder')
  expect(commands.get('settings.open')).toBeUndefined()
  expect(commands.available()).toEqual([])
  expect(await commands.execute('workspace.open')).toBe(false)
  expect(execute).not.toHaveBeenCalled()
  enabled = true
  expect(commands.available()).toHaveLength(1)
  expect(await commands.execute('workspace.open')).toBe(true)
  expect(execute).toHaveBeenCalledOnce()
})

const key = (patch: Partial<KeyboardEvent>): KeyboardEvent =>
  ({
    key: 'o',
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    altKey: false,
    isComposing: false,
    ...patch
  }) as KeyboardEvent

test('shortcut dispatch respects modifiers and composition on both platforms', () => {
  expect(commandForKey(key({}))).toBe('workspace.open')
  expect(commandForKey(key({ ctrlKey: false, metaKey: true }))).toBe('workspace.open')
  expect(commandForKey(key({ shiftKey: false }))).toBeUndefined()
  expect(commandForKey(key({ altKey: true }))).toBeUndefined()
  expect(commandForKey(key({ isComposing: true }))).toBeUndefined()
  expect(commandForKey(key({ ctrlKey: false }))).toBeUndefined()
})

test('palette fuzzy-filters enabled command titles with stable ordering', () => {
  const commands = createCommandRegistry([
    { id: 'workspace.open', title: 'Open Folder', isEnabled: () => false, execute: () => {} },
    { id: 'settings.open', title: 'Settings', isEnabled: () => true, execute: () => {} },
    { id: 'workspace.toggle-files', title: 'Files', isEnabled: () => true, execute: () => {} }
  ])
  expect(matchCommands('', commands.available()).map(({ id }) => id)).toEqual([
    'workspace.toggle-files',
    'settings.open'
  ])
  expect(matchCommands('stgs', commands.available()).map(({ id }) => id)).toEqual(['settings.open'])
  expect(matchCommands('zzz', commands.available())).toEqual([])
  expect(commandForKey(key({ key: 'p' }))).toBe('commands.open')
  expect(commandForKey(key({ key: 'p', shiftKey: false }))).toBe('workspace.quick-open')
})

test('Back and Forward use Alt alone without stealing platform modified arrows', () => {
  expect(
    commandForKey(key({ key: 'ArrowLeft', altKey: true, ctrlKey: false, shiftKey: false }))
  ).toBe('navigation.back')
  expect(
    commandForKey(key({ key: 'ArrowRight', altKey: true, ctrlKey: false, shiftKey: false }))
  ).toBe('navigation.forward')
  expect(
    commandForKey(key({ key: 'ArrowLeft', altKey: true, ctrlKey: true, shiftKey: false }))
  ).toBeUndefined()
})

test('tree operations have stable palette IDs and F2/Delete stay out of global dispatch', async () => {
  const execute = vi.fn()
  const commands = createCommandRegistry([
    { id: 'workspace.new-file', title: 'New File', isEnabled: () => true, execute },
    { id: 'workspace.new-folder', title: 'New Folder', isEnabled: () => true, execute },
    { id: 'workspace.rename', title: 'Rename', isEnabled: () => false, execute },
    { id: 'workspace.trash', title: 'Move to Trash', isEnabled: () => false, execute }
  ])
  expect(matchCommands('', commands.available()).map(({ id }) => id)).toEqual([
    'workspace.new-file',
    'workspace.new-folder'
  ])
  expect(await commands.execute('workspace.new-file')).toBe(true)
  expect(await commands.execute('workspace.rename')).toBe(false)
  expect(commandForKey(key({ key: 'F2', ctrlKey: false, shiftKey: false }))).toBeUndefined()
  expect(commandForKey(key({ key: 'Delete', ctrlKey: false, shiftKey: false }))).toBeUndefined()
})

test('tree event targets override an older rendered selection through the same registry', async () => {
  const previous = { path: 'old.md', kind: 'file' as const }
  const focused = { path: 'focused.md', kind: 'file' as const }
  const execute = vi.fn()
  const commands = createCommandRegistry([
    {
      id: 'workspace.rename',
      title: 'Rename',
      isEnabled: (target) => Boolean(target ?? previous),
      execute
    },
    { id: 'workspace.new-file', title: 'New File', isEnabled: () => true, execute }
  ])
  expect(await commands.execute('workspace.rename', focused)).toBe(true)
  expect(execute).toHaveBeenLastCalledWith(focused)
  await commands.execute('workspace.new-file', null)
  expect(execute).toHaveBeenLastCalledWith(null)
})

test('shortcut sheet derives registered shortcuts and omits commands without shortcuts', () => {
  const shortcuts = shortcutGroups().flatMap((group) => group.shortcuts)
  expect(shortcuts).toContainEqual({
    title: 'Quick Open',
    shortcut: commandDefinitions['workspace.quick-open'].shortcut
  })
  expect(shortcuts).toContainEqual({
    title: 'Search Workspace',
    shortcut: commandDefinitions['workspace.search-content'].shortcut
  })
  expect(
    shortcuts.some(({ title }) => title === 'New File' || title === 'Keyboard Shortcuts')
  ).toBe(false)
  expect(commandForKey(key({ key: 'f' }))).toBe('workspace.search-content')
  expect(commandForKey(key({ key: 's', shiftKey: false }))).toBe('editor.save')
})
