import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const source = await fs.readFile(path.join(workspaceRoot, 'src/pages/WorkspaceHome.tsx'), 'utf8')

assert.match(
  source,
  /function\s+workspaceActiveBackground\s*\(\s*color:\s*string\s*\)/,
  'Workspace home should define a reusable active-folder background style.'
)

assert.match(
  source,
  /workspaceActiveBackground\(ws\.color\)[\s\S]*:\s*'var\(--color-workspace-expanded\)'/,
  'Expanded active folders should use folder color while non-active expanded folders stay on neutral workspace token.'
)

assert.match(
  source,
  /background:\s*isActive\s*\?\s*workspaceActiveHeaderBackground\(ws\.color\)\s*:\s*'transparent'/,
  'Expanded active folder headers should get a subtle folder-color header tint.'
)

assert.match(
  source,
  /border:\s*isActive\s*\?\s*workspaceActiveBorder\(ws\.color\)\s*:\s*'1px solid var\(--color-border\)'/,
  'Expanded active folders should get a subtle folder-color border.'
)

assert.match(
  source,
  /background:\s*isActive\s*\?\s*workspaceActiveBackground\(ws\.color\)\s*:[\s\S]*hoveredId === ws\.id/,
  'Collapsed active folders should use the same folder-color active background.'
)

assert.match(
  source,
  /boxShadow:\s*isActive\s*\?\s*'inset 0 1px 0 rgba\(255,255,255,0\.05\)'/,
  'Active folder rows should keep a subtle top highlight without becoming bright.'
)

console.log('PASS workspace home active folder style contract')
