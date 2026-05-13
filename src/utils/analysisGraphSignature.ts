interface SignatureConstruct {
  id?: unknown
  name?: unknown
  indicators?: Array<{ name?: unknown } | string> | null
}

interface SignaturePath {
  from?: unknown
  to?: unknown
  kind?: unknown
  targetPathId?: unknown
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
      const name = normalizeToken(construct?.name) || normalizeToken(construct?.id)
      const indicators = sortUnique(
        (construct?.indicators ?? []).map((indicator) =>
          typeof indicator === 'string' ? normalizeToken(indicator) : normalizeToken(indicator?.name)
        )
      )
      return `${name}::${indicators.join('|')}`
    })
  )

  const paths = sortUnique(
    (model?.paths ?? []).map((path) => {
      const from = normalizeToken(path?.from)
      const to = normalizeToken(path?.to)
      const kind = normalizeToken(path?.kind) || 'direct'
      const targetPathId = normalizeToken(path?.targetPathId)
      return `${from}->${to}::${kind}::${targetPathId}`
    })
  )

  return JSON.stringify({ constructs, paths })
}
