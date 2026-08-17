export const DEFAULT_MISSING_MARKER = 'Empty cells / NA'

export const MISSING_MARKER_PRESETS: readonly string[] = [
  'Empty cells / NA',
  '-99',
  '-999',
  '999',
  '-1',
  'None (all valid)',
]

export const CUSTOM_MARKERS_STORAGE_KEY = 'pls:prefs:customMissingMarkers'

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

export function normalizeMissingMarker(marker?: string | null): string {
  const trimmed = (marker ?? '').trim()
  return trimmed.length > 0 ? trimmed : DEFAULT_MISSING_MARKER
}

export function isNoneMissingMarker(marker?: string | null): boolean {
  const norm = normalizeMissingMarker(marker).toLowerCase()
  return norm === 'none' || norm === 'none (all valid)'
}

export function isDefaultNaMarker(marker?: string | null): boolean {
  const norm = normalizeMissingMarker(marker).toLowerCase()
  return (
    norm === 'empty cells / na' ||
    norm === 'empty / na' ||
    norm === 'na' ||
    norm === 'default'
  )
}

export function isMissingDatasetValue(value: unknown, marker?: string | null): boolean {
  if (isNoneMissingMarker(marker)) {
    return false
  }

  const rawStr = String(value ?? '').trim()
  const lowerStr = rawStr.toLowerCase()

  if (isDefaultNaMarker(marker)) {
    return MISSING_DATASET_TOKENS.has(lowerStr)
  }

  const targetMarker = normalizeMissingMarker(marker).toLowerCase()
  return lowerStr === targetMarker
}

export function findMissingCellLocations(
  rows: string[][],
  marker?: string | null
): MissingCellLocation[] {
  const locations: MissingCellLocation[] = []
  rows.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (isMissingDatasetValue(value, marker)) {
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

export function getSavedCustomMissingMarkers(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_MARKERS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    }
  } catch {
    // Ignore JSON errors
  }
  return []
}

export function saveCustomMissingMarker(newMarker: string): string[] {
  const trimmed = newMarker.trim()
  if (!trimmed) return getSavedCustomMissingMarkers()

  const current = getSavedCustomMissingMarkers()
  const allPresets = new Set([...MISSING_MARKER_PRESETS.map((p) => p.toLowerCase()), 'custom...'])
  
  if (!allPresets.has(trimmed.toLowerCase()) && !current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    const updated = [...current, trimmed]
    try {
      localStorage.setItem(CUSTOM_MARKERS_STORAGE_KEY, JSON.stringify(updated))
    } catch {
      // Ignore storage errors
    }
    return updated
  }
  return current
}

export function deleteCustomMissingMarker(markerToDelete: string): string[] {
  const trimmed = markerToDelete.trim()
  if (!trimmed) return getSavedCustomMissingMarkers()

  const current = getSavedCustomMissingMarkers()
  const updated = current.filter((m) => m.toLowerCase() !== trimmed.toLowerCase())
  try {
    localStorage.setItem(CUSTOM_MARKERS_STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // Ignore storage errors
  }
  return updated
}

