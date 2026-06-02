import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')

async function bundleModule(relativeEntry, outfileName) {
  const entryPoint = path.join(workspaceRoot, relativeEntry)
  const outfile = path.join(tempDir, outfileName)

  await fs.mkdir(tempDir, { recursive: true })

  try {
    await build({
      entryPoints: [entryPoint],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      sourcemap: 'inline',
      logLevel: 'silent',
    })
  } catch (error) {
    return { error }
  }

  try {
    const moduleUrl = `${pathToFileURL(outfile).href}?t=${Date.now()}`
    return { module: await import(moduleUrl) }
  } catch (error) {
    return { error }
  }
}

async function runTest(name, fn) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? error.stack : error)
    process.exitCode = 1
  }
}

await runTest('dataset workspace helpers expose migration and linking behavior', async () => {
  const bundled = await bundleModule('src/utils/datasetWorkspace.ts', 'datasetWorkspace.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/datasetWorkspace.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const {
    migrateWorkspace,
    upsertDatasetInWorkspace,
    deleteDatasetsFromWorkspace,
    setModelLinkedDataset,
  } = bundled.module ?? {}

  assert.equal(typeof migrateWorkspace, 'function', 'migrateWorkspace should be exported')
  assert.equal(typeof upsertDatasetInWorkspace, 'function', 'upsertDatasetInWorkspace should be exported')
  assert.equal(typeof deleteDatasetsFromWorkspace, 'function', 'deleteDatasetsFromWorkspace should be exported')
  assert.equal(typeof setModelLinkedDataset, 'function', 'setModelLinkedDataset should be exported')

  const workspace = {
    id: 'ws-1',
    name: 'Research.metisws',
    color: '#181818',
    expanded: true,
    datasetTempPath: 'C:/tmp/original.csv',
    children: [
      {
        id: 'm-1',
        name: 'Model 1.hbe',
        type: 'model',
        badge: 'Draft',
        state: { constructs: [], paths: [] },
      },
      {
        id: 'ds-1',
        name: 'Dataset 1.csv',
        type: 'dataset',
        filePath: 'dataset.csv',
        headers: ['A', 'B'],
        meta: '2 cases · 2 variables',
      },
    ],
  }

  const migrated = migrateWorkspace(workspace)
  assert.equal(migrated.defaultDatasetId, 'ds-1')
  assert.equal(migrated.children.find((child) => child.id === 'm-1')?.linkedDatasetId, 'ds-1')
  assert.equal(migrated.children.find((child) => child.id === 'ds-1')?.datasetTempPath, 'C:/tmp/original.csv')

  const withSecondDataset = upsertDatasetInWorkspace(migrated, {
    id: 'ds-2',
    name: 'Dataset 2.csv',
    type: 'dataset',
    filePath: 'dataset-2.csv',
    headers: ['A', 'B'],
  })
  assert.equal(withSecondDataset.children.filter((child) => child.type === 'dataset').length, 2)

  const withExplicitLink = setModelLinkedDataset(withSecondDataset, 'm-1', 'ds-2')
  assert.equal(withExplicitLink.children.find((child) => child.id === 'm-1')?.linkedDatasetId, 'ds-2')

  const withThirdDataset = upsertDatasetInWorkspace(withExplicitLink, {
    id: 'ds-3',
    name: 'Dataset 3.csv',
    type: 'dataset',
    filePath: 'dataset-3.csv',
    headers: ['A', 'B'],
  })

  assert.throws(
    () => upsertDatasetInWorkspace(withThirdDataset, {
      id: 'ds-4',
      name: 'Dataset 4.csv',
      type: 'dataset',
      filePath: 'dataset-4.csv',
      headers: ['A', 'B'],
    }),
    /dataset limit/i,
  )

  const afterDelete = deleteDatasetsFromWorkspace(withExplicitLink, ['ds-2'])
  assert.equal(afterDelete.defaultDatasetId, 'ds-1')
  assert.equal(afterDelete.children.find((child) => child.id === 'm-1')?.linkedDatasetId, 'ds-1')
})

await runTest('data view compute helper inserts numeric derived columns after the selection', async () => {
  const bundled = await bundleModule('src/utils/dataViewCompute.ts', 'dataViewCompute.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/dataViewCompute.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { computeDerivedColumn } = bundled.module ?? {}
  assert.equal(typeof computeDerivedColumn, 'function', 'computeDerivedColumn should be exported')

  const result = computeDerivedColumn({
    headers: ['Revenue', 'Cost', 'Label'],
    rows: [
      ['10', '5', 'A'],
      ['25', '4', 'B'],
    ],
    selectedColumnIndices: [0, 1],
    operation: 'sum',
    headerName: 'Total',
  })

  assert.deepEqual(result.headers, ['Revenue', 'Cost', 'Total', 'Label'])
  assert.deepEqual(result.rows, [
    ['10', '5', '15', 'A'],
    ['25', '4', '29', 'B'],
  ])
  assert.equal(result.insertedColumnIndex, 2)

  assert.throws(
    () => computeDerivedColumn({
      headers: ['Revenue', 'Label'],
      rows: [
        ['10', 'A'],
        ['25', 'B'],
      ],
      selectedColumnIndices: [0, 1],
      operation: 'mean',
      headerName: 'Average',
    }),
    /numeric/i,
  )
})

await runTest('dataset column helpers normalize locale decimals and duplicate headers for persistence', async () => {
  const bundled = await bundleModule('src/utils/datasetColumns.ts', 'datasetColumns.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/datasetColumns.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const {
    parseDatasetNumber,
    prepareDatasetForPersistence,
  } = bundled.module ?? {}

  assert.equal(typeof parseDatasetNumber, 'function', 'parseDatasetNumber should be exported')
  assert.equal(typeof prepareDatasetForPersistence, 'function', 'prepareDatasetForPersistence should be exported')

  assert.deepEqual(parseDatasetNumber('1,25'), {
    kind: 'number',
    normalized: '1.25',
    value: 1.25,
  })

  const prepared = prepareDatasetForPersistence(
    ['Score', 'Score', 'Label'],
    [
      ['1,5', '2.75', 'A'],
      ['3,25', '4', 'B'],
    ],
  )

  assert.deepEqual(prepared.headers, ['Score', 'Score (2)', 'Label'])
  assert.deepEqual(prepared.rows, [
    ['1.5', '2.75', 'A'],
    ['3.25', '4', 'B'],
  ])
  assert.deepEqual(prepared.variableTypes, {
    Score: 'MET',
    'Score (2)': 'MET',
    Label: 'CAT',
  })
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
