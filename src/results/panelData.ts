import { type AnalysisMode } from './panelCatalog'

const PANEL_DATA_PATHS: Record<AnalysisMode, Record<string, string>> = {
  'pls-sem': {
    'path-coef': 'final_results.path_coefficients',
    'total-indirect': 'final_results.total_indirect_effects',
    'specific-indirect': 'final_results.specific_indirect_effects',
    'total-effects': 'final_results.total_effects',
    'outer-loadings': 'final_results.outer_loadings',
    'outer-weights': 'final_results.outer_weights',
    'reliability': 'quality_criteria.reliability',
    'discriminant': 'quality_criteria.discriminant_validity',
    'cross-loadings': 'quality_criteria.cross_loadings',
    'r-square': 'quality_criteria.r_square',
    'f-square': 'quality_criteria.f_square',
    'vif': 'quality_criteria.vif',
    'model-fit': 'quality_criteria.model_fit',
    'model-select': 'quality_criteria.model_selection_criteria',
    'moderation-summary': 'final_results.moderation_summary',
    'moderation-slopes': 'final_results.moderation_slopes',
    'moderation-slope-chart': 'charts.moderation_slope_chart',
    'moderation-r2-change': 'quality_criteria.moderation_r2_change',
    'latent-variables': 'final_results.latent_variables',
    'indicator-correlations': 'model_and_data.indicator_data_correlations',
    'indicator-original': 'model_and_data.indicator_data_original',
    'indicator-standardised': 'model_and_data.indicator_data_standardized',
    'execution-log': 'algorithm.execution_log',
  },
  bootstrap: {
    'path-coef': 'final_results.path_coefficients',
    'total-indirect': 'final_results.total_indirect_effects',
    'specific-indirect': 'final_results.specific_indirect_effects',
    'total-effects': 'final_results.total_effects',
    'outer-loadings': 'final_results.outer_loadings',
    'outer-weights': 'final_results.outer_weights',
    'htmt-confidence-intervals': 'quality_criteria.htmt_confidence_intervals',
    'reliability': 'quality_criteria.reliability',
    'discriminant': 'quality_criteria.discriminant_validity',
    'cross-loadings': 'quality_criteria.cross_loadings',
    'r-square': 'quality_criteria.r_square',
    'f-square': 'quality_criteria.f_square',
    'vif': 'quality_criteria.vif',
    'moderation-bootstrap': 'final_results.moderation_bootstrap',
    'execution-log': 'execution_log',
  },
  plspredict: {
    'plspredict-mv-summary': 'final_results.plspredict_mv_summary',
    'plspredict-lv-summary': 'final_results.plspredict_lv_summary',
    'pls-lm-comparison': 'final_results.plspredict_mv_summary',
    'q2-predict': 'final_results.plspredict_mv_summary',
    'mv-predictions-errors': 'final_results.mv_predictions_and_errors',
    'lv-predictions-errors': 'final_results.lv_predictions_and_errors',
    'plsem-mv-error-hist': 'histograms.plsem_mv_error_histogram',
    'plsem-lv-error-hist': 'histograms.plsem_lv_error_histogram',
    'cvpat-lv-summary': 'final_results.cvpat_lv_summary',
    'execution-log': 'algorithm.execution_log',
  },
  advanced: {
    'path-coef': 'final_results.path_coefficients',
    'outer-loadings': 'final_results.outer_loadings',
    'model-fit': 'quality_criteria.model_fit',
    'priority-map': 'final_results.priority_map',
    'construct-table': 'final_results.construct_table',
    'necessity-check': 'final_results.necessity_check',
    'ceiling-lines': 'final_results.ceiling_lines',
    'bottleneck-table': 'final_results.bottleneck_table',
    'cipma-priorities': 'final_results.cipma_priorities',
    'execution-log': 'algorithm.execution_log',
  },
  permutation: {
    'compositional-invariance': 'compositionalInvariance',
    'invariance-classification': 'invarianceClassification',
    'execution-log': 'execution_log',
  },
  mga: {},
}

const BOOTSTRAP_BASE_MODEL_REFERENCE_PANELS = new Set([
  'reliability',
  'discriminant',
  'cross-loadings',
  'r-square',
  'f-square',
  'vif',
])

function getPanelDataPath(mode: AnalysisMode, panelId: string): string | undefined {
  return PANEL_DATA_PATHS[mode]?.[panelId]
}

function getByPath(obj: any, path: string | undefined): any {
  if (!obj || !path) return null
  return path.split('.').reduce((acc, key) => (acc && key in acc ? acc[key] : null), obj)
}

function hasPanelData(data: any): boolean {
  if (data == null) return false
  if (Array.isArray(data)) return data.length > 0
  if (typeof data === 'object') return Object.keys(data).length > 0
  return String(data).trim() !== ''
}

function unwrapAnalysisResults(analysisResults: any): any {
  if (
    analysisResults &&
    typeof analysisResults === 'object' &&
    !Array.isArray(analysisResults) &&
    analysisResults.results &&
    typeof analysisResults.results === 'object'
  ) {
    return unwrapAnalysisResults(analysisResults.results)
  }
  return analysisResults
}

function normalizeKey(key: string): string {
  return String(key ?? '').replace(/[^a-z0-9]+/gi, '').toLowerCase()
}

