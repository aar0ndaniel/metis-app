import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import * as tar from 'tar'
import { REQUIRED_R_PACKAGES } from './sync-r-portable-zip.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')

const platform = process.argv[2] || process.platform
const archiveByPlatform = {
  darwin: 'R-macos.tar.gz',
  linux: 'R-linux.tar.gz',
}

const archiveName = archiveByPlatform[platform]
if (!archiveName) {
  console.error(`Runtime smoke test is only supported for macOS/Linux bundles, got: ${platform}`)
  process.exit(1)
}

function run(executablePath, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr?.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(stderr.trim() || stdout.trim() || `${path.basename(executablePath)} exited with code ${code}`))
      }
    })
  })
}

const archivePath = path.join(workspaceRoot, 'r-api', archiveName)
if (!fs.existsSync(archivePath)) {
  console.error(`Missing ${archiveName}.`)
  process.exit(1)
}

const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), `metis-r-${platform}-`))
try {
  await tar.x({
    file: archivePath,
    cwd: tempRoot,
    gzip: true,
    preserveOwner: false,
    strict: true,
  })

  const runtimeDir = path.join(tempRoot, 'R-Bundled')
  const rscriptPath = path.join(runtimeDir, 'bin', 'Rscript')
  const condaUnpackPath = path.join(runtimeDir, 'bin', 'conda-unpack')
  await fs.promises.chmod(rscriptPath, 0o755).catch(() => {})
  await fs.promises.chmod(condaUnpackPath, 0o755).catch(() => {})

  await run(condaUnpackPath, [], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      PATH: [path.join(runtimeDir, 'bin'), process.env.PATH || ''].filter(Boolean).join(path.delimiter),
    },
  })

  const rHome = path.join(runtimeDir, 'lib', 'R')
  const rLibrary = path.join(rHome, 'library')
  const rLib = path.join(runtimeDir, 'lib')
  const env = {
    ...process.env,
    R_HOME: rHome,
    R_LIBS_USER: rLibrary,
    R_LIBS_SITE: rLibrary,
    PATH: [path.join(runtimeDir, 'bin'), process.env.PATH || ''].filter(Boolean).join(path.delimiter),
  }
  if (platform === 'linux') {
    env.LD_LIBRARY_PATH = [rLib, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(path.delimiter)
  }
  if (platform === 'darwin') {
    env.DYLD_FALLBACK_LIBRARY_PATH = [rLib, process.env.DYLD_FALLBACK_LIBRARY_PATH || ''].filter(Boolean).join(path.delimiter)
  }

  const rCode = REQUIRED_R_PACKAGES
    .map((packageName) => `stopifnot(requireNamespace("${packageName}", quietly = TRUE))`)
    .join('; ')
  await run(rscriptPath, ['--vanilla', '--quiet', '-e', rCode], { cwd: runtimeDir, env })
  console.log(`Verified bundled R runtime smoke test: ${archiveName} (${REQUIRED_R_PACKAGES.join(', ')})`)
} finally {
  await fs.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
}
