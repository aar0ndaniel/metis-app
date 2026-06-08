import { app, BrowserWindow, ipcMain, dialog, shell, screen, Menu, type MenuItemConstructorOptions, type Rectangle } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { randomBytes } from 'crypto'
import { fileURLToPath } from 'url'
import { spawn, spawnSync, exec, execSync, type ChildProcess } from 'child_process'
import { createServer } from 'net'
import JSZip from 'jszip'
import { isRendererWriteTargetAllowed } from '../src/utils/securityPaths'

declare const __METIS_APP_EDITION__: string | undefined

const __dirname = fileURLToPath(new URL('.', import.meta.url))

process.env.DIST_ELECTRON = __dirname
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '../public')
  : process.env.DIST

const isDev = !!process.env.VITE_DEV_SERVER_URL
const DEFAULT_PLUMBER_HOST = '127.0.0.1'
const DEFAULT_PLUMBER_PORT = Number(process.env.METIS_PLUMBER_PORT || '8765')

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let installerWindow: BrowserWindow | null = null
let lastNormalMainWindowBounds: Rectangle | null = null
let plumberProcess: ChildProcess | null = null
let plumberBaseUrl = `http://${DEFAULT_PLUMBER_HOST}:${DEFAULT_PLUMBER_PORT}`
let resolvedRscript = ''
let plumberStartupPromise: Promise<boolean> | null = null
const recentPlumberLogs: string[] = []
const RECENT_PLUMBER_LOG_LIMIT = 120
let splashFallbackTimer: ReturnType<typeof setTimeout> | null = null
let splashCloseTimer: ReturnType<typeof setTimeout> | null = null
let splashShownAt = 0
let splashCloseRequested = false
let pendingOpenFilePath: string | null = null
const plumberAuthToken = randomBytes(32).toString('hex')
const BLAS_THREAD_ENV_DEFAULTS: Record<string, string> = {
  OPENBLAS_NUM_THREADS: '1',
  OMP_NUM_THREADS: '1',
  MKL_NUM_THREADS: '1',
  BLIS_NUM_THREADS: '1',
  VECLIB_MAXIMUM_THREADS: '1',
}
const approvedRendererReadPaths = new Set<string>()
const approvedRendererWritePaths = new Set<string>()
const approvedRendererOpenPaths = new Set<string>()
const approvedWorkspacePaths = new Set<string>()
const allowedDatasetReadExtensions = new Set(['.csv', '.xlsx', '.xls'])
const allowedRendererReadExtensions = new Set([...allowedDatasetReadExtensions, '.r'])
const allowedRendererWriteExtensions = new Set(['.csv', '.png', '.xlsx', '.html', '.htm', '.json', '.r'])
const allowedRendererOpenExtensions = new Set(['.html', '.htm'])
const WORKSPACE_FILE_EXTENSION = '.metisws'
const LEGACY_WORKSPACE_FILE_EXTENSION = '.ada'
const WORKSPACE_FILE_EXTENSIONS = [WORKSPACE_FILE_EXTENSION, LEGACY_WORKSPACE_FILE_EXTENSION]
const sampleDatasetFileName = 'sample dataset.csv'
const missingValueTokens = new Set(['', 'na', 'n/a', '.', 'null', 'none', 'nan'])
const sessionTempDirName = `session-${randomBytes(8).toString('hex')}`

type NativeMenuViewState = {
  showVars: boolean
  showProps: boolean
  showZoomControl: boolean
}

let nativeMenuViewState: NativeMenuViewState = {
  showVars: true,
  showProps: true,
  showZoomControl: true,
}

function sendRendererMenuAction(action: string) {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow
  if (!targetWindow || targetWindow.isDestroyed()) return
  targetWindow.webContents.send('menu:action', action)
}

function nativeMenuAction(label: string, action: string, accelerator?: string): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    click: () => sendRendererMenuAction(action),
  }
}

function nativeMenuCheckbox(label: string, action: string, checked: boolean, accelerator?: string): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    type: 'checkbox',
    checked,
    click: () => sendRendererMenuAction(action),
  }
}

function installApplicationMenu() {
  if (process.platform !== 'darwin') return

  const appName = app.name || 'metis'
  const template: MenuItemConstructorOptions[] = [
    {
      label: appName,
      submenu: [
        nativeMenuAction(`About ${appName}`, 'open-about'),
        { type: 'separator' },
        nativeMenuAction('Preferences...', 'open-preferences', 'Command+,'),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { label: `Quit ${appName}`, role: 'quit', accelerator: 'Command+Q' },
      ],
    },
    {
      label: 'File',
      submenu: [
        nativeMenuAction('New Workspace', 'new-workspace', 'Command+N'),
        nativeMenuAction('New Model', 'new-model', 'Command+Shift+N'),
        { type: 'separator' },
        nativeMenuAction('Open Workspace...', 'open-workspace', 'Command+O'),
        {
          label: 'Open Recent',
          submenu: [
            { label: 'No Recent Models', enabled: false },
          ],
        },
        { type: 'separator' },
        nativeMenuAction('Save', 'file:save', 'Command+S'),
        nativeMenuAction('Save As...', 'file:save-as', 'Command+Shift+S'),
        { type: 'separator' },
        nativeMenuAction('Import Dataset...', 'import-dataset', 'Command+I'),
        nativeMenuAction('Import R Script...', 'import-rscript'),
        { type: 'separator' },
        nativeMenuAction('Export R Script', 'results:export-r-script'),
        { type: 'separator' },
        nativeMenuAction('Close Model', 'canvas:go-home', 'Command+W'),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        nativeMenuAction('Undo', 'edit:undo', 'Command+Z'),
        nativeMenuAction('Redo', 'edit:redo', 'Command+Shift+Z'),
        { type: 'separator' },
        nativeMenuAction('Cut', 'edit:cut', 'Command+X'),
        nativeMenuAction('Copy', 'edit:copy', 'Command+C'),
        nativeMenuAction('Paste', 'edit:paste', 'Command+V'),
        nativeMenuAction('Delete', 'edit:delete'),
        { type: 'separator' },
        nativeMenuAction('Select All', 'edit:selectall', 'Command+A'),
        { type: 'separator' },
        nativeMenuAction('Preferences', 'open-preferences', 'Command+,'),
      ],
    },
    {
      label: 'View',
      submenu: [
        nativeMenuAction('Zoom In', 'view:zoom-in', 'Command+Plus'),
        nativeMenuAction('Zoom Out', 'view:zoom-out', 'Command+-'),
        nativeMenuAction('Fit to Screen', 'view:fit-screen', 'Command+0'),
        { type: 'separator' },
        nativeMenuCheckbox('Zoom Control', 'view:toggle-zoom-control', nativeMenuViewState.showZoomControl),
        nativeMenuCheckbox('Indicators Panel', 'view:toggle-vars', nativeMenuViewState.showVars),
        nativeMenuCheckbox('Properties Panel', 'view:toggle-props', nativeMenuViewState.showProps),
      ],
    },
    {
      label: 'Analysis',
      submenu: [
        nativeMenuAction('Run PLS-SEM', 'run-pls', 'Command+Enter'),
        nativeMenuAction('Run Bootstrap', 'run-bootstrap', 'Command+B'),
        nativeMenuAction('PLS Predict', 'run-pls-predict'),
        nativeMenuAction('Advanced analysis', 'run-advanced-analysis'),
        { type: 'separator' },
        { label: 'Algorithm Settings', enabled: false },
      ],
    },
    {
      label: 'Tark it',
      submenu: [
        nativeMenuAction('Create Tark Report', 'open-tark'),
      ],
    },
    {
      label: 'Help',
      submenu: [
        nativeMenuAction('Documentation', 'open-docs'),
        nativeMenuAction('Getting Started', 'open-tour'),
        { type: 'separator' },
        nativeMenuAction('Feedback', 'open-feedback'),
        nativeMenuAction('Report a Bug', 'open-report-bug'),
        nativeMenuAction('Cite Metis', 'open-cite-metis'),
        { type: 'separator' },
        nativeMenuAction(`About ${appName}`, 'open-about'),
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function hasWorkspaceFileExtension(targetPath: string): boolean {
  const fileName = path.basename(String(targetPath ?? '').trim()).toLowerCase()
  return WORKSPACE_FILE_EXTENSIONS.some((extension) => fileName.endsWith(extension))
}

function rememberPlumberLog(level: 'stdout' | 'stderr' | 'system', text: string) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    recentPlumberLogs.push(`${new Date().toISOString()} ${level}: ${line}`)
  }

  while (recentPlumberLogs.length > RECENT_PLUMBER_LOG_LIMIT) {
    recentPlumberLogs.shift()
  }
}

function getRecentPlumberLogs(limit = 30): string[] {
  return recentPlumberLogs.slice(Math.max(0, recentPlumberLogs.length - limit))
}

function plumberBridgeExceptionResponse(err: any, action: string) {
  return {
    success: false,
    status: 0,
    url: plumberBaseUrl,
    rscript: resolvedRscript,
    error: `Metis could not complete the ${action} request because the local R analysis engine stopped responding. Try a smaller run, close other heavy apps, or restart Metis and run it again.`,
    backendDetail: err?.message || 'Unknown bridge error.',
    runtimeStatus: getBundledPortableRuntimeStatus(),
    recentPlumberLogs: getRecentPlumberLogs(),
  }
}

function getPlumberNotReadyHint(): string {
  if (!isLiteBuild()) {
    return 'The bundled R analysis engine could not start. Run setup again or reinstall the current Bundle build so Metis can unpack R into its cache runtime folder.'
  }

  if (process.platform === 'win32') {
    return `Verify Rscript is installed and no firewall or Windows port exclusion is blocking ${plumberBaseUrl}.`
  }

  return 'Verify Rscript is installed and Metis can launch it from the configured Lite setup path.'
}

function getThemePreferencePath(): string {
  return path.join(app.getPath('userData'), 'theme-preference.json')
}

function normalizeThemePreference(value: unknown): 'dark' | 'light' | null {
  if (value === 'light' || value === 'Light') return 'light'
  if (value === 'dark' || value === 'Dark') return 'dark'
  return null
}

function readStoredThemePreference(): 'dark' | 'light' {
  try {
    const raw = fs.readFileSync(path.join(app.getPath('userData'), 'theme-preference.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    const normalized = normalizeThemePreference(parsed?.theme)
    if (normalized) return normalized
  } catch {}

  return 'dark'
}

function writeStoredThemePreference(theme: unknown): boolean {
  const normalized = normalizeThemePreference(theme)
  if (!normalized) return false

  try {
    const filePath = getThemePreferencePath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify({ theme: normalized }, null, 2), 'utf-8')
    return true
  } catch (err: any) {
    console.warn('[theme] failed to persist theme preference:', err?.message || err)
    return false
  }
}

function isDevToolsShortcut(input: {
  key?: string
  code?: string
  control?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
}) {
  const key = (input.key || '').toLowerCase()
  const code = (input.code || '').toLowerCase()
  const hasPrimaryModifier = !!input.control || !!input.meta
  const targetsInspectorKey = key === 'i' || key === 'j' || key === 'c' || code === 'keyi' || code === 'keyj' || code === 'keyc'

  return (
    key === 'f12' ||
    code === 'f12' ||
    (hasPrimaryModifier && (!!input.shift || !!input.alt) && targetsInspectorKey)
  )
}

function hardenWindow(win: BrowserWindow) {
  win.setMenuBarVisibility(false)
  win.webContents.on('before-input-event', (event, input) => {
    if (isDevToolsShortcut(input)) {
      event.preventDefault()
    }
  })
  win.webContents.on('devtools-opened', () => {
    win.webContents.closeDevTools()
  })
}

// ─── ADDED: SECURITY NAVIGATION POLICY ──────────────────────────────────────

function isAllowedAppNavigationUrl(rawUrl: string): boolean {
  const target = String(rawUrl ?? '').trim()
  if (!target) return false

  try {
    const parsed = new URL(target)

    if (isDev && process.env.VITE_DEV_SERVER_URL) {
      const devOrigin = new URL(process.env.VITE_DEV_SERVER_URL).origin
      return parsed.origin === devOrigin
    }

    if (parsed.protocol !== 'file:') return false

    const appIndexPath = path.resolve(getRendererIndexPath())
    
    // Strip hash from the requested URL before resolving
    const parsedNoHash = new URL(target)
    parsedNoHash.hash = ''
    
    const requestedPath = path.resolve(fileURLToPath(parsedNoHash))
    
    // The Fix: Safely compare paths regardless of Windows drive letter casing
    if (process.platform === 'win32') {
      return requestedPath.toLowerCase() === appIndexPath.toLowerCase()
    }

    return requestedPath === appIndexPath
  } catch {
    return false
  }
}

function getRendererIndexPath(): string {
  const candidates = isDev
    ? [path.join(process.env.DIST!, 'index.html')]
    : [
        path.join(app.getAppPath(), 'dist', 'index.html'),
        path.join(process.env.DIST!, 'index.html'),
        path.join(__dirname, '../dist', 'index.html'),
      ]

  const found = candidates.find((candidate) => fs.existsSync(candidate))
  return found ?? candidates[0]
}

function enforceNavigationPolicy(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppNavigationUrl(url)) return
    
    event.preventDefault()
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url)
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────

if (!isDev && app.commandLine.hasSwitch('remote-debugging-port')) {
  console.error('[main] Refusing to start with --remote-debugging-port in production mode.')
  app.exit(1)
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
}

function isWorkAreaSizedWindow(win: BrowserWindow): boolean {
  if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return false

  const bounds = win.getBounds()
  const { workArea } = screen.getDisplayMatching(bounds)
  const tolerance = 2

  return (
    Math.abs(bounds.x - workArea.x) <= tolerance &&
    Math.abs(bounds.y - workArea.y) <= tolerance &&
    Math.abs(bounds.width - workArea.width) <= tolerance &&
    Math.abs(bounds.height - workArea.height) <= tolerance
  )
}

function getMainWindowState(win = mainWindow) {
  const isMaximized = !!win && !win.isDestroyed() && (win.isMaximized() || isWorkAreaSizedWindow(win))
  const isFullScreen = !!win && !win.isDestroyed() && win.isFullScreen()
  return { isMaximized, isFullScreen }
}

function rememberNormalMainWindowBounds(win: BrowserWindow) {
  if (win.isDestroyed() || win.isMinimized() || win.isMaximized() || isWorkAreaSizedWindow(win)) return
  lastNormalMainWindowBounds = win.getBounds()
}

function sendMainWindowState(win = mainWindow) {
  if (!win || win.isDestroyed()) return
  win.webContents.send('window:state-changed', getMainWindowState(win))
}

function queueOpenWorkspaceFile(filePath: string) {
  if (!hasWorkspaceFileExtension(filePath)) return
  rememberApprovedWorkspacePath(filePath)
  pendingOpenFilePath = filePath
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoadingMainFrame()) {
    focusMainWindow()
    mainWindow.webContents.send('workspace:openedViaFile', filePath)
    pendingOpenFilePath = null
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const argvWorkspaceFile = argv.slice(1).find(
      arg => typeof arg === 'string' && hasWorkspaceFileExtension(arg) && fs.existsSync(arg)
    )

    focusMainWindow()

    if (argvWorkspaceFile) {
      console.log('[main] Reusing existing instance for workspace file:', argvWorkspaceFile)
      queueOpenWorkspaceFile(argvWorkspaceFile)
    }
  })
}

// macOS: file opened by double-clicking a workspace file while app is running
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  queueOpenWorkspaceFile(filePath)
})

function getCrashReportDir(): string {
  return path.join(app.getPath('userData'), 'crash-reports')
}

function writeCrashReport(kind: string, payload: any): string | null {
  try {
    const dir = getCrashReportDir()
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(dir, `${stamp}-${kind}.json`)
    const body = {
      kind,
      timestamp: new Date().toISOString(),
      appVersion: app.getVersion(),
      platform: process.platform,
      payload,
    }
    fs.writeFileSync(filePath, JSON.stringify(body, null, 2), 'utf-8')
    return filePath
  } catch (err: any) {
    console.error('[crash-report] failed to write:', err?.message || err)
    return null
  }
}

async function notifyCrashReport(kind: string, summary: string, reportPath: string | null) {
  try {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
    const reportLine = reportPath ? `\n\nCrash report saved to:\n${reportPath}` : ''
    const res = await dialog.showMessageBox(win, {
      type: 'error',
      title: 'metis encountered a problem',
      message: 'Something went wrong.',
      detail: `${summary}${reportLine}\n\nYou can share this report file with support to help diagnose the issue.`,
      buttons: reportPath ? ['Open Report Folder', 'Close'] : ['Close'],
      defaultId: 0,
      cancelId: reportPath ? 1 : 0,
    })
    if (reportPath && res.response === 0) {
      await shell.openPath(path.dirname(reportPath))
    }
  } catch {
  }
}

