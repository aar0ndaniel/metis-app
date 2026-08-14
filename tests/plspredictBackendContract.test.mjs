import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = await fs.readFile(path.join(root, 'r-api/plumber.R'), 'utf8')
const start = source.indexOf('extract_plspredict_sections <- function')
const end = source.indexOf('pr$handle("POST", "/run-plspredict"', start)
assert.ok(start >= 0 && end > start, 'The deterministic PLSpredict extractor should remain a named backend unit.')
const extractor = source.slice(start, end)

for (const field of [
  'predict_model$items[["PLS_out_of_sample"]]',
  'predict_model$items[["PLS_out_of_sample_residuals"]]',
  'predict_model$items[["lm_out_of_sample"]]',
  'predict_model$items[["lm_out_of_sample_residuals"]]',
  'predict_model$items[["item_actuals"]]',
  'predict_model$composites[["composite_out_of_sample"]]',
  'predict_model$composites[["actuals_star"]]',
]) {
  assert.match(extractor, new RegExp(field.replaceAll('$', '\\$').replaceAll('[', '\\[').replaceAll(']', '\\]')), `Extractor should use the native ${field} slot.`)
}

assert.doesNotMatch(extractor, /summary\(predict_model\)/, 'Raw prediction matrices must not come from summary(predict_model).')
assert.doesNotMatch(extractor, /model\$meanData/, 'Q²predict must not use model meanData as a shortcut.')
assert.doesNotMatch(extractor, /pred_val|core\$summary\$composite_scores/, 'Prediction output must not be reconstructed from paths or summary scores.')
assert.doesNotMatch(extractor, /data\[seq_len\(|head\([^)]*,\s*100\)|mean\([^)]*data/, 'Prediction rows and errors must not use fabricated or silently truncated fallbacks.')
assert.match(source, /prediction_seed/, 'The backend should record a prediction seed.')
assert.match(source, /set\.seed\(prediction_seed\)/, 'Prediction execution should be reproducible.')
assert.match(source, /prediction_technique/, 'The backend should validate and apply the selected prediction technique.')
assert.match(source, /calculate_plspredict_q2|SSE_PLS|SSE_NAIVE/, 'Q²predict should use the fold training-mean benchmark.')
assert.match(source, /PLS-SEM_RMSE/, 'The backend should preserve the exact PLSpredict metric keys.')
assert.match(source, /Initial outer weights|initial_weights/, 'Unsupported SEMinR settings should be explicitly reported, not silently mapped.')
assert.match(extractor, /prediction_core\s*=\s*core/, 'The extractor should accept an explicit prediction core for CVPAT.')
assert.match(extractor, /run_cvpat_assessment\(prediction_core,/, 'HOC CVPAT must use the same repeated-indicator prediction core as PLSpredict.')
assert.match(extractor, /plsem_mv_error_histogram/, 'The extractor should return MV OOS error histogram data.')
assert.match(extractor, /plsem_lv_error_histogram/, 'The extractor should return LV OOS error histogram data.')
assert.match(source, /prediction_core\s*=\s*predict_core/, 'The PLSpredict route should pass its prediction core into the extractor.')
assert.match(source, /validation_mode|validationMode/, 'The backend should preserve the selected cross-validation mode.')
assert.doesNotMatch(source, /payload\$interactionMethod|interactionMethod|product_indicator|orthogonal/, 'PLSpredict must inherit the current joint two-stage interaction model.')
assert.doesNotMatch(source, /uses_prediction_specific_interactions/, 'Non-default interaction methods must not create a separate PLSpredict prediction core.')

console.log('PASS PLSpredict backend contract coverage')
