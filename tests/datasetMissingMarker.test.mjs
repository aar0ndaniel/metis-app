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
} = missingModule

await runTest('isMissingDatasetValue handles default and standard NA tokens', () => {
  assert.equal(isMissingDatasetValue('', undefined), true)
  assert.equal(isMissingDatasetValue('   ', undefined), true)
  assert.equal(isMissingDatasetValue('NA', undefined), true)
  assert.equal(isMissingDatasetValue('na', undefined), true)
  assert.equal(isMissingDatasetValue('n/a', 'NA'), true)
  assert.equal(isMissingDatasetValue('null', 'Empty cells / NA'), true)
  assert.equal(isMissingDatasetValue('123', 'Empty cells / NA'), false)
  assert.equal(isMissingDatasetValue('99', 'Empty cells / NA'), false)
})

await runTest('isMissingDatasetValue respects None (all valid) marker', () => {
  assert.equal(isMissingDatasetValue('', 'None'), false)
  assert.equal(isMissingDatasetValue('NA', 'None'), false)
  assert.equal(isMissingDatasetValue('None', 'None'), false)
  assert.equal(isMissingDatasetValue('', 'None (all valid)'), false)
})

await runTest('isMissingDatasetValue matches specific custom or numeric marker and skips empty cells', () => {
  assert.equal(isMissingDatasetValue('99', '99'), true)
  assert.equal(isMissingDatasetValue(99, '99'), true)
  assert.equal(isMissingDatasetValue('  99  ', '99'), true)
  assert.equal(isMissingDatasetValue('', '99'), false, 'Empty cell should not match 99 marker')
  assert.equal(isMissingDatasetValue('NA', '99'), false, 'NA should not match 99 marker')
  assert.equal(isMissingDatasetValue('100', '99'), false)

  assert.equal(isMissingDatasetValue('-99', '-99'), true)
  assert.equal(isMissingDatasetValue('-999', '-999'), true)
  assert.equal(isMissingDatasetValue('?', '?'), true)
})

await runTest('findMissingCellLocations locates only targeted marker cells', () => {
  const rows = [
    ['1', '99', '3'],
    ['4', '', '6'],
    ['7', 'NA', '99'],
  ]

  const locations99 = findMissingCellLocations(rows, '99')
  assert.deepEqual(locations99, [
    { rowIndex: 0, columnIndex: 1 },
    { rowIndex: 2, columnIndex: 2 },
  ])

  const locationsDefault = findMissingCellLocations(rows, 'Empty cells / NA')
  assert.deepEqual(locationsDefault, [
    { rowIndex: 1, columnIndex: 1 },
    { rowIndex: 2, columnIndex: 1 },
  ])
})

const parsingModule = await bundleModule('src/utils/datasetParsing.ts', 'datasetParsing.bundle.mjs')
const { parseCSVText } = parsingModule

await runTest('parseCSVText respects custom missingMarker', () => {
  const csvData = `A,B,C
1,99,3
4,-99,6
7,NA,99`

  const parsed99 = parseCSVText(csvData, ',', '99')
  assert.equal(parsed99.missing, 2, 'Should count 2 cells matching 99')

  const parsedDefault = parseCSVText(csvData, ',', 'Empty cells / NA')
  assert.equal(parsedDefault.missing, 1, 'Should count 1 cell matching NA')

  const parsedNone = parseCSVText(csvData, ',', 'None (all valid)')
  assert.equal(parsedNone.missing, 0, 'Should count 0 missing cells for None')
})

