import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function importRequired(relativePath) {
  try {
    return await import(relativePath)
  } catch (error) {
    assert.fail(`Required module ${relativePath} could not be imported: ${error?.message || error}`)
  }
}

const analysisSessions = await importRequired('../src/utils/analysisSessions.ts')
const modelPromotion = await importRequired('../src/utils/modelPromotion.ts')

const {
  clearAllAnalysisSessions,
  clearTemporaryAnalysisSessions,
  deleteAnalysisSession,
  getAnalysisSession,
  setAnalysisSession,
  updateAnalysisSession,
} = analysisSessions

clearAllAnalysisSessions()
setAnalysisSession('temp-model-one', {
  mode: 'pls-sem',
  results: { r2: 0.71 },
  modelSnapshot: { constructs: [{ id: 'c1' }], paths: [] },
})
setAnalysisSession('m-permanent', {
  mode: 'bootstrap',
  results: { samples: 500 },
  modelSnapshot: { constructs: [{ id: 'c2' }], paths: [] },
})

updateAnalysisSession('temp-model-one', (previous) => ({
  ...previous,
  diagramBaseResults: { paths: [0.42] },
}))
assert.deepEqual(getAnalysisSession('temp-model-one')?.diagramBaseResults, { paths: [0.42] })

clearTemporaryAnalysisSessions()
assert.equal(getAnalysisSession('temp-model-one'), undefined, 'Home cleanup must destroy temporary analysis sessions')
assert.equal(getAnalysisSession('m-permanent')?.mode, 'bootstrap', 'Home cleanup must not erase unrelated permanent sessions')
assert.equal(deleteAnalysisSession('m-permanent'), true)
assert.equal(getAnalysisSession('m-permanent'), undefined)

const sourceModel = {
  id: 'temp-model-source',
  name: 'Source — Temporary.hbe',
  type: 'model',
  badge: 'Calculated',
  sourceModelId: 'm-source',
  sourceWorkspaceId: 'ws-source',
  linkedDatasetId: 'ds-current',
  meta: 'Temporary experimental model copy',
  state: {
    constructs: [{ id: 'old', name: 'Old construct' }],
    paths: [],
    preferredLatentShape: 'hexagon',
    algorithmSettings: { weighting: 'path' },
    analysisSettings: { plspredict: { folds: 10 } },
    analysis: { mode: 'pls-sem', results: { r2: 0.71 } },
    basePlsAnalysis: { results: { r2: 0.71 } },
    diagramBaseResults: { paths: [0.42] },
    transientResults: { temporary: true },
    micomCache: { result: 'cached' },
  },
}
const currentSnapshot = {
  constructs: [{ id: 'current', name: 'Current construct' }],
  paths: [{ id: 'p1', from: 'current', to: 'outcome' }],
  preferredLatentShape: 'oval',
}

const promoted = modelPromotion.buildPermanentModelFromSource({
  sourceModel,
  snapshot: currentSnapshot,
  modelId: 'm-promoted',
  name: 'Promoted model',
  nowIso: '2026-08-21T12:00:00.000Z',
})

assert.equal(promoted.id, 'm-promoted')
assert.equal(promoted.name, 'Promoted model.hbe')
assert.equal(promoted.badge, 'Draft', 'Saving the model alone must not mark transient results as permanent')
assert.equal(promoted.linkedDatasetId, 'ds-current')
assert.deepEqual(promoted.state.constructs, currentSnapshot.constructs)
assert.deepEqual(promoted.state.paths, currentSnapshot.paths)
assert.equal(promoted.state.preferredLatentShape, 'oval')
assert.deepEqual(promoted.state.algorithmSettings, { weighting: 'path' })
assert.deepEqual(promoted.state.analysisSettings, { plspredict: { folds: 10 } })
assert.equal('sourceModelId' in promoted, false)
assert.equal('sourceWorkspaceId' in promoted, false)
assert.equal(promoted.meta, undefined)
for (const transientKey of ['analysis', 'basePlsAnalysis', 'diagramBaseResults', 'transientResults', 'micomCache']) {
  assert.equal(transientKey in promoted.state, false, `${transientKey} must not be serialized by Save As`)
}
assert.equal(sourceModel.state.constructs[0].id, 'old', 'Promotion must not mutate its source')

const workspaces = [{
  id: 'ws-source',
  name: 'Source.metisws',
  color: '#123456',
  expanded: true,
  children: [],
}]
let failedSaveCalls = 0
await assert.rejects(
  modelPromotion.persistModelAs({
    workspaces,
    sourceModel,
    snapshot: currentSnapshot,
    name: 'Failed promotion',
    targetWorkspaceId: 'ws-source',
    api: {
      saveWorkspace: async () => {
        failedSaveCalls += 1
        return { success: false, error: 'disk full' }
      },
    },
  }),
  /disk full/,
)
assert.equal(failedSaveCalls, 1)
assert.equal(workspaces[0].children.length, 0, 'A failed save must not mutate the caller workspace')

