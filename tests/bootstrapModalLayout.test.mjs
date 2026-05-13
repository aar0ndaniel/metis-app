import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const source = await fs.readFile(path.join(workspaceRoot, 'src/components/BootstrapModal.tsx'), 'utf8')

assert.match(
  source,
  /gridTemplateColumns:\s*'minmax\(180px, 220px\) 1fr'/,
  'Bootstrap general section should keep subsamples and resampling aligned on one row.'
)

assert.match(
  source,
  /width:\s*148[\s\S]*label="CI type"[\s\S]*width:\s*124[\s\S]*label="Confidence level"[\s\S]*width:\s*144[\s\S]*label="Tails"/,
  'Bootstrap confidence settings should use slimmer fixed-width controls.'
)

assert.match(
  source,
  /gridTemplateColumns:\s*'repeat\(2, minmax\(0, 1fr\)\)'/,
  'Bootstrap advanced settings should keep compatible fields on the same row.'
)

assert.match(
  source,
  /type="radio"[\s\S]*name="bootstrap-resampling"/,
  'Bootstrap resampling should use radio inputs instead of a dropdown.'
)

assert.doesNotMatch(
  source,
  /type="radio"[\s\S]*name="bootstrap-sign-changes"/,
  'Bootstrap sign changes should use a compact dropdown instead of radios.'
)

assert.match(
  source,
  /<Field label="Sign changes">[\s\S]*<SelectBox/,
  'Bootstrap sign changes should use a compact dropdown field.'
)

assert.doesNotMatch(
  source,
  /<Field label="Random seed">/,
  'Bootstrap should not show a random-seed input when the value is always Auto.'
)

assert.doesNotMatch(
  source,
  /Random seed:/,
  'Bootstrap summary should not repeat the hidden random-seed field.'
)

assert.doesNotMatch(
  source,
  /Affects the orientation of bootstrap loadings and weights\./,
  'Bootstrap sign changes should not include extra helper copy.'
)

assert.doesNotMatch(
  source,
  /ArrowLeft/,
  'Bootstrap modal should not keep a duplicate Back action in the header.'
)

assert.doesNotMatch(
  source,
  /Save Preset/,
  'Bootstrap save preset action should be icon-only.'
)

assert.match(
  source,
  /title="Save preset"/,
  'Bootstrap save preset icon should still expose a tooltip label.'
)

assert.match(
  source,
  /SquaresFour size=\{18\} weight="fill"/,
  'Bootstrap modal should use the same top-left header icon language as the PLS and Advanced dialogs.'
)

assert.match(
  source,
  /height:\s*40,[\s\S]*justifyContent:\s*'space-between'/,
  'Bootstrap header should use the compact PLS-style title bar layout.'
)

assert.match(
  source,
  /title="Close"/,
  'Bootstrap header should keep only the close affordance at the top right.'
)

assert.match(
  source,
  /padding:\s*'16px 20px'[\s\S]*justifyContent:\s*'space-between'/,
  'Bootstrap should place its primary action in a footer row, not the title bar.'
)

assert.match(
  source,
  /Run Bootstrap/,
  'Bootstrap footer should keep the Run Bootstrap action.'
)

assert.match(
  source,
  /background:\s*'var\(--color-elevated\)'/,
  'Bootstrap inputs should use the shared elevated field background token.'
)

assert.match(
  source,
  /const \[showAdvanced,\s*setShowAdvanced\] = useState\(false\)/,
  'Bootstrap advanced settings should start collapsed.'
)

assert.match(
  source,
  /showAdvanced &&/,
  'Bootstrap advanced fields should render only after expansion.'
)

assert.doesNotMatch(
  source,
  /function Card\(/,
  'Bootstrap sections should not use separate card chrome.'
)

assert.doesNotMatch(
  source,
  /background:\s*settings\.signChanges\s*===/,
  'Bootstrap sign change options should not use selected background fills.'
)

assert.doesNotMatch(
  source,
  /border:\s*settings\.signChanges\s*===/,
  'Bootstrap sign change options should not use selected borders.'
)

assert.match(
  source,
  /background:\s*'var\(--color-page\)'/,
  'Bootstrap summary rail should use the page-layer token for contrast.'
)

assert.match(
  source,
  /display:\s*'flex',[\s\S]*flexDirection:\s*'column',[\s\S]*borderLeft:\s*'1px solid var\(--color-border\)'/,
  'Bootstrap summary rail should sit as a full-height side column.'
)

console.log('PASS bootstrap modal compact layout contract')
