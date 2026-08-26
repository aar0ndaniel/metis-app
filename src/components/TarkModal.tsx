import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CaretDown,
  CaretRight,
  Check,
  FileText,
  FolderOpen,
  X,
} from '@phosphor-icons/react'
import PathDiagram from './PathDiagram'
import { stripModelDisplayName, stripWorkspaceDisplayName } from '../utils/displayNames'
import type { Workspace, WorkspaceModelChild, WorkspaceResultChild } from '../types/workspace'
import { getModelReadiness, type ModelReadiness } from '../utils/tarkReadiness'
import {
  buildTarkReportSections,
  buildTarkAdvancedAnalysisSections,
  buildTarkDiagramResults,
  mapTarkConstructDiagramMode,
  type TarkReportSection,
  type TarkSavedAnalysis,
} from '../utils/tarkReportTables'
import {
  buildTarkReportDocxBase64,
  stripTarkDocxExtension,
  sanitizeTarkDocxFilename,
} from '../utils/tarkReportDocx'
import { exportPathDiagramToPngBase64 } from '../utils/pathDiagramExport'

type AdvancedAnalysisId = 'nca' | 'ipma' | 'cipma' | 'micom' | 'mga'
type CreationStatus = 'idle' | 'creating' | 'success' | 'error'

interface TarkModalProps {
  workspaces: Workspace[]
  activeWorkspaceId?: string
  onClose: () => void
}

interface SelectOption {
  value: string
  label: string
  meta?: string
  disabled?: boolean
}

interface AdvancedAnalysisOption {
  id: AdvancedAnalysisId
  label: string
}

interface AdvancedAnalysisState extends AdvancedAnalysisOption {
  saved: boolean
}

const TARK_STEPS = ['Report setup', 'Path diagram', 'Word document'] as const
const STRUCTURAL_PATH_OPTIONS = ['Path coefficients', 'Path coefficient t-values', 'Path coefficient p-values', 'No values']
const INDICATOR_PATH_OPTIONS = ['Outer loadings', 'Outer weights', 'Outer loading t-values', 'Outer weight t-values', 'Outer weights / loadings', 'Outer weights / loadings t-values', 'No values']
const CONSTRUCT_VALUE_OPTIONS = ['R-square', 'Adjusted R-square', 'Q-square', 'No values']
const CORE_RESULT_LABELS: Record<string, string> = {
  'pls-sem': 'PLS-SEM',
  bootstrap: 'Bootstrap',
  plspredict: 'PLSpredict',
}
const ADVANCED_ANALYSES: AdvancedAnalysisOption[] = [
  { id: 'nca', label: 'NCA' },
  { id: 'ipma', label: 'IPMA' },
  { id: 'cipma', label: 'cIPMA' },
  { id: 'micom', label: 'MICOM' },
  { id: 'mga', label: 'MGA' },
]

