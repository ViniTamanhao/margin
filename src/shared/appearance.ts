export const colorKeys = [
  'bg',
  'surface',
  'text',
  'text-muted',
  'border',
  'accent',
  'selection'
] as const
export type ColorKey = (typeof colorKeys)[number]
export type ThemeName = 'dark' | 'light'
export interface AppearanceSettings {
  theme: ThemeName
  fontFamily: string
  fontSize: number
  colors: Partial<Record<ColorKey, string>>
}
export interface PersistedAppearanceSettings {
  version: 1
  appearance: AppearanceSettings
}
export const defaultAppearance: AppearanceSettings = {
  theme: 'dark',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 18,
  colors: {}
}
export const themes: Record<ThemeName, Record<ColorKey | 'error', string>> = {
  dark: {
    bg: '#1c1e20',
    surface: '#242729',
    text: '#e0e2df',
    'text-muted': '#9ca39e',
    border: '#3b4140',
    accent: '#a0c4ac',
    selection: '#364c40',
    error: '#eea49c'
  },
  light: {
    bg: '#faf9f6',
    surface: '#f0f0eb',
    text: '#272923',
    'text-muted': '#65695f',
    border: '#d6d9d0',
    accent: '#466651',
    selection: '#dce7dc',
    error: '#a13e35'
  }
}

export function parseAppearance(input: unknown): AppearanceSettings | null {
  if (typeof input !== 'object' || input === null) return null
  const value = input as Partial<AppearanceSettings>
  if (
    (value.theme !== 'dark' && value.theme !== 'light') ||
    typeof value.fontFamily !== 'string' ||
    value.fontFamily.length < 1 ||
    value.fontFamily.length > 200 ||
    !/^[a-zA-Z0-9 ,"'-]+$/.test(value.fontFamily) ||
    typeof value.fontSize !== 'number' ||
    !Number.isInteger(value.fontSize) ||
    value.fontSize < 12 ||
    value.fontSize > 32 ||
    typeof value.colors !== 'object' ||
    value.colors === null ||
    Array.isArray(value.colors)
  )
    return null
  const colors: AppearanceSettings['colors'] = {}
  for (const [key, color] of Object.entries(value.colors)) {
    if (
      !colorKeys.includes(key as ColorKey) ||
      typeof color !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(color)
    )
      return null
    colors[key as ColorKey] = color
  }
  return { theme: value.theme, fontFamily: value.fontFamily, fontSize: value.fontSize, colors }
}
