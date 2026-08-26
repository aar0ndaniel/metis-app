import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const source = await fs.readFile(path.join(workspaceRoot, 'src/components/PlsPredictModal.tsx'), 'utf8')

assert.match(
  source,
  /SquaresFour size=\{18\} weight="fill"/,
  'PLSpredict modal should use the shared top-left header icon language.'
)

assert.match(
  source,
  /height:\s*40,[\s\S]*justifyContent:\s*'space-between'/,
  'PLSpredict header should use the compact Bootstrap/PLS title bar layout.'
)

assert.match(
  source,
  /title="Close"/,
  'PLSpredict should keep the close affordance at the top right.'
)

assert.match(
  source,
  /padding:\s*'16px 20px'[\s\S]*justifyContent:\s*'space-between'/,
  'PLSpredict footer should push default settings and the CTA to opposite edges.'
)

assert.match(
  source,
  /className="flex items-center gap-1\.5 px-4 py-2 rounded-lg transition-opacity"/,
  'PLSpredict CTA should use a more compact button padding.'
)

assert.match(
  source,
  /Run PLSpredict/,
  'PLSpredict footer should keep the run action label.'
)

assert.match(
  source,
  /background:\s*'var\(--color-elevated\)'/,
  'PLSpredict inputs should use the shared elevated surface token.'
)

assert.match(
  source,
  /<(?:InlineField|CompactField) label="Repetitions">/,
  'PLSpredict should keep repetitions as an explicit editable setting.'
)

assert.match(
  source,
  /<(?:InlineField|CompactField) label="Validation (?:cycles|plan)">/,
  'PLSpredict should also show the derived validation plan in the main form.'
)

assert.match(
  source,
  /gridTemplateColumns:\s*'minmax\(140px, 160px\) 1fr'/,
  'PLSpredict sections should place the section title on the left and the controls on the right.'
)

assert.doesNotMatch(
  source,
  /SectionTitle>Summary<\/SectionTitle>/,
  'PLSpredict should remove the Bootstrap-style summary rail.'
)

assert.doesNotMatch(
  source,
  /borderLeft:\s*'1px solid rgba\(255,255,255,0.05\)'/,
  'PLSpredict should not keep a side summary column.'
)

assert.doesNotMatch(
  source,
  /Compare PLS predictions against the linear benchmark and optionally include CVPAT\./,
  'PLSpredict should not keep extra explanatory helper copy in the diagnostics section.'
)

assert.match(
  source,
  /width:\s*'min\(560px, 92vw\)'/,
  'PLSpredict modal should stay narrower now that the summary rail is gone.'
)

assert.doesNotMatch(
  source,
  /function Card\(/,
  'PLSpredict should not keep the old card-within-modal chrome.'
)

console.log('PASS PLSpredict modal layout contract')
