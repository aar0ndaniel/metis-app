export interface DatasetViewCacheEntry {
  datasetId?: string
  filePath?: string
  fileName?: string
  workspaceId?: string
  workspaceName?: string
  workspacePath?: string
  headers?: string[]
  allRows?: string[][]
  totalRows?: number
  missing?: number
  missingMarker?: string
  absolutePath?: string
  datasetTempPath?: string
  updatedAt?: string
}

const METIS_PREFIX = 'metis:'
const LEGACY_PREFIX = 'pls:'
const volatileEntries = new Map<string, DatasetViewCacheEntry>()

function buildStorageKey(prefix: string, suffix: string): string {
  return `${prefix}${suffix}`
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function readStorageValue(storage: Storage | null, suffix: string): string | null {
  if (!storage) return null
  try {
    return storage.getItem(buildStorageKey(METIS_PREFIX, suffix))
      ?? storage.getItem(buildStorageKey(LEGACY_PREFIX, suffix))
  } catch {
    return null
  }
}

function writeStorageValue(storage: Storage | null, suffix: string, value: string) {
  if (!storage) return
  try {
    storage.setItem(buildStorageKey(METIS_PREFIX, suffix), value)
    storage.setItem(buildStorageKey(LEGACY_PREFIX, suffix), value)
  } catch {
    // Ignore storage quota/runtime issues and prefer preserving the current session.
  }
}

function removeStorageValue(storage: Storage | null, suffix: string) {
  if (!storage) return
  try {
    storage.removeItem(buildStorageKey(METIS_PREFIX, suffix))
    storage.removeItem(buildStorageKey(LEGACY_PREFIX, suffix))
  } catch {
    // Ignore storage quota/runtime issues.
  }
}

function makePersistentPayload(entry: DatasetViewCacheEntry): DatasetViewCacheEntry {
  return {
    datasetId: entry.datasetId,
    filePath: entry.filePath,
    fileName: entry.fileName,
    workspaceId: entry.workspaceId,
    workspaceName: entry.workspaceName,
    totalRows: entry.totalRows,
    missing: entry.missing,
    updatedAt: entry.updatedAt,
  }
}

export function getDatasetViewCacheKey(datasetId: string): string {
  return `dataset-view:${datasetId}`
}

export function readDatasetViewCache(datasetId?: string | null): DatasetViewCacheEntry | null {
  if (!datasetId) return null
  const volatile = volatileEntries.get(datasetId)
  if (volatile) return volatile
  const raw = readStorageValue(getSessionStorage(), getDatasetViewCacheKey(datasetId))
    ?? readStorageValue(localStorage, getDatasetViewCacheKey(datasetId))
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function writeDatasetViewCache(datasetId: string, entry: DatasetViewCacheEntry) {
  const updatedAt = new Date().toISOString()
  const volatilePayload = {
    ...entry,
    datasetId,
    updatedAt,
  }
  const sessionPayload = JSON.stringify(makePersistentPayload(volatilePayload))
  const persistentPayload = JSON.stringify(makePersistentPayload({
    ...entry,
    datasetId,
    updatedAt,
  }))

  volatileEntries.set(datasetId, volatilePayload)

  writeStorageValue(getSessionStorage(), getDatasetViewCacheKey(datasetId), sessionPayload)
  writeStorageValue(localStorage, getDatasetViewCacheKey(datasetId), persistentPayload)

  if (entry.workspaceName) {
    const workspaceKey = `dataset-view:${entry.workspaceName}`
    writeStorageValue(localStorage, workspaceKey, persistentPayload)
  }
}

export function clearDatasetViewCache(datasetId?: string | null) {
  if (!datasetId) return
  volatileEntries.delete(datasetId)
  removeStorageValue(getSessionStorage(), getDatasetViewCacheKey(datasetId))
  removeStorageValue(localStorage, getDatasetViewCacheKey(datasetId))
}

export function readLegacyDatasetViewCacheByWorkspaceName(workspaceName?: string | null): DatasetViewCacheEntry | null {
  if (!workspaceName) return null
  const raw = readStorageValue(getSessionStorage(), `dataset-view:${workspaceName}`)
    ?? localStorage.getItem(`${LEGACY_PREFIX}dataset-view:${workspaceName}`)
    ?? localStorage.getItem(`${METIS_PREFIX}dataset-view:${workspaceName}`)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearLegacyDatasetViewCacheByWorkspaceName(workspaceName?: string | null) {
  if (!workspaceName) return
  removeStorageValue(getSessionStorage(), `dataset-view:${workspaceName}`)
  removeStorageValue(localStorage, `dataset-view:${workspaceName}`)
}
