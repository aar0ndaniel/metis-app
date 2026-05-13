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

await runTest('chart preferences default to off and stay scoped by mode/panel', async () => {
  const bundled = await bundleModule('src/utils/resultsChartPreferences.ts', 'resultsChartPreferences.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/resultsChartPreferences.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const {
    buildChartPreferenceKey,
    getChartPreference,
    toggleChartPreference,
  } = bundled.module ?? {}

  assert.equal(typeof buildChartPreferenceKey, 'function')
  assert.equal(typeof getChartPreference, 'function')
  assert.equal(typeof toggleChartPreference, 'function')

  assert.equal(getChartPreference({}, 'plspredict', 'plspredict-mv-summary'), false)
  assert.equal(buildChartPreferenceKey('plspredict', 'plspredict-mv-summary'), 'plspredict:plspredict-mv-summary')

  const enabled = toggleChartPreference({}, 'plspredict', 'plspredict-mv-summary')
  assert.equal(getChartPreference(enabled, 'plspredict', 'plspredict-mv-summary'), true)
  assert.equal(getChartPreference(enabled, 'pls-sem', 'path-coef'), false)

  const disabledAgain = toggleChartPreference(enabled, 'plspredict', 'plspredict-mv-summary')
  assert.equal(getChartPreference(disabledAgain, 'plspredict', 'plspredict-mv-summary'), false)
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
