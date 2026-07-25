import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const source = await fs.readFile(path.join(workspaceRoot, 'src/components/TitleBar.tsx'), 'utf8')
const modelCanvasSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const analysisMenuMatch = source.match(/function buildAnalysisMenu[\s\S]*?\n\}/)

assert.ok(analysisMenuMatch, 'TitleBar should keep a buildAnalysisMenu function.')

const analysisMenu = analysisMenuMatch[0]

assert.doesNotMatch(
  analysisMenu,
  /label:\s*'Correlation'/,
  'Analysis menu should not show the disabled Correlation item.'
)

assert.doesNotMatch(
  analysisMenu,
  /label:\s*'Regression'/,
  'Analysis menu should not show the disabled Regression item.'
)

assert.doesNotMatch(
  analysisMenu,
  /label:\s*'Advanced analysis'/,
  'Analysis menu should replace Advanced analysis with explicit analysis families.'
)

assert.match(
  analysisMenu,
  /label:\s*'NCA and IPMA'[\s\S]*action:\s*'run-advanced-analysis'/,
  'Analysis menu should expose NCA and IPMA as one combined item while preserving the existing advanced-analysis action.'
)

assert.doesNotMatch(
  analysisMenu,
  /label:\s*'NCA'[\s\S]*label:\s*'cIPMA'/,
  'Analysis menu should not split NCA and IPMA into separate children.'
)

assert.match(
  analysisMenu,
  /label:\s*'Permutation Analysis \(MICOM\)'[\s\S]*badge:\s*'Beta'[\s\S]*action:\s*'run-permutation-analysis'/,
  'Analysis menu should expose Permutation Analysis (MICOM) with a Beta badge.'
)

assert.match(
  analysisMenu,
  /label:\s*'Multi Group Analysis \(MGA\)'[\s\S]*action:\s*'run-multi-group-analysis'/,
  'Analysis menu should expose Multi Group Analysis (MGA).'
)

for (const [label, escapedLabel] of [
  ['NCA and IPMA', 'NCA and IPMA'],
  ['Permutation Analysis (MICOM)', 'Permutation Analysis \\(MICOM\\)'],
  ['Multi Group Analysis (MGA)', 'Multi Group Analysis \\(MGA\\)'],
]) {
  assert.match(
    analysisMenu,
    new RegExp(`label:\\s*'${escapedLabel}'[^\\n]*disabled:\\s*noCanvas \\|\\| !status\\.hasCanvasItems`),
    `${label} should be available for a populated model without requiring a saved PLS-SEM result.`,
  )
}

assert.doesNotMatch(
  analysisMenu,
  /canRunAdvanced/,
  'Analysis menu children should not depend on the saved-PLS canRunAdvanced status.',
)

const advancedActionMatch = modelCanvasSource.match(/case 'run-advanced-analysis':[\s\S]*?break/)
assert.ok(advancedActionMatch, 'ModelCanvas should handle the NCA and IPMA analysis action.')
assert.match(
  advancedActionMatch[0],
  /if \(!isAnyCalculationRunning\) setShowAdvancedAnalysisModal\(true\)/,
  'NCA and IPMA should open when no calculation is running, without requiring a prior PLS-SEM result.',
)
assert.doesNotMatch(
  advancedActionMatch[0],
  /canRunAdvancedAnalysis/,
  'NCA and IPMA action handling should not retain the saved-PLS prerequisite.',
)

assert.match(
  source,
  /label:\s*'Analysis', items:\s*buildAnalysisMenu\(currentScreen, status\), width:\s*320/,
  'Analysis menu dropdown should be wide enough for Permutation Analysis (MICOM) plus the Beta pill.'
)

console.log('PASS title bar analysis menu contract')
