import { fontSizeLimits, type AppearanceSettings } from '../../../shared/appearance'

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
          Editor font family
          <input
            value={draft.fontFamily}
            maxLength={200}
            onChange={(event) => onChange({ ...draft, fontFamily: event.target.value })}
          />
        </label>
        <div className="setting-sizes">
          {(['editorFontSize', 'uiFontSize'] as const).map((key) => (
            <label className="setting-row" key={key}>
              {key === 'editorFontSize' ? 'Editor size (px)' : 'Interface size (px)'}
              <input
                type="number"
                name={key}
                min={fontSizeLimits[key].min}
                max={fontSizeLimits[key].max}
                step={1}
                value={Number.isNaN(draft[key]) ? '' : draft[key]}
                onChange={(event) => onChange({ ...draft, [key]: event.target.valueAsNumber })}
              />
            </label>
          ))}
        </div>
      </fieldset>
    </>
  )
}
