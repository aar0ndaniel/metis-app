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

await runTest('p-value tone only marks values below .05 as significant', async () => {
  const bundled = await bundleModule('src/utils/analysisPalette.ts', 'analysisPalette.significance.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/analysisPalette.ts to compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { ANALYSIS_TONE_HEX, getPValueTone, getPValueColor, parseSignificancePValue } = bundled.module ?? {}

  assert.equal(getPValueTone(0.049), 'pass')
  assert.equal(getPValueTone(0.05), 'fail')
  assert.equal(getPValueTone(0.08), 'fail')
  assert.equal(getPValueTone(0.1), 'fail')
  assert.equal(getPValueTone(null), undefined)

  assert.equal(getPValueColor(0.049), ANALYSIS_TONE_HEX.pass)
  assert.equal(getPValueColor(0.08), ANALYSIS_TONE_HEX.fail)
  assert.equal(parseSignificancePValue('<0.001'), 0.0009)
  assert.equal(parseSignificancePValue('< 0.05'), 0.0499)
})

await runTest('effect charts use success green for p < .05 and danger for all non-significant p-values', async () => {
  const bundled = await bundleModule('src/components/ResultsCharts.tsx', 'resultsCharts.significance.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/components/ResultsCharts.tsx to compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { buildPathCoefItems, buildForestItems } = bundled.module ?? {}

  const pathItems = buildPathCoefItems([
    { path: 'A -> B', coefficient: 0.3, pValue: 0.049 },
    { path: 'B -> C', coefficient: 0.2, pValue: 0.05 },
    { path: 'C -> D', coefficient: 0.1, pValue: 0.08 },
  ])

  assert.equal(pathItems[0].color, '#87976B')
  assert.equal(pathItems[1].color, '#D96B4D')
  assert.equal(pathItems[2].color, '#D96B4D')

  const forestItems = buildForestItems([
    { path: 'A -> B', estimate: 0.3, pValue: '< 0.05', ci25: 0.1, ci975: 0.5 },
    { path: 'B -> C', estimate: 0.2, pValue: 0.06, ci25: -0.1, ci975: 0.4 },
  ])

  assert.equal(forestItems[0].color, '#87976B')
  assert.equal(forestItems[1].color, '#D96B4D')
})

await runTest('results table and path diagram no longer include marginal p-value coloring', async () => {
  const resultsViewSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')
  const pathDiagramSource = await fs.readFile(path.join(workspaceRoot, 'src/components/PathDiagram.tsx'), 'utf8')

  assert.doesNotMatch(resultsViewSource, /parsed\s*<\s*0\.10/)
  assert.doesNotMatch(resultsViewSource, /Marginal/)
  assert.doesNotMatch(pathDiagramSource, /tone === 'neutral'\)\s*return 'pd-arr-amber'/)
})

await runTest('bootstrap result tables color effect estimate cells from row significance', async () => {
  const resultsViewSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')

  assert.match(
    resultsViewSource,
    /function\s+isSignificanceEffectHeader\s*\(\s*header:\s*string\s*\)/,
    'Results tables should identify effect estimate columns, not only p-value columns.'
  )

  assert.match(
    resultsViewSource,
    /const\s+isEffectCell\s*=\s*isSignificanceEffectHeader\(header\)/,
    'Generic result table cells should check whether a column contains an effect estimate.'
  )

  assert.match(
    resultsViewSource,
    /isBootstrapSignificancePanel\s*&&\s*\(isPCol\s*\|\|\s*isEffectCell\)/,
    'Bootstrap significance tables should color both p-value and effect estimate cells.'
  )

  assert.match(
    resultsViewSource,
    /const\s+cellHeader\s*=\s*headers\[cellIndex\s*\+\s*1\]/,
    'Bootstrap path/effects table should inspect each data column header before applying significance coloring.'
  )

  assert.match(
    resultsViewSource,
    /const\s+cellHeader\s*=\s*headers\[cellIndex\s*\+\s*2\]/,
    'Bootstrap loading/weight table should inspect each data column header before applying significance coloring.'
  )

  assert.match(
    resultsViewSource,
    /significanceCellClass\(\s*row\.pValue,[\s\S]*?isPValueHeader\(cellHeader\)\s*\|\|\s*isSignificanceEffectHeader\(cellHeader\)/,
    'Dedicated bootstrap tables should color p-value and effect estimate cells from the row p-value.'
  )
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
