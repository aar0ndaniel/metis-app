import { useState, useEffect, useCallback, useRef } from 'react'
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import TitleBar from './components/TitleBar'
import WorkspaceHome from './pages/WorkspaceHome'
import ModelCanvas from './pages/ModelCanvas'
import ResultsView from './pages/ResultsView'
import DescriptiveStats from './pages/DescriptiveStats'
import RCodeViewer from './pages/RCodeViewer'
import ImportStep1 from './pages/ImportStep1'
import DataView from './pages/DataView'
import InstallerPreview from './pages/InstallerPreview'
import SetupWizard from './pages/SetupWizard'
import TarkPreview from './pages/TarkPreview'
import OnboardingTour from './components/OnboardingTour'
import PreferencesModal from './components/PreferencesModal'
import TarkModal, { type TarkReportRequest } from './components/TarkModal'
import NewWorkspaceDialog from './components/NewWorkspaceDialog'
import NewModelDialog from './components/NewModelDialog'
import { dispatchToast, useToast, ToastContainer } from './components/Toast'
import { addDiagnostic } from './utils/diagnostics'
import { useNavigate } from 'react-router-dom'
import { APP_BRAND_NAME } from './config/appBranding'
import { CalculationProvider } from './state/calculationContext'
import CalculatingModal from './components/CalculatingModal'
import CalculatingChip from './components/CalculatingChip'
import {
  migrateWorkspace,
  upsertDatasetInWorkspace,
} from './utils/datasetWorkspace'
import {
  writeDatasetViewCache,
  type DatasetViewCacheEntry,
} from './utils/datasetViewCache'
import { readWorkspaceClientCache, writeWorkspaceClientCache } from './utils/workspaceClientCache'
import { stripModelDisplayName } from './utils/displayNames'
import {
  DEFAULT_ACCENT_CHOICE,
  LEGACY_PREF_ACCENT_COLOR_KEY,
  METIS_PREF_ACCENT_COLOR_KEY,
  getAccentOption,
  normalizeAccentChoice,
} from './utils/themeAccent'
import type {
  Workspace,
  WorkspaceChild,
  WorkspaceDatasetChild,
} from './types/workspace'

type AppTheme = 'Dark' | 'Light'
type ThemePreference = AppTheme | 'Auto'

interface WelcomeContext {
  displayName: string
  dataPath: string
}

type DatasetImportSource = 'workspace-home' | 'model-canvas'

interface DatasetImportState {
  workspaceName: string
  workspacePath: string
  workspaceId?: string
  returnTo?: string
  datasetId?: string
  source?: DatasetImportSource
  modelId?: string
  saveMode?: 'replace' | 'save-as-new'
}

const METIS_PREF_THEME_KEY = 'metis:prefs:theme'
const LEGACY_PREF_THEME_KEY = 'pls:prefs:theme'
const INSTALLER_PREF_THEME_KEY = 'metis:installer:theme'
const METIS_PREF_FONT_SCALE_KEY = 'metis:prefs:fontScale'
const METIS_PREF_INTERFACE_CONTRAST_KEY = 'metis:prefs:interfaceContrast'
const LEGACY_PREF_INTERFACE_CONTRAST_KEY = 'pls:prefs:interfaceContrast'
const DEFAULT_INTERFACE_CONTRAST = 75
const MIN_READABLE_INTERFACE_CONTRAST = 75
const METIS_TOUR_COMPLETED_KEY = 'metis:tour-completed'
const LEGACY_TOUR_COMPLETED_KEY = 'pls:tour-completed'
const METIS_DOCS_URL = 'https://metis.emend.it.com/docs.html'
const METIS_FEEDBACK_URL = 'https://metis.emend.it.com/submit-feedback.html'
const METIS_BUG_REPORT_URL = 'https://github.com/aar0ndaniel/metis-app/issues/new?labels=bug'
const METIS_CITATION_URL = 'https://metis.emend.it.com/how-to-cite.html'

function normalizeThemePreference(raw: string | null): ThemePreference {
  if (raw === 'Auto' || raw === 'auto') return 'Auto'
  if (raw === 'Light' || raw === 'light') return 'Light'
  return 'Dark'
}

function getSystemTheme(): AppTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'Dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'Light' : 'Dark'
}

function resolveThemePreference(preference: ThemePreference): AppTheme {
  return preference === 'Auto' ? getSystemTheme() : preference
}

function getSavedThemePreference(): ThemePreference {
  const raw = localStorage.getItem(METIS_PREF_THEME_KEY) ?? localStorage.getItem(LEGACY_PREF_THEME_KEY)
  return normalizeThemePreference(raw)
}

function getSavedTheme(): AppTheme {
  return resolveThemePreference(getSavedThemePreference())
}

function getInstallerPreviewTheme(): AppTheme {
  const raw = localStorage.getItem(INSTALLER_PREF_THEME_KEY)
  return raw === 'Dark' ? 'Dark' : 'Light'
}

function readStartupFontScale(): string {
  const raw = localStorage.getItem(METIS_PREF_FONT_SCALE_KEY)
  if (raw === 'Small') return 'small'
  if (raw === 'Large') return 'large'
  if (raw === 'Extra Large') return 'extra-large'
  return 'default'
}

function readSavedAccentColor(): string {
  const raw = localStorage.getItem(METIS_PREF_ACCENT_COLOR_KEY) ?? localStorage.getItem(LEGACY_PREF_ACCENT_COLOR_KEY)
  return normalizeAccentChoice(raw)
}

function readSavedInterfaceContrast(): number {
  const raw = localStorage.getItem(METIS_PREF_INTERFACE_CONTRAST_KEY) ?? localStorage.getItem(LEGACY_PREF_INTERFACE_CONTRAST_KEY)
  const parsed = Number(raw)
  return Number.isFinite(parsed)
    ? Math.max(MIN_READABLE_INTERFACE_CONTRAST, Math.min(100, parsed))
    : DEFAULT_INTERFACE_CONTRAST
}

function applySavedVisualPreferences(options: { skipSavedContrast?: boolean } = {}) {
  const root = document.documentElement
  root.setAttribute('data-font-scale', readStartupFontScale())
  const savedAccentColor = readSavedAccentColor()
  const accentTargets = [
    root,
    document.body,
    ...Array.from(document.querySelectorAll<HTMLElement>('.metis-app-shell')),
  ]

  if (savedAccentColor === DEFAULT_ACCENT_CHOICE) {
    accentTargets.forEach((target) => {
      target.style.removeProperty('--color-accent')
      target.style.removeProperty('--color-accent-rgb')
      target.style.removeProperty('--color-on-accent')
    })
  } else {
    const accent = getAccentOption(savedAccentColor)
    accentTargets.forEach((target) => {
      target.style.setProperty('--color-accent', accent.color)
      target.style.setProperty('--color-accent-rgb', accent.rgb)
      target.style.setProperty('--color-on-accent', accent.onAccent)
    })
  }

  if (options.skipSavedContrast) {
    root.style.setProperty('--app-interface-contrast-filter', 'contrast(100%)')
    return
  }

  const contrast = readSavedInterfaceContrast()
  const contrastPercent = Math.max(100, Math.min(160, 100 + (contrast - DEFAULT_INTERFACE_CONTRAST)))
  root.style.setProperty('--app-interface-contrast-filter', `contrast(${contrastPercent}%)`)
}

