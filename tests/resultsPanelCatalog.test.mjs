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

function collectIds(sections) {
  return sections.flatMap((section) => section.items.map((item) => item.id))
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

await runTest('results panel catalog exposes the approved mode-specific sidebars', async () => {
  const bundled = await bundleModule('src/results/panelCatalog.ts', 'resultsPanelCatalog.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/results/panelCatalog.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { getPanelSectionsForMode } = bundled.module ?? {}
  assert.equal(typeof getPanelSectionsForMode, 'function', 'getPanelSectionsForMode should be exported')

  const plsSem = getPanelSectionsForMode('pls-sem')
  const bootstrap = getPanelSectionsForMode('bootstrap')
  const plspredict = getPanelSectionsForMode('plspredict')
  const advanced = getPanelSectionsForMode('advanced')
  const moderatedPlsSem = getPanelSectionsForMode('pls-sem', { hasInteractions: true })
  const moderatedBootstrap = getPanelSectionsForMode('bootstrap', { hasInteractions: true })
  const moderatedPlsPredict = getPanelSectionsForMode('plspredict', { hasInteractions: true })
  const moderatedAdvanced = getPanelSectionsForMode('advanced', { hasInteractions: true })

  assert.deepEqual(plsSem.map((section) => section.label), [
    'Structural effects',
    'Measurement model',
    'Model quality',
    'Data & diagnostics',
    'Run & diagnostics',
  ])

  assert.ok(collectIds(plsSem).includes('cross-loadings'))
  assert.ok(!collectIds(plsSem).includes('moderation-summary'))
  assert.ok(collectIds(moderatedPlsSem).includes('moderation-summary'))
  assert.ok(collectIds(moderatedPlsSem).includes('moderation-slopes'))
  assert.ok(collectIds(moderatedPlsSem).includes('moderation-slope-chart'))
  assert.ok(collectIds(moderatedPlsSem).includes('moderation-r2-change'))
  assert.ok(!collectIds(plsSem).includes('blindfold-q-square'))
  assert.ok(collectIds(bootstrap).includes('cross-loadings'))
  assert.ok(!collectIds(bootstrap).includes('moderation-bootstrap'))
  assert.ok(collectIds(moderatedBootstrap).includes('moderation-bootstrap'))
  assert.deepEqual(bootstrap.slice(0, 2).map((section) => section.label), [
    'Bootstrap structural effects',
    'Bootstrap measurement effects',
  ])
  assert.ok(!collectIds(bootstrap).includes('model-fit'))
  assert.ok(!collectIds(bootstrap).includes('model-select'))
  assert.equal(bootstrap.find((section) => section.id === 'base-model-quality')?.defaultOpen, true)
  assert.ok(collectIds(plsSem).includes('algorithm-settings'))
  assert.ok(collectIds(bootstrap).includes('algorithm-settings'))
  assert.ok(collectIds(plspredict).includes('algorithm-settings'))
  assert.ok(collectIds(advanced).includes('algorithm-settings'))
  assert.ok(collectIds(plspredict).includes('cvpat-lv-summary'))
  assert.ok(collectIds(plspredict).includes('cvpat-mv-summary'))
  const predictiveSummaries = plspredict.find((section) => section.id === 'predictive-summaries')
  assert.ok(predictiveSummaries?.items.some((item) => item.id === 'cvpat-mv-summary'))
  assert.ok(predictiveSummaries?.items.some((item) => item.id === 'cvpat-lv-summary'))
  assert.equal(plspredict.find((section) => section.id === 'prediction-diagnostics')?.defaultOpen, true)
  assert.ok(!collectIds(moderatedAdvanced).includes('moderation-summary'))

  assert.deepEqual(advanced.map((section) => section.label), [
    'PLS-SEM Results',
    'Advanced diagnostics',
    'Run & diagnostics',
  ])

  assert.deepEqual(collectIds(advanced), [
    'path-coef',
    'outer-loadings',
    'model-fit',
    'priority-map',
    'construct-table',
    'necessity-check',
    'ceiling-lines',
    'bottleneck-table',
    'cipma-priorities',
    'algorithm-settings',
    'execution-log',
  ])
})

await runTest('results placeholder rules use the approved mode-specific copy', async () => {
  const bundled = await bundleModule('src/results/panelDiagnostics.ts', 'resultsPanelDiagnostics.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/results/panelDiagnostics.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { classifyPanelEmptyState } = bundled.module ?? {}
  assert.equal(typeof classifyPanelEmptyState, 'function', 'classifyPanelEmptyState should be exported')

  assert.equal(
    classifyPanelEmptyState({ mode: 'pls-sem', panelId: 'specific-indirect', hasRows: false, hasMediationPaths: false }),
    'No specific indirect paths in the current model.'
  )

  assert.equal(
    classifyPanelEmptyState({ mode: 'pls-sem', panelId: 'specific-indirect', hasRows: false, hasMediationPaths: true }),
    'Run Bootstrap to get significance for these paths.'
  )

  assert.equal(
    classifyPanelEmptyState({ mode: 'pls-sem', panelId: 'outer-weights', hasRows: false, hasFormativeWeights: false }),
    'No formative weights in the current model.'
  )

  assert.equal(
    classifyPanelEmptyState({ mode: 'plspredict', panelId: 'cvpat-lv-summary', hasRows: false, cvpatEnabled: false }),
    'CVPAT not run — re-run analysis with CVPAT enabled.'
  )

  assert.equal(
    classifyPanelEmptyState({ mode: 'plspredict', panelId: 'cvpat-mv-summary', hasRows: false, cvpatEnabled: false }),
    'CVPAT not run — re-run analysis with CVPAT enabled.'
  )

  assert.equal(
    classifyPanelEmptyState({ mode: 'plspredict', panelId: 'cvpat-lv-summary', hasRows: false, cvpatEnabled: true, cvpatStatus: 'missing-seminrextras' }),
    'CVPAT requires seminrExtras in the R backend. Install seminrExtras, then rerun with CVPAT enabled.'
  )

  assert.equal(
    classifyPanelEmptyState({ mode: 'plspredict', panelId: 'cvpat-mv-summary', hasRows: false, cvpatEnabled: true, cvpatStatus: 'missing-seminrextras' }),
    'CVPAT requires seminrExtras in the R backend. Install seminrExtras, then rerun with CVPAT enabled.'
  )

  assert.equal(
    classifyPanelEmptyState({ mode: 'pls-sem', panelId: 'model-select', hasRows: false, modelSelectionComparable: false }),
    'Model selection criteria are available only when comparing nested models.'
  )

  assert.equal(
    classifyPanelEmptyState({ mode: 'pls-sem', panelId: 'model-fit', hasRows: false, fitAvailable: false }),
    'Model fit is not available for this analysis yet.'
  )

  assert.equal(
    classifyPanelEmptyState({ mode: 'bootstrap', panelId: 'htmt-confidence-intervals', hasRows: false }),
    'Bootstrap HTMT confidence intervals are not available yet for this analysis.'
  )

  assert.equal(
    classifyPanelEmptyState({ mode: 'plspredict', panelId: 'plsem-mv-error-hist', hasRows: false }),
    'No prediction error distribution available yet.'
  )

  assert.equal(
    classifyPanelEmptyState({
      mode: 'advanced',
      panelId: 'priority-map',
      hasRows: false,
      advancedAnalyses: { ipma: false, nca: true, cipma: false },
    }),
    'IPMA or cIPMA was not run. Re-run Advanced analysis with IPMA or cIPMA checked.'
  )

  assert.equal(
    classifyPanelEmptyState({
      mode: 'advanced',
      panelId: 'construct-table',
      hasRows: false,
      advancedAnalyses: { ipma: false, nca: true, cipma: true },
    }),
    'IPMA was not run. Re-run Advanced analysis with IPMA checked.'
  )

  assert.equal(
    classifyPanelEmptyState({
      mode: 'advanced',
      panelId: 'necessity-check',
      hasRows: false,
      advancedAnalyses: { ipma: true, nca: false, cipma: true },
    }),
    'NCA was not run. Re-run Advanced analysis with NCA checked.'
  )

  assert.equal(
    classifyPanelEmptyState({
      mode: 'advanced',
      panelId: 'bottleneck-table',
      hasRows: false,
      advancedAnalyses: { ipma: true, nca: false, cipma: true },
    }),
    'NCA was not run. Re-run Advanced analysis with NCA checked.'
  )

  assert.equal(
    classifyPanelEmptyState({
      mode: 'advanced',
      panelId: 'ceiling-lines',
      hasRows: false,
      advancedAnalyses: { ipma: true, nca: false, cipma: true },
    }),
    'NCA was not run. Re-run Advanced analysis with NCA checked.'
  )

  assert.equal(
    classifyPanelEmptyState({
      mode: 'advanced',
      panelId: 'cipma-priorities',
      hasRows: false,
      advancedAnalyses: { ipma: true, nca: true, cipma: false },
    }),
    'cIPMA was not run. Re-run Advanced analysis with cIPMA checked.'
  )
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
