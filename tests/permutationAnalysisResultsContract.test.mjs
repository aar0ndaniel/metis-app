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

const panelCatalog = await bundleModule('src/results/panelCatalog.ts', 'permutationPanelCatalog.test.bundle.mjs')
const panelData = await bundleModule('src/results/panelData.ts', 'permutationPanelData.test.bundle.mjs')
const panelExport = await bundleModule('src/results/panelExport.ts', 'permutationPanelExport.test.bundle.mjs')
const resultsViewSource = await readSource('src/pages/ResultsView.tsx')
const modelCanvasSource = await readSource('src/pages/ModelCanvas.tsx')

assert.match(
  await readSource('src/results/panelCatalog.ts'),
  /export type AnalysisMode = 'pls-sem' \| 'bootstrap' \| 'plspredict' \| 'advanced' \| 'permutation'/,
  'Permutation should be a first-class AnalysisMode.',
)

const permutationSections = panelCatalog.getPanelSectionsForMode('permutation')
const permutationPanelIds = permutationSections.flatMap((section) => section.items.map((item) => item.id))
assert.deepEqual(permutationPanelIds, [
  'overview',
  'compositional-invariance',
  'equality-means',
  'equality-variances',
  'invariance-classification',
  'algorithm-settings',
  'execution-log',
])
const hocPermutationPanelIds = panelCatalog
  .getPanelSectionsForMode('permutation', { hasHigherOrderConstructs: true })
  .flatMap((section) => section.items.map((item) => item.id))
assert.ok(
  hocPermutationPanelIds.includes('hoc-context'),
  'MICOM results should expose HOC context when the saved model has higher-order constructs.',
)
assert.ok(
  !permutationPanelIds.includes('hoc-context'),
  'MICOM results should not show HOC context for ordinary first-order models.',
)
assert.equal(
  permutationPanelIds.includes('configural-invariance'),
  false,
  'Configural invariance should stay in the MICOM modal and not appear as a results panel.',
)

assert.equal(panelExport.getModeResultsLabel('permutation'), 'Permutation Analysis Results')
assert.equal(panelExport.getPanelTitle('compositional-invariance'), 'Compositional Invariance')
assert.equal(panelExport.getPanelTitle('equality-means'), 'Equality of Means')
assert.equal(panelExport.getPanelTitle('equality-variances'), 'Equality of Variances')
assert.equal(panelExport.getPanelTitle('invariance-classification'), 'Invariance Classification')
assert.equal(panelExport.getPanelTitle('hoc-context'), 'Higher-Order Construct Context')

const sampleResults = {
  groups: {
    groupingVariable: 'Gender',
    groupA: 'Male',
    groupB: 'Female',
    leftValue: 'Male',
    rightValue: 'Female',
    counts: { groupA: 146, groupB: 173 },
  },
  settings: { permutations: 500, alpha: 0.05, seed: 123 },
  configuralInvariance: {
    checks: [{ check: 'group selection', status: 'passed', note: 'Selected groups are Male and Female.' }],
    passed: true,
  },
  compositionalInvariance: [
    { construct: 'Satisfaction', c_value: 0.997, ci_lower: 0.991, ci_upper: 1, p_value: 0.002, decision: 'supported' },
  ],
  equalityAssessment: [
    {
      construct: 'Satisfaction',
      mean_diff: 0.12,
      mean_ci_lower: -0.08,
      mean_ci_upper: 0.25,
      mean_p_value: 0.14,
      mean_decision: 'supported',
      variance_diff: 0.03,
      variance_ci_lower: -0.1,
      variance_ci_upper: 0.12,
      variance_p_value: 0.51,
      variance_decision: 'supported',
    },
  ],
  invarianceClassification: [{ construct: 'Satisfaction', classification: 'full' }],
  execution_log: [{ message: 'MICOM ran for Gender = Male vs Female.' }],
}

const hocModel = {
  constructs: [
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
    { id: 'engagement-loyalty', from: 'engagement', to: 'loyalty', kind: 'direct', hocRole: 'structural' },
  ],
}

