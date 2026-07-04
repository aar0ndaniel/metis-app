import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const titleBarSource = await fs.readFile(path.join(workspaceRoot, 'src/components/TitleBar.tsx'), 'utf8')
const resultsSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')
const chartsSource = await fs.readFile(path.join(workspaceRoot, 'src/components/ResultsCharts.tsx'), 'utf8')

assert.doesNotMatch(
  titleBarSource,
  /const noWorkbench = screen !== 'canvas' && screen !== 'results'/,
  'Results mode should not be treated as an analysis workbench.',
)

for (const [label, guard] of [
  ['Run Bootstrap', 'noCanvas || !status.hasCanvasItems'],
  ['PLS Predict', 'noCanvas || !status.hasCanvasItems'],
  ['Advanced analysis', 'noCanvas || !status.canRunAdvanced'],
  ['Algorithm Settings', 'noCanvas || !status.hasCanvasItems'],
]) {
  assert.match(
    titleBarSource,
    new RegExp(`label:\\s*'${label}'[\\s\\S]*?disabled:\\s*${guard.replace(/[|]/g, '\\|')}`),
    `${label} should be disabled outside the model canvas.`,
  )
}

assert.match(
  resultsSource,
  /viewBox="0 0 246\.27 322\.64"/,
  'HTML export should inline the current black metis logo.',
)

assert.match(
  resultsSource,
  /points="196\.35 238\.72 53\.7 322\.64 74\.68 127\.55 196\.35 238\.72"/,
  'HTML export logo should use the current logo geometry.',
)

assert.doesNotMatch(
  resultsSource,
  /viewBox="0 0 870\.26 870\.26"/,
  'HTML export should not use the previous large circular logo.',
)

assert.match(
  resultsSource,
  /:root \{[\s\S]*--bg:#F4F6F8;[\s\S]*--card:#FFFFFF;[\s\S]*--line:#D7DDE6;[\s\S]*--text:#1A1F2B;[\s\S]*--muted:#5F6978;[\s\S]*--brand:\$\{exportAccent\.color\};[\s\S]*--indicator:\$\{exportAccent\.color\};/,
  'HTML export should use the light app palette and expose dynamic diagram accent tokens.',
)

assert.doesNotMatch(
  resultsSource,
  /--bg:#F7F4EC|--line:#E6DECA|--muted:#8E6D49/,
  'HTML export should not keep the old beige report palette.',
)

assert.match(
  resultsSource,
  /function getCurrentExportAccent\(\): ExportAccent[\s\S]*getPropertyValue\('--color-accent'\)[\s\S]*\|\| '#2F8FB3'/,
  'Exported diagrams should resolve the current accent with the default fallback.',
)

assert.match(
  resultsSource,
  /getPropertyValue\('--color-accent-rgb'\)[\s\S]*\|\| '47 143 179'/,
  'Exported diagrams should resolve the current accent RGB with the default fallback.',
)

assert.match(
  resultsSource,
  /<circle cx="\$\{c\.x\}" cy="\$\{c\.y\}" r="\$\{c\.radius\}" fill="\$\{exportAccent\.color\}" stroke="\$\{exportAccent\.color\}"/,
  'Exported construct circles should be filled with the export accent color.',
)

assert.match(
  resultsSource,
  /<rect x="\$\{ind\.ix - ind\.labelW \/ 2\}"[\s\S]*height="\$\{ind\.labelH\}"[\s\S]*fill="\$\{ind\.constructColor\}24"[\s\S]*stroke="\$\{ind\.constructColor\}"/,
  'Exported indicator boxes should inherit their construct color.',
)

assert.doesNotMatch(
  resultsSource.slice(resultsSource.indexOf('interface CanvasConstruct'), resultsSource.indexOf('interface CanvasPath')),
  /width\?: number|height\?: number/,
  'Results canvas indicators should not persist custom size fields.',
)

assert.match(
  resultsSource,
  /arrowPathSplit\(from,\s*to,\s*40,\s*p\.labelT\)/,
  'Exported structural path statistics should use persisted label positions.',
)

assert.match(
  resultsSource,
  /clampResultsLabelT\(ind\.labelT\)/,
  'Exported indicator score labels should use persisted label positions.',
)

assert.match(
  chartsSource,
  /Export \(static HTML\) light-theme colors/,
  'Export chart SVGs should be documented as light-theme export colors.',
)

assert.match(
  chartsSource,
  /bg:\s*'#FFFFFF'[\s\S]*border:\s*'#D7DDE6'[\s\S]*text:\s*'#1A1F2B'[\s\S]*muted:\s*'#5F6978'/,
  'Export chart SVGs should use light backgrounds, borders, and text.',
)

console.log('PASS results mode analysis lockout and HTML export theme contract')
