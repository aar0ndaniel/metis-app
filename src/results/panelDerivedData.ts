type PathStats = {
  from: string
  to: string
  path: string
  coefficient: number | null
  tStat: number | null
  pValue: number | null
  ciLower: number | null
  ciUpper: number | null
  bcCiLower: number | null
  bcCiUpper: number | null
}

type ModerationInteraction = {
  iv: string
  moderator: string
  dv: string
  interaction: string
  moderatorMeasurement: string
  moderatorIndicators: string[]
}

const ROUND_DIGITS = 5

function normalizeMetricKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[²^]/g, '2')
    .replace(/[^a-z0-9]/g, '')
}

function normalizedMetricMatches(left: string, right: string): boolean {
  return normalizeMetricKey(left) === normalizeMetricKey(right)
}

function toFiniteNumber(val: unknown): number | null {
  if (val == null) return null
  if (Array.isArray(val)) {
    if (val.length === 0) return null
    return toFiniteNumber(val[0])
  }
  const parsed = typeof val === 'number' ? val : Number(String(val).trim())
  return Number.isFinite(parsed) ? parsed : null
}

function extractString(val: unknown): string {
  if (typeof val === 'string') return val.trim()
  if (Array.isArray(val) && val.length > 0) return extractString(val[0])
  if (val != null && typeof val === 'object') {
    if ('value' in val) return extractString((val as any).value)
  }
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  return ''
}

function roundMetric(value: number, digits = ROUND_DIGITS): number {
  return Number(value.toFixed(digits))
}

function formatFormulaNumber(value: number): string {
  return Number(value.toFixed(12)).toString()
}

function readRowValue(row: Record<string, unknown>, aliases: string[]): unknown {
  const aliasKeys = new Set(aliases.map(normalizeMetricKey))
  for (const [key, value] of Object.entries(row)) {
    if (aliasKeys.has(normalizeMetricKey(key))) {
      if (Array.isArray(value)) return value[0]
      return value
    }
  }
  return undefined
}

function readMetricValue(row: Record<string, unknown>, aliases: string[]): number | null {
  return toFiniteNumber(readRowValue(row, aliases))
}

function parseCoefficient(row: Record<string, unknown>): number | null {
  return readMetricValue(row, [
    'coefficient',
    'Original Est.',
    'Original Estimate',
    'Original sample (O)',
    'Original Sample',
    'Path Coefficient',
    'original_estimate',
    'estimate',
    'beta',
    'β',
    'value',
    'mean',
    'Mean',
    'est',
    'Est',
    'coef',
    'Coef',
  ])
}

function parseTStat(row: Record<string, unknown>): number | null {
  return readMetricValue(row, ['T Stat.', 'T-stat', 'T statistic', 'T statistics', 'T statistics (|O/STDEV|)', 't_stat', 't value'])
}

function parsePValue(row: Record<string, unknown>): number | null {
  return readMetricValue(row, [
    'P Value',
    'P values',
    'P-value',
    'p_value',
    'p.values',
    'p',
    'Bootstrap P Val',
    'bootstrap_p_val',
    'Bootstrap P-Value',
    'bootstrap_p_value',
  ])
}

function parseCiValue(row: Record<string, unknown>, aliases: string[]): number | null {
  return readMetricValue(row, aliases)
}

function parsePathLabel(pathLabel: string): { from: string; to: string } | null {
  if (pathLabel.includes('~') && !pathLabel.includes('->') && !pathLabel.includes('→')) {
    const parts = pathLabel.split('~').map((p) => p.trim()).filter(Boolean)
    if (parts.length === 2) {
      return { from: parts[1], to: parts[0] }
    }
  }

  const parts = pathLabel
    .split(/->|→|~>|=>/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length !== 2) return null
  return { from: parts[0], to: parts[1] }
}

function parsePathFromRow(row: Record<string, unknown>): { from: string; to: string; label: string } | null {
  const fromStr = extractString(row.from ?? row.From)
  const toStr = extractString(row.to ?? row.To)
  if (fromStr && toStr) {
    return { from: fromStr, to: toStr, label: `${fromStr} -> ${toStr}` }
  }

  const labelRaw = row.path ?? row.Path ?? row.relationship ?? row.Relationship ?? row.row_name ?? row.Row
  const labelText = extractString(labelRaw)
  const parsedFromLabel = labelText ? parsePathLabel(labelText) : null
  if (parsedFromLabel) {
    return { ...parsedFromLabel, label: labelText }
  }

  return null
}

