export const DEFAULT_ACCENT_CHOICE = 'default'
export const DEFAULT_DARK_ACCENT_COLOR = '#C6A24B'
export const DEFAULT_DARK_ACCENT_RGB = '198 162 75'
export const DEFAULT_DARK_ON_ACCENT = '#181818'
export const DEFAULT_LIGHT_ACCENT_COLOR = '#87976B'
export const DEFAULT_LIGHT_ACCENT_RGB = '135 151 107'
export const DEFAULT_LIGHT_ON_ACCENT = '#10150B'
const DEFAULT_ACCENT_COLOR = DEFAULT_DARK_ACCENT_COLOR
export const METIS_PREF_ACCENT_COLOR_KEY = 'metis:prefs:accentColor'
export const LEGACY_PREF_ACCENT_COLOR_KEY = 'pls:prefs:accentColour'

const LEGACY_DEFAULT_ACCENT_COLORS = [DEFAULT_DARK_ACCENT_COLOR, DEFAULT_LIGHT_ACCENT_COLOR] as const

export interface AccentOption {
  label: string
  value: string
  color: string
  rgb: string
  onAccent: string
}

const DEFAULT_ACCENT_OPTION: AccentOption = {
  label: 'Default',
  value: DEFAULT_ACCENT_CHOICE,
  color: DEFAULT_DARK_ACCENT_COLOR,
  rgb: DEFAULT_DARK_ACCENT_RGB,
  onAccent: DEFAULT_DARK_ON_ACCENT,
}

const APP_ACCENT_OPTIONS: Record<string, AccentOption> = {
  '#2F8FB3': { label: 'Sea blue', value: '#2F8FB3', color: '#2F8FB3', rgb: '47 143 179', onAccent: '#FFFFFF' },
  '#7C5CFF': { label: 'Violet', value: '#7C5CFF', color: '#7C5CFF', rgb: '124 92 255', onAccent: '#FFFFFF' },
  '#E46F61': { label: 'Coral', value: '#E46F61', color: '#E46F61', rgb: '228 111 97', onAccent: '#181818' },
  '#179C8E': { label: 'Teal', value: '#179C8E', color: '#179C8E', rgb: '23 156 142', onAccent: '#FFFFFF' },
}

export const ACCENT_OPTIONS: AccentOption[] = [
  DEFAULT_ACCENT_OPTION,
  APP_ACCENT_OPTIONS['#2F8FB3'],
  APP_ACCENT_OPTIONS['#7C5CFF'],
  APP_ACCENT_OPTIONS['#E46F61'],
  APP_ACCENT_OPTIONS['#179C8E'],
]

export const WORKSPACE_ACCENT_FALLBACK_COLORS = ['#2F8FB3', '#7C5CFF', '#E46F61', '#179C8E']

function normalizeHexColor(value?: string | null): string {
  const normalized = value?.trim().toUpperCase() ?? ''
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : ''
}

export function normalizeAccentChoice(raw?: string | null): string {
  const normalized = normalizeHexColor(raw)
  if (
    raw === DEFAULT_ACCENT_CHOICE ||
    !normalized ||
    LEGACY_DEFAULT_ACCENT_COLORS.includes(normalized as typeof LEGACY_DEFAULT_ACCENT_COLORS[number])
  ) {
    return DEFAULT_ACCENT_CHOICE
  }

  return APP_ACCENT_OPTIONS[normalized] ? normalized : DEFAULT_ACCENT_CHOICE
}

export function getAccentOption(choice?: string | null): AccentOption {
  const normalized = normalizeAccentChoice(choice)
  if (normalized === DEFAULT_ACCENT_CHOICE) return DEFAULT_ACCENT_OPTION
  return APP_ACCENT_OPTIONS[normalized] ?? DEFAULT_ACCENT_OPTION
}

export function resolveAccentColor(choice?: string | null): string {
  return getAccentOption(choice).color
}

export function resolveAccentRgb(choice?: string | null): string {
  return getAccentOption(choice).rgb
}

export function resolveAccentOnColor(choice?: string | null): string {
  return getAccentOption(choice).onAccent
}

function readCssAccentColor(): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return ''
  const computed = window.getComputedStyle(document.documentElement).getPropertyValue('--color-accent')
  return normalizeHexColor(computed)
}

export function getActiveAccentColor(): string {
  return readCssAccentColor() || DEFAULT_ACCENT_COLOR
}

export function normalizeWorkspaceAccentColor(color?: string | null): string {
  const normalized = normalizeHexColor(color)
  if (
    !normalized ||
    LEGACY_DEFAULT_ACCENT_COLORS.includes(normalized as typeof LEGACY_DEFAULT_ACCENT_COLORS[number])
  ) {
    return getActiveAccentColor()
  }
  return normalized
}

export function getWorkspaceAccentPalette(colors = WORKSPACE_ACCENT_FALLBACK_COLORS): string[] {
  const activeAccent = getActiveAccentColor()
  const activeKey = activeAccent.toUpperCase()
  const rest = colors
    .map((color) => normalizeHexColor(color))
    .filter((color) => color && color !== activeKey)
  return [activeAccent, ...rest]
}
