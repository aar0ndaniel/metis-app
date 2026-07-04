import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tmpDir = path.join(workspaceRoot, '.tmp-tests')
await fs.mkdir(tmpDir, { recursive: true })

const outfile = path.join(tmpDir, 'test_allmod.bundle.mjs')
await build({
  entryPoints: [path.join(workspaceRoot, 'src/results/panelDerivedData.ts')],
  outfile, bundle: true, format: 'esm', platform: 'node', target: 'node20', logLevel: 'silent',
})

const mod = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
const { deriveModerationSlopeRows, deriveModerationSummaryRows, hasModerationInteractions, hasModerationSlopeCoefficients } = mod

// Test 1: Real R API format - WITH savedModel (correct structure)
const savedModel = {
  constructs: [
    { id: 'c-img', name: 'Image', indicators: [{ name: 'IMAG1' }] },
    { id: 'c-exp', name: 'Expectation', indicators: [{ name: 'CUEX1' }] },
    { id: 'c-sat', name: 'Satisfaction', indicators: [{ name: 'CUSA1' }] },
  ],
  paths: [
    { id: 'p-img-sat', from: 'c-img', to: 'c-sat', kind: 'direct' },
    { id: 'p-exp-sat', from: 'c-exp', to: 'c-sat', kind: 'direct' },
    { id: 'p-mod', from: 'c-exp', to: 'c-sat', kind: 'moderation', targetPathId: 'p-img-sat' },
  ],
}

// Real R output: {from, to, coefficient}
const analysisResultsReal = {
  final_results: {
    path_coefficients: [
      { from: 'Image', to: 'Satisfaction', coefficient: 0.5865 },
      { from: 'Expectation', to: 'Satisfaction', coefficient: 0.215 },
      { from: 'Image*Expectation', to: 'Satisfaction', coefficient: -0.0434 },
    ],
  },
}

// Test 2: What if the user has OLD RESULTS (without interaction path)?
const oldResults = {
  final_results: {
    path_coefficients: [
      { from: 'Image', to: 'Satisfaction', coefficient: 0.65 },
      { from: 'Expectation', to: 'Satisfaction', coefficient: 0.18 },
      // No interaction path in old results!
    ],
  },
}

// Test 3: NULL savedModel (results page loaded from storage without navState)
const nullModel = null

console.log('\n=== Test 1: Real R output + correct savedModel ===')
console.log('hasModerationInteractions:', hasModerationInteractions(savedModel, analysisResultsReal))
const slopes1 = deriveModerationSlopeRows(savedModel, analysisResultsReal)
console.log('slope rows:', slopes1.length, slopes1.length ? '✓' : '✗ EMPTY!')

console.log('\n=== Test 2: Old results WITHOUT interaction path + savedModel has moderation ===')
console.log('hasModerationInteractions:', hasModerationInteractions(savedModel, oldResults))
const slopes2 = deriveModerationSlopeRows(savedModel, oldResults)
console.log('slope rows:', slopes2.length, slopes2.length ? '✓' : '✗ EMPTY! (stale results)')

console.log('\n=== Test 3: Null savedModel + real results ===')
console.log('hasModerationInteractions:', hasModerationInteractions(nullModel, analysisResultsReal))
const slopes3 = deriveModerationSlopeRows(nullModel, analysisResultsReal)
console.log('slope rows:', slopes3.length, slopes3.length ? '✓' : '✗ EMPTY!')

console.log('\n=== Test 4: Summary vs Slopes comparison ===')
const summary = deriveModerationSummaryRows(savedModel, oldResults)
const slopes = deriveModerationSlopeRows(savedModel, oldResults)
console.log('Summary rows:', summary.length, '  Slope rows:', slopes.length)
console.log('Summary beta:', summary[0]?.beta_interaction, '  Slope base:', slopes[0]?.simple_slope)
if (summary.length > 0 && slopes.length === 0) {
  console.log('→ Summary shows data but Slopes are empty (expected: stale results)')
}

console.log('\n=== Test 5: hasModerationSlopeCoefficients detection ===')
const hasCoefFresh = hasModerationSlopeCoefficients(savedModel, analysisResultsReal)
const hasCoefStale = hasModerationSlopeCoefficients(savedModel, oldResults)
console.log('Fresh results (with interaction coef):', hasCoefFresh, hasCoefFresh === true ? '✓' : '✗')
console.log('Stale results (no interaction coef):', hasCoefStale, hasCoefStale === false ? '✓ (will show "Re-run" message)' : '✗')

if (hasCoefFresh && !hasCoefStale) {
  console.log('\nFix verified: stale results correctly detected → empty state will say "Re-run PLS-SEM"')
} else {
  console.log('\n✗ Detection not working correctly')
  process.exit(1)
}
