import { buildModerationSlopeChartSvg, deriveModerationSlopeRows, getModerationInteractions, hasModerationSlopeCoefficients } from '../src/results/panelDerivedData.ts'

console.log('=== TEST REAL-WORLD SCENARIOS FOR SLOPE CHART SVG ===')

const mockModelA = {
  constructs: [
    { id: '1', name: 'User Satisfaction', type: 'reflective' },
    { id: '2', name: 'Service Quality', type: 'reflective' },
    { id: '3', name: 'Customer Trust', type: 'reflective' },
  ],
  paths: [
    { id: 'path-1', from: '2', to: '1', kind: 'direct' },
    { id: 'path-2', from: '3', to: '1', kind: 'moderation', targetPathId: 'path-1' },
  ],
}

const mockResultsA1 = {
  final_results: {
    path_coefficients: [
      { from: 'Service Quality', to: 'User Satisfaction', coefficient: 0.45 },
      { from: 'Customer Trust', to: 'User Satisfaction', coefficient: 0.30 },
      { from: 'Service Quality*Customer Trust', to: 'User Satisfaction', coefficient: 0.15 },
    ],
  },
}

console.log('Case A1 (Fresh results with interaction path):')
console.log('hasModerationSlopeCoefficients A1:', hasModerationSlopeCoefficients(mockModelA, mockResultsA1))
const svgA1 = buildModerationSlopeChartSvg(mockModelA, mockResultsA1)
console.log('SVG A1 Length:', svgA1.length)

// Case A5: Stale results (PLS-SEM was run before adding the moderation line)
const mockStaleResults = {
  final_results: {
    path_coefficients: [
      { from: 'Service Quality', to: 'User Satisfaction', coefficient: 0.45 },
      { from: 'Customer Trust', to: 'User Satisfaction', coefficient: 0.30 },
      // Notice: NO Service Quality*Customer Trust interaction coefficient here!
    ],
  },
}

console.log('\nCase A5 (Stale results pre-dating moderation path):')
console.log('hasModerationSlopeCoefficients A5:', hasModerationSlopeCoefficients(mockModelA, mockStaleResults))
const svgA5 = buildModerationSlopeChartSvg(mockModelA, mockStaleResults)
console.log('SVG A5 Length:', svgA5.length)