function getOwnValue(obj: any, candidates: string[]): any {
  if (!obj || typeof obj !== 'object') return undefined
  const normalizedCandidates = new Set(candidates.map(normalizeKey))
  for (const [key, value] of Object.entries(obj)) {
    if (normalizedCandidates.has(normalizeKey(key))) return value
  }
  return undefined
}

function formatCiOverlap(value: unknown): string {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (value == null) return '—'
  const normalized = String(value).trim().toLowerCase()
  if (normalized === 'true' || normalized === 'yes') return 'Yes'
  if (normalized === 'false' || normalized === 'no') return 'No'
  return String(value)
}

function getPermutationOverview(results: any): Array<Record<string, unknown>> {
  const groups = results?.groups ?? {}
  const counts = groups?.counts ?? {}
  const settings = results?.settings ?? {}
  return [{
    groupingVariable: groups.groupingVariable ?? '',
    groupA: groups.leftValue ?? groups.groupA ?? '',
    groupACount: counts.groupA ?? groups.groupACount ?? null,
    groupB: groups.rightValue ?? groups.groupB ?? '',
    groupBCount: counts.groupB ?? groups.groupBCount ?? null,
    permutations: settings.permutations ?? results?.permutations ?? null,
    alpha: settings.alpha ?? results?.alpha ?? null,
    seed: settings.seed ?? results?.seed ?? null,
  }]
}

function getPermutationEqualityRows(results: any, kind: 'mean' | 'variance'): Array<Record<string, unknown>> | null {
  const rows = Array.isArray(results?.equalityAssessment) ? results.equalityAssessment : null
  if (!rows) return null
  return rows.map((row: any) => (
    kind === 'mean'
      ? {
          construct: row.construct,
          mean_diff: row.mean_diff,
          mean_ci_lower: row.mean_ci_lower,
          mean_ci_upper: row.mean_ci_upper,
          mean_p_value: row.mean_p_value,
          mean_decision: row.mean_decision,
        }
      : {
          construct: row.construct,
          variance_diff: row.variance_diff,
          variance_ci_lower: row.variance_ci_lower,
          variance_ci_upper: row.variance_ci_upper,
          variance_p_value: row.variance_p_value,
          variance_decision: row.variance_decision,
        }
  ))
}

function getMgaGroupLabels(results: any): { groupA: string; groupB: string; comparisonLabel: string } {
  const groups = results?.groups ?? {}
  const groupA = String(groups.leftValue ?? groups.groupA ?? 'Group A')
  const groupB = String(groups.rightValue ?? groups.groupB ?? 'Group B')
  return {
    groupA,
    groupB,
    comparisonLabel: `${groupA} vs ${groupB}`,
  }
}

function rowsFromUnknown(value: any): Array<Record<string, unknown>> {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
      .map((row) => row as Record<string, unknown>)
  }
  if (typeof value === 'object') return [value as Record<string, unknown>]
  return []
}

type MgaDatasetRow = Record<string, unknown> | unknown[]

interface MgaOverviewFallbackInput {
  headers?: string[]
  datasetRows?: MgaDatasetRow[]
  constructs?: Array<{
    name?: unknown
    indicators?: Array<string | { name?: unknown }>
  }>
}

interface PanelDataOptions {
  mgaComparisonMethod?: string
  mgaOverviewFallback?: MgaOverviewFallbackInput
  savedModel?: any
}

const MGA_MICOM_NOT_RUN_MESSAGE = 'MICOM was not run for this analysis. Interpret results well.'

