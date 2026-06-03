import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const workflow = await fs.readFile(path.join(workspaceRoot, '.github/workflows/cross-platform-release.yml'), 'utf8')
const installRPackagesScript = await fs.readFile(path.join(workspaceRoot, 'scripts/install-required-r-packages.R'), 'utf8').catch(() => '')
const gitIgnore = await fs.readFile(path.join(workspaceRoot, '.gitignore'), 'utf8').catch(() => '')

assert.match(workflow, /workflow_dispatch:/, 'Cross-platform release workflow should be manually runnable.')
assert.match(workflow, /name: macOS arm64 Bundle test[\s\S]*runs-on: macos-latest/, 'Temporary workflow should build only the macOS arm64 Bundle on the Apple Silicon runner.')
assert.doesNotMatch(workflow, /macos-15-intel|metis-macos-x64-release|\$\{\{\s*matrix\./, 'Temporary workflow should skip Intel matrix builds until macOS Bundle debugging is complete.')
assert.doesNotMatch(workflow, /\n  linux-release:|build:lite:linux|build:bundle:linux|R-linux\.tar\.gz|metis-linux-release|release\/lite\/\*\.AppImage|release\/bundle\/\*\.deb/, 'Workflow should exclude Linux release builds until Linux packaging is ready.')
assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY:\s*"false"/, 'Initial macOS release should be unsigned.')
assert.match(workflow, /Run release guard tests[\s\S]*npm run typecheck[\s\S]*crossPlatformRuntimeStatic\.test\.mjs[\s\S]*productionReleaseStatic\.test\.mjs[\s\S]*crossPlatformReleaseWorkflow\.test\.mjs[\s\S]*installerSetupTheme\.test\.mjs/, 'Workflow should run release guard tests before building artifacts.')
assert.match(workflow, /conda-incubator\/setup-miniconda@v3/, 'Workflow should set up Miniforge to build the macOS R runtime in Actions.')
assert.match(workflow, /conda create[\s\S]*r-base[\s\S]*r-jsonlite[\s\S]*r-matrix[\s\S]*r-readxl[\s\S]*r-remotes[\s\S]*conda-pack/, 'Workflow should create the bundled R environment with required package tooling.')
assert.match(workflow, /conda activate "\$PWD\/R-Bundled"/, 'Workflow should activate the bundled R environment before compiling CRAN packages.')
assert.match(workflow, /conda create[\s\S]*c-compiler[\s\S]*cxx-compiler[\s\S]*fortran-compiler[\s\S]*make[\s\S]*pkg-config/, 'Workflow should include compilers and build tools for CRAN source packages.')
assert.match(workflow, /conda create[\s\S]*abseil-cpp[\s\S]*udunits2[\s\S]*libuv[\s\S]*libsodium[\s\S]*zlib[\s\S]*libxml2/, 'Workflow should include native libraries needed by CRAN packages that compile against Abseil, UDUNITS, libuv, libsodium, zlib, and libxml2.')
assert.match(workflow, /DOWNLOAD_STATIC_LIBV8:\s*"1"/, 'Workflow should allow the R V8 package to fetch a portable static libv8 build.')
assert.match(workflow, /GITHUB_PAT:\s*\$\{\{\s*github\.token\s*\}\}/, 'Workflow should pass the Actions token to remotes for GitHub package installs.')
assert.match(workflow, /\$PWD\/R-Bundled\/bin\/Rscript" scripts\/install-required-r-packages\.R/, 'Workflow should use the bounded required-package installer instead of inline R install commands.')
assert.doesNotMatch(workflow, /install\.packages\(c\("plumber", "seminr", "semPower"\)/, 'Workflow should not keep long inline CRAN package install commands.')
assert.match(workflow, /conda-pack[\s\S]*--arcroot R-Bundled/, 'Workflow should create tarballs with the R-Bundled top-level directory.')
assert.doesNotMatch(workflow, /Build macOS Lite|build:lite:mac|release\/lite\/\*\.dmg|release\/lite\/\*\.zip/, 'Temporary workflow should skip Lite builds and artifacts.')
assert.match(workflow, /Build bundled macOS R runtime[\s\S]*R-macos\.tar\.gz[\s\S]*verify-r-bundle-archive\.mjs darwin[\s\S]*smoke-r-bundle-runtime\.mjs darwin[\s\S]*Build macOS Bundle[\s\S]*build:bundle:mac/, 'Temporary macOS job should create, verify, smoke-test, and package only the Bundle runtime.')
assert.match(workflow, /actions\/upload-artifact@v4[\s\S]*name: metis-macos-arm64-bundle-test[\s\S]*release\/bundle\/\*\.dmg[\s\S]*release\/bundle\/\*\.zip[\s\S]*r-api\/R-macos\.tar\.gz/, 'Temporary workflow should upload only macOS arm64 Bundle artifacts and the runtime archive.')
assert.match(gitIgnore, /^r-api\/R-macos\.tar\.gz$/m, 'Generated macOS R runtime archive should stay ignored because Actions builds it.')

assert.match(installRPackagesScript, /required_packages <- c\("jsonlite", "Matrix", "plumber", "readxl", "seminr", "seminrExtras", "semPower"\)/, 'R package installer should only target the app-required package set.')
assert.match(installRPackagesScript, /max_attempts <- 3/, 'R package installer should retry missing required packages a bounded number of times.')
assert.match(installRPackagesScript, /dependencies = c\("Depends", "Imports", "LinkingTo"\)/, 'R package installer should avoid optional suggested packages.')
assert.match(installRPackagesScript, /try\(remotes::install_github\([\s\S]*"sem-in-r\/seminrExtras"[\s\S]*silent = TRUE\)[\s\S]*remotes::install_github\([\s\S]*"sem-in-r\/seminr"[\s\S]*subdir = "seminrExtras"/, 'R package installer should install seminrExtras from GitHub with the existing repository-subdir fallback.')

console.log('PASS cross-platform release workflow guards')
