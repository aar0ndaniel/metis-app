import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = await fs.readFile(path.join(root, 'src/results/panelData.ts'), 'utf8')

assert.doesNotMatch(source, /['"]final_results\.(?:plspredict_summary|mv_summary|prediction_summary)['"]/, 'PLSpredict summary panels must not accept ambiguous legacy summary aliases.')
assert.doesNotMatch(source, /['"](?:plspredict_summary|mv_summary|prediction_summary)['"]/, 'PLSpredict result mapping must use the canonical native summary path.')
assert.match(source, /final_results\.plspredict_mv_summary/, 'PLSpredict panels must retain the canonical native MV summary path.')

console.log('PASS PLSpredict result mapping contract coverage')
