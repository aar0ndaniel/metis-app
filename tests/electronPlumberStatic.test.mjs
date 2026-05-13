import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'electron/main.ts'), 'utf8')

assert.match(
  source,
  /async function restartPlumberServer\(reason: string\): Promise<boolean>/,
  'Electron main process should expose a helper to restart Plumber when a route is missing.'
)

assert.match(
  source,
  /if \(response\.status === 404 && attempt === 0\) \{[\s\S]*?Route returned 404; attempting restart and retry\./,
  'Plumber POST requests should restart and retry once when a route returns 404.'
)

assert.match(
  source,
  /const rawBody = await response\.text\(\)[\s\S]*?JSON\.parse\(rawBody\)[\s\S]*?error: rawBody\.trim\(\)/,
  'Plumber responses should tolerate non-JSON error bodies so route failures surface clearly.'
)

console.log('PASS electron plumber route recovery guards')
