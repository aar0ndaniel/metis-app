import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  X,
  SlidersHorizontal,
  Palette,
  FloppyDisk,
  ChartBar,
  Export,
  DownloadSimple,
  CaretDown,
  Check,
  ArrowCounterClockwise,
  RocketLaunch,
  Notebook,
  Info,
  ArrowsClockwise,
  GearSix,
  Pulse,
  Sun,
  Moon,
  SunHorizon,
  Lock as LockIcon,
  Plus,
  Minus,
  ArrowSquareOut,
  FolderOpen,
} from '@phosphor-icons/react'
import { APP_BASE_RELEASE_LABEL, APP_BRAND_NAME, APP_EDITION } from '../config/appBranding'
import { translateUiText } from '../i18n/uiLanguage'
import {
  ACCENT_OPTIONS,
  DEFAULT_DARK_ACCENT_COLOR,
  DEFAULT_DARK_ACCENT_RGB,
  DEFAULT_DARK_ON_ACCENT,
  DEFAULT_ACCENT_CHOICE,
  DEFAULT_LIGHT_ACCENT_COLOR,
  DEFAULT_LIGHT_ACCENT_RGB,
  DEFAULT_LIGHT_ON_ACCENT,
  LEGACY_PREF_ACCENT_COLOR_KEY,
  METIS_PREF_ACCENT_COLOR_KEY,
  normalizeAccentChoice,
  resolveAccentColor,
  resolveAccentOnColor,
  resolveAccentRgb,
} from '../utils/themeAccent'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void
  initialTab?: 'general' | 'appearance' | 'autosave' | 'algorithm' | 'export' | 'updates'
}

const METIS_PREF_THEME_KEY = 'metis:prefs:theme'
const LEGACY_PREF_THEME_KEY = 'pls:prefs:theme'
const METIS_PREF_LANGUAGE_KEY = 'metis:prefs:language'
const LEGACY_PREF_LANGUAGE_KEY = 'pls:prefs:language'
const METIS_PREF_FONT_SCALE_KEY = 'metis:prefs:fontScale'
const METIS_PREF_INTERFACE_CONTRAST_KEY = 'metis:prefs:interfaceContrast'
const LEGACY_PREF_INTERFACE_CONTRAST_KEY = 'pls:prefs:interfaceContrast'
const DEFAULT_INTERFACE_CONTRAST = 75
const MIN_READABLE_INTERFACE_CONTRAST = 75
const METIS_UPDATES_URL = 'https://metis.emend.it.com/updates.html'
const METIS_DOCS_URL = 'https://metis.emend.it.com/docs.html'
const GENERAL_PREVIEW_WIDTH = 2040
const GENERAL_PREVIEW_HEIGHT = 1026
const LANGUAGE_OPTIONS = ['English', 'Español', 'Português', 'Français'] as const
const FONT_SIZE_OPTIONS = ['Small', 'Default', 'Large', 'Extra Large'] as const
type LanguagePreference = typeof LANGUAGE_OPTIONS[number]
type FontSizeOption = typeof FONT_SIZE_OPTIONS[number]
type ThemePreference = 'Dark' | 'Light' | 'Auto'

function getSavedSetting<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(`pls:prefs:${key}`)
    if (raw !== null) {
      if (typeof defaultVal === 'number') return Number(raw) as T
      if (typeof defaultVal === 'boolean') return (raw === 'true') as T
      return raw as T
    }
  } catch (e) {}
  return defaultVal
}

function normalizeLanguagePreference(value: unknown): LanguagePreference {
  const language = String(value ?? '').trim().toLowerCase()
  if (language === 'español' || language === 'spanish' || language.startsWith('es')) return 'Español'
  if (language === 'português' || language === 'portuguese' || language.startsWith('pt')) return 'Português'
  if (language === 'français' || language === 'french' || language.startsWith('fr')) return 'Français'
  return 'English'
}

function getSavedLanguageSetting(): LanguagePreference {
  try {
    const raw = localStorage.getItem(METIS_PREF_LANGUAGE_KEY) ?? localStorage.getItem(LEGACY_PREF_LANGUAGE_KEY)
    return normalizeLanguagePreference(raw)
  } catch {
    return 'English'
  }
}

function normalizeThemePreference(raw: string | null): ThemePreference {
  if (raw === 'Auto' || raw === 'auto') return 'Auto'
  if (raw === 'Light' || raw === 'light') return 'Light'
  return 'Dark'
}

function getSystemThemeSetting(): 'Dark' | 'Light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'Dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'Light' : 'Dark'
}

function resolveThemePreference(preference: ThemePreference): 'Dark' | 'Light' {
  return preference === 'Auto' ? getSystemThemeSetting() : preference
}

function getSavedThemePreferenceSetting(): ThemePreference {
  try {
    const raw = localStorage.getItem(METIS_PREF_THEME_KEY) ?? localStorage.getItem(LEGACY_PREF_THEME_KEY)
    return normalizeThemePreference(raw)
  } catch {
    return 'Dark'
  }
}

function getSavedThemeSetting(): 'Dark' | 'Light' {
  return resolveThemePreference(getSavedThemePreferenceSetting())
}

function getSavedFontScaleSetting(): FontSizeOption {
  try {
    const raw = localStorage.getItem(METIS_PREF_FONT_SCALE_KEY)
    return FONT_SIZE_OPTIONS.includes(raw as FontSizeOption) ? raw as FontSizeOption : 'Default'
  } catch {
    return 'Default'
  }
}

function getSavedAccentColourSetting(): string {
  try {
    const raw = localStorage.getItem(METIS_PREF_ACCENT_COLOR_KEY) ?? localStorage.getItem(LEGACY_PREF_ACCENT_COLOR_KEY)
    return normalizeAccentChoice(raw)
  } catch {
    return DEFAULT_ACCENT_CHOICE
  }
}

function resolveAccentColour(choice: string, theme: 'Dark' | 'Light'): string {
  if (choice === DEFAULT_ACCENT_CHOICE) return theme === 'Light' ? DEFAULT_LIGHT_ACCENT_COLOR : DEFAULT_DARK_ACCENT_COLOR
  return resolveAccentColor(choice)
}

function resolveAccentRgbValue(choice: string, theme: 'Dark' | 'Light'): string {
  if (choice === DEFAULT_ACCENT_CHOICE) return theme === 'Light' ? DEFAULT_LIGHT_ACCENT_RGB : DEFAULT_DARK_ACCENT_RGB
  return resolveAccentRgb(choice)
}

function resolveAccentOnColour(choice: string, theme: 'Dark' | 'Light'): string {
  if (choice === DEFAULT_ACCENT_CHOICE) return theme === 'Light' ? DEFAULT_LIGHT_ON_ACCENT : DEFAULT_DARK_ON_ACCENT
  return resolveAccentOnColor(choice)
}

function darkenHexColor(hex: string, amount = 0.24): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!match) return hex
  const value = match[1]
  const next = [0, 2, 4].map((index) => {
    const channel = Number.parseInt(value.slice(index, index + 2), 16)
    return Math.max(0, Math.round(channel * (1 - amount)))
  })
  return `rgb(${next.join(' ')})`
}

function getSavedInterfaceContrastSetting(): number {
  try {
    const raw = localStorage.getItem(METIS_PREF_INTERFACE_CONTRAST_KEY) ?? localStorage.getItem(LEGACY_PREF_INTERFACE_CONTRAST_KEY)
    const parsed = Number(raw)
    return Number.isFinite(parsed)
      ? Math.max(MIN_READABLE_INTERFACE_CONTRAST, Math.min(100, parsed))
      : DEFAULT_INTERFACE_CONTRAST
  } catch {
    return DEFAULT_INTERFACE_CONTRAST
  }
}

function openMetisExternal(url: string) {
  const api = (window as any).electronAPI
  if (api?.openExternal) {
    void api.openExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

function getSavedHocTwoStageSetting(): 'Embedded' | 'Disjoint two-stage' {
  return String(getSavedSetting('hocTwoStage', 'Disjoint two-stage')) === 'Embedded' ? 'Embedded' : 'Disjoint two-stage'
}

// ─── Slightly-darker surface colour (replaces #1E1E28 everywhere) ─────────────
const SURFACE = 'var(--color-elevated)'
const UI = {
  page: 'var(--color-page)',
  surface: 'var(--color-surface)',
  elevated: 'var(--color-elevated)',
  chrome: 'var(--color-chrome)',
  menuBg: 'var(--color-menu-bg)',
  border: 'var(--color-border)',
  input: 'var(--color-input)',
  text: 'var(--color-text-primary)',
  textSecondary: 'var(--color-text-secondary)',
  textMuted: 'var(--color-text-muted)',
  accent: 'var(--color-accent)',
  accentRgb: 'var(--color-accent-rgb)',
  onAccent: 'var(--color-on-accent)',
  overlay: 'var(--color-overlay)',
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: UI.surface, borderRadius: 16, padding: 16, ...style }}>
      {children}
    </div>
  )
}

