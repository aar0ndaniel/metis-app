import path from 'path'

export function normalizeSecurityPath(targetPath: string): string {
  const resolved = path.resolve(String(targetPath ?? '').trim())
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
  const target = normalizeSecurityPath(targetPath)
  const root = normalizeSecurityPath(rootPath)
  const separator = process.platform === 'win32' ? '\\' : '/'
  const prefix = root.endsWith(separator) ? root : `${root}${separator}`
  return target === root || target.startsWith(prefix)
}

export function isRendererWriteTargetAllowed(
  targetPath: string,
  options: {
    approvedWritePaths: Iterable<string>
    trustedRoots?: Iterable<string>
    allowTrustedRoots?: boolean
  },
): boolean {
  const normalizedTarget = normalizeSecurityPath(targetPath)
  const approvedWritePaths = Array.from(options.approvedWritePaths, (entry) => normalizeSecurityPath(entry))
  if (approvedWritePaths.includes(normalizedTarget)) {
    return true
  }

  if (!options.allowTrustedRoots) {
    return false
  }

  const trustedRoots = Array.from(options.trustedRoots ?? [])
  return trustedRoots.some((root) => isPathWithinRoot(normalizedTarget, root))
}
