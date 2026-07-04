import { type AnalysisMode } from './panelCatalog'

export type ResultsTableView = 'matrix' | 'list'

export type BootstrapIntervalView = 'stats' | 'ci' | 'bc'

export interface BootstrapSignificanceRow {
  label: string
  originalEst: number | null
  bootstrapMean: number | null
  bootstrapSD: number | null
  tStat: number | null
  pValue: number | string | null
  bias: number | null
  ciLower: number | null
  ciUpper: number | null
  bcCiLower: number | null
  bcCiUpper: number | null
}

const BOOTSTRAP_SIGNIFICANCE_PANELS = new Set([
  'path-coef',
  'total-indirect',
  'specific-indirect',
  'total-effects',
  'outer-loadings',
  'outer-weights',
])

const PANEL_TABLE_VIEWS: Record<string, ResultsTableView[]> = {
  'path-coef': ['matrix', 'list'],
  'outer-loadings': ['list', 'matrix'],
  'outer-weights': ['list', 'matrix'],
}

const DEFAULT_TABLE_VIEWS: Partial<Record<string, ResultsTableView>> = {
  'path-coef': 'matrix',
  'outer-loadings': 'list',
  'outer-weights': 'list',
}

export function getPanelTableViews(panelId: string, mode?: AnalysisMode): ResultsTableView[] {
  if (mode === 'bootstrap' && isBootstrapSignificancePanel(panelId)) {
    return []
  }
  return [...(PANEL_TABLE_VIEWS[panelId] ?? [])]
}

export function getDefaultPanelTableView(panelId: string): ResultsTableView {
  return DEFAULT_TABLE_VIEWS[panelId] ?? 'list'
}

interface MatrixRowShape {
  id: string
  data: Record<string, number | null>
}

export function buildMeasurementMatrix(rows: Array<{ indicator: string; construct: string; loading: number }>): {
  cols: string[]
  matRows: MatrixRowShape[]
} {
  const cols: string[] = []
  const rowMap = new Map<string, Record<string, number | null>>()

  rows.forEach((row) => {
    const indicator = String(row.indicator ?? '').trim()
    const construct = String(row.construct ?? '').trim()
    const loading = Number(row.loading)
    if (!indicator || !construct || !Number.isFinite(loading)) return

    if (!cols.includes(construct)) cols.push(construct)
    if (!rowMap.has(indicator)) rowMap.set(indicator, {})
    rowMap.get(indicator)![construct] = loading
  })

  const matRows = Array.from(rowMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, values]) => ({
      id,
      data: Object.fromEntries(cols.map((col) => [col, values[col] ?? null])),
    }))

  return { cols, matRows }
}

export function normalizeIndexedTableLabel(value: unknown, candidates: string[], numericBase: 0 | 1 = 1): string {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) return rawValue
  if (/^\d+$/.test(rawValue)) {
    const candidateIndex = Number(rawValue) - numericBase
    return candidateIndex >= 0 ? candidates[candidateIndex] ?? rawValue : rawValue
  }
  const vMatch = rawValue.match(/^v(\d+)$/i)
  if (vMatch) {
    return candidates[Math.max(Number(vMatch[1]) - 1, 0)] ?? rawValue
  }
  return rawValue
}

export function isBootstrapSignificancePanel(panelId: string): boolean {
  return BOOTSTRAP_SIGNIFICANCE_PANELS.has(panelId)
}

