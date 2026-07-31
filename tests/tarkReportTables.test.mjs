import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')

async function importTsModule(relativeEntry, outfileName) {
  const sourcePath = path.join(workspaceRoot, relativeEntry)
  const outfile = path.join(tempDir, outfileName)
  const source = await fs.readFile(sourcePath, 'utf8')

  await fs.mkdir(tempDir, { recursive: true })

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  })
  await fs.writeFile(outfile, transpiled.outputText, 'utf8')

  const moduleUrl = `${pathToFileURL(outfile).href}?t=${Date.now()}`
  return import(moduleUrl)
}

const {
  buildTarkDiagramResults,
  buildTarkReportSections,
  buildTarkAdvancedAnalysisSections,
  TARK_USER_FILL_CELL,
} = await importTsModule('src/utils/tarkReportTables.ts', 'tarkReportTables.test.bundle.mjs')

const request = {
  workspaceId: 'workspace-1',
  modelId: 'model-1',
  reportTitle: 'Tark report',
  includePathDiagram: true,
  structuralPathMode: 'Path coefficients',
  indicatorPathMode: 'Outer loadings',
  constructValueMode: 'R-square',
  includeAdvancedAnalysis: false,
  tableLabelMode: 'full',
  constructLabels: {
    PEOU: 'Perceived Ease of Use',
    ATT: 'Attitude',
  },
}

const savedModel = {
  constructs: [
    {
      id: 'c-peou',
      name: 'PEOU',
      type: 'Reflective',
      color: '#87976B',
      x: 100,
      y: 120,
      radius: 48,
      indicators: [{ name: 'PEOU1', loading: null }, { name: 'PEOU2', loading: null }],
    },
    {
      id: 'c-att',
      name: 'ATT',
      type: 'Reflective',
      color: '#87976B',
      x: 330,
      y: 120,
      radius: 48,
      indicators: [{ name: 'ATT1', loading: null }],
    },
  ],
  paths: [{ id: 'p1', from: 'c-peou', to: 'c-att' }],
}

const plsResults = {
  final_results: {
    outer_loadings: [
      { row_name: 'PEOU1', PEOU: 0.812, ATT: 0 },
      { row_name: 'ATT1', PEOU: 0, ATT: 0.901 },
      { row_name: 'PEOU2', PEOU: 0.834, ATT: 0 },
    ],
    outer_weights: [
      { row_name: 'PEOU1', PEOU: 0.412, ATT: 0 },
    ],
    path_coefficients: [
      { row_name: 'PEOU -> ATT', coefficient: 0.561 },
    ],
    total_effects: [
      { row_name: 'PEOU', ATT: 0.612 },
    ],
    total_indirect_effects: [
      { row_name: 'PEOU', ATT: 0.051 },
    ],
    latent_variables: [
      { PEOU: 1, ATT: 2 },
      { PEOU: 2, ATT: 3 },
      { PEOU: 3, ATT: 5 },
    ],
  },
  quality_criteria: {
    reliability: [
      { row_name: "Cronbach's alpha", PEOU: { value: 0.8 }, ATT: 0.86 },
      { row_name: 'rho_A', PEOU: { estimate: 0.82 }, ATT: 0.87 },
      { row_name: 'Composite reliability', PEOU: [0.88], ATT: 0.91 },
      { row_name: 'AVE', PEOU: { value: 0.65 }, ATT: 0.76 },
    ],
    outer_vif: [
      { row_name: 'PEOU', '1': { value: 1.234 }, '2': 1.345 },
      { row_name: 'ATT', '1': 1.456 },
    ],
    discriminant_validity: [
      { method: 'Fornell-Larcker', row_name: 'PEOU', PEOU: 0.806, ATT: 0.55 },
      { method: 'HTMT', row_name: 'PEOU', ATT: { value: 0.734 } },
    ],
    r_square: [
      { row_name: 'ATT', R2: 0.42, 'R Square Adjusted': { value: 0.4 } },
    ],
    f_square: [
      { row_name: 'PEOU', ATT: 0.123 },
    ],
    model_fit: [
      { row_name: 'SRMR', value: { value: 0.059 } },
      { row_name: 'Saturated Model', SRMR: 0.061, d_ULS: 0.302, d_G: 0.211, NFI: 0.912, value: { nested: true } },
    ],
  },
}

