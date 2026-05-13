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

const families = await importTsModule('src/utils/tarkReportFamilies.ts', 'tarkReportFamilies.test.bundle.mjs')

assert.equal(typeof families.getTarkTableFamilies, 'function', 'Tark table family helper should be exported.')

const defaults = families.getTarkTableFamilies()
assert.deepEqual(
  defaults.map((family) => family.title),
  [
    'Measurement model assessment',
    'Discriminant validity assessment',
    'Structural model assessment',
    'Explanatory and predictive power',
    'Model fit assessment',
  ],
  'Default journal-ready reports should include only the five core table families.',
)
assert.equal(defaults.every((family) => family.advanced === false), true, 'Default table families should not be advanced.')

const measurement = defaults.find((family) => family.id === 'measurement-model')
assert.match(measurement.description, /indicator loadings/i, 'Measurement table should combine indicator loadings.')
assert.match(measurement.description, /VIF/i, 'Measurement table should combine VIF.')
assert.match(measurement.description, /Cronbach/i, 'Measurement table should combine Cronbach alpha.')
assert.match(measurement.description, /rho_A/i, 'Measurement table should combine rho_A.')
assert.match(measurement.description, /composite reliability/i, 'Measurement table should combine composite reliability.')
assert.match(measurement.description, /AVE/i, 'Measurement table should combine AVE.')

const structural = defaults.find((family) => family.id === 'structural-model')
assert.match(structural.description, /hypothesis testing/i)
assert.match(structural.description, /confidence intervals/i)
assert.match(structural.description, /f²/i)
assert.match(structural.description, /decision/i)

const discriminant = defaults.find((family) => family.id === 'discriminant-validity')
assert.match(discriminant.description, /Fornell-Larcker/i)
assert.match(discriminant.description, /HTMT/i)
assert.match(discriminant.description, /HTMT inference/i)

const withAdvanced = families.getTarkTableFamilies({ includeAdvancedAnalysis: true })
assert.deepEqual(
  withAdvanced.slice(5).map((family) => family.title),
  ['PLSpredict assessment', 'IPMA results', 'NCA results', 'Additional effects analysis'],
  'Advanced table families should append PLSpredict, IPMA, NCA, and additional effects only when requested.',
)
assert.equal(withAdvanced.filter((family) => family.advanced).length, 4)

console.log('PASS Tark report family contract')
