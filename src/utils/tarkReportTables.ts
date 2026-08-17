export interface TarkReportTableRequest {
  tableLabelMode: 'full' | 'short'
  constructLabels: Record<string, string>
  includeAdvancedAnalysis?: boolean
}

export interface TarkSavedAnalysis {
  mode: string
  results: Record<string, unknown>
}

export interface TarkReportSection {
  title: string
  headers: string[]
  rows: string[][]
  note?: string
}

interface CanvasIndicatorLike {
  name?: unknown
  loading?: unknown
}

interface CanvasConstructLike {
  id?: unknown
  name?: unknown
  type?: unknown
  indicators?: Array<string | CanvasIndicatorLike>
}

interface CanvasPathLike {
  from?: unknown
  to?: unknown
}

export interface TarkSavedModelLike {
  constructs?: CanvasConstructLike[]
  paths?: CanvasPathLike[]
}

export interface TarkDiagramResults {
  constructScores: Record<string, Record<string, number>>
  pathResults: Record<string, Record<string, number>>
  measurementResults: Record<string, { loading?: number; weight?: number }>
}

export const TARK_USER_FILL_CELL = '\u200B'

const OMITTED_TABLE_KEYS = new Set([
  'method',
  'row',
  'row_name',
  'rowname',
  'key',
  'construct',
  'indicator',
  'path',
  'relationship',
  'metric',
  'name',
  'label',
])

const SCALAR_VALUE_KEYS = [
  'value',
  'estimate',
  'coefficient',
  'original est.',
  'original estimate',
  'original sample',
  'original sample (o)',
  'sample mean (m)',
  'bootstrap mean',
  'mean',
  'standard deviation (stdev)',
  'bootstrap sd',
  'stdev',
  't stat.',
  't statistic',
  't statistics (|o/stdev|)',
  'p value',
  'p values',
]

const RELIABILITY_VALUE_CANDIDATES = {
  cronbach: ["Cronbach's alpha", 'cronbach_alpha', 'alpha', 'Cronbach alpha', 'cronbach'],
  rhoA: ['rho_A', 'rhoA', 'rhoa', 'rho_a', 'rho a'],
  cr: ['Composite reliability', 'composite_reliability', 'rho_c', 'rho_C', 'rhoC', 'rhoc', 'CR'],
  ave: ['AVE', 'ave', 'Average variance extracted', 'average_variance_extracted'],
} as const

type ReliabilityMetricKey = keyof typeof RELIABILITY_VALUE_CANDIDATES

function normalizeMetricKey(key: string): string {
  return String(key ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function isOmittedKey(key: string): boolean {
  return OMITTED_TABLE_KEYS.has(normalizeMetricKey(key))
}

function toRows(data: unknown): Array<Record<string, unknown>> {
  if (!data) return []
  if (Array.isArray(data)) {
    return data.flatMap((row, index) => {
      if (row && typeof row === 'object' && !Array.isArray(row)) return [row as Record<string, unknown>]
      return [{ row: index + 1, value: row }]
    })
  }
  if (typeof data === 'object') {
    const record = data as Record<string, unknown>
    const entries = Object.entries(record)
    if (!entries.length) return []
    if (entries.every(([, value]) => !value || typeof value !== 'object' || Array.isArray(value))) {
      return [record]
    }
    return entries.map(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { row: key, ...(value as Record<string, unknown>) }
      }
      return { row: key, value }
    })
  }
  return [{ value: data }]
}

function readValue(row: Record<string, unknown>, candidates: string[]): unknown {
  const normalizedCandidates = new Set(candidates.map(normalizeMetricKey))
  for (const [key, value] of Object.entries(row)) {
    if (normalizedCandidates.has(normalizeMetricKey(key))) return value
  }
  return undefined
}

function orderedScalarEntries(record: Record<string, unknown>): Array<[string, unknown]> {
  const entries = Object.entries(record)
  const preferredKeys = new Set(SCALAR_VALUE_KEYS.map(normalizeMetricKey))
  const preferred = entries.filter(([key]) => preferredKeys.has(normalizeMetricKey(key)))
  const rest = entries.filter(([key]) => !preferredKeys.has(normalizeMetricKey(key)))
  return [...preferred, ...rest]
}

function toNumber(value: unknown, depth = 0): number | null {
  if (depth > 6) return null
  if (value == null) return null
  if (typeof value === 'string' && !value.trim()) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const numeric = toNumber(item, depth + 1)
      if (numeric != null) return numeric
    }
    return null
  }
  if (typeof value === 'object') {
    for (const [, entryValue] of orderedScalarEntries(value as Record<string, unknown>)) {
      const numeric = toNumber(entryValue, depth + 1)
      if (numeric != null) return numeric
    }
  }
  return null
}

function readScalar(value: unknown, depth = 0): string | number | null {
  if (depth > 6 || value == null) return null
  const numeric = toNumber(value, depth)
  if (numeric != null) return numeric
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const scalar = readScalar(item, depth + 1)
      if (scalar != null) return scalar
    }
    return null
  }
  if (typeof value === 'object') {
    for (const [, entryValue] of orderedScalarEntries(value as Record<string, unknown>)) {
      const scalar = readScalar(entryValue, depth + 1)
      if (scalar != null) return scalar
    }
  }
  return null
}

function formatCell(value: unknown): string {
  const numeric = toNumber(value)
  if (numeric != null) return numeric.toFixed(3)
  const scalar = readScalar(value)
  if (scalar == null) return '—'
  if (typeof scalar === 'string' && !scalar.trim()) return '—'
  return String(scalar)
}

function readLabel(row: Record<string, unknown>, fallback = ''): string {
  const value = readValue(row, ['Construct', 'Indicator', 'Path', 'Relationship', 'row_name', 'row', 'Metric', 'key', 'Name', 'label'])
  return String(readScalar(value) ?? fallback).trim()
}

function mapConstructLabel(request: TarkReportTableRequest, value: string): string {
  if (request.tableLabelMode === 'short') return value
  return request.constructLabels[value] || value
}

function modelNameMaps(savedModel?: TarkSavedModelLike | null) {
  const nameById = new Map<string, string>()
  const idByName = new Map<string, string>()
  ;(savedModel?.constructs ?? []).forEach((construct) => {
    const id = String(construct.id ?? '').trim()
    const name = String(construct.name ?? id).trim()
    if (!name) return
    if (id) nameById.set(id, name)
    if (id) idByName.set(name, id)
  })
  return { nameById, idByName }
}

function resolveConstructName(value: unknown, savedModel?: TarkSavedModelLike | null): string {
  const raw = String(value ?? '').trim()
  if (!raw) return raw
  const { nameById } = modelNameMaps(savedModel)
  return nameById.get(raw) ?? raw
}

function buildIndicatorConstructLookup(savedModel?: TarkSavedModelLike | null): Map<string, string> {
  const lookup = new Map<string, string>()
  ;(savedModel?.constructs ?? []).forEach((construct, index) => {
    const constructName = String(construct.name ?? construct.id ?? `Construct ${index + 1}`).trim()
    ;(construct.indicators ?? []).forEach((indicator) => {
      const indicatorName = typeof indicator === 'string'
        ? indicator
        : String(indicator?.name ?? '').trim()
      if (indicatorName && constructName) lookup.set(indicatorName, constructName)
    })
  })
  return lookup
}

function buildConstructIndicatorOptions(savedModel?: TarkSavedModelLike | null): Map<string, string[]> {
  const lookup = new Map<string, string[]>()
  ;(savedModel?.constructs ?? []).forEach((construct, index) => {
    const indicators = (construct.indicators ?? [])
      .map((indicator) => typeof indicator === 'string' ? indicator : String(indicator?.name ?? '').trim())
      .filter(Boolean)
    if (!indicators.length) return

    const id = String(construct.id ?? '').trim()
    const name = String(construct.name ?? id).trim()
    ;[id, name, String(index), `v${index + 1}`]
      .filter(Boolean)
      .forEach((key) => lookup.set(normalizeMetricKey(key), indicators))
  })
  return lookup
}

function normalizeIndexedLabel(value: unknown, candidates: string[], numericBase: 0 | 1 = 1): string {
  const raw = String(value ?? '').trim()
  if (!raw) return raw
  if (/^\d+$/.test(raw)) {
    const candidateIndex = Number(raw) - numericBase
    return candidateIndex >= 0 ? candidates[candidateIndex] ?? raw : raw
  }
  const vMatch = raw.match(/^v(\d+)$/i)
  if (vMatch) return candidates[Math.max(Number(vMatch[1]) - 1, 0)] ?? raw
  return raw
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length
  if (!n || matrix.length !== n || matrix.some((row) => row.length !== n)) return null
  const augmented = matrix.map((row, index) => [...row, vector[index]])

  for (let column = 0; column < n; column += 1) {
    let pivotRow = column
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) pivotRow = row
    }

    if (Math.abs(augmented[pivotRow][column]) < 1e-10) return null
    if (pivotRow !== column) {
      const temp = augmented[column]
      augmented[column] = augmented[pivotRow]
      augmented[pivotRow] = temp
    }

    const pivot = augmented[column][column]
    for (let col = column; col <= n; col += 1) augmented[column][col] /= pivot

    for (let row = 0; row < n; row += 1) {
      if (row === column) continue
      const factor = augmented[row][column]
      for (let col = column; col <= n; col += 1) {
        augmented[row][col] -= factor * augmented[column][col]
      }
    }
  }

  return augmented.map((row) => row[n])
}

function buildCorrelationLookup(rows: Array<Record<string, unknown>>): (left: string, right: string) => number | null {
  const rowMap = new Map<string, Record<string, unknown>>()
  rows.forEach((row, index) => {
    const label = readLabel(row, `row-${index}`)
    if (label) rowMap.set(normalizeMetricKey(label), row)
  })

  return (left: string, right: string) => {
    if (normalizeMetricKey(left) === normalizeMetricKey(right)) return 1
    const leftRow = rowMap.get(normalizeMetricKey(left))
    const rightRow = rowMap.get(normalizeMetricKey(right))
    const leftValue = leftRow ? toNumber(readValue(leftRow, [right])) : null
    if (leftValue != null) return leftValue
    return rightRow ? toNumber(readValue(rightRow, [left])) : null
  }
}

function computeVifFromCorrelations(target: string, predictors: string[], correlation: (left: string, right: string) => number | null): number | null {
  if (!predictors.length) return 1
  const targetCorrelations = predictors.map((predictor) => correlation(target, predictor))
  if (targetCorrelations.some((value) => value == null)) return null
  if (predictors.length === 1) {
    const r = targetCorrelations[0] ?? 0
    const rSquared = Math.max(0, Math.min(0.999999, r * r))
    return 1 / (1 - rSquared)
  }

  const predictorMatrix = predictors.map((left) => predictors.map((right) => correlation(left, right)))
  if (predictorMatrix.some((row) => row.some((value) => value == null))) return null
  const predictorMatrixNumeric = predictorMatrix.map((row) => row.map((value) => value ?? 0))
  const targetVector = targetCorrelations.map((value) => value ?? 0)
  const solution = solveLinearSystem(predictorMatrixNumeric, targetVector)
  if (!solution) return null
  const rSquared = targetVector.reduce((sum, value, index) => sum + value * solution[index], 0)
  const clamped = Math.max(0, Math.min(0.999999, rSquared))
  return 1 / (1 - clamped)
}