const bootstrapResults = {
  final_results: {
    path_coefficients: [
      {
        row_name: 'PEOU -> ATT',
        'Original sample (O)': { value: 0.561 },
        'Sample mean (M)': { value: 0.552 },
        'Standard deviation (STDEV)': { value: 0.08 },
        'T statistics (|O/STDEV|)': { value: 7.013 },
        'X2.5..CI': 0.404,
        'X97.5..CI': 0.701,
      },
    ],
  },
}

const plsPredictResults = {
  final_results: {
    plspredict_lv_summary: [
      { row_name: 'ATT', Q2predict: 0.231 },
    ],
  },
}

const savedAnalyses = new Map([
  ['pls-sem', { mode: 'pls-sem', results: plsResults }],
  ['bootstrap', { mode: 'bootstrap', results: bootstrapResults }],
  ['plspredict', { mode: 'plspredict', results: plsPredictResults }],
])

const sections = buildTarkReportSections(request, savedAnalyses, savedModel)
const byTitle = new Map(sections.map((section) => [section.title, section]))

const measurement = byTitle.get('Measurement model assessment')
assert.deepEqual(
  measurement.headers,
  ['Construct', 'Indicator', 'Loading', 'VIF', 'Cronbach’s α', 'rho_A', 'CR', 'AVE'],
)
assert.deepEqual(
  measurement.rows[0],
  ['Perceived Ease of Use', 'PEOU1', '0.812', '1.234', '0.800', '0.820', '0.880', '0.650'],
)
assert.deepEqual(
  measurement.rows[1],
  [TARK_USER_FILL_CELL, 'PEOU2', '0.834', '1.345', TARK_USER_FILL_CELL, TARK_USER_FILL_CELL, TARK_USER_FILL_CELL, TARK_USER_FILL_CELL],
)
assert.deepEqual(
  measurement.rows[2],
  ['Attitude', 'ATT1', '0.901', '1.456', '0.860', '0.870', '0.910', '0.760'],
)

const discriminant = byTitle.get('Discriminant validity assessment')
assert.deepEqual(discriminant.headers, ['Construct', 'Attitude'])
assert.deepEqual(discriminant.rows, [['Perceived Ease of Use', '0.734']])

const structural = byTitle.get('Structural model assessment')
assert.deepEqual(
  structural.headers,
  ['Hypothesis', 'Path', 'β', 'Mean', 'STDEV', 't-value', 'p-value', '95% CI', 'f²', 'Effect size', 'Decision'],
)
assert.deepEqual(
  structural.rows[0],
  ['\u200B', 'Perceived Ease of Use → Attitude', '0.561', '0.552', '0.080', '7.013', '<.001', '[0.404, 0.701]', '0.123', 'Small', 'Supported'],
)

const power = byTitle.get('Explanatory and predictive power')
assert.deepEqual(
  power.rows[0],
  ['Attitude', '0.420', '0.400', '\u200B', '0.231', '\u200B'],
)

const modelFit = byTitle.get('Model fit assessment')
assert.deepEqual(modelFit.rows.slice(0, 4), [
  ['SRMR', '0.059'],
  ['d_ULS', '0.302'],
  ['d_G', '0.211'],
  ['NFI', '0.912'],
])
assert.equal(modelFit.rows.some((row) => row.includes('[object Object]')), false)

const plsResultsWithoutOuterVif = {
  ...plsResults,
  quality_criteria: {
    ...plsResults.quality_criteria,
    outer_vif: [],
  },
  model_and_data: {
    indicator_data_correlations: [
      { row_name: 'PEOU1', PEOU1: 1, PEOU2: 0.4354625216389965 },
      { row_name: 'PEOU2', PEOU1: 0.4354625216389965, PEOU2: 1 },
    ],
  },
}
const fallbackSections = buildTarkReportSections(
  request,
  new Map([
    ['pls-sem', { mode: 'pls-sem', results: plsResultsWithoutOuterVif }],
    ['bootstrap', { mode: 'bootstrap', results: bootstrapResults }],
    ['plspredict', { mode: 'plspredict', results: plsPredictResults }],
  ]),
  savedModel,
)
const fallbackMeasurement = fallbackSections.find((section) => section.title === 'Measurement model assessment')
assert.equal(fallbackMeasurement.rows[0][3], '1.234')
assert.equal(fallbackMeasurement.rows[1][3], '1.234')

