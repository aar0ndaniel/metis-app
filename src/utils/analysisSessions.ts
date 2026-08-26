import { TEMPORARY_MODEL_PREFIX } from './temporaryModels.ts'

export type SessionAnalysisMode = 'pls-sem' | 'bootstrap' | 'plspredict' | 'advanced' | 'permutation' | 'mga'

export interface AnalysisSession {
  mode?: SessionAnalysisMode
  results?: Record<string, unknown> | null
  savedAt?: string
  linkedDatasetId?: string
  modelSnapshot?: { constructs: any[]; paths: any[] } | null
  diagramBaseResults?: Record<string, unknown> | null
  basePlsAnalysis?: {
    results: Record<string, unknown>
    savedAt: string
    graphSignature?: string
  } | null
  analysisSettings?: Record<string, unknown>
  micomCache?: unknown
}

const analysisSessionRegistry = new Map<string, AnalysisSession>()

export function getAnalysisSession(modelId: string | null | undefined): AnalysisSession | undefined {
  if (!modelId) return undefined
  return analysisSessionRegistry.get(modelId)
}

export function setAnalysisSession(modelId: string, session: AnalysisSession): AnalysisSession {
  analysisSessionRegistry.set(modelId, session)
  return session
}

export function updateAnalysisSession(
  modelId: string,
  updater: (previous: AnalysisSession) => AnalysisSession,
): AnalysisSession {
  const updated = updater(analysisSessionRegistry.get(modelId) ?? {})
  analysisSessionRegistry.set(modelId, updated)
  return updated
}

export function deleteAnalysisSession(modelId: string): boolean {
  return analysisSessionRegistry.delete(modelId)
}

export function clearTemporaryAnalysisSessions(): void {
  for (const modelId of analysisSessionRegistry.keys()) {
    if (modelId.startsWith(TEMPORARY_MODEL_PREFIX)) {
      analysisSessionRegistry.delete(modelId)
    }
  }
}

export function clearAllAnalysisSessions(): void {
  analysisSessionRegistry.clear()
}
