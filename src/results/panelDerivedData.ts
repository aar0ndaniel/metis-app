function parseCoefficient(row: Record<string, unknown>): number | null {
  const value = Number(
    row.coefficient ??
    row['Original Est.'] ??
    row['Original Estimate'] ??
    row.original_estimate ??
    row.value
  )
  return Number.isFinite(value) ? value : null
}

function parsePathLabel(pathLabel: string): { from: string; to: string } | null {
  const parts = pathLabel
    .split(/->|→/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length !== 2) return null
  return { from: parts[0], to: parts[1] }
}

function buildCoefficientLookup(analysisResults: any): Map<string, number> {
  const rows = Array.isArray(analysisResults?.final_results?.path_coefficients)
    ? analysisResults.final_results.path_coefficients
    : []

  const lookup = new Map<string, number>()
  rows.forEach((row: Record<string, unknown>) => {
    const parsed = typeof row.path === 'string'
      ? parsePathLabel(row.path)
      : (typeof row.from === 'string' && typeof row.to === 'string'
          ? { from: row.from.trim(), to: row.to.trim() }
          : null)
    const coefficient = parseCoefficient(row)
    if (!parsed || coefficient == null) return
    lookup.set(`${parsed.from}:::${parsed.to}`, coefficient)
  })
  return lookup
}

export function deriveSpecificIndirectRows(savedModel: any, analysisResults: any): Array<Record<string, unknown>> {
  if (!savedModel?.paths?.length || !savedModel?.constructs?.length) return []

  const constructNameById = new Map(
    savedModel.constructs.map((construct: any) => [String(construct.id), String(construct.name)])
  )
  const structuralEdges = savedModel.paths
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
