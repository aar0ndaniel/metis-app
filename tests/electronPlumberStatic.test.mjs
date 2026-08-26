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
  /if \((?:response\.status|statusCode) === 404 && attempt === 0\) \{[\s\S]*?Route returned 404; attempting restart and retry\./,
  'Plumber POST requests should restart and retry once when a route returns 404.'
)

assert.match(
  source,
  /let rawBody = ''[\s\S]*?JSON\.parse\(rawBody\)[\s\S]*?error: rawBody\.trim\(\)/,
  'Plumber responses should tolerate non-JSON error bodies so route failures surface clearly.'
)

assert.match(
  source,
  /function plumberBridgeExceptionResponse\(err: any, action: string\)[\s\S]*errorCode:\s*'BACKEND_STOPPED'[\s\S]*userAction:/,
  'Unexpected Electron-to-Plumber bridge exceptions should include structured recovery metadata.',
)

assert.match(
  source,
  /errorCode:\s*'BACKEND_NOT_READY'[\s\S]*userAction:\s*getPlumberNotReadyHint\(\)/,
  'Backend-not-ready responses should include a structured setup/restart action.',
)

assert.match(
  source,
  /errorCode:\s*'BACKEND_RESPONSE_READ_FAILED'/,
  'Response-read failures should include a stable errorCode.',
)

assert.match(
  source,
  /errorCode:\s*'BACKEND_ROUTE_NOT_FOUND'/,
  'Repeated missing-route failures should include a stable errorCode.',
)

console.log('PASS electron plumber route recovery guards')