function buildCorrelationVifLookup(pls: Record<string, unknown> | undefined, savedModel?: TarkSavedModelLike | null): Map<string, number> {
  const rows = toRows(
    (pls as any)?.model_and_data?.indicator_data_correlations
      ?? (pls as any)?.quality_criteria?.indicator_data_correlations
      ?? (pls as any)?.quality_criteria?.indicator_correlations,
  )
  const lookup = new Map<string, number>()
  if (!rows.length || !savedModel?.constructs?.length) return lookup

  const correlation = buildCorrelationLookup(rows)
  savedModel.constructs.forEach((construct, constructIndex) => {
    const constructName = String(construct.name ?? construct.id ?? `Construct ${constructIndex + 1}`).trim()
    const indicators = (construct.indicators ?? [])
      .map((indicator) => typeof indicator === 'string' ? indicator : String(indicator?.name ?? '').trim())
      .filter(Boolean)
    indicators.forEach((indicator) => {
      const predictors = indicators.filter((candidate) => candidate !== indicator)
      const vif = computeVifFromCorrelations(indicator, predictors, correlation)
      if (vif != null && Number.isFinite(vif)) lookup.set(pathKey(constructName, indicator), vif)
    })
  })
  return lookup
}

function splitPathLabel(label: string): { from: string; to: string } | null {
  const match = String(label ?? '').match(/(.+?)\s*(?:->|→|~>|=>)\s*(.+)/)
  if (!match) return null
  const from = String(match[1] ?? '').trim()
  const to = String(match[2] ?? '').trim()
  return from && to ? { from, to } : null
}

function pathKey(from: string, to: string): string {
  return `${normalizeMetricKey(from)}\u0000${normalizeMetricKey(to)}`
}

function getPathParts(row: Record<string, unknown>, savedModel?: TarkSavedModelLike | null, fallback = ''): { from: string; to: string; label: string } {
  const directFrom = readValue(row, ['from', 'source', 'predictor', 'From'])
  const directTo = readValue(row, ['to', 'target', 'outcome', 'endogenous', 'To'])
  const from = resolveConstructName(directFrom, savedModel)
  const to = resolveConstructName(directTo, savedModel)
  if (from && to) return { from, to, label: `${from} → ${to}` }

  const rawLabel = readLabel(row, fallback)
  const split = splitPathLabel(rawLabel)
  if (!split) return { from: '', to: '', label: rawLabel.replace(/\s*->\s*/g, ' → ') }
  return {
    from: resolveConstructName(split.from, savedModel),
    to: resolveConstructName(split.to, savedModel),
    label: `${resolveConstructName(split.from, savedModel)} → ${resolveConstructName(split.to, savedModel)}`,
  }
}

function formatMappedPath(request: TarkReportTableRequest, from: string, to: string, fallback: string): string {
  if (!from || !to) return fallback.replace(/\s*->\s*/g, ' → ')
  return `${mapConstructLabel(request, from)} → ${mapConstructLabel(request, to)}`
}

function readNumeric(row: Record<string, unknown>, candidates: string[]): number | null {
  return toNumber(readValue(row, candidates))
}

function readPValue(row: Record<string, unknown>): number | string | null {
  const value = readValue(row, [
    'Bootstrap P Val',
    'Bootstrap.P.Val',
    'Bootstrap P Value',
    'Bootstrap.P.Value',
    'P Value',
    'P.Value',
    'P values',
    'P value',
    'P-values',
    'P-value',
    'p_value',
    'pvalue',
    'p',
  ])
  if (value == null || (typeof value === 'string' && !value.trim())) return null
  return toNumber(value) ?? readScalar(value)
}

function parsePValue(value: unknown): number | null {
  if (value == null) return null
  const text = String(readScalar(value) ?? value).trim()
  if (!text) return null
  const lessThanMatch = text.match(/^<\s*(\d*\.?\d+)$/)
  if (lessThanMatch) {
    const numeric = Number(lessThanMatch[1])
    return Number.isFinite(numeric) ? numeric : null
  }
  return toNumber(value)
}

function formatPValueCell(value: unknown): string {
  const numeric = parsePValue(value)
  if (numeric == null) return formatCell(value)
  if (numeric < 0.001) return '<.001'
  return numeric.toFixed(3)
}

function approximateTwoTailedPValueFromT(tStatistic: unknown): number | null {
  const t = Math.abs(toNumber(tStatistic) ?? Number.NaN)
  if (!Number.isFinite(t)) return null

  const erf = (x: number): number => {
    const sign = x < 0 ? -1 : 1
    const ax = Math.abs(x)
    const a1 = 0.254829592
    const a2 = -0.284496736
    const a3 = 1.421413741
    const a4 = -1.453152027
    const a5 = 1.061405429
    const p = 0.3275911
    const tVal = 1 / (1 + p * ax)
    const y = 1 - (((((a5 * tVal + a4) * tVal) + a3) * tVal + a2) * tVal + a1) * tVal * Math.exp(-ax * ax)
    return sign * y
  }

  const normalCdf = (value: number) => 0.5 * (1 + erf(value / Math.SQRT2))
  const pValue = 2 * (1 - normalCdf(t))
  return Math.min(1, Math.max(0, pValue))
}

function readLowerCi(row: Record<string, unknown>): number | null {
  return readNumeric(row, [
    '2.5% CI',
    '2.5%.CI',
    'X2.5..CI',
    'CI 2.5%',
    'CI 2.5',
    'Lower CI',
    'lower',
    'ci25',
    'ci_25',
  ])
}

function readUpperCi(row: Record<string, unknown>): number | null {
  return readNumeric(row, [
    '97.5% CI',
    '97.5%.CI',
    'X97.5..CI',
    'CI 97.5%',
    'CI 97.5',
    'Upper CI',
    'upper',
    'ci975',
    'ci_975',
  ])
}

function formatCi(row: Record<string, unknown>): string {
  const lower = readLowerCi(row)
  const upper = readUpperCi(row)
  if (lower == null && upper == null) return '—'
  return `[${formatCell(lower)}, ${formatCell(upper)}]`
}

function effectSizeLabel(value: number | null): string {
  if (value == null) return '—'
  if (value >= 0.35) return 'Large'
  if (value >= 0.15) return 'Medium'
  if (value >= 0.02) return 'Small'
  return 'None'
}

function buildReliabilityLookup(
  pls: Record<string, unknown> | undefined,
  savedModel?: TarkSavedModelLike | null,
): Map<string, Record<string, string>> {
  const lookup = new Map<string, Record<string, string>>()
  forEachReliabilityValue(pls, savedModel, (construct, metric, value) => {
    if (!construct) return
    const current = lookup.get(construct) ?? {}
    current[metric] = formatCell(value)
    lookup.set(construct, current)
  })
  return lookup
}

function reliabilityMetricFromLabel(label: unknown): ReliabilityMetricKey | null {
  const normalized = normalizeMetricKey(String(readScalar(label) ?? label ?? ''))
  if (!normalized) return null
  for (const [metric, candidates] of Object.entries(RELIABILITY_VALUE_CANDIDATES) as Array<[ReliabilityMetricKey, readonly string[]]>) {
    if (candidates.some((candidate) => normalizeMetricKey(candidate) === normalized)) return metric
  }
  return null
}

function forEachReliabilityValue(
  pls: Record<string, unknown> | undefined,
  savedModel: TarkSavedModelLike | null | undefined,
  callback: (construct: string, metric: ReliabilityMetricKey, value: unknown) => void,
) {
  toRows((pls as any)?.quality_criteria?.reliability).forEach((row, index) => {
    const rowLabel = readLabel(row, `Construct ${index + 1}`)
    const transposedMetric = reliabilityMetricFromLabel(rowLabel)
    if (transposedMetric) {
      Object.entries(row).forEach(([key, value]) => {
        if (isOmittedKey(key) || toNumber(value) == null) return
        callback(resolveConstructName(key, savedModel), transposedMetric, value)
      })
      return
    }

    const construct = resolveConstructName(rowLabel, savedModel)
    if (!construct) return
    ;(Object.entries(RELIABILITY_VALUE_CANDIDATES) as Array<[ReliabilityMetricKey, readonly string[]]>).forEach(([metric, candidates]) => {
      const value = readValue(row, [...candidates])
      if (toNumber(value) == null) return
      callback(construct, metric, value)
    })
  })
}

function inferMeasurementIdentity(row: Record<string, unknown>, indicatorLookup: Map<string, string>): { indicator: string; construct: string } {
  const directIndicator = String(readValue(row, ['indicator', 'Indicator', 'item', 'Item']) ?? '').trim()
  const directConstruct = String(readValue(row, ['construct', 'Construct', 'composite']) ?? '').trim()
  if (directIndicator) return { indicator: directIndicator, construct: indicatorLookup.get(directIndicator) ?? directConstruct }

  const rowLabel = readLabel(row)
  if (!rowLabel) return { indicator: '', construct: directConstruct }
  if (indicatorLookup.has(rowLabel)) return { indicator: rowLabel, construct: indicatorLookup.get(rowLabel) ?? directConstruct }

  const split = rowLabel.split(/\s*(?:->|→|<-|←|~>|=>)\s*/).map((part) => part.trim()).filter(Boolean)
  if (split.length >= 2) {
    const indicator = split.find((part) => indicatorLookup.has(part)) ?? ''
    if (indicator) return { indicator, construct: indicatorLookup.get(indicator) ?? directConstruct }
  }

  return { indicator: rowLabel, construct: directConstruct || indicatorLookup.get(rowLabel) || '' }
}

function parseOuterMetric(
  pls: Record<string, unknown> | undefined,
  savedModel: TarkSavedModelLike | null | undefined,
  resultKey: 'outer_loadings' | 'outer_weights',
  valueCandidates: string[],
): Array<{ construct: string; indicator: string; value: number }> {
  const rows = toRows((pls as any)?.final_results?.[resultKey])
  if (!rows.length) return []
  const indicatorLookup = buildIndicatorConstructLookup(savedModel)
  const parsed: Array<{ construct: string; indicator: string; value: number }> = []
  const hasEstimateRows = rows.some((row) => readValue(row, valueCandidates) != null)

  rows.forEach((row) => {
    const identity = inferMeasurementIdentity(row, indicatorLookup)
    if (!identity.indicator) return

    if (hasEstimateRows) {
      const value = toNumber(readValue(row, valueCandidates))
      if (value == null) return
      parsed.push({ indicator: identity.indicator, construct: identity.construct || 'Unknown', value })
      return
    }

    Object.entries(row).forEach(([key, value]) => {
      if (isOmittedKey(key)) return
      const numericValue = toNumber(value)
      if (numericValue == null || numericValue === 0) return
      parsed.push({ indicator: identity.indicator, construct: resolveConstructName(key, savedModel), value: numericValue })
    })
  })

  return parsed
}

function parseOuterLoadings(pls: Record<string, unknown> | undefined, savedModel?: TarkSavedModelLike | null): Array<{ construct: string; indicator: string; loading: number }> {
  return parseOuterMetric(pls, savedModel, 'outer_loadings', [
    'Original Est.',
    'Original.Est.',
    'Original Estimate',
    'Original sample',
    'Original sample (O)',
    'O',
    'coefficient',
    'estimate',
    'loading',
  ]).map((row) => ({ ...row, loading: row.value }))
}

