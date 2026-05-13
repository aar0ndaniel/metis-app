export type ComputeOperation = 'sum' | 'mean' | 'mode' | 'median' | 'max' | 'min'

import { getUniqueHeaderName, parseDatasetNumber } from './datasetColumns'

export interface ComputeDerivedColumnInput {
  headers: string[]
  rows: string[][]
  selectedColumnIndices: number[]
  operation: ComputeOperation
  headerName?: string
}

export interface ComputeDerivedColumnResult {
  headers: string[]
  rows: string[][]
  insertedColumnIndex: number
  defaultHeaderName: string
}

function formatNumber(value: number, operation: ComputeOperation): string {
  if (!Number.isFinite(value)) return ''
  if (operation === 'mean') return value.toFixed(2)
  if (Number.isInteger(value)) return String(value)
  const rounded = Number(value.toFixed(6))
  return String(rounded)
}

function computeValue(values: number[], operation: ComputeOperation): number {
  switch (operation) {
    case 'sum':
      return values.reduce((acc, value) => acc + value, 0)
    case 'mean':
      return values.reduce((acc, value) => acc + value, 0) / values.length
    case 'median': {
      const sorted = [...values].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid]
    }
    case 'mode': {
      const counts = new Map<number, number>()
      for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
      const ranked = [...counts.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]
        return a[0] - b[0]
      })
      return ranked[0]?.[0] ?? values[0]
    }
    case 'max':
      return Math.max(...values)
    case 'min':
      return Math.min(...values)
    default:
      return values.reduce((acc, value) => acc + value, 0)
  }
}

function getDefaultHeaderName(operation: ComputeOperation): string {
  switch (operation) {
    case 'sum':
      return 'Sum'
    case 'mean':
      return 'Mean'
    case 'mode':
      return 'Mode'
    case 'median':
      return 'Median'
    case 'max':
      return 'Max'
    case 'min':
      return 'Min'
    default:
      return 'Calculated'
  }
}

export function computeDerivedColumn(input: ComputeDerivedColumnInput): ComputeDerivedColumnResult {
  const uniqueSortedIndices = [...new Set(input.selectedColumnIndices)].sort((a, b) => a - b)
  if (!uniqueSortedIndices.length) {
    throw new Error('Select at least one numeric column before computing a derived column.')
  }

  const insertedColumnIndex = uniqueSortedIndices[uniqueSortedIndices.length - 1] + 1
  const defaultHeaderName = getUniqueHeaderName(
    input.headers,
    input.headerName?.trim() || getDefaultHeaderName(input.operation),
    insertedColumnIndex,
  )

  const computedValues = input.rows.map((row) => {
    const values = uniqueSortedIndices.map((index) => parseDatasetNumber(row[index] ?? ''))
    if (values.some((value) => value.kind === 'invalid')) {
      throw new Error('Compute actions require numeric columns only.')
    }
    const numericValues = values
      .filter((value): value is Extract<typeof value, { kind: 'number' }> => value.kind === 'number')
      .map((value) => value.value)
    if (!numericValues.length) return ''
    return formatNumber(computeValue(numericValues, input.operation), input.operation)
  })

  const headers = [...input.headers]
  headers.splice(insertedColumnIndex, 0, defaultHeaderName)

  const rows = input.rows.map((row, rowIndex) => {
    const next = [...row]
    next.splice(insertedColumnIndex, 0, computedValues[rowIndex])
    return next
  })

  return {
    headers,
    rows,
    insertedColumnIndex,
    defaultHeaderName,
  }
}