function normalizeMetricKey(key: string): string {
  return String(key ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function readBootstrapValue(row: Record<string, unknown>, candidates: string[]): unknown {
  const normalizedCandidates = new Set(candidates.map(normalizeMetricKey))
  for (const [key, value] of Object.entries(row)) {
    if (normalizedCandidates.has(normalizeMetricKey(key))) return value
  }
  return undefined
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'string' && !value.trim()) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export interface PanelCellDisplayContext {
  rowLabel?: unknown
  indirectEffectPairs?: Set<string> | null
  totalEffectPairs?: Set<string> | null
}

function isRowLabelHeader(header: string | undefined): boolean {
  const normalizedHeader = String(header ?? '').trim().toLowerCase()
  return ['row', 'row_name', 'rowname', '_row', 'key'].includes(normalizedHeader)
}

function panelPairKey(source: unknown, target: unknown): string {
  return `${String(source ?? '').trim()}\u0000${String(target ?? '').trim()}`
}

function buildReachablePairLookup(
  savedModel: {
    constructs?: Array<{ id?: unknown; name?: unknown }>
    paths?: Array<{ from?: unknown; to?: unknown }>
  } | null | undefined,
  minDepth: number
): Set<string> {
  const nameById = new Map<string, string>()
  const nodes = new Set<string>()

  ;(savedModel?.constructs ?? []).forEach((construct) => {
    const id = String(construct?.id ?? '').trim()
    const name = String(construct?.name ?? id).trim()
    if (!name) return
    nodes.add(name)
    if (id) nameById.set(id, name)
  })

  const resolveNode = (value: unknown): string => {
    const raw = String(value ?? '').trim()
    return nameById.get(raw) ?? raw
  }

  const adjacency = new Map<string, Set<string>>()
  ;(savedModel?.paths ?? []).forEach((path) => {
    const from = resolveNode(path?.from)
    const to = resolveNode(path?.to)
    if (!from || !to || from === to) return
    nodes.add(from)
    nodes.add(to)
    if (!adjacency.has(from)) adjacency.set(from, new Set())
    adjacency.get(from)?.add(to)
  })

  const pairs = new Set<string>()
  nodes.forEach((source) => {
    const visit = (current: string, depth: number, seen: Set<string>) => {
      ;(adjacency.get(current) ?? new Set<string>()).forEach((target) => {
        if (!target || target === source) return
        const nextDepth = depth + 1
        if (nextDepth >= minDepth) pairs.add(panelPairKey(source, target))
        if (seen.has(target)) return
        const nextSeen = new Set(seen)
        nextSeen.add(target)
        visit(target, nextDepth, nextSeen)
      })
    }

    visit(source, 0, new Set([source]))
  })

  return pairs
}

export function buildIndirectEffectPairLookup(savedModel?: {
  constructs?: Array<{ id?: unknown; name?: unknown }>
  paths?: Array<{ from?: unknown; to?: unknown }>
} | null): Set<string> {
  return buildReachablePairLookup(savedModel, 2)
}

export function buildTotalEffectPairLookup(savedModel?: {
  constructs?: Array<{ id?: unknown; name?: unknown }>
  paths?: Array<{ from?: unknown; to?: unknown }>
} | null): Set<string> {
  return buildReachablePairLookup(savedModel, 1)
}

export function shouldRenderBlankPanelCell(
  panelId: string | undefined,
  header: string | undefined,
  value: unknown,
  context?: PanelCellDisplayContext
): boolean {
  if (isRowLabelHeader(header)) return false

  if (panelId === 'f-square') {
    if (value == null) return true
    if (typeof value === 'string' && !value.trim()) return true

    const numeric = Number(value)
    return Number.isFinite(numeric) && numeric === 0
  }

  if (panelId !== 'total-indirect' && panelId !== 'total-effects') return false
  if (value == null) return true
  if (typeof value === 'string' && !value.trim()) return true

  const source = String(context?.rowLabel ?? '').trim()
  const target = String(header ?? '').trim()
  if (!source || !target) return true

  if (panelId === 'total-indirect') {
    const indirectEffectPairs = context?.indirectEffectPairs
    if (indirectEffectPairs?.size && !indirectEffectPairs.has(panelPairKey(source, target))) return true
  }

  if (panelId === 'total-effects') {
    const totalEffectPairs = context?.totalEffectPairs
    if (totalEffectPairs?.size && !totalEffectPairs.has(panelPairKey(source, target))) return true
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric !== 0) return false

  if (panelId === 'total-indirect') return context?.indirectEffectPairs?.size ? false : numeric === 0
  if (panelId === 'total-effects') return context?.totalEffectPairs?.size ? false : numeric === 0
  return numeric === 0
}

function computeBootstrapBias(row: Record<string, unknown>, originalEst: number | null, bootstrapMean: number | null): number | null {
  const explicitBias = toFiniteNumber(readBootstrapValue(row, [
    'Bias',
    'bias',
    'Bootstrap Bias',
    'Bootstrap.Bias',
    'Mean Bias',
    'Mean.Bias',
  ]))
  if (explicitBias != null) return explicitBias
  if (originalEst == null || bootstrapMean == null) return null
  return Math.round((bootstrapMean - originalEst) * 1e12) / 1e12
}

function readIntervalPercentile(key: string): number | null {
  const rawKey = String(key ?? '')
  const percentMatch = rawKey.match(/(\d+(?:[.,]\d+)?)\s*%/)
  const leadingMatch = rawKey.match(/^\s*x?(\d+(?:[.,]\d+)?)[^a-z0-9]*ci\b/i)
  const ciFirstMatch = rawKey.match(/\bci[^0-9]+(\d+(?:[.,]\d+)?)/i)
  const match = percentMatch ?? leadingMatch ?? ciFirstMatch
  if (!match) return null

  const percentile = Number(String(match[1]).replace(',', '.'))
  return Number.isFinite(percentile) && percentile > 0 && percentile < 100 ? percentile : null
}

function readBootstrapIntervalValue(
  row: Record<string, unknown>,
  candidates: string[],
  options: { biasCorrected: boolean; side: 'lower' | 'upper' }
): number | null {
  const explicitValue = toFiniteNumber(readBootstrapValue(row, candidates))
  if (explicitValue != null) return explicitValue

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeMetricKey(key)
    if (!normalizedKey.includes('ci') && !normalizedKey.includes('confidenceinterval')) continue

    const isBiasCorrected = normalizedKey.includes('bc') || normalizedKey.includes('biascorrected')
    if (isBiasCorrected !== options.biasCorrected) continue

    const percentile = readIntervalPercentile(key)
    if (percentile == null) continue
    if (options.side === 'lower' && percentile >= 50) continue
    if (options.side === 'upper' && percentile <= 50) continue

    const numericValue = toFiniteNumber(value)
    if (numericValue != null) return numericValue
  }

  return null
}

export function normalizeBootstrapSignificanceRows(rows: Array<Record<string, unknown>>): BootstrapSignificanceRow[] {
  return (rows ?? []).map((row) => {
    const label = String(
      row.path ??
      row.Path ??
      row.relationship ??
      row.row ??
      row.row_name ??
      row.rowName ??
      row.Row ??
      row.ROW ??
      row._row ??
      ''
    ).trim()

    const pValue = readBootstrapValue(row, [
      'Bootstrap P Val',
      'Bootstrap.P.Val',
      'Bootstrap P Value',
      'P Value',
      'P.Value',
      'p_value',
      'pvalue',
    ])

    const originalEst = toFiniteNumber(readBootstrapValue(row, [
      'Original Est.',
      'Original.Est.',
      'Original Estimate',
      'Original sample',
      'Original Sample',
      'coefficient',
      'coef',
      'estimate',
    ]))
    const bootstrapMean = toFiniteNumber(readBootstrapValue(row, [
      'Bootstrap Mean',
      'Bootstrap.Mean',
      'Sample Mean',
      'Sample mean',
      'Mean',
      'M',
      'boot_mean',
      'bootstrap_mean',
    ]))

    return {
      label,
      originalEst,
      bootstrapMean,
      bootstrapSD: toFiniteNumber(readBootstrapValue(row, [
        'Bootstrap SD',
        'Bootstrap.SD',
        'Standard Deviation',
        'Std. Deviation',
        'STDEV',
        'SDEV',
        'boot_sd',
        'bootstrap_sd',
      ])),
      tStat: toFiniteNumber(readBootstrapValue(row, [
        'T Stat.',
        'T.Stat.',
        'T Statistic',
        'T Statistics',
        'T Value',
        't_statistic',
        't_value',
      ])),
      pValue: pValue == null || (typeof pValue === 'string' && !pValue.trim()) ? null : (toFiniteNumber(pValue) ?? String(pValue)),
      bias: computeBootstrapBias(row, originalEst, bootstrapMean),
      ciLower: readBootstrapIntervalValue(row, [
        '2.5% CI',
        '2.5%.CI',
        'X2.5..CI',
        'CI 2.5%',
        'CI 2.5',
        'Lower CI',
        'lower',
        'ci25',
        'ci_25',
      ], { biasCorrected: false, side: 'lower' }),
      ciUpper: readBootstrapIntervalValue(row, [
        '97.5% CI',
        '97.5%.CI',
        'X97.5..CI',
        'CI 97.5%',
        'CI 97.5',
        'Upper CI',
        'upper',
        'ci975',
        'ci_975',
      ], { biasCorrected: false, side: 'upper' }),
      bcCiLower: readBootstrapIntervalValue(row, [
        '2.5% CI (BC)',
        '2.5%.CI.BC',
        'X2.5..CI.BC',
        'BC 2.5% CI',
        'Bias Corrected 2.5% CI',
        'bias_corrected_ci_25',
        'ci_25_bc',
      ], { biasCorrected: true, side: 'lower' }),
      bcCiUpper: readBootstrapIntervalValue(row, [
        '97.5% CI (BC)',
        '97.5%.CI.BC',
        'X97.5..CI.BC',
        'BC 97.5% CI',
        'Bias Corrected 97.5% CI',
        'bias_corrected_ci_975',
        'ci_975_bc',
      ], { biasCorrected: true, side: 'upper' }),
    }
  }).filter((row) => row.label || row.originalEst != null || row.bootstrapMean != null)
}

export function buildConstructIndicatorLookup(savedModel?: {
  constructs?: Array<{
    id?: unknown
    name?: unknown
    indicators?: Array<string | { name?: unknown }>
  }>
} | null): Map<string, string[]> {
  const lookup = new Map<string, string[]>()

  ;(savedModel?.constructs ?? []).forEach((construct, index) => {
    const indicators = (construct.indicators ?? [])
      .map((indicator) => typeof indicator === 'string' ? indicator : String(indicator?.name ?? '').trim())
      .filter((indicator) => indicator.length > 0)

    if (!indicators.length) return

    const keys = [
      String(construct.name ?? '').trim(),
      String(construct.id ?? '').trim(),
      String(index),
      `v${index + 1}`,
    ].filter((key) => key.length > 0)

    keys.forEach((key) => lookup.set(key, indicators))
  })

  return lookup
}

function unwrapSummaryRow(row: Record<string, unknown>): Record<string, unknown> {
  const value = row.value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return row

  const nested = value as Record<string, unknown>
  const fallbackLabel = row.key ?? row.row ?? row.row_name ?? row.rowName ?? row.Row ?? row.ROW ?? row._row
  const hasNestedLabel = Boolean(getSummaryLabel(nested))
  return hasNestedLabel || fallbackLabel == null
    ? nested
    : { ...nested, row: fallbackLabel }
}

function getSummaryLabel(row: Record<string, unknown>): string {
  const candidates = [
    row.Indicator,
    row.indicator,
    row.Construct,
    row.construct,
    row.label,
    row.Label,
    row.Item,
    row.item,
    row.MV,
    row.mv,
    row.name,
    row.Name,
    row.row,
    row.row_name,
    row.rowName,
    row.key,
  ]
  return String(candidates.find((value) => typeof value === 'string' && value.trim()) ?? '').trim()
}

function readNumericMetric(row: Record<string, unknown>, keys: string[]): number | null {
  const normalizedKeys = new Set(keys.map(normalizeMetricKey))
  for (const [key, value] of Object.entries(row)) {
    if (!normalizedKeys.has(normalizeMetricKey(key))) continue
    if (value == null) continue
    if (typeof value === 'string' && !value.trim()) continue
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return null
}

const Q2_PREDICT_KEYS = ['Q2predict', 'Q²predict', 'Q²_predict', 'Q2_predict', 'Q2.predict', 'q2predict', 'q2']
const PLS_RMSE_KEYS = ['PLS-SEM_RMSE', 'PLS_SEM_RMSE', 'PLS.SEM.RMSE', 'PLS RMSE', 'RMSE_PLS', 'PLS.RMSE', 'pls_rmse', 'plssemrmse']
const PLS_MAE_KEYS = ['PLS-SEM_MAE', 'PLS_SEM_MAE', 'PLS.SEM.MAE', 'PLS MAE', 'MAE_PLS', 'PLS.MAE', 'pls_mae', 'plssemmae']
const LM_RMSE_KEYS = ['LM_RMSE', 'LM RMSE', 'RMSE_LM', 'LM.RMSE', 'lm_rmse', 'lmrmse']
const LM_MAE_KEYS = ['LM_MAE', 'LM MAE', 'MAE_LM', 'LM.MAE', 'lm_mae', 'lmmae']

function numericScalar(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'string' && !value.trim()) return null
  if (typeof value === 'object') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function metricMatches(metric: unknown, keys: string[]): boolean {
  if (metric == null) return false
  const normalized = normalizeMetricKey(String(metric))
  return keys.some((key) => normalizeMetricKey(key) === normalized)
}

function readLongMetricValue(row: Record<string, unknown>, keys: string[]): number | null {
  const metric = row.Metric ?? row.metric ?? row.Measure ?? row.measure ?? row.Statistic ?? row.statistic
  if (!metricMatches(metric, keys)) return null
  return numericScalar(row.Value ?? row.value ?? row.Estimate ?? row.estimate)
}

function expandColumnarSummaryRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const columnEntries = rows
    .map((row) => {
      const key = String(row.key ?? row.column ?? row.name ?? '').trim()
      return key ? { key, value: row.value } : null
    })
    .filter((entry): entry is { key: string; value: unknown } => entry !== null)

  if (columnEntries.length !== rows.length) return rows
  const arrayColumns = columnEntries.filter((entry) => Array.isArray(entry.value))
  if (!arrayColumns.length) return rows

  const rowCount = Math.max(...arrayColumns.map((entry) => (entry.value as unknown[]).length))
  if (!Number.isFinite(rowCount) || rowCount <= 0) return rows

  const expandedRows: Array<Record<string, unknown>> = []
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const expandedRow: Record<string, unknown> = {}
    columnEntries.forEach(({ key, value }) => {
      expandedRow[key] = Array.isArray(value) ? value[rowIndex] : value
    })
    expandedRows.push(expandedRow)
  }

  return expandedRows
}

function expandPlsPredictSummaryRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return expandColumnarSummaryRows(rows).flatMap((row) => {
    const metricKey = row.key ?? row.metric ?? row.Metric
    const value = row.value
    const metricLike = metricMatches(metricKey, [
      ...Q2_PREDICT_KEYS,
      ...PLS_RMSE_KEYS,
      ...PLS_MAE_KEYS,
      ...LM_RMSE_KEYS,
      ...LM_MAE_KEYS,
    ])

    if (!metricLike || !value || typeof value !== 'object' || Array.isArray(value)) return [row]

    const nested = value as Record<string, unknown>
    return Object.entries(nested).flatMap(([label, metricValue]) => {
      const numeric = numericScalar(metricValue)
      return numeric == null
        ? []
        : [{ Indicator: label, Metric: metricKey, Value: numeric }]
    })
  })
}

export function extractQ2PredictRows(rows: Array<Record<string, unknown>>): Array<{ label: string; q2Predict: number | null }> {
  const byLabel = new Map<string, number | null>()
  expandPlsPredictSummaryRows(rows).forEach((row) => {
    const summaryRow = unwrapSummaryRow(row)
    const label = getSummaryLabel(summaryRow)
    if (!label) return
    const q2Predict = readNumericMetric(row, Q2_PREDICT_KEYS)
      ?? readNumericMetric(summaryRow, Q2_PREDICT_KEYS)
      ?? readLongMetricValue(summaryRow, Q2_PREDICT_KEYS)
    // Include the row as long as it has a label AND at least one metric present
    const hasAnyMetric = q2Predict != null
      || readNumericMetric(row, PLS_RMSE_KEYS) != null
      || readNumericMetric(summaryRow, PLS_RMSE_KEYS) != null
      || readNumericMetric(row, PLS_MAE_KEYS) != null
      || readNumericMetric(summaryRow, PLS_MAE_KEYS) != null
    if (hasAnyMetric && !byLabel.has(label)) {
      byLabel.set(label, q2Predict ?? null)
    }
  })
  return Array.from(byLabel.entries()).map(([label, q2Predict]) => ({ label, q2Predict }))
}

