import { parseDatasetNumber } from './datasetColumns'

export type TransformMeasurementType = 'nominal' | 'ordinal' | 'interval' | 'ratio'

export const TRANSFORM_MEASUREMENT_TYPES: Array<{
  value: TransformMeasurementType
  label: string
  note: string
}> = [
  { value: 'nominal', label: 'Nominal (text)', note: 'Names, groups, labels' },
  { value: 'ordinal', label: 'Ordinal', note: 'Ordered categories' },
  { value: 'interval', label: 'Interval / range', note: 'Scaled values without true zero' },
  { value: 'ratio', label: 'Ratio', note: 'Numeric values with true zero' },
]

const TRANSFORM_MEASUREMENT_TYPE_VALUES = new Set<TransformMeasurementType>(
  TRANSFORM_MEASUREMENT_TYPES.map((option) => option.value),
)
const NUMERIC_TRANSFORM_TYPES = new Set<TransformMeasurementType>(['interval', 'ratio'])

export interface ColumnTransformRule {
  from: string
  to: string
  measurementType: TransformMeasurementType
}

export interface ColumnTransformResult {
  rows: string[][]
  matchedCells: number
  changedCells: number
}

function normalizeTerm(value: unknown): string {
  return String(value ?? '').trim()
}

export function getUniqueColumnTerms(rows: string[][], columnIndex: number): string[] {
  const seen = new Set<string>()
  const terms: string[] = []

  for (const row of rows) {
    const term = normalizeTerm(row[columnIndex])
    if (!term || seen.has(term)) continue
    seen.add(term)
    terms.push(term)
  }

  return terms
}

export function suggestTransformMeasurementType(value: string): TransformMeasurementType {
  return parseDatasetNumber(value).kind === 'number' ? 'ratio' : 'nominal'
}

export function applyColumnTransforms(
  rows: string[][],
  columnIndex: number,
  rules: ColumnTransformRule[],
): ColumnTransformResult {
  if (columnIndex < 0 || !Number.isInteger(columnIndex)) {
    throw new Error('Select a valid column before transforming values.')
  }

  const normalizedRules = rules
    .map((rule) => ({
      from: normalizeTerm(rule.from),
      to: String(rule.to ?? '').trim(),
      measurementType: rule.measurementType,
    }))
    .filter((rule) => rule.from.length > 0)

  if (!normalizedRules.length) {
    throw new Error('Add at least one transform before applying changes.')
  }

  const replacements = new Map<string, string>()
  for (const rule of normalizedRules) {
    if (!TRANSFORM_MEASUREMENT_TYPE_VALUES.has(rule.measurementType)) {
      throw new Error(`"${rule.measurementType}" is not a supported statistical type.`)
    }
    if (NUMERIC_TRANSFORM_TYPES.has(rule.measurementType) && parseDatasetNumber(rule.to).kind !== 'number') {
      throw new Error(`"${rule.to}" must be numeric for ${rule.measurementType} transforms.`)
    }
    if (replacements.has(rule.from)) {
      throw new Error(`"${rule.from}" is mapped more than once.`)
    }
    replacements.set(rule.from, rule.to)
  }

  let matchedCells = 0
  let changedCells = 0

  const transformedRows = rows.map((row) => {
    const currentValue = String(row[columnIndex] ?? '')
    const currentTerm = normalizeTerm(currentValue)
    if (!replacements.has(currentTerm)) return row

    matchedCells += 1
    const nextValue = replacements.get(currentTerm) ?? ''
    if (nextValue === currentValue) return row

    changedCells += 1
    const next = [...row]
    next[columnIndex] = nextValue
    return next
  })

  return {
    rows: transformedRows,
    matchedCells,
    changedCells,
  }
}