const TARK_LABEL_COLOR = 'var(--color-text-secondary)'
const TARK_CONTROL_TEXT_COLOR = 'var(--color-text-secondary-alt)'
const TARK_CONTROL_MUTED_COLOR = 'var(--color-text-muted-alt)'
const TARK_DISABLED_TEXT_COLOR = 'var(--color-text-dim)'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span
        style={{
          color: TARK_LABEL_COLOR,
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 13,
          fontWeight: 400,
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function InputBox({
  children,
  height = 34,
  muted = false,
}: {
  children: ReactNode
  height?: number
  muted?: boolean
}) {
  return (
    <div
      className="flex min-w-0 items-center"
      style={{
        width: '100%',
        height,
        padding: '0 12px',
        background: muted ? 'rgb(var(--color-hover-rgb) / 0.32)' : 'var(--color-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 7,
      }}
    >
      {children}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  readOnly = false,
}: {
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  readOnly?: boolean
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      readOnly={readOnly}
      className="w-full min-w-0 bg-transparent outline-none"
      style={{
        color: readOnly ? TARK_CONTROL_MUTED_COLOR : TARK_CONTROL_TEXT_COLOR,
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 12,
        fontWeight: 500,
      }}
    />
  )
}

function SelectBox({
  value,
  options,
  onChange,
  placeholder = 'Select',
}: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value)

  return (
    <div className="relative min-w-0" style={{ width: '100%' }}>
      <button
        type="button"
        className="flex w-full min-w-0 items-center justify-between px-3 transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.5)]"
        style={{
          height: 34,
          background: 'var(--color-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 7,
          color: selected ? TARK_CONTROL_TEXT_COLOR : TARK_CONTROL_MUTED_COLOR,
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 13,
        }}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'left',
          }}
        >
          {selected?.label ?? placeholder}
        </span>
        <CaretDown size={12} style={{ color: TARK_CONTROL_MUTED_COLOR, flexShrink: 0 }} />
      </button>
      {open && (
        <div
          className="absolute left-0 z-50 overflow-hidden rounded-lg"
          style={{
            top: 'calc(100% + 3px)',
            width: '100%',
            background: 'var(--color-elevated)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-modal-popover)',
            maxHeight: 190,
            overflowY: 'auto',
          }}
        >
          {options.length ? options.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              className="w-full px-3 py-2 text-left transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.7)]"
              style={{
                color: option.disabled ? TARK_DISABLED_TEXT_COLOR : TARK_CONTROL_TEXT_COLOR,
                cursor: option.disabled ? 'default' : 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 12,
                opacity: option.disabled ? 0.68 : 1,
              }}
              onClick={() => {
                if (option.disabled) return
                onChange(option.value)
                setOpen(false)
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option.label}</span>
                {option.meta && (
                  <span
                    style={{
                      flexShrink: 0,
                      color: option.disabled ? 'var(--color-danger)' : 'var(--color-success)',
                      fontSize: 11,
                    }}
                  >
                    {option.meta}
                  </span>
                )}
              </span>
            </button>
          )) : (
            <div
              style={{
                padding: '9px 12px',
                color: TARK_CONTROL_MUTED_COLOR,
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 12,
              }}
            >
              No options
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CheckboxRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        color: TARK_CONTROL_TEXT_COLOR,
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ accentColor: 'var(--color-accent)' }}
      />
      {children}
    </label>
  )
}

function StatusBadge({ saved }: { saved: boolean }) {
  return (
    <span
      style={{
        color: saved ? 'var(--color-success)' : 'var(--color-warning)',
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {saved ? 'Saved result found' : 'Result required'}
    </span>
  )
}

function stepCircleState(index: number, step: number): 'complete' | 'active' | 'pending' {
  if (index < step) return 'complete'
  if (index === step) return 'active'
  return 'pending'
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 8,
        padding: '12px 20px 10px',
        background: 'var(--color-surface)',
      }}
    >
      {TARK_STEPS.map((label, index) => {
        const state = stepCircleState(index, step)
        const active = state === 'active'
        const complete = state === 'complete'
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span
              className="grid place-items-center"
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                flexShrink: 0,
                background: active || complete ? 'var(--color-accent)' : 'transparent',
                border: active || complete ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                color: active || complete ? 'var(--color-on-accent)' : TARK_CONTROL_MUTED_COLOR,
                fontSize: 11,
                fontFamily: 'DM Sans, sans-serif',
                fontWeight: 800,
              }}
            >
              {complete ? <Check size={12} weight="bold" /> : index + 1}
            </span>
            <span
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: active ? 'var(--color-text-primary)' : TARK_CONTROL_MUTED_COLOR,
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 11,
                fontWeight: active ? 800 : 600,
              }}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function timestamp(result: WorkspaceResultChild): number {
  const value = Date.parse(String(result.updatedAt ?? result.createdAt ?? ''))
  return Number.isFinite(value) ? value : 0
}

function resultModeText(result: WorkspaceResultChild): string {
  const raw = [
    result.state?.analysis?.mode,
    result.state?.analysis?.type,
    result.state?.analysis?.label,
    result.meta,
    result.name,
  ].filter(Boolean)
  return raw.join(' ').toLowerCase()
}

function compactResultKeys(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const keys: string[] = []
  const visit = (entry: unknown, depth: number) => {
    if (!entry || typeof entry !== 'object' || depth > 3 || keys.length > 80) return
    Object.entries(entry as Record<string, unknown>).forEach(([key, child]) => {
      keys.push(key.toLowerCase())
      visit(child, depth + 1)
    })
  }
  visit(value, 0)
  return keys.join(' ')
}

