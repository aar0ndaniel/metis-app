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

console.log('PASS Tark report table builders use saved result values')
