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

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = Number(String(value).replace(/^<\s*/, '').trim())
  return Number.isFinite(parsed) ? parsed : null
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
    if (aliasKeys.has(normalizeMetricKey(key))) return value
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
  ])
}

function parseTStat(row: Record<string, unknown>): number | null {
  return readMetricValue(row, ['T Stat.', 'T-stat', 'T statistic', 'T statistics', 'T statistics (|O/STDEV|)', 't_stat', 't value'])
}

function parsePValue(row: Record<string, unknown>): number | null {
  return readMetricValue(row, ['P Value', 'P values', 'P-value', 'p_value', 'p.values', 'p'])
}

function parseCiValue(row: Record<string, unknown>, aliases: string[]): number | null {
  return readMetricValue(row, aliases)
}

function parsePathLabel(pathLabel: string): { from: string; to: string } | null {
  const parts = pathLabel
    .split(/->|→|~>|=>/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length !== 2) return null
  return { from: parts[0], to: parts[1] }
}

function parsePathFromRow(row: Record<string, unknown>): { from: string; to: string; label: string } | null {
  const labelValue = row.path ?? row.Path ?? row.relationship ?? row.Relationship ?? row.row_name ?? row.Row
  const labelText = typeof labelValue === 'string' ? labelValue : ''
  const parsedFromLabel = labelText ? parsePathLabel(labelText) : null
  if (parsedFromLabel) {
    return { ...parsedFromLabel, label: labelText }
  }

  if (typeof row.from === 'string' && typeof row.to === 'string') {
    return { from: row.from.trim(), to: row.to.trim(), label: `${row.from.trim()} -> ${row.to.trim()}` }
  }
  if (typeof row.From === 'string' && typeof row.To === 'string') {
    return { from: row.From.trim(), to: row.To.trim(), label: `${row.From.trim()} -> ${row.To.trim()}` }
  }

  return null
}

function getPathCoefficientRows(analysisResults: any): Array<Record<string, unknown>> {
  const rows = analysisResults?.final_results?.path_coefficients
  return Array.isArray(rows) ? rows : []
}

// Build a fallback coefficient map from inner_model (matrix-as-rows format).
// The R API serializes model$path_coef as rows where row_name = endogenous variable
// and each column key = predictor. Use this when path_coefficients is missing or has
// null coefficients (e.g., jsonlite drops NULL values from named lists).
function buildInnerModelCoefficientFallback(analysisResults: any): Map<string, number> {
  const fallback = new Map<string, number>()
  const innerModel = analysisResults?.model_and_data?.inner_model
  if (!Array.isArray(innerModel)) return fallback

  const ROW_NAME_KEYS = new Set(['row_name', 'row', 'construct', 'Row', 'ROW', '_row'])

  innerModel.forEach((row: Record<string, unknown>) => {
    // Find the endogenous (to) variable name
    let to: string | null = null
    for (const key of ROW_NAME_KEYS) {
      if (typeof row[key] === 'string' && row[key] !== '') {
        to = row[key] as string
        break
      }
    }
    if (!to) return

    // Each non-row-name column is a predictor (from) variable
    Object.entries(row).forEach(([key, value]) => {
      if (ROW_NAME_KEYS.has(key)) return
      const coef = toFiniteNumber(value)
      if (coef == null || coef === 0) return
      fallback.set(`${key}:::${to}`, coef)
    })
  })

  return fallback
}