function advancedKinds(result: WorkspaceResultChild): Set<AdvancedAnalysisId> {
  const set = new Set<AdvancedAnalysisId>()
  const text = `${resultModeText(result)} ${compactResultKeys(result.state?.analysis?.results)}`
  if (text.includes('multi group') || text.includes('multigroup') || text.includes('mga')) set.add('mga')
  if (text.includes('permutation') || text.includes('micom') || text.includes('invariance')) set.add('micom')
  if (text.includes('cipma')) set.add('cipma')
  if (text.includes('construct_table') || text.includes('priority_map') || /(?<!c)ipma/.test(text)) set.add('ipma')
  if (text.includes('nca') || text.includes('necessary condition') || text.includes('necessity_check') || text.includes('bottleneck_table')) set.add('nca')
  return set
}

function latestSavedAnalyses(modelId: string, results: WorkspaceResultChild[]): Map<string, TarkSavedAnalysis> {
  const map = new Map<string, { stamp: number; analysis: TarkSavedAnalysis }>()
  results.forEach((result) => {
    if (result.linkedModelId !== modelId) return
    const mode = String(result.state?.analysis?.mode ?? result.meta ?? result.name ?? '').trim()
    const analysisResults = result.state?.analysis?.results
    if (!mode || !analysisResults) return
    const current = map.get(mode)
    const stamp = timestamp(result)
    if (!current || stamp >= current.stamp) {
      map.set(mode, { stamp, analysis: { mode, results: analysisResults as Record<string, unknown> } })
    }
  })
  return new Map(Array.from(map.entries()).map(([mode, entry]) => [mode, entry.analysis]))
}

function savedAdvancedKinds(modelId: string, results: WorkspaceResultChild[]): Set<AdvancedAnalysisId> {
  const set = new Set<AdvancedAnalysisId>()
  results.forEach((result) => {
    if (result.linkedModelId !== modelId) return
    const kinds = advancedKinds(result)
    kinds.forEach((k) => set.add(k))
  })
  return set
}

function missingCoreLabel(readiness: ModelReadiness | null): string {
  if (!readiness || readiness.ready) return ''
  return readiness.missing.map((mode) => CORE_RESULT_LABELS[mode] ?? mode).join(', ')
}

function combinePath(folder: string, fileName: string): string {
  const cleanFolder = folder.trim().replace(/[\\/]+$/g, '')
  const cleanFile = sanitizeTarkDocxFilename(fileName)
  if (!cleanFolder) return cleanFile
  const separator = cleanFolder.includes('\\') ? '\\' : '/'
  return `${cleanFolder}${separator}${cleanFile}`
}

function splitFilePath(filePath: string): { folder: string; fileName: string } {
  const slash = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  if (slash < 0) return { folder: '', fileName: filePath }
  return {
    folder: filePath.slice(0, slash),
    fileName: filePath.slice(slash + 1),
  }
}

function humanizeKey(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase())
}

function formatAdvancedCell(value: unknown): string {
  if (value == null || value === '') return '\u2014'
  if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(3) : '\u2014'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.length ? formatAdvancedCell(value[0]) : '\u2014'
  if (typeof value === 'object') {
    for (const key of ['value', 'estimate', 'coefficient', 'mean', 'p_value', 'p value', 'result']) {
      const direct = (value as Record<string, unknown>)[key]
      if (direct != null) return formatAdvancedCell(direct)
    }
  }
  return '\u2014'
}

function tableFromUnknown(value: unknown): { headers: string[]; rows: string[][] } | null {
  if (Array.isArray(value)) {
    const records = value.filter((row) => row && typeof row === 'object' && !Array.isArray(row)) as Array<Record<string, unknown>>
    if (!records.length) return null
    const headers = Array.from(new Set(records.flatMap((row) => Object.keys(row)))).slice(0, 10)
    if (!headers.length) return null
    return {
      headers: headers.map(humanizeKey),
      rows: records.slice(0, 40).map((row) => headers.map((header) => formatAdvancedCell(row[header]))),
    }
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length && entries.every(([, entry]) => !entry || typeof entry !== 'object')) {
      return {
        headers: ['Metric', 'Value'],
        rows: entries.slice(0, 40).map(([key, entry]) => [humanizeKey(key), formatAdvancedCell(entry)]),
      }
    }
  }

  return null
}