function unwrapAnalysisResults(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw
  if (Array.isArray(raw)) return raw
  if (raw.results && typeof raw.results === 'object') {
    return unwrapAnalysisResults(raw.results)
  }
  if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
    return unwrapAnalysisResults(raw.data)
  }
  if (raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)) {
    return unwrapAnalysisResults(raw.payload)
  }
  return raw
}

function getPathCoefficientRows(rawResults: any): Array<Record<string, unknown>> {
  const analysisResults = unwrapAnalysisResults(rawResults)
  const rows =
    analysisResults?.final_results?.path_coefficients ??
    analysisResults?.path_coefficients ??
    (Array.isArray(analysisResults?.results) ? analysisResults.results : []) ??
    (Array.isArray(analysisResults) ? analysisResults : [])
  return Array.isArray(rows) ? rows : []
}

// Build a fallback coefficient map from inner_model (matrix-as-rows format).
// R serializes model$path_coef as rows where row_name = predictor (from) construct
// and each column key = target (to) construct.
function buildInnerModelCoefficientFallback(rawResults: any): Map<string, number> {
  const fallback = new Map<string, number>()
  const analysisResults = unwrapAnalysisResults(rawResults)
  const innerModel = analysisResults?.model_and_data?.inner_model ??
    analysisResults?.inner_model
  if (!Array.isArray(innerModel)) return fallback

  const ROW_NAME_KEYS = new Set(['row_name', 'row', 'construct', 'Row', 'ROW', '_row'])

  innerModel.forEach((row: Record<string, unknown>) => {
    // Row name in R's model$path_coef matrix is the PREDICTOR (from) construct
    let from: string | null = null
    for (const key of ROW_NAME_KEYS) {
      if (typeof row[key] === 'string' && row[key] !== '') {
        from = row[key] as string
        break
      }
    }
    if (!from) return

    // Each non-row-name column is a TARGET (to) construct
    Object.entries(row).forEach(([key, value]) => {
      if (ROW_NAME_KEYS.has(key)) return
      const coef = toFiniteNumber(value)
      if (coef == null || coef === 0) return
      fallback.set(`${from}:::${key}`, coef)
    })
  })

  return fallback
}

function buildPathStatsLookup(rawResults: any): Map<string, PathStats> {
  const analysisResults = unwrapAnalysisResults(rawResults)
  const lookup = new Map<string, PathStats>()
  const innerModelFallback = buildInnerModelCoefficientFallback(analysisResults)
  const pathCoefRows = getPathCoefficientRows(analysisResults)

  pathCoefRows.forEach((row: Record<string, unknown>) => {
    const parsed = parsePathFromRow(row)
    if (!parsed) return

    const pathKey = `${parsed.from}:::${parsed.to}`
    const pathLabel = `${parsed.from} -> ${parsed.to}`
    const coefficient = parseCoefficient(row) ?? innerModelFallback.get(pathKey) ?? null
    lookup.set(pathKey, {
      from: parsed.from,
      to: parsed.to,
      path: parsed.label || pathLabel,
      coefficient,
      tStat: parseTStat(row),
      pValue: parsePValue(row),
      ciLower: parseCiValue(row, ['2.5% CI', '2.5%', 'CI Lower', 'lower_ci', 'ci_lower']),
      ciUpper: parseCiValue(row, ['97.5% CI', '97.5%', 'CI Upper', 'upper_ci', 'ci_upper']),
      bcCiLower: parseCiValue(row, ['BC 2.5% CI', 'BCa 2.5% CI', 'BCa 2.5%', 'BCa CI Lower', 'bc_ci_lower', 'bca_ci_lower']),
      bcCiUpper: parseCiValue(row, ['BC 97.5% CI', 'BCa 97.5% CI', 'BCa 97.5%', 'BCa CI Upper', 'bc_ci_upper', 'bca_ci_upper']),
    })
  })

  innerModelFallback.forEach((coef, key) => {
    if (lookup.has(key)) return
    const [from, to] = key.split(':::')
    if (!from || !to) return
    lookup.set(key, {
      from,
      to,
      path: `${from} -> ${to}`,
      coefficient: coef,
      tStat: null,
      pValue: null,
      ciLower: null,
      ciUpper: null,
      bcCiLower: null,
      bcCiUpper: null,
    })
  })

  return lookup
}

function cleanInteractionTerm(term: string): string {
  return term
    .replace(/[._\s]?interaction$/i, '')
    .trim()
}

