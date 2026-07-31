import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { CaretDown, CaretRight, Copy } from '@phosphor-icons/react'
import PathDiagram from '../components/PathDiagram'
import TarkIcon from '../components/TarkIcon'
import { dispatchToast } from '../components/Toast'
import { buildClipboardTableHtml, buildClipboardTableText, type ExportTableSection } from '../results/clipboardTables'
import { readWorkspaceClientCache } from '../utils/workspaceClientCache'
import { normalizeResultMode, type RequiredMode } from '../utils/tarkReadiness'
import {
  buildTarkDiagramResults,
  buildTarkReportSections,
  mapTarkConstructDiagramMode,
} from '../utils/tarkReportTables'
import type { Workspace, WorkspaceModelChild, WorkspaceResultChild } from '../types/workspace'

interface TarkPreviewLocationState {
  tark?: TarkReportRequest
}

interface TarkReportRequest {
  workspaceId: string
  modelId: string
  reportTitle: string
  includePathDiagram: boolean
  structuralPathMode: string
  indicatorPathMode: string
  constructValueMode: string
  includeAdvancedAnalysis: boolean
  tableLabelMode: 'full' | 'short'
  constructLabels: Record<string, string>
}

interface SavedAnalysis {
  mode: RequiredMode
  results: Record<string, unknown>
}

const TARK_LABEL_COLOR = 'var(--color-text-secondary)'

function firstResultByMode(workspaceId: string, modelId: string): Map<string, SavedAnalysis> {
  const map = new Map<string, SavedAnalysis>()
  try {
    const raw = readWorkspaceClientCache()
    const workspaces = raw ? JSON.parse(raw) as Workspace[] : []
    const workspace = workspaces.find((entry) => entry.id === workspaceId)
    const results = workspace?.children.filter((child): child is WorkspaceResultChild => child.type === 'result') ?? []
    results.forEach((result) => {
      if (result.linkedModelId !== modelId) return
      const mode = normalizeResultMode(result.state?.analysis?.mode ?? result.meta ?? result.name)
      const analysisResults = result.state?.analysis?.results
      if (!mode || !analysisResults || map.has(mode)) return
      map.set(mode, { mode, results: analysisResults as Record<string, unknown> })
    })
  } catch {
    return map
  }
  return map
}

function readSavedModelSnapshot(workspaceId: string, modelId: string): { constructs: any[]; paths: any[] } | null {
  try {
    const raw = readWorkspaceClientCache()
    const workspaces = raw ? JSON.parse(raw) as Workspace[] : []
    const workspace = workspaces.find((entry) => entry.id === workspaceId)
    const resultWithSnapshot = workspace?.children.find((child): child is WorkspaceResultChild =>
      child.type === 'result'
      && child.linkedModelId === modelId
      && Array.isArray(child.state?.modelSnapshot?.constructs)
    )
    const resultSnapshot = resultWithSnapshot?.state?.modelSnapshot
    if (resultSnapshot?.constructs) {
      return {
        constructs: Array.isArray(resultSnapshot.constructs) ? resultSnapshot.constructs : [],
        paths: Array.isArray(resultSnapshot.paths) ? resultSnapshot.paths : [],
      }
    }

    const model = workspace?.children.find((child): child is WorkspaceModelChild => child.type === 'model' && child.id === modelId)
    if (!model?.state?.constructs) return null
    return {
      constructs: Array.isArray(model.state.constructs) ? model.state.constructs : [],
      paths: Array.isArray(model.state.paths) ? model.state.paths : [],
    }
  } catch {
    return null
  }
}

async function copySections(
  sections: ExportTableSection[],
  title: string,
) {
  if (!sections.length) {
    dispatchToast('warning', 'No Tark tables', 'No Tark table is available to copy yet.')
    return
  }

  const html = buildClipboardTableHtml(sections, title)
  const text = buildClipboardTableText(sections, title)
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ])
    } else {
      await navigator.clipboard.writeText(text)
    }
    dispatchToast('success', 'Tark table copied', 'Paste into Word to keep the APA-style formatting.')
  } catch (error: any) {
    dispatchToast('error', 'Copy failed', error?.message || 'Could not copy the Tark table.')
  }
}

