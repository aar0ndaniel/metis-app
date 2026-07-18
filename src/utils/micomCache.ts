import type { GenericAnalysisResponse, RunPermutationAnalysisRequest } from '../services/plsApi'
import { buildAnalysisGraphSignature } from './analysisGraphSignature'

type JsonRecord = Record<string, unknown>

export type MicomCacheCoverage = 'step1' | 'full'

export interface MicomCacheEntry {
  version: 1
  coverage: MicomCacheCoverage
  signature: string
  savedAt: string
  groups: {
    groupingVariable: string
    groupA: string
    groupB: string
  }
  settings: {
    permutations: number
    alpha: number
    seed: number
  }
  results: {
    configuralInvariance: unknown
    compositionalInvariance: Array<JsonRecord>
    equalityAssessment: Array<JsonRecord>
    invarianceClassification: Array<JsonRecord>
    raw: JsonRecord
  }
}

export interface MicomOverviewForMga {
  status: 'full' | 'partial' | 'not-run'
  message: string
  source: 'cached-micom' | 'not-run'
}

export const MICOM_MGA_NOT_RUN_MESSAGE = 'MICOM was not run for this analysis. Interpret results well.'

export const MICOM_MGA_NOT_RUN_OVERVIEW: MicomOverviewForMga = Object.freeze({
  status: 'not-run',
  message: MICOM_MGA_NOT_RUN_MESSAGE,
  source: 'not-run',
})

function normalizeToken(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeDatasetPath(value: unknown): string {
  return normalizeToken(value).replace(/\\/g, '/')
}

function normalizeMetricKey(value: unknown): string {
  return normalizeToken(value).replace(/[^a-z0-9]+/gi, '').toLowerCase()
}

function rowsFromUnknown(value: unknown): Array<JsonRecord> {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.filter((row): row is JsonRecord => Boolean(row && typeof row === 'object' && !Array.isArray(row)))
  }
  if (typeof value === 'object' && !Array.isArray(value)) return [value as JsonRecord]
  return []
}

function getOwnValue(obj: unknown, candidates: string[]): unknown {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined
  const candidateSet = new Set(candidates.map(normalizeMetricKey))
  for (const [key, value] of Object.entries(obj as JsonRecord)) {
    if (candidateSet.has(normalizeMetricKey(key))) return value
  }
  return undefined
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  }
  if (value && typeof value === 'object') {
    const normalized: JsonRecord = {}
    Object.keys(value as JsonRecord)
      .sort((left, right) => left.localeCompare(right))
      .forEach((key) => {
        normalized[key] = canonicalize((value as JsonRecord)[key])
      })
    return normalized
  }
  return value
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function extractConfiguralInvariance(results: unknown): unknown {
  if (!results || typeof results !== 'object') return null
  const raw = results as JsonRecord
  const direct = raw.configuralInvariance ?? raw.configural_invariance
  if (direct) return direct
  if (getOwnValue(raw, ['checks', 'rows', 'step1'])) return raw
  const step1 = raw.step1 ?? raw.Step1
  if (step1) return { checks: rowsFromUnknown(step1) }
  return null
}

function extractConfiguralChecks(results: unknown): Array<JsonRecord> {
  const configural = extractConfiguralInvariance(results)
  if (!configural || typeof configural !== 'object') return []
  const checks = getOwnValue(configural, ['checks', 'rows', 'step1'])
  return rowsFromUnknown(checks)
}

function extractRows(results: unknown, candidates: string[]): Array<JsonRecord> {
  if (!results || typeof results !== 'object') return []
  return rowsFromUnknown(getOwnValue(results, candidates))
}

function hasRows(rows: Array<JsonRecord>): boolean {
  return rows.length > 0
}

function readClassificationText(cache: MicomCacheEntry): string {
  return cache.results.invarianceClassification
    .map((row) => Object.values(row).map((value) => normalizeToken(value)).join(' '))
    .join(' ')
    .toLowerCase()
}

export function buildMicomCacheSignature(payload: RunPermutationAnalysisRequest, graphSignature?: string): string {
  return stableStringify({
    datasetPath: normalizeDatasetPath(payload.datasetPath),
    graphSignature: graphSignature || buildAnalysisGraphSignature({
      constructs: payload.constructs,
      paths: payload.paths,
    }),
    interactions: payload.interactions ?? [],
    algorithm: normalizeToken(payload.algorithm || 'standard').toLowerCase(),
    groupingVariable: normalizeToken(payload.groupingVariable),
    groupA: normalizeToken(payload.groupA),
    groupB: normalizeToken(payload.groupB),
  })
}

export function createMicomCacheEntry({
  payload,
  results,
  graphSignature,
  savedAt = new Date().toISOString(),
}: {
  payload: RunPermutationAnalysisRequest
  results: JsonRecord
  graphSignature?: string
  savedAt?: string
}): MicomCacheEntry {
  const compositionalInvariance = extractRows(results, ['compositionalInvariance', 'compositional_invariance', 'step2'])
  const equalityAssessment = extractRows(results, ['equalityAssessment', 'equality_assessment', 'step3'])
  const invarianceClassification = extractRows(results, ['invarianceClassification', 'invariance_classification'])

  return {
    version: 1,
    coverage: hasRows(compositionalInvariance) || hasRows(equalityAssessment) || hasRows(invarianceClassification) ? 'full' : 'step1',
    signature: buildMicomCacheSignature(payload, graphSignature),
    savedAt,
    groups: {
      groupingVariable: normalizeToken(payload.groupingVariable),
      groupA: normalizeToken(payload.groupA),
      groupB: normalizeToken(payload.groupB),
    },
    settings: {
      permutations: payload.permutations,
      alpha: payload.alpha,
      seed: payload.seed,
    },
    results: {
      configuralInvariance: extractConfiguralInvariance(results),
      compositionalInvariance,
      equalityAssessment,
      invarianceClassification,
      raw: results,
    },
  }
}

