import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const resultsViewSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')
const pathDiagramSource = await fs.readFile(path.join(workspaceRoot, 'src/components/PathDiagram.tsx'), 'utf8')

assert.match(
  resultsViewSource,
  /const MEASUREMENT_OPTIONS = \[[\s\S]*'Outer loading t-values'[\s\S]*'Outer weight t-values'[\s\S]*'Outer weights \/ loadings t-values'[\s\S]*\]/,
  'Graphical output measurement model menu should expose loading, weight, and mixed t-value modes.',
)

assert.match(
  pathDiagramSource,
  /measurementResults\?: Record<string, \{ loading\?: number; weight\?: number; loadingT\?: number; weightT\?: number \}>/,
  'PathDiagram measurement results should carry loading and weight t-values.',
)

assert.match(
  pathDiagramSource,
  /mode === 'Outer loading t-values'[\s\S]*measurementEntry\?\.loadingT/,
  'PathDiagram should read loading t-values for the loading t-value measurement mode.',
)

assert.match(
  pathDiagramSource,
  /mode === 'Outer weight t-values'[\s\S]*measurementEntry\?\.weightT/,
  'PathDiagram should read weight t-values for the weight t-value measurement mode.',
)

assert.match(
  pathDiagramSource,
  /mode === 'Outer weights \/ loadings t-values'[\s\S]*constructType === 'Formative'[\s\S]*measurementEntry\?\.weightT[\s\S]*measurementEntry\?\.loadingT/,
  'PathDiagram should choose weight t-values for formative constructs and loading t-values otherwise in mixed mode.',
)

assert.match(
  resultsViewSource,
  /parseOuterLoadings\(source, indicatorMap\)\.forEach\(\(row\) => \{[\s\S]*const partial: \{ loading\?: number; loadingT\?: number \} = \{ loading: row\.loading \}[\s\S]*if \(Number\.isFinite\(row\.tStatistic\)\) partial\.loadingT = row\.tStatistic[\s\S]*upsertMeasurement\(row\.construct, row\.indicator, partial\)/,
  'ResultsView should add parsed loading t-statistics to diagram measurement results.',
)

assert.match(
  resultsViewSource,
  /parseOuterWeights\(source, indicatorMap\)\.forEach\(\(row\) => \{[\s\S]*const partial: \{ weight\?: number; weightT\?: number \} = \{ weight: row\.loading \}[\s\S]*if \(Number\.isFinite\(row\.tStatistic\)\) partial\.weightT = row\.tStatistic[\s\S]*upsertMeasurement\(row\.construct, row\.indicator, partial\)/,
  'ResultsView should add parsed weight t-statistics to diagram measurement results.',
)

console.log('PASS results graphical measurement t-values contract')
