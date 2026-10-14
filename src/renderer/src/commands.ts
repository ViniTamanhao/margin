// Shared by shell controls and shortcuts; this is deliberately just the current
// actions, without a palette or a command registry service.
export const shellCommands = {
  'workspace.open': { title: 'Open Folder', shortcut: 'Ctrl/Cmd+Shift+O', key: 'o', shift: true },
  'workspace.toggle-files': { title: 'Files', shortcut: 'Ctrl/Cmd+B', key: 'b', shift: false },
  'appearance.open': { title: 'Appearance', shortcut: 'Ctrl/Cmd+,', key: ',', shift: false }
} as const
export type ShellCommandId = keyof typeof shellCommands
export function shellCommandForKey(event: KeyboardEvent): ShellCommandId | undefined {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing) return undefined
  return (Object.keys(shellCommands) as ShellCommandId[]).find((id) => {
    const command = shellCommands[id]
    return event.key.toLowerCase() === command.key && event.shiftKey === command.shift
  })
}
export function commandTooltip(id: ShellCommandId): string {
  return `${shellCommands[id].title} (${shellCommands[id].shortcut})`
}
