import {
  ArrowClockwise,
  Check,
  Copy,
  FolderOpen,
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
import { APP_BRAND_NAME } from '../config/appBranding'

type Phase = 'options' | 'installing' | 'complete'
type SetupTheme = 'Dark' | 'Light'

type InstallStage =
  | 'workspace'
  | 'finding-r'
  | 'r-paused'
  | 'packages'
  | 'pkgs-failed'
  | 'finalizing'

const REQUIRED_PKGS = ['seminr', 'seminrExtras', 'plumber', 'semPower', 'readxl', 'jsonlite', 'Matrix'] as const
const THEME_OPTIONS = ['Light', 'Dark'] as const
const INSTALLER_PREF_THEME_KEY = 'metis:installer:theme'
const METIS_PREF_THEME_KEY = 'metis:prefs:theme'
const LEGACY_PREF_THEME_KEY = 'pls:prefs:theme'
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
  packages: { label: 'Checking packages', detail: 'Verifying seminr, plumber, semPower...' },
  'pkgs-failed': { label: 'Packages missing', detail: 'Run the snippet below in R' },
  finalizing: { label: 'Saving setup', detail: 'Saving configuration' },
}

const DEFAULT_ROOT_PATH = ''
const FF = 'Matter, sans-serif'
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

function getInitialSetupTheme(): SetupTheme {
  return 'Light'
}

