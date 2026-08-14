import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tmpDir = path.join(workspaceRoot, '.tmp-tests')
await fs.mkdir(tmpDir, { recursive: true })

// Bundle plsModelPayload and panelDerivedData
const outfilePayload = path.join(tmpDir, 'test_payload.bundle.mjs')
await build({
  entryPoints: [path.join(workspaceRoot, 'src/utils/plsModelPayload.ts')],
  outfile: outfilePayload, bundle: true, format: 'esm', platform: 'node', target: 'node20', logLevel: 'silent',
})

const outfileDerived = path.join(tmpDir, 'test_derived.bundle.mjs')
await build({
  entryPoints: [path.join(workspaceRoot, 'src/results/panelDerivedData.ts')],
  outfile: outfileDerived, bundle: true, format: 'esm', platform: 'node', target: 'node20', logLevel: 'silent',
})

const { buildPlsModelPayloadParts } = await import(`${pathToFileURL(outfilePayload).href}?t=${Date.now()}`)
const { deriveModerationSlopeRows, hasModerationSlopeCoefficients, hasModerationInteractions } = await import(`${pathToFileURL(outfileDerived).href}?t=${Date.now()}`)

console.log('=== TEST 1: targetPathId string vs number mismatch in buildPlsModelPayloadParts ===')
const constructs = [
  { id: 'c1', name: 'Image', type: 'reflective' },
  { id: 'c2', name: 'Expectation', type: 'reflective' },
  { id: 'c3', name: 'Satisfaction', type: 'reflective' },
]
// Suppose path.id is number 101, but moderationPath.targetPathId is string "101"
const pathsMismatched = [
  { id: 101, from: 'c1', to: 'c3', kind: 'direct' },
  { id: 102, from: 'c2', to: 'c3', kind: 'moderation', targetPathId: '101' },
]

const payloadParts1 = buildPlsModelPayloadParts(constructs, pathsMismatched)
console.log('Interactions generated:', payloadParts1.interactions)
if (payloadParts1.interactions.length === 0) {
  console.log('🔴 BUG CONFIRMED: buildPlsModelPayloadParts failed to match string "101" with number 101!')
} else {
  console.log('🟢 Matched correctly!')
}

console.log('\n=== TEST 2: targetPathId missing or mismatched, but from/to match ===')
const pathsBrokenId = [
  { id: 'p-direct-1', from: 'c1', to: 'c3', kind: 'direct' },
  { id: 'p-mod-1', from: 'c2', to: 'c3', kind: 'moderation', targetPathId: 'p-old-id' }, // stale targetPathId
]
const payloadParts2 = buildPlsModelPayloadParts(constructs, pathsBrokenId)
console.log('Interactions generated:', payloadParts2.interactions)
if (payloadParts2.interactions.length === 0) {
  console.log('🔴 BUG CONFIRMED: buildPlsModelPayloadParts dropped interaction because targetPathId was stale!')
} else {
  console.log('🟢 Matched correctly!')
}

console.log('\n=== TEST 3: R interaction term naming variants (e.g. Image.Expectation or Image_Expectation) ===')
const savedModel = {
  constructs,
  paths: pathsMismatched.map(p => ({ ...p, id: String(p.id), targetPathId: String(p.targetPathId) })),
}
const R_results_dot_notation = {
  final_results: {
    path_coefficients: [
      { from: 'Image', to: 'Satisfaction', coefficient: 0.685 },
      { from: 'Expectation', to: 'Satisfaction', coefficient: 0.262 },
      { from: 'Image.Expectation', to: 'Satisfaction', coefficient: -0.053 },
    ],
  },
}
console.log('hasModerationSlopeCoefficients with dot notation (Image.Expectation):', hasModerationSlopeCoefficients(savedModel, R_results_dot_notation))
const slopesDot = deriveModerationSlopeRows(savedModel, R_results_dot_notation)
console.log('slope rows with dot notation:', slopesDot.length)
if (slopesDot.length === 0) {
  console.log('🔴 BUG CONFIRMED: dot notation "Image.Expectation" failed to match!')
}

console.log('\n=== TEST 4: Nested results wrapper (e.g. analysisResults.results.path_coefficients) ===')
const R_results_nested = {
  results: {
    path_coefficients: [
      { from: 'Image', to: 'Satisfaction', coefficient: 0.685 },
      { from: 'Expectation', to: 'Satisfaction', coefficient: 0.262 },
      { from: 'Image*Expectation', to: 'Satisfaction', coefficient: -0.053 },
    ],
  },
}
console.log('hasModerationSlopeCoefficients with results.path_coefficients:', hasModerationSlopeCoefficients(savedModel, R_results_nested))
const slopesNested = deriveModerationSlopeRows(savedModel, R_results_nested)
console.log('slope rows with nested path_coefficients:', slopesNested.length)
if (slopesNested.length === 0) {
  console.log('🔴 BUG CONFIRMED: results.path_coefficients failed to resolve!')
}
