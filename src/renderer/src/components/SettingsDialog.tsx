import { useEffect, useRef, useState } from 'react'
import { parseAppearance, type AppearanceSettings } from '../../../shared/appearance'
import { AppearanceSection } from './AppearanceSection'
import { applyAppearance } from '../appearance'
import { Icon } from './Icon'
export function SettingsDialog({
  settings,
  onSaved,
  onClose
}: {
  settings: AppearanceSettings
  onSaved: (settings: AppearanceSettings) => void
  onClose: () => void
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    restoreFocus.current ??= document.activeElement as HTMLElement | null
    const element = dialog.current
    element?.showModal()
    return () => {
      element?.close()
      restoreFocus.current?.focus()
    }
  }, [settings])
  function change(next: AppearanceSettings): void {
    setDraft(next)
    if (parseAppearance(next)) applyAppearance(next)
  }
  function cancel(): void {
    applyAppearance(settings)
    onClose()
  }
  async function save(): Promise<void> {
    if (!parseAppearance(draft)) {
      setError('Use a valid font family, editor size (12–32 px), and interface size (11–20 px).')
      return
    }
    setSaving(true)
    setError('')
    try {
      await window.margin.appearance.save(draft)
      onSaved(draft)
      onClose()
    } catch {
      setError('Could not save appearance settings. Try again.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!saving) cancel()
      }}
    >
      <div className="settings-heading">
        <h2 id="settings-title">Settings</h2>
        <button
          className="icon-button"
          aria-label="Cancel Settings changes"
          title="Cancel (Escape)"
          disabled={saving}
          onClick={cancel}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="settings-body">
        <section className="settings-content" aria-label="Appearance">
          <AppearanceSection draft={draft} saving={saving} onChange={change} />
        </section>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="settings-footer">
        <button className="text-button" disabled={saving} onClick={cancel}>
          Cancel
        </button>
        <button
          className="text-button text-button-primary"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Done'}
        </button>
      </div>
    </dialog>
  )
}
