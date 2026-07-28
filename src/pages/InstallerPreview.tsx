import { CaretDown, Check, FolderOpen, Globe, Moon, RocketLaunch, Sun } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import logoBlack from '../assets/logo-black.svg'
import logoWhite from '../assets/logo-white.svg'
import { APP_BRAND_NAME } from '../config/appBranding'

const INSTALL_STEPS = [
  { label: 'Preparing files', detail: 'Preparing files', stopAt: 12 },
  { label: 'Installing R engine', detail: 'Installing R engine', stopAt: 40 },
  { label: 'Extracting R engine', detail: 'Extracting R engine', stopAt: 85 },
  { label: 'Creating workspace', detail: 'Creating workspace', stopAt: 95 },
  { label: 'Saving setup', detail: 'Saving setup', stopAt: 100 },
]

type InstallerPhase = 'options' | 'installing' | 'complete'
type SetupTheme = 'Dark' | 'Light'
type SetupLanguage = 'English' | 'Español' | 'Português' | 'Français'

const THEME_OPTIONS = ['Light', 'Dark'] as const
const LANGUAGE_OPTIONS = ['English', 'Español', 'Português', 'Français'] as const
const INSTALLER_PREF_THEME_KEY = 'metis:installer:theme'
const METIS_PREF_THEME_KEY = 'metis:prefs:theme'
const LEGACY_PREF_THEME_KEY = 'pls:prefs:theme'
const METIS_PREF_LANGUAGE_KEY = 'metis:prefs:language'
const LEGACY_PREF_LANGUAGE_KEY = 'pls:prefs:language'
const FF = 'Matter, sans-serif'
const DEFAULT_ROOT_PATH = ''
const ACCENT_HEX = 'var(--color-accent)'
const ACCENT_RGB = 'var(--color-accent-rgb)'
const TEXT_PRIMARY = 'var(--color-text-primary)'
const TEXT_SECONDARY = 'var(--color-text-secondary)'
const TEXT_MUTED = 'rgb(var(--color-text-secondary-rgb) / 0.72)'
const BORDER_SOFT = 'var(--color-floating-border-soft)'
const BORDER_STRONG = 'var(--color-floating-border)'
const DRAG_REGION_STYLE: CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' } = {
  WebkitAppRegion: 'drag',
}
const NO_DRAG_STYLE: CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' } = {
  WebkitAppRegion: 'no-drag',
}
const PLATFORM = (window as any).electronAPI?.platform || 'win32'
const IS_WINDOWS = PLATFORM === 'win32'
const PATH_SEPARATOR = IS_WINDOWS ? '\\' : '/'
const SETUP_VERB = IS_WINDOWS ? 'Install' : 'Set up'

function getSystemSetupTheme(): SetupTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'Dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'Light' : 'Dark'
}

function getInitialSetupTheme(): SetupTheme {
  try {
    const savedTheme = localStorage.getItem(INSTALLER_PREF_THEME_KEY)
    if (savedTheme === 'Light' || savedTheme === 'Dark') return savedTheme
  } catch {}
  return getSystemSetupTheme()
}

function normalizeSetupLanguage(value: unknown): SetupLanguage | null {
  const language = String(value ?? '').trim().toLowerCase()
  if (language === 'english' || language.startsWith('en')) return 'English'
  if (language === 'español' || language === 'spanish' || language.startsWith('es')) return 'Español'
  if (language === 'português' || language === 'portuguese' || language.startsWith('pt')) return 'Português'
  if (language === 'français' || language === 'french' || language.startsWith('fr')) return 'Français'
  return null
}

function getSystemSetupLanguage(): SetupLanguage {
  if (typeof navigator === 'undefined') return 'English'
  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ]
  for (const candidate of candidates) {
    const language = normalizeSetupLanguage(candidate)
    if (language) return language
  }
  return 'English'
}

