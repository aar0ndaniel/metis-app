import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const appSource = await fs.readFile(path.join(workspaceRoot, 'src/App.tsx'), 'utf8')
const workspaceHomeSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/WorkspaceHome.tsx'), 'utf8')

assert.match(
  appSource,
  /function\s+resolveWorkspaceForAction/,
  'App should resolve action targets when the active id is either a workspace id or a workspace child id.',
)

assert.match(
  appSource,
  /const\s+requestedWorkspaceId\s*=\s*e\.detail\?\.workspaceId[\s\S]*resolveWorkspaceForAction\(workspaces,\s*requestedWorkspaceId\s*\|\|\s*activeWorkspaceId\)/,
  'Import-picker actions should prefer an explicit workspace id and otherwise resolve child ids to their owning workspace.',
)

assert.doesNotMatch(
  appSource,
  /const\s+activeWs\s*=\s*workspaces\.find\(w\s*=>\s*w\.id\s*===\s*activeWorkspaceId\)/,
  'Workspace import actions should not look up only direct workspace ids because activeWorkspaceId may be a model or dataset id.',
)

assert.match(
  workspaceHomeSource,
  /openDatasetManager[\s\S]*setActiveId\(resolved\.workspace\.id\)/,
  'Opening the Dataset Manager from a dataset should keep the owning workspace active, not make the dataset id the app-level active id.',
)

assert.match(
  workspaceHomeSource,
  /window\.dispatchEvent\(new CustomEvent\('pls:open-import-picker'[\s\S]*workspaceId:\s*activeWorkspace\.id[\s\S]*workspaceName:\s*activeWorkspace\.name[\s\S]*workspacePath:\s*activeWorkspace\.path/,
  'Workspace Home browse actions should pass the selected workspace identity to the import picker.',
)

console.log('PASS workspace active import target contract')
