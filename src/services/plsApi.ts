import { addDiagnostic } from '../utils/diagnostics'

export type MeasurementType = 'Reflective' | 'Formative'

export interface RunPlsConstruct {
  name: string
  type: MeasurementType
  indicators: string[]
  is_higher_order?: boolean
  higher_order_type?: 'reflective' | 'formative'
  dimensions?: string[]
}

export interface RunPlsPath {
  from: string
  to: string
}

export interface RunPlsInteraction {
  iv: string
  moderator: string
  outcome: string
}

export interface RunPlsRequest {
  datasetPath: string
  constructs: RunPlsConstruct[]
  paths: RunPlsPath[]
  interactions?: RunPlsInteraction[]
  algorithm?: 'standard' | 'consistent'
  algorithmSettings?: {
    innerWeighting?: string
    initialWeights?: string
    maxIterations?: number
    stopCriterion?: string
  }
}

interface RunPlsPathResult {
  from: string
  to: string
  coefficient: number
}

interface RunPlsR2Result {
  construct: string
  r2: number | null
}

export interface RunPlsResponse {
  success: boolean
  status?: number
  url?: string
  error?: string
  results?: {
    paths: RunPlsPathResult[]
    rSquared: RunPlsR2Result[]
    reliability?: Array<Record<string, unknown>>
    meta?: Record<string, unknown>
  }
}

export interface RunBootstrapRequest extends RunPlsRequest {
  nboot?: number
  ciType?: string
  confidenceLevel?: string
  seed?: number
}

export interface RunPlsPredictRequest extends RunPlsRequest {
  folds?: number
  repetitions?: number
  cvpatEnabled?: boolean
}

export interface RunAdvancedAnalysisRequest extends RunPlsRequest {
  targetConstruct: string
  predecessorScope?: 'all' | 'direct'
  analyses?: {
    ipma?: boolean
    nca?: boolean
    cipma?: boolean
  }
  runDepth?: number
  bottleneckStepSize?: number
}

export interface GenericAnalysisResponse {
  success: boolean
  status?: number
  url?: string
  error?: string
  results?: Record<string, unknown>
}

// Browser-only fallback for local development outside Electron.
const LOCAL_PLUMBER_BASE_URL =
  String(import.meta.env.VITE_METIS_LOCAL_PLUMBER_URL || '').trim() ||
  'http://127.0.0.1:8765'

function isElectronRuntime(): boolean {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  return /electron/i.test(ua)
}

function bridgeMissingResponse(action: string, availableKeys: string): GenericAnalysisResponse {
  addDiagnostic({
    category: 'ui',
    level: 'error',
    message: `Electron bridge is unavailable for ${action}.`,
    details: {
      action,
      availableKeys,
    },
  })
  return {
    success: false,
    status: 0,
    error: `Electron bridge unavailable for ${action}. Preload may not be loaded. Available bridge keys: ${availableKeys}`,
  }
}

function bridgeMissingPlsResponse(action: string, availableKeys: string): RunPlsResponse {
  addDiagnostic({
    category: 'ui',
    level: 'error',
    message: `Electron bridge is unavailable for ${action}.`,
    details: {
      action,
      availableKeys,
    },
  })
  return {
    success: false,
    status: 0,
    error: `Electron bridge unavailable for ${action}. Preload may not be loaded. Available bridge keys: ${availableKeys}`,
  }
}

function normalizeFetchError(error: any): string {
  const message = String(error?.message || '').toLowerCase()
  if (message.includes('failed to fetch') || message.includes('fetch failed') || message.includes('networkerror')) {
    return `Cannot reach local PLS backend at ${LOCAL_PLUMBER_BASE_URL}. Start the Electron app runtime and retry.`
  }
  return error?.message || 'Local Plumber request failed.'
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function postToLocalPlumber(path: string, payload: unknown, signal?: AbortSignal): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${LOCAL_PLUMBER_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
        signal,
      })

      const data = await response.json()
      return {
        success: response.ok && data?.success !== false,
        status: response.status,
        url: LOCAL_PLUMBER_BASE_URL,
        ...data,
      }
    } catch (error: any) {
      if (attempt === 0) {
        await wait(350)
        continue
      }

      addDiagnostic({
        category: 'ui',
        level: 'error',
        message: 'Local HTTP PLS bridge request failed.',
        details: {
          path,
          url: LOCAL_PLUMBER_BASE_URL,
          error: normalizeFetchError(error),
        },
      })

      return {
        success: false,
        status: 0,
        url: LOCAL_PLUMBER_BASE_URL,
        error: normalizeFetchError(error),
      }
    }
  }

  return {
    success: false,
    status: 0,
    url: LOCAL_PLUMBER_BASE_URL,
    error: `Cannot reach local PLS backend at ${LOCAL_PLUMBER_BASE_URL}.`,
  }
}