export function buildMicomOverviewFromCache(cache: MicomCacheEntry | null | undefined): MicomOverviewForMga {
  if (!cache) return MICOM_MGA_NOT_RUN_OVERVIEW

  if (cache.coverage !== 'full') {
    return {
      status: 'partial',
      message: 'Partial measurement invariance available from cached MICOM.',
      source: 'cached-micom',
    }
  }

  const classificationText = readClassificationText(cache)
  if (classificationText.includes('partial')) {
    return {
      status: 'partial',
      message: 'Partial measurement invariance available from cached MICOM.',
      source: 'cached-micom',
    }
  }

  if (classificationText.includes('full')) {
    return {
      status: 'full',
      message: 'Full measurement invariance available from cached MICOM.',
      source: 'cached-micom',
    }
  }

  return {
    status: 'full',
    message: 'Full MICOM results available from cached MICOM.',
    source: 'cached-micom',
  }
}

export function doesCachedMicomMatchCurrentStep1(
  cache: MicomCacheEntry | null | undefined,
  currentStep1Results: unknown,
  payload: RunPermutationAnalysisRequest,
  graphSignature?: string,
): boolean {
  if (!cache || cache.signature !== buildMicomCacheSignature(payload, graphSignature)) return false
  const cachedChecks = extractConfiguralChecks(cache.results.configuralInvariance)
  const currentChecks = extractConfiguralChecks(currentStep1Results)
  if (!cachedChecks.length || !currentChecks.length) return false
  return stableStringify(cachedChecks) === stableStringify(currentChecks)
}

export async function resolveMicomOverviewForMgaCache({
  cache,
  payload,
  graphSignature,
  runConfiguralPrecheck,
}: {
  cache: MicomCacheEntry | null | undefined
  payload: RunPermutationAnalysisRequest
  graphSignature?: string
  runConfiguralPrecheck: (payload: RunPermutationAnalysisRequest) => Promise<GenericAnalysisResponse>
}): Promise<MicomOverviewForMga> {
  if (!cache || cache.signature !== buildMicomCacheSignature(payload, graphSignature)) {
    return MICOM_MGA_NOT_RUN_OVERVIEW
  }

  try {
    const currentStep1 = await runConfiguralPrecheck(payload)
    if (!currentStep1?.success || !currentStep1.results) return MICOM_MGA_NOT_RUN_OVERVIEW
    return doesCachedMicomMatchCurrentStep1(cache, currentStep1.results, payload, graphSignature)
      ? buildMicomOverviewFromCache(cache)
      : MICOM_MGA_NOT_RUN_OVERVIEW
  } catch {
    return MICOM_MGA_NOT_RUN_OVERVIEW
  }
}

export function attachMicomOverviewToMgaResults<T extends JsonRecord>(
  results: T,
  overview: MicomOverviewForMga,
): T & { micomOverview: MicomOverviewForMga; overview: JsonRecord & { setup: Array<JsonRecord> } } {
  const existingOverview = (
    results.overview && typeof results.overview === 'object' && !Array.isArray(results.overview)
      ? results.overview
      : {}
  ) as JsonRecord
  const setupRows = rowsFromUnknown(existingOverview.setup)
  let replacedMicomRow = false
  const nextSetup = setupRows.map((row) => {
    if (normalizeMetricKey(row.Metric) !== 'micom') return row
    replacedMicomRow = true
    return { ...row, Value: overview.message }
  })

  if (!replacedMicomRow) {
    nextSetup.push({ Metric: 'MICOM', Value: overview.message })
  }

  return {
    ...results,
    micomOverview: overview,
    overview: {
      ...existingOverview,
      setup: nextSetup,
    },
  }
}

export function putMicomCacheInWorkspaceList<TWorkspace extends JsonRecord>(
  workspaces: TWorkspace[],
  workspaceId: string | null | undefined,
  modelId: string | null | undefined,
  cache: MicomCacheEntry,
): { workspaces: TWorkspace[]; workspace: TWorkspace | null } {
  if (!workspaceId || !modelId) return { workspaces, workspace: null }

  const nextWorkspaces = workspaces.map((workspace) => {
    if (workspace.id !== workspaceId || !Array.isArray(workspace.children)) return workspace
    return {
      ...workspace,
      children: workspace.children.map((child: unknown) => {
        if (!child || typeof child !== 'object' || (child as JsonRecord).id !== modelId) return child
        const state = ((child as JsonRecord).state && typeof (child as JsonRecord).state === 'object')
          ? (child as JsonRecord).state as JsonRecord
          : {}
        return {
          ...(child as JsonRecord),
          updatedAt: new Date().toISOString(),
          state: {
            ...state,
            micomCache: cache,
          },
        }
      }),
    } as TWorkspace
  })

  return {
    workspaces: nextWorkspaces,
    workspace: nextWorkspaces.find((workspace) => workspace.id === workspaceId) ?? null,
  }
}