function getInitialSetupLanguage(): SetupLanguage {
  try {
    const savedLanguage = localStorage.getItem(METIS_PREF_LANGUAGE_KEY) ?? localStorage.getItem(LEGACY_PREF_LANGUAGE_KEY)
    const language = normalizeSetupLanguage(savedLanguage)
    if (language) return language
  } catch {}
  return getSystemSetupLanguage()
}

function previewSetupTheme(theme: SetupTheme) {
  document.documentElement.setAttribute('data-theme', theme === 'Light' ? 'light' : 'dark')
  document.body.setAttribute('data-theme', theme === 'Light' ? 'light' : 'dark')
  void (window as any).electronAPI?.setThemePreference?.(theme.toLowerCase())
}

function applySetupTheme(theme: SetupTheme) {
  localStorage.setItem(INSTALLER_PREF_THEME_KEY, theme)
  localStorage.setItem(METIS_PREF_THEME_KEY, theme)
  localStorage.setItem(LEGACY_PREF_THEME_KEY, theme)
  previewSetupTheme(theme)
  window.dispatchEvent(new CustomEvent('pls:preferences-updated'))
}

function applySetupLanguage(language: SetupLanguage) {
  localStorage.setItem(METIS_PREF_LANGUAGE_KEY, language)
  localStorage.setItem(LEGACY_PREF_LANGUAGE_KEY, language)
  window.dispatchEvent(new CustomEvent('pls:preferences-updated'))
}

function displayBrandName() {
  return APP_BRAND_NAME ? `${APP_BRAND_NAME[0].toUpperCase()}${APP_BRAND_NAME.slice(1)}` : 'Metis'
}