export async function runPlsModel(payload: RunPlsRequest): Promise<RunPlsResponse> {
  const api = (window as any).electronAPI
  if (api?.runPls) {
    return api.runPls(payload)
  }

  const availableKeys = api ? Object.keys(api).join(', ') : 'none'
  if (isElectronRuntime()) {
    console.error('[plsApi] PLS bridge unavailable in Electron runtime. Available keys:', availableKeys)
    return bridgeMissingPlsResponse('runPls', availableKeys)
  }

  console.warn('[plsApi] PLS bridge unavailable; falling back to local HTTP. Available keys:', availableKeys)
  addDiagnostic({
    category: 'ui',
    level: 'warn',
    message: 'Falling back to the local HTTP PLS bridge for runPls.',
    details: {
      availableKeys,
      url: LOCAL_PLUMBER_BASE_URL,
    },
  })
  return postToLocalPlumber('/run-pls', payload)
}

export async function runBootstrapModel(payload: RunBootstrapRequest): Promise<GenericAnalysisResponse> {
  const api = (window as any).electronAPI
  if (api?.runBootstrap) {
    return window.electronAPI.runBootstrap(payload)
  }

  const availableKeys = api ? Object.keys(api).join(', ') : 'none'
  if (isElectronRuntime()) {
    console.error('[plsApi] Bootstrap bridge unavailable in Electron runtime. Available keys:', availableKeys)
    return bridgeMissingResponse('runBootstrap', availableKeys)
  }

  console.warn('[plsApi] Bootstrap bridge unavailable; falling back to local HTTP.')
  addDiagnostic({
    category: 'ui',
    level: 'warn',
    message: 'Falling back to the local HTTP PLS bridge for runBootstrap.',
    details: {
      availableKeys,
      url: LOCAL_PLUMBER_BASE_URL,
    },
  })
  return postToLocalPlumber('/run-bootstrap', payload)
}

export async function runPlsPredictModel(payload: RunPlsPredictRequest): Promise<GenericAnalysisResponse> {
  const api = (window as any).electronAPI
  if (api?.runPlsPredict) {
    return window.electronAPI.runPlsPredict(payload)
  }

  const availableKeys = api ? Object.keys(api).join(', ') : 'none'
  if (isElectronRuntime()) {
    console.error('[plsApi] PLS Predict bridge unavailable in Electron runtime. Available keys:', availableKeys)
    return bridgeMissingResponse('runPlsPredict', availableKeys)
  }

  console.warn('[plsApi] PLS Predict bridge unavailable; falling back to local HTTP.')
  addDiagnostic({
    category: 'ui',
    level: 'warn',
    message: 'Falling back to the local HTTP PLS bridge for runPlsPredict.',
    details: {
      availableKeys,
      url: LOCAL_PLUMBER_BASE_URL,
    },
  })
  return postToLocalPlumber('/run-plspredict', payload)
}

export async function runAdvancedAnalysisModel(payload: RunAdvancedAnalysisRequest): Promise<GenericAnalysisResponse> {
  const api = (window as any).electronAPI
  if (api?.runAdvancedAnalysis) {
    return window.electronAPI.runAdvancedAnalysis(payload)
  }

  const availableKeys = api ? Object.keys(api).join(', ') : 'none'
  if (isElectronRuntime()) {
    console.error('[plsApi] Advanced analysis bridge unavailable in Electron runtime. Available keys:', availableKeys)
    return bridgeMissingResponse('runAdvancedAnalysis', availableKeys)
  }

  console.warn('[plsApi] Advanced analysis bridge unavailable; falling back to local HTTP.')
  addDiagnostic({
    category: 'ui',
    level: 'warn',
    message: 'Falling back to the local HTTP PLS bridge for runAdvancedAnalysis.',
    details: {
      availableKeys,
      url: LOCAL_PLUMBER_BASE_URL,
    },
  })
  return postToLocalPlumber('/run-advanced-analysis', payload)
}
