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

await runTest('panel table helpers split PLSpredict summaries and expose matrix/list support', async () => {
  const bundled = await bundleModule('src/results/panelTableData.ts', 'panelTableData.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/results/panelTableData.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const {
    getPanelTableViews,
    getDefaultPanelTableView,
    buildMeasurementMatrix,
    buildConstructIndicatorLookup,
    extractQ2PredictRows,
    extractPlsLmComparisonRows,
    formatBottleneckDisplayValue,
    formatBottleneckOutcomeLevel,
    formatPreciseNumber,
    isBottleneckOutcomeField,
    normalizeBottleneckRowsForDisplay,
    normalizeIndexedTableLabel,
    normalizeBootstrapSignificanceRows,
    isBootstrapSignificancePanel,
    shouldRenderBlankPanelCell,
    buildIndirectEffectPairLookup,
    buildTotalEffectPairLookup,
  } = bundled.module ?? {}

  assert.equal(typeof getPanelTableViews, 'function')
  assert.equal(typeof getDefaultPanelTableView, 'function')
  assert.equal(typeof buildMeasurementMatrix, 'function')
  assert.equal(typeof buildConstructIndicatorLookup, 'function')
  assert.equal(typeof extractQ2PredictRows, 'function')
  assert.equal(typeof extractPlsLmComparisonRows, 'function')
  assert.equal(typeof formatBottleneckDisplayValue, 'function')
  assert.equal(typeof formatBottleneckOutcomeLevel, 'function')
  assert.equal(typeof formatPreciseNumber, 'function')
  assert.equal(typeof isBottleneckOutcomeField, 'function')
  assert.equal(typeof normalizeBottleneckRowsForDisplay, 'function')
  assert.equal(typeof normalizeIndexedTableLabel, 'function')
  assert.equal(typeof normalizeBootstrapSignificanceRows, 'function')
  assert.equal(typeof isBootstrapSignificancePanel, 'function')
  assert.equal(typeof shouldRenderBlankPanelCell, 'function')
  assert.equal(typeof buildIndirectEffectPairLookup, 'function')
  assert.equal(typeof buildTotalEffectPairLookup, 'function')

  assert.deepEqual(getPanelTableViews('path-coef'), ['matrix', 'list'])
  assert.deepEqual(getPanelTableViews('outer-loadings'), ['list', 'matrix'])
  assert.deepEqual(getPanelTableViews('outer-weights'), ['list', 'matrix'])
  assert.deepEqual(getPanelTableViews('reliability'), [])
  assert.equal(getDefaultPanelTableView('path-coef'), 'matrix')
  assert.equal(getDefaultPanelTableView('outer-loadings'), 'list')

  assert.deepEqual(
    buildMeasurementMatrix([
      { construct: 'Satisfaction', indicator: 'SAT1', loading: 0.812 },
      { construct: 'Satisfaction', indicator: 'SAT2', loading: 0.776 },
      { construct: 'Trust', indicator: 'TR1', loading: 0.654 },
    ]),
    {
      cols: ['Satisfaction', 'Trust'],
      matRows: [
        { id: 'SAT1', data: { Satisfaction: 0.812, Trust: null } },
        { id: 'SAT2', data: { Satisfaction: 0.776, Trust: null } },
        { id: 'TR1', data: { Satisfaction: null, Trust: 0.654 } },
      ],
    }
  )

  const rawSummaryRows = [
    { Indicator: 'SAT1', Q2predict: 0.412, 'PLS-SEM_RMSE': 0.31, 'PLS-SEM_MAE': 0.24, LM_RMSE: 0.38, LM_MAE: 0.29 },
    { Indicator: 'SAT2', Q2predict: 0.365, PLS_SEM_RMSE: 0.28, PLS_SEM_MAE: 0.2, LM_RMSE: 0.35, LM_MAE: 0.26 },
  ]

  assert.deepEqual(extractQ2PredictRows(rawSummaryRows), [
    { label: 'SAT1', q2Predict: 0.412 },
    { label: 'SAT2', q2Predict: 0.365 },
  ])
  assert.deepEqual(extractQ2PredictRows([{ Indicator: 'SAT3', Q2predict: null }]), [])

  assert.deepEqual(extractPlsLmComparisonRows(rawSummaryRows), [
    { label: 'SAT1', plsRmse: 0.31, plsMae: 0.24, lmRmse: 0.38, lmMae: 0.29 },
    { label: 'SAT2', plsRmse: 0.28, plsMae: 0.2, lmRmse: 0.35, lmMae: 0.26 },
  ])

  const keyedSummaryRows = [
    {
      key: '1',
      value: {
        Indicator: 'SAT1',
        'Q2.predict': '0.412',
        'PLS-SEM RMSE': '0.31',
        'PLS-SEM MAE': '0.24',
        'LM RMSE': '0.38',
        'LM MAE': '0.29',
      },
    },
  ]
  assert.deepEqual(extractQ2PredictRows(keyedSummaryRows), [
    { label: 'SAT1', q2Predict: 0.412 },
  ])
  assert.deepEqual(extractPlsLmComparisonRows(keyedSummaryRows), [
    { label: 'SAT1', plsRmse: 0.31, plsMae: 0.24, lmRmse: 0.38, lmMae: 0.29 },
  ])

  const alternateSummaryRows = [
    {
      Item: 'SAT3',
      Q2_predict: '0.287',
      RMSE_PLS: '0.44',
      MAE_PLS: '0.31',
      RMSE_LM: '0.49',
      MAE_LM: '0.37',
    },
  ]
  assert.deepEqual(extractQ2PredictRows(alternateSummaryRows), [
    { label: 'SAT3', q2Predict: 0.287 },
  ])
  assert.deepEqual(extractPlsLmComparisonRows(alternateSummaryRows), [
    { label: 'SAT3', plsRmse: 0.44, plsMae: 0.31, lmRmse: 0.49, lmMae: 0.37 },
  ])

  const longSummaryRows = [
    { Indicator: 'SAT4', Metric: 'Q2_predict', Value: '0.221' },
    { Indicator: 'SAT4', Metric: 'RMSE_PLS', Value: '0.51' },
    { Indicator: 'SAT4', Metric: 'MAE_PLS', Value: '0.38' },
    { Indicator: 'SAT4', Metric: 'RMSE_LM', Value: '0.58' },
    { Indicator: 'SAT4', Metric: 'MAE_LM', Value: '0.42' },
  ]
  assert.deepEqual(extractQ2PredictRows(longSummaryRows), [
    { label: 'SAT4', q2Predict: 0.221 },
  ])
  assert.deepEqual(extractPlsLmComparisonRows(longSummaryRows), [
    { label: 'SAT4', plsRmse: 0.51, plsMae: 0.38, lmRmse: 0.58, lmMae: 0.42 },
  ])

  const metricMapSummaryRows = [
    { key: 'Q2_predict', value: { SAT5: '0.199' } },
    { key: 'RMSE_PLS', value: { SAT5: '0.47' } },
    { key: 'MAE_PLS', value: { SAT5: '0.34' } },
    { key: 'RMSE_LM', value: { SAT5: '0.52' } },
    { key: 'MAE_LM', value: { SAT5: '0.39' } },
  ]
  assert.deepEqual(extractQ2PredictRows(metricMapSummaryRows), [
    { label: 'SAT5', q2Predict: 0.199 },
  ])
  assert.deepEqual(extractPlsLmComparisonRows(metricMapSummaryRows), [
    { label: 'SAT5', plsRmse: 0.47, plsMae: 0.34, lmRmse: 0.52, lmMae: 0.39 },
  ])

  const columnarSummaryRows = [
    { key: 'Indicator', value: ['SAT6', 'SAT7'] },
    { key: 'Q2predict', value: ['0.176', '0.214'] },
    { key: 'PLS-SEM_RMSE', value: ['0.41', '0.39'] },
    { key: 'PLS-SEM_MAE', value: ['0.30', '0.28'] },
    { key: 'LM_RMSE', value: ['0.48', '0.46'] },
    { key: 'LM_MAE', value: ['0.35', '0.33'] },
  ]
  assert.deepEqual(extractQ2PredictRows(columnarSummaryRows), [
    { label: 'SAT6', q2Predict: 0.176 },
    { label: 'SAT7', q2Predict: 0.214 },
  ])
  assert.deepEqual(extractPlsLmComparisonRows(columnarSummaryRows), [
    { label: 'SAT6', plsRmse: 0.41, plsMae: 0.3, lmRmse: 0.48, lmMae: 0.35 },
    { label: 'SAT7', plsRmse: 0.39, plsMae: 0.28, lmRmse: 0.46, lmMae: 0.33 },
  ])

  assert.equal(formatBottleneckDisplayValue('NN'), 'NN')
  assert.equal(formatBottleneckDisplayValue(null), 'NN')
  assert.equal(formatBottleneckDisplayValue(0), '0.00')
  assert.equal(formatBottleneckDisplayValue('0.000'), '0.00')
  assert.equal(formatBottleneckDisplayValue(12.3456), '12.35')
  assert.equal(formatBottleneckOutcomeLevel(10), '10')
  assert.equal(formatBottleneckOutcomeLevel(12.5), '12.50')
  assert.equal(isBottleneckOutcomeField('Outcome_Level'), true)

  assert.deepEqual(
    normalizeBottleneckRowsForDisplay([
      { Method: 'CR-FDH', Ceiling: 'cr_fdh', ATT: 0, PEOU: 'NN', PU: 'NN', SE: 'NN' },
      { Method: 'CR-FDH', Ceiling: 'cr_fdh', ATT: 10, PEOU: 'NN', PU: 0.4, SE: 32.6 },
      { Method: 'CR-FDH', Ceiling: 'cr_fdh', ATT: 20, PEOU: 'NN', PU: 0.4, SE: 32.6 },
    ]),
    [
      { Method: 'NCA', Ceiling: 'CR-FDH', Outcome_Level: 0, ATT: 'NN', PEOU: 'NN', PU: 'NN', SE: 'NN' },
      { Method: 'NCA', Ceiling: 'CR-FDH', Outcome_Level: 10, ATT: 'NN', PEOU: 'NN', PU: 0.4, SE: 32.6 },
      { Method: 'NCA', Ceiling: 'CR-FDH', Outcome_Level: 20, ATT: 'NN', PEOU: 'NN', PU: 0.4, SE: 32.6 },
    ],
  )

  assert.equal(formatPreciseNumber(0.0004), '0.000400')
  assert.equal(formatPreciseNumber(-0.0004), '-0.000400')
  assert.equal(formatPreciseNumber(0.2451), '0.245')

  const constructLookup = buildConstructIndicatorLookup({
    constructs: [
      { id: 'c1', name: 'Satisfaction', indicators: [{ name: 'SAT1' }, { name: 'SAT2' }] },
      { id: 'c2', name: 'Trust', indicators: ['TR1', 'TR2'] },
    ],
  })

  assert.deepEqual(constructLookup.get('Satisfaction'), ['SAT1', 'SAT2'])
  assert.deepEqual(constructLookup.get('c1'), ['SAT1', 'SAT2'])
  assert.deepEqual(constructLookup.get('Trust'), ['TR1', 'TR2'])
  assert.equal(normalizeIndexedTableLabel('1', ['SAT1', 'SAT2']), 'SAT1')
  assert.equal(normalizeIndexedTableLabel('2', ['SAT1', 'SAT2']), 'SAT2')
  assert.equal(normalizeIndexedTableLabel('0', ['SAT1', 'SAT2'], 0), 'SAT1')
  assert.equal(normalizeIndexedTableLabel('1', ['SAT1', 'SAT2'], 0), 'SAT2')
  assert.equal(normalizeIndexedTableLabel('v2', ['SAT1', 'SAT2']), 'SAT2')
  assert.equal(normalizeIndexedTableLabel('SAT1', ['SAT1', 'SAT2']), 'SAT1')

  assert.equal(isBootstrapSignificancePanel('path-coef'), true)
  assert.equal(isBootstrapSignificancePanel('specific-indirect'), true)
  assert.equal(isBootstrapSignificancePanel('outer-loadings'), true)
  assert.equal(isBootstrapSignificancePanel('r-square'), false)
  assert.equal(shouldRenderBlankPanelCell('f-square', 'GAI', 0), true)
  assert.equal(shouldRenderBlankPanelCell('f-square', 'GAI', '0.000'), true)
  assert.equal(shouldRenderBlankPanelCell('f-square', 'row', 0), false)
  assert.equal(shouldRenderBlankPanelCell('r-square', 'R²', 0), false)

  const indirectPairs = buildIndirectEffectPairLookup({
    constructs: [
      { id: 'peou', name: 'PEOU' },
      { id: 'att', name: 'ATT' },
      { id: 'se', name: 'SE' },
      { id: 'pu', name: 'PU' },
    ],
    paths: [
      { from: 'peou', to: 'att' },
      { from: 'att', to: 'se' },
      { from: 'pu', to: 'att' },
    ],
  })
  assert.equal(indirectPairs.has('PEOU\u0000SE'), true)
  assert.equal(indirectPairs.has('PEOU\u0000ATT'), false)
  assert.equal(
    shouldRenderBlankPanelCell('total-indirect', 'ATT', 0, { rowLabel: 'PEOU', indirectEffectPairs: indirectPairs }),
    true,
  )
  assert.equal(
    shouldRenderBlankPanelCell('total-indirect', 'ATT', 0.216, { rowLabel: 'PEOU', indirectEffectPairs: indirectPairs }),
    true,
  )
  assert.equal(
    shouldRenderBlankPanelCell('total-indirect', 'SE', 0, { rowLabel: 'PEOU', indirectEffectPairs: indirectPairs }),
    false,
  )
  assert.equal(
    shouldRenderBlankPanelCell('total-indirect', 'SE', 0.216, { rowLabel: 'PU', indirectEffectPairs: indirectPairs }),
    false,
  )

  const totalEffectPairs = buildTotalEffectPairLookup({
    constructs: [
      { id: 'peou', name: 'PEOU' },
      { id: 'att', name: 'ATT' },
      { id: 'se', name: 'SE' },
      { id: 'pu', name: 'PU' },
    ],
    paths: [
      { from: 'peou', to: 'att' },
      { from: 'att', to: 'se' },
      { from: 'pu', to: 'att' },
    ],
  })
  assert.equal(totalEffectPairs.has('PEOU\u0000ATT'), true)
  assert.equal(totalEffectPairs.has('PEOU\u0000SE'), true)
  assert.equal(totalEffectPairs.has('SE\u0000ATT'), false)
  assert.equal(
    shouldRenderBlankPanelCell('total-effects', 'ATT', 0.216, { rowLabel: 'SE', totalEffectPairs }),
    true,
  )
  assert.equal(
    shouldRenderBlankPanelCell('total-effects', 'ATT', 0, { rowLabel: 'PEOU', totalEffectPairs }),
    false,
  )
  assert.equal(
    shouldRenderBlankPanelCell('total-effects', 'SE', 0.583, { rowLabel: 'PEOU', totalEffectPairs }),
    false,
  )

  assert.deepEqual(
    normalizeBootstrapSignificanceRows([
      {
        row_name: 'PEOU  ->  ATT',
        'Original.Est.': 0.3376,
        'Bootstrap.Mean': 0.3397,
        'Bootstrap.SD': 0.1021,
        'T.Stat.': 3.3076,
        'X2.5..CI': 0.1498,
        'X97.5..CI': 0.5153,
        'Bootstrap.P.Val': 0,
        'X2.5..CI.BC': 0.141,
        'X97.5..CI.BC': 0.524,
      },
    ]),
    [
      {
        label: 'PEOU  ->  ATT',
        originalEst: 0.3376,
        bootstrapMean: 0.3397,
        bootstrapSD: 0.1021,
        tStat: 3.3076,
        pValue: 0,
        bias: 0.0021,
        ciLower: 0.1498,
        ciUpper: 0.5153,
        bcCiLower: 0.141,
        bcCiUpper: 0.524,
      },
    ]
  )

  assert.deepEqual(
    normalizeBootstrapSignificanceRows([
      {
        Path: 'GAI -> SLM',
        'Original Est.': 0.173,
        'Bootstrap Mean': 0.181,
        'Bootstrap SD': 0.044,
        'T Stat.': 3.932,
        '5% CI': 0.097,
        '95% CI': 0.252,
        '5% CI (BC)': 0.089,
        '95% CI (BC)': 0.263,
        'Bootstrap P Val': 0.001,
      },
    ]),
    [
      {
        label: 'GAI -> SLM',
        originalEst: 0.173,
        bootstrapMean: 0.181,
        bootstrapSD: 0.044,
        tStat: 3.932,
        pValue: 0.001,
        bias: 0.008,
        ciLower: 0.097,
        ciUpper: 0.252,
        bcCiLower: 0.089,
        bcCiUpper: 0.263,
      },
    ]
  )
})

