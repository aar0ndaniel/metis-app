import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')

const read = (relativePath) => fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')

async function bundleModule(relativeEntry, outfileName) {
  const outfile = path.join(tempDir, outfileName)
  await fs.mkdir(tempDir, { recursive: true })
  await build({
    entryPoints: [path.join(workspaceRoot, relativeEntry)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  })
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
}

const [catalogSource, modelCanvasSource, plumberSource, resultsSource, predictModalSource] = await Promise.all([
  read('src/results/panelCatalog.ts'),
  read('src/pages/ModelCanvas.tsx'),
  read('r-api/plumber.R'),
  read('src/pages/ResultsView.tsx'),
  read('src/components/PlsPredictModal.tsx'),
])

assert.match(catalogSource, /id: 'data-diagnostics'[\s\S]*label: 'Data & diagnostics'/)
assert.match(catalogSource, /id: 'run-diagnostics'[\s\S]*label: 'Run & diagnostics'/)
assert.match(catalogSource, /id: 'run-diagnostics'[\s\S]*algorithm-settings[\s\S]*execution-log/)

assert.match(modelCanvasSource, /hasHigherOrderConstructs[\s\S]*algorithmSettings[\s\S]*hocMethod/)
assert.match(modelCanvasSource, /if \(hasHigherOrderConstructs\)[\s\S]*hocMethod/)

assert.match(plumberSource, /if \(has_hoc_settings\)[\s\S]*hocMethod/)
assert.match(plumberSource, /validate_algorithm_settings_payload\s*<-\s*function[\s\S]*has_hoc_settings/)

assert.doesNotMatch(resultsSource, /settingComments/)
assert.doesNotMatch(resultsSource, /# algorithm_settings\./)
assert.match(resultsSource, /getPanelDataFromResults\(analysisMode, selectedPanel/)

assert.doesNotMatch(predictModalSource, /<select/)
assert.match(predictModalSource, /function ModalSelect/)
assert.match(predictModalSource, /Folds[\s\S]*Repetitions/)
assert.match(predictModalSource, /Prediction seed[\s\S]*Validation plan/)

const panelData = await bundleModule('src/results/panelData.ts', 'analysisSettingsScopePanelData.test.bundle.mjs')
const { getPanelDataFromResults } = panelData
const results = {
  algorithm: {
    settings: {
      method: 'PLSpredict',
      algorithm: 'standard',
      algorithm_settings: {
        innerWeighting: 'Path weighting scheme',
        folds: 9,
        repetitions: 3,
        prediction_technique: 'Direct antecedents (DA)',
        prediction_seed: 42,
      },
    },
  },
}

assert.deepEqual(
  getPanelDataFromResults('plspredict', 'algorithm-settings', results),
  [
    { Setting: 'method', Value: 'PLSpredict' },
    { Setting: 'algorithm', Value: 'standard' },
    { Setting: 'folds', Value: 9 },
    { Setting: 'repetitions', Value: 3 },
    { Setting: 'prediction_technique', Value: 'Direct antecedents (DA)' },
    { Setting: 'prediction_seed', Value: 42 },
  ],
)

assert.deepEqual(
  getPanelDataFromResults('pls-sem', 'algorithm-settings', {
    algorithm: {
      settings: {
        mode: 'PLS-SEM',
        algorithm: 'standard',
        hoc_method: 'Not applicable',
        hoc_method_requested: 'Two-stage',
        hoc_two_stage: 'Disjoint two-stage',
        algorithm_settings: { innerWeighting: 'Path weighting scheme' },
      },
    },
  }).filter((row) => String(row.Setting).toLowerCase().includes('hoc')),
  [],
  'Non-HOC runs should not expose HOC method or stage rows.',
)

assert.deepEqual(
  getPanelDataFromResults('pls-sem', 'algorithm-settings', {
    algorithm: {
      settings: {
        hoc_method: 'Two-stage',
        hoc_two_stage: 'Disjoint two-stage',
        algorithm_settings: { hocMethod: 'Two-stage', hocTwoStage: 'Disjoint two-stage' },
      },
    },
  }, { savedModel: { constructs: [{ name: 'Outcome', isHigherOrder: false }] } })
    .filter((row) => String(row.Setting).toLowerCase().includes('hoc')),
  [],
  'The saved model structure should suppress stale HOC metadata.',
)

assert.deepEqual(
  getPanelDataFromResults('plspredict', 'algorithm-settings', {
    algorithm: {
      settings: {
        method: 'PLSpredict',
        algorithm_settings: { hocMethod: 'Two-stage', hocTwoStage: 'Disjoint two-stage' },
      },
    },
  }, { savedModel: { constructs: [{ name: 'HOC', isHigherOrder: true }] } })
    .filter((row) => String(row.Setting).toLowerCase().includes('hoc')),
  [
    { Setting: 'hocMethod', Value: 'Two-stage' },
    { Setting: 'hocTwoStage', Value: 'Disjoint two-stage' },
  ],
  'PLSpredict HOC runs should retain relevant HOC settings.',
)

console.log('PASS analysis settings scope and PLSpredict layout contract')
