import { useCallback } from 'react'
import { Picker } from './Picker'
import { matchCommands, type Command, type CommandId } from '../commands'

export function CommandPalette({
  commands,
  onExecute,
  onClose
}: {
  commands: readonly Command[]
  onExecute(id: CommandId): void
  onClose(): void
}): React.JSX.Element {
  const getItems = useCallback(
    (query: string) =>
      matchCommands(query, commands).map((command) => ({
        id: command.id,
        title: command.title,
        detail: command.shortcut
      })),
    [commands]
  )
  return (
    <Picker
      label="Command Palette"
      emptyMessage="No matching commands."
      getItems={getItems}
      onSelect={(item) => onExecute(item.id)}
      onClose={onClose}
    />
  )
}
