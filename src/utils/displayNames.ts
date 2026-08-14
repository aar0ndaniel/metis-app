export function stripWorkspaceDisplayName(name: string): string {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/\.metisws$/i, '')
}

export function stripModelDisplayName(name: string): string {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/\.(json|pls|model|hbe|metisws)$/i, '')
}
