const METIS_WORKSPACES_KEY = 'metis:workspaces'
const LEGACY_WORKSPACES_KEY = 'pls:workspaces'

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function safeSetItem(storage: Storage | null, key: string, value: string) {
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {
    // Ignore storage quota/runtime errors and preserve the active session.
  }
}

function safeRemoveItem(storage: Storage | null, key: string) {
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // Ignore storage quota/runtime errors.
  }
}

function safeGetItem(storage: Storage | null, key: string): string | null {
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function readWorkspaceClientCache(): string | null {
  return (
    safeGetItem(getSessionStorage(), METIS_WORKSPACES_KEY)
    ?? safeGetItem(getSessionStorage(), LEGACY_WORKSPACES_KEY)
    ?? safeGetItem(localStorage, METIS_WORKSPACES_KEY)
    ?? safeGetItem(localStorage, LEGACY_WORKSPACES_KEY)
  )
}

export function writeWorkspaceClientCache(serializedWorkspaces: string) {
  safeSetItem(getSessionStorage(), METIS_WORKSPACES_KEY, serializedWorkspaces)
  safeSetItem(getSessionStorage(), LEGACY_WORKSPACES_KEY, serializedWorkspaces)

  // Drop long-lived copies once the session cache is refreshed.
  safeRemoveItem(localStorage, METIS_WORKSPACES_KEY)
  safeRemoveItem(localStorage, LEGACY_WORKSPACES_KEY)
}
