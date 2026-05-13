import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function read(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

const draftInput = await read('src/components/DraftNumberInput.tsx')
const bootstrapModal = await read('src/components/BootstrapModal.tsx')
const plsPredictModal = await read('src/components/PlsPredictModal.tsx')
const advancedAnalysisModal = await read('src/components/AdvancedAnalysisModal.tsx')
const modelCanvas = await read('src/pages/ModelCanvas.tsx')

assert.match(draftInput, /const \[draft,\s*setDraft\] = useState/, 'draft number input should keep editable text separate from committed numeric state')
assert.match(draftInput, /if \(raw\.trim\(\) === ''\) return/, 'blank numeric drafts should not commit immediately')
assert.match(draftInput, /onBlur=\{\(\) => \{[\s\S]*commitDraft\(\)[\s\S]*\}\}/, 'draft numeric input should commit on blur')
assert.match(draftInput, /committedByKeyRef/, 'draft numeric input should avoid duplicate Enter-plus-blur commits')
assert.match(draftInput, /event\.key === 'Enter'[\s\S]*commitDraft\(\)/, 'draft numeric input should commit on Enter')

assert.match(bootstrapModal, /DraftNumberInput[\s\S]*value=\{settings\.subsamples\}/, 'bootstrap subsamples should use draft numeric input')
assert.match(bootstrapModal, /DraftNumberInput[\s\S]*value=\{settings\.maxIterations\}/, 'bootstrap max iterations should use draft numeric input')
assert.doesNotMatch(bootstrapModal, /set\('subsamples', Number\(v\) \|\| 500\)/, 'bootstrap subsamples should not rewrite blank input to the default while typing')
assert.doesNotMatch(bootstrapModal, /set\('maxIterations', Number\(v\) \|\| 300\)/, 'bootstrap max iterations should not rewrite blank input to the default while typing')

assert.match(plsPredictModal, /DraftNumberInput[\s\S]*value=\{settings\.folds\}/, 'PLSpredict folds should use draft numeric input')
assert.match(plsPredictModal, /DraftNumberInput[\s\S]*value=\{settings\.repetitions\}/, 'PLSpredict repetitions should use draft numeric input')
assert.doesNotMatch(plsPredictModal, /value === '' \? DEFAULT_PLS_PREDICT_SETTINGS/, 'PLSpredict inputs should not reset blank edits to defaults while typing')

assert.match(advancedAnalysisModal, /DraftNumberInput[\s\S]*value=\{runDepth\}/, 'advanced analysis run depth should use draft numeric input')
assert.doesNotMatch(advancedAnalysisModal, /onChange=\{\(event\) => setRunDepth\(Math\.max\(10, Number\(event\.target\.value\) \|\| 10\)\)\}/, 'advanced analysis run depth should not clamp every keystroke')

assert.match(modelCanvas, /constructSizeDraft/, 'construct size should keep a local draft while editing')
assert.match(modelCanvas, /constructSizeFocused \? 'Use size' : 'Auto size'/, 'construct size action should become Use size while editing')
assert.match(modelCanvas, /commitConstructSizeDraft/, 'construct size should commit only through an explicit action or Enter')
assert.doesNotMatch(
  modelCanvas,
  /onChange=\{\(e\) => \{[\s\S]{0,220}updateSelected\(\{ radius:/,
  'construct size typing should not resize the construct on every keystroke',
)

console.log('PASS draft number input contract')
