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
  /export interface RunPermutationAnalysisRequest extends RunPlsRequest[\s\S]*groupingVariable:\s*string[\s\S]*groupA:\s*string[\s\S]*groupB:\s*string[\s\S]*permutations:\s*number[\s\S]*alpha:\s*number[\s\S]*seed:\s*number/,
  'Permutation analysis request should extend the existing PLS payload and carry explicit left/right groups plus settings.',
)

assert.match(
  plsApiSource,
  /export async function runPermutationAnalysisModel\(payload: RunPermutationAnalysisRequest\): Promise<GenericAnalysisResponse>[\s\S]*api\?\.runPermutationAnalysis[\s\S]*window\.electronAPI\.runPermutationAnalysis\(payload\)[\s\S]*bridgeMissingResponse\('runPermutationAnalysis'[\s\S]*postToLocalPlumber\('\/run-permutation-analysis', payload\)/,
  'plsApi should expose runPermutationAnalysisModel through the Electron bridge with a local Plumber fallback.',
)

assert.match(
  plsApiSource,
  /export async function runPermutationConfiguralPrecheck\(payload: RunPermutationAnalysisRequest\): Promise<GenericAnalysisResponse>[\s\S]*api\?\.runPermutationConfiguralPrecheck[\s\S]*window\.electronAPI\.runPermutationConfiguralPrecheck\(payload\)[\s\S]*bridgeMissingResponse\('runPermutationConfiguralPrecheck'[\s\S]*postToLocalPlumber\('\/run-permutation-configural-precheck', payload\)/,
  'plsApi should expose a lightweight MICOM step-one precheck through the Electron bridge with a local Plumber fallback.',
)

assert.match(
  preloadSource,
  /runPermutationAnalysis:\s*\(payload: any\) => ipcRenderer\.invoke\('plumber:runPermutationAnalysis', payload\)/,
  'Preload should expose a secure runPermutationAnalysis bridge method.',
)

assert.match(
  preloadSource,
  /runPermutationConfiguralPrecheck:\s*\(payload: any\) => ipcRenderer\.invoke\('plumber:runPermutationConfiguralPrecheck', payload\)/,
  'Preload should expose a secure runPermutationConfiguralPrecheck bridge method.',
)

assert.match(
  viteEnvSource,
  /runPermutationAnalysis:\s*\(payload: any\) => Promise<any>/,
  'Vite window typing should include runPermutationAnalysis.',
)

assert.match(
  viteEnvSource,
  /runPermutationConfiguralPrecheck:\s*\(payload: any\) => Promise<any>/,
  'Vite window typing should include runPermutationConfiguralPrecheck.',
)

assert.match(
  mainSource,
  /function resolveMicomScriptPath\(\): string[\s\S]*micom\.R[\s\S]*process\.cwd\(\), '\.\.', 'micom\.R'/,
  'Electron should resolve the development micom.R from the dev folder without hardcoding a user-specific absolute path.',
)

assert.match(
  mainSource,
  /METIS_MICOM_R_PATH:\s*resolveMicomScriptPath\(\)/,
  'Plumber environment should receive the resolved MICOM script path.',
)

assert.match(
  mainSource,
  /ipcMain\.handle\('plumber:runPermutationAnalysis'[\s\S]*postToPlumber\('\/run-permutation-analysis', payload\)[\s\S]*plumberBridgeExceptionResponse\(err, 'permutation analysis'\)/,
  'Electron main should route runPermutationAnalysis IPC to /run-permutation-analysis.',
)

assert.match(
  mainSource,
  /ipcMain\.handle\('plumber:runPermutationConfiguralPrecheck'[\s\S]*postToPlumber\('\/run-permutation-configural-precheck', payload\)[\s\S]*plumberBridgeExceptionResponse\(err, 'permutation configural precheck'\)/,
  'Electron main should route the MICOM configural precheck IPC to /run-permutation-configural-precheck.',
)

assert.match(
  plumberSource,
  /micom_script_path\s*<-\s*Sys\.getenv\("METIS_MICOM_R_PATH"/,
  'Plumber should read the MICOM script path from the Electron-provided environment.',
)

assert.match(
  plumberSource,
  /ensure_micom_loaded\s*<-\s*function\(\)[\s\S]*source\(micom_script_path[\s\S]*metis_micom/,
  'Plumber should source micom.R directly and verify metis_micom is available.',
)

assert.match(
  plumberSource,
  /validate_permutation_analysis_payload\s*<-\s*function\(payload, construct_names, data_columns\)[\s\S]*groupingVariable[\s\S]*groupA[\s\S]*groupB[\s\S]*permutations[\s\S]*alpha[\s\S]*seed/,
  'Plumber should validate MICOM grouping values and settings as part of payload normalization.',
)

assert.match(
  plumberSource,
  /classify_micom_constructs\s*<-\s*function\(step2_rows, step3_rows\)/,
  'MICOM classification should be computed per construct in one shared helper.',
)
for (const classification of ['"none"', '"partial"', '"full"']) {
  assert.match(
    plumberSource,
    new RegExp(classification),
    `MICOM classification helper should produce ${classification}.`,
  )
}

assert.match(
  plumberSource,
  /map_micom_response\s*<-\s*function\(payload, data, micom_result, timings = NULL\)[\s\S]*configuralInvariance[\s\S]*compositionalInvariance[\s\S]*equalityAssessment[\s\S]*invarianceClassification[\s\S]*admissibility/,
  'Plumber should map MICOM step1/step2/step3/admissibility into app response sections.',
)

assert.match(
  plumberSource,
  /pr\$handle\("POST", "\/run-permutation-analysis"[\s\S]*prepare_payload\(req\)[\s\S]*get_cached_pls_core\(payload,\s*data\)[\s\S]*metis_micom\([\s\S]*model\s*=\s*core\$model[\s\S]*data\s*=\s*data[\s\S]*group_var\s*=\s*payload\$groupingVariable[\s\S]*group_a\s*=\s*payload\$groupA[\s\S]*group_b\s*=\s*payload\$groupB[\s\S]*permutations\s*=\s*payload\$permutations[\s\S]*alpha\s*=\s*payload\$alpha[\s\S]*seed\s*=\s*payload\$seed[\s\S]*quick\s*=\s*FALSE/,
  'Plumber route should call real metis_micom with explicit left/right group values and quick = FALSE.',
)

assert.match(
  plumberSource,
  /map_micom_step1_response\s*<-\s*function\(payload, data, step1_result[\s\S]*configuralInvariance[\s\S]*status[\s\S]*groups[\s\S]*groupA[\s\S]*groupB/,
  'Plumber should map metis_micom_step1 into the same configural precheck response shape used by the modal.',
)

assert.match(
  plumberSource,
  /json_unbox_tree\s*<-\s*function\(value\)[\s\S]*jsonlite::unbox/,
  'Plumber should include a helper for forcing MICOM scalar response fields to serialize as JSON scalars.',
)

assert.match(
  plumberSource,
  /map_micom_step1_response\s*<-\s*function\(payload, data, step1_result[\s\S]*json_unbox_tree\(list\([\s\S]*configuralInvariance[\s\S]*passed[\s\S]*status/,
  'MICOM configural precheck mapper should unbox scalar fields such as status and passed for the renderer.',
)

assert.match(
  plumberSource,
  /map_micom_response\s*<-\s*function\(payload, data, micom_result, timings = NULL\)[\s\S]*json_unbox_tree\(list\([\s\S]*settings[\s\S]*configuralInvariance[\s\S]*passed[\s\S]*invarianceClassification/,
  'MICOM calculation mapper should unbox scalar settings, group values, and pass/fail fields in the JSON response.',
)

assert.ok(
  (plumberSource.match(/json_unbox_tree\(attach_timing_metadata\(response, timings\)\)/g) ?? []).length >= 2,
  'MICOM routes should unbox the final response after timing metadata is attached so success and timing fields are JSON scalars.',
)

assert.match(
  plumberSource,
  /pr\$handle\("POST", "\/run-permutation-configural-precheck"[\s\S]*prepare_payload\(req\)[\s\S]*get_cached_pls_core\(payload,\s*data\)[\s\S]*metis_micom_step1\([\s\S]*model\s*=\s*core\$model[\s\S]*data\s*=\s*data[\s\S]*group_var\s*=\s*payload\$groupingVariable[\s\S]*group_a\s*=\s*payload\$groupA[\s\S]*group_b\s*=\s*payload\$groupB/,
  'Plumber precheck route should call real metis_micom_step1 with explicit left/right group values.',
)

assert.match(
  modelCanvasSource,
  /runPermutationAnalysisModel[\s\S]*runPermutationConfiguralPrecheck/,
  'ModelCanvas should import and call the MICOM calculation and configural precheck services.',
)

assert.match(
  modelCanvasSource,
  /handleRunPermutationAnalysis\s*=\s*async \(settings: PermutationAnalysisSettings\)[\s\S]*buildAnalysisPayload\('permutation'[\s\S]*runPermutationAnalysisModel\(\{[\s\S]*groupingVariable:\s*settings\.groupingVariable[\s\S]*groupA:\s*settings\.groupA[\s\S]*groupB:\s*settings\.groupB[\s\S]*permutations:\s*settings\.permutations[\s\S]*alpha:\s*settings\.alpha[\s\S]*seed:\s*settings\.seed/,
  'ModelCanvas should build a normal PLS payload and append the modal group/settings values unchanged.',
)

assert.match(
  modelCanvasSource,
  /<PermutationAnalysisModal[\s\S]*onRun=\{handleRunPermutationAnalysis\}[\s\S]*isRunning=\{calculatingType === 'permutation' && isCalculating\}/,
  'Permutation modal should be wired to the run handler and calculating state.',
)

assert.doesNotMatch(
  modelCanvasSource,
  /configuralStatus="pending"/,
  'ModelCanvas should not hard-code the MICOM configural status to pending after the precheck bridge exists.',
)

console.log('PASS permutation analysis plumber contract')
