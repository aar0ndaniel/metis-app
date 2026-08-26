import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const read = (relativePath) => fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')

const [pathDiagram, pathDiagramExport, analysisPalette, resultsView, panelCatalog, panelData, plumber, tarkTables] = await Promise.all([
  read('src/components/PathDiagram.tsx'),
  read('src/utils/pathDiagramExport.ts'),
  read('src/utils/analysisPalette.ts'),
  read('src/pages/ResultsView.tsx'),
  read('src/results/panelCatalog.ts'),
  read('src/results/panelData.ts'),
  read('r-api/plumber.R'),
  read('src/utils/tarkReportTables.ts'),
])

const checks = [
  [
    'results path diagram opts into readable black labels',
    /resultsReadable\??:\s*boolean/,
    pathDiagram,
  ],
  [
    'results path diagram uses a larger readable label size',
    /fontSize=\{resultsReadable \? (?:11|12|13|15) : /,
    pathDiagram,
  ],
  [
    'ResultsView passes readable rendering to the path diagram',
    /resultsReadable=\{resultsReadable\}|resultsReadable\s*\n/,
    resultsView,
  ],
  [
    'exported path diagram values are black and enlarged',
    /font-size="(?:1[3-9]|[2-9][0-9])"[\s\S]{0,80}fill="\$\{EXPORT_DIAGRAM_TEXT_COLOR\}"/,
    resultsView,
  ],
  [
    'ResultsView R export branches on the run mode',
    /analysisMode === 'bootstrap'[\s\S]{0,1200}bootstrap_model|analysisMode === 'plspredict'|analysisMode === 'advanced'/,
    resultsView,
  ],
  [
    'ResultsView R export reads the recorded algorithm settings',
    /algorithm\.settings|algorithmSettings/,
    resultsView,
  ],
  [
    'ResultsView R export branches on the recorded result mode',
    /meta\.mode[\s\S]*runAnalysisMode[\s\S]*runAnalysisMode === 'advanced'/,
    resultsView,
  ],
  [
    'advanced R export includes the run-specific seminrExtras analysis',
    /seminrExtras[\s\S]{0,1600}assess_ipma[\s\S]{0,1600}assess_nca|assess_cipma/,
    resultsView,
  ],
  [
    'every results mode exposes an Algorithm settings panel',
    /id:\s*'algorithm-settings'[\s\S]{0,100}label:\s*'Algorithm settings'/g,
    panelCatalog,
  ],
  [
    'algorithm settings panel reads the run algorithm metadata',
    /'algorithm-settings':\s*'algorithm\.settings'/,
    panelData,
  ],
  [
    'R responses retain the submitted algorithm settings',
    /algorithmSettings[\s\S]{0,500}algorithm_settings|algorithm_settings[\s\S]{0,500}algorithmSettings/,
    plumber,
  ],
  [
    'PLS estimation applies the recorded algorithm controls',
    /estimate_pls\([\s\S]*inner_weights\s*=\s*estimation_settings\$inner_weights[\s\S]*maxIt\s*=\s*estimation_settings\$maxIt[\s\S]*stopCriterion\s*=\s*estimation_settings\$stopCriterion/,
    plumber,
  ],
  [
    'MICOM and MGA responses retain the base PLS algorithm',
    /method = "MICOM"[\s\S]{0,700}algorithm = algorithm[\s\S]{0,500}algorithm_label/,
    plumber,
  ],
  [
    'exported diagram keeps normal text black and poor measurement text deep red',
    /EXPORT_DIAGRAM_TEXT_COLOR = '#000000'[\s\S]*POOR_MEASUREMENT_COLOR = '#B4232C'[\s\S]*poor-measurement/,
    `${pathDiagramExport}\n${analysisPalette}\n${pathDiagram}`,
  ],
  [
    'ResultsView exposes chart SVG copy and download actions',
    /buildChartSvgForPanel[\s\S]{0,2000}navigator\.clipboard[\s\S]{0,1200}image\/svg\+xml/,
    resultsView,
  ],
  [
    'Tark report includes specific indirect effects with bootstrap statistics',
    /Specific indirect effects[\s\S]{0,1800}2\.5% CI[\s\S]{0,500}97\.5% CI/,
    tarkTables,
  ],
]

for (const [name, pattern, source] of checks) {
  assert.match(source, pattern, name)
  console.log(`PASS ${name}`)
}