function parseOuterWeights(pls: Record<string, unknown> | undefined, savedModel?: TarkSavedModelLike | null): Array<{ construct: string; indicator: string; weight: number }> {
  return parseOuterMetric(pls, savedModel, 'outer_weights', [
    'Original Est.',
    'Original.Est.',
    'Original Estimate',
    'Original sample',
    'Original sample (O)',
    'O',
    'coefficient',
    'estimate',
    'weight',
  ]).map((row) => ({ ...row, weight: row.value }))
}

function orderMeasurementRows<T extends { construct: string; indicator: string }>(
  rows: T[],
  savedModel?: TarkSavedModelLike | null,
): T[] {
  if (!savedModel?.constructs?.length) return rows
  const constructOrder = new Map<string, number>()
  const indicatorOrder = new Map<string, number>()
  savedModel.constructs.forEach((construct, constructIndex) => {
    const id = String(construct.id ?? '').trim()
    const name = String(construct.name ?? id).trim()
    ;[id, name].filter(Boolean).forEach((key) => constructOrder.set(normalizeMetricKey(key), constructIndex))
    ;(construct.indicators ?? []).forEach((indicator, indicatorIndex) => {
      const indicatorName = typeof indicator === 'string'
        ? indicator
        : String(indicator?.name ?? '').trim()
      if (indicatorName) indicatorOrder.set(normalizeMetricKey(indicatorName), indicatorIndex)
    })
  })

  return rows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .sort((left, right) => {
      const leftConstruct = constructOrder.get(normalizeMetricKey(left.row.construct)) ?? Number.MAX_SAFE_INTEGER
      const rightConstruct = constructOrder.get(normalizeMetricKey(right.row.construct)) ?? Number.MAX_SAFE_INTEGER
      if (leftConstruct !== rightConstruct) return leftConstruct - rightConstruct
      const leftIndicator = indicatorOrder.get(normalizeMetricKey(left.row.indicator)) ?? Number.MAX_SAFE_INTEGER
      const rightIndicator = indicatorOrder.get(normalizeMetricKey(right.row.indicator)) ?? Number.MAX_SAFE_INTEGER
      if (leftIndicator !== rightIndicator) return leftIndicator - rightIndicator
      return left.originalIndex - right.originalIndex
    })
    .map(({ row }) => row)
}

function buildOuterVifLookup(pls: Record<string, unknown> | undefined, savedModel?: TarkSavedModelLike | null): Map<string, number> {
  const rows = toRows(
    (pls as any)?.quality_criteria?.outer_vif
      ?? (pls as any)?.quality_criteria?.vif_items
      ?? (pls as any)?.quality_criteria?.outer_model_vif,
  )
  const lookup = new Map<string, number>()
  const indicatorLookup = buildIndicatorConstructLookup(savedModel)
  const indicatorOptions = buildConstructIndicatorOptions(savedModel)
  const allIndicators = Array.from(indicatorLookup.keys())

  rows.forEach((row) => {
    const longVif = toNumber(readValue(row, ['vif', 'VIF', 'value']))
    const rowLabel = readLabel(row)
    let indicator = String(readValue(row, ['indicator', 'Indicator', 'item', 'Item', 'predictor']) ?? '').trim()
    let construct = resolveConstructName(readValue(row, ['construct', 'Construct', 'endogenous']), savedModel)
    const identity = inferMeasurementIdentity(row, indicatorLookup)
    if (!indicator && identity.indicator) indicator = identity.indicator
    if (!construct && identity.construct) construct = identity.construct
    if (longVif != null && !indicator && rowLabel && indicatorLookup.has(rowLabel)) {
      indicator = rowLabel
    }
    if (longVif != null && !indicator && /^\d+$/.test(rowLabel)) {
      indicator = normalizeIndexedLabel(rowLabel, allIndicators)
    }
    if (longVif != null && indicator && !construct) {
      construct = indicatorLookup.get(indicator) ?? ''
    }
    if (longVif != null && indicator && construct) {
      lookup.set(pathKey(construct, indicator), longVif)
      return
    }

    const rowConstruct = resolveConstructName(readValue(row, ['row_name', 'row', 'construct', 'Construct', 'endogenous']), savedModel)
    const rowIndicatorCandidates = indicatorOptions.get(normalizeMetricKey(rowConstruct)) ?? allIndicators
    const rowKeys = Object.keys(row).filter((key) => !isOmittedKey(key))
    const numericBase: 0 | 1 = rowKeys.includes('0') ? 0 : 1
    Object.entries(row).forEach(([key, value]) => {
      if (isOmittedKey(key)) return
      const vif = toNumber(value)
      if (vif == null) return
      const indicatorKey = normalizeIndexedLabel(key, rowIndicatorCandidates, numericBase)
      const resolvedConstruct = rowConstruct || indicatorLookup.get(key) || ''
      if (resolvedConstruct) lookup.set(pathKey(resolvedConstruct, indicatorKey), vif)
    })
  })

  buildCorrelationVifLookup(pls, savedModel).forEach((vif, key) => {
    if (!lookup.has(key)) lookup.set(key, vif)
  })

  return lookup
}

function buildFSquareLookup(
  pls: Record<string, unknown> | undefined,
  bootstrap?: Record<string, unknown> | undefined,
  savedModel?: TarkSavedModelLike | null,
  savedAnalyses?: Map<string, TarkSavedAnalysis>,
): Map<string, number> {
  const lookup = new Map<string, number>()
  const setFSquare = (from: string, to: string, value: number) => {
    if (!from || !to || !Number.isFinite(value)) return
    lookup.set(pathKey(from, to), value)
    lookup.set(pathKey(to, from), value)
  }

  const candidateSources = [
    pls,
    bootstrap,
    ...(savedAnalyses ? Array.from(savedAnalyses.values()).map((s) => s.results) : []),
  ].filter(Boolean)

  candidateSources.forEach((source) => {
    const fSquareRaw = (source as any)?.quality_criteria?.f_square
      ?? (source as any)?.quality_criteria?.f_squared
      ?? (source as any)?.quality_criteria?.f2
      ?? (source as any)?.qualityCriteria?.fSquare
      ?? (source as any)?.qualityCriteria?.f2
      ?? (source as any)?.final_results?.f_square
      ?? (source as any)?.final_results?.f2
      ?? (source as any)?.f_square
      ?? (source as any)?.f2

    toRows(fSquareRaw).forEach((row) => {
      const directValue = toNumber(readValue(row, ['f²', 'f2', 'f_square', 'f-square', 'f square', 'value', 'effect_size', 'f_squared', 'f2_interaction']))
      const directFrom = readValue(row, ['from', 'source', 'predictor', 'From', 'Predictor', 'iv', 'independent_variable'])
      const directTo = readValue(row, ['to', 'target', 'outcome', 'endogenous', 'To', 'Target', 'Endogenous', 'dv', 'dependent_variable'])
      
      const resolvedFrom = resolveConstructName(directFrom, savedModel)
      const resolvedTo = resolveConstructName(directTo, savedModel)
      if (directValue != null && resolvedFrom && resolvedTo) {
        setFSquare(resolvedFrom, resolvedTo, directValue)
        return
      }

      const rowConstruct = resolveConstructName(readValue(row, ['row_name', 'row', 'endogenous', 'target', 'Construct', 'from', 'source', 'predictor']), savedModel)
      if (!rowConstruct) return
      Object.entries(row).forEach(([key, value]) => {
        if (isOmittedKey(key)) return
        const numeric = toNumber(value)
        if (numeric == null || numeric === 0) return
        const columnConstruct = resolveConstructName(key, savedModel)
        if (!columnConstruct) return
        setFSquare(rowConstruct, columnConstruct, numeric)
        setFSquare(columnConstruct, rowConstruct, numeric)
      })
    })
  })

  return lookup
}

function buildMeasurementSection(
  request: TarkReportTableRequest,
  pls: Record<string, unknown> | undefined,
  savedModel?: TarkSavedModelLike | null,
): TarkReportSection | null {
  const loadings = orderMeasurementRows(parseOuterLoadings(pls, savedModel), savedModel)
  const reliability = buildReliabilityLookup(pls, savedModel)
  const outerVif = buildOuterVifLookup(pls, savedModel)
  if (!loadings.length && !reliability.size) return null

  return {
    title: 'Measurement model assessment',
    headers: ['Construct', 'Indicator', 'Loading', 'VIF', 'Cronbach’s α', 'rho_A', 'CR', 'AVE'],
    rows: loadings.map((row, index) => {
      const stats = reliability.get(row.construct) ?? {}
      const previousConstruct = index > 0 ? loadings[index - 1]?.construct : ''
      const isFirstConstructRow = previousConstruct !== row.construct
      const constructLabel = previousConstruct === row.construct
        ? TARK_USER_FILL_CELL
        : mapConstructLabel(request, row.construct)
      return [
        constructLabel,
        row.indicator,
        formatCell(row.loading),
        formatCell(outerVif.get(pathKey(row.construct, row.indicator))),
        isFirstConstructRow ? stats.cronbach ?? '—' : TARK_USER_FILL_CELL,
        isFirstConstructRow ? stats.rhoA ?? '—' : TARK_USER_FILL_CELL,
        isFirstConstructRow ? stats.cr ?? '—' : TARK_USER_FILL_CELL,
        isFirstConstructRow ? stats.ave ?? '—' : TARK_USER_FILL_CELL,
      ]
    }),
    note: 'Note. Loading = outer loading; VIF = variance inflation factor; rho_A = Dijkstra-Henseler rho; CR = composite reliability; AVE = average variance extracted.',
  }
}

function buildDiscriminantSection(request: TarkReportTableRequest, pls: Record<string, unknown> | undefined): TarkReportSection | null {
  const rows = toRows((pls as any)?.quality_criteria?.discriminant_validity)
    .filter((row) => String(readValue(row, ['method', 'Method']) ?? '').toLowerCase().includes('htmt'))
  if (!rows.length) return null

  const valueHeaders = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
    .filter((header) => !isOmittedKey(header))
  if (!valueHeaders.length) return null

  return {
    title: 'Discriminant validity assessment',
    headers: ['Construct', ...valueHeaders.map((header) => mapConstructLabel(request, header))],
    rows: rows.map((row, index) => {
      const construct = String(readValue(row, ['row_name', 'row', 'Construct', 'construct']) ?? `Construct ${index + 1}`)
      return [
        mapConstructLabel(request, construct),
        ...valueHeaders.map((header) => formatCell(row[header])),
      ]
    }),
    note: 'Note. Values report HTMT ratios. Values below the selected threshold support discriminant validity.',
  }
}

