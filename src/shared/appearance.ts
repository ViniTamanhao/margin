export type ThemeName = 'dark' | 'light'
export interface AppearanceSettings {
  theme: ThemeName
  fontFamily: string
  editorFontSize: number
  uiFontSize: number
}
export interface PersistedAppearanceSettings {
  version: 1
  appearance: AppearanceSettings
}
export const fontSizeLimits = {
  editorFontSize: { min: 12, max: 32 },
  uiFontSize: { min: 11, max: 20 }
} as const

export const defaultAppearance: AppearanceSettings = {
  theme: 'dark',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  editorFontSize: 18,
  uiFontSize: 13
}
export const themes = {
  dark: {
    bg: '#1e1e1e',
    surface: '#262626',
    text: '#e2e2e2',
    'text-muted': '#a0a0a0',
    border: '#404040',
    accent: '#bcbcbc',
    selection: '#424242',
    error: '#eea49c'
  },
  light: {
    bg: '#fafafa',
    surface: '#f0f0f0',
    text: '#272727',
    'text-muted': '#666666',
    border: '#d6d6d6',
    accent: '#555555',
    selection: '#dedede',
    error: '#a13e35'
  }
} satisfies Record<ThemeName, Record<string, string>>

export function parseAppearance(input: unknown): AppearanceSettings | null {
  if (typeof input !== 'object' || input === null) return null
  const value = input as Partial<AppearanceSettings>
  if (
    (value.theme !== 'dark' && value.theme !== 'light') ||
    typeof value.fontFamily !== 'string' ||
    value.fontFamily.trim().length < 1 ||
    value.fontFamily.length > 200 ||
    !/^[a-zA-Z0-9 ,"'-]+$/.test(value.fontFamily)
  )
    return null
  const editorFontSize =
    value.editorFontSize === undefined ? defaultAppearance.editorFontSize : value.editorFontSize
  const uiFontSize =
    value.uiFontSize === undefined ? defaultAppearance.uiFontSize : value.uiFontSize
  for (const key of ['editorFontSize', 'uiFontSize'] as const) {
    const size = key === 'editorFontSize' ? editorFontSize : uiFontSize
    if (!Number.isInteger(size) || size < fontSizeLimits[key].min || size > fontSizeLimits[key].max)
      return null
  }
  return {
    theme: value.theme,
    fontFamily: value.fontFamily,
    editorFontSize,
    uiFontSize
  }
}
