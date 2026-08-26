import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

async function runTest(name, fn) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

const pathDiagramFile = fs.readFileSync(path.resolve('src/components/PathDiagram.tsx'), 'utf-8')
const resultsViewFile = fs.readFileSync(path.resolve('src/pages/ResultsView.tsx'), 'utf-8')
const tarkModalFile = fs.readFileSync(path.resolve('src/components/TarkModal.tsx'), 'utf-8')
const pathDiagramExportFile = fs.readFileSync(path.resolve('src/utils/pathDiagramExport.ts'), 'utf-8')
const analysisPaletteFile = fs.readFileSync(path.resolve('src/utils/analysisPalette.ts'), 'utf-8')

await runTest('PathDiagram does not use hardcoded #000000 text fills for readable mode', () => {
  // Should not contain resultsReadable ? '#000000'
  assert.equal(
    pathDiagramFile.includes("resultsReadable ? '#000000'"),
    false,
    "PathDiagram should not hardcode '#000000' for resultsReadable text fills"
  )
  // Should define and use PATH_DIAGRAM_TEXT_PRIMARY and PATH_DIAGRAM_TEXT_SECONDARY
  assert.ok(pathDiagramFile.includes("PATH_DIAGRAM_TEXT_PRIMARY = 'var(--color-text-primary)'"))
  assert.ok(pathDiagramFile.includes("PATH_DIAGRAM_TEXT_SECONDARY = 'var(--color-text-secondary)'"))
  assert.ok(pathDiagramFile.includes('fill={resultsReadable ? PATH_DIAGRAM_TEXT_PRIMARY :'))
  assert.ok(pathDiagramFile.includes('fill: resultsReadable ? PATH_DIAGRAM_TEXT_PRIMARY : PATH_DIAGRAM_TEXT_SECONDARY'))
})

await runTest('Path diagram export keeps normal text black and poor measurements deep red', () => {
  assert.ok(pathDiagramExportFile.includes("EXPORT_DIAGRAM_TEXT_COLOR = '#000000'"))
  assert.ok(analysisPaletteFile.includes("POOR_MEASUREMENT_COLOR = '#B4232C'"))
  assert.ok(pathDiagramExportFile.includes("data-analysis-tone') === 'poor-measurement'"))
  assert.ok(pathDiagramExportFile.includes('isPoorMeasurement ? POOR_MEASUREMENT_COLOR : textColor'))
})

await runTest('PathDiagram increases vertical gap between construct name and score value', () => {
  assert.ok(pathDiagramFile.includes('x={c.x} y={c.y - 12}'))
  assert.ok(pathDiagramFile.includes('x={c.x} y={c.y + 13}'))
  assert.ok(pathDiagramFile.includes('x={c.x} y={c.y + 13 + line.y}'))
})

await runTest('PathDiagram removes construct type for exogenous constructs and centers name', () => {
  assert.equal(
    pathDiagramFile.includes('{c.type}'),
    false,
    'PathDiagram should not render {c.type} underneath construct name for exogenous constructs'
  )
  assert.ok(pathDiagramFile.includes('<text x={c.x} y={c.y}'))
})

await runTest('HTML and DOCX exports preserve poor measurement red on publication backgrounds', () => {
  assert.ok(resultsViewFile.includes('fill="${EXPORT_DIAGRAM_TEXT_COLOR}"'))
  assert.ok(resultsViewFile.includes('fill="${measurementColor}"'))
  assert.ok(tarkModalFile.includes('exportPathDiagramToPngBase64'))
})
