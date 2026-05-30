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

const modelCanvasSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const resultsViewSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')

assert.match(modelCanvasSource, /buildPlsModelPayloadParts/, 'ModelCanvas should use the shared HOC-aware payload helper.')
assert.match(resultsViewSource, /buildPlsModelPayloadParts/, 'ResultsView reruns should use the shared HOC-aware payload helper.')

console.log('PASS HOC payload contract')
