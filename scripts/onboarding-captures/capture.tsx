import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../../src/index.css'
import TitleBar from '../../src/components/TitleBar'
import PreferencesModal from '../../src/components/PreferencesModal'
import TarkModal from '../../src/components/TarkModal'
import DataView from '../../src/pages/DataView'
import ImportStep1 from '../../src/pages/ImportStep1'
import { writeDatasetViewCache } from '../../src/utils/datasetViewCache'

const capture = new URLSearchParams(window.location.search).get('capture') || 'analysis'

// Keep release captures independent from preferences saved by a developer or a
// previous app run. Only capture-relevant keys are touched; the capture browser
// itself runs in a disposable profile.
const deterministicCapturePreferences: Record<string, string> = {
  'metis:prefs:theme': 'Dark',
  'pls:prefs:theme': 'Dark',
  'metis:prefs:language': 'English',
  'pls:prefs:language': 'English',
  'pls:prefs:maxIterations': '300',
  'pls:prefs:stopCriterion': '1e-7',
  'pls:prefs:initialWeights': '1 (uniform)',
  'pls:prefs:innerWeighting': 'Path weighting scheme',
  'pls:prefs:defaultSubsamples': '500',
  'pls:prefs:defaultSeed': 'Auto',
  'pls:prefs:missingData': 'Mean replacement',
  'pls:prefs:missingValue': 'NA',
  'pls:prefs:assessSyntax': 'false',
  'pls:prefs:plsAlgorithm': 'Standard PLS',
  'pls:prefs:customMissingMarkers': '[]',
}
for (const [key, value] of Object.entries(deterministicCapturePreferences)) {
  localStorage.setItem(key, value)
}

const captureWorkspace = [{
  id: 'capture-workspace',
  name: 'Customer Experience.metisws',
  color: '#A4A327',
  expanded: true,
  path: 'C:\\Capture\\Customer Experience.metisws',
  defaultDatasetId: 'capture-dataset',
  children: [
  {
    id: 'capture-model',
    name: 'Customer Loyalty.hbe',
    type: 'model',
    badge: 'Calculated',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    state: {
      constructs: [
        { id: 'quality', name: 'Quality', x: 180, y: 160, radius: 46, type: 'Reflective', color: '#A4A327', indicators: [] },
        { id: 'loyalty', name: 'Loyalty', x: 390, y: 160, radius: 46, type: 'Reflective', color: '#2F8FB3', indicators: [] },
      ],
      paths: [{ id: 'quality-loyalty', from: 'quality', to: 'loyalty', kind: 'direct' }],
      analysis: { mode: 'pls-sem', results: { final_results: {} }, savedAt: new Date().toISOString() },
    },
  },
  {
    id: 'capture-dataset',
    name: 'Customer survey.csv',
    type: 'dataset',
    filePath: 'customer-survey.csv',
    originalFileName: 'Customer survey.csv',
    totalRows: 8,
    missing: 3,
    missingMarker: 'Empty cells / NA',
  },
  ],
}] as any

const captureHeaders = ['Satisfaction', 'Trust', 'Value', 'Loyalty', 'Recommendation']
const captureRows = [
  ['6', '7', '6', '7', '7'],
  ['5', '6', '', '6', '6'],
  ['7', '7', '7', '7', '7'],
  ['4', '', '5', '5', '4'],
  ['6', '6', '6', 'NA', '6'],
  ['5', '5', '4', '5', '5'],
  ['7', '6', '7', '7', '7'],
  ['6', '7', '6', '6', '7'],
]

if (capture === 'missing-data-highlighting') {
  writeDatasetViewCache('capture-dataset', {
    datasetId: 'capture-dataset',
    filePath: 'customer-survey.csv',
    fileName: 'Customer survey.csv',
    workspaceId: 'capture-workspace',
    workspaceName: 'Customer Experience.metisws',
    workspacePath: 'C:\\Capture\\Customer Experience.metisws',
    headers: captureHeaders,
    allRows: captureRows,
    totalRows: captureRows.length,
    missing: 3,
    missingMarker: 'Empty cells / NA',
  })
}

function AnalysisCapture() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('pls:action', {
      detail: { status: { hasCanvasItems: true, hasActiveModel: true, canRunAdvanced: true } },
    }))
    window.setTimeout(() => {
      const analysisButton = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Analysis')
      analysisButton?.click()
    }, 50)
  }, [])

  return (
    <div data-capture-root="analysis" style={{ width: 940, height: 360, background: 'var(--color-page)' }}>
      <TitleBar currentScreen="canvas" theme="Dark" activeModelName="Customer Loyalty" />
    </div>
  )
}

function AlgorithmPreferencesCapture() {
  return <PreferencesModal initialTab="algorithm" onClose={() => undefined} />
}

function MissingDataHighlightCapture() {
  useEffect(() => {
    window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>('button[title="Show missing values"]')?.click()
      window.setTimeout(() => {
        document.querySelector<HTMLButtonElement>('button[title="Find next missing value"]')?.click()
      }, 120)
    }, 220)
  }, [])

  return (
    <MemoryRouter initialEntries={['/data/capture-workspace/capture-dataset']}>
      <Routes>
        <Route path="/data/:workspaceId/:datasetId" element={<DataView workspaces={captureWorkspace} />} />
      </Routes>
    </MemoryRouter>
  )
}

function MissingDataMarkerCapture() {
  useEffect(() => {
    window.setTimeout(() => {
      const markerButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find(button => button.textContent?.trim() === 'Empty cells / NA')
      markerButton?.click()
    }, 260)
  }, [])

  const csv = [captureHeaders.join(','), ...captureRows.map(row => row.join(','))].join('\n')
  return (
    <MemoryRouter initialEntries={[{
      pathname: '/import-preview',
      state: {
        fileName: 'Customer survey.csv',
        fileContent: btoa(csv),
        workspaceId: 'capture-workspace',
        workspaceName: 'Customer Experience.metisws',
        workspacePath: 'C:\\Capture\\Customer Experience.metisws',
      },
    }]}>
      <Routes>
        <Route path="/import-preview" element={<ImportStep1 workspaces={captureWorkspace} activeWorkspaceId="capture-workspace" />} />
      </Routes>
    </MemoryRouter>
  )
}

function CaptureSurface() {
  if (capture === 'algorithm-preferences') return <AlgorithmPreferencesCapture />
  if (capture === 'missing-data-highlighting') return <MissingDataHighlightCapture />
  if (capture === 'missing-data-marker') return <MissingDataMarkerCapture />
  if (capture === 'tark') {
    return <TarkModal workspaces={captureWorkspace} activeWorkspaceId="capture-workspace" onClose={() => undefined} />
  }
  return <AnalysisCapture />
}

document.documentElement.dataset.theme = 'dark'
document.documentElement.dataset.captureSurface = capture
document.body.style.margin = '0'
document.body.style.background = 'var(--color-page)'
createRoot(document.getElementById('root')!).render(<CaptureSurface />)
