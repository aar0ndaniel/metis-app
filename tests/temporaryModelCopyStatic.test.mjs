import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

// Test 1: Check temporaryModels.ts exists and test its runtime logic
const tempModelsModulePath = path.join(workspaceRoot, 'src/utils/temporaryModels.ts')
let tempModelsSource
try {
  tempModelsSource = await fs.readFile(tempModelsModulePath, 'utf8')
} catch (e) {
  assert.fail(`src/utils/temporaryModels.ts must exist: ${e.message}`)
}

assert.match(tempModelsSource, /export interface TemporaryModelSession/, 'Should export TemporaryModelSession interface')
assert.match(tempModelsSource, /export function createTemporaryModelSession/, 'Should export createTemporaryModelSession')
assert.match(tempModelsSource, /export function getTemporaryModelSession/, 'Should export getTemporaryModelSession')
assert.match(tempModelsSource, /export function setTemporaryModelSession/, 'Should export setTemporaryModelSession')
assert.match(tempModelsSource, /export function updateTemporaryModelSession/, 'Should export updateTemporaryModelSession')
assert.match(tempModelsSource, /export function deleteTemporaryModelSession/, 'Should export deleteTemporaryModelSession')
assert.match(tempModelsSource, /export function clearAllTemporaryModelSessions/, 'Should export clearAllTemporaryModelSessions')
assert.match(tempModelsSource, /export function isTemporaryModelId/, 'Should export isTemporaryModelId')

// Test 2: Check WorkspaceHome.tsx has Temporary Copy menu item
const workspaceHomeSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/WorkspaceHome.tsx'), 'utf8')

assert.match(workspaceHomeSource, /Copy[\s\S]*Temporary Copy/, 'WorkspaceHome should include Temporary Copy action with Copy icon')
assert.match(workspaceHomeSource, /createTemporaryModelSession/, 'WorkspaceHome should call createTemporaryModelSession')
assert.match(workspaceHomeSource, /clearAllTemporaryModelSessions/, 'WorkspaceHome should clear temporary sessions on home boundary')

// Verify order: Temporary Copy before Rename
const tempCopyIndex = workspaceHomeSource.indexOf('Temporary Copy')
const renameIndex = workspaceHomeSource.indexOf('Rename</span>', tempCopyIndex > 0 ? tempCopyIndex - 200 : 0)
assert.ok(tempCopyIndex !== -1, 'Temporary Copy must be present in WorkspaceHome')
assert.ok(tempCopyIndex < renameIndex, 'Temporary Copy must appear before Rename in the model context menu')

// Test 3: Check ModelCanvas.tsx has persistence guards and Save As promotion
const modelCanvasSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')

assert.match(modelCanvasSource, /isTemporaryModelId/, 'ModelCanvas should check isTemporaryModelId')
assert.match(modelCanvasSource, /getTemporaryModelSession/, 'ModelCanvas should resolve temporary session from registry')
assert.match(modelCanvasSource, /isTemporaryModel/, 'ModelCanvas should define isTemporaryModel guard')

// Test 4: Check ResultsView.tsx transient results and chained Save Results
const resultsViewSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')

assert.match(resultsViewSource, /isTemporaryModelId/, 'ResultsView should detect temporary models')
assert.doesNotMatch(resultsViewSource, /setAnalysisResults\(result\.results\)[\s\S]*persistResultsToWorkspace\(\{[\s\S]*mode:\s*'plspredict'/, 'ResultsView should not automatically persist plspredict results to workspace')

console.log('PASS: temporaryModelCopyStatic tests')
