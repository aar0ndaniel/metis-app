import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const source = await fs.readFile(path.join(workspaceRoot, 'src/components/AdvancedAnalysisModal.tsx'), 'utf8')

assert.match(
  source,
  /aria-label="Close Advanced analysis"/,
  'Advanced analysis modal close button should expose an accessible label.'
)

assert.match(
  source,
  /title="Close"/,
  'Advanced analysis modal close button should expose a tooltip.'
)

assert.match(
  source,
  /<X size=\{14\} style=\{\{ color: 'var\(--color-text-muted-alt\)' \}\} \/>/,
  'Advanced analysis modal close icon should use a visible neutral token in dark theme.'
)

console.log('PASS advanced analysis modal layout contract')
