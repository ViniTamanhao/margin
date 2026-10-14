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
      <fieldset disabled={saving} className="settings-group">
        <legend>Theme</legend>
        <div className="theme-options">
          {(['dark', 'light'] as const).map((theme) => (
            <label className="theme-option" key={theme}>
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={draft.theme === theme}
                onChange={() => onChange({ ...draft, theme })}
              />
              <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={saving} className="settings-group">
        <legend>Typography</legend>
        <label className="setting-row">
          Font
          <input
            value={draft.fontFamily}
            maxLength={200}
            onChange={(event) => onChange({ ...draft, fontFamily: event.target.value })}
          />
        </label>
        <label className="setting-row">
          Size
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
            <label className="color-option" key={key}>
              <input
                type="color"
                title={draft.colors[key] ?? themes[draft.theme][key]}
                value={draft.colors[key] ?? themes[draft.theme][key]}
                onChange={(event) =>
                  onChange({ ...draft, colors: { ...draft.colors, [key]: event.target.value } })
                }
              />
              {colorLabels[key]}
            </label>
          ))}
        </div>
        <p className="settings-hint">Custom colors apply to both themes.</p>
        <button className="settings-reset" onClick={() => onChange({ ...draft, colors: {} })}>
          Reset colors to theme
        </button>
      </fieldset>
    </>
  )
}