function getMgaMicomOverviewValue(results: any): string {
  const micomOverview = results?.micomOverview ?? results?.micom_overview
  if (typeof micomOverview === 'string' && micomOverview.trim()) return micomOverview.trim()
  if (micomOverview && typeof micomOverview === 'object' && !Array.isArray(micomOverview)) {
    for (const key of ['message', 'summary', 'statusLabel', 'status']) {
      const value = getOwnValue(micomOverview, [key])
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }

  const invarianceStatus = results?.measurementInvarianceStatus ?? results?.measurement_invariance_status ?? results?.invarianceStatus
  if (typeof invarianceStatus === 'string' && invarianceStatus.trim()) return invarianceStatus.trim()
  return MGA_MICOM_NOT_RUN_MESSAGE
}

function findRowValue(row: MgaDatasetRow, fieldName: string, headers: string[] = []): unknown {
  if (Array.isArray(row)) {
    const index = headers.findIndex((header) => normalizeKey(header) === normalizeKey(fieldName))
    return index >= 0 ? row[index] : undefined
  }

  if (fieldName in row) return row[fieldName]
  const target = normalizeKey(fieldName)
  for (const [key, value] of Object.entries(row)) {
    if (normalizeKey(key) === target) return value
  }
  return undefined
}

function toFiniteNumericValue(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const raw = String(value).trim()
  if (!raw) return null
  const numeric = Number(raw.replace(/,/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function roundDescriptiveValue(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value * 1e12) / 1e12
}

function sampleVariance(values: number[]): number | null {
  if (values.length <= 1) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1)
}

function constructIndicatorNames(construct: NonNullable<MgaOverviewFallbackInput['constructs']>[number]): string[] {
  return (construct.indicators ?? [])
    .map((indicator) => typeof indicator === 'string' ? indicator : String(indicator?.name ?? '').trim())
    .filter(Boolean)
}

function constructScoreForRow(row: MgaDatasetRow, indicators: string[], headers: string[]): number | null {
  const values = indicators
    .map((indicator) => toFiniteNumericValue(findRowValue(row, indicator, headers)))
    .filter((value): value is number => value != null)
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function descriptiveRow(group: string, construct: string, values: number[]): Record<string, unknown> | null {
  if (!values.length) return null
  const n = values.length
  const mean = values.reduce((sum, value) => sum + value, 0) / n
  const variance = sampleVariance(values)
  const sd = variance == null ? null : Math.sqrt(variance)
  const centered = values.map((value) => value - mean)
  const skewness = n > 2 && sd != null && sd > 0
    ? centered.reduce((sum, value) => sum + (value ** 3), 0) / n / (sd ** 3)
    : null
  const kurtosis = n > 3 && sd != null && sd > 0
    ? centered.reduce((sum, value) => sum + (value ** 4), 0) / n / (sd ** 4)
    : null

  return {
    Group: group,
    Construct: construct,
    Number: n,
    Mean: roundDescriptiveValue(mean),
    'Standard Deviation': roundDescriptiveValue(sd),
    Skewness: roundDescriptiveValue(skewness),
    Kurtosis: roundDescriptiveValue(kurtosis),
    Variance: roundDescriptiveValue(variance),
  }
}

function readNumericRowField(row: Record<string, unknown>, fields: string[]): number | null {
  for (const field of fields) {
    const value = toFiniteNumericValue(findRowValue(row, field))
    if (value != null) return value
  }
  return null
}

function readStringRowField(row: Record<string, unknown>, fields: string[]): string {
  for (const field of fields) {
    const value = findRowValue(row, field)
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function normalizeMgaDescriptiveRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows
    .map((row) => {
      const variance = readNumericRowField(row, ['Variance', 'variance'])
      const sd = readNumericRowField(row, [
        'Standard Deviation',
        'StandardDeviation',
        'Std Dev',
        'Std. Dev.',
        'StdDev',
        'SD',
        'sd',
      ])
      const standardDeviation = sd ?? (variance != null && variance >= 0 ? Math.sqrt(variance) : null)

      return {
        Group: readStringRowField(row, ['Group', 'group']),
        Construct: readStringRowField(row, ['Construct', 'construct', 'row_name', 'Row', 'name']),
        Number: readNumericRowField(row, ['Number', 'N', 'n', 'count']),
        Mean: readNumericRowField(row, ['Mean', 'mean']),
        'Standard Deviation': roundDescriptiveValue(standardDeviation),
        Skewness: readNumericRowField(row, ['Skewness', 'skewness']),
        Kurtosis: readNumericRowField(row, ['Kurtosis', 'kurtosis']),
        Variance: variance == null ? null : roundDescriptiveValue(variance),
      }
    })
    .filter((row) => String(row.Group ?? '').trim() || String(row.Construct ?? '').trim())
}

export function deriveMgaGroupDescriptives(
  results: any,
  datasetRows: MgaDatasetRow[] = [],
  constructs: MgaOverviewFallbackInput['constructs'] = [],
  headers: string[] = [],
): Array<Record<string, unknown>> {
  if (!Array.isArray(datasetRows) || !datasetRows.length || !Array.isArray(constructs) || !constructs.length) return []

  const groups = results?.groups ?? {}
  const groupingVariable = String(groups.groupingVariable ?? groups.grouping_variable ?? '').trim()
  if (!groupingVariable) return []

  const labels = getMgaGroupLabels(results)
  const selectedGroups = [labels.groupA, labels.groupB].filter((label) => label && !label.startsWith('Group '))
  if (!selectedGroups.length) return []

  const constructDefs = constructs
    .map((construct) => ({
      name: String(construct?.name ?? '').trim(),
      indicators: constructIndicatorNames(construct),
    }))
    .filter((construct) => construct.name && construct.indicators.length)
  if (!constructDefs.length) return []

  const rows: Array<Record<string, unknown>> = []
  selectedGroups.forEach((group) => {
    const groupRows = datasetRows.filter((row) => String(findRowValue(row, groupingVariable, headers) ?? '').trim() === group)
    if (!groupRows.length) return

    constructDefs.forEach((construct) => {
      const scores = groupRows
        .map((row) => constructScoreForRow(row, construct.indicators, headers))
        .filter((value): value is number => value != null)
      const row = descriptiveRow(group, construct.name, scores)
      if (row) rows.push(row)
    })
  })

  return rows
}

function normalizeGroupSpecificSource(source: any): any {
  const unwrapped = unwrapAnalysisResults(source)
  if (!unwrapped || typeof unwrapped !== 'object' || Array.isArray(unwrapped)) return unwrapped

  const finalResults = getOwnValue(unwrapped, ['final_results', 'finalResults']) ?? {}
  const qualityCriteria = getOwnValue(unwrapped, ['quality_criteria', 'qualityCriteria']) ?? {}
  return {
    ...unwrapped,
    final_results: {
      ...finalResults,
      path_coefficients: getOwnValue(finalResults, ['path_coefficients', 'pathCoefficients']) ?? finalResults.path_coefficients,
      total_indirect_effects: getOwnValue(finalResults, ['total_indirect_effects', 'totalIndirectEffects']) ?? finalResults.total_indirect_effects,
      specific_indirect_effects: getOwnValue(finalResults, ['specific_indirect_effects', 'specificIndirectEffects']) ?? finalResults.specific_indirect_effects,
      total_effects: getOwnValue(finalResults, ['total_effects', 'totalEffects']) ?? finalResults.total_effects,
      outer_loadings: getOwnValue(finalResults, ['outer_loadings', 'outerLoadings']) ?? finalResults.outer_loadings,
      outer_weights: getOwnValue(finalResults, ['outer_weights', 'outerWeights']) ?? finalResults.outer_weights,
    },
    quality_criteria: {
      ...qualityCriteria,
      reliability: getOwnValue(qualityCriteria, ['reliability']) ?? qualityCriteria.reliability,
      discriminant_validity: getOwnValue(qualityCriteria, ['discriminant_validity', 'discriminantValidity']) ?? qualityCriteria.discriminant_validity,
      cross_loadings: getOwnValue(qualityCriteria, ['cross_loadings', 'crossLoadings']) ?? qualityCriteria.cross_loadings,
      r_square: getOwnValue(qualityCriteria, ['r_square', 'rSquare']) ?? qualityCriteria.r_square,
      vif: getOwnValue(qualityCriteria, ['vif']) ?? qualityCriteria.vif,
      model_fit: getOwnValue(qualityCriteria, ['model_fit', 'modelFit']) ?? qualityCriteria.model_fit,
    },
  }
}

const MGA_GROUP_PANEL_BASE_IDS: Record<string, string> = {
  'outer-loadings': 'outer-loadings',
  'outer-weights': 'outer-weights',
  reliability: 'reliability',
  discriminant: 'discriminant',
  'cross-loadings': 'cross-loadings',
  'r-square': 'r-square',
  vif: 'vif',
  'model-fit': 'model-fit',
  'path-coef': 'path-coef',
  'total-indirect': 'total-indirect',
  'specific-indirect': 'specific-indirect',
  'total-effects': 'total-effects',
}

export function getMgaGroupPanelBaseId(panelId: string): string {
  const match = panelId.match(/^mga-group-[ab]-(.+)$/)
  if (!match) return panelId
  return MGA_GROUP_PANEL_BASE_IDS[match[1]] ?? panelId
}

export function getMgaGroupSpecificResultsSource(panelId: string, analysisResults: any): any {
  const results = unwrapAnalysisResults(analysisResults)
  const groupKey = panelId.includes('mga-group-a-') ? 'groupA' : panelId.includes('mga-group-b-') ? 'groupB' : ''
  if (!groupKey) return null
  const groupSpecific = results?.groupSpecific ?? results?.group_specific ?? {}
  const source = groupSpecific[groupKey] ?? groupSpecific[groupKey === 'groupA' ? 'group_a' : 'group_b']
  return normalizeGroupSpecificSource(source)
}

function getMgaOverview(
  results: any,
  fallback?: MgaOverviewFallbackInput,
): { setup: Array<Record<string, unknown>>; descriptives: Array<Record<string, unknown>> } {
  const suppliedOverview = results?.overview ?? results?.mgaOverview ?? results?.mga_overview
  const suppliedDescriptiveRows = rowsFromUnknown(
    suppliedOverview?.descriptives ??
    results?.descriptives ??
    results?.groupDescriptives ??
    results?.group_descriptives
  )
  const fallbackDescriptiveRows = suppliedDescriptiveRows.length
    ? []
    : deriveMgaGroupDescriptives(results, fallback?.datasetRows, fallback?.constructs, fallback?.headers)
  const descriptiveRows = suppliedDescriptiveRows.length ? suppliedDescriptiveRows : fallbackDescriptiveRows

  const labels = getMgaGroupLabels(results)
  const groups = results?.groups ?? {}
  const counts = groups?.counts ?? {}
  const settings = results?.settings ?? {}
  const groupACount = counts.groupA ?? groups.groupACount ?? '—'
  const groupBCount = counts.groupB ?? groups.groupBCount ?? '—'
  const nboot = settings.nboot ?? results?.nboot ?? '—'
  const alpha = settings.alpha ?? results?.alpha ?? '—'
  const seed = settings.seed ?? results?.seed ?? '—'
  return {
    setup: [
      { 'Analysis information': 'Grouping variable', Value: groups.groupingVariable ?? '—' },
      { 'Analysis information': 'Selected groups', Value: labels.comparisonLabel },
      { 'Analysis information': 'Sample size per group', Value: `${labels.groupA}: ${groupACount}, ${labels.groupB}: ${groupBCount}` },
      { 'Analysis information': 'MGA settings', Value: `${nboot} bootstrap subsamples, alpha ${alpha}, seed ${seed}` },
      { 'Analysis information': 'Measurement invariance status', Value: getMgaMicomOverviewValue(results) },
    ],
    descriptives: normalizeMgaDescriptiveRows(descriptiveRows),
  }
}

function getMgaComparisonFamily(results: any, panelId: string): any {
  const bootstrapMGA = results?.bootstrapMGA ?? results?.bootstrap_mga ?? {}
  if (panelId === 'mga-path-coefficients') return bootstrapMGA.pathCoefficients ?? bootstrapMGA.path_coefficients
  if (panelId === 'mga-outer-loadings') return bootstrapMGA.outerLoadings ?? bootstrapMGA.outer_loadings
  if (panelId === 'mga-outer-weights') return bootstrapMGA.outerWeights ?? bootstrapMGA.outer_weights
  return null
}

function mapMgaPathComparisonRows(rows: any[], method: string, labels: { groupA: string; groupB: string }): Array<Record<string, unknown>> {
  if (method === 'henselerPlsMga') {
    return rows.map((row) => ({
      Path: row.path ?? row.Path,
      [`${labels.groupA} β`]: row.groupA_beta,
      [`${labels.groupB} β`]: row.groupB_beta,
      [`Difference (${labels.groupA} − ${labels.groupB})`]: row.diff ?? row.difference,
      'PLS-MGA p': row.pls_mga_p ?? row.p_value,
      Result: row.result,
    }))
  }
  if (method === 'parametricTest') {
    return rows.map((row) => ({
      Path: row.path ?? row.Path,
      [`${labels.groupA} β`]: row.groupA_beta,
      [`${labels.groupB} β`]: row.groupB_beta,
      [`Difference (${labels.groupA} − ${labels.groupB})`]: row.diff ?? row.difference,
      't-value': row.t_value,
      'p-value': row.p_value,
      Result: row.result,
    }))
  }
  return rows.map((row) => ({
    Path: row.path ?? row.Path,
    [`${labels.groupA} β`]: row.groupA_beta,
    [`${labels.groupA} CI lower`]: row.groupA_ci_lower,
    [`${labels.groupA} CI upper`]: row.groupA_ci_upper,
    [`${labels.groupB} β`]: row.groupB_beta,
    [`${labels.groupB} CI lower`]: row.groupB_ci_lower,
    [`${labels.groupB} CI upper`]: row.groupB_ci_upper,
    'CI overlap': formatCiOverlap(row.ci_overlap),
    Result: row.result,
  }))
}

function mapMgaMeasurementComparisonRows(
  rows: any[],
  method: string,
  labels: { groupA: string; groupB: string },
  metric: 'loading' | 'weight',
): Array<Record<string, unknown>> {
  const groupAKey = `groupA_${metric}`
  const groupBKey = `groupB_${metric}`
  if (method === 'henselerPlsMga') {
    return rows.map((row) => ({
      Construct: row.construct,
      Indicator: row.indicator,
      [`${labels.groupA} ${metric}`]: row[groupAKey],
      [`${labels.groupB} ${metric}`]: row[groupBKey],
      [`Difference (${labels.groupA} − ${labels.groupB})`]: row.diff ?? row.difference,
      'PLS-MGA p': row.pls_mga_p ?? row.p_value,
      Result: row.result,
    }))
  }
  if (method === 'parametricTest') {
    return rows.map((row) => ({
      Construct: row.construct,
      Indicator: row.indicator,
      [`${labels.groupA} ${metric}`]: row[groupAKey],
      [`${labels.groupB} ${metric}`]: row[groupBKey],
      [`Difference (${labels.groupA} − ${labels.groupB})`]: row.diff ?? row.difference,
      't-value': row.t_value,
      'p-value': row.p_value,
      Result: row.result,
    }))
  }
  return rows.map((row) => ({
    Construct: row.construct,
    Indicator: row.indicator,
    [`${labels.groupA} ${metric}`]: row[groupAKey],
    [`${labels.groupA} CI lower`]: row.groupA_ci_lower,
    [`${labels.groupA} CI upper`]: row.groupA_ci_upper,
    [`${labels.groupB} ${metric}`]: row[groupBKey],
    [`${labels.groupB} CI lower`]: row.groupB_ci_lower,
    [`${labels.groupB} CI upper`]: row.groupB_ci_upper,
    'CI overlap': formatCiOverlap(row.ci_overlap),
    Result: row.result,
  }))
}

function getMgaComparisonData(
  panelId: string,
  results: any,
  method = 'biasCorrectedConfidenceIntervals',
): Array<Record<string, unknown>> | null {
  const family = getMgaComparisonFamily(results, panelId)
  if (!family) return null
  const rows = family[method] ?? []
  if (!Array.isArray(rows)) return null
  const labels = getMgaGroupLabels(results)
  if (panelId === 'mga-path-coefficients') return mapMgaPathComparisonRows(rows, method, labels)
  if (panelId === 'mga-outer-loadings') return mapMgaMeasurementComparisonRows(rows, method, labels, 'loading')
  if (panelId === 'mga-outer-weights') return mapMgaMeasurementComparisonRows(rows, method, labels, 'weight')
  return null
}

function textValue(value: unknown): string {
  return String(value ?? '').trim()
}

function uniqueTextValues(values: unknown[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  values.forEach((value) => {
    const text = textValue(typeof value === 'object' && value != null && 'name' in value ? (value as any).name : value)
    if (!text || seen.has(normalizeKey(text))) return
    seen.add(normalizeKey(text))
    output.push(text)
  })
  return output
}

function savedModelConstructs(savedModel: any): any[] {
  return Array.isArray(savedModel?.constructs) ? savedModel.constructs : []
}

function savedModelPaths(savedModel: any): any[] {
  return Array.isArray(savedModel?.paths) ? savedModel.paths : []
}

function isHigherOrderConstruct(construct: any): boolean {
  return construct?.isHigherOrder === true || construct?.is_higher_order === true
}

function constructDisplayName(construct: any): string {
  return textValue(construct?.name ?? construct?.label ?? construct?.id)
}

function constructHocType(construct: any): string {
  return textValue(construct?.higherOrderType ?? construct?.higher_order_type ?? construct?.type ?? 'higher-order').toLowerCase()
}

function buildConstructNameById(savedModel: any): Map<string, string> {
  return new Map(savedModelConstructs(savedModel).map((construct) => [
    textValue(construct?.id),
    constructDisplayName(construct),
  ]))
}

function nameForConstructId(id: unknown, nameById: Map<string, string>): string {
  const raw = textValue(id)
  return nameById.get(raw) ?? raw
}

function constructDimensions(construct: any, savedModel: any, nameById: Map<string, string>): string[] {
  const explicit = uniqueTextValues([
    ...(Array.isArray(construct?.dimensions) ? construct.dimensions : []),
    ...(Array.isArray(construct?.lowerOrderConstructs) ? construct.lowerOrderConstructs : []),
  ])
  if (explicit.length) return explicit

  const hocId = textValue(construct?.id)
  return uniqueTextValues(savedModelPaths(savedModel)
    .filter((path) => textValue(path?.hocRole).toLowerCase() === 'measurement')
    .map((path) => {
      const from = textValue(path?.from)
      const to = textValue(path?.to)
      if (from === hocId) return nameForConstructId(to, nameById)
      if (to === hocId) return nameForConstructId(from, nameById)
      return ''
    }))
}

type ModerationDefinition = {
  iv: string
  moderator: string
  dv: string
  interaction: string
  path: string
}

function moderationDefinitionsFromModel(savedModel: any): ModerationDefinition[] {
  const paths = savedModelPaths(savedModel)
  const pathById = new Map(paths.map((path) => [textValue(path?.id), path]))
  const nameById = buildConstructNameById(savedModel)
  const definitions: ModerationDefinition[] = []
  const seen = new Set<string>()

  paths.forEach((path) => {
    if (path?.kind !== 'moderation' || !path?.targetPathId) return
    const targetPath = pathById.get(textValue(path.targetPathId))
    if (!targetPath) return

    const iv = nameForConstructId(targetPath.from, nameById)
    const moderator = nameForConstructId(path.from, nameById)
    const dv = nameForConstructId(targetPath.to ?? path.to, nameById)
    if (!iv || !moderator || !dv) return

    const interaction = `${iv}*${moderator}`
    const key = `${normalizeKey(interaction)}:::${normalizeKey(dv)}`
    if (seen.has(key)) return
    seen.add(key)
    definitions.push({
      iv,
      moderator,
      dv,
      interaction,
      path: `${interaction} -> ${dv}`,
    })
  })

  return definitions
}

function parsePathParts(pathLabel: string): { from: string; to: string } | null {
  const parts = textValue(pathLabel)
    .split(/->|→|~>|=>/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length !== 2) return null
  return { from: parts[0], to: parts[1] }
}

function parseInteractionParts(source: string): { iv: string; moderator: string } | null {
  const text = textValue(source)
  if (!text) return null
  const splitters = [/\*/, /×/, /\s+x\s+/i, /\s+by\s+/i, /:/]
  for (const splitter of splitters) {
    const parts = text.split(splitter).map((part) => part.trim()).filter(Boolean)
    if (parts.length === 2) return { iv: parts[0], moderator: parts[1] }
  }
  return null
}

function interactionPartsMatch(source: string, iv: string, moderator: string): boolean {
  const parsed = parseInteractionParts(source)
  if (parsed) {
    return normalizeKey(parsed.iv) === normalizeKey(iv) && normalizeKey(parsed.moderator) === normalizeKey(moderator)
  }

  const normalizedSource = normalizeKey(source)
  const normalizedIv = normalizeKey(iv)
  const normalizedModerator = normalizeKey(moderator)
  return normalizedSource === `${normalizedIv}${normalizedModerator}`
    || normalizedSource === `${normalizedIv}x${normalizedModerator}`
    || normalizedSource === `${normalizedIv}by${normalizedModerator}`
}

function comparisonPathLabel(row: Record<string, unknown>): string {
  return textValue(row.path ?? row.Path ?? row.relationship ?? row.Relationship ?? row.row_name ?? row.Row)
}

function rowMatchesModerationDefinition(row: Record<string, unknown>, definition: ModerationDefinition): boolean {
  const parsed = parsePathParts(comparisonPathLabel(row))
  if (!parsed) return false
  return interactionPartsMatch(parsed.from, definition.iv, definition.moderator) &&
    normalizeKey(parsed.to) === normalizeKey(definition.dv)
}

function hocRowsFromModel(savedModel: any): Array<{ name: string; type: string; dimensions: string[] }> {
  const nameById = buildConstructNameById(savedModel)
  return savedModelConstructs(savedModel)
    .filter(isHigherOrderConstruct)
    .map((construct) => ({
      name: constructDisplayName(construct),
      type: constructHocType(construct),
      dimensions: constructDimensions(construct, savedModel, nameById),
    }))
    .filter((row) => row.name)
}

function hocRoleForModeration(definition: ModerationDefinition, savedModel: any): string {
  const hocs = hocRowsFromModel(savedModel)
  if (!hocs.length) return 'None'

  const roleParts: string[] = []
  const roleFor = (label: string, role: string) => {
    const hoc = hocs.find((row) => normalizeKey(row.name) === normalizeKey(label))
    if (!hoc) return
    const dimensionText = hoc.dimensions.length ? `: ${hoc.dimensions.join(', ')}` : ''
    roleParts.push(`${role} is higher-order construct${dimensionText}`)
  }

  roleFor(definition.iv, 'IV')
  roleFor(definition.moderator, 'Moderator')
  roleFor(definition.dv, 'DV')
  return roleParts.length ? roleParts.join('; ') : 'None'
}

function mapMgaModerationComparisonRow(
  row: Record<string, unknown>,
  definition: ModerationDefinition,
  method: string,
  labels: { groupA: string; groupB: string },
  savedModel: any,
): Record<string, unknown> {
  const base = {
    IV: definition.iv,
    Moderator: definition.moderator,
    DV: definition.dv,
    Interaction: definition.interaction,
    Path: comparisonPathLabel(row) || definition.path,
    'HOC role': hocRoleForModeration(definition, savedModel),
  }

  if (method === 'henselerPlsMga') {
    return {
      ...base,
      [`${labels.groupA} β`]: getOwnValue(row, ['groupA_beta', 'group1_beta']),
      [`${labels.groupB} β`]: getOwnValue(row, ['groupB_beta', 'group2_beta']),
      [`Difference (${labels.groupA} − ${labels.groupB})`]: row.diff ?? row.difference,
      'PLS-MGA p': row.pls_mga_p ?? row.p_value,
      Result: row.result,
    }
  }

  if (method === 'parametricTest') {
    return {
      ...base,
      [`${labels.groupA} β`]: getOwnValue(row, ['groupA_beta', 'group1_beta']),
      [`${labels.groupB} β`]: getOwnValue(row, ['groupB_beta', 'group2_beta']),
      [`Difference (${labels.groupA} − ${labels.groupB})`]: row.diff ?? row.difference,
      't-value': row.t_value,
      'p-value': row.p_value,
      Result: row.result,
    }
  }

  return {
    ...base,
    [`${labels.groupA} β`]: getOwnValue(row, ['groupA_beta', 'group1_beta']),
    [`${labels.groupA} CI lower`]: row.groupA_ci_lower,
    [`${labels.groupA} CI upper`]: row.groupA_ci_upper,
    [`${labels.groupB} β`]: getOwnValue(row, ['groupB_beta', 'group2_beta']),
    [`${labels.groupB} CI lower`]: row.groupB_ci_lower,
    [`${labels.groupB} CI upper`]: row.groupB_ci_upper,
    'CI overlap': formatCiOverlap(row.ci_overlap),
    Result: row.result,
  }
}

function getMgaModerationComparisonData(
  results: any,
  savedModel: any,
  method = 'biasCorrectedConfidenceIntervals',
): Array<Record<string, unknown>> | null {
  const family = getMgaComparisonFamily(results, 'mga-path-coefficients')
  if (!family) return null
  const rows = family[method] ?? []
  if (!Array.isArray(rows)) return null

  const definitions = moderationDefinitionsFromModel(savedModel)
  if (!definitions.length) return null

  const labels = getMgaGroupLabels(results)
  return rows
    .map((row: Record<string, unknown>) => {
      const definition = definitions.find((candidate) => rowMatchesModerationDefinition(row, candidate))
      return definition ? mapMgaModerationComparisonRow(row, definition, method, labels, savedModel) : null
    })
    .filter((row): row is Record<string, unknown> => row != null)
}

function getHocStructuralRole(hocName: string, savedModel: any): string {
  const nameById = buildConstructNameById(savedModel)
  const paths = savedModelPaths(savedModel)
  const pathById = new Map(paths.map((path) => [textValue(path?.id), path]))
  const roles = new Set<string>()

  paths.forEach((path) => {
    const from = nameForConstructId(path?.from, nameById)
    const to = nameForConstructId(path?.to, nameById)
    if (path?.kind === 'moderation' && path?.targetPathId) {
      const targetPath = pathById.get(textValue(path.targetPathId))
      if (!targetPath) return
      const iv = nameForConstructId(targetPath.from, nameById)
      const moderator = nameForConstructId(path.from, nameById)
      const dv = nameForConstructId(targetPath.to ?? path.to, nameById)
      const interactionPath = `${iv}*${moderator} -> ${dv}`
      if (normalizeKey(iv) === normalizeKey(hocName)) roles.add(`IV in ${interactionPath}`)
      if (normalizeKey(moderator) === normalizeKey(hocName)) roles.add(`Moderator in ${interactionPath}`)
      if (normalizeKey(dv) === normalizeKey(hocName)) roles.add(`DV in ${interactionPath}`)
      return
    }

    if (textValue(path?.hocRole).toLowerCase() === 'measurement') return
    if (normalizeKey(from) === normalizeKey(hocName)) roles.add(`Predictor in ${from} -> ${to}`)
    if (normalizeKey(to) === normalizeKey(hocName)) roles.add(`Outcome in ${from} -> ${to}`)
  })

  return roles.size ? Array.from(roles).join('; ') : 'Measurement model only'
}

function normalizeHocResultRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows
    .map((row) => {
      const hocName = textValue(getOwnValue(row, [
        'hoc_construct',
        'higher_order_construct',
        'higherOrderConstruct',
        'hoc',
        'construct',
      ]))
      const dimension = textValue(getOwnValue(row, [
        'loc_construct',
        'lower_order_construct',
        'lowerOrderConstruct',
        'dimension',
        'indicator',
        'loc',
      ]))
      const hocType = textValue(getOwnValue(row, [
        'hoc_type',
        'higher_order_type',
        'higherOrderType',
        'type',
      ])).toLowerCase()

      return {
        'Higher-order construct': hocName,
        Type: hocType || 'higher-order',
        Dimensions: dimension || 'Not specified',
        'Dimension count': dimension ? 1 : 0,
        'Structural role': 'Available from saved HOC results',
        Loading: getOwnValue(row, ['loading', 'outer_loading', 'outerLoading']),
        Weight: getOwnValue(row, ['weight', 'outer_weight', 'outerWeight']),
        VIF: getOwnValue(row, ['vif']),
        'MICOM/MGA handling': 'Uses fitted HOC construct scores from the same SEMinR model specification.',
      }
    })
    .filter((row) => textValue(row['Higher-order construct']))
}

function getHocContextRows(results: any, savedModel: any): Array<Record<string, unknown>> | null {
  const suppliedRows = rowsFromUnknown(
    results?.hocContext ??
    results?.hoc_context ??
    results?.meta?.hocContext ??
    results?.meta?.hoc_context
  )
  if (suppliedRows.length) return suppliedRows

  const finalHocRows = rowsFromUnknown(
    results?.final_results?.hoc_results ??
    results?.finalResults?.hocResults
  )
  if (finalHocRows.length) return normalizeHocResultRows(finalHocRows)

  const hocs = hocRowsFromModel(savedModel)
  if (!hocs.length) return null

  return hocs.map((hoc) => ({
    'Higher-order construct': hoc.name,
    Type: hoc.type,
    Dimensions: hoc.dimensions.length ? hoc.dimensions.join(', ') : 'Not specified',
    'Dimension count': hoc.dimensions.length,
    'Structural role': getHocStructuralRole(hoc.name, savedModel),
    'MICOM/MGA handling': 'Uses fitted HOC construct scores from the same SEMinR model specification.',
  }))
}

const PANEL_DATA_FALLBACK_PATHS: Partial<Record<AnalysisMode, Record<string, string[]>>> = {
  bootstrap: {
    'htmt-confidence-intervals': [
      'quality_criteria.htmt_confidence_intervals',
      'quality_criteria.bootstrapped_HTMT',
      'quality_criteria.bootstrapped_htmt',
      'final_results.htmt_confidence_intervals',
      'final_results.bootstrapped_HTMT',
      'bootstrapped_HTMT',
    ],
  },
  plspredict: {
    'plspredict-mv-summary': [
      'final_results.plspredict_mv_summary',
      'final_results.plspredict_summary',
      'final_results.mv_summary',
      'final_results.prediction_summary',
      'plspredict_mv_summary',
      'plspredict_summary',
      'mv_summary',
      'prediction_summary',
    ],
    'pls-lm-comparison': [
      'final_results.plspredict_mv_summary',
      'final_results.plspredict_summary',
      'final_results.mv_summary',
      'final_results.prediction_summary',
      'plspredict_mv_summary',
      'plspredict_summary',
      'mv_summary',
      'prediction_summary',
    ],
    'q2-predict': [
      'final_results.plspredict_mv_summary',
      'final_results.plspredict_summary',
      'final_results.mv_summary',
      'final_results.prediction_summary',
      'plspredict_mv_summary',
      'plspredict_summary',
      'mv_summary',
      'prediction_summary',
    ],
    'plsem-mv-error-hist': [
      'histograms.plsem_mv_error_histogram',
      'final_results.mv_predictions_and_errors',
    ],
    'plsem-lv-error-hist': [
      'histograms.plsem_lv_error_histogram',
      'final_results.lv_predictions_and_errors',
    ],
  },
}

export function getPanelDataFromResults(
  mode: AnalysisMode,
  panelId: string,
  analysisResults: any,
  options: PanelDataOptions = {},
): any {
  const results = unwrapAnalysisResults(analysisResults)

  if (mode === 'permutation') {
    if (panelId === 'overview') return getPermutationOverview(results)
    if (panelId === 'hoc-context') return getHocContextRows(results, options.savedModel)
    if (panelId === 'configural-invariance') return null
    if (panelId === 'equality-means') return getPermutationEqualityRows(results, 'mean')
    if (panelId === 'equality-variances') return getPermutationEqualityRows(results, 'variance')
  }

  if (mode === 'mga') {
    if (panelId === 'overview') return getMgaOverview(results, options.mgaOverviewFallback)
    if (panelId === 'hoc-context') return getHocContextRows(results, options.savedModel)
    if (panelId === 'mga-moderation-effects') {
      return getMgaModerationComparisonData(results, options.savedModel, options.mgaComparisonMethod)
    }
    if (panelId.startsWith('mga-group-')) {
      const source = getMgaGroupSpecificResultsSource(panelId, results)
      const basePanelId = getMgaGroupPanelBaseId(panelId)
      return getByPath(source, PANEL_DATA_PATHS['pls-sem'][basePanelId])
    }
    if (panelId === 'mga-path-welch' || panelId === 'mga-specific-indirect-ci') return null
    return getMgaComparisonData(panelId, results, options.mgaComparisonMethod)
  }

  const fallbackPaths = PANEL_DATA_FALLBACK_PATHS[mode]?.[panelId]
  if (fallbackPaths?.length) {
    for (const path of fallbackPaths) {
      const value = getByPath(results, path)
      if (hasPanelData(value)) return value
    }
  }

  return getByPath(results, getPanelDataPath(mode, panelId))
}

export function isBaseModelReferencePanel(mode: AnalysisMode, panelId: string): boolean {
  return mode === 'bootstrap' && BOOTSTRAP_BASE_MODEL_REFERENCE_PANELS.has(panelId)
}
