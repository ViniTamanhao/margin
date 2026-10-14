import { themes, type AppearanceSettings } from '../../shared/appearance'
export function applyAppearance(settings: AppearanceSettings): void {
  const root = document.documentElement
  root.style.colorScheme = settings.theme
  for (const [key, color] of Object.entries({ ...themes[settings.theme], ...settings.colors }))
    root.style.setProperty(`--margin-${key}`, color)
  root.style.setProperty('--editor-font-family', settings.fontFamily)
  root.style.setProperty('--editor-font-size', `${settings.fontSize}px`)
}
