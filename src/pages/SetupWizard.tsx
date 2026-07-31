import {
  ArrowClockwise,
  CaretDown,
  Check,
  Copy,
  FolderOpen,
  Globe,
  Info,
  Moon,
  Package,
  RocketLaunch,
  Sun,
  WarningCircle,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import logoBlack from '../assets/logo-black.svg'
import logoWhite from '../assets/logo-white.svg'
import setupImg from '../assets/setup.png'
import { APP_BASE_RELEASE_LABEL, APP_BRAND_NAME, APP_EDITION } from '../config/appBranding'

type Phase = 'options' | 'installing' | 'complete'
type SetupTheme = 'Dark' | 'Light'
type SetupLanguage = 'English' | 'Español' | 'Português' | 'Français'

type InstallStage =
  | 'workspace'
  | 'finding-r'
  | 'r-paused'
  | 'packages'
  | 'pkgs-failed'
  | 'finalizing'

const REQUIRED_PKGS = ['seminr', 'seminrExtras', 'plumber', 'semPower', 'readxl', 'jsonlite', 'Matrix'] as const
const THEME_OPTIONS = ['Light', 'Dark'] as const
const LANGUAGE_OPTIONS = ['English', 'Español', 'Português', 'Français'] as const
const INSTALLER_PREF_THEME_KEY = 'metis:installer:theme'
const METIS_PREF_THEME_KEY = 'metis:prefs:theme'
const LEGACY_PREF_THEME_KEY = 'pls:prefs:theme'
const METIS_PREF_LANGUAGE_KEY = 'metis:prefs:language'
const LEGACY_PREF_LANGUAGE_KEY = 'pls:prefs:language'
const R_PROGRESS_STOP = 44
const PACKAGE_PROGRESS_START = 58

type RDetectionResponse = {
  found: boolean
  path: string | null
  candidates?: string[]
  diagnostics?: string[]
  version?: string | null
  home?: string | null
  libPaths?: string[]
}

type PackageCheckResponse = {
  success: boolean
  packages?: Record<string, boolean>
  error?: string
  diagnostics?: string[]
  version?: string | null
  home?: string | null
  libPaths?: string[]
}

const PLATFORM = (window as any).electronAPI?.platform || 'win32'
const IS_WINDOWS = PLATFORM === 'win32'
const IS_MAC = PLATFORM === 'darwin'
const PATH_SEPARATOR = IS_WINDOWS ? '\\' : '/'
const RSCRIPT_LABEL = IS_WINDOWS ? 'Rscript.exe' : 'Rscript'
const RSCRIPT_PLACEHOLDER = IS_WINDOWS
  ? 'C:\\Program Files\\R\\R-4.x.x\\bin\\Rscript.exe'
  : IS_MAC
    ? '/Library/Frameworks/R.framework/Resources/bin/Rscript'
    : '/usr/bin/Rscript'
const RSCRIPT_DEFAULT_PATH = IS_WINDOWS
  ? 'C:\\Program Files\\R'
  : IS_MAC
    ? '/Library/Frameworks/R.framework/Resources/bin'
    : '/usr/bin'
const R_DOWNLOAD_URL = IS_WINDOWS
  ? 'https://cran.r-project.org/bin/windows/base/'
  : IS_MAC
    ? 'https://cran.r-project.org/bin/macosx/'
    : 'https://cran.r-project.org/bin/linux/'

const STAGE_LABELS: Record<InstallStage, { label: string; detail: string }> = {
  workspace: { label: 'Creating workspace', detail: 'Creating metis folder' },
  'finding-r': { label: 'Detecting R', detail: `Checking ${RSCRIPT_LABEL}` },
  'r-paused': { label: 'R not found', detail: `Choose ${RSCRIPT_LABEL} to continue` },
  packages: { label: 'Checking packages', detail: 'Verifying seminr, plumber, semPower…' },
  'pkgs-failed': { label: 'Packages missing', detail: 'Copy and run install command in R' },
  finalizing: { label: 'Saving setup', detail: 'Saving configuration' },
}

const DEFAULT_ROOT_PATH = ''
const FF = 'Matter, sans-serif'
const ACCENT_HEX = 'var(--color-accent)'
const TEXT_PRIMARY = 'var(--color-text-primary)'
const TEXT_SECONDARY = 'var(--color-text-secondary)'
const TEXT_MUTED = 'rgb(var(--color-text-secondary-rgb) / 0.72)'
const DRAG_REGION_STYLE: CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' } = {
  WebkitAppRegion: 'drag',
}
const NO_DRAG_STYLE: CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' } = {
  WebkitAppRegion: 'no-drag',
}

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
export default function SetupWizard() {
  const api = (window as any).electronAPI

  const [phase, setPhase] = useState<Phase>('options')
  const [stage, setStage] = useState<InstallStage>('workspace')
  const [progress, setProgress] = useState(0)
  const [installDone, setInstallDone] = useState(false)

  const [rootPath, setRootPath] = useState(DEFAULT_ROOT_PATH)
  const [isBrowsing, setIsBrowsing] = useState(false)
  const [installError, setInstallError] = useState('')

  const [rPath, setRPath] = useState('')
  const [manualRPath, setManualRPath] = useState('')
  const [rBrowsing, setRBrowsing] = useState(false)
  const rPathRef = useRef('')

  const [pkgStatus, setPkgStatus] = useState<Record<string, boolean | null>>({})
  const [, setPackageError] = useState('')
  const [, setRuntimeVersion] = useState<string | null>(null)
  const [, setRuntimeHome] = useState<string | null>(null)
  const [, setRuntimeLibPaths] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
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

  const handleThemeChange = (theme: SetupTheme) => {
    setSelectedTheme(theme)
    applySetupTheme(theme)
  }

  useEffect(() => {
    api?.getInstallDefaultPaths?.().then((res: any) => {
      if (res?.success) setRootPath(res.documents ?? res.downloads ?? DEFAULT_ROOT_PATH)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    previewSetupTheme(selectedTheme)
  }, [selectedTheme])

  useEffect(() => {
    applySetupLanguage(selectedLanguage)
  }, [selectedLanguage])

  const displayPath = rootPath.trim()
    ? `${rootPath.trim().replace(/[\/\\]+$/, '')}${PATH_SEPARATOR}metis`
    : ''

  const missingPkgs = REQUIRED_PKGS.filter((p) => pkgStatus[p] === false)
  const missingPackageCount = missingPkgs.length
  const missingCranPkgs = missingPkgs.filter((pkg) => pkg !== 'seminrExtras')
  const installCmd = missingPkgs.length
    ? [
        ...(missingCranPkgs.length
          ? [`install.packages(c(${missingCranPkgs.map((p) => `"${p}"`).join(', ')}))`]
          : []),
        ...(missingPkgs.includes('seminrExtras')
          ? [
              'install.packages("remotes")',
              'try(remotes::install_github("sem-in-r/seminrExtras"), silent = TRUE)',
              'if (!requireNamespace("seminrExtras", quietly = TRUE)) remotes::install_github("sem-in-r/seminr", subdir = "seminrExtras")',
            ]
          : []),
      ].join('\n')
    : ''

  useEffect(() => {
    if (phase !== 'installing') return
    const id = window.setInterval(() => {
      setProgress((cur) => {
        if (cur >= 100) return 100
        if (installDone) return Math.min(100, cur + 4)
        if (stage === 'r-paused' || stage === 'pkgs-failed') return cur
        const cap = stage === 'finding-r' ? R_PROGRESS_STOP : 99
        const inc =
          stage === 'workspace' ? 2 :
          stage === 'finding-r' ? 0.06 :
          stage === 'packages' ? 0.5 :
          stage === 'finalizing' ? 1.5 : 0.1
        return Math.min(cap, cur + inc)
      })
    }, 160)
    return () => window.clearInterval(id)
  }, [phase, installDone, stage])

  useEffect(() => {
    if (phase === 'installing' && progress >= 100) {
      const t = window.setTimeout(() => setPhase('complete'), 500)
      return () => window.clearTimeout(t)
    }
  }, [phase, progress])

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
    void (window as any).electronAPI?.setTelemetryConsent?.(consent)
  }

  const handleBrowse = async () => {
    setIsBrowsing(true)
    try {
      const res = await api?.selectInstallDirectory?.()
      if (!res?.canceled && res?.path) {
        setRootPath(res.path)
        setInstallError('')
      }
    } finally {
      setIsBrowsing(false)
    }
  }

  const handleBrowseR = async () => {
    setRBrowsing(true)
    try {
      const res = await api?.openFile?.({
        title: `Locate ${RSCRIPT_LABEL}`,
        defaultPath: RSCRIPT_DEFAULT_PATH,
        filters: IS_WINDOWS
          ? [{ name: 'Rscript Executable', extensions: ['exe'] }]
          : [{ name: 'All Files', extensions: ['*'] }],
        properties: ['openFile'],
      })
      const picked = res?.filePaths?.[0] ?? null
      if (picked) setManualRPath(picked)
    } finally {
      setRBrowsing(false)
    }
  }

  const detectRscript = async () => {
    setStage('finding-r')
    setProgress((current) => Math.min(current, R_PROGRESS_STOP - 2))
    setPackageError('')

    const rRes = await api?.findRscript?.() as RDetectionResponse | undefined
    setRuntimeVersion(rRes?.version ?? null)
    setRuntimeHome(rRes?.home ?? null)
    setRuntimeLibPaths(rRes?.libPaths ?? [])

    if (!rRes?.found || !rRes.path) {
      setProgress(R_PROGRESS_STOP)
      setStage('r-paused')
      return null
    }

    return rRes.path
  }

  const runInstall = async (root: string) => {
    setStage('workspace')
    await delay(600)

    const detectedPath = await detectRscript()
    if (!detectedPath) return
    await continueWithR(detectedPath, root)
  }

  const continueWithR = async (rscript: string, root: string) => {
    setRPath(rscript)
    rPathRef.current = rscript

    setProgress(PACKAGE_PROGRESS_START)
    setStage('packages')
    const init: Record<string, boolean | null> = {}
    REQUIRED_PKGS.forEach((p) => { init[p] = null })
    setPkgStatus(init)
    setPackageError('')

    const pkgRes = await api?.checkPackages?.(rscript) as PackageCheckResponse | undefined
    setPackageError(pkgRes?.error ?? '')
    setRuntimeVersion(pkgRes?.version ?? null)
    setRuntimeHome(pkgRes?.home ?? null)
    setRuntimeLibPaths(pkgRes?.libPaths ?? [])
    if (!pkgRes?.success) {
      setPkgStatus({})
      setProgress(PACKAGE_PROGRESS_START)
      setStage('pkgs-failed')
      return
    }
    setPkgStatus(pkgRes.packages ?? {})

    if (!REQUIRED_PKGS.every((p) => pkgRes.packages?.[p] === true)) {
      setProgress(PACKAGE_PROGRESS_START)
      setStage('pkgs-failed')
      return
    }

    setStage('finalizing')
    await api?.saveLiteConfig?.({ rootPath: root, rscriptPath: rscript })
    setInstallDone(true)
  }

  const handleInstall = async () => {
    applySetupLanguage(selectedLanguage)
    if (!rootPath.trim()) {
      setInstallError('Please choose an install location.')
      return
    }
    setInstallError('')
    setInstallDone(false)
    setProgress(0)
    setStage('workspace')
    setPhase('installing')
    await runInstall(rootPath.trim())
  }

  const handleRetryFindR = async () => {
    const root = rootPath.trim()
    if (!root) return
    const p = manualRPath.trim()
    if (p) {
      await continueWithR(p, root)
    } else {
      const detectedPath = await detectRscript()
      if (!detectedPath) return
      await continueWithR(detectedPath, root)
    }
  }

  const handleReverify = async () => {
    const rscript = rPathRef.current || rPath
    if (!rscript) return
    setProgress(PACKAGE_PROGRESS_START)
    setStage('packages')
    const init: Record<string, boolean | null> = {}
    REQUIRED_PKGS.forEach((p) => { init[p] = null })
    setPkgStatus(init)
    setPackageError('')
    const pkgRes = await api?.checkPackages?.(rscript) as PackageCheckResponse | undefined
    setPackageError(pkgRes?.error ?? '')
    setRuntimeVersion(pkgRes?.version ?? null)
    setRuntimeHome(pkgRes?.home ?? null)
    setRuntimeLibPaths(pkgRes?.libPaths ?? [])
    if (!pkgRes?.success) {
      setPkgStatus({})
      setProgress(PACKAGE_PROGRESS_START)
      setStage('pkgs-failed')
      return
    }
    setPkgStatus(pkgRes.packages ?? {})
    if (!REQUIRED_PKGS.every((p) => pkgRes.packages?.[p] === true)) {
      setProgress(PACKAGE_PROGRESS_START)
      setStage('pkgs-failed')
      return
    }
    setStage('finalizing')
    await api?.saveLiteConfig?.({ rootPath: rootPath.trim(), rscriptPath: rscript })
    setInstallDone(true)
  }

  const handleCancel = () => {
    if (api?.closeInstaller) api.closeInstaller()
  }

  const handleCopy = () => {
    if (!installCmd) return
    navigator.clipboard.writeText(installCmd).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const handleDownloadR = () => api?.openExternal?.(R_DOWNLOAD_URL)

  const activeStep = useMemo(() => STAGE_LABELS[stage], [stage])
  const progressDetail = stage === 'finding-r'
    ? 'Detecting R'
    : stage === 'packages'
      ? 'Checking packages'
      : stage === 'finalizing'
        ? 'Saving setup'
        : activeStep.detail

  // ── Header status icon ───────────────────────────────────────────────────
  const renderStatusIcon = () => {
    if (phase === 'complete') return <Check size={11} weight="bold" color={isLight ? '#7E9362' : ACCENT_HEX} />
    if (stage === 'r-paused') return <WarningCircle size={11} weight="fill" color="var(--color-warning)" />
    if (stage === 'pkgs-failed') return <Package size={11} weight="fill" color="var(--color-warning)" />
    return null
  }

  const getHeaderTitle = () => {
    if (phase === 'complete') return 'Setup complete'
    if (stage === 'r-paused') return "R wasn't found"
    if (stage === 'pkgs-failed') return missingPackageCount ? `${missingPackageCount} packages missing` : 'Packages missing'
    if (phase === 'installing') return `Setting up ${brand}`
    return `Set up ${brand} Lite`
  }

  // ── Right panel body ─────────────────────────────────────────────────────
  const renderBody = () => {
    // ── Complete ──
    if (phase === 'complete') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center' }}>
          <div>
            <span style={{ color: childMutedColor, fontFamily: FF, fontSize: 9.5, fontWeight: 500 }}>Workspace</span>
            <p style={{ margin: '1px 0 0', color: childTextColor, fontFamily: FF, fontSize: 9.5, lineHeight: 1.35, wordBreak: 'break-all' }}>
              {displayPath}
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
                    ...NO_DRAG_STYLE, flex: 1, height: 24, borderRadius: 6,
                    background: childItemBg, border: 'none',
                    color: childTextColor, fontFamily: FF, fontSize: 9.5, fontWeight: 500, cursor: 'pointer',
                  }}
                >No thanks</button>
                <button
                  type="button"
                  onClick={() => handleTelemetryChoice(true)}
                  style={{
                    ...NO_DRAG_STYLE, flex: 1, height: 24, borderRadius: 6,
                    background: childItemBg, border: 'none',
                    color: isLight ? '#7E9362' : ACCENT_HEX, fontFamily: FF, fontSize: 9.5, fontWeight: 500, cursor: 'pointer',
                  }}
                >Allow</button>
              </div>
            </div>
          ) : (
            <span style={{ color: isLight ? '#7E9362' : ACCENT_HEX, fontFamily: FF, fontSize: 9.5, fontWeight: 500 }}>
              ✓ {telemetryConsent === 'accepted' ? 'Ping sent.' : 'Ping declined.'}
            </span>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Check size={11} color={isLight ? '#7E9362' : ACCENT_HEX} weight="bold" />
            <span style={{ color: childMutedColor, fontFamily: FF, fontSize: 9.5 }}>
              All {REQUIRED_PKGS.length} required packages verified.
            </span>
          </div>
        </div>
      )
    }

    // ── R not found ──
    if (stage === 'r-paused') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: childMutedColor, fontFamily: FF, fontSize: 9.5, fontWeight: 500 }}>
              Locate {RSCRIPT_LABEL}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                value={manualRPath}
                onChange={(e) => setManualRPath(e.target.value)}
                placeholder={RSCRIPT_PLACEHOLDER}
                spellCheck={false}
                style={{
                  ...NO_DRAG_STYLE, flex: 1, minWidth: 0, height: 24, borderRadius: 6,
                  background: childItemBg, border: 'none',
                  color: childTextColor, padding: '0 7px', fontFamily: FF, fontSize: 9.5, outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleBrowseR}
                disabled={rBrowsing}
                title="Browse Rscript location"
                style={{
                  ...NO_DRAG_STYLE, height: 24, width: 24, borderRadius: 6,
                  background: 'transparent', border: 'none',
                  color: childTextColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <FolderOpen size={14} color={childMutedColor} />
              </button>
            </div>
          </div>

          {/* Download R hint - NO background, NO border */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', borderRadius: 0,
            background: 'transparent', border: 'none',
          }}>
            <Info size={11} color={isLight ? '#7E9362' : ACCENT_HEX} weight="bold" style={{ flexShrink: 0 }} />
            <span style={{ color: childMutedColor, fontFamily: FF, fontSize: 9.5, flex: 1 }}>
              Need R 4.0+?
            </span>
            <button
              type="button"
              onClick={handleDownloadR}
              style={{
                ...NO_DRAG_STYLE, height: 20, padding: '0 6px', borderRadius: 5,
                background: childItemBg, border: 'none',
                color: isLight ? '#7E9362' : ACCENT_HEX, fontFamily: FF, fontSize: 9.5, fontWeight: 500,
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              Download
            </button>
          </div>
        </div>
      )
    }

    // ── Packages failed ──
    if (stage === 'pkgs-failed') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center', minHeight: 0 }}>
          {/* Missing package pills - WRAPS and non-bold text */}
          {missingPkgs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 54, overflowY: 'auto' }}>
              {missingPkgs.map((pkg) => (
                <span
                  key={pkg}
                  style={{
                    borderRadius: 999,
                    background: 'rgba(217, 107, 77, 0.12)',
                    border: 'none',
                    color: 'var(--color-danger)',
                    fontFamily: FF,
                    fontSize: 9,
                    fontWeight: 500, // Avoid bold text
                    padding: '1px 6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {pkg}
                </span>
              ))}
            </div>
          )}

          {/* Concise "Run in R / RStudio" action with copy icon (takes minimal space!) */}
          <div style={{
            borderRadius: 6, background: childItemBg, border: 'none',
            padding: '5px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          }}>
            <span style={{ color: childTextColor, fontFamily: FF, fontSize: 9.5, fontWeight: 500 }}>
              Run script in R or RStudio
            </span>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!installCmd}
              title="Copy package installation script"
              style={{
                ...NO_DRAG_STYLE, height: 22, padding: '0 6px', borderRadius: 4,
                background: isLight ? '#FFFFFF' : '#333333', border: 'none',
                color: copied ? (isLight ? '#7E9362' : ACCENT_HEX) : childTextColor, fontFamily: FF, fontSize: 9.5, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 4,
                cursor: installCmd ? 'pointer' : 'default',
              }}
            >
              {copied ? <Check size={10} weight="bold" /> : <Copy size={10} />}
              <span>{copied ? 'Copied' : 'Copy script'}</span>
            </button>
          </div>
        </div>
      )
    }

    // ── Installing (progress) ──
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
                width: `${progress}%`, height: '100%', borderRadius: 999,
                background: isLight ? '#7E9362' : ACCENT_HEX, boxShadow: isLight ? '0 0 6px rgba(126,147,98,0.4)' : `0 0 6px rgb(var(--color-accent-rgb) / 0.32)`,
                transition: 'width 520ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </div>
          <span style={{ color: childMutedColor, fontFamily: FF, fontSize: 9.5 }}>{progressDetail}</span>
        </div>
      )
    }

    // ── Options ──
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, justifyContent: 'center' }}>
        {/* Theme + Language in a row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
          <ThemeToggle theme={selectedTheme} onThemeChange={handleThemeChange} isLight={isLight} />
          <LanguageDropdown selectedLanguage={selectedLanguage} setSelectedLanguage={setSelectedLanguage} isLight={isLight} />
        </div>

        {/* Folder */}
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
                ...NO_DRAG_STYLE, flex: 1, minWidth: 0, height: 24, borderRadius: 6,
                background: childItemBg,
                border: 'none',
                color: childTextColor, padding: '0 7px', fontFamily: FF, fontSize: 9.5, outline: 'none',
              }}
            />
            <button
              onClick={handleBrowse}
              disabled={isBrowsing}
              type="button"
              title="Browse directory"
              style={{
                ...NO_DRAG_STYLE, height: 24, width: 24, borderRadius: 6,
                background: 'transparent', border: 'none',
                color: childTextColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
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
      </div>
    )
  }

  // ── Actions footer ───────────────────────────────────────────────────────
  const renderActions = () => {
    if (phase === 'options') {
      return (
        <>
          <ActionButton isLight={isLight} onClick={handleCancel}>Cancel</ActionButton>
          <ActionButton isLight={isLight} primary onClick={handleInstall} disabled={!rootPath.trim()}>Continue</ActionButton>
        </>
      )
    }
    if (phase === 'installing') {
      if (stage === 'r-paused') {
        return (
          <>
            <ActionButton isLight={isLight} onClick={handleCancel}>Cancel</ActionButton>
            <ActionButton isLight={isLight} primary onClick={handleRetryFindR}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ArrowClockwise size={10} weight="bold" /> Retry
              </span>
            </ActionButton>
          </>
        )
      }
      if (stage === 'pkgs-failed') {
        return (
          <>
            <ActionButton isLight={isLight} onClick={handleCancel}>Cancel</ActionButton>
            <ActionButton isLight={isLight} primary onClick={handleReverify}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ArrowClockwise size={10} weight="bold" /> Re-verify
              </span>
            </ActionButton>
          </>
        )
      }
      return (
        <>
          <ActionButton isLight={isLight} onClick={handleCancel}>Cancel</ActionButton>
        </>
      )
    }
    return (
      <>
        <ActionButton isLight={isLight} onClick={handleCancel}>Finish</ActionButton>
        <ActionButton isLight={isLight} primary onClick={() => api?.launchApp?.()}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <RocketLaunch size={10} weight="fill" /> Launch
          </span>
        </ActionButton>
      </>
    )
  }

  const statusIcon = renderStatusIcon()

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
          {/* Header: logo + brand + version + edition pill on extreme right */}
          <div style={{ ...DRAG_REGION_STYLE, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexShrink: 0, width: '100%' }}>
            {statusIcon ? (
              <span style={{ flexShrink: 0 }}>{statusIcon}</span>
            ) : (
              <img
                src={logoSrc}
                alt=""
                style={{
                  width: 18,
                  height: 18,
                  objectFit: 'contain',
                  flexShrink: 0,
                  filter: isLight ? 'invert(52%) sepia(21%) saturate(735%) hue-rotate(48deg) brightness(92%) contrast(85%)' : 'none',
                  animation: phase === 'installing' && stage !== 'r-paused' && stage !== 'pkgs-failed'
                    ? 'logo-pulse 2.4s ease-in-out infinite'
                    : 'none',
                }}
              />
            )}
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

          {/* Status subtitle for error/complete states */}
          {(stage === 'r-paused' || stage === 'pkgs-failed' || phase === 'complete') && (
            <div style={{ marginBottom: 4, flexShrink: 0 }}>
              <span style={{ color: headerTitleColor, fontFamily: FF, fontSize: 11, fontWeight: 800, letterSpacing: -0.1 }}>
                {getHeaderTitle()}
              </span>
            </div>
          )}

          {/* Body content */}
          {renderBody()}

          {/* Actions */}
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
            {renderActions()}
          </div>
        </div>
      </div>
    </div>
  )
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
