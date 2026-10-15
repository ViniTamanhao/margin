import { expect, test, vi } from 'vitest'
import { createCommandRegistry, commandForKey, matchCommands } from './commands'

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
