import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'src/components/PreferencesModal.tsx'), 'utf8')

assert.doesNotMatch(
  source,
  /aboutRow\('UI'/,
  'Full Preferences About should not include a UI row.',
)

assert.doesNotMatch(
  source,
  /\['UI',\s*'Electron \+ React \+ TypeScript'/,
  'Compact Preferences About should not include a UI/tech-stack row.',
)

assert.doesNotMatch(
  source,
  /Desktop interface stack\./,
  'Preferences should not describe the desktop UI stack.',
)

assert.doesNotMatch(
  source,
  /Electron \+ React \+ TypeScript/,
  'Preferences should not show Electron/React/TypeScript implementation details.',
)

console.log('PASS preferences about static coverage')
