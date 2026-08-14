import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')

async function readSource(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

async function bundleModule(relativeEntry, outfileName) {
  const entryPoint = path.join(workspaceRoot, relativeEntry)
  const outfile = path.join(tempDir, outfileName)
  await fs.mkdir(tempDir, { recursive: true })
  await build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    sourcemap: 'inline',
    logLevel: 'silent',
  })
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
}

const micomCache = await bundleModule('src/utils/micomCache.ts', 'micomMGAWorkspaceCache.bundle.mjs')
const modelCanvasSource = await readSource('src/pages/ModelCanvas.tsx')
const resultsViewSource = await readSource('src/pages/ResultsView.tsx')

const payload = {
  datasetPath: 'C:/data/customer.csv',
  constructs: [
    { name: 'Image', type: 'Reflective', indicators: ['IMAG1', 'IMAG2'] },
    { name: 'Satisfaction', type: 'Reflective', indicators: ['SAT1', 'SAT2'] },
  ],
  paths: [{ from: 'Image', to: 'Satisfaction' }],
  interactions: [],
  algorithm: 'standard',
  groupingVariable: 'Gender',
  groupA: 'Male',
  groupB: 'Female',
  permutations: 500,
  alpha: 0.05,
  seed: 123,
}

assert.deepEqual(micomCache.MICOM_MGA_HOC_UNAVAILABLE_OVERVIEW, {
  status: 'unavailable',
  message: 'MICOM is unavailable for HOC models; MGA was estimated without a MICOM invariance assessment.',
  source: 'hoc-not-supported',
})

const fullMicomResults = {
  method: 'MICOM',
  groups: {
    groupingVariable: 'Gender',
    groupA: 'Male',
    groupB: 'Female',
    counts: { groupA: 146, groupB: 173 },
  },
  settings: { permutations: 500, alpha: 0.05, seed: 123 },
  configuralInvariance: {
    passed: true,
    status: 'passed',
    checks: [
      { construct: 'Image', check: 'measurement model', passed: true },
      { construct: 'Satisfaction', check: 'measurement model', passed: true },
    ],
  },
  compositionalInvariance: [
    { construct: 'Image', c_value: 0.99, p_value: 0.31, decision: 'supported' },
  ],
  equalityAssessment: [
    { construct: 'Image', mean_decision: 'supported', variance_decision: 'not supported' },
  ],
  invarianceClassification: [
    { construct: 'Image', invariance: 'Partial measurement invariance' },
    { construct: 'Satisfaction', invariance: 'Partial measurement invariance' },
  ],
}

const cache = micomCache.createMicomCacheEntry({
  payload,
  results: fullMicomResults,
  graphSignature: 'graph-v1',
  savedAt: '2026-07-18T00:00:00.000Z',
})

assert.equal(cache.coverage, 'full')
assert.equal(cache.signature, micomCache.buildMicomCacheSignature(payload, 'graph-v1'))
assert.deepEqual(cache.results.configuralInvariance, fullMicomResults.configuralInvariance)
assert.deepEqual(cache.results.compositionalInvariance, fullMicomResults.compositionalInvariance)
assert.deepEqual(cache.results.equalityAssessment, fullMicomResults.equalityAssessment)
assert.deepEqual(cache.results.invarianceClassification, fullMicomResults.invarianceClassification)

assert.deepEqual(micomCache.buildMicomOverviewFromCache(cache), {
  status: 'partial',
  message: 'Partial measurement invariance available from cached MICOM.',
  source: 'cached-micom',
})

assert.equal(
  micomCache.doesCachedMicomMatchCurrentStep1(cache, {
    configuralInvariance: fullMicomResults.configuralInvariance,
  }, payload, 'graph-v1'),
  true,
)
assert.equal(
  micomCache.doesCachedMicomMatchCurrentStep1(cache, {
    configuralInvariance: {
      ...fullMicomResults.configuralInvariance,
      checks: [{ construct: 'Image', check: 'measurement model', passed: false }],
    },
  }, payload, 'graph-v1'),
  false,
)
assert.equal(
  micomCache.doesCachedMicomMatchCurrentStep1(cache, {
    configuralInvariance: fullMicomResults.configuralInvariance,
  }, { ...payload, groupA: 'Low income' }, 'graph-v1'),
  false,
)

