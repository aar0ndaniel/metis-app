import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const [pathDiagramSource, resultsViewSource] = await Promise.all([
  fs.readFile(path.join(workspaceRoot, 'src/components/PathDiagram.tsx'), 'utf8'),
  fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8'),
])

assert.match(
  pathDiagramSource,
  /const RESULTS_READABLE_TEXT_COLOR = 'var\(--color-text-primary\)'/,
  'Results path diagram text should use the app text token so it turns light in dark theme.',
)

assert.doesNotMatch(
  pathDiagramSource,
  /fill=\{resultsReadable \? '#000000'/,
  'The live Results path diagram should not hardcode black text.',
)

assert.match(
  pathDiagramSource,
  /fill=\{resultsReadable \? RESULTS_READABLE_TEXT_COLOR : measurementTextColor\}/,
  'Measurement values should switch to theme-readable text in Results mode.',
)

assert.match(
  pathDiagramSource,
  /fill=\{resultsReadable \? RESULTS_READABLE_TEXT_COLOR : \(useColor \? lineColor : 'var\(--color-text-secondary\)'\)\}/,
  'Structural path values should switch to theme-readable text in Results mode.',
)

assert.match(
  pathDiagramSource,
  /const constructScoreY = resultsReadable \? c\.y - 12 : c\.y - 6/,
  'Endogenous construct scores should move upward in Results mode to open space for the construct name.',
)

assert.match(
  pathDiagramSource,
  /const constructNameY = hasScore\s*\?\s*\(resultsReadable \? c\.y \+ 16 : c\.y \+ 9\)\s*:\s*\(resultsReadable \? c\.y : c\.y - 5\)/,
  'Construct names should have a larger gap from R-square scores and sit centered when no score is shown.',
)

assert.doesNotMatch(
  pathDiagramSource,
  /\{c\.type\}/,
  'Path diagrams should no longer render formative/reflective construct type text.',
)

assert.match(
  resultsViewSource,
  /if \(tagName === 'text'\)[\s\S]{0,260}exportEl\.setAttribute\('fill',\s*EXPORT_DIAGRAM_TEXT_COLOR\)/,
  'Path diagram downloads should force text back to black for document export.',
)

console.log('PASS path diagram Results theme and export text contract')
