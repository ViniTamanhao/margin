import type { EditorPresentation } from '../editor/controller'

const labels = {
  idle: '',
  saved: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Could not save',
  conflict: 'Save conflict',
  missing: 'File unavailable'
} as const

export function SaveIndicator({
  status
}: {
  status: EditorPresentation['status']
}): React.JSX.Element {
  const label = labels[status]
  return (
    <span
      className="document-status"
      role="status"
      aria-label={label || undefined}
      title={label || undefined}
      data-status={status}
    >
      {status === 'idle'
        ? ''
        : status === 'saved'
          ? 'saved'
          : status === 'saving'
            ? 'saving...'
            : 'not saved'}
    </span>
  )
}
