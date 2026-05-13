import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const electronMainSource = await fs.readFile(path.join(workspaceRoot, 'electron', 'main.ts'), 'utf8')
const verifierSource = await fs.readFile(path.join(workspaceRoot, 'scripts', 'verify-r-bundle-archive.mjs'), 'utf8')
const smokeSource = await fs.readFile(path.join(workspaceRoot, 'scripts', 'smoke-r-bundle-runtime.mjs'), 'utf8')
const packageSource = await fs.readFile(path.join(workspaceRoot, 'package.json'), 'utf8')

assert.match(
  electronMainSource,
  /function findInstalledUnixRscript\(\): RscriptDetection/,
  'Lite setup should have a Unix Rscript detector for macOS and Linux.'
)

assert.match(
  electronMainSource,
  /process\.platform === 'darwin'[\s\S]*\/Library\/Frameworks\/R\.framework\/Resources\/bin\/Rscript[\s\S]*\/opt\/homebrew\/bin\/Rscript/,
  'macOS R detection should check CRAN framework and Homebrew locations.'
)

assert.match(
  electronMainSource,
  /\/usr\/bin\/Rscript[\s\S]*\/usr\/local\/bin\/Rscript/,
  'Unix R detection should check common system Rscript locations.'
)

assert.match(
  electronMainSource,
  /split\(path\.delimiter\)/,
  'Rscript PATH scanning should use the current platform path delimiter.'
)

assert.match(
  electronMainSource,
  /function findInstalledRscript\(options: \{ deepSearch\?: boolean \} = \{\}\): RscriptDetection \{[\s\S]*findInstalledWindowsRscript[\s\S]*findInstalledUnixRscript/,
  'Rscript detection should route to the correct platform detector.'
)

assert.match(
  electronMainSource,
  /function resolveRscriptCommand\(\): string \{[\s\S]*if \(!isLiteBuild\(\) && fs\.existsSync\(extractedRscriptPath\)\) \{[\s\S]*return extractedRscriptPath[\s\S]*METIS_RSCRIPT_PATH/,
  'Bundle should prefer the extracted bundled Rscript before any stale Lite/system override.'
)

assert.match(
  electronMainSource,
  /function isLiteBuild\(\): boolean \{[\s\S]*const \{ archivePath \} = getBundledPortableRuntimePaths\(\)[\s\S]*return !fs\.existsSync\(archivePath\)/,
  'Lite versus Bundle detection should be based on the archive shipped with the current app, not stale extracted runtimes.'
)

assert.match(
  electronMainSource,
  /ipcMain\.handle\('r:findRscript'[\s\S]*findInstalledRscript\(\{ deepSearch: true \}\)/,
  'Lite setup wizard should use platform-aware Rscript detection.'
)

assert.match(
  electronMainSource,
  /R-Portable\.zip[\s\S]*R-macos\.tar\.gz[\s\S]*R-linux\.tar\.gz/,
  'Bundle runtime extraction should select platform-specific R archives, using tarballs for Unix runtimes.'
)

assert.match(
  electronMainSource,
  /async function extractZipArchive[\s\S]*Blocked unsafe archive path/,
  'Windows bundle runtime extraction should keep zip-slip protection.'
)

assert.match(
  electronMainSource,
  /async function extractTarGzArchive[\s\S]*await tar\.x\(\{[\s\S]*file: archivePath[\s\S]*cwd: destinationDir[\s\S]*gzip: true/,
  'macOS and Linux bundle runtime extraction should use async tar.gz extraction.'
)

assert.doesNotMatch(
  electronMainSource,
  /tar\.[a-z]+\(\{[\s\S]{0,240}sync:\s*true/,
  'macOS and Linux bundle runtime extraction must not use synchronous tar extraction.'
)

assert.match(
  electronMainSource,
  /path\.join\(app\.getPath\('userData'\), 'r-runtime'\)/,
  'macOS and Linux bundled R should extract to writable userData, not packaged app resources.'
)

assert.match(
  electronMainSource,
  /R_HOME:[\s\S]*R_LIBS_USER:[\s\S]*R_LIBS_SITE:[\s\S]*LD_LIBRARY_PATH[\s\S]*DYLD_FALLBACK_LIBRARY_PATH/,
  'Bundled Unix R launches should override R_HOME, R library paths, PATH, and platform library paths.'
)

assert.match(
  electronMainSource,
  /const condaUnpackPath = path\.join\(runtimeDir, 'bin', 'conda-unpack'\)[\s\S]*getBundledUnixRuntimeRelocationMarker\(runtimeDir\)/,
  'Bundled Unix R setup should run conda-unpack once and record a marker.'
)

assert.match(
  electronMainSource,
  /function isBundledPortableRuntimeReady\(\): boolean \{[\s\S]*process\.platform === 'win32' \|\| fs\.existsSync\(getBundledUnixRuntimeRelocationMarker\(runtimeDir\)\)/,
  'Unix bundled R should not be considered ready until conda-unpack has completed.'
)

assert.match(
  verifierSource,
  /darwin: 'R-macos\.tar\.gz'[\s\S]*linux: 'R-linux\.tar\.gz'/,
  'Bundle archive verifier should require platform-specific macOS and Linux runtime tarballs.'
)

assert.match(
  verifierSource,
  /R-Bundled\/bin\/Rscript[\s\S]*R-Bundled\/bin\/conda-unpack[\s\S]*REQUIRED_R_PACKAGES\.map/,
  'Bundle archive verifier should check Unix Rscript, conda-unpack, and required R package entries.'
)

assert.match(
  smokeSource,
  /await tar\.x\(\{[\s\S]*file: archivePath[\s\S]*cwd: tempRoot[\s\S]*gzip: true/,
  'Unix runtime smoke test should extract the archive asynchronously.'
)

assert.match(
  smokeSource,
  /condaUnpackPath[\s\S]*requireNamespace\("\$\{packageName\}", quietly = TRUE\)/,
  'Unix runtime smoke test should run conda-unpack and verify every required R package loads.'
)

assert.match(
  packageSource,
  /"build:bundle:mac"[\s\S]*verify-r-bundle-archive\.mjs darwin[\s\S]*smoke-r-bundle-runtime\.mjs darwin/,
  'macOS Bundle builds should smoke-test the conda-packed runtime before packaging.'
)

assert.match(
  packageSource,
  /"build:bundle:linux"[\s\S]*verify-r-bundle-archive\.mjs linux[\s\S]*smoke-r-bundle-runtime\.mjs linux/,
  'Linux Bundle builds should smoke-test the conda-packed runtime before packaging.'
)

console.log('PASS cross-platform runtime guards')
