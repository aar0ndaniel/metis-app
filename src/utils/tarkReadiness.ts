type CoreRequiredMode = 'pls-sem' | 'bootstrap' | 'plspredict'
type AdvancedRequiredMode = 'advanced'
export type RequiredMode = CoreRequiredMode | AdvancedRequiredMode

export interface ModelReadiness {
  ready: boolean
  saved: RequiredMode[]
  missing: RequiredMode[]
}

interface ReadinessOptions {
  includeAdvancedAnalysis?: boolean
}

interface WorkspaceResultLike {
  name?: unknown
  meta?: unknown
  linkedModelId?: unknown
  state?: {
    analysis?: {
      mode?: unknown
    }
  }
}

const REQUIRED_RESULTS: Array<{ mode: CoreRequiredMode; label: string }> = [
  { mode: 'pls-sem', label: 'PLS-SEM' },
  { mode: 'bootstrap', label: 'Bootstrap' },
  { mode: 'plspredict', label: 'PLSpredict' },
]

const ADVANCED_ANALYSIS_RESULT: { mode: AdvancedRequiredMode; label: string } = {
  mode: 'advanced',
  label: 'Advanced analysis',
}

function getRequiredResults(options: ReadinessOptions = {}): Array<{ mode: RequiredMode; label: string }> {
  return options.includeAdvancedAnalysis
    ? [...REQUIRED_RESULTS, ADVANCED_ANALYSIS_RESULT]
    : REQUIRED_RESULTS
}

export function normalizeResultMode(value: unknown): RequiredMode | null {
  const text = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (!text) return null
  if (text.includes('advanced') || text === 'ipma' || text === 'nca' || text.includes('cipma')) return 'advanced'
  if (text.includes('bootstrap')) return 'bootstrap'
  if (text.includes('plspredict') || text.includes('plsprediction') || text.includes('plspredictive')) return 'plspredict'
  if (text.includes('plssem') || text === 'pls' || text.includes('partialleastsquares')) return 'pls-sem'
  return null
}

function getResultMode(result: WorkspaceResultLike): RequiredMode | null {
  return (
    normalizeResultMode(result.state?.analysis?.mode)
    ?? normalizeResultMode(result.meta)
    ?? normalizeResultMode(result.name)
  )
}

export function getModelReadiness(modelId: string, results: WorkspaceResultLike[], options: ReadinessOptions = {}): ModelReadiness {
  const saved = new Set<RequiredMode>()
  const requiredResults = getRequiredResults(options)
  results.forEach((result) => {
    if (result.linkedModelId !== modelId) return
    const mode = getResultMode(result)
    if (mode) saved.add(mode)
  })

  const savedModes = requiredResults
    .map((item) => item.mode)
    .filter((mode) => saved.has(mode))
  const missing = requiredResults
    .map((item) => item.mode)
    .filter((mode) => !saved.has(mode))

  return {
    ready: missing.length === 0,
    saved: savedModes,
    missing,
  }
}

export function getMissingLabel(readiness: ModelReadiness): string {
  if (readiness.ready) return 'Ready'
  const labels = [...REQUIRED_RESULTS, ADVANCED_ANALYSIS_RESULT]
  return readiness.missing
    .map((mode) => labels.find((item) => item.mode === mode)?.label ?? mode)
    .join(', ')
}
