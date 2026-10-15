import { fuzzyScore, comparePaths } from './navigation/matching'

export const commandDefinitions = {
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
} as const
export type CommandId = keyof typeof commandDefinitions

export interface Command {
  id: CommandId
  title: string
  shortcut?: string
  isEnabled(): boolean
  execute(): void | Promise<void>
}

// Explicit application actions; shortcuts, controls and palettes share this boundary.
export function createCommandRegistry(commands: readonly Command[]): {
  get(id: CommandId): Command | undefined
  available(): Command[]
  execute(id: CommandId): Promise<boolean>
} {
  return {
    get: (id) => commands.find((command) => command.id === id),
    available: () => commands.filter((command) => command.isEnabled()),
    async execute(id) {
      const command = commands.find((command) => command.id === id)
      if (!command?.isEnabled()) return false
      await command.execute()
      return true
    }
  }
}

export function commandForKey(event: KeyboardEvent): CommandId | undefined {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing) return undefined
  return (Object.keys(commandDefinitions) as CommandId[]).find((id) => {
    const command = commandDefinitions[id]
    return event.key.toLowerCase() === command.key && event.shiftKey === command.shift
  })
}
export function commandTooltip(id: CommandId): string {
  return `${commandDefinitions[id].title} (${commandDefinitions[id].shortcut})`
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
