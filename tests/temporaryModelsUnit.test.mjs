import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

// Dynamic import of transpiled / ts-node or simulate
const {
  isTemporaryModelId,
  createTemporaryModelSession,
  getTemporaryModelSession,
  updateTemporaryModelSession,
  deleteTemporaryModelSession,
  clearAllTemporaryModelSessions,
  getAllTemporaryModelSessions
} = await import('../src/utils/temporaryModels.ts')

console.log('Testing temporaryModels.ts utility functions...')

// Test isTemporaryModelId
assert.equal(isTemporaryModelId('temp-model-12345'), true)
assert.equal(isTemporaryModelId('temp-abc'), false, 'Only the reserved temporary model prefix may bypass permanent persistence')
assert.equal(isTemporaryModelId('m-12345'), false)
assert.equal(isTemporaryModelId(null), false)
assert.equal(isTemporaryModelId(undefined), false)
assert.equal(isTemporaryModelId(''), false)

// Test createTemporaryModelSession
clearAllTemporaryModelSessions()
const dummySourceModel = {
  id: 'm-original-1',
  name: 'Corporate Reputation.hbe',
  type: 'model',
  badge: 'Calculated',
  linkedDatasetId: 'ds-1',
  state: {
    constructs: [
      { id: 'c1', name: 'Image', x: 100, y: 150 },
      { id: 'c2', name: 'Value', x: 300, y: 150 },
    ],
    paths: [
      { from: 'c1', to: 'c2' },
    ],
    preferredLatentShape: 'circle',
    canvasSettings: { gridSize: 24, guides: ['center'] },
    analysis: { mode: 'pls-sem', results: { shouldNotCopy: true } },
    basePlsAnalysis: { results: { r2: 0.5 } },
  },
}

const dummyWorkspace = {
  id: 'ws-1',
  name: 'Main Workspace.metisws',
  color: '#3498db',
  expanded: true,
  children: [dummySourceModel],
}

const session = createTemporaryModelSession(dummySourceModel, dummyWorkspace)

assert.ok(session.id.startsWith('temp-model-'))
assert.equal(session.sourceModelId, 'm-original-1')
assert.equal(session.sourceWorkspaceId, 'ws-1')
assert.equal(session.linkedDatasetId, 'ds-1')
assert.equal(session.name, 'Corporate Reputation — Temporary.hbe')
assert.equal(session.state.constructs.length, 2)
assert.equal(session.state.paths.length, 1)
assert.deepEqual(session.state.canvasSettings, { gridSize: 24, guides: ['center'] }, 'Unrecognized model-spec and layout fields must survive the temporary copy')
assert.equal('analysis' in session.state, false, 'A temporary copy must not inherit transient analysis history')
assert.equal(session.state.basePlsAnalysis, null, 'Should not duplicate previous base PLS calculations as permanent state')

// Test deep copy independence
session.state.constructs[0].name = 'Modified Image'
session.state.canvasSettings.guides.push('left')
assert.equal(dummySourceModel.state.constructs[0].name, 'Image', 'Source model constructs must remain unaffected')
assert.deepEqual(dummySourceModel.state.canvasSettings.guides, ['center'], 'Copied layout settings must not share references with the source model')

// Test retrieval
const fetched = getTemporaryModelSession(session.id)
assert.equal(fetched?.id, session.id)

// Test update
const updated = updateTemporaryModelSession(session.id, (prev) => ({
  ...prev,
  state: {
    ...prev.state,
    constructs: [...prev.state.constructs, { id: 'c3', name: 'Loyalty', x: 500, y: 150 }],
  },
}))
assert.equal(updated?.state.constructs.length, 3)
assert.equal(getTemporaryModelSession(session.id)?.state.constructs.length, 3)

// Test getAll
assert.equal(getAllTemporaryModelSessions().length, 1)

// Test delete
deleteTemporaryModelSession(session.id)
assert.equal(getTemporaryModelSession(session.id), undefined)
assert.equal(getAllTemporaryModelSessions().length, 0)

console.log('PASS: temporaryModels.ts unit tests')
