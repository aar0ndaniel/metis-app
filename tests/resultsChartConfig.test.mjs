import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')
const resultsViewSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')
const resultsChartsSource = await fs.readFile(path.join(workspaceRoot, 'src/components/ResultsCharts.tsx'), 'utf8')

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

await runTest('results chart config supports PLSpredict summary and comparison panels', async () => {
  const bundled = await bundleModule('src/components/ResultsCharts.tsx', 'resultsChartConfig.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/components/ResultsCharts.tsx to compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { CHART_SUPPORTED_PANELS, buildChartSvgForPanel, getChartConfig, shouldExportChart } = bundled.module ?? {}
  assert.ok(CHART_SUPPORTED_PANELS instanceof Set, 'CHART_SUPPORTED_PANELS should be exported as a Set')
  assert.equal(typeof buildChartSvgForPanel, 'function', 'buildChartSvgForPanel should be exported')
  assert.equal(typeof getChartConfig, 'function', 'getChartConfig should be exported')
  assert.equal(typeof shouldExportChart, 'function', 'shouldExportChart should be exported')

  assert.ok(CHART_SUPPORTED_PANELS.has('path-coef'))
  assert.ok(CHART_SUPPORTED_PANELS.has('f-square'))
  assert.ok(CHART_SUPPORTED_PANELS.has('plspredict-mv-summary'))
  assert.ok(CHART_SUPPORTED_PANELS.has('pls-lm-comparison'))
  assert.ok(CHART_SUPPORTED_PANELS.has('q2-predict'))
  assert.ok(CHART_SUPPORTED_PANELS.has('plsem-mv-error-hist'))
  assert.ok(CHART_SUPPORTED_PANELS.has('plsem-lv-error-hist'))
  assert.ok(CHART_SUPPORTED_PANELS.has('priority-map'))
  assert.ok(CHART_SUPPORTED_PANELS.has('necessity-check'))
  assert.ok(CHART_SUPPORTED_PANELS.has('ceiling-lines'))
  assert.ok(CHART_SUPPORTED_PANELS.has('cipma-priorities'))
  assert.ok(CHART_SUPPORTED_PANELS.has('bottleneck-table'))

  assert.equal(getChartConfig('pls-sem', 'path-coef')?.chartKind, 'horizontal-bar')
  assert.equal(getChartConfig('bootstrap', 'path-coef')?.chartKind, 'forest-plot')
  assert.equal(getChartConfig('plspredict', 'q2-predict')?.chartKind, 'dot-plot')
  assert.equal(getChartConfig('plspredict', 'plsem-mv-error-hist')?.chartKind, 'histogram')
  assert.equal(getChartConfig('pls-sem', 'cross-loadings')?.chartKind, 'heatmap')
  assert.equal(getChartConfig('advanced', 'priority-map')?.chartKind, 'scatter-quadrant')
  assert.equal(getChartConfig('advanced', 'necessity-check')?.chartKind, 'horizontal-bar')
  assert.equal(getChartConfig('advanced', 'ceiling-lines')?.chartKind, 'scatter-line')
  assert.equal(getChartConfig('advanced', 'cipma-priorities')?.chartKind, 'scatter-quadrant')
  assert.equal(getChartConfig('advanced', 'bottleneck-table')?.chartKind, 'heatmap')
  assert.equal(getChartConfig('pls-sem', 'path-coef')?.computeOnDemand, true)
  assert.equal(getChartConfig('plspredict', 'plsem-mv-error-hist')?.supportsExpand, true)
  assert.equal(getChartConfig('advanced', 'bottleneck-table')?.computeOnDemand, true)
  assert.ok(Number.isFinite(getChartConfig('pls-sem', 'path-coef')?.defaultPreviewHeight))
  assert.equal(shouldExportChart('pls-sem', 'path-coef'), true)
  assert.equal(shouldExportChart('advanced', 'cipma-priorities'), true)
  assert.equal(shouldExportChart('advanced', 'bottleneck-table'), true)
  assert.equal(shouldExportChart('pls-sem', 'execution-log'), false)

  const mockResults = {
    final_results: {
      plspredict_mv_summary: [
        { Indicator: 'SAT1', 'Q²predict': 0.41, PLS_SEM_RMSE: 0.31, PLS_SEM_MAE: 0.24, LM_RMSE: 0.38, LM_MAE: 0.29 },
        { Indicator: 'SAT2', 'Q²predict': 0.36, PLS_SEM_RMSE: 0.28, PLS_SEM_MAE: 0.20, LM_RMSE: 0.35, LM_MAE: 0.26 },
      ],
      plspredict_lv_summary: [
        { Construct: 'Satisfaction', 'Q²predict': 0.49, PLS_SEM_RMSE: 0.25, PLS_SEM_MAE: 0.19, LM_RMSE: 0.33, LM_MAE: 0.24 },
      ],
    },
  }

  const mvSummarySvg = buildChartSvgForPanel('plspredict-mv-summary', 'plspredict', mockResults)
  const comparisonSvg = buildChartSvgForPanel('pls-lm-comparison', 'plspredict', mockResults)
  const q2PredictSvg = buildChartSvgForPanel('q2-predict', 'plspredict', mockResults)
  const wrappedQ2PredictSvg = buildChartSvgForPanel('q2-predict', 'plspredict', {
    success: true,
    results: mockResults,
  })
  const alternateComparisonSvg = buildChartSvgForPanel('pls-lm-comparison', 'plspredict', {
    final_results: {
      plspredict_mv_summary: [
        { Item: 'SAT3', Q2_predict: 0.28, RMSE_PLS: 0.44, MAE_PLS: 0.31, RMSE_LM: 0.49, MAE_LM: 0.37 },
      ],
    },
  })
  const mvHistogramSvg = buildChartSvgForPanel('plsem-mv-error-hist', 'plspredict', {
    final_results: {
      mv_predictions_and_errors: [
        { Indicator: 'SAT1', Error: 0.12 },
        { Indicator: 'SAT2', Error: -0.05 },
        { Indicator: 'SAT3', Error: 0.09 },
        { Indicator: 'SAT4', Error: -0.02 },
      ],
    },
  })
  const prioritySvg = buildChartSvgForPanel('priority-map', 'advanced', {
    final_results: {
      priority_map: [
        { Construct: 'PEOU', Importance: 0.31, Performance: 61.4, Priority: 'Concentrate here', Necessary: true },
        { Construct: 'PU', Importance: 0.48, Performance: 74.2, Priority: 'Keep up', Necessary: false },
      ],
    },
  })
  const cipmaSvg = buildChartSvgForPanel('cipma-priorities', 'advanced', {
    final_results: {
      cipma_priorities: [
        { Construct: 'PEOU', Importance: 0.29, Performance: 58.1, Priority: 'Concentrate here', Necessary: true },
        { Construct: 'PU', Importance: 0.43, Performance: 76.6, Priority: 'Keep up', Necessary: false },
      ],
    },
  })
  const bottleneckSvg = buildChartSvgForPanel('bottleneck-table', 'advanced', {
    final_results: {
      bottleneck_table: [
        { Method: 'CE-FDH', row_name: '10', PEOU: 0, PU: 5 },
        { Method: 'CE-FDH', row_name: '20', PEOU: 8, PU: 15 },
        { Method: 'CR-FDH', row_name: '10', PEOU: 2, PU: 7 },
      ],
    },
  })
  const necessitySvg = buildChartSvgForPanel('necessity-check', 'advanced', {
    final_results: {
      necessity_check: [
        { Condition: 'PEOU', Method: 'CE-FDH', D: 0.11, P_Value: 0.032, Necessary: true },
        { Condition: 'PEOU', Method: 'CR-FDH', D: 0.09, P_Value: 0.041, Necessary: false },
      ],
    },
  })
  const ceilingSvg = buildChartSvgForPanel('ceiling-lines', 'advanced', {
    final_results: {
      ceiling_lines: [
        { Condition: 'PEOU', Target: 'BI', Series: 'Observed', X: 0.1, Y: 0.2 },
        { Condition: 'PEOU', Target: 'BI', Series: 'Observed', X: 0.4, Y: 0.5 },
        { Condition: 'PEOU', Target: 'BI', Series: 'CE-FDH', X: 0.1, Y: 0.2 },
        { Condition: 'PEOU', Target: 'BI', Series: 'CE-FDH', X: 0.4, Y: 0.5 },
        { Condition: 'PEOU', Target: 'BI', Series: 'CR-FDH', X: 0.1, Y: 0.25 },
        { Condition: 'PEOU', Target: 'BI', Series: 'CR-FDH', X: 0.4, Y: 0.45 },
      ],
    },
  })

  assert.match(String(mvSummarySvg), /<svg/i)
  assert.match(String(comparisonSvg), /<svg/i)
  assert.match(String(alternateComparisonSvg), /<svg/i)
  assert.match(String(alternateComparisonSvg), /SAT3/)
  assert.match(String(q2PredictSvg), /<svg/i)
  assert.match(String(wrappedQ2PredictSvg), /<svg/i)
  assert.match(String(mvHistogramSvg), /<svg/i)
  assert.match(String(prioritySvg), /<svg/i)
  assert.match(String(necessitySvg), /<svg/i)
  assert.match(String(necessitySvg), /PEOU/)
  assert.match(String(necessitySvg), /CE-FDH/)
  assert.match(String(necessitySvg), /CR-FDH/)
  assert.match(String(ceilingSvg), /<svg/i)
  assert.match(String(ceilingSvg), /PEOU/)
  assert.match(String(cipmaSvg), /<svg/i)
  assert.match(String(cipmaSvg), /Necessary \+ sufficient/)
  assert.match(String(cipmaSvg), /Sufficient only/)
  assert.match(String(bottleneckSvg), /<svg/i)
  assert.match(String(bottleneckSvg), /CE-FDH/)
  assert.match(String(bottleneckSvg), /CR-FDH/)
})

await runTest('results view limits inline charts to advanced panels and PLSpredict error histograms', async () => {
  assert.match(
    resultsViewSource,
    /import\s*\{\s*ResultChart\s*\}\s*from\s*['"]\.\.\/components\/ResultsCharts['"]/,
    'ResultsView should import the shared ResultChart renderer.'
  )
  assert.match(
    resultsViewSource,
    /analysisMode === 'advanced'/,
    'ResultsView should render inline charts for Advanced Analysis panels.'
  )
  assert.match(
    resultsViewSource,
    /PLSPREDICT_ERROR_HISTOGRAM_PANELS = \['plsem-mv-error-hist', 'plsem-lv-error-hist'\]/,
    'ResultsView should render the PLSpredict MV error histogram chart.'
  )
  assert.match(
    resultsViewSource,
    /isPlsPredictErrorHistogram\(selectedPanel\)/,
    'ResultsView should render the PLSpredict LV error histogram chart.'
  )
  assert.doesNotMatch(
    resultsViewSource,
    /getChartConfig\(analysisMode,\s*selectedPanel\)/,
    'ResultsView should not render every chart-registry panel inline.'
  )
  assert.match(
    resultsViewSource,
    /<ResultChart[\s\S]*selectedPanel=\{selectedPanel\}[\s\S]*analysisMode=\{analysisMode\}/,
    'ResultsView should render ResultChart for the selected inline chart panels.'
  )
})

await runTest('advanced chart panels use a header table/chart switch instead of stacking chart over table', async () => {
  assert.match(
    resultsViewSource,
    /const ADVANCED_INLINE_CHART_PANELS = new Set\(\[/,
    'ResultsView should keep the Advanced Analysis chart panel list explicit.'
  )
  ;[
    'path-coef',
    'priority-map',
    'necessity-check',
    'ceiling-lines',
    'cipma-priorities',
    'bottleneck-table',
  ].forEach((panelId) => {
    assert.match(resultsViewSource, new RegExp(`'${panelId}'`), `Advanced chart panel ${panelId} should be included.`)
  })
  assert.match(
    resultsViewSource,
    /type AdvancedPanelViewMode = 'table' \| 'chart'/,
    'Advanced chart panels should use a typed table/chart view mode.'
  )
  assert.match(
    resultsViewSource,
    /advancedPanelViewModes/,
    'ResultsView should remember table/chart selection by panel.'
  )
  assert.match(
    resultsViewSource,
    /hasAdvancedPanelChart/,
    'ResultsView should only show the table/chart switch when an advanced panel has a chart.'
  )
  assert.match(
    resultsViewSource,
    /advancedPanelViewMode === 'chart'/,
    'Advanced charts should render only when the user selects Chart.'
  )
  assert.match(
    resultsViewSource,
    /const CHART_ONLY_ADVANCED_PANELS = new Set\(\[\s*'ceiling-lines',?\s*\]\)/,
    'Ceiling lines should be registered as a chart-only Advanced Analysis panel.'
  )
  assert.match(
    resultsViewSource,
    /const isAdvancedChartOnlyPanel = analysisMode === 'advanced' && CHART_ONLY_ADVANCED_PANELS\.has\(selectedPanel\)/,
    'ResultsView should identify chart-only advanced panels separately from toggleable chart panels.'
  )
  assert.match(
    resultsViewSource,
    /const advancedPanelViewMode: AdvancedPanelViewMode = isAdvancedChartOnlyPanel\s*\?\s*'chart'\s*:\s*hasAdvancedPanelChart[\s\S]*advancedPanelViewModes\[advancedPanelViewKey\] \?\? 'table'/,
    'Chart-only advanced panels should force chart view instead of using stored table/chart state.'
  )
  assert.match(
    resultsViewSource,
    /\{hasAdvancedPanelChart && !isAdvancedChartOnlyPanel && \(/,
    'Chart-only advanced panels should not show the table/chart switch.'
  )
  assert.match(
    resultsViewSource,
    /const shouldRenderTableContent = !isAdvancedChartOnlyPanel && !\(hasAdvancedPanelChart && advancedPanelViewMode === 'chart'\)/,
    'Chart-only advanced panels should suppress table content.'
  )
  assert.match(
    resultsViewSource,
    /const shouldRenderTableActions = !isAdvancedChartOnlyPanel/,
    'Chart-only advanced panels should hide table copy/download actions.'
  )
  assert.match(
    resultsViewSource,
    /modeOption === 'table' \? 'Table' : 'Chart'/,
    'The header switch should expose clear Table and Chart labels.'
  )
  assert.match(
    resultsViewSource,
    /aria-pressed=\{active\}/,
    'The table/chart switch should expose pressed state for accessibility.'
  )
  assert.match(
    resultsViewSource,
    /isPlsPredictErrorHistogram/,
    'PLSpredict error histogram panels should remain chart-focused.'
  )
  assert.match(
    resultsViewSource,
    /'plsem-mv-error-hist', 'plsem-lv-error-hist'/,
    'Histogram panels should not fall through to the generic table under the chart.'
  )
})

await runTest('NCA necessity table labels D as effect size d', async () => {
  assert.match(
    resultsViewSource,
    /function formatResultTableHeader\(header: string, selectedPanel\?: string\): string/,
    'ResultsView should centralize table header labels.'
  )
  assert.match(
    resultsViewSource,
    /selectedPanel === 'necessity-check'[\s\S]*normalizedHeader === 'd'[\s\S]*return 'Effect size \(d\)'/,
    'Necessity-check D column should display as Effect size (d), not a bare D.'
  )
  assert.match(
    resultsViewSource,
    /formatResultTableHeader\(h, selectedPanel\)/,
    'Exported tables should use the same readable necessity-check header label.'
  )
  assert.match(
    resultsViewSource,
    /formatResultTableHeader\(header, selectedPanel\)/,
    'Visible tables should use the same readable necessity-check header label.'
  )
})

await runTest('advanced charts use clearer heatmap cells and stronger ceiling graph markers', async () => {
  assert.match(
    resultsChartsSource,
    /function heatColor\(value: number, minValue: number, maxValue: number\)/,
    'Heatmap colors should normalize against the visible value range.'
  )
  assert.match(
    resultsChartsSource,
    /const cellWidth = 52/,
    'Heatmap cells should be wider than the old cramped square cells.'
  )
  assert.match(
    resultsChartsSource,
    /const cellGap = 4/,
    'Heatmap cells should use visible gutters to separate values.'
  )
  assert.match(
    resultsChartsSource,
    /CEILING_SERIES_STYLES/,
    'Ceiling line graph should use explicit styles for each series.'
  )
  assert.match(
    resultsChartsSource,
    /strokeWidth=\{1\.5\}/,
    'Ceiling markers should have a visible contrasting outline.'
  )
  assert.match(
    resultsChartsSource,
    /transform=\{`rotate\(45/,
    'CR-FDH markers should use a distinct diamond shape.'
  )
  assert.match(
    resultsChartsSource,
    /function stepLinePath\(points: CeilingPoint\[\]/,
    'CE-FDH chart rendering should use a dedicated step path helper.'
  )
  assert.match(
    resultsChartsSource,
    /stepLinePath\(group\.ceFdh/,
    'CE-FDH inline chart should render as a step function.'
  )
  assert.match(
    resultsChartsSource,
    /stepLinePath\(group\.ceFdh, xOf, yOf\)/,
    'CE-FDH export chart should render as a step function.'
  )
  assert.match(
    resultsChartsSource,
    /const CIPMA_NECESSARY_COLOR/,
    'cIPMA priorities should use seminrExtras-specific necessary marker styling.'
  )
  assert.match(
    resultsChartsSource,
    /const CIPMA_SUFFICIENT_COLOR/,
    'cIPMA priorities should use seminrExtras-specific sufficient-only marker styling.'
  )
  assert.match(
    resultsChartsSource,
    /variant === 'cipma'/,
    'Priority map renderer should switch into seminrExtras cIPMA marker semantics for cIPMA priorities.'
  )
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