function extractAdvancedSections(
  analysisLabel: string,
  value: unknown,
  path: string[] = [],
  sections: TarkReportSection[] = [],
): TarkReportSection[] {
  if (sections.length >= 3) return sections
  const table = tableFromUnknown(value)
  if (table && table.rows.length) {
    const suffix = path.length ? humanizeKey(path[path.length - 1]) : 'summary'
    sections.push({
      title: `${analysisLabel} ${suffix}`,
      headers: table.headers,
      rows: table.rows,
      note: `Note. Values are from the saved ${analysisLabel} result.`,
    })
    return sections
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value as Record<string, unknown>).some(([key, child]) => {
      extractAdvancedSections(analysisLabel, child, [...path, key], sections)
      return sections.length >= 3
    })
  }
  return sections
}

function buildAdvancedSections(
  selected: AdvancedAnalysisState[],
  modelId: string,
  results: WorkspaceResultChild[],
): TarkReportSection[] {
  const sections: TarkReportSection[] = []
  selected.forEach((option) => {
    if (!option.saved) return
    const result = results
      .filter((entry) => entry.linkedModelId === modelId && advancedKinds(entry).has(option.id))
      .sort((left, right) => timestamp(right) - timestamp(left))[0]
    if (!result?.state?.analysis?.results) return
    sections.push(...extractAdvancedSections(option.label, result.state.analysis.results))
  })
  return sections
}