export function extractPlsLmComparisonRows(rows: Array<Record<string, unknown>>): Array<{
  label: string
  plsRmse: number | null
  plsMae: number | null
  lmRmse: number | null
  lmMae: number | null
}> {
  const byLabel = new Map<string, { label: string; plsRmse: number | null; plsMae: number | null; lmRmse: number | null; lmMae: number | null }>()
  expandPlsPredictSummaryRows(rows).forEach((row) => {
    const summaryRow = unwrapSummaryRow(row)
    const label = getSummaryLabel(summaryRow)
    if (!label) return

    const existing = byLabel.get(label) ?? {
      label,
      plsRmse: null,
      plsMae: null,
      lmRmse: null,
      lmMae: null,
    }

    existing.plsRmse ??= readNumericMetric(summaryRow, PLS_RMSE_KEYS) ?? readLongMetricValue(summaryRow, PLS_RMSE_KEYS)
    existing.plsMae ??= readNumericMetric(summaryRow, PLS_MAE_KEYS) ?? readLongMetricValue(summaryRow, PLS_MAE_KEYS)
    existing.lmRmse ??= readNumericMetric(summaryRow, LM_RMSE_KEYS) ?? readLongMetricValue(summaryRow, LM_RMSE_KEYS)
    existing.lmMae ??= readNumericMetric(summaryRow, LM_MAE_KEYS) ?? readLongMetricValue(summaryRow, LM_MAE_KEYS)

    byLabel.set(label, existing)
  })
  return Array.from(byLabel.values()).filter((row) =>
    row.plsRmse != null || row.plsMae != null || row.lmRmse != null || row.lmMae != null
  )
}

