import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')

export const REQUIRED_R_PACKAGES = ['jsonlite', 'Matrix', 'plumber', 'readxl', 'seminr', 'seminrExtras', 'semPower']
export const REQUIRED_R_PACKAGE_VERSIONS = {
  seminr: '2.5.0',
  seminrExtras: '1.0.0',
}
export const REQUIRED_R_RUNTIME_FILES = [
  {
    label: 'Rblas.dll',
    sourcePath: 'App/R-Portable/bin/x64/Rblas.dll',
    zipPath: 'R-Portable/App/R-Portable/bin/x64/Rblas.dll',
  },
]

function readArg(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

function digestBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function digestFile(filePath) {
  return digestBuffer(await fs.readFile(filePath))
}

function zipEntryForPackage(packageName) {
  return `R-Portable/App/R-Portable/library/${packageName}/DESCRIPTION`
}

function parsePackageVersion(description) {
  return description.match(/^Version:\s*(.+?)\s*$/m)?.[1] ?? null
}

function expectedPackageVersion(packageName) {
  return REQUIRED_R_PACKAGE_VERSIONS[packageName] ?? null
}

async function missingPackagesInSource(sourceDir) {
  const missing = []
  for (const packageName of REQUIRED_R_PACKAGES) {
    const descriptionPath = path.join(sourceDir, 'App', 'R-Portable', 'library', packageName, 'DESCRIPTION')
    if (!(await pathExists(descriptionPath))) {
      missing.push(packageName)
      continue
    }

    const expectedVersion = expectedPackageVersion(packageName)
    if (!expectedVersion) continue

    const actualVersion = parsePackageVersion(await fs.readFile(descriptionPath, 'utf8'))
    if (actualVersion !== expectedVersion) {
      missing.push(`${packageName} ${expectedVersion} (found ${actualVersion ?? 'unknown'})`)
    }
  }
  return missing
}

async function packagesNeedingZipSync(zipPath) {
  if (!(await pathExists(zipPath))) return [...REQUIRED_R_PACKAGES]

  const zip = await JSZip.loadAsync(await fs.readFile(zipPath))
  const missing = []
  for (const packageName of REQUIRED_R_PACKAGES) {
    const entry = zip.file(zipEntryForPackage(packageName))
    if (!entry) {
      missing.push(packageName)
      continue
    }

    const expectedVersion = expectedPackageVersion(packageName)
    if (!expectedVersion) continue

    const actualVersion = parsePackageVersion(await entry.async('string'))
    if (actualVersion !== expectedVersion) {
      missing.push(`${packageName} ${expectedVersion} (found ${actualVersion ?? 'unknown'})`)
    }
  }
  return missing
}

async function runtimeFilesNeedingZipSync(sourceDir, zipPath) {
  if (!(await pathExists(zipPath))) {
    return REQUIRED_R_RUNTIME_FILES.map((entry) => entry.label)
  }

  const zip = await JSZip.loadAsync(await fs.readFile(zipPath))
  const missing = []

  for (const entry of REQUIRED_R_RUNTIME_FILES) {
    const sourcePath = path.join(sourceDir, entry.sourcePath)
    if (!(await pathExists(sourcePath))) {
      missing.push(`${entry.label} (missing source)`)
      continue
    }

    const zipEntry = zip.file(entry.zipPath)
    if (!zipEntry) {
      missing.push(`${entry.label} (missing zip entry)`)
      continue
    }

    const sourceDigest = await digestFile(sourcePath)
    const zipDigest = digestBuffer(await zipEntry.async('nodebuffer'))
    if (sourceDigest !== zipDigest) {
      missing.push(`${entry.label} (source differs from zip)`)
    }
  }

  return missing
}

async function addDirectoryToZip(zip, sourceRoot, currentDir = sourceRoot) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name)
    const relativePath = path.relative(path.dirname(sourceRoot), fullPath).replace(/\\/g, '/')
    if (entry.isDirectory()) {
      zip.folder(relativePath)
      await addDirectoryToZip(zip, sourceRoot, fullPath)
    } else if (entry.isFile()) {
      zip.file(relativePath, await fs.readFile(fullPath))
    }
  }
}