function buildPathStatsLookup(analysisResults: any): Map<string, PathStats> {
  const lookup = new Map<string, PathStats>()
  const innerModelFallback = buildInnerModelCoefficientFallback(analysisResults)

  getPathCoefficientRows(analysisResults).forEach((row: Record<string, unknown>) => {
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

  // Also add paths from inner_model that are completely absent from path_coefficients
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

  const splitters = [/\*/, /×/, /\s+x\s+/i, /\s+by\s+/i, /:/]
  for (const splitter of splitters) {
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

  return null
}

function findInteractionPathStats(statsByPath: Map<string, PathStats>, interaction: ModerationInteraction): PathStats | null {
  const direct = statsByPath.get(`${interaction.interaction}:::${interaction.dv}`)
  if (direct) return direct

  for (const stats of statsByPath.values()) {
    if (interactionSourceMatches(stats.from, interaction.iv, interaction.moderator) && normalizedMetricMatches(stats.to, interaction.dv)) {
      return stats
    }
  }

  return null
}

function buildCoefficientLookup(analysisResults: any): Map<string, number> {
  const rows = Array.isArray(analysisResults?.final_results?.path_coefficients)
    ? analysisResults.final_results.path_coefficients
    : []

  const lookup = new Map<string, number>()
  rows.forEach((row: Record<string, unknown>) => {
    const parsed = parsePathFromRow(row)
    const coefficient = parseCoefficient(row)
    if (!parsed || coefficient == null) return
    lookup.set(`${parsed.from}:::${parsed.to}`, coefficient)
  })
  return lookup
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

function getModerationInteractions(savedModel: any, analysisResults: any): ModerationInteraction[] {
  const constructNameById = getConstructNameById(savedModel)
  const constructIndicatorCountById = getConstructIndicatorCountById(savedModel)
  const constructIndicatorsById = getConstructIndicatorsById(savedModel)
  const paths: any[] = Array.isArray(savedModel?.paths) ? savedModel.paths : []
  const pathById = new Map<string, any>(paths.map((path: any) => [String(path.id), path]))
  const interactions: ModerationInteraction[] = []
  const seen = new Set<string>()

  paths.forEach((path: any) => {
    if (path?.kind !== 'moderation' || !path.targetPathId) return
    const targetPath = pathById.get(String(path.targetPathId))
    if (!targetPath) return

    const iv = constructNameById.get(String(targetPath.from)) ?? String(targetPath.from ?? '')
    const moderator = constructNameById.get(String(path.from)) ?? String(path.from ?? '')
    const dv = constructNameById.get(String(targetPath.to)) ?? String(targetPath.to ?? path.to ?? '')
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
    const base = findPathStats(statsByPath, interaction.iv, interaction.dv)?.coefficient
    const betaInteraction = findInteractionPathStats(statsByPath, interaction)?.coefficient
    if (base == null || betaInteraction == null) return

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
        Interaction: interaction.interaction,
        DV: interaction.dv,
        Moderator_level: 'Low (-1 SD)',
        simple_slope: roundMetric(base - betaInteraction),
        interpretation: `${baseLabel} - (${interactionLabel})`,
      },
      {
        Interaction: interaction.interaction,
        DV: interaction.dv,
        Moderator_level: 'Mean (0)',
        simple_slope: roundMetric(base),
        interpretation: baseLabel,
      },
      {
        Interaction: interaction.interaction,
        DV: interaction.dv,
        Moderator_level: 'High (+1 SD)',
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

export function buildModerationSlopeChartSvg(savedModel: any, analysisResults: any): string {
  const rows = deriveModerationSlopeRows(savedModel, analysisResults)
  if (!rows.length) return ''

  const grouped = new Map<string, Array<Record<string, unknown>>>()
  rows.forEach((row) => {
    const key = `${row.Interaction ?? ''}:::${row.DV ?? ''}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)?.push(row)
  })

  const firstGroup = Array.from(grouped.values())[0] ?? []
  const palette = ['#2563eb', '#111827', '#dc2626', '#047857', '#7c3aed']
  const slopes = firstGroup
    .map((row, index) => ({
      label: String(row.Moderator_level ?? `Level ${index + 1}`),
      slope: Number(row.simple_slope),
      color: palette[index % palette.length],
    }))
    .filter((line) => Number.isFinite(line.slope))

  if (!slopes.length) return ''

  const width = 640
  const height = 360
  const margin = { left: 64, right: 148, top: 28, bottom: 56 }
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
    const legendY = 70 + index * 28
    return `
      <path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${line.color}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="4" fill="${line.color}"/>
      <circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="4" fill="${line.color}"/>
      <line x1="${width - 130}" y1="${legendY}" x2="${width - 102}" y2="${legendY}" stroke="${line.color}" stroke-width="3" stroke-linecap="round"/>
      <text x="${width - 94}" y="${legendY + 5}" font-size="13" fill="#374151">${htmlEscape(line.label)}</text>
    `
  }).join('')

  const title = String(firstGroup[0]?.Interaction ?? 'IV*Moderator')
  const dv = String(firstGroup[0]?.DV ?? 'DV')
  return `
<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Simple slope plot for ${htmlEscape(title)}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" rx="14" fill="#ffffff"/>
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#d1d5db"/>
  <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#d1d5db"/>
  <line x1="${margin.left}" y1="${axisY.toFixed(1)}" x2="${width - margin.right}" y2="${axisY.toFixed(1)}" stroke="#e5e7eb" stroke-dasharray="5 5"/>
  <text x="${margin.left}" y="18" font-size="14" font-weight="700" fill="#111827">${htmlEscape(title)} -> ${htmlEscape(dv)}</text>
  <text x="${width / 2}" y="${height - 18}" text-anchor="middle" font-size="13" fill="#4b5563">IV scores</text>
  <text x="18" y="${height / 2}" transform="rotate(-90 18 ${height / 2})" text-anchor="middle" font-size="13" fill="#4b5563">DV scores</text>
  <text x="${xScale(-1)}" y="${height - 36}" text-anchor="middle" font-size="12" fill="#6b7280">Low IV</text>
  <text x="${xScale(1)}" y="${height - 36}" text-anchor="middle" font-size="12" fill="#6b7280">High IV</text>
  ${lineSvg}
</svg>`.trim()
}
