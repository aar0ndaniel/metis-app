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

await runTest('derived moderation rows expose interaction summaries, simple slopes, and r-square change', async () => {
  const bundled = await bundleModule('src/results/panelDerivedData.ts', 'resultsModerationDerivedData.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/results/panelDerivedData.ts to compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const {
    buildModerationSlopeChartSvg,
    deriveModerationBootstrapRows,
    deriveModerationR2ChangeRows,
    deriveModerationSlopeRows,
    deriveModerationSummaryRows,
    hasModerationInteractions,
  } = bundled.module ?? {}

  assert.equal(typeof hasModerationInteractions, 'function', 'hasModerationInteractions should be exported')
  assert.equal(typeof deriveModerationSummaryRows, 'function', 'deriveModerationSummaryRows should be exported')
  assert.equal(typeof deriveModerationSlopeRows, 'function', 'deriveModerationSlopeRows should be exported')
  assert.equal(typeof deriveModerationR2ChangeRows, 'function', 'deriveModerationR2ChangeRows should be exported')
  assert.equal(typeof deriveModerationBootstrapRows, 'function', 'deriveModerationBootstrapRows should be exported')
  assert.equal(typeof buildModerationSlopeChartSvg, 'function', 'buildModerationSlopeChartSvg should be exported')

  const savedModel = {
    constructs: [
      { id: 'iv', name: 'IV' },
      { id: 'mod', name: 'MOD' },
      { id: 'dv', name: 'DV' },
    ],
    paths: [
      { id: 'iv-dv', from: 'iv', to: 'dv', kind: 'direct' },
      { id: 'mod-moderates-iv-dv', from: 'mod', to: 'dv', kind: 'moderation', targetPathId: 'iv-dv' },
    ],
  }

  const analysisResults = {
    final_results: {
      path_coefficients: [
        { row_name: 'IV -> DV', coefficient: 0.467 },
        { row_name: 'MOD -> DV', coefficient: 0.116 },
        { row_name: 'IV*MOD -> DV', coefficient: -0.071, 'T Stat.': 2.26, 'P Value': 0.024 },
      ],
    },
    quality_criteria: {
      f_square: [
        { row_name: 'IV*MOD', DV: 0.031 },
      ],
      r_square: [
        { construct: 'DV', r2: 0.57, r2_adjusted: 0.55 },
      ],
    },
  }

  assert.equal(hasModerationInteractions(savedModel, analysisResults), true)
  assert.deepEqual(deriveModerationSummaryRows(savedModel, analysisResults), [
    {
      IV: 'IV',
      Moderator: 'MOD',
      DV: 'DV',
      Interaction: 'IV*MOD',
      beta_interaction: -0.071,
      t_stat: 2.26,
      p_value: 0.024,
      f2: 0.031,
      direction: 'Weakens IV -> DV as MOD increases',
      decision: 'Significant',
    },
  ])
  assert.deepEqual(deriveModerationSlopeRows(savedModel, analysisResults), [
    { Interaction: 'IV*MOD', DV: 'DV', Moderator_level: 'Low (-1 SD)', simple_slope: 0.538, interpretation: '0.467 - (-0.071)' },
    { Interaction: 'IV*MOD', DV: 'DV', Moderator_level: 'Mean (0)', simple_slope: 0.467, interpretation: '0.467' },
    { Interaction: 'IV*MOD', DV: 'DV', Moderator_level: 'High (+1 SD)', simple_slope: 0.396, interpretation: '0.467 + (-0.071)' },
  ])
  assert.deepEqual(deriveModerationR2ChangeRows(savedModel, analysisResults), [
    {
      DV: 'DV',
      Interaction: 'IV*MOD',
      r2_with_interaction: 0.57,
      r2_without_interaction: 0.55667,
      delta_r2: 0.01333,
      f2_interaction: 0.031,
      effect_size: 'Small',
    },
  ])
  assert.match(buildModerationSlopeChartSvg(savedModel, analysisResults), /<svg[\s\S]*Low \(-1 SD\)[\s\S]*Mean \(0\)[\s\S]*High \(\+1 SD\)/)

  const metadataLightModel = {
    constructs: savedModel.constructs,
    paths: [
      { id: 'iv-dv', from: 'iv', to: 'dv', kind: 'direct' },
    ],
  }
  assert.equal(hasModerationInteractions(metadataLightModel, analysisResults), true)
  assert.deepEqual(deriveModerationSlopeRows(metadataLightModel, analysisResults), [
    { Interaction: 'IV*MOD', DV: 'DV', Moderator_level: 'Low (-1 SD)', simple_slope: 0.538, interpretation: '0.467 - (-0.071)' },
    { Interaction: 'IV*MOD', DV: 'DV', Moderator_level: 'Mean (0)', simple_slope: 0.467, interpretation: '0.467' },
    { Interaction: 'IV*MOD', DV: 'DV', Moderator_level: 'High (+1 SD)', simple_slope: 0.396, interpretation: '0.467 + (-0.071)' },
  ])
})

await runTest('derived moderation bootstrap rows filter the interaction significance test', async () => {
  const bundled = await bundleModule('src/results/panelDerivedData.ts', 'resultsModerationBootstrapData.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/results/panelDerivedData.ts to compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { deriveModerationBootstrapRows } = bundled.module ?? {}
  const savedModel = {
    constructs: [
      { id: 'iv', name: 'IV' },
      { id: 'mod', name: 'MOD' },
      { id: 'dv', name: 'DV' },
    ],
    paths: [
      { id: 'iv-dv', from: 'iv', to: 'dv', kind: 'direct' },
      { id: 'mod-moderates-iv-dv', from: 'mod', to: 'dv', kind: 'moderation', targetPathId: 'iv-dv' },
    ],
  }
  const bootstrapResults = {
    final_results: {
      path_coefficients: [
        { row_name: 'IV -> DV', 'Original sample (O)': 0.467, 'T statistics (|O/STDEV|)': 6.2, 'P values': 0.001 },
        {
          row_name: 'IV*MOD -> DV',
          'Original sample (O)': -0.071,
          'T statistics (|O/STDEV|)': 2.26,
          'P values': 0.024,
          '2.5% CI': -0.134,
          '97.5% CI': -0.01,
          'BC 2.5% CI': -0.14,
          'BC 97.5% CI': -0.012,
        },
      ],
    },
  }

  assert.deepEqual(deriveModerationBootstrapRows(savedModel, bootstrapResults), [
    {
      IV: 'IV',
      Moderator: 'MOD',
      DV: 'DV',
      Path: 'IV*MOD -> DV',
      beta_interaction: -0.071,
      t_stat: 2.26,
      p_value: 0.024,
      ci_lower: -0.134,
      ci_upper: -0.01,
      bc_ci_lower: -0.14,
      bc_ci_upper: -0.012,
      decision: 'Significant',
    },
  ])
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
