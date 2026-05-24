import { useEffect, useState } from 'react'
import {
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
} from '@phosphor-icons/react'
import { APP_BASE_RELEASE_LABEL, APP_BRAND_NAME, APP_EDITION } from '../config/appBranding'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void
  initialTab?: 'general' | 'appearance' | 'autosave' | 'algorithm' | 'export' | 'updates'
}

const METIS_PREF_THEME_KEY = 'metis:prefs:theme'
const LEGACY_PREF_THEME_KEY = 'pls:prefs:theme'
const METIS_PREF_FONT_SCALE_KEY = 'metis:prefs:fontScale'
const METIS_UPDATES_URL = 'https://metis.emend.it.com/updates.html'
const METIS_DOCS_URL = 'https://metis.emend.it.com/docs.html'
const FONT_SIZE_OPTIONS = ['Small', 'Default', 'Large', 'Extra Large'] as const
type FontSizeOption = typeof FONT_SIZE_OPTIONS[number]

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

function getSavedThemeSetting(): 'Dark' | 'Light' {
  try {
    const raw = localStorage.getItem(METIS_PREF_THEME_KEY) ?? localStorage.getItem(LEGACY_PREF_THEME_KEY)
    return raw === 'Light' ? 'Light' : 'Dark'
  } catch {
    return 'Dark'
  }
}

