import assert from 'node:assert/strict'
import esbuild from 'esbuild'

async function runTest(name, fn) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

async function bundleModule(entryPoint, outfile) {
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    write: false,
  })
  const text = result.outputFiles[0].text
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`
  return import(moduleUrl)
}

const missingModule = await bundleModule('src/utils/datasetMissing.ts', 'datasetMissing.bundle.mjs')
const {
  isMissingDatasetValue,
  findMissingCellLocations,
  normalizeMissingMarker,
  MISSING_MARKER_PRESETS,
  saveCustomMissingMarker,
  deleteCustomMissingMarker,
} = missingModule

// Mock localStorage
const storage = new Map()
global.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
}

await runTest('saveCustomMissingMarker adds unique custom marker to preset storage', () => {
  storage.clear()
  const res1 = saveCustomMissingMarker('99')
  assert.deepEqual(res1, ['99'])

  const res2 = saveCustomMissingMarker('99') // duplicate
  assert.deepEqual(res2, ['99'])

  const res3 = saveCustomMissingMarker('  -9999  ')
  assert.deepEqual(res3, ['99', '-9999'])

  // Should ignore built-in preset duplicates
  const res4 = saveCustomMissingMarker('-99')
  assert.deepEqual(res4, ['99', '-9999'])
})

await runTest('deleteCustomMissingMarker removes custom marker from preset storage', () => {
  storage.clear()
  saveCustomMissingMarker('99')
  saveCustomMissingMarker('-9999')
  saveCustomMissingMarker('custom_token')

  const res1 = deleteCustomMissingMarker('-9999')
  assert.deepEqual(res1, ['99', 'custom_token'])

  const res2 = deleteCustomMissingMarker('99')
  assert.deepEqual(res2, ['custom_token'])

  const res3 = deleteCustomMissingMarker('non_existent')
  assert.deepEqual(res3, ['custom_token'])

  const res4 = deleteCustomMissingMarker('CUSTOM_TOKEN')
  assert.deepEqual(res4, [])
})

await runTest('normalizeMissingMarker returns sensible defaults', () => {
  assert.equal(normalizeMissingMarker(''), 'Empty cells / NA')
  assert.equal(normalizeMissingMarker(null), 'Empty cells / NA')
  assert.equal(normalizeMissingMarker(undefined), 'Empty cells / NA')
  assert.equal(normalizeMissingMarker('  99 '), '99')
  assert.equal(normalizeMissingMarker('-99'), '-99')
})

await runTest('isMissingDatasetValue handles diverse data types and sentinels', () => {
  assert.equal(isMissingDatasetValue('-99', '-99'), true)
  assert.equal(isMissingDatasetValue(-99, '-99'), true)
  assert.equal(isMissingDatasetValue('-99.0', '-99'), false)
  assert.equal(isMissingDatasetValue('999', '999'), true)
  assert.equal(isMissingDatasetValue(999, '999'), true)
  assert.equal(isMissingDatasetValue('?', '?'), true)
  assert.equal(isMissingDatasetValue('missing', 'missing'), true)
  assert.equal(isMissingDatasetValue('MISSING', 'missing'), true)
})

