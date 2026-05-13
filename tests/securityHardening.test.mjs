import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')

function createStorageMock() {
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
    dump() {
      return new Map(store)
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

globalThis.localStorage = createStorageMock()
globalThis.window = {
  localStorage: globalThis.localStorage,
  sessionStorage: createStorageMock(),
}

await runTest('diagnostics redact absolute filesystem paths from exported details', async () => {
  const bundled = await bundleModule('src/utils/diagnostics.ts', 'diagnostics.security.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/diagnostics.ts to compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const {
    addDiagnostic,
    clearDiagnostics,
    getDiagnostics,
  } = bundled.module ?? {}

  assert.equal(typeof addDiagnostic, 'function', 'addDiagnostic should be exported')
  assert.equal(typeof clearDiagnostics, 'function', 'clearDiagnostics should be exported')
  assert.equal(typeof getDiagnostics, 'function', 'getDiagnostics should be exported')

  clearDiagnostics()
  addDiagnostic({
    category: 'calculation',
    message: 'Calculation started.',
    details: {
      datasetPath: 'C:\\Users\\aaron\\Downloads\\metis\\sample dataset.csv',
      workspacePath: 'C:\\Users\\aaron\\Downloads\\metis\\Study.ada',
      nested: {
        datasetTempPath: 'C:\\Users\\aaron\\AppData\\Roaming\\metis\\temp-datasets\\ws__ds.csv',
      },
      filePath: 'datasets\\sample dataset.csv',
    },
  })

  const [entry] = getDiagnostics()
  assert.ok(entry, 'Expected a diagnostic entry to be recorded')
  assert.equal(entry.details?.datasetPath, '[redacted-path: sample dataset.csv]')
  assert.equal(entry.details?.workspacePath, '[redacted-path: Study.ada]')
  assert.equal(entry.details?.nested?.datasetTempPath, '[redacted-path: ws__ds.csv]')
  assert.equal(entry.details?.filePath, 'datasets\\sample dataset.csv')
})

await runTest('dataset view cache keeps full rows in memory but persists metadata only', async () => {
  globalThis.localStorage.clear()
  globalThis.window.sessionStorage.clear()

  const bundled = await bundleModule('src/utils/datasetViewCache.ts', 'datasetViewCache.security.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/datasetViewCache.ts to compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const {
    readDatasetViewCache,
    writeDatasetViewCache,
  } = bundled.module ?? {}

  assert.equal(typeof readDatasetViewCache, 'function', 'readDatasetViewCache should be exported')
  assert.equal(typeof writeDatasetViewCache, 'function', 'writeDatasetViewCache should be exported')

  writeDatasetViewCache('ds-1', {
    datasetId: 'ds-1',
    fileName: 'sample.csv',
    filePath: 'datasets/sample.csv',
    workspaceId: 'ws-1',
    workspaceName: 'Study.ada',
    headers: ['A', 'B'],
    allRows: [['1', '2'], ['3', '4']],
    totalRows: 2,
    missing: 0,
    datasetTempPath: 'C:/metis/temp/sample.csv',
    absolutePath: 'C:/metis/temp/sample.csv',
  })

  const sameSession = readDatasetViewCache('ds-1')
  assert.deepEqual(sameSession?.headers, ['A', 'B'])
  assert.deepEqual(sameSession?.allRows, [['1', '2'], ['3', '4']])

  const localRaw = globalThis.localStorage.getItem('metis:dataset-view:ds-1')
  const sessionRaw = globalThis.window.sessionStorage.getItem('metis:dataset-view:ds-1')

  assert.ok(localRaw, 'Expected metadata to be persisted in localStorage')
  assert.ok(sessionRaw, 'Expected metadata to be persisted in sessionStorage')
  assert.ok(!localRaw.includes('"allRows"'), 'Expected localStorage payload to omit full row data')
  assert.ok(!sessionRaw.includes('"allRows"'), 'Expected sessionStorage payload to omit full row data')
  assert.ok(!localRaw.includes('"headers":["A","B"]'), 'Expected localStorage payload to omit full headers')
  assert.ok(!sessionRaw.includes('"headers":["A","B"]'), 'Expected sessionStorage payload to omit full headers')
})

await runTest('renderer write policy only allows explicit approved export targets', async () => {
  const bundled = await bundleModule('src/utils/securityPaths.ts', 'securityPaths.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/securityPaths.ts to compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const {
    isRendererWriteTargetAllowed,
  } = bundled.module ?? {}

  assert.equal(typeof isRendererWriteTargetAllowed, 'function', 'isRendererWriteTargetAllowed should be exported')

  const approvedWritePaths = new Set(['C:\\Exports\\report.json'])
  const trustedRoots = ['C:\\Users\\aaron\\Downloads\\metis', 'C:\\Users\\aaron\\AppData\\Roaming\\metis\\temp-datasets']

  assert.equal(
    isRendererWriteTargetAllowed('C:\\Exports\\report.json', { approvedWritePaths, trustedRoots }),
    true,
  )
  assert.equal(
    isRendererWriteTargetAllowed('C:\\Users\\aaron\\Downloads\\metis\\temp-datasets\\diagnostics.json', { approvedWritePaths, trustedRoots }),
    false,
  )
  assert.equal(
    isRendererWriteTargetAllowed('C:\\Users\\aaron\\Downloads\\metis\\exports\\report.html', {
      approvedWritePaths: new Set(),
      trustedRoots: ['C:\\Users\\aaron\\Downloads\\metis\\exports'],
      allowTrustedRoots: true,
    }),
    true,
  )
  assert.equal(
    isRendererWriteTargetAllowed('C:\\Users\\aaron\\Downloads\\metis\\report.html', {
      approvedWritePaths: new Set(),
      trustedRoots: ['C:\\Users\\aaron\\Downloads\\metis\\exports'],
      allowTrustedRoots: true,
    }),
    false,
  )
})

await runTest('bundled HTML export writes are limited to the app export folder', async () => {
  const electronMain = await fs.readFile(path.join(workspaceRoot, 'electron/main.ts'), 'utf8')

  assert.match(
    electronMain,
    /function getTrustedExportRoots\(\): string\[\]/,
    'Electron main should define a dedicated trusted export root helper.'
  )
  assert.match(
    electronMain,
    /path\.join\(getDataPath\(\), 'exports'\)/,
    'The trusted renderer write root should be the app-managed exports folder, not the whole data directory.'
  )
  assert.match(
    electronMain,
    /trustedRoots:\s*getTrustedExportRoots\(\),\s*allowTrustedRoots:\s*true/,
    'Renderer writes should trust only the explicit export root for app-generated HTML reports.'
  )
  assert.doesNotMatch(
    electronMain,
    /trustedRoots:\s*getTrustedDatasetRoots\(\),\s*allowTrustedRoots:\s*true/,
    'Renderer writes should not allow the broader data or temp-dataset roots.'
  )
  assert.match(
    electronMain,
    /allowedRendererWriteExtensions\s*=\s*new Set\(\[[^\]]*'\.r'/,
    'Renderer writes should allow approved .R script exports from the title-bar results action.'
  )
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
