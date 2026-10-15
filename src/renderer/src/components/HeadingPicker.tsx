import { useEffect, useState } from 'react'
import type { EditorController } from '../editor/controller'
import { matchHeadings, type HeadingSnapshot } from '../editor/headings'
import { Picker } from './Picker'

export function HeadingPicker({
  controller,
  onClose
}: {
  controller: EditorController
  onClose(): void
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<HeadingSnapshot | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const abort = new AbortController()
    void controller
      .headings(abort.signal)
      .then((result) => {
        if (abort.signal.aborted) return
        if (result) setSnapshot(result)
        else setError('Document changed. Reopen Go to Heading.')
      })
      .catch(() => {
        if (!abort.signal.aborted) setError('Could not read headings. Reopen Go to Heading.')
      })
    return () => abort.abort()
  }, [controller])
  return (
    <Picker
      label="Go to Heading"
      busy={!snapshot && !error}
      emptyMessage={error || (snapshot ? 'No matching headings.' : 'Loading headings…')}
      getItems={(query) =>
        matchHeadings(query, snapshot?.headings ?? []).map((heading) => ({
          ...heading,
          id: String(heading.position),
          detail: `H${heading.level}`
        }))
      }
      onSelect={(heading) => {
        if (snapshot) controller.jumpToHeading(snapshot.version, heading.position)
      }}
      onClose={onClose}
    />
  )
}
