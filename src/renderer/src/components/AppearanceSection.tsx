import type { AppearanceSettings } from '../../../shared/appearance'

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
        <legend>Font</legend>
        <label className="setting-row">
          Font family
          <input
            value={draft.fontFamily}
            maxLength={200}
            onChange={(event) => onChange({ ...draft, fontFamily: event.target.value })}
          />
        </label>
      </fieldset>
    </>
  )
}
