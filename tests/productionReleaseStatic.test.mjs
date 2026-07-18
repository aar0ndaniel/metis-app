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
assert.match(appSource, /action === 'open-workspace'[\s\S]*openFile\?\.\([\s\S]*extensions:\s*\['metisws', 'ada'\][\s\S]*openWorkspaceFromFilePath/, 'Open Workspace should select a .metisws or legacy .ada file, not a folder.')
assert.doesNotMatch(appSource.match(/action === 'open-workspace'[\s\S]*?return\s*\n\s*\}/)?.[0] ?? '', /openDirectory/, 'Open Workspace should not use the folder picker.')
assert.match(appSource, /name:\s*`\$\{name\}\.metisws`/, 'New workspaces from the workspace home should use the .metisws extension.')
assert.match(appSource, /name:\s*`\$\{newWsData\.name\}\.metisws`/, 'New workspaces from the dialog flow should use the .metisws extension.')
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
assert.doesNotMatch(preferencesSource, /Analysis Engine|R \(Plumber \+ seminr\)|SEMPower|\['Engine'/, 'Preferences should not expose an analysis-engine selector or About engine row.')

const viteSource = await read('vite.config.ts')
assert.match(viteSource, /__METIS_APP_EDITION__/, 'Vite should define the build edition for the renderer.')
assert.doesNotMatch(viteSource, /__METIS_RELEASE_CHANNEL__|JSON\.stringify\('Beta'\)/, 'Vite should not define an unused beta release channel.')
assert.match(viteSource, /lifecycleEvent\.startsWith\('build:lite'\)[\s\S]*Lite[\s\S]*Bundle/, 'Vite should distinguish all Lite platform builds from Bundle builds.')
assert.match(viteSource, /const appDefines = \{[\s\S]*__METIS_APP_EDITION__[\s\S]*\}/, 'Vite should keep Lite/Bundle edition defines in one shared object.')
assert.match(viteSource, /define:\s*appDefines[\s\S]*main:\s*\{[\s\S]*vite:\s*\{[\s\S]*define:\s*appDefines/, 'Electron main builds should receive the same Lite/Bundle edition define as the renderer.')

const modelCanvasSource = await read('src/pages/ModelCanvas.tsx')
assert.match(modelCanvasSource, /USE SAMPLE DATASET/, 'Model canvas should keep the packaged sample dataset shortcut for first-run review.')

const importStepSource = await read('src/pages/ImportStep1.tsx')
assert.match(importStepSource, /const isCSV = ext === 'csv'/, 'Import parser should treat only .csv as CSV input.')
assert.doesNotMatch(importStepSource, /SPSS File|Jamovi File|Text File|ext === 'txt'|case 'sav'|case 'omv'|case 'jmo'/, 'Import preview should not advertise unsupported data formats.')

const electronMainSource = await read('electron/main.ts')
assert.match(electronMainSource, /allowedDatasetReadExtensions\s*=\s*new Set\(\['\.csv', '\.xlsx', '\.xls'\]\)/, 'Electron dataset reads should be limited to CSV and Excel.')
assert.doesNotMatch(electronMainSource, /allowedDatasetReadExtensions[\s\S]{0,120}(?:'\.txt'|'\.sav'|'\.omv'|'\.jmo')/, 'Electron dataset reads should not include text, SPSS, Jamovi, or JMO extensions.')
assert.match(electronMainSource, /sampleDatasetFileName\s*=\s*'sample dataset\.csv'[\s\S]*dataset:useSample/, 'Electron should package and serve the first-run sample dataset.')
assert.match(electronMainSource, /WORKSPACE_FILE_EXTENSION\s*=\s*'\.metisws'/, 'Electron should create new workspace files with the .metisws extension.')
assert.match(electronMainSource, /LEGACY_WORKSPACE_FILE_EXTENSION\s*=\s*'\.ada'/, 'Electron should keep legacy .ada workspace files readable.')
assert.match(electronMainSource, /isWorkspacePathAllowed\(workspacePath\)/, 'Dataset persistence should accept an approved .metisws or legacy .ada workspace file opened by the user.')

const preloadSource = await read('electron/preload.ts')
const viteEnvSource = await read('src/vite-env.d.ts')
assert.match(preloadSource, /useSampleDataset[\s\S]*dataset:useSample/, 'Preload should expose packaged sample dataset loading.')
assert.match(viteEnvSource, /useSampleDataset/, 'Renderer types should include packaged sample dataset loading.')

const packageSource = await read('package.json')
const bundleBuildSource = await read('build/electron-builder.bundle.yml')
const liteBuildSource = await read('build/electron-builder.lite.yml')
const packageJson = JSON.parse(packageSource)
const bundleCommonResourcesSection = bundleBuildSource.slice(
  bundleBuildSource.indexOf('extraResources:'),
  bundleBuildSource.indexOf('\nwin:')
)
const bundleWinSection = bundleBuildSource.slice(
  bundleBuildSource.indexOf('\nwin:'),
  bundleBuildSource.indexOf('\nmac:')
)
const bundleMacSection = bundleBuildSource.slice(
  bundleBuildSource.indexOf('\nmac:'),
  bundleBuildSource.indexOf('\nnsis:')
)
assert.match(packageSource, /"from": "sample dataset\.csv"[\s\S]*"to": "sample-data\/sample dataset\.csv"/, 'Package build resources should include the sample dataset.')
assert.deepEqual(
  packageJson.build.extraResources.find((resource) => resource.from === 'r-api')?.filter,
  ['.Rprofile', 'micom.R', 'plumber.R', 'renv-bootstrap.R', 'renv.lock', 'renv/**'],
  'Common package build resources should exclude platform runtime archives.'
)
assert.deepEqual(
  packageJson.build.win.extraResources.find((resource) => resource.from === 'r-api')?.filter,
  ['R-Portable.zip'],
  'Windows package build resources should include only the Windows R runtime archive.'
)
assert.deepEqual(
  packageJson.build.mac.extraResources.find((resource) => resource.from === 'r-api')?.filter,
  ['R-macos-${arch}.tar.gz'],
  'macOS package build resources should include only the matching architecture macOS R runtime archive.'
)
assert.doesNotMatch(packageSource, /"R-linux\.tar\.gz"|"build:lite:linux"|"build:bundle:linux"/, 'Package scripts and resources should exclude Linux until Linux packaging is ready.')
assert.equal(packageJson.build.fileAssociations[0].ext, 'metisws', 'Packaged app should register .metisws, not the Ada source-code extension.')
assert.match(packageSource, /"build:lite:mac"/, 'Package scripts should expose a macOS Lite build.')
assert.match(packageSource, /"build:bundle:mac": "npm run build:bundle:mac:arm64 && npm run build:bundle:mac:x64"/, 'Package scripts should expose a combined macOS Bundle build for ARM and Intel.')
assert.match(packageSource, /"build:bundle:mac:arm64"[\s\S]*verify-r-bundle-archive\.mjs darwin arm64[\s\S]*smoke-r-bundle-runtime\.mjs darwin arm64[\s\S]*--mac --arm64/, 'Package scripts should guard macOS ARM Bundle builds with the ARM R archive check and ARM builder target.')
assert.match(packageSource, /"build:bundle:mac:x64"[\s\S]*verify-r-bundle-archive\.mjs darwin x64[\s\S]*smoke-r-bundle-runtime\.mjs darwin x64[\s\S]*--mac --x64/, 'Package scripts should guard macOS Intel Bundle builds with the Intel R archive check and Intel builder target.')
assert.match(packageSource, /"build:lite:mac": "npm run build:lite:mac:arm64 && npm run build:lite:mac:x64"/, 'Package scripts should expose a combined macOS Lite build for ARM and Intel.')
assert.match(packageSource, /"build:lite:mac:arm64"[\s\S]*--mac --arm64/, 'Package scripts should expose a macOS ARM Lite builder target.')
assert.match(packageSource, /"build:lite:mac:x64"[\s\S]*--mac --x64/, 'Package scripts should expose a macOS Intel Lite builder target.')
assert.match(bundleBuildSource, /from: sample dataset\.csv[\s\S]*to: sample-data\/sample dataset\.csv/, 'Bundle build should pack the sample dataset.')
assert.doesNotMatch(bundleCommonResourcesSection, /R-Portable\.zip|R-macos(?:-\$\{arch\})?\.tar\.gz/, 'Common Bundle resources should not copy platform runtime archives.')
assert.match(bundleWinSection, /extraResources:[\s\S]*R-Portable\.zip/, 'Windows Bundle resources should copy the Windows R runtime archive.')
assert.doesNotMatch(bundleWinSection, /R-macos(?:-\$\{arch\})?\.tar\.gz/, 'Windows Bundle resources should not copy the macOS R runtime archive.')
assert.match(bundleMacSection, /extraResources:[\s\S]*R-macos-\$\{arch\}\.tar\.gz/, 'macOS Bundle resources should copy the matching architecture macOS R runtime archive.')
assert.doesNotMatch(bundleMacSection, /R-Portable\.zip/, 'macOS Bundle resources should not copy the Windows R runtime archive.')
assert.doesNotMatch(bundleBuildSource, /R-linux\.tar\.gz|\nlinux:\r?\n/, 'Bundle build should exclude Linux targets and archives for now.')
assert.doesNotMatch(bundleBuildSource, /\bBeta\b/, 'Bundle build artifact names should not include beta labeling.')
assert.match(bundleBuildSource, /artifactName: metis \$\{version\} Bundle macOS \$\{arch\}\.\$\{ext\}/, 'Bundle macOS artifact names should include the architecture to avoid ARM and Intel output collisions.')
assert.match(bundleBuildSource, /mac:[\s\S]*minimumSystemVersion:\s*'13\.3\.0'/, 'Bundle macOS builds should require macOS 13.3+ for the bundled newaccelerate R runtime.')
assert.match(bundleBuildSource, /fileAssociations:\s*\r?\n\s*-\s*ext:\s*metisws/, 'Bundle build should register .metisws files.')
assert.match(bundleBuildSource, /mac:[\s\S]*target:[\s\S]*dmg[\s\S]*zip/, 'Bundle build should define macOS DMG and zip targets.')
assert.match(bundleBuildSource, /mac:[\s\S]*icon: build\/icon\.icns/, 'Bundle macOS builds should use an ICNS icon.')
assert.doesNotMatch(bundleBuildSource, /fileAssociations:[\s\S]*icon:\s*build\/icon\.ico/, 'Cross-platform file associations should not force a Windows ICO icon.')
assert.match(liteBuildSource, /from: sample dataset\.csv[\s\S]*to: sample-data\/sample dataset\.csv/, 'Lite build should pack the sample dataset.')
assert.doesNotMatch(liteBuildSource, /\bBeta\b/, 'Lite build artifact names should not include beta labeling.')
assert.match(liteBuildSource, /artifactName: metis \$\{version\} Lite macOS \$\{arch\}\.\$\{ext\}/, 'Lite macOS artifact names should include the architecture to avoid ARM and Intel output collisions.')
assert.match(liteBuildSource, /fileAssociations:\s*\r?\n\s*-\s*ext:\s*metisws/, 'Lite build should register .metisws files.')
assert.match(liteBuildSource, /mac:[\s\S]*target:[\s\S]*dmg[\s\S]*zip/, 'Lite build should define macOS DMG and zip targets.')
assert.match(liteBuildSource, /mac:[\s\S]*icon: build\/icon\.icns/, 'Lite macOS builds should use an ICNS icon.')
assert.doesNotMatch(liteBuildSource, /\nlinux:\r?\n/, 'Lite build should exclude Linux targets for now.')
assert.doesNotMatch(liteBuildSource, /fileAssociations:[\s\S]*icon:\s*build\/icon\.ico/, 'Cross-platform file associations should not force a Windows ICO icon.')
await fs.access(path.join(workspaceRoot, 'sample dataset.csv'))

console.log('PASS production release static guards')
