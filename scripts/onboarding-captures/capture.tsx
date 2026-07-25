import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import TitleBar from '../../src/components/TitleBar'
import PreferencesModal from '../../src/components/PreferencesModal'
import PermutationAnalysisModal from '../../src/components/PermutationAnalysisModal'
import MultiGroupAnalysisModal from '../../src/components/MultiGroupAnalysisModal'
import TarkModal from '../../src/components/TarkModal'

const groupingOptions = ['Market']
const datasetRows = [
  ['Market'],
  ['Ghana'],
  ['Ghana'],
  ['Kenya'],
  ['Kenya'],
]

const captureWorkspace = [{
  id: 'capture-workspace',
  name: 'Customer Experience.metisws',
  color: '#A4A327',
  expanded: true,
  children: [{
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
  }],
}] as any

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

function LanguagesCapture() {
  useEffect(() => {
    window.setTimeout(() => {
      const languageSelect = Array.from(document.querySelectorAll<HTMLElement>('.metis-preference-select')).find(element => element.textContent?.trim().startsWith('English'))
      languageSelect?.click()
    }, 80)
  }, [])

  return <PreferencesModal initialTab="general" onClose={() => undefined} />
}

function CaptureSurface() {
  const capture = new URLSearchParams(window.location.search).get('capture') || 'analysis'
  if (capture === 'languages') return <LanguagesCapture />
  if (capture === 'micom') {
    return <PermutationAnalysisModal modelName="Customer Loyalty" groupingOptions={groupingOptions} datasetRows={datasetRows} configuralStatus="idle" onClose={() => undefined} onPrecheck={() => undefined} onRun={() => undefined} />
  }
  if (capture === 'mga') {
    return <MultiGroupAnalysisModal modelName="Customer Loyalty" groupingOptions={groupingOptions} datasetRows={datasetRows} onClose={() => undefined} onRun={() => undefined} />
  }
  if (capture === 'tark') {
    return <TarkModal workspaces={captureWorkspace} activeWorkspaceId="capture-workspace" onClose={() => undefined} />
  }
  return <AnalysisCapture />
}

document.documentElement.dataset.theme = 'dark'
document.body.style.margin = '0'
document.body.style.background = 'var(--color-page)'
createRoot(document.getElementById('root')!).render(<CaptureSurface />)