function applySetupTheme(theme: SetupTheme) {
  localStorage.setItem(INSTALLER_PREF_THEME_KEY, theme)
  localStorage.setItem(METIS_PREF_THEME_KEY, theme)
  localStorage.setItem(LEGACY_PREF_THEME_KEY, theme)
  document.documentElement.setAttribute('data-theme', theme === 'Light' ? 'light' : 'dark')
  document.body.setAttribute('data-theme', theme === 'Light' ? 'light' : 'dark')
  void (window as any).electronAPI?.setThemePreference?.(theme.toLowerCase())
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
  compact = false,
}: {
  children: React.ReactNode
  onClick?: () => void
  primary?: boolean
  disabled?: boolean
  compact?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        ...NO_DRAG_STYLE,
        minWidth: compact ? 0 : primary ? 88 : 78,
        height: compact ? 34 : 38,
        padding: compact ? '0 12px' : '0 18px',
        borderRadius: 8,
        background: disabled ? 'var(--color-elevated)' : primary ? ACCENT_HEX : 'var(--color-input)',
        border: primary ? `1px solid rgb(${ACCENT_RGB} / 0.42)` : `1px solid ${BORDER_SOFT}`,
        color: disabled ? TEXT_MUTED : primary ? 'var(--color-on-accent)' : TEXT_PRIMARY,
        fontFamily: FF,
        fontSize: compact ? 12 : 13,
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.78 : 1,
        boxShadow: primary && !disabled ? `0 8px 16px rgb(${ACCENT_RGB} / 0.28)` : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function LogoMark({ logoSrc, pulse = false }: { logoSrc: string; pulse?: boolean }) {
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

function StatusMark({
  tone,
  children,
}: {
  tone: 'warning' | 'success' | 'package'
  children: React.ReactNode
}) {
  const colors = tone === 'success'
    ? { bg: 'rgb(var(--color-accent-rgb) / 0.12)', border: 'rgb(var(--color-accent-rgb) / 0.30)', icon: ACCENT_HEX }
    : tone === 'warning'
      ? { bg: 'rgb(var(--color-warning-rgb) / 0.12)', border: 'rgb(var(--color-warning-rgb) / 0.32)', icon: 'var(--color-warning)' }
      : { bg: 'rgb(var(--color-warning-rgb) / 0.12)', border: 'rgb(var(--color-warning-rgb) / 0.32)', icon: 'var(--color-warning)' }

  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: colors.icon,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  )
}

function Header({
  mark,
  title,
  subtitle,
}: {
  mark: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '28px 28px 4px', ...DRAG_REGION_STYLE }}>
      {mark}
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

function ProgressStep({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: done ? `rgb(${ACCENT_RGB} / 0.18)` : active ? 'var(--color-input)' : 'var(--color-elevated)',
          border: `1px solid ${done ? `rgb(${ACCENT_RGB} / 0.34)` : active ? `rgb(${ACCENT_RGB} / 0.22)` : BORDER_SOFT}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: done ? ACCENT_HEX : TEXT_MUTED,
          flexShrink: 0,
        }}
      >
        {done ? <Check size={11} weight="bold" /> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? ACCENT_HEX : TEXT_MUTED, opacity: active ? 1 : 0.5 }} />}
      </span>
      <span style={{ color: done || active ? TEXT_PRIMARY : TEXT_SECONDARY, fontFamily: FF, fontSize: 12, fontWeight: active ? 700 : 600 }}>
        {label}
      </span>
    </div>
  )
}

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
  const logoSrc = selectedTheme === 'Light' ? logoBlack : logoWhite
  const brand = displayBrandName()

  useEffect(() => {
    api?.getInstallDefaultPaths?.().then((res: any) => {
      if (res?.success) setRootPath(res.documents ?? res.downloads ?? DEFAULT_ROOT_PATH)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    applySetupTheme(selectedTheme)
  }, [selectedTheme])

  const displayPath = rootPath.trim()
    ? `${rootPath.trim().replace(/[\\/]+$/, '')}${PATH_SEPARATOR}metis`
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
    applySetupTheme(selectedTheme)
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
    const detectedPath = await detectRscript()
    if (!detectedPath) return
    await continueWithR(detectedPath, root)
  }

  const handleContinueWithManualR = async () => {
    const p = manualRPath.trim()
    if (!p) return
    await continueWithR(p, rootPath.trim())
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

  const setupSteps = [
    { label: 'Workspace', done: stage !== 'workspace' || progress > 8 || installDone, active: stage === 'workspace' },
    { label: 'Detect R', done: stage === 'packages' || stage === 'finalizing' || installDone, active: stage === 'finding-r' },
    { label: 'Packages', done: stage === 'finalizing' || installDone, active: stage === 'packages' },
    { label: 'Save setup', done: installDone, active: stage === 'finalizing' },
  ]

  const renderHeader = () => {
    if (phase === 'complete') {
      return (
        <Header
          mark={<StatusMark tone="success"><Check size={22} weight="bold" /></StatusMark>}
          title="Setup complete"
          subtitle={`${brand} is configured and ready to launch.`}
        />
      )
    }
    if (stage === 'r-paused') {
      return (
        <Header
          mark={<StatusMark tone="warning"><WarningCircle size={22} weight="fill" /></StatusMark>}
          title="R wasn't found"
          subtitle="Point us to your R install, or download it."
        />
      )
    }
    if (stage === 'pkgs-failed') {
      return (
        <Header
          mark={<StatusMark tone="package"><Package size={22} weight="fill" /></StatusMark>}
          title={missingPackageCount ? `${missingPackageCount} packages missing` : 'Packages missing'}
          subtitle="Run the snippet below in R, then re-verify."
        />
      )
    }
    return (
      <Header
        mark={<LogoMark logoSrc={logoSrc} pulse={phase === 'installing'} />}
        title={phase === 'installing' ? `Setting up ${brand}` : `Set up ${brand} Lite`}
        subtitle={phase === 'installing' ? 'Verifying your R install and packages.' : 'Uses your existing R 4.0+ install.'}
      />
    )
  }

  const renderOptions = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ color: TEXT_SECONDARY, fontFamily: FF, fontSize: 12, fontWeight: 700 }}>
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
              minWidth: 0,
              height: 36,
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

      <AppearanceChoice theme={selectedTheme} onThemeChange={setSelectedTheme} />
    </div>
  )

  const renderInstalling = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
      <div
        style={{
          borderRadius: 12,
          background: 'transparent',
          border: 'none',
          padding: '14px 16px',
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
          {progressDetail}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
        {setupSteps.map((step) => (
          <ProgressStep key={step.label} label={step.label} done={step.done} active={step.active} />
        ))}
      </div>
    </div>
  )

  const renderRPaused = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ color: TEXT_SECONDARY, fontFamily: FF, fontSize: 12, fontWeight: 700 }}>
          Locate {RSCRIPT_LABEL}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            value={manualRPath}
            onChange={(e) => setManualRPath(e.target.value)}
            placeholder={RSCRIPT_PLACEHOLDER}
            spellCheck={false}
            style={{
              ...NO_DRAG_STYLE,
              flex: 1,
              minWidth: 0,
              height: 36,
              borderRadius: 8,
              background: 'var(--color-input)',
              border: `1px solid ${BORDER_STRONG}`,
              color: TEXT_PRIMARY,
              padding: '0 10px',
              fontFamily: FF,
              fontSize: 12,
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleBrowseR}
            disabled={rBrowsing}
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
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ height: 1, flex: 1, background: BORDER_SOFT }} />
        <span style={{ color: TEXT_MUTED, fontFamily: FF, fontSize: 11, fontWeight: 700 }}>or</span>
        <span style={{ height: 1, flex: 1, background: BORDER_SOFT }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, background: 'transparent', border: 'none', padding: '14px 16px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-input)', border: `1px solid ${BORDER_SOFT}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT_HEX, flexShrink: 0 }}>
          <Info size={16} weight="bold" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ color: TEXT_PRIMARY, fontFamily: FF, fontSize: 12, fontWeight: 700 }}>Need R?</span>
          <span style={{ color: TEXT_MUTED, fontFamily: FF, fontSize: 11 }}>Install R 4.0+ first.</span>
        </div>
        <button
          type="button"
          onClick={handleDownloadR}
          style={{
            ...NO_DRAG_STYLE,
            height: 34,
            padding: '0 12px',
            borderRadius: 8,
            background: 'var(--color-input)',
            border: `1px solid rgb(${ACCENT_RGB} / 0.22)`,
            color: ACCENT_HEX,
            fontFamily: FF,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Download
        </button>
      </div>
    </div>
  )

  const renderPackagesFailed = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>
      {missingPkgs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {missingPkgs.slice(0, 4).map((pkg) => (
            <span
              key={pkg}
              style={{
                borderRadius: 6,
                background: 'rgba(217, 107, 77, 0.10)',
                border: '1px solid rgba(217, 107, 77, 0.22)',
                color: 'var(--color-danger)',
                fontFamily: FF,
                fontSize: 11,
                fontWeight: 700,
                padding: '5px 9px',
              }}
            >
              {pkg}
            </span>
          ))}
        </div>
      )}

      <div style={{ borderRadius: 10, background: 'var(--color-elevated)', border: `1px solid ${BORDER_SOFT}`, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${BORDER_SOFT}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT_HEX }} />
            <span style={{ color: TEXT_SECONDARY, fontFamily: FF, fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Run in R
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!installCmd}
            style={{
              ...NO_DRAG_STYLE,
              height: 26,
              padding: '0 10px',
              borderRadius: 6,
              background: 'var(--color-input)',
              border: `1px solid ${BORDER_SOFT}`,
              color: copied ? ACCENT_HEX : TEXT_PRIMARY,
              fontFamily: FF,
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              cursor: installCmd ? 'pointer' : 'default',
            }}
          >
            {copied ? <Check size={11} weight="bold" /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre
          style={{
            margin: 0,
            padding: '12px 14px',
            maxHeight: 82,
            overflowY: 'auto',
            color: TEXT_PRIMARY,
            fontFamily: '"Fira Code", Consolas, monospace',
            fontSize: 10.5,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {installCmd || 'Install the missing packages in R, then re-verify.'}
        </pre>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Info size={13} color={TEXT_MUTED} />
        <span style={{ color: TEXT_SECONDARY, fontFamily: FF, fontSize: 11 }}>
          After running, click Re-verify below.
        </span>
      </div>
    </div>
  )

  const renderComplete = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
      <div style={{ borderRadius: 12, background: 'var(--color-elevated)', border: `1px solid ${BORDER_SOFT}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ color: TEXT_SECONDARY, fontFamily: FF, fontSize: 12, fontWeight: 700 }}>R Runtime</span>
          <Check size={15} color={ACCENT_HEX} weight="bold" />
        </div>
        <span style={{ color: TEXT_PRIMARY, fontFamily: FF, fontSize: 12, lineHeight: 1.45, wordBreak: 'break-all' }}>
          {rPath || rPathRef.current}
        </span>
      </div>

      <div style={{ borderRadius: 12, background: 'var(--color-elevated)', border: `1px solid ${BORDER_SOFT}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ color: TEXT_SECONDARY, fontFamily: FF, fontSize: 12, fontWeight: 700 }}>Workspace</span>
        <span style={{ color: TEXT_PRIMARY, fontFamily: FF, fontSize: 12, lineHeight: 1.45, wordBreak: 'break-all' }}>
          {displayPath}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
        <Check size={14} color={ACCENT_HEX} weight="bold" />
        <span style={{ color: TEXT_SECONDARY, fontFamily: FF, fontSize: 12 }}>
          All {REQUIRED_PKGS.length} required packages verified.
        </span>
      </div>
    </div>
  )

  const renderBody = () => {
    if (phase === 'complete') return renderComplete()
    if (stage === 'r-paused') return renderRPaused()
    if (stage === 'pkgs-failed') return renderPackagesFailed()
    if (phase === 'installing') return renderInstalling()
    return renderOptions()
  }

  const renderActions = () => {
    if (phase === 'options') {
      return (
        <>
          <ActionButton onClick={handleCancel}>Cancel</ActionButton>
          <ActionButton primary onClick={handleInstall} disabled={!rootPath.trim()}>Continue</ActionButton>
        </>
      )
    }
    if (phase === 'installing') {
      if (stage === 'r-paused') {
        return (
          <>
            <ActionButton onClick={handleRetryFindR} compact>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowClockwise size={13} /> Try again
              </span>
            </ActionButton>
            <ActionButton onClick={handleCancel}>Cancel</ActionButton>
            <ActionButton primary onClick={handleContinueWithManualR} disabled={!manualRPath.trim()}>Continue</ActionButton>
          </>
        )
      }
      if (stage === 'pkgs-failed') {
        return (
          <>
            <ActionButton onClick={handleCancel}>Cancel</ActionButton>
            <ActionButton primary onClick={handleReverify}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowClockwise size={13} weight="bold" /> Re-verify
              </span>
            </ActionButton>
          </>
        )
      }
      return (
        <>
          <ActionButton onClick={handleCancel}>Cancel</ActionButton>
        </>
      )
    }
    return (
      <>
        <ActionButton onClick={handleCancel}>Finish</ActionButton>
        <ActionButton primary onClick={() => api?.launchApp?.()}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RocketLaunch size={14} weight="fill" /> Launch {brand}
          </span>
        </ActionButton>
      </>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--color-surface)', padding: 0 }}>
      <style>{`
        @keyframes logo-pulse { 0%,100% { opacity:0.88; transform:scale(1); } 50% { opacity:1; transform:scale(1.04); } }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', overflow: 'hidden' }}>
        {renderHeader()}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: stage === 'pkgs-failed' ? '14px 28px 12px' : '16px 28px', minHeight: 0 }}>
          {renderBody()}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: stage === 'r-paused' ? 'space-between' : 'flex-end', gap: 8, padding: '16px 28px', borderTop: `1px solid ${BORDER_SOFT}` }}>
          {renderActions()}
        </div>
      </div>
    </div>
  )
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
