import { useEffect, useRef, useState } from 'react'
import { parseAppearance, type AppearanceSettings } from '../../../shared/appearance'
import { AppearanceSection } from './AppearanceSection'
import { applyAppearance } from '../appearance'
import { Icon } from './Icon'
const settingsSections = [{ id: 'appearance', title: 'Appearance' }] as const
type SettingsSectionId = (typeof settingsSections)[number]['id']

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
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('appearance')
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
      setError('Use a font family name and a font size from 12 to 32.')
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
        <nav className="settings-navigation" aria-label="Settings sections">
          {settingsSections.map((section) => (
            <button
              key={section.id}
              disabled={saving}
              aria-current={activeSection === section.id ? 'page' : undefined}
              onClick={() => setActiveSection(section.id)}
            >
              {section.title}
            </button>
          ))}
        </nav>
        <section className="settings-content" aria-labelledby="settings-section-title">
          {activeSection === 'appearance' && (
            <AppearanceSection draft={draft} saving={saving} onChange={change} />
          )}
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
        <button className="text-button" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Done'}
        </button>
      </div>
    </dialog>
  )
}
