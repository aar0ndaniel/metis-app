import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')

function createLocalStorageMock() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

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

globalThis.localStorage = createLocalStorageMock()

await runTest('dataset loader returns cached dataset rows before touching the file bridge', async () => {
  const cacheKey = 'metis:dataset-view:ds-cached'
  globalThis.localStorage.setItem(cacheKey, JSON.stringify({
    datasetId: 'ds-cached',
    fileName: 'cached.csv',
    workspaceName: 'Cached.metisws',
    headers: ['A', 'B'],
    allRows: [['1', '2'], ['3', '4']],
    totalRows: 2,
    missing: 0,
  }))

  const bundled = await bundleModule('src/utils/datasetLoading.ts', 'datasetLoading.cached.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/datasetLoading.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { loadDatasetSnapshot } = bundled.module ?? {}
  assert.equal(typeof loadDatasetSnapshot, 'function', 'loadDatasetSnapshot should be exported')

  const result = await loadDatasetSnapshot({
    datasetId: 'ds-cached',
    fileName: 'cached.csv',
    workspaceName: 'Cached.metisws',
    api: {
      readFile: async () => {
        throw new Error('readFile should not be called when cache is present')
      },
      extractDataset: async () => {
        throw new Error('extractDataset should not be called when cache is present')
      },
    },
  })

  assert.deepEqual(result?.headers, ['A', 'B'])
  assert.deepEqual(result?.allRows, [['1', '2'], ['3', '4']])
})

await runTest('dataset loader falls back to workspace extraction when cache is missing', async () => {
  globalThis.localStorage.clear()

  const bundled = await bundleModule('src/utils/datasetLoading.ts', 'datasetLoading.workspace.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/datasetLoading.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { loadDatasetSnapshot } = bundled.module ?? {}
  assert.equal(typeof loadDatasetSnapshot, 'function', 'loadDatasetSnapshot should be exported')

  const csvBase64 = Buffer.from('A,B\n10,20\n30,40', 'utf-8').toString('base64')
  const result = await loadDatasetSnapshot({
    datasetId: 'ds-workspace',
    fileName: 'workspace.csv',
    workspaceId: 'ws-1',
    workspaceName: 'Workspace.metisws',
    workspacePath: 'C:/tmp/Workspace.metisws',
    api: {
      extractDataset: async () => ({ success: true, datasetTempPath: 'C:/tmp/extracted/workspace.csv' }),
      readFile: async () => ({ success: true, data: csvBase64 }),
    },
  })

  assert.deepEqual(result?.headers, ['A', 'B'])
  assert.deepEqual(result?.allRows, [['10', '20'], ['30', '40']])
  assert.equal(result?.datasetTempPath, 'C:/tmp/extracted/workspace.csv')
  assert.ok(globalThis.localStorage.getItem('metis:dataset-view:ds-workspace'))
})

await runTest('dataset loader extracts relative dataset paths from metis workspace archives', async () => {
  globalThis.localStorage.clear()

  const bundled = await bundleModule('src/utils/datasetLoading.ts', 'datasetLoading.relative-workspace.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/datasetLoading.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { loadDatasetSnapshot } = bundled.module ?? {}
  assert.equal(typeof loadDatasetSnapshot, 'function', 'loadDatasetSnapshot should be exported')

  const calls = []
  const csvBase64 = Buffer.from('A,B,Gender\n10,20,Male\n30,40,Female', 'utf-8').toString('base64')
  const result = await loadDatasetSnapshot({
    datasetId: 'ds-relative',
    fileName: 'micom-flow.csv',
    filePath: 'micom-flow.csv',
    workspaceId: 'ws-1',
    workspaceName: 'Workspace.metisws',
    workspacePath: 'C:/tmp/Workspace.metisws',
    api: {
      extractDataset: async (payload) => {
        calls.push(['extractDataset', payload])
        return { success: true, datasetTempPath: 'C:/tmp/extracted/micom-flow.csv' }
      },
      readFile: async (filePath) => {
        calls.push(['readFile', filePath])
        return { success: true, data: csvBase64 }
      },
    },
  })

  assert.deepEqual(calls[0], ['extractDataset', { workspacePath: 'C:/tmp/Workspace.metisws', datasetId: 'ds-relative' }])
  assert.deepEqual(calls[1], ['readFile', 'C:/tmp/extracted/micom-flow.csv'])
  assert.deepEqual(result?.headers, ['A', 'B', 'Gender'])
  assert.equal(result?.datasetTempPath, 'C:/tmp/extracted/micom-flow.csv')
})

await runTest('dataset loader ignores stale archive-internal cached paths and re-extracts from workspace', async () => {
  globalThis.localStorage.clear()
  globalThis.localStorage.setItem('metis:dataset-view:ds-stale', JSON.stringify({
    datasetId: 'ds-stale',
    fileName: 'workspace.csv',
    filePath: 'workspace.csv',
    workspaceId: 'ws-1',
    workspaceName: 'Workspace.metisws',
    workspacePath: 'C:/tmp/Workspace.metisws',
    absolutePath: 'workspace.csv',
  }))

  const bundled = await bundleModule('src/utils/datasetLoading.ts', 'datasetLoading.stale-archive-path.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/datasetLoading.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { loadDatasetSnapshot } = bundled.module ?? {}
  assert.equal(typeof loadDatasetSnapshot, 'function', 'loadDatasetSnapshot should be exported')

  const calls = []
  const csvBase64 = Buffer.from('A,B\n10,20\n30,40', 'utf-8').toString('base64')
  const result = await loadDatasetSnapshot({
    datasetId: 'ds-stale',
    fileName: 'workspace.csv',
    filePath: 'workspace.csv',
    workspaceId: 'ws-1',
    workspaceName: 'Workspace.metisws',
    workspacePath: 'C:/tmp/Workspace.metisws',
    api: {
      extractDataset: async (payload) => {
        calls.push(['extractDataset', payload])
        return { success: true, datasetTempPath: 'C:/tmp/extracted/workspace.csv' }
      },
      readFile: async (filePath) => {
        calls.push(['readFile', filePath])
        if (filePath === 'workspace.csv') {
          return {
            success: false,
            error: 'Renderer file read blocked: path was not selected through an approved import dialog.',
          }
        }
        return { success: true, data: csvBase64 }
      },
    },
  })

  assert.deepEqual(calls[0], ['extractDataset', { workspacePath: 'C:/tmp/Workspace.metisws', datasetId: 'ds-stale' }])
  assert.deepEqual(calls[1], ['readFile', 'C:/tmp/extracted/workspace.csv'])
  assert.deepEqual(result?.headers, ['A', 'B'])
  assert.equal(result?.datasetTempPath, 'C:/tmp/extracted/workspace.csv')
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