function buildStructuralSection(
  request: TarkReportTableRequest,
  bootstrap: Record<string, unknown> | undefined,
  pls: Record<string, unknown> | undefined,
  savedModel?: TarkSavedModelLike | null,
  savedAnalyses?: Map<string, TarkSavedAnalysis>,
): TarkReportSection | null {
  const rows = toRows((bootstrap as any)?.final_results?.path_coefficients ?? (pls as any)?.final_results?.path_coefficients)
  if (!rows.length) return null
  const fSquareLookup = buildFSquareLookup(pls, bootstrap, savedModel, savedAnalyses)

  return {
    title: 'Structural model assessment',
    headers: ['Hypothesis', 'Path', 'β', 'Mean', 'STDEV', 't-value', 'p-value', '95% CI', 'f²', 'Effect size', 'Decision'],
    rows: rows.map((row, index) => {
      const path = getPathParts(row, savedModel, `Path ${index + 1}`)
      const tValue = readValue(row, ['T Stat.', 'T.Stat.', 'T Statistic', 'T statistics', 'T statistics (|O/STDEV|)', 'T Value', 'T values', 't_value'])
      const pValue = readPValue(row) ?? approximateTwoTailedPValueFromT(tValue)
      const numericP = parsePValue(pValue)
      const fSquare = path.from && path.to
        ? (fSquareLookup.get(pathKey(path.from, path.to)) ?? fSquareLookup.get(pathKey(path.to, path.from)) ?? null)
        : null
      return [
        TARK_USER_FILL_CELL,
        formatMappedPath(request, path.from, path.to, path.label),
        formatCell(readValue(row, ['Original Est.', 'Original.Est.', 'Original Estimate', 'Original sample', 'Original sample (O)', 'O', 'coefficient', 'estimate'])),
        formatCell(readValue(row, ['Bootstrap Mean', 'Bootstrap.Mean', 'Sample Mean', 'Sample mean (M)', 'Mean', 'M'])),
        formatCell(readValue(row, ['Bootstrap SD', 'Bootstrap.SD', 'STDEV', 'SDEV', 'Standard Deviation', 'Standard deviation (STDEV)'])),
        formatCell(tValue),
        formatPValueCell(pValue),
        formatCi(row),
        formatCell(fSquare),
        effectSizeLabel(fSquare),
        numericP == null ? '—' : numericP < 0.05 ? 'Supported' : 'Not supported',
      ]
    }),
    note: 'Note. β = standardized path coefficient; STDEV = bootstrap standard deviation; CI = confidence interval; f² = effect size.',
  }
}

function buildSpecificIndirectSection(
  request: TarkReportTableRequest,
  bootstrap: Record<string, unknown> | undefined,
  pls: Record<string, unknown> | undefined,
): TarkReportSection | null {
  const rows = toRows(
    (bootstrap as any)?.final_results?.specific_indirect_effects
      ?? (pls as any)?.final_results?.specific_indirect_effects
      ?? (bootstrap as any)?.final_results?.total_indirect_effects
      ?? (pls as any)?.final_results?.total_indirect_effects
      ?? (bootstrap as any)?.final_results?.indirect_effects
      ?? (pls as any)?.final_results?.indirect_effects,
  )
  if (!rows.length) return null

  const mapIndirectPath = (value: unknown): string => String(value ?? '')
    .split(/\s*(?:->|→)\s*/)
    .filter(Boolean)
    .map((part) => mapConstructLabel(request, part))
    .join(' → ')

  return {
    title: 'Specific indirect effects',
    headers: ['Path', 'β', 'STDEV', 't-value', 'p-value', '2.5% CI', '97.5% CI'],
    rows: rows.map((row, index) => {
      const tValue = readValue(row, ['T Stat.', 'T.Stat.', 'T Statistic', 'T statistics', 'T statistics (|O/STDEV|)', 'T Value', 'T values', 't_value', 't'])
      const pValue = readPValue(row) ?? approximateTwoTailedPValueFromT(tValue)
      return [
        mapIndirectPath(readValue(row, ['path', 'Path', 'row_name', 'row']) ?? `Path ${index + 1}`),
        formatCell(readValue(row, ['Original Est.', 'Original.Est.', 'Original Estimate', 'Original sample', 'Original sample (O)', 'O', 'coefficient', 'estimate', 'value'])),
        formatCell(readValue(row, ['Bootstrap SD', 'Bootstrap.SD', 'STDEV', 'SDEV', 'Standard Deviation', 'Standard deviation (STDEV)'])),
        formatCell(tValue),
        formatPValueCell(pValue),
        formatCell(readValue(row, ['2.5% CI', '2.5% CI (BC)', '2.5% CI (bias-corrected)', 'CI lower', 'lower'])),
        formatCell(readValue(row, ['97.5% CI', '97.5% CI (BC)', '97.5% CI (bias-corrected)', 'CI upper', 'upper'])),
      ]
    }),
    note: 'Note. β = specific indirect effect; STDEV = bootstrap standard deviation; CI = bootstrap confidence interval. The displayed bounds are the standard 95% interval limits (2.5% and 97.5%).',
  }
}

function buildPowerSection(
  request: TarkReportTableRequest,
  pls: Record<string, unknown> | undefined,
  plspredict: Record<string, unknown> | undefined,
): TarkReportSection | null {
  const rRows = toRows((pls as any)?.quality_criteria?.r_square)
  const qRows = toRows((plspredict as any)?.final_results?.plspredict_lv_summary ?? (pls as any)?.quality_criteria?.q_square)
  if (!rRows.length && !qRows.length) return null
  const qByConstruct = new Map(qRows.map((row) => [
    readLabel(row),
    readValue(row, ['Q2predict', 'Q²predict', 'Q2_predict', 'Q²_predict', 'Q2.predict', 'Q2 predict', 'Q² predict', 'q2predict', 'q2_predict', 'q2', 'Q2', 'Q²']),
  ]))
  const constructs = Array.from(new Set([...rRows.map((row) => readLabel(row)), ...qRows.map((row) => readLabel(row))])).filter(Boolean)
  return {
    title: 'Explanatory and predictive power',
    headers: ['Endogenous construct', 'R²', 'Adjusted R²', 'R² interpretation', 'Q²predict', 'Q²predict interpretation'],
    rows: constructs.map((construct) => {
      const rRow = rRows.find((row) => readLabel(row) === construct) ?? {}
      return [
        mapConstructLabel(request, construct),
        formatCell(readValue(rRow, ['R²', 'R2', 'r2', 'R square', 'r square'])),
        formatCell(readValue(rRow, ['Adjusted R²', 'Adjusted R2', 'Adjusted R Square', 'R2_adj', 'r2_adjusted', 'R²adj', 'R2 adjusted', 'R Square Adjusted', 'R square adjusted', 'R-square adjusted'])),
        TARK_USER_FILL_CELL,
        formatCell(qByConstruct.get(construct)),
        TARK_USER_FILL_CELL,
      ]
    }),
    note: 'Note. R² and adjusted R² are from the PLS-SEM estimate. Q²predict values are from the PLSpredict latent variable (LV) summary.',
  }
}

function displayFitIndex(label: string): string {
  const normalized = normalizeMetricKey(label)
  const labels: Record<string, string> = {
    srmr: 'SRMR',
    duls: 'd_ULS',
    dg: 'd_G',
    chisquare: 'Chi-square',
    chisq: 'Chi-square',
    nfi: 'NFI',
    rmstheta: 'RMS_theta',
  }
  return labels[normalized] ?? label
}

