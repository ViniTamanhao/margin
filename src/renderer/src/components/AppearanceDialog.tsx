import { useEffect, useRef, useState } from 'react'
import {
  colorKeys,
  parseAppearance,
  themes,
  type AppearanceSettings,
  type ColorKey
} from '../../../shared/appearance'
import { applyAppearance } from '../appearance'
import { Icon } from './Icon'
const colorLabels: Record<ColorKey, string> = {
  bg: 'Background',
  surface: 'Surface',
  text: 'Text',
  'text-muted': 'Muted text',
  border: 'Border',
  accent: 'Accent',
  selection: 'Selection'
}

export function AppearanceDialog({
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
      className="appearance-dialog"
      aria-labelledby="appearance-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!saving) cancel()
      }}
    >
      <div className="settings-heading">
        <h2 id="appearance-title">Appearance</h2>
        <button
          className="icon-button"
          aria-label="Cancel appearance changes"
          title="Cancel (Escape)"
          disabled={saving}
          onClick={cancel}
        >
          <Icon name="close" />
        </button>
      </div>
      <fieldset disabled={saving}>
        <label>
          Theme
          <select
            value={draft.theme}
            onChange={(event) =>
              change({ ...draft, theme: event.target.value === 'light' ? 'light' : 'dark' })
            }
          >
            <option value="dark">Margin Dark</option>
            <option value="light">Margin Light</option>
          </select>
        </label>
        <label>
          Editor font
          <input
            value={draft.fontFamily}
            maxLength={200}
            onChange={(event) => change({ ...draft, fontFamily: event.target.value })}
          />
        </label>
        <label>
          Font size
          <input
            type="number"
            min="12"
            max="32"
            step="1"
            value={draft.fontSize}
            onChange={(event) => change({ ...draft, fontSize: Number(event.target.value) })}
          />
        </label>
        <div className="settings-colors">
          {colorKeys.map((key) => (
            <label key={key}>
              {colorLabels[key]}
              <input
                type="color"
                value={draft.colors[key] ?? themes[draft.theme][key]}
                onChange={(event) =>
                  change({ ...draft, colors: { ...draft.colors, [key]: event.target.value } })
                }
              />
            </label>
          ))}
        </div>
        <p className="settings-hint">Custom colors apply to both themes.</p>
        <button className="text-button" onClick={() => change({ ...draft, colors: {} })}>
          Reset colors to theme
        </button>
      </fieldset>
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
