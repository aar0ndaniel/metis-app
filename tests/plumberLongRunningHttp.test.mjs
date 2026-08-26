import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'electron/main.ts'), 'utf8')
const packageLock = JSON.parse(await fs.readFile(path.join(workspaceRoot, 'package-lock.json'), 'utf8'))

// 1. Static contract verification: Plumber POST requests must use native http.request to prevent Node fetch undici 300s headersTimeout
assert.match(
  source,
  /async function postToPlumber[\s\S]*?requestPlumberHttp\(/,
  'Electron main process must use native http.request helper (requestPlumberHttp) for Plumber communication to avoid undici 300s headersTimeout.'
)

assert.doesNotMatch(
  source,
  /response\s*=\s*await\s*fetch\(`\$\{plumberBaseUrl\}\$\{pathname\}`/,
  'postToPlumber must not use global fetch which aborts at 300s due to undici headersTimeout.'
)

const packageKeys = Object.keys(packageLock.packages ?? {})
assert.equal(
  packageKeys.some(key => key === 'node_modules/undici' || key.endsWith('/node_modules/undici')),
  false,
  'The installed dependency graph must not include a top-level or nested undici runtime package.'
)

console.log('PASS Plumber long-running HTTP request contract')
