import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const read = (relativePath) => fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')

const [modelCanvas, resultsView] = await Promise.all([
  read('src/pages/ModelCanvas.tsx'),
  read('src/pages/ResultsView.tsx'),
])

for (const [label, source] of [['ModelCanvas', modelCanvas], ['ResultsView', resultsView]]) {
  assert.match(source, /MICOM_HOC_UNAVAILABLE_MESSAGE/, `${label} should import the shared MICOM HOC message.`)
  assert.match(
    source,
    /run-permutation-analysis[\s\S]*showMicomHocUnavailable\(\)[\s\S]*(?:setShowPermutationAnalysisModal|setPermutationOpen)/,
    `${label} should guard the MICOM menu action before opening its modal.`,
  )
}

assert.match(
  modelCanvas,
  /handlePermutationConfiguralPrecheck[\s\S]*hasHigherOrderConstructs[\s\S]*showMicomHocUnavailable\(\)[\s\S]*MICOM_HOC_UNAVAILABLE_MESSAGE[\s\S]*buildAnalysisPayload/,
  'ModelCanvas should guard a stale configural-precheck callback before payload work.',
)
assert.match(
  modelCanvas,
  /handleRunPermutationAnalysis[\s\S]*hasHigherOrderConstructs[\s\S]*showMicomHocUnavailable\(\)[\s\S]*setCalculatingType\('permutation'\)/,
  'ModelCanvas should guard a stale MICOM run callback before calculation starts.',
)
assert.match(
  resultsView,
  /handlePermutationConfiguralPrecheckFromResults[\s\S]*hasHigherOrderConstructs[\s\S]*showMicomHocUnavailable\(\)[\s\S]*MICOM_HOC_UNAVAILABLE_MESSAGE[\s\S]*resolveRunPayload/,
  'ResultsView should guard a stale configural-precheck callback before resolving a run payload.',
)
assert.match(
  resultsView,
  /handleRunPermutationFromResults[\s\S]*hasHigherOrderConstructs[\s\S]*showMicomHocUnavailable\(\)[\s\S]*resolveRunPayload/,
  'ResultsView should guard a stale MICOM run callback before calculation starts.',
)

console.log('PASS MICOM HOC frontend guard contract')
