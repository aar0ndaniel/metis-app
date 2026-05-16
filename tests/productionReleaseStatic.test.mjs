import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function read(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

async function collectFiles(dir, predicate) {
  try {
    await fs.access(dir)
  } catch {
    return []
  }

  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolute, predicate))
    } else if (predicate(absolute)) {
      files.push(absolute)
    }
  }
  return files
}

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.html', '.yml', '.yaml', '.R'])
const productionScanRoots = [
  'src',
  'electron',
  'build',
  'scripts',
  'public',
].map((relativePath) => path.join(workspaceRoot, relativePath))

const productionFiles = [
  path.join(workspaceRoot, 'package.json'),
  path.join(workspaceRoot, 'vite.config.ts'),
  path.join(workspaceRoot, 'index.html'),
  path.join(workspaceRoot, 'r-api', 'plumber.R'),
  ...(await Promise.all(productionScanRoots.map((root) =>
    collectFiles(root, (filePath) => sourceExtensions.has(path.extname(filePath)))
  ))).flat(),
]

for (const filePath of productionFiles) {
  const source = await fs.readFile(filePath, 'utf8')
  const displayPath = path.relative(workspaceRoot, filePath)

  assert.doesNotMatch(
    source,
    /\b(Codex|OpenAI|Claude|Anthropic)\b/i,
    `${displayPath} should not contain Codex/OpenAI/Claude/Anthropic references.`
  )

  assert.doesNotMatch(
    source,
    /Generate AI Report|done testing|MOCK_WORKSPACES|Data analysis_UPDATED_new\.csv|PLSpredict-diag/,
    `${displayPath} should not contain prototype, demo, or testing-facing app surfaces.`
  )
}

const sourceFiles = await collectFiles(path.join(workspaceRoot, 'src'), () => true)
assert.deepEqual(
  sourceFiles
    .map((filePath) => path.relative(workspaceRoot, filePath))
    .filter((relativePath) => /\.(bak|bak2|old|tmp)$/i.test(relativePath)),
  [],
  'Source tree should not contain backup/prototype files.'
)

const appSource = await read('src/App.tsx')
assert.doesNotMatch(appSource, /<Route path="\/import" element=\{<DataImport \/>/, 'Prototype import route should not ship.')
assert.doesNotMatch(appSource, /import DataImport from/, 'Prototype import screen should not be imported.')
assert.match(appSource, /action === 'open-workspace'[\s\S]*openFile\?\.\([\s\S]*extensions:\s*\['ada'\][\s\S]*openWorkspaceFromFilePath/, 'Open Workspace should select a .ada file, not a folder.')
assert.doesNotMatch(appSource.match(/action === 'open-workspace'[\s\S]*?return\s*\n\s*\}/)?.[0] ?? '', /openDirectory/, 'Open Workspace should not use the folder picker.')
assert.match(appSource, /CSV and Excel Files[\s\S]*extensions:\s*\['csv', 'xlsx', 'xls'\]/, 'Dataset import dialog should be limited to CSV and Excel.')
assert.match(appSource, /accept="\.csv,\.xlsx,\.xls"/, 'Fallback dataset picker should be limited to CSV and Excel.')
assert.doesNotMatch(appSource, /extensions:\s*\[[^\]]*(?:'txt'|'sav'|'omv'|'jmo')|accept="[^"]*(?:\.txt|\.sav|\.omv|\.jmo)/i, 'Dataset file pickers should not expose text, SPSS, Jamovi, or JMO imports.')
assert.match(appSource, /pls:use-sample-dataset/, 'Sample dataset onboarding action should remain available.')

const titleBarSource = await read('src/components/TitleBar.tsx')
assert.match(titleBarSource, /APP_BRAND_NAME/, 'Title bar should render the metis brand name.')
assert.doesNotMatch(titleBarSource, /APP_TITLE_RELEASE_LABEL|APP_EDITION|APP_BASE_RELEASE_LABEL|APP_VERSION_LABEL/, 'Title bar should not render build, edition, or version labels next to metis.')

const brandingSource = await read('src/config/appBranding.ts')
assert.match(brandingSource, /APP_EDITION/, 'Branding config should expose the current build edition.')
assert.match(brandingSource, /return `\$\{edition\} \$\{APP_VERSION\}`/, 'Edition release labels should combine Lite/Bundle with the app version, not a beta channel.')
assert.doesNotMatch(brandingSource, /APP_RELEASE_CHANNEL/, 'Branding config should not keep an unused beta release channel.')
assert.doesNotMatch(brandingSource, /APP_TITLE_RELEASE_LABEL/, 'Branding config should not expose a title-bar release label.')

