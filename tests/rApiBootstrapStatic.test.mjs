import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'r-api/plumber.R'), 'utf8')

assert.match(
  source,
  /summary\s*\(\s*boot_model\s*,\s*alpha\s*=\s*alpha\s*\)/,
  'Bootstrap summary should use the selected confidence level alpha.'
)

assert.match(
  source,
  /as\.data\.frame\s*\(\s*out\s*,[^)]*check\.names\s*=\s*FALSE/s,
  'Specific indirect bootstrap rows should preserve seminr column names instead of R-safe dotted names.'
)

assert.match(
  source,
  /htmt_confidence_intervals\s*=\s*as_rows\s*\(\s*boot_summary\$bootstrapped_HTMT\s*\)/,
  'Bootstrap should expose HTMT confidence intervals when seminr returns them.'
)

assert.match(
  source,
  /extract_path_results\s*<-\s*function\s*\(model,\s*input_paths\)\s*\{[\s\S]*?if\s*\(\s*from\s*%in%\s*rownames\(path_matrix\)\s*&&\s*to\s*%in%\s*colnames\(path_matrix\)\s*\)\s*\{[\s\S]*?path_matrix\[from,\s*to\][\s\S]*?if\s*\(\s*\(is\.null\(coef\)\s*\|\|\s*is\.na\(coef\)\)\s*&&\s*to\s*%in%\s*rownames\(path_matrix\)\s*&&\s*from\s*%in%\s*colnames\(path_matrix\)\s*\)\s*\{[\s\S]*?path_matrix\[to,\s*from\]/,
  'Base-model path extraction should prefer seminr\'s source-row/target-column orientation before any fallback lookup.'
)

assert.match(
  source,
  /pr\$handle\("POST", "\/run-advanced-analysis"/,
  'Plumber should expose a dedicated advanced analysis endpoint.'
)

assert.match(
  source,
  /seminrExtras::assess_ipma/,
  'Advanced analysis should call seminrExtras::assess_ipma.'
)

assert.match(
  source,
  /seminrExtras::assess_nca/,
  'Advanced analysis should call seminrExtras::assess_nca.'
)

assert.match(
  source,
  /seminrExtras::assess_cipma/,
  'Advanced analysis should call seminrExtras::assess_cipma.'
)

assert.match(
  source,
  /normalize_ipma_construct_rows <- function\(summary_obj, allowed_names\)/,
  'Advanced analysis should expose a richer IPMA construct-table normalizer separate from the chart rows.'
)

assert.match(
  source,
  /construct_table <- if \(!is\.null\(ipma_summary\)\) \{\s*normalize_ipma_construct_rows\(ipma_summary, predecessor_names\)/,
  'Construct table should use the richer IPMA numeric rows rather than the chart-classification rows.'
)

assert.match(
  source,
  /construct_table <- if \(!is\.null\(ipma_summary\)\) \{\s*normalize_ipma_construct_rows\(ipma_summary, predecessor_names\)\s*\} else \{\s*list\(\)\s*\}/,
  'Construct table should stay IPMA-only and remain empty for cIPMA-only or NCA-only runs.'
)

assert.match(
  source,
  /extract_nca_method_metrics <- function\(row, method_keys = c\("ce_fdh", "cr_fdh"\)\)/,
  'NCA normalization should extract every seminrExtras ceiling-specific metric instead of choosing one.'
)

assert.match(
  source,
  /normalize_nca_summary_rows <- function\(summary_obj, allowed_names\)[\s\S]*for \(method_key in method_keys\)[\s\S]*Method = nca_method_label\(method_key\)[\s\S]*Ceiling = method_key[\s\S]*D = [\s\S]*effect_value[\s\S]*P_Value = [\s\S]*p_value/,
  'Necessity check rows should preserve both CE-FDH and CR-FDH D and p-values as method-labelled rows.'
)

assert.match(
  source,
  /normalize_bottleneck_rows <- function\(summary_obj, method_keys = c\("ce_fdh", "cr_fdh"\)\)[\s\S]*for \(method_key in method_keys\)[\s\S]*as_rows\(bottleneck\[\[method_key\]\]\)[\s\S]*Method = nca_method_label\(method_key\)/,
  'Bottleneck rows should preserve both seminrExtras bottleneck tables with method labels.'
)

assert.match(
  source,
  /compute_ce_fdh_frontier <- function\(x, y\)[\s\S]*aggregate\(y, by = list\(X = x\), FUN = max\)[\s\S]*Y = cummax\(max_y_at_x\$Y\)/,
  'CE-FDH frontier should match seminrExtras: max target by unique x, then cumulative max.'
)

assert.match(
  source,
  /get_ce_fdh_peers <- function\(x, y\)[\s\S]*max_y_at_x <- aggregate\(y, by = list\(X = x\), FUN = max\)[\s\S]*is_peer <- c\(TRUE, max_y_at_x\$Y\[-1\] > ceiling_y\[-length\(ceiling_y\)\]\)/,
  'CR-FDH peers should match seminrExtras CE-FDH peer/corner points.'
)

assert.match(
  source,
  /stats::lm\(Y ~ X, data = peers\)[\s\S]*cr_y <- pmin\(pmax\(cr_y, min\(y\)\), max\(y\)\)/,
  'CR-FDH regression should fit on CE-FDH peers and clamp predictions to the observed target-score range.'
)

assert.match(
  source,
  /analysis_timeout_seconds\s*<-\s*read_timeout_seconds\("METIS_ANALYSIS_TIMEOUT_SECONDS",\s*180\)/,
  'Base PLS analyses should use the longer default timeout baseline.'
)

assert.match(
  source,
  /bootstrap_timeout_seconds\s*<-\s*read_timeout_seconds\("METIS_BOOTSTRAP_TIMEOUT_SECONDS",\s*max\(analysis_timeout_seconds,\s*900\)\)/,
  'Bootstrap should use a route-specific timeout longer than the base analysis timeout.'
)

assert.match(
  source,
  /plspredict_timeout_seconds\s*<-\s*read_timeout_seconds\("METIS_PLSPREDICT_TIMEOUT_SECONDS",\s*max\(analysis_timeout_seconds,\s*600\)\)/,
  'PLSpredict should use a route-specific timeout longer than the base analysis timeout.'
)

assert.match(
  source,
  /advanced_analysis_timeout_seconds\s*<-\s*read_timeout_seconds\("METIS_ADVANCED_ANALYSIS_TIMEOUT_SECONDS",\s*max\(analysis_timeout_seconds,\s*600\)\)/,
  'Advanced analysis should use a route-specific timeout longer than the base analysis timeout.'
)

assert.match(
  source,
  /pr\$handle\("POST", "\/run-bootstrap"[\s\S]*?with_analysis_timeout_for\(\{[\s\S]*?\}, bootstrap_timeout_seconds\)/,
  'Bootstrap route should execute under the bootstrap-specific timeout.'
)

assert.match(
  source,
  /pr\$handle\("POST", "\/run-plspredict"[\s\S]*?with_analysis_timeout_for\(\{[\s\S]*?\}, plspredict_timeout_seconds\)/,
  'PLSpredict route should execute under the PLSpredict-specific timeout.'
)

assert.match(
  source,
  /pr\$handle\("POST", "\/run-advanced-analysis"[\s\S]*?with_analysis_timeout_for\(\{[\s\S]*?\}, advanced_analysis_timeout_seconds\)/,
  'Advanced analysis route should execute under the advanced-analysis-specific timeout.'
)

assert.match(
  source,
  /format_analysis_error_message <- function\(err, analysis_label, timeout_seconds\) \{[\s\S]*?could not finish within %s seconds[\s\S]*?fewer bootstrap subsamples/,
  'Timeout failures should be reported with user-facing recovery guidance.'
)

assert.match(
  source,
  /format_configured_max_error <- function\(field_label, max_value\) \{[\s\S]*?current app limit/,
  'Configured maximum failures should explain the user-facing limit instead of leaking raw field names.'
)

console.log('PASS bootstrap R API serialization guards')
