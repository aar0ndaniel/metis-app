interface SignatureConstruct {
  id?: unknown
  name?: unknown
  type?: unknown
  weightingMode?: unknown
  isHigherOrder?: unknown
  indicators?: Array<{ name?: unknown } | string> | null
}

interface SignaturePath {
  from?: unknown
  to?: unknown
  kind?: unknown
  targetPathId?: unknown
  hocRole?: unknown
}

interface SignatureModel {
  constructs?: SignatureConstruct[] | null
  paths?: SignaturePath[] | null
}

function normalizeToken(value: unknown): string {
  return String(value ?? '').trim()
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

export function buildAnalysisGraphSignature(model: SignatureModel | null | undefined): string {
  const constructs = sortUnique(
    (model?.constructs ?? []).map((construct) => {
      // Canvas IDs are stable statistical identities. Display names are omitted so
      // renaming a construct does not invalidate or rerun an otherwise identical model.
      const id = normalizeToken(construct?.id) || normalizeToken(construct?.name)
      const type = normalizeToken(construct?.type) || 'Reflective'
      const weightingMode = normalizeToken(construct?.weightingMode) || 'Automatic'
      const isHigherOrder = Boolean(construct?.isHigherOrder)
      const indicators = sortUnique(
        (construct?.indicators ?? []).map((indicator) =>
          typeof indicator === 'string' ? normalizeToken(indicator) : normalizeToken(indicator?.name)
        )
      )
      return `${id}::${type}::${weightingMode}::hoc=${isHigherOrder}::${indicators.join('|')}`
    })
  )

  const paths = sortUnique(
    (model?.paths ?? []).map((path) => {
      const from = normalizeToken(path?.from)
      const to = normalizeToken(path?.to)
      const kind = normalizeToken(path?.kind) || 'direct'
      const targetPathId = normalizeToken(path?.targetPathId)
      const hocRole = normalizeToken(path?.hocRole)
      return `${from}->${to}::${kind}::${targetPathId}::${hocRole}`
    })
  )

  return JSON.stringify({ constructs, paths })
}