await assert.rejects(
  modelPromotion.persistModelAs({
    workspaces,
    sourceModel,
    snapshot: currentSnapshot,
    name: 'Unavailable persistence',
    targetWorkspaceId: 'ws-source',
    api: {},
  }),
  /persistence is unavailable/i,
  'Promotion must not publish an in-memory model when disk persistence is unavailable',
)

let unsafeCreateCalls = 0
await assert.rejects(
  modelPromotion.persistModelAs({
    workspaces,
    sourceModel,
    snapshot: currentSnapshot,
    name: 'Unsafe new workspace',
    targetWorkspaceId: 'new',
    newWorkspaceData: { name: 'Unsafe', color: '#abcdef' },
    api: {
      createWorkspace: async () => {
        unsafeCreateCalls += 1
        return { success: true, path: 'unsafe.metisws' }
      },
      saveWorkspace: async () => ({ success: false, error: 'disk full' }),
    },
  }),
  /rollback is unavailable/i,
)
assert.equal(unsafeCreateCalls, 0, 'A new workspace must not be created when failed-save rollback is unavailable')

let rollbackCalls = 0
await assert.rejects(
  modelPromotion.persistModelAs({
    workspaces,
    sourceModel,
    snapshot: currentSnapshot,
    name: 'Rollback failure',
    targetWorkspaceId: 'new',
    newWorkspaceData: { name: 'Rollback', color: '#abcdef' },
    api: {
      createWorkspace: async (workspace) => ({ success: true, path: `${workspace.id}.metisws` }),
      saveWorkspace: async () => ({ success: false, error: 'disk full' }),
      deleteWorkspace: async () => {
        rollbackCalls += 1
        return { success: false, error: 'file locked' }
      },
    },
  }),
  /rollback failed.*file locked/i,
)
assert.equal(rollbackCalls, 1, 'A failed new-workspace save must attempt exactly one verified rollback')

let persistedWorkspace = null
const successful = await modelPromotion.persistModelAs({
  workspaces,
  sourceModel,
  snapshot: currentSnapshot,
  name: 'Successful promotion',
  targetWorkspaceId: 'ws-source',
  api: {
    saveWorkspace: async (workspace) => {
      persistedWorkspace = workspace
      return { success: true }
    },
  },
  buildAdditionalChildren: (model) => [{
    id: 'r-saved',
    name: 'Saved result',
    type: 'result',
    linkedModelId: model.id,
  }],
})
assert.equal(persistedWorkspace.children.length, 2, 'Model and explicit result must be persisted atomically')
assert.equal(successful.workspace.children.length, 2)
assert.equal(successful.additionalChildren[0].linkedModelId, successful.model.id)
assert.equal(workspaces[0].children.length, 0, 'Successful promotion must return new state without mutating input')

const linkedDataset = {
  id: 'ds-current',
  name: 'Analysis data',
  type: 'dataset',
  filePath: 'analysis.csv',
  headers: ['x', 'y'],
}
const crossWorkspacePromotion = await modelPromotion.persistModelAs({
  workspaces: [
    { ...workspaces[0], children: [linkedDataset] },
    { id: 'ws-target', name: 'Target.metisws', color: '#654321', expanded: true, children: [] },
  ],
  sourceModel,
  snapshot: currentSnapshot,
  name: 'Cross-workspace model',
  targetWorkspaceId: 'ws-target',
  api: { saveWorkspace: async () => ({ success: true }) },
})
assert.equal(crossWorkspacePromotion.model.linkedDatasetId, linkedDataset.id)
assert.equal(
  crossWorkspacePromotion.workspace.children.filter((child) => child.type === 'dataset' && child.id === linkedDataset.id).length,
  1,
  'Cross-workspace promotion must copy the linked dataset transactionally with the model',
)

const modelCanvasSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const resultsViewSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')
const datasetManagerSource = await fs.readFile(path.join(workspaceRoot, 'src/components/DatasetManagerModal.tsx'), 'utf8')
const appSource = await fs.readFile(path.join(workspaceRoot, 'src/App.tsx'), 'utf8')
const electronMainSource = await fs.readFile(path.join(workspaceRoot, 'electron/main.ts'), 'utf8')

for (const forbiddenWrite of [
  "writeSharedStorageValue('canvas-model'",
  "writeSharedStorageValue('analysis-mode'",
  "writeSharedStorageValue('analysis-results'",
  "writeSharedStorageValue('analysis-results-for-diagram'",
  "writeSharedStorageValue('results-canvas-model'",
]) {
  assert.equal(modelCanvasSource.includes(forbiddenWrite), false, `ModelCanvas must not persist transient data through ${forbiddenWrite}`)
  assert.equal(resultsViewSource.includes(forbiddenWrite), false, `ResultsView must not persist transient data through ${forbiddenWrite}`)
}

