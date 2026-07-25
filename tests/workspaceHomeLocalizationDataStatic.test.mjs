import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'src/pages/WorkspaceHome.tsx'), 'utf8')

function countMatches(pattern) {
  return [...source.matchAll(pattern)].length
}

assert.ok(
  countMatches(/data-i18n-skip[\s\S]{0,520}\{getWorkspaceLabel\(ws\.name\)\}/g) >= 2,
  'Workspace names in the sidebar should be marked as user data so localization does not translate them.',
)

assert.match(
  source,
  /data-i18n-skip=\{activeWorkspace \? true : undefined\}[\s\S]{0,320}\{activeWorkspace \? getWorkspaceLabel\(activeWorkspace\.name\)/,
  'Active workspace header should protect the user-created workspace name.',
)

assert.ok(
  countMatches(/data-i18n-skip[\s\S]{0,800}\{getModelLabel\((?:child|model)\.name\)\}/g) >= 3,
  'Model names should be marked as user data while coded status/date/action labels remain translatable.',
)

assert.match(
  source,
  /data-i18n-skip[\s\S]{0,220}\{result\.name\}/,
  'Saved result names should be marked as user data.',
)

assert.match(
  source,
  /data-i18n-skip[\s\S]{0,220}\{dataset\.name\}/,
  'Dataset names should be marked as user data.',
)

assert.match(
  source,
  /<strong data-i18n-skip>\{pendingDelete\.name\}<\/strong>/,
  'Delete confirmation should protect the deleted item name while translating the warning sentence.',
)

console.log('PASS workspace home localization data static coverage')
