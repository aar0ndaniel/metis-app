import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'src/pages/WorkspaceHome.tsx'), 'utf8')
const appSource = await fs.readFile(path.join(workspaceRoot, 'src/App.tsx'), 'utf8')
const datasetManagerSource = await fs.readFile(path.join(workspaceRoot, 'src/components/DatasetManagerModal.tsx'), 'utf8')

assert.match(source, /getSidebarDatasetSummary/, 'Sidebar should summarize datasets instead of listing every dataset child.')
assert.match(source, /datasets\.length === 1[\s\S]*datasets\[0\]\.name[\s\S]*`Datasets · \$\{datasets\.length\}`/, 'Sidebar dataset summary should show one dataset name or Datasets · N.')
assert.match(source, /getSidebarResultSummary/, 'Sidebar should summarize saved results instead of listing every result child.')
assert.match(source, /results\.length === 1[\s\S]*results\[0\]\.name[\s\S]*`Saved Results · \$\{results\.length\}`/, 'Sidebar result summary should show one result name or Saved Results · N.')
assert.match(source, /onClick=\{\(\) => openDatasetManager\(sidebarDatasets\[0\]\?\.id\)\}/, 'Dataset summary row should open Dataset Manager.')
assert.doesNotMatch(source, /onClick=\{\(\) => focusWorkspacePanel\(ws\.id, 'datasets'\)\}/, 'Dataset summary row should no longer only focus the Workspace Home dataset panel.')
assert.match(source, /focusWorkspacePanel\(ws\.id, 'results'\)/, 'Result summary row should focus and expand the Workspace Home saved results panel.')
assert.match(source, /setExpandedResultsByWorkspace[\s\S]*\[workspaceId\]: true/, 'Result summary focus should expand saved results.')
assert.match(source, /datasetsPanelRef[\s\S]*scrollIntoView/, 'Dataset panel focus should scroll the dataset panel into view.')
assert.match(source, /resultsPanelRef[\s\S]*scrollIntoView/, 'Result panel focus should scroll the saved results panel into view.')
assert.doesNotMatch(source, /ws\.children\.filter\(\(c\) => c\.type === 'dataset'\)\.map/, 'Sidebar should not render every dataset child as a row.')
assert.doesNotMatch(source, /ws\.children\.filter\(\(c\) => c\.type === 'result'\)\.map/, 'Sidebar should not render every result child as a row.')
assert.match(appSource, /function collapseWorkspaceFoldersForStartup/, 'App should normalize workspace folders closed on launch.')
assert.match(appSource, /expanded:\s*false/, 'Workspace launch normalization should close folders by default.')
assert.match(appSource, /setWorkspaces\(collapseWorkspaceFoldersForStartup\(migrated\)\)/, 'Disk-loaded workspaces should start collapsed.')
assert.match(datasetManagerSource, /isActive[\s\S]*Active/, 'Dataset Manager should show a readable Active marker for the active dataset.')
assert.doesNotMatch(datasetManagerSource, /isActive\s*\?[\s\S]*color-accent-rgb[\s\S]*:/, 'Active dataset should not add row-level accent styling.')
assert.doesNotMatch(datasetManagerSource, /CheckCircle/, 'Active dataset should use only an Active badge, not a check icon.')
assert.doesNotMatch(datasetManagerSource, /inset 3px 0 0 var\(--color-accent\)/, 'Active dataset should not use a left rail.')
assert.doesNotMatch(datasetManagerSource, /color="'var\(--color-danger\)'"/, 'Dataset Manager danger icons should use a valid theme color token.')

console.log('PASS workspace home compact sidebar contract')
