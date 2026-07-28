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
const modelCanvasSource = await readSource('src/pages/ModelCanvas.tsx')

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
      id: 'mga-comparisons',
      label: 'MULTI GROUP COMPARISON',
      children: [
        { id: 'mga-path-coefficients', label: 'Path Coefficients' },
        { id: 'mga-outer-loadings', label: 'Outer Loadings' },
        { id: 'mga-outer-weights', label: 'Outer Weights' },
      ],
    },
    {
      id: 'mga-group-specific-results',
      label: 'GROUP SPECIFIC RESULTS',
      children: [
        {
          id: 'mga-group-a',
          label: 'Group A',
          children: [
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
          ],
        },
        {
          id: 'mga-group-b',
          label: 'Group B',
          children: [
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
          ],
        },
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
  'mga-path-coefficients',
  'mga-outer-loadings',
  'mga-outer-weights',
  'mga-group-a-outer-loadings',
  'mga-group-a-outer-weights',
  'mga-group-a-reliability',
  'mga-group-a-discriminant',
  'mga-group-a-cross-loadings',
  'mga-group-a-r-square',
  'mga-group-a-vif',
  'mga-group-a-model-fit',
  'mga-group-a-path-coef',
  'mga-group-a-total-indirect',
  'mga-group-a-specific-indirect',
  'mga-group-a-total-effects',
  'mga-group-b-outer-loadings',
  'mga-group-b-outer-weights',
  'mga-group-b-reliability',
  'mga-group-b-discriminant',
  'mga-group-b-cross-loadings',
  'mga-group-b-r-square',
  'mga-group-b-vif',
  'mga-group-b-model-fit',
  'mga-group-b-path-coef',
  'mga-group-b-total-indirect',
  'mga-group-b-specific-indirect',
  'mga-group-b-total-effects',
])
assert.ok(!mgaPanelIds.some((panelId) => panelId.toLowerCase().includes('welch')), 'MGA comparisons should not expose Welch panels.')
assert.ok(
  ['mga-group-a-path-coef', 'mga-group-a-total-indirect', 'mga-group-a-specific-indirect', 'mga-group-a-total-effects', 'mga-group-b-path-coef', 'mga-group-b-total-indirect', 'mga-group-b-specific-indirect', 'mga-group-b-total-effects']
    .every((panelId) => mgaPanelIds.includes(panelId)),
  'MGA group-specific sidebar should expose structural effect panels for both selected groups.',
)
assert.ok(
  mgaPanelIds.every((panelId) => !(
    panelId.startsWith('mga-group-') &&
    (panelId.includes('path-coef') || panelId.includes('indirect') || panelId.includes('total-effects'))
  ) || panelId.includes('-structural-effects') || ['mga-group-a-path-coef', 'mga-group-a-total-indirect', 'mga-group-a-specific-indirect', 'mga-group-a-total-effects', 'mga-group-b-path-coef', 'mga-group-b-total-indirect', 'mga-group-b-specific-indirect', 'mga-group-b-total-effects'].includes(panelId)),
  'MGA group-specific structural panels should be the only group-specific path/effect leaves.',
)
const moderatedHocMgaSections = panelCatalog.getPanelSectionsForMode('mga', { hasInteractions: true, hasHigherOrderConstructs: true })
const moderatedHocMgaPanelIds = collectPanelIds(moderatedHocMgaSections)
const moderatedHocComparisonIds = moderatedHocMgaSections
  .find((section) => section.id === 'multi-group-results')
  ?.items.find((item) => item.id === 'mga-comparisons')
  ?.children?.map((item) => item.id) ?? []
assert.ok(
  moderatedHocComparisonIds.includes('mga-moderation-effects'),
  'MGA should expose a dedicated moderation comparison panel when the saved model has moderation paths.',
)
assert.ok(
  moderatedHocMgaPanelIds.includes('hoc-context'),
  'MGA should expose higher-order construct context when the saved model has HOCs.',
)
assert.ok(
  !collectPanelIds(panelCatalog.getPanelSectionsForMode('mga', { hasInteractions: true })).includes('hoc-context'),
  'MGA should not show HOC context for models without higher-order constructs.',
)
assert.ok(
  !collectPanelIds(panelCatalog.getPanelSectionsForMode('mga', { hasHigherOrderConstructs: true })).includes('mga-moderation-effects'),
  'MGA should not show moderation comparisons for models without moderation paths.',
)

