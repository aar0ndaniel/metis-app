import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const plumberPath = path.join(workspaceRoot, 'r-api', 'plumber.R')
const source = await fs.readFile(plumberPath, 'utf8')
const electronMain = await fs.readFile(path.join(workspaceRoot, 'electron', 'main.ts'), 'utf8')
const setupWizard = await fs.readFile(path.join(workspaceRoot, 'src', 'pages', 'SetupWizard.tsx'), 'utf8')
const resultsView = await fs.readFile(path.join(workspaceRoot, 'src', 'pages', 'ResultsView.tsx'), 'utf8')

assert.match(
  source,
  /seminrExtras::assess_cvpat/,
  'PLSpredict CVPAT should call seminrExtras::assess_cvpat when CVPAT is enabled.'
)

assert.doesNotMatch(
  source,
  /cvpat_status\s*<-\s*if\s*\(\s*cvpat_enabled\s*\)\s*"unsupported"\s*else\s*"disabled"/,
  'PLSpredict CVPAT should not be hardcoded as unsupported.'
)

assert.match(source, /status\s*=\s*"missing-seminrextras"/, 'CVPAT should report a package-missing status.')
assert.match(source, /status\s*=\s*"error"/, 'CVPAT should report a computation-error status.')
assert.match(source, /"computed"/, 'CVPAT should report a computed status when rows are produced.')
assert.match(source, /CVPAT_compare_LM/, 'CVPAT parser should read the seminrExtras LM comparison table.')
assert.match(source, /CVPAT_compare_IA/, 'CVPAT parser should read the seminrExtras item-average comparison table.')
assert.match(source, /build_construct_display_name_map/, 'CVPAT rows should map VAR_* construct labels back to readable construct or indicator names.')
assert.match(source, /PLS_out_of_sample_residuals/, 'PLSpredict Q²predict should be derived from PLS out-of-sample residuals when seminr summary omits Q².')
assert.match(source, /item_actuals/, 'PLSpredict Q²predict should use the held-out actual indicator values from predict_pls output.')
assert.match(source, /Q2predict/, 'PLSpredict should serialize Q2predict with an ASCII-safe key for Windows/R JSON compatibility.')
assert.match(source, /model\$meanData/, 'PLSpredict Q2predict should use the model item-average benchmark when available.')
assert.match(resultsView, /analysisMode === 'plspredict' && selectedPanel === 'execution-log'/, 'PLSpredict execution log should render with the dedicated log panel, not the generic table fallback.')
assert.match(electronMain, /seminrExtras/, 'R package verification should require seminrExtras.')
assert.match(setupWizard, /seminrExtras/, 'Setup wizard package instructions should include seminrExtras.')

console.log('PASS r-api CVPAT uses seminrExtras instead of hardcoded unsupported status')