function parseInteractionSource(source: string): { iv: string; moderator: string } | null {
  let text = String(source ?? '').trim()
  if (!text) return null

  text = text.replace(/[._\s]?interaction$/i, '').trim()

  const primarySplitters = [/\*/, /×/, /\s+x\s+/i, /\s+by\s+/i, /:/]
  for (const splitter of primarySplitters) {
    const parts = text.split(splitter).map((part) => part.trim()).filter(Boolean)
    if (parts.length === 2) {
      return {
        iv: cleanInteractionTerm(parts[0]),
        moderator: cleanInteractionTerm(parts[1]),
      }
    }
  }

  return null
}

function interactionSourceMatches(source: string, iv: string, moderator: string): boolean {
  const parsed = parseInteractionSource(source)
  if (parsed) {
    const directMatch = normalizedMetricMatches(parsed.iv, iv) && normalizedMetricMatches(parsed.moderator, moderator)
    const swappedMatch = normalizedMetricMatches(parsed.iv, moderator) && normalizedMetricMatches(parsed.moderator, iv)
    return directMatch || swappedMatch
  }

  const normalizedSource = normalizeMetricKey(source).replace(/interaction$/i, '')
  const normalizedIv = normalizeMetricKey(iv)
  const normalizedModerator = normalizeMetricKey(moderator)
  return normalizedSource === `${normalizedIv}${normalizedModerator}`
    || normalizedSource === `${normalizedModerator}${normalizedIv}`
    || normalizedSource === `${normalizedIv}x${normalizedModerator}`
    || normalizedSource === `${normalizedModerator}x${normalizedIv}`
    || normalizedSource === `${normalizedIv}by${normalizedModerator}`
    || normalizedSource === `${normalizedModerator}by${normalizedIv}`
    || normalizedSource === `${normalizedIv}_${normalizedModerator}`
    || normalizedSource === `${normalizedModerator}_${normalizedIv}`
}

function interactionLabelMatches(candidate: string, interaction: string): boolean {
  const parsed = parseInteractionSource(interaction)
  if (!parsed) return normalizedMetricMatches(candidate, interaction)
  return interactionSourceMatches(candidate, parsed.iv, parsed.moderator)
}

function findPathStats(statsByPath: Map<string, PathStats>, from: string, to: string): PathStats | null {
  const direct = statsByPath.get(`${from}:::${to}`)
  if (direct) return direct

  for (const stats of statsByPath.values()) {
    if (normalizedMetricMatches(stats.from, from) && normalizedMetricMatches(stats.to, to)) {
      return stats
    }
  }

  for (const stats of statsByPath.values()) {
    if (!parseInteractionSource(stats.from) && normalizedMetricMatches(stats.to, to)) {
      return stats
    }
  }

  return null
}

function findInteractionPathStats(statsByPath: Map<string, PathStats>, interaction: ModerationInteraction): PathStats | null {
  const directKey = `${interaction.interaction}:::${interaction.dv}`
  const direct = statsByPath.get(directKey)
  if (direct) return direct

  for (const stats of statsByPath.values()) {
    const fromMatch = interactionSourceMatches(stats.from, interaction.iv, interaction.moderator)
    const toMatch = normalizedMetricMatches(stats.to, interaction.dv)
    if (fromMatch && toMatch) return stats
  }

  for (const stats of statsByPath.values()) {
    if (parseInteractionSource(stats.from) && normalizedMetricMatches(stats.to, interaction.dv)) {
      return stats
    }
  }

  const allInteractionStats = Array.from(statsByPath.values()).filter((s) => parseInteractionSource(s.from) != null)
  if (allInteractionStats.length === 1) {
    return allInteractionStats[0]
  }

  return null
}

function buildCoefficientLookup(analysisResults: any): Map<string, number> {
  const rows = getPathCoefficientRows(analysisResults)

  const lookup = new Map<string, number>()
  rows.forEach((row: Record<string, unknown>) => {
    const parsed = parsePathFromRow(row)
    const coefficient = parseCoefficient(row)
    if (!parsed || coefficient == null) return
    lookup.set(`${parsed.from}:::${parsed.to}`, coefficient)
  })
  return lookup
}


function resolveConstructName(val: any, constructs: any[]): string {
  if (!val) return ''
  const valStr = String(val).trim()
  if (!valStr) return ''

  const byName = constructs.find((c) => String(c?.name ?? '').trim().toLowerCase() === valStr.toLowerCase())
  if (byName?.name) return String(byName.name).trim()

  const normVal = valStr.replace(/^c(onstruct)?[-_]/i, '').toLowerCase()
  const byId = constructs.find((c) => {
    const cId = String(c?.id ?? '').trim().toLowerCase()
    const normCId = cId.replace(/^c(onstruct)?[-_]/i, '')
    return cId === valStr.toLowerCase() || normCId === normVal
  })
  if (byId?.name) return String(byId.name).trim()

  return valStr
}

