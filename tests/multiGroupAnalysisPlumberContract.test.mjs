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
  /validate_multi_group_analysis_payload\s*<-\s*function\(payload, construct_names, data_columns\)[\s\S]*groupingVariable[\s\S]*groupA[\s\S]*groupB[\s\S]*nboot[\s\S]*alpha[\s\S]*seed/,
  'Plumber should validate MGA grouping values and bootstrap settings as part of payload normalization.',
)

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
  /run_mga_bootstrap_tables\s*<-\s*function\(pls_model,\s*condition,\s*payload,\s*\.\.\.\)[\s\S]*groupSpecific[\s\S]*groupA = mga_group_bootstrap_sections\(payload, group1_data, group1_model, group1_boot\)[\s\S]*groupB = mga_group_bootstrap_sections\(payload, group2_data, group2_model, group2_boot\)[\s\S]*pathCoefficients[\s\S]*specificIndirectEffects[\s\S]*totalIndirectEffects[\s\S]*totalEffects[\s\S]*outerLoadings[\s\S]*outerWeights/,
  'Plumber should return group-specific PLS sections plus every required Bootstrap MGA comparison family.',
)

assert.match(
  plumberSource,
  /mga_group_bootstrap_sections\s*<-\s*function\(payload, group_data, group_model, group_boot\)[\s\S]*group_response <- assemble_bootstrap_response[\s\S]*group_response\$results %\|\|% group_response/,
  'Group-specific MGA sections should return the results object directly, not a nested success/results wrapper.',
)

assert.match(
  plumberSource,
  /map_mga_response\s*<-\s*function\(payload, data, mga_result, timings = NULL\)[\s\S]*groupSpecific\s*=\s*mga_result\$groupSpecific[\s\S]*bootstrapMGA[\s\S]*pathCoefficients[\s\S]*specificIndirectEffects[\s\S]*totalIndirectEffects[\s\S]*totalEffects[\s\S]*outerLoadings[\s\S]*outerWeights[\s\S]*biasCorrectedConfidenceIntervals[\s\S]*henselerPlsMga[\s\S]*parametricTest[\s\S]*groups[\s\S]*settings[\s\S]*execution_log/,
  'Plumber should map group-specific output and all Bootstrap MGA comparison families into the saved JSON.',
)

assert.doesNotMatch(
  plumberSource,
  /welchSatterthwaiteTest/,
  'MGA response should not expose Welch-Satterthwaite comparison sections.',
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
  /mga_boot_paths_matrix\s*<-\s*function\(pls_boot\)[\s\S]*is\.null\(dim\(boot_paths\)\)[\s\S]*matrix\([\s\S]*ncol = 1L/,
  'MGA fallback should preserve one-path bootstrap output as a one-column matrix before applying column-wise statistics.',
)

assert.match(
  plumberSource,
  /mga_parametric_stats\s*<-\s*function\(diff,\s*group_a_boot,\s*group_b_boot,\s*alpha,\s*group_a_n,\s*group_b_n,\s*welch = FALSE\)/,
  'Parametric and Welch MGA tests should receive original group sample sizes, not infer them from bootstrap replication counts.',
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

assert.match(
  plumberSource,
  /pr\$handle\("POST", "\/run-multi-group-analysis"[\s\S]*prepare_payload\(req\)[\s\S]*selected_group_rows\([\s\S]*run_pls_core\(payload,\s*mga_data[\s\S]*analysis_core_plan\(\)[\s\S]*run_mga_bootstrap_tables\([\s\S]*pls_model\s*=\s*mga_core\$model[\s\S]*condition\s*=\s*mga_condition[\s\S]*payload\s*=\s*payload[\s\S]*cores\s*=\s*cores/,
  'Plumber route should compute Bootstrap MGA tables with groupA as TRUE and groupB as FALSE.',
)

assert.match(
  plumberSource,
  /mode = "mga"[\s\S]*engine = "seminr::bootstrap_model PLS-MGA"[\s\S]*analysis_settings = list\([\s\S]*mga = list\(/,
  'MGA response metadata should identify the mga mode, Bootstrap MGA engine, and saved settings.',
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
