import {
  colorKeys,
  themes,
  type AppearanceSettings,
  type ColorKey
} from '../../../shared/appearance'
const colorLabels: Record<ColorKey, string> = {
  bg: 'Background',
  surface: 'Surface',
  text: 'Text',
  'text-muted': 'Muted text',
  border: 'Border',
  accent: 'Accent',
  selection: 'Selection'
}

export function AppearanceSection({
  draft,
  saving,
  onChange
}: {
  draft: AppearanceSettings
  saving: boolean
  onChange: (settings: AppearanceSettings) => void
}): React.JSX.Element {
  return (
    <>
      <h3 id="settings-section-title">Appearance</h3>
      <fieldset disabled={saving} className="settings-group">
        <legend>Theme</legend>
        <label className="setting-row">
          Theme
          <select
            value={draft.theme}
            onChange={(event) =>
              onChange({ ...draft, theme: event.target.value === 'light' ? 'light' : 'dark' })
            }
          >
            <option value="dark">Margin Dark</option>
            <option value="light">Margin Light</option>
          </select>
        </label>
      </fieldset>
      <fieldset disabled={saving} className="settings-group">
        <legend>Typography</legend>
        <label className="setting-row">
          Editor font
          <input
            value={draft.fontFamily}
            maxLength={200}
            onChange={(event) => onChange({ ...draft, fontFamily: event.target.value })}
          />
        </label>
        <label className="setting-row">
          Font size
          <input
            type="number"
            min="12"
            max="32"
            step="1"
            value={draft.fontSize}
            onChange={(event) => onChange({ ...draft, fontSize: Number(event.target.value) })}
          />
        </label>
      </fieldset>
      <fieldset disabled={saving} className="settings-group">
        <legend>Colors</legend>
        <div className="settings-colors">
          {colorKeys.map((key) => (
            <label key={key}>
              {colorLabels[key]}
              <input
                type="color"
                value={draft.colors[key] ?? themes[draft.theme][key]}
                onChange={(event) =>
                  onChange({ ...draft, colors: { ...draft.colors, [key]: event.target.value } })
                }
              />
            </label>
          ))}
        </div>
        <p className="settings-hint">Custom colors apply to both themes.</p>
        <button className="text-button" onClick={() => onChange({ ...draft, colors: {} })}>
          Reset colors to theme
        </button>
      </fieldset>
    </>
  )
}
