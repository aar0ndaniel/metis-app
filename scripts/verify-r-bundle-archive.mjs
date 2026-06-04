import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import * as tar from 'tar'
import { REQUIRED_R_PACKAGES } from './sync-r-portable-zip.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')

const platform = process.argv[2] || process.platform
const arch = process.argv[3] || process.arch
const supportedDarwinArchitectures = new Set(['arm64', 'x64'])
const archiveByPlatform = {
  win32: 'R-Portable.zip',
  linux: 'R-linux.tar.gz',
}

const rscriptEntryByPlatform = {
  win32: 'R-Portable/App/R-Portable/bin/Rscript.exe',
  darwin: 'R-Bundled/bin/Rscript',
  linux: 'R-Bundled/bin/Rscript',
}

const unixRequiredEntries = [
  'R-Bundled/bin/Rscript',
  'R-Bundled/bin/conda-unpack',
  ...REQUIRED_R_PACKAGES.map((packageName) => `R-Bundled/lib/R/library/${packageName}/DESCRIPTION`),
]

if (platform === 'darwin' && !supportedDarwinArchitectures.has(arch)) {
  console.error(`Unsupported macOS bundle architecture: ${arch}`)
  process.exit(1)
}

const archiveName = platform === 'darwin'
  ? `R-macos-${arch}.tar.gz`
  : archiveByPlatform[platform]
if (!archiveName) {
  console.error(`Unsupported bundle platform: ${platform}`)
  process.exit(1)
}

const archivePath = path.join(workspaceRoot, 'r-api', archiveName)
if (!fs.existsSync(archivePath)) {
  console.error(`Missing ${archiveName}. Bundle builds need a platform-specific R runtime archive in r-api/.`)
  process.exit(1)
}

const expectedRscriptEntry = rscriptEntryByPlatform[platform]

if (platform === 'win32') {
  const zip = await JSZip.loadAsync(await fs.promises.readFile(archivePath))
  if (!zip.file(expectedRscriptEntry)) {
    console.error(`${archiveName} is missing ${expectedRscriptEntry}. Bundle extraction expects that exact runtime layout.`)
    process.exit(1)
  }
} else {
  const entries = new Set()
  await tar.t({
    file: archivePath,
    gzip: true,
    onentry: (entry) => {
      entries.add(entry.path.replace(/^\.\//, ''))
    },
  })
  const missing = unixRequiredEntries.filter((entry) => !entries.has(entry))
  if (missing.length > 0) {
    console.error(`${archiveName} is missing ${missing.join(', ')}. Bundle extraction expects that exact runtime layout.`)
    process.exit(1)
  }
}

console.log(`Verified bundled R archive: ${archiveName} (${expectedRscriptEntry})`)
