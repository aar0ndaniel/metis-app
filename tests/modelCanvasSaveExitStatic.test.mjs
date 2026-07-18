import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')

assert.match(
  source,
  /function resolveModelSaveTarget\([\s\S]*modelId\?: string \| null[\s\S]*activeWorkspaceId\?: string \| null[\s\S]*workspace[\s\S]*model[\s\S]*\}/,
  'ModelCanvas should resolve save targets from current workspaces and the route model id, not only from possibly stale component variables.',
)

const saveFunction = source.slice(
  source.indexOf('const handleSave = async'),
  source.indexOf('const requestCloseModelTab', source.indexOf('const handleSave = async')),
)

assert.match(
  saveFunction,
  /const saveTarget = resolveModelSaveTarget\(workspaces,\s*modelId,\s*activeWorkspaceId\)/,
  'handleSave should compute a fresh save target before Save & Exit or Save & Close.',
)

assert.doesNotMatch(
  saveFunction,
  /if \(!activeWs \|\| !currentModel\)/,
  'handleSave should not silently fail from stale activeWs/currentModel values.',
)

assert.match(
  saveFunction,
  /const \{ workspace: saveWorkspace, model: saveModel \} = saveTarget/,
  'handleSave should use the resolved workspace and model for persistence.',
)

assert.match(
  source,
  /const saved = await handleSave\(\)[\s\S]*if \(!saved\) return[\s\S]*setShowExitModal\(false\)[\s\S]*pendingCloseTabId[\s\S]*onCloseModelTab\(closingId\)[\s\S]*returnToWorkspaceHome\(\)/,
  'Save & Close and Save & Exit should continue with tab close or workspace-home navigation after a successful save.',
)

console.log('PASS model canvas save-exit contract')
