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

await runTest('derived specific indirect rows are computed from the saved model graph and path coefficients', async () => {
  const bundled = await bundleModule('src/results/panelDerivedData.ts', 'resultsDerivedData.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/results/panelDerivedData.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { deriveSpecificIndirectRows } = bundled.module ?? {}
  assert.equal(typeof deriveSpecificIndirectRows, 'function', 'deriveSpecificIndirectRows should be exported')

  const savedModel = {
    constructs: [
      { id: 'c1', name: 'Trust' },
      { id: 'c2', name: 'Satisfaction' },
      { id: 'c3', name: 'Loyalty' },
    ],
    paths: [
      { from: 'c1', to: 'c2' },
      { from: 'c2', to: 'c3' },
      { from: 'c1', to: 'c3' },
    ],
  }

  const analysisResults = {
    final_results: {
      path_coefficients: [
        { path: 'Trust → Satisfaction', coefficient: 0.5 },
        { path: 'Satisfaction → Loyalty', coefficient: 0.4 },
        { path: 'Trust → Loyalty', coefficient: 0.2 },
      ],
    },
  }

  const derived = deriveSpecificIndirectRows(savedModel, analysisResults)
  assert.deepEqual(derived, [
    {
      Path: 'Trust -> Satisfaction -> Loyalty',
      Through: 'Satisfaction',
      Effect: 0.2,
    },
  ])
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