export default function TarkModal({
  workspaces,
  activeWorkspaceId,
  onClose,
}: TarkModalProps) {
  const diagramExportContainerRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const [workspaceId, setWorkspaceId] = useState('')
  const [modelId, setModelId] = useState('')
  const [reportTitle, setReportTitle] = useState('Tark report')
  const [titleTouched, setTitleTouched] = useState(false)
  const [includePathDiagram, setIncludePathDiagram] = useState(true)
  const [structuralPathMode, setStructuralPathMode] = useState(STRUCTURAL_PATH_OPTIONS[0])
  const [indicatorPathMode, setIndicatorPathMode] = useState(INDICATOR_PATH_OPTIONS[0])
  const [constructValueMode, setConstructValueMode] = useState(CONSTRUCT_VALUE_OPTIONS[0])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [selectedAdvanced, setSelectedAdvanced] = useState<Record<AdvancedAnalysisId, boolean>>({
    nca: false,
    ipma: false,
    cipma: false,
    micom: false,
    mga: false,
  })
  const [fileName, setFileName] = useState('Tark_report')
  const [fileNameTouched, setFileNameTouched] = useState(false)
  const [saveLocation, setSaveLocation] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [creationStatus, setCreationStatus] = useState<CreationStatus>('idle')
  const [creationError, setCreationError] = useState('')
  const [createdFilePath, setCreatedFilePath] = useState('')

  const workspaceSummaries = useMemo(() => workspaces.map((workspace) => {
    const models = workspace.children.filter((child): child is WorkspaceModelChild => child.type === 'model')
    const results = workspace.children.filter((child): child is WorkspaceResultChild => child.type === 'result')
    const readiness = new Map(models.map((model) => [model.id, getModelReadiness(model.id, results)]))
    const readyModels = models.filter((model) => readiness.get(model.id)?.ready)
    return { workspace, models, results, readiness, readyModels }
  }), [workspaces])

  const reportReadyWorkspaces = useMemo(
    () => workspaceSummaries.filter((entry) => entry.readyModels.length > 0),
    [workspaceSummaries],
  )
  const selectedWorkspaceSummary = reportReadyWorkspaces.find((entry) => entry.workspace.id === workspaceId) ?? reportReadyWorkspaces[0] ?? null
  const selectedWorkspace = selectedWorkspaceSummary?.workspace ?? null
  const selectedModel = selectedWorkspaceSummary?.models.find((model) => model.id === modelId) ?? null
  const selectedReadiness = selectedModel
    ? selectedWorkspaceSummary?.readiness.get(selectedModel.id) ?? null
    : null
  const selectedResults = selectedWorkspaceSummary?.results ?? []
  const savedAdvanced = useMemo(
    () => selectedModel ? savedAdvancedKinds(selectedModel.id, selectedResults) : new Set<AdvancedAnalysisId>(),
    [selectedModel, selectedResults],
  )
  const advancedStates = ADVANCED_ANALYSES.map((option) => ({ ...option, saved: savedAdvanced.has(option.id) }))
  const chosenAdvancedStates = advancedStates.filter((option) => selectedAdvanced[option.id])
  const pendingAdvanced = chosenAdvancedStates.filter((option) => !option.saved)
  const canContinueSetup = Boolean(selectedWorkspace && selectedModel && selectedReadiness?.ready && reportTitle.trim())
  const finalFilePath = combinePath(saveLocation, fileName)
  const canCreate = canContinueSetup && Boolean(saveLocation.trim()) && Boolean(fileName.trim()) && pendingAdvanced.length === 0 && creationStatus !== 'creating'

  useEffect(() => {
    const preferred = reportReadyWorkspaces.find((entry) => entry.workspace.id === activeWorkspaceId)
      ?? reportReadyWorkspaces[0]
      ?? null
    setWorkspaceId((current) => {
      if (current && reportReadyWorkspaces.some((entry) => entry.workspace.id === current)) return current
      return preferred?.workspace.id ?? ''
    })
  }, [activeWorkspaceId, reportReadyWorkspaces])

  useEffect(() => {
    const readyModels = selectedWorkspaceSummary?.readyModels ?? []
    setModelId((current) => {
      if (current && readyModels.some((model) => model.id === current)) return current
      return readyModels[0]?.id ?? ''
    })
  }, [selectedWorkspaceSummary])

  useEffect(() => {
    if (!selectedModel || titleTouched) return
    setReportTitle(`${stripModelDisplayName(selectedModel.name)} Tark report`)
  }, [selectedModel, titleTouched])

  useEffect(() => {
    if (fileNameTouched) return
    setFileName(stripTarkDocxExtension(sanitizeTarkDocxFilename(reportTitle || 'Tark report')))
  }, [fileNameTouched, reportTitle])

  useEffect(() => {
    const api = window.electronAPI
    void api?.getStoragePaths?.().then((result) => {
      if (result?.success) setSaveLocation(String(result.exportPath || result.workspacePath || result.dataPath || ''))
    })
  }, [])

  const workspaceOptions = reportReadyWorkspaces.map((entry) => ({
    value: entry.workspace.id,
    label: stripWorkspaceDisplayName(entry.workspace.name),
    meta: `${entry.readyModels.length} ready`,
  }))

  const modelOptions = (selectedWorkspaceSummary?.models ?? []).map((model) => {
    const readiness = selectedWorkspaceSummary?.readiness.get(model.id) ?? getModelReadiness(model.id, selectedResults)
    return {
      value: model.id,
      label: stripModelDisplayName(model.name),
      meta: readiness.ready ? 'Ready' : `${missingCoreLabel(readiness)} missing`,
      disabled: !readiness.ready,
    }
  })

  const selectedAdvancedLabels = chosenAdvancedStates.map((option) => option.label).join(', ') || 'None'

  const handleBrowse = async () => {
    const api = window.electronAPI
    if (!api?.showSaveDialog) {
      setCreationStatus('error')
      setCreationError('The native save dialog is unavailable. Restart Metis from the desktop app and try again.')
      return
    }

    const result = await api.showSaveDialog({
      title: 'Save Tark report',
      defaultPath: finalFilePath,
      filters: [{ name: 'Word document', extensions: ['docx'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (result?.canceled || !result?.filePath) return
    const split = splitFilePath(String(result.filePath))
    setSaveLocation(split.folder)
    setFileName(stripTarkDocxExtension(split.fileName))
    setFileNameTouched(true)
  }

  const handleCreateReport = async () => {
    if (!canCreate || !selectedWorkspace || !selectedModel) return
    const api = window.electronAPI
    if (!api?.writeFile) {
      setCreationStatus('error')
      setCreationError('The secure file writer is unavailable. Restart Metis from the desktop app and try again.')
      return
    }

    setCreationStatus('creating')
    setCreationError('')

    try {
      const savedAnalyses = latestSavedAnalyses(selectedModel.id, selectedResults)
      const tableRequest = {
        includeAdvancedAnalysis: true,
        ['table' + 'LabelMode']: 'short',
        ['construct' + 'Labels']: {},
      } as any
      const sections = [
        ...buildTarkReportSections(tableRequest, savedAnalyses, selectedModel.state ?? null),
        ...buildTarkAdvancedAnalysisSections(chosenAdvancedStates, savedAnalyses, selectedModel.state ?? null),
      ]

      let pathDiagramPngBase64: string | undefined
      if (includePathDiagram && diagramExportContainerRef.current) {
        const svgEl = diagramExportContainerRef.current.querySelector('svg')
        if (svgEl) {
          try {
            pathDiagramPngBase64 = await exportPathDiagramToPngBase64(svgEl as SVGSVGElement)
          } catch (err) {
            console.warn('Could not generate path diagram PNG:', err)
          }
        }
      }

      const base64 = await buildTarkReportDocxBase64({
        title: reportTitle.trim() || `${stripModelDisplayName(selectedModel.name)} Tark report`,
        sections,
        pathDiagramPngBase64,
      })
      const result = await api.writeFile({
        filePath: finalFilePath,
        data: base64,
        encoding: 'base64',
      })
      if (!result?.success) throw new Error(result?.error || 'The Word document could not be saved.')
      setCreatedFilePath(finalFilePath)
      setCreationStatus('success')
    } catch (error: any) {
      setCreationStatus('error')
      setCreationError(error?.message || 'The Tark report could not be created. No Word document was saved.')
    }
  }

  const handleOpenReport = async () => {
    if (!createdFilePath) return
    await window.electronAPI?.openPath?.(createdFilePath)
  }

  const handleShowInFolder = async () => {
    if (!createdFilePath) return
    await window.electronAPI?.showItemInFolder?.(createdFilePath)
  }

  const nextDisabled = step === 0
    ? !canContinueSetup
    : step === 2
      ? !canCreate
      : false

  const body = creationStatus === 'success' ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13, paddingTop: 10 }}>
      <div
        className="grid place-items-center"
        style={{
          width: 42,
          height: 42,
          borderRadius: 999,
          background: 'rgb(var(--color-accent-rgb) / 0.16)',
          color: 'var(--color-accent)',
        }}
      >
        <Check size={22} weight="bold" />
      </div>
      <div>
        <h2 style={{ margin: 0, color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 17, fontWeight: 800 }}>
          Tark report created
        </h2>
        <p style={{ margin: '7px 0 0', color: TARK_CONTROL_MUTED_COLOR, fontFamily: 'DM Sans, sans-serif', fontSize: 12, lineHeight: 1.45 }}>
          The Word document is ready at the selected save location.
        </p>
      </div>
      <InputBox muted>
        <TextInput value={createdFilePath} readOnly ariaLabel="Created report path" />
      </InputBox>
    </div>
  ) : step === 0 ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <Field label="Workspace">
          <SelectBox
            value={workspaceId}
            options={workspaceOptions}
            onChange={(value) => {
              setWorkspaceId(value)
              setModelId('')
            }}
            placeholder="Select workspace"
          />
        </Field>
        <Field label="Model">
          <SelectBox
            value={modelId}
            options={modelOptions}
            onChange={setModelId}
            placeholder={selectedWorkspace ? 'No report-ready model' : 'No report-ready workspace'}
          />
        </Field>
      </div>

      <Field label="Report title">
        <InputBox>
          <TextInput
            value={reportTitle}
            placeholder="Tark report title"
            ariaLabel="Report title"
            onChange={(value) => {
              setTitleTouched(true)
              setReportTitle(value)
            }}
          />
        </InputBox>
      </Field>

      {!canContinueSetup && (
        <div
          style={{
            border: '1px solid rgb(var(--color-warning-rgb) / 0.35)',
            borderRadius: 7,
            padding: '9px 10px',
            color: 'var(--color-warning)',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 12,
            lineHeight: 1.35,
          }}
        >
          {selectedReadiness && !selectedReadiness.ready
            ? `${missingCoreLabel(selectedReadiness)} missing`
            : 'PLS-SEM, Bootstrap, and PLSpredict results are required before this Tark report can be created.'}
        </div>
      )}

      <div
        style={{
          border: 'none',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--color-hover)',
        }}
      >
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex w-full items-center justify-between px-3"
          style={{
            height: 36,
            color: TARK_CONTROL_TEXT_COLOR,
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <span>Include advanced analyses</span>
          {advancedOpen ? <CaretDown size={14} /> : <CaretRight size={14} />}
        </button>
        {advancedOpen && (
          <div style={{ padding: '3px 8px 8px' }}>
            {advancedStates.map((option) => (
              <div
                key={option.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 34,
                }}
              >
                <CheckboxRow
                  checked={selectedAdvanced[option.id]}
                  onChange={(checked) => setSelectedAdvanced((previous) => ({ ...previous, [option.id]: checked }))}
                >
                  {option.label}
                </CheckboxRow>
                <StatusBadge saved={option.saved} />

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  ) : step === 1 ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <CheckboxRow checked={includePathDiagram} onChange={setIncludePathDiagram}>
        Include path diagram
      </CheckboxRow>

      <Field label="Structural paths">
        <SelectBox
          value={structuralPathMode}
          options={STRUCTURAL_PATH_OPTIONS.map((option) => ({ value: option, label: option }))}
          onChange={setStructuralPathMode}
        />
      </Field>
      <Field label="Indicator paths">
        <SelectBox
          value={indicatorPathMode}
          options={INDICATOR_PATH_OPTIONS.map((option) => ({ value: option, label: option }))}
          onChange={setIndicatorPathMode}
        />
      </Field>
      <Field label="Construct values">
        <SelectBox
          value={constructValueMode}
          options={CONSTRUCT_VALUE_OPTIONS.map((option) => ({ value: option, label: option }))}
          onChange={setConstructValueMode}
        />
      </Field>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="File name">
        <InputBox>
          <TextInput
            value={fileName}
            placeholder="Tark report file"
            ariaLabel="File name"
            onChange={(value) => {
              setFileNameTouched(true)
              setFileName(stripTarkDocxExtension(value))
            }}
          />
        </InputBox>
      </Field>

      <Field label="Save location">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
          <InputBox muted>
            <TextInput value={saveLocation} placeholder="Choose a folder" ariaLabel="Save location" readOnly />
          </InputBox>
          <button
            type="button"
            onClick={handleBrowse}
            className="grid place-items-center"
            title="Browse"
            aria-label="Browse save location"
            style={{
              width: 34,
              height: 34,
              borderRadius: 7,
              border: '1px solid var(--color-border)',
              background: 'var(--color-elevated)',
              color: TARK_CONTROL_TEXT_COLOR,
            }}
          >
            <FolderOpen size={15} weight="bold" />
          </button>
        </div>
      </Field>

      <div
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--color-elevated)',
        }}
      >
        <button
          type="button"
          onClick={() => setSummaryOpen((open) => !open)}
          className="flex w-full items-center justify-between px-3"
          style={{
            height: 36,
            color: TARK_CONTROL_TEXT_COLOR,
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <span>Report summary</span>
          {summaryOpen ? <CaretDown size={14} /> : <CaretRight size={14} />}
        </button>
        {summaryOpen && (
          <div style={{ borderTop: '1px solid var(--color-border)', padding: '9px 12px', display: 'grid', gap: 6 }}>
            {[
              ['Workspace', selectedWorkspace ? stripWorkspaceDisplayName(selectedWorkspace.name) : 'None'],
              ['Model', selectedModel ? stripModelDisplayName(selectedModel.name) : 'None'],
              ['Path diagram', includePathDiagram ? 'Included' : 'Not included'],
              ['Advanced analyses', selectedAdvancedLabels],
              ['Output format', 'Microsoft Word document (.docx)'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: TARK_CONTROL_MUTED_COLOR, fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>
                <span>{label}</span>
                <span style={{ color: TARK_CONTROL_TEXT_COLOR, textAlign: 'right' }}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {pendingAdvanced.length > 0 && (
        <div
          style={{
            border: '1px solid rgb(var(--color-warning-rgb) / 0.35)',
            borderRadius: 7,
            padding: '9px 10px',
            color: 'var(--color-warning)',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 12,
            lineHeight: 1.35,
          }}
        >
          Pending analyses: {pendingAdvanced.map((option) => option.label).join(', ')}
        </div>
      )}
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center backdrop-blur-sm"
      style={{ background: 'var(--color-overlay)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tark-report-title"
        className="w-[520px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-white/10 bg-[var(--color-elevated)]"
        style={{
          height: 410,
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <div
          style={{
            height: 40,
            backgroundColor: 'var(--color-surface)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--color-border)',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <FileText size={18} weight="fill" color="var(--color-accent)" />
            <span id="tark-report-title" style={{ fontSize: 13, fontWeight: 500, fontFamily: 'DM Sans, sans-serif', color: 'var(--color-text-secondary)' }}>
              Tark report
            </span>
          </div>

          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.7)]"
            onClick={onClose}
            aria-label="Close Tark"
            title="Close"
          >
            <X size={14} style={{ color: 'var(--color-text-muted-alt)' }} />
          </button>
        </div>

        <StepIndicator step={step} />

        <div
          className="min-h-0 flex-1"
          style={{
            overflowY: 'auto',
            padding: '16px 20px',
            background: 'var(--color-elevated)',
          }}
        >
          {body}
          {creationStatus === 'error' && creationError && (
            <div
              style={{
                marginTop: 12,
                border: '1px solid rgb(var(--color-danger-rgb) / 0.35)',
                borderRadius: 7,
                padding: '9px 10px',
                color: 'var(--color-danger)',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 12,
                lineHeight: 1.35,
              }}
            >
              {creationError}
            </div>
          )}
        </div>

        <div
          style={{
            minHeight: 65,
            flexShrink: 0,
            padding: '14px 20px',
            backgroundColor: 'var(--color-elevated)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--color-border)',
            gap: 12,
          }}
        >
          {creationStatus === 'success' ? (
            <>
              <button
                type="button"
                onClick={handleShowInFolder}
                style={{
                  height: 34,
                  padding: '0 13px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: TARK_CONTROL_TEXT_COLOR,
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Show in folder
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <button
                  type="button"
                  onClick={handleOpenReport}
                  style={{
                    height: 34,
                    padding: '0 14px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    background: 'transparent',
                    color: TARK_CONTROL_TEXT_COLOR,
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Open report
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    height: 34,
                    padding: '0 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--color-accent)',
                    color: 'var(--color-on-accent)',
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                style={{
                  height: 34,
                  padding: '0 13px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: TARK_CONTROL_TEXT_COLOR,
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Cancel
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep((current) => Math.max(0, current - 1))}
                    style={{
                      height: 34,
                      padding: '0 13px',
                      borderRadius: 8,
                      border: '1px solid var(--color-border)',
                      background: 'transparent',
                      color: TARK_CONTROL_TEXT_COLOR,
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  disabled={nextDisabled}
                  onClick={() => {
                    if (step < 2) {
                      setStep((current) => Math.min(2, current + 1))
                      return
                    }
                    void handleCreateReport()
                  }}
                  style={{
                    height: 34,
                    padding: '0 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--color-accent)',
                    color: 'var(--color-on-accent)',
                    opacity: nextDisabled ? 0.5 : 1,
                    boxShadow: nextDisabled ? 'none' : '0 8px 18px rgb(var(--color-accent-rgb) / 0.18)',
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  {step === 2 ? (creationStatus === 'creating' ? 'Creating...' : 'Create Tark report') : 'Next'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div
        ref={diagramExportContainerRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: -9999,
          top: -9999,
          width: 1200,
          height: 800,
          pointerEvents: 'none',
          opacity: 0,
          overflow: 'hidden',
        }}
      >
        {includePathDiagram && selectedModel?.state?.constructs?.length ? (
          <PathDiagram
            canvasConstructs={selectedModel.state.constructs}
            canvasPaths={selectedModel.state.paths}
            results={buildTarkDiagramResults(latestSavedAnalyses(selectedModel.id, selectedResults), selectedModel.state)}
            structuralMode={structuralPathMode}
            measurementMode={indicatorPathMode}
            constructMode={mapTarkConstructDiagramMode(constructValueMode)}
            interactive={false}
            resultsReadable={true}
            className="w-full h-full"
          />
        ) : null}
      </div>
    </div>
  )
}