const preferencesSource = await read('src/components/PreferencesModal.tsx')
assert.match(preferencesSource, /APP_EDITION/, 'Preferences should receive the current Lite/Bundle edition.')
assert.match(preferencesSource, /\['Edition',\s*APP_EDITION/, 'Preferences About should show whether the build is Lite or Bundle.')
assert.match(preferencesSource, /\['Version',\s*APP_BASE_RELEASE_LABEL/, 'Preferences About should show the app version.')

const viteSource = await read('vite.config.ts')
assert.match(viteSource, /__METIS_APP_EDITION__/, 'Vite should define the build edition for the renderer.')
assert.doesNotMatch(viteSource, /__METIS_RELEASE_CHANNEL__|JSON\.stringify\('Beta'\)/, 'Vite should not define an unused beta release channel.')
assert.match(viteSource, /lifecycleEvent\.startsWith\('build:lite'\)[\s\S]*Lite[\s\S]*Bundle/, 'Vite should distinguish all Lite platform builds from Bundle builds.')

const modelCanvasSource = await read('src/pages/ModelCanvas.tsx')
assert.match(modelCanvasSource, /USE SAMPLE DATASET/, 'Model canvas should keep the packaged sample dataset shortcut for first-run review.')

const importStepSource = await read('src/pages/ImportStep1.tsx')
assert.match(importStepSource, /const isCSV = ext === 'csv'/, 'Import parser should treat only .csv as CSV input.')
assert.doesNotMatch(importStepSource, /SPSS File|Jamovi File|Text File|ext === 'txt'|case 'sav'|case 'omv'|case 'jmo'/, 'Import preview should not advertise unsupported data formats.')

const electronMainSource = await read('electron/main.ts')
assert.match(electronMainSource, /allowedDatasetReadExtensions\s*=\s*new Set\(\['\.csv', '\.xlsx', '\.xls'\]\)/, 'Electron dataset reads should be limited to CSV and Excel.')
assert.doesNotMatch(electronMainSource, /allowedDatasetReadExtensions[\s\S]{0,120}(?:'\.txt'|'\.sav'|'\.omv'|'\.jmo')/, 'Electron dataset reads should not include text, SPSS, Jamovi, or JMO extensions.')
assert.match(electronMainSource, /sampleDatasetFileName\s*=\s*'sample dataset\.csv'[\s\S]*dataset:useSample/, 'Electron should package and serve the first-run sample dataset.')
assert.match(electronMainSource, /isWorkspacePathAllowed\(workspacePath\)/, 'Dataset persistence should accept an approved .ada workspace file opened by the user.')

const preloadSource = await read('electron/preload.ts')
const viteEnvSource = await read('src/vite-env.d.ts')
assert.match(preloadSource, /useSampleDataset[\s\S]*dataset:useSample/, 'Preload should expose packaged sample dataset loading.')
assert.match(viteEnvSource, /useSampleDataset/, 'Renderer types should include packaged sample dataset loading.')

const packageSource = await read('package.json')
const bundleBuildSource = await read('build/electron-builder.bundle.yml')
const liteBuildSource = await read('build/electron-builder.lite.yml')
assert.match(packageSource, /"from": "sample dataset\.csv"[\s\S]*"to": "sample-data\/sample dataset\.csv"/, 'Package build resources should include the sample dataset.')
assert.match(packageSource, /"R-Portable\.zip"[\s\S]*"R-macos\.tar\.gz"[\s\S]*"R-linux\.tar\.gz"/, 'Package build resources should list all platform R runtime archives.')
assert.match(packageSource, /"build:lite:mac"/, 'Package scripts should expose a macOS Lite build.')
assert.match(packageSource, /"build:lite:linux"/, 'Package scripts should expose a Linux Lite build.')
assert.match(packageSource, /"build:bundle:mac"[\s\S]*verify-r-bundle-archive\.mjs darwin/, 'Package scripts should guard macOS Bundle builds with a macOS R archive check.')
assert.match(packageSource, /"build:bundle:linux"[\s\S]*verify-r-bundle-archive\.mjs linux/, 'Package scripts should guard Linux Bundle builds with a Linux R archive check.')
assert.match(bundleBuildSource, /from: sample dataset\.csv[\s\S]*to: sample-data\/sample dataset\.csv/, 'Bundle build should pack the sample dataset.')
assert.match(bundleBuildSource, /R-Portable\.zip[\s\S]*R-macos\.tar\.gz[\s\S]*R-linux\.tar\.gz/, 'Bundle build should allow platform-specific R runtime archives.')
assert.match(bundleBuildSource, /mac:[\s\S]*target:[\s\S]*dmg[\s\S]*zip/, 'Bundle build should define macOS DMG and zip targets.')
assert.match(bundleBuildSource, /mac:[\s\S]*icon: build\/icon\.icns/, 'Bundle macOS builds should use an ICNS icon.')
assert.match(bundleBuildSource, /linux:[\s\S]*target:[\s\S]*AppImage[\s\S]*deb/, 'Bundle build should define Linux AppImage and deb targets.')
assert.match(bundleBuildSource, /linux:[\s\S]*icon: build\/icon\.png/, 'Bundle Linux builds should use a PNG icon.')
assert.doesNotMatch(bundleBuildSource, /fileAssociations:[\s\S]*icon:\s*build\/icon\.ico/, 'Cross-platform file associations should not force a Windows ICO icon.')
assert.match(liteBuildSource, /from: sample dataset\.csv[\s\S]*to: sample-data\/sample dataset\.csv/, 'Lite build should pack the sample dataset.')
assert.match(liteBuildSource, /mac:[\s\S]*target:[\s\S]*dmg[\s\S]*zip/, 'Lite build should define macOS DMG and zip targets.')
assert.match(liteBuildSource, /mac:[\s\S]*icon: build\/icon\.icns/, 'Lite macOS builds should use an ICNS icon.')
assert.match(liteBuildSource, /linux:[\s\S]*target:[\s\S]*AppImage[\s\S]*deb/, 'Lite build should define Linux AppImage and deb targets.')
assert.match(liteBuildSource, /linux:[\s\S]*icon: build\/icon\.png/, 'Lite Linux builds should use a PNG icon.')
assert.doesNotMatch(liteBuildSource, /fileAssociations:[\s\S]*icon:\s*build\/icon\.ico/, 'Cross-platform file associations should not force a Windows ICO icon.')
await fs.access(path.join(workspaceRoot, 'sample dataset.csv'))

console.log('PASS production release static guards')
