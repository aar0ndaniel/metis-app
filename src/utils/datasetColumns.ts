import type { VariableKind } from '../types/workspace'

const MISSING_TOKENS = new Set(['', 'na', 'n/a', 'null', 'none', 'nan'])

export type ParsedDatasetNumber =
  | { kind: 'missing'; normalized: '' }
  | { kind: 'invalid'; normalized: null }
  | { kind: 'number'; normalized: string; value: number }

function stripNumericWhitespace(value: string): string {
  return value.replace(/[\s\u00A0']/g, '')
}

function shouldTreatSeparatorAsThousands(integerPart: string, decimalPart: string): boolean {
  const compactInteger = integerPart.replace(/^[+-]/, '')
  return /^\d+$/.test(compactInteger)
    && /^\d+$/.test(decimalPart)
    && decimalPart.length === 3
    && compactInteger.length > 0
    && !/^0+$/.test(compactInteger)
}

function normalizeNumericCandidate(rawValue: string): string | null {
  const compact = stripNumericWhitespace(rawValue)
  if (!compact) return null

  let candidate = compact
  const hasComma = candidate.includes(',')
  const hasDot = candidate.includes('.')

  if (hasComma && hasDot) {
    const lastComma = candidate.lastIndexOf(',')
    const lastDot = candidate.lastIndexOf('.')
    const decimalSeparator = lastComma > lastDot ? ',' : '.'
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ','
    candidate = candidate.split(thousandsSeparator).join('')

    if (decimalSeparator === ',') {
      const decimalIndex = candidate.lastIndexOf(',')
      candidate = `${candidate.slice(0, decimalIndex).replace(/,/g, '')}.${candidate.slice(decimalIndex + 1)}`
    } else {
      const decimalIndex = candidate.lastIndexOf('.')
      candidate = `${candidate.slice(0, decimalIndex).replace(/\./g, '')}.${candidate.slice(decimalIndex + 1)}`
    }
  } else if (hasComma) {
    const parts = candidate.split(',')
    const decimalPart = parts.pop() ?? ''
    const integerPart = parts.join('')
    candidate = shouldTreatSeparatorAsThousands(integerPart, decimalPart)
      ? `${integerPart}${decimalPart}`
      : `${integerPart}.${decimalPart}`
  } else if ((candidate.match(/\./g) ?? []).length > 1) {
    const parts = candidate.split('.')
    const decimalPart = parts.pop() ?? ''
    const integerPart = parts.join('')
    candidate = shouldTreatSeparatorAsThousands(integerPart, decimalPart)
      ? `${integerPart}${decimalPart}`
      : `${integerPart}.${decimalPart}`
  }

  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(candidate)) {
    return null
  }

  return candidate
}

export function parseDatasetNumber(value: unknown): ParsedDatasetNumber {
  const rawValue = String(value ?? '').trim()
  if (MISSING_TOKENS.has(rawValue.toLowerCase())) {
    return { kind: 'missing', normalized: '' }
  }

  const normalized = normalizeNumericCandidate(rawValue)
  if (!normalized) {
    return { kind: 'invalid', normalized: null }
  }

  const numericValue = Number(normalized)
  if (!Number.isFinite(numericValue)) {
    return { kind: 'invalid', normalized: null }
  }

  return {
    kind: 'number',
    normalized,
    value: numericValue,
  }
}

function normalizeHeaderBase(value: string, index: number): string {
  const trimmed = String(value ?? '').trim()
  return trimmed || `Column ${index + 1}`
}

function makeUniqueAgainstExisting(existingHeaders: string[], base: string): string {
  if (!existingHeaders.includes(base)) return base
  let suffix = 2
  let candidate = `${base} (${suffix})`
  while (existingHeaders.includes(candidate)) {
    suffix += 1
    candidate = `${base} (${suffix})`
  }
  return candidate
}

export function getUniqueHeaderName(headers: string[], proposedValue: string, currentIndex?: number): string {
  const base = normalizeHeaderBase(proposedValue, currentIndex ?? headers.length)
  const otherHeaders = currentIndex == null
    ? headers
    : headers.filter((_, index) => index !== currentIndex)
  return makeUniqueAgainstExisting(otherHeaders, base)
}

function ensureUniqueHeaders(headers: string[]): string[] {
  return headers.reduce<string[]>((accumulator, header, index) => {
    accumulator.push(makeUniqueAgainstExisting(accumulator, normalizeHeaderBase(header, index)))
    return accumulator
  }, [])
}

export function inferVariableTypesFromRows(headers: string[], rows: string[][]): Record<string, VariableKind> {
  return Object.fromEntries(headers.map((header, columnIndex) => {
    const presentValues = rows
      .map((row) => parseDatasetNumber(row[columnIndex] ?? ''))
      .filter((parsed) => parsed.kind !== 'missing')

    const numericCount = presentValues.filter((parsed) => parsed.kind === 'number').length
    const numericRatio = presentValues.length === 0 ? 0 : numericCount / presentValues.length
    return [header, numericRatio >= 0.8 ? 'MET' : 'CAT']
  }))
}

export function prepareDatasetForPersistence(
  headers: string[],
  rows: string[][],
): {
  headers: string[]
  rows: string[][]
  variableTypes: Record<string, VariableKind>
  headersChanged: boolean
  rowsChanged: boolean
} {
  const normalizedHeaders = ensureUniqueHeaders(headers)
  const variableTypes = inferVariableTypesFromRows(normalizedHeaders, rows)
  const numericColumnIndices = new Set(
    normalizedHeaders.flatMap((header, index) => variableTypes[header] === 'MET' ? [index] : []),
  )

  let rowsChanged = false
  const normalizedRows = rows.map((row) => normalizedHeaders.map((_, columnIndex) => {
    const rawCell = String(row[columnIndex] ?? '')
    if (!numericColumnIndices.has(columnIndex)) return rawCell
    const parsed = parseDatasetNumber(rawCell)
    if (parsed.kind === 'number' && parsed.normalized !== rawCell) {
      rowsChanged = true
      return parsed.normalized
    }
    if (parsed.kind === 'missing' && rawCell !== '') {
      rowsChanged = true
      return ''
    }
    return rawCell
  }))

  const headersChanged = normalizedHeaders.some((header, index) => header !== headers[index])

  return {
    headers: normalizedHeaders,
    rows: normalizedRows,
    variableTypes,
    headersChanged,
    rowsChanged,
  }
}
