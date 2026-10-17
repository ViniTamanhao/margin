import { useCallback, useEffect, useState } from 'react'
import type { WorkspaceSearchResult } from '../../../shared/api'
import { Picker } from './Picker'
import { FilePreview } from './FilePreview'

export function ContentSearch({
  root,
  onOpen,
  onClose
}: {
  root: string
  onOpen(result: WorkspaceSearchResult): void
  onClose(): void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<{
    query: string
    results: WorkspaceSearchResult[]
    error?: string
  } | null>(null)
  useEffect(() => {
    if (!query.trim()) return
    let stale = false
    const requestId = crypto.randomUUID()
    const timer = setTimeout(() => {
      void window.margin.workspace.search({ root, query, requestId, limit: 100 }).then(
        (results) => {
          if (!stale) setResponse({ query, results })
        },
        () => {
          if (!stale) setResponse({ query, results: [], error: 'Search unavailable. Try again.' })
        }
      )
    }, 100)
    return () => {
      stale = true
      clearTimeout(timer)
      void window.margin.workspace
        .cancelSearch(requestId)
        .catch((error: unknown) => console.warn('Could not cancel content search.', error))
    }
  }, [root, query])
  const current = response?.query === query ? response : null
  const getItems = useCallback(
    () =>
      (query.trim() ? (response?.results ?? []) : []).map((result) => ({
        ...result,
        id: `${result.path}:${result.position}`,
        title: result.path.slice(result.path.lastIndexOf('/') + 1),
        subtitle: `${result.path}:${result.line}:${result.column}`,
        excerpt: (
          <>
            {result.preview.slice(0, result.previewMatchStart)}
            <mark>
              {result.preview.slice(
                result.previewMatchStart,
                result.previewMatchStart + result.length
              )}
            </mark>
            {result.preview.slice(result.previewMatchStart + result.length)}
          </>
        )
      })),
    [response, query]
  )
  return (
    <Picker
      label="Search Workspace"
      getItems={getItems}
      onQueryChange={setQuery}
      busy={Boolean(query.trim()) && !current}
      emptyMessage={
        !query.trim()
          ? 'Type to search Markdown contents.'
          : (current?.error ?? (current ? 'No matching text.' : 'Searching…'))
      }
      renderPreview={(item) => (
        <FilePreview
          pending={Boolean(query.trim()) && !current}
          path={item?.path}
          line={item?.line}
          column={item?.column}
          length={item?.length}
        />
      )}
      onSelect={(item) => onOpen(item)}
      onClose={onClose}
    />
  )
}