function openMetisExternal(url: string) {
  const api = (window as any).electronAPI
  if (api?.openExternal) {
    void api.openExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

// Screens that get the shared TitleBar
const SHELL_ROUTES = ['/', '/canvas', '/results', '/rcode']

function truncateDatasetName(name: string): string {
  return name.length > 20 ? `${name.slice(0, 17)}...` : name
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isSafeEntityId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
}

function normalizeWorkspacePayload(detail: unknown): Workspace[] | null {
  if (!isRecord(detail) || !Array.isArray(detail.workspaces)) return null

  const normalized = detail.workspaces
    .filter(isRecord)
    .map((workspace) => {
      try {
        return migrateWorkspace(workspace as unknown as Workspace)
      } catch {
        return null
      }
    })
    .filter((workspace): workspace is Workspace => workspace !== null)

  if (detail.workspaces.length > 0 && normalized.length === 0) return null
  return normalized
}

function collapseWorkspaceFoldersForStartup(workspaces: Workspace[]): Workspace[] {
  return workspaces.map((workspace) => ({
    ...workspace,
    expanded: false,
  }))
}

type DatasetImportedPayload = {
  datasetId?: string
  fileName: string
  filePath?: string
  workspaceName?: string
  workspaceId?: string
  headers?: string[]
  variableTypes?: Record<string, 'MET' | 'CAT'>
  totalRows?: number
  missing?: number
  datasetTempPath?: string
  source?: DatasetImportSource
  modelId?: string
  saveMode?: 'replace' | 'save-as-new'
  setAsDefault?: boolean
}

function normalizeDatasetImportedPayload(detail: unknown): DatasetImportedPayload | null {
  if (!isRecord(detail) || typeof detail.fileName !== 'string' || detail.fileName.trim().length === 0) return null

  const headers = isStringArray(detail.headers) ? detail.headers : undefined
  const variableTypesValue = detail.variableTypes
  const variableTypes = isRecord(variableTypesValue)
    ? Object.fromEntries(
        Object.entries(variableTypesValue).filter(([, value]) => value === 'MET' || value === 'CAT'),
      ) as Record<string, 'MET' | 'CAT'>
    : undefined

  return {
    datasetId: isSafeEntityId(detail.datasetId) ? detail.datasetId : undefined,
    fileName: detail.fileName.trim(),
    filePath: typeof detail.filePath === 'string' && detail.filePath.trim().length > 0 ? detail.filePath : undefined,
    workspaceName: typeof detail.workspaceName === 'string' && detail.workspaceName.trim().length > 0 ? detail.workspaceName : undefined,
    workspaceId: isSafeEntityId(detail.workspaceId) ? detail.workspaceId : undefined,
    headers,
    variableTypes,
    totalRows: Number.isFinite(Number(detail.totalRows)) ? Number(detail.totalRows) : undefined,
    missing: Number.isFinite(Number(detail.missing)) ? Number(detail.missing) : undefined,
    datasetTempPath: typeof detail.datasetTempPath === 'string' && detail.datasetTempPath.trim().length > 0 ? detail.datasetTempPath : undefined,
    source: detail.source === 'workspace-home' || detail.source === 'model-canvas' ? detail.source : undefined,
    modelId: isSafeEntityId(detail.modelId) ? detail.modelId : undefined,
    saveMode: detail.saveMode === 'replace' || detail.saveMode === 'save-as-new' ? detail.saveMode : undefined,
    setAsDefault: typeof detail.setAsDefault === 'boolean' ? detail.setAsDefault : undefined,
  }
}

function AppShell() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const isInstallerPreview = location.pathname.startsWith('/installer-preview') || location.pathname.startsWith('/setup-wizard')
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => isInstallerPreview ? 'Light' : getSavedThemePreference())
  const [theme, setTheme] = useState<AppTheme>(() => isInstallerPreview ? 'Light' : getSavedTheme())
  const [prefsOpen,      setPrefsOpen]      = useState(false)
  const [tarkOpen, setTarkOpen] = useState(false)
  const [prefsInitialTab, setPrefsInitialTab] = useState<'general' | 'updates'>('general')
  const [newWsOpen,      setNewWsOpen]      = useState(false)
  const [newModelOpen,   setNewModelOpen]   = useState(false)
  const [showTour,       setShowTour]       = useState(false)
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false)
  const [welcomeContext, setWelcomeContext] = useState<WelcomeContext | null>(null)
  const { toasts, toast: _toast } = useToast()  // global toast listener
  const [, setVisualPreferenceRevision] = useState(0)

  // ── Workspace state — starts empty, loaded from disk on mount ───────────────
  const [workspaces,       setWorkspaces]       = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('')
  const [openModelTabs, setOpenModelTabs] = useState<string[]>([])
  const [workspaceLoadAttempted, setWorkspaceLoadAttempted] = useState(false)
  const hasNotifiedAppReadyRef = useRef(false)
  const lastCanvasPathRef = useRef<string>('')
  const currentCanvasModelId = location.pathname.startsWith('/canvas/')
    ? decodeURIComponent(location.pathname.split('/')[2] ?? '')
    : ''
  const currentResultsModelId = location.pathname.startsWith('/results/')
    ? decodeURIComponent(location.pathname.split('/')[2] ?? '')
    : location.pathname.startsWith('/tark-preview/')
      ? decodeURIComponent(location.pathname.split('/')[3] ?? '')
      : ''

  // ── Load workspaces from the metis data directory on first mount ───────────
  useEffect(() => {
    if (isInstallerPreview) {
      setWorkspaceLoadAttempted(true)
      return
    }

    console.log('[App] Checking environment...')
    if (!(window as any).electronAPI) {
      console.warn('[App] electronAPI NOT found. Running in browser mode? File operations will NOT work.')
      addDiagnostic({
        category: 'ui',
        level: 'warn',
        message: 'Electron bridge is unavailable in the renderer.',
        details: {
          mode: 'browser',
          path: location.pathname,
        },
      })
      // Optional: alert the user if we specifically want them to know
    } else {
      console.log('[App] electronAPI found. Environment is Electron.')
    }

    const clearWorkspaceState = (details?: unknown) => {
      setWorkspaces([])
      setActiveWorkspaceId('')
      addDiagnostic({
        category: 'workspace',
        level: 'warn',
        message: 'No workspaces were available in the selected workspace folder.',
        details,
      })
    }

    async function loadWorkspaces(options: { allowCacheFallback: boolean }) {
      try {
        const result = await (window as any).electronAPI?.listWorkspaces?.()
        if (result?.success && Array.isArray(result.workspaces) && result.workspaces.length > 0) {
          const migrated = result.workspaces.map((workspace: Workspace) => migrateWorkspace(workspace))
          setWorkspaces(collapseWorkspaceFoldersForStartup(migrated))
          setActiveWorkspaceId(migrated[0].id)
          addDiagnostic({
            category: 'workspace',
            message: 'Loaded workspaces from disk.',
            details: {
              count: migrated.length,
              workspaceIds: migrated.map((workspace: Workspace) => workspace.id),
            },
          })
        } else {
          if (options.allowCacheFallback) {
            const backup = readWorkspaceClientCache()
            const parsed = backup ? JSON.parse(backup) : []
            if (Array.isArray(parsed) && parsed.length > 0) {
              const migrated = parsed.map((workspace: Workspace) => migrateWorkspace(workspace))
              setWorkspaces(collapseWorkspaceFoldersForStartup(migrated))
              setActiveWorkspaceId(migrated[0].id)
              addDiagnostic({
                category: 'workspace',
                level: 'warn',
                message: 'Workspace load fell back to client cache.',
                details: {
                  count: migrated.length,
                  workspaceIds: migrated.map((workspace: Workspace) => workspace.id),
                },
              })
            } else {
              console.log('[App] No workspaces found or list failed:', result)
              clearWorkspaceState(result)
            }
          } else {
            console.log('[App] No workspaces found or list failed:', result)
            clearWorkspaceState(result)
          }
        }
      } catch (err) {
        console.error('[metis] Failed to load workspaces:', err)
        addDiagnostic({
          category: 'workspace',
          level: 'error',
          message: 'Workspace loading failed.',
          details: err,
        })
        if (options.allowCacheFallback) {
          const backup = readWorkspaceClientCache()
          const parsed = backup ? JSON.parse(backup) : []
          if (Array.isArray(parsed) && parsed.length > 0) {
            const migrated = parsed.map((workspace: Workspace) => migrateWorkspace(workspace))
            setWorkspaces(collapseWorkspaceFoldersForStartup(migrated))
            setActiveWorkspaceId(migrated[0].id)
            addDiagnostic({
              category: 'workspace',
              level: 'warn',
              message: 'Recovered workspaces from local cache after load failure.',
              details: {
                count: migrated.length,
                workspaceIds: migrated.map((workspace: Workspace) => workspace.id),
              },
            })
          } else {
            clearWorkspaceState(err)
          }
        } else {
          clearWorkspaceState(err)
        }
      } finally {
        setWorkspaceLoadAttempted(true)
      }
    }

    const handleStorageLocationsUpdated = () => {
      setWorkspaceLoadAttempted(false)
      navigate('/')
      void loadWorkspaces({ allowCacheFallback: false })
    }

    window.addEventListener('pls:storage-locations-updated', handleStorageLocationsUpdated)
    void loadWorkspaces({ allowCacheFallback: true })
    return () => window.removeEventListener('pls:storage-locations-updated', handleStorageLocationsUpdated)
  }, [isInstallerPreview, navigate])

  useEffect(() => {
    applySavedVisualPreferences({ skipSavedContrast: isInstallerPreview })
  }, [isInstallerPreview])

  useEffect(() => {
    if (isInstallerPreview) return

    async function checkPlumberHealth() {
      try {
        const result = await (window as any).electronAPI?.plumberHealth?.()
        if (!result) {
          console.warn('[App] Plumber health unavailable in this runtime')
          addDiagnostic({
            category: 'ui',
            level: 'warn',
            message: 'PLS backend health check is unavailable in this runtime.',
            details: {
              path: location.pathname,
            },
          })
          return
        }
        if (result.success) {
          console.log('[App] Plumber health OK', result)
          addDiagnostic({
            category: 'ui',
            message: 'PLS backend health check passed.',
            details: result,
          })
        } else {
          console.warn('[App] Plumber health failed', result)
          addDiagnostic({
            category: 'ui',
            level: 'warn',
            message: 'PLS backend health check reported a problem.',
            details: result,
          })
        }
      } catch (err) {
        console.warn('[App] Plumber health check error', err)
        addDiagnostic({
          category: 'ui',
          level: 'warn',
          message: 'PLS backend health check threw an error.',
          details: err,
        })
      }
    }
    checkPlumberHealth()
  }, [isInstallerPreview])

  useEffect(() => {
    if (isInstallerPreview) return

    const api = (window as any).electronAPI
    if (!api?.getWelcomeContext) return

    api.getWelcomeContext()
      .then((result: any) => {
        if (result?.success) {
          setWelcomeContext({
            displayName: typeof result.displayName === 'string' ? result.displayName : '',
            dataPath: typeof result.dataPath === 'string' ? result.dataPath : '',
          })
        }
      })
      .catch((err: any) => {
        console.warn('[App] Welcome context unavailable', err)
      })
  }, [isInstallerPreview])

  useEffect(() => {
    writeWorkspaceClientCache(JSON.stringify(workspaces.map(migrateWorkspace)))
  }, [workspaces])

  useEffect(() => {
    const nextTheme = theme === 'Light' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', nextTheme)
    document.body.setAttribute('data-theme', nextTheme)
    void (window as any).electronAPI?.setThemePreference?.(nextTheme)
  }, [theme])

  useEffect(() => {
    const readCurrentThemePreference = () => isInstallerPreview ? getInstallerPreviewTheme() : getSavedThemePreference()
    const applyCurrentPreferences = () => {
      applySavedVisualPreferences({ skipSavedContrast: isInstallerPreview })
      setVisualPreferenceRevision((revision) => revision + 1)
      const nextPreference = readCurrentThemePreference()
      setThemePreference(nextPreference)
      setTheme(resolveThemePreference(nextPreference))
    }
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === INSTALLER_PREF_THEME_KEY ||
        event.key === METIS_PREF_THEME_KEY ||
        event.key === LEGACY_PREF_THEME_KEY ||
        event.key === METIS_PREF_FONT_SCALE_KEY ||
        event.key === METIS_PREF_ACCENT_COLOR_KEY ||
        event.key === LEGACY_PREF_ACCENT_COLOR_KEY ||
        event.key === METIS_PREF_INTERFACE_CONTRAST_KEY ||
        event.key === LEGACY_PREF_INTERFACE_CONTRAST_KEY
      ) {
        applyCurrentPreferences()
      }
    }

    if (isInstallerPreview) {
      setTheme('Light')
    } else {
      setTheme(getSavedTheme())
    }
    setThemePreference(readCurrentThemePreference())
    if (!isInstallerPreview) applyCurrentPreferences()
    const handleThemePreview = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail && detail.theme && detail.preference) {
        setThemePreference(detail.preference)
        setTheme(detail.theme)
      }
    }
    window.addEventListener('pls:preferences-updated', applyCurrentPreferences)
    window.addEventListener('storage', handleStorage)
    window.addEventListener('pls:theme-preview', handleThemePreview)
    return () => {
      window.removeEventListener('pls:preferences-updated', applyCurrentPreferences)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('pls:theme-preview', handleThemePreview)
    }
  }, [isInstallerPreview])

  useEffect(() => {
    if (isInstallerPreview || themePreference !== 'Auto' || typeof window === 'undefined' || !window.matchMedia) return
    const systemThemeQuery = window.matchMedia('(prefers-color-scheme: light)')
    const handleSystemThemeChange = () => setTheme(resolveThemePreference('Auto'))
    systemThemeQuery.addEventListener?.('change', handleSystemThemeChange)
    return () => {
      systemThemeQuery.removeEventListener?.('change', handleSystemThemeChange)
    }
  }, [isInstallerPreview, themePreference])

  useEffect(() => {
    if (location.pathname.startsWith('/canvas/')) {
      lastCanvasPathRef.current = location.pathname
    }
  }, [location.pathname])

  const openModelInCanvas = useCallback((modelId: string, workspaceId?: string) => {
    if (!modelId) return

    if (workspaceId) {
      setActiveWorkspaceId(workspaceId)
    } else {
      const owningWs = workspaces.find(w => w.children?.some(c => c.id === modelId && c.type === 'model'))
      if (owningWs) setActiveWorkspaceId(owningWs.id)
    }

    setOpenModelTabs(prev => prev.includes(modelId) ? prev : [...prev, modelId])
    navigate(`/canvas/${modelId}`)
  }, [navigate, workspaces])

  const reorderModelTabs = useCallback((draggedModelId: string, targetModelId: string) => {
    if (!draggedModelId || !targetModelId || draggedModelId === targetModelId) return

    setOpenModelTabs(prev => {
      const next = [...prev]
      const fromIndex = next.indexOf(draggedModelId)
      const toIndex = next.indexOf(targetModelId)
      if (fromIndex === -1 || toIndex === -1) return prev

      next.splice(fromIndex, 1)
      next.splice(toIndex, 0, draggedModelId)
      return next
    })
  }, [])

  const closeModelTab = useCallback((modelId: string) => {
    if (!modelId) return

    const currentTabs = openModelTabs
    const closingIndex = currentTabs.indexOf(modelId)
    if (closingIndex === -1) return

    const nextTabs = currentTabs.filter(id => id !== modelId)
    setOpenModelTabs(nextTabs)

    if (currentCanvasModelId !== modelId) return

    const fallbackId = nextTabs[closingIndex] || nextTabs[closingIndex - 1] || ''
    if (fallbackId) {
      const owningWs = workspaces.find(w => w.children?.some(c => c.id === fallbackId && c.type === 'model'))
      if (owningWs) setActiveWorkspaceId(owningWs.id)
      navigate(`/canvas/${fallbackId}`)
      return
    }

    navigate('/')
  }, [currentCanvasModelId, navigate, openModelTabs, workspaces])

  const openWorkspaceFromFilePath = useCallback(async (filePath: string) => {
    const api = (window as any).electronAPI
    if (!filePath || !api) return

    try {
      let openedWorkspace: Workspace | null = null

      if (api.openWorkspaceFile) {
        const result = await api.openWorkspaceFile(filePath)
        if (result?.success && result.workspace) {
          openedWorkspace = migrateWorkspace(result.workspace as Workspace)
        }
      }

      if (!openedWorkspace && api.listWorkspaces) {
        const listResult = await api.listWorkspaces()
        if (listResult?.success && Array.isArray(listResult.workspaces)) {
          openedWorkspace = listResult.workspaces.find(
            (workspace: Workspace) => (workspace.path ?? '').replace(/\\/g, '/') === filePath.replace(/\\/g, '/')
          ) ?? null
          if (openedWorkspace) {
            openedWorkspace = migrateWorkspace(openedWorkspace)
          }
        }
      }

      if (!openedWorkspace) {
        console.warn('[App] No workspace could be opened from file:', filePath)
        return
      }

      const normalizedPath = (openedWorkspace.path ?? '').replace(/\\/g, '/')
      const existingWorkspace = workspaces.find(workspace =>
        workspace.id === openedWorkspace!.id
        || ((workspace.path ?? '').replace(/\\/g, '/') === normalizedPath)
      )

      const mergedWorkspace: Workspace = existingWorkspace
        ? {
            ...migrateWorkspace(existingWorkspace),
            ...migrateWorkspace(openedWorkspace),
            children: migrateWorkspace(openedWorkspace).children,
            datasetTempPath: openedWorkspace.datasetTempPath || existingWorkspace.datasetTempPath,
          }
        : migrateWorkspace(openedWorkspace)

      setWorkspaces(prev => {
        const existingIndex = prev.findIndex(workspace =>
          workspace.id === mergedWorkspace.id
          || ((workspace.path ?? '').replace(/\\/g, '/') === normalizedPath)
        )

        if (existingIndex === -1) return [...prev, migrateWorkspace(mergedWorkspace)]

        const next = [...prev]
        next[existingIndex] = migrateWorkspace(mergedWorkspace)
        return next
      })

      setActiveWorkspaceId(mergedWorkspace.id)

      const workspaceModelIds = mergedWorkspace.children
        .filter(child => child.type === 'model')
        .map(child => child.id)

      const preferredModelId =
        (currentCanvasModelId && workspaceModelIds.includes(currentCanvasModelId) ? currentCanvasModelId : '')
        || openModelTabs.find(id => workspaceModelIds.includes(id))
        || workspaceModelIds[0]
        || ''

      if (preferredModelId) {
        openModelInCanvas(preferredModelId, mergedWorkspace.id)
      } else {
        navigate('/')
      }
    } catch (err) {
      console.error('[App] Failed to open workspace file:', err)
    }
  }, [currentCanvasModelId, navigate, openModelInCanvas, openModelTabs, workspaces])

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.reportRendererError) return

    const onError = (event: ErrorEvent) => {
      api.reportRendererError({
        type: 'window.error',
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack,
      })
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason: any = event.reason
      api.reportRendererError({
        type: 'window.unhandledrejection',
        message: typeof reason === 'string' ? reason : reason?.message ?? String(reason),
        stack: reason?.stack,
      })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  // ─── Notify main process once initial renderer state is ready ─────────────
  useEffect(() => {
    if (!workspaceLoadAttempted || hasNotifiedAppReadyRef.current) return
    const api = (window as any).electronAPI
    const signalRendererReady = api?.sendRendererReady || api?.notifyAppReady
    if (typeof signalRendererReady === 'function') {
      console.log('[App] App ready, notifying main process')
      signalRendererReady()
      hasNotifiedAppReadyRef.current = true
    } else {
      console.error('[App] electronAPI renderer-ready bridge is missing')
    }
  }, [workspaceLoadAttempted])

  useEffect(() => {
    if (!currentCanvasModelId) return

    setOpenModelTabs(prev => prev.includes(currentCanvasModelId) ? prev : [...prev, currentCanvasModelId])

    const owningWs = workspaces.find(workspace =>
      workspace.children?.some(child => child.id === currentCanvasModelId && child.type === 'model')
    )
    if (owningWs && owningWs.id !== activeWorkspaceId) {
      setActiveWorkspaceId(owningWs.id)
    }
  }, [activeWorkspaceId, currentCanvasModelId, workspaces])

  useEffect(() => {
    setOpenModelTabs(prev => prev.filter(modelId =>
      workspaces.some(workspace => workspace.children?.some(child => child.id === modelId && child.type === 'model'))
    ))
  }, [workspaces])

  useEffect(() => {
    const handler = (e: Event) => {
      const normalized = normalizeWorkspacePayload((e as CustomEvent<unknown>).detail)
      if (!normalized) return
      setWorkspaces(normalized)
    }
    window.addEventListener('pls:workspaces-updated', handler)
    return () => window.removeEventListener('pls:workspaces-updated', handler)
  }, [])

  // ── Open workspace file via OS file association (double-click in Explorer) ────────
  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.onOpenFile) return

    const cleanup = api.onOpenFile(async (filePath: string) => {
      console.log('[App] Received workspace:openedViaFile', filePath)
      await openWorkspaceFromFilePath(filePath)
    })

    return cleanup
  }, [openWorkspaceFromFilePath])

  // ── Auto-launch tour on first WorkspaceHome view (never during installer) ─
  useEffect(() => {
    if (location.pathname !== '/') return
    const completed = localStorage.getItem(METIS_TOUR_COMPLETED_KEY) ?? localStorage.getItem(LEGACY_TOUR_COMPLETED_KEY)
    if (!completed) setShowTour(true)
  }, [location.pathname])

  // ── Screen determination ───────────────────────────────────────────────────
  let currentScreen: 'home' | 'canvas' | 'results' | 'import' = 'home'
  if (location.pathname.startsWith('/canvas'))  currentScreen = 'canvas'
  else if (location.pathname.startsWith('/results') || location.pathname.startsWith('/tark-preview')) currentScreen = 'results'
  else if (location.pathname.startsWith('/import') || location.pathname.startsWith('/dataview') || location.pathname === '/rcode') currentScreen = 'import'
  const activeTitleModelName = (() => {
    const modelId = currentCanvasModelId || currentResultsModelId
    if (!modelId || (currentScreen !== 'canvas' && currentScreen !== 'results')) return ''

    for (const workspace of workspaces) {
      const model = workspace.children.find((child) => child.type === 'model' && child.id === modelId)
      if (model) return stripModelDisplayName(model.name || modelId)
    }

    return stripModelDisplayName(modelId)
  })()

  // ── Hidden file input ref — fallback when electronAPI.openFile is unavailable ─
  const fileInputRef        = useRef<HTMLInputElement>(null)
  const pendingImportStateRef = useRef<DatasetImportState | null>(null)

  // ── Helper: open file picker for dataset import ─────────────────────────────
  const openDatasetFilePicker = useCallback(async ({
    workspaceName,
    workspacePath,
    workspaceId,
    returnTo,
    datasetId,
    source,
    modelId,
    saveMode,
  }: DatasetImportState) => {
    const api = (window as any).electronAPI
    const targetReturnTo = returnTo ?? location.pathname

    // ── Path A: Electron IPC dialog (preferred) ──────────────────────────────
    if (api?.openFile) {
      try {
        const result = await api.openFile({
          title: 'Import Dataset',
          filters: [
            { name: 'CSV and Excel Files', extensions: ['csv', 'xlsx', 'xls'] },
          ],
          properties: ['openFile'],
        })
        if (result && !result.canceled && result.filePaths?.length > 0) {
          const filePath = result.filePaths[0]
          const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
          navigate('/import/step1', {
            state: {
              filePath,
              fileName,
              workspaceName,
              workspacePath,
              workspaceId,
              returnTo: targetReturnTo,
              datasetId,
              source,
              modelId,
              saveMode,
            },
          })
        }
        return
      } catch (err) {
        console.warn('[App] electronAPI.openFile failed, using fallback picker:', err)
      }
    }

    // ── Path B: Browser / bridge-failure fallback — native <input type="file"> ─
    pendingImportStateRef.current = {
      workspaceName,
      workspacePath,
      workspaceId,
      returnTo: targetReturnTo,
      datasetId,
      source,
      modelId,
      saveMode,
    }
    fileInputRef.current?.click()
  }, [navigate, location.pathname])

  const cacheDatasetView = useCallback((entry: DatasetViewCacheEntry & { datasetId: string }) => {
    writeDatasetViewCache(entry.datasetId, entry)
  }, [])

  const applyImportedDataset = useCallback((detail: {
    datasetId?: string
    fileName?: string
    filePath?: string
    workspaceName?: string
    workspaceId?: string
    headers?: string[]
    variableTypes?: Record<string, 'MET' | 'CAT'>
    totalRows?: number
    missing?: number
    datasetTempPath?: string
    source?: DatasetImportSource
    modelId?: string
    saveMode?: 'replace' | 'save-as-new'
    setAsDefault?: boolean
  }) => {
    const {
      datasetId,
      fileName,
      filePath,
      workspaceName,
      workspaceId,
      headers,
      variableTypes,
      totalRows,
      missing,
      datasetTempPath,
      source,
      modelId,
      saveMode,
      setAsDefault,
    } = detail
    if (!fileName) return

    setWorkspaces((prev) => {
      const targetWs = prev.find((workspace) =>
        workspace.id === workspaceId
        || workspace.name === workspaceName
        || workspace.id === activeWorkspaceId
      )
      if (!targetWs) {
        console.warn('[App] Could not find target workspace for dataset import', { workspaceId, workspaceName, activeWorkspaceId })
        addDiagnostic({
          category: 'dataset',
          level: 'warn',
          message: 'Dataset import could not find a target workspace.',
          details: { workspaceId, workspaceName, activeWorkspaceId, fileName },
        })
        return prev
      }

      const migratedWorkspace = migrateWorkspace(targetWs)
      const resolvedDatasetId = datasetId || `ds-${Date.now()}`
      const existingDataset = migratedWorkspace.children.find((child): child is WorkspaceDatasetChild => (
        child.type === 'dataset' && child.id === resolvedDatasetId
      ))
      const newDataset: WorkspaceDatasetChild = {
        ...(existingDataset ?? {
          id: resolvedDatasetId,
          name: truncateDatasetName(fileName),
          type: 'dataset',
        }),
        id: resolvedDatasetId,
        name: truncateDatasetName(fileName),
        type: 'dataset',
        filePath: filePath ?? existingDataset?.filePath ?? '',
        datasetTempPath: typeof datasetTempPath === 'string' && datasetTempPath.trim().length > 0
          ? datasetTempPath
          : existingDataset?.datasetTempPath,
        originalFileName: fileName,
        headers: headers ?? [],
        variableTypes: variableTypes ?? {},
        totalRows,
        missing,
        meta: `${totalRows ?? '?'} cases · ${(headers as string[] | undefined)?.length ?? '?'} variables${(missing ?? 0) > 0 ? ` · ${missing} missing` : ''}`,
      }

      try {
        const updatedWs = upsertDatasetInWorkspace(migratedWorkspace, newDataset, {
          setAsDefault: setAsDefault ?? source !== 'model-canvas',
          linkedModelId: source === 'model-canvas'
            ? (modelId || currentCanvasModelId || undefined)
            : undefined,
        })

        addDiagnostic({
          category: 'dataset',
          message: saveMode === 'replace' ? 'Dataset replaced in workspace.' : 'Dataset added to workspace.',
          details: {
            workspaceId: updatedWs.id,
            datasetId: resolvedDatasetId,
            fileName,
            source,
            modelId: source === 'model-canvas'
              ? (modelId || currentCanvasModelId || undefined)
              : undefined,
            headers: headers?.length ?? 0,
            totalRows,
          },
        })

        if ((window as any).electronAPI?.saveWorkspace) {
          ;(window as any).electronAPI.saveWorkspace(updatedWs)
            .then((res: any) => console.log('[App] saveWorkspace result:', res))
            .catch((err: any) => console.error('[App] saveWorkspace failed:', err))
        }

        return prev.map((workspace) => workspace.id === targetWs.id ? updatedWs : workspace)
      } catch (err: any) {
        dispatchToast('error', 'Dataset limit reached', err?.message || 'Delete a dataset before adding another one.')
        addDiagnostic({
          category: 'dataset',
          level: 'error',
          message: 'Dataset import failed while updating the workspace.',
          details: err,
        })
        return prev
      }
    })
  }, [activeWorkspaceId, currentCanvasModelId])

  // ── Helper: open file picker for R script import ────────────────────────────
  const openRScriptFilePicker = useCallback(async () => {
    const result = await (window as any).electronAPI?.openFile?.({
      title: 'Import R Script',
      filters: [{ name: 'R Scripts', extensions: ['R', 'r'] }],
      properties: ['openFile'],
    })
    if (result && !result.canceled && result.filePaths?.length > 0) {
      const filePath = result.filePaths[0]
      const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
      navigate('/rcode', { state: { filePath, fileName } })
    }
  }, [navigate])

  const requestQuit = useCallback(() => {
    setQuitConfirmOpen(true)
  }, [])

  const confirmQuit = useCallback(() => {
    setQuitConfirmOpen(false)
    ;(window as any).electronAPI?.close?.()
  }, [])

  // ── Global action handler (TitleBar menu → AppShell) ─────────────────────────
  useEffect(() => {
    const handler = async (e: any) => {
      const action = e.detail?.action
      if (!action) return

      if (action === 'open-preferences') { setPrefsInitialTab('general'); setPrefsOpen(true); return }
      if (action === 'open-tark')        { setTarkOpen(true); return }
      if (action === 'open-about')       { setPrefsInitialTab('updates'); setPrefsOpen(true); return }
      if (action === 'open-docs')        { openMetisExternal(METIS_DOCS_URL); return }
      if (action === 'open-feedback')    { openMetisExternal(METIS_FEEDBACK_URL); return }
      if (action === 'open-report-bug')  { openMetisExternal(METIS_BUG_REPORT_URL); return }
      if (action === 'open-cite-metis')  { openMetisExternal(METIS_CITATION_URL); return }
      if (action === 'open-tour')        { setShowTour(true);  return }
      if (action === 'new-workspace')    { setNewWsOpen(true); return }
      if (action === 'new-model')        { setNewModelOpen(true); return }
      if (action === 'import-rscript')   { await openRScriptFilePicker(); return }

      if (action.startsWith('open-recent:')) {
        const modelId = action.split(':')[1]
        if (!modelId) return
        openModelInCanvas(modelId)
        return
      }

      if (action === 'quit-app') {
        requestQuit()
        return
      }

      if (action === 'toggle-home-canvas') {
        if (currentScreen === 'canvas') {
          window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: 'canvas:go-home' } }))
          return
        }

        if (currentScreen === 'home') {
          if (lastCanvasPathRef.current) {
            navigate(lastCanvasPathRef.current)
          }
          return
        }

        navigate('/')
        return
      }

      if (action === 'import-dataset') {
        const activeWs = workspaces.find(w => w.id === activeWorkspaceId)
        const hasDataset = activeWs?.children.some(c => c.type === 'dataset') ?? false

        if (hasDataset) {
          if (currentScreen === 'home') {
            window.dispatchEvent(new CustomEvent('pls:show-dataset-choice'))
          } else {
            await openDatasetFilePicker({
              workspaceName: activeWs?.name ?? '',
              workspacePath: activeWs?.path ?? '',
              workspaceId: activeWs?.id,
              returnTo: location.pathname,
              source: 'model-canvas',
              modelId: currentCanvasModelId || undefined,
              saveMode: 'save-as-new',
            })
          }
        } else {
          await openDatasetFilePicker({
            workspaceName: activeWs?.name ?? '',
            workspacePath: activeWs?.path ?? '',
            workspaceId: activeWs?.id,
            returnTo: location.pathname,
            source: currentScreen === 'canvas' ? 'model-canvas' : 'workspace-home',
            modelId: currentCanvasModelId || undefined,
            saveMode: 'save-as-new',
          })
        }
        return
      }

      if (action === 'open-import-picker') {
        const activeWs = workspaces.find(w => w.id === activeWorkspaceId)
        const requestedReturnTo = e.detail?.returnTo as string | undefined
        await openDatasetFilePicker({
          workspaceName: activeWs?.name ?? '',
          workspacePath: activeWs?.path ?? '',
          workspaceId: activeWs?.id,
          returnTo: requestedReturnTo ?? location.pathname,
          datasetId: e.detail?.datasetId,
          source: e.detail?.source ?? (currentScreen === 'canvas' ? 'model-canvas' : 'workspace-home'),
          modelId: e.detail?.modelId ?? currentCanvasModelId ?? undefined,
          saveMode: e.detail?.saveMode ?? 'save-as-new',
        })
        return
      }

      if (action === 'open-workspace') {
        const result = await (window as any).electronAPI?.openFile?.({
          title: 'Open Workspace',
          filters: [{ name: 'metis Workspace', extensions: ['metisws', 'ada'] }],
          properties: ['openFile'],
        })
        if (result && !result.canceled && result.filePaths?.length > 0) {
          await openWorkspaceFromFilePath(result.filePaths[0])
        }
        return
      }
    }

    window.addEventListener('pls:action', handler)
    return () => window.removeEventListener('pls:action', handler)
  }, [navigate, workspaces, activeWorkspaceId, openDatasetFilePicker, openRScriptFilePicker, currentScreen, location.pathname, requestQuit, openModelInCanvas, openWorkspaceFromFilePath, currentCanvasModelId])

  useEffect(() => {
    const unsubscribe = (window as any).electronAPI?.onNativeMenuAction?.((action: string) => {
      if (!action) return
      window.dispatchEvent(new CustomEvent('pls:action', { detail: { action } }))
    })
    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isAltF4 = e.altKey && e.key === 'F4'
      const isCtrlQ = e.ctrlKey && (e.key === 'q' || e.key === 'Q')
      if (!isAltF4 && !isCtrlQ) return
      e.preventDefault()
      requestQuit()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [requestQuit])

  // ── WorkspaceHome dataset choice: after user picks "replace", open file picker
  useEffect(() => {
    const handler = async (e: any) => {
      const activeWs = workspaces.find(w => w.id === activeWorkspaceId)
      const requestedReturnTo = e.detail?.returnTo as string | undefined
      await openDatasetFilePicker({
        workspaceName: activeWs?.name ?? '',
        workspacePath: activeWs?.path ?? '',
        workspaceId: activeWs?.id,
        returnTo: requestedReturnTo ?? location.pathname,
        datasetId: e.detail?.datasetId,
        source: e.detail?.source ?? (currentScreen === 'canvas' ? 'model-canvas' : 'workspace-home'),
        modelId: e.detail?.modelId ?? currentCanvasModelId ?? undefined,
        saveMode: e.detail?.saveMode ?? 'save-as-new',
      })
    }
    window.addEventListener('pls:open-import-picker', handler)
    return () => window.removeEventListener('pls:open-import-picker', handler)
  }, [workspaces, activeWorkspaceId, openDatasetFilePicker, location.pathname, currentScreen, currentCanvasModelId])

  useEffect(() => {
    const handler = async () => {
      const activeWs = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
      const api = (window as any).electronAPI

      if (!activeWs?.path || !api?.useSampleDataset) {
        dispatchToast('error', 'Sample dataset unavailable', 'Create or open a workspace first, then try again.')
        return
      }

      try {
        const sampleDatasetId = `ds-${Date.now()}`
        const result = await api.useSampleDataset({ workspacePath: activeWs.path, datasetId: sampleDatasetId })
        if (!result?.success) {
          dispatchToast('error', 'Sample dataset unavailable', result?.error || 'Could not load the packaged sample dataset.')
          return
        }

        cacheDatasetView({
          datasetId: sampleDatasetId,
          filePath: result.filePath,
          fileName: result.fileName,
          workspaceId: activeWs.id,
          workspaceName: activeWs.name,
          workspacePath: activeWs.path,
          headers: result.headers,
          allRows: result.allRows,
          totalRows: result.totalRows,
          missing: result.missing,
          absolutePath: result.absolutePath,
          datasetTempPath: result.datasetTempPath,
        })

        applyImportedDataset({
          ...result,
          datasetId: sampleDatasetId,
          workspaceId: activeWs.id,
          workspaceName: activeWs.name,
          source: currentScreen === 'canvas' ? 'model-canvas' : 'workspace-home',
          modelId: currentCanvasModelId || undefined,
          saveMode: 'save-as-new',
        })

        dispatchToast(
          'success',
          'Sample dataset loaded',
          `${result.totalRows ?? '?'} cases · ${Array.isArray(result.headers) ? result.headers.length : '?'} variables ready on the canvas.`,
        )
      } catch (err: any) {
        dispatchToast('error', 'Sample dataset unavailable', err?.message || 'Could not load the packaged sample dataset.')
      }
    }

    window.addEventListener('pls:use-sample-dataset', handler)
    return () => window.removeEventListener('pls:use-sample-dataset', handler)
  }, [activeWorkspaceId, applyImportedDataset, cacheDatasetView, workspaces, currentScreen, currentCanvasModelId])

  // ── Dataset imported: add as child to active workspace + persist ─────────────
  useEffect(() => {
    const handler = async (e: Event) => {
      const normalized = normalizeDatasetImportedPayload((e as CustomEvent<unknown>).detail)
      if (!normalized) return
      console.log('[App] pls:dataset-imported received', normalized)
      applyImportedDataset(normalized)
    }
    window.addEventListener('pls:dataset-imported', handler)
    return () => window.removeEventListener('pls:dataset-imported', handler)
  }, [applyImportedDataset])

  // ── Fallback file-input handler ────────────────────────────────────────────
  const handleFallbackFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const pendingImportState = pendingImportStateRef.current
    const workspaceName = pendingImportState?.workspaceName ?? ''
    const workspacePath = pendingImportState?.workspacePath ?? ''
    const returnTo = pendingImportState?.returnTo || location.pathname
    const fileName      = file.name
    const reader        = new FileReader()
    reader.onload = () => {
      // FileReader result is a data-URL like "data:<mime>;base64,<b64>"
      // Strip the prefix so ImportStep1 receives raw base64 (same shape as IPC readFile)
      const dataUrl = reader.result as string
      const base64  = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
      navigate('/import/step1', {
        state: {
          filePath: '',
          fileName,
          workspaceName,
          workspacePath,
          workspaceId: pendingImportState?.workspaceId,
          returnTo,
          fileContent: base64,
          datasetId: pendingImportState?.datasetId,
          source: pendingImportState?.source,
          modelId: pendingImportState?.modelId,
          saveMode: pendingImportState?.saveMode,
        },
      })
    }
    reader.readAsDataURL(file)
    // Reset so the same file can be selected again next time
    e.target.value = ''
  }, [navigate, location.pathname])

  const showBridgeBanner = !isInstallerPreview && import.meta.env.DEV && !(window as any).electronAPI
  const isElectronUserAgent = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent)

  function handleTarkIt(request: TarkReportRequest) {
    setTarkOpen(false)
    navigate(`/tark-preview/${request.workspaceId}/${request.modelId}`, {
      state: { tark: request },
    })
  }

  return (
    <div
      className="metis-app-shell h-screen w-screen flex flex-col overflow-hidden select-none"
      data-theme={theme === 'Light' ? 'light' : 'dark'}
      style={{ background: isInstallerPreview ? 'transparent' : 'var(--color-page)' }}
    >
      {/* Hidden fallback file-picker — used when electronAPI.openFile is unavailable */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleFallbackFileChange}
      />
      {showBridgeBanner && (
        <div
          className="shrink-0 px-3 py-2 text-[11px] border-b"
          style={{
            backgroundColor: 'rgba(170,17,85,0.12)',
            borderColor: 'rgba(170,17,85,0.25)',
            color: '#FADBE6',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {isElectronUserAgent
            ? 'Electron runtime detected, but window.electronAPI is missing (preload bridge did not load). Check Electron preload output and restart `npm run electron:dev`.'
            : 'Browser mode: window.electronAPI is not available. Run `npm run electron:dev` to test native file dialogs and the R/Plumber backend.'}
        </div>
      )}
      {!isInstallerPreview && <TitleBar currentScreen={currentScreen} theme={theme} activeModelName={activeTitleModelName} />}
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/installer-preview" element={<InstallerPreview />} />
          <Route path="/setup-wizard" element={<SetupWizard />} />
          <Route path="/" element={
            <WorkspaceHome
              workspaces={workspaces}
              setWorkspaces={setWorkspaces}
              activeId={activeWorkspaceId}
              setActiveId={setActiveWorkspaceId}
            />
          } />
          <Route
            path="/canvas/:modelId"
            element={
              <ModelCanvas
                workspaces={workspaces}
                setWorkspaces={setWorkspaces}
                activeWorkspaceId={activeWorkspaceId}
                openModelTabs={openModelTabs}
                onOpenModel={openModelInCanvas}
                onCloseModelTab={closeModelTab}
                onReorderModelTabs={reorderModelTabs}
              />
            }
          />
          <Route path="/results/:modelId" element={<ResultsView />} />
          <Route path="/results/:modelId/descriptive" element={<DescriptiveStats />} />
          <Route path="/tark-preview/:workspaceId/:modelId" element={<TarkPreview />} />
          <Route path="/rcode" element={<RCodeViewer />} />
          <Route path="/import/step1" element={<ImportStep1 workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />} />
          <Route path="/dataview/:workspaceId/:datasetId" element={<DataView workspaces={workspaces} />} />
        </Routes>
      </div>
      {showTour && (
        <OnboardingTour
          currentScreen={currentScreen}
          theme={theme}
          displayName={welcomeContext?.displayName ?? ''}
          workspacePath={welcomeContext?.dataPath ?? ''}
          onClose={() => {
            setShowTour(false)
            localStorage.setItem(METIS_TOUR_COMPLETED_KEY, 'true')
            localStorage.setItem(LEGACY_TOUR_COMPLETED_KEY, 'true')
          }}
        />
      )}

      {prefsOpen && <PreferencesModal initialTab={prefsInitialTab} onClose={() => setPrefsOpen(false)} />}

      {tarkOpen && (
        <TarkModal
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onTarkIt={handleTarkIt}
          onClose={() => setTarkOpen(false)}
        />
      )}

      {quitConfirmOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center"
          style={{ background: 'var(--color-overlay)' }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setQuitConfirmOpen(false)
          }}
        >
          <div
            className="flex flex-col"
            style={{
              width: 'min(460px, 92vw)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 14,
              boxShadow: 'var(--shadow-modal)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 700 }}>
                Quit {APP_BRAND_NAME}?
              </div>
              <div style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, marginTop: 6 }}>
                Are you sure you want to close the application?
              </div>
            </div>

            <div className="flex items-center justify-end" style={{ gap: 10, padding: '14px 20px' }}>
              <button
                onClick={() => setQuitConfirmOpen(false)}
                className="flex items-center justify-center hover:bg-white/[0.05] transition-colors"
                style={{
                  height: 34,
                  padding: '0 16px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 500 }}>Cancel</span>
              </button>
              <button
                onClick={confirmQuit}
                className="flex items-center justify-center hover:opacity-90 transition-opacity"
                style={{
                  height: 34,
                  padding: '0 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--color-danger)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ color: 'var(--color-on-danger)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700 }}>Quit</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {newWsOpen && (
        <NewWorkspaceDialog
          onClose={() => setNewWsOpen(false)}
          onCreate={async (name, _desc, color) => {
            const id  = `ws-${Date.now()}`
            const newWs: Workspace = {
              id,
              name: `${name}.metisws`,
              color,
              expanded: true,
              children: [],
            }
            // Persist to disk — inject the returned absolute path into state
            const res = await (window as any).electronAPI?.createWorkspace?.(newWs)
            const wsWithPath: Workspace = { ...newWs, path: res?.path ?? '' }
            setWorkspaces(prev => [...prev, wsWithPath])
            setActiveWorkspaceId(id)
            setNewWsOpen(false)
          }}
        />
      )}

      {newModelOpen && (
        <NewModelDialog
          onClose={() => setNewModelOpen(false)}
          activeWorkspaceId={activeWorkspaceId}
          workspaces={workspaces}
          onCreate={async (name, wsId, newWsData) => {
            let targetWsId = wsId

            // 1. Create new workspace if requested
            if (newWsData && wsId === 'new') {
              const newWsId = `ws-${Date.now()}`
              const newWs: Workspace = {
                id: newWsId,
                name: `${newWsData.name}.metisws`,
                color: newWsData.color,
                expanded: true,
                children: [],
              }
              // Persist to disk — inject the returned absolute path into state
              const res = await (window as any).electronAPI?.createWorkspace?.(newWs)
              const wsWithPath: Workspace = { ...newWs, path: res?.path ?? '' }
              setWorkspaces(prev => [...prev, wsWithPath])
              setActiveWorkspaceId(newWsId)
              targetWsId = newWsId
            }

            // 2. Create the model
            const modelId = `m-${Date.now()}`
            const nowIso = new Date().toISOString()
            const targetWorkspace = workspaces.find((workspace) => workspace.id === targetWsId)
            const migratedTargetWorkspace = targetWorkspace ? migrateWorkspace(targetWorkspace) : null
            const newModel: WorkspaceChild = {
              id: modelId,
              name: `${name}.hbe`,
              type: 'model',
              badge: 'Draft',
              createdAt: nowIso,
              updatedAt: nowIso,
              linkedDatasetId: migratedTargetWorkspace?.defaultDatasetId,
              state: {
                constructs: [],
                paths: [],
              },
            }

            // 3. Update the target workspace with the new model
            setWorkspaces(prev => {
              const updated = prev.map(ws =>
                ws.id === targetWsId ? { ...ws, children: [...ws.children, newModel] } : ws
              )
              
              // Persist updated workspace to disk (after state update is scheduled)
              const targetWs = updated.find(w => w.id === targetWsId)
              if (targetWs) {
                (window as any).electronAPI?.saveWorkspace?.(targetWs)
              }
              return updated
            })

            setNewModelOpen(false)
            openModelInCanvas(modelId, targetWsId)
          }}
        />
      )}

      {/* Global Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={(id) => _toast.dismiss(id)} />
    </div>
  )
}

// Unused import guard
void SHELL_ROUTES

export default function App() {
  return (
    <CalculationProvider>
      <HashRouter>
        <CalculatingModal />
        <CalculatingChip />
        <AppShell />
      </HashRouter>
    </CalculationProvider>
  )
}
