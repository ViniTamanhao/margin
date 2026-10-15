import { useCallback } from 'react'
import { FilePreview } from './FilePreview'
import { Picker } from './Picker'
import { matchFiles } from '../navigation/matching'

const noRecents: readonly string[] = []

export function QuickOpen({
  files,
  recents = noRecents,
  onOpen,
  onClose
}: {
  files: readonly string[]
  recents?: readonly string[]
  onOpen(path: string): void
  onClose(): void
}): React.JSX.Element {
  const getItems = useCallback(
    (query: string) =>
      matchFiles(query, files, recents).map(({ path }) => ({
        id: path,
        path,
        title: path.slice(path.lastIndexOf('/') + 1),
        subtitle: path
      })),
    [files, recents]
  )
  return (
    <Picker
      label="Quick Open"
      renderPreview={(item) => <FilePreview path={item?.path} />}
      emptyMessage="No matching Markdown files."
      getItems={getItems}
      onSelect={(item) => onOpen(item.path)}
      onClose={onClose}
    />
  )
}