function buildSplashHtml(): string {
  const splashTheme = readStoredThemePreference()
  const splashVersionLabel = app.getVersion() || '0.0.2'
  const isLightSplash = splashTheme === 'light'
  const logoAssetPath = isLightSplash ? 'src/assets/logo-black.svg' : 'src/assets/logo-primary.svg'
  const splashColors = isLightSplash
    ? {
        colorScheme: 'light',
        cardBorder: 'rgba(135, 151, 107, 0.92)',
        cardBorderBright: '#87976B',
        shellBorder: '#D7DDE6',
        cardBg: '#F4F6F8',
        cardBorderSoft: 'rgba(135, 151, 107, 0.28)',
        cardGloss: 'rgba(255, 255, 255, 0.72)',
        cardSnakeGlow: 'rgba(135, 151, 107, 0.28)',
        cardFood: '#87976B',
        title: '#181818',
        subtitle: '#5F6978',
        traceBase: 'rgba(135, 151, 107, 0.20)',
        traceGlowFilter: 'rgba(135, 151, 107, 0.14)',
        traceFilter: 'rgba(135, 151, 107, 0.32)',
        logoBase: 'rgba(24, 24, 24, 0.12)',
        fallbackLogoFill: '#181818',
      }
    : {
        colorScheme: 'dark',
        cardBorder: 'rgba(211, 184, 95, 0.94)',
        cardBorderBright: '#e9c96f',
        shellBorder: '#2a2a35',
        cardBg: '#181818',
        cardBorderSoft: 'rgba(198, 162, 75, 0.26)',
        cardGloss: 'rgba(255, 255, 255, 0.24)',
        cardSnakeGlow: 'rgba(211, 184, 95, 0.34)',
        cardFood: '#f0cf7a',
        title: '#F5F1E7',
        subtitle: '#B0B0C0',
        traceBase: 'rgba(198, 162, 75, 0.22)',
        traceGlowFilter: 'rgba(198, 162, 75, 0.18)',
        traceFilter: 'rgba(211, 184, 95, 0.38)',
        logoBase: 'rgba(198, 162, 75, 0.28)',
        fallbackLogoFill: '#c6a24b',
      }

  // Embed the logo as base64 so it works inside a data: URL context
  let logoBadgeImg = ''
  try {
    const candidates = [
      path.join(__dirname, '..', logoAssetPath),
      path.join(app.getAppPath(), logoAssetPath),
    ]
    for (const src of candidates) {
      if (fs.existsSync(src)) {
        logoBadgeImg = `data:image/svg+xml;base64,${fs.readFileSync(src).toString('base64')}`
        break
      }
    }
  } catch {}

  const traceX = 0.75
  const traceY = 0.75
  const traceW = 252.5
  const traceH = 88.5
  const traceR = 16
  const borderPath = [
    `M ${traceX + traceR} ${traceY}`,
    `H ${traceX + traceW - traceR}`,
    `A ${traceR} ${traceR} 0 0 1 ${traceX + traceW} ${traceY + traceR}`,
    `V ${traceY + traceH - traceR}`,
    `A ${traceR} ${traceR} 0 0 1 ${traceX + traceW - traceR} ${traceY + traceH}`,
    `H ${traceX + traceR}`,
    `A ${traceR} ${traceR} 0 0 1 ${traceX} ${traceY + traceH - traceR}`,
    `V ${traceY + traceR}`,
    `A ${traceR} ${traceR} 0 0 1 ${traceX + traceR} ${traceY}`,
    'Z',
  ].join(' ')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>metis Splash</title>
    <style>
      :root {
        color-scheme: ${splashColors.colorScheme};
        --shell-width: 263px;
        --shell-height: 99px;
        --card-width: 254px;
        --card-height: 90px;
        --card-border: ${splashColors.cardBorder};
        --card-border-bright: ${splashColors.cardBorderBright};
        --shell-border: ${splashColors.shellBorder};
        --card-bg: ${splashColors.cardBg};
        --card-border-soft: ${splashColors.cardBorderSoft};
        --card-gloss: ${splashColors.cardGloss};
        --card-snake-glow: ${splashColors.cardSnakeGlow};
        --card-food: ${splashColors.cardFood};
        --title: ${splashColors.title};
        --subtitle: ${splashColors.subtitle};
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
      }

      body {
        display: grid;
        place-items: center;
        font-family: "DM Sans", "Segoe UI", sans-serif;
        user-select: none;
      }

      .shell {
        position: relative;
        width: var(--shell-width);
        height: var(--shell-height);
        padding: 4.5px;
        overflow: hidden;
        border-radius: 20px;
        background: var(--card-bg);
        box-shadow: inset 0 0 0 1px var(--shell-border);
      }

      .card {
        position: relative;
        overflow: hidden;
        width: var(--card-width);
        height: var(--card-height);
        border-radius: 16px;
        background: var(--card-bg);
        padding: 16px;
      }

      .card::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        border: 1px solid var(--card-border-soft);
        opacity: 0.95;
      }

      .card-trace {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .card-trace path {
        fill: none;
        vector-effect: non-scaling-stroke;
      }

      .card-trace circle {
        vector-effect: non-scaling-stroke;
      }

      .card-trace .trace-base {
        stroke: ${splashColors.traceBase};
        stroke-width: 1;
      }

      .card-trace .trace-snake-glow {
        stroke: var(--card-snake-glow);
        stroke-width: 3.4;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 15.8 1000;
        stroke-dashoffset: 0;
        opacity: 0.95;
        filter: drop-shadow(0 0 6px ${splashColors.traceGlowFilter});
      }

      .card-trace .trace-snake {
        stroke: var(--card-border-bright);
        stroke-width: 1.7;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 14 1000;
        stroke-dashoffset: 0;
        opacity: 1;
        filter: drop-shadow(0 0 8px ${splashColors.traceFilter});
      }

      .content {
        position: relative;
        z-index: 1;
        display: flex;
        width: 100%;
        height: 100%;
        align-items: center;
        gap: 8px;
      }

      .badge {
        width: 56px;
        height: 64px;
        display: grid;
        place-items: center;
        flex: 0 0 auto;
      }

      .logo {
        width: 56px;
        height: 56px;
        overflow: visible;
        object-fit: contain;
      }

      .logo .logo-base {
        fill: ${splashColors.logoBase};
      }

      .logo .logo-ink {
        fill: var(--card-border);
      }

      .logo .logo-mask-path {
        fill: none;
        stroke: white;
        stroke-width: 30;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 0 100;
        animation: graph-draw 4.8s cubic-bezier(0.55, 0, 0.2, 1) infinite;
      }

      .wordmark {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 4px;
      }

      .title {
        margin: 0;
        color: var(--title);
        font-size: 24px;
        line-height: 1;
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      .subtitle {
        margin: 0;
        color: var(--subtitle);
        font-size: 10px;
        line-height: 1.25;
        letter-spacing: 0.01em;
        opacity: 0.95;
        animation: text-breathe 4.8s ease-in-out infinite;
      }

      @keyframes graph-draw {
        0% {
          stroke-dasharray: 0 100;
        }
        50% {
          stroke-dasharray: 100 0;
        }
        82% {
          stroke-dasharray: 100 0;
        }
        100% {
          stroke-dasharray: 0 100;
        }
      }

      @keyframes text-breathe {
        0%,
        100% {
          opacity: 0.78;
        }
        50% {
          opacity: 1;
        }
      }

      .card[data-reduced-motion="true"] .trace-snake-glow,
      .card[data-reduced-motion="true"] .trace-snake,
      .card[data-reduced-motion="true"] .trace-snake-glow,
      .card[data-reduced-motion="true"] .trace-snake {
        opacity: 0;
      }

      @media (prefers-reduced-motion: reduce) {
        .logo .logo-mask-path,
        .subtitle {
          animation: none;
          stroke-dasharray: 100 0;
          opacity: 1;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="card">
        <svg class="card-trace" viewBox="0 0 254 90" preserveAspectRatio="none" aria-hidden="true">
          <path class="trace-base" d="${borderPath}"></path>
          <path class="trace-snake-glow" d="${borderPath}"></path>
          <path class="trace-snake" d="${borderPath}"></path>
        </svg>
        <div class="content">
          <div class="badge" aria-hidden="true">
            ${logoBadgeImg
              ? `<img class="logo" src="${logoBadgeImg}" alt="" style="width:48px;height:48px;object-fit:contain;" />`
              : `<svg class="logo" viewBox="0 0 246.27 322.64" aria-hidden="true"><polygon fill="${splashColors.fallbackLogoFill}" points="196.35 238.72 53.7 322.64 74.68 127.55 196.35 238.72"/><polygon fill="${splashColors.fallbackLogoFill}" points="153.13 189.64 74.68 117.7 246.27 0 153.13 189.64"/><path fill="${splashColors.fallbackLogoFill}" d="M49.09,294.95L0,46.57c10.52,10.23,20.82,20.72,31.05,31.25,12.73,13.09,25.47,26.34,37.74,39.88-2.74,30.83-6.68,61.54-10.05,92.3-3.03,27.62-5.07,56.05-8.8,83.5-.09.63-.06,1.29-.85,1.46Z"/></svg>`
            }
          </div>
          <div class="wordmark">
            <div style="display:flex;align-items:baseline;gap:8px;">
              <p class="title" style="margin:0;">metis</p>
              <span class="version" style="margin:0 0 0 2px;color:var(--subtitle);font-size:9px;font-weight:500;letter-spacing:0.01em;opacity:0.72;">${splashVersionLabel}</span>
            </div>
            <p class="subtitle" style="margin:0;color:var(--subtitle);font-size:10px;font-weight:400;letter-spacing:0.01em;">Advanced PLS-SEM Analysis</p>
          </div>
        </div>
      </div>
    </div>
    <script>
      (() => {
        const card = document.querySelector('.card');
        const route = document.querySelector('.trace-snake');
        const glow = document.querySelector('.trace-snake-glow');
        if (!(route instanceof SVGPathElement) || !(glow instanceof SVGPathElement)) return;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduceMotion) {
          card?.setAttribute('data-reduced-motion', 'true');
          return;
        }

        const totalLength = route.getTotalLength();
        const foodStops = [0.1, 0.34, 0.58, 0.82].map((stop) => stop * totalLength);
        const loopDurationMs = 7200;
        const speed = totalLength / (loopDurationMs / 1000);
        const pickupWindow = 5.5;
        const startSnakeLength = 12;
        const snakeGrowth = 6;
        const maxSnakeLength = 32;

        let head = 0;
        let currentSnakeLength = startSnakeLength;
        let targetSnakeLength = startSnakeLength;
        let activeFoodIndex = 0;
        let lastFrameAt = performance.now();

        const wrap = (value) => {
          const wrapped = value % totalLength;
          return wrapped < 0 ? wrapped + totalLength : wrapped;
        };

        const applySegment = (path, length, headPosition) => {
          const segmentLength = Math.min(Math.max(length, 1), totalLength - 0.01);
          const trailStart = wrap(headPosition - segmentLength);
          path.style.strokeDasharray = segmentLength.toFixed(3) + ' ' + Math.max(totalLength - segmentLength, 0.01).toFixed(3);
          path.style.strokeDashoffset = String(-trailStart);
        };

        applySegment(route, currentSnakeLength, head);
        applySegment(glow, currentSnakeLength + 1.8, head);

        const tick = (now) => {
          const dt = Math.min((now - lastFrameAt) / 1000, 0.05);
          lastFrameAt = now;

          head = wrap(head + speed * dt);
          currentSnakeLength += (targetSnakeLength - currentSnakeLength) * Math.min(1, dt * 6.2);

          applySegment(route, currentSnakeLength, head);
          applySegment(glow, currentSnakeLength + 1.8, head);

          const checkpointDistance = foodStops[activeFoodIndex];
          const wrappedDistance = Math.min(wrap(checkpointDistance - head), wrap(head - checkpointDistance));
          if (wrappedDistance <= pickupWindow) {
            targetSnakeLength = Math.min(maxSnakeLength, targetSnakeLength + snakeGrowth);
            activeFoodIndex = (activeFoodIndex + 1) % foodStops.length;
          }

          window.requestAnimationFrame(tick);
        };

        window.requestAnimationFrame(tick);
      })();
    </script>
  </body>
</html>`
}

function clearSplashFallbackTimer() {
  if (!splashFallbackTimer) return
  clearTimeout(splashFallbackTimer)
  splashFallbackTimer = null
}

function clearSplashCloseTimer() {
  if (!splashCloseTimer) return
  clearTimeout(splashCloseTimer)
  splashCloseTimer = null
}

function showSplashWindow() {
  if (!splashWindow || splashWindow.isDestroyed()) {
    splashWindow = null
    return
  }

  if (!splashWindow.isVisible()) {
    splashWindow.showInactive()
  }

  if (!splashShownAt) {
    splashShownAt = Date.now()
  }

  if (splashCloseRequested) {
    scheduleSplashClose()
  }
}

function closeSplashWindow() {
  clearSplashCloseTimer()
  if (!splashWindow || splashWindow.isDestroyed()) {
    splashWindow = null
    return
  }

  splashWindow.close()
  splashWindow = null
  splashShownAt = 0
  splashCloseRequested = false
}

function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  clearSplashFallbackTimer()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashCloseRequested = true
    if (splashShownAt) {
      scheduleSplashClose()
    }
  }
}

function scheduleSplashClose() {
  clearSplashCloseTimer()
  if (!splashWindow || splashWindow.isDestroyed()) {
    splashWindow = null
    return
  }

const minVisibleMs = 1800
  const elapsed = splashShownAt ? Date.now() - splashShownAt : 0
  const delay = splashShownAt ? Math.max(0, minVisibleMs - elapsed) : 0

  splashCloseTimer = setTimeout(() => {
    closeSplashWindow()
  }, delay)
}

function scheduleSplashFallback() {
  clearSplashFallbackTimer()
  splashFallbackTimer = setTimeout(() => {
    revealMainWindow()
  }, 15000)
}

function resolvePreloadPath(): string {
  const candidates = [
    path.join(__dirname, 'preload.mjs'),
    path.join(__dirname, 'preload.js'),
    path.join(__dirname, 'preload.cjs'),
  ]
  const found = candidates.find((candidate) => fs.existsSync(candidate))
  return found ?? candidates[0]
}

function compareVersionStrings(a: string, b: string): number {
  const aParts = a.split('.').map((part) => Number(part) || 0)
  const bParts = b.split('.').map((part) => Number(part) || 0)
  const len = Math.max(aParts.length, bParts.length)
  for (let i = 0; i < len; i += 1) {
    const diff = (aParts[i] || 0) - (bParts[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type RscriptProbeResult = {
  ok: boolean
  path: string
  version: string | null
  home: string | null
  libPaths: string[]
  stdout: string
  stderr: string
  error?: string
}

type WindowsRscriptDetection = {
  path: string | null
  candidates: string[]
  diagnostics: string[]
  probe: Pick<RscriptProbeResult, 'version' | 'home' | 'libPaths'> | null
}

type RscriptDetection = WindowsRscriptDetection

type PackageCheckResult = {
  success: boolean
  packages?: Record<string, boolean>
  error?: string
  diagnostics?: string[]
  version?: string | null
  home?: string | null
  libPaths?: string[]
}

type ExistingWindowsInstallInfo = {
  found: boolean
  version: string | null
  installLocation: string | null
}

function extractMarkedLines(output: string): string[] | null {
  const startMarker = '__METIS_BEGIN__'
  const endMarker = '__METIS_END__'
  const start = output.indexOf(startMarker)
  const end = output.indexOf(endMarker)
  if (start < 0 || end < 0 || end <= start) return null

  return output
    .slice(start + startMarker.length, end)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function dedupePaths(paths: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const candidate of paths) {
    if (!candidate) continue
    const normalized = path.resolve(candidate)
    const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }

  return result
}

function normalizeExecutablePath(executablePath: string | null | undefined): string {
  return String(executablePath ?? '')
    .trim()
    .replace(/^"(.*)"$/, '$1')
}

function isRscriptExecutableName(targetPath: string): boolean {
  const baseName = path.basename(targetPath).toLowerCase()
  return baseName === 'rscript.exe' || baseName === 'rscript'
}

function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(String(rawUrl ?? '').trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:'
  } catch {
    return false
  }
}

function sanitizePathComponent(value: string | null | undefined, fallback = 'item'): string {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^\.+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^\w.-]/g, '_')

  return cleaned || fallback
}

function ensureSafeDatasetId(datasetId: string | null | undefined): string {
  const trimmed = String(datasetId ?? '').trim()
  if (!trimmed) {
    throw new Error('Dataset id is required.')
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(trimmed)) {
    throw new Error('Dataset id contains unsupported characters.')
  }
  return trimmed
}

function resolveSampleDatasetPath(): string {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'sample-data', sampleDatasetFileName) : '',
    path.join(app.getAppPath(), 'sample-data', sampleDatasetFileName),
    path.join(app.getAppPath(), sampleDatasetFileName),
    path.join(process.cwd(), sampleDatasetFileName),
    path.join(__dirname, '..', sampleDatasetFileName),
  ].filter(Boolean)

  const found = candidates.find((candidate) => fs.existsSync(candidate))
  if (!found) {
    throw new Error('Packaged sample dataset was not found.')
  }
  return found
}

function splitCsvRecord(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuote = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (inQuote && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuote = !inQuote
      }
    } else if (character === ',' && !inQuote) {
      cells.push(current.trim())
      current = ''
    } else {
      current += character
    }
  }

  cells.push(current.trim())
  return cells
}

function summarizeDatasetFile(filePath: string): {
  headers: string[]
  allRows: string[][]
  variableTypes: Record<string, 'MET' | 'CAT'>
  totalRows: number
  missing: number
} {
  const text = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line) => line.trim())
  if (lines.length < 2) {
    throw new Error('Sample dataset appears empty.')
  }

  const headers = splitCsvRecord(lines[0])
  const allRows = lines.slice(1).map(splitCsvRecord)
  let missing = 0
  allRows.forEach((row) => row.forEach((cell) => {
    if (missingValueTokens.has(String(cell ?? '').trim().toLowerCase())) missing += 1
  }))

  const variableTypes: Record<string, 'MET' | 'CAT'> = {}
  headers.forEach((header, index) => {
    const presentValues = allRows
      .map((row) => String(row[index] ?? '').trim())
      .filter((value) => !missingValueTokens.has(value.toLowerCase()))
    variableTypes[header] = presentValues.length > 0 && presentValues.every((value) => Number.isFinite(Number(value)))
      ? 'MET'
      : 'CAT'
  })

  return { headers, allRows, variableTypes, totalRows: allRows.length, missing }
}

function isWorkspaceFileLikePath(targetPath: string): boolean {
  const resolved = path.resolve(String(targetPath ?? '').trim())
  return hasWorkspaceFileExtension(resolved)
}

function queryWindowsRegistryValue(key: string, valueName: string, timeout = 6000): string | null {
  try {
    const out = execSync(`reg query "${key}" /v "${valueName}" 2>nul`, { timeout }).toString()
    const match = new RegExp(`${escapeRegExp(valueName)}\\s+REG_\\w+\\s+(.+)`, 'i').exec(out)
    return match?.[1]?.trim() || null
  } catch {
    return null
  }
}

function getExistingWindowsInstallInfo(): ExistingWindowsInstallInfo {
  if (process.platform !== 'win32') {
    return { found: false, version: null, installLocation: null }
  }

  const uninstallKeys = [
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.metis.app',
    'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.metis.app',
    'HKEY_LOCAL_MACHINE\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.metis.app',
  ]

  for (const key of uninstallKeys) {
    const displayName = queryWindowsRegistryValue(key, 'DisplayName')
    if (!displayName || !/metis/i.test(displayName)) continue

    return {
      found: true,
      version: queryWindowsRegistryValue(key, 'DisplayVersion'),
      installLocation: queryWindowsRegistryValue(key, 'InstallLocation'),
    }
  }

  return { found: false, version: null, installLocation: null }
}

function probeRscriptExecutable(rscriptPath: string, env?: NodeJS.ProcessEnv): RscriptProbeResult {
  const executablePath = normalizeExecutablePath(rscriptPath)
  const probeCode = [
    'cat("__METIS_BEGIN__\\n")',
    'cat("version=", paste(R.version$major, R.version$minor, sep="."), "\\n", sep="")',
    'cat("home=", normalizePath(R.home(), winslash="/", mustWork=FALSE), "\\n", sep="")',
    'cat("libs=", paste(normalizePath(.libPaths(), winslash="/", mustWork=FALSE), collapse="|"), "\\n", sep="")',
    'cat("__METIS_END__\\n")',
  ].join('\n')

  try {
    const result = spawnSync(executablePath, ['--vanilla', '--quiet', '-e', probeCode], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 10000,
      ...(env ? { env: { ...process.env, ...env } } : {}),
    })
    const stdout = String(result.stdout ?? '')
    const stderr = String(result.stderr ?? '')
    const combined = `${stdout}\n${stderr}`

    if (result.error) {
      return {
        ok: false,
        path: executablePath,
        version: null,
        home: null,
        libPaths: [],
        stdout,
        stderr,
        error: result.error.message,
      }
    }

    const lines = extractMarkedLines(combined)
    if (!lines) {
      return {
        ok: false,
        path: executablePath,
        version: null,
        home: null,
        libPaths: [],
        stdout,
        stderr,
        error: `Probe output missing markers (exit ${result.status ?? 'unknown'})`,
      }
    }

    let version: string | null = null
    let home: string | null = null
    let libPaths: string[] = []

    for (const line of lines) {
      if (line.startsWith('version=')) version = line.slice('version='.length).trim() || null
      if (line.startsWith('home=')) home = line.slice('home='.length).trim() || null
      if (line.startsWith('libs=')) {
        libPaths = line
          .slice('libs='.length)
          .split('|')
          .map((entry) => entry.trim())
          .filter(Boolean)
      }
    }

    return {
      ok: true,
      path: executablePath,
      version,
      home,
      libPaths,
      stdout,
      stderr,
    }
  } catch (err: any) {
    return {
      ok: false,
      path: executablePath,
      version: null,
      home: null,
      libPaths: [],
      stdout: '',
      stderr: '',
      error: err?.message || 'Unknown Rscript probe error',
    }
  }
}

function findRscriptExecutablesUnderRoot(root: string, maxDepth = 4, maxMatches = 24): string[] {
  if (!fs.existsSync(root)) return []

  const matches: string[] = []
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]
  let visitedDirs = 0
  const maxVisitedDirs = 1200

  while (stack.length > 0 && matches.length < maxMatches && visitedDirs < maxVisitedDirs) {
    const current = stack.pop()!
    let entries: fs.Dirent[] = []

    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true })
    } catch {
      continue
    }

    visitedDirs += 1

    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase() === 'rscript.exe') {
        matches.push(path.join(current.dir, entry.name))
        if (matches.length >= maxMatches) break
      }
    }

    if (current.depth >= maxDepth) continue

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const name = entry.name.toLowerCase()
      if (
        name === 'node_modules' ||
        name === 'npm-cache' ||
        name === 'cache' ||
        name === 'tmp' ||
        name === 'temp' ||
        name === 'logs' ||
        name.startsWith('$')
      ) {
        continue
      }
      stack.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 })
    }
  }

  return dedupePaths(matches)
}

function findInstalledWindowsRscript(options: { deepSearch?: boolean } = {}): WindowsRscriptDetection {
  const diagnostics: string[] = []
  const candidateReasons = new Map<string, { path: string; reasons: string[] }>()
  const addCandidate = (candidate: string | null | undefined, reason: string) => {
    if (!candidate) return
    const normalized = path.resolve(candidate)
    const key = normalized.toLowerCase()
    const entry = candidateReasons.get(key) ?? { path: normalized, reasons: [] }
    const reasons = entry.reasons
    if (!reasons.includes(reason)) reasons.push(reason)
    candidateReasons.set(key, entry)
  }

  const rscriptFromBase = (base: string): string | null => {
    const candidates = [
      path.join(base, 'bin', 'x64', 'Rscript.exe'),
      path.join(base, 'bin', 'Rscript.exe'),
      // Some installs have the x64 folder directly inside bin as a sub-version
      path.join(base, 'bin', 'x64', 'x64', 'Rscript.exe'),
    ]
    return candidates.find((c) => fs.existsSync(c)) ?? null
  }

  const queryRegistryValue = (key: string, valueName: string): string | null => {
    return queryWindowsRegistryValue(key, valueName, 6000)
  }

  const getRegistryVersionKeys = (rootKey: string): string[] => {
    try {
      const out = execSync(`reg query "${rootKey}" 2>nul`, { timeout: 6000 }).toString()
      const keys = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith(`${rootKey}\\`))
        .map((line) => ({
          key: line,
          version: line.slice(rootKey.length + 1),
        }))
        .filter((entry) => /^\d+(?:\.\d+)+$/.test(entry.version))
        .sort((a, b) => compareVersionStrings(b.version, a.version))
        .map((entry) => entry.key)
      return [...new Set(keys)]
    } catch {
      return []
    }
  }

  // 1. R_HOME environment variable
  const rHome = process.env['R_HOME']
  if (rHome) {
    const found = rscriptFromBase(rHome)
    if (found) addCandidate(found, 'R_HOME')
  }

  // 2. Windows registry — R writes InstallPath here regardless of install location
  const regKeys = [
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\R-core\\R',
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\R-core\\R64',
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\R-core\\R',
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\R-core\\R64',
    'HKEY_CURRENT_USER\\SOFTWARE\\R-core\\R',
    'HKEY_CURRENT_USER\\SOFTWARE\\R-core\\R64',
  ]
  for (const key of regKeys) {
    const directInstallPath = queryRegistryValue(key, 'InstallPath')
    if (directInstallPath) {
      const found = rscriptFromBase(directInstallPath)
      if (found) addCandidate(found, `registry:${key}:InstallPath`)
    }

    const currentVersion = queryRegistryValue(key, 'Current Version')
    if (currentVersion) {
      const versionedInstallPath = queryRegistryValue(`${key}\\${currentVersion}`, 'InstallPath')
      if (versionedInstallPath) {
        const found = rscriptFromBase(versionedInstallPath)
        if (found) addCandidate(found, `registry:${key}\\${currentVersion}:InstallPath`)
      }
    }

    for (const versionKey of getRegistryVersionKeys(key)) {
      const versionedInstallPath = queryRegistryValue(versionKey, 'InstallPath')
      if (!versionedInstallPath) continue
      const found = rscriptFromBase(versionedInstallPath)
      if (found) addCandidate(found, `registry:${versionKey}:InstallPath`)
    }
  }

  // 3. Program Files scan (standard install locations)
  const discovered: Array<{ version: string; path: string; reason: string }> = []
  const roots = [
    process.env['ProgramFiles'],
    process.env['ProgramW6432'],
    process.env['ProgramFiles(x86)'],
    process.env['LOCALAPPDATA'] ? path.join(process.env['LOCALAPPDATA'], 'Programs') : null,
  ].filter((value): value is string => !!value)

  for (const root of roots) {
    const rRoot = path.join(root, 'R')
    if (!fs.existsSync(rRoot)) continue
    const entries = fs.readdirSync(rRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const match = /^R-(\d+(?:\.\d+)*)$/i.exec(entry.name)
      if (!match) continue
      const found = rscriptFromBase(path.join(rRoot, entry.name))
      if (found) discovered.push({ version: match[1], path: found, reason: `standard-root:${path.join(rRoot, entry.name)}` })
    }
  }
  if (discovered.length) {
    discovered.sort((a, b) => compareVersionStrings(b.version, a.version))
    discovered.forEach((entry) => addCandidate(entry.path, entry.reason))
  }

  const username = process.env['USERNAME'] || process.env['USER'] || ''
  const driveLetters = Array.from({ length: 24 }, (_, index) => String.fromCharCode(67 + index))
    .filter((letter) => fs.existsSync(`${letter}:\\`))
  const deepRoots = dedupePaths([
    process.env['LOCALAPPDATA'] ? path.join(process.env['LOCALAPPDATA'], 'Programs') : null,
    process.env['LOCALAPPDATA'] ? path.join(process.env['LOCALAPPDATA'], 'Microsoft', 'WinGet', 'Packages') : null,
    process.env['ProgramData'] ? path.join(process.env['ProgramData'], 'chocolatey', 'lib') : null,
    process.env['ProgramData'] ? path.join(process.env['ProgramData'], 'chocolatey', 'bin') : null,
    process.env['USERPROFILE'] ? path.join(process.env['USERPROFILE'], 'scoop', 'apps') : null,
    ...driveLetters.flatMap((drive) => ([
      `${drive}:\\R`,
      `${drive}:\\Program Files\\R`,
      `${drive}:\\Program Files (x86)\\R`,
      `${drive}:\\tools`,
      username ? `${drive}:\\Users\\${username}\\AppData\\Local\\Programs` : null,
      username ? `${drive}:\\Users\\${username}\\AppData\\Local\\Microsoft\\WinGet\\Packages` : null,
      username ? `${drive}:\\Users\\${username}\\scoop\\apps` : null,
    ])),
  ])

  if (options.deepSearch) {
    diagnostics.push(`Expanded search roots checked: ${deepRoots.length}`)
    for (const root of deepRoots) {
      for (const found of findRscriptExecutablesUnderRoot(root)) {
        addCandidate(found, `deep-search:${root}`)
      }
    }
  }

  const pathEntries = String(process.env['PATH'] || '')
    .split(';')
    .map((entry) => entry.trim().replace(/^"+|"+$/g, ''))
    .filter(Boolean)

  for (const entry of pathEntries) {
    const candidate = path.join(entry, 'Rscript.exe')
    if (fs.existsSync(candidate)) addCandidate(candidate, `PATH:${entry}`)
  }

  // 4. `where Rscript.exe` — finds R if it's on the system PATH
  try {
    const result = execSync('where Rscript.exe 2>nul', { timeout: 6000 }).toString().trim()
    result
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((candidate) => {
        if (fs.existsSync(candidate)) addCandidate(candidate, 'where')
      })
  } catch { /* not on PATH or timed out */ }

  const candidates = Array.from(candidateReasons.values()).map((entry) => entry.path)

  diagnostics.push(`Candidate Rscript paths found: ${candidates.length}`)

  for (const candidate of candidates) {
    const probe = probeRscriptExecutable(candidate)
    if (probe.ok) {
      const reasons = candidateReasons.get(candidate.toLowerCase())?.reasons ?? []
      diagnostics.push(`Validated Rscript: ${candidate}${reasons.length ? ` (${reasons.join(', ')})` : ''}`)
      return {
        path: candidate,
        candidates,
        diagnostics,
        probe: {
          version: probe.version,
          home: probe.home,
          libPaths: probe.libPaths,
        },
      }
    }

    const reasons = candidateReasons.get(candidate.toLowerCase())?.reasons ?? []
    diagnostics.push(`Rejected candidate: ${candidate}${reasons.length ? ` (${reasons.join(', ')})` : ''} - ${probe.error || 'unknown probe error'}`)
  }

  diagnostics.push('No valid Rscript.exe could be confirmed from registry, known install roots, PATH, or expanded search roots.')

  return {
    path: null,
    candidates,
    diagnostics,
    probe: null,
  }
}

function findInstalledUnixRscript(): RscriptDetection {
  const diagnostics: string[] = []
  const candidateReasons = new Map<string, { path: string; reasons: string[] }>()
  const addCandidate = (candidate: string | null | undefined, reason: string) => {
    if (!candidate) return
    const normalized = path.resolve(candidate)
    const entry = candidateReasons.get(normalized) ?? { path: normalized, reasons: [] }
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason)
    candidateReasons.set(normalized, entry)
  }

  const rHome = process.env['R_HOME']
  if (rHome) addCandidate(path.join(rHome, 'bin', 'Rscript'), 'R_HOME')

  const commonCandidates = process.platform === 'darwin'
    ? [
        '/Library/Frameworks/R.framework/Resources/bin/Rscript',
        '/opt/homebrew/bin/Rscript',
        '/usr/local/bin/Rscript',
        '/usr/bin/Rscript',
      ]
    : [
        '/usr/bin/Rscript',
        '/usr/local/bin/Rscript',
        '/snap/bin/Rscript',
        '/opt/R/bin/Rscript',
      ]

  for (const candidate of commonCandidates) {
    if (fs.existsSync(candidate)) addCandidate(candidate, 'standard-root')
  }

  const pathEntries = String(process.env['PATH'] || '')
    .split(path.delimiter)
    .map((entry) => entry.trim().replace(/^"+|"+$/g, ''))
    .filter(Boolean)

  for (const entry of pathEntries) {
    const candidate = path.join(entry, 'Rscript')
    if (fs.existsSync(candidate)) addCandidate(candidate, `PATH:${entry}`)
  }

  try {
    const result = execSync('command -v Rscript 2>/dev/null', { timeout: 6000 }).toString().trim()
    result
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((candidate) => {
        if (fs.existsSync(candidate)) addCandidate(candidate, 'command -v')
      })
  } catch { /* not on PATH or timed out */ }

  const candidates = Array.from(candidateReasons.values()).map((entry) => entry.path)
  diagnostics.push(`Candidate Rscript paths found: ${candidates.length}`)

  for (const candidate of candidates) {
    const probe = probeRscriptExecutable(candidate)
    const reasons = candidateReasons.get(candidate)?.reasons ?? []
    if (probe.ok) {
      diagnostics.push(`Validated Rscript: ${candidate}${reasons.length ? ` (${reasons.join(', ')})` : ''}`)
      return {
        path: candidate,
        candidates,
        diagnostics,
        probe: {
          version: probe.version,
          home: probe.home,
          libPaths: probe.libPaths,
        },
      }
    }

    diagnostics.push(`Rejected candidate: ${candidate}${reasons.length ? ` (${reasons.join(', ')})` : ''} - ${probe.error || 'unknown probe error'}`)
  }

  diagnostics.push('No valid Rscript could be confirmed from R_HOME, standard install roots, PATH, or command lookup.')

  return {
    path: null,
    candidates,
    diagnostics,
    probe: null,
  }
}

function findInstalledRscript(options: { deepSearch?: boolean } = {}): RscriptDetection {
  return process.platform === 'win32'
    ? findInstalledWindowsRscript(options)
    : findInstalledUnixRscript()
}

function resolvePlumberScriptPath(): string {
  const candidates = [
    path.join(process.resourcesPath, 'r-api', 'plumber.R'),
    path.join(app.getAppPath(), 'r-api', 'plumber.R'),
    path.join(process.cwd(), 'r-api', 'plumber.R'),
    path.join(process.cwd(), 'runtime', 'r-api', 'plumber.R'),
    path.join(__dirname, '..', 'r-api', 'plumber.R'),
  ]
  const found = candidates.find((p) => fs.existsSync(p))
  return found ?? candidates[0]
}

function getBundledRscriptEnv(rscriptPath: string): NodeJS.ProcessEnv | null {
  if (process.platform === 'win32') return null
  const { extractedRscriptPath, runtimeDir } = getBundledPortableRuntimePaths()
  if (path.resolve(rscriptPath) !== path.resolve(extractedRscriptPath)) return null

  const rBin = path.join(runtimeDir, 'bin')
  const rLib = path.join(runtimeDir, 'lib')
  const rHome = path.join(rLib, 'R')
  const rLibrary = path.join(rHome, 'library')
  const env: NodeJS.ProcessEnv = {
    R_HOME: rHome,
    R_LIBS_USER: rLibrary,
    R_LIBS_SITE: rLibrary,
    PATH: [rBin, process.env.PATH || ''].filter(Boolean).join(path.delimiter),
  }

  if (process.platform === 'linux') {
    env.LD_LIBRARY_PATH = [rLib, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(path.delimiter)
  }
  if (process.platform === 'darwin') {
    env.DYLD_FALLBACK_LIBRARY_PATH = [rLib, process.env.DYLD_FALLBACK_LIBRARY_PATH || ''].filter(Boolean).join(path.delimiter)
  }

  return env
}

function resolveRscriptCommand(): string {
  const { extractedRscriptPath } = getBundledPortableRuntimePaths()
  if (!isLiteBuild()) {
    return extractedRscriptPath
  }

  const envPath = process.env.METIS_RSCRIPT_PATH
  if (envPath && envPath.trim().length > 0) {
    try {
      return validateRscriptSelection(envPath).path
    } catch (err: any) {
      console.warn('[main] Ignoring invalid METIS_RSCRIPT_PATH:', err?.message || err)
    }
  }

  const windowsCandidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'r-api', 'R-Portable', 'App', 'R-Portable', 'bin', 'Rscript.exe'),
        path.join(process.resourcesPath, 'runtime', 'r-portable', 'bin', 'Rscript.exe'),
        path.join(process.resourcesPath, 'runtime', 'r-portable', 'bin', 'x64', 'Rscript.exe'),
        path.join(process.resourcesPath, 'runtime', 'r', 'bin', 'Rscript.exe'),
        path.join(process.resourcesPath, 'runtime', 'r', 'bin', 'x64', 'Rscript.exe'),
        path.join(process.resourcesPath, 'r-portable', 'bin', 'Rscript.exe'),
        path.join(process.resourcesPath, 'r-portable', 'bin', 'x64', 'Rscript.exe'),
        path.join(process.resourcesPath, 'r', 'bin', 'Rscript.exe'),
        path.join(process.resourcesPath, 'r', 'bin', 'x64', 'Rscript.exe'),
      ]
    : [
        path.join(process.cwd(), 'r-api', 'R-Portable', 'App', 'R-Portable', 'bin', 'Rscript.exe'),
        path.join(process.cwd(), 'runtime', 'r-portable', 'bin', 'Rscript.exe'),
        path.join(process.cwd(), 'runtime', 'r-portable', 'bin', 'x64', 'Rscript.exe'),
        path.join(process.cwd(), 'runtime', 'r', 'bin', 'Rscript.exe'),
        path.join(process.cwd(), 'runtime', 'r', 'bin', 'x64', 'Rscript.exe'),
      ]

  const unixCandidates = app.isPackaged
    ? [
        extractedRscriptPath,
        path.join(process.resourcesPath, 'r-api', 'R-Portable', 'App', 'R-Portable', 'bin', 'Rscript'),
        path.join(process.resourcesPath, 'runtime', 'r-portable', 'bin', 'Rscript'),
        path.join(process.resourcesPath, 'runtime', 'r', 'bin', 'Rscript'),
        path.join(process.resourcesPath, 'r-portable', 'bin', 'Rscript'),
        path.join(process.resourcesPath, 'r', 'bin', 'Rscript'),
      ]
    : [
        extractedRscriptPath,
        path.join(process.cwd(), 'r-api', 'R-Portable', 'App', 'R-Portable', 'bin', 'Rscript'),
        path.join(process.cwd(), 'runtime', 'r-portable', 'bin', 'Rscript'),
        path.join(process.cwd(), 'runtime', 'r', 'bin', 'Rscript'),
      ]

  const candidates = process.platform === 'win32' ? windowsCandidates : unixCandidates
  const found = candidates.find((candidate) => fs.existsSync(candidate))
  if (found) return found

  const installed = findInstalledRscript()
  if (installed.path) return installed.path

  return process.platform === 'win32' ? 'Rscript.exe' : 'Rscript'
}

async function waitForPlumber(url: string, timeoutMs = 12000): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`)
      if (res.ok) return true
    } catch {
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function isPlumberHealthy(timeoutMs = 1500): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(`${plumberBaseUrl}/health`, { signal: controller.signal })
    clearTimeout(timeoutId)
    return res.ok
  } catch {
    return false
  }
}

