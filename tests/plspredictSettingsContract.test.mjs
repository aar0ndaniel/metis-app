import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFile(path.join(root, file), 'utf8')

const settings = await read('src/utils/plsPredictSettings.ts')
const modal = await read('src/components/PlsPredictModal.tsx')
const api = await read('src/services/plsApi.ts')
const canvas = await read('src/pages/ModelCanvas.tsx')
const preferences = await read('src/components/PreferencesModal.tsx')
const resultsView = await read('src/pages/ResultsView.tsx')

assert.match(settings, /technique:\s*'Direct antecedents \(DA\)'\s*\|\s*'Entire antecedents \(EA\)'/, 'PLSpredict settings should carry the selected SEMinR technique.')
assert.match(settings, /predictionSeed:\s*number/, 'PLSpredict settings should carry a reproducible prediction seed.')
assert.match(settings, /validationMode:\s*'K-fold'\s*\|\s*'LOOCV'/, 'PLSpredict settings should carry the selected cross-validation mode.')
assert.match(settings, /technique:\s*'Direct antecedents \(DA\)'/, 'The frontend and backend should share the DA default.')
assert.match(settings, /predictionSeed:\s*123/, 'The frontend should use the deterministic backend prediction seed by default.')
assert.match(settings, /algorithmSettings\?\.predictionSeed|predictionSeed\s*:/, 'Results should preserve the prediction seed in algorithm metadata.')

assert.match(modal, /Prediction technique/, 'The PLSpredict dialog should expose the prediction technique.')
assert.match(modal, /Validation mode|LOOCV/, 'The PLSpredict dialog should expose LOOCV.')
assert.doesNotMatch(modal, /Interaction method|Product-indicator|Orthogonal/, 'PLSpredict should not expose a prediction-only interaction method selector.')
assert.match(modal, /Prediction seed/, 'The PLSpredict dialog should expose the prediction seed.')
assert.match(modal, /Direct antecedents \(DA\)/, 'The PLSpredict dialog should expose DA.')
assert.match(modal, /Entire antecedents \(EA\)/, 'The PLSpredict dialog should expose EA.')

assert.match(api, /missingData\?:\s*string/, 'The request contract should carry missing-data handling.')
assert.match(api, /missingValue\?:\s*string/, 'The request contract should carry the SEMinR missing-value sentinel.')
assert.match(api, /assessSyntax\?:\s*boolean/, 'The request contract should carry SEMinR syntax assessment.')
assert.match(api, /technique\?:\s*string/, 'The PLSpredict request should carry the selected technique.')
assert.match(api, /predictionSeed\?:\s*number/, 'The PLSpredict request should carry the selected seed.')
assert.match(api, /validationMode\?:\s*string/, 'The PLSpredict request should carry the selected cross-validation mode.')

assert.match(canvas, /prefs:missingData/, 'Analysis payloads should read missing-data preferences.')
assert.match(canvas, /prefs:assessSyntax/, 'Analysis payloads should read syntax-assessment preferences.')
assert.match(canvas, /prefs:predictTechnique/, 'PLSpredict should read its technique from Preferences.')
assert.match(canvas, /prefs:predictSeed/, 'PLSpredict should read its seed from Preferences.')
assert.match(canvas, /predictionSeed:\s*normalizedSettings\.predictionSeed/, 'PLSpredict should send the normalized seed.')
assert.match(canvas, /technique:\s*normalizedSettings\.technique/, 'PLSpredict should send the normalized technique.')
assert.match(canvas, /validationMode:\s*normalizedSettings\.validationMode/, 'PLSpredict should send the normalized cross-validation mode.')

assert.match(preferences, /predictSeed/, 'Preferences should persist a prediction seed.')
assert.match(preferences, /Prediction seed/, 'Preferences should display a prediction seed control.')
assert.match(preferences, /assessSyntax/, 'Preferences should expose SEMinR syntax assessment.')
assert.match(preferences, /missingValue|Missing value sentinel/, 'Preferences should expose the SEMinR missing-value sentinel.')

assert.match(resultsView, /algorithmSettings/, 'Results-view reruns should preserve the recorded algorithm settings.')
assert.match(resultsView, /technique:\s*normalizedSettings\.technique/, 'Results-view PLSpredict reruns should preserve the recorded technique.')
assert.match(resultsView, /predictionSeed:\s*normalizedSettings\.predictionSeed/, 'Results-view PLSpredict reruns should preserve the recorded seed.')
assert.match(resultsView, /validationMode:\s*normalizedSettings\.validationMode/, 'Results-view PLSpredict reruns should preserve the recorded cross-validation mode.')

console.log('PASS PLSpredict settings contract coverage')
