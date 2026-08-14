import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const read = (relativePath) => fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')

const [plsApiSource, modelCanvasSource, resultsViewSource] = await Promise.all([
  read('src/services/plsApi.ts'),
  read('src/pages/ModelCanvas.tsx'),
  read('src/pages/ResultsView.tsx'),
])

assert.match(
  plsApiSource,
  /RunMultiGroupAnalysisRequest extends RunPlsRequest[\s\S]*baseHocMethod\?:\s*string/,
  'MGA requests should carry the fitted/base HOC method separately.',
)
assert.match(
  modelCanvasSource,
  /const initialMgaHocSettings = useMemo[\s\S]*basePlsAnalysis[\s\S]*currentGraphSignature[\s\S]*normalizeHocSettings/,
  'ModelCanvas should default HOC MGA to the method fitted for the current graph.',
)
assert.match(
  modelCanvasSource,
  /handleRunMultiGroupAnalysis[\s\S]*normalizeHocSettings\(settings\.hocMethod, settings\.hocTwoStage\)[\s\S]*buildAnalysisPayload\('mga', plsAlgorithm, selectedHocSettings\)[\s\S]*baseHocMethod:\s*settings\.baseHocMethod/,
  'ModelCanvas should send the selected HOC estimator plus fitted-method provenance.',
)
assert.match(
  modelCanvasSource,
  /<MultiGroupAnalysisModal[\s\S]*hasHigherOrderConstructs=\{hasHigherOrderConstructs\}[\s\S]*initialHocSettings=\{initialMgaHocSettings\}/,
  'ModelCanvas should expose the HOC selector only when its graph contains an HOC.',
)
assert.match(
  resultsViewSource,
  /const initialMgaHocSettings = useMemo[\s\S]*readBaseHocSettingsFromAnalysisResults\(analysisResults\)/,
  'ResultsView should default HOC MGA from fitted-method provenance even when reopening an MGA result.',
)
assert.match(
  resultsViewSource,
  /handleRunMultiGroupFromResults[\s\S]*normalizeHocSettings\(settings\.hocMethod, settings\.hocTwoStage\)[\s\S]*algorithmSettings:[\s\S]*baseHocMethod:\s*settings\.baseHocMethod/,
  'ResultsView should send the selected HOC estimator plus fitted-method provenance.',
)
assert.match(
  resultsViewSource,
  /<MultiGroupAnalysisModal[\s\S]*hasHigherOrderConstructs=\{hasHigherOrderConstructs\}[\s\S]*initialHocSettings=\{initialMgaHocSettings\}/,
  'ResultsView should expose the HOC selector only for HOC results.',
)

for (const [label, source] of [['ModelCanvas', modelCanvasSource], ['ResultsView', resultsViewSource]]) {
  assert.match(
    source,
    /const payloadHasHoc = containsHigherOrderConstruct\([\s\S]*const micomOverview = payloadHasHoc[\s\S]*MICOM_MGA_HOC_UNAVAILABLE_OVERVIEW[\s\S]*resolveMicomOverviewForMgaCache/,
    `${label} should bypass MICOM validation and attach the explicit unavailable state for HOC MGA.`,
  )
}

console.log('PASS HOC MGA frontend wiring contract')
