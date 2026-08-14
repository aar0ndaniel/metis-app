import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')
const bundlePath = path.join(tempDir, 'hocSettings.bundle.mjs')

await fs.mkdir(tempDir, { recursive: true })
await build({
  entryPoints: [path.join(workspaceRoot, 'src/utils/hocSettings.ts')],
  outfile: bundlePath,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'silent',
})

const hocSettings = await import(`${pathToFileURL(bundlePath).href}?t=${Date.now()}`)

assert.deepEqual(
  hocSettings.DEFAULT_HOC_SETTINGS,
  { method: 'Two-stage', twoStage: 'Disjoint two-stage' },
  'Unconfigured HOC preferences must preserve the current SEMinR-compatible two-stage behavior.'
)

assert.deepEqual(
  hocSettings.normalizeHocSettings(undefined, undefined),
  { method: 'Two-stage', twoStage: 'Disjoint two-stage' },
  'Missing HOC settings must resolve to the compatibility default.'
)

assert.deepEqual(
  hocSettings.normalizeHocSettings('Repeated indicators', 'Embedded'),
  { method: 'Repeated indicators', twoStage: 'Embedded' },
  'Explicit repeated-indicator and embedded values must be preserved for per-run configuration.'
)

assert.deepEqual(
  hocSettings.normalizeHocSettings('invalid', 'invalid'),
  { method: 'Two-stage', twoStage: 'Disjoint two-stage' },
  'Invalid HOC values must fail closed to the compatibility default.'
)

assert.deepEqual(hocSettings.HOC_ESTIMATION_METHODS, [
  'Repeated Indicators',
  'Embedded Two-stage',
  'Disjoint Two-stage',
])

assert.equal(
  hocSettings.hocEstimationMethodLabel({ method: 'Repeated indicators', twoStage: 'Embedded' }),
  'Repeated Indicators',
)
assert.equal(
  hocSettings.hocEstimationMethodLabel({ method: 'Two-stage', twoStage: 'Embedded' }),
  'Embedded Two-stage',
)
assert.equal(
  hocSettings.hocEstimationMethodLabel({ method: 'Two-stage', twoStage: 'Disjoint two-stage' }),
  'Disjoint Two-stage',
)

assert.deepEqual(
  hocSettings.hocSettingsFromEstimationMethod('Repeated Indicators'),
  { method: 'Repeated indicators', twoStage: 'Disjoint two-stage' },
)
assert.deepEqual(
  hocSettings.hocSettingsFromEstimationMethod('Embedded Two-stage'),
  { method: 'Two-stage', twoStage: 'Embedded' },
)
assert.deepEqual(
  hocSettings.hocSettingsFromEstimationMethod('Disjoint Two-stage'),
  { method: 'Two-stage', twoStage: 'Disjoint two-stage' },
)
assert.deepEqual(
  hocSettings.readBaseHocSettingsFromAnalysisResults({
    method: 'MGA',
    settings: {
      base_hoc_method: 'Embedded Two-stage',
      mga_hoc_method: 'Repeated Indicators',
      hoc_method_changed: true,
    },
    algorithm: {
      settings: {
        algorithm_settings: { hocMethod: 'Repeated indicators', hocTwoStage: 'Disjoint two-stage' },
      },
    },
  }),
  { method: 'Two-stage', twoStage: 'Embedded' },
  'Reopening MGA must default from the fitted/base HOC method, not the prior MGA selection.',
)
assert.deepEqual(
  hocSettings.readBaseHocSettingsFromAnalysisResults({
    method: 'PLS-SEM',
    algorithm: {
      settings: {
        algorithm_settings: { hocMethod: 'Repeated indicators', hocTwoStage: 'Disjoint two-stage' },
      },
    },
  }),
  { method: 'Repeated indicators', twoStage: 'Disjoint two-stage' },
  'Fitted PLS results without MGA provenance should continue using their recorded algorithm settings.',
)

const preferencesSource = await fs.readFile(path.join(workspaceRoot, 'src/components/PreferencesModal.tsx'), 'utf8')
const modelCanvasSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const resultsViewSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')
const apiSource = await fs.readFile(path.join(workspaceRoot, 'src/services/plsApi.ts'), 'utf8')

assert.match(preferencesSource, /getSavedSetting\('hocMethod',\s*'Two-stage'\)/, 'Preferences should default HOC method to Two-stage.')
assert.match(preferencesSource, /getSavedSetting\('hocTwoStage',\s*'Disjoint two-stage'\)/, 'Preferences should default HOC approach to Disjoint two-stage.')
assert.doesNotMatch(preferencesSource, /hocMethod !== 'Two-stage' && hocTwoStage !== 'Embedded'/, 'Preferences must not silently reset the saved two-stage variant.')
assert.match(modelCanvasSource, /hocMethod/, 'The PLS-SEM modal should own a per-run HOC method state.')
assert.match(modelCanvasSource, /hocTwoStage/, 'The PLS-SEM modal should own a per-run two-stage approach state.')
assert.match(modelCanvasSource, /hasHigherOrder|hasHoc|hocDimensionsById/, 'The PLS-SEM modal should conditionally render HOC controls from model geometry.')
assert.match(modelCanvasSource, /algorithmSettings:\s*\{[\s\S]*hocMethod[\s\S]*hocTwoStage/, 'Analysis payloads must send HOC settings to the backend.')
assert.match(resultsViewSource, /algorithm\.settings\.algorithm_settings/, 'Follow-up analyses should read the fitted result algorithm settings.')
assert.match(apiSource, /hocMethod\?:\s*string/, 'The typed analysis request should expose the HOC method.')
assert.match(apiSource, /hocTwoStage\?:\s*string/, 'The typed analysis request should expose the two-stage approach.')

console.log('PASS HOC analysis contract')