const diagramResults = buildTarkDiagramResults(plsResults, savedModel)
assert.equal(diagramResults.pathResults['PEOU-ATT'].coef, 0.561)
assert.equal(diagramResults.pathResults['PEOU-ATT'].totalEffect, 0.612)
assert.equal(diagramResults.pathResults['PEOU-ATT'].indirectEffect, 0.051)
assert.equal(Math.round(diagramResults.pathResults['PEOU-ATT'].correlation * 1000) / 1000, 0.982)
assert.equal(diagramResults.pathResults['c-peou-c-att'].coef, 0.561)
assert.equal(diagramResults.measurementResults['PEOU::PEOU1'].loading, 0.812)
assert.equal(diagramResults.measurementResults['PEOU::PEOU1'].weight, 0.412)
assert.equal(diagramResults.constructScores.ATT.r2, 0.42)

const bootstrapDiagramResults = buildTarkDiagramResults(savedAnalyses, savedModel)
assert.equal(bootstrapDiagramResults.pathResults['PEOU-ATT'].tStat, 7.013)
assert.ok(bootstrapDiagramResults.pathResults['PEOU-ATT'].pValue < 0.05)
assert.equal(bootstrapDiagramResults.constructScores.ATT.q2, 0.231)

const micomResults = {
  groups: {
    groupingVariable: 'Gender',
    groupA: 'Female',
    groupB: 'Male',
    leftValue: 'Female',
    rightValue: 'Male',
    counts: { groupA: 146, groupB: 173 },
  },
  settings: { permutations: 500, alpha: 0.05, seed: 123 },
  configuralInvariance: {
    checks: [
      { check: 'same model structure', status: 'passed' },
      { check: 'same indicators', status: 'passed' },
      { check: 'same construct specification', status: 'passed' },
    ],
    passed: true,
    status: 'passed',
  },
  compositionalInvariance: [
    { construct: 'Satisfaction', c_value: 0.997, ci_lower: 0.991, p_value: 0.002, decision: 'supported' },
  ],
  equalityAssessment: [
    {
      construct: 'Satisfaction',
      mean_diff: 0.12,
      mean_ci_lower: -0.08,
      mean_ci_upper: 0.25,
      mean_decision: 'supported',
      variance_diff: 0.03,
      variance_ci_lower: -0.1,
      variance_ci_upper: 0.12,
      variance_decision: 'supported',
    },
  ],
  invarianceClassification: [
    {
      construct: 'Satisfaction',
      configural_invariance: 'passed',
      compositional_invariance: 'supported',
      equality_of_means: 'supported',
      equality_of_variances: 'supported',
      classification: 'Partial measurement invariance',
    },
  ],
  hocContext: [
    {
      higher_order_construct: 'Engagement HOC',
      dimensions: 'Social Interaction, Content Sharing',
      invariance_result: 'Partial measurement invariance',
      notes: 'Uses fitted HOC construct scores from the same SEMinR model specification.',
    },
  ],
}

