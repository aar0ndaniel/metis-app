import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function readSource(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

const modalSource = await readSource('src/components/PermutationAnalysisModal.tsx')
const modelCanvasSource = await readSource('src/pages/ModelCanvas.tsx')
const resultsViewSource = await readSource('src/pages/ResultsView.tsx')

for (const expected of [
  'Permutation Analysis',
  'Beta',
  'Grouping variable',
  'Configural invariance',
  'Permutations',
  'Alpha',
  'Seed',
  'Calculate',
]) {
  assert.match(
    modalSource,
    new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `PermutationAnalysisModal should render "${expected}".`,
  )
}

assert.match(
  modalSource,
  /export interface PermutationAnalysisSettings[\s\S]*groupingVariable[\s\S]*groupA[\s\S]*groupB[\s\S]*permutations[\s\S]*alpha[\s\S]*seed/,
  'Permutation settings should carry explicit groupA/groupB values plus permutations, alpha, and seed.',
)

assert.match(
  modalSource,
  /groupingOptions:\s*string\[\][\s\S]*datasetRows\?:\s*string\[\]\[\]/,
  'Permutation modal should accept dataset headers and cached rows for grouping-variable counts.',
)

assert.doesNotMatch(
  modalSource,
  /modelName \|\| 'Untitled model'|<label style=\{labelStyle\}>\s*Model\s*<\/label>/,
  'Permutation modal should not repeat the model name while opened from the active model canvas.',
)

assert.match(
  modalSource,
  /DEFAULT_ALPHA = 0\.05[\s\S]*DEFAULT_SEED = 123[\s\S]*useState\('500'\)[\s\S]*useState\(String\(DEFAULT_ALPHA\)\)[\s\S]*useState\(String\(DEFAULT_SEED\)\)/,
  'Permutation modal should show 500 permutations, alpha 0.05, and seed 123 on the same settings row.',
)

assert.match(
  modalSource,
  /const calculateDisabled =[\s\S]*!hasExactlyTwoGroups[\s\S]*!configuralPrecheckPassed[\s\S]*permutationsError[\s\S]*alphaError[\s\S]*seedError/,
  'Calculate should stay disabled until exactly two groups, pre-check pass, and all visible settings are valid.',
)

assert.match(
  modalSource,
  /alpha:\s*Number\(alphaInput\)[\s\S]*seed:\s*Number\(seedInput\)/,
  'Alpha and seed should be sent from the visible settings row.',
)

assert.match(
  modalSource,
  /label: 'Permutations'[\s\S]*label: 'Alpha'[\s\S]*label: 'Seed'/,
  'Permutations, Alpha, and Seed should be rendered together on one compact settings row.',
)

assert.match(
  modalSource,
  /gridTemplateColumns: '1fr 1fr 1fr'[\s\S]*gap: 8[\s\S]*paddingTop: 25/,
  'Permutation settings row should sit lower with the approved extra spacing.',
)

assert.doesNotMatch(
  modalSource,
  /<select[\s>]/,
  'Grouping variable should use the app-coded dropdown pattern, not a native select.',
)

assert.match(
  modalSource,
  /groupingDropdownOpen[\s\S]*aria-haspopup="listbox"[\s\S]*role="listbox"[\s\S]*role="option"/,
  'Grouping variable dropdown should use the same coded button and popover pattern as the app.',
)

assert.match(
  modalSource,
  /excludedMissing[\s\S]*const hasExactlyTwoGroups = groupSummary\.groups\.length === 2[\s\S]*!hasExactlyTwoGroups/,
  'Grouping summary should account for missing values and keep Calculate disabled unless exactly two usable values exist.',
)

assert.match(
  modalSource,
  /const groupingCountMessage = groupingVariable[\s\S]*more than two unique values[\s\S]*fewer than two unique values/,
  'Permutation modal should explain when the selected grouping variable does not have exactly two unique values.',
)

assert.match(
  modalSource,
  /aria-describedby=\{groupingCountMessage \? 'permutation-grouping-count-message' : undefined\}[\s\S]*id="permutation-grouping-count-message"[\s\S]*role="alert"[\s\S]*aria-live="polite"[\s\S]*\{groupingCountMessage\}/,
  'Permutation grouping warning should be announced inline near the coded dropdown.',
)

assert.match(
  modalSource,
  /swapGroupOrder[\s\S]*displayGroups[\s\S]*groupA[\s\S]*groupB/,
  'Swap control should affect the displayed left/right values that are sent as explicit groups.',
)

assert.doesNotMatch(
  modalSource,
  /ArrowsHorizontal/,
  'Group switch should not use the old horizontal arrows icon.',
)

assert.match(
  modalSource,
  /ArrowLeft[\s\S]*ArrowRight[\s\S]*aria-label="Swap group comparison direction"/,
  'Group switch should use separate left and right arrow icons.',
)

assert.doesNotMatch(
  modalSource,
  /<CaretDown size=\{15\} style=\{\{ transform: 'rotate\(90deg\)' \}\} \/>[\s\S]*<CaretDown size=\{15\} style=\{\{ marginLeft: -5, transform: 'rotate\(-90deg\)' \}\} \/>/,
  'Group switch should not be built from rotated dropdown carets.',
)

assert.match(
  modalSource,
  /background: 'rgb\(var\(--color-panel-control-active-rgb\) \/ 0\.72\)'[\s\S]*gridTemplateColumns: '1fr 42px 1fr'[\s\S]*textAlign: 'left'[\s\S]*border: 'none'[\s\S]*textAlign: 'right'/,
  'Group A, switch, and Group B should sit in one soft app-token background band without an outer border.',
)

assert.match(
  modalSource,
  /rgb\(var\(--color-accent-rgb\)[\s\S]*var\(--color-accent\)[\s\S]*var\(--color-on-accent\)/,
  'Beta pill and active Calculate state should use the active accent tokens.',
)

assert.match(
  modalSource,
  /className="w-\[520px\][\s\S]*height: 410[\s\S]*maxHeight: 'calc\(100vh - 32px\)'/,
  'Permutation modal should keep the approved width while expanding height enough that collapsed content does not scroll.',
)

assert.doesNotMatch(
  modalSource,
  /width:\s*'min\(880px|min\(880px/,
  'Permutation modal should not use the earlier oversized 880px shell.',
)

assert.doesNotMatch(
  modalSource,
  /magenta|#EC4899|#FF2D8D|#E91E63/i,
  'Permutation modal should not hardcode the mockup magenta/pink color.',
)

assert.doesNotMatch(
  modalSource,
  /groupStatusMessage|Select a grouping variable\.|valid observations included/,
  'The extra status line under the group switch should be removed.',
)

assert.doesNotMatch(
  modalSource,
  /fontWeight:\s*(500|600|700|800)/,
  'Permutation modal text should use regular font weight only.',
)

assert.match(
  modalSource,
  /padding: '0 8px 0 12px'[\s\S]*<CaretDown size=\{16\}/,
  'Grouping dropdown caret should sit at the far right with compact padding.',
)

assert.match(
  modalSource,
  /SquaresFour[\s\S]*Permutation Analysis/,
  'Permutation modal title should use the same title icon as the PLS-SEM modal.',
)

assert.match(
  modalSource,
  /overflowY: configuralOpen \? 'auto' : 'hidden'/,
  'Permutation modal body should only become scrollable when the configural section is expanded.',
)

assert.match(
  modalSource,
  /border: '1px solid var\(--color-border\)'[\s\S]*borderRadius: 6[\s\S]*Configural invariance/,
  'Configural section should keep the restored app-token border.',
)

assert.match(
  modalSource,
  /const configuralStatusColor = configuralStatus === 'passed'[\s\S]*var\(--color-success\)[\s\S]*var\(--color-danger\)/,
  'Configural status text should use green when passed and red when not passed.',
)

assert.doesNotMatch(
  modalSource,
  /background: configuralStatus === 'passed' \? 'var\(--color-success\)' : 'var\(--color-input\)'/,
  'Configural checklist icons should not use a filled green background.',
)

assert.match(
  modalSource,
  /<Check size=\{11\}[\s\S]*color=\{configuralStatusColor\}[\s\S]*style=\{\{[\s\S]*color: configuralStatusColor/,
  'Configural checklist rows should use small status-colored icons and status-colored text.',
)

assert.match(
  modelCanvasSource,
  /import PermutationAnalysisModal[\s\S]*from '..\/components\/PermutationAnalysisModal'/,
  'ModelCanvas should import the permutation modal.',
)
assert.match(
  modelCanvasSource,
  /showPermutationAnalysisModal[\s\S]*case 'run-permutation-analysis'[\s\S]*setShowPermutationAnalysisModal\(true\)/,
  'ModelCanvas should open the permutation modal from the Analysis menu action.',
)
assert.match(
  modelCanvasSource,
  /<PermutationAnalysisModal[\s\S]*modelName=[\s\S]*groupingOptions=\{effectiveDatasetHeaders\}[\s\S]*datasetRows=\{linkedDatasetCache\?\.allRows \?\? \[\]\}/,
  'ModelCanvas should pass the active model name, dataset headers, and cached rows into the permutation modal.',
)

assert.match(
  modelCanvasSource,
  /const linkedDatasetHasCachedRows = Array\.isArray\(linkedDatasetCache\?\.allRows\)[\s\S]*if \(!activeWs \|\| !linkedDataset\?\.id\) return[\s\S]*if \(effectiveDatasetHeaders\.length > 0 && linkedDatasetHasCachedRows\) return/,
  'ModelCanvas should hydrate the linked dataset snapshot when MICOM has headers but no cached rows for unique group values.',
)

assert.match(
  resultsViewSource,
  /import PermutationAnalysisModal[\s\S]*from '..\/components\/PermutationAnalysisModal'/,
  'ResultsView should import the permutation modal for native-menu parity.',
)
assert.match(
  resultsViewSource,
  /permutationOpen[\s\S]*run-permutation-analysis[\s\S]*setPermutationOpen\(true\)/,
  'ResultsView should handle the permutation action if a native menu dispatches it.',
)

console.log('PASS permutation analysis modal shell contract')
