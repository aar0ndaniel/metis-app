import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function readSource(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

const modalSource = await readSource('src/components/MultiGroupAnalysisModal.tsx')
const modelCanvasSource = await readSource('src/pages/ModelCanvas.tsx')
const resultsViewSource = await readSource('src/pages/ResultsView.tsx')

for (const expected of [
  'Multi Group Analysis',
  'Grouping variable',
  'Bootstrap subsamples',
  'Alpha',
  'Seed',
  'Calculate',
]) {
  assert.match(
    modalSource,
    new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `MultiGroupAnalysisModal should render "${expected}".`,
  )
}

assert.match(
  modalSource,
  /export interface MultiGroupAnalysisSettings[\s\S]*groupingVariable[\s\S]*groupA[\s\S]*groupB[\s\S]*nboot[\s\S]*alpha[\s\S]*seed/,
  'MGA settings should carry explicit groupA/groupB values plus bootstrap subsamples, alpha, and seed.',
)

assert.match(
  modalSource,
  /groupingOptions:\s*string\[\][\s\S]*datasetRows\?:\s*string\[\]\[\]/,
  'MGA modal should accept dataset headers and cached rows for grouping-variable counts.',
)

assert.match(
  modalSource,
  /DEFAULT_NBOOT = 500[\s\S]*DEFAULT_ALPHA = 0\.05[\s\S]*DEFAULT_SEED = 123[\s\S]*useState\('500'\)[\s\S]*useState\(String\(DEFAULT_ALPHA\)\)[\s\S]*useState\(String\(DEFAULT_SEED\)\)/,
  'MGA modal should default to 500 bootstrap subsamples, alpha 0.05, and seed 123.',
)

assert.match(
  modalSource,
  /const calculateDisabled =[\s\S]*!hasExactlyTwoGroups[\s\S]*nbootError[\s\S]*alphaError[\s\S]*seedError/,
  'Calculate should stay disabled until exactly two groups and all visible MGA settings are valid.',
)

assert.match(
  modalSource,
  /groupingDropdownOpen[\s\S]*aria-haspopup="listbox"[\s\S]*role="listbox"[\s\S]*role="option"/,
  'Grouping variable dropdown should use the coded app dropdown pattern, not a native select.',
)

assert.doesNotMatch(
  modalSource,
  /<select[\s>]/,
  'MGA grouping variable should not use a native select.',
)

assert.match(
  modalSource,
  /excludedMissing[\s\S]*const hasExactlyTwoGroups = groupSummary\.groups\.length === 2[\s\S]*!hasExactlyTwoGroups/,
  'MGA grouping summary should account for missing values and keep Calculate disabled unless exactly two usable values exist.',
)

assert.match(
  modalSource,
  /const groupingCountMessage = groupingVariable[\s\S]*more than two unique values[\s\S]*fewer than two unique values/,
  'MGA should explain when the selected grouping variable does not have exactly two unique values.',
)

assert.match(
  modalSource,
  /aria-describedby=\{groupingCountMessage \? 'mga-grouping-count-message' : undefined\}[\s\S]*id="mga-grouping-count-message"[\s\S]*role="alert"[\s\S]*aria-live="polite"[\s\S]*\{groupingCountMessage\}/,
  'MGA grouping warning should be announced inline near the coded dropdown.',
)

assert.match(
  modalSource,
  /swapGroupOrder[\s\S]*displayGroups[\s\S]*groupA[\s\S]*groupB/,
  'MGA swap control should affect the displayed left/right values sent to the backend.',
)

assert.match(
  modalSource,
  /background: 'rgb\(var\(--color-panel-control-active-rgb\) \/ 0\.72\)'[\s\S]*gridTemplateColumns: '1fr 42px 1fr'[\s\S]*textAlign: 'left'[\s\S]*textAlign: 'right'/,
  'MGA groups should sit in the same soft app-token comparison band as MICOM.',
)

assert.match(
  modalSource,
  /rgb\(var\(--color-accent-rgb\)[\s\S]*var\(--color-accent\)[\s\S]*var\(--color-on-accent\)/,
  'MGA active Calculate state should use active accent tokens.',
)
assert.doesNotMatch(
  modalSource,
  />\s*MGA\s*</,
  'MGA modal title should not show an MGA pill.',
)

assert.doesNotMatch(
  modalSource,
  /magenta|#EC4899|#FF2D8D|#E91E63/i,
  'MGA modal should not hardcode the mockup magenta/pink color.',
)

assert.match(
  modalSource,
  /className="w-\[520px\][\s\S]*height: 410[\s\S]*maxHeight: 'calc\(100vh - 32px\)'/,
  'MGA modal should use the same approved compact shell size as the MICOM modal.',
)

assert.match(
  modalSource,
  /SquaresFour[\s\S]*Multi Group Analysis/,
  'MGA modal title should use the same title icon pattern as MICOM.',
)

assert.match(
  modalSource,
  /gridTemplateColumns: '1fr 1fr 1fr'[\s\S]*gap: 8[\s\S]*paddingTop: 40[\s\S]*label: 'Bootstrap subsamples'/,
  'MGA settings row should sit closer to the Calculate footer by moving the bootstrap row lower.',
)

assert.doesNotMatch(
  modalSource,
  /PLS-MGA path comparison|Compares structural path coefficients across the two selected groups using seminr bootstrap MGA/,
  'MGA modal should not show the extra explanatory path-comparison copy.',
)

assert.match(
  modelCanvasSource,
  /import MultiGroupAnalysisModal[\s\S]*from '..\/components\/MultiGroupAnalysisModal'/,
  'ModelCanvas should import the MGA modal.',
)

assert.match(
  modelCanvasSource,
  /showMultiGroupAnalysisModal[\s\S]*case 'run-multi-group-analysis'[\s\S]*setShowMultiGroupAnalysisModal\(true\)/,
  'ModelCanvas should open the MGA modal from the Analysis menu action.',
)

assert.match(
  modelCanvasSource,
  /<MultiGroupAnalysisModal[\s\S]*groupingOptions=\{effectiveDatasetHeaders\}[\s\S]*datasetRows=\{linkedDatasetCache\?\.allRows \?\? \[\]\}[\s\S]*onRun=\{handleRunMultiGroupAnalysis\}/,
  'ModelCanvas should pass dataset headers, cached rows, and run handler into the MGA modal.',
)

assert.match(
  resultsViewSource,
  /import MultiGroupAnalysisModal[\s\S]*from '..\/components\/MultiGroupAnalysisModal'/,
  'ResultsView should import the MGA modal for native-menu parity.',
)

assert.match(
  resultsViewSource,
  /multiGroupOpen[\s\S]*run-multi-group-analysis[\s\S]*setMultiGroupOpen\(true\)/,
  'ResultsView should handle the MGA action if a native menu dispatches it.',
)

console.log('PASS multi-group analysis modal shell contract')