const mgaResults = {
  groups: {
    groupingVariable: 'Gender',
    groupA: 'Female',
    groupB: 'Male',
    leftValue: 'Female',
    rightValue: 'Male',
    counts: { groupA: 146, groupB: 173 },
  },
  settings: { nboot: 500, alpha: 0.05, seed: 123 },
  groupSpecific: {
    groupA: {
      final_results: {
        path_coefficients: [
          { row_name: 'Image -> Satisfaction', 'Original Est.': 0.51, 'T Stat.': 6.38, 'P Value': 0.001 },
          { row_name: 'Service -> Loyalty', 'Original Est.': 0.22, 'T Stat.': 2.04, 'P Value': 0.041 },
        ],
      },
    },
    groupB: {
      final_results: {
        path_coefficients: [
          { row_name: 'Image -> Satisfaction', 'Original Est.': 0.31, 'T Stat.': 3.44, 'P Value': 0.002 },
          { row_name: 'Service -> Loyalty', 'Original Est.': 0.19, 'T Stat.': 1.77, 'P Value': 0.076 },
        ],
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
          diff: 0.2,
          difference_ci_lower: 0.2,
          difference_ci_upper: 0.7,
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
          pls_mga_p: 0.01,
          result: 'Significant',
        },
      ],
      parametricTest: [
        {
          path: 'Image -> Satisfaction',
          groupA_beta: 0.51,
          groupB_beta: 0.31,
          diff: 0.2,
          p_value: 0.02,
          result: 'Significant',
        },
      ],
    },
    outerLoadings: {
      biasCorrectedConfidenceIntervals: [
        {
          construct: 'Image',
          indicator: 'IMAG1',
          groupA_loading: 0.82,
          groupB_loading: 0.79,
          diff: 0.03,
          difference_ci_lower: 0.01,
          difference_ci_upper: 0.05,
          result: 'Significant',
        },
      ],
      henselerPlsMga: [
        {
          construct: 'Image',
          indicator: 'IMAG1',
          groupA_loading: 0.82,
          groupB_loading: 0.79,
          diff: 0.03,
          pls_mga_p: 0.03,
          result: 'Significant',
        },
      ],
      parametricTest: [
        {
          construct: 'Image',
          indicator: 'IMAG1',
          groupA_loading: 0.82,
          groupB_loading: 0.79,
          diff: 0.03,
          p_value: 0.04,
          result: 'Significant',
        },
      ],
    },
    outerWeights: {
      biasCorrectedConfidenceIntervals: [
        {
          construct: 'Image',
          indicator: 'IMAG1',
          groupA_weight: 0.31,
          groupB_weight: 0.27,
          diff: 0.04,
          difference_ci_lower: 0.02,
          difference_ci_upper: 0.06,
          result: 'Significant',
        },
      ],
      henselerPlsMga: [
        {
          construct: 'Image',
          indicator: 'IMAG1',
          groupA_weight: 0.31,
          groupB_weight: 0.27,
          diff: 0.04,
          pls_mga_p: 0.03,
          result: 'Significant',
        },
      ],
      parametricTest: [
        {
          construct: 'Image',
          indicator: 'IMAG1',
          groupA_weight: 0.31,
          groupB_weight: 0.27,
          diff: 0.04,
          p_value: 0.04,
          result: 'Significant',
        },
      ],
    },
  },
  hocContext: [
    {
      higher_order_construct: 'Engagement HOC',
      dimensions: 'Social Interaction, Content Sharing',
      role: 'Predictor',
      compared_path: 'Engagement HOC -> Loyalty',
      groupA_estimate: 0.44,
      groupB_estimate: 0.39,
      difference: 0.05,
      decision: 'Established',
    },
  ],
  pathCoefficients: {
    henselerPlsMga: [
      {
        path: 'Image -> Satisfaction',
        group1_beta: 0.51,
        group2_beta: 0.31,
        diff: 0.2,
        pls_mga_p: 0.01,
        p_value: 0.01,
        p_value_inverse: 0.99,
        significant: true,
        decision: 'significant',
      },
    ],
  },
  significantDifferences: [
    {
      path: 'Image -> Satisfaction',
      group1_beta: 0.51,
      group2_beta: 0.31,
      diff: 0.2,
      pls_mga_p: 0.01,
      p_value: 0.01,
      significant: true,
      decision: 'significant',
    },
  ],
  execution_log: [{ message: 'MGA ran for Gender = Female vs Male.' }],
}

const advancedSections = buildTarkAdvancedAnalysisSections(
  [
    { id: 'micom', label: 'MICOM', saved: true },
    { id: 'mga', label: 'MGA', saved: true },
  ],
  new Map([
    ['pls-sem', { mode: 'pls-sem', results: plsResults }],
    ['bootstrap', { mode: 'bootstrap', results: bootstrapResults }],
    ['plspredict', { mode: 'plspredict', results: plsPredictResults }],
    ['permutation', { mode: 'permutation', results: micomResults }],
    ['mga', { mode: 'mga', results: mgaResults }],
  ]),
  savedModel,
)

const advancedByTitle = new Map(advancedSections.map((section) => [section.title, section]))

assert.deepEqual(
  advancedSections.map((section) => section.title),
  [
    'Measurement invariance assessment',
    'Configural invariance assessment',
    'Compositional invariance assessment',
    'Equality of construct means',
    'Equality of construct variances',
    'Measurement invariance classification',
    'Higher-order construct invariance context',
    'Multi-group analysis',
    'Group-specific structural path results',
    'Multi-group comparison of path coefficients',
    'Multi-group comparison of outer loadings',
    'Multi-group comparison of outer weights',
    'Higher-order construct context in multi-group analysis',
  ],
  'The Tark advanced-report helper should emit dedicated MICOM and MGA section families instead of generic leaf tables.',
)

const configural = advancedByTitle.get('Configural invariance assessment')
assert.deepEqual(configural.headers, ['Requirement', 'Group A', 'Group B', 'Status'])
assert.deepEqual(configural.rows[0], ['Same model structure', 'Female', 'Male', 'Passed'])

