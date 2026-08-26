import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const {
  isTemporaryModelId,
  createTemporaryModelSession,
  getTemporaryModelSession,
  updateTemporaryModelSession,
  deleteTemporaryModelSession,
  clearAllTemporaryModelSessions,
  getAllTemporaryModelSessions,
} = await import('../src/utils/temporaryModels.ts')

console.log('Running temporary model copy workflow integration tests...')

// 1. Creation Test
clearAllTemporaryModelSessions()
const originalModel = {
  id: 'm-orig-100',
  name: 'Customer Loyalty.hbe',
  type: 'model',
  badge: 'Calculated',
  linkedDatasetId: 'ds-100',
  state: {
    constructs: [
      { id: 'c1', name: 'Quality', x: 50, y: 50 },
      { id: 'c2', name: 'Satisfaction', x: 200, y: 50 },
    ],
    paths: [{ from: 'c1', to: 'c2' }],
    preferredLatentShape: 'circle',
    basePlsAnalysis: { results: { r2: 0.65 } },
  },
}

const originalWorkspace = {
  id: 'ws-orig-100',
  name: 'Research 2026.metisws',
  color: '#2ecc71',
  expanded: true,
  children: [originalModel],
}

const session = createTemporaryModelSession(originalModel, originalWorkspace)

assert.ok(isTemporaryModelId(session.id), 'Session id must be recognized as temporary')
assert.equal(session.sourceModelId, originalModel.id, 'Source model id must match')
assert.equal(session.sourceWorkspaceId, originalWorkspace.id, 'Source workspace id must match')
assert.equal(session.name, 'Customer Loyalty — Temporary.hbe')
assert.equal(originalWorkspace.children.length, 1, 'Original workspace children must not be modified')

// 2. State Independence and Modification
session.state.constructs.push({ id: 'c3', name: 'Retention', x: 350, y: 50 })
assert.equal(session.state.constructs.length, 3)
assert.equal(originalModel.state.constructs.length, 2, 'Original model constructs must remain unaffected')

// 3. Registry update
updateTemporaryModelSession(session.id, (prev) => ({
  ...prev,
  state: {
    ...prev.state,
    paths: [...prev.state.paths, { from: 'c2', to: 'c3' }],
  },
}))

const retrieved = getTemporaryModelSession(session.id)
assert.equal(retrieved?.state.paths.length, 2)

// 4. Destruction on Home navigation
clearAllTemporaryModelSessions()
assert.equal(getTemporaryModelSession(session.id), undefined, 'Temporary session must be completely destroyed')
assert.equal(getAllTemporaryModelSessions().length, 0)

console.log('PASS: temporaryModelCopyWorkflow integration tests')