export function formatPreciseNumber(value: unknown, decimals = 3): string {
  if (value == null) return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return typeof value === 'string' && value.trim() ? value.trim() : '—'

  const rounded = numeric.toFixed(decimals)
  if (numeric !== 0 && Number(rounded) === 0) {
    return numeric.toFixed(Math.min(decimals + 3, 6))
  }

  return rounded
}

function normalizeBottleneckKey(key?: string): string {
  return String(key ?? '').trim().replace(/[\s_.()%/-]+/g, '').toLowerCase()
}

export function isBottleneckOutcomeField(header?: string): boolean {
  return [
    'outcomelevel',
    'outcome',
    'desiredoutcome',
    'desiredoutcomelevel',
    'targetlevel',
    'performancelevel',
    'level',
  ].includes(normalizeBottleneckKey(header))
}

export function isBottleneckMetaField(header?: string): boolean {
  return ['method', 'ceiling', 'ceilingline', 'ceilingmethod'].includes(normalizeBottleneckKey(header))
}

function isBottleneckMissingValue(value: unknown): boolean {
  if (value == null) return true
  const text = String(value).trim()
  if (!text) return true
  return ['NN', '-', '—', 'NA', 'N/A', 'NULL'].includes(text.toUpperCase())
}

function isOutcomeLevelSeries(values: unknown[]): boolean {
  const numericValues = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))

  if (numericValues.length < Math.min(3, values.length)) return false
  if (numericValues.some((value) => value < 0 || value > 100)) return false

  for (let index = 1; index < numericValues.length; index += 1) {
    if (numericValues[index] < numericValues[index - 1]) return false
  }

  return new Set(numericValues).size >= Math.min(3, numericValues.length)
}

