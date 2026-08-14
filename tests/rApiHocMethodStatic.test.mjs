import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'r-api/plumber.R'), 'utf8')

assert.match(
  source,
  /normalize_hoc_settings\s*<-\s*function\s*\(/,
  'Plumber should normalize HOC method and two-stage settings at the backend boundary.'
)

assert.match(
  source,
  /hocMethod[\s\S]*Repeated indicators[\s\S]*Two-stage[\s\S]*Disjoint two-stage/,
  'Backend HOC settings should support repeated indicators, embedded two-stage, and disjoint two-stage.'
)

assert.match(
  source,
  /algorithmSettings[\s\S]*hocMethod[\s\S]*hocTwoStage/,
  'Validated algorithm settings should carry the formal HOC configuration.'
)

assert.match(
  source,
  /hoc_method_label\s*<-\s*function|hoc_method_label\s*=\s*function/,
  'PLS results should expose a human-readable HOC method label.'
)

assert.match(
  source,
  /run_embedded_hoc|embedded.*stage.?1|stage.?1.*stage.?2/i,
  'Embedded two-stage estimation should use a distinct two-stage implementation.'
)

assert.match(
  source,
  /build_repeated_indicator_hoc_paths\s*<-\s*function\s*\(/,
  'Repeated-indicator HOC estimation should use a neutral direction-aware HOC-to-LOC path helper.'
)

assert.match(
  source,
  /stage1_structural_model\s*<-\s*build_structural\(\s*build_repeated_indicator_hoc_paths\(payload,\s*safe_paths\)\s*\)/,
  'Embedded Stage 1 must preserve original structural paths while adding HOC-to-LOC paths.'
)

assert.match(
  source,
  /structural_paths\s*<-\s*if\s*\([\s\S]*hocMethod,\s*"Repeated indicators"[\s\S]*build_repeated_indicator_hoc_paths\(payload,\s*safe_paths\)[\s\S]*safe_paths/,
  'Standalone Repeated Indicators must use the same direction-aware HOC-to-LOC path augmentation.'
)

assert.doesNotMatch(
  source,
  /build_embedded_stage1_paths/,
  'The shared repeated-indicator HOC path helper should not retain an Embedded-only name.'
)

assert.match(
  source,
  /Used by standalone Repeated Indicators\s*#\s*estimation and Embedded Stage 1\./,
  'The leaf-indicator helper comment should describe its current estimation roles.'
)

assert.doesNotMatch(
  source,
  /representation of a HOC for PLSpredict/,
  'The leaf-indicator helper comment should not describe the removed PLSpredict workaround.'
)

assert.doesNotMatch(
  source,
  /standardize_embedded_score\s*<-\s*function|dimension_score\s*<-\s*as\.matrix\(standardized_data/,
  'Embedded Stage 1 LOC scores must come from SEMinR unchanged, not be reconstructed from HOC weights.'
)

assert.match(
  source,
  /pls_core_cache_key[\s\S]*algorithmSettings/,
  'HOC settings should remain part of the cached model identity.'
)

assert.match(
  source,
  /PLSpredict[\s\S]*not available[\s\S]*Embedded[\s\S]*Disjoint/s,
  'PLSpredict should explicitly reject unsupported two-stage HOC methods.'
)

assert.doesNotMatch(
  source,
  /build prediction \(repeated-indicators\) model[\s\S]*run_pls_core\(payload, data, for_prediction = TRUE\)/,
  'PLSpredict should not silently substitute repeated indicators for two-stage HOCs.'
)

assert.doesNotMatch(
  source,
  /for_prediction/,
  'The dormant prediction-only model construction argument should be removed.'
)

assert.match(
  source,
  /build_repeated_indicator_prediction_core\s*<-\s*function\s*\([\s\S]*anyDuplicated\(prediction_model\$mmVariables\)[\s\S]*same_paths[\s\S]*same_scores/,
  'Repeated-indicator PLSpredict should use unique internal aliases and verify that the fitted model is unchanged.'
)

assert.match(
  source,
  /predict_core\s*<-\s*core[\s\S]*if\s*\(uses_hoc\)\s*predict_core\s*<-\s*build_repeated_indicator_prediction_core\(payload,\s*core\)/,
  'The PLSpredict endpoint should use the alias-compatible core for standalone Repeated Indicators HOCs.'
)

assert.match(
  source,
  /extract_hoc_results[\s\S]*Repeated indicators[\s\S]*indicator\s*=\s*indicator_name/,
  'Repeated Indicators HOC results should report leaf manifest indicators explicitly.'
)

assert.match(
  source,
  /run_embedded_hoc_bootstrap|embedded.*bootstrap|bootstrap.*embedded/i,
  'Embedded HOC bootstrap should have an explicit per-resample path.'
)

assert.match(
  source,
  /boot_total_paths[\s\S]*boot_total_indirect_paths[\s\S]*specific_indirect_effects/,
  'Embedded HOC bootstrap should expose total, total-indirect, and specific-indirect effects.'
)

assert.doesNotMatch(
  source,
  /embedded_bootstrap_rows[\s\S]*`2\.5% CI`\s*=|embedded_bootstrap_rows[\s\S]*`97\.5% CI`\s*=/,
  'Embedded bootstrap confidence-interval keys must be generated from the requested alpha.'
)

const resultsView = await fs.readFile(path.join(workspaceRoot, 'src', 'pages', 'ResultsView.tsx'), 'utf8')

assert.match(
  resultsView,
  /interface HOCResultRow[\s\S]*indicator:\s*string/,
  'The HOC result contract should expose the reported indicator.'
)

assert.match(
  resultsView,
  /HOCResultsTable[\s\S]*Lower-Order Dimension[\s\S]*Indicator[\s\S]*Loading[\s\S]*Weight[\s\S]*VIF/,
  'The visible HOC table should show HOC, LOC, indicator, loading, weight, and VIF.'
)

assert.match(
  resultsView,
  /buildExportHocTableHtml[\s\S]*row\.indicator[\s\S]*>Indicator</,
  'Exported HOC tables should include the item-level indicator field.'
)

console.log('PASS R API HOC method static guards')
