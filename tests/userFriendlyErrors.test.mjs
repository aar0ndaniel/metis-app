import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const workspaceRoot = path.resolve(process.cwd())
const tmpDir = path.join(workspaceRoot, 'node_modules', '.tmp-tests')

async function bundleModule(relativeEntry, outfileName) {
  await fs.mkdir(tmpDir, { recursive: true })
  const outfile = path.join(tmpDir, outfileName)
  try {
    await build({
      entryPoints: [path.join(workspaceRoot, relativeEntry)],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      logLevel: 'silent',
    })
    return {
      module: await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`),
      error: null,
    }
  } catch (error) {
    return { module: null, error }
  }
}

const bundled = await bundleModule('src/utils/userFriendlyErrors.ts', 'userFriendlyErrors.test.bundle.mjs')
assert.ok(!bundled.error, `Expected src/utils/userFriendlyErrors.ts to compile, got: ${bundled.error?.message ?? 'unknown error'}`)

const { formatUserFriendlyAnalysisError } = bundled.module ?? {}
assert.equal(typeof formatUserFriendlyAnalysisError, 'function', 'Error helper should export formatUserFriendlyAnalysisError.')

const cases = [
  [
    'Dataset is missing indicator columns: ATT1, ATT2',
    'Your dataset could not be found or does not match the indicators in the model. Please re-import the dataset and check indicator names.',
  ],
  [
    'constructs[2].indicators must contain at least 1 item(s).',
    'One or more constructs do not have indicators assigned. Please add indicators to every construct before running the model.',
  ],
  [
    'paths[1].from references unknown construct "Trust".',
    'One or more model paths point to a construct that no longer exists. Please delete and redraw the affected relationship.',
  ],
  [
    'Advanced analysis requires seminrExtras in the R backend.',
    'Advanced analysis needs the seminrExtras R package. Install seminrExtras in the selected R runtime, then run Advanced analysis again.',
  ],
  [
    "Selected target 'Loyalty' has no predecessors in the current model.",
    'The selected target has no incoming predictors. Choose a target with incoming paths, or add paths to the model.',
  ],
  [
    'PLSpredict could not be computed for this model. seminr returned no prediction (this can happen for model shapes it does not support).',
    'PLSpredict is not available for this model shape. Check the execution log, simplify unsupported model parts, or continue with PLS-SEM and Bootstrap.',
  ],
  [
    'Bootstrap analysis ran out of memory. Try fewer bootstrap subsamples, close other heavy apps, or run the analysis on a machine with more RAM.',
    'Bootstrap ran out of memory. Use fewer subsamples, close other heavy apps, or run it on a machine with more RAM.',
  ],
  [
    'The R analysis engine stopped responding before it could return results.',
    'The analysis engine stopped responding during this run. Try fewer samples, close other heavy apps, or restart Metis and run it again.',
  ],
  [
    'Package "readxl" is required to read Excel files.',
    'Metis cannot read Excel files because the R package readxl is missing. Install readxl or import the dataset as CSV.',
  ],
  [
    'Dataset path is outside trusted metis workspace directories.',
    'The selected dataset is outside the folders Metis is allowed to analyze. Re-import the dataset into the current workspace.',
  ],
]

for (const [raw, expected] of cases) {
  assert.equal(formatUserFriendlyAnalysisError(raw), expected, `Unexpected friendly message for: ${raw}`)
}

assert.equal(
  formatUserFriendlyAnalysisError('Some rare R error that should remain visible.'),
  'The model could not be calculated. Backend detail: Some rare R error that should remain visible.',
  'Unknown backend failures should keep the backend detail after a friendly lead-in.',
)

assert.equal(
  formatUserFriendlyAnalysisError({
    error: 'PLSpredict analysis failed.',
    userAction: 'Reopen PLSpredict settings and choose fewer folds.',
    backendDetail: 'folds must be between 2 and 20.',
  }),
  'Reopen PLSpredict settings and choose fewer folds.',
  'Structured backend failures should prefer the explicit userAction guidance.',
)

const modelCanvas = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const resultsView = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')

assert.match(
  modelCanvas,
  /function toLaymanErrorMessage\(rawError: unknown\): string/,
  'ModelCanvas error wrapper should accept structured backend response objects.',
)

assert.ok(
  (modelCanvas.match(/toLaymanErrorMessage\(result\)/g) ?? []).length >= 4,
  'ModelCanvas should pass failed analysis response objects into the shared formatter so userAction metadata is preserved.',
)

assert.match(
  resultsView,
  /formatUserFriendlyAnalysisError/,
  'ResultsView should use the same shared friendly analysis error formatter as ModelCanvas.',
)

assert.doesNotMatch(
  resultsView,
  /normalizeAnalysisFailureMessage\(result\.error\)/,
  'ResultsView should pass full failed analysis responses into the shared formatter, not only result.error.',
)

console.log('PASS user-friendly analysis error contracts')