async function rebuildZip(sourceDir, zipPath) {
  const zip = new JSZip()
  await addDirectoryToZip(zip, sourceDir)
  const content = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  await fs.mkdir(path.dirname(zipPath), { recursive: true })
  await fs.writeFile(zipPath, content)
}

function verifyRuntimeCanLoadPackages(sourceDir) {
  const rscriptPath = path.join(sourceDir, 'App', 'R-Portable', 'bin', 'Rscript.exe')
  const packageVector = REQUIRED_R_PACKAGES.map((packageName) => `"${packageName}"`).join(', ')
  const code = [
    `pkgs <- c(${packageVector})`,
    'missing <- pkgs[!vapply(pkgs, requireNamespace, logical(1), quietly = TRUE)]',
    'if (length(missing)) stop(paste("Missing R packages:", paste(missing, collapse = ", ")))',
    'cat("Verified R runtime packages:", paste(pkgs, collapse = ", "), "\\n")',
  ].join('; ')

  const result = spawnSync(rscriptPath, ['-e', code], { cwd: workspaceRoot, encoding: 'utf8' })
  if (result.status !== 0) {
    const spawnError = result.error ? `\nerror:\n${result.error.message}` : ''
    throw new Error(`Bundled R runtime cannot load required packages.${spawnError}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  }

  process.stdout.write(result.stdout)
}

export async function syncRPortableZip({
  sourceDir = path.join(workspaceRoot, 'r-api', 'R-Portable'),
  zipPath = path.join(workspaceRoot, 'r-api', 'R-Portable.zip'),
  skipRuntimeCheck = false,
} = {}) {
  const resolvedSourceDir = path.resolve(sourceDir)
  const resolvedZipPath = path.resolve(zipPath)

  const missingSourcePackages = await missingPackagesInSource(resolvedSourceDir)
  if (missingSourcePackages.length) {
    throw new Error(`Extracted R-Portable runtime is missing required packages: ${missingSourcePackages.join(', ')}`)
  }

  let zipPackagesNeedingSync = await packagesNeedingZipSync(resolvedZipPath)
  let runtimeFilesNeedingSync = await runtimeFilesNeedingZipSync(resolvedSourceDir, resolvedZipPath)
  if (zipPackagesNeedingSync.length || runtimeFilesNeedingSync.length) {
    const reasons = [
      ...zipPackagesNeedingSync,
      ...runtimeFilesNeedingSync,
    ]
    console.log(`R-Portable.zip needs ${reasons.join(', ')}; rebuilding it from ${resolvedSourceDir}.`)
    await rebuildZip(resolvedSourceDir, resolvedZipPath)
    zipPackagesNeedingSync = await packagesNeedingZipSync(resolvedZipPath)
    runtimeFilesNeedingSync = await runtimeFilesNeedingZipSync(resolvedSourceDir, resolvedZipPath)
  }

  if (zipPackagesNeedingSync.length) {
    throw new Error(`R-Portable.zip still has unsatisfied package requirements after rebuild: ${zipPackagesNeedingSync.join(', ')}`)
  }
  if (runtimeFilesNeedingSync.length) {
    throw new Error(`R-Portable.zip still has unsatisfied runtime files after rebuild: ${runtimeFilesNeedingSync.join(', ')}`)
  }

  if (!skipRuntimeCheck) {
    verifyRuntimeCanLoadPackages(resolvedSourceDir)
  }

  console.log(`Verified R-Portable.zip packages: ${REQUIRED_R_PACKAGES.join(', ')}`)
}

const isCli = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false

if (isCli) {
  try {
    await syncRPortableZip({
      sourceDir: readArg('--source', path.join(workspaceRoot, 'r-api', 'R-Portable')),
      zipPath: readArg('--zip', path.join(workspaceRoot, 'r-api', 'R-Portable.zip')),
      skipRuntimeCheck: process.argv.includes('--skip-r-runtime-check'),
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