function bottleneckCeilingLabel(value: unknown): string {
  const text = String(value ?? '').trim()
  const normalized = normalizeBottleneckKey(text)
  if (normalized === 'cefdh') return 'CE-FDH'
  if (normalized === 'crfdh') return 'CR-FDH'
  return text
}

function inferBottleneckOutcomeKey(rows: Array<Record<string, unknown>>): { key: string; restoreAsCondition: boolean } | null {
  if (!rows.length) return null

  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
    .filter((key) => !isBottleneckMetaField(key))
  const explicitKey = keys.find((key) => isBottleneckOutcomeField(key) || normalizeBottleneckKey(key) === 'rowname' || normalizeBottleneckKey(key) === 'row')

  if (explicitKey) return { key: explicitKey, restoreAsCondition: false }

  const firstDataKey = keys[0]
  if (!firstDataKey) return null

  const firstColumnValues = rows.map((row) => row[firstDataKey])
  return isOutcomeLevelSeries(firstColumnValues)
    ? { key: firstDataKey, restoreAsCondition: true }
    : null
}

export function normalizeBottleneckRowsForDisplay(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const allKeys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const hasExplicitOutcomeKey = allKeys.some((key) =>
    isBottleneckOutcomeField(key) || normalizeBottleneckKey(key) === 'rowname' || normalizeBottleneckKey(key) === 'row'
  )

  if (!hasExplicitOutcomeKey) {
    const groupKeys = rows.map((row) => bottleneckCeilingLabel(row.Ceiling ?? row.ceiling ?? row.Method ?? row.method ?? 'Bottleneck') || 'Bottleneck')
    const uniqueGroupKeys = Array.from(new Set(groupKeys))
    if (uniqueGroupKeys.length > 1) {
      return uniqueGroupKeys.flatMap((groupKey) =>
        normalizeBottleneckRowsForDisplay(rows.filter((_, index) => groupKeys[index] === groupKey))
      )
    }
  }

  const outcomeKeyInfo = inferBottleneckOutcomeKey(rows)
  if (!outcomeKeyInfo) return rows

  const conditionKeys = allKeys.filter((key) =>
    key !== outcomeKeyInfo.key &&
    !isBottleneckMetaField(key) &&
    !(isBottleneckOutcomeField(key) || normalizeBottleneckKey(key) === 'rowname' || normalizeBottleneckKey(key) === 'row')
  )
  const orderedConditionKeys = outcomeKeyInfo.restoreAsCondition
    ? [outcomeKeyInfo.key, ...conditionKeys.filter((key) => key !== outcomeKeyInfo.key)]
    : conditionKeys

  return rows.map((row) => {
    const rawMethod = row.Method ?? row.method
    const rawCeiling = row.Ceiling ?? row.ceiling ?? row.Ceiling_Line ?? row.ceiling_line
    const methodLooksLikeCeiling = /(?:ce|cr)[\s_-]*fdh/i.test(String(rawMethod ?? ''))
    const ceiling = bottleneckCeilingLabel(rawCeiling ?? (methodLooksLikeCeiling ? rawMethod : ''))
    const normalized: Record<string, unknown> = {
      Method: 'NCA',
      Ceiling: ceiling || bottleneckCeilingLabel(rawMethod) || '—',
      Outcome_Level: row[outcomeKeyInfo.key],
    }

    orderedConditionKeys.forEach((key) => {
      normalized[key] = key === outcomeKeyInfo.key ? 'NN' : row[key]
    })

    return normalized
  })
}

export function formatBottleneckOutcomeLevel(value: unknown): string {
  if (value == null || (typeof value === 'string' && !value.trim())) return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value).trim()
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2)
}

export function formatBottleneckDisplayValue(value: unknown): string {
  if (isBottleneckMissingValue(value)) return 'NN'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value).trim()
  return numeric.toFixed(2)
}