assert.deepEqual(panelData.getPanelDataFromResults('permutation', 'overview', sampleResults), [
  {
    groupingVariable: 'Gender',
    groupA: 'Male',
    groupACount: 146,
    groupB: 'Female',
    groupBCount: 173,
    permutations: 500,
    alpha: 0.05,
    seed: 123,
  },
])
assert.equal(panelData.getPanelDataFromResults('permutation', 'configural-invariance', sampleResults), null)
assert.deepEqual(panelData.getPanelDataFromResults('permutation', 'compositional-invariance', sampleResults), sampleResults.compositionalInvariance)
assert.deepEqual(panelData.getPanelDataFromResults('permutation', 'equality-means', sampleResults), [
  {
    construct: 'Satisfaction',
    mean_diff: 0.12,
    mean_ci_lower: -0.08,
    mean_ci_upper: 0.25,
    mean_p_value: 0.14,
    mean_decision: 'supported',
  },
])
assert.deepEqual(panelData.getPanelDataFromResults('permutation', 'equality-variances', sampleResults), [
  {
    construct: 'Satisfaction',
    variance_diff: 0.03,
    variance_ci_lower: -0.1,
    variance_ci_upper: 0.12,
    variance_p_value: 0.51,
    variance_decision: 'supported',
  },
])
assert.deepEqual(panelData.getPanelDataFromResults('permutation', 'invariance-classification', sampleResults), sampleResults.invarianceClassification)
assert.deepEqual(panelData.getPanelDataFromResults('permutation', 'execution-log', sampleResults), sampleResults.execution_log)
assert.deepEqual(
  panelData.getPanelDataFromResults('permutation', 'hoc-context', sampleResults, { savedModel: hocModel }),
  [
    {
      'Higher-order construct': 'Engagement HOC',
      Type: 'reflective',
      Dimensions: 'Social Interaction, Content Sharing',
      'Dimension count': 2,
      'Structural role': 'Predictor in Engagement HOC -> Loyalty',
      'MICOM/MGA handling': 'Uses fitted HOC construct scores from the same SEMinR model specification.',
    },
  ],
  'MICOM should report HOC context so invariance rows can be interpreted as fitted HOC construct scores.',
)
assert.deepEqual(
  panelData.getPanelDataFromResults('permutation', 'hoc-context', {
    final_results: {
      hoc_results: [
        {
          hoc_construct: 'Engagement HOC',
          loc_construct: 'Content Sharing',
          hoc_type: 'reflective',
          loc_type: 'reflective',
          loading: 0.91,
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
      Dimensions: 'Content Sharing',
      'Dimension count': 1,
      'Structural role': 'Available from saved HOC results',
      Loading: 0.91,
      Weight: null,
      VIF: null,
      'MICOM/MGA handling': 'Uses fitted HOC construct scores from the same SEMinR model specification.',
    },
  ],
  'MICOM HOC context should read the existing final_results.hoc_results fallback when no model snapshot is available.',
)

assert.match(
  resultsViewSource,
  /savedAnalysis\?\.mode === 'permutation'/,
  'ResultsView should accept navigated saved permutation analysis results.',
)
assert.match(
  resultsViewSource,
  /modeRaw === 'permutation'/,
  'ResultsView should restore permutation results from shared analysis-mode storage.',
)
assert.match(
  resultsViewSource,
  /if \(savedAnalysis\.mode === 'permutation'\) setSelectedPanel\('overview'\)/,
  'ResultsView should open permutation results on the MICOM overview panel.',
)
assert.match(
  resultsViewSource,
  /function humanizeResultTableHeader[\s\S]*\(\[a-z0-9\]\)\(\[A-Z\]\)[\s\S]*return humanizeResultTableHeader\(header\)/,
  'MICOM result tables should split camelCase headers such as groupingVariable and groupACount into separate words.',
)
assert.match(
  resultsViewSource,
  /function shouldFormatOverviewInteger[\s\S]*groupacount[\s\S]*groupbcount[\s\S]*permutations[\s\S]*seed[\s\S]*Math\.round/,
  'MICOM overview counts, permutations, and seed should display as whole numbers while alpha keeps decimal precision.',
)
assert.match(
  resultsViewSource,
  /hasHigherOrderConstructs[\s\S]*buildSidebarSections\(analysisMode, moderationAvailable, mgaGroupLabels, hasHigherOrderConstructs\)/,
  'ResultsView should pass HOC availability into the MICOM sidebar builder.',
)
assert.match(
  resultsViewSource,
  /savedAnalysis\?\.modelSnapshot[\s\S]*navState\?\.savedModelSnapshot[\s\S]*setSavedModel\(cloneResultsModelSnapshot\(analysisModelSnapshot/,
  'ResultsView should prefer the analysis-time model snapshot embedded in saved analysis state.',
)
assert.match(
  resultsViewSource,
  /persistResultsToWorkspace\s*=\s*useCallback\(\(options:[\s\S]*modelSnapshot\?: \{ constructs: CanvasConstruct\[\]; paths: CanvasPath\[\] \} \| null[\s\S]*analysis:\s*\{[\s\S]*modelSnapshot:\s*options\.modelSnapshot/,
  'ResultsView rerun persistence should write the analysis-time model snapshot into saved analysis state.',
)
assert.match(
  resultsViewSource,
  /handleRunPermutationFromResults\s*=\s*useCallback\(async \(settings: PermutationAnalysisSettings\)[\s\S]*persistResultsToWorkspace\(\{[\s\S]*mode:\s*'permutation'[\s\S]*modelSnapshot:\s*savedModel/,
  'Results-screen MICOM reruns should preserve the model snapshot that produced the result.',
)
assert.match(
  modelCanvasSource,
  /\.\.\.\(analysisState\s*\?\s*\{\s*analysis:\s*\{\s*\.\.\.analysisState,\s*modelSnapshot:\s*snapshot\s*\}\s*\}\s*:\s*\{\}\)/,
  'ModelCanvas should persist the analysis-time model snapshot inside saved analysis state.',
)
assert.match(
  resultsViewSource,
  /function getPermutationDecisionTextColor[\s\S]*not supported[\s\S]*var\(--color-danger\)[\s\S]*supported[\s\S]*var\(--color-success\)/,
  'MICOM decision cells should color supported decisions green and not-supported decisions red.',
)

assert.match(
  resultsViewSource,
  /runPermutationAnalysisModel[\s\S]*runPermutationConfiguralPrecheck/,
  'ResultsView should import the MICOM calculation and configural precheck services for menu parity on the results screen.',
)
assert.match(
  resultsViewSource,
  /handleRunPermutationFromResults\s*=\s*useCallback\(async \(settings: PermutationAnalysisSettings\)[\s\S]*runPermutationAnalysisModel\(\{[\s\S]*groupingVariable:\s*settings\.groupingVariable[\s\S]*groupA:\s*settings\.groupA[\s\S]*groupB:\s*settings\.groupB[\s\S]*permutations:\s*settings\.permutations[\s\S]*alpha:\s*settings\.alpha[\s\S]*seed:\s*settings\.seed/,
  'ResultsView should run MICOM with the displayed left/right unique values when the results-screen modal is used.',
)
assert.match(
  resultsViewSource,
  /handlePermutationConfiguralPrecheckFromResults\s*=\s*useCallback\(async \(settings: PermutationAnalysisSettings\)[\s\S]*runPermutationConfiguralPrecheck\(\{[\s\S]*groupA:\s*settings\.groupA[\s\S]*groupB:\s*settings\.groupB/,
  'ResultsView should run the live MICOM configural precheck for its modal path.',
)
assert.match(
  resultsViewSource,
  /<PermutationAnalysisModal[\s\S]*configuralStatus=\{permutationConfiguralStatus\}[\s\S]*onPrecheck=\{handlePermutationConfiguralPrecheckFromResults\}[\s\S]*onRun=\{handleRunPermutationFromResults\}[\s\S]*isRunning=\{isAnalysisRunning\}/,
  'ResultsView permutation modal should receive dynamic precheck status, onPrecheck, onRun, and running state.',
)

console.log('PASS permutation analysis results contract')