let precheckCalls = 0
const validOverview = await micomCache.resolveMicomOverviewForMgaCache({
  cache,
  payload,
  graphSignature: 'graph-v1',
  runConfiguralPrecheck: async () => {
    precheckCalls += 1
    return {
      success: true,
      results: { configuralInvariance: fullMicomResults.configuralInvariance },
    }
  },
})
assert.equal(precheckCalls, 1)
assert.equal(validOverview.message, 'Partial measurement invariance available from cached MICOM.')

const staleOverview = await micomCache.resolveMicomOverviewForMgaCache({
  cache,
  payload: { ...payload, datasetPath: 'C:/data/changed.csv' },
  graphSignature: 'graph-v1',
  runConfiguralPrecheck: async () => {
    throw new Error('precheck should not run for mismatched signatures')
  },
})
assert.deepEqual(staleOverview, micomCache.MICOM_MGA_NOT_RUN_OVERVIEW)

const mgaResults = {
  method: 'MGA',
  overview: {
    setup: [
      { Metric: 'Seed', Value: '123' },
      { Metric: 'MICOM', Value: 'MICOM was not run for this analysis. Interpret results well.' },
    ],
    descriptives: [],
  },
}
const attachedResults = micomCache.attachMicomOverviewToMgaResults(mgaResults, validOverview)
assert.equal(attachedResults.micomOverview.message, validOverview.message)
assert.equal(
  attachedResults.overview.setup.find((row) => row.Metric === 'MICOM')?.Value,
  validOverview.message,
)

const persisted = micomCache.putMicomCacheInWorkspaceList(
  [{ id: 'ws-1', children: [{ id: 'm-1', type: 'model', state: { constructs: [], paths: [] } }] }],
  'ws-1',
  'm-1',
  cache,
)
assert.deepEqual(persisted.workspace.children[0].state.micomCache, cache)
assert.deepEqual(persisted.workspaces[0].children[0].state.micomCache, cache)

assert.match(
  modelCanvasSource,
  /createMicomCacheEntry[\s\S]*resolveMicomOverviewForMgaCache[\s\S]*attachMicomOverviewToMgaResults[\s\S]*putMicomCacheInWorkspaceList/,
  'ModelCanvas should import MICOM cache helpers.',
)
assert.match(
  modelCanvasSource,
  /handlePermutationConfiguralPrecheck[\s\S]*createMicomCacheEntry\([\s\S]*persistMicomCacheForCurrentModel/,
  'ModelCanvas should cache step-one MICOM configural precheck results.',
)
assert.match(
  modelCanvasSource,
  /handleRunPermutationAnalysis[\s\S]*createMicomCacheEntry\([\s\S]*persistSnapshotForAnalysis\([\s\S]*micomCache/,
  'ModelCanvas should cache full MICOM permutation results with the model.',
)
assert.match(
  modelCanvasSource,
  /handleRunMultiGroupAnalysis[\s\S]*resolveMicomOverviewForMgaCache\([\s\S]*runPermutationConfiguralPrecheck[\s\S]*attachMicomOverviewToMgaResults/,
  'ModelCanvas should silently validate cached MICOM before attaching it to MGA overview results.',
)

assert.match(
  resultsViewSource,
  /createMicomCacheEntry[\s\S]*resolveMicomOverviewForMgaCache[\s\S]*attachMicomOverviewToMgaResults[\s\S]*putMicomCacheInWorkspaceList/,
  'ResultsView should import MICOM cache helpers.',
)
assert.match(
  resultsViewSource,
  /handlePermutationConfiguralPrecheckFromResults[\s\S]*createMicomCacheEntry\([\s\S]*persistMicomCacheToWorkspace/,
  'ResultsView should cache step-one MICOM configural precheck results.',
)
assert.match(
  resultsViewSource,
  /handleRunPermutationFromResults[\s\S]*createMicomCacheEntry\([\s\S]*persistResultsToWorkspace\([\s\S]*micomCache/,
  'ResultsView should cache full MICOM permutation results with the model.',
)
assert.match(
  resultsViewSource,
  /handleRunMultiGroupFromResults[\s\S]*resolveMicomOverviewForMgaCache\([\s\S]*runPermutationConfiguralPrecheck[\s\S]*attachMicomOverviewToMgaResults/,
  'ResultsView should silently validate cached MICOM before attaching it to MGA overview results.',
)

console.log('PASS MICOM MGA workspace cache contract')
