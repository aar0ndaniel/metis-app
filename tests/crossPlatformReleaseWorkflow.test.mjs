import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const workflow = await fs.readFile(path.join(workspaceRoot, '.github/workflows/cross-platform-release.yml'), 'utf8')

assert.match(workflow, /workflow_dispatch:/, 'Cross-platform release workflow should be manually runnable.')
assert.match(workflow, /runner: macos-latest[\s\S]*artifact: metis-macos-arm64-release[\s\S]*runner: macos-15-intel[\s\S]*artifact: metis-macos-x64-release[\s\S]*runs-on: ubuntu-latest/, 'Workflow should build macOS arm64, macOS Intel, and Linux on native runners.')
assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY:\s*"false"/, 'Initial macOS release should be unsigned.')
assert.match(workflow, /conda-incubator\/setup-miniconda@v3/, 'Workflow should install Miniforge for conda-packed R runtimes.')
assert.match(workflow, /Run release guard tests[\s\S]*npm run typecheck[\s\S]*crossPlatformRuntimeStatic\.test\.mjs[\s\S]*productionReleaseStatic\.test\.mjs[\s\S]*crossPlatformReleaseWorkflow\.test\.mjs[\s\S]*installerSetupTheme\.test\.mjs/, 'Workflow should run release guard tests before building artifacts.')
assert.match(workflow, /conda create[\s\S]*r-base[\s\S]*r-jsonlite[\s\S]*r-matrix[\s\S]*r-plumber[\s\S]*r-readxl[\s\S]*r-remotes[\s\S]*conda-pack/, 'Workflow should create an R runtime with required package tooling.')
assert.match(workflow, /install\.packages\(c\("seminr", "semPower"\)/, 'Workflow should install CRAN packages missing from the base conda environment.')
assert.match(workflow, /remotes::install_github\("sem-in-r\/seminrExtras"\)/, 'Workflow should install seminrExtras from GitHub.')
assert.match(workflow, /conda-pack[\s\S]*--arcroot R-Bundled/, 'Workflow should create tarballs with the R-Bundled top-level directory.')
assert.match(workflow, /R-macos\.tar\.gz[\s\S]*verify-r-bundle-archive\.mjs darwin[\s\S]*smoke-r-bundle-runtime\.mjs darwin[\s\S]*build:lite:mac[\s\S]*build:bundle:mac/, 'macOS job should create, verify, smoke-test, and build Lite and Bundle artifacts.')
assert.match(workflow, /R-linux\.tar\.gz[\s\S]*verify-r-bundle-archive\.mjs linux[\s\S]*smoke-r-bundle-runtime\.mjs linux[\s\S]*build:lite:linux[\s\S]*build:bundle:linux/, 'Linux job should create, verify, smoke-test, and build Lite and Bundle artifacts.')
assert.match(workflow, /actions\/upload-artifact@v4[\s\S]*r-api\/R-macos\.tar\.gz[\s\S]*actions\/upload-artifact@v4[\s\S]*r-api\/R-linux\.tar\.gz/, 'Workflow should upload installers and runtime archives as artifacts.')

console.log('PASS cross-platform release workflow guards')
