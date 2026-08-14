export const MISSING_DATASET_TOKENS = new Set([
  '',
  'na',
  'n/a',
  '.',
  'null',
  'none',
  'nan',
])

export type MissingCellLocation = {
  rowIndex: number
  columnIndex: number
}

export function isMissingDatasetValue(value: unknown): boolean {
  return MISSING_DATASET_TOKENS.has(String(value ?? '').trim().toLowerCase())
}

export function findMissingCellLocations(rows: string[][]): MissingCellLocation[] {
  const locations: MissingCellLocation[] = []
  rows.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (isMissingDatasetValue(value)) {
        locations.push({ rowIndex, columnIndex })
      }
    })
  })
  return locations
}

export function getNextMissingCellIndex(currentIndex: number, totalLocations: number): number | null {
  if (totalLocations <= 0) return null
  return (currentIndex + 1 + totalLocations) % totalLocations
}

export function getPreviousMissingCellIndex(currentIndex: number, totalLocations: number): number | null {
  if (totalLocations <= 0) return null
  return (currentIndex - 1 + totalLocations) % totalLocations
}
