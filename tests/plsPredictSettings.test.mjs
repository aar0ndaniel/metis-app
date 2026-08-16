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

await runTest('PLSpredict settings normalize defaults and bounds consistently', async () => {
  const bundled = await bundleModule('src/utils/plsPredictSettings.ts', 'plsPredictSettings.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/plsPredictSettings.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const {
    DEFAULT_PLS_PREDICT_SETTINGS,
    normalizePlsPredictSettings,
  } = bundled.module ?? {}

  assert.deepEqual(DEFAULT_PLS_PREDICT_SETTINGS, {
    folds: 10,
    repetitions: 1,
    technique: 'Direct antecedents (DA)',
    predictionSeed: 123,
    validationMode: 'K-fold',
    cvpatEnabled: false,
  })

  assert.deepEqual(normalizePlsPredictSettings(), DEFAULT_PLS_PREDICT_SETTINGS)
  assert.deepEqual(normalizePlsPredictSettings(null), DEFAULT_PLS_PREDICT_SETTINGS)

  assert.deepEqual(
    normalizePlsPredictSettings({
      folds: 99,
      repetitions: 0,
      cvpatEnabled: true,
    }),
    {
      folds: 20,
      repetitions: 1,
      technique: 'Direct antecedents (DA)',
      predictionSeed: 123,
      validationMode: 'K-fold',
      cvpatEnabled: true,
    }
  )
})

await runTest('PLSpredict settings can be restored from saved workspace state and saved results', async () => {
  const bundled = await bundleModule('src/utils/plsPredictSettings.ts', 'plsPredictSettings.restore.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/plsPredictSettings.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const {
    readPlsPredictSettingsFromState,
    readPlsPredictSettingsFromResults,
  } = bundled.module ?? {}

  assert.deepEqual(
    readPlsPredictSettingsFromState({
      analysisSettings: {
        plspredict: {
          folds: 7,
          repetitions: 4,
          cvpatEnabled: true,
        },
      },
    }),
    {
      folds: 7,
      repetitions: 4,
      technique: 'Direct antecedents (DA)',
      predictionSeed: 123,
      validationMode: 'K-fold',
      cvpatEnabled: true,
    }
  )

  assert.deepEqual(
    readPlsPredictSettingsFromResults({
      meta: {
        analysis_settings: {
          plspredict: {
            folds: 6,
            repetitions: 2,
            cvpatEnabled: true,
          },
        },
      },
    }),
    {
      folds: 6,
      repetitions: 2,
      technique: 'Direct antecedents (DA)',
      predictionSeed: 123,
      validationMode: 'K-fold',
      cvpatEnabled: true,
    }
  )

  assert.deepEqual(
    readPlsPredictSettingsFromResults({
      algorithm: {
        settings: {
          folds: 8,
          repetitions: 3,
          cvpat_enabled: true,
        },
      },
    }),
    {
      folds: 8,
      repetitions: 3,
      technique: 'Direct antecedents (DA)',
      predictionSeed: 123,
      validationMode: 'K-fold',
      cvpatEnabled: true,
    }
  )

  assert.deepEqual(
    readPlsPredictSettingsFromResults({
      meta: {
        analysis_settings: {
          plspredict: {
            folds: 12,
            repetitions: 5,
            technique: 'Entire antecedents (EA)',
            predictionSeed: 42,
          },
        },
      },
      algorithm: {
        settings: {
          folds: 9,
          repetitions: 3,
          cvpat_enabled: true,
        },
      },
    }),
    {
      folds: 12,
      repetitions: 5,
      technique: 'Earliest antecedents (EA)',
      predictionSeed: 42,
      validationMode: 'K-fold',
      cvpatEnabled: true,
    }
  )

  assert.deepEqual(
    readPlsPredictSettingsFromResults({
      meta: {
        analysis_settings: {
          plspredict: {
            folds: 12,
            repetitions: 5,
            technique: 'Earliest antecedents (EA)',
            predictionSeed: 42,
          },
        },
      },
    }),
    {
      folds: 12,
      repetitions: 5,
      technique: 'Earliest antecedents (EA)',
      predictionSeed: 42,
      validationMode: 'K-fold',
      cvpatEnabled: false,
    }
  )
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