function getConstructNameById(savedModel: any): Map<string, string> {
  return new Map(
    Array.isArray(savedModel?.constructs)
      ? savedModel.constructs.map((construct: any) => [String(construct.id), String(construct.name)])
      : []
  )
}

function getConstructIndicatorCountById(savedModel: any): Map<string, number> {
  return new Map(
    Array.isArray(savedModel?.constructs)
      ? savedModel.constructs
        .filter((construct: any) => Array.isArray(construct?.indicators))
        .map((construct: any) => [
          String(construct.id),
          construct.indicators.filter((indicator: any) => String(indicator?.name ?? indicator ?? '').trim().length > 0).length,
        ])
      : []
  )
}

function getConstructIndicatorsById(savedModel: any): Map<string, string[]> {
  return new Map(
    Array.isArray(savedModel?.constructs)
      ? savedModel.constructs.map((construct: any) => [
        String(construct.id),
        Array.isArray(construct?.indicators)
          ? construct.indicators
            .map((indicator: any) => String(indicator?.name ?? indicator ?? '').trim())
            .filter(Boolean)
          : [],
      ])
      : []
  )
}

function formatModeratorMeasurement(indicatorCount: number | null | undefined): string {
  if (indicatorCount === 1) return 'Single item'
  if (typeof indicatorCount === 'number' && indicatorCount > 1) return `${indicatorCount} indicators`
  return 'Not available'
}

export function getModerationInteractions(savedModel: any, analysisResults: any): ModerationInteraction[] {
  const constructs: any[] = Array.isArray(savedModel?.constructs) ? savedModel.constructs : []
  const constructIndicatorCountById = getConstructIndicatorCountById(savedModel)
  const constructIndicatorsById = getConstructIndicatorsById(savedModel)
  const paths: any[] = Array.isArray(savedModel?.paths) ? savedModel.paths : []
  const pathById = new Map<string, any>(paths.map((path: any) => [String(path.id), path]))
  const interactions: ModerationInteraction[] = []
  const seen = new Set<string>()

  paths.forEach((path: any) => {
    if (path?.kind !== 'moderation') return
    const targetPath =
      (path.targetPathId != null ? pathById.get(String(path.targetPathId)) : undefined) ??
      paths.find((p: any) => p.kind !== 'moderation' && String(p.id) === String(path.targetPathId)) ??
      paths.find((p: any) => p.kind !== 'moderation' && p.from !== path.from && path.to != null && p.to === path.to) ??
      paths.find((p: any) => p.kind !== 'moderation' && p.from !== path.from)
    if (!targetPath) return

    const iv = resolveConstructName(targetPath.from, constructs)
    const moderator = resolveConstructName(path.from, constructs)
    const dv = resolveConstructName(targetPath.to, constructs) || resolveConstructName(path.to, constructs)
    if (!iv || !moderator || !dv) return

    const interaction = `${iv}*${moderator}`
    const key = `${interaction}:::${dv}`
    if (seen.has(key)) return
    seen.add(key)
    interactions.push({
      iv,
      moderator,
      dv,
      interaction,
      moderatorMeasurement: formatModeratorMeasurement(constructIndicatorCountById.get(String(path.from))),
      moderatorIndicators: constructIndicatorsById.get(String(path.from)) ?? [],
    })
  })

  if (interactions.length) return interactions

  buildPathStatsLookup(analysisResults).forEach((stats) => {
    const parsedInteraction = parseInteractionSource(stats.from)
    if (!parsedInteraction || !stats.to) return
    const { iv, moderator } = parsedInteraction
    if (!iv || !moderator) return
    const interaction = `${iv}*${moderator}`
    const key = `${interaction}:::${stats.to}`
    if (seen.has(key)) return
    seen.add(key)
    interactions.push({ iv, moderator, dv: stats.to, interaction, moderatorMeasurement: 'Not available', moderatorIndicators: [] })
  })

  return interactions
}

function readF2(analysisResults: any, dv: string, interaction: string): number | null {
  const rows = analysisResults?.quality_criteria?.f_square
  if (!Array.isArray(rows)) return null

  const normalizedDv = normalizeMetricKey(dv)
  for (const row of rows as Array<Record<string, unknown>>) {
    const rowName = readRowValue(row, ['row_name', 'row', 'from', 'source', 'predictor', 'construct'])
    const rowNameText = rowName == null ? '' : String(rowName)
    const normalizedRowName = normalizeMetricKey(rowNameText)

    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = normalizeMetricKey(key)
      const isSourceRowShape = interactionLabelMatches(rowNameText, interaction) && normalizedKey === normalizedDv
      const isTargetRowShape = normalizedRowName === normalizedDv && interactionLabelMatches(key, interaction)
      if (!isSourceRowShape && !isTargetRowShape) continue
      const parsed = toFiniteNumber(value)
      if (parsed != null) return parsed
    }
  }

  return null
}

