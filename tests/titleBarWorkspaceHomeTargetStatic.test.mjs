import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const appSource = await fs.readFile(path.join(workspaceRoot, 'src/App.tsx'), 'utf8')
const modelCanvasSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')

assert.match(
  appSource,
  /const returnToWorkspaceHome = useCallback\(\(preferredWorkspaceId\?: string \| null\) =>[\s\S]*resolveWorkspaceForAction\(workspaces,\s*preferredWorkspaceId \|\| currentCanvasModelId \|\| activeWorkspaceId\)[\s\S]*setActiveWorkspaceId\(targetWorkspace\.id\)[\s\S]*navigate\('\/'\)/,
  'App should resolve and activate the current model workspace before returning to Workspace Home.',
)

assert.match(
  appSource,
  /<ModelCanvas[\s\S]*onReturnHome=\{returnToWorkspaceHome\}/,
  'App should pass the workspace-aware home return callback into ModelCanvas.',
)

assert.match(
  modelCanvasSource,
  /onReturnHome:\s*\(workspaceId\?: string \| null\) => void/,
  'ModelCanvas props should include a workspace-aware home return callback.',
)

assert.match(
  modelCanvasSource,
  /const returnToWorkspaceHome = useCallback\(\(\) => \{\s*onReturnHome\(activeWs\?\.id \?\? null\)\s*\}, \[activeWs\?\.id, onReturnHome\]\)/,
  'ModelCanvas should return home through the App callback with the owning workspace id.',
)

assert.doesNotMatch(
  modelCanvasSource,
  /navigate\('\/'\)/,
  'ModelCanvas should not navigate directly to Workspace Home because App must preserve the owning workspace.',
)

console.log('PASS title bar workspace home target contract')
