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
  /function resolveRscriptCommand\(\): string \{[\s\S]*if \(!isLiteBuild\(\)\) \{[\s\S]*return extractedRscriptPath[\s\S]*METIS_RSCRIPT_PATH/,
  'Bundle should use the bundled Rscript path before any stale Lite/system override.'
)

assert.doesNotMatch(
  electronMainSource,
  /if \(!isLiteBuild\(\) && fs\.existsSync\(extractedRscriptPath\)\)/,
  'Bundle Rscript resolution should not fall back to a system Rscript when the extracted runtime is missing.'
)

assert.match(
  electronMainSource,
  /function getConfiguredAppEdition\(\): 'Bundle' \| 'Lite' \{[\s\S]*__METIS_APP_EDITION__ === 'Lite' \? 'Lite' : 'Bundle'/,
  'Electron main should use the compiled app edition to distinguish packaged Lite and Bundle builds.'
)

assert.match(
  electronMainSource,
  /function isLiteBuild\(\): boolean \{[\s\S]*if \(isDev\) return !fs\.existsSync\(archivePath\)[\s\S]*return getConfiguredAppEdition\(\) === 'Lite'/,
  'Packaged Lite versus Bundle detection should use the build edition while dev keeps archive-based detection.'
)

assert.match(
  electronMainSource,
  /ipcMain\.handle\('r:findRscript'[\s\S]*findInstalledRscript\(\{ deepSearch: true \}\)/,
  'Lite setup wizard should use platform-aware Rscript detection.'
)

assert.match(
  electronMainSource,
  /R-Portable\.zip[\s\S]*R-macos\.tar\.gz[\s\S]*R-linux\.tar\.gz/,
  'Bundle runtime extraction should keep future Linux runtime support while the current build rollout remains Windows/macOS only.'
)

assert.match(
  electronMainSource,
  /async function extractZipArchive[\s\S]*Blocked unsafe archive path/,
  'Windows bundle runtime extraction should keep zip-slip protection.'
)

assert.match(
  electronMainSource,
  /async function extractTarGzArchive[\s\S]*await runProcess\('tar', \['-xzf', archivePath, '-C', destinationDir\]\)/,
  'macOS and Linux bundle runtime extraction should use system tar for conda-pack symlink compatibility.'
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
  electronMainSource,
  /function isBundledPortableRuntimeReady\(\): boolean \{[\s\S]*if \(fs\.existsSync\(archivePath\)\) return false[\s\S]*return isLiteBuild\(\)/,
  'A packaged Bundle with no runtime archive should stay in setup instead of being treated as runtime-ready.'
)

assert.match(
  electronMainSource,
  /function getBundledPortableRuntimeStatus\(\)[\s\S]*appEdition: getConfiguredAppEdition\(\)[\s\S]*archiveExists[\s\S]*archiveSize[\s\S]*runtimeDirExists[\s\S]*extractedRscriptExists[\s\S]*relocationMarkerExists[\s\S]*condaUnpackExists/,
  'Bundle runtime diagnostics should report edition, archive, extraction, Rscript, and Unix relocation status.'
)

assert.match(
  electronMainSource,
  /Bundled Rscript missing at \$\{runtimeStatus\.extractedRscriptPath\}; archive exists=\$\{runtimeStatus\.archiveExists\}/,
  'Plumber startup should log missing bundled Rscript status before returning not-ready.'
)

assert.match(
  electronMainSource,
  /await prepareBundledUnixRuntime\(runtimeStatus\.runtimeDir, runtimeStatus\.extractedRscriptPath\)/,
  'Plumber startup should repair missing Unix relocation markers before launching bundled R.'
)

assert.match(
  electronMainSource,
  /ipcMain\.handle\('plumber:health'[\s\S]*const ready = await ensurePlumberReady\(\)[\s\S]*runtimeStatus: getBundledPortableRuntimeStatus\(\)[\s\S]*recentPlumberLogs: getRecentPlumberLogs\(\)/,
  'Plumber health checks should expose runtime status and recent backend logs when startup fails.'
)

assert.match(
  electronMainSource,
  /PLS backend is not ready[\s\S]*runtimeStatus: getBundledPortableRuntimeStatus\(\)[\s\S]*recentPlumberLogs: getRecentPlumberLogs\(\)/,
  'Analysis calls should include bundled runtime diagnostics when the R backend is not ready.'
)

assert.match(
  electronMainSource,
  /Lite build has no bundled R archive[\s\S]*skipping extraction[\s\S]*Bundled R archive was not found at \$\{archivePath\}/,
  'Lite setup should skip missing archives, while Bundle installer extraction should fail clearly when the platform R archive is missing.'
)

assert.match(
  electronMainSource,
  /Failed to start \$\{executablePath\}: \$\{err\.message\}/,
  'Archive and relocation process failures should include the executable that failed to start.'
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
  /await run\('tar', \['-xzf', archivePath, '-C', tempRoot\]\)/,
  'Unix runtime smoke test should use system tar for conda-pack symlink compatibility.'
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

assert.doesNotMatch(
  packageSource,
  /"build:bundle:linux"|"build:lite:linux"/,
  'Active package scripts should exclude Linux until Linux packaging is ready.'
)

console.log('PASS cross-platform runtime guards')
