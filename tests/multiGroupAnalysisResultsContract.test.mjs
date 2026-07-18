import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')

async function readSource(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

async function bundleModule(relativeEntry, outfileName) {
  const entryPoint = path.join(workspaceRoot, relativeEntry)
  const outfile = path.join(tempDir, outfileName)
  await fs.mkdir(tempDir, { recursive: true })
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
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
}

const panelCatalog = await bundleModule('src/results/panelCatalog.ts', 'multiGroupPanelCatalog.test.bundle.mjs')
const panelData = await bundleModule('src/results/panelData.ts', 'multiGroupPanelData.test.bundle.mjs')
const panelExport = await bundleModule('src/results/panelExport.ts', 'multiGroupPanelExport.test.bundle.mjs')
const resultsViewSource = await readSource('src/pages/ResultsView.tsx')

function collectLeafPanelIds(items) {
  return items.flatMap((item) => item.children?.length ? collectLeafPanelIds(item.children) : [item.id])
}

function collectPanelIds(sections) {
  return sections.flatMap((section) => collectLeafPanelIds(section.items))
}

function simplifyItem(item) {
  const simplified = { id: item.id, label: item.label }
  if (item.children?.length) simplified.children = item.children.map(simplifyItem)
  return simplified
}

assert.match(
  await readSource('src/results/panelCatalog.ts'),
  /export type AnalysisMode = 'pls-sem' \| 'bootstrap' \| 'plspredict' \| 'advanced' \| 'permutation' \| 'mga'/,
  'MGA should be a first-class AnalysisMode.',
)

const mgaSections = panelCatalog.getPanelSectionsForMode('mga')
const mgaPanelIds = collectPanelIds(mgaSections)
assert.deepEqual(mgaSections.map((section) => section.label), [
  'MULTI-GROUP RESULTS',
])
assert.deepEqual(
  mgaSections.find((section) => section.id === 'multi-group-results')?.items.map(simplifyItem),
  [
    { id: 'overview', label: 'Overview' },
    {
      id: 'mga-group-specific-results',
      label: 'Group-Specific Results',
      children: [
        {
          id: 'mga-group-a',
          label: 'Group A',
          children: [
            {
              id: 'mga-group-a-structural-effects',
              label: 'STRUCTURAL EFFECTS',
              children: [
                { id: 'mga-group-a-path-coef', label: 'Path Coefficients' },
                { id: 'mga-group-a-total-indirect', label: 'Total Indirect Effects' },
                { id: 'mga-group-a-specific-indirect', label: 'Specific Indirect Effects' },
                { id: 'mga-group-a-total-effects', label: 'Total Effects' },
              ],
            },
            {
              id: 'mga-group-a-measurement-model',
              label: 'MEASUREMENT MODEL',
              children: [
                { id: 'mga-group-a-outer-loadings', label: 'Outer Loadings' },
                { id: 'mga-group-a-outer-weights', label: 'Outer Weights' },
                { id: 'mga-group-a-reliability', label: 'Construct Reliability & Validity' },
                { id: 'mga-group-a-discriminant', label: 'Discriminant Validity' },
                { id: 'mga-group-a-cross-loadings', label: 'Cross-Loadings' },
              ],
            },
            {
              id: 'mga-group-a-model-quality',
              label: 'MODEL QUALITY',
              children: [
                { id: 'mga-group-a-r-square', label: 'R² / Adjusted R²' },
                { id: 'mga-group-a-vif', label: 'VIF' },
                { id: 'mga-group-a-model-fit', label: 'Model Fit' },
              ],
            },
          ],
        },
        {
          id: 'mga-group-b',
          label: 'Group B',
          children: [
            {
              id: 'mga-group-b-structural-effects',
              label: 'STRUCTURAL EFFECTS',
              children: [
                { id: 'mga-group-b-path-coef', label: 'Path Coefficients' },
                { id: 'mga-group-b-total-indirect', label: 'Total Indirect Effects' },
                { id: 'mga-group-b-specific-indirect', label: 'Specific Indirect Effects' },
                { id: 'mga-group-b-total-effects', label: 'Total Effects' },
              ],
            },
            {
              id: 'mga-group-b-measurement-model',
              label: 'MEASUREMENT MODEL',
              children: [
                { id: 'mga-group-b-outer-loadings', label: 'Outer Loadings' },
                { id: 'mga-group-b-outer-weights', label: 'Outer Weights' },
                { id: 'mga-group-b-reliability', label: 'Construct Reliability & Validity' },
                { id: 'mga-group-b-discriminant', label: 'Discriminant Validity' },
                { id: 'mga-group-b-cross-loadings', label: 'Cross-Loadings' },
              ],
            },
            {
              id: 'mga-group-b-model-quality',
              label: 'MODEL QUALITY',
              children: [
                { id: 'mga-group-b-r-square', label: 'R² / Adjusted R²' },
                { id: 'mga-group-b-vif', label: 'VIF' },
                { id: 'mga-group-b-model-fit', label: 'Model Fit' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'mga-comparisons',
      label: 'Multi-Group Comparisons',
      children: [
        { id: 'mga-path-coefficients', label: 'Path Coefficients' },
        { id: 'mga-outer-loadings', label: 'Outer Loadings' },
        { id: 'mga-outer-weights', label: 'Outer Weights' },
      ],
    },
  ],
)
const mgaComparisonIds = mgaSections
  .find((section) => section.id === 'multi-group-results')
  ?.items.find((item) => item.id === 'mga-comparisons')
  ?.children?.map((item) => item.id) ?? []
assert.ok(!mgaComparisonIds.some((panelId) => panelId.includes('indirect') || panelId === 'mga-total-effects'), 'MGA comparison sidebar should only expose path coefficients, outer loadings, and outer weights.')
assert.deepEqual(mgaPanelIds, [
  'overview',
  'mga-group-a-path-coef',
  'mga-group-a-total-indirect',
  'mga-group-a-specific-indirect',
  'mga-group-a-total-effects',
  'mga-group-a-outer-loadings',
  'mga-group-a-outer-weights',
  'mga-group-a-reliability',
  'mga-group-a-discriminant',
  'mga-group-a-cross-loadings',
  'mga-group-a-r-square',
  'mga-group-a-vif',
  'mga-group-a-model-fit',
  'mga-group-b-path-coef',
  'mga-group-b-total-indirect',
  'mga-group-b-specific-indirect',
  'mga-group-b-total-effects',
  'mga-group-b-outer-loadings',
  'mga-group-b-outer-weights',
  'mga-group-b-reliability',
  'mga-group-b-discriminant',
  'mga-group-b-cross-loadings',
  'mga-group-b-r-square',
  'mga-group-b-vif',
  'mga-group-b-model-fit',
  'mga-path-coefficients',
  'mga-outer-loadings',
  'mga-outer-weights',
])
assert.ok(!mgaPanelIds.some((panelId) => panelId.toLowerCase().includes('welch')), 'MGA comparisons should not expose Welch panels.')

assert.equal(panelExport.getModeResultsLabel('mga'), 'Multi Group Analysis Results')
assert.equal(panelExport.getPanelTitle('mga-path-coefficients'), 'Path Coefficients - Multi-Group Comparison')
assert.equal(panelExport.getPanelTitle('mga-outer-loadings'), 'Outer Loadings - Multi-Group Comparison')
assert.equal(panelExport.getPanelTitle('mga-outer-weights'), 'Outer Weights - Multi-Group Comparison')

const sampleResults = {
  method: 'MGA',
  groups: {
    groupingVariable: 'Gender',
    groupA: 'Male',
    groupB: 'Female',
    leftValue: 'Male',
    rightValue: 'Female',
    counts: { groupA: 146, groupB: 173 },
  },
  settings: { nboot: 500, alpha: 0.05, seed: 123 },
  groupSpecific: {
    groupA: {
      final_results: {
        path_coefficients: [{ path: 'Image -> Satisfaction', coefficient: 0.51 }],
        total_indirect_effects: [{ row_name: 'Image -> Loyalty', value: 0.12 }],
        specific_indirect_effects: [{ effect: 'Image -> Satisfaction -> Loyalty', value: 0.12 }],
        total_effects: [{ row_name: 'Image -> Loyalty', value: 0.63 }],
        outer_loadings: [{ row_name: 'IMAG1', Image: 0.82 }],
        outer_weights: [{ row_name: 'IMAG1', Image: 0.31 }],
      },
      quality_criteria: {
        reliability: [{ construct: 'Image', rho_c: 0.91 }],
        discriminant_validity: [{ construct: 'Image', HTMT: 0.72 }],
        cross_loadings: [{ indicator: 'IMAG1', Image: 0.82 }],
        r_square: [{ construct: 'Satisfaction', r_squared: 0.58 }],
        vif: [{ predictor: 'Image', endogenous: 'Satisfaction', vif: 1.2 }],
        model_fit: [{ index: 'SRMR', value: 0.04 }],
      },
    },
    groupB: {
      final_results: {
        path_coefficients: [{ path: 'Image -> Satisfaction', coefficient: 0.31 }],
      },
      quality_criteria: {
        reliability: [{ construct: 'Image', rho_c: 0.88 }],
      },
    },
  },
  bootstrapMGA: {
    pathCoefficients: {
      biasCorrectedConfidenceIntervals: [
        {
          path: 'Image -> Satisfaction',
          groupA_beta: 0.51,
          groupA_ci_lower: 0.2,
          groupA_ci_upper: 0.7,
          groupB_beta: 0.31,
          groupB_ci_lower: -0.1,
          groupB_ci_upper: 0.1,
          ci_overlap: false,
          result: 'Significant',
        },
      ],
      henselerPlsMga: [
        {
          path: 'Image -> Satisfaction',
          groupA_beta: 0.51,
          groupB_beta: 0.31,
          diff: 0.2,
          pls_mga_p: 0.03,
          result: 'Significant',
        },
      ],
      parametricTest: [
        {
          path: 'Image -> Satisfaction',
          groupA_beta: 0.51,
          groupB_beta: 0.31,
          diff: 0.2,
          t_value: 2.1,
          p_value: 0.04,
          result: 'Significant',
        },
      ],
    },
    specificIndirectEffects: {
      biasCorrectedConfidenceIntervals: [
        {
          path: 'Image -> Satisfaction -> Loyalty',
          groupA_beta: 0.12,
          groupA_ci_lower: 0.04,
          groupA_ci_upper: 0.21,
          groupB_beta: 0.05,
          groupB_ci_lower: -0.02,
          groupB_ci_upper: 0.12,
          ci_overlap: true,
          result: 'Not significant',
        },
      ],
      henselerPlsMga: [],
      parametricTest: [],
    },
    totalIndirectEffects: { biasCorrectedConfidenceIntervals: [], henselerPlsMga: [], parametricTest: [] },
    totalEffects: { biasCorrectedConfidenceIntervals: [], henselerPlsMga: [], parametricTest: [] },
    outerLoadings: {
      biasCorrectedConfidenceIntervals: [
        {
          construct: 'Image',
          indicator: 'IMAG1',
          groupA_loading: 0.82,
          groupA_ci_lower: 0.7,
          groupA_ci_upper: 0.9,
          groupB_loading: 0.76,
          groupB_ci_lower: 0.6,
          groupB_ci_upper: 0.85,
          ci_overlap: true,
          result: 'Not significant',
        },
      ],
      henselerPlsMga: [
        {
          construct: 'Image',
          indicator: 'IMAG1',
          groupA_loading: 0.82,
          groupB_loading: 0.76,
          diff: 0.06,
          pls_mga_p: 0.22,
          result: 'Not significant',
        },
      ],
      parametricTest: [],
    },
    outerWeights: {
      biasCorrectedConfidenceIntervals: [
        {
          construct: 'Value',
          indicator: 'VAL1',
          groupA_weight: 0.31,
          groupA_ci_lower: 0.1,
          groupA_ci_upper: 0.5,
          groupB_weight: 0.25,
          groupB_ci_lower: 0.05,
          groupB_ci_upper: 0.45,
          ci_overlap: null,
          result: 'Not significant',
        },
      ],
      henselerPlsMga: [],
      parametricTest: [
        {
          construct: 'Value',
          indicator: 'VAL1',
          groupA_weight: 0.31,
          groupB_weight: 0.25,
          diff: 0.06,
          t_value: 0.88,
          p_value: 0.38,
          result: 'Not significant',
        },
      ],
    },
  },
  pathCoefficients: [],
  significantDifferences: [],
  execution_log: [{ message: 'MGA ran for Gender = Male vs Female.' }],
}

assert.deepEqual(panelData.getPanelDataFromResults('mga', 'overview', sampleResults), [
  {
    'Analysis information': 'Grouping variable',
    Value: 'Gender',
  },
  {
    'Analysis information': 'Selected groups',
    Value: 'Male vs Female',
  },
  {
    'Analysis information': 'Sample size per group',
    Value: 'Male: 146, Female: 173',
  },
  {
    'Analysis information': 'MGA settings',
    Value: '500 bootstrap subsamples, alpha 0.05, seed 123',
  },
  {
    'Analysis information': 'Measurement invariance status',
    Value: 'Not supplied',
  },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-a-path-coef', sampleResults), [
  { path: 'Image -> Satisfaction', coefficient: 0.51 },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-a-model-fit', sampleResults), [
  { index: 'SRMR', value: 0.04 },
])
const wrappedGroupSpecificResults = {
  ...sampleResults,
  groupSpecific: {
    groupA: { results: sampleResults.groupSpecific.groupA },
    groupB: { results: sampleResults.groupSpecific.groupB },
  },
}
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-a-path-coef', wrappedGroupSpecificResults), [
  { path: 'Image -> Satisfaction', coefficient: 0.51 },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-a-model-fit', wrappedGroupSpecificResults), [
  { index: 'SRMR', value: 0.04 },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-b-reliability', wrappedGroupSpecificResults), [
  { construct: 'Image', rho_c: 0.88 },
])
const nestedWrappedCamelCaseGroupSpecificResults = {
  success: true,
  results: {
    success: true,
    results: {
      ...sampleResults,
      groupSpecific: {
        groupA: {
          success: true,
          results: {
            finalResults: {
              pathCoefficients: [{ path: 'Image -> Satisfaction', coefficient: 0.51 }],
            },
            qualityCriteria: {
              rSquare: [{ construct: 'Satisfaction', r_squared: 0.58 }],
              modelFit: [{ index: 'SRMR', value: 0.04 }],
            },
          },
        },
        groupB: {
          success: true,
          results: {
            finalResults: {
              outerLoadings: [{ row_name: 'IMAG1', Image: 0.79 }],
            },
            qualityCriteria: {
              reliability: [{ construct: 'Image', rho_c: 0.88 }],
              modelFit: [{ index: 'SRMR', value: 0.05 }],
            },
          },
        },
      },
    },
  },
}
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-a-path-coef', nestedWrappedCamelCaseGroupSpecificResults), [
  { path: 'Image -> Satisfaction', coefficient: 0.51 },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-a-r-square', nestedWrappedCamelCaseGroupSpecificResults), [
  { construct: 'Satisfaction', r_squared: 0.58 },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-b-outer-loadings', nestedWrappedCamelCaseGroupSpecificResults), [
  { row_name: 'IMAG1', Image: 0.79 },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-b-model-fit', nestedWrappedCamelCaseGroupSpecificResults), [
  { index: 'SRMR', value: 0.05 },
])
assert.equal(panelData.getMgaGroupPanelBaseId('mga-group-a-path-coef'), 'path-coef')
assert.equal(panelData.getMgaGroupPanelBaseId('mga-group-b-model-fit'), 'model-fit')
assert.equal(panelData.getMgaGroupPanelBaseId('mga-path-coefficients'), 'mga-path-coefficients')
assert.deepEqual(
  panelData.getMgaGroupSpecificResultsSource('mga-group-a-path-coef', sampleResults)?.final_results?.path_coefficients,
  [{ path: 'Image -> Satisfaction', coefficient: 0.51 }],
)
assert.deepEqual(
  panelData.getMgaGroupSpecificResultsSource('mga-group-a-r-square', nestedWrappedCamelCaseGroupSpecificResults)?.quality_criteria?.r_square,
  [{ construct: 'Satisfaction', r_squared: 0.58 }],
)
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-path-coefficients', sampleResults), [
  {
    Path: 'Image -> Satisfaction',
    'Male β': 0.51,
    'Male CI lower': 0.2,
    'Male CI upper': 0.7,
    'Female β': 0.31,
    'Female CI lower': -0.1,
    'Female CI upper': 0.1,
    'CI overlap': 'No',
    Result: 'Significant',
  },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-path-coefficients', sampleResults, { mgaComparisonMethod: 'henselerPlsMga' }), [
  {
    Path: 'Image -> Satisfaction',
    'Male β': 0.51,
    'Female β': 0.31,
    'Difference (Male − Female)': 0.2,
    'PLS-MGA p': 0.03,
    Result: 'Significant',
  },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-path-coefficients', sampleResults, { mgaComparisonMethod: 'parametricTest' }), [
  {
    Path: 'Image -> Satisfaction',
    'Male β': 0.51,
    'Female β': 0.31,
    'Difference (Male − Female)': 0.2,
    't-value': 2.1,
    'p-value': 0.04,
    Result: 'Significant',
  },
])
assert.equal(panelData.getPanelDataFromResults('mga', 'mga-path-welch', sampleResults), null)
assert.equal(panelData.getPanelDataFromResults('mga', 'mga-specific-indirect-ci', sampleResults), null)
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-outer-loadings', sampleResults), [
  {
    Construct: 'Image',
    Indicator: 'IMAG1',
    'Male loading': 0.82,
    'Male CI lower': 0.7,
    'Male CI upper': 0.9,
    'Female loading': 0.76,
    'Female CI lower': 0.6,
    'Female CI upper': 0.85,
    'CI overlap': 'Yes',
    Result: 'Not significant',
  },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-outer-weights', sampleResults, { mgaComparisonMethod: 'parametricTest' }), [
  {
    Construct: 'Value',
    Indicator: 'VAL1',
    'Male weight': 0.31,
    'Female weight': 0.25,
    'Difference (Male − Female)': 0.06,
    't-value': 0.88,
    'p-value': 0.38,
    Result: 'Not significant',
  },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-outer-weights', sampleResults), [
  {
    Construct: 'Value',
    Indicator: 'VAL1',
    'Male weight': 0.31,
    'Male CI lower': 0.1,
    'Male CI upper': 0.5,
    'Female weight': 0.25,
    'Female CI lower': 0.05,
    'Female CI upper': 0.45,
    'CI overlap': '—',
    Result: 'Not significant',
  },
])