async function canBindLocalPort(port: number, host = DEFAULT_PLUMBER_HOST): Promise<boolean> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false

  return await new Promise((resolve) => {
    const server = createServer()
    let settled = false

    const finish = (result: boolean) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    server.once('error', () => {
      finish(false)
    })

    server.once('listening', () => {
      server.close(() => finish(true))
    })

    try {
      server.listen({ host, port, exclusive: true })
    } catch {
      finish(false)
    }
  })
}

async function reserveEphemeralLocalPort(host = DEFAULT_PLUMBER_HOST): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()

    server.once('error', (err) => {
      reject(err)
    })

    server.listen({ host, port: 0, exclusive: true }, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0

      server.close((err) => {
        if (err) {
          reject(err)
          return
        }
        if (!port) {
          reject(new Error('Failed to reserve an ephemeral localhost port for Plumber.'))
          return
        }
        resolve(port)
      })
    })
  })
}

async function resolvePlumberPort(preferredPort: number): Promise<number> {
  if (await canBindLocalPort(preferredPort)) {
    return preferredPort
  }

  console.warn(`[plumber] Preferred port ${preferredPort} is unavailable on localhost. Falling back to an ephemeral port.`)
  return await reserveEphemeralLocalPort()
}

async function startPlumberServer(): Promise<boolean> {
  if (plumberProcess) {
    return waitForPlumber(plumberBaseUrl, 3000)
  }

  const scriptPath = resolvePlumberScriptPath()
  if (!fs.existsSync(scriptPath)) {
    console.warn('[plumber] Script not found at', scriptPath)
    rememberPlumberLog('system', `Plumber script not found at ${scriptPath}`)
    return false
  }

  const runtimeStatus = getBundledPortableRuntimeStatus()
  if (!isLiteBuild() && !runtimeStatus.extractedRscriptExists) {
    rememberPlumberLog('system', `Bundled Rscript missing at ${runtimeStatus.extractedRscriptPath}; archive exists=${runtimeStatus.archiveExists} size=${runtimeStatus.archiveSize ?? 'null'}`)
    console.warn('[plumber] Bundled Rscript missing before startup:', runtimeStatus)
    return false
  }

  if (!isLiteBuild() && process.platform !== 'win32') {
    try {
      await prepareBundledUnixRuntime(runtimeStatus.runtimeDir, runtimeStatus.extractedRscriptPath)
    } catch (err: any) {
      rememberPlumberLog('system', `Bundled Unix R runtime relocation failed: ${err?.message || err}`)
      console.warn('[plumber] Bundled Unix R runtime relocation failed:', err?.message || err)
      return false
    }
  }

  const preferredPort = Number(process.env.METIS_PLUMBER_PORT || String(DEFAULT_PLUMBER_PORT))
  const port = await resolvePlumberPort(preferredPort)
  plumberBaseUrl = `http://${DEFAULT_PLUMBER_HOST}:${port}`
  const rscript = resolveRscriptCommand()
  resolvedRscript = rscript
  console.log('[plumber] Rscript command:', rscript)
  console.log('[plumber] Using localhost port:', port)

  plumberProcess = spawn(rscript, [scriptPath], {
    env: buildPlumberEnv(port, rscript),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  plumberProcess.stdout?.on('data', (chunk) => {
    const text = String(chunk).trim()
    rememberPlumberLog('stdout', text)
    console.log(`[plumber] ${text}`)
  })

  plumberProcess.stderr?.on('data', (chunk) => {
    const text = String(chunk).trim()
    rememberPlumberLog('stderr', text)
    console.error(`[plumber] ${text}`)
  })

  plumberProcess.on('exit', (code, signal) => {
    rememberPlumberLog('system', `R backend process exited with code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    console.log('[plumber] exited', { code, signal })
    plumberProcess = null
  })

  plumberProcess.on('error', (err) => {
    rememberPlumberLog('system', `R backend process error: ${err.message}`)
    console.error('[plumber] Failed to start process:', err.message)
    if (process.platform === 'win32' && /ENOENT/i.test(err.message)) {
      console.error('[plumber] Hint: set METIS_RSCRIPT_PATH or install bundled runtime under runtime/r-portable.')
    }
    plumberProcess = null
  })

  const isReady = await waitForPlumber(plumberBaseUrl)
  if (!isReady) {
    rememberPlumberLog('system', `Health check timed out for ${plumberBaseUrl}`)
    console.warn('[plumber] Health check timed out')
  } else {
    console.log('[plumber] Ready at', plumberBaseUrl)
  }

  return isReady
}

async function ensurePlumberReady(): Promise<boolean> {
  if (await isPlumberHealthy()) return true

  if (!plumberStartupPromise) {
    plumberStartupPromise = (async () => {
      console.log('[plumber] ensurePlumberReady: starting first attempt...')
      const started = await startPlumberServer()
      const healthy = started || await isPlumberHealthy(3000)
      console.log('[plumber] First attempt result:', { started, healthy })
      if (healthy) {
        return true
      }

      console.log('[plumber] First startup attempt failed, retrying...')
      if (plumberProcess) {
        stopPlumberServer({ preserveStartupPromise: true })
      }

      console.log('[plumber] ensurePlumberReady: starting second attempt...')
      const restarted = await startPlumberServer()
      const retryHealthy = restarted || await isPlumberHealthy(4000)
      console.log('[plumber] Second attempt result:', { restarted, healthy: retryHealthy })
      return retryHealthy
    })().catch((err: any) => {
      console.error('[plumber] Startup error:', err.message)
      return false
    }).finally(() => {
      plumberStartupPromise = null
    })
  }

  return plumberStartupPromise ?? false
}

async function restartPlumberServer(reason: string): Promise<boolean> {
  console.warn('[plumber] Restart requested:', reason)
  if (plumberProcess) {
    stopPlumberServer()
  } else {
    plumberStartupPromise = null
  }

  const restarted = await startPlumberServer()
  if (restarted) return true
  return await isPlumberHealthy(4000)
}

function stopPlumberServer(options?: { preserveStartupPromise?: boolean }) {
  if (!plumberProcess) return
  const pid = plumberProcess.pid
  try {
    if (process.platform === 'win32' && pid) {
      exec(`taskkill /PID ${pid} /T /F`, (err) => {
        if (err) {
          console.error('[plumber] taskkill failed:', err.message)
        }
      })
    } else if (pid) {
      try {
        process.kill(pid, 'SIGTERM')
        setTimeout(() => {
          try {
            process.kill(pid, 'SIGKILL')
          } catch {
          }
        }, 1200)
      } catch {
        plumberProcess.kill()
      }
    } else {
      plumberProcess.kill()
    }
  } catch (err: any) {
    console.error('[plumber] Failed to stop process:', err.message)
  } finally {
    if (!options?.preserveStartupPromise) {
      plumberStartupPromise = null
    }
    plumberProcess = null
  }
}

// ─── metis data directory ────────────────────────────────────────────────────
// On startup the resolved root comes from install-config.json (written by the
// installer flow). If that file doesn't exist we resolve against Downloads/metis,
// but we must not create that folder until setup has completed.

const INSTALL_CONFIG_NAME = 'install-config.json'

interface InstallConfig {
  rootPath?: string
  workspaceDataPath?: string
  exportPath?: string
  liteSetupComplete?: boolean
  rscriptPath?: string
}

function getInstallConfigPath(): string {
  return path.join(app.getPath('userData'), INSTALL_CONFIG_NAME)
}

function readInstallConfig(): InstallConfig | null {
  try {
    const cfgPath = getInstallConfigPath()
    if (!fs.existsSync(cfgPath)) return null
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
  } catch {
    return null
  }
}

function updateInstallConfig(updates: Record<string, unknown>): void {
  try {
    const cfgPath = getInstallConfigPath()
    const existing = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) : {}
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true })
    fs.writeFileSync(cfgPath, JSON.stringify({ ...existing, ...updates }, null, 2), 'utf-8')
  } catch (err: any) {
    console.error('[main] updateInstallConfig error:', err.message)
    throw err
  }
}

function writeInstallConfig(rootPath: string): void {
  try {
    const cfgPath = getInstallConfigPath()
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true })
    fs.writeFileSync(cfgPath, JSON.stringify({ rootPath }, null, 2), 'utf-8')
    console.log('[main] install-config written:', cfgPath)
  } catch (err: any) {
    console.error('[main] writeInstallConfig error:', err.message)
  }
}

function getRegistryWorkspacePath(): string | null {
  if (process.platform !== 'win32') return null
  try {
    const { execSync } = require('child_process')
    const key = 'HKEY_CURRENT_USER\\Software\\metis'
    const output = execSync(`reg query "${key}" /v WorkspaceDataPath`).toString()
    const match = /WorkspaceDataPath\s+REG_SZ\s+(.*)/.exec(output)
    if (match && match[1]) {
      const val = match[1].trim()
      if (fs.existsSync(val)) return val
      // If parent exists, it's still good
      if (fs.existsSync(path.dirname(val))) return val
    }
  } catch {}
  return null
}

function getBundledRuntimeArch(): string {
  return process.arch
}

function getBundledUnixRuntimeExtractionRoot(): string {
  return path.join(app.getPath('cache'), 'r-runtime', getBundledRuntimeArch())
}

function getBundledUnixRuntimeLegacyExtractionRoot(): string | null {
  if (process.platform === 'win32') return null
  return path.join(app.getPath('userData'), 'r-runtime')
}

function getBundledPortableRuntimePaths(): {
  extractedRscriptPath: string
  archiveName: string
  archivePath: string
  runtimeDir: string
  extractionRoot: string
  legacyRuntimeDir: string | null
} {
  const rApiResourcesDir = app.isPackaged
    ? path.join(process.resourcesPath, 'r-api')
    : path.join(process.cwd(), 'r-api')

  const archiveName = process.platform === 'win32'
    ? 'R-Portable.zip'
    : process.platform === 'darwin'
      ? `R-macos-${getBundledRuntimeArch()}.tar.gz`
      : 'R-linux.tar.gz'

  const extractionRoot = process.platform === 'win32'
    ? rApiResourcesDir
    : getBundledUnixRuntimeExtractionRoot()

  const runtimeDir = process.platform === 'win32'
    ? path.join(extractionRoot, 'R-Portable')
    : path.join(extractionRoot, 'R-Bundled')
  const legacyExtractionRoot = getBundledUnixRuntimeLegacyExtractionRoot()
  const legacyRuntimeDir = legacyExtractionRoot
    ? path.join(legacyExtractionRoot, 'R-Bundled')
    : null

  const extractedRscriptPath = process.platform === 'win32'
    ? path.join(runtimeDir, 'App', 'R-Portable', 'bin', 'Rscript.exe')
    : path.join(runtimeDir, 'bin', 'Rscript')

  const archivePath = path.join(rApiResourcesDir, archiveName)
  return { extractedRscriptPath, archiveName, archivePath, runtimeDir, extractionRoot, legacyRuntimeDir }
}

function getBundledUnixRuntimeRelocationMarker(runtimeDir: string): string {
  return path.join(runtimeDir, '.metis-conda-unpacked')
}

function getFileSizeIfPresent(filePath: string): number | null {
  try {
    return fs.statSync(filePath).size
  } catch {
    return null
  }
}

function getBundledPortableRuntimeStatus() {
  const { extractedRscriptPath, archiveName, archivePath, runtimeDir, extractionRoot, legacyRuntimeDir } = getBundledPortableRuntimePaths()
  const relocationMarkerPath = process.platform === 'win32'
    ? null
    : getBundledUnixRuntimeRelocationMarker(runtimeDir)
  const condaUnpackPath = process.platform === 'win32'
    ? null
    : path.join(runtimeDir, 'bin', 'conda-unpack')

  return {
    platform: process.platform,
    runtimeArch: getBundledRuntimeArch(),
    appEdition: getConfiguredAppEdition(),
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    archiveName,
    archivePath,
    archiveExists: fs.existsSync(archivePath),
    archiveSize: getFileSizeIfPresent(archivePath),
    extractionRoot,
    runtimeDir,
    runtimeDirExists: fs.existsSync(runtimeDir),
    legacyRuntimeDir,
    legacyRuntimeDirExists: legacyRuntimeDir ? fs.existsSync(legacyRuntimeDir) : null,
    extractedRscriptPath,
    extractedRscriptExists: fs.existsSync(extractedRscriptPath),
    relocationMarkerPath,
    relocationMarkerExists: relocationMarkerPath ? fs.existsSync(relocationMarkerPath) : null,
    condaUnpackPath,
    condaUnpackExists: condaUnpackPath ? fs.existsSync(condaUnpackPath) : null,
  }
}

function isBundledPortableRuntimeReady(): boolean {
  const { extractedRscriptPath, archivePath, runtimeDir } = getBundledPortableRuntimePaths()
  if (fs.existsSync(extractedRscriptPath)) {
    const relocationComplete = process.platform === 'win32' || fs.existsSync(getBundledUnixRuntimeRelocationMarker(runtimeDir))
    if (!relocationComplete) return false
    return probeRscriptExecutable(extractedRscriptPath, getBundledRscriptEnv(extractedRscriptPath) ?? undefined).ok
  }
  if (fs.existsSync(archivePath)) return false
  return isLiteBuild()
}

function verifyBundledPortableRuntimeCanStart(extractedRscriptPath: string): void {
  const probe = probeRscriptExecutable(extractedRscriptPath, getBundledRscriptEnv(extractedRscriptPath) ?? undefined)
  if (probe.ok) return

  const detail = [
    probe.error,
    probe.stderr?.trim(),
    probe.stdout?.trim(),
  ].filter(Boolean).join(' | ')

  throw new Error(`Bundled R runtime could not start from ${extractedRscriptPath}. ${detail || 'No Rscript output was produced.'}`)
}

function getConfiguredAppEdition(): 'Bundle' | 'Lite' {
  try {
    return __METIS_APP_EDITION__ === 'Lite' ? 'Lite' : 'Bundle'
  } catch {
    return 'Bundle'
  }
}

/** Returns true when this app was built as Lite. Dev keeps archive-based detection for local workflows. */
function isLiteBuild(): boolean {
  const { archivePath } = getBundledPortableRuntimePaths()
  if (isDev) return !fs.existsSync(archivePath)
  return getConfiguredAppEdition() === 'Lite'
}

function getDataPath(): string {
  // 1. Check ephemeral config (installer flow / dev preview)
  const cfg = readInstallConfig()
  if (cfg?.workspaceDataPath) return path.resolve(cfg.workspaceDataPath)
  if (cfg?.rootPath) return path.join(cfg.rootPath, 'metis')

  // 2. Check Windows Registry (Actual NSIS installation)
  const regPath = getRegistryWorkspacePath()
  if (regPath) return regPath

  // 3. Migrate legacy downloads folders if present
  const legacyDirs = [
    path.join(app.getPath('downloads'), ['Wy', 'tham'].join('')),
    path.join(app.getPath('downloads'), ['PLS', 'Logic'].join('')),
  ]
  const newDir = path.join(app.getPath('downloads'), 'metis')
  for (const legacyDir of legacyDirs) {
    if (!fs.existsSync(newDir) && fs.existsSync(legacyDir)) {
      try { fs.renameSync(legacyDir, newDir) } catch {}
    }
  }

  // 4. Absolute default
  return path.join(app.getPath('downloads'), 'metis')
}

function getExportPath(): string {
  const cfg = readInstallConfig()
  if (cfg?.exportPath) return path.resolve(cfg.exportPath)
  return path.join(getDataPath(), 'exports')
}

function formatDisplayName(rawUsername: string): string {
  const trimmed = String(rawUsername ?? '').replace(/^.*[\\/]/, '').replace(/@.*$/, '').trim()
  if (!trimmed) return ''

  const tokens = trimmed
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())

  return tokens.join(' ')
}

function detectDelimiter(firstLine: string): string {
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestCount = 0

  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length - 1
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }

  return best
}

function parseDelimitedText(text: string, delimiter: string): {
  headers: string[]
  allRows: string[][]
  totalRows: number
  missing: number
} {
  const lines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0)

  function splitLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuote = false

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      if (char === '"') {
        if (inQuote && line[index + 1] === '"') {
          current += '"'
          index += 1
        } else {
          inQuote = !inQuote
        }
      } else if (char === delimiter && !inQuote) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    result.push(current.trim())
    return result
  }

  const headers = lines.length > 0 ? splitLine(lines[0]) : []
  const allRows = lines.slice(1).map(splitLine)
  let missing = 0

  allRows.forEach((row) => row.forEach((cell) => {
    if (missingValueTokens.has(String(cell ?? '').trim().toLowerCase())) {
      missing += 1
    }
  }))

  return {
    headers,
    allRows,
    totalRows: allRows.length,
    missing,
  }
}

function inferVariableTypes(headers: string[], allRows: string[][]): Record<string, 'MET' | 'CAT'> {
  return Object.fromEntries(
    headers.map((header, columnIndex) => {
      const rawValues = allRows.map((row) => String(row[columnIndex] ?? ''))
      const presentValues = rawValues.filter((value) => !missingValueTokens.has(value.trim().toLowerCase()))
      const parsedNumbers = presentValues
        .map((value) => Number.parseFloat(value.replace(/,/g, '.')))
        .filter((value) => !Number.isNaN(value))

      const numericRatio = presentValues.length === 0 ? 0 : parsedNumbers.length / presentValues.length
      return [header, numericRatio >= 0.8 ? 'MET' : 'CAT']
    }),
  )
}

function normalizeSecurityPath(targetPath: string): string {
  const resolved = path.resolve(String(targetPath ?? '').trim())
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function rememberApprovedPath(store: Set<string>, targetPath: string): void {
  const raw = String(targetPath ?? '').trim()
  if (!raw) return
  store.add(normalizeSecurityPath(raw))
}

function hasApprovedPath(store: Set<string>, targetPath: string): boolean {
  const raw = String(targetPath ?? '').trim()
  if (!raw) return false
  return store.has(normalizeSecurityPath(raw))
}

function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
  const target = normalizeSecurityPath(targetPath)
  const root = normalizeSecurityPath(rootPath)
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`
  return target === root || target.startsWith(prefix)
}

function hasAllowedExtension(targetPath: string, allowedExtensions: Set<string>): boolean {
  return allowedExtensions.has(path.extname(targetPath).toLowerCase())
}

function isWorkspacePathAllowed(targetPath: string): boolean {
  return (
    isWorkspaceTargetPathAllowed(targetPath) ||
    hasApprovedPath(approvedWorkspacePaths, targetPath)
  )
}

function rememberApprovedWorkspacePath(targetPath: string): void {
  const resolved = path.resolve(String(targetPath ?? '').trim())
  if (!resolved || !isWorkspaceFileLikePath(resolved)) return
  rememberApprovedPath(approvedWorkspacePaths, resolved)
}

function validateWorkspaceFilePath(targetPath: string, allowDirectory = true): string {
  const resolved = path.resolve(String(targetPath ?? '').trim())
  if (!resolved) {
    throw new Error('Workspace path is required.')
  }
  if (!isWorkspaceFileLikePath(resolved)) {
    throw new Error('Workspace path must point to a .metisws workspace file or legacy .ada workspace.')
  }
  if (!isWorkspacePathAllowed(resolved)) {
    throw new Error('Workspace path is not approved for this action.')
  }
  if (fs.existsSync(resolved)) {
    const stat = fs.statSync(resolved)
    if (stat.isDirectory() && !allowDirectory) {
      throw new Error('Workspace save target must be a .metisws file, not a directory.')
    }
  }
  return resolved
}

function validateRscriptSelection(rscriptPath: string | null | undefined): { path: string; probe: RscriptProbeResult } {
  const normalized = normalizeExecutablePath(rscriptPath)
  if (!normalized) {
    throw new Error('No Rscript path was provided.')
  }

  const resolved = path.resolve(normalized)
  if (!isRscriptExecutableName(resolved)) {
    throw new Error('Selected executable must be Rscript.')
  }
  if (!fs.existsSync(resolved)) {
    throw new Error('Selected Rscript executable was not found.')
  }
  if (!fs.statSync(resolved).isFile()) {
    throw new Error('Selected Rscript path is not a file.')
  }

  const probe = probeRscriptExecutable(resolved)
  if (!probe.ok) {
    throw new Error(probe.error || 'Unable to run the selected Rscript executable.')
  }

  return { path: resolved, probe }
}

function getTrustedDatasetRoots(): string[] {
  return Array.from(new Set([
    normalizeSecurityPath(getDataPath()),
    normalizeSecurityPath(getTempDatasetsDir()),
  ]))
}

function getTrustedExportRoots(): string[] {
  return [
    normalizeSecurityPath(getExportPath()),
  ]
}

function buildPlumberHeaders(includeContentType = false): Record<string, string> {
  const headers: Record<string, string> = {
    'X-METIS-TOKEN': plumberAuthToken,
  }

  if (includeContentType) {
    headers['Content-Type'] = 'application/json'
  }

  return headers
}

function buildPlumberEnv(port: number, rscriptPath = ''): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(rscriptPath ? getBundledRscriptEnv(rscriptPath) ?? {} : {}),
    METIS_PLUMBER_PORT: String(port),
    METIS_PLUMBER_HOST: DEFAULT_PLUMBER_HOST,
    METIS_PLUMBER_TOKEN: plumberAuthToken,
    METIS_ALLOWED_DATA_ROOTS: getTrustedDatasetRoots().join(path.delimiter),
  }

  for (const [name, value] of Object.entries(BLAS_THREAD_ENV_DEFAULTS)) {
    if (!env[name]) env[name] = value
  }

  return env
}

function syncProcessSecurityEnv(): void {
  process.env.METIS_PLUMBER_TOKEN = plumberAuthToken
  if (app.isReady()) {
    process.env.METIS_ALLOWED_DATA_ROOTS = getTrustedDatasetRoots().join(path.delimiter)
  }
}

function registerDialogOpenPaths(result: { canceled?: boolean; filePaths?: string[] }): void {
  if (result?.canceled) return
  for (const filePath of result?.filePaths ?? []) {
    if (hasAllowedExtension(filePath, allowedRendererReadExtensions)) {
      rememberApprovedPath(approvedRendererReadPaths, filePath)
    }
    if (isWorkspaceFileLikePath(filePath)) {
      rememberApprovedWorkspacePath(filePath)
    }
  }
}

function registerDialogDirectoryPaths(result: { canceled?: boolean; filePaths?: string[] }): void {
  if (result?.canceled) return
  for (const filePath of result?.filePaths ?? []) {
    rememberApprovedPath(approvedRendererOpenPaths, filePath)
  }
}

function registerDialogSavePath(
  filePath: string | undefined,
  filters?: Array<{ extensions?: string[] }>
): void {
  if (!filePath) return

  rememberApprovedPath(approvedRendererWritePaths, filePath)
  rememberApprovedPath(approvedRendererOpenPaths, filePath)

  if (path.extname(filePath)) return

  for (const filter of filters ?? []) {
    for (const ext of filter.extensions ?? []) {
      const normalizedExt = ext.replace(/^\./, '').trim().toLowerCase()
      if (!normalizedExt || normalizedExt === '*') continue
      const withExt = `${filePath}.${normalizedExt}`
      rememberApprovedPath(approvedRendererWritePaths, withExt)
      rememberApprovedPath(approvedRendererOpenPaths, withExt)
    }
  }
}

function isRendererWritePathAllowed(targetPath: string): boolean {
  return isRendererWriteTargetAllowed(targetPath, {
    approvedWritePaths: approvedRendererWritePaths,
    trustedRoots: getTrustedExportRoots(),
    allowTrustedRoots: true,
  })
}

function isWorkspaceTargetPathAllowed(targetPath: string): boolean {
  return isPathWithinRoot(targetPath, getDataPath())
}

function ensureDataDir() {
  try {
    const dataPath = getDataPath()
    console.log('[main] expected data path:', dataPath)

    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true })
      console.log('[main] Created data directory:', dataPath)
    } else {
      console.log('[main] Using existing data directory:', dataPath)
    }
    return dataPath
  } catch (err: any) {
    console.error('[main] ensureDataDir error:', err.message)
    return path.join(app.getAppPath(), 'data') // fallback
  }
}