function ActionButton({
  children,
  onClick,
  primary = false,
  disabled = false,
}: {
  children: React.ReactNode
  onClick?: () => void
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        ...NO_DRAG_STYLE,
        minWidth: primary ? 76 : 78,
        height: 38,
        padding: '0 18px',
        borderRadius: 8,
        background: disabled ? 'var(--color-elevated)' : primary ? ACCENT_HEX : 'var(--color-input)',
        border: primary ? `1px solid rgb(${ACCENT_RGB} / 0.42)` : `1px solid ${BORDER_SOFT}`,
        color: disabled ? TEXT_MUTED : primary ? 'var(--color-on-accent)' : TEXT_PRIMARY,
        fontFamily: FF,
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.8 : 1,
        boxShadow: primary && !disabled ? `0 8px 16px rgb(${ACCENT_RGB} / 0.28)` : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function BrandMark({ logoSrc, pulse = false }: { logoSrc: string; pulse?: boolean }) {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: 'rgb(var(--color-accent-rgb) / 0.08)',
        border: `1px solid rgb(${ACCENT_RGB} / 0.24)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <img
        src={logoSrc}
        alt=""
        style={{
          width: '66%',
          height: '66%',
          maxWidth: 29,
          maxHeight: 29,
          display: 'block',
          objectFit: 'contain',
          flexShrink: 0,
          animation: pulse ? 'logo-pulse 2.4s ease-in-out infinite' : 'none',
        }}
      />
    </div>
  )
}

function Header({ logoSrc, title, subtitle, pulse = false }: { logoSrc: string; title: string; subtitle: string; pulse?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '28px 28px 4px', ...DRAG_REGION_STYLE }}>
      <BrandMark logoSrc={logoSrc} pulse={pulse} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ margin: 0, color: TEXT_PRIMARY, fontFamily: FF, fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>
          {title}
        </h1>
        <p style={{ margin: 0, color: TEXT_SECONDARY, fontFamily: FF, fontSize: 13, lineHeight: 1.45 }}>
          {subtitle}
        </p>
      </div>
    </div>
  )
}

function AppearanceChoice({ theme, onThemeChange }: { theme: SetupTheme; onThemeChange: (theme: SetupTheme) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ color: TEXT_SECONDARY, fontFamily: FF, fontSize: 12, fontWeight: 700 }}>
        Appearance
      </span>
      <div
        style={{
          ...NO_DRAG_STYLE,
          width: 'fit-content',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: 4,
          borderRadius: 10,
          background: 'var(--color-elevated)',
          border: `1px solid ${BORDER_SOFT}`,
        }}
      >
        {THEME_OPTIONS.map((option) => {
          const active = theme === option
          const Icon = option === 'Light' ? Sun : Moon
          return (
            <button
              key={option}
              type="button"
              onClick={() => onThemeChange(option)}
              aria-pressed={active}
              style={{
                height: 28,
                minWidth: 74,
                borderRadius: 7,
                border: `1px solid ${active ? BORDER_SOFT : 'transparent'}`,
                background: active ? 'var(--color-input)' : 'transparent',
                color: active ? TEXT_PRIMARY : TEXT_SECONDARY,
                fontFamily: FF,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                boxShadow: active ? '0 2px 6px rgb(15 18 25 / 0.06)' : 'none',
              }}
            >
              <Icon size={12} />
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LanguageChoice({
  selectedLanguage,
  setSelectedLanguage,
}: {
  selectedLanguage: SetupLanguage
  setSelectedLanguage: (language: SetupLanguage) => void
}) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ color: TEXT_SECONDARY, fontFamily: FF, fontSize: 12, fontWeight: 500 }}>
        Language
      </span>
      <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={open}
          style={{
            ...NO_DRAG_STYLE,
            height: 36,
            minWidth: 140,
            padding: '0 12px',
            borderRadius: 8,
            background: 'var(--color-input)',
            border: `1px solid ${BORDER_STRONG}`,
            color: TEXT_PRIMARY,
            fontFamily: FF,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Globe size={14} color={TEXT_SECONDARY} />
            <span>{selectedLanguage}</span>
          </div>
          <CaretDown
            size={12}
            color={TEXT_SECONDARY}
            style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }}
          />
        </button>

        {open && (
          <div
            role="listbox"
            style={{
              ...NO_DRAG_STYLE,
              position: 'absolute',
              top: '100%',
              marginTop: 4,
              left: 0,
              width: '100%',
              minWidth: 140,
              borderRadius: 8,
              background: 'var(--color-elevated)',
              border: `1px solid ${BORDER_SOFT}`,
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              boxShadow: '0 8px 20px rgba(0,0,0,0.22)',
              zIndex: 50,
            }}
          >
            {LANGUAGE_OPTIONS.map((option) => {
              const active = selectedLanguage === option
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setSelectedLanguage(option)
                    setOpen(false)
                  }}
                  style={{
                    height: 28,
                    padding: '0 8px',
                    borderRadius: 6,
                    border: 'none',
                    background: active ? 'var(--color-input)' : 'transparent',
                    color: active ? TEXT_PRIMARY : TEXT_SECONDARY,
                    fontFamily: FF,
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    textAlign: 'left',
                  }}
                >
                  <span>{option}</span>
                  {active && <Check size={12} color={ACCENT_HEX} weight="bold" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function InstallerPreview() {
  const navigate = useNavigate()
  const api = (window as any).electronAPI

  const [phase, setPhase] = useState<InstallerPhase>('options')
  const [progress, setProgress] = useState(0)
  const [installDone, setInstallDone] = useState(false)
  const [ipcStep, setIpcStep] = useState<{ step: string; label: string; detail: string } | null>(null)
  const isExtracting = ipcStep?.step === 'extracting'
  const [createShortcut, setCreateShortcut] = useState(true)
  const [rootPath, setRootPath] = useState(DEFAULT_ROOT_PATH)
  const [resolvedInstallPath, setResolvedInstallPath] = useState('')
  const [installError, setInstallError] = useState('')
  const [isBrowsing, setIsBrowsing] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState<SetupTheme>(() => getInitialSetupTheme())
  const [selectedLanguage, setSelectedLanguage] = useState<SetupLanguage>(() => getInitialSetupLanguage())
  const [telemetryConsent, setTelemetryConsent] = useState<'pending' | 'accepted' | 'declined'>('pending')
  const logoSrc = selectedTheme === 'Light' ? logoBlack : logoWhite
  const brand = displayBrandName()

  useEffect(() => {
    applySetupLanguage(selectedLanguage)
  }, [selectedLanguage])

  const displayPath = rootPath.trim()
    ? `${rootPath.trim().replace(/[\\/]+$/, '')}${PATH_SEPARATOR}metis`
    : ''

  useEffect(() => {
    api?.getInstallDefaultPaths?.().then((r: any) => {
      if (r?.success) setRootPath(r.current ?? r.downloads ?? DEFAULT_ROOT_PATH)
    }).catch(() => {})

    api?.getTelemetryStatus?.().then((r: any) => {
      if (r?.consentSet) setTelemetryConsent(r.consentGiven ? 'accepted' : 'declined')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (phase !== 'complete' || telemetryConsent !== 'pending') return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleTelemetryChoice(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, telemetryConsent])

  const handleTelemetryChoice = (consent: boolean) => {
    setTelemetryConsent(consent ? 'accepted' : 'declined')
    void api?.setTelemetryConsent?.(consent)
  }

  const handleThemeChange = (theme: SetupTheme) => {
    setSelectedTheme(theme)
    applySetupTheme(theme)
  }

  useEffect(() => {
    previewSetupTheme(selectedTheme)
  }, [selectedTheme])

  useEffect(() => {
    if (!api?.onInstallProgress) return
    const LABELS: Record<string, { label: string; detail: string }> = {
      workspace: { label: 'Creating workspace', detail: 'Creating workspace' },
      extracting: { label: 'Extracting R engine', detail: 'Extracting R engine' },
      finalizing: { label: 'Saving setup', detail: 'Saving setup' },
    }
    const unsub = api.onInstallProgress((data: { step: string; detail: string }) => {
      const mapped = LABELS[data.step] ?? { label: data.step, detail: data.detail }
      setIpcStep({ step: data.step, ...mapped, detail: data.detail })
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (phase !== 'installing') return
    const id = window.setInterval(() => {
      setProgress((cur) => {
        if (cur >= 100) return 100
        if (installDone) return Math.min(100, cur + 4)
        const inc = cur < 18 ? 2 : cur < 40 ? 1 : isExtracting ? 0.04 : cur < 99 ? 0.15 : 0
        return Math.min(99, cur + inc)
      })
    }, 120)
    return () => window.clearInterval(id)
  }, [phase, installDone, isExtracting])

  useEffect(() => {
    if (phase === 'installing' && progress >= 100) {
      const t = window.setTimeout(() => setPhase('complete'), 500)
      return () => window.clearTimeout(t)
    }
  }, [phase, progress])

  const activeStep = useMemo(() => {
    if (ipcStep) return ipcStep
    return INSTALL_STEPS.find((s) => progress <= s.stopAt) ?? INSTALL_STEPS[INSTALL_STEPS.length - 1]
  }, [progress, ipcStep])

  const handleBrowse = async () => {
    if (!api?.selectInstallDirectory) return
    setIsBrowsing(true)
    try {
      const r = await api.selectInstallDirectory()
      if (!r?.canceled && r?.path) {
        setRootPath(r.path)
        setInstallError('')
      }
    } finally {
      setIsBrowsing(false)
    }
  }

  const handleInstall = async () => {
    setInstallError('')
    if (!rootPath.trim()) {
      setInstallError('Choose an install location.')
      return
    }
    setInstallDone(false)
    setProgress(0)
    setPhase('installing')
    if (api?.runInstall) {
      try {
        const r = await api.runInstall(rootPath.trim(), { createShortcut: IS_WINDOWS && createShortcut })
        if (!r?.success) {
          setPhase('options')
          setInstallError(r?.error ?? 'Installation failed.')
          return
        }
        setResolvedInstallPath(r.resolvedPath ?? displayPath)
      } catch (e: any) {
        setPhase('options')
        setInstallError(e?.message ?? 'Unexpected error.')
        return
      }
    } else {
      setResolvedInstallPath(displayPath)
    }
    setInstallDone(true)
  }

  const handleCancel = () => {
    if (api?.closeInstaller) api.closeInstaller()
    else {
      setProgress(0)
      setInstallDone(false)
      setIpcStep(null)
      setPhase('options')
      setInstallError('')
    }
  }

  const renderContent = () => {
    if (phase === 'installing') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          <div
            style={{
              borderRadius: 12,
              background: 'transparent',
              border: 'none',
              padding: '14px 0',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ color: TEXT_PRIMARY, fontFamily: FF, fontSize: 13, fontWeight: 700 }}>
                {activeStep.label}
              </span>
              <span style={{ color: TEXT_SECONDARY, fontFamily: FF, fontSize: 12, fontWeight: 700 }}>
                {Math.floor(progress)}%
              </span>
            </div>
            <div style={{ width: '100%', height: 8, borderRadius: 999, background: 'var(--color-input)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: ACCENT_HEX,
                  boxShadow: `0 0 12px rgb(${ACCENT_RGB} / 0.32)`,
                  transition: 'width 520ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            </div>
            <span style={{ color: TEXT_MUTED, fontFamily: FF, fontSize: 12 }}>
              {activeStep.detail}
            </span>
          </div>
        </div>
      )
    }

    if (phase === 'complete') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
          <div style={{ background: 'transparent', border: 'none', padding: 0 }}>
            <span style={{ color: TEXT_SECONDARY, fontFamily: FF, fontSize: 12, fontWeight: 500 }}>
              Installed to
            </span>
            <p style={{ margin: '4px 0 0', color: TEXT_PRIMARY, fontFamily: FF, fontSize: 12, lineHeight: 1.45, wordBreak: 'break-all' }}>
              {resolvedInstallPath || displayPath}
            </p>
          </div>

          <div style={{ background: 'transparent', border: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ color: TEXT_PRIMARY, fontFamily: FF, fontSize: 12, fontWeight: 500 }}>
              Anonymous Installation Telemetry (Optional)
            </span>
            <p style={{ margin: 0, color: TEXT_SECONDARY, fontFamily: FF, fontSize: 11.5, lineHeight: 1.45 }}>
              Send a single non-identifying ping (OS, App Version, CPU Arch) to help report adoption metrics. No research data leaves your computer.
            </p>
            {telemetryConsent === 'pending' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => handleTelemetryChoice(false)}
                  style={{
                    ...NO_DRAG_STYLE,
                    flex: 1,
                    height: 32,
                    borderRadius: 8,
                    background: 'var(--color-input)',
                    border: `1px solid ${BORDER_STRONG}`,
                    color: TEXT_PRIMARY,
                    fontFamily: FF,
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  No Thanks (Esc)
                </button>
                <button
                  type="button"
                  onClick={() => handleTelemetryChoice(true)}
                  style={{
                    ...NO_DRAG_STYLE,
                    flex: 1,
                    height: 32,
                    borderRadius: 8,
                    background: 'var(--color-input)',
                    border: `1px solid rgb(${ACCENT_RGB} / 0.35)`,
                    color: ACCENT_HEX,
                    fontFamily: FF,
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Send Anonymous Ping
                </button>
              </div>
            ) : (
              <span style={{ color: ACCENT_HEX, fontFamily: FF, fontSize: 11.5, fontWeight: 600 }}>
                ✓ Preference recorded ({telemetryConsent === 'accepted' ? 'Ping sent' : 'Ping declined'}).
              </span>
            )}
          </div>

          <div style={{ background: 'transparent', border: 'none', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Check size={16} weight="bold" color={ACCENT_HEX} />
            <span style={{ color: TEXT_SECONDARY, fontFamily: FF, fontSize: 12 }}>
              Installation complete.
            </span>
          </div>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ color: TEXT_SECONDARY, fontFamily: FF, fontSize: 12, fontWeight: 500 }}>
            Workspace folder
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              value={displayPath}
              onChange={(e) => {
                const raw = e.target.value
                const stripped = raw.replace(/[\\/]metis$/i, '')
                setRootPath(stripped)
                setInstallError('')
              }}
              spellCheck={false}
              placeholder="Choose a directory..."
              style={{
                ...NO_DRAG_STYLE,
                flex: 1,
                height: 36,
                minWidth: 0,
                borderRadius: 8,
                background: 'var(--color-input)',
                border: `1px solid ${installError ? 'rgba(217,107,77,0.52)' : BORDER_STRONG}`,
                color: TEXT_PRIMARY,
                padding: '0 10px',
                fontFamily: FF,
                fontSize: 12,
                outline: 'none',
              }}
            />
            <button
              onClick={handleBrowse}
              disabled={isBrowsing}
              type="button"
              style={{
                ...NO_DRAG_STYLE,
                height: 36,
                padding: '0 12px',
                borderRadius: 8,
                background: 'var(--color-input)',
                border: `1px solid ${BORDER_STRONG}`,
                color: TEXT_PRIMARY,
                fontFamily: FF,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexShrink: 0,
              }}
            >
              <FolderOpen size={14} /> Browse
            </button>
          </div>
          {installError && (
            <span style={{ color: 'var(--color-danger)', fontFamily: FF, fontSize: 11 }}>
              {installError}
            </span>
          )}
        </div>

        {IS_WINDOWS && (
        <label style={{ ...NO_DRAG_STYLE, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={createShortcut} onChange={(e) => setCreateShortcut(e.target.checked)} style={{ display: 'none' }} />
          <span
            style={{
              width: 36,
              height: 20,
              borderRadius: 999,
              padding: 2,
              background: createShortcut ? ACCENT_HEX : 'var(--color-elevated)',
              border: `1px solid ${createShortcut ? `rgb(${ACCENT_RGB} / 0.42)` : BORDER_SOFT}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: createShortcut ? 'flex-end' : 'flex-start',
              transition: 'background 160ms ease',
            }}
          >
            <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--color-surface)' }} />
          </span>
          <span style={{ color: TEXT_PRIMARY, fontFamily: FF, fontSize: 13 }}>
            Add desktop shortcut
          </span>
        </label>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          <AppearanceChoice theme={selectedTheme} onThemeChange={handleThemeChange} />
          <LanguageChoice selectedLanguage={selectedLanguage} setSelectedLanguage={setSelectedLanguage} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--color-surface)', padding: 0 }}>
      <style>{`
        @keyframes logo-pulse { 0%,100% { opacity:0.88; transform:scale(1); } 50% { opacity:1; transform:scale(1.04); } }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', overflow: 'hidden' }}>
        <Header
          logoSrc={logoSrc}
          pulse={phase === 'installing'}
          title={phase === 'complete' ? `${brand} is ready` : phase === 'installing' ? `Setting up ${brand}` : `${SETUP_VERB} ${brand}`}
          subtitle={phase === 'complete' ? 'Setup complete.' : phase === 'installing' ? activeStep.detail : 'Choose a workspace folder and prepare the bundled R engine.'}
        />

        <div
          className="installer-preview-phase-content"
          style={{ flex: 1, overflow: 'visible', display: 'flex', flexDirection: 'column', padding: '16px 28px', minHeight: 0 }}
        >
          {renderContent()}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '16px 28px', borderTop: 'none' }}>
          {phase === 'options' && (
            <>
              <ActionButton onClick={handleCancel}>Cancel</ActionButton>
              <ActionButton primary onClick={handleInstall} disabled={!rootPath.trim()}>{SETUP_VERB}</ActionButton>
            </>
          )}
          {phase === 'installing' && (
            <>
              <ActionButton onClick={handleCancel}>Cancel</ActionButton>
              <ActionButton primary disabled>Installing</ActionButton>
            </>
          )}
          {phase === 'complete' && (
            <>
              <ActionButton onClick={() => api?.closeInstaller ? api.closeInstaller() : setPhase('options')}>Finish</ActionButton>
              <ActionButton primary onClick={() => api?.launchApp ? api.launchApp() : navigate('/')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <RocketLaunch size={14} weight="fill" /> Launch
                </span>
              </ActionButton>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
