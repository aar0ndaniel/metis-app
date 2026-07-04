export function stripWorkspaceDisplayName(name: string): string {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/\.(ada|metis|metisws)$/i, '')
}

export function stripModelDisplayName(name: string): string {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/\.(json|pls|model|hbe|ada|metis|metisws)$/i, '')
}
