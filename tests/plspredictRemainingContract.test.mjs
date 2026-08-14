import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const backend = await fs.readFile(path.join(root, 'r-api/plumber.R'), 'utf8')
const settings = await fs.readFile(path.join(root, 'src/utils/plsPredictSettings.ts'), 'utf8')
const modal = await fs.readFile(path.join(root, 'src/components/PlsPredictModal.tsx'), 'utf8')
const modelCanvas = await fs.readFile(path.join(root, 'src/pages/ModelCanvas.tsx'), 'utf8')
const preferences = await fs.readFile(path.join(root, 'src/components/PreferencesModal.tsx'), 'utf8')

const formativeStart = backend.indexOf('} else if (con_type == "formative")')
const formativeEnd = backend.indexOf('} else {', formativeStart + 1)
assert.ok(formativeStart >= 0 && formativeEnd > formativeStart, 'The multi-item formative branch should remain explicit.')
assert.match(backend.slice(formativeStart, formativeEnd), /weights\s*=\s*seminr::mode_B/, 'Multi-item formative constructs must use SEMinR Mode B.')

assert.match(backend, /plspredict_default_folds\s*<-\s*function\(\)\s*10L/, 'PLSpredict backend default folds should be 10.')
assert.match(backend, /plspredict_default_repetitions\s*<-\s*function\(\)\s*1L/, 'PLSpredict backend default repetitions should be 1.')
assert.match(settings, /folds:\s*10/, 'PLSpredict frontend default folds should be 10.')
assert.match(settings, /repetitions:\s*1/, 'PLSpredict frontend default repetitions should be 1.')
assert.doesNotMatch(backend, /payload\$interactionMethod|uses_prediction_specific_interactions/, 'PLSpredict must not switch interaction methods independently of the estimated model.')
assert.doesNotMatch(modal, /Interaction method|Product-indicator|Orthogonal/, 'The modal must not expose a prediction-only interaction method selector.')
assert.doesNotMatch(modelCanvas, /validation cycles|folds \* normalizedSettings\.repetitions/, 'The UI must not describe folds × repetitions as independent validation cycles.')
assert.match(preferences, /getSavedSetting\('predictFolds',\s*10\)/, 'Preferences must default new PLSpredict runs to 10 folds.')
assert.match(preferences, /getSavedSetting\('predictRepetitions',\s*1\)/, 'Preferences must default new PLSpredict runs to 1 repetition.')
assert.doesNotMatch(preferences, /Validation cycles|folds multiplied by repetitions|predictFolds \* predictRepetitions/, 'Preferences must not describe folds × repetitions as validation cycles.')

const predictRouteStart = backend.indexOf('pr$handle("POST", "/run-plspredict"')
const predictRouteEnd = backend.indexOf('pr$handle("POST", "/run-advanced-analysis"', predictRouteStart)
const predictRoute = backend.slice(predictRouteStart, predictRouteEnd)
assert.match(predictRoute, /predict_core\s*<-\s*core/, 'Ordinary PLSpredict must begin with the joint fitted core.')
assert.match(predictRoute, /if\s*\(uses_hoc\)/, 'Only HOC models should rebuild a prediction core.')
assert.doesNotMatch(predictRoute, /uses_prediction_specific_interactions|interactionMethod/, 'Ordinary joint moderation must not create a separate prediction core.')
assert.match(predictRoute, /prediction_no_folds\s*<-\s*if\s*\(validation_mode\s*==\s*"LOOCV"\)\s*\{\s*NULL/s, 'LOOCV must use SEMinR noFolds = NULL.')
assert.match(predictRoute, /noFolds\s*=\s*prediction_no_folds/, 'SEMinR must receive the native LOOCV argument.')
assert.match(predictRoute, /prediction_n\s*<-\s*nrow\(predict_core\$model\$data\)/, 'Fold validation must use usable prediction-model rows.')
assert.match(predictRoute, /folds\s*<-\s*min\(folds,\s*prediction_n\)/, 'K-fold count must be capped to usable prediction rows.')

const q2Start = backend.indexOf('calculate_plspredict_q2 <- function')
const q2End = backend.indexOf('extract_plspredict_sections <- function', q2Start)
const q2 = backend.slice(q2Start, q2End)
assert.match(q2, /validation_mode/, 'Q²predict must receive the validation mode.')
assert.match(q2, /source_values\[-i\]/, 'LOOCV Q²predict must use the other N-1 observations as the naive training sample.')

assert.match(backend, /sm\s*<-\s*as\.matrix\(prediction_core\$model\$smMatrix\)/, 'LV filtering must use the prediction model structural matrix.')
assert.match(backend, /sm\[,\s*"target"\]/, 'LV filtering must derive endogenous targets from the structural matrix.')
assert.match(backend, /METIS_MAX_CVPAT_BOOTSTRAP_SAMPLES",\s*"2000"/, 'CVPAT default bootstrap samples should be 2000.')
assert.match(backend, /max_cvpat_bootstrap_samples\s*<-\s*2000L/, 'CVPAT fallback bootstrap samples should be 2000.')
assert.doesNotMatch(backend, /experimental prediction workaround/, 'HOC metadata should not describe the removed reduced-model workaround.')
assert.match(
  backend,
  /HOC repeated indicators with internal duplicate-column aliases/,
  'HOC metadata should identify the SEMinR-safe repeated-indicator prediction representation.'
)

assert.doesNotMatch(predictRoute, /isolate_single_interaction|compute_isolated_moderation_r2|strip_all_interactions/, 'PLSpredict must not call isolated moderation diagnostics.')
assert.match(backend, /interactions_payload\s*=\s*payload\$interactions/, 'The fitted PLSpredict core must retain the complete joint interaction payload.')
assert.match(backend, /baseline_payload\s*<-\s*strip_all_interactions\(payload\)/, 'The isolated moderation workflow must remain available separately from PLSpredict.')

console.log('PASS remaining PLSpredict contract coverage')
