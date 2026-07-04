import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tmpDir = path.join(workspaceRoot, '.tmp-tests')
await fs.mkdir(tmpDir, { recursive: true })

const outfile = path.join(tmpDir, 'test_realformat.bundle.mjs')
await build({
  entryPoints: [path.join(workspaceRoot, 'src/results/panelDerivedData.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'silent',
})

const mod = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
const { deriveModerationSlopeRows, hasModerationInteractions } = mod

// savedModel: correct structure with IDs and kind fields (from ModelCanvas)
const savedModel = {
  constructs: [
    { id: 'c-image', name: 'Image', indicators: [{ name: 'IMAG1' }] },
    { id: 'c-exp', name: 'Expectation', indicators: [{ name: 'CUEX1' }] },
    { id: 'c-sat', name: 'Satisfaction', indicators: [{ name: 'CUSA1' }] },
  ],
  paths: [
    { id: 'p-img-sat', from: 'c-image', to: 'c-sat', kind: 'direct' },
    { id: 'p-exp-sat', from: 'c-exp', to: 'c-sat', kind: 'direct' },
    { id: 'p-mod', from: 'c-exp', to: 'c-sat', kind: 'moderation', targetPathId: 'p-img-sat' },
  ],
}

// analysisResults: REAL R API output format (from/to/coefficient, not row_name)
const analysisResults = {
  final_results: {
    path_coefficients: [
      { from: 'Image', to: 'Satisfaction', coefficient: 0.5865 },
      { from: 'Expectation', to: 'Satisfaction', coefficient: 0.215 },
      { from: 'Image*Expectation', to: 'Satisfaction', coefficient: -0.0434 },
    ],
  },
}

console.log('hasModerationInteractions:', hasModerationInteractions(savedModel, analysisResults))
const rows = deriveModerationSlopeRows(savedModel, analysisResults)
console.log('rows count:', rows.length)
if (rows.length) console.log('rows:', JSON.stringify(rows, null, 2))

assert.equal(hasModerationInteractions(savedModel, analysisResults), true, 'should detect interactions')
assert.equal(rows.length, 3, 'should have 3 slope rows (Low, Mean, High)')
assert.equal(rows[0].Moderator_level, 'Low (-1 SD)')
assert.equal(rows[1].Moderator_level, 'Mean (0)')
assert.equal(rows[2].Moderator_level, 'High (+1 SD)')
console.log('PASS: real R API format produces correct slope rows')
