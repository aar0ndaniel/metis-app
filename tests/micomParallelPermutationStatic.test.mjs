import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function read(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

const micomSource = await read('r-api/micom.R')
const plumberSource = await read('r-api/plumber.R')
const packageJson = JSON.parse(await read('package.json'))
const bundleBuildSource = await read('build/electron-builder.bundle.yml')
const liteBuildSource = await read('build/electron-builder.lite.yml')

assert.match(
  micomSource,
  /metis_micom\s*<-\s*function\([\s\S]*cores\s*=\s*1L[\s\S]*settings\s*<-\s*list\([\s\S]*cores\s*=\s*cores[\s\S]*metis_micom_step2\([\s\S]*cores\s*=\s*cores[\s\S]*metis_micom_step3\([\s\S]*cores\s*=\s*cores/,
  'MICOM should accept planned cores, report them in settings, and pass them into Step 2 and Step 3.',
)

assert.match(
  micomSource,
  /metis_micom_step2\s*<-\s*function\([\s\S]*cores\s*=\s*1L[\s\S]*permutation_conditions\s*<-\s*lapply\(seq_len\(permutations\)[\s\S]*\.metis_micom_parallel_lapply\([\s\S]*cores\s*=\s*cores/,
  'MICOM Step 2 should precompute deterministic permutation assignments and run them through the parallel helper.',
)

assert.match(
  micomSource,
  /metis_micom_step3\s*<-\s*function\([\s\S]*cores\s*=\s*1L[\s\S]*permutation_conditions\s*<-\s*lapply\(seq_len\(permutations\)[\s\S]*\.metis_micom_parallel_lapply\([\s\S]*cores\s*=\s*cores/,
  'MICOM Step 3 should use the same deterministic parallel permutation helper.',
)

assert.match(
  micomSource,
  /\.metis_micom_parallel_lapply\s*<-\s*function\([\s\S]*parallel::makeCluster\([\s\S]*type\s*=\s*"PSOCK"[\s\S]*on\.exit\(parallel::stopCluster[\s\S]*parallel::clusterCall\([\s\S]*parallel::clusterExport\([\s\S]*parallel::parLapply\(/,
  'MICOM parallel helper should use PSOCK clusters with explicit package loading, exports, parLApply, and cleanup for Windows/macOS compatibility.',
)

assert.match(
  micomSource,
  /if\s*\(\s*cores\s*<=\s*1L\s*\|\|\s*length\(x\)\s*<=\s*1L\s*\)\s*return\(lapply\(x,\s*fun\)\)/,
  'MICOM parallel helper should keep a serial fallback for one-core or tiny runs.',
)

assert.match(
  plumberSource,
  /core_plan\s*<-\s*analysis_core_plan\(\)[\s\S]*cores\s*<-\s*core_plan\$cores[\s\S]*metis_micom\([\s\S]*cores\s*=\s*cores[\s\S]*details\s*=\s*list\([\s\S]*permutations\s*=\s*payload\$permutations[\s\S]*cores\s*=\s*cores[\s\S]*detected_cores\s*=\s*core_plan\$detected_cores[\s\S]*reserved_cores\s*=\s*core_plan\$reserved_cores[\s\S]*core_policy\s*=\s*core_plan\$policy/,
  'Permutation analysis route should pass the bounded core plan into MICOM and log the plan in timing details.',
)

assert.equal(
  packageJson.build.extraResources.find((resource) => resource.from === 'r-api')?.filter.includes('micom.R'),
  true,
  'Common package resources should include micom.R so MICOM works in packaged Windows and macOS builds.',
)

assert.match(bundleBuildSource, /filter:[\s\S]*-\s*micom\.R/, 'Bundle build resources should include micom.R.')
assert.match(liteBuildSource, /filter:[\s\S]*-\s*micom\.R/, 'Lite build resources should include micom.R.')

console.log('PASS MICOM parallel permutation static guards')
