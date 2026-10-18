import type { EditorPresentation } from '../editor/controller'
import { Icon } from './Icon'

const labels = {
  idle: '',
  saved: '',
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
      {label &&
        (status === 'dirty' ? (
          <span className="save-dot" aria-hidden="true" />
        ) : status === 'saving' ? (
          <span className="save-spinner" aria-hidden="true" />
        ) : (
          <Icon name="warning" />
        ))}
    </span>
  )
}