function getSavedFontScaleSetting(): FontSizeOption {
  try {
    const raw = localStorage.getItem(METIS_PREF_FONT_SCALE_KEY)
    return FONT_SIZE_OPTIONS.includes(raw as FontSizeOption) ? raw as FontSizeOption : 'Default'
  } catch {
    return 'Default'
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
        <span style={{ color: UI.text, fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600 }}>{value}</span>
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
              style={{ height: 32, color: opt === value ? UI.accent : UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}
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
            <div style={{ height: 11, padding: '0 5px', borderRadius: 3, background: dark ? 'rgb(var(--color-accent-rgb) / 0.22)' : 'rgba(135,151,107,0.20)', border: `1px solid ${dark ? 'rgb(var(--color-accent-rgb) / 0.3)' : 'rgba(135,151,107,0.32)'}`, display: 'flex', alignItems: 'center' }}>
              <span style={{ color: dark ? '#FFFFFF' : '#10150B', fontFamily: 'DM Sans, sans-serif', fontSize: 5, fontWeight: 700 }}>Run</span>
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
                <div style={{ height: 10, padding: '0 4px', borderRadius: 3, background: dark ? 'var(--color-accent)' : '#87976B', display: 'flex', alignItems: 'center' }}>
                  <span style={{ color: '#0F0F13', fontFamily: 'DM Sans, sans-serif', fontSize: 4.5, fontWeight: 700 }}>{APP_BASE_RELEASE_LABEL}</span>
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function PreferencesModal({ onClose, initialTab = 'general' }: Props) {
  const [tab, setTab] = useState(initialTab)

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  // General
  const [language, setLanguage]           = useState(getSavedSetting('language', 'English'))
  const [startupAction, setStartupAction] = useState(getSavedSetting('startupAction', 'Open last workspace'))
  const [realtimeCalc, setRealtimeCalc]   = useState(getSavedSetting('realtimeCalc', true))

  const [theme, setTheme] = useState<'Dark' | 'Light'>(() => getSavedThemeSetting())
  const [fontScale, setFontScale] = useState<FontSizeOption>(() => getSavedFontScaleSetting())

  // Autosave
  const [autosaveOn, setAutosaveOn]             = useState(getSavedSetting('autosaveOn', true))
  const [autosaveInterval, setAutosaveInterval] = useState(getSavedSetting('autosaveInterval', 'Every 1 minute'))
  const [warnUnsaved, setWarnUnsaved]           = useState(getSavedSetting('warnUnsaved', true))

  // Algorithm
  const [maxIterations, setMaxIterations]         = useState(getSavedSetting('maxIterations', 300))
  const [stopCriterion, setStopCriterion]         = useState(getSavedSetting('stopCriterion', '1e-7'))
  const [initialWeights, setInitialWeights]       = useState(getSavedSetting('initialWeights', '1 (uniform)'))
  const [innerWeighting, setInnerWeighting]       = useState(getSavedSetting('innerWeighting', 'Path weighting scheme'))
  const [defaultSubsamples, setDefaultSubsamples] = useState(getSavedSetting('defaultSubsamples', 500))
  const [defaultSeed, setDefaultSeed]             = useState(getSavedSetting('defaultSeed', 'Auto'))

  // Export
  const [exportFormat, setExportFormat]   = useState('HTML (.html)') // Locked
  const [decimalPlaces, setDecimalPlaces] = useState(getSavedSetting('decimalPlaces', 3))

  const handleSave = () => {
    localStorage.setItem('pls:prefs:language', language)
    localStorage.setItem('pls:prefs:startupAction', startupAction)
    localStorage.setItem('pls:prefs:realtimeCalc', String(realtimeCalc))
    localStorage.setItem('metis:prefs:theme', theme)
    localStorage.setItem('pls:prefs:theme', theme)
    localStorage.setItem(METIS_PREF_FONT_SCALE_KEY, fontScale)
    void (window as any).electronAPI?.setThemePreference?.(theme.toLowerCase())
    localStorage.setItem('pls:prefs:autosaveOn', String(autosaveOn))
    localStorage.setItem('pls:prefs:autosaveInterval', autosaveInterval)
    localStorage.setItem('pls:prefs:warnUnsaved', String(warnUnsaved))
    localStorage.setItem('pls:prefs:maxIterations', String(maxIterations))
    localStorage.setItem('pls:prefs:stopCriterion', stopCriterion)
    localStorage.setItem('pls:prefs:initialWeights', initialWeights)
    localStorage.setItem('pls:prefs:innerWeighting', innerWeighting)
    localStorage.setItem('pls:prefs:defaultSubsamples', String(defaultSubsamples))
    localStorage.setItem('pls:prefs:defaultSeed', defaultSeed)
    localStorage.setItem('pls:prefs:exportFormat', exportFormat)
    localStorage.setItem('pls:prefs:decimalPlaces', String(decimalPlaces))
    
    window.dispatchEvent(new Event('pls:preferences-updated'))
    onClose()
  }

  const handleReset = () => {
    setLanguage('English')
    setStartupAction('Open last workspace')
    setRealtimeCalc(true)
    setTheme('Dark')
    setFontScale('Default')
    setAutosaveOn(true)
    setAutosaveInterval('Every 1 minute')
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: UI.overlay }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col overflow-hidden"
        style={{ width: 'min(860px, 96vw)', maxHeight: '90vh', background: UI.page, borderRadius: 22, border: 'none', boxShadow: 'var(--shadow-modal)' }}
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
              style={{ height: 32, padding: '0 12px', borderRadius: 12, border: 'none', background: UI.input, cursor: 'pointer', gap: 7 }}
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
            style={{ width: 185, background: UI.elevated, padding: '10px 8px', gap: 2 }}
          >
            {NAV_ITEMS.map(item => {
              const Icon = item.icon
              const active = tab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className="flex items-center text-left transition-colors"
                  style={{ gap: 10, height: 38, padding: '0 12px', borderRadius: 14, border: 'none', cursor: 'pointer', background: active ? UI.surface : 'transparent' }}
                >
                  <Icon size={14} color={active ? 'var(--color-accent)' : 'var(--color-text-muted)'} weight={active ? 'fill' : 'regular'} />
                  <span style={{ color: active ? UI.text : UI.textMuted, fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: active ? 600 : 400 }}>
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
                    <SelectBox value={language} options={['English']} onChange={setLanguage} />
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
                    onClick={() => setTheme('Dark')}
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
                    onClick={() => setTheme('Light')}
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
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <RocketLaunch size={15} color="var(--color-accent)" weight="fill" />
                      <span style={{ color: UI.text, fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700 }}>Updates</span>
                    </div>
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <button
                        onClick={() => openMetisExternal(METIS_UPDATES_URL)}
                        className="flex items-center justify-center hover:opacity-90 transition-opacity"
                        style={{ height: 32, padding: '0 12px', borderRadius: 12, border: 'none', background: 'rgba(170,17,85,0.11)', cursor: 'pointer', gap: 7 }}
                      >
                        <ArrowsClockwise size={13} color="var(--color-accent)" />
                        <span style={{ color: UI.accent, fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700 }}>Check updates</span>
                      </button>
                      <button
                        onClick={() => openMetisExternal(METIS_UPDATES_URL)}
                        className="flex items-center justify-center hover:bg-[rgb(var(--color-hover-rgb)/0.75)] transition-colors"
                        style={{ height: 32, padding: '0 12px', borderRadius: 12, border: 'none', background: UI.input, cursor: 'pointer', gap: 7 }}
                      >
                        <Notebook size={13} color="var(--color-text-secondary)" />
                        <span style={{ color: UI.textSecondary, fontFamily: 'DM Sans, sans-serif', fontSize: 10.5, fontWeight: 700 }}>Release notes</span>
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
                        ['UI',      'Electron + React + TypeScript', false],
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