function getModeratorObservedLevels(analysisResults: any, interaction: ModerationInteraction): number[] {
  if (interaction.moderatorMeasurement !== 'Single item') return []

  const candidateKeys = new Set(
    [interaction.moderator, ...interaction.moderatorIndicators]
      .map((field) => normalizeMetricKey(field))
      .filter(Boolean)
  )
  if (!candidateKeys.size) return []

  const sourceTables = [
    Array.isArray(analysisResults?.model_and_data?.indicator_data_original)
      ? analysisResults.model_and_data.indicator_data_original
      : [],
    Array.isArray(analysisResults?.final_results?.latent_variables)
      ? analysisResults.final_results.latent_variables
      : [],
  ] as Array<Array<Record<string, unknown>>>

  for (const rows of sourceTables) {
    if (!rows.length) continue

    const levels = new Set<number>()
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        if (!candidateKeys.has(normalizeMetricKey(key))) continue
        const numericValue = toFiniteNumber(value)
        if (numericValue == null) continue
        levels.add(numericValue)
      }
    }

    const sorted = [...levels].sort((left, right) => left - right)
    if (sorted.length >= 2 && sorted.length <= 5 && sorted.every((value) => Number.isInteger(value))) {
      return sorted
    }
  }

  return []
}

function readR2(analysisResults: any, dv: string): number | null {
  const rows = analysisResults?.quality_criteria?.r_square
  if (!Array.isArray(rows)) return null

  const normalizedDv = normalizeMetricKey(dv)
  for (const row of rows as Array<Record<string, unknown>>) {
    const rowName = readRowValue(row, ['construct', 'row_name', 'endogenous', 'DV'])
    if (rowName != null && normalizeMetricKey(String(rowName)) !== normalizedDv) continue
    const r2 = readMetricValue(row, ['r2', 'R²', 'R Square', 'R-square'])
    if (r2 != null) return r2
  }

  return null
}

function effectSizeLabel(f2: number | null): string {
  if (f2 == null) return 'Not available'
  if (f2 >= 0.35) return 'Large'
  if (f2 >= 0.15) return 'Medium'
  if (f2 >= 0.02) return 'Small'
  return 'Negligible'
}

function significanceDecision(pValue: number | null): string {
  if (pValue == null) return 'Run Bootstrap'
  return pValue <= 0.05 ? 'Significant' : 'Not significant'
}

