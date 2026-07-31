import { CaretDown, Check, FolderOpen, Globe, Moon, RocketLaunch, Sun } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import logoBlack from '../assets/logo-black.svg'
import logoWhite from '../assets/logo-white.svg'
import setupImg from '../assets/setup.png'
import { APP_BASE_RELEASE_LABEL, APP_BRAND_NAME, APP_EDITION } from '../config/appBranding'

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
const TEXT_PRIMARY = 'var(--color-text-primary)'
const TEXT_SECONDARY = 'var(--color-text-secondary)'
const TEXT_MUTED = 'rgb(var(--color-text-secondary-rgb) / 0.72)'
const NO_DRAG_STYLE: CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' } = {
  WebkitAppRegion: 'no-drag',
}
const DRAG_REGION_STYLE: CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' } = {
  WebkitAppRegion: 'drag',
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

// ── Action button (No bold font for CTA) ──────────────────────────────────────
function ActionButton({
  children,
  onClick,
  primary = false,
  disabled = false,
  isLight = false,
}: {
  children: React.ReactNode
  onClick?: () => void
  primary?: boolean
  disabled?: boolean
  isLight?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        ...NO_DRAG_STYLE,
        minWidth: primary ? 64 : 54,
        height: 28,
        padding: '0 12px',
        borderRadius: 7,
        background: disabled
          ? isLight ? '#F6F6F6' : '#262626'
          : primary ? (isLight ? '#7E9362' : ACCENT_HEX) : 'transparent',
        border: 'none',
        color: disabled
          ? isLight ? '#A0A0A0' : TEXT_MUTED
          : primary ? '#FFFFFF' : (isLight ? '#444444' : TEXT_SECONDARY),
        fontFamily: FF,
        fontSize: 11,
        fontWeight: 500, // Avoid bold font in CTA
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.78 : 1,
        boxShadow: primary && !disabled ? (isLight ? '0 2px 6px rgba(126,147,98,0.22)' : `0 2px 6px rgb(var(--color-accent-rgb) / 0.22)`) : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

// ── Theme toggle pill ────────────────────────────────────────────────────────
function ThemeToggle({
  theme,
  onThemeChange,
  isLight,
}: {
  theme: SetupTheme
  onThemeChange: (theme: SetupTheme) => void
  isLight: boolean
}) {
  return (
    <div
      style={{
        ...NO_DRAG_STYLE,
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: 2,
        background: isLight ? '#F6F6F6' : '#262626',
        border: 'none',
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
              height: 20,
              minWidth: 46,
              borderRadius: 999,
              border: 'none',
              background: active ? (isLight ? '#FFFFFF' : '#333333') : 'transparent',
              color: active ? (isLight ? '#222222' : '#FFFFFF') : (isLight ? '#777777' : '#888888'),
              fontFamily: FF,
              fontSize: 9,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              letterSpacing: 0.3,
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'background 150ms, color 150ms',
            }}
          >
            <Icon size={9} />
            {option.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}

// ── Language dropdown ────────────────────────────────────────────────────────
function LanguageDropdown({
  selectedLanguage,
  setSelectedLanguage,
  isLight,
}: {
  selectedLanguage: SetupLanguage
  setSelectedLanguage: (language: SetupLanguage) => void
  isLight: boolean
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
    <div ref={dropdownRef} style={{ ...NO_DRAG_STYLE, position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          height: 24,
          minWidth: 88,
          padding: '0 7px',
          borderRadius: 6,
          background: isLight ? '#F6F6F6' : '#262626',
          border: 'none',
          color: isLight ? '#222222' : TEXT_PRIMARY,
          fontFamily: FF,
          fontSize: 9.5,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Globe size={10} color={isLight ? '#666666' : TEXT_SECONDARY} />
          <span>{selectedLanguage}</span>
        </div>
        <CaretDown
          size={9}
          color={isLight ? '#666666' : TEXT_SECONDARY}
          style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            marginTop: 3,
            left: 0,
            width: '100%',
            minWidth: 100,
            borderRadius: 7,
            background: isLight ? '#FFFFFF' : '#262626',
            border: 'none',
            padding: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            boxShadow: '0 6px 16px rgba(0,0,0,0.14)',
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
                  height: 22,
                  padding: '0 6px',
                  borderRadius: 4,
                  border: 'none',
                  background: active ? (isLight ? '#F6F6F6' : '#333333') : 'transparent',
                  color: active ? (isLight ? '#222222' : TEXT_PRIMARY) : (isLight ? '#666666' : TEXT_SECONDARY),
                  fontFamily: FF,
                  fontSize: 9.5,
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 5,
                  textAlign: 'left',
                }}
              >
                <span>{option}</span>
                {active && <Check size={9} color={isLight ? '#7E9362' : ACCENT_HEX} weight="bold" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
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
  const editionLabel = APP_EDITION === 'Lite' ? 'lite' : 'bundle'
  const isLight = selectedTheme === 'Light'

  const headerTitleColor = isLight ? '#7E9362' : '#FFFFFF'
  const leftCardBg = isLight ? '#F0F4EC' : '#262626'
  const rightBg = isLight ? '#FFFFFF' : 'var(--color-surface)'
  const childItemBg = isLight ? '#F6F6F6' : '#262626'
  const childTextColor = isLight ? '#222222' : TEXT_PRIMARY
  const childMutedColor = isLight ? '#666666' : TEXT_MUTED
  const editionPillBg = isLight ? '#F6F6F6' : '#262626'
  const editionPillColor = isLight ? '#555555' : TEXT_SECONDARY

  useEffect(() => {
    applySetupLanguage(selectedLanguage)
  }, [selectedLanguage])

  const displayPath = rootPath.trim()
    ? `${rootPath.trim().replace(/[\/\\]+$/, '')}${PATH_SEPARATOR}metis`
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

  // ── Right panel content ──────────────────────────────────────────────────
  const renderContent = () => {
    if (phase === 'installing') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: childTextColor, fontFamily: FF, fontSize: 10.5, fontWeight: 600 }}>
              {activeStep.label}
            </span>
            <span style={{ color: childMutedColor, fontFamily: FF, fontSize: 9.5, fontWeight: 600 }}>
              {Math.floor(progress)}%
            </span>
          </div>
          <div style={{ width: '100%', height: 4, borderRadius: 999, background: childItemBg, overflow: 'hidden' }}>
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                borderRadius: 999,
                background: isLight ? '#7E9362' : ACCENT_HEX,
                boxShadow: isLight ? '0 0 6px rgba(126,147,98,0.4)' : `0 0 6px rgb(var(--color-accent-rgb) / 0.32)`,
                transition: 'width 520ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </div>
          <span style={{ color: childMutedColor, fontFamily: FF, fontSize: 9.5 }}>
            {activeStep.detail}
          </span>
        </div>
      )
    }

    if (phase === 'complete') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, justifyContent: 'center' }}>
          <div>
            <span style={{ color: childMutedColor, fontFamily: FF, fontSize: 9.5, fontWeight: 500 }}>
              Installed to
            </span>
            <p style={{ margin: '1px 0 0', color: childTextColor, fontFamily: FF, fontSize: 9.5, lineHeight: 1.35, wordBreak: 'break-all' }}>
              {resolvedInstallPath || displayPath}
            </p>
          </div>

          {telemetryConsent === 'pending' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ color: childMutedColor, fontFamily: FF, fontSize: 9.5, fontWeight: 500 }}>
                Anonymous telemetry (optional)
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <button
                  type="button"
                  onClick={() => handleTelemetryChoice(false)}
                  style={{
                    ...NO_DRAG_STYLE,
                    flex: 1,
                    height: 24,
                    borderRadius: 6,
                    background: childItemBg,
                    border: 'none',
                    color: childTextColor,
                    fontFamily: FF,
                    fontSize: 9.5,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  No thanks
                </button>
                <button
                  type="button"
                  onClick={() => handleTelemetryChoice(true)}
                  style={{
                    ...NO_DRAG_STYLE,
                    flex: 1,
                    height: 24,
                    borderRadius: 6,
                    background: childItemBg,
                    border: 'none',
                    color: isLight ? '#7E9362' : ACCENT_HEX,
                    fontFamily: FF,
                    fontSize: 9.5,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Allow
                </button>
              </div>
            </div>
          ) : (
            <span style={{ color: isLight ? '#7E9362' : ACCENT_HEX, fontFamily: FF, fontSize: 9.5, fontWeight: 500 }}>
              ✓ {telemetryConsent === 'accepted' ? 'Ping sent.' : 'Ping declined.'}
            </span>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Check size={11} weight="bold" color={isLight ? '#7E9362' : ACCENT_HEX} />
            <span style={{ color: childMutedColor, fontFamily: FF, fontSize: 9.5 }}>
              Installation complete.
            </span>
          </div>
        </div>
      )
    }

    // Options phase
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, justifyContent: 'center' }}>
        {/* Theme + Language in a row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
          <ThemeToggle theme={selectedTheme} onThemeChange={handleThemeChange} isLight={isLight} />
          <LanguageDropdown selectedLanguage={selectedLanguage} setSelectedLanguage={setSelectedLanguage} isLight={isLight} />
        </div>

        {/* Folder path */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ color: childMutedColor, fontFamily: FF, fontSize: 9.5, fontWeight: 500 }}>
            Workspace folder
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              value={displayPath}
              onChange={(e) => {
                const raw = e.target.value
                const stripped = raw.replace(/[\/\\]metis$/i, '')
                setRootPath(stripped)
                setInstallError('')
              }}
              spellCheck={false}
              placeholder="Choose a directory..."
              style={{
                ...NO_DRAG_STYLE,
                flex: 1,
                height: 24,
                minWidth: 0,
                borderRadius: 6,
                background: childItemBg,
                border: 'none',
                color: childTextColor,
                padding: '0 7px',
                fontFamily: FF,
                fontSize: 9.5,
                outline: 'none',
              }}
            />
            {/* Icon-only browse button without background fill */}
            <button
              onClick={handleBrowse}
              disabled={isBrowsing}
              type="button"
              title="Browse directory"
              style={{
                ...NO_DRAG_STYLE,
                height: 24,
                width: 24,
                borderRadius: 6,
                background: 'transparent',
                border: 'none',
                color: childTextColor,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FolderOpen size={14} color={childMutedColor} />
            </button>
          </div>
          {installError && (
            <span style={{ color: 'var(--color-danger)', fontFamily: FF, fontSize: 9 }}>
              {installError}
            </span>
          )}
        </div>

        {/* Desktop shortcut (Windows only, inline) */}
        {IS_WINDOWS && (
          <label style={{ ...NO_DRAG_STYLE, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={createShortcut} onChange={(e) => setCreateShortcut(e.target.checked)} style={{ display: 'none' }} />
            <span
              style={{
                width: 24,
                height: 14,
                borderRadius: 999,
                padding: 1.5,
                background: createShortcut ? (isLight ? '#7E9362' : ACCENT_HEX) : childItemBg,
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: createShortcut ? 'flex-end' : 'flex-start',
                transition: 'background 160ms ease',
                flexShrink: 0,
              }}
            >
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: isLight ? '#FFFFFF' : 'var(--color-surface)' }} />
            </span>
            <span style={{ color: childMutedColor, fontFamily: FF, fontSize: 9.5 }}>
              Add desktop shortcut
            </span>
          </label>
        )}
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: rightBg, padding: 0 }}>
      <style>{`
        @keyframes logo-pulse { 0%,100% { opacity:0.88; transform:scale(1); } 50% { opacity:1; transform:scale(1.04); } }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'row', overflow: 'hidden', padding: 6 }}>

        {/* ── Left panel: equal 50% width rounded container ── */}
        <div
          style={{
            ...DRAG_REGION_STYLE,
            width: '50%',
            minWidth: '50%',
            maxWidth: '50%',
            height: '100%',
            background: leftCardBg,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative',
            flexShrink: 0,
            padding: 8,
          }}
        >
          <img
            src={setupImg}
            alt=""
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center center',
              display: 'block',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        </div>

        {/* ── Right panel: equal 50% width content ── */}
        <div
          style={{
            width: '50%',
            minWidth: '50%',
            maxWidth: '50%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: rightBg,
            padding: '8px 12px 6px 12px',
            overflow: 'hidden',
          }}
        >
          {/* Header row: logo + name + version + edition pill on extreme right */}
          <div style={{ ...DRAG_REGION_STYLE, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexShrink: 0, width: '100%' }}>
            <img
              src={logoSrc}
              alt=""
              style={{
                width: 18,
                height: 18,
                objectFit: 'contain',
                flexShrink: 0,
                filter: isLight ? 'invert(52%) sepia(21%) saturate(735%) hue-rotate(48deg) brightness(92%) contrast(85%)' : 'none',
                animation: phase === 'installing' ? 'logo-pulse 2.4s ease-in-out infinite' : 'none',
              }}
            />
            <span style={{ color: headerTitleColor, fontFamily: FF, fontSize: 15, fontWeight: 800, letterSpacing: -0.2 }}>
              {brand} {APP_BASE_RELEASE_LABEL}
            </span>
            <span
              style={{
                marginLeft: 'auto',
                height: 18,
                padding: '0 7px',
                borderRadius: 999,
                border: 'none',
                background: editionPillBg,
                color: editionPillColor,
                fontFamily: FF,
                fontSize: 9.5,
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                letterSpacing: 0.1,
              }}
            >
              {editionLabel}
            </span>
          </div>

          {/* Main content area */}
          {renderContent()}

          {/* Footer actions */}
          <div
            style={{
              ...NO_DRAG_STYLE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 5,
              marginTop: 6,
              flexShrink: 0,
            }}
          >
            {phase === 'options' && (
              <>
                <ActionButton isLight={isLight} onClick={handleCancel}>Cancel</ActionButton>
                <ActionButton isLight={isLight} primary onClick={handleInstall} disabled={!rootPath.trim()}>{SETUP_VERB}</ActionButton>
              </>
            )}
            {phase === 'installing' && (
              <>
                <ActionButton isLight={isLight} onClick={handleCancel}>Cancel</ActionButton>
                <ActionButton isLight={isLight} primary disabled>Installing…</ActionButton>
              </>
            )}
            {phase === 'complete' && (
              <>
                <ActionButton isLight={isLight} onClick={() => api?.closeInstaller ? api.closeInstaller() : setPhase('options')}>Finish</ActionButton>
                <ActionButton isLight={isLight} primary onClick={() => api?.launchApp ? api.launchApp() : navigate('/')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <RocketLaunch size={10} weight="fill" /> Launch
                  </span>
                </ActionButton>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
