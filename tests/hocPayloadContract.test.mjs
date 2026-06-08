import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')

async function bundleModule(relativeEntry, outfileName) {
  const entryPoint = path.join(workspaceRoot, relativeEntry)
  const outfile = path.join(tempDir, outfileName)

  await fs.mkdir(tempDir, { recursive: true })

  try {
    await build({
      entryPoints: [entryPoint],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      logLevel: 'silent',
    })
  } catch (error) {
    return { error }
  }

  try {
    return { module: await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`) }
  } catch (error) {
    return { error }
  }
}

const bundled = await bundleModule('src/utils/plsModelPayload.ts', 'hocPayloadContract.bundle.mjs')
assert.ok(!bundled.error, `Expected HOC payload helper to compile, got: ${bundled.error?.message ?? 'unknown error'}`)

const { buildPlsModelPayloadParts } = bundled.module ?? {}
assert.equal(typeof buildPlsModelPayloadParts, 'function', 'buildPlsModelPayloadParts should be exported')

const constructs = [
  { id: 'hoc', name: 'Facebook Engagement', type: 'Reflective', isHigherOrder: true, indicators: [] },
  { id: 'loc-a', name: 'Social Interaction', type: 'Reflective', indicators: [{ name: 'SI1' }, { name: 'SI2' }] },
  { id: 'loc-b', name: 'Content Sharing', type: 'Formative', indicators: [{ name: 'CS1' }, { name: 'CS2' }] },
  { id: 'outcome', name: 'Purchase Intention', type: 'Reflective', indicators: [{ name: 'PI1' }, { name: 'PI2' }] },
]

const paths = [
  { id: 'p1', from: 'hoc', to: 'loc-a', kind: 'direct', hocRole: 'measurement' },
  { id: 'p2', from: 'hoc', to: 'loc-b', kind: 'direct', hocRole: 'measurement' },
  { id: 'p3', from: 'hoc', to: 'outcome', kind: 'direct', hocRole: 'structural' },
]

const result = buildPlsModelPayloadParts(constructs, paths)
assert.deepEqual(result.paths, [
  { from: 'Facebook Engagement', to: 'Purchase Intention' },
])
assert.equal(result.directPathCount, 1)
assert.deepEqual(result.hocDimensionsById.get('hoc'), ['Social Interaction', 'Content Sharing'])

const hocPayload = result.constructs.find((construct) => construct.name === 'Facebook Engagement')
assert.deepEqual(hocPayload, {
  name: 'Facebook Engagement',
  type: 'Reflective',
  indicators: [],
  is_higher_order: true,
  higher_order_type: 'reflective',
  dimensions: ['Social Interaction', 'Content Sharing'],
})

const nonHocPayload = result.constructs.find((construct) => construct.name === 'Purchase Intention')
assert.deepEqual(nonHocPayload, {
  name: 'Purchase Intention',
  type: 'Reflective',
  indicators: ['PI1', 'PI2'],
})

const moderationConstructs = [
  { id: 'gai', name: 'GAI', type: 'Reflective', indicators: [{ name: 'GAI1' }, { name: 'GAI2' }] },
  { id: 'pwb', name: 'PWB', type: 'Reflective', indicators: [{ name: 'PWB1' }, { name: 'PWB2' }] },
  { id: 'use', name: 'USE', type: 'Reflective', indicators: [{ name: 'USE1' }, { name: 'USE2' }] },
]

const moderationPaths = [
  { id: 'gai-use', from: 'gai', to: 'use', kind: 'direct' },
  { id: 'pwb-moderates-gai-use', from: 'pwb', to: 'use', kind: 'moderation', targetPathId: 'gai-use' },
]

const moderationResult = buildPlsModelPayloadParts(moderationConstructs, moderationPaths)
assert.deepEqual(moderationResult.paths, [
  { from: 'GAI', to: 'USE' },
  { from: 'PWB', to: 'USE' },
  { from: 'GAI*PWB', to: 'USE' },
])
assert.deepEqual(moderationResult.interactions, [
  { iv: 'GAI', moderator: 'PWB', outcome: 'USE' },
])
assert.equal(moderationResult.directPathCount, 1)

const mixedModeratorConstructs = [
  { id: 'att', name: 'Attitude', type: 'Reflective', indicators: [{ name: 'ATT1' }, { name: 'ATT2' }] },
  { id: 'gender', name: 'GenderCode', type: 'Reflective', indicators: [{ name: 'GenderCode' }] },
  { id: 'age', name: 'AgeCategory', type: 'Reflective', indicators: [{ name: 'AGE1' }, { name: 'AGE2' }] },
  { id: 'use', name: 'USE', type: 'Reflective', indicators: [{ name: 'USE1' }, { name: 'USE2' }] },
]

const mixedModeratorPaths = [
  { id: 'att-use', from: 'att', to: 'use', kind: 'direct' },
  { id: 'gender-moderates-att-use', from: 'gender', to: 'use', kind: 'moderation', targetPathId: 'att-use' },
  { id: 'age-moderates-att-use', from: 'age', to: 'use', kind: 'moderation', targetPathId: 'att-use' },
]

const mixedModeratorResult = buildPlsModelPayloadParts(mixedModeratorConstructs, mixedModeratorPaths)
assert.deepEqual(mixedModeratorResult.paths, [
  { from: 'Attitude', to: 'USE' },
  { from: 'GenderCode', to: 'USE' },
  { from: 'AgeCategory', to: 'USE' },
  { from: 'Attitude*GenderCode', to: 'USE' },
  { from: 'Attitude*AgeCategory', to: 'USE' },
])
assert.deepEqual(mixedModeratorResult.interactions, [
  { iv: 'Attitude', moderator: 'GenderCode', outcome: 'USE' },
  { iv: 'Attitude', moderator: 'AgeCategory', outcome: 'USE' },
])
assert.deepEqual(
  mixedModeratorResult.constructs.find((construct) => construct.name === 'GenderCode'),
  { name: 'GenderCode', type: 'Reflective', indicators: ['GenderCode'] },
)
assert.deepEqual(
  mixedModeratorResult.constructs.find((construct) => construct.name === 'AgeCategory'),
  { name: 'AgeCategory', type: 'Reflective', indicators: ['AGE1', 'AGE2'] },
)

const modelCanvasSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const resultsViewSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')

assert.match(modelCanvasSource, /buildPlsModelPayloadParts/, 'ModelCanvas should use the shared HOC-aware payload helper.')
assert.match(resultsViewSource, /buildPlsModelPayloadParts/, 'ResultsView reruns should use the shared HOC-aware payload helper.')
assert.match(
  modelCanvasSource,
  /runPlsModel\(\{[\s\S]*?datasetPath:\s*datasetFilePath,[\s\S]*?constructs:\s*payloadConstructs,[\s\S]*?paths:\s*mappedPaths,[\s\S]*?interactions:\s*payloadParts\.interactions,[\s\S]*?\}\)/,
  'Realtime PLS calculation should send moderation interactions to the backend.'
)
assert.match(
  resultsViewSource,
  /return\s*\{[\s\S]*?datasetPath,[\s\S]*?constructs,[\s\S]*?paths,[\s\S]*?interactions:\s*payloadParts\.interactions,[\s\S]*?algorithm:/,
  'ResultsView reruns should preserve moderation interactions in the backend payload.'
)

console.log('PASS HOC payload contract')
