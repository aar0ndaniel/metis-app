import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const dataView = await fs.readFile(path.join(workspaceRoot, 'src/pages/DataView.tsx'), 'utf8')
const css = await fs.readFile(path.join(workspaceRoot, 'src/index.css'), 'utf8')

assert.match(
  css,
  /--color-warning-rgb:\s*220 105 115;/,
  'Dark theme should expose warning RGB values for transparent warning UI.'
)

assert.match(
  css,
  /\[data-theme='light'\][\s\S]*--color-warning-rgb:\s*220 105 115;/,
  'Light theme should expose warning RGB values for transparent warning UI.'
)

for (const opacity of ['0.16', '0.12', '0.10', '0.07']) {
  assert.match(
    dataView,
    new RegExp(`rgb\\(var\\(--color-accent-rgb\\) / ${opacity}\\)`),
    `DataView should use very transparent theme primary selection opacity ${opacity}.`
  )
}

assert.doesNotMatch(
  dataView,
  /rgb\(var\(--color-hover-rgb\) \/ 0\.(?:95|85|75|55)\)/,
  'DataView row and column selection should not use neutral hover fills.'
)

assert.match(
  dataView,
  /className="data-view-context-action w-full flex items-center justify-between"[\s\S]*Append row/,
  'Append row context action should have the shared hover affordance.'
)

assert.match(
  dataView,
  /className="data-view-context-action w-full flex items-center justify-between"[\s\S]*Compute/,
  'Compute context action should have the shared hover affordance.'
)

assert.match(
  css,
  /\.data-view-context-action:hover\s*\{[\s\S]*background:\s*rgb\(var\(--color-accent-rgb\) \/ 0\.10\) !important;/,
  'DataView context actions should hover with a subtle theme-primary fill.'
)

assert.match(
  dataView,
  /borderBottom:\s*'1px solid var\(--color-border\)'[\s\S]*background:\s*'var\(--color-elevated\)'[\s\S]*Unsaved dataset changes/,
  'Unsaved dataset modal header should use a neutral elevated surface instead of a danger fill.'
)

assert.match(
  dataView,
  /WarningCircle size=\{16\} color="var\(--color-warning\)"/,
  'Unsaved dataset modal icon should use the app warning color.'
)

assert.match(
  dataView,
  /background:\s*'rgb\(var\(--color-warning-rgb\) \/ 0\.92\)'[\s\S]*>\s*Discard\s*</,
  'Discard should use the app warning color instead of bright danger red.'
)

assert.match(
  dataView,
  /className="data-view-unsaved-save"[\s\S]*border:\s*'1px solid rgb\(var\(--color-accent-rgb\) \/ 0\.42\)'[\s\S]*background:\s*'transparent'[\s\S]*>\s*Save changes\s*</,
  'Save changes should be an outline action without a filled background.'
)

console.log('PASS data view theme chrome coverage')
