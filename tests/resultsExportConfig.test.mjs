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

await runTest('panel export config returns stable titles and section names', async () => {
  const bundled = await bundleModule('src/results/panelExport.ts', 'resultsPanelExport.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/results/panelExport.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { getPanelTitle, getExportSectionTitles, getModeResultsLabel } = bundled.module ?? {}
  assert.equal(typeof getPanelTitle, 'function', 'getPanelTitle should be exported')
  assert.equal(typeof getExportSectionTitles, 'function', 'getExportSectionTitles should be exported')
  assert.equal(typeof getModeResultsLabel, 'function', 'getModeResultsLabel should be exported')

  assert.equal(getPanelTitle('plspredict-mv-summary'), 'MV Summary')
  assert.equal(getModeResultsLabel('bootstrap'), 'Bootstrap Results')
  assert.deepEqual(getExportSectionTitles('vif', 2), ['Inner VIF', 'Outer VIF'])
  assert.deepEqual(getExportSectionTitles('discriminant', 2), ['Fornell-Larcker', 'HTMT'])
  assert.deepEqual(getExportSectionTitles('total-effects', 1), ['Total Effects'])
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