const persistAnalysisBody = modelCanvasSource.match(/const persistSnapshotForAnalysis[\s\S]*?\n  }, \[[^\]]+\]\)/)?.[0] ?? ''
assert.ok(persistAnalysisBody, 'ModelCanvas analysis-session function must be present')
assert.doesNotMatch(persistAnalysisBody, /writeWorkspaceClientCache|saveWorkspace|setWorkspaces/, 'Running analysis must not persist a workspace')
assert.match(modelCanvasSource, /persistModelAs/, 'ModelCanvas Save As must use the shared transactional promotion workflow')
assert.match(
  modelCanvasSource,
  /isTemporaryModel && !temporaryModelSession[\s\S]*?navigate\('\/', \{ replace: true \}\)/,
  'A stale temporary canvas route after refresh must return Home instead of reconstructing a blank model',
)
assert.match(
  modelCanvasSource,
  /if \(isTemporaryModel\) \{\s*setTemporaryDatasetSnapshot\(snapshot\)\s*return\s*\}/,
  'Hydrating a temporary model dataset must stay in component memory instead of updating the workspace',
)
assert.match(
  modelCanvasSource,
  /if \(!isTemporaryModel \|\| !modelId\) return\s*updateTemporaryModelSession\(modelId,[\s\S]*?preferredLatentShape/,
  'Temporary visual preferences must be written back to the volatile registry for route navigation',
)
assert.match(resultsViewSource, /persistModelAs/, 'Save Results promotion must use the shared transactional promotion workflow')
assert.match(
  resultsViewSource,
  /snapshot:\s*analysisModelSnapshot[\s\S]*modelSnapshot:\s*analysisModelSnapshot/,
  'Save Results promotion must use the immutable calculation-time snapshot, not mutable diagram layout state',
)
assert.match(resultsViewSource, /saveWorkspaceOrThrow/, 'Permanent Save Results must require a confirmed disk save before publishing UI/cache state')
assert.match(
  resultsViewSource,
  /isTemporaryModelId\(modelId\) && !getTemporaryModelSession\(modelId\)[\s\S]*?navigate\('\/', \{ replace: true \}\)/,
  'A stale temporary results route after refresh must return Home',
)
assert.match(
  resultsViewSource,
  /linkedDatasetId:\s*getAnalysisSession\(modelId\)\?\.linkedDatasetId\s*\?\?\s*tempSession\.linkedDatasetId/,
  'Save Results promotion must preserve the dataset that produced the displayed analysis',
)
assert.match(datasetManagerSource, /updateTemporaryModelSession/, 'Dataset selection must update temporary session state')
assert.match(datasetManagerSource, /if \(isTemporaryModelId\(modelId\)\)/, 'Dataset selection must branch before permanent workspace persistence')
assert.match(
  datasetManagerSource,
  /onContextMenu=\{isTemporaryContext \? undefined : \(event\) => openDatasetMenu/,
  'Temporary model dataset selection must not expose workspace-mutating dataset actions',
)
assert.match(appSource, /clearTemporaryAnalysisSessions/, 'Home cleanup must remove temporary analysis sessions')
assert.match(
  appSource,
  /source === 'model-canvas' && isTemporaryModelId\(linkedModelId\)[\s\S]*?return/,
  'The shared dataset-import boundary must reject every import associated with a temporary model',
)
assert.match(
  appSource,
  /const handleUseSampleDataset = async \(\) => \{\s*if \(currentScreen === 'canvas' && isTemporaryModelId\(currentCanvasModelId\)\)[\s\S]*?return[\s\S]*?api\.useSampleDataset/,
  'Sample dataset installation must be rejected before invoking the Electron write path for a temporary model',
)
assert.match(appSource, /lastCanvasPathRef\.current = ''/, 'Home cleanup must remove stale temporary return routes')
assert.match(appSource, /preferencesReturnLocationRef\.current = null/, 'Home cleanup must remove Preferences return references into destroyed temporary sessions')
assert.match(
  electronMainSource,
  /for \(const dataset of datasetChildren\)[\s\S]*?if \(!zip\.file\(datasetZipPath\)\)[\s\S]*?getTrustedDatasetRoots\(\)[\s\S]*?fs\.promises\.readFile\(sourcePath\)[\s\S]*?zip\.file\(datasetZipPath, sourceBuffer\)/,
  'Workspace save must embed copied dataset bytes that are missing from the destination ZIP',
)
assert.match(
  electronMainSource,
  /function buildPersistedWorkspaceManifest[\s\S]*?datasetTempPath:[\s\S]*?absolutePath:[\s\S]*?return cleanChild/,
  'Persisted workspace manifests must strip transient dataset paths',
)

console.log('PASS temporary persistence boundary behavior')