assert.equal(panelExport.getModeResultsLabel('mga'), 'Multi Group Analysis Results')
assert.equal(panelExport.getPanelTitle('overview'), 'Overview')
assert.deepEqual(panelExport.getExportSectionTitles('overview', 2), ['Analysis Setup', 'Group Descriptives'])
assert.equal(panelExport.getPanelTitle('mga-path-coefficients'), 'Path Coefficients - Multi-Group Comparison')
assert.equal(panelExport.getPanelTitle('mga-outer-loadings'), 'Outer Loadings - Multi-Group Comparison')
assert.equal(panelExport.getPanelTitle('mga-outer-weights'), 'Outer Weights - Multi-Group Comparison')
assert.equal(panelExport.getPanelTitle('mga-moderation-effects'), 'Moderation Effects - Multi-Group Comparison')
assert.equal(panelExport.getPanelTitle('hoc-context'), 'Higher-Order Construct Context')
assert.equal(panelExport.getPanelTitle('mga-group-a-path-coef'), 'Path Coefficients - Group A')
assert.equal(panelExport.getPanelTitle('mga-group-b-total-effects'), 'Total Effects - Group B')

const moderatedHocModel = {
  constructs: [
    { id: 'image', name: 'Image', indicators: [{ name: 'IMAG1' }, { name: 'IMAG2' }] },
    { id: 'social', name: 'Social Interaction', indicators: [{ name: 'SOC1' }, { name: 'SOC2' }] },
    { id: 'sharing', name: 'Content Sharing', indicators: [{ name: 'SHR1' }, { name: 'SHR2' }] },
    {
      id: 'engagement',
      name: 'Engagement HOC',
      type: 'Reflective',
      isHigherOrder: true,
      higherOrderType: 'reflective',
      dimensions: ['Social Interaction', 'Content Sharing'],
      indicators: [],
    },
    { id: 'loyalty', name: 'Loyalty', indicators: [{ name: 'LOY1' }, { name: 'LOY2' }] },
  ],
  paths: [
    { id: 'hoc-social', from: 'engagement', to: 'social', kind: 'direct', hocRole: 'measurement' },
    { id: 'hoc-sharing', from: 'engagement', to: 'sharing', kind: 'direct', hocRole: 'measurement' },
    { id: 'image-loyalty', from: 'image', to: 'loyalty', kind: 'direct', hocRole: 'structural' },
    { id: 'engagement-moderates-image-loyalty', from: 'engagement', to: 'loyalty', kind: 'moderation', targetPathId: 'image-loyalty' },
  ],
}

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
  descriptives: [
    { Group: 'Male', Construct: 'Image', Number: 146, Mean: 0.56, 'Standard Deviation': 0.648074069841, Skewness: -0.12, Kurtosis: 2.31, Variance: 0.42 },
    { Group: 'Female', Construct: 'Image', Number: 173, Mean: 0.48, 'Standard Deviation': 0.62449979984, Skewness: 0.08, Kurtosis: 2.88, Variance: 0.39 },
  ],
  groupSpecific: {
    groupA: {
      final_results: {
        path_coefficients: [{ path: 'Image -> Satisfaction', 'Original Est.': 0.51, 'Bootstrap Mean': 0.5, 'Bootstrap SD': 0.08, 'T Stat.': 6.38, 'P Value': 0.001, '2.5% CI': 0.34, '97.5% CI': 0.67, '2.5% CI (BC)': 0.33, '97.5% CI (BC)': 0.68 }],
        total_indirect_effects: [{ row_name: 'Image -> Loyalty', 'Original Est.': 0.12, 'Bootstrap Mean': 0.11, 'Bootstrap SD': 0.04, 'T Stat.': 3, 'P Value': 0.004 }],
        specific_indirect_effects: [{ path: 'Image -> Satisfaction -> Loyalty', 'Original Est.': 0.12, 'Bootstrap Mean': 0.11, 'Bootstrap SD': 0.04, 'T Stat.': 3, 'P Value': 0.004 }],
        total_effects: [{ row_name: 'Image -> Loyalty', 'Original Est.': 0.63, 'Bootstrap Mean': 0.61, 'Bootstrap SD': 0.09, 'T Stat.': 7, 'P Value': 0.001 }],
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
        path_coefficients: [{ path: 'Image -> Satisfaction', 'Original Est.': 0.31, 'Bootstrap Mean': 0.3, 'Bootstrap SD': 0.09, 'T Stat.': 3.44, 'P Value': 0.002 }],
        total_effects: [{ row_name: 'Image -> Loyalty', 'Original Est.': 0.38, 'Bootstrap Mean': 0.37, 'Bootstrap SD': 0.1, 'T Stat.': 3.8, 'P Value': 0.001 }],
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

const moderatedHocMgaResults = {
  ...sampleResults,
  bootstrapMGA: {
    ...sampleResults.bootstrapMGA,
    pathCoefficients: {
      biasCorrectedConfidenceIntervals: [
        ...sampleResults.bootstrapMGA.pathCoefficients.biasCorrectedConfidenceIntervals,
        {
          path: 'Image*Engagement HOC -> Loyalty',
          groupA_beta: 0.22,
          groupA_ci_lower: 0.09,
          groupA_ci_upper: 0.35,
          groupB_beta: -0.04,
          groupB_ci_lower: -0.16,
          groupB_ci_upper: 0.07,
          ci_overlap: false,
          result: 'Significant',
        },
      ],
      henselerPlsMga: [
        ...sampleResults.bootstrapMGA.pathCoefficients.henselerPlsMga,
        {
          path: 'Image*Engagement HOC -> Loyalty',
          groupA_beta: 0.22,
          groupB_beta: -0.04,
          diff: 0.26,
          pls_mga_p: 0.018,
          result: 'Significant',
        },
      ],
      parametricTest: [
        ...sampleResults.bootstrapMGA.pathCoefficients.parametricTest,
        {
          path: 'Image*Engagement HOC -> Loyalty',
          groupA_beta: 0.22,
          groupB_beta: -0.04,
          diff: 0.26,
          t_value: 2.48,
          p_value: 0.014,
          result: 'Significant',
        },
      ],
    },
  },
}

assert.deepEqual(panelData.getPanelDataFromResults('mga', 'overview', sampleResults), {
  setup: [
    { 'Analysis information': 'Grouping variable', Value: 'Gender' },
    { 'Analysis information': 'Selected groups', Value: 'Male vs Female' },
    { 'Analysis information': 'Sample size per group', Value: 'Male: 146, Female: 173' },
    { 'Analysis information': 'MGA settings', Value: '500 bootstrap subsamples, alpha 0.05, seed 123' },
    { 'Analysis information': 'Measurement invariance status', Value: 'MICOM was not run for this analysis. Interpret results well.' },
  ],
  descriptives: [
    { Group: 'Male', Construct: 'Image', Number: 146, Mean: 0.56, 'Standard Deviation': 0.648074069841, Skewness: -0.12, Kurtosis: 2.31, Variance: 0.42 },
    { Group: 'Female', Construct: 'Image', Number: 173, Mean: 0.48, 'Standard Deviation': 0.62449979984, Skewness: 0.08, Kurtosis: 2.88, Variance: 0.39 },
  ],
})
assert.equal(
  panelData.getPanelDataFromResults('mga', 'overview', {
    ...sampleResults,
    micomOverview: { status: 'partial', message: 'Partial measurement invariance available from cached MICOM.' },
  }).setup.find((row) => row['Analysis information'] === 'Measurement invariance status')?.Value,
  'Partial measurement invariance available from cached MICOM.',
)
assert.deepEqual(
  panelData.getPanelDataFromResults('mga', 'overview', {
    ...sampleResults,
    overview: { descriptives: [] },
    descriptives: [],
  }, {
    mgaOverviewFallback: {
      headers: ['Gender', 'IMAG1', 'IMAG2', 'VAL1'],
      datasetRows: [
        ['Male', 1, 2, 4],
        ['Male', 2, 3, 6],
        ['Female', 4, 5, 8],
        ['Female', 6, 7, 10],
      ],
      constructs: [
        { name: 'Image', indicators: [{ name: 'IMAG1' }, { name: 'IMAG2' }] },
        { name: 'Value', indicators: ['VAL1'] },
      ],
    },
  }).descriptives,
  [
    { Group: 'Male', Construct: 'Image', Number: 2, Mean: 2, 'Standard Deviation': 0.707106781187, Skewness: null, Kurtosis: null, Variance: 0.5 },
    { Group: 'Male', Construct: 'Value', Number: 2, Mean: 5, 'Standard Deviation': 1.414213562373, Skewness: null, Kurtosis: null, Variance: 2 },
    { Group: 'Female', Construct: 'Image', Number: 2, Mean: 5.5, 'Standard Deviation': 1.414213562373, Skewness: null, Kurtosis: null, Variance: 2 },
    { Group: 'Female', Construct: 'Value', Number: 2, Mean: 9, 'Standard Deviation': 1.414213562373, Skewness: null, Kurtosis: null, Variance: 2 },
  ],
  'MGA overview should derive group descriptives from cached dataset rows when backend descriptives are empty.',
)
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
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-a-r-square', nestedWrappedCamelCaseGroupSpecificResults), [
  { construct: 'Satisfaction', r_squared: 0.58 },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-b-outer-loadings', nestedWrappedCamelCaseGroupSpecificResults), [
  { row_name: 'IMAG1', Image: 0.79 },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-b-model-fit', nestedWrappedCamelCaseGroupSpecificResults), [
  { index: 'SRMR', value: 0.05 },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-a-path-coef', sampleResults), [
  { path: 'Image -> Satisfaction', 'Original Est.': 0.51, 'Bootstrap Mean': 0.5, 'Bootstrap SD': 0.08, 'T Stat.': 6.38, 'P Value': 0.001, '2.5% CI': 0.34, '97.5% CI': 0.67, '2.5% CI (BC)': 0.33, '97.5% CI (BC)': 0.68 },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-a-total-indirect', sampleResults), [
  { row_name: 'Image -> Loyalty', 'Original Est.': 0.12, 'Bootstrap Mean': 0.11, 'Bootstrap SD': 0.04, 'T Stat.': 3, 'P Value': 0.004 },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-a-specific-indirect', sampleResults), [
  { path: 'Image -> Satisfaction -> Loyalty', 'Original Est.': 0.12, 'Bootstrap Mean': 0.11, 'Bootstrap SD': 0.04, 'T Stat.': 3, 'P Value': 0.004 },
])
assert.deepEqual(panelData.getPanelDataFromResults('mga', 'mga-group-b-total-effects', sampleResults), [
  { row_name: 'Image -> Loyalty', 'Original Est.': 0.38, 'Bootstrap Mean': 0.37, 'Bootstrap SD': 0.1, 'T Stat.': 3.8, 'P Value': 0.001 },
])
assert.equal(panelData.getMgaGroupPanelBaseId('mga-group-a-path-coef'), 'path-coef')
assert.equal(panelData.getMgaGroupPanelBaseId('mga-group-a-total-indirect'), 'total-indirect')
assert.equal(panelData.getMgaGroupPanelBaseId('mga-group-a-specific-indirect'), 'specific-indirect')
assert.equal(panelData.getMgaGroupPanelBaseId('mga-group-b-total-effects'), 'total-effects')
assert.equal(panelData.getMgaGroupPanelBaseId('mga-group-b-model-fit'), 'model-fit')
assert.equal(panelData.getMgaGroupPanelBaseId('mga-path-coefficients'), 'mga-path-coefficients')
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
assert.deepEqual(
  panelData.getPanelDataFromResults('mga', 'mga-moderation-effects', moderatedHocMgaResults, { savedModel: moderatedHocModel }),
  [
    {
      IV: 'Image',
      Moderator: 'Engagement HOC',
      DV: 'Loyalty',
      Interaction: 'Image*Engagement HOC',
      Path: 'Image*Engagement HOC -> Loyalty',
      'HOC role': 'Moderator is higher-order construct: Social Interaction, Content Sharing',
      'Male β': 0.22,
      'Male CI lower': 0.09,
      'Male CI upper': 0.35,
      'Female β': -0.04,
      'Female CI lower': -0.16,
      'Female CI upper': 0.07,
      'CI overlap': 'No',
      Result: 'Significant',
    },
  ],
  'MGA moderation panel should filter and label interaction path comparisons explicitly.',
)
assert.deepEqual(
  panelData.getPanelDataFromResults('mga', 'mga-moderation-effects', moderatedHocMgaResults, {
    savedModel: moderatedHocModel,
    mgaComparisonMethod: 'parametricTest',
  }),
  [
    {
      IV: 'Image',
      Moderator: 'Engagement HOC',
      DV: 'Loyalty',
      Interaction: 'Image*Engagement HOC',
      Path: 'Image*Engagement HOC -> Loyalty',
      'HOC role': 'Moderator is higher-order construct: Social Interaction, Content Sharing',
      'Male β': 0.22,
      'Female β': -0.04,
      'Difference (Male − Female)': 0.26,
      't-value': 2.48,
      'p-value': 0.014,
      Result: 'Significant',
    },
  ],
  'MGA moderation panel should support the same comparison-method tabs as the main path panel.',
)
assert.deepEqual(
  panelData.getPanelDataFromResults('mga', 'mga-moderation-effects', moderatedHocMgaResults),
  null,
  'MGA should not infer moderation reporting from interaction-looking rows without an analysis-time saved model.',
)
assert.deepEqual(
  panelData.getPanelDataFromResults('mga', 'hoc-context', moderatedHocMgaResults, { savedModel: moderatedHocModel }),
  [
    {
      'Higher-order construct': 'Engagement HOC',
      Type: 'reflective',
      Dimensions: 'Social Interaction, Content Sharing',
      'Dimension count': 2,
      'Structural role': 'Moderator in Image*Engagement HOC -> Loyalty',
      'MICOM/MGA handling': 'Uses fitted HOC construct scores from the same SEMinR model specification.',
    },
  ],
  'MGA should report HOC context instead of hiding HOC participation inside generic path rows.',
)
assert.deepEqual(
  panelData.getPanelDataFromResults('mga', 'hoc-context', {
    final_results: {
      hoc_results: [
        {
          hoc_construct: 'Engagement HOC',
          loc_construct: 'Social Interaction',
          hoc_type: 'reflective',
          loc_type: 'reflective',
          loading: 0.88,
          weight: null,
          vif: null,
        },
      ],
    },
  }),
  [
    {
      'Higher-order construct': 'Engagement HOC',
      Type: 'reflective',
      Dimensions: 'Social Interaction',
      'Dimension count': 1,
      'Structural role': 'Available from saved HOC results',
      Loading: 0.88,
      Weight: null,
      VIF: null,
      'MICOM/MGA handling': 'Uses fitted HOC construct scores from the same SEMinR model specification.',
    },
  ],
  'MGA HOC context should read the existing final_results.hoc_results fallback when no model snapshot is available.',
)

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
  /getMgaGroupLabels[\s\S]*leftValue[\s\S]*rightValue[\s\S]*groupA[\s\S]*groupB[\s\S]*comparisonLabel[\s\S]*buildSidebarSections\(analysisMode, moderationAvailable, mgaGroupLabels, hasHigherOrderConstructs\)/,
  'ResultsView should label MGA group and comparison parent rows with the modal-selected left/right group values from the JSON.',
)
assert.match(
  resultsViewSource,
  /const moderationAvailable = useMemo\([\s\S]*modelHasSavedModerationPaths\(savedModel\)[\s\S]*buildSidebarSections\(analysisMode, moderationAvailable, mgaGroupLabels, hasHigherOrderConstructs\)/,
  'ResultsView should gate the MGA moderation panel from saved model moderation paths, not inferred interaction-looking rows.',
)
assert.match(
  resultsViewSource,
  /savedAnalysis\?\.modelSnapshot[\s\S]*navState\?\.savedModelSnapshot[\s\S]*setSavedModel\(cloneResultsModelSnapshot\(analysisModelSnapshot/,
  'ResultsView should prefer the analysis-time model snapshot embedded in saved analysis state.',
)
assert.match(
  resultsViewSource,
  /handleRunMultiGroupFromResults\s*=\s*useCallback\(async \(settings: MultiGroupAnalysisSettings\)[\s\S]*persistResultsToWorkspace\(\{[\s\S]*mode:\s*'mga'[\s\S]*modelSnapshot:\s*savedModel/,
  'Results-screen MGA reruns should preserve the model snapshot that produced the result.',
)
assert.match(
  modelCanvasSource,
  /(?:analysis:\s*analysisState\s*\?|analysisState\s*\?\s*\{\s*analysis:)[\s\S]*\.\.\.analysisState[\s\S]*modelSnapshot:\s*snapshot/,
  'ModelCanvas should persist the analysis-time model snapshot inside saved analysis state.',
)

assert.match(
  resultsViewSource,
  /section\.id === 'multi-group-results' \? null/,
  'ResultsView should remove the extra Multi-Group Results wrapper label from the MGA sidebar.',
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
  /isMgaGroupStructuralBootstrapPanel[\s\S]*isStructuralEffectPanel\(effectiveSelectedPanel\)[\s\S]*shouldRenderBootstrapSignificanceTable[\s\S]*showBootstrapIntervalControl = shouldRenderBootstrapSignificanceTable[\s\S]*effectiveSelectedPanel === 'path-coef'[\s\S]*shouldRenderBootstrapSignificanceTable[\s\S]*<BootstrapSignificanceTable[\s\S]*\['total-indirect', 'specific-indirect', 'total-effects'\]\.includes\(effectiveSelectedPanel\)/,
  'ResultsView should render MGA group-specific structural effects as bootstrap significance tables with interval controls.',
)
assert.match(
  resultsViewSource,
  /isMgaGroupStructuralTable[\s\S]*selectedPanel\.startsWith\('mga-group-'\)[\s\S]*isStructuralEffectPanel\(tableViewPanelId\)[\s\S]*tableViewOptions = isMgaGroupStructuralTable \? \[\] : getPanelTableViews/,
  'ResultsView should hide matrix/list table controls for MGA group-specific structural significance tables.',
)
assert.match(
  resultsViewSource,
  /getMgaGroupSpecificResultsSource\(selectedPanel, analysisResults\)[\s\S]*parseReliability\(tableAnalysisResults\)[\s\S]*parseOuterLoadings\(tableAnalysisResults,\s*indicatorConstructMap\)[\s\S]*parseOuterWeights\(tableAnalysisResults,\s*indicatorConstructMap\)[\s\S]*parseModelFit\(tableAnalysisResults\)/,
  'ResultsView should parse group-specific measurement and quality tables from the selected group result source.',
)
assert.match(
  resultsViewSource,
  /const indicatorConstructMap = new Map<string, string>\(\)[\s\S]*savedModel\.constructs\.forEach[\s\S]*parseOuterLoadings\(tableAnalysisResults,\s*indicatorConstructMap\)[\s\S]*parseOuterWeights\(tableAnalysisResults,\s*indicatorConstructMap\)/,
  'ResultsView should build the indicator-to-construct lookup before parsing group-specific outer loadings and weights.',
)
assert.match(
  resultsViewSource,
  /function parseOuterWeights\(ar: any, constructsMap\?: Map<string, string>\)[\s\S]*const identity = inferMeasurementRowIdentity\(r, constructsMap\)[\s\S]*result\.push\(\{[\s\S]*indicator[\s\S]*construct[\s\S]*loading/,
  'Outer weights should use the same construct/indicator identity inference as outer loadings instead of showing Unknown or arrow labels.',
)
assert.match(
  resultsViewSource,
  /function findEstimateCell\(row: Record<string, unknown> \| null \| undefined\): unknown[\s\S]*'loading'[\s\S]*'weight'[\s\S]*function isMeasurementIdentityOrMetricField[\s\S]*normalizeMetricKey\(key\)[\s\S]*metric === 'construct'[\s\S]*metric === 'indicator'[\s\S]*metric === 'loading'[\s\S]*metric === 'weight'[\s\S]*Object\.keys\(r\)\.filter\(k => !isRowField\(k\) && !isMeasurementIdentityOrMetricField\(k\)\)/,
  'Group-specific measurement parsers should handle normalized construct/indicator/loading rows without treating metric columns as construct names.',
)
assert.match(
  resultsViewSource,
  /'mga-group-specific-results':\s*(?!Folders)\w+/,
  'Group specific results should not use the folder icon override.',
)
assert.match(
  resultsViewSource,
  /useState\(\(\) => item\.id === 'mga-group-specific-results'\)/,
  'Only the Group Specific Results accordion should start expanded in the MGA sidebar.',
)
assert.match(
  resultsViewSource,
  /item\.id === 'mga-group-a' \|\| item\.id === 'mga-group-b'[\s\S]*text-text-primary font-bold/,
  'Actual MGA group values should render bold with theme-primary text in the sidebar.',
)
assert.match(
  resultsViewSource,
  /isMgaGroupSubsection[\s\S]*mga-group-\[ab\]-\(measurement-model\|model-quality\|structural-effects\)[\s\S]*text-text-primary font-bold uppercase/,
  'MGA measurement, model quality, and structural accordion headers should be uppercase, bold, and theme-primary.',
)
assert.match(
  resultsViewSource,
  /getPanelDataFromResults\(analysisMode, selectedPanel, analysisResults, \{[\s\S]*mgaOverviewFallback:\s*\{[\s\S]*datasetRows: resultsGroupingData\.datasetRows[\s\S]*constructs: savedModel\?\.constructs/,
  'ResultsView should pass cached dataset rows and saved model constructs as an MGA overview descriptive fallback.',
)
assert.match(
  resultsViewSource,
  /paddingLeft: selectedPanel === child\.id \? 18 \+ \(depth \+ 1\) \* 6 : 20 \+ \(depth \+ 1\) \* 6/,
  'MGA sidebar indentation should stay compact instead of stepping deeply inward.',
)
assert.match(
  resultsViewSource,
  /title: section\.id === 'multi-group-results' \? undefined : section\.label/,
  'Exported MGA HTML should not reintroduce the hidden Multi-Group Results wrapper heading.',
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
assert.match(
  resultsViewSource,
  /showMgaComparisonMethodTabs[\s\S]*mga-moderation-effects[\s\S]*mgaComparisonMethodOptions/,
  'ResultsView should give MGA moderation comparisons the same comparison-method tabs as path coefficients.',
)
assert.match(
  resultsViewSource,
  /function MgaOverviewPanel[\s\S]*setup[\s\S]*descriptives[\s\S]*GenericDataTable/,
  'ResultsView should render MGA overview as setup and group descriptives tables.',
)
assert.match(
  resultsViewSource,
  /analysisMode === 'mga' && selectedPanel === 'overview'[\s\S]*<MgaOverviewPanel/,
  'ResultsView should use the dedicated MGA overview renderer for the overview panel.',
)
assert.match(
  resultsViewSource,
  /function isMgaOverviewGroupBoundary[\s\S]*analysisMode !== 'mga' \|\| selectedPanel !== 'overview'[\s\S]*currentGroup[\s\S]*previousGroup[\s\S]*currentGroup !== previousGroup/,
  'MGA overview group descriptives should detect when the table moves from one group to the next.',
)
assert.match(
  resultsViewSource,
  /const hasMgaOverviewGroupGap = isMgaOverviewGroupBoundary\(rows, rowIndex, analysisMode, selectedPanel\)[\s\S]*borderTop: hasMgaOverviewGroupGap \? '8px solid var\(--color-right-panel-bg\)' : undefined[\s\S]*paddingTop: hasMgaOverviewGroupGap \? 14 : undefined/,
  'MGA overview group descriptives should render a visible space before the second group.',
)
assert.match(
  resultsViewSource,
  /getPanelDataFromResults\(analysisMode, selectedPanel, analysisResults, \{[\s\S]*savedModel/,
  'ResultsView should pass the saved model into panel data so HOC and moderation context can be derived.',
)

console.log('PASS multi-group analysis results contract')