function CardHeader({
  icon, title, subtitle, iconColor = UI.accent, action,
}: {
  icon: React.ReactNode; title: string; subtitle?: string; iconColor?: string; action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between" style={{ marginBottom: subtitle ? 14 : 12 }}>
      <div className="flex items-start" style={{ gap: 10 }}>
        <span style={{ color: iconColor, display: 'flex', alignItems: 'center', marginTop: 1 }}>{icon}</span>
        <div className="flex flex-col" style={{ gap: 2 }}>
          <span style={{ color: UI.text, fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 700 }}>{title}</span>
          {subtitle && <span style={{ color: UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>{subtitle}</span>}
        </div>
      </div>
      {action}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 10 }} />
}

function SelectBox({ value, options, onChange, width = 200, direction = 'down' }: {
  value: string; options: string[]; onChange: (v: string) => void; width?: number; direction?: 'up' | 'down'
}) {
  const [open, setOpen] = useState(false)
  const opensUpward = direction === 'up'
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center justify-between"
        style={{ width, height: 32, background: UI.input, border: `1px solid ${UI.border}`, borderRadius: 12, padding: '0 12px', gap: 6, cursor: 'pointer' }}
      >
        <span style={{ color: UI.text, fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{value}</span>
        <CaretDown size={12} color="var(--color-text-muted)" style={{ transform: opensUpward ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && (
        <div
          className="absolute z-20 flex flex-col"
          style={{
            ...(opensUpward ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }),
            right: 0,
            background: UI.menuBg,
            border: `1px solid ${UI.border}`,
            borderRadius: 14,
            boxShadow: 'var(--shadow-floating-dropdown)',
            minWidth: width,
            overflow: 'hidden',
          }}
        >
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              className="flex items-center justify-between px-3 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] transition-colors"
              style={{ height: 32, color: opt === value ? UI.accent : UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 12, whiteSpace: 'nowrap' }}
            >
              {opt}
              {opt === value && <Check size={11} color="var(--color-accent)" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        flexShrink: 0, width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
        background: value ? UI.accent : UI.border, padding: 3,
        display: 'flex', alignItems: 'center', justifyContent: value ? 'flex-end' : 'flex-start',
        boxShadow: value ? '0 0 0 1px rgb(var(--color-accent-rgb) / 0.18), inset 0 1px 0 var(--color-floating-highlight)' : 'none',
        transition: 'background 0.2s, box-shadow 0.2s',
      }}
    >
      <div style={{ width: 16, height: 16, borderRadius: '50%', background: value ? 'var(--color-on-accent)' : '#FFFFFF' }} />
    </button>
  )
}

function SettingRowTall({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between" style={{ gap: 12 }}>
      <div className="flex flex-col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ color: UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 10.5, fontWeight: 700 }}>{label}</span>
        <span style={{ color: UI.textMuted, fontFamily: 'DM Sans, sans-serif', fontSize: 9.5 }}>{desc}</span>
      </div>
      {children}
    </div>
  )
}

function SettingRowSimple({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between" style={{ minHeight: 36 }}>
      <span style={{ color: UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  )
}

// ─── Mini monitor mockup ──────────────────────────────────────────────────────
function MonitorPreview({ dark }: { dark: boolean }) {
  const bg     = dark ? '#0F0F13' : '#F9FAFB'
  const topBg  = dark ? '#17171C' : '#F3F4F6'
  const logoC  = dark ? 'var(--color-text-secondary)' : '#374151'
  const sideBg = dark ? '#17171C' : '#EDEDED'
  const mainBg = dark ? '#0F0F13' : '#FFFFFF'
  const cardBg = dark ? '#17171C' : '#F3F3F3'
  const cardBd = dark ? 'var(--color-border)' : '#E5E7EB'

  return (
    <div className="flex flex-col items-center">
      {/* Bezel — neutral border, selection ring handled by wrapper */}
      <div style={{ width: 200, height: 120, background: dark ? '#0D0D14' : '#E8EAED', borderRadius: 8, border: `1px solid ${dark ? 'var(--color-border)' : '#D7DDE6'}`, padding: 5, boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.5)' : '0 4px 16px rgba(15,18,25,0.12)', overflow: 'hidden' }}>
        <div style={{ width: '100%', height: '100%', background: bg, borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Top bar */}
          <div style={{ height: 18, background: topBg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px', flexShrink: 0 }}>
            <span style={{ color: logoC, fontFamily: 'DM Sans, sans-serif', fontSize: 6, fontWeight: 700 }}>{APP_BRAND_NAME}</span>
            <div style={{ height: 11, padding: '0 5px', borderRadius: 3, background: 'rgb(var(--color-accent-rgb) / 0.22)', border: '1px solid rgb(var(--color-accent-rgb) / 0.3)', display: 'flex', alignItems: 'center' }}>
              <span style={{ color: 'var(--color-on-accent)', fontFamily: 'DM Sans, sans-serif', fontSize: 5, fontWeight: 700 }}>Run</span>
            </div>
          </div>
          {/* Body */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <div style={{ width: 32, background: sideBg, display: 'flex', flexDirection: 'column', padding: '4px 3px', gap: 3, flexShrink: 0 }}>
              {[1,2,3].map(i => <div key={i} style={{ height: 6, borderRadius: 2, background: dark ? '#282838' : '#D1D5DB' }} />)}
            </div>
            <div style={{ flex: 1, background: mainBg, padding: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ background: cardBg, borderRadius: 3, border: `1px solid ${cardBd}`, padding: '3px 4px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ height: 4, width: '60%', borderRadius: 1, background: dark ? '#3A3A4A' : '#D1D5DB' }} />
                <div style={{ height: 3, width: '40%', borderRadius: 1, background: dark ? 'var(--color-border)' : '#E5E7EB' }} />
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                <div style={{ height: 10, padding: '0 4px', borderRadius: 3, background: 'var(--color-accent)', display: 'flex', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-on-accent)', fontFamily: 'DM Sans, sans-serif', fontSize: 4.5, fontWeight: 700 }}>{APP_BASE_RELEASE_LABEL}</span>
                </div>
                <div style={{ height: 10, padding: '0 4px', borderRadius: 3, background: dark ? 'var(--color-border)' : '#E5E7EB', display: 'flex', alignItems: 'center' }}>
                  <span style={{ color: dark ? 'var(--color-text-secondary)' : 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 4.5 }}>Info</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Stand */}
      <div style={{ width: 20, height: 10, background: '#B3B3B3', clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)' }} />
      <div style={{ width: 44, height: 5, background: '#EEEEEE', borderRadius: 2 }} />
    </div>
  )
}

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'general',    label: 'General',           icon: SlidersHorizontal },
  { id: 'appearance', label: 'Appearance',         icon: Palette },
  { id: 'autosave',   label: 'Autosave',           icon: FloppyDisk },
  { id: 'algorithm',  label: 'Algorithm Defaults', icon: ChartBar },
  { id: 'export',     label: 'Export',             icon: Export },
  { id: 'updates',    label: 'Updates & About',    icon: DownloadSimple },
] as const

const FULL_PREFERENCE_TABS = ['general', 'appearance', 'algorithm', 'export', 'updates'] as const
type FullPreferenceTab = typeof FULL_PREFERENCE_TABS[number]

// ─── Main component ───────────────────────────────────────────────────────────
export default function PreferencesModal({ onClose, initialTab = 'general' }: Props) {
  const [tab, setTab] = useState(initialTab)

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  // General
  const [language, setLanguage]           = useState<LanguagePreference>(() => getSavedLanguageSetting())
  const [startupAction, setStartupAction] = useState(getSavedSetting('startupAction', 'Open last workspace'))
  const [realtimeCalc, setRealtimeCalc]   = useState(getSavedSetting('realtimeCalc', true))
  const [showHocPathPrompt, setShowHocPathPrompt] = useState(getSavedSetting('showHocPathPrompt', true))
  const [workspaceFolder, setWorkspaceFolder] = useState('')
  const [exportFolder, setExportFolder] = useState('')
  const [initialStoragePaths, setInitialStoragePaths] = useState({ workspacePath: '', exportPath: '' })
  const [storagePathError, setStoragePathError] = useState('')

  const [theme, setTheme] = useState<'Dark' | 'Light'>(() => getSavedThemeSetting())
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => getSavedThemePreferenceSetting())
  const [fontScale, setFontScale] = useState<FontSizeOption>(() => getSavedFontScaleSetting())
  const [accentColour, setAccentColour] = useState(() => getSavedAccentColourSetting())
  const [interfaceContrast, setInterfaceContrast] = useState(() => getSavedInterfaceContrastSetting())

  // Autosave
  const [autosaveOn, setAutosaveOn]             = useState(getSavedSetting('autosaveOn', true))
  const [autosaveInterval, setAutosaveInterval] = useState(getSavedSetting('autosaveInterval', 'Every 5 minutes'))
  const [warnUnsaved, setWarnUnsaved]           = useState(getSavedSetting('warnUnsaved', true))

  // Algorithm
  const [maxIterations, setMaxIterations]         = useState(getSavedSetting('maxIterations', 300))
  const [stopCriterion, setStopCriterion]         = useState(getSavedSetting('stopCriterion', '1e-7'))
  const [initialWeights, setInitialWeights]       = useState(getSavedSetting('initialWeights', '1 (uniform)'))
  const [innerWeighting, setInnerWeighting]       = useState(getSavedSetting('innerWeighting', 'Path weighting scheme'))
  const [defaultSubsamples, setDefaultSubsamples] = useState(getSavedSetting('defaultSubsamples', 500))
  const [defaultSeed, setDefaultSeed]             = useState(getSavedSetting('defaultSeed', 'Auto'))
  const [missingData, setMissingData]             = useState(getSavedSetting('missingData', 'Mean replacement'))
  const [missingValue, setMissingValue]           = useState(getSavedSetting('missingValue', 'NA'))
  const [assessSyntax, setAssessSyntax]           = useState(getSavedSetting('assessSyntax', false))
  const [plsAlgorithm, setPlsAlgorithm]           = useState(getSavedSetting('plsAlgorithm', 'Standard PLS'))
  const [hocMethod, setHocMethod]                 = useState(getSavedSetting('hocMethod', 'Two-stage'))
  const [hocTwoStage, setHocTwoStage]             = useState(getSavedHocTwoStageSetting)
  const [openAlgorithmCards, setOpenAlgorithmCards] = useState<Set<string>>(
    () => new Set(['pls-sem']),
  )
  const [bootstrapConfidence, setBootstrapConfidence] = useState(getSavedSetting('bootstrapConfidence', '95%'))
  const [bootstrapCiType, setBootstrapCiType]     = useState(getSavedSetting('bootstrapCiType', 'Percentile'))
  const [bootstrapTails, setBootstrapTails]       = useState(getSavedSetting('bootstrapTails', 'Two-tailed'))
  const [bootstrapResampling, setBootstrapResampling] = useState(getSavedSetting('bootstrapResampling', 'Individual'))
  const [bootstrapSignChanges, setBootstrapSignChanges] = useState(getSavedSetting('bootstrapSignChanges', 'None'))
  const [bootstrapMaxIterations, setBootstrapMaxIterations] = useState(getSavedSetting('bootstrapMaxIterations', 300))
  const [bootstrapStopCriterion, setBootstrapStopCriterion] = useState(getSavedSetting('bootstrapStopCriterion', '1e-7'))
  const [predictFolds, setPredictFolds]           = useState(getSavedSetting('predictFolds', 10))
  const [predictRepetitions, setPredictRepetitions] = useState(getSavedSetting('predictRepetitions', 1))
  const [predictTechnique, setPredictTechnique]   = useState(getSavedSetting('predictTechnique', 'Direct antecedents (DA)'))
  const [predictAlgorithm, setPredictAlgorithm]   = useState(getSavedSetting('predictAlgorithm', 'Standard PLS'))
  const [predictSeed, setPredictSeed]             = useState(getSavedSetting('predictSeed', 123))
  const [cvpatEnabled, setCvpatEnabled]           = useState(getSavedSetting('cvpatEnabled', false))
  const [ncaRunDepth, setNcaRunDepth]             = useState(getSavedSetting('ncaRunDepth', 500))
  const [ncaStepSize, setNcaStepSize]             = useState(getSavedSetting('ncaStepSize', 'Auto'))
  const [ncaPredecessorScope, setNcaPredecessorScope] = useState(getSavedSetting('ncaPredecessorScope', 'All predecessors'))
  const [ipmaScaleRange, setIpmaScaleRange]       = useState(getSavedSetting('ipmaScaleRange', '1–7'))
  const [ncaCeilingMethods, setNcaCeilingMethods] = useState(getSavedSetting('ncaCeilingMethods', 'CE-FDH + CR-FDH'))
  const [advancedRandomSeed, setAdvancedRandomSeed] = useState(getSavedSetting('advancedRandomSeed', '123'))
  const [micomPermutations, setMicomPermutations] = useState(getSavedSetting('micomPermutations', 5000))
  const [micomSeed, setMicomSeed]                 = useState(getSavedSetting('micomSeed', 'Auto'))
  const [micomSignificance, setMicomSignificance] = useState(getSavedSetting('micomSignificance', '0.05'))
  const [mgaBootstrapSamples, setMgaBootstrapSamples] = useState(getSavedSetting('mgaBootstrapSamples', 500))
  const [mgaSeed, setMgaSeed]                     = useState(getSavedSetting('mgaSeed', 'Auto'))
  const [mgaSignificance, setMgaSignificance]     = useState(getSavedSetting('mgaSignificance', '0.05'))
  const [moderationBootstrapSamples, setModerationBootstrapSamples] = useState(getSavedSetting('moderationBootstrapSamples', 500))
  const [moderationModelComparison, setModerationModelComparison] = useState(getSavedSetting('moderationModelComparison', 'Joint model'))

  // Export
  const [exportFormat, setExportFormat]   = useState('HTML (.html)') // Locked
  const [decimalPlaces, setDecimalPlaces] = useState(getSavedSetting('decimalPlaces', 3))

  useEffect(() => {
    let cancelled = false
    const loadStoragePaths = async () => {
      try {
        const result = await (window as any).electronAPI?.getStoragePaths?.()
        if (cancelled || !result?.success) return
        const workspacePath = String(result.workspacePath || result.dataPath || '')
        const exportPath = String(result.exportPath || '')
        setWorkspaceFolder(workspacePath)
        setExportFolder(exportPath)
        setInitialStoragePaths({ workspacePath, exportPath })
      } catch (err: any) {
        if (!cancelled) setStoragePathError(err?.message || 'Could not load storage folders.')
      }
    }
    void loadStoragePaths()
    return () => {
      cancelled = true
    }
  }, [])

  const [initialPreferences] = useState(() => ({
    language: getSavedLanguageSetting(),
    startupAction: getSavedSetting('startupAction', 'Open last workspace'),
    realtimeCalc: getSavedSetting('realtimeCalc', true),
    showHocPathPrompt: getSavedSetting('showHocPathPrompt', true),
    theme: getSavedThemeSetting(),
    themePreference: getSavedThemePreferenceSetting(),
    fontScale: getSavedFontScaleSetting(),
    accentColour: getSavedAccentColourSetting(),
    interfaceContrast: getSavedInterfaceContrastSetting(),
    autosaveOn: getSavedSetting('autosaveOn', true),
    autosaveInterval: getSavedSetting('autosaveInterval', 'Every 5 minutes'),
    warnUnsaved: getSavedSetting('warnUnsaved', true),
    maxIterations: getSavedSetting('maxIterations', 300),
    stopCriterion: getSavedSetting('stopCriterion', '1e-7'),
    initialWeights: getSavedSetting('initialWeights', '1 (uniform)'),
    innerWeighting: getSavedSetting('innerWeighting', 'Path weighting scheme'),
    defaultSubsamples: getSavedSetting('defaultSubsamples', 500),
    defaultSeed: getSavedSetting('defaultSeed', 'Auto'),
    missingData: getSavedSetting('missingData', 'Mean replacement'),
    missingValue: getSavedSetting('missingValue', 'NA'),
    assessSyntax: getSavedSetting('assessSyntax', false),
    plsAlgorithm: getSavedSetting('plsAlgorithm', 'Standard PLS'),
    hocMethod: getSavedSetting('hocMethod', 'Two-stage'),
    hocTwoStage: getSavedHocTwoStageSetting(),
    bootstrapConfidence: getSavedSetting('bootstrapConfidence', '95%'),
    bootstrapCiType: getSavedSetting('bootstrapCiType', 'Percentile'),
    bootstrapTails: getSavedSetting('bootstrapTails', 'Two-tailed'),
    bootstrapResampling: getSavedSetting('bootstrapResampling', 'Individual'),
    bootstrapSignChanges: getSavedSetting('bootstrapSignChanges', 'None'),
    bootstrapMaxIterations: getSavedSetting('bootstrapMaxIterations', 300),
    bootstrapStopCriterion: getSavedSetting('bootstrapStopCriterion', '1e-7'),
    predictFolds: getSavedSetting('predictFolds', 10),
    predictRepetitions: getSavedSetting('predictRepetitions', 1),
    predictTechnique: getSavedSetting('predictTechnique', 'Direct antecedents (DA)'),
    predictAlgorithm: getSavedSetting('predictAlgorithm', 'Standard PLS'),
    predictSeed: getSavedSetting('predictSeed', 123),
    cvpatEnabled: getSavedSetting('cvpatEnabled', false),
    ncaRunDepth: getSavedSetting('ncaRunDepth', 500),
    ncaStepSize: getSavedSetting('ncaStepSize', 'Auto'),
    ncaPredecessorScope: getSavedSetting('ncaPredecessorScope', 'All predecessors'),
    ipmaScaleRange: getSavedSetting('ipmaScaleRange', '1–7'),
    ncaCeilingMethods: getSavedSetting('ncaCeilingMethods', 'CE-FDH + CR-FDH'),
    advancedRandomSeed: getSavedSetting('advancedRandomSeed', '123'),
    micomPermutations: getSavedSetting('micomPermutations', 5000),
    micomSeed: getSavedSetting('micomSeed', 'Auto'),
    micomSignificance: getSavedSetting('micomSignificance', '0.05'),
    mgaBootstrapSamples: getSavedSetting('mgaBootstrapSamples', 500),
    mgaSeed: getSavedSetting('mgaSeed', 'Auto'),
    mgaSignificance: getSavedSetting('mgaSignificance', '0.05'),
    moderationBootstrapSamples: getSavedSetting('moderationBootstrapSamples', 500),
    moderationModelComparison: getSavedSetting('moderationModelComparison', 'Joint model'),
    exportFormat: 'HTML (.html)',
    decimalPlaces: getSavedSetting('decimalPlaces', 3),
  }))

  const readCurrentPreferences = () => ({
    language,
    startupAction,
    realtimeCalc,
    showHocPathPrompt,
    theme,
    themePreference,
    fontScale,
    accentColour,
    interfaceContrast,
    autosaveOn,
    autosaveInterval,
    warnUnsaved,
    maxIterations,
    stopCriterion,
    initialWeights,
    innerWeighting,
    defaultSubsamples,
    defaultSeed,
    missingData,
    missingValue,
    assessSyntax,
    plsAlgorithm,
    hocMethod,
    hocTwoStage,
    bootstrapConfidence,
    bootstrapCiType,
    bootstrapTails,
    bootstrapResampling,
    bootstrapSignChanges,
    bootstrapMaxIterations,
    bootstrapStopCriterion,
    predictFolds,
    predictRepetitions,
    predictTechnique,
    predictAlgorithm,
    predictSeed,
    cvpatEnabled,
    ncaRunDepth,
    ncaStepSize,
    ncaPredecessorScope,
    ipmaScaleRange,
    ncaCeilingMethods,
    advancedRandomSeed,
    micomPermutations,
    micomSeed,
    micomSignificance,
    mgaBootstrapSamples,
    mgaSeed,
    mgaSignificance,
    moderationBootstrapSamples,
    moderationModelComparison,
    exportFormat,
    decimalPlaces,
  })

  const hasPreferenceChanges = () => {
    const current = readCurrentPreferences()
    const hasLocalPreferenceChanges = (Object.keys(initialPreferences) as (keyof typeof initialPreferences)[])
      .some((key) => !Object.is(current[key], initialPreferences[key]))
    return hasLocalPreferenceChanges || hasStoragePathChanges()
  }

  const hasStoragePathChanges = () => (
    workspaceFolder !== initialStoragePaths.workspacePath ||
    exportFolder !== initialStoragePaths.exportPath
  )

  const persistStoragePaths = async () => {
    if (!hasStoragePathChanges()) return
    const result = await (window as any).electronAPI?.setStoragePaths?.({
      workspacePath: workspaceFolder,
      exportPath: exportFolder,
    })
    if (!result?.success) throw new Error(result?.error || 'Could not save storage folders.')
    const nextWorkspacePath = String(result.workspacePath || workspaceFolder)
    const nextExportPath = String(result.exportPath || exportFolder)
    setWorkspaceFolder(nextWorkspacePath)
    setExportFolder(nextExportPath)
    setInitialStoragePaths({ workspacePath: nextWorkspacePath, exportPath: nextExportPath })
    window.dispatchEvent(new Event('pls:storage-locations-updated'))
  }

  const persistPreferences = async () => {
    localStorage.setItem(METIS_PREF_LANGUAGE_KEY, language)
    localStorage.setItem(LEGACY_PREF_LANGUAGE_KEY, language)
    localStorage.setItem('pls:prefs:startupAction', startupAction)
    localStorage.setItem('pls:prefs:realtimeCalc', String(realtimeCalc))
    localStorage.setItem('metis:prefs:showHocPathPrompt', String(showHocPathPrompt))
    localStorage.setItem('pls:prefs:showHocPathPrompt', String(showHocPathPrompt))
    const resolvedTheme = resolveThemePreference(themePreference)
    localStorage.setItem('metis:prefs:theme', themePreference)
    localStorage.setItem('pls:prefs:theme', resolvedTheme)
    localStorage.setItem(METIS_PREF_FONT_SCALE_KEY, fontScale)
    localStorage.setItem(METIS_PREF_ACCENT_COLOR_KEY, accentColour)
    localStorage.setItem(LEGACY_PREF_ACCENT_COLOR_KEY, accentColour)
    localStorage.setItem(METIS_PREF_INTERFACE_CONTRAST_KEY, String(interfaceContrast))
    localStorage.setItem(LEGACY_PREF_INTERFACE_CONTRAST_KEY, String(interfaceContrast))
    void (window as any).electronAPI?.setThemePreference?.(resolvedTheme.toLowerCase())
    localStorage.setItem('pls:prefs:autosaveOn', String(autosaveOn))
    localStorage.setItem('pls:prefs:autosaveInterval', autosaveInterval)
    localStorage.setItem('pls:prefs:warnUnsaved', String(warnUnsaved))
    localStorage.setItem('pls:prefs:maxIterations', String(maxIterations))
    localStorage.setItem('pls:prefs:stopCriterion', stopCriterion)
    localStorage.setItem('pls:prefs:initialWeights', initialWeights)
    localStorage.setItem('pls:prefs:innerWeighting', innerWeighting)
    localStorage.setItem('pls:prefs:defaultSubsamples', String(defaultSubsamples))
    localStorage.setItem('pls:prefs:defaultSeed', defaultSeed)
    localStorage.setItem('pls:prefs:missingData', missingData)
    localStorage.setItem('pls:prefs:missingValue', missingValue)
    localStorage.setItem('pls:prefs:assessSyntax', String(assessSyntax))
    localStorage.setItem('pls:prefs:plsAlgorithm', plsAlgorithm)
    localStorage.setItem('pls:prefs:hocMethod', hocMethod)
    localStorage.setItem('pls:prefs:hocTwoStage', hocTwoStage)
    localStorage.setItem('pls:prefs:bootstrapConfidence', bootstrapConfidence)
    localStorage.setItem('pls:prefs:bootstrapCiType', bootstrapCiType)
    localStorage.setItem('pls:prefs:bootstrapTails', bootstrapTails)
    localStorage.setItem('pls:prefs:bootstrapResampling', bootstrapResampling)
    localStorage.setItem('pls:prefs:bootstrapSignChanges', bootstrapSignChanges)
    localStorage.setItem('pls:prefs:bootstrapMaxIterations', String(bootstrapMaxIterations))
    localStorage.setItem('pls:prefs:bootstrapStopCriterion', bootstrapStopCriterion)
    localStorage.setItem('pls:prefs:predictFolds', String(predictFolds))
    localStorage.setItem('pls:prefs:predictRepetitions', String(predictRepetitions))
    localStorage.setItem('pls:prefs:predictTechnique', predictTechnique)
    localStorage.setItem('pls:prefs:predictAlgorithm', predictAlgorithm)
    localStorage.setItem('pls:prefs:predictSeed', String(predictSeed))
    localStorage.setItem('pls:prefs:cvpatEnabled', String(cvpatEnabled))
    localStorage.setItem('pls:prefs:ncaRunDepth', String(ncaRunDepth))
    localStorage.setItem('pls:prefs:ncaStepSize', ncaStepSize)
    localStorage.setItem('pls:prefs:ncaPredecessorScope', ncaPredecessorScope)
    localStorage.setItem('pls:prefs:ipmaScaleRange', ipmaScaleRange)
    localStorage.setItem('pls:prefs:ncaCeilingMethods', ncaCeilingMethods)
    localStorage.setItem('pls:prefs:advancedRandomSeed', advancedRandomSeed)
    localStorage.setItem('pls:prefs:micomPermutations', String(micomPermutations))
    localStorage.setItem('pls:prefs:micomSeed', micomSeed)
    localStorage.setItem('pls:prefs:micomSignificance', micomSignificance)
    localStorage.setItem('pls:prefs:mgaBootstrapSamples', String(mgaBootstrapSamples))
    localStorage.setItem('pls:prefs:mgaSeed', mgaSeed)
    localStorage.setItem('pls:prefs:mgaSignificance', mgaSignificance)
    localStorage.setItem('pls:prefs:moderationBootstrapSamples', String(moderationBootstrapSamples))
    localStorage.setItem('pls:prefs:moderationModelComparison', moderationModelComparison)
    localStorage.setItem('pls:prefs:exportFormat', exportFormat)
    localStorage.setItem('pls:prefs:decimalPlaces', String(decimalPlaces))
    await persistStoragePaths()
    
    window.dispatchEvent(new Event('pls:preferences-updated'))
  }

  const saveAndClose = async () => {
    try {
      setStoragePathError('')
      await persistPreferences()
      onClose()
    } catch (err: any) {
      setStoragePathError(err?.message || 'Could not save preferences.')
    }
  }

  const handleSave = () => {
    void saveAndClose()
  }

  const handleBackToWorkspace = () => {
    if (hasPreferenceChanges()) {
      void saveAndClose()
      return
    }
    onClose()
  }

  const handleReset = () => {
    setLanguage('English')
    setStartupAction('Open last workspace')
    setRealtimeCalc(true)
    setTheme('Dark')
    setThemePreference('Dark')
    setFontScale('Default')
    setAccentColour(DEFAULT_ACCENT_CHOICE)
    setInterfaceContrast(DEFAULT_INTERFACE_CONTRAST)
    setAutosaveOn(true)
    setAutosaveInterval('Every 5 minutes')
    setWarnUnsaved(true)
    setMaxIterations(300)
    setStopCriterion('1e-7')
    setInitialWeights('1 (uniform)')
    setInnerWeighting('Path weighting scheme')
    setDefaultSubsamples(500)
    setDefaultSeed('Auto')
    setExportFormat('HTML (.html)')
    setDecimalPlaces(3)
  }

  const handleBrowseWorkspaceFolder = async () => {
    try {
      setStoragePathError('')
      const result = await (window as any).electronAPI?.openDirectory?.({
        title: 'Choose Metis workspace folder',
        defaultPath: workspaceFolder || undefined,
      })
      const selected = result?.filePaths?.[0] || result?.filePath
      if (!result?.canceled && selected) setWorkspaceFolder(String(selected))
    } catch (err: any) {
      setStoragePathError(err?.message || 'Could not open the workspace folder picker.')
    }
  }

  const handleBrowseExportFolder = async () => {
    try {
      setStoragePathError('')
      const result = await (window as any).electronAPI?.openDirectory?.({
        title: 'Choose export folder',
        defaultPath: exportFolder || undefined,
      })
      const selected = result?.filePaths?.[0] || result?.filePath
      if (!result?.canceled && selected) setExportFolder(String(selected))
    } catch (err: any) {
      setStoragePathError(err?.message || 'Could not open the export folder picker.')
    }
  }

  const setThemeChoice = (preference: ThemePreference) => {
    setThemePreference(preference)
    const resolved = resolveThemePreference(preference)
    setTheme(resolved)
    // Dispatch instant preview event to parent App
    window.dispatchEvent(new CustomEvent('pls:theme-preview', { detail: { theme: resolved, preference } }))
  }

  // Restore original theme preference if modal is cancelled/closed without saving
  useEffect(() => {
    let saved = false
    const handleSaveDone = () => {
      saved = true
    }
    window.addEventListener('pls:preferences-updated', handleSaveDone)
    return () => {
      window.removeEventListener('pls:preferences-updated', handleSaveDone)
      if (!saved) {
        const origPref = getSavedThemePreferenceSetting()
        const origTheme = resolveThemePreference(origPref)
        window.dispatchEvent(new CustomEvent('pls:theme-preview', { detail: { theme: origTheme, preference: origPref } }))
      }
    }
  }, [])

  useEffect(() => {
    if (themePreference !== 'Auto' || typeof window === 'undefined' || !window.matchMedia) return
    const systemThemeQuery = window.matchMedia('(prefers-color-scheme: light)')
    const handleSystemThemeChange = () => {
      const resolved = resolveThemePreference('Auto')
      setTheme(resolved)
      window.dispatchEvent(new CustomEvent('pls:theme-preview', { detail: { theme: resolved, preference: 'Auto' } }))
    }
    systemThemeQuery.addEventListener?.('change', handleSystemThemeChange)
    return () => {
      systemThemeQuery.removeEventListener?.('change', handleSystemThemeChange)
    }
  }, [themePreference])

  const fullPreferenceNavItems = [
    { id: 'general', label: 'General', icon: SlidersHorizontal },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'algorithm', label: 'Algorithm Defaults', icon: Pulse },
    { id: 'export', label: 'Export', icon: DownloadSimple },
    { id: 'updates', label: 'Updates & About', icon: Info },
  ] as const
  const [hoveredFullPreferenceNav, setHoveredFullPreferenceNav] = useState<FullPreferenceTab | null>(null)
  const [openPreferenceSelect, setOpenPreferenceSelect] = useState<string | null>(null)
  const [hoveredFolderBrowse, setHoveredFolderBrowse] = useState<'workspace' | 'export' | null>(null)
  const isLightPreferenceTheme = theme === 'Light'
  const preferenceColors = isLightPreferenceTheme
    ? {
        root: '#F4F6F8',
        sidebar: '#F4F4F4',
        main: '#FAFAFA',
        panel: '#EEF2F6',
        card: '#FFFFFF',
        cardAlt: '#F7F9FB',
        text: '#1A1F2B',
        textSoft: '#3F4651',
        description: '#5F6978',
        muted: '#7F8A9A',
        inactive: '#5F6978',
        navActive: '#E9EEF4',
        border: '#D7DDE6',
        divider: '#E4E9F0',
        field: '#FFFFFF',
        fieldAlt: '#E9EEF4',
        segment: '#E9EEF4',
        selectedBg: '#1A1F2B',
        selectedText: '#FFFFFF',
        badgeBg: 'rgba(26, 31, 43, 0.06)',
        badgeBorder: 'rgba(26, 31, 43, 0.18)',
        notice: '#EEF2F6',
        menu: '#FFFFFF',
        menuShadow: '0 16px 30px rgba(15, 18, 25, 0.14)',
        toggleOff: '#CBD3DE',
        topbar: '#FAFAFA',
      }
    : {
        root: '#202020',
        sidebar: '#202020',
        main: '#141414',
        panel: '#242424',
        card: '#2e2e2eff',
        cardAlt: '#2E2E2E',
        text: '#F5F1E7',
        textSoft: '#b9b9b9ff',
        description: '#ffffff80',
        muted: '#8F8F8F',
        inactive: '#C8C1AE',
        navActive: '#2e2e2e',
        border: '#3A3A3A',
        divider: '#383838',
        field: '#3b3b3bff',
        fieldAlt: '#303030',
        segment: '#191919',
        selectedBg: '#FFFFFF',
        selectedText: '#191919ff',
        badgeBg: '#d3d3d317',
        badgeBorder: '#e8e8e854',
        notice: '#1E1E1E',
        menu: '#202020',
        menuShadow: '0 16px 30px rgba(0, 0, 0, 0.42)',
        toggleOff: '#3A3A3A',
        topbar: '#141414',
      }
  const activeAccentColour = resolveAccentColour(accentColour, theme)
  const activeAccentRgb = resolveAccentRgbValue(accentColour, theme)
  const activeAccentOnColour = resolveAccentOnColour(accentColour, theme)
  const selectedPillBackground = isLightPreferenceTheme ? darkenHexColor(activeAccentColour) : activeAccentColour
  const selectedPillText = isLightPreferenceTheme ? '#FFFFFF' : activeAccentOnColour

  const controlButtonBase: React.CSSProperties = {
    border: 'none',
    background: 'transparent',
    margin: 0,
    cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif',
  }

  const labelBlock = (label: string, description: string, labelWeight: React.CSSProperties['fontWeight'] = 500) => (
    <div className="flex flex-col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
      <span style={{ color: preferenceColors.text, fontFamily: 'DM Sans, sans-serif', fontSize: 18, fontWeight: labelWeight, lineHeight: '23px', overflowWrap: 'anywhere' }}>
        {translateUiText(label, language)}
      </span>
      <span style={{ color: preferenceColors.description, fontFamily: 'DM Sans, sans-serif', fontSize: 16, fontWeight: 400, lineHeight: '21px', overflowWrap: 'anywhere' }}>
        {translateUiText(description, language)}
      </span>
    </div>
  )

  const cardHeaderBlock = (title: string, description: string, titleWeight: React.CSSProperties['fontWeight'] = 500) => (
    <div className="flex flex-col" style={{ padding: '20px 24px', gap: 6, width: '100%' }}>
      <span style={{ color: preferenceColors.text, fontSize: 20, fontWeight: titleWeight, lineHeight: '26px' }}>{title}</span>
      <span style={{ color: preferenceColors.description, fontSize: 17, fontWeight: 400, lineHeight: '22px' }}>{description}</span>
    </div>
  )

  const algorithmCardHeader = (title: string, titleWeight: React.CSSProperties['fontWeight'] = 500) => (
    <div className="flex flex-col" style={{ padding: '20px 24px', gap: 6, width: '100%', background: 'transparent', border: 'none' }}>
      <span style={{ color: preferenceColors.text, fontSize: 20, fontWeight: titleWeight, lineHeight: '26px' }}>{title}</span>
    </div>
  )

  const rowDivider = () => <div style={{ height: 1, background: preferenceColors.divider, width: '100%' }} />

  const toggleControl = (value: boolean, onChange: (next: boolean) => void, label: string) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={value}
      onClick={() => onChange(!value)}
      className="flex items-center"
      style={{
        ...controlButtonBase,
        width: 58,
        height: 32,
        borderRadius: 999,
        background: value ? activeAccentColour : preferenceColors.toggleOff,
        padding: 3,
        justifyContent: value ? 'flex-end' : 'flex-start',
        flexShrink: 0,
        transition: 'background 180ms ease-in-out, justify-content 180ms ease-in-out',
      }}
    >
      <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#FFFFFF', display: 'block', boxShadow: isLightPreferenceTheme ? '0 1px 4px rgba(15,18,25,0.18)' : 'none', transition: 'transform 180ms ease-in-out' }} />
    </button>
  )

  const generalRow = (children: React.ReactNode, height = 78) => (
    <div className="flex items-center" style={{ height, padding: '0 24px', gap: 18, width: '100%' }}>
      {children}
    </div>
  )

  const settingRow = (label: string, description: string, control: React.ReactNode, controlWidth: number, height = 78, labelWeight: React.CSSProperties['fontWeight'] = 500) => (
    <div className="flex items-center" style={{ height: 'auto', minHeight: height, padding: '14px 24px', gap: 18, width: '100%' }}>
      {labelBlock(label, description, labelWeight)}
      <div className="flex items-center justify-end" style={{ width: 'max-content', minWidth: controlWidth, maxWidth: '52%', gap: 10, flexShrink: 1, justifyContent: 'flex-end' }}>
        {control}
      </div>
    </div>
  )

  const folderLocationControl = (id: 'workspace' | 'export', value: string, onBrowse: () => void, ariaLabel: string) => {
    const hovered = hoveredFolderBrowse === id
    return (
    <div className="flex items-center" style={{ width: 500, gap: 10, flexShrink: 0 }}>
      <div
        className="flex items-center"
        style={{
          flex: 1,
          minWidth: 0,
          height: 42,
          borderRadius: 12,
          background: preferenceColors.field,
          border: `1px solid ${preferenceColors.border}`,
          padding: '0 14px',
        }}
      >
        <span
          title={value || 'Not configured'}
          style={{
            color: value ? preferenceColors.text : preferenceColors.muted,
            fontSize: 15,
            fontWeight: 600,
            lineHeight: '20px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value || 'Not configured'}
        </span>
      </div>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onBrowse}
        onMouseEnter={() => setHoveredFolderBrowse(id)}
        onMouseLeave={() => setHoveredFolderBrowse(null)}
        className="flex items-center justify-center"
        style={{
          ...controlButtonBase,
          width: 108,
          height: 42,
          borderRadius: 12,
          background: hovered ? activeAccentColour : preferenceColors.fieldAlt,
          border: hovered ? `1px solid ${activeAccentColour}` : `1px solid ${preferenceColors.border}`,
          color: hovered ? activeAccentOnColour : activeAccentColour,
          flexShrink: 0,
          gap: 7,
          transition: 'background 160ms ease-in-out, border-color 160ms ease-in-out, color 160ms ease-in-out, transform 160ms ease-in-out',
          transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        }}
      >
        <FolderOpen size={18} color={hovered ? activeAccentOnColour : activeAccentColour} />
        <span style={{ color: hovered ? activeAccentOnColour : activeAccentColour, fontSize: 14, fontWeight: 800, lineHeight: '18px' }}>
          Change
        </span>
      </button>
    </div>
  )
  }

  const segmentedControl = (
    options: readonly { label: string; value: string; width: number; fontWeight?: React.CSSProperties['fontWeight']; disabled?: boolean }[],
    selectedValue: string,
    onSelect: (value: string) => void,
    minWidth?: number,
    height = 44,
    padding = 4,
    fillAvailable = false,
  ) => (
    <div
      className="flex items-center"
      style={{ width: fillAvailable ? '100%' : 'max-content', minWidth, height, borderRadius: 14, background: preferenceColors.segment, border: `1px solid ${preferenceColors.border}`, padding, gap: 4, flexWrap: 'nowrap' }}
    >
      {options.map((option) => {
        const selected = selectedValue === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              if (!option.disabled) onSelect(option.value)
            }}
            className="flex items-center justify-center"
            style={{
              ...controlButtonBase,
              width: fillAvailable ? 'auto' : 'max-content',
              minWidth: option.width,
              height: height - (padding * 2),
              padding: '0 16px',
              borderRadius: 10,
              background: selected ? selectedPillBackground : preferenceColors.segment,
              color: selected ? selectedPillText : preferenceColors.muted,
              opacity: option.disabled ? 0.38 : 1,
              cursor: option.disabled ? 'not-allowed' : 'pointer',
              fontSize: 16,
              fontWeight: 400,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              flex: fillAvailable ? 1 : undefined,
              transition: 'background 180ms ease-in-out, color 180ms ease-in-out, transform 180ms ease-in-out',
            }}
          >
            {translateUiText(option.label, language)}
          </button>
        )
      })}
    </div>
  )

  const selectShell = (
    value: string,
    width: number,
    options?: readonly string[],
    onChange?: (value: string) => void,
    showCaret = true,
    locked = false,
    background = preferenceColors.field,
    selectKey = value,
    direction: 'down' | 'up' = 'down',
  ) => {
    const hasMenu = Boolean(options?.length && onChange)
    const isOpen = hasMenu && openPreferenceSelect === selectKey
    return (
      <div
        className="metis-preference-select flex items-center"
        role={hasMenu ? 'button' : undefined}
        tabIndex={hasMenu ? 0 : undefined}
        onClick={() => {
          if (hasMenu) setOpenPreferenceSelect(isOpen ? null : selectKey)
        }}
        onKeyDown={(event) => {
          if (!hasMenu) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpenPreferenceSelect(isOpen ? null : selectKey)
          }
          if (event.key === 'Escape') setOpenPreferenceSelect(null)
        }}
        style={{
          position: 'relative',
          width: 'max-content',
          minWidth: width,
          maxWidth: '100%',
          height: 42,
          borderRadius: 12,
          background,
          border: `1px solid ${preferenceColors.border}`,
          padding: '0 14px',
          gap: 10,
          flexShrink: 0,
          cursor: hasMenu ? 'pointer' : 'default',
          zIndex: isOpen ? 100 : 1,
        }}
      >
          <span style={{ color: preferenceColors.text, fontSize: 17, fontWeight: 400, lineHeight: '22px', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
          {translateUiText(value, language)}
        </span>
        <span style={{ flex: 1, minWidth: 1 }} />
        {locked && <LockIcon size={18} color={preferenceColors.muted} />}
        {!locked && showCaret && <CaretDown size={18} color={preferenceColors.muted} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 180ms ease-in-out' }} />}
        {isOpen && options && onChange && (
          <div
            className="metis-preference-select-menu"
            style={{
              position: 'absolute',
              [direction === 'up' ? 'bottom' : 'top']: 'calc(100% + 6px)',
              right: 0,
              width,
              padding: 6,
              borderRadius: 14,
              background: preferenceColors.menu,
              border: `1px solid ${preferenceColors.border}`,
              boxShadow: preferenceColors.menuShadow,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              zIndex: 110,
            }}
          >
            {options.map((option) => {
              const selected = option === value
              return (
                <button
                  key={option}
                  type="button"
                  className="metis-preference-select-option flex items-center justify-between"
                  onClick={(event) => {
                    event.stopPropagation()
                    onChange(option)
                    setOpenPreferenceSelect(null)
                  }}
                  style={{
                    ...controlButtonBase,
                    width: '100%',
                    height: 34,
                    borderRadius: 10,
                    padding: '0 10px',
                    color: selected ? preferenceColors.text : preferenceColors.inactive,
                    background: selected ? 'rgb(var(--color-accent-rgb) / 0.18)' : '#00000000',
                    fontSize: 14,
                    fontWeight: selected ? 700 : 500,
                    transition: 'background 140ms ease-in-out, color 140ms ease-in-out',
                  }}
                >
                  <span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', textAlign: 'left' }}>{translateUiText(option, language)}</span>
                  {selected && <Check size={13} color={preferenceColors.text} />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const stepperControl = (value: number, onChange: (value: number) => void, min: number, max: number, step = 1) => (
    <div
      className="flex items-center"
      style={{ width: 180, height: 42, borderRadius: 12, background: preferenceColors.field, border: `1px solid ${preferenceColors.border}`, padding: '0 10px', gap: 10 }}
    >
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(Math.max(min, value - step))}
        className="flex items-center justify-center"
        style={{ ...controlButtonBase, width: 17, height: 17, padding: 0, flexShrink: 0 }}
      >
        <Minus size={17} color={preferenceColors.muted} />
      </button>
      <span style={{ flex: 1, minWidth: 1 }} />
      <span style={{ color: preferenceColors.text, fontSize: 17, fontWeight: 800, lineHeight: '22px' }}>{value}</span>
      <span style={{ flex: 1, minWidth: 1 }} />
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(Math.min(max, value + step))}
        className="flex items-center justify-center"
        style={{ ...controlButtonBase, width: 17, height: 17, padding: 0, flexShrink: 0 }}
      >
        <Plus size={17} color={preferenceColors.muted} />
      </button>
    </div>
  )

  const decimalPlacesControl = (
    <div className="flex items-center" style={{ width: 286, height: 42, gap: 14 }}>
      <div style={{ position: 'relative', width: 196, height: 6, borderRadius: 999, background: preferenceColors.divider, overflow: 'hidden' }}>
        <div style={{ width: Math.max(0, Math.min(196, (decimalPlaces / 8) * 196)), height: 6, borderRadius: 999, background: activeAccentColour }} />
        <input
          type="range"
          min={1}
          max={8}
          value={decimalPlaces}
          onChange={(event) => setDecimalPlaces(Number(event.target.value))}
          aria-label="Decimal places"
          style={{ position: 'absolute', inset: -8, opacity: 0, cursor: 'pointer' }}
        />
      </div>
      <div className="flex items-center justify-center" style={{ width: 76, height: 42, borderRadius: 12, background: preferenceColors.fieldAlt, padding: '0 14px' }}>
        <span style={{ color: preferenceColors.text, fontSize: 17, fontWeight: 800, lineHeight: '22px' }}>{decimalPlaces}</span>
      </div>
    </div>
  )

  const themePreviewCard = (label: 'Light' | 'Dark' | 'Auto', selected: boolean) => {
    const isLight = label === 'Light'
    const background = isLight ? '#D7D7D7' : label === 'Dark' ? '#1A1A1A' : '#3A3A3A'
    const stroke = selected ? activeAccentColour : preferenceColors.border
    const text = selected ? preferenceColors.text : preferenceColors.inactive
    const top = isLight ? '#ECECEC' : '#252525'
    const rail = isLight ? '#BFBFBF' : '#111111'
    const panel = isLight ? '#F2F2F2' : label === 'Dark' ? '#303030' : '#2A2A2A'
    const muted = isLight ? '#9D9D9D' : '#686868'

    return (
      <button
        type="button"
        onClick={() => setThemeChoice(label)}
        className="flex flex-col items-center"
        style={{ ...controlButtonBase, flex: 1, gap: 9, minWidth: 0 }}
      >
        <div
          className="flex flex-col"
          style={{
            width: '100%',
            height: selected ? 150 : label === 'Auto' ? 149 : 148,
            borderRadius: 12,
            background,
            border: `${selected ? 2 : 1}px solid ${stroke}`,
            padding: 8,
            gap: 7,
            overflow: 'hidden',
          }}
        >
          <div style={{ height: 26, borderRadius: 8, background: top, flexShrink: 0 }} />
          <div className="flex" style={{ flex: 1, gap: 8, minHeight: 0 }}>
            <div style={{ width: 68, borderRadius: 8, background: rail, flexShrink: 0 }} />
            <div className="flex flex-col" style={{ flex: 1, gap: 8, minWidth: 0 }}>
              <div style={{ height: 32, borderRadius: 8, background: panel }} />
              <div style={{ height: 12, width: '72%', borderRadius: 999, background: muted }} />
              <div style={{ height: 12, width: '52%', borderRadius: 999, background: muted }} />
            </div>
          </div>
        </div>
        <span style={{ color: text, fontSize: 14, fontWeight: selected ? 700 : 600, lineHeight: '18px' }}>{label}</span>
      </button>
    )
  }

  const contrastThumbWidth = 80
  const contrastThumbLeft = (interfaceContrast / 100) * (455 - contrastThumbWidth)
  const contrastFillWidth = contrastThumbLeft + (contrastThumbWidth / 2)
  const contrastControl = (
    <div
      style={{
        position: 'relative',
        width: 455,
        height: 38,
        borderRadius: 13,
        background: preferenceColors.segment,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: `rgb(${activeAccentRgb} / 0.2)` }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: contrastFillWidth, height: '100%', background: activeAccentColour }} />
      <div
        className="flex items-center justify-center"
        style={{
          position: 'absolute',
          left: contrastThumbLeft,
          top: 0,
          width: contrastThumbWidth,
          height: '100%',
          background: activeAccentColour,
          transition: 'left 120ms ease-out, background 180ms ease-in-out',
        }}
      >
          <span style={{ color: activeAccentOnColour, fontSize: 15, fontWeight: 700, lineHeight: '20px' }}>{interfaceContrast}%</span>
      </div>
      <input
        aria-label="Interface contrast"
        type="range"
        min={MIN_READABLE_INTERFACE_CONTRAST}
        max={100}
        value={interfaceContrast}
        onChange={(event) => setInterfaceContrast(Math.max(MIN_READABLE_INTERFACE_CONTRAST, Number(event.target.value)))}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
      />
    </div>
  )

  const renderGeneralPage = () => (
    <>
      <h1 style={{ margin: 0, color: preferenceColors.text, fontFamily: 'DM Sans, sans-serif', fontSize: 32, fontWeight: 800, lineHeight: '42px' }}>
        General
      </h1>

      <div
        className="flex flex-col"
        style={{ width: 1010, background: preferenceColors.panel, borderRadius: 22, padding: 10, gap: 10, border: isLightPreferenceTheme ? `1px solid ${preferenceColors.border}` : 'none' }}
      >
        <div
          className="flex flex-col overflow-hidden"
          style={{ width: 990, background: preferenceColors.card, border: `1px solid ${preferenceColors.border}`, borderRadius: 18 }}
        >
          {rowDivider()}
          {generalRow(
            <>
              {labelBlock('Language', 'Interface language used across Metis.')}
              <div className="flex items-center justify-center" style={{ width: 220, gap: 10, flexShrink: 0 }}>
                {selectShell(language, 180, [...LANGUAGE_OPTIONS], (value) => setLanguage(normalizeLanguagePreference(value)), true, false, preferenceColors.fieldAlt, 'language')}
              </div>
            </>,
          )}
          {rowDivider()}
          {generalRow(
            <>
              {labelBlock('On startup', 'Choose what Metis opens at launch.')}
              <div className="flex items-center justify-center" style={{ width: 'max-content', minWidth: 570, gap: 10, flexShrink: 0 }}>
                {segmentedControl(
                  [
                    { label: 'Open last workspace', value: 'Open last workspace', width: 190 },
                    { label: 'Show workspace picker', value: 'Show workspace picker', width: 205 },
                    { label: 'Start blank', value: 'Start blank', width: 135 },
                  ],
                  startupAction,
                  setStartupAction,
                  550,
                  56,
                  10,
                )}
              </div>
            </>,
            82,
          )}
          {rowDivider()}
          {generalRow(
            <>
              {labelBlock('Metis workspace folder', 'Folder Metis scans for .metisws workspaces.')}
              {folderLocationControl('workspace', workspaceFolder, () => void handleBrowseWorkspaceFolder(), 'Browse for Metis workspace folder')}
            </>,
            82,
          )}
          {rowDivider()}
          {generalRow(
            <>
              {labelBlock('Export folder', 'Default destination for HTML reports and saved results.')}
              {folderLocationControl('export', exportFolder, () => void handleBrowseExportFolder(), 'Browse for export folder')}
            </>,
            82,
          )}
          {storagePathError && (
            <div className="flex items-center" style={{ width: '100%', background: 'rgb(var(--color-danger-rgb) / 0.10)', padding: '12px 24px', gap: 10 }}>
              <Info size={16} color="var(--color-danger)" weight="regular" />
              <span style={{ color: 'var(--color-danger)', fontSize: 14, fontWeight: 700, lineHeight: '19px' }}>
                {storagePathError}
              </span>
            </div>
          )}
        </div>

        <div
          className="flex flex-col overflow-hidden"
          style={{ width: 990, background: preferenceColors.card, border: `1px solid ${preferenceColors.border}`, borderRadius: 18 }}
        >
          {rowDivider()}
          {generalRow(
            <>
              {labelBlock('Real-time calculations', 'Update model calculations automatically when inputs change.')}
              <div className="flex items-center justify-center" style={{ width: 90, gap: 10, flexShrink: 0 }}>
                {toggleControl(realtimeCalc, setRealtimeCalc, 'Real-time calculations')}
              </div>
            </>,
          )}
          {rowDivider()}
          {generalRow(
            <>
              {labelBlock('HOC path prompt', 'Ask before choosing between lower-order and structural HOC paths.')}
              <div className="flex items-center justify-center" style={{ width: 90, gap: 10, flexShrink: 0 }}>
                {toggleControl(showHocPathPrompt, setShowHocPathPrompt, 'HOC path prompt')}
              </div>
            </>,
          )}
          {rowDivider()}
          {generalRow(
            <>
              {labelBlock('Autosave projects', 'Save recoverable project snapshots while you work.')}
              <div className="flex items-center justify-center" style={{ width: 90, gap: 10, flexShrink: 0 }}>
                {toggleControl(autosaveOn, setAutosaveOn, 'Autosave projects')}
              </div>
            </>,
          )}
          {rowDivider()}
          {generalRow(
            <>
              {labelBlock('Autosave interval', 'How often Metis writes local recovery snapshots.', 800)}
              <div className="flex items-center justify-center" style={{ width: 350, gap: 10, flexShrink: 0 }}>
                {segmentedControl(
                  [
                    { label: 'Every 1 minute', value: 'Every 1 minute', width: 150 },
                    { label: 'Every 5 minutes', value: 'Every 5 minutes', width: 160 },
                  ],
                  autosaveInterval,
                  setAutosaveInterval,
                )}
              </div>
            </>,
          )}
          {rowDivider()}
          {generalRow(
            <>
              {labelBlock('Warn on unsaved changes', 'Show a confirmation before closing work with pending edits.')}
              <div className="flex items-center justify-center" style={{ width: 90, gap: 10, flexShrink: 0 }}>
                {toggleControl(warnUnsaved, setWarnUnsaved, 'Warn on unsaved changes')}
              </div>
            </>,
          )}
          <div className="flex items-center" style={{ width: '100%', background: preferenceColors.notice, padding: '16px 24px', gap: 12 }}>
            <Info size={18} color={activeAccentColour} weight="regular" />
            <span style={{ color: preferenceColors.description, fontSize: 16, fontWeight: 700, lineHeight: '21px' }}>
              Autosave runs locally. Your datasets are never uploaded.
            </span>
          </div>
        </div>
      </div>
    </>
  )

  const renderAppearancePage = () => (
    <>
      <h1 style={{ margin: 0, color: preferenceColors.text, fontFamily: 'DM Sans, sans-serif', fontSize: 32, fontWeight: 700, lineHeight: '42px' }}>
        Appearance
      </h1>

      <div
        className="flex flex-col overflow-hidden"
        style={{ width: 1010, background: preferenceColors.panel, borderRadius: 14, padding: 10, gap: 10, border: `1px solid ${preferenceColors.border}` }}
      >
        <div className="flex items-center justify-between" style={{ height: 98, padding: '0 18px', gap: 20, borderBottom: `1px solid ${preferenceColors.border}`, background: preferenceColors.panel, flexShrink: 0 }}>
          <div className="flex flex-col" style={{ gap: 10, flex: 1, minWidth: 0 }}>
            <span style={{ color: preferenceColors.text, fontSize: 20, fontWeight: 500, lineHeight: '26px' }}>Theme</span>
            <span style={{ color: preferenceColors.inactive, fontSize: 20, fontWeight: 400, lineHeight: '28px' }}>Choose Dark, Light, or Auto for the Metis workspace</span>
          </div>
          <div className="flex items-center" style={{ gap: 5, height: 35 }}>
              {([
                { label: 'Light', value: 'Light', icon: Sun },
                { label: 'Dark', value: 'Dark', icon: Moon },
                { label: 'Auto', value: 'Auto', icon: SunHorizon },
              ] as const).map((item) => {
                const Icon = item.icon
                const selected = themePreference === item.value
                const color = selected ? activeAccentColour : preferenceColors.muted
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setThemeChoice(item.value)}
                    className="flex items-center justify-center"
                    style={{
                      ...controlButtonBase,
                    height: 38,
                    borderRadius: 20,
                      padding: '0 14px',
                      gap: 9,
                      background: selected ? `rgb(${activeAccentRgb} / 0.3)` : '#00000000',
                      border: selected ? `1px solid ${activeAccentColour}` : '1px solid #00000000',
                      transition: 'background 180ms ease-in-out, border-color 180ms ease-in-out, color 180ms ease-in-out, transform 180ms ease-in-out',
                    }}
                  >
                  <Icon size={22} color={color} />
                  <span style={{ color, fontSize: 17, fontWeight: selected ? 700 : 600, lineHeight: '22px' }}>{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex" style={{ width: '100%', padding: '10px 18px', gap: 18 }}>
          {themePreviewCard('Light', themePreference === 'Light')}
          {themePreviewCard('Dark', themePreference === 'Dark')}
          {themePreviewCard('Auto', themePreference === 'Auto')}
        </div>

        <div className="flex flex-col" style={{ width: '100%', background: preferenceColors.card, borderRadius: 12, gap: 12, border: isLightPreferenceTheme ? `1px solid ${preferenceColors.border}` : 'none' }}>
          <div className="flex items-center" style={{ height: 64, padding: '0 24px', gap: 34, borderBottom: `1px solid ${preferenceColors.border}`, background: preferenceColors.cardAlt, borderRadius: '12px 12px 0 0' }}>
            <span style={{ color: preferenceColors.textSoft, fontSize: 20, fontWeight: 700, lineHeight: '26px' }}>Metis appearance</span>
            <span style={{ flex: 1 }} />
          </div>

          <div className="flex items-center justify-between" style={{ height: 70, padding: '0 24px', gap: 26 }}>
            <div className="flex flex-col" style={{ gap: 7, flex: 1, minWidth: 0 }}>
              <span style={{ color: preferenceColors.text, fontSize: 20, fontWeight: 500, lineHeight: '26px' }}>App font size</span>
              <span style={{ color: preferenceColors.description, fontSize: 17, fontWeight: 400, lineHeight: '23px' }}>Applied to the workspace after preferences save.</span>
            </div>
            <div className="flex items-center" style={{ width: 520, height: 44, borderRadius: 13, background: preferenceColors.segment, border: `1px solid ${preferenceColors.border}`, padding: 4, gap: 4, flexShrink: 0 }}>
              {FONT_SIZE_OPTIONS.map((option) => {
                const selected = fontScale === option
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFontScale(option)}
                    className="flex items-center justify-center"
                    style={{
                      ...controlButtonBase,
                      flex: 1,
                      height: '100%',
                      borderRadius: 10,
                      background: selected ? selectedPillBackground : '#00000000',
                      border: selected ? `1px solid ${preferenceColors.border}` : '1px solid #00000000',
                      transition: 'background 180ms ease-in-out, border-color 180ms ease-in-out',
                    }}
                  >
                    <span style={{ color: selected ? selectedPillText : preferenceColors.muted, fontSize: 16, fontWeight: selected ? 700 : 600, lineHeight: '21px' }}>{option}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between" style={{ height: 64, padding: '0 24px', gap: 26 }}>
            <div className="flex flex-col" style={{ gap: 7, flex: 1, minWidth: 0 }}>
              <span style={{ color: preferenceColors.text, fontSize: 20, fontWeight: 500, lineHeight: '26px' }}>Accent Colour</span>
              <span style={{ color: preferenceColors.description, fontSize: 17, fontWeight: 400, lineHeight: '23px' }}>Primary color</span>
            </div>
            <div className="flex items-center" style={{ gap: 12, flexShrink: 0 }}>
              {ACCENT_OPTIONS.map((option) => {
                const selected = accentColour.toLowerCase() === option.value.toLowerCase()
                const swatchColor = option.value === DEFAULT_ACCENT_CHOICE ? activeAccentColour : option.color
                const defaultAccentSwatchBackground = `linear-gradient(90deg, ${DEFAULT_DARK_ACCENT_COLOR} 0 50%, ${DEFAULT_LIGHT_ACCENT_COLOR} 50% 100%)`
                const swatchBackground = option.value === DEFAULT_ACCENT_CHOICE ? defaultAccentSwatchBackground : swatchColor
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-label={`${option.label} accent`}
                    onClick={() => setAccentColour(option.value)}
                    className="flex items-center justify-center"
                    style={{
                      ...controlButtonBase,
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      background: selected ? preferenceColors.selectedBg : swatchBackground,
                      border: selected ? `2px solid ${swatchColor}` : '1px solid #00000044',
                      padding: 0,
                      transition: 'background 180ms ease-in-out, border-color 180ms ease-in-out, transform 180ms ease-in-out',
                    }}
                  >
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: swatchBackground, display: 'block' }} />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between" style={{ height: 72, padding: '0 24px', gap: 22 }}>
            <span style={{ color: preferenceColors.text, fontSize: 20, fontWeight: 500, lineHeight: '26px' }}>Interface contrast</span>
            {contrastControl}
          </div>
        </div>
      </div>
    </>
  )

  const staticValue = (value: string, width = 220) => (
    <div
      className="flex items-center justify-end"
      style={{ width, minHeight: 42, borderRadius: 12, background: preferenceColors.fieldAlt, border: `1px solid ${preferenceColors.border}`, padding: '0 14px', flexShrink: 0 }}
    >
      <span style={{ color: preferenceColors.muted, fontSize: 17, fontWeight: 500, lineHeight: '22px', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )

  const toggleAlgorithmCard = (id: string) => {
    setOpenAlgorithmCards((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const algorithmCard = (id: string, title: string, children: React.ReactNode) => {
    const expanded = openAlgorithmCards.has(id)
    return (
    <div
      className="flex flex-col"
      style={{ width: 990, background: 'transparent', border: 'none', borderRadius: 0, overflow: 'visible' }}
    >
      <button
        type="button"
        aria-expanded={expanded}
          onClick={() => toggleAlgorithmCard(id)}
        className="flex items-center justify-between"
        style={{ ...controlButtonBase, width: '100%', padding: '20px 24px', background: 'transparent', color: preferenceColors.text, textAlign: 'left' }}
      >
          <span style={{ color: preferenceColors.text, fontSize: 20, fontWeight: 500, lineHeight: '26px', overflowWrap: 'anywhere' }}>{translateUiText(title, language)}</span>
        <CaretDown size={18} color={preferenceColors.muted} style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 180ms ease-in-out' }} />
      </button>
      {expanded && <div className="flex flex-col" style={{ width: '100%', background: preferenceColors.card, border: `1px solid ${preferenceColors.border}`, borderRadius: 18, overflow: 'visible' }}>{children}</div>}
    </div>
    )
  }

  const renderAlgorithmCard = () => algorithmCard(
    'pls-sem',
    'PLS-SEM Algorithm Defaults',
    <>
      {rowDivider()}
      {settingRow(
        'Inner weighting scheme',
        'How structural paths influence latent variable scores.',
        segmentedControl(
          [
            { label: 'Path weighting', value: 'Path weighting scheme', width: 150 },
            { label: 'Centroid', value: 'Centroid weighting scheme', width: 110 },
            { label: 'Factor', value: 'Factor weighting scheme', width: 94 },
          ],
          innerWeighting,
          setInnerWeighting,
        ),
        395,
      )}
      {rowDivider()}
      {settingRow(
        'Initial outer weights',
        'Starting weights used before iterative estimation.',
        segmentedControl(
          [
            { label: '1 (uniform)', value: '1 (uniform)', width: 120 },
            { label: 'Lohmöller', value: 'Lohmöller', width: 120 },
            { label: 'Random', value: 'Random', width: 100, fontWeight: 800 },
          ],
          initialWeights,
          setInitialWeights,
          360,
        ),
        380,
      )}
      {rowDivider()}
      {settingRow('Max iterations', 'Upper limit for the iterative estimation loop.', stepperControl(maxIterations, setMaxIterations, 50, 10000), 310)}
      {rowDivider()}
      {settingRow('Stop criterion', 'Convergence threshold used to finish estimation.', selectShell(stopCriterion, 160, ['1e-5', '1e-6', '1e-7', '1e-8', '1e-10'], setStopCriterion, true, false, preferenceColors.field, 'stop-criterion'), 190)}
      {rowDivider()}
      {settingRow('Missing data', 'Treatment applied before model estimation.', selectShell(missingData, 220, ['Mean replacement', 'Listwise deletion', 'Median replacement'], setMissingData, true, false, preferenceColors.field, 'missing-data'), 220)}
      {rowDivider()}
      {settingRow('Missing value sentinel', 'Value SEMinR treats as missing before the selected replacement strategy.', selectShell(missingValue, 160, ['NA'], setMissingValue, true, false, preferenceColors.field, 'missing-value'), 210)}
      {rowDivider()}
      {settingRow('Assess model syntax', 'Ask SEMinR to validate the model specification during estimation.', selectShell(assessSyntax ? 'On' : 'Off', 160, ['Off', 'On'], (value) => setAssessSyntax(value === 'On'), true, false, preferenceColors.field, 'assess-syntax'), 190)}
      {rowDivider()}
      {settingRow('PLS Algorithm', 'Reflective-consistent or standard composite model.', selectShell(plsAlgorithm, 220, ['Standard PLS', 'Consistent PLS (PLSc)'], setPlsAlgorithm, true, false, preferenceColors.field, 'pls-algorithm'), 220)}
    </>,
  )

  const renderHigherOrderCard = () => algorithmCard(
    'higher-order',
    'Higher-order Defaults',
    <>
      {settingRow(
        'Higher-order method',
        'Select how higher-order constructs are estimated.',
        segmentedControl(
          [
            { label: 'Repeated indicators', value: 'Repeated indicators', width: 190 },
            { label: 'Two-stage', value: 'Two-stage', width: 120 },
          ],
          hocMethod,
          (value) => {
            setHocMethod(value)
          },
          395,
          44,
          4,
          true,
        ),
        395,
      )}
      {rowDivider()}
      {settingRow(
        'Two-stage approach',
        'Choose how stage 1 is specified.',
        segmentedControl(
          [
            { label: 'Embedded', value: 'Embedded', width: 120, disabled: hocMethod !== 'Two-stage' },
            { label: 'Disjoint', value: 'Disjoint two-stage', width: 120, disabled: hocMethod !== 'Two-stage' },
          ],
          hocTwoStage,
          (value) => setHocTwoStage(value === 'Disjoint two-stage' ? 'Disjoint two-stage' : 'Embedded'),
          259,
        ),
        380,
      )}
    </>,
  )

  const renderBootstrapCard = () => algorithmCard(
    'bootstrap',
    'Bootstrap Defaults',
    <>
      {rowDivider()}
      {settingRow('Default subsamples', 'Number of bootstrap samples used for new analyses.', stepperControl(defaultSubsamples, setDefaultSubsamples, 100, 10000, 100), 210)}
      {rowDivider()}
      {settingRow('Default random seed', 'Use Auto for convenience or set a fixed seed when needed.', selectShell(defaultSeed, 160, ['Auto', '123', '42', '2024'], setDefaultSeed, true, false, preferenceColors.field, 'default-seed', 'up'), 190)}
      {rowDivider()}
      {settingRow('Confidence level', 'Confidence level for bootstrap intervals.', segmentedControl([{ label: '90%', value: '90%', width: 78 }, { label: '95%', value: '95%', width: 78 }, { label: '99%', value: '99%', width: 78 }], bootstrapConfidence, setBootstrapConfidence, 260), 270)}
      {rowDivider()}
      {settingRow('CI type', 'Interval method reported for bootstrap results.', selectShell(bootstrapCiType, 160, ['Percentile', 'Basic', 'BCa'], setBootstrapCiType, true, false, preferenceColors.field, 'bootstrap-ci-type'), 190)}
      {rowDivider()}
      {settingRow('Tails', 'Tail selection for significance testing.', segmentedControl([{ label: 'Two-tailed', value: 'Two-tailed', width: 120 }, { label: 'One-tailed', value: 'One-tailed', width: 120 }], bootstrapTails, setBootstrapTails, 260), 270)}
      {rowDivider()}
      {settingRow('Resampling', 'Bootstrap resampling scope for inference.', selectShell(bootstrapResampling, 220, ['Individual', 'Case-wise'], setBootstrapResampling, true, false, preferenceColors.field, 'bootstrap-resampling'), 220)}
      {rowDivider()}
      {settingRow('Sign-change handling', 'Sign-change correction applied during bootstrap.', selectShell(bootstrapSignChanges, 220, ['None', 'Construct-level', 'Indicator-level'], setBootstrapSignChanges, true, false, preferenceColors.field, 'bootstrap-sign-changes'), 220)}
      {rowDivider()}
      {settingRow('Max iterations', 'Iteration limit used by the estimation routine.', stepperControl(bootstrapMaxIterations, setBootstrapMaxIterations, 50, 10000), 310, 78, 500)}
      {rowDivider()}
      {settingRow('Stop criterion', 'Convergence threshold used by the estimation routine.', selectShell(bootstrapStopCriterion, 160, ['1e-5', '1e-6', '1e-7', '1e-8', '1e-10'], setBootstrapStopCriterion, true, false, preferenceColors.field, 'bootstrap-stop-criterion'), 190)}
    </>,
  )

  const renderPredictCard = () => algorithmCard(
    'pls-predict',
    'PLS Predict Defaults',
    <>
      {rowDivider()}
      {settingRow('Number of folds', 'Cross-validation folds used for new predictions.', stepperControl(predictFolds, setPredictFolds, 2, 20), 210)}
      {rowDivider()}
      {settingRow('Repetitions', 'Number of repeated cross-validation runs.', stepperControl(predictRepetitions, setPredictRepetitions, 1, 50), 260)}
      {rowDivider()}
      {settingRow('Prediction technique', 'SEMinR technique used for out-of-sample prediction.', selectShell(predictTechnique, 260, ['Direct antecedents (DA)', 'Entire antecedents (EA)'], setPredictTechnique, true, false, preferenceColors.field, 'predict-technique'), 280, 78, 500)}
      {rowDivider()}
      {settingRow('PLS algorithm', 'Algorithm used to estimate the prediction model.', selectShell(predictAlgorithm, 220, ['Standard PLS', 'Consistent PLS (PLSc)'], setPredictAlgorithm, true, false, preferenceColors.field, 'predict-algorithm'), 240, 78, 500)}
      {rowDivider()}
      {settingRow('Prediction seed', 'Fixed seed used to reproduce SEMinR fold assignment and predictions.', stepperControl(predictSeed, setPredictSeed, 1, 2147483647), 260, 78, 500)}
      {rowDivider()}
      {settingRow('CVPAT', 'Cross-validated predictive ability assessment.', selectShell(cvpatEnabled ? 'On' : 'Off', 160, ['Off', 'On'], (value) => setCvpatEnabled(value === 'On'), true, false, preferenceColors.field, 'cvpat'), 190, 78, 500)}
      {rowDivider()}
      {settingRow('Validation plan', 'Configured folds and repeated cross-validation runs.', staticValue(`${predictFolds} folds × ${predictRepetitions} repetition${predictRepetitions === 1 ? '' : 's'}`, 220), 260, 78, 500)}
    </>,
  )

  const renderNcaIpmaCard = () => algorithmCard(
    'nca-ipma',
    'NCA and IPMA Defaults',
    <>
      {settingRow('NCA run depth', 'Number of bottleneck depths to evaluate.', stepperControl(ncaRunDepth, setNcaRunDepth, 100, 5000, 100), 210)}
      {rowDivider()}
      {settingRow('Bottleneck step size', 'Increment used between bottleneck levels.', selectShell(ncaStepSize, 160, ['Auto', '1', '5', '10'], setNcaStepSize, true, false, preferenceColors.field, 'nca-step-size'), 190)}
      {rowDivider()}
      {settingRow('Predecessor scope', 'Predictors included in NCA and IPMA.', selectShell(ncaPredecessorScope, 210, ['All predecessors', 'Selected predictors'], setNcaPredecessorScope, true, false, preferenceColors.field, 'nca-predecessor-scope'), 240)}
      {rowDivider()}
      {settingRow('IPMA scale range', 'User-defined measurement scale minimum and maximum for 0–100 rescaling.', selectShell(ipmaScaleRange, 150, ['1–5', '1–7', '1–10'], setIpmaScaleRange, true, false, preferenceColors.field, 'ipma-scale-range'), 190)}
      {rowDivider()}
      {settingRow('NCA ceiling methods', 'Select the ceiling techniques used for necessity analysis.', selectShell(ncaCeilingMethods, 250, ['CE-FDH + CR-FDH', 'CE-FDH', 'CR-FDH'], setNcaCeilingMethods, true, false, preferenceColors.field, 'nca-ceiling-methods'), 250)}
      {rowDivider()}
      {settingRow('Random seed', 'User-defined seed for reproducible IPMA and NCA results.', selectShell(advancedRandomSeed, 160, ['123', '42', '2024', 'Auto'], setAdvancedRandomSeed, true, false, preferenceColors.field, 'advanced-analysis-seed'), 190)}
    </>,
  )

  const renderMicomCard = () => algorithmCard(
    'micom',
    'Permutation Analysis (MICOM) Defaults',
    <>
      {rowDivider()}
      {settingRow('Permutations', 'Number of permutations used for MICOM.', stepperControl(micomPermutations, setMicomPermutations, 1000, 20000, 500), 210)}
      {rowDivider()}
      {settingRow('Default random seed', 'Use Auto for convenience or set a fixed seed when needed.', selectShell(micomSeed, 160, ['Auto', '123', '42', '2024'], setMicomSeed, true, false, preferenceColors.field, 'micom-seed'), 190)}
      {rowDivider()}
      {settingRow('Significance level', 'Alpha threshold for invariance decisions.', selectShell(micomSignificance, 160, ['0.01', '0.05', '0.10'], setMicomSignificance, true, false, preferenceColors.field, 'micom-significance'), 190)}
    </>,
  )

  const renderMgaCard = () => algorithmCard(
    'mga',
    'Multi Group Analysis (MGA) Defaults',
    <>
      {rowDivider()}
      {settingRow('Bootstrap samples', 'Bootstrap samples for group estimates.', stepperControl(mgaBootstrapSamples, setMgaBootstrapSamples, 100, 10000, 100), 210)}
      {rowDivider()}
      {settingRow('Default random seed', 'Use Auto for convenience or set a fixed seed when needed.', selectShell(mgaSeed, 160, ['Auto', '123', '42', '2024'], setMgaSeed, true, false, preferenceColors.field, 'mga-seed'), 190)}
      {rowDivider()}
      {settingRow('Significance level', 'Alpha threshold for group comparisons.', selectShell(mgaSignificance, 160, ['0.01', '0.05', '0.10'], setMgaSignificance, true, false, preferenceColors.field, 'mga-significance'), 190)}
    </>,
  )

  const renderModerationCard = () => algorithmCard(
    'moderation',
    'Moderation Defaults',
    <>
      {rowDivider()}
      {settingRow('Bootstrap samples', 'Samples used for moderation inference.', stepperControl(moderationBootstrapSamples, setModerationBootstrapSamples, 100, 10000, 100), 210)}
      {rowDivider()}
      {settingRow('Moderation model comparison', 'Evaluate all interactions together or one at a time.', segmentedControl([{ label: 'Joint model', value: 'Joint model', width: 120 }, { label: 'Isolated', value: 'Isolated', width: 100 }], moderationModelComparison, setModerationModelComparison, 260, 44, 4, true), 270)}
    </>,
  )

  const renderAlgorithmPage = () => (
    <>
      <h1 style={{ margin: 0, color: preferenceColors.text, fontFamily: 'DM Sans, sans-serif', fontSize: 32, fontWeight: 800, lineHeight: '42px' }}>
        {translateUiText('Algorithm Defaults', language)}
      </h1>
      <div className="flex flex-col" style={{ width: 1010, background: preferenceColors.panel, borderRadius: 22, padding: 10, gap: 10, overflow: 'visible' }}>
        {renderAlgorithmCard()}
        {renderHigherOrderCard()}
        {renderBootstrapCard()}
        {renderPredictCard()}
        {renderNcaIpmaCard()}
        {renderMicomCard()}
        {renderMgaCard()}
        {renderModerationCard()}
      </div>
    </>
  )

  const renderExportPage = () => (
    <>
      <h1 style={{ margin: 0, color: preferenceColors.text, fontFamily: 'DM Sans, sans-serif', fontSize: 32, fontWeight: 700, lineHeight: '42px' }}>
        Export
      </h1>
      <div className="flex flex-col" style={{ width: 1010, background: preferenceColors.panel, borderRadius: 22, padding: 10, gap: 10 }}>
        <div className="flex flex-col overflow-hidden" style={{ width: 990, background: preferenceColors.card, border: `1px solid ${preferenceColors.border}`, borderRadius: 18 }}>
          {cardHeaderBlock('Export Defaults', 'Set the default report format and numeric precision used by new exports.')}
          {rowDivider()}
          {settingRow('Default format', 'Metis exports interactive analysis reports as local HTML files.', selectShell(exportFormat, 210, undefined, undefined, false, true), 240)}
          {rowDivider()}
          {settingRow('Decimal places', 'Number formatting used in tables, diagnostics, and generated reports.', decimalPlacesControl, 310)}
          <div className="flex items-center" style={{ width: '100%', background: preferenceColors.notice, padding: '16px 24px', gap: 12 }}>
            <Info size={18} color={activeAccentColour} weight="regular" />
            <span style={{ color: preferenceColors.description, fontSize: 16, fontWeight: 400, lineHeight: '21px' }}>
              HTML reports open in your browser and keep tables ready for sharing or review.
            </span>
          </div>
        </div>
      </div>
    </>
  )

  const actionButton = (label: string, icon: React.ReactNode, background: string, onClick: () => void) => {
    const isAccent = background === activeAccentColour
    const btnBg = isAccent ? activeAccentColour : (isLightPreferenceTheme ? preferenceColors.fieldAlt : '#3b3b3bff')
    const textColor = isAccent ? activeAccentOnColour : preferenceColors.text
    const clonedIcon = React.isValidElement(icon)
      ? React.cloneElement(icon as any, { color: isAccent ? activeAccentOnColour : preferenceColors.text })
      : icon
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center justify-center"
        style={{ ...controlButtonBase, width: 'max-content', minWidth: 180, height: 42, borderRadius: 12, background: btnBg, border: isAccent ? 'none' : `1px solid ${preferenceColors.border}`, padding: '0 16px', gap: 9, flexShrink: 0 }}
      >
        {clonedIcon}
        <span style={{ color: textColor, fontSize: 17, fontWeight: 500, lineHeight: '22px', whiteSpace: 'nowrap' }}>{label}</span>
      </button>
    )
  }

  const aboutValue = (value: string, width: number) => (
    <div className="flex items-center justify-center" style={{ width, height: 42, borderRadius: 12, background: preferenceColors.fieldAlt, border: `1px solid ${preferenceColors.border}`, padding: '0 14px' }}>
      <span style={{ color: preferenceColors.textSoft, fontSize: 17, fontWeight: 500, lineHeight: '22px', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )

  const aboutRow = (label: string, description: string, value: React.ReactNode, controlWidth: number) => (
    <div className="flex items-center" style={{ height: 58, padding: '0 24px', gap: 18, width: '100%' }}>
      <div className="flex flex-col" style={{ gap: 8, flex: 1, minWidth: 0 }}>
        <span style={{ color: preferenceColors.text, fontSize: 18, fontWeight: 500, lineHeight: '23px' }}>{label}</span>
        <span style={{ color: preferenceColors.description, fontSize: 16, fontWeight: 400, lineHeight: '21px' }}>{description}</span>
      </div>
      <div className="flex items-center justify-center" style={{ width: controlWidth, gap: 10, flexShrink: 0 }}>
        {value}
      </div>
    </div>
  )

  const renderUpdatesPage = () => (
    <>
      <h1 style={{ margin: 0, color: preferenceColors.text, fontFamily: 'DM Sans, sans-serif', fontSize: 32, fontWeight: 800, lineHeight: '42px' }}>
        Updates &amp; About
      </h1>
      <div className="flex flex-col" style={{ width: 1010, background: preferenceColors.panel, borderRadius: 22, padding: 10, gap: 10 }}>
        <div className="flex flex-col overflow-hidden" style={{ width: 990, background: preferenceColors.card, border: `1px solid ${preferenceColors.border}`, borderRadius: 18 }}>
          {cardHeaderBlock('Updates', 'Check the public release channel and review what changed before restarting.')}
          {rowDivider()}
          {settingRow('Check for updates', 'Look for newer Metis desktop releases.', actionButton('Check updates', <ArrowsClockwise size={18} color="#F5F1E7" />, activeAccentColour, () => openMetisExternal(METIS_UPDATES_URL)), 210, 70)}
          {rowDivider()}
          {settingRow('Release notes', 'Open the latest changelog in your browser.', actionButton('Release notes', <ArrowSquareOut size={18} color="#F5F1E7" />, '#3b3b3bff', () => openMetisExternal(METIS_UPDATES_URL)), 210, 70)}
        </div>

        <div className="flex flex-col overflow-hidden" style={{ width: 990, background: 'transparent', border: '1px solid transparent', borderRadius: 18, gap: 12 }}>
          <div className="flex flex-col" style={{ padding: '20px 24px', gap: 8, width: '100%' }}>
            <span style={{ color: preferenceColors.text, fontSize: 20, fontWeight: 500, lineHeight: '26px' }}>About Metis</span>
            <span style={{ color: preferenceColors.description, fontSize: 17, fontWeight: 400, lineHeight: '22px' }}>Desktop workspace for PLS-SEM models powered by seminr.</span>
          </div>
          {rowDivider()}
          <div className="flex flex-col" style={{ padding: '20px 24px', gap: 8 }}>
            <span style={{ color: preferenceColors.description, fontSize: 17, fontWeight: 400, lineHeight: '22px' }}>
              Metis helps build PLS-SEM models, run bootstrap workflows, and review publication-ready reports.
            </span>
          </div>
          {rowDivider()}
          {aboutRow('Edition', 'Desktop bundle for local analysis workflows.', aboutValue(APP_EDITION, 120), 150)}
          {rowDivider()}
          {aboutRow('Version', 'Current application version.', aboutValue(APP_BASE_RELEASE_LABEL, 120), 150)}
          {rowDivider()}
          {aboutRow('Build', 'Development desktop shell identifier.', aboutValue('desktop-dev', 150), 180)}
          {rowDivider()}
          {aboutRow('Licence', 'Open-source licence used by Metis.', aboutValue('GNU GPL v3', 150), 180)}
          {rowDivider()}
          {aboutRow('Built by', 'Project ownership shown in the existing preferences.', aboutValue(`${APP_BRAND_NAME} team`, 150), 180)}
        </div>
      </div>
    </>
  )

  const renderFullPreferenceContent = (activeTab: FullPreferenceTab) => {
    switch (activeTab) {
      case 'appearance':
        return renderAppearancePage()
      case 'algorithm':
        return renderAlgorithmPage()
      case 'export':
        return renderExportPage()
      case 'updates':
        return renderUpdatesPage()
      case 'general':
      default:
        return renderGeneralPage()
    }
  }

  const isFullPreferencePreviewActive = () => FULL_PREFERENCE_TABS.includes(tab as FullPreferenceTab)
  const activePreferenceTab = (isFullPreferencePreviewActive() ? tab : 'general') as FullPreferenceTab
  const [fullPreferenceViewport, setFullPreferenceViewport] = useState(() => ({
    width: typeof window === 'undefined' ? GENERAL_PREVIEW_WIDTH : window.innerWidth,
    height: typeof window === 'undefined' ? GENERAL_PREVIEW_HEIGHT : window.innerHeight,
    top: 0,
  }))

  useEffect(() => {
    if (!isFullPreferencePreviewActive() || typeof window === 'undefined') return

    const updateViewport = () => {
      const visualViewport = window.visualViewport
      const titleBarBottom = document
        .querySelector('.drag-region')
        ?.getBoundingClientRect()
        .bottom ?? 0
      const viewportHeight = visualViewport?.height ?? window.innerHeight
      setFullPreferenceViewport({
        width: visualViewport?.width ?? window.innerWidth,
        height: Math.max(1, viewportHeight - titleBarBottom),
        top: titleBarBottom,
      })
    }

    updateViewport()
    window.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('resize', updateViewport)
    return () => {
      window.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('resize', updateViewport)
    }
  }, [tab])

  const fullPreferenceScaleRaw = Math.min(
    fullPreferenceViewport.width / GENERAL_PREVIEW_WIDTH,
    fullPreferenceViewport.height / GENERAL_PREVIEW_HEIGHT,
  )
  const fullPreferenceScale = Number.isFinite(fullPreferenceScaleRaw) && fullPreferenceScaleRaw > 0
    ? Math.min(1, fullPreferenceScaleRaw)
    : 1
  const fullPreferenceFrameWidth = Math.max(GENERAL_PREVIEW_WIDTH, fullPreferenceViewport.width / fullPreferenceScale)
  const fullPreferenceFrameHeight = Math.max(GENERAL_PREVIEW_HEIGHT, fullPreferenceViewport.height / fullPreferenceScale)

  if (isFullPreferencePreviewActive()) {
    const fullPreferenceFrame = (
      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: fullPreferenceFrameWidth,
          height: fullPreferenceFrameHeight,
          background: preferenceColors.root,
          border: 'none',
          color: preferenceColors.text,
          fontFamily: 'DM Sans, sans-serif',
          pointerEvents: 'auto',
        }}
      >
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          <aside
            className="flex flex-col shrink-0"
            style={{
              width: 410,
              height: '100%',
              background: preferenceColors.sidebar,
              padding: '24px 12px',
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={handleBackToWorkspace}
              className="flex items-center"
              style={{
                ...controlButtonBase,
                width: 386,
                height: 48,
                padding: '0 14px',
                gap: 13,
                color: preferenceColors.muted,
              }}
            >
              <ArrowLeft size={18} color={preferenceColors.muted} />
              <span style={{ color: preferenceColors.muted, fontSize: 16, fontWeight: 600, lineHeight: '22px', whiteSpace: 'nowrap' }}>
                Back to workspace
              </span>
            </button>

            <nav className="flex flex-col" style={{ width: 386, gap: 4 }}>
              {fullPreferenceNavItems.map((item) => {
                const Icon = item.icon
                const active = activePreferenceTab === item.id
                const itemColor = active || hoveredFullPreferenceNav === item.id ? preferenceColors.text : preferenceColors.inactive
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setTab(item.id)}
                    onMouseEnter={() => setHoveredFullPreferenceNav(item.id)}
                    onMouseLeave={() => setHoveredFullPreferenceNav(null)}
                    className="flex items-center"
                    style={{
                      ...controlButtonBase,
                      width: 386,
                      height: 46,
                      borderRadius: 12,
                      padding: '0 14px',
                      gap: 12,
                      background: active || hoveredFullPreferenceNav === item.id ? preferenceColors.navActive : '#00000000',
                      color: itemColor,
                    }}
                  >
                    <Icon size={18} color={itemColor} weight="regular" style={{ flexShrink: 0 }} />
                    <span style={{ color: itemColor, fontSize: 16, fontWeight: 400, lineHeight: '22px', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                  </button>
                )
              })}
            </nav>

            <div className="flex-1" />
            <div className="flex flex-col" style={{ width: 386, minHeight: 66, padding: 18, gap: 10 }}>
              <div
                className="flex items-center"
                style={{
                  height: 30,
                  width: 128,
                  borderRadius: 999,
                  background: preferenceColors.badgeBg,
                  border: `1px solid ${preferenceColors.badgeBorder}`,
                  padding: '0 12px',
                  gap: 8,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: preferenceColors.muted, flexShrink: 0 }} />
                <span style={{ color: preferenceColors.textSoft, fontSize: 15, fontWeight: 700, lineHeight: '20px', whiteSpace: 'nowrap' }}>
                  {APP_EDITION} {APP_BASE_RELEASE_LABEL}
                </span>
              </div>
            </div>
          </aside>

          <main
            className="flex flex-col flex-1 overflow-hidden"
            style={{
              minWidth: 0,
              background: preferenceColors.main,
              borderTopLeftRadius: 22,
              borderLeft: `1px solid ${preferenceColors.border}`,
              borderTop: `1px solid ${preferenceColors.border}`,
            }}
          >
            <div style={{ height: 78, borderBottom: `1px solid ${preferenceColors.border}`, background: preferenceColors.topbar, flexShrink: 0 }} />
            <div
              className={`flex ${activePreferenceTab === 'updates' || activePreferenceTab === 'algorithm' ? 'metis-preferences-scroll' : ''}`}
              style={{
                flex: 1,
                minHeight: 0,
                padding: '84px 0 0 0',
                background: preferenceColors.main,
                overflowY: activePreferenceTab === 'updates' || activePreferenceTab === 'algorithm' ? 'auto' : 'hidden',
                overflowX: 'hidden',
              }}
            >
              <div style={{ width: 210, flexShrink: 0 }} />
              <section className="flex flex-col" style={{ width: 1010, gap: 28, flexShrink: 0, paddingBottom: activePreferenceTab === 'updates' || activePreferenceTab === 'algorithm' ? 84 : 0 }}>
                {renderFullPreferenceContent(activePreferenceTab)}
              </section>
              <div style={{ width: 250, flex: 1, minWidth: 0 }} />
            </div>
          </main>
        </div>
      </div>
    )

    const fullPreferenceStage = (
      <div
        className="fixed inset-0 z-[90] overflow-hidden"
        onMouseDownCapture={(event) => {
          const target = event.target as HTMLElement
          if (!target.closest('.metis-preference-select')) setOpenPreferenceSelect(null)
        }}
        style={{
          background: preferenceColors.root,
          fontFamily: 'DM Sans, sans-serif',
          top: fullPreferenceViewport.top,
          height: fullPreferenceViewport.height,
          bottom: 'auto',
          pointerEvents: 'none',
        }}
      >
        <style>{`.metis-preferences-scroll{scrollbar-width:none;-ms-overflow-style:none}.metis-preferences-scroll::-webkit-scrollbar{display:none;width:0;height:0}.metis-preference-select-option:hover,.metis-preference-select-option:focus-visible{background:rgb(var(--color-accent-rgb) / 0.28)!important;color:${preferenceColors.text}!important;outline:none}`}</style>
        <div
          style={{
            width: fullPreferenceFrameWidth,
            height: fullPreferenceFrameHeight,
            transform: `scale(${fullPreferenceScale})`,
            transformOrigin: 'top left',
          }}
        >
          {fullPreferenceFrame}
        </div>
      </div>
    )

    return typeof document === 'undefined'
      ? fullPreferenceFrame
      : fullPreferenceStage
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: UI.overlay }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col overflow-hidden"
        style={{ width: 'min(1180px, 96vw)', maxHeight: '90vh', background: UI.page, borderRadius: 22, border: 'none', boxShadow: 'var(--shadow-modal)' }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{ height: 62, padding: '0 20px', background: UI.chrome }}
        >
          <div className="flex items-center" style={{ gap: 10 }}>
            <GearSix size={18} color="var(--color-accent)" weight="fill" />
            <div className="flex flex-col" style={{ gap: 2 }}>
              <span style={{ color: UI.text, fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 700 }}>Preferences</span>
              <span style={{ color: UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 11 }}>Personalise {APP_BRAND_NAME} for your workflow.</span>
            </div>
          </div>
          <div className="flex items-center" style={{ gap: 10 }}>
            <button
              onClick={handleReset}
              className="flex items-center justify-center hover:bg-[rgb(var(--color-hover-rgb)/0.75)] transition-colors"
              style={{ height: 32, padding: '0 12px', borderRadius: 12, border: 'none', background: UI.input, cursor: 'pointer', gap: 7, whiteSpace: 'nowrap' }}
            >
              <ArrowCounterClockwise size={13} color="var(--color-text-secondary)" />
              <span style={{ color: UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600 }}>Reset to defaults</span>
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center hover:bg-[rgb(var(--color-hover-rgb)/0.75)] transition-colors"
              style={{ width: 30, height: 30, borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <X size={16} color="var(--color-text-muted)" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left nav */}
          <div
            className="flex flex-col shrink-0"
            style={{ width: 360, background: UI.elevated, padding: '10px 8px', gap: 2 }}
          >
            {NAV_ITEMS.map(item => {
              const Icon = item.icon
              const active = tab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className="flex items-center text-left transition-colors"
                  style={{ gap: 10, height: 38, padding: '0 12px', borderRadius: 14, border: 'none', cursor: 'pointer', background: active ? UI.surface : 'transparent', width: '100%' }}
                >
                  <Icon size={14} color={active ? 'var(--color-accent)' : 'var(--color-text-muted)'} weight={active ? 'fill' : 'regular'} style={{ flexShrink: 0 }} />
                  <span style={{ color: active ? UI.text : UI.textMuted, fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                </button>
              )
            })}

            <div className="flex-1" />
            <div className="flex items-center justify-center" style={{ padding: '8px 0' }}>
              <div style={{ padding: '3px 9px', borderRadius: 999, background: SURFACE }}>
                <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 10, fontWeight: 600 }}>{APP_BASE_RELEASE_LABEL}</span>
              </div>
            </div>
          </div>

          {/* Right content */}
          <div className="flex-1 overflow-y-auto" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ────────── GENERAL ────────── */}
            {tab === 'general' && (
              <>
                <Card>
                  <CardHeader icon={<SlidersHorizontal size={16} />} title="Regional" />
                  <SettingRowSimple label="Language">
                    <SelectBox value={language} options={[...LANGUAGE_OPTIONS]} onChange={(value) => setLanguage(normalizeLanguagePreference(value))} />
                  </SettingRowSimple>
                  {language !== 'English' && (
                    <div className="flex items-start" style={{ gap: 7, marginTop: 10, padding: '8px 10px', borderRadius: 14, background: 'rgb(var(--color-accent-rgb) / 0.07)' }}>
                      <Info size={12} color="var(--color-accent)" weight="fill" style={{ marginTop: 1, flexShrink: 0 }} />
                      <span style={{ color: 'rgb(var(--color-accent-rgb) / 0.75)', fontFamily: 'DM Sans, sans-serif', fontSize: 11 }}>
                        Restart {APP_BRAND_NAME} to apply the language change. Full localisation is in progress.
                      </span>
                    </div>
                  )}
                </Card>

                <Card>
                  <CardHeader icon={<SlidersHorizontal size={16} />} title="Startup &amp; Behaviour" />
                  <SettingRowSimple label="On startup">
                    <SelectBox
                      value={startupAction}
                      options={['Open last workspace', 'Show workspace picker', 'Start blank']}
                      onChange={setStartupAction}
                      width={270}
                    />
                  </SettingRowSimple>
                  <Divider />
                  <div style={{ background: UI.elevated, borderRadius: 14, padding: '14px 16px', margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <SettingRowTall
                      label="Real-time Calculations"
                      desc="Automatically run PLS estimates as you draw the model. Shows factor loadings on indicator arrows and R² inside construct circles."
                    >
                      <Toggle value={realtimeCalc} onChange={setRealtimeCalc} />
                    </SettingRowTall>
                  </div>
                </Card>
              </>
            )}

            {/* ────────── APPEARANCE ────────── */}
            {tab === 'appearance' && (
              <Card style={{ padding: 0, overflow: 'visible' }}>
                {/* Card header */}
                <div className="flex items-start justify-between" style={{ padding: 16, background: UI.elevated, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
                  <div className="flex items-start" style={{ gap: 10 }}>
                    <Palette size={18} color="var(--color-accent)" weight="fill" style={{ marginTop: 2 }} />
                    <div className="flex flex-col" style={{ gap: 2 }}>
                      <span style={{ color: UI.text, fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 700 }}>Appearance</span>
                      <span style={{ color: UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>Choose a theme and text size for {APP_BRAND_NAME}.</span>
                    </div>
                  </div>
                </div>

                {/* Monitor selectors */}
                <div
                  className="flex items-end justify-center"
                  style={{ padding: '28px 24px 24px', gap: 40, background: UI.surface, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}
                >
                  {/* ── Dark theme (active, selectable) ── */}
                  <button
                    onClick={() => setThemeChoice('Dark')}
                    className="flex flex-col items-center transition-all"
                    style={{
                      padding: 10, borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: 'transparent',
                      outline: theme === 'Dark' ? '2px solid var(--color-accent)' : '2px solid transparent',
                      outlineOffset: 2,
                      boxShadow: theme === 'Dark' ? '0 0 16px rgb(var(--color-accent-rgb) / 0.2)' : 'none',
                      transition: 'outline 0.15s, box-shadow 0.15s',
                    }}
                  >
                    <MonitorPreview dark={true} />
                    <div className="flex items-center" style={{ gap: 5, marginTop: 10 }}>
                      {theme === 'Dark' && (
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: UI.accent }} />
                      )}
                      <span style={{
                        color: theme === 'Dark' ? UI.text : UI.textMuted,
                        fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: theme === 'Dark' ? 700 : 400,
                      }}>
                        Dark
                      </span>
                    </div>
                  </button>

                  {/* ── Light theme ── */}
                  <button
                    onClick={() => setThemeChoice('Light')}
                    className="flex flex-col items-center"
                    style={{
                      padding: 10,
                      borderRadius: 14,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      outline: theme === 'Light' ? '2px solid var(--color-accent)' : '2px solid transparent',
                      outlineOffset: 2,
                      boxShadow: theme === 'Light' ? '0 0 16px rgb(var(--color-accent-rgb) / 0.2)' : 'none',
                      transition: 'outline 0.15s, box-shadow 0.15s',
                    }}
                  >
                    <MonitorPreview dark={false} />
                    <div className="flex items-center" style={{ gap: 5, marginTop: 10 }}>
                      {theme === 'Light' && (
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: UI.accent }} />
                      )}
                      <span style={{
                        color: theme === 'Light' ? UI.text : UI.textMuted,
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 12,
                        fontWeight: theme === 'Light' ? 700 : 400,
                      }}>
                        Light
                      </span>
                    </div>
                  </button>
                </div>
                <div style={{ padding: '0 24px 22px', background: UI.surface, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
                  <div style={{ borderTop: `1px solid ${UI.border}`, paddingTop: 16 }}>
                    <SettingRowTall label="App font size" desc="Restart metis to apply font size changes.">
                      <SelectBox value={fontScale} options={[...FONT_SIZE_OPTIONS]} onChange={(value) => setFontScale(value as FontSizeOption)} direction="up" />
                    </SettingRowTall>
                  </div>
                </div>
              </Card>
            )}

            {/* ────────── AUTOSAVE ────────── */}
            {tab === 'autosave' && (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div className="flex items-start" style={{ gap: 10, padding: 16, background: UI.elevated, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
                  <FloppyDisk size={18} color="#32D583" weight="fill" style={{ marginTop: 2 }} />
                  <div className="flex flex-col" style={{ gap: 2 }}>
                    <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 700 }}>Autosave &amp; safety</span>
                    <span style={{ color: 'rgba(176,176,192,0.6)', fontFamily: 'DM Sans, sans-serif', fontSize: 11 }}>Prevent data loss while modelling and running analyses.</span>
                  </div>
                </div>

                <div className="flex flex-col" style={{ padding: 16, gap: 16 }}>
                  <SettingRowTall label="Autosave projects" desc="Automatically save workspaces and models in the background.">
                    <Toggle value={autosaveOn} onChange={setAutosaveOn} />
                  </SettingRowTall>
                  <Divider />
                  <SettingRowTall label="Autosave interval" desc={`How often ${APP_BRAND_NAME} writes an autosave snapshot.`}>
                    <SelectBox value={autosaveInterval} options={['Every 1 minute', 'Every 5 minutes']} onChange={setAutosaveInterval} />
                  </SettingRowTall>
                  <Divider />
                  <SettingRowTall label="Warn on unsaved changes" desc="Show a confirmation dialogue before closing a modified model.">
                    <Toggle value={warnUnsaved} onChange={setWarnUnsaved} />
                  </SettingRowTall>
                </div>

                <div className="flex items-start" style={{ gap: 8, margin: '0 16px 16px', padding: '10px 12px', borderRadius: 14, background: UI.elevated }}>
                  <Info size={13} color="var(--color-text-muted)" style={{ marginTop: 1, flexShrink: 0 }} />
                  <span style={{ color: UI.textMuted, fontFamily: 'DM Sans, sans-serif', fontSize: 11 }}>
                    Autosave runs locally. Your datasets are never uploaded.
                  </span>
                </div>
              </Card>
            )}

            {/* ────────── ALGORITHM DEFAULTS ────────── */}
            {tab === 'algorithm' && (
              <>
                <Card>
                  <CardHeader icon={<ChartBar size={16} />} title="PLS-SEM Algorithm" />
                  <div className="flex flex-col" style={{ gap: 12 }}>
                    <SettingRowSimple label="Inner weighting scheme">
                      <SelectBox value={innerWeighting} options={['Path weighting scheme', 'Centroid weighting scheme', 'Factor weighting scheme']} onChange={setInnerWeighting} width={220} />
                    </SettingRowSimple>
                    <Divider />
                    <SettingRowSimple label="Initial outer weights">
                      <SelectBox value={initialWeights} options={['1 (uniform)', 'Lohmöller', 'Random']} onChange={setInitialWeights} />
                    </SettingRowSimple>
                    <Divider />
                    <SettingRowSimple label="Max iterations">
                      <input
                        type="number" value={maxIterations} min={50} max={10000}
                        onChange={e => setMaxIterations(Number(e.target.value))}
                        className="outline-none"
                        style={{ width: 200, height: 32, background: UI.input, border: `1px solid ${UI.border}`, borderRadius: 12, padding: '0 12px', color: UI.text, fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}
                      />
                    </SettingRowSimple>
                    <Divider />
                    <SettingRowSimple label="Stop criterion">
                      <SelectBox value={stopCriterion} options={['1e-5', '1e-6', '1e-7', '1e-8', '1e-10']} onChange={setStopCriterion} />
                    </SettingRowSimple>
                  </div>
                </Card>

                <Card>
                  <CardHeader icon={<ChartBar size={16} />} title="Bootstrap Defaults" />
                  <div className="flex flex-col" style={{ gap: 12 }}>
                    <SettingRowSimple label="Default subsamples">
                      <input
                        type="number" value={defaultSubsamples} min={100} max={10000}
                        onChange={e => setDefaultSubsamples(Number(e.target.value))}
                        className="outline-none"
                        style={{ width: 200, height: 32, background: UI.input, border: `1px solid ${UI.border}`, borderRadius: 12, padding: '0 12px', color: UI.text, fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}
                      />
                    </SettingRowSimple>
                    <Divider />
                    <SettingRowSimple label="Default random seed">
                      <input
                        type="text" value={defaultSeed} placeholder="Auto"
                        onChange={e => setDefaultSeed(e.target.value)}
                        className="outline-none"
                        style={{ width: 200, height: 32, background: 'var(--color-page)', border: `1px solid ${UI.border}`, borderRadius: 12, padding: '0 12px', color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}
                      />
                    </SettingRowSimple>
                  </div>
                </Card>
              </>
            )}

            {/* ────────── EXPORT ────────── */}
            {tab === 'export' && (
              <Card>
                <CardHeader icon={<Export size={16} />} title="Export Defaults" />
                <div className="flex flex-col" style={{ gap: 12 }}>
                  <SettingRowSimple label="Default format">
                    <SelectBox value={exportFormat} options={['HTML (.html)']} onChange={setExportFormat} />
                  </SettingRowSimple>
                  <Divider />
                  <SettingRowSimple label="Decimal places">
                    <input
                      type="number" value={decimalPlaces} min={1} max={8}
                      onChange={e => setDecimalPlaces(Number(e.target.value))}
                      className="outline-none"
                      style={{ width: 200, height: 32, background: UI.input, border: `1px solid ${UI.border}`, borderRadius: 12, padding: '0 12px', color: UI.text, fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}
                    />
                  </SettingRowSimple>
                </div>
              </Card>
            )}

            {/* ────────── UPDATES & ABOUT ────────── */}
            {tab === 'updates' && (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div className="flex items-start" style={{ gap: 10, padding: 16, background: UI.elevated, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
                  <DownloadSimple size={18} color="var(--color-accent)" weight="fill" style={{ marginTop: 2 }} />
                  <div className="flex flex-col" style={{ gap: 2 }}>
                    <span style={{ color: UI.text, fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 700 }}>Updates &amp; version</span>
                    <span style={{ color: UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>Update settings, version info and open-source links.</span>
                  </div>
                </div>

                <div className="flex flex-col" style={{ padding: 16, gap: 10 }}>
                  {/* Updates panel */}
                  <div style={{ background: UI.elevated, borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="flex items-center" style={{ gap: 8, flexWrap: 'nowrap' }}>
                      <RocketLaunch size={15} color="var(--color-accent)" weight="fill" />
                      <span style={{ color: UI.text, fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700 }}>Updates</span>
                    </div>
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <button
                        onClick={() => openMetisExternal(METIS_UPDATES_URL)}
                        className="flex items-center justify-center hover:opacity-90 transition-opacity"
                        style={{ height: 32, minWidth: 178, padding: '0 12px', borderRadius: 12, border: 'none', background: 'rgba(170,17,85,0.11)', cursor: 'pointer', gap: 7, flexShrink: 0 }}
                      >
                        <ArrowsClockwise size={13} color="var(--color-accent)" />
                        <span style={{ color: UI.accent, fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>Check updates</span>
                      </button>
                      <button
                        onClick={() => openMetisExternal(METIS_UPDATES_URL)}
                        className="flex items-center justify-center hover:bg-[rgb(var(--color-hover-rgb)/0.75)] transition-colors"
                        style={{ height: 32, minWidth: 170, padding: '0 12px', borderRadius: 12, border: 'none', background: UI.input, cursor: 'pointer', gap: 7, flexShrink: 0 }}
                      >
                        <Notebook size={13} color="var(--color-text-secondary)" />
                        <span style={{ color: UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>Release notes</span>
                      </button>
                    </div>
                    <span style={{ color: UI.textMuted, fontFamily: 'DM Sans, sans-serif', fontSize: 9.5 }}>Updates are installed on restart.</span>
                  </div>

                  {/* About panel */}
                  <div style={{ background: UI.elevated, borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <Info size={15} color="var(--color-accent)" weight="fill" />
                      <span style={{ color: UI.text, fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700 }}>About {APP_BRAND_NAME}</span>
                      <button
                        onClick={() => openMetisExternal(METIS_DOCS_URL)}
                        className="ml-auto flex items-center justify-center hover:bg-[rgb(var(--color-hover-rgb)/0.75)] transition-colors"
                        style={{ height: 28, padding: '0 10px', borderRadius: 10, border: 'none', background: UI.input, cursor: 'pointer', gap: 6 }}
                      >
                        <Notebook size={12} color="var(--color-text-secondary)" />
                        <span style={{ color: UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 10.5, fontWeight: 700 }}>Docs</span>
                      </button>
                    </div>
                    <div className="flex flex-col" style={{ gap: 6, padding: '8px 10px', borderRadius: 14, background: UI.surface }}>
                      <span style={{ color: UI.text, fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 400 }}>
                        {APP_BRAND_NAME} is a desktop PLS-SEM analysis environment for building measurement/structural models, running estimation and bootstrap/PLSpredict workflows, and reviewing publication-ready diagnostics and reports.
                      </span>
                      <span style={{ color: UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 11 }}>
                        Built by the {APP_BRAND_NAME} team.
                      </span>
                    </div>
                    <div className="flex flex-col" style={{ gap: 8 }}>
                      {([
                        ['Edition', APP_EDITION, true],
                        ['Version',  APP_BASE_RELEASE_LABEL, true],
                        ['Build',    'desktop-dev',         false],
                        ['Licence',  'GNU GPL v3',           false],
                        ['Built by', `${APP_BRAND_NAME} team`, false],
                      ] as [string, string, boolean][]).map(([k, v, highlight]) => (
                        <div key={k} className="flex items-center justify-between">
                            <span style={{ color: UI.textMuted, fontFamily: 'DM Sans, sans-serif', fontSize: 10.5, fontWeight: 600 }}>{k}</span>
                          <span style={{ color: highlight ? UI.accent : UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 10.5, fontWeight: highlight ? 700 : 400 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-end shrink-0"
          style={{ height: 56, padding: '0 20px', background: UI.chrome, gap: 10 }}
        >
          <button
            onClick={onClose}
            className="flex items-center justify-center hover:bg-[rgb(var(--color-hover-rgb)/0.75)] transition-colors"
            style={{ height: 34, padding: '0 16px', borderRadius: 12, border: 'none', background: UI.input, cursor: 'pointer' }}
          >
            <span style={{ color: UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 500 }}>Cancel</span>
          </button>
          <button
            onClick={handleSave}
            className="flex items-center justify-center hover:opacity-90 transition-opacity"
            style={{ height: 34, padding: '0 18px', borderRadius: 12, border: '1px solid rgb(var(--color-accent-rgb) / 0.42)', background: UI.accent, cursor: 'pointer' }}
          >
            <span style={{ color: UI.onAccent, fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700 }}>Save Changes</span>
          </button>
        </div>
      </div>
    </div>
  )
}