export default function TarkPreview() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspaceId = '', modelId = '' } = useParams()
  const request = (location.state as TarkPreviewLocationState | null)?.tark
  const [diagramCollapsed, setDiagramCollapsed] = useState(true)

  if (!request) {
    return (
      <div className="h-full w-full flex items-center justify-center" style={{ background: 'var(--color-page)' }}>
        <div
          style={{
            width: 'min(460px, 92vw)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            background: 'var(--color-surface)',
            padding: 22,
            boxShadow: 'var(--shadow-floating-panel)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <TarkIcon size={22} />
            <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 700 }}>
              Tark preview
            </span>
          </div>
          <p style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
            Open Tark from the title bar and select a report-ready model.
          </p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: 'open-tark' } }))}
            style={{
              marginTop: 16,
              height: 34,
              padding: '0 14px',
              border: 'none',
              borderRadius: 8,
              background: 'var(--color-accent)',
              color: 'var(--color-on-accent)',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Open Tark
          </button>
        </div>
      </div>
    )
  }

  const savedAnalyses = firstResultByMode(workspaceId, modelId)
  const savedModel = readSavedModelSnapshot(workspaceId, modelId)
  const tableSections = buildTarkReportSections(request, savedAnalyses, savedModel)
  const diagramResults = request.includePathDiagram && savedModel
    ? buildTarkDiagramResults(savedAnalyses, savedModel)
    : null

  return (
    <div className="h-full w-full overflow-auto" style={{ background: 'var(--color-right-panel-bg)', color: 'var(--color-text-primary)' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 30px 36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <TarkIcon size={24} />
              <span style={{ color: 'var(--color-text-muted-alt)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600 }}>
                Tark preview
              </span>
            </div>
            <h1
              style={{
                margin: 0,
                color: 'var(--color-text-primary)',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 26,
                fontWeight: 700,
                lineHeight: 1.15,
              }}
            >
              {request.reportTitle}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => copySections(tableSections, request.reportTitle)}
              style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--color-accent)',
                color: 'var(--color-on-accent)',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <Copy size={14} />
              Copy all
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Back
            </button>
          </div>
        </div>

        {request.includePathDiagram && (
          <section
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              background: 'var(--color-surface)',
              padding: 16,
              marginBottom: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: diagramCollapsed ? 0 : 12 }}>
              <div>
                <div style={{ color: TARK_LABEL_COLOR, fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700 }}>
                  Diagram
                </div>
                <h2 style={{ margin: '2px 0 0', fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 700 }}>
                  Path diagram
                </h2>
              </div>
              <button
                type="button"
                aria-expanded={!diagramCollapsed}
                aria-controls="tark-path-diagram-panel"
                onClick={() => setDiagramCollapsed((collapsed) => !collapsed)}
                style={{
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-elevated)',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0,
                }}
              >
                {diagramCollapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
                {diagramCollapsed ? 'Show' : 'Hide'}
              </button>
            </div>
            {!diagramCollapsed && (
              <div
                id="tark-path-diagram-panel"
                style={{
                  height: 340,
                  minHeight: 240,
                  overflow: 'hidden',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-right-panel-bg)',
                }}
              >
                {savedModel?.constructs?.length ? (
                  <PathDiagram
                    canvasConstructs={savedModel.constructs as any}
                    canvasPaths={savedModel.paths as any}
                    results={diagramResults ?? undefined}
                    structuralMode={request.structuralPathMode}
                    measurementMode={request.indicatorPathMode}
                    constructMode={mapTarkConstructDiagramMode(request.constructValueMode)}
                    interactive={false}
                    className="w-full h-full"
                  />
                ) : (
                  <div
                    className="h-full w-full flex items-center justify-center"
                    style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}
                  >
                    No saved path diagram is available for this model.
                  </div>
                )}
                </div>
            )}
          </section>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
          {tableSections.length ? tableSections.map((section, index) => (
            <section
              key={section.title}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                background: 'var(--color-surface)',
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 12 }}>
                <div>
                  <div style={{ color: TARK_LABEL_COLOR, fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700 }}>
                    Table {index + 1}
                  </div>
                  <h2 style={{ margin: '2px 0 0', fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 700 }}>
                    {section.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => copySections([section], section.title)}
                  title="Copy table"
                  aria-label={`Copy ${section.title}`}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-elevated)',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Copy size={15} />
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {section.headers.map((header, headerIndex) => (
                        <th
                          key={header}
                          style={{
                            textAlign: headerIndex === 0 ? 'left' : 'right',
                            color: 'var(--color-text-secondary)',
                            fontWeight: 700,
                            padding: '8px 10px',
                            borderTop: '2px solid var(--color-border)',
                            borderBottom: '2px solid var(--color-border)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, rowIndex) => (
                      <tr key={`${section.title}-${rowIndex}`}>
                        {row.map((cell, cellIndex) => (
                          <td
                            key={`${cellIndex}-${cell}`}
                            style={{
                              textAlign: cellIndex === 0 ? 'left' : 'right',
                              color: cellIndex === 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                              padding: '7px 10px',
                              borderBottom: rowIndex === section.rows.length - 1
                                ? '2px solid var(--color-border)'
                                : '1px solid rgb(var(--color-border-rgb) / 0.45)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 8, color: 'var(--color-text-muted-alt)', fontFamily: 'DM Sans, sans-serif', fontSize: 11 }}>
                <em>Note.</em>
              </div>
            </section>
          )) : (
            <section
              style={{
                border: '1px dashed var(--color-border)',
                borderRadius: 10,
                background: 'var(--color-surface)',
                padding: 18,
                color: 'var(--color-text-secondary)',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 13,
              }}
            >
              No Tark tables are available from the saved results yet.
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
