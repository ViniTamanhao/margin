import { useLayoutEffect, useRef, useState } from 'react'
import type { TreeEdit } from './tree-edit'

export function InlineTreeName({
  edit,
  onConfirm,
  onCancel
}: {
  edit: TreeEdit
  onConfirm(name: string): Promise<string | null>
  onCancel(): void
}): React.JSX.Element {
  const [name, setName] = useState(edit.initialName)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const label =
    edit.kind === 'rename'
      ? 'Rename item'
      : edit.kind === 'new-file'
        ? 'New file name'
        : 'New folder name'
  useLayoutEffect(() => {
    input.current?.focus()
    const stem =
      edit.kind === 'rename' &&
      edit.target?.kind === 'file' &&
      edit.initialName.toLowerCase().endsWith('.md')
    input.current?.setSelectionRange(0, edit.initialName.length - (stem ? 3 : 0))
  }, [edit])
  return (
    <form
      className="tree-inline-edit"
      onSubmit={(event) => {
        event.preventDefault()
        if (submitting.current) return
        submitting.current = true
        setSaving(true)
        setError('')
        void onConfirm(name)
          .then((message) => {
            if (message) {
              setError(message)
              input.current?.focus()
            }
          })
          .catch(() => {
            setError('Could not change this item. Try again.')
            input.current?.focus()
          })
          .finally(() => {
            submitting.current = false
            setSaving(false)
          })
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          if (!submitting.current) onCancel()
        }
      }}
    >
      <input
        ref={input}
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'tree-name-error' : undefined}
        value={name}
        readOnly={saving}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setName(event.target.value)}
      />
      {error && (
        <span id="tree-name-error" className="tree-inline-error" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}
