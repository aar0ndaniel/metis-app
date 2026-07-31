import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const titleBarSource = await fs.readFile(path.join(workspaceRoot, 'src/components/TitleBar.tsx'), 'utf8')
const appSource = await fs.readFile(path.join(workspaceRoot, 'src/App.tsx'), 'utf8')

test('App.tsx passes isPreferencesOpen={prefsOpen} to TitleBar', () => {
  assert.match(appSource, /<TitleBar[\s\S]*isPreferencesOpen=\{prefsOpen\}/)
})

test('TitleBar accepts isPreferencesOpen prop and guards toggleMenu and button clicks', () => {
  assert.match(titleBarSource, /isPreferencesOpen\?: boolean/)
  assert.match(titleBarSource, /if\s*\(isPreferencesOpen\)\s*\{\s*setOpenMenu\(null\)\s*\}/)
  assert.match(titleBarSource, /if\s*\(isPreferencesOpen\)\s*return/)
  assert.match(titleBarSource, /disabled=\{isPreferencesOpen\}/)
  assert.match(titleBarSource, /pointerEvents:\s*isPreferencesOpen\s*\?\s*'none'\s*:\s*'auto'/)
})

console.log('✔ titleBarPreferencesDisabledStatic.test.mjs passed!')
