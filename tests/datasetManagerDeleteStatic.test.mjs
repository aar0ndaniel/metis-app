import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'src/components/DatasetManagerModal.tsx'), 'utf8')

assert.match(
  source,
  /selectedIds\.length >= 1[\s\S]*onClick=\{\(\) => void deleteDatasetIds\(selectedIds\)\}/,
  'Dataset Manager should expose a visible delete button whenever at least one dataset is selected.',
)

assert.match(
  source,
  /selectedIds\.length === 1\s*\?\s*'Delete selected dataset'\s*:\s*`Delete \$\{selectedIds\.length\} selected datasets`/,
  'Dataset Manager delete tooltip should describe single and multiple dataset selections.',
)

console.log('PASS dataset manager visible delete contract')
