import type { WorkspaceEntry } from '../../shared/api'
import { fuzzyScore, comparePaths } from './navigation/matching'

interface CommandDefinition {
  title: string
  shortcut?: string
  key?: string
  shift?: boolean
  alt?: boolean
}
export const commandDefinitions = {
  'workspace.new-file': { title: 'New File' },
  'workspace.new-folder': { title: 'New Folder' },
  'workspace.rename': { title: 'Rename' },
  'workspace.trash': { title: 'Move to Trash' },
  'editor.go-to-heading': { title: 'Go to Heading' },
  'navigation.back': {
    title: 'Go Back',
    shortcut: 'Alt+Left',
    key: 'arrowleft',
    alt: true,
    shift: false
  },
  'navigation.forward': {
    title: 'Go Forward',
    shortcut: 'Alt+Right',
    key: 'arrowright',
    alt: true,
    shift: false
  },
  'commands.open': {
    title: 'Command Palette',
    shortcut: 'Ctrl/Cmd+Shift+P',
    key: 'p',
    shift: true
  },
  'workspace.quick-open': { title: 'Quick Open', shortcut: 'Ctrl/Cmd+P', key: 'p', shift: false },
  'workspace.open': { title: 'Open Folder', shortcut: 'Ctrl/Cmd+Shift+O', key: 'o', shift: true },
  'workspace.toggle-files': { title: 'Files', shortcut: 'Ctrl/Cmd+B', key: 'b', shift: false },
  'settings.open': { title: 'Settings', shortcut: 'Ctrl/Cmd+,', key: ',', shift: false }
} as const satisfies Record<string, CommandDefinition>
export type CommandId = keyof typeof commandDefinitions
export type FileTreeCommandId =
  'workspace.new-file' | 'workspace.new-folder' | 'workspace.rename' | 'workspace.trash'

export interface Command {
  id: CommandId
  title: string
  shortcut?: string
  isEnabled(target?: WorkspaceEntry | null): boolean
  execute(target?: WorkspaceEntry | null): void | Promise<void>
}

// Explicit application actions; shortcuts, controls and palettes share this boundary.
export function createCommandRegistry(commands: readonly Command[]): {
  get(id: CommandId): Command | undefined
  available(): Command[]
  execute(id: CommandId, target?: WorkspaceEntry | null): Promise<boolean>
} {
  return {
    get: (id) => commands.find((command) => command.id === id),
    available: () => commands.filter((command) => command.isEnabled()),
    async execute(id, target) {
      const command = commands.find((command) => command.id === id)
      if (!command?.isEnabled(target)) return false
      await command.execute(target)
      return true
    }
  }
}

export function commandForKey(event: KeyboardEvent): CommandId | undefined {
  if (event.isComposing) return undefined
  return (Object.keys(commandDefinitions) as CommandId[]).find((id) => {
    const command: CommandDefinition = commandDefinitions[id]
    const modifiers = command.alt
      ? event.altKey && !event.metaKey && !event.ctrlKey
      : (event.metaKey || event.ctrlKey) && !event.altKey
    return (
      modifiers &&
      command.key === event.key.toLowerCase() &&
      event.shiftKey === Boolean(command.shift)
    )
  })
}
export function commandTooltip(id: CommandId): string {
  const command: CommandDefinition = commandDefinitions[id]
  return command.shortcut ? `${command.title} (${command.shortcut})` : command.title
}

export function matchCommands(query: string, commands: readonly Command[]): Command[] {
  return commands
    .filter((command) => command.id !== 'commands.open' && command.isEnabled())
    .flatMap((command) => {
      const score = fuzzyScore(query, command.title)
      return score === null ? [] : [{ command, score }]
    })
    .sort((a, b) => b.score - a.score || comparePaths(a.command.title, b.command.title))
    .map(({ command }) => command)
}
