import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'r-api/plumber.R'), 'utf8')

assert.match(
  source,
  /if\s*\(\s*length\(items\)\s*==\s*1L\s*\)\s*\{[\s\S]*seminr::single_item\(items\[\[1\]\]\)[\s\S]*seminr::composite\(con_name,\s*single_item_spec,\s*weights\s*=\s*seminr::mode_B\)[\s\S]*seminr::reflective\(con_name,\s*single_item_spec\)[\s\S]*seminr::composite\(con_name,\s*single_item_spec,\s*weights\s*=\s*seminr::mode_A\)/,
  'Plumber should pass exactly one-indicator constructs to seminr::single_item while preserving formative, consistent, and standard reflective paths.',
)

assert.match(
  source,
  /else if\s*\(\s*con_type\s*==\s*"formative"\s*\)\s*\{[\s\S]*seminr::composite\(con_name,\s*items\)[\s\S]*seminr::reflective\(con_name,\s*items\)/,
  'Plumber should keep multi-indicator formative and reflective constructs on the normal multi-item paths.',
)

assert.match(
  source,
  /seminr::interaction_term\([\s\S]*iv\s*=\s*iv,[\s\S]*moderator\s*=\s*moderator,[\s\S]*method\s*=\s*seminr::two_stage/,
  'Plumber should generate moderation interaction terms with SEMinR two-stage estimation.',
)

console.log('PASS r-api single-item moderation static guards')