function buildModelFitSection(pls: Record<string, unknown> | undefined): TarkReportSection | null {
  const rows = toRows(
    (pls as any)?.quality_criteria?.model_fit
      ?? (pls as any)?.quality_criteria?.fit_indices,
  )
  const directSrmr = (pls as any)?.quality_criteria?.srmr
  if (!rows.length && directSrmr == null) return null

  const fitRows = rows.flatMap((row) => {
    const metric = readValue(row, ['Fit index', 'fit_index', 'index', 'Metric', 'criteria', 'row_name', 'row'])
    const value = readValue(row, ['Value', 'value'])
    if (metric != null && toNumber(value) != null) return [[displayFitIndex(String(metric)), formatCell(value)]]

    return Object.entries(row)
      .filter(([key, entryValue]) => {
        if (isOmittedKey(key)) return false
        return toNumber(entryValue) != null
      })
      .map(([key, entryValue]) => [displayFitIndex(key), formatCell(entryValue)])
  })

  if (directSrmr != null) fitRows.unshift(['SRMR', formatCell(directSrmr)])

  const allowed = new Set(['srmr', 'duls', 'dg', 'nfi'])
  const seen = new Set<string>()
  const dedupedRows = fitRows.filter(([label]) => {
    const key = normalizeMetricKey(label)
    if (!allowed.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (!dedupedRows.length) return null

  return {
    title: 'Model fit assessment',
    headers: ['Fit index', 'Value'],
    rows: dedupedRows,
    note: 'Note. Model fit reports SRMR, NFI, d_ULS, and d_G from the fitted Standard PLS or PLSc model.',
  }
}

function buildPlsPredictSection(plspredict: Record<string, unknown> | undefined): TarkReportSection | null {
  const rows = toRows((plspredict as any)?.final_results?.plspredict_mv_summary)
  if (!rows.length) return null
  return {
    title: 'PLSpredict assessment',
    headers: ['Indicator', 'Q²predict', 'PLS RMSE', 'PLS MAE', 'LM RMSE', 'LM MAE'],
    rows: rows.map((row, index) => [
      readLabel(row, `Indicator ${index + 1}`),
      formatCell(readValue(row, ['Q2predict', 'Q²predict', 'Q2.predict', 'q2', 'q2predict'])),
      formatCell(readValue(row, ['PLS-SEM_RMSE', 'PLS_SEM_RMSE', 'PLS-SEM RMSE', 'PLS RMSE'])),
      formatCell(readValue(row, ['PLS-SEM_MAE', 'PLS_SEM_MAE', 'PLS-SEM MAE', 'PLS MAE'])),
      formatCell(readValue(row, ['LM_RMSE', 'LM RMSE'])),
      formatCell(readValue(row, ['LM_MAE', 'LM MAE'])),
    ]),
    note: 'Note. Q²predict values above zero indicate predictive relevance. PLS and LM errors support comparison of predictive performance.',
  }
}

interface TarkAdvancedAnalysisStateLike {
  id: string
  label: string
  saved: boolean
}

function readGroupValues(results: Record<string, unknown> | undefined): { groupA: string; groupB: string } {
  const groups = (results as any)?.groups ?? {}
  return {
    groupA: String(groups.leftValue ?? groups.groupA ?? 'Group A').trim() || 'Group A',
    groupB: String(groups.rightValue ?? groups.groupB ?? 'Group B').trim() || 'Group B',
  }
}

function normalizeDecisionLabel(value: unknown, establishedLabel = 'Established', notEstablishedLabel = 'Not established'): string {
  const text = String(readScalar(value) ?? value ?? '').trim().toLowerCase()
  if (!text) return '—'
  if (['passed', 'supported', 'established', 'significant', 'full', 'partial measurement invariance'].includes(text)) return establishedLabel
  if (['failed', 'not supported', 'not established', 'nonsignificant', 'no measurement invariance'].includes(text)) return notEstablishedLabel
  if (text === 'partial') return 'Partial measurement invariance'
  if (text === 'full') return 'Full measurement invariance'
  if (text === 'none') return 'No measurement invariance'
  return String(readScalar(value) ?? value)
}

function formatInterval(lower: unknown, upper: unknown): string {
  const hasLower = lower != null && String(readScalar(lower) ?? lower).trim() !== ''
  const hasUpper = upper != null && String(readScalar(upper) ?? upper).trim() !== ''
  if (!hasLower && !hasUpper) return '—'
  return `[${formatCell(lower)}, ${formatCell(upper)}]`
}

function titleCaseLabel(value: unknown): string {
  const text = String(readScalar(value) ?? value ?? '').trim()
  if (!text) return '—'
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function buildMicomConfiguralSection(results: Record<string, unknown> | undefined): TarkReportSection | null {
  const rows = toRows((results as any)?.configuralInvariance?.checks ?? (results as any)?.configuralInvariance)
  if (!rows.length) return null
  const { groupA, groupB } = readGroupValues(results)
  return {
    title: 'Configural invariance assessment',
    headers: ['Requirement', 'Group A', 'Group B', 'Status'],
    rows: rows.map((row, index) => [
      titleCaseLabel(readValue(row, ['check', 'Requirement', 'requirement']) ?? `Requirement ${index + 1}`),
      groupA,
      groupB,
      normalizeDecisionLabel(readValue(row, ['status', 'result', 'decision', 'passed']), 'Passed', 'Failed'),
    ]),
    note: `Note. Group A = ${groupA}; Group B = ${groupB}.`,
  }
}

function buildMicomCompositionalSection(results: Record<string, unknown> | undefined): TarkReportSection | null {
  const rows = toRows((results as any)?.compositionalInvariance)
  if (!rows.length) return null
  return {
    title: 'Compositional invariance assessment',
    headers: ['Construct', 'Original correlation', '5% quantile', 'Permutation p-value', 'Decision'],
    rows: rows.map((row, index) => [
      String(readValue(row, ['construct', 'Construct']) ?? `Construct ${index + 1}`),
      formatCell(readValue(row, ['c_value', 'original_correlation', 'original_correlation_value', 'correlation'])),
      formatCell(readValue(row, ['ci_lower', 'lower', 'quantile', '5% quantile'])),
      formatPValueCell(readValue(row, ['p_value', 'permutation_p_value', 'pvalue'])),
      normalizeDecisionLabel(readValue(row, ['decision', 'status']), 'Established', 'Not established'),
    ]),
    note: 'Note. Decisions follow the saved MICOM compositional-invariance results.',
  }
}

function buildMicomEqualitySection(
  results: Record<string, unknown> | undefined,
  kind: 'mean' | 'variance',
  savedAnalyses?: Map<string, TarkSavedAnalysis>,
): TarkReportSection | null {
  const rows = toRows((results as any)?.equalityAssessment)
  if (!rows.length) return null
  const { groupA, groupB } = readGroupValues(results)
  const allDescriptives: Array<Record<string, unknown>> = []
  const sources = [
    results,
    ...(savedAnalyses ? Array.from(savedAnalyses.values()).map((s) => s.results) : []),
  ].filter(Boolean)

  sources.forEach((source) => {
    const desc = toRows((source as any)?.descriptives ?? (source as any)?.overview?.descriptives)
    allDescriptives.push(...desc)
  })

  const title = kind === 'mean' ? 'Equality of construct means' : 'Equality of construct variances'
  return {
    title,
    headers: kind === 'mean'
      ? ['Construct', 'Group A mean', 'Group B mean', 'Mean difference', '95% permutation interval', 'Decision']
      : ['Construct', 'Group A variance', 'Group B variance', 'Variance difference', '95% permutation interval', 'Decision'],
    rows: rows.map((row, index) => {
      const construct = String(readValue(row, ['construct', 'Construct']) ?? `Construct ${index + 1}`)
      const descA = allDescriptives.find((d) => normalizeMetricKey(String(readValue(d, ['construct', 'Construct']) ?? '')) === normalizeMetricKey(construct) && normalizeMetricKey(String(readValue(d, ['group', 'Group']) ?? '')) === normalizeMetricKey(groupA))
      const descB = allDescriptives.find((d) => normalizeMetricKey(String(readValue(d, ['construct', 'Construct']) ?? '')) === normalizeMetricKey(construct) && normalizeMetricKey(String(readValue(d, ['group', 'Group']) ?? '')) === normalizeMetricKey(groupB))
      
      const directA = readValue(row, kind === 'mean' ? ['groupA_mean', 'mean_group_a', 'group_a_mean', 'mean_a'] : ['groupA_variance', 'variance_group_a', 'group_a_variance', 'var_a'])
      const directB = readValue(row, kind === 'mean' ? ['groupB_mean', 'mean_group_b', 'group_b_mean', 'mean_b'] : ['groupB_variance', 'variance_group_b', 'group_b_variance', 'var_b'])

      const valA = directA ?? (descA ? readValue(descA, kind === 'mean' ? ['Mean', 'mean'] : ['Variance', 'variance']) : null)
      const valB = directB ?? (descB ? readValue(descB, kind === 'mean' ? ['Mean', 'mean'] : ['Variance', 'variance']) : null)

      const diff = kind === 'mean'
        ? readValue(row, ['mean_diff', 'difference', 'diff'])
        : readValue(row, ['variance_diff', 'difference', 'diff'])
      const intervalLower = kind === 'mean'
        ? readValue(row, ['mean_ci_lower', 'ci_lower', 'lower'])
        : readValue(row, ['variance_ci_lower', 'ci_lower', 'lower'])
      const intervalUpper = kind === 'mean'
        ? readValue(row, ['mean_ci_upper', 'ci_upper', 'upper'])
        : readValue(row, ['variance_ci_upper', 'ci_upper', 'upper'])
      return [
        construct,
        formatCell(valA),
        formatCell(valB),
        formatCell(diff),
        formatInterval(intervalLower, intervalUpper),
        normalizeDecisionLabel(readValue(row, kind === 'mean' ? ['mean_decision', 'decision', 'status'] : ['variance_decision', 'decision', 'status']), 'Established', 'Not established'),
      ]
    }),
    note: kind === 'mean'
      ? `Note. Group A = ${groupA}; Group B = ${groupB}. Group means follow the saved MICOM equality-of-means results when available.`
      : `Note. Group A = ${groupA}; Group B = ${groupB}. Group variances follow the saved MICOM equality-of-variances results when available.`,
  }
}

function buildMicomClassificationSection(results: Record<string, unknown> | undefined): TarkReportSection | null {
  const rows = toRows((results as any)?.invarianceClassification)
  if (!rows.length) return null
  const configuralCheck = (results as any)?.configuralInvariance
  const compositionalRows = toRows((results as any)?.compositionalInvariance)
  const equalityRows = toRows((results as any)?.equalityAssessment)

  return {
    title: 'Measurement invariance classification',
    headers: ['Construct', 'Configural invariance', 'Compositional invariance', 'Equality of means', 'Equality of variances', 'Classification'],
    rows: rows.map((row, index) => {
      const construct = String(readValue(row, ['construct', 'Construct']) ?? `Construct ${index + 1}`)
      const compRow = compositionalRows.find((r) => normalizeMetricKey(String(readValue(r, ['construct', 'Construct']) ?? '')) === normalizeMetricKey(construct))
      const eqRow = equalityRows.find((r) => normalizeMetricKey(String(readValue(r, ['construct', 'Construct']) ?? '')) === normalizeMetricKey(construct))

      const configuralVal = readValue(row, ['configural_invariance', 'configuralInvariance', 'configural'])
        ?? (configuralCheck?.passed !== false ? 'Passed' : 'Failed')
      const compositionalVal = readValue(row, ['compositional_invariance', 'compositionalInvariance', 'compositional'])
        ?? (compRow ? readValue(compRow, ['decision', 'status']) : 'Established')
      const meanVal = readValue(row, ['equality_of_means', 'equalityOfMeans', 'mean_decision'])
        ?? (eqRow ? readValue(eqRow, ['mean_decision', 'decision', 'status']) : null)
      const varVal = readValue(row, ['equality_of_variances', 'equalityOfVariances', 'variance_decision'])
        ?? (eqRow ? readValue(eqRow, ['variance_decision', 'decision', 'status']) : null)

      return [
        construct,
        normalizeDecisionLabel(configuralVal, 'Passed', 'Failed'),
        normalizeDecisionLabel(compositionalVal, 'Established', 'Not established'),
        normalizeDecisionLabel(meanVal, 'Established', 'Not established'),
        normalizeDecisionLabel(varVal, 'Established', 'Not established'),
        String(readScalar(readValue(row, ['classification', 'invariance', 'result'])) ?? readValue(row, ['classification', 'invariance', 'result']) ?? '—'),
      ]
    }),
    note: 'Note. Classification is taken from the saved MICOM result when provided.',
  }
}

function buildMicomHocSection(results: Record<string, unknown> | undefined): TarkReportSection | null {
  const rows = toRows((results as any)?.hocContext ?? (results as any)?.hoc_context ?? (results as any)?.final_results?.hoc_results)
  if (!rows.length) return null
  return {
    title: 'Higher-order construct invariance context',
    headers: ['Higher-order construct', 'Dimensions', 'Invariance result', 'Notes'],
    rows: rows.map((row, index) => [
      String(readValue(row, ['higher_order_construct', 'hoc_construct', 'construct', 'Higher-order construct']) ?? `HOC ${index + 1}`),
      String(readValue(row, ['dimensions', 'Dimensions', 'dimension']) ?? '—'),
      String(readValue(row, ['invariance_result', 'invariance', 'status', 'result']) ?? '—'),
      String(readValue(row, ['notes', 'note', 'MICOM/MGA handling']) ?? 'Uses fitted HOC construct scores from the same SEMinR model specification.'),
    ]),
  }
}

function buildMicomSections(
  results: Record<string, unknown> | undefined,
  savedAnalyses?: Map<string, TarkSavedAnalysis>,
): TarkReportSection[] {
  const sections = [
    buildMicomConfiguralSection(results),
    buildMicomCompositionalSection(results),
    buildMicomEqualitySection(results, 'mean', savedAnalyses),
    buildMicomEqualitySection(results, 'variance', savedAnalyses),
    buildMicomClassificationSection(results),
    buildMicomHocSection(results),
  ].filter((section): section is TarkReportSection => Boolean(section && section.rows.length))

  if (!sections.length) return []
  const heading = readGroupValues(results)
  return [{
    title: 'Measurement invariance assessment',
    headers: [],
    rows: [],
    note: `Note. Group A = ${heading.groupA}; Group B = ${heading.groupB}.`,
  }, ...sections]
}

function getArrayEntryByMode(results: Record<string, unknown> | undefined, path: string[]): Record<string, unknown> | undefined {
  let current: any = results
  for (const segment of path) {
    current = current?.[segment]
    if (current == null) return undefined
  }
  return current
}

function getRowPathLabel(row: Record<string, unknown>): string {
  return String(readValue(row, ['path', 'Path', 'row_name', 'row', 'relationship', 'Relationship']) ?? '')
    .trim()
    .replace(/\s*(?:->|~>|=>)\s*/g, ' → ')
}

function formatGroupStat(row: Record<string, unknown>, candidates: string[]): string {
  return formatCell(readValue(row, candidates))
}

function buildMgaGroupSpecificPathSection(results: Record<string, unknown> | undefined): TarkReportSection | null {
  const groupAResults = getArrayEntryByMode(results, ['groupSpecific', 'groupA', 'final_results', 'path_coefficients'])
  const groupBResults = getArrayEntryByMode(results, ['groupSpecific', 'groupB', 'final_results', 'path_coefficients'])
  const groupARows = toRows(groupAResults)
  const groupBRows = toRows(groupBResults)
  if (!groupARows.length && !groupBRows.length) return null

  const rowMap = new Map<string, { groupA?: Record<string, unknown>; groupB?: Record<string, unknown> }>()
  const addRow = (row: Record<string, unknown>, key: 'groupA' | 'groupB') => {
    const label = getRowPathLabel(row)
    if (!label) return
    const current = rowMap.get(normalizeMetricKey(label)) ?? {}
    current[key] = row
    rowMap.set(normalizeMetricKey(label), current)
  }
  groupARows.forEach((row) => addRow(row, 'groupA'))
  groupBRows.forEach((row) => addRow(row, 'groupB'))

  const { groupA, groupB } = readGroupValues(results)
  return {
    title: 'Group-specific structural path results',
    headers: ['Path', 'Group A β', 'Group A t-value', 'Group A p-value', 'Group B β', 'Group B t-value', 'Group B p-value'],
    rows: Array.from(rowMap.values()).map((entry) => {
      const sourceRow = entry.groupA ?? entry.groupB ?? {}
      const path = getRowPathLabel(sourceRow)
      const tValA = readValue(entry.groupA ?? {}, ['T Stat.', 'T.Stat.', 'T Statistic', 't_value', 't statistic'])
      const pValA = readPValue(entry.groupA ?? {}) ?? approximateTwoTailedPValueFromT(tValA)
      const tValB = readValue(entry.groupB ?? {}, ['T Stat.', 'T.Stat.', 'T Statistic', 't_value', 't statistic'])
      const pValB = readPValue(entry.groupB ?? {}) ?? approximateTwoTailedPValueFromT(tValB)
      return [
        path,
        formatGroupStat(entry.groupA ?? {}, ['Original Est.', 'Original.Est.', 'Original Estimate', 'coefficient', 'estimate']),
        formatGroupStat(entry.groupA ?? {}, ['T Stat.', 'T.Stat.', 'T Statistic', 't_value', 't statistic']),
        formatPValueCell(pValA),
        formatGroupStat(entry.groupB ?? {}, ['Original Est.', 'Original.Est.', 'Original Estimate', 'coefficient', 'estimate']),
        formatGroupStat(entry.groupB ?? {}, ['T Stat.', 'T.Stat.', 'T Statistic', 't_value', 't statistic']),
        formatPValueCell(pValB),
      ]
    }),
    note: `Note. Group A = ${groupA}; Group B = ${groupB}.`,
  }
}

function buildMgaComparisonSection(
  results: Record<string, unknown> | undefined,
  sourceKey: 'pathCoefficients' | 'outerLoadings' | 'outerWeights',
): TarkReportSection | null {
  const family = (results as any)?.bootstrapMGA?.[sourceKey]
  if (!family) return null
  const labels = readGroupValues(results)
  const biasCorrected = toRows(family.biasCorrectedConfidenceIntervals)
  const henseler = toRows(family.henselerPlsMga)
  const parametric = toRows(family.parametricTest)
  const welch = toRows(family.welchTest)
  const sourceRows = [
    ...biasCorrected,
    ...henseler.map((row) => ({ ...row, henseler_p: readValue(row, ['pls_mga_p', 'p_value']) })),
    ...parametric.map((row) => ({ ...row, parametric_p: readValue(row, ['p_value']) })),
    ...welch.map((row) => ({
      ...row,
      welch_p: readValue(row, ['p_value']),
      welch_df: readValue(row, ['df']),
    })),
  ]
  if (!sourceRows.length) return null

  const rowMap = new Map<string, Record<string, unknown>>()
  sourceRows.forEach((row) => {
    const key = sourceKey === 'pathCoefficients'
      ? normalizeMetricKey(getRowPathLabel(row))
      : normalizeMetricKey(`${String(readValue(row, ['construct', 'Construct']) ?? '').trim()}::${String(readValue(row, ['indicator', 'Indicator']) ?? '').trim()}`)
    if (!key.trim()) return
    rowMap.set(key, { ...(rowMap.get(key) ?? {}), ...row })
  })

  const sectionTitle = sourceKey === 'pathCoefficients'
    ? 'Multi-group comparison of path coefficients'
    : sourceKey === 'outerLoadings'
      ? 'Multi-group comparison of outer loadings'
      : 'Multi-group comparison of outer weights'

  const metricLabel = sourceKey === 'pathCoefficients' ? 'β' : sourceKey === 'outerLoadings' ? 'loading' : 'weight'
  const valueKey = sourceKey === 'pathCoefficients' ? ['groupA_beta', 'group1_beta'] : sourceKey === 'outerLoadings' ? ['groupA_loading', 'group1_loading'] : ['groupA_weight', 'group1_weight']
  const groupBValueKey = sourceKey === 'pathCoefficients' ? ['groupB_beta', 'group2_beta'] : sourceKey === 'outerLoadings' ? ['groupB_loading', 'group2_loading'] : ['groupB_weight', 'group2_weight']

  return {
    title: sectionTitle,
    headers: sourceKey === 'pathCoefficients'
      ? ['Path', 'Group A β', 'Group B β', 'Difference', 'Bias-corrected 95% CI', 'PLS-MGA p-value', 'Parametric p-value', 'Welch p-value', 'Welch df', 'Decision']
      : ['Construct', 'Indicator', `Group A ${metricLabel}`, `Group B ${metricLabel}`, 'Difference', 'Bias-corrected 95% CI', 'PLS-MGA p-value', 'Parametric p-value', 'Welch p-value', 'Welch df', 'Decision'],
    rows: Array.from(rowMap.values()).map((row) => {
      const path = getRowPathLabel(row)
      let ciLower = readValue(row, ['difference_ci_lower', 'diff_ci_lower', 'ci_lower', 'lower'])
      let ciUpper = readValue(row, ['difference_ci_upper', 'diff_ci_upper', 'ci_upper', 'upper'])
      if (ciLower == null && ciUpper == null) {
        const aLower = toNumber(readValue(row, ['groupA_ci_lower', 'ci25_a']))
        const aUpper = toNumber(readValue(row, ['groupA_ci_upper', 'ci975_a']))
        const bLower = toNumber(readValue(row, ['groupB_ci_lower', 'ci25_b']))
        const bUpper = toNumber(readValue(row, ['groupB_ci_upper', 'ci975_b']))
        if (aLower != null && aUpper != null && bLower != null && bUpper != null) {
          ciLower = aLower - bUpper
          ciUpper = aUpper - bLower
        } else if (aLower != null && aUpper != null) {
          ciLower = aLower
          ciUpper = aUpper
        }
      }

      const henselerP = readValue(row, ['pls_mga_p', 'p_value_henseler', 'henseler_p']) ?? readValue(row, ['pls_mga_p', 'p_value'])
      const parametricP = readValue(row, ['parametric_p_value', 'parametric_p', 'p_value_parametric']) ?? readValue(row, ['p_value'])
      const welchP = readValue(row, ['welch_p', 'welch_p_value', 'p_value_welch'])
      const welchDf = readValue(row, ['welch_df', 'df_welch'])
      const decision = normalizeDecisionLabel(readValue(row, ['result', 'decision', 'status']), 'Significant difference', 'No significant difference')
      
      if (sourceKey === 'pathCoefficients') {
        return [
          path,
          formatCell(readValue(row, valueKey)),
          formatCell(readValue(row, groupBValueKey)),
          formatCell(readValue(row, ['diff', 'difference'])),
          formatInterval(ciLower, ciUpper),
          formatPValueCell(henselerP),
          formatPValueCell(parametricP),
          formatPValueCell(welchP),
          formatCell(welchDf),
          decision,
        ]
      }

      const rowConstruct = String(readValue(row, ['construct', 'Construct']) ?? '').trim() || '—'
      const indicator = String(readValue(row, ['indicator', 'Indicator']) ?? '').trim() || '—'
      return [
        rowConstruct,
        indicator,
        formatCell(readValue(row, valueKey)),
        formatCell(readValue(row, groupBValueKey)),
        formatCell(readValue(row, ['diff', 'difference'])),
        formatInterval(ciLower, ciUpper),
        formatPValueCell(henselerP),
        formatPValueCell(parametricP),
        formatPValueCell(welchP),
        formatCell(welchDf),
        decision,
      ]
    }),
    note: `Note. Group A = ${labels.groupA}; Group B = ${labels.groupB}.`,
  }
}

function buildMgaModerationSection(results: Record<string, unknown> | undefined): TarkReportSection | null {
  const rows = toRows((results as any)?.bootstrapMGA?.pathCoefficients?.biasCorrectedConfidenceIntervals)
  if (!rows.length) return null
  const labels = readGroupValues(results)
  const outputRows = rows.filter((row) => String(readValue(row, ['interaction_path', 'interaction']) ?? '').trim())
  if (!outputRows.length) return null

  return {
    title: 'Multi-group comparison of moderation effects',
    headers: ['Independent variable', 'Moderator', 'Outcome', 'Interaction path', 'Group A β', 'Group B β', 'Difference', 'PLS-MGA p-value', 'Decision'],
    rows: outputRows.map((row) => [
      String(readValue(row, ['iv', 'independent_variable', 'independent variable']) ?? '—'),
      String(readValue(row, ['moderator']) ?? '—'),
      String(readValue(row, ['dv', 'outcome', 'dependent_variable']) ?? '—'),
      String(readValue(row, ['interaction_path', 'interaction', 'path']) ?? '—'),
      formatCell(readValue(row, ['groupA_beta', 'group1_beta'])),
      formatCell(readValue(row, ['groupB_beta', 'group2_beta'])),
      formatCell(readValue(row, ['diff', 'difference'])),
      formatPValueCell(readValue(row, ['pls_mga_p', 'p_value', 'pvalue'])),
      normalizeDecisionLabel(readValue(row, ['result', 'decision', 'status']), 'Significant difference', 'No significant difference'),
    ]),
    note: `Note. Group A = ${labels.groupA}; Group B = ${labels.groupB}.`,
  }
}

function buildMgaHocContextSection(results: Record<string, unknown> | undefined, savedModel?: TarkSavedModelLike | null): TarkReportSection | null {
  const rows = toRows((results as any)?.hocContext ?? (results as any)?.hoc_context ?? (results as any)?.final_results?.hoc_results)
  if (!rows.length) return null
  const groupValues = readGroupValues(results)
  return {
    title: 'Higher-order construct context in multi-group analysis',
    headers: ['Higher-order construct', 'Dimensions', 'Role', 'Compared path', 'Group A estimate', 'Group B estimate', 'Difference', 'Decision'],
    rows: rows.map((row, index) => {
      const hoc = String(readValue(row, ['higher_order_construct', 'hoc_construct', 'construct', 'Higher-order construct']) ?? `HOC ${index + 1}`)
      const dimensions = String(readValue(row, ['dimensions', 'Dimensions', 'dimension']) ?? '—')
      const role = String(readValue(row, ['role', 'Role', 'structural_role', 'Structural role']) ?? '—')
      const path = String(readValue(row, ['compared_path', 'comparedPath', 'path', 'Path']) ?? '—')
      return [
        hoc,
        dimensions,
        role,
        path,
        formatCell(readValue(row, ['groupA_estimate', 'group1_estimate', 'groupA_beta'])),
        formatCell(readValue(row, ['groupB_estimate', 'group2_estimate', 'groupB_beta'])),
        formatCell(readValue(row, ['difference', 'diff'])),
        normalizeDecisionLabel(readValue(row, ['decision', 'result', 'status']), 'Established', 'Not established'),
      ]
    }),
    note: `Note. Group A = ${groupValues.groupA}; Group B = ${groupValues.groupB}.`,
  }
}

function buildNcaSections(results: Record<string, unknown> | undefined): TarkReportSection[] {
  const sections: TarkReportSection[] = []

  const sigRows = toRows((results as any)?.necessity_check ?? (results as any)?.final_results?.necessity_check)
  if (sigRows.length) {
    sections.push({
      title: 'Necessity significance assessment',
      headers: ['Condition', 'Ceiling method', 'Effect size', 'Permutation p-value', 'Decision'],
      rows: sigRows.map((row) => [
        String(readValue(row, ['condition', 'Condition', 'row_name', 'row']) ?? '—'),
        String(readValue(row, ['ceiling_method', 'method', 'Ceiling method']) ?? '—'),
        formatCell(readValue(row, ['effect_size', 'Effect size', 'd'])),
        formatPValueCell(readValue(row, ['p_value', 'Permutation p-value', 'p'])),
        normalizeDecisionLabel(readValue(row, ['decision', 'Decision', 'status']), 'Necessary and significant', 'Not significant'),
      ]),
      note: 'Note. Values are from the saved NCA result.',
    })
  }

  const buildBottleneck = (method: 'CE-FDH' | 'CR-FDH') => {
    const tableData = (results as any)?.bottleneck_table?.[method] ?? (results as any)?.final_results?.bottleneck_table?.[method]
    if (!tableData) return null
    const bRows = toRows(tableData)
    if (!bRows.length) return null

    const allKeys = Array.from(new Set(bRows.flatMap((r) => Object.keys(r))))
    const conditionKeys = allKeys.filter((k) => {
      const norm = normalizeMetricKey(k)
      return !isOmittedKey(k) && norm !== 'level' && k !== 'Outcome' && k !== 'outcome' && k !== (results as any)?.outcome
    })

    if (!conditionKeys.length) return null

    return {
      title: `${method} bottleneck table`,
      headers: ['Level (%)', ...conditionKeys],
      rows: bRows.map((row) => {
        const levelRaw = readValue(row, ['level', 'Level', 'Level (%)']) ?? readValue(row, ['row_name', 'row'])
        const levelNumeric = toNumber(levelRaw)
        const levelStr = levelNumeric != null ? String(levelNumeric) : String(levelRaw)

        return [
          levelStr,
          ...conditionKeys.map((k) => {
            const val = row[k]
            if (val === 'NN') return 'NN'
            if (val === '-' || val === '—' || val == null) return '—'
            const num = toNumber(val)
            return num != null ? num.toFixed(3) : String(val)
          }),
        ]
      }),
      note: 'Note. Values represent the minimum level of each condition required to achieve a given level of the outcome. NN means not necessary. Values are expressed as percentages of the observed range. The dash symbol indicates that no feasible bottleneck value was returned for that level.',
    }
  }

  const ceFdh = buildBottleneck('CE-FDH')
  if (ceFdh) sections.push(ceFdh)
  const crFdh = buildBottleneck('CR-FDH')
  if (crFdh) sections.push(crFdh)

  return sections
}

function buildIpmaSections(results: Record<string, unknown> | undefined): TarkReportSection[] {
  const sections: TarkReportSection[] = []

  const cRows = toRows((results as any)?.construct_table ?? (results as any)?.final_results?.construct_table)
  if (cRows.length) {
    sections.push({
      title: 'Construct importance and performance',
      headers: ['Construct', 'Importance', 'Performance', 'Priority classification'],
      rows: cRows.map((row) => [
        String(readValue(row, ['construct', 'Construct', 'row_name', 'row']) ?? '—'),
        formatCell(readValue(row, ['importance', 'Importance'])),
        formatCell(readValue(row, ['performance', 'Performance'])),
        String(readValue(row, ['priority_classification', 'Classification', 'priority']) ?? '—'),
      ]),
      note: 'Note. Values are from the saved IPMA result.',
    })
  }

  const iRows = toRows((results as any)?.indicator_table ?? (results as any)?.final_results?.indicator_table)
  if (iRows.length) {
    sections.push({
      title: 'Indicator importance and performance',
      headers: ['Construct', 'Indicator', 'Importance', 'Performance', 'Priority classification'],
      rows: iRows.map((row) => [
        String(readValue(row, ['construct', 'Construct']) ?? '—'),
        String(readValue(row, ['indicator', 'Indicator', 'row_name', 'row']) ?? '—'),
        formatCell(readValue(row, ['importance', 'Importance'])),
        formatCell(readValue(row, ['performance', 'Performance'])),
        String(readValue(row, ['priority_classification', 'Classification', 'priority']) ?? '—'),
      ]),
      note: 'Note. Values are from the saved IPMA result.',
    })
  }

  if (sections.length) {
    sections.unshift({
      title: 'Importance-performance map analysis',
      headers: [],
      rows: [],
    })
  }

  return sections
}

function formatCipmaBoolean(val: unknown): string {
  const text = String(readScalar(val) ?? val ?? '').trim().toLowerCase()
  if (text === 'true' || text === 'yes' || text === '1') return 'Yes'
  if (text === 'false' || text === 'no' || text === '0') return 'No'
  return String(readScalar(val) ?? val)
}

function buildCipmaSections(results: Record<string, unknown> | undefined): TarkReportSection[] {
  const sections: TarkReportSection[] = []

  const pRows = toRows((results as any)?.cipma_priorities ?? (results as any)?.priority_map ?? (results as any)?.final_results?.priority_map)
  if (pRows.length) {
    sections.push({
      title: 'Combined priority assessment',
      headers: ['Condition', 'Importance', 'Performance', 'Necessity', 'Combined priority'],
      rows: pRows.map((row) => [
        String(readValue(row, ['condition', 'Condition', 'row_name', 'row']) ?? '—'),
        formatCell(readValue(row, ['importance', 'Importance'])),
        formatCell(readValue(row, ['performance', 'Performance'])),
        formatCell(readValue(row, ['necessity', 'Necessity', 'effect_size'])),
        String(readValue(row, ['combined_priority', 'Priority', 'combined priority', 'combinedPriority']) ?? '—'),
      ]),
      note: 'Note. Values are from the saved cIPMA result.',
    })
  }

  const dRows = toRows((results as any)?.cipma_decisions ?? (results as any)?.decision_table ?? (results as any)?.final_results?.decision_table)
  if (dRows.length) {
    sections.push({
      title: 'cIPMA decision classification',
      headers: ['Condition', 'Important driver', 'Performance gap', 'Necessary condition', 'Priority classification'],
      rows: dRows.map((row) => [
        String(readValue(row, ['condition', 'Condition', 'row_name', 'row']) ?? '—'),
        formatCipmaBoolean(readValue(row, ['important_driver', 'Important driver', 'importantDriver'])),
        formatCipmaBoolean(readValue(row, ['performance_gap', 'Performance gap', 'performanceGap'])),
        formatCipmaBoolean(readValue(row, ['necessary_condition', 'Necessary condition', 'necessaryCondition'])),
        String(readValue(row, ['priority_classification', 'Classification', 'priority', 'priorityClassification']) ?? '—'),
      ]),
      note: 'Note. Values are from the saved cIPMA result.',
    })
  }

  if (sections.length) {
    sections.unshift({
      title: 'Combined importance-performance and necessity analysis',
      headers: [],
      rows: [],
    })
  }

  return sections
}

function humanizeAdvancedKey(key: string): string {
  return String(key ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function tableFromUnknown(value: unknown): { headers: string[]; rows: string[][] } | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    const rows = value.slice(0, 40).map((entry, index) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        return [String(index + 1), ...(Object.entries(entry as Record<string, unknown>).slice(0, 2).flatMap(([key, child]) => [humanizeAdvancedKey(key), formatCell(child)]))]
      }
      return [String(index + 1), formatCell(entry)]
    })
    if (!rows.length) return null
    const maxColumns = Math.max(...rows.map((row) => row.length))
    const headers = maxColumns > 2 ? ['Row', 'Metric', 'Value'] : ['Row', 'Value']
    return { headers, rows }
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (!entries.length) return null
  if (entries.every(([, entry]) => !entry || typeof entry !== 'object')) {
    return {
      headers: ['Metric', 'Value'],
      rows: entries.slice(0, 40).map(([key, entry]) => [humanizeAdvancedKey(key), formatCell(entry)]),
    }
  }

  return null
}

function extractAdvancedSections(
  analysisLabel: string,
  value: unknown,
  path: string[] = [],
  sections: TarkReportSection[] = [],
): TarkReportSection[] {
  if (sections.length >= 3) return sections
  const table = tableFromUnknown(value)
  if (table && table.rows.length) {
    const suffix = path.length ? humanizeAdvancedKey(path[path.length - 1]) : 'summary'
    sections.push({
      title: `${analysisLabel} ${suffix}`,
      headers: table.headers,
      rows: table.rows,
      note: `Note. Values are from the saved ${analysisLabel} result.`,
    })
    return sections
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value as Record<string, unknown>).some(([key, child]) => {
      extractAdvancedSections(analysisLabel, child, [...path, key], sections)
      return sections.length >= 3
    })
  }
  return sections
}

function buildGenericAdvancedSections(
  selected: TarkAdvancedAnalysisStateLike[],
  savedAnalyses: Map<string, TarkSavedAnalysis>,
  savedModel?: TarkSavedModelLike | null,
): TarkReportSection[] {
  const sections: TarkReportSection[] = []
  selected.forEach((option) => {
    if (!option.saved) return
    const result = savedAnalyses.get(option.id)?.results
    if (!result) return
    sections.push(...extractAdvancedSections(option.label, result))
  })
  return sections
}

export function buildTarkAdvancedAnalysisSections(
  selected: TarkAdvancedAnalysisStateLike[],
  savedAnalyses: Map<string, TarkSavedAnalysis>,
  savedModel?: TarkSavedModelLike | null,
): TarkReportSection[] {
  const sections: TarkReportSection[] = []
  const selectedById = new Map(selected.filter((option) => option.saved).map((option) => [option.id, option]))

  if (selectedById.has('nca')) {
    const ncaResults = savedAnalyses.get('nca')?.results
    if (ncaResults) {
      sections.push(...buildNcaSections(ncaResults))
    }
  }

  if (selectedById.has('ipma')) {
    const ipmaResults = savedAnalyses.get('ipma')?.results
    if (ipmaResults) {
      sections.push(...buildIpmaSections(ipmaResults))
    }
  }

  if (selectedById.has('cipma')) {
    const cipmaResults = savedAnalyses.get('cipma')?.results
    if (cipmaResults) {
      sections.push(...buildCipmaSections(cipmaResults))
    }
  }

  if (selectedById.has('micom')) {
    const micomResults = savedAnalyses.get('permutation')?.results
    if (micomResults) {
      sections.push(...buildMicomSections(micomResults))
    }
  }

  if (selectedById.has('mga')) {
    const mgaResults = savedAnalyses.get('mga')?.results
    if (mgaResults) {
      const mgaSections = [
        {
          title: 'Multi-group analysis',
          headers: [],
          rows: [],
        },
        buildMgaGroupSpecificPathSection(mgaResults),
        buildMgaComparisonSection(mgaResults, 'pathCoefficients'),
        buildMgaComparisonSection(mgaResults, 'outerLoadings'),
        buildMgaComparisonSection(mgaResults, 'outerWeights'),
        buildMgaModerationSection(mgaResults),
        buildMgaHocContextSection(mgaResults, savedModel),
      ].filter((section): section is TarkReportSection => Boolean(section && (section.rows.length || section.headers.length === 0)))
      if (mgaSections.length > 1) {
        sections.push(...mgaSections)
      }
    }
  }

  const genericSelected = selected.filter((option) => option.saved && !['nca', 'ipma', 'cipma', 'micom', 'mga'].includes(option.id))
  if (genericSelected.length) {
    sections.push(...buildGenericAdvancedSections(genericSelected, savedAnalyses, savedModel))
  }

  return sections
}

export function buildTarkReportSections(
  request: TarkReportTableRequest,
  savedAnalyses: Map<string, TarkSavedAnalysis>,
  savedModel?: TarkSavedModelLike | null,
): TarkReportSection[] {
  const pls = savedAnalyses.get('pls-sem')?.results
  const bootstrap = savedAnalyses.get('bootstrap')?.results
  const plspredict = savedAnalyses.get('plspredict')?.results

  const sections = [
    buildMeasurementSection(request, pls, savedModel),
    buildDiscriminantSection(request, pls),
    buildStructuralSection(request, bootstrap, pls, savedModel, savedAnalyses),
    buildSpecificIndirectSection(request, bootstrap, pls),
    buildPowerSection(request, pls, plspredict),
    buildModelFitSection(pls),
  ].filter((section): section is TarkReportSection => Boolean(section && section.rows.length))

  const predictSection = buildPlsPredictSection(plspredict)
  if (predictSection?.rows.length) sections.push(predictSection)

  return sections
}

function setAliasedValue(
  target: Record<string, Record<string, number>>,
  nameById: Map<string, string>,
  idByName: Map<string, string>,
  key: string,
  partial: Record<string, number>,
) {
  if (!key) return
  target[key] = { ...(target[key] ?? {}), ...partial }
  const asName = nameById.get(key)
  if (asName) target[asName] = { ...(target[asName] ?? {}), ...partial }
  const asId = idByName.get(key)
  if (asId) target[asId] = { ...(target[asId] ?? {}), ...partial }
}

function setPathResult(
  target: Record<string, Record<string, number>>,
  nameById: Map<string, string>,
  idByName: Map<string, string>,
  from: string,
  to: string,
  partial: Record<string, number>,
) {
  if (!from || !to || !Object.keys(partial).length) return
  const fromName = nameById.get(from) ?? from
  const toName = nameById.get(to) ?? to
  target[`${fromName}-${toName}`] = { ...(target[`${fromName}-${toName}`] ?? {}), ...partial }
  const fromId = idByName.get(fromName) ?? from
  const toId = idByName.get(toName) ?? to
  target[`${fromId}-${toId}`] = { ...(target[`${fromId}-${toId}`] ?? {}), ...partial }
}

export function buildTarkDiagramResults(
  source: Map<string, TarkSavedAnalysis> | Record<string, unknown> | undefined,
  savedModel?: TarkSavedModelLike | null,
): TarkDiagramResults {
  const { nameById, idByName } = modelNameMaps(savedModel)
  const constructScores: Record<string, Record<string, number>> = {}
  const pathResults: Record<string, Record<string, number>> = {}
  const measurementResults: Record<string, { loading?: number; weight?: number; loadingT?: number; weightT?: number }> = {}

  const pls = source instanceof Map ? source.get('pls-sem')?.results : (source as any)?.results ?? source
  const bootstrap = source instanceof Map ? source.get('bootstrap')?.results : undefined
  const plspredict = source instanceof Map ? source.get('plspredict')?.results : undefined

  toRows((pls as any)?.quality_criteria?.r_square).forEach((row) => {
    const construct = resolveConstructName(readLabel(row), savedModel)
    const r2 = toNumber(readValue(row, ['R²', 'R2', 'r2', 'R square', 'r square']))
    const r2Adj = toNumber(readValue(row, ['Adjusted R²', 'Adjusted R2', 'Adjusted R Square', 'R2_adj', 'r2_adjusted', 'R²adj', 'R2 adjusted', 'R Square Adjusted', 'R square adjusted', 'R-square adjusted']))
    const partial: Record<string, number> = {}
    if (r2 != null) partial.r2 = r2
    if (r2Adj != null) partial.r2Adj = r2Adj
    setAliasedValue(constructScores, nameById, idByName, construct, partial)
  })

  toRows((plspredict as any)?.final_results?.plspredict_lv_summary ?? (pls as any)?.quality_criteria?.q_square).forEach((row) => {
    const construct = resolveConstructName(readLabel(row), savedModel)
    const q2 = toNumber(readValue(row, ['Q2predict', 'Q²predict', 'Q2.predict', 'q2', 'q2predict', 'Q2', 'Q²']))
    if (q2 != null) setAliasedValue(constructScores, nameById, idByName, construct, { q2 })
  })

  forEachReliabilityValue(pls, savedModel, (construct, metric, value) => {
    const numeric = toNumber(value)
    if (numeric == null) return
    const partialKey = metric === 'cr' ? 'rhoC' : metric
    setAliasedValue(constructScores, nameById, idByName, construct, { [partialKey]: numeric })
  })

  const pathRows = toRows((bootstrap as any)?.final_results?.path_coefficients ?? (pls as any)?.final_results?.path_coefficients)
  pathRows.forEach((row, index) => {
    const parts = getPathParts(row, savedModel, `Path ${index + 1}`)
    const coef = toNumber(readValue(row, ['Original Est.', 'Original.Est.', 'Original Estimate', 'Original sample', 'Original sample (O)', 'O', 'coefficient', 'estimate']))
    const tStat = toNumber(readValue(row, ['T Stat.', 'T.Stat.', 'T Statistic', 'T statistics', 'T statistics (|O/STDEV|)', 'T Value', 'T values', 't_value', 't']))
    const pValRaw = readPValue(row) ?? approximateTwoTailedPValueFromT(tStat)
    const pValue = parsePValue(pValRaw)
    const partial: Record<string, number> = {}
    if (coef != null) partial.coef = coef
    if (tStat != null) partial.tStat = tStat
    if (pValue != null) partial.pValue = pValue
    if (Object.keys(partial).length) setPathResult(pathResults, nameById, idByName, parts.from, parts.to, partial)
  })

  const applyPathEffectRows = (rows: Array<Record<string, unknown>>, field: 'totalEffect' | 'indirectEffect') => {
    rows.forEach((row, index) => {
      const parts = getPathParts(row, savedModel, `Path ${index + 1}`)
      const directValue = toNumber(readValue(row, ['Original Est.', 'Original.Est.', 'Original Estimate', 'coefficient', 'estimate', 'value']))
      if (parts.from && parts.to && directValue != null) {
        setPathResult(pathResults, nameById, idByName, parts.from, parts.to, { [field]: directValue })
        return
      }

      const source = resolveConstructName(readValue(row, ['row_name', 'row', 'from', 'source', 'predictor']), savedModel)
      if (!source) return
      Object.entries(row).forEach(([key, value]) => {
        if (isOmittedKey(key)) return
        const numericValue = toNumber(value)
        if (numericValue == null || numericValue === 0) return
        setPathResult(pathResults, nameById, idByName, source, resolveConstructName(key, savedModel), { [field]: numericValue })
      })
    })
  }

  applyPathEffectRows(toRows((pls as any)?.final_results?.total_effects), 'totalEffect')
  applyPathEffectRows(toRows((pls as any)?.final_results?.total_indirect_effects), 'indirectEffect')

  buildFSquareLookup(pls, bootstrap, savedModel).forEach((fSquare, key) => {
    const [fromKey, toKey] = key.split('\u0000')
    const path = toRows((pls as any)?.quality_criteria?.f_square)
      .flatMap((row) => {
        const endogenous = resolveConstructName(readValue(row, ['row_name', 'row', 'endogenous', 'target', 'Construct']), savedModel)
        return Object.keys(row)
          .filter((entryKey) => !isOmittedKey(entryKey))
          .map((entryKey) => ({ from: resolveConstructName(entryKey, savedModel), to: endogenous }))
      })
      .find((entry) => pathKey(entry.from, entry.to) === `${fromKey}\u0000${toKey}`)
    if (path) setPathResult(pathResults, nameById, idByName, path.from, path.to, { fSquare })
  })

  parseOuterLoadings(bootstrap ?? pls, savedModel).forEach((row) => {
    const constructId = idByName.get(row.construct)
    const nameKey = `${row.construct}::${row.indicator}`
    const tStat = toNumber((row as any).tStatistic)
    const partial: { loading?: number; loadingT?: number } = {}
    if (row.loading != null) partial.loading = row.loading
    if (tStat != null) partial.loadingT = tStat
    measurementResults[nameKey] = { ...(measurementResults[nameKey] ?? {}), ...partial }
    if (constructId) {
      const idKey = `${constructId}::${row.indicator}`
      measurementResults[idKey] = { ...(measurementResults[idKey] ?? {}), ...partial }
    }
  })

  parseOuterWeights(bootstrap ?? pls, savedModel).forEach((row) => {
    const constructId = idByName.get(row.construct)
    const nameKey = `${row.construct}::${row.indicator}`
    const tStat = toNumber((row as any).tStatistic)
    const partial: { weight?: number; weightT?: number } = {}
    if (row.weight != null) partial.weight = row.weight
    if (tStat != null) partial.weightT = tStat
    measurementResults[nameKey] = { ...(measurementResults[nameKey] ?? {}), ...partial }
    if (constructId) {
      const idKey = `${constructId}::${row.indicator}`
      measurementResults[idKey] = { ...(measurementResults[idKey] ?? {}), ...partial }
    }
  })

  const latentRows = toRows((pls as any)?.final_results?.latent_variables)
    .map((row) => {
      const out: Record<string, number> = {}
      Object.entries(row).forEach(([key, value]) => {
        if (isOmittedKey(key)) return
        const numericValue = toNumber(value)
        if (numericValue != null) out[resolveConstructName(key, savedModel)] = numericValue
      })
      return out
    })
    .filter((row) => Object.keys(row).length)

  if (latentRows.length >= 2 && savedModel?.paths?.length) {
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    const covariance = (a: number[], b: number[]) => {
      if (a.length < 2 || b.length < 2 || a.length !== b.length) return null
      const meanA = mean(a)
      const meanB = mean(b)
      return a.reduce((sum, _, index) => sum + (a[index] - meanA) * (b[index] - meanB), 0) / (a.length - 1)
    }

    savedModel.paths.forEach((path) => {
      const from = resolveConstructName(path.from, savedModel)
      const to = resolveConstructName(path.to, savedModel)
      if (!from || !to) return
      const sourceValues: number[] = []
      const targetValues: number[] = []
      latentRows.forEach((row) => {
        const sourceValue = row[from]
        const targetValue = row[to]
        if (Number.isFinite(sourceValue) && Number.isFinite(targetValue)) {
          sourceValues.push(sourceValue)
          targetValues.push(targetValue)
        }
      })

      const cov = covariance(sourceValues, targetValues)
      const sourceVariance = covariance(sourceValues, sourceValues)
      const targetVariance = covariance(targetValues, targetValues)
      const correlation = cov != null && sourceVariance != null && targetVariance != null && sourceVariance > 0 && targetVariance > 0
        ? cov / (Math.sqrt(sourceVariance) * Math.sqrt(targetVariance))
        : null
      const partial: Record<string, number> = {}
      if (cov != null) partial.covariance = cov
      if (correlation != null) partial.correlation = correlation
      setPathResult(pathResults, nameById, idByName, from, to, partial)
    })
  }

  return { constructScores, pathResults, measurementResults }
}

export function mapTarkConstructDiagramMode(mode: string): string {
  if (mode === 'AVE') return 'Average variance extracted (AVE)'
  if (mode === 'Composite reliability') return 'Composite reliability (rhoc)'
  return mode
}
