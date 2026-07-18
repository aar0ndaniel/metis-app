import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const appSource = await fs.readFile(path.join(workspaceRoot, 'src/App.tsx'), 'utf8')
const modelCanvasSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const titleBarSource = await fs.readFile(path.join(workspaceRoot, 'src/components/TitleBar.tsx'), 'utf8')

assert.match(
  appSource,
  /const returnToWorkspaceHome = useCallback\(\(preferredWorkspaceId\?: string \| null\) =>[\s\S]*resolveWorkspaceForAction\(workspaces,\s*preferredWorkspaceId \|\| currentCanvasModelId \|\| activeWorkspaceId\)[\s\S]*setActiveWorkspaceId\(targetWorkspace\.id\)[\s\S]*navigate\('\/'\)/,
  'App should resolve and activate the current model workspace before returning to Workspace Home.',
)

assert.match(
  appSource,
  /function resolveLoadedActiveWorkspaceId\(loadedWorkspaces: Workspace\[\], preferredId\?: string \| null\): string[\s\S]*resolveWorkspaceForAction\(loadedWorkspaces,\s*preferredId\)[\s\S]*return resolvedWorkspace\?\.id \?\? loadedWorkspaces\[0\]\?\.id \?\? ''/,
  'Workspace loading should preserve the active route/current model workspace when workspaces are refreshed.',
)

assert.doesNotMatch(
  appSource,
  /setActiveWorkspaceId\(migrated\[0\]\.id\)/,
  'Workspace loading should not blindly activate the first workspace because that can override the model canvas owner.',
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
  titleBarSource,
  /action:\s*'toggle-home-canvas'/,
  'TitleBar logo should use the shared toggle-home-canvas action.',
)

assert.match(
  modelCanvasSource,
  /const returnToWorkspaceHome = useCallback\(\(\) => \{\s*onReturnHome\(modelId \?\? activeWs\?\.id \?\? null\)\s*\}, \[activeWs\?\.id, modelId, onReturnHome\]\)/,
  'ModelCanvas should return home through App with the route model id first, so App resolves the owning workspace instead of a fallback active workspace.',
)

assert.doesNotMatch(
  modelCanvasSource,
  /navigate\('\/'\)/,
  'ModelCanvas should not navigate directly to Workspace Home because App must preserve the owning workspace.',
)

console.log('PASS title bar workspace home target contract')
