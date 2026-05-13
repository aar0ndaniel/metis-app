import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const appSource = await fs.readFile(path.join(workspaceRoot, 'src/App.tsx'), 'utf8')
const importStep1Source = await fs.readFile(path.join(workspaceRoot, 'src/pages/ImportStep1.tsx'), 'utf8')
const workspaceHomeSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/WorkspaceHome.tsx'), 'utf8')
const modelCanvasSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const plumberSource = await fs.readFile(path.join(workspaceRoot, 'r-api/plumber.R'), 'utf8')

await assert.rejects(
  fs.access(path.join(workspaceRoot, 'src/pages/ImportStep2.tsx')),
  /ENOENT/,
  'ImportStep2 source should be removed so dead descriptive-import code cannot be bundled or reintroduced.'
)

assert.doesNotMatch(
  appSource,
  /import\s+ImportStep2\s+from\s+['"]\.\/pages\/ImportStep2['"]/,
  'App should no longer import ImportStep2 for the launch import flow.'
)

assert.doesNotMatch(
  appSource,
  /<Route\s+path=["']\/import\/step2["']/,
  'App should no longer route imports through ImportStep2.'
)

assert.doesNotMatch(
  importStep1Source,
  /navigate\(\s*['"]\/import\/step2['"]/,
  'ImportStep1 should finish import directly instead of navigating to ImportStep2.'
)

assert.doesNotMatch(
  modelCanvasSource,
  /navigate\(\s*['"]\/import\/step2['"]/,
  'ModelCanvas dataset manager should open datasets in DataView, not ImportStep2.'
)

assert.match(
  importStep1Source,
  /persistDatasetToWorkspace/,
  'ImportStep1 should persist the dataset before opening DataView.'
)

assert.match(
  importStep1Source,
  /inferVariableTypesFromRows/,
  'ImportStep1 should keep lightweight MET/CAT detection without requiring descriptive import stats.'
)

assert.match(
  importStep1Source,
  /navigate\(`\/dataview\/\$\{targetWorkspaceId\}\/\$\{resolvedDatasetId\}`/,
  'ImportStep1 should navigate straight to DataView after importing into the selected workspace.'
)

assert.match(
  appSource,
  /<Route\s+path=["']\/import\/step1["'][\s\S]*?<ImportStep1\s+workspaces=\{workspaces\}\s+activeWorkspaceId=\{activeWorkspaceId\}/,
  'App should pass loaded workspaces into ImportStep1 so users can choose the import destination.'
)

assert.match(
  importStep1Source,
  /type\s+ImportStep1Props[\s\S]*workspaces:\s*Workspace\[\][\s\S]*activeWorkspaceId:\s*string/,
  'ImportStep1 should accept workspace options and the active workspace id.'
)

assert.match(
  importStep1Source,
  /selectedWorkspaceId[\s\S]*setSelectedWorkspaceId/,
  'ImportStep1 should track the selected workspace independently from the navigation state.'
)

assert.doesNotMatch(
  importStep1Source,
  /\{workspaceName\s*\|\|\s*'\(No workspace\)'\}/,
  'ImportStep1 should not render a fixed "(No workspace)" label when workspace choices are available.'
)

const sidebarDatasetMenuMatch = workspaceHomeSource.match(/menu\.kind === 'dataset'[\s\S]*?<div style=\{\{ height: 1/)
assert.ok(sidebarDatasetMenuMatch, 'Expected to find the sidebar dataset context menu block.')
const sidebarDatasetMenu = sidebarDatasetMenuMatch[0]

assert.match(sidebarDatasetMenu, />Open</, 'Sidebar dataset context menu should label the primary action Open.')
assert.doesNotMatch(sidebarDatasetMenu, />View</, 'Sidebar dataset context menu should not offer a separate View action.')
assert.doesNotMatch(sidebarDatasetMenu, />Edit</, 'Sidebar dataset context menu should not offer a separate Edit action.')

const cardDatasetMenuMatch = workspaceHomeSource.match(/openDatasetMenuId === dataset\.id[\s\S]*?<span style=\{\{ color: 'var\(--color-text-secondary\)'[\s\S]*?>Manage<\/span>/)
assert.ok(cardDatasetMenuMatch, 'Expected to find the dataset card overflow menu block.')
const cardDatasetMenu = cardDatasetMenuMatch[0]

assert.match(cardDatasetMenu, />Open</, 'Dataset card overflow menu should label the primary action Open.')
assert.doesNotMatch(cardDatasetMenu, />View</, 'Dataset card overflow menu should not offer a separate View action.')
assert.doesNotMatch(cardDatasetMenu, />Edit</, 'Dataset card overflow menu should not offer a separate Edit action.')

assert.match(
  plumberSource,
  /Sys\.getenv\("METIS_MAX_PLS_CORE_CACHE_ENTRIES",\s*"2"\)/,
  'R backend should default the PLS core cache to 2 entries for lower RAM use.'
)

assert.match(
  plumberSource,
  /reserve\s*<-\s*if\s*\(\s*detected\s*>\s*9L\s*\)\s*2L\s*else\s*1L[\s\S]*?requested\s*<-\s*detected\s*-\s*reserve/,
  'R backend should reserve two cores above 9 detected cores and one core at 9 or fewer detected cores.'
)

console.log('PASS launch dataset flow static guards')
