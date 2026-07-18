import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const mainSource = await fs.readFile(path.join(workspaceRoot, 'electron/main.ts'), 'utf8')

assert.match(
  mainSource,
  /ipcMain\.handle\('workspace:list'[\s\S]*const ws = await readAdaFile\(fullPath\)/,
  'Workspace startup listing should extract embedded datasets so reopened workspaces have usable datasetTempPath values.',
)

assert.doesNotMatch(
  mainSource,
  /ipcMain\.handle\('workspace:list'[\s\S]*readAdaFile\(fullPath,\s*false\)/,
  'Workspace startup listing should not skip dataset extraction because analysis modals need rows after app restart.',
)

console.log('PASS workspace startup dataset extraction static contract')
