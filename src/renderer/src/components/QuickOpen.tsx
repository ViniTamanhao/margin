import { Picker } from './Picker'
import { matchFiles } from '../navigation/matching'

export function QuickOpen({
  files,
  recents = [],
  onOpen,
  onClose
}: {
  files: readonly string[]
  recents?: readonly string[]
  onOpen(path: string): void
  onClose(): void
}): React.JSX.Element {
  return (
    <Picker
      label="Quick Open"
      emptyMessage="No matching Markdown files."
      getItems={(query) =>
        matchFiles(query, files, recents).map(({ path }) => ({
          id: path,
          path,
          title: path.slice(path.lastIndexOf('/') + 1),
          subtitle: path
        }))
      }
      onSelect={(item) => onOpen(item.path)}
      onClose={onClose}
    />
  )
}
