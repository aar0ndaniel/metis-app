import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const titleBarSource = await fs.readFile(path.join(workspaceRoot, 'src/components/TitleBar.tsx'), 'utf8')
const preferencesSource = await fs.readFile(path.join(workspaceRoot, 'src/components/PreferencesModal.tsx'), 'utf8')

test('TitleBar container and dropdown menus enforce higher z-index than PreferencesModal overlay', () => {
  // Extract z-index from PreferencesModal backdrop (z-[90] or z-[100])
  const prefZMatch = preferencesSource.match(/z-\[(\d+)\]/)
  assert.ok(prefZMatch, 'PreferencesModal should define a z-index overlay')
  const prefZIndex = parseInt(prefZMatch[1], 10)

  // Extract z-indexes in TitleBar
  const titleBarZMatches = Array.from(titleBarSource.matchAll(/z-\[(\d+)\]/g)).map(m => parseInt(m[1], 10))
  assert.ok(titleBarZMatches.length > 0, 'TitleBar should specify explicit z-index classes')

  for (const zIndex of titleBarZMatches) {
    assert.ok(zIndex > prefZIndex, `TitleBar z-index (${zIndex}) must be higher than PreferencesModal z-index (${prefZIndex})`)
  }
})

test('TitleBar MenuDropdown container enforces z-[2500]', () => {
  assert.match(titleBarSource, /className="absolute top-0 left-0 mt-0 z-\[2500\] rounded-\[10px\] border overflow-visible"/)
  assert.match(titleBarSource, /className="absolute top-full left-0 mt-0.5 z-\[2500\]"/)
  assert.match(titleBarSource, /className="flex items-center shrink-0 select-none drag-region relative z-\[2500\]"/)
})

console.log('✔ titleBarDropdownZIndexStatic.test.mjs passed!')
