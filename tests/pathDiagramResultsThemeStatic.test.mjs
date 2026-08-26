import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const [pathDiagramSource, pathDiagramExportSource, resultsViewSource, paletteSource] = await Promise.all([
  fs.readFile(path.join(workspaceRoot, 'src/components/PathDiagram.tsx'), 'utf8'),
  fs.readFile(path.join(workspaceRoot, 'src/utils/pathDiagramExport.ts'), 'utf8'),
  fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8'),
  fs.readFile(path.join(workspaceRoot, 'src/utils/analysisPalette.ts'), 'utf8'),
])

assert.match(
  pathDiagramSource,
  /const PATH_DIAGRAM_TEXT_PRIMARY = 'var\(--color-text-primary\)'/,
  'Results path diagram text should use the app text token so it turns light in dark theme.',
)

assert.doesNotMatch(
  pathDiagramSource,
  /fill=\{resultsReadable \? '#000000'/,
  'The live Results path diagram should not hardcode black text.',
)

assert.match(
  pathDiagramSource,
  /shouldUseMeasurementQualityTone[\s\S]*'Outer loadings'[\s\S]*'Outer weights'[\s\S]*'Outer weights \/ loadings'/,
  'Loadings and weights should use the same poor-value threshold contract.',
)

assert.match(
  pathDiagramSource,
  /const isPoorMeasurement[\s\S]*getOuterLoadingTone\(val\) === 'fail'[\s\S]*const measurementTextColor = isPoorMeasurement[\s\S]*POOR_MEASUREMENT_COLOR[\s\S]*PATH_DIAGRAM_TEXT_PRIMARY/,
  'Poor loading and weight values should override the readable theme color with deep red.',
)

assert.match(
  pathDiagramSource,
  /data-analysis-tone=\{isPoorMeasurement \? 'poor-measurement' : undefined\}/,
  'Poor measurement labels should be marked so export normalization can preserve their red tone.',
)

assert.match(
  pathDiagramSource,
  /fill=\{measurementTextColor\}[\s\S]*fontSize=\{resultsReadable \? 12 : 8\}/,
  'Poor values should keep exactly the same font size as normal theme-readable values.',
)

assert.match(
  paletteSource,
  /export const POOR_MEASUREMENT_COLOR = '#[0-9A-F]{6}'/,
  'The poor measurement tone should be a stable deep red shared by live and exported diagrams.',
)

assert.match(
  pathDiagramExportSource,
  /data-analysis-tone[\s\S]*poor-measurement[\s\S]*POOR_MEASUREMENT_COLOR[\s\S]*exportEl\.setAttribute\('fill',\s*exportTextColor\)/,
  'Path diagram downloads should keep poor measurement labels red while normal text becomes black.',
)

assert.match(
  resultsViewSource,
  /const measurementColor = getOuterLoadingTone\(val\) === 'fail'[\s\S]*POOR_MEASUREMENT_COLOR[\s\S]*EXPORT_DIAGRAM_TEXT_COLOR[\s\S]*fill="\$\{measurementColor\}"/,
  'HTML path-diagram export should keep poor loading and weight values red.',
)

console.log('PASS path diagram Results theme and export text contract')