function getStartupRoute(): string | null {
  const rawRoute = process.env.METIS_START_ROUTE?.trim()
  if (rawRoute) {
    const normalizedRoute = rawRoute.replace(/^#?\/?/, '')
    return normalizedRoute.length > 0 ? normalizedRoute : null
  }

  if (isSetupNeeded()) {
    return isLiteBuild() ? 'setup-wizard' : 'installer-preview'
  }

  return null
}

function isSetupNeeded(): boolean {
  if (process.env.METIS_START_ROUTE?.includes('installer-preview')) return true
  if (process.env.METIS_START_ROUTE?.includes('setup-wizard')) return true

  // In dev mode, skip the installer flow — dev machines won't have install state
  if (process.env.VITE_DEV_SERVER_URL) return false

  const cfg = readInstallConfig()
  const regPath = getRegistryWorkspacePath()
  const hasWorkspaceRoot = !!cfg?.rootPath || !!cfg?.workspaceDataPath || !!regPath

  if (!hasWorkspaceRoot) return true

  // Lite build: needs R detection wizard to have run once
  if (isLiteBuild()) return !cfg?.liteSetupComplete

  // Bundle build: R-Portable must be extracted
  return !isBundledPortableRuntimeReady()
}

function createWindow() {
  const preloadPath = resolvePreloadPath()
  const startupRoute = getStartupRoute()
  const isSetup = !isSetupNeeded()
  const installerPreviewWidth = 400
  const installerPreviewHeight = 500

  const win = new BrowserWindow({
    width:    isSetup ? 1400 : installerPreviewWidth,
    height:   isSetup ? 900  : installerPreviewHeight,
    minWidth: isSetup ? 1024 : installerPreviewWidth,
    minHeight:isSetup ? 700  : installerPreviewHeight,
    maxWidth: isSetup ? undefined : installerPreviewWidth,
    maxHeight:isSetup ? undefined : installerPreviewHeight,
    backgroundColor: readStoredThemePreference() === 'light' ? '#F4F6F8' : '#181818',
    titleBarStyle: isSetup ? 'hidden' : 'hidden',
    // macOS keeps the native traffic lights with titleBarStyle: hidden; other
    // platforms stay frameless for the renderer window controls.
    frame: process.platform === 'darwin' && isSetup,
    transparent: false,
    roundedCorners: true,
    resizable: isSetup,
    maximizable: isSetup,
    minimizable: isSetup,
    fullscreenable: isSetup,
    titleBarOverlay: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
    },
    autoHideMenuBar: true,
    show: false,
  })

  hardenWindow(win)

  enforceNavigationPolicy(win)

  if (isSetup) {
    mainWindow = win
    lastNormalMainWindowBounds = win.getBounds()
  } else {
    installerWindow = win
  }

  win.webContents.on('did-finish-load', () => {
    if (isSetup) {
      scheduleSplashFallback()
      sendMainWindowState(win)
    } else {
      win.show()
    }
  })

  if (isSetup) {
    const syncWindowState = () => {
      rememberNormalMainWindowBounds(win)
      sendMainWindowState(win)
    }

    win.on('maximize', syncWindowState)
    win.on('unmaximize', syncWindowState)
    win.on('enter-full-screen', syncWindowState)
    win.on('leave-full-screen', syncWindowState)
    win.on('restore', syncWindowState)
    win.on('resize', syncWindowState)
    win.on('move', syncWindowState)
  }

  win.webContents.on('did-fail-load', () => {
    revealMainWindow()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    const targetUrl = startupRoute
      ? `${process.env.VITE_DEV_SERVER_URL}#/${startupRoute}`
      : process.env.VITE_DEV_SERVER_URL
    win.loadURL(targetUrl)
  } else {
    const indexHtmlPath = getRendererIndexPath()
    const loadOptions = startupRoute ? { hash: `/${startupRoute}` } : undefined
    console.log('[main] Loading packaged renderer:', {
      appPath: app.getAppPath(),
      distDir: process.env.DIST,
      distExists: fs.existsSync(process.env.DIST!),
      indexHtmlPath,
      indexHtmlExists: fs.existsSync(indexHtmlPath),
      startupRoute: startupRoute || '/',
      loadOptions,
    })
    win.loadFile(indexHtmlPath, loadOptions)
  }

  win.on('closed', () => {
    if (isSetup) {
      clearSplashFallbackTimer()
      mainWindow = null
    } else {
      installerWindow = null
    }
  })
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 263,
    height: 99,
    minWidth: 263,
    minHeight: 99,
    maxWidth: 263,
    maxHeight: 99,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    roundedCorners: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      sandbox: true,
      devTools: false,
    },
  })

  // 🚨 Add this here too!
  enforceNavigationPolicy(splashWindow)

  splashWindow.setMenuBarVisibility(false)
  splashWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(buildSplashHtml())}`)

  const onSplashReady = () => {
    showSplashWindow()
  }

  splashWindow.once('ready-to-show', onSplashReady)
  splashWindow.webContents.once('did-finish-load', onSplashReady)
  splashWindow.webContents.once('dom-ready', onSplashReady)

  splashWindow.on('closed', () => {
    splashWindow = null
    splashShownAt = 0
    splashCloseRequested = false
    clearSplashCloseTimer()
  })
}

function launchWindows() {
  const setupNeeded = isSetupNeeded()
  if (setupNeeded) {
    createWindow()
  } else {
    if (!splashWindow) {
      createSplashWindow()
    }
    if (!mainWindow) {
      createWindow()
    }
  }
}

app.whenReady().then(() => {
  cleanLegacyTempDatasetDirectories()
  const preloadPath = resolvePreloadPath()
  console.log('[main] Preload path:', preloadPath)
  console.log('[main] Preload exists:', fs.existsSync(preloadPath))
  syncProcessSecurityEnv()
  installApplicationMenu()

  // Windows: check if launched by double-clicking a workspace file
  const argvWorkspaceFile = process.argv.slice(1).find(
    arg => typeof arg === 'string' && hasWorkspaceFileExtension(arg) && fs.existsSync(arg)
  )
  if (argvWorkspaceFile) {
    rememberApprovedWorkspacePath(argvWorkspaceFile)
    pendingOpenFilePath = argvWorkspaceFile
    console.log('[main] workspace file passed via argv:', argvWorkspaceFile)
  }

  // Restore saved Rscript path for lite builds so plumber finds it immediately
  const startupCfg = readInstallConfig()
  if (startupCfg?.rscriptPath && !process.env.METIS_RSCRIPT_PATH) {
    try {
      const validated = validateRscriptSelection(startupCfg.rscriptPath)
      process.env.METIS_RSCRIPT_PATH = validated.path
      console.log('[main] Restored METIS_RSCRIPT_PATH from config:', validated.path)
    } catch (err: any) {
      console.warn('[main] Ignoring invalid saved Rscript path:', err?.message || err)
    }
  }

  if (!isSetupNeeded()) {
    ensureDataDir()
  } else {
    console.log('[main] Setup not completed yet; skipping data directory creation')
  }
  launchWindows()

  // Lazy-start Plumber 10s after WorkspaceHome is first shown (not during installer)
  const onWorkspaceHomeShown = () => {
    setTimeout(() => {
      console.log('[plumber] Lazy-start triggered (10s after WorkspaceHome)')
      ensurePlumberReady().catch((err: any) => {
        console.warn('[plumber] Lazy startup failed:', err?.message || err)
      })
    }, 10000)
    mainWindow?.webContents.off('did-finish-load', onWorkspaceHomeShown)
  }
  
  if (mainWindow && !isSetupNeeded()) {
    mainWindow.webContents.on('did-finish-load', onWorkspaceHomeShown)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) launchWindows()
})

let pendingQuitDuringCalcConfirm = false
let allowQuitAfterCalcConfirm = false

function cleanupBeforeQuit() {
  clearSplashFallbackTimer()
  stopPlumberServer()
}

app.on('before-quit', (event) => {
  if (allowQuitAfterCalcConfirm) {
    cleanupBeforeQuit()
    return
  }

  const win = mainWindow ?? BrowserWindow.getAllWindows()[0]
  if (!win || win.isDestroyed()) {
    cleanupBeforeQuit()
    return
  }

  event.preventDefault()
  if (pendingQuitDuringCalcConfirm) return
  pendingQuitDuringCalcConfirm = true

  win.webContents.executeJavaScript('window.__metisIsCalculating === true')
    .then((isBusy: boolean) => {
      if (isBusy) {
        win.webContents.send('confirm-quit-during-calc')
        return
      }
      allowQuitAfterCalcConfirm = true
      cleanupBeforeQuit()
      app.quit()
    })
    .catch(() => {
      allowQuitAfterCalcConfirm = true
      cleanupBeforeQuit()
      app.quit()
    })
})

app.on('will-quit', () => {
  stopPlumberServer()
  try {
    const sessionDir = getTempDatasetsDir()
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true })
    }
  } catch (err: any) {
    console.error('[main] Failed to purge temp dataset directory on quit:', err.message)
  }
})

ipcMain.handle('quit-confirmed', () => {
  pendingQuitDuringCalcConfirm = false
  allowQuitAfterCalcConfirm = true
  cleanupBeforeQuit()
  app.quit()
  return { success: true }
})

ipcMain.handle('quit-cancelled', () => {
  pendingQuitDuringCalcConfirm = false
  return { success: true }
})

process.on('exit', () => {
  stopPlumberServer()
})

process.on('uncaughtException', (err) => {
  const reportPath = writeCrashReport('main-uncaught-exception', {
    message: err?.message,
    stack: err?.stack,
  })
  notifyCrashReport('main-uncaught-exception', 'The app encountered an unexpected error and may close.', reportPath)
})

process.on('unhandledRejection', (reason: any) => {
  const reportPath = writeCrashReport('main-unhandled-rejection', {
    reason: typeof reason === 'string' ? reason : reason?.message ?? String(reason),
    stack: reason?.stack,
  })
  notifyCrashReport('main-unhandled-rejection', 'The app encountered an internal error.', reportPath)
})

app.on('render-process-gone', (_event, _webContents, details) => {
  const reportPath = writeCrashReport('render-process-gone', details)
  notifyCrashReport('render-process-gone', 'The user interface process crashed.', reportPath)
})

ipcMain.handle('app:reportRendererError', async (_event, payload: any) => {
  const reportPath = writeCrashReport('renderer-error', payload)
  return { success: true, reportPath }
})

ipcMain.on('app:renderer-ready', () => {
  revealMainWindow()
  // If the app was opened by double-clicking a workspace file, notify the renderer
  if (pendingOpenFilePath && mainWindow && !mainWindow.isDestroyed()) {
    const filePath = pendingOpenFilePath
    pendingOpenFilePath = null
    // Small delay so the renderer finishes mounting before receiving the event
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('workspace:openedViaFile', filePath)
      }
    }, 500)
  }
})

ipcMain.on('install:launch', () => {
  if (installerWindow) {
    installerWindow.close()
    installerWindow = null
  }
  launchWindows()
})

ipcMain.on('install:close', () => {
  if (installerWindow) {
    installerWindow.close()
    installerWindow = null
  }
  if (!mainWindow) app.quit()
})

// ─── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (getMainWindowState(mainWindow).isMaximized) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else if (lastNormalMainWindowBounds) {
      mainWindow.setBounds(lastNormalMainWindowBounds, true)
    }
    sendMainWindowState(mainWindow)
    return
  }

  rememberNormalMainWindowBounds(mainWindow)
  mainWindow.maximize()
  sendMainWindowState(mainWindow)
})
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => getMainWindowState().isMaximized)
ipcMain.on('native-menu:view-state', (_, state: Partial<NativeMenuViewState>) => {
  nativeMenuViewState = {
    showVars: typeof state?.showVars === 'boolean' ? state.showVars : nativeMenuViewState.showVars,
    showProps: typeof state?.showProps === 'boolean' ? state.showProps : nativeMenuViewState.showProps,
    showZoomControl: typeof state?.showZoomControl === 'boolean' ? state.showZoomControl : nativeMenuViewState.showZoomControl,
  }
  installApplicationMenu()
})

// ─── File / Directory dialogs ─────────────────────────────────────────────────
ipcMain.handle('dialog:openDirectory', async (_, options) => {
  if (!mainWindow) return
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: getDataPath(),
    ...options,
    properties: ['openDirectory'],
  })
  registerDialogDirectoryPaths(result)
  return result
})

ipcMain.handle('dialog:openFile', async (_, options) => {
  const win = installerWindow ?? mainWindow
  if (!win) return { canceled: true, filePaths: [] }
  const result = await dialog.showOpenDialog(win, {
    defaultPath: getDataPath(),
    ...options,
  })
  registerDialogOpenPaths(result)
  return result
})

ipcMain.handle('dialog:showSaveDialog', async (_, options) => {
  if (!mainWindow) return
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: getExportPath(),
    ...options,
  })
  registerDialogSavePath(result?.filePath, Array.isArray(options?.filters) ? options.filters : undefined)
  return result
})

// ─── File reading (for dataset import) ───────────────────────────────────────
ipcMain.handle('file:read', async (_, filePath: string) => {
  try {
    const resolvedPath = path.resolve(filePath)
    const isApprovedRead = hasApprovedPath(approvedRendererReadPaths, resolvedPath)
    const isTrustedDatasetRead = getTrustedDatasetRoots().some((root) => isPathWithinRoot(resolvedPath, root))
    if (!isApprovedRead && !isTrustedDatasetRead) {
      throw new Error('Renderer file read blocked: path was not selected through an approved import dialog.')
    }
    if (!hasAllowedExtension(resolvedPath, allowedRendererReadExtensions)) {
      throw new Error('Renderer file read blocked: unsupported file type.')
    }

    const buffer = fs.readFileSync(resolvedPath)
    return {
      success: true,
      data: buffer.toString('base64'),
      size: buffer.length,
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('file:write', async (_, { filePath, data, encoding }: { filePath: string, data: string, encoding?: BufferEncoding }) => {
  try {
    const fullPath = path.resolve(filePath)
    if (!isRendererWritePathAllowed(fullPath)) {
      throw new Error('Renderer file write blocked: target path is outside approved export/workspace locations.')
    }
    if (!hasAllowedExtension(fullPath, allowedRendererWriteExtensions)) {
      throw new Error('Renderer file write blocked: unsupported file type.')
    }

    const folderPath = path.dirname(fullPath)
    
    console.log(`[IPC:file:write] Writing to: ${fullPath}`)
    
    if (!fs.existsSync(folderPath)) {
      console.log(`[IPC:file:write] Creating parent folder: ${folderPath}`)
      fs.mkdirSync(folderPath, { recursive: true })
    }

    const buffer = encoding === 'base64' ? Buffer.from(data, 'base64') : data
    fs.writeFileSync(fullPath, buffer)
    rememberApprovedPath(approvedRendererOpenPaths, fullPath)
    return { success: true }
  } catch (err: any) {
    console.error(`[IPC:file:write] Failure: ${err.message}`)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('file:copy', async (_, { src, dest }: { src: string, dest: string }) => {
  try {
    const srcPath = path.resolve(src)
    const destPath = path.resolve(dest)
    const destDir = path.dirname(destPath)
    
    console.log(`[IPC:file:copy] Copying from ${srcPath} to ${destPath}`)
    
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }
    
    fs.copyFileSync(srcPath, destPath)
    return { success: true, path: destPath }
  } catch (err: any) {
    console.error(`[IPC:file:copy] Failure: ${err.message}`)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('app:dataPath', async () => {
  try {
    const dataPath = getDataPath()
    ensureDataDir()
    return { success: true, dataPath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('app:getStoragePaths', async () => {
  try {
    const workspacePath = getDataPath()
    const exportPath = getExportPath()
    return { success: true, dataPath: workspacePath, workspacePath, exportPath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('app:setStoragePaths', async (_, data: { workspacePath?: string; exportPath?: string }) => {
  try {
    const workspacePath = path.resolve(String(data?.workspacePath ?? '').trim())
    const exportPath = path.resolve(String(data?.exportPath ?? '').trim())
    if (!String(data?.workspacePath ?? '').trim()) throw new Error('Workspace folder is required.')
    if (!String(data?.exportPath ?? '').trim()) throw new Error('Export folder is required.')
    const currentWorkspacePath = getDataPath()
    const currentExportPath = getExportPath()
    if (normalizeSecurityPath(workspacePath) !== normalizeSecurityPath(currentWorkspacePath) && !hasApprovedPath(approvedRendererOpenPaths, workspacePath)) {
      throw new Error('Workspace folder must be selected through the folder picker.')
    }
    if (normalizeSecurityPath(exportPath) !== normalizeSecurityPath(currentExportPath) && !hasApprovedPath(approvedRendererOpenPaths, exportPath)) {
      throw new Error('Export folder must be selected through the folder picker.')
    }
    fs.mkdirSync(workspacePath, { recursive: true })
    fs.mkdirSync(exportPath, { recursive: true })
    updateInstallConfig({ workspaceDataPath: workspacePath, exportPath })
    return { success: true, dataPath: workspacePath, workspacePath, exportPath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('app:setThemePreference', async (_event, theme: 'dark' | 'light') => {
  const success = writeStoredThemePreference(theme)
  return { success, theme: success ? normalizeThemePreference(theme) : readStoredThemePreference() }
})

ipcMain.handle('app:welcomeContext', async () => {
  try {
    return {
      success: true,
      displayName: formatDisplayName(os.userInfo().username || process.env.USERNAME || ''),
      dataPath: getDataPath(),
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// ─── Workspace persistence (.metisws single-file format) ─────────────────────
//
// Each new workspace is stored as a single `Name.metisws` JSON file in the metis
// data directory. The file embeds the dataset as base64 so the workspace is
// fully self-contained — double-clicking opens metis via the OS file
// association registered in the installer.
//
// Backward compatibility: old `.ada` file/folder workspaces are still read.
// ─────────────────────────────────────────────────────────────────────────────

interface WorkspaceManifest {
  id: string
  name: string
  color: string
  expanded: boolean
  defaultDatasetId?: string
  datasetTempPath?: string
  children: any[]
}

interface AdaFileV2 extends WorkspaceManifest {
  _metis: true
  _version: '2.0'
  datasetEmbedded?: string       // base64-encoded dataset file
  datasetOriginalName?: string   // original filename (for extension detection)
}

interface EmbeddedDatasetV3 {
  datasetId: string
  base64Data: string
  originalName: string
  internalName: string
}

interface AdaFileV3 extends WorkspaceManifest {
  _metis: true
  _version: '3.0'
  embeddedDatasets?: EmbeddedDatasetV3[]
  datasetEmbedded?: string
  datasetOriginalName?: string
}

type AdaWorkspaceFile = AdaFileV2 | AdaFileV3

/** Sanitises a name to a safe filename base (no extension). */
function sanitizeFileName(name: string): string {
  return name
    .replace(/\.metisws$/i, '')
    .replace(/\.ada$/i, '')
    .replace(/[^\w\s\-]/g, '_')
    .trim() || 'workspace'
}

/** Returns the absolute path of the .metisws file for a workspace name. */
function getWorkspaceFilePath(name: string): string {
  return path.join(getDataPath(), `${sanitizeFileName(name)}${WORKSPACE_FILE_EXTENSION}`)
}

/** Returns the temp directory used for extracted datasets. */
function getTempDatasetsDir(): string {
  return path.join(app.getPath('userData'), 'temp-datasets', sessionTempDirName)
}

function cleanLegacyTempDatasetDirectories(): void {
  try {
    const baseTempDir = path.join(app.getPath('userData'), 'temp-datasets')
    if (fs.existsSync(baseTempDir)) {
      const entries = fs.readdirSync(baseTempDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('session-') && entry.name !== sessionTempDirName) {
          try {
            fs.rmSync(path.join(baseTempDir, entry.name), { recursive: true, force: true })
          } catch (err: any) {
            console.warn('[main] Failed to clean legacy temp directory entry:', entry.name, err.message)
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[main] Failed to clean legacy temp directories:', err.message)
  }
}
/**
 * Writes the embedded base64 dataset to a temp file and returns its path.
 * The temp file is re-created on every app startup so it stays current.
 */
function extractEmbeddedDataset(wsId: string, datasetId: string, base64Data: string, originalName = 'dataset.csv'): string {
  const dir = getTempDatasetsDir()
  fs.mkdirSync(dir, { recursive: true })
  const safeOriginalName = path.basename(originalName)
  const ext = path.extname(safeOriginalName) || '.csv'
  const safeWorkspaceId = sanitizePathComponent(wsId, 'workspace')
  const safeDatasetId = sanitizePathComponent(datasetId, 'dataset')
  const tempPath = path.join(dir, `${safeWorkspaceId}__${safeDatasetId}${ext}`)
  if (!isPathWithinRoot(tempPath, dir)) {
    throw new Error('Security Error: Directory traversal detected in extraction target path.')
  }
  fs.writeFileSync(tempPath, Buffer.from(base64Data, 'base64'))
  return tempPath
}

function getManifestDatasetChildren(manifest: WorkspaceManifest): any[] {
  return Array.isArray(manifest.children)
    ? manifest.children.filter((child: any) => child?.type === 'dataset')
    : []
}

function resolveWorkspaceDefaultDatasetId(manifest: WorkspaceManifest): string | undefined {
  const datasetChildren = getManifestDatasetChildren(manifest)
  const defaultDatasetId = typeof manifest.defaultDatasetId === 'string' ? manifest.defaultDatasetId : ''
  if (defaultDatasetId && datasetChildren.some((child: any) => child?.id === defaultDatasetId)) {
    return defaultDatasetId
  }
  return datasetChildren[0]?.id
}

function normalizeEmbeddedDatasets(data: AdaWorkspaceFile): EmbeddedDatasetV3[] {
  if (Array.isArray((data as AdaFileV3).embeddedDatasets)) {
    return (data as AdaFileV3).embeddedDatasets!
      .filter((entry) => entry?.datasetId && entry?.base64Data)
      .map((entry) => ({
        datasetId: String(entry.datasetId),
        base64Data: String(entry.base64Data),
        originalName: String(entry.originalName || 'dataset.csv'),
        internalName: String(entry.internalName || `${entry.datasetId}${path.extname(entry.originalName || 'dataset.csv') || '.csv'}`),
      }))
  }

  if ((data as AdaFileV2).datasetEmbedded) {
    const datasetId = resolveWorkspaceDefaultDatasetId(data)
      || getManifestDatasetChildren(data)[0]?.id
      || `ds-${data.id}`
    const originalName = (data as AdaFileV2).datasetOriginalName || 'dataset.csv'
    return [{
      datasetId,
      base64Data: (data as AdaFileV2).datasetEmbedded!,
      originalName,
      internalName: `${datasetId}${path.extname(originalName) || '.csv'}`,
    }]
  }

  return []
}

function hydrateWorkspaceManifest(manifest: WorkspaceManifest, datasetTempPaths = new Map<string, string>()): WorkspaceManifest {
  const datasetChildren = getManifestDatasetChildren(manifest)
  const defaultDatasetId = resolveWorkspaceDefaultDatasetId(manifest)
  const datasetIdSet = new Set(datasetChildren.map((child: any) => child.id))
  const nextChildren = (manifest.children || []).map((child: any) => {
    if (child?.type === 'dataset') {
      const datasetTempPath = datasetTempPaths.get(child.id)
      return {
        ...child,
        datasetTempPath: datasetTempPath || child?.datasetTempPath || manifest.datasetTempPath,
      }
    }

    if (child?.type === 'model') {
      const linkedDatasetId = typeof child?.linkedDatasetId === 'string' && datasetIdSet.has(child.linkedDatasetId)
        ? child.linkedDatasetId
        : defaultDatasetId
      return {
        ...child,
        ...(linkedDatasetId ? { linkedDatasetId } : {}),
      }
    }

    return child
  })

  return {
    ...manifest,
    defaultDatasetId,
    children: nextChildren,
  }
}

function resolveLegacyDatasetInternalPath(workspacePath: string, datasetId: string, originalName = 'dataset.csv'): string {
  const dir = path.join(workspacePath, 'datasets')
  const ext = path.extname(originalName) || '.csv'
  const safeDatasetId = sanitizePathComponent(datasetId, 'dataset')
  return path.join(dir, `${safeDatasetId}${ext}`)
}

function writeDatasetBufferIntoWorkspace(
  workspacePath: string,
  datasetId: string,
  fileBuffer: Buffer,
  originalName: string
): {
  success: true
  internalName: string
  path: string
  datasetTempPath?: string
} {
  const stat = fs.statSync(workspacePath)
  const safeDatasetId = ensureSafeDatasetId(datasetId)
  const internalName = `${sanitizePathComponent(safeDatasetId, 'dataset')}${path.extname(originalName) || '.csv'}`

  if (stat.isFile()) {
    const wsData = JSON.parse(fs.readFileSync(workspacePath, 'utf-8')) as AdaWorkspaceFile
    const base64Data = fileBuffer.toString('base64')
    const embeddedDatasets = normalizeEmbeddedDatasets(wsData)
    const updated: AdaFileV3 = {
      ...hydrateWorkspaceManifest(wsData),
      _metis: true,
      _version: '3.0',
      embeddedDatasets: [
        ...embeddedDatasets.filter((entry) => entry.datasetId !== safeDatasetId),
        { datasetId: safeDatasetId, base64Data, originalName, internalName },
      ],
    }
    fs.writeFileSync(workspacePath, JSON.stringify(updated, null, 2), 'utf-8')
    const tempPath = extractEmbeddedDataset(wsData.id, safeDatasetId, base64Data, originalName)
    return { success: true, internalName, path: tempPath, datasetTempPath: tempPath }
  }

  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true })
  }

  const datasetsDir = path.join(workspacePath, 'datasets')
  if (!fs.existsSync(datasetsDir)) {
    fs.mkdirSync(datasetsDir, { recursive: true })
  }
  const internalPath = resolveLegacyDatasetInternalPath(workspacePath, safeDatasetId, originalName)
  fs.writeFileSync(internalPath, fileBuffer)
  return { success: true, internalName: path.basename(internalPath), path: internalPath, datasetTempPath: internalPath }
}

function copyDatasetIntoWorkspace(originalFilePath: string, workspacePath: string, datasetId: string): {
  success: true
  internalName: string
  path: string
  datasetTempPath?: string
} {
  const fileBuffer = fs.readFileSync(originalFilePath)
  const originalName = path.basename(originalFilePath)
  return writeDatasetBufferIntoWorkspace(workspacePath, datasetId, fileBuffer, originalName)
}

function writeAtomicSync(targetPath: string, content: string | Buffer): void {
  const tmpPath = `${targetPath}.tmp`
  fs.writeFileSync(tmpPath, content)
  
  let retries = 3
  const delay = 50
  while (retries > 0) {
    try {
      fs.renameSync(tmpPath, targetPath)
      return
    } catch (err: any) {
      retries--
      if (retries === 0) {
        // Clean up temp file on absolute failure
        try { fs.unlinkSync(tmpPath) } catch {}
        throw err
      }
      // Synchronous sleep/delay for retrying rename
      const start = Date.now()
      while (Date.now() - start < delay) {}
    }
  }
}

/** Parses a workspace file and (if it contains a dataset) extracts to temp. */
function readAdaFile(adaFilePath: string): (WorkspaceManifest & { path: string; _format: 'v2' | 'v3' }) | null {
  try {
    const raw = fs.readFileSync(adaFilePath, 'utf-8')
    const data = JSON.parse(raw) as AdaWorkspaceFile
    const isRecognizedWorkspaceFile = (data as any)?._metis === true || data._version === '2.0' || data._version === '3.0'
    if (!isRecognizedWorkspaceFile) return null
    if (!data.id) return null

    const embeddedDatasets = normalizeEmbeddedDatasets(data)
    const datasetTempPaths = new Map<string, string>()
    for (const dataset of embeddedDatasets) {
      try {
        datasetTempPaths.set(
          dataset.datasetId,
          extractEmbeddedDataset(data.id, dataset.datasetId, dataset.base64Data, dataset.originalName)
        )
      } catch (e: any) {
        console.warn('[main] Failed to extract embedded dataset:', e.message)
      }
    }

    const {
      datasetEmbedded: _legacyDatasetEmbedded,
      datasetOriginalName: _legacyDatasetOriginalName,
      embeddedDatasets: _embeddedDatasets,
      ...rest
    } = data as any

    const hydrated = hydrateWorkspaceManifest(rest, datasetTempPaths)
    return {
      ...hydrated,
      path: adaFilePath,
      _format: data._version === '3.0' ? 'v3' : 'v2',
    }
  } catch {
    return null
  }
}

/** Reads an old-format workspace FOLDER (v1 backward compat). */
function readLegacyWorkspaceFolder(folderPath: string): (WorkspaceManifest & { path: string; _format: 'v1' }) | null {
  try {
    const manifestPath = path.join(folderPath, 'workspace.json')
    if (!fs.existsSync(manifestPath)) return null
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as WorkspaceManifest
    if (!manifest.id) return null
    const datasetTempPaths = new Map<string, string>()
    const datasetChildren = getManifestDatasetChildren(manifest)
    datasetChildren.forEach((child: any, index: number) => {
      const ext = path.extname(child?.filePath || child?.originalFileName || 'dataset.csv') || '.csv'
      const candidates = [
        resolveLegacyDatasetInternalPath(folderPath, child.id, `dataset${ext}`),
        path.join(folderPath, 'dataset.csv'),
      ]
      const candidate = candidates.find((entry) => fs.existsSync(entry))
      if (candidate) {
        datasetTempPaths.set(child.id, candidate)
      } else if (index === 0 && manifest.datasetTempPath) {
        datasetTempPaths.set(child.id, manifest.datasetTempPath)
      }
    })
    return { ...hydrateWorkspaceManifest(manifest, datasetTempPaths), path: folderPath, _format: 'v1' }
  } catch {
    return null
  }
}

/** Open a specific workspace file or legacy folder, even outside the app data directory. */
ipcMain.handle('workspace:openFile', async (_, workspaceFilePath: string) => {
  try {
    const resolvedPath = validateWorkspaceFilePath(workspaceFilePath)
    if (!fs.existsSync(resolvedPath)) throw new Error('Workspace file not found.')

    const stat = fs.statSync(resolvedPath)
    const workspace = stat.isDirectory()
      ? readLegacyWorkspaceFolder(resolvedPath)
      : readAdaFile(resolvedPath)

    if (!workspace) throw new Error('Could not read workspace file.')
    rememberApprovedWorkspacePath(resolvedPath)

    return { success: true, workspace }
  } catch (err: any) {
    console.error('[main] workspace:openFile error:', err.message)
    return { success: false, error: err.message }
  }
})

/** Embed dataset into the workspace file and return the temp path for the R backend. */
ipcMain.handle('file:copyToWorkspace', async (_, data) => {
  try {
    const originalFilePath = String(data?.originalFilePath ?? '').trim()
    const workspacePath = String(data?.workspacePath ?? '').trim()
    const datasetId = ensureSafeDatasetId(data?.datasetId)
    if (!originalFilePath || !workspacePath || !datasetId) {
      throw new Error(`Missing paths! Original: ${originalFilePath}, Workspace: ${workspacePath}, Dataset: ${datasetId}`)
    }
    if (!hasApprovedPath(approvedRendererReadPaths, originalFilePath)) {
      throw new Error('Copy to workspace blocked: source file was not selected through an approved import dialog.')
    }
    if (!hasAllowedExtension(originalFilePath, allowedDatasetReadExtensions)) {
      throw new Error('Copy to workspace blocked: unsupported dataset type.')
    }
    if (!isWorkspacePathAllowed(workspacePath)) {
      throw new Error('Copy to workspace blocked: destination must be an approved metis workspace.')
    }
    if (!fs.existsSync(originalFilePath)) {
      throw new Error(`Source file does not exist: ${originalFilePath}`)
    }
    const result = copyDatasetIntoWorkspace(originalFilePath, workspacePath, datasetId)
    console.log('[main:file:copyToWorkspace] Dataset persisted:', result.path)
    return result
  } catch (err: any) {
    console.error('[main:file:copyToWorkspace] error:', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('dataset:saveToWorkspace', async (_, data: { workspacePath: string; datasetId: string; fileName: string; base64Data: string }) => {
  try {
    const workspacePath = path.resolve(String(data?.workspacePath ?? '').trim())
    const datasetId = ensureSafeDatasetId(data?.datasetId)
    const fileName = String(data?.fileName ?? '').trim() || 'dataset.csv'
    const base64Data = String(data?.base64Data ?? '')
    if (!workspacePath || !datasetId || !base64Data) {
      throw new Error('workspacePath, datasetId, and base64Data are required.')
    }
    if (!isWorkspacePathAllowed(workspacePath)) {
      throw new Error('Dataset save blocked: destination must be an approved metis workspace.')
    }
    const buffer = Buffer.from(base64Data, 'base64')
    return writeDatasetBufferIntoWorkspace(workspacePath, datasetId, buffer, fileName)
  } catch (err: any) {
    console.error('[main:dataset:saveToWorkspace] error:', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('dataset:useSample', async (_, data: { workspacePath: string; datasetId?: string }) => {
  try {
    const workspacePath = path.resolve(String(data?.workspacePath ?? '').trim())
    const datasetId = ensureSafeDatasetId(data?.datasetId || `ds-${Date.now()}`)
    if (!workspacePath || !datasetId) {
      throw new Error('workspacePath and datasetId are required.')
    }
    if (!isWorkspacePathAllowed(workspacePath)) {
      throw new Error('Sample dataset save blocked: destination must be an approved metis workspace.')
    }
    if (!fs.existsSync(workspacePath)) {
      throw new Error('Workspace file not found.')
    }

    const samplePath = resolveSampleDatasetPath()
    const summary = summarizeDatasetFile(samplePath)
    const persisted = writeDatasetBufferIntoWorkspace(
      workspacePath,
      datasetId,
      fs.readFileSync(samplePath),
      path.basename(samplePath),
    )
    const absolutePath = persisted.datasetTempPath || persisted.path

    return {
      success: true,
      datasetId,
      fileName: path.basename(samplePath),
      filePath: persisted.internalName,
      headers: summary.headers,
      allRows: summary.allRows,
      variableTypes: summary.variableTypes,
      totalRows: summary.totalRows,
      missing: summary.missing,
      absolutePath,
      datasetTempPath: absolutePath,
    }
  } catch (err: any) {
    console.error('[main:dataset:useSample] error:', err.message)
    return { success: false, error: err.message }
  }
})

/** Scan metis data directory for workspace files and legacy .ada folders. */
ipcMain.handle('workspace:list', async () => {
  const dataPath = getDataPath()
  try {
    if (isSetupNeeded()) {
      return { success: true, workspaces: [], path: dataPath }
    }
    ensureDataDir()
    if (!fs.existsSync(dataPath)) return { success: true, workspaces: [], path: dataPath }
    const entries = fs.readdirSync(dataPath, { withFileTypes: true })
    const workspaces: any[] = []
    for (const entry of entries) {
      const fullPath = path.join(dataPath, entry.name)
      const isWorkspaceFile = hasWorkspaceFileExtension(entry.name)
      const isLegacyFolder = entry.name.toLowerCase().endsWith(LEGACY_WORKSPACE_FILE_EXTENSION)
      if (entry.isFile() && isWorkspaceFile) {
        const ws = readAdaFile(fullPath)
        if (ws) workspaces.push(ws)
      } else if (entry.isDirectory() && isLegacyFolder) {
        // Legacy v1 folder
        const ws = readLegacyWorkspaceFolder(fullPath)
        if (ws) workspaces.push(ws)
      }
    }
    return { success: true, workspaces, path: dataPath }
  } catch (err: any) {
    return { success: false, error: err.message, workspaces: [] }
  }
})

/** Create a new workspace as a single .metisws file. */
ipcMain.handle('workspace:create', async (_, wsData: WorkspaceManifest) => {
  console.log('[main] workspace:create request', { name: wsData.name, id: wsData.id })
  try {
    ensureDataDir()
    const adaFilePath = getWorkspaceFilePath(wsData.name)
    console.log('[main] Creating workspace at:', adaFilePath)
    const fileData: AdaFileV3 = {
      _metis: true,
      _version: '3.0',
      ...hydrateWorkspaceManifest(wsData),
      embeddedDatasets: [],
    }
    fs.writeFileSync(adaFilePath, JSON.stringify(fileData, null, 2), 'utf-8')
    console.log('[main] Workspace .metisws file created')
    return { success: true, path: adaFilePath }
  } catch (err: any) {
    console.error('[main] workspace:create error:', err.message)
    if (err.code === 'EPERM') return { success: false, error: 'Permission Denied. Please ensure no other app (or OneDrive) is locking this location.' }
    return { success: false, error: err.message }
  }
})

/** Save updated workspace data to its workspace file (preserves embedded datasets). */
ipcMain.handle('workspace:save', async (_, wsData: WorkspaceManifest & { path?: string }) => {
  console.log('[main] workspace:save request', { name: wsData.name, id: wsData.id })
  try {
    // Resolve target path: prefer the explicit path if it exists.
    // Strip asterisks — the UI uses '*' as a dirty-state indicator in display
    // labels only; it must never reach the file system path.
    let adaFilePath = ''
    const explicitPath = typeof (wsData as any).path === 'string'
      ? (wsData as any).path.trim().replace(/\*/g, '')
      : ''
    if (explicitPath) {
      adaFilePath = validateWorkspaceFilePath(explicitPath)
    } else {
      adaFilePath = getWorkspaceFilePath(typeof wsData.name === 'string' ? wsData.name.replace(/\*/g, '') : wsData.name)
    }
    // Guard against legacy v1 directory at the same path (prevents EISDIR)
    if (fs.existsSync(adaFilePath) && !fs.statSync(adaFilePath).isFile()) {
      const parsed = path.parse(adaFilePath)
      adaFilePath = path.join(parsed.dir, `${parsed.name}_v2${WORKSPACE_FILE_EXTENSION}`)
      console.warn('[main] workspace:save — legacy folder conflict, writing to:', adaFilePath)
    }

    let existingEmbeddedDatasets: EmbeddedDatasetV3[] = []
    if (fs.existsSync(adaFilePath) && fs.statSync(adaFilePath).isFile()) {
      try {
        const existing = JSON.parse(fs.readFileSync(adaFilePath, 'utf-8')) as AdaWorkspaceFile
        existingEmbeddedDatasets = normalizeEmbeddedDatasets(existing)
      } catch { /* ignore */ }
    }

    const hydrated = hydrateWorkspaceManifest(wsData)
    const datasetIds = new Set(getManifestDatasetChildren(hydrated).map((child: any) => child.id))
    const { path: _p, datasetTempPath: _dtp, _format: _f, ...cleanData } = hydrated as any
    const fileData: AdaFileV3 = {
      _metis: true,
      _version: '3.0',
      ...cleanData,
      embeddedDatasets: existingEmbeddedDatasets.filter((entry) => datasetIds.has(entry.datasetId)),
    }

    if (!fs.existsSync(path.dirname(adaFilePath))) {
      fs.mkdirSync(path.dirname(adaFilePath), { recursive: true })
    }
    fs.writeFileSync(adaFilePath, JSON.stringify(fileData, null, 2), 'utf-8')
    rememberApprovedWorkspacePath(adaFilePath)
    console.log('[main] Workspace saved to:', adaFilePath)
    return { success: true, path: adaFilePath }
  } catch (err: any) {
    console.error('[main] workspace:save error:', err.message)
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      return { success: false, error: `File Locked: ${err.message}. Please close any other apps using this file.` }
    }
    return { success: false, error: err.message }
  }
})

/** Delete a workspace file (or legacy folder). Also cleans up temp datasets. */
ipcMain.handle('workspace:delete', async (_, wsData: Partial<WorkspaceManifest> & { path?: string }) => {
  const dataPath = path.resolve(getDataPath())
  try {
    ensureDataDir()
    let targetPath = ''
    if (wsData.path && String(wsData.path).trim().length > 0) {
      targetPath = path.resolve(String(wsData.path))
    } else if (wsData.name && String(wsData.name).trim().length > 0) {
      targetPath = path.resolve(getWorkspaceFilePath(String(wsData.name)))
    } else {
      throw new Error('Workspace name or path is required for deletion.')
    }
    const rel = path.relative(dataPath, targetPath)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Refusing to delete path outside metis data directory.')
    }
    if (!fs.existsSync(targetPath)) return { success: true, path: targetPath, deleted: false }
    fs.rmSync(targetPath, { recursive: true, force: true })
    // Clean up extracted temp dataset
    if (wsData.id) {
      try {
        const tempDir = getTempDatasetsDir()
        if (fs.existsSync(tempDir)) {
          for (const entry of fs.readdirSync(tempDir)) {
            if (entry.startsWith(`${wsData.id}__`)) {
              const target = path.join(tempDir, entry)
              if (fs.existsSync(target)) fs.unlinkSync(target)
            }
          }
        }
      } catch { /* best-effort */ }
    }
    return { success: true, path: targetPath, deleted: true }
  } catch (err: any) {
    console.error('[main] workspace:delete error:', err.message)
    return { success: false, error: err.message }
  }
})

/** Delete a child entry from a workspace (works for both v2 file and v1 folder). */
ipcMain.handle('workspace:deleteChild', async (_, payload: { workspaceName?: string; workspacePath?: string; childId?: string }) => {
  const dataPath = path.resolve(getDataPath())
  try {
    ensureDataDir()
    const childId = String(payload?.childId ?? '').trim()
    if (!childId) throw new Error('childId is required.')

    let wsPath = ''
    if (payload?.workspacePath && String(payload.workspacePath).trim().length > 0) {
      wsPath = path.resolve(String(payload.workspacePath))
    } else if (payload?.workspaceName && String(payload.workspaceName).trim().length > 0) {
      wsPath = path.resolve(getWorkspaceFilePath(String(payload.workspaceName)))
    } else {
      throw new Error('workspacePath or workspaceName is required.')
    }

    const rel = path.relative(dataPath, wsPath)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Refusing to modify path outside metis data directory.')
    }
    if (!fs.existsSync(wsPath)) throw new Error('Workspace not found.')

    const stat = fs.statSync(wsPath)

    if (stat.isFile()) {
      const wsData = JSON.parse(fs.readFileSync(wsPath, 'utf-8')) as AdaWorkspaceFile
      const children = Array.isArray(wsData.children) ? wsData.children : []
      const child = children.find((e: any) => e?.id === childId)
      if (!child) return { success: true, deleted: false, reason: 'child_not_found' }
      const nextChildren = children.filter((e: any) => e?.id !== childId)
      const childType = String(child?.type ?? '').toLowerCase()

      const nextEmbeddedDatasets = childType === 'dataset'
        ? normalizeEmbeddedDatasets(wsData).filter((entry) => entry.datasetId !== childId)
        : normalizeEmbeddedDatasets(wsData)

      const nextManifest = hydrateWorkspaceManifest({
        ...wsData,
        children: nextChildren,
      })

      const updated: AdaFileV3 = {
        ...(nextManifest as any),
        _metis: true,
        _version: '3.0',
        embeddedDatasets: nextEmbeddedDatasets,
      }

      fs.writeFileSync(wsPath, JSON.stringify(updated, null, 2), 'utf-8')
      return { success: true, deleted: true, childId, childType, deletedFiles: [] }
    }

    // ── v1 legacy folder format ─────────────────────────────────────────────
    const manifestPath = path.join(wsPath, 'workspace.json')
    if (!fs.existsSync(manifestPath)) throw new Error('workspace.json not found.')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as WorkspaceManifest
    const children = Array.isArray(manifest.children) ? manifest.children : []
    const child = children.find((e: any) => e?.id === childId)
    if (!child) return { success: true, deleted: false, reason: 'child_not_found' }
    manifest.children = children.filter((e: any) => e?.id !== childId)
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
    const deleteCandidates = new Set<string>()
    const childType = String(child?.type ?? '').toLowerCase()
    if (childType === 'dataset') {
      deleteCandidates.add(path.join('datasets', `${childId}.csv`))
      deleteCandidates.add(path.join('datasets', `${childId}.xlsx`))
      deleteCandidates.add(path.join('datasets', `${childId}.xls`))
      deleteCandidates.add('dataset.csv')
    } else {
      deleteCandidates.add(`${childId}.hbe`)
      deleteCandidates.add(`${childId}.json`)
      deleteCandidates.add(`${childId}.result.json`)
    }
    const deletedFiles: string[] = []
    for (const candidate of deleteCandidates) {
      if (!candidate || candidate === 'workspace.json') continue
      const target = path.resolve(path.join(wsPath, candidate))
      if (!target.startsWith(wsPath) || !fs.existsSync(target)) continue
      if (!fs.statSync(target).isFile()) continue
      fs.unlinkSync(target)
      deletedFiles.push(target)
    }
    return { success: true, deleted: true, childId, childType, deletedFiles }
  } catch (err: any) {
    console.error('[main] workspace:deleteChild error:', err.message)
    return { success: false, error: err.message }
  }
})

/**
 * Extract the embedded dataset from a workspace file to a temp location.
 * The R backend calls this (via IPC) to get a real file path it can read.
 */
ipcMain.handle('workspace:extractDataset', async (_, payload: string | { adaFilePath?: string; datasetId?: string }) => {
  try {
    const requestedWorkspacePath = typeof payload === 'string'
      ? payload
      : String(payload?.adaFilePath ?? '')
    const adaFilePath = validateWorkspaceFilePath(requestedWorkspacePath)
    const datasetId = typeof payload === 'string'
      ? ''
      : (payload?.datasetId ? ensureSafeDatasetId(payload.datasetId) : '')
    if (!fs.existsSync(adaFilePath)) throw new Error('Workspace file not found.')
    const stat = fs.statSync(adaFilePath)
    if (stat.isDirectory()) {
      const extCandidates = ['.csv', '.xlsx', '.xls']
      const datasetPaths = datasetId
        ? extCandidates.map((ext) => path.join(adaFilePath, 'datasets', `${datasetId}${ext}`))
        : []
      const fallbackPaths = [...datasetPaths, path.join(adaFilePath, 'dataset.csv')]
      const existingPath = fallbackPaths.find((candidate) => fs.existsSync(candidate))
      if (existingPath) return { success: true, datasetTempPath: existingPath }
      return { success: false, error: 'Dataset file not found in legacy workspace.' }
    }
    const wsData = JSON.parse(fs.readFileSync(adaFilePath, 'utf-8')) as AdaWorkspaceFile
    const embeddedDatasets = normalizeEmbeddedDatasets(wsData)
    const targetDataset = datasetId
      ? embeddedDatasets.find((entry) => entry.datasetId === datasetId)
      : embeddedDatasets[0]
    if (!targetDataset) return { success: false, error: 'No embedded dataset in this workspace.' }
    const tempPath = extractEmbeddedDataset(wsData.id, targetDataset.datasetId, targetDataset.base64Data, targetDataset.originalName)
    return { success: true, datasetTempPath: tempPath }
  } catch (err: any) {
    console.error('[main] workspace:extractDataset error:', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('plumber:health', async () => {
  try {
    const ready = await ensurePlumberReady()
    if (!ready) {
      return {
        success: false,
        status: 0,
        url: plumberBaseUrl,
        rscript: resolvedRscript,
        error: 'PLS backend is not ready.',
        runtimeStatus: getBundledPortableRuntimeStatus(),
        recentPlumberLogs: getRecentPlumberLogs(),
      }
    }

    const response = await fetch(`${plumberBaseUrl}/health`, {
      headers: buildPlumberHeaders(),
    })
    const text = await response.text()
    return {
      success: response.ok,
      status: response.status,
      url: plumberBaseUrl,
      rscript: resolvedRscript,
      body: text,
      runtimeStatus: getBundledPortableRuntimeStatus(),
      recentPlumberLogs: response.ok ? undefined : getRecentPlumberLogs(),
    }
  } catch (err: any) {
    return {
      success: false,
      status: 0,
      url: plumberBaseUrl,
      rscript: resolvedRscript,
      error: err.message,
      runtimeStatus: getBundledPortableRuntimeStatus(),
      recentPlumberLogs: getRecentPlumberLogs(),
    }
  }
})

async function postToPlumber(pathname: string, payload: any) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const requestStarted = Date.now()
    const ready = attempt === 0
      ? await ensurePlumberReady()
      : await restartPlumberServer(`Missing route for ${pathname}; retrying with a fresh Plumber process.`)

    if (!ready) {
      return {
        success: false,
        status: 0,
        url: plumberBaseUrl,
        rscript: resolvedRscript,
        error: `PLS backend is not ready. ${getPlumberNotReadyHint()}`,
        runtimeStatus: getBundledPortableRuntimeStatus(),
        recentPlumberLogs: getRecentPlumberLogs(),
      }
    }

    let response: Response
    const fetchStarted = Date.now()
    try {
      response = await fetch(`${plumberBaseUrl}${pathname}`, {
        method: 'POST',
        headers: buildPlumberHeaders(true),
        body: JSON.stringify(payload ?? {}),
      })
    } catch (err: any) {
      const elapsedSeconds = (Date.now() - requestStarted) / 1000
      return {
        success: false,
        status: 0,
        url: plumberBaseUrl,
        rscript: resolvedRscript,
        error: `The R analysis engine stopped responding before it could return results. This can happen when a long bootstrap or prediction run is too heavy for the machine. Try fewer samples, close other heavy apps, or restart Metis and run again.`,
        backendDetail: err?.message || 'Local R backend request failed.',
        runtimeStatus: getBundledPortableRuntimeStatus(),
        bridgeTimings: {
          route: pathname,
          totalSeconds: Number(elapsedSeconds.toFixed(3)),
          fetchSeconds: Number(((Date.now() - fetchStarted) / 1000).toFixed(3)),
        },
        recentPlumberLogs: getRecentPlumberLogs(),
      }
    }

    const textStarted = Date.now()
    let rawBody = ''
    try {
      rawBody = await response.text()
    } catch (err: any) {
      return {
        success: false,
        status: 0,
        url: plumberBaseUrl,
        rscript: resolvedRscript,
        error: `The R analysis engine started the response but Metis could not finish receiving it. Try fewer samples, close other heavy apps, or restart Metis and run again.`,
        backendDetail: err?.message || 'Could not read the R backend response.',
        runtimeStatus: getBundledPortableRuntimeStatus(),
        bridgeTimings: {
          route: pathname,
          totalSeconds: Number(((Date.now() - requestStarted) / 1000).toFixed(3)),
          fetchSeconds: Number(((textStarted - fetchStarted) / 1000).toFixed(3)),
          responseTextSeconds: Number(((Date.now() - textStarted) / 1000).toFixed(3)),
        },
        recentPlumberLogs: getRecentPlumberLogs(),
      }
    }
    const parseStarted = Date.now()
    let data: any = {}
    if (rawBody.trim().length > 0) {
      try {
        data = JSON.parse(rawBody)
      } catch {
        data = {
          success: false,
          error: rawBody.trim(),
        }
      }
    }
    const finished = Date.now()
    const bridgeTimings = {
      route: pathname,
      totalSeconds: Number(((finished - requestStarted) / 1000).toFixed(3)),
      fetchSeconds: Number(((textStarted - fetchStarted) / 1000).toFixed(3)),
      responseTextSeconds: Number(((parseStarted - textStarted) / 1000).toFixed(3)),
      parseSeconds: Number(((finished - parseStarted) / 1000).toFixed(3)),
    }

    if (response.status === 404 && attempt === 0) {
      console.warn('[plumber] Route returned 404; attempting restart and retry.', {
        pathname,
        url: plumberBaseUrl,
      })
      continue
    }

    return {
      success: response.ok && data?.success !== false,
      status: response.status,
      url: plumberBaseUrl,
      rscript: resolvedRscript,
      bridgeTimings,
      runtimeStatus: response.ok ? undefined : getBundledPortableRuntimeStatus(),
      recentPlumberLogs: response.ok ? undefined : getRecentPlumberLogs(),
      ...data,
    }
  }

  return {
    success: false,
    status: 404,
    url: plumberBaseUrl,
    rscript: resolvedRscript,
    error: `404 - Resource Not Found (${pathname})`,
    runtimeStatus: getBundledPortableRuntimeStatus(),
    recentPlumberLogs: getRecentPlumberLogs(),
  }
}

ipcMain.handle('plumber:runPls', async (_, payload: any) => {
  try {
    return await postToPlumber('/run-pls', payload)
  } catch (err: any) {
    return plumberBridgeExceptionResponse(err, 'PLS-SEM')
  }
})

ipcMain.handle('plumber:runBootstrap', async (_, payload: any) => {
  try {
    return await postToPlumber('/run-bootstrap', payload)
  } catch (err: any) {
    return plumberBridgeExceptionResponse(err, 'bootstrap')
  }
})

ipcMain.handle('plumber:runPlsPredict', async (_, payload: any) => {
  try {
    return await postToPlumber('/run-plspredict', payload)
  } catch (err: any) {
    return plumberBridgeExceptionResponse(err, 'PLSpredict')
  }
})

ipcMain.handle('plumber:runAdvancedAnalysis', async (_, payload: any) => {
  try {
    return await postToPlumber('/run-advanced-analysis', payload)
  } catch (err: any) {
    return plumberBridgeExceptionResponse(err, 'advanced analysis')
  }
})

ipcMain.handle('shell:openExternal', async (_, url: string) => {
  try {
    if (!isAllowedExternalUrl(url)) {
      throw new Error('External link blocked: unsupported URL protocol.')
    }
    await shell.openExternal(url)
    return { success: true }
  }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('shell:openPath', async (_, targetPath: string) => {
  try {
    const resolved = path.resolve(targetPath)
    if (!hasApprovedPath(approvedRendererOpenPaths, resolved)) {
      throw new Error('Renderer open request blocked: target path was not created through an approved export flow.')
    }
    if (!hasAllowedExtension(resolved, allowedRendererOpenExtensions)) {
      throw new Error('Renderer open request blocked: unsupported file type.')
    }
    const err = await shell.openPath(resolved)
    if (err && err.trim().length > 0) {
      return { success: false, error: err }
    }
    return { success: true, path: resolved }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to open path' }
  }
})

// ─── Installer IPC ───────────────────────────────────────────────────────────

/** Return the well-known user folder paths + the currently configured install root */
ipcMain.handle('install:getDefaultPaths', async () => {
  try {
    const desktop   = app.getPath('desktop')
    const downloads = app.getPath('downloads')
    const documents = app.getPath('documents')
    const cfg = readInstallConfig()
    const current = cfg?.rootPath ?? documents
    return { success: true, desktop, downloads, documents, current }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('install:getExistingAppInstall', async () => {
  try {
    return { success: true, ...getExistingWindowsInstallInfo() }
  } catch (err: any) {
    return { success: false, found: false, version: null, installLocation: null, error: err.message }
  }
})

/** Open a native OS folder-picker and return the chosen path (or null if cancelled) */
ipcMain.handle('install:selectDirectory', async () => {
  const win = installerWindow ?? mainWindow
  if (!win) return { success: false, error: 'No window' }
  try {
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose workspace location for metis',
      defaultPath: app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, canceled: true, path: null }
    }
    return { success: true, canceled: false, path: result.filePaths[0] }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

async function extractZipArchive(zipPath: string, destinationDir: string): Promise<void> {
  const zip = await JSZip.loadAsync(await fs.promises.readFile(zipPath))
  const destinationRoot = path.resolve(destinationDir)

  for (const entry of Object.values(zip.files)) {
    const targetPath = path.resolve(destinationRoot, entry.name)
    const rootWithSeparator = destinationRoot.endsWith(path.sep) ? destinationRoot : `${destinationRoot}${path.sep}`
    if (targetPath !== destinationRoot && !targetPath.startsWith(rootWithSeparator)) {
      throw new Error(`Blocked unsafe archive path: ${entry.name}`)
    }

    if (entry.dir) {
      await fs.promises.mkdir(targetPath, { recursive: true })
      continue
    }

    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.promises.writeFile(targetPath, await entry.async('nodebuffer'))
  }
}

async function extractTarGzArchive(archivePath: string, destinationDir: string): Promise<void> {
  await fs.promises.mkdir(destinationDir, { recursive: true })
  await runProcess('tar', ['-xzf', archivePath, '-C', destinationDir])
}

async function runProcess(executablePath: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executablePath, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    let stdout = ''
    child.stdout?.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr?.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', (err) => {
      reject(new Error(`Failed to start ${executablePath}: ${err.message}`))
    })
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        const output = stderr.trim() || stdout.trim() || 'no process output'
        reject(new Error(`${path.basename(executablePath)} ${args.join(' ')} exited with code ${code}: ${output}`))
      }
    })
  })
}

async function prepareBundledUnixRuntime(runtimeDir: string, extractedRscriptPath: string): Promise<void> {
  if (process.platform === 'win32') return

  const condaUnpackPath = path.join(runtimeDir, 'bin', 'conda-unpack')
  const markerPath = getBundledUnixRuntimeRelocationMarker(runtimeDir)

  await fs.promises.chmod(extractedRscriptPath, 0o755).catch(() => {})
  await fs.promises.chmod(condaUnpackPath, 0o755).catch(() => {})

  if (!fs.existsSync(condaUnpackPath)) {
    throw new Error(`Bundled R runtime is missing relocation helper: ${condaUnpackPath}`)
  }
  if (fs.existsSync(markerPath)) return

  sendRuntimeRelocationLog(condaUnpackPath)
  await runProcess(condaUnpackPath, [], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      PATH: [path.join(runtimeDir, 'bin'), process.env.PATH || ''].filter(Boolean).join(path.delimiter),
    },
  })
  await fs.promises.writeFile(markerPath, new Date().toISOString(), 'utf8')
}

function sendRuntimeRelocationLog(condaUnpackPath: string) {
  console.log('[install] Running bundled R relocation helper:', condaUnpackPath)
}

/** Extract the platform-specific bundled R runtime from resources/r-api. */
async function extractRPortable(sendProgress: (step: string, detail: string) => void): Promise<void> {
  const { extractedRscriptPath, archivePath, runtimeDir, extractionRoot } = getBundledPortableRuntimePaths()

  if (!fs.existsSync(archivePath)) {
    if (isLiteBuild()) {
      console.log('[install] Lite build has no bundled R archive — skipping extraction')
      return
    }

    throw new Error(`Bundled R archive was not found at ${archivePath}. Add the platform runtime archive before running the Bundle installer.`)
  }

  if (fs.existsSync(extractedRscriptPath)) {
    console.log('[install] Bundled R runtime already extracted, skipping')
    await prepareBundledUnixRuntime(runtimeDir, extractedRscriptPath)
    verifyBundledPortableRuntimeCanStart(extractedRscriptPath)
    return
  }

  if (fs.existsSync(runtimeDir)) {
    console.log('[install] Partial bundled R runtime detected — cleaning up before re-extracting')
    try { fs.rmSync(runtimeDir, { recursive: true, force: true }) } catch (e) {
      console.warn('[install] Could not remove partial runtime folder:', e)
    }
  }

  console.log('[install] Extracting bundled R runtime to', extractionRoot)
  sendProgress('extracting', 'Extracting R dependencies — this may take a few minutes...')
  if (process.platform === 'win32') {
    await extractZipArchive(archivePath, extractionRoot)
  } else {
    await extractTarGzArchive(archivePath, extractionRoot)
  }

  if (!fs.existsSync(extractedRscriptPath)) {
    throw new Error(`Bundled R archive extracted, but Rscript was not found at ${extractedRscriptPath}`)
  }

  if (process.platform !== 'win32') {
    sendProgress('extracting', 'Relocating bundled R runtime...')
    await prepareBundledUnixRuntime(runtimeDir, extractedRscriptPath)
  }

  sendProgress('extracting', 'Checking bundled R runtime...')
  verifyBundledPortableRuntimeCanStart(extractedRscriptPath)

  console.log('[install] Bundled R runtime extracted successfully')
}

/** Create the metis workspace root at <rootPath>/metis and persist the config */
ipcMain.handle('install:run', async (event, { rootPath, createShortcut }: { rootPath: string; createShortcut?: boolean }) => {
  const sender = event.sender
  const sendProgress = (step: string, detail: string) => {
    if (!sender.isDestroyed()) sender.send('install:progress', { step, detail })
  }

  try {
    if (!rootPath || typeof rootPath !== 'string' || !rootPath.trim()) {
      throw new Error('rootPath is required.')
    }

    const resolvedRoot = path.resolve(rootPath.trim())
    const plsDir = path.join(resolvedRoot, 'metis')

    sendProgress('workspace', 'Writing: workspace/metis/')
    fs.mkdirSync(plsDir, { recursive: true })
    console.log('[install:run] metis folder created at:', plsDir)

    // Extract bundled R-Portable BEFORE writing config.
    // If extraction fails, config is never written so isSetupNeeded() stays true
    // and the installer preview shows again on next launch instead of silently
    // launching with a broken / partially-extracted R backend.
    await extractRPortable(sendProgress)

    sendProgress('finalizing', 'Writing: registry/install-state.json')
    writeInstallConfig(resolvedRoot)
    if (createShortcut) {
      console.log('[install:run] Desktop shortcut requested (handled by NSIS in production builds)')
    }

    return { success: true, resolvedPath: plsDir }
  } catch (err: any) {
    console.error('[install:run] error:', err.message)
    if (err.code === 'EPERM') {
      return { success: false, error: 'Permission denied. Choose a different folder or run as administrator.' }
    }
    return { success: false, error: err.message }
  }
})

// ─── Lite setup wizard IPC ────────────────────────────────────────────────────

/** Find the system-installed Rscript (Lite build only).
 * Each internal execSync call has its own timeout so this never hangs forever. */
ipcMain.handle('r:findRscript', async () => {
  try {
    const result = findInstalledRscript({ deepSearch: true })
    if (result.path) {
      console.log('[main] r:findRscript detected:', result.path)
    } else {
      console.warn('[main] r:findRscript failed:', result.diagnostics.join(' | '))
    }
    return {
      found: !!result.path,
      path: result.path,
      candidates: result.candidates,
      diagnostics: result.diagnostics,
      version: result.probe?.version ?? null,
      home: result.probe?.home ?? null,
      libPaths: result.probe?.libPaths ?? [],
    }
  } catch (err: any) {
    return { found: false, path: null, diagnostics: [err?.message || 'Unknown R detection error'], candidates: [] }
  }
})

/** Verify which required R packages are installed */
ipcMain.handle('r:checkPackages', async (_, rscriptPath: string) => {
  return new Promise<PackageCheckResult>((resolve) => {
    let executablePath = ''
    let probe: RscriptProbeResult | null = null
    try {
      const validated = validateRscriptSelection(rscriptPath)
      executablePath = validated.path
      probe = validated.probe
    } catch (err: any) {
      return resolve({
        success: false,
        error: err?.message || 'Unable to validate the selected Rscript executable.',
        diagnostics: ['Choose a real Rscript executable and try again.'],
      })
    }

    const required = ['seminr', 'seminrExtras', 'plumber', 'semPower', 'readxl', 'jsonlite', 'Matrix']
    const rCode = [
      `pkgs <- c(${required.map((p) => `"${p}"`).join(', ')})`,
      'inst <- rownames(installed.packages())',
      'res <- setNames(vapply(pkgs, function(p) isTRUE((p %in% inst)[1]) || requireNamespace(p, quietly=TRUE), logical(1)), pkgs)',
      'cat("__METIS_BEGIN__\\n")',
      'cat("version=", paste(R.version$major, R.version$minor, sep="."), "\\n", sep="")',
      'cat("home=", normalizePath(R.home(), winslash="/", mustWork=FALSE), "\\n", sep="")',
      'cat("libs=", paste(normalizePath(.libPaths(), winslash="/", mustWork=FALSE), collapse="|"), "\\n", sep="")',
      'for (pkg in pkgs) cat("pkg:", pkg, "=", if (isTRUE(res[[pkg]])) "TRUE" else "FALSE", "\\n", sep="")',
      'cat("__METIS_END__\\n")',
    ].join('\n')

    const ps = spawn(executablePath, ['--vanilla', '--quiet', '-e', rCode], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timeoutId = setTimeout(() => {
      timedOut = true
      ps.kill()
    }, 20000)
    ps.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    ps.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    ps.on('close', (code: number | null) => {
      clearTimeout(timeoutId)
      if (timedOut) {
        return resolve({
          success: false,
          error: 'Timed out while checking R packages.',
          diagnostics: [`Rscript: ${executablePath}`, `stderr: ${stderr.trim() || '(empty)'}`],
        })
      }

      const combined = `${stdout}\n${stderr}`
      const lines = extractMarkedLines(combined)

      if (code !== 0 && !stdout.trim()) {
        return resolve({
          success: false,
          error: stderr.trim() || `Rscript exited with code ${code}`,
          diagnostics: [
            `Rscript: ${executablePath}`,
            ...(stdout.trim() ? [`stdout: ${stdout.trim()}`] : []),
            ...(stderr.trim() ? [`stderr: ${stderr.trim()}`] : []),
          ],
        })
      }
      try {
        const packages: Record<string, boolean> = {}
        let version: string | null = null
        let home: string | null = null
        let libPaths: string[] = []

        if (!lines) {
          return resolve({
            success: false,
            error: 'Could not parse R package check output.',
            diagnostics: [
              `Rscript: ${executablePath}`,
              `R version: ${probe?.version ?? '(unknown)'}`,
              ...(probe?.home ? [`R home: ${probe.home}`] : []),
              ...(probe?.libPaths ?? []).map((libPath, index) => `.libPaths()[${index + 1}]: ${libPath}`),
              `stdout: ${stdout.trim() || '(empty)'}`,
              `stderr: ${stderr.trim() || '(empty)'}`,
            ],
          })
        }

        lines.forEach((line) => {
          if (line.startsWith('version=')) version = line.slice('version='.length).trim() || null
          if (line.startsWith('home=')) home = line.slice('home='.length).trim() || null
          if (line.startsWith('libs=')) {
            libPaths = line
              .slice('libs='.length)
              .split('|')
              .map((entry) => entry.trim())
              .filter(Boolean)
          }
          if (line.startsWith('pkg:')) {
            const body = line.slice('pkg:'.length)
            const eq = body.indexOf('=')
            if (eq < 0) return
            const key = body.slice(0, eq).trim()
            const value = body.slice(eq + 1).trim().toUpperCase()
            if (key) packages[key] = value === 'TRUE'
          }
        })

        const diagnostics = [
          `Rscript: ${executablePath}`,
          ...(version ? [`R version: ${version}`] : []),
          ...(home ? [`R home: ${home}`] : []),
          ...libPaths.map((libPath, index) => `.libPaths()[${index + 1}]: ${libPath}`),
        ]

        resolve({ success: true, packages, diagnostics, version, home, libPaths })
      } catch {
        resolve({
          success: false,
          error: `Could not parse R output.`,
          diagnostics: [
            `Rscript: ${executablePath}`,
            `R version: ${probe?.version ?? '(unknown)'}`,
            ...(probe?.home ? [`R home: ${probe.home}`] : []),
            ...(probe?.libPaths ?? []).map((libPath, index) => `.libPaths()[${index + 1}]: ${libPath}`),
            `stdout: ${stdout.trim() || '(empty)'}`,
            `stderr: ${stderr.trim() || '(empty)'}`,
          ],
        })
      }
    })
    ps.on('error', (err: Error) => {
      clearTimeout(timeoutId)
      resolve({ success: false, error: err.message, diagnostics: [`Rscript: ${executablePath}`] })
    })
  })
})

/** Persist the R path and mark lite setup as complete */
ipcMain.handle('r:saveLiteConfig', async (_, { rootPath, rscriptPath }: { rootPath: string; rscriptPath: string }) => {
  try {
    const resolved = path.resolve(rootPath.trim())
    const validated = validateRscriptSelection(rscriptPath)
    const cfgPath = getInstallConfigPath()
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true })
    fs.writeFileSync(cfgPath, JSON.stringify(
      { rootPath: resolved, liteSetupComplete: true, rscriptPath: validated.path },
      null, 2
    ), 'utf-8')
    ensureDataDir()
    // Make immediately available to this process so plumber picks it up after launch
    process.env.METIS_RSCRIPT_PATH = validated.path
    syncProcessSecurityEnv()
    stopPlumberServer()
    console.log('[main] Lite config saved. rscriptPath:', validated.path)
    return { success: true }
  } catch (err: any) {
    console.error('[main] r:saveLiteConfig error:', err.message)
    return { success: false, error: err.message }
  }
})