function directionInterpretation(interaction: ModerationInteraction, beta: number | null): string {
  if (beta == null) return 'Interaction direction unavailable'
  if (beta > 0) return `Strengthens ${interaction.iv} -> ${interaction.dv} as ${interaction.moderator} increases`
  if (beta < 0) return `Weakens ${interaction.iv} -> ${interaction.dv} as ${interaction.moderator} increases`
  return `No directional change in ${interaction.iv} -> ${interaction.dv}`
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function deriveSpecificIndirectRows(savedModel: any, analysisResults: any): Array<Record<string, unknown>> {
  if (!savedModel?.paths?.length || !savedModel?.constructs?.length) return []

  const constructNameById = new Map(
    savedModel.constructs.map((construct: any) => [String(construct.id), String(construct.name)])
  )
  const structuralEdges = savedModel.paths
    .filter((path: any) => path?.kind !== 'moderation')
    .map((path: any) => ({
      from: constructNameById.get(String(path.from)) ?? String(path.from ?? ''),
      to: constructNameById.get(String(path.to)) ?? String(path.to ?? ''),
    }))
    .filter((path: { from: string; to: string }) => path.from && path.to && path.from !== path.to)

  const outgoingBySource = new Map<string, string[]>()
  structuralEdges.forEach((edge: { from: string; to: string }) => {
    if (!outgoingBySource.has(edge.from)) outgoingBySource.set(edge.from, [])
    outgoingBySource.get(edge.from)?.push(edge.to)
  })

  const coefficients = buildCoefficientLookup(analysisResults)
  const derivedRows: Array<Record<string, unknown>> = []
  const seen = new Set<string>()

  outgoingBySource.forEach((midNodes, source) => {
    midNodes.forEach((mid) => {
      const targets = outgoingBySource.get(mid) ?? []
      targets.forEach((target) => {
        if (source === target) return
        const first = coefficients.get(`${source}:::${mid}`)
        const second = coefficients.get(`${mid}:::${target}`)
        if (!Number.isFinite(first) || !Number.isFinite(second)) return

        const chainKey = `${source}:::${mid}:::${target}`
        if (seen.has(chainKey)) return
        seen.add(chainKey)

        derivedRows.push({
          Path: `${source} -> ${mid} -> ${target}`,
          Through: mid,
          Effect: Number((Number(first) * Number(second)).toFixed(12)),
        })
      })
    })
  })

  return derivedRows
}

export function hasModerationInteractions(savedModel: any, analysisResults: any): boolean {
  return getModerationInteractions(savedModel, analysisResults).length > 0
}

export function hasModerationSlopeCoefficients(savedModel: any, analysisResults: any): boolean {
  const statsByPath = buildPathStatsLookup(analysisResults)
  return getModerationInteractions(savedModel, analysisResults).some(
    (interaction) => findInteractionPathStats(statsByPath, interaction)?.coefficient != null,
  )
}

export function deriveModerationSummaryRows(savedModel: any, analysisResults: any): Array<Record<string, unknown>> {
  const statsByPath = buildPathStatsLookup(analysisResults)
  return getModerationInteractions(savedModel, analysisResults).map((interaction) => {
    const stats = findInteractionPathStats(statsByPath, interaction)
    const beta = stats?.coefficient ?? null
    const pValue = stats?.pValue ?? null
    const f2 = readF2(analysisResults, interaction.dv, interaction.interaction)

    return {
      IV: interaction.iv,
      Moderator: interaction.moderator,
      moderator_measurement: interaction.moderatorMeasurement,
      DV: interaction.dv,
      Interaction: interaction.interaction,
      beta_interaction: beta == null ? null : roundMetric(beta),
      t_stat: stats?.tStat == null ? null : roundMetric(stats.tStat),
      p_value: pValue == null ? null : roundMetric(pValue),
      f2: f2 == null ? null : roundMetric(f2),
      direction: directionInterpretation(interaction, beta),
      decision: significanceDecision(pValue),
    }
  })
}

export function deriveModerationSlopeRows(savedModel: any, analysisResults: any): Array<Record<string, unknown>> {
  const statsByPath = buildPathStatsLookup(analysisResults)
  const rows: Array<Record<string, unknown>> = []

  getModerationInteractions(savedModel, analysisResults).forEach((interaction) => {
    const base = findPathStats(statsByPath, interaction.iv, interaction.dv)?.coefficient ?? 0
    const betaInteraction = findInteractionPathStats(statsByPath, interaction)?.coefficient
    if (betaInteraction == null) return

    const baseLabel = formatFormulaNumber(base)
    const interactionLabel = formatFormulaNumber(betaInteraction)
    const observedLevels = getModeratorObservedLevels(analysisResults, interaction)
    if (observedLevels.length) {
      observedLevels.forEach((level) => {
        rows.push({
          Interaction: interaction.interaction,
          DV: interaction.dv,
          Moderator_level: `${interaction.moderator} = ${formatFormulaNumber(level)}`,
          simple_slope: roundMetric(base + (betaInteraction * level)),
          interpretation: `${baseLabel} + (${interactionLabel} x ${formatFormulaNumber(level)})`,
        })
      })
      return
    }

    rows.push(
      {
        IV: interaction.iv,
        Moderator: interaction.moderator,
        DV: interaction.dv,
        Interaction: interaction.interaction,
        Moderator_level: `Low ${interaction.moderator} (-1 SD)`,
        simple_slope: roundMetric(base - betaInteraction),
        interpretation: `${baseLabel} - (${interactionLabel})`,
      },
      {
        IV: interaction.iv,
        Moderator: interaction.moderator,
        DV: interaction.dv,
        Interaction: interaction.interaction,
        Moderator_level: `Mean ${interaction.moderator} (0)`,
        simple_slope: roundMetric(base),
        interpretation: baseLabel,
      },
      {
        IV: interaction.iv,
        Moderator: interaction.moderator,
        DV: interaction.dv,
        Interaction: interaction.interaction,
        Moderator_level: `High ${interaction.moderator} (+1 SD)`,
        simple_slope: roundMetric(base + betaInteraction),
        interpretation: `${baseLabel} + (${interactionLabel})`,
      }
    )
  })

  return rows
}

export function deriveModerationR2ChangeRowsJoint(savedModel: any, analysisResults: any): Array<Record<string, unknown>> {
  return getModerationInteractions(savedModel, analysisResults)
    .map((interaction) => {
      const r2With = readR2(analysisResults, interaction.dv)
      const f2 = readF2(analysisResults, interaction.dv, interaction.interaction)
      if (r2With == null || f2 == null) return null

      const deltaR2 = f2 * (1 - r2With)
      return {
        DV: interaction.dv,
        Interaction: interaction.interaction,
        r2_with_interaction: roundMetric(r2With),
        r2_without_interaction: roundMetric(r2With - deltaR2),
        delta_r2: roundMetric(deltaR2),
        f2_interaction: roundMetric(f2),
        effect_size: effectSizeLabel(f2),
      }
    })
    .filter((row) => row !== null) as Array<Record<string, unknown>>
}

export function deriveModerationR2ChangeRows(savedModel: any, analysisResults: any): Array<Record<string, unknown>> {
  const isolatedRows = analysisResults?.quality_criteria?.r_square_change_isolated
  if (Array.isArray(isolatedRows) && isolatedRows.length > 0) {
    return isolatedRows.map((row: any) => ({
      DV: row.outcome ?? row.dv ?? '',
      Interaction: row.interaction ?? '',
      r2_with_interaction: row.r2_with == null ? null : roundMetric(Number(row.r2_with)),
      r2_without_interaction: row.r2_without == null ? null : roundMetric(Number(row.r2_without)),
      delta_r2: row.delta_r2 == null ? null : roundMetric(Number(row.delta_r2)),
      f2_interaction: row.f2 == null ? null : roundMetric(Number(row.f2)),
      effect_size: row.effect_size ?? effectSizeLabel(row.f2 == null ? null : Number(row.f2)),
    }))
  }

  return deriveModerationR2ChangeRowsJoint(savedModel, analysisResults)
}

export function deriveModerationBootstrapRows(savedModel: any, analysisResults: any): Array<Record<string, unknown>> {
  const statsByPath = buildPathStatsLookup(analysisResults)
  return getModerationInteractions(savedModel, analysisResults)
    .map((interaction) => {
      const stats = findInteractionPathStats(statsByPath, interaction)
      if (!stats) return null
      return {
        IV: interaction.iv,
        Moderator: interaction.moderator,
        moderator_measurement: interaction.moderatorMeasurement,
        DV: interaction.dv,
        Path: stats.path,
        beta_interaction: stats.coefficient == null ? null : roundMetric(stats.coefficient),
        t_stat: stats.tStat == null ? null : roundMetric(stats.tStat),
        p_value: stats.pValue == null ? null : roundMetric(stats.pValue),
        ci_lower: stats.ciLower == null ? null : roundMetric(stats.ciLower),
        ci_upper: stats.ciUpper == null ? null : roundMetric(stats.ciUpper),
        bc_ci_lower: stats.bcCiLower == null ? null : roundMetric(stats.bcCiLower),
        bc_ci_upper: stats.bcCiUpper == null ? null : roundMetric(stats.bcCiUpper),
        decision: significanceDecision(stats.pValue),
      }
    })
    .filter((row) => row !== null) as Array<Record<string, unknown>>
}

function getLevelColor(label: string, index: number): string {
  const norm = label.toLowerCase()
  if (norm.includes('low') || norm.includes('-1')) return 'var(--color-danger, #d96b4d)'
  if (norm.includes('mean') || norm.includes(' 0') || norm.includes('(0)')) return 'var(--color-accent, #c6a24b)'
  if (norm.includes('high') || norm.includes('+1')) return 'var(--color-success, #87976b)'
  const fallbackPalette = ['var(--color-danger, #d96b4d)', 'var(--color-accent, #c6a24b)', 'var(--color-success, #87976b)', '#7c3aed', '#f59e0b']
  return fallbackPalette[index % fallbackPalette.length]
}

function truncateLabelText(str: string, maxLen: number): string {
  if (!str) return ''
  const trimmed = str.trim()
  if (trimmed.length <= maxLen) return trimmed
  return trimmed.substring(0, maxLen - 1) + '…'
}

export function buildModerationSlopeChartSvg(savedModel: any, analysisResults: any): string {
  const rows = deriveModerationSlopeRows(savedModel, analysisResults)
  if (!rows.length) return ''

  const grouped = new Map<string, Array<Record<string, unknown>>>()
  rows.forEach((row) => {
    const key = `${row.Interaction ?? ''}:::${row.DV ?? ''}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)?.push(row)
  })

  const svgElements: string[] = []

  grouped.forEach((groupRows) => {
    if (!groupRows.length) return

    const rawIv = String(groupRows[0]?.IV ?? 'IV')
    const rawModerator = String(groupRows[0]?.Moderator ?? 'Moderator')
    const rawDv = String(groupRows[0]?.DV ?? 'DV')

    const ivName = truncateLabelText(rawIv, 24)
    const moderatorName = truncateLabelText(rawModerator, 24)
    const dvName = truncateLabelText(rawDv, 24)
    const titleText = `${ivName} * ${moderatorName} → ${dvName}`
    const fullTitle = `${rawIv} * ${rawModerator} → ${rawDv}`

    const slopes = groupRows
      .map((row, index) => {
        const label = String(row.Moderator_level ?? `Level ${index + 1}`)
        const color = getLevelColor(label, index)
        return {
          label,
          slope: Number(row.simple_slope),
          color,
        }
      })
      .filter((line) => Number.isFinite(line.slope))

    if (!slopes.length) return

    const width = 740
    const height = 400
    const margin = { left: 88, right: 230, top: 40, bottom: 68 }
    const xMin = -1
    const xMax = 1
    const allY = slopes.flatMap((line) => [line.slope * xMin, line.slope * xMax])
    const yMinRaw = Math.min(...allY)
    const yMaxRaw = Math.max(...allY)
    const yPadding = Math.max(0.05, (yMaxRaw - yMinRaw) * 0.2)
    const yMin = yMinRaw - yPadding
    const yMax = yMaxRaw + yPadding
    const xScale = (x: number) => margin.left + ((x - xMin) / (xMax - xMin)) * (width - margin.left - margin.right)
    const yScale = (y: number) => height - margin.bottom - ((y - yMin) / (yMax - yMin || 1)) * (height - margin.top - margin.bottom)
    const axisY = yScale(0)

    const lineSvg = slopes.map((line, index) => {
      const x1 = xScale(xMin)
      const x2 = xScale(xMax)
      const y1 = yScale(line.slope * xMin)
      const y2 = yScale(line.slope * xMax)
      const legendY = 82 + index * 28
      const displayLabel = truncateLabelText(line.label, 28)
      return `
        <path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${line.color}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="4.5" fill="${line.color}"/>
        <circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="4.5" fill="${line.color}"/>
        <line x1="${width - 216}" y1="${legendY}" x2="${width - 188}" y2="${legendY}" stroke="${line.color}" stroke-width="3" stroke-linecap="round"/>
        <text x="${width - 180}" y="${legendY + 4}" font-size="12" font-weight="500" fill="var(--color-text-secondary, #C8C1AE)"><title>${htmlEscape(line.label)}</title>${htmlEscape(displayLabel)}</text>
      `
    }).join('')

    svgElements.push(`
<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Simple slope plot for ${htmlEscape(fullTitle)}" xmlns="http://www.w3.org/2000/svg" class="moderation-slope-svg max-w-full h-auto">
  <rect width="${width}" height="${height}" rx="12" fill="var(--color-surface, #202020)" stroke="var(--color-border, #3A3A3A)" stroke-width="1"/>
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="var(--color-text-muted, #7A7A7A)" stroke-width="1.5"/>
  <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="var(--color-text-muted, #7A7A7A)" stroke-width="1.5"/>
  <line x1="${margin.left}" y1="${axisY.toFixed(1)}" x2="${width - margin.right}" y2="${axisY.toFixed(1)}" stroke="var(--color-border, #3A3A3A)" stroke-dasharray="4 4"/>
  <text x="${margin.left}" y="24" font-size="14" font-weight="700" fill="var(--color-text-primary, #F5F1E7)"><title>${htmlEscape(fullTitle)}</title>${htmlEscape(titleText)}</text>
  <text x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 16}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--color-text-primary, #F5F1E7)"><title>${htmlEscape(rawIv)}</title>${htmlEscape(ivName)}</text>
  <text x="24" y="${margin.top + (height - margin.top - margin.bottom) / 2}" transform="rotate(-90 24 ${margin.top + (height - margin.top - margin.bottom) / 2})" text-anchor="middle" font-size="13" font-weight="600" fill="var(--color-text-primary, #F5F1E7)"><title>${htmlEscape(rawDv)}</title>${htmlEscape(dvName)}</text>
  <text x="${xScale(-1)}" y="${height - 42}" text-anchor="middle" font-size="11" font-weight="500" fill="var(--color-text-secondary, #C8C1AE)">Low ${htmlEscape(truncateLabelText(rawIv, 16))} (-1 SD)</text>
  <text x="${xScale(1)}" y="${height - 42}" text-anchor="middle" font-size="11" font-weight="500" fill="var(--color-text-secondary, #C8C1AE)">High ${htmlEscape(truncateLabelText(rawIv, 16))} (+1 SD)</text>
  ${lineSvg}
</svg>`.trim())
  })

  return svgElements.join('\n')
}
