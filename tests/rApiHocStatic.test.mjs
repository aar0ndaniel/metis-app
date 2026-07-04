import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'r-api/plumber.R'), 'utf8')

assert.match(
  source,
  /is_higher_order/,
  'Plumber should preserve HOC metadata during payload validation.',
)

assert.match(
  source,
  /normalized_construct\$dimensions\s*<-\s*as\.list\(dimensions\)/,
  'Plumber should validate and normalize HOC lower-order dimensions.',
)

assert.match(
  source,
  /seminr::higher_composite/,
  'Plumber should map HOCs to seminr::higher_composite.',
)

assert.match(
  source,
  /constructs\[[^\]]+\]\.dimensions references unknown construct/,
  'Plumber should reject HOC dimensions that do not reference known constructs.',
)

assert.match(
  source,
  /summary_obj\$validity\$vif_items/,
  'HOC VIF extraction should read the seminr summary validity vif_items list.',
)

console.log('PASS r-api HOC static guards')