await runTest('analysis graph signature stays stable across ordering changes and reacts to real model changes', async () => {
  const bundled = await bundleModule('src/utils/analysisGraphSignature.ts', 'analysisGraphSignature.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/utils/analysisGraphSignature.ts to exist and compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { buildAnalysisGraphSignature } = bundled.module ?? {}
  assert.equal(typeof buildAnalysisGraphSignature, 'function', 'buildAnalysisGraphSignature should be exported')

  const modelA = {
    constructs: [
      { name: 'PEOU', indicators: [{ name: 'PEOU1' }, { name: 'PEOU2' }] },
      { name: 'BI', indicators: [{ name: 'BI1' }] },
    ],
    paths: [{ from: 'PEOU', to: 'BI' }],
  }

  const modelB = {
    constructs: [
      { name: 'BI', indicators: [{ name: 'BI1' }] },
      { name: 'PEOU', indicators: [{ name: 'PEOU2' }, { name: 'PEOU1' }] },
    ],
    paths: [{ from: 'PEOU', to: 'BI' }],
  }

  const modelChanged = {
    constructs: [
      { name: 'PEOU', indicators: [{ name: 'PEOU1' }, { name: 'PEOU3' }] },
      { name: 'BI', indicators: [{ name: 'BI1' }] },
    ],
    paths: [{ from: 'PEOU', to: 'BI' }],
  }

  assert.equal(buildAnalysisGraphSignature(modelA), buildAnalysisGraphSignature(modelB))
  assert.notEqual(buildAnalysisGraphSignature(modelA), buildAnalysisGraphSignature(modelChanged))
})

await runTest('bootstrap base-model panels are rendered in bootstrap mode', async () => {
  const source = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')

  assert.doesNotMatch(source, /analysisMode === 'pls-sem' && selectedPanel === 'r-square'/)
  assert.doesNotMatch(source, /analysisMode === 'pls-sem' && selectedPanel === 'vif'/)
  assert.doesNotMatch(source, /analysisMode === 'pls-sem' && selectedPanel === 'discriminant'/)
})

await runTest('bootstrap BC path table follows SmartPLS confidence interval columns', async () => {
  const source = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')

  assert.match(source, /'Path', 'Original sample \(O\)', 'Sample mean \(M\)', 'Bias', '2\.5%', '97\.5%'/)
  assert.match(source, /Confidence intervals bias corrected/)
  assert.match(source, /row\.bias/)
  assert.doesNotMatch(source, /'2\.5% CI \(BC\)'/)
  assert.doesNotMatch(source, /'97\.5% CI \(BC\)'/)
})

await runTest('panel data resolver exposes bootstrap HTMT confidence interval aliases', async () => {
  const bundled = await bundleModule('src/results/panelData.ts', 'panelData.test.bundle.mjs')
  assert.ok(!bundled.error, `Expected src/results/panelData.ts to compile, got: ${bundled.error?.message ?? 'unknown error'}`)

  const { getPanelDataFromResults } = bundled.module ?? {}
  assert.equal(typeof getPanelDataFromResults, 'function')

  const fallbackRows = [{ row_name: 'GAI -> SM', '2.5% CI': 0.21, '97.5% CI': 0.74 }]
  assert.deepEqual(
    getPanelDataFromResults('bootstrap', 'htmt-confidence-intervals', {
      quality_criteria: {
        bootstrapped_HTMT: fallbackRows,
      },
    }),
    fallbackRows,
  )

  const primaryRows = [{ row_name: 'SM -> AP', '2.5% CI': 0.12, '97.5% CI': 0.67 }]
  assert.deepEqual(
    getPanelDataFromResults('bootstrap', 'htmt-confidence-intervals', {
      quality_criteria: {
        htmt_confidence_intervals: primaryRows,
        bootstrapped_HTMT: fallbackRows,
      },
    }),
    primaryRows,
  )

  const mvErrorRows = [{ Indicator: 'SAT1', Error: 0.12 }]
  assert.deepEqual(
    getPanelDataFromResults('plspredict', 'plsem-mv-error-hist', {
      final_results: {
        mv_predictions_and_errors: mvErrorRows,
      },
      histograms: {
        plsem_mv_error_histogram: [],
      },
    }),
    mvErrorRows,
  )

  const altSummaryRows = [{ Item: 'SAT1', Q2_predict: 0.25 }]
  assert.deepEqual(
    getPanelDataFromResults('plspredict', 'q2-predict', {
      final_results: {
        plspredict_summary: altSummaryRows,
      },
    }),
    altSummaryRows,
  )

  assert.deepEqual(
    getPanelDataFromResults('plspredict', 'pls-lm-comparison', {
      success: true,
      results: {
        final_results: {
          plspredict_mv_summary: altSummaryRows,
        },
      },
    }),
    altSummaryRows,
  )

  const comparisonRows = [
    { Indicator: 'SAT2', Q2predict: 0.31, 'PLS-SEM_RMSE': 0.42, 'PLS-SEM_MAE': 0.3, LM_RMSE: 0.47, LM_MAE: 0.34 },
  ]
  assert.deepEqual(
    getPanelDataFromResults('plspredict', 'q2-predict', {
      plspredict_mv_summary: comparisonRows,
    }),
    comparisonRows,
  )

  assert.deepEqual(
    getPanelDataFromResults('plspredict', 'pls-lm-comparison', {
      prediction_summary: comparisonRows,
    }),
    comparisonRows,
  )

  assert.deepEqual(
    getPanelDataFromResults('plspredict', 'pls-lm-comparison', {
      final_results: {
        prediction_summary: comparisonRows,
      },
    }),
    comparisonRows,
  )
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
