import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFile(path.join(root, file), 'utf8')

const resultsView = await read('src/pages/ResultsView.tsx')
const predictModal = await read('src/components/PlsPredictModal.tsx')
const preferencesModal = await read('src/components/PreferencesModal.tsx')
const settingsTs = await read('src/utils/plsPredictSettings.ts')
const plumberR = await read('r-api/plumber.R')

// 1. ResultsView should conditionally emit predict_EA or predict_DA based on technique
assert.match(
  resultsView,
  /predict_EA/,
  'ResultsView generateRScript should support predict_EA when Earliest/Entire Antecedents is selected.',
)
assert.doesNotMatch(
  resultsView,
  /prediction <- predict_pls\(model,\s*technique = predict_DA,/m,
  'ResultsView generateRScript should not hardcode predict_DA for PLSpredict export.',
)

// 2. UI labels and types should use "Earliest antecedents (EA)"
assert.match(
  predictModal,
  /Earliest antecedents \(EA\)/,
  'PlsPredictModal should display "Earliest antecedents (EA)".',
)
assert.match(
  preferencesModal,
  /Earliest antecedents \(EA\)/,
  'PreferencesModal should list "Earliest antecedents (EA)".',
)
assert.match(
  settingsTs,
  /Earliest antecedents \(EA\)/,
  'plsPredictSettings.ts should define and normalize to "Earliest antecedents (EA)".',
)

// 3. plumber.R should support both Earliest and Entire Antecedents
assert.match(
  plumberR,
  /EARLIEST ANTECEDENTS \(EA\)/,
  'plumber.R should support EARLIEST ANTECEDENTS (EA).',
)

console.log('PASS PLSpredict export script and earliest antecedents contract')
