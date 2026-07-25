import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const packageSource = await fs.readFile(path.join(workspaceRoot, 'package.json'), 'utf8')
const mainSource = await fs.readFile(path.join(workspaceRoot, 'electron/main.ts'), 'utf8')
const plumberSource = await fs.readFile(path.join(workspaceRoot, 'r-api/plumber.R'), 'utf8')
const bootstrapModalSource = await fs.readFile(path.join(workspaceRoot, 'src/components/BootstrapModal.tsx'), 'utf8')
const advancedModalSource = await fs.readFile(path.join(workspaceRoot, 'src/components/AdvancedAnalysisModal.tsx'), 'utf8')
const modelCanvasSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const resultsViewSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')
const trackedReleasePlumberPaths = new Set(
  execFileSync('git', ['ls-files', 'release/**/resources/r-api/plumber.R'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  }).split(/\r?\n/).filter(Boolean)
)

assert.match(
  plumberSource,
  /analysis_core_plan\s*<-\s*function\s*\(\)\s*\{/,
  'R backend should expose a core plan helper for parallel-safe analyses.'
)

assert.match(
  plumberSource,
  /requested\s*<-\s*if\s*\(\s*detected\s*>=\s*13L\s*\)\s*\{\s*12L\s*\}\s*else\s+if\s*\(\s*detected\s*>=\s*11L\s*\)\s*\{\s*10L\s*\}\s*else\s+if\s*\(\s*detected\s*>=\s*9L\s*\)\s*\{\s*8L\s*\}\s*else\s+if\s*\(\s*detected\s*>=\s*7L\s*\)\s*\{\s*6L\s*\}\s*else\s*\{\s*max\(1L,\s*detected\s*-\s*1L\)\s*\}[\s\S]*?policy\s*<-\s*"dynamic-stepped-cap"/,
  'Default analysis cores should use the stepped desktop-safe cap: 13+ cores use 12, 11-12 use 10, 9-10 use 8, 7-8 use 6, and smaller machines reserve one core.'
)

assert.match(
  plumberSource,
  /if\s*\(\s*is\.na\(requested\)\s*\|\|\s*requested\s*==\s*0L\s*\)[\s\S]*?else\s+if\s*\(\s*requested\s*<\s*0L\s*\)/,
  'Negative METIS_ANALYSIS_CORES values should remain available as reserve-core overrides.'
)

assert.doesNotMatch(
  packageSource,
  /METIS_ANALYSIS_CORES=\d+|METIS_ANALYSIS_CORES=\\"\d+\\"/,
  'Development scripts should not force bootstrap analyses to a fixed core count.'
)

assert.doesNotMatch(
  packageSource,
  /"electron:dev":\s*"set \\"METIS_ANALYSIS_CORES=/,
  'Electron dev should use the dynamic R backend core fallback instead of hard-coding an analysis core override.'
)

for (const releasePlumberPath of [
  'release/bundle/win-unpacked/resources/r-api/plumber.R',
  'release/lite/win-unpacked/resources/r-api/plumber.R',
  'release/win-unpacked/resources/r-api/plumber.R',
]) {
  if (!trackedReleasePlumberPaths.has(releasePlumberPath)) continue

  let releasePlumberSource = ''
  try {
    releasePlumberSource = await fs.readFile(path.join(workspaceRoot, releasePlumberPath), 'utf8')
  } catch (err) {
    if (err?.code === 'ENOENT') continue
    throw err
  }

  assert.match(
    releasePlumberSource,
    /requested\s*<-\s*if\s*\(\s*detected\s*>=\s*13L\s*\)\s*\{\s*12L\s*\}\s*else\s+if\s*\(\s*detected\s*>=\s*11L\s*\)\s*\{\s*10L\s*\}\s*else\s+if\s*\(\s*detected\s*>=\s*9L\s*\)\s*\{\s*8L\s*\}\s*else\s+if\s*\(\s*detected\s*>=\s*7L\s*\)\s*\{\s*6L\s*\}\s*else\s*\{\s*max\(1L,\s*detected\s*-\s*1L\)\s*\}[\s\S]*?policy\s*<-\s*"dynamic-stepped-cap"/,
    `${releasePlumberPath} should match the stepped bundled core fallback.`
  )

  assert.doesNotMatch(
    releasePlumberSource,
    /requested\s*<-\s*min\(3L|cores\s*=\s*3/,
    `${releasePlumberPath} should not keep the old hard-coded 3-core bootstrap cap.`
  )
}

assert.match(
  plumberSource,
  /get_cached_pls_core\s*<-\s*function\s*\(payload,\s*data\)\s*\{/,
  'R backend should cache core PLS models by payload and dataset identity.'
)

assert.match(
  plumberSource,
  /dataframe_to_rows\s*<-\s*function\s*\(df\)\s*\{/,
  'R backend should convert data frames to API rows directly instead of round-tripping through JSON.'
)

assert.doesNotMatch(
  plumberSource,
  /jsonlite::fromJSON\s*\(\s*jsonlite::toJSON\s*\(\s*df,/,
  'as_rows should avoid the expensive jsonlite toJSON/fromJSON round-trip for data frames.'
)

const mgaPlsMgaPSource = plumberSource.match(/mga_pls_mga_p\s*<-\s*function\s*\([^)]*\)\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
assert.ok(
  mgaPlsMgaPSource,
  'R backend should expose a PLS-MGA p-value helper.'
)

assert.doesNotMatch(
  mgaPlsMgaPSource,
  /outer\s*\(/,
  'MGA PLS-MGA p-values should not materialize nboot x nboot comparison matrices.'
)

assert.match(
  mgaPlsMgaPSource,
  /sort\s*\([\s\S]*?findInterval\s*\(/,
  'MGA PLS-MGA p-values should use sorted-count pair comparisons to avoid O(nboot^2) memory.'
)

const cachedCoreCalls = [
  ...plumberSource.matchAll(/core\s*<-\s*(?:time_phase\(\s*timings,\s*"[^"]+",\s*)?get_cached_pls_core\s*\(\s*payload,\s*data\s*\)/g),
].length
assert.ok(
  cachedCoreCalls >= 4,
  `Expected all primary analysis endpoints to use cached PLS cores, found ${cachedCoreCalls}.`
)

assert.match(
  plumberSource,
  /core_plan\s*<-\s*analysis_core_plan\(\)[\s\S]*cores\s*<-\s*core_plan\$cores[\s\S]*seminr::bootstrap_model\s*\(\s*core\$model,\s*nboot\s*=\s*nboot,\s*cores\s*=\s*cores\)/,
  'Bootstrap should pass planned bounded cores into seminr::bootstrap_model.'
)

assert.match(
  plumberSource,
  /details\s*=\s*list\([\s\S]*nboot\s*=\s*nboot[\s\S]*cores\s*=\s*cores[\s\S]*detected_cores\s*=\s*core_plan\$detected_cores[\s\S]*reserved_cores\s*=\s*core_plan\$reserved_cores[\s\S]*core_policy\s*=\s*core_plan\$policy/,
  'Bootstrap timing details should log the local core plan for machine-specific validation.'
)

assert.match(
  plumberSource,
  /format_timing_details\s*<-\s*function\s*\(details\)[\s\S]*core plan: using[\s\S]*logical cores[\s\S]*reserved[\s\S]*core_policy/,
  'Timing details should explain the bootstrap core plan instead of only printing a raw cores number.'
)

assert.match(
  plumberSource,
  /timing_execution_log\s*<-\s*function\s*\(timings\)[\s\S]*Timing:/,
  'Timing phases should continue to be formatted into execution log entries.'
)

assert.match(
  mainSource,
  /const BLAS_THREAD_ENV_DEFAULTS[\s\S]*OPENBLAS_NUM_THREADS:\s*'1'[\s\S]*OMP_NUM_THREADS:\s*'1'[\s\S]*VECLIB_MAXIMUM_THREADS:\s*'1'/,
  'Plumber should default BLAS engines to one thread so optimized BLAS does not oversubscribe bootstrap workers.'
)

assert.match(
  mainSource,
  /for \(const \[name, value\] of Object\.entries\(BLAS_THREAD_ENV_DEFAULTS\)\)[\s\S]*if \(!env\[name\]\) env\[name\] = value/,
  'Plumber BLAS thread defaults should preserve explicit user environment overrides.'
)

assert.match(
  plumberSource,
  /new_timing_collector\("bootstrap"\)[\s\S]*attach_timing_metadata\(response,\s*timings\)/,
  'Bootstrap should keep timing metadata attached to the response execution log.'
)

assert.match(
  plumberSource,
  /Sys\.getenv\("METIS_MAX_BOOTSTRAP_SAMPLES",\s*""\)/,
  'Bootstrap should be uncapped by default unless an explicit backend limit is configured.'
)

assert.doesNotMatch(
  plumberSource,
  /if\s*\(\s*nboot\s*>\s*max_bootstrap_samples\s*\)\s*nboot\s*<-\s*max_bootstrap_samples/,
  'Bootstrap should not silently clamp requested subsamples down to a backend maximum.'
)

assert.match(
  plumberSource,
  /bootstrap_sample_ceiling\s*<-\s*function\s*\(\)\s*\{/,
  'Bootstrap validation should use an explicit optional ceiling helper.'
)

assert.match(
  plumberSource,
  /if\s*\(\s*isTRUE\(analyses\$nca\)\s*&&\s*!\s*isTRUE\(analyses\$cipma\)\s*\)\s*\{/,
  'Advanced analysis should only run standalone NCA when cIPMA is not already running NCA internally.'
)

assert.match(
  plumberSource,
  /seminrExtras::assess_cipma\([\s\S]*?nca\s*=\s*isTRUE\(analyses\$nca\)[\s\S]*?nca_test\.rep\s*=\s*run_depth/,
  'cIPMA should only run its package-native NCA integration when NCA is explicitly checked.'
)

assert.match(
  plumberSource,
  /necessity_source\s*<-\s*if\s*\(\s*isTRUE\(analyses\$nca\)\s*\)\s*\{[\s\S]*?nca_summary\s*%\|\|%[\s\S]*?\(cipma_summary\$nca\s*%\|\|%\s*NULL\)[\s\S]*?\}\s*else\s*\{[\s\S]*?NULL[\s\S]*?\}/,
  'Advanced analysis should only expose NCA necessity data when NCA was explicitly checked.'
)

assert.match(
  plumberSource,
  /bottleneck_source\s*<-\s*if\s*\(\s*isTRUE\(analyses\$nca\)\s*\)\s*\{[\s\S]*?nca_summary\s*%\|\|%[\s\S]*?\(cipma_summary\$nca\s*%\|\|%\s*NULL\)[\s\S]*?\}\s*else\s*\{[\s\S]*?NULL[\s\S]*?\}/,
  'Advanced analysis should only expose NCA bottleneck data when NCA was explicitly checked.'
)

assert.match(
  plumberSource,
  /ceiling_lines\s*<-\s*if\s*\(\s*!\s*is\.null\(necessity_source\)\s*\)\s*\{[\s\S]*?build_nca_ceiling_rows\(core,\s*target_construct,\s*predecessor_names\)[\s\S]*?\}\s*else\s*\{[\s\S]*?list\(\)[\s\S]*?\}/,
  'Advanced analysis should only expose NCA ceiling-line data when NCA was explicitly checked.'
)

assert.match(
  bootstrapModalSource,
  /subsamples:\s*500,/,
  'Bootstrap modal should default to 500 subsamples for product-speed runs.'
)

assert.doesNotMatch(
  bootstrapModalSource,
  /subsamples:\s*5000,/,
  'Bootstrap modal should not default to publication-scale 5000 subsamples.'
)

assert.doesNotMatch(
  bootstrapModalSource,
  /value=\{settings\.subsamples\}[\s\S]{0,300}max=\{?5000\}?/,
  'Bootstrap subsamples input should not cap users at 5000 subsamples.'
)

assert.match(
  modelCanvasSource,
  /nboot:\s*Number\(settings\?\.subsamples\)\s*\|\|\s*500,/,
  'Model canvas bootstrap payload fallback should be 500 subsamples.'
)

assert.match(
  resultsViewSource,
  /const nboot = Number\(settings\?\.subsamples\) \|\| 500[\s\S]*nboot,/,
  'Results view bootstrap payload fallback should be 500 subsamples.'
)

assert.match(
  advancedModalSource,
  /useState\(initialSettings\?\.runDepth\s*\?\?\s*500\)/,
  'Advanced analysis modal should default NCA/cIPMA permutation depth to 500.'
)

console.log('PASS analysis performance static guards')