const compositional = advancedByTitle.get('Compositional invariance assessment')
assert.deepEqual(compositional.headers, ['Construct', 'Original correlation', '5% quantile', 'Permutation p-value', 'Decision'])
assert.deepEqual(compositional.rows[0], ['Satisfaction', '0.997', '0.991', '0.002', 'Established'])

const equalityMeans = advancedByTitle.get('Equality of construct means')
assert.deepEqual(equalityMeans.headers, ['Construct', 'Group A mean', 'Group B mean', 'Mean difference', '95% permutation interval', 'Decision'])
assert.equal(equalityMeans.note.includes('Female'), true)
assert.equal(equalityMeans.note.includes('Male'), true)
assert.deepEqual(equalityMeans.rows[0], ['Satisfaction', '—', '—', '0.120', '[-0.080, 0.250]', 'Established'])

const equalityVariances = advancedByTitle.get('Equality of construct variances')
assert.deepEqual(equalityVariances.rows[0], ['Satisfaction', '—', '—', '0.030', '[-0.100, 0.120]', 'Established'])

const classification = advancedByTitle.get('Measurement invariance classification')
assert.deepEqual(classification.headers, ['Construct', 'Configural invariance', 'Compositional invariance', 'Equality of means', 'Equality of variances', 'Classification'])
assert.deepEqual(classification.rows[0], ['Satisfaction', 'Passed', 'Established', 'Established', 'Established', 'Partial measurement invariance'])

const hocContext = advancedByTitle.get('Higher-order construct invariance context')
assert.deepEqual(hocContext.headers, ['Higher-order construct', 'Dimensions', 'Invariance result', 'Notes'])
assert.deepEqual(hocContext.rows[0], ['Engagement HOC', 'Social Interaction, Content Sharing', 'Partial measurement invariance', 'Uses fitted HOC construct scores from the same SEMinR model specification.'])

const mgaGroupSpecific = advancedByTitle.get('Group-specific structural path results')
assert.deepEqual(mgaGroupSpecific.headers, ['Path', 'Group A β', 'Group A t-value', 'Group A p-value', 'Group B β', 'Group B t-value', 'Group B p-value'])
assert.deepEqual(mgaGroupSpecific.rows[0], ['Image → Satisfaction', '0.510', '6.380', '0.001', '0.310', '3.440', '0.002'])

const mgaComparison = advancedByTitle.get('Multi-group comparison of path coefficients')
assert.deepEqual(mgaComparison.headers, ['Path', 'Group A β', 'Group B β', 'Difference', 'Bias-corrected 95% CI', 'PLS-MGA p-value', 'Parametric p-value', 'Decision'])
assert.deepEqual(mgaComparison.rows[0], ['Image → Satisfaction', '0.510', '0.310', '0.200', '[0.200, 0.700]', '0.010', '0.020', 'Significant difference'])

const mgaOuterLoadings = advancedByTitle.get('Multi-group comparison of outer loadings')
assert.deepEqual(mgaOuterLoadings.headers, ['Construct', 'Indicator', 'Group A loading', 'Group B loading', 'Difference', 'Bias-corrected 95% CI', 'PLS-MGA p-value', 'Parametric p-value', 'Decision'])
assert.deepEqual(mgaOuterLoadings.rows[0], ['Image', 'IMAG1', '0.820', '0.790', '0.030', '[0.010, 0.050]', '0.030', '0.040', 'Significant difference'])

const mgaOuterWeights = advancedByTitle.get('Multi-group comparison of outer weights')
assert.deepEqual(mgaOuterWeights.rows[0], ['Image', 'IMAG1', '0.310', '0.270', '0.040', '[0.020, 0.060]', '0.030', '0.040', 'Significant difference'])

const mgaHocContext = advancedByTitle.get('Higher-order construct context in multi-group analysis')
assert.deepEqual(mgaHocContext.headers, ['Higher-order construct', 'Dimensions', 'Role', 'Compared path', 'Group A estimate', 'Group B estimate', 'Difference', 'Decision'])
assert.deepEqual(mgaHocContext.rows[0], ['Engagement HOC', 'Social Interaction, Content Sharing', 'Predictor', 'Engagement HOC -> Loyalty', '0.440', '0.390', '0.050', 'Established'])

console.log('PASS Tark report table builders use saved result values')

