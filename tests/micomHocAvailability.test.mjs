import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')
const outfile = path.join(tempDir, 'micomAvailability.bundle.mjs')

await fs.mkdir(tempDir, { recursive: true })
await build({
  entryPoints: [path.join(workspaceRoot, 'src/utils/micomAvailability.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'silent',
})

const availability = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
const expectedMessage = 'MICOM is currently not available for models containing higher-order constructs. Run MICOM on a model without higher-order constructs.'

assert.equal(availability.MICOM_HOC_UNAVAILABLE_MESSAGE, expectedMessage)
assert.equal(availability.containsHigherOrderConstruct([{ isHigherOrder: true }]), true)
assert.equal(availability.containsHigherOrderConstruct([{ is_higher_order: true }]), true)
assert.equal(availability.containsHigherOrderConstruct([{ isHigherOrder: false }, {}]), false)
assert.equal(availability.containsHigherOrderConstruct(undefined), false)

console.log('PASS MICOM HOC availability contract')
