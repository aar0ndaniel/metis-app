import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const minimatchEntry = path.join(
  workspaceRoot,
  'node_modules',
  'app-builder-lib',
  'node_modules',
  'minimatch',
  'dist',
  'commonjs',
  'index.js',
)
const { Minimatch } = await import(pathToFileURL(minimatchEntry).href)

assert.doesNotThrow(
  () => new Minimatch('dist{,/**/*}'),
  'Electron Builder glob expansion must keep minimatch and brace-expansion on API-compatible versions.',
)

console.log('PASS Electron Builder dependency compatibility')
