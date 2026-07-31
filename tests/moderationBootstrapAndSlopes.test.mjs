import assert from 'node:assert'
import {
  deriveModerationSlopeRows,
  deriveModerationSummaryRows,
  buildModerationSlopeChartSvg,
  hasModerationSlopeCoefficients,
} from '../src/results/panelDerivedData.ts'

console.log('=== TEST 1: Construct ID prefix resolution (e.g. c-101 vs Image) ===')
const modelWithConstructIds = {
  constructs: [
    { id: 'c-101', name: 'Image' },
    { id: 'c-102', name: 'Expectation' },
    { id: 'c-103', name: 'Satisfaction' },
  ],
  paths: [
    { id: 'p-1', from: 'c-101', to: 'c-103', kind: 'direct' },
    { id: 'p-2', from: 'c-102', to: 'c-103', kind: 'direct' },
    { id: 'p-3', from: 'c-102', to: 'c-103', kind: 'moderation', targetPathId: 'p-1' },
  ],
}

const analysisResults = {
  final_results: {
    path_coefficients: [
      { from: 'Image', to: 'Satisfaction', coefficient: 0.685 },
      { from: 'Expectation', to: 'Satisfaction', coefficient: 0.262 },
      { from: 'Image*Expectation', to: 'Satisfaction', coefficient: -0.053 },
    ],
  },
}

const hasCoef = hasModerationSlopeCoefficients(modelWithConstructIds, analysisResults)
console.log('hasModerationSlopeCoefficients with construct IDs:', hasCoef)
assert.strictEqual(hasCoef, true, 'hasModerationSlopeCoefficients should be true for construct ID match')

const slopeRows = deriveModerationSlopeRows(modelWithConstructIds, analysisResults)
console.log('Derived slope rows count:', slopeRows.length)
assert.strictEqual(slopeRows.length, 3, 'Should derive 3 simple slope rows')

console.log('\n=== TEST 2: Bootstrap P Val parsing ===')
const bootstrapResults = {
  final_results: {
    path_coefficients: [
      { Path: 'Image*Expectation -> Satisfaction', 'Original Est.': -0.053, 'Bootstrap P Val': 0.04 },
    ],
  },
}
const summaryRows = deriveModerationSummaryRows(modelWithConstructIds, bootstrapResults)
console.log('Summary row decision:', summaryRows[0]?.decision)
assert.strictEqual(summaryRows[0]?.decision, 'Significant', 'Bootstrap P Val should be recognized and marked Significant')

console.log('\n=== TEST 3: SVG Chart generation ===')
const svg = buildModerationSlopeChartSvg(modelWithConstructIds, analysisResults)
console.log('Generated SVG contains svg element:', svg.includes('<svg'))
assert.strictEqual(svg.includes('<svg'), true, 'SVG should be generated')

console.log('\nALL TESTS PASSED SUCCESSFULLY! 🟢')