assert.match(
  resultsViewSource,
  /savedAnalysis\?\.mode === 'mga'/,
  'ResultsView should accept navigated saved MGA results.',
)
assert.match(
  resultsViewSource,
  /modeRaw === 'mga'/,
  'ResultsView should restore MGA results from shared analysis-mode storage.',
)
assert.match(
  resultsViewSource,
  /if \(savedAnalysis\.mode === 'mga'\) setSelectedPanel\('overview'\)/,
  'ResultsView should open MGA results on the overview panel.',
)
assert.match(
  resultsViewSource,
  /handleRunMultiGroupFromResults\s*=\s*useCallback\(async \(settings: MultiGroupAnalysisSettings\)[\s\S]*runMultiGroupAnalysisModel\(\{[\s\S]*groupingVariable:\s*settings\.groupingVariable[\s\S]*groupA:\s*settings\.groupA[\s\S]*groupB:\s*settings\.groupB[\s\S]*nboot:\s*settings\.nboot[\s\S]*alpha:\s*settings\.alpha[\s\S]*seed:\s*settings\.seed/,
  'ResultsView should run MGA with the displayed left/right unique values when the results-screen modal is used.',
)
assert.match(
  resultsViewSource,
  /<MultiGroupAnalysisModal[\s\S]*onRun=\{handleRunMultiGroupFromResults\}[\s\S]*isRunning=\{isAnalysisRunning\}/,
  'ResultsView MGA modal should receive onRun and running state.',
)

assert.match(
  resultsViewSource,
  /function flattenSidebarItems[\s\S]*flattenSidebarItems\(item\.children\)/,
  'ResultsView should recursively flatten nested MGA child leaves for selection and export.',
)

assert.match(
  resultsViewSource,
  /getMgaGroupLabels[\s\S]*leftValue[\s\S]*rightValue[\s\S]*groupA[\s\S]*groupB[\s\S]*comparisonLabel[\s\S]*buildSidebarSections\(analysisMode, moderationAvailable, mgaGroupLabels\)/,
  'ResultsView should label MGA group and comparison parent rows with the modal-selected left/right group values from the JSON.',
)

assert.match(
  resultsViewSource,
  /section\.id === 'multi-group-results'/,
  'ResultsView should keep the top-level Multi-Group Results header static instead of a dropdown.',
)
assert.match(
  resultsViewSource,
  /aria-expanded=\{isOpen\}/,
  'ResultsView nested MGA sidebar groups should render as accordions.',
)
assert.match(
  resultsViewSource,
  /aria-expanded=\{isOpen\}[\s\S]*\{isOpen\s*\?[\s\S]*<Icon size=\{13\}/,
  'ResultsView nested MGA accordion caret should render on the left before the panel icon.',
)
assert.match(
  resultsViewSource,
  /const effectiveSelectedPanel = analysisMode === 'mga'[\s\S]*getMgaGroupPanelBaseId\(selectedPanel\)/,
  'ResultsView should render MGA group-specific compound panel IDs through their base PLS-SEM table panel.',
)
assert.match(
  resultsViewSource,
  /getMgaGroupSpecificResultsSource\(selectedPanel, analysisResults\)[\s\S]*parsePathCoefficients\(tableAnalysisResults\)/,
  'ResultsView should parse group-specific structural, measurement, and quality tables from the selected group result source.',
)
assert.match(
  resultsViewSource,
  /const isSemResultsMode = analysisMode === 'pls-sem' \|\| analysisMode === 'bootstrap' \|\| analysisMode === 'advanced' \|\| analysisMode === 'mga'/,
  'ResultsView should route MGA group-specific panels through the SEM table renderer.',
)
assert.match(
  resultsViewSource,
  /showMgaComparisonMethodTabs[\s\S]*mgaComparisonMethodOptions[\s\S]*onMgaComparisonMethodChange/,
  'ResultsView should render bias-corrected, Henseler, and parametric choices as table-side tabs.',
)

console.log('PASS multi-group analysis results contract')
