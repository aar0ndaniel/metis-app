import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')

async function bundleModule(relativeEntry, outfileName) {
  await fs.mkdir(tempDir, { recursive: true })
  const sourcePath = path.join(workspaceRoot, relativeEntry)
  const outfile = path.join(tempDir, outfileName)

  try {
    await build({
      entryPoints: [sourcePath],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      external: ['react', 'react-dom', 'react-router-dom', '@phosphor-icons/react', 'exceljs'],
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

await runTest('model canvas uses cached dataset headers when workspace child has none', async () => {
  const bundled = await bundleModule('src/utils/modelCanvasDataset.ts', 'modelCanvasDataset.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/modelCanvasDataset.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const {
    getModelCanvasDatasetHeaders,
    getModelCanvasVariableTypes,
  } = bundled.module ?? {}

  assert.equal(typeof getModelCanvasDatasetHeaders, 'function', 'getModelCanvasDatasetHeaders should be exported')
  assert.equal(typeof getModelCanvasVariableTypes, 'function', 'getModelCanvasVariableTypes should be exported')

  assert.deepEqual(
    getModelCanvasDatasetHeaders({ id: 'ds-1', type: 'dataset', name: 'survey.csv', headers: [] }, {
      datasetId: 'ds-1',
      headers: ['ATT1', 'ATT2', 'BI1'],
    }),
    ['ATT1', 'ATT2', 'BI1'],
  )

  assert.deepEqual(
    getModelCanvasDatasetHeaders({ id: 'ds-1', type: 'dataset', name: 'survey.csv', headers: ['SavedA'] }, {
      datasetId: 'ds-1',
      headers: ['CachedA'],
    }),
    ['SavedA'],
  )

  assert.deepEqual(
    getModelCanvasVariableTypes(
      { id: 'ds-1', type: 'dataset', name: 'survey.csv', variableTypes: {} },
      {
        datasetId: 'ds-1',
        headers: ['Score', 'Group'],
        allRows: [['1', 'Control'], ['2', 'Treatment'], ['3', 'Control']],
      },
      ['Score', 'Group'],
    ),
    { Score: 'MET', Group: 'CAT' },
  )
})

await runTest('model canvas hydrates missing headers before showing indicators and calculating', async () => {
  const source = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')

  assert.match(source, /loadDatasetSnapshot/, 'ModelCanvas should load a dataset snapshot when linked workspace metadata has no headers.')
  assert.match(source, /getModelCanvasDatasetHeaders/, 'ModelCanvas should derive indicator headers through the shared dataset-header helper.')
  assert.match(source, /effectiveDatasetHeaders/, 'ModelCanvas should use effective dataset headers from workspace metadata or cache.')
  assert.doesNotMatch(source, /const\s+datasetHeaders\s*=\s*linkedDataset\?\.headers\s*\|\|\s*\[\]/, 'Calculation precheck should not ignore cached or hydrated dataset headers.')
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
