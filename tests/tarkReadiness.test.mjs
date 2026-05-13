import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')

async function importTsModule(relativeEntry, outfileName) {
  const sourcePath = path.join(workspaceRoot, relativeEntry)
  const outfile = path.join(tempDir, outfileName)
  const source = await fs.readFile(sourcePath, 'utf8')

  await fs.mkdir(tempDir, { recursive: true })

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  })
  await fs.writeFile(outfile, transpiled.outputText, 'utf8')

  const moduleUrl = `${pathToFileURL(outfile).href}?t=${Date.now()}`
  return import(moduleUrl)
}

const tark = await importTsModule('src/utils/tarkReadiness.ts', 'tarkReadiness.test.bundle.mjs')

assert.equal(typeof tark.getModelReadiness, 'function', 'Tark readiness helper should be exported for behavioral coverage.')
assert.equal(typeof tark.getMissingLabel, 'function', 'Tark missing-label helper should be exported for behavioral coverage.')

const results = [
  {
    id: 'r-pls',
    name: 'Customer Loyalty - PLS-SEM',
    type: 'result',
    linkedModelId: 'm-ready',
    state: { analysis: { mode: 'pls-sem' } },
  },
  {
    id: 'r-bootstrap',
    name: 'Customer Loyalty - Bootstrap',
    type: 'result',
    linkedModelId: 'm-ready',
    state: { analysis: { mode: 'bootstrap' } },
  },
  {
    id: 'r-plspredict',
    name: 'Customer Loyalty - PLSpredict',
    type: 'result',
    linkedModelId: 'm-ready',
    state: { analysis: { mode: 'plspredict' } },
  },
  {
    id: 'r-other',
    name: 'Incomplete Model - PLS-SEM',
    type: 'result',
    linkedModelId: 'm-incomplete',
    state: { analysis: { mode: 'pls-sem' } },
  },
  {
    id: 'r-advanced',
    name: 'Customer Loyalty - Advanced analysis',
    type: 'result',
    linkedModelId: 'm-advanced-ready',
    state: { analysis: { mode: 'advanced' } },
  },
  {
    id: 'r-advanced-pls',
    name: 'Customer Loyalty - PLS-SEM',
    type: 'result',
    linkedModelId: 'm-advanced-ready',
    state: { analysis: { mode: 'pls-sem' } },
  },
  {
    id: 'r-advanced-bootstrap',
    name: 'Customer Loyalty - Bootstrap',
    type: 'result',
    linkedModelId: 'm-advanced-ready',
    state: { analysis: { mode: 'bootstrap' } },
  },
  {
    id: 'r-advanced-plspredict',
    name: 'Customer Loyalty - PLSpredict',
    type: 'result',
    linkedModelId: 'm-advanced-ready',
    state: { analysis: { mode: 'plspredict' } },
  },
]

const ready = tark.getModelReadiness('m-ready', results)
assert.equal(ready.ready, true, 'Model with saved PLS-SEM, Bootstrap, and PLSpredict results should be report-ready.')
assert.deepEqual(ready.missing, [], 'Ready model should not list missing analyses.')
assert.deepEqual(ready.saved.sort(), ['bootstrap', 'pls-sem', 'plspredict'].sort())

const advancedMissing = tark.getModelReadiness('m-ready', results, { includeAdvancedAnalysis: true })
assert.equal(advancedMissing.ready, false, 'Advanced report option should require a saved advanced analysis result.')
assert.deepEqual(advancedMissing.missing, ['advanced'])
assert.equal(tark.getMissingLabel(advancedMissing), 'Advanced analysis')

const advancedReady = tark.getModelReadiness('m-advanced-ready', results, { includeAdvancedAnalysis: true })
assert.equal(advancedReady.ready, true, 'Model should be advanced-report-ready only after core and advanced results are saved.')
assert.deepEqual(advancedReady.saved.sort(), ['advanced', 'bootstrap', 'pls-sem', 'plspredict'].sort())

const incomplete = tark.getModelReadiness('m-incomplete', results)
assert.equal(incomplete.ready, false, 'Model with only one saved result should not be report-ready.')
assert.deepEqual(incomplete.saved, ['pls-sem'])
assert.deepEqual(incomplete.missing.sort(), ['bootstrap', 'plspredict'].sort())
assert.equal(tark.getMissingLabel(incomplete), 'Bootstrap, PLSpredict')

const unrelated = tark.getModelReadiness('m-empty', results)
assert.equal(unrelated.ready, false, 'Unlinked saved results should not make another model report-ready.')
assert.deepEqual(unrelated.missing.sort(), ['bootstrap', 'pls-sem', 'plspredict'].sort())

console.log('PASS Tark readiness behavior')
