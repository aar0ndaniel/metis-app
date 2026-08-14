import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function readSource(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

const plsApiSource = await readSource('src/services/plsApi.ts')
const preloadSource = await readSource('electron/preload.ts')
const viteEnvSource = await readSource('src/vite-env.d.ts')
const mainSource = await readSource('electron/main.ts')
const plumberSource = await readSource('r-api/plumber.R')
const modelCanvasSource = await readSource('src/pages/ModelCanvas.tsx')

assert.match(
  plsApiSource,
  /export interface RunMultiGroupAnalysisRequest extends RunPlsRequest[\s\S]*groupingVariable:\s*string[\s\S]*groupA:\s*string[\s\S]*groupB:\s*string[\s\S]*nboot:\s*number[\s\S]*alpha:\s*number[\s\S]*seed:\s*number/,
  'MGA request should extend the existing PLS payload and carry explicit left/right groups plus bootstrap settings.',
)

assert.match(
  plsApiSource,
  /export async function runMultiGroupAnalysisModel\(payload: RunMultiGroupAnalysisRequest\): Promise<GenericAnalysisResponse>[\s\S]*api\?\.runMultiGroupAnalysis[\s\S]*window\.electronAPI\.runMultiGroupAnalysis\(payload\)[\s\S]*bridgeMissingResponse\('runMultiGroupAnalysis'[\s\S]*postToLocalPlumber\('\/run-multi-group-analysis', payload\)/,
  'plsApi should expose runMultiGroupAnalysisModel through the Electron bridge with a local Plumber fallback.',
)

assert.match(
  preloadSource,
  /runMultiGroupAnalysis:\s*\(payload: any\) => ipcRenderer\.invoke\('plumber:runMultiGroupAnalysis', payload\)/,
  'Preload should expose a secure runMultiGroupAnalysis bridge method.',
)

assert.match(
  viteEnvSource,
  /runMultiGroupAnalysis:\s*\(payload: any\) => Promise<any>/,
  'Vite window typing should include runMultiGroupAnalysis.',
)

assert.match(
  mainSource,
  /ipcMain\.handle\('plumber:runMultiGroupAnalysis'[\s\S]*postToPlumber\('\/run-multi-group-analysis', payload\)[\s\S]*plumberBridgeExceptionResponse\(err, 'multi-group analysis'\)/,
  'Electron main should route runMultiGroupAnalysis IPC to /run-multi-group-analysis.',
)

assert.match(
  plumberSource,
  /validate_multi_group_analysis_payload\s*<-\s*function\(payload, construct_names, data_columns, normalized_constructs = NULL\)[\s\S]*groupingVariable[\s\S]*groupA[\s\S]*groupB[\s\S]*nboot[\s\S]*alpha[\s\S]*seed/,
  'Plumber should validate MGA grouping values and bootstrap settings as part of payload normalization.',
)

assert.match(
  plumberSource,
  /validate_multi_group_analysis_payload[\s\S]*baseHocMethod[\s\S]*Repeated Indicators[\s\S]*Embedded Two-stage[\s\S]*Disjoint Two-stage/,
  'MGA should validate the fitted/base HOC method label.',
)

for (const field of ['base_hoc_method', 'mga_hoc_method', 'hoc_method_changed']) {
  assert.match(plumberSource, new RegExp(field), `MGA metadata should expose ${field}.`)
}

assert.match(
  plumberSource,
  /multi_group_fields <- c\("groupingVariable", "groupA", "groupB", "nboot", "alpha", "seed"\)[\s\S]*validate_multi_group_analysis_payload/,
  'prepare_payload should normalize MGA payload fields when they are present.',
)

assert.match(
  plumberSource,
  /selected_group_rows\s*<-\s*function\(data, grouping_variable, group_a, group_b\)[\s\S]*group_a[\s\S]*group_b/,
  'Plumber should filter MGA data to the two selected groups before creating the seminr MGA model.',
)

assert.match(
  plumberSource,
  /run_mga_bootstrap_tables\s*<-\s*function\(pls_model,\s*condition,\s*payload,\s*\.\.\.\)[\s\S]*group1_model[\s\S]*group2_model[\s\S]*group1_boot[\s\S]*group2_boot/,
  'Plumber should bootstrap the two selected groups once and reuse those samples across all Bootstrap MGA tables.',
)

assert.match(
  plumberSource,
  /assemble_mga_bootstrap_tables\s*<-\s*function\([\s\S]*groupSpecific\s*=\s*list\([\s\S]*groupA = mga_group_bootstrap_sections\(payload, group1_data, group1_core, group1_boot, embedded\)[\s\S]*groupB = mga_group_bootstrap_sections\(payload, group2_data, group2_core, group2_boot, embedded\)[\s\S]*pathCoefficients[\s\S]*specificIndirectEffects[\s\S]*totalIndirectEffects[\s\S]*totalEffects[\s\S]*outerLoadings[\s\S]*outerWeights/,
  'Plumber should return group-specific PLS sections plus every required Bootstrap MGA comparison family.',
)

assert.match(
  plumberSource,
  /mga_group_bootstrap_sections\s*<-\s*function\(payload, group_data, group_core, group_boot, embedded = FALSE, bypass_isolated_moderation_cache = TRUE\)[\s\S]*if \(isTRUE\(embedded\)\)[\s\S]*assemble_embedded_bootstrap_response[\s\S]*group_response <- assemble_bootstrap_response[\s\S]*group_response\$results %\|\|% group_response/,
  'Group-specific MGA sections should assemble Embedded or ordinary Bootstrap output and return the results object directly.',
)

assert.match(
  plumberSource,
  /construct_scores_from_payload_data\s*<-\s*function\(payload, data\)[\s\S]*to_numeric_frame[\s\S]*payload\$constructs[\s\S]*rowMeans[\s\S]*mga_descriptive_rows_from_scores\s*<-\s*function\(group_label, construct_scores\)[\s\S]*Group[\s\S]*Construct[\s\S]*Number[\s\S]*Mean[\s\S]*Standard Deviation[\s\S]*Skewness[\s\S]*Kurtosis[\s\S]*Variance[\s\S]*mga_descriptive_rows\s*<-\s*function\(group_label, payload = NULL, group_data = NULL, group_model = NULL, group_summary = NULL\)[\s\S]*group_model\$construct_scores[\s\S]*group_model\$constructScores[\s\S]*group_model\$composite_scores[\s\S]*group_summary\$construct_scores[\s\S]*group_summary\$descriptives\$statistics\$constructs[\s\S]*mga_descriptive_rows_from_scores\(group_label, construct_scores\)[\s\S]*construct_scores_from_payload_data\(payload, group_data\)/,
  'Plumber should compute construct score descriptives with standard deviation for each selected MGA group from seminr score shapes, summary descriptives, or raw grouped indicator data.',
)

assert.match(
  plumberSource,
  /assemble_mga_bootstrap_tables\s*<-\s*function\([\s\S]*descriptives\s*=\s*c\([\s\S]*mga_descriptive_rows\(payload\$groupA, payload, group1_data, group1_model, group1_summary\)[\s\S]*mga_descriptive_rows\(payload\$groupB, payload, group2_data, group2_model, group2_summary\)/,
  'MGA table generation should pass each selected group dataset into robust descriptive extraction.',
)

assert.match(
  plumberSource,
  /mga_overview_setup_rows\s*<-\s*function\(payload, data, mga_result\)[\s\S]*has_higher_order_construct\(payload\)[\s\S]*mga_hoc_micom_unavailable_message[\s\S]*mga_micom_overview_message\(mga_result\)[\s\S]*"Analysis information" = "Grouping variable"[\s\S]*"Analysis information" = "Selected groups"[\s\S]*"Analysis information" = "Sample size per group"[\s\S]*"Analysis information" = "MGA settings"[\s\S]*"Analysis information" = "Measurement invariance status"[\s\S]*measurement_invariance_message/,
  'MGA overview setup should expose grouping, selected groups, sample size, settings, and cached MICOM status rows.',
)

assert.match(
  plumberSource,
  /mga_hoc_micom_unavailable_message[\s\S]*MICOM is unavailable for HOC models[\s\S]*MGA was estimated without a MICOM invariance assessment[\s\S]*mga_overview_setup_rows[\s\S]*has_higher_order_construct\(payload\)/,
  'HOC MGA should report that MICOM is unavailable instead of presenting a cached invariance assessment.',
)

assert.match(
  plumberSource,
  /map_mga_response\s*<-\s*function\(payload, data, mga_result, timings = NULL\)[\s\S]*overview\s*=\s*list\([\s\S]*setup\s*=\s*mga_overview_setup_rows\(payload, data, mga_result\)[\s\S]*descriptives\s*=\s*mga_result\$descriptives[\s\S]*groupSpecific\s*=\s*mga_result\$groupSpecific[\s\S]*bootstrapMGA[\s\S]*pathCoefficients[\s\S]*specificIndirectEffects[\s\S]*totalIndirectEffects[\s\S]*totalEffects[\s\S]*outerLoadings[\s\S]*outerWeights[\s\S]*biasCorrectedConfidenceIntervals[\s\S]*henselerPlsMga[\s\S]*parametricTest[\s\S]*groups[\s\S]*settings[\s\S]*execution_log/,
  'Plumber should map the MGA overview, group-specific output, and all Bootstrap MGA comparison families into the saved JSON.',
)

assert.ok(
  plumberSource.includes('welch <- mga_parametric_stats(comparison, alpha, welch = TRUE)') &&
    plumberSource.includes('welchTest = welch_rows'),
  'MGA should calculate and return a Welch comparison block alongside the pooled parametric test.',
)

assert.ok(
  (plumberSource.match(/welchTest\s*=/g) ?? []).length >= 7,
  'The comparison builder and saved MGA response should expose Welch results for every comparison family.',
)

assert.match(
  plumberSource,
  /p_value_inverse[\s\S]*significant[\s\S]*direction[\s\S]*decision/,
  'MGA mapping should expose SmartPLS-style directional p-value context and decisions.',
)

assert.doesNotMatch(
  plumberSource,
  /run_seminr_pls_mga\s*<-/,
  'MGA route should not keep the old unused seminr::estimate_pls_mga wrapper after switching to Bootstrap MGA tables.',
)

assert.match(
  plumberSource,
  /mga_boot_paths_matrix\s*<-\s*function\(pls_boot, sm_matrix = pls_boot\$smMatrix\)[\s\S]*length\(dim\(boot_array\)\) >= 3L[\s\S]*matrix\(NA_real_, nrow = repetitions, ncol = length\(path_names\)\)[\s\S]*boot_array\[sources\[\[index\]\], targets\[\[index\]\], \][\s\S]*is\.null\(dim\(boot_paths\)\)[\s\S]*matrix\(boot_paths, ncol = 1L\)/,
  'MGA should preserve all paths from 3D bootstrap arrays and retain a one-column fallback for one-path models.',
)

assert.match(
  plumberSource,
  /mga_parameter_comparison\s*<-\s*function\(entry, group_a_n, group_b_n\)[\s\S]*mga_parametric_stats\s*<-\s*function\(comparison, alpha, welch = FALSE\)/,
  'Every MGA method should receive one normalized comparison object containing originals, bootstrap distributions, and sample sizes.',
)

assert.ok(
  plumberSource.includes('(n_a - 1) ^ 2') &&
    plumberSource.includes('((n_a - 1) / n_a) * (se_a ^ 2)') &&
    plumberSource.includes('bootstrap_a - mean(bootstrap_a) + original_a'),
  'MGA should use the corrected Keil, Nitzl, and centred Henseler formulas.',
)

assert.doesNotMatch(
  plumberSource,
  /n_a <- length\(boot_a\)[\s\S]*n_b <- length\(boot_b\)/,
  'Parametric and Welch MGA tests must not treat bootstrap replication counts as group sample sizes.',
)

assert.match(
  plumberSource,
  /group1_n <- nrow\(group1_data\)[\s\S]*group2_n <- nrow\(group2_data\)[\s\S]*mga_compare_entries\(path_entries, payload, "groupA_beta", "groupB_beta", group1_n, group2_n\)/,
  'Bootstrap MGA table generation should pass original selected-group sample sizes into all statistical tests.',
)

assert.ok(
  plumberSource.includes('mga_nomological_path_matrix <- function(payload, path_coef)') &&
    plumberSource.includes('path_coef[source, target]'),
  'MGA should construct a structural matrix containing only user-defined nomological paths.',
)

assert.ok(
  plumberSource.includes('mga_path_entries <- function(payload, group1_model, group2_model, group1_boot, group2_boot)'),
  'MGA path comparisons should enumerate payload paths instead of every fitted HOC hierarchy path.',
)

assert.ok(
  plumberSource.includes('mga_nomological_boot_derived_array') &&
    plumberSource.includes('mga_nomological_path_matrix(payload, path_matrix)'),
  'MGA total and total-indirect bootstrap effects should be derived after masking internal HOC hierarchy paths.',
)

assert.ok(
  plumberSource.includes('bypass_isolated_moderation_cache = TRUE') &&
    plumberSource.includes('bypass_isolated_moderation_cache = bypass_isolated_moderation_cache'),
  'Group-specific MGA diagnostics should explicitly bypass the shared isolated-moderation PLS cache.',
)

assert.match(
  plumberSource,
  /pr\$handle\("POST", "\/run-multi-group-analysis"[\s\S]*prepare_payload\(req\)[\s\S]*selected_group_rows\([\s\S]*analysis_core_plan\(\)[\s\S]*has_higher_order_construct\(payload\)[\s\S]*run_hoc_mga_bootstrap_tables[\s\S]*run_pls_core\(payload, mga_data\)[\s\S]*mga_group_condition\(mga_data, payload\$groupingVariable, payload\$groupA\)[\s\S]*run_mga_bootstrap_tables\([\s\S]*pls_model\s*=\s*mga_core\$model[\s\S]*condition\s*=\s*mga_condition[\s\S]*payload\s*=\s*payload[\s\S]*cores\s*=\s*cores/,
  'Plumber route should use group-first HOC estimation while preserving the pooled ordinary MGA setup.',
)

assert.match(
  plumberSource,
  /run_hoc_mga_bootstrap_tables\s*<-\s*function\(data, payload, cores = 1L, timings = NULL\)[\s\S]*run_pls_core\(payload, group1_data\)[\s\S]*run_pls_core\(payload, group2_data\)/,
  'HOC MGA should fit each raw group independently before bootstrapping.',
)
assert.match(
  plumberSource,
  /run_hoc_mga_bootstrap_tables\s*<-\s*function\(data, payload, cores = 1L, timings = NULL\)[\s\S]*if \(embedded\)[\s\S]*run_embedded_hoc_bootstrap\(payload, group1_data, group1_core, payload\$nboot, timings = timings\)[\s\S]*run_embedded_hoc_bootstrap\(payload, group2_data, group2_core, payload\$nboot, timings = timings\)[\s\S]*seminr::bootstrap_model\(group1_core\$model[\s\S]*seminr::bootstrap_model\(group2_core\$model[\s\S]*embedded = embedded/,
  'Embedded HOC MGA should rerun the full two-stage estimator for every group resample while Repeated and Disjoint use ordinary group bootstraps.',
)
assert.match(
  plumberSource,
  /pr\$handle\("POST", "\/run-multi-group-analysis"[\s\S]*has_higher_order_construct\(payload\)[\s\S]*run_hoc_mga_bootstrap_tables[\s\S]*run_mga_bootstrap_tables/,
  'The MGA route should use group-first estimation only for HOC payloads and preserve ordinary MGA.',
)

assert.match(
  plumberSource,
  /map_mga_response\s*<-\s*function\(payload, data, mga_result, timings = NULL\)[\s\S]*mga_engine <- if \(has_hoc[\s\S]*"Metis Embedded two-stage bootstrap PLS-MGA"[\s\S]*sprintf\("seminr::bootstrap_model %s PLS-MGA", hoc_metadata\$mga_hoc_method\)[\s\S]*"Each MGA group was estimated independently using %s\."[\s\S]*"Embedded HOC MGA reran Stage 1 and Stage 2 within every bootstrap resample for both groups\."[\s\S]*mode = "mga"[\s\S]*engine = mga_engine[\s\S]*analysis_settings = list\([\s\S]*mga = list\(/,
  'MGA response metadata should identify the selected HOC engine, group-independent estimation, Embedded resampling, and saved settings.',
)

assert.match(
  modelCanvasSource,
  /runMultiGroupAnalysisModel/,
  'ModelCanvas should import and call the MGA calculation service.',
)

assert.match(
  modelCanvasSource,
  /handleRunMultiGroupAnalysis\s*=\s*async \(settings: MultiGroupAnalysisSettings\)[\s\S]*buildAnalysisPayload\('mga'[\s\S]*runMultiGroupAnalysisModel\(\{[\s\S]*groupingVariable:\s*settings\.groupingVariable[\s\S]*groupA:\s*settings\.groupA[\s\S]*groupB:\s*settings\.groupB[\s\S]*nboot:\s*settings\.nboot[\s\S]*alpha:\s*settings\.alpha[\s\S]*seed:\s*settings\.seed/,
  'ModelCanvas should build a normal PLS payload and append the modal MGA group/settings values unchanged.',
)

console.log('PASS multi-group analysis plumber contract')
