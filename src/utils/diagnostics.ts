export type DiagnosticCategory = 'calculation' | 'dataset' | 'workspace' | 'ui'
export type DiagnosticLevel = 'info' | 'warn' | 'error'

export interface DiagnosticEntry {
  id: string
  timestamp: string
  category: DiagnosticCategory
  level: DiagnosticLevel
  message: string
  details?: unknown
}

export interface DiagnosticInput {
  category: DiagnosticCategory
  level?: DiagnosticLevel
  message: string
  details?: unknown
}

const MAX_ENTRIES = 300
const listeners = new Set<() => void>()
let entries: DiagnosticEntry[] = []

const ABSOLUTE_PATH_KEYS = new Set([
  'datasetpath',
  'workspacepath',
  'absolutepath',
  'datasettemppath',
  'rscript',
  'home',
  'libpaths',
  'filepaths',
  'indexhtmlpath',
  'apppath',
  'distdir',
  'cwd',
])

function notifyListeners(): void {
  listeners.forEach((listener) => listener())
}

function looksLikeAbsoluteFilesystemPath(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^file:\/\//i.test(trimmed)) return true
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return true
  return /^\/(users|home|var|tmp|private|mnt|volumes)\//i.test(trimmed)
}

function extractPathLabel(value: string): string {
  const normalized = value
    .replace(/^file:\/\/+?/i, '')
    .replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] || 'path'
}

function sanitizeString(value: string, key: string): string {
  const normalizedKey = key.toLowerCase()
  if (normalizedKey === 'filepath' && !looksLikeAbsoluteFilesystemPath(value)) {
    return value
  }
  if (ABSOLUTE_PATH_KEYS.has(normalizedKey) || (normalizedKey === 'filepath' && looksLikeAbsoluteFilesystemPath(value))) {
    if (looksLikeAbsoluteFilesystemPath(value)) {
      return `[redacted-path: ${extractPathLabel(value)}]`
    }
  }
  return value
}

function normalizeDetails(details: unknown): unknown {
  if (details === undefined) return undefined

  try {
    const seen = new WeakSet<object>()

    const sanitizeValue = (value: unknown, key = ''): unknown => {
      if (value instanceof Error) {
        return sanitizeValue({
          name: value.name,
          message: value.message,
          stack: value.stack,
        }, key)
      }
      if (typeof value === 'bigint') {
        return value.toString()
      }
      if (value instanceof Map) {
        return sanitizeValue(Object.fromEntries(value.entries()), key)
      }
      if (value instanceof Set) {
        return sanitizeValue(Array.from(value.values()), key)
      }
      if (typeof value === 'string') {
        return sanitizeString(value, key)
      }
      if (Array.isArray(value)) {
        return value.map((item) => sanitizeValue(item, key))
      }
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]'
        seen.add(value)
        return Object.fromEntries(
          Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeValue(childValue, childKey)]),
        )
      }
      return value
    }

    const serialized = JSON.stringify(sanitizeValue(details))

    return serialized == null ? details : JSON.parse(serialized)
  } catch {
    if (typeof details === 'string') return details
    return String(details)
  }
}

export function addDiagnostic(input: DiagnosticInput): DiagnosticEntry {
  const entry: DiagnosticEntry = {
    id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    category: input.category,
    level: input.level ?? 'info',
    message: input.message,
    details: normalizeDetails(input.details),
  }

  entries = [...entries, entry].slice(-MAX_ENTRIES)
  notifyListeners()
  return entry
}

export function getDiagnostics(): DiagnosticEntry[] {
  return entries
}

export function clearDiagnostics(): void {
  entries = []
  notifyListeners()
}

export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function formatDiagnosticsForCopy(targetEntries: DiagnosticEntry[]): string {
  return targetEntries.map((entry) => {
    const detailText = entry.details == null
      ? ''
      : `\n${typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details, null, 2)}`
    return `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.category}: ${entry.message}${detailText}`
  }).join('\n\n')
}

export function formatDiagnosticsAsJson(targetEntries: DiagnosticEntry[]): string {
  return JSON.stringify(targetEntries, null, 2)
}
