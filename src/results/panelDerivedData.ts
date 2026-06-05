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
}

const ROUND_DIGITS = 5

function normalizeMetricKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[²^]/g, '2')
    .replace(/[^a-z0-9]/g, '')
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

function buildPathStatsLookup(analysisResults: any): Map<string, PathStats> {
  const lookup = new Map<string, PathStats>()
  getPathCoefficientRows(analysisResults).forEach((row: Record<string, unknown>) => {
    const parsed = parsePathFromRow(row)
    if (!parsed) return

    const pathLabel = `${parsed.from} -> ${parsed.to}`
    lookup.set(`${parsed.from}:::${parsed.to}`, {
      from: parsed.from,
      to: parsed.to,
      path: parsed.label || pathLabel,
      coefficient: parseCoefficient(row),
      tStat: parseTStat(row),
      pValue: parsePValue(row),
      ciLower: parseCiValue(row, ['2.5% CI', '2.5%', 'CI Lower', 'lower_ci', 'ci_lower']),
      ciUpper: parseCiValue(row, ['97.5% CI', '97.5%', 'CI Upper', 'upper_ci', 'ci_upper']),
      bcCiLower: parseCiValue(row, ['BC 2.5% CI', 'BCa 2.5% CI', 'BCa 2.5%', 'BCa CI Lower', 'bc_ci_lower', 'bca_ci_lower']),
      bcCiUpper: parseCiValue(row, ['BC 97.5% CI', 'BCa 97.5% CI', 'BCa 97.5%', 'BCa CI Upper', 'bc_ci_upper', 'bca_ci_upper']),
    })
  })
  return lookup
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

function getModerationInteractions(savedModel: any, analysisResults: any): ModerationInteraction[] {
  const constructNameById = getConstructNameById(savedModel)
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
    interactions.push({ iv, moderator, dv, interaction })
  })

  if (interactions.length) return interactions

  buildPathStatsLookup(analysisResults).forEach((stats) => {
    if (!stats.from.includes('*') || !stats.to) return
    const [iv, moderator] = stats.from.split('*').map((part) => part.trim()).filter(Boolean)
    if (!iv || !moderator) return
    const interaction = `${iv}*${moderator}`
    const key = `${interaction}:::${stats.to}`
    if (seen.has(key)) return
    seen.add(key)
    interactions.push({ iv, moderator, dv: stats.to, interaction })
  })

  return interactions
}

function readF2(analysisResults: any, dv: string, interaction: string): number | null {
  const rows = analysisResults?.quality_criteria?.f_square
  if (!Array.isArray(rows)) return null

  const normalizedInteraction = normalizeMetricKey(interaction)
  const normalizedDv = normalizeMetricKey(dv)
  for (const row of rows as Array<Record<string, unknown>>) {
    const rowName = readRowValue(row, ['row_name', 'row', 'from', 'source', 'predictor', 'construct'])
    const normalizedRowName = rowName == null ? '' : normalizeMetricKey(String(rowName))

    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = normalizeMetricKey(key)
      const isSourceRowShape = normalizedRowName === normalizedInteraction && normalizedKey === normalizedDv
      const isTargetRowShape = normalizedRowName === normalizedDv && normalizedKey === normalizedInteraction
      if (!isSourceRowShape && !isTargetRowShape) continue
      const parsed = toFiniteNumber(value)
      if (parsed != null) return parsed
    }
  }

  return null
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

export function deriveModerationSummaryRows(savedModel: any, analysisResults: any): Array<Record<string, unknown>> {
  const statsByPath = buildPathStatsLookup(analysisResults)
  return getModerationInteractions(savedModel, analysisResults).map((interaction) => {
    const stats = statsByPath.get(`${interaction.interaction}:::${interaction.dv}`)
    const beta = stats?.coefficient ?? null
    const pValue = stats?.pValue ?? null
    const f2 = readF2(analysisResults, interaction.dv, interaction.interaction)

    return {
      IV: interaction.iv,
      Moderator: interaction.moderator,
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
    const base = statsByPath.get(`${interaction.iv}:::${interaction.dv}`)?.coefficient
    const betaInteraction = statsByPath.get(`${interaction.interaction}:::${interaction.dv}`)?.coefficient
    if (base == null || betaInteraction == null) return

    const baseLabel = formatFormulaNumber(base)
    const interactionLabel = formatFormulaNumber(betaInteraction)
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

export function deriveModerationR2ChangeRows(savedModel: any, analysisResults: any): Array<Record<string, unknown>> {
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

export function deriveModerationBootstrapRows(savedModel: any, analysisResults: any): Array<Record<string, unknown>> {
  const statsByPath = buildPathStatsLookup(analysisResults)
  return getModerationInteractions(savedModel, analysisResults)
    .map((interaction) => {
      const stats = statsByPath.get(`${interaction.interaction}:::${interaction.dv}`)
      if (!stats) return null
      return {
        IV: interaction.iv,
        Moderator: interaction.moderator,
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
  const low = Number(firstGroup.find((row) => row.Moderator_level === 'Low (-1 SD)')?.simple_slope)
  const mean = Number(firstGroup.find((row) => row.Moderator_level === 'Mean (0)')?.simple_slope)
  const high = Number(firstGroup.find((row) => row.Moderator_level === 'High (+1 SD)')?.simple_slope)
  const slopes = [
    { label: 'Low (-1 SD)', slope: low, color: '#2563eb' },
    { label: 'Mean (0)', slope: mean, color: '#111827' },
    { label: 'High (+1 SD)', slope: high, color: '#dc2626' },
  ].filter((line) => Number.isFinite(line.slope))

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
