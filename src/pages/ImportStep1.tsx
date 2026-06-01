/**
 * ImportStep1 — Dataset import preview
 *
 * Receives from navigation state: { filePath, fileName, workspaceName }
 * Reads the file via window.electronAPI.readFile (Electron IPC),
 * parses it (CSV or Excel), and shows a head() preview of the data.
 * The "Import" button is disabled if parsing failed.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  FileCsv, FileXls, Info, ArrowRight, CaretDown, X, Warning,
} from '@phosphor-icons/react'
import { inferVariableTypesFromRows } from '../utils/datasetColumns'
import { persistDatasetToWorkspace } from '../utils/datasetPersistence'
import { writeDatasetViewCache } from '../utils/datasetViewCache'
import { addDiagnostic } from '../utils/diagnostics'
import type { Workspace } from '../types/workspace'

// ─── File icon / label by extension ──────────────────────────────────────────
function getFileInfo(fileName: string): { label: string; color: string; icon: JSX.Element } {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'csv':
      return { label: 'CSV File',   color: 'var(--color-accent)', icon: <FileCsv size={18} color="var(--color-accent)" weight="fill" /> }
    case 'xlsx':
    case 'xls':
      return { label: 'Excel File', color: '#32D583', icon: <FileXls size={18} color="#32D583" weight="fill" /> }
    default:
      return { label: 'Data File',  color: 'var(--color-accent)', icon: <FileCsv size={18} color="var(--color-accent)" weight="fill" /> }
  }
}

// ─── CSV delimiter auto-detection ─────────────────────────────────────────────
function detectDelimiter(firstLine: string): string {
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestCount = 0
  for (const c of candidates) {
    const count = firstLine.split(c).length - 1
    if (count > bestCount) { bestCount = count; best = c }
  }
  return best
}

const DELIMITER_LABELS: Record<string, string> = {
  ',':  'Comma (,)',
  ';':  'Semi-colon (;)',
  '\t': 'Tab',
  '|':  'Pipe (|)',
}

// ─── CSV parse result ─────────────────────────────────────────────────────────
interface ParseResult {
  headers:    string[]
  rows:       string[][]  // first HEAD_ROWS rows (for preview)
  allRows:    string[][]  // all data rows (for descriptive stats in Step 2)
  totalRows:  number      // total data rows (excluding header)
  missing:    number      // cells that are empty or "NA"
  delimiter:  string
}

const HEAD_ROWS = 5

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function stringifyExcelCellValue(value: any): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    return value.map((item) => stringifyExcelCellValue(item)).filter(Boolean).join(' ')
  }
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text
    if (Array.isArray(value.richText)) {
      return value.richText.map((item: any) => String(item?.text ?? '')).join('')
    }
    if (value.result !== undefined && value.result !== null) {
      return stringifyExcelCellValue(value.result)
    }
    if (typeof value.hyperlink === 'string' && typeof value.text === 'string') {
      return value.text
    }
    return String(value)
  }
  return String(value)
}

function truncateDatasetName(name: string): string {
  return name.length > 20 ? `${name.slice(0, 17)}...` : name
}

function getWorkspaceDisplayName(name: string): string {
  return name.replace(/\.(ada|metis)$/i, '')
}

function countWorkspaceDatasets(workspace: Workspace | null | undefined): number {
  return workspace?.children.filter((child) => child.type === 'dataset').length ?? 0
}

type ImportStep1Props = {
  workspaces: Workspace[]
  activeWorkspaceId: string
}

// ─── Pure CSV parser (handles quoted fields) ──────────────────────────────────
function parseCSVText(text: string, delimiter: string): ParseResult {
  // Normalise line endings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())

  function splitLine(line: string): string[] {
    const result: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === delimiter && !inQuote) {
        result.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    result.push(cur.trim())
    return result
  }

  const headers  = splitLine(lines[0])
  const allRows  = lines.slice(1).map(splitLine)
  const headRows = allRows.slice(0, HEAD_ROWS)

  // Count missing (empty cell or "NA" / "N/A" / "." / "na")
  const missingTokens = new Set(['', 'na', 'n/a', '.', 'null', 'none', 'nan'])
  let missing = 0
  allRows.forEach(row => row.forEach(cell => {
    if (missingTokens.has(cell.toLowerCase())) missing++
  }))

  return { headers, rows: headRows, allRows, totalRows: allRows.length, missing, delimiter }
}

// ─── Excel parse (uses exceljs library) ───────────────────────────────────────
async function parseExcelBase64(base64: string): Promise<ParseResult> {
  // Dynamic import so the rest of the app doesn't bundle Excel parsing unless needed.
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const bytes = decodeBase64ToUint8Array(base64)
  await workbook.xlsx.load(bytes.buffer as ArrayBuffer)

  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('Sheet appears empty')

  const data: string[][] = []
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : []
    data[rowNumber - 1] = values.map((cell) => stringifyExcelCellValue(cell))
  })

  if (data.length < 2) throw new Error('Sheet appears empty')

  const headers     = data[0].map(String)
  const allRowsRaw  = data.slice(1)
  const allRows     = allRowsRaw.map(r => r.map(String))
  const headRows    = allRows.slice(0, HEAD_ROWS)

  const missingTokens = new Set(['', 'na', 'n/a', '.', 'null', 'none', 'nan'])
  let missing = 0
  allRows.forEach(row => row.forEach((cell: string) => {
    if (missingTokens.has(cell.toLowerCase())) missing++
  }))

  return { headers, rows: headRows, allRows, totalRows: allRows.length, missing, delimiter: '' }
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────
function SelectField({
  label, value, options, onChange,
}: {
  label: string; value: string; options: string[]; onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col" style={{ gap: 6, flex: 1 }}>
      <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between"
          style={{ height: 34, backgroundColor: 'var(--color-page)', borderRadius: 7, border: '1px solid var(--color-border)', padding: '0 12px' }}
        >
          <span style={{ color: 'var(--color-text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 12 }}>{value}</span>
          <CaretDown size={12} color="var(--color-text-secondary)" />
        </button>
        {open && (
          <div
            className="absolute z-20 left-0 right-0"
            style={{ top: 38, backgroundColor: 'var(--color-elevated)', borderRadius: 7, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-modal-popover)', padding: '4px 0' }}
          >
            {options.map(o => (
              <button
                key={o}
                onClick={() => { onChange(o); setOpen(false) }}
                className="w-full flex items-center hover:bg-[rgb(var(--color-hover-rgb)/0.75)] transition-colors text-left"
                style={{ height: 32, padding: '0 12px' }}
              >
                <span style={{ color: o === value ? 'var(--color-accent)' : 'var(--color-text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 12 }}>{o}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function WorkspaceSelectField({
  value,
  options,
  onChange,
}: {
  value: string
  options: Workspace[]
  onChange: (workspaceId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedWorkspace = options.find((workspace) => workspace.id === value) ?? null
  const selectedLabel = selectedWorkspace ? getWorkspaceDisplayName(selectedWorkspace.name) : '(No workspace)'
  const hasOptions = options.length > 0

  return (
    <div className="flex flex-col flex-1" style={{ gap: 6 }}>
      <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Workspace
      </span>
      <div className="relative">
        <button
          onClick={() => hasOptions && setOpen(o => !o)}
          disabled={!hasOptions}
          className="w-full flex items-center justify-between"
          style={{ height: 34, backgroundColor: 'var(--color-page)', borderRadius: 7, border: '1px solid var(--color-border)', padding: '0 12px', cursor: hasOptions ? 'pointer' : 'not-allowed', opacity: hasOptions ? 1 : 0.65 }}
        >
          <span style={{ color: 'var(--color-text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedLabel}
          </span>
          <CaretDown size={12} color="var(--color-text-secondary)" />
        </button>
        {open && hasOptions && (
          <div
            className="absolute z-20 left-0 right-0"
            style={{ top: 38, backgroundColor: 'var(--color-elevated)', borderRadius: 7, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-modal-popover)', padding: '4px 0', maxHeight: 196, overflowY: 'auto' }}
          >
            {options.map((workspace) => {
              const datasetCount = countWorkspaceDatasets(workspace)
              return (
                <button
                  key={workspace.id}
                  onClick={() => { onChange(workspace.id); setOpen(false) }}
                  className="w-full flex items-center justify-between hover:bg-[rgb(var(--color-hover-rgb)/0.75)] transition-colors text-left"
                  style={{ minHeight: 34, padding: '6px 12px', gap: 10 }}
                >
                  <span style={{ color: workspace.id === value ? 'var(--color-accent)' : 'var(--color-text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getWorkspaceDisplayName(workspace.name)}
                  </span>
                  <span style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif', fontSize: 10, whiteSpace: 'nowrap' }}>
                    {datasetCount} dataset{datasetCount === 1 ? '' : 's'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function ImportStep1({ workspaces, activeWorkspaceId }: ImportStep1Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as {
    filePath?:      string
    fileName?:      string
    workspaceName?: string
    workspacePath?: string
    workspaceId?:   string
    returnTo?:      string
    datasetId?:     string
    source?:        'workspace-home' | 'model-canvas'
    modelId?:       string
    saveMode?:      'replace' | 'save-as-new'
    fileContent?:   string  // pre-loaded base64 (fallback when electronAPI.readFile unavailable)
  }) ?? {}

  const filePath      = state.filePath      ?? ''
  const fileName      = state.fileName      ?? ''
  const workspaceName = state.workspaceName ?? ''
  const workspacePath = state.workspacePath ?? ''
  const workspaceId   = state.workspaceId   ?? ''
  const returnTo      = state.returnTo      ?? ''
  const datasetId     = state.datasetId     ?? ''
  const source        = state.source
  const modelId       = state.modelId       ?? ''
  const saveMode      = state.saveMode      ?? 'save-as-new'
  const fileContent   = state.fileContent   ?? ''  // non-empty → skip IPC readFile

  const workspaceOptions = useMemo(() => {
    const options = [...workspaces]
    const hasStateWorkspace = workspaceId && options.some((workspace) => workspace.id === workspaceId)
    if (!hasStateWorkspace && workspaceId && (workspaceName || workspacePath)) {
      options.unshift({
        id: workspaceId,
        name: workspaceName || 'Workspace.ada',
        color: 'var(--color-accent)',
        expanded: true,
        path: workspacePath,
        children: [],
      })
    }
    return options
  }, [workspaceId, workspaceName, workspacePath, workspaces])

  const preferredWorkspaceId = useMemo(() => {
    if (workspaceId && workspaceOptions.some((workspace) => workspace.id === workspaceId)) return workspaceId

    const normalizedWorkspacePath = workspacePath.replace(/\\/g, '/')
    const matchingWorkspace = workspaceOptions.find((workspace) => (
      (normalizedWorkspacePath && (workspace.path ?? '').replace(/\\/g, '/') === normalizedWorkspacePath)
      || (workspaceName && workspace.name === workspaceName)
    ))
    if (matchingWorkspace) return matchingWorkspace.id

    if (activeWorkspaceId && workspaceOptions.some((workspace) => workspace.id === activeWorkspaceId)) {
      return activeWorkspaceId
    }

    return workspaceOptions[0]?.id ?? ''
  }, [activeWorkspaceId, workspaceId, workspaceName, workspacePath, workspaceOptions])

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(() => preferredWorkspaceId)

  useEffect(() => {
    setSelectedWorkspaceId((current) => {
      if (current && workspaceOptions.some((workspace) => workspace.id === current)) return current
      return preferredWorkspaceId
    })
  }, [preferredWorkspaceId, workspaceOptions])

  const selectedWorkspace = useMemo(
    () => workspaceOptions.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaceOptions],
  )
  const targetWorkspaceId = selectedWorkspace?.id ?? ''
  const targetWorkspaceName = selectedWorkspace?.name ?? ''
  const targetWorkspacePath = selectedWorkspace?.path ?? ''
  const targetSource = source === 'model-canvas' && workspaceId && targetWorkspaceId !== workspaceId
    ? 'workspace-home'
    : source
  const workspaceFull = saveMode === 'save-as-new' && countWorkspaceDatasets(selectedWorkspace) >= 3
  const workspaceMissing = !targetWorkspaceId || !targetWorkspacePath

  const { label: fileLabel, icon: fileIcon } = getFileInfo(fileName)
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const isCSV = ext === 'csv'

  // ── Parse state ────────────────────────────────────────────────────────────
  type Status = 'idle' | 'loading' | 'ok' | 'error'
  const [status,      setStatus]      = useState<Status>('idle')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [parseError,  setParseError]  = useState<string>('')
  const [delimiter,   setDelimiter]   = useState(',')
  const [encoding,    setEncoding]    = useState('UTF-8')
  const [isShaking,   setIsShaking]   = useState(false)
  const [saving,      setSaving]      = useState(false)

  // ── Read + parse the file ──────────────────────────────────────────────────
  const parseFile = useCallback(async (delim?: string) => {
    if (!filePath && !fileContent) {
      setStatus('error')
      setParseError('No file provided — navigate here from the Import Dataset menu.')
      return
    }
    setStatus('loading')
    try {
      let base64: string

      if (fileContent) {
        // Fallback path: file was pre-read by the browser <input> picker in App.tsx
        base64 = fileContent
      } else {
        // Electron IPC path: ask main process to read the file by path
        const result = await (window as any).electronAPI?.readFile?.(filePath)
        if (!result?.success) throw new Error(result?.error ?? 'Could not read file via Electron IPC')
        base64 = result.data
      }

      if (ext === 'xlsx' || ext === 'xls') {
        const parsed = await parseExcelBase64(base64)
        setParseResult(parsed)
        setStatus('ok')
      } else if (isCSV) {
        // Decode base64 → text
        const byteStr = atob(base64)
        const bytes   = new Uint8Array(byteStr.length)
        for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i)
        const text = new TextDecoder(encoding.toLowerCase().replace(/[^a-z0-9]/g, '-')).decode(bytes)

        const autoDelim = delim ?? detectDelimiter(text.split('\n')[0] ?? '')
        setDelimiter(autoDelim)
        const parsed = parseCSVText(text, autoDelim)
        setParseResult(parsed)
        setStatus('ok')
      } else {
        // Unsupported format
        setStatus('error')
        setParseError(`The .${ext} format is not yet supported. Please use CSV or Excel.`)
      }
    } catch (err: any) {
      setStatus('error')
      setParseError(err?.message ?? 'Unknown error while parsing file.')
    }
  }, [filePath, fileContent, ext, isCSV, encoding])

  // Parse on mount
  useEffect(() => { parseFile() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-parse when delimiter changes (CSV only)
  const handleDelimiterChange = (label: string) => {
    const delim = Object.entries(DELIMITER_LABELS).find(([, l]) => l === label)?.[0] ?? ','
    setDelimiter(delim)
    parseFile(delim)
  }

  // Shake animation when clicking outside the modal
  const triggerShake = () => {
    setIsShaking(true)
    setTimeout(() => setIsShaking(false), 400)
  }

  const canImport = status === 'ok' && parseResult !== null && !saving && !workspaceMissing && !workspaceFull

  const closePanel = () => {
    if (returnTo) {
      navigate(returnTo, { replace: true })
      return
    }
    navigate(-1)
  }

  const finishImport = useCallback(async () => {
    if (!parseResult || saving) return

    if (workspaceMissing) {
      setStatus('error')
      setParseError('Choose a workspace before importing this dataset.')
      return
    }

    if (workspaceFull) {
      setStatus('error')
      setParseError('This workspace already has 3 datasets. Choose another workspace or delete a dataset first.')
      return
    }

    const resolvedDatasetId = saveMode === 'replace' && datasetId ? datasetId : `ds-${Date.now()}`
    const variableTypes = inferVariableTypesFromRows(parseResult.headers, parseResult.allRows)

    setSaving(true)
    try {
      const persisted = await persistDatasetToWorkspace({
        workspacePath: targetWorkspacePath,
        datasetId: resolvedDatasetId,
        fileName,
        originalFilePath: filePath,
        fileContent,
        headers: parseResult.headers,
        allRows: parseResult.allRows,
      })

      const finalPath = persisted.internalName || fileName || 'dataset.csv'
      const normalizedWorkspacePath = targetWorkspacePath.replace(/\\/g, '/')
      const absoluteDatasetPath = persisted.datasetTempPath
        || (normalizedWorkspacePath && !normalizedWorkspacePath.toLowerCase().endsWith('.ada')
          ? `${normalizedWorkspacePath}/${finalPath}`
          : finalPath)

      writeDatasetViewCache(resolvedDatasetId, {
        datasetId: resolvedDatasetId,
        filePath: finalPath,
        fileName,
        workspaceId: targetWorkspaceId,
        workspaceName: targetWorkspaceName,
        workspacePath: targetWorkspacePath,
        headers: parseResult.headers,
        allRows: parseResult.allRows,
        totalRows: parseResult.totalRows,
        missing: parseResult.missing,
        absolutePath: absoluteDatasetPath,
        datasetTempPath: persisted.datasetTempPath || '',
      })

      window.dispatchEvent(new CustomEvent('pls:dataset-imported', {
        detail: {
          datasetId: resolvedDatasetId,
          filePath: finalPath,
          fileName,
          workspaceId: targetWorkspaceId,
          workspaceName: targetWorkspaceName,
          headers: parseResult.headers,
          variableTypes,
          totalRows: parseResult.totalRows,
          missing: parseResult.missing,
          absolutePath: absoluteDatasetPath,
          datasetTempPath: persisted.datasetTempPath || '',
          source: targetSource,
          modelId: targetSource === 'model-canvas' ? modelId : undefined,
          saveMode,
          setAsDefault: targetSource !== 'model-canvas',
        },
      }))

      addDiagnostic({
        category: 'dataset',
        message: 'Dataset imported and opened in DataView.',
        details: {
          datasetId: resolvedDatasetId,
          workspaceId: targetWorkspaceId,
          fileName,
          totalRows: parseResult.totalRows,
          headers: parseResult.headers.length,
        },
      })

      window.setTimeout(() => {
        navigate(`/dataview/${targetWorkspaceId}/${resolvedDatasetId}`, {
          replace: true,
          state: {
            source: targetSource ?? 'workspace-home',
            modelId: targetSource === 'model-canvas' ? modelId : undefined,
            returnTo: returnTo || '/',
          },
        })
      }, 100)
    } catch (err: any) {
      setStatus('error')
      setParseError(err?.message || 'Could not import this dataset.')
      setSaving(false)
      addDiagnostic({
        category: 'dataset',
        level: 'error',
        message: 'ImportStep1 failed while persisting the dataset.',
        details: {
          datasetId: resolvedDatasetId,
          workspaceId: targetWorkspaceId,
          fileName,
          error: err,
        },
      })
    }
  }, [
    datasetId,
    fileContent,
    fileName,
    filePath,
    modelId,
    navigate,
    parseResult,
    returnTo,
    saveMode,
    saving,
    source,
    targetSource,
    targetWorkspaceId,
    targetWorkspaceName,
    targetWorkspacePath,
    workspaceFull,
    workspaceMissing,
  ])

  return (
    <div
      className="h-full flex items-center justify-center p-5"
      style={{ backgroundColor: 'var(--color-page)' }}
      onClick={triggerShake}
    >
      <style>{`
        @keyframes modal-shake {
          0%, 100% { transform: scale(1); }
          25%       { transform: scale(1.004); }
          75%       { transform: scale(0.997); }
        }
        .modal-shake { animation: modal-shake 0.3s ease-in-out; }
      `}</style>

      {/* Dialog card */}
      <div
        className={`flex flex-col w-full ${isShaking ? 'modal-shake' : ''}`}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 820,
          maxHeight: 'calc(100vh - 88px)',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 16,
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
        }}
      >
        {/* ── Title bar ──────────────────────────────────────────────── */}
        <div
          className="flex items-center shrink-0"
          style={{ height: 52, padding: '0 24px', borderBottom: '1px solid var(--color-border)', gap: 10 }}
        >
          {fileIcon}
          <span style={{ color: 'var(--color-text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 700 }}>
            Import {fileLabel}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={closePanel} className="hover:bg-[rgb(var(--color-hover-rgb)/0.75)] rounded-md p-1.5 transition-colors">
            <X size={15} color="var(--color-text-secondary)" />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div className="flex flex-col overflow-y-auto" style={{ padding: 24, gap: 20, flex: 1 }}>

          {/* Row 1: Workspace + File Name */}
          <div className="flex" style={{ gap: 16 }}>
            <WorkspaceSelectField
              value={selectedWorkspaceId}
              options={workspaceOptions}
              onChange={setSelectedWorkspaceId}
            />
            <div className="flex flex-col flex-1" style={{ gap: 6 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                File Name
              </span>
              <div
                className="flex items-center"
                style={{ height: 34, backgroundColor: 'var(--color-page)', borderRadius: 7, border: '1px solid var(--color-border)', padding: '0 12px' }}
              >
                <span style={{ color: 'var(--color-text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fileName ? truncateDatasetName(fileName) : '—'}
                </span>
              </div>
            </div>
          </div>

          {(workspaceMissing || workspaceFull) && status !== 'error' && (
            <div
              className="flex items-start"
              style={{ gap: 8, padding: '10px 12px', borderRadius: 8, backgroundColor: 'rgba(232,176,79,0.08)', border: '1px solid rgba(232,176,79,0.18)' }}
            >
              <Warning size={14} color="#E8B04F" weight="fill" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: '#D1A767', fontFamily: 'Inter, sans-serif', fontSize: 11 }}>
                {workspaceFull
                  ? 'This workspace already has 3 datasets. Choose another workspace or delete one first.'
                  : 'Choose a workspace to enable import.'}
              </span>
            </div>
          )}

          {/* Row 2: Parsing options (CSV only) */}
          {isCSV && (
            <div>
              <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 10 }}>
                Parsing Options
              </span>
              <div className="flex" style={{ gap: 12 }}>
                <SelectField
                  label="Delimiter"
                  value={DELIMITER_LABELS[delimiter] ?? 'Comma (,)'}
                  options={Object.values(DELIMITER_LABELS)}
                  onChange={handleDelimiterChange}
                />
                <SelectField
                  label="Encoding"
                  value={encoding}
                  options={['UTF-8', 'UTF-16', 'ISO-8859-1', 'Windows-1252']}
                  onChange={v => { setEncoding(v); parseFile(delimiter) }}
                />
              </div>
            </div>
          )}

          {/* Stats bar */}
          {status === 'ok' && parseResult && (
            <div
              className="flex items-center"
              style={{ minHeight: 44, backgroundColor: 'var(--color-page)', borderRadius: 8, border: '1px solid var(--color-border)', padding: '8px 12px', gap: 10, flexWrap: 'wrap' }}
            >
              <div className="flex items-center" style={{ gap: 6, padding: '4px 10px', borderRadius: 6, backgroundColor: 'var(--color-input)' }}>
                <span style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif', fontSize: 12 }}>Cases</span>
                <span style={{ color: 'var(--color-accent)', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700 }}>
                  {parseResult.totalRows.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center" style={{ gap: 6, padding: '4px 10px', borderRadius: 6, backgroundColor: 'var(--color-input)' }}>
                <span style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif', fontSize: 12 }}>Variables</span>
                <span style={{ color: 'var(--color-accent)', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700 }}>
                  {parseResult.headers.length}
                </span>
              </div>
              <div className="flex items-center" style={{ gap: 6, padding: '4px 10px', borderRadius: 6, backgroundColor: 'var(--color-input)' }}>
                <span style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif', fontSize: 12 }}>Missing</span>
                <span style={{
                  color: parseResult.missing > 0 ? 'var(--color-danger)' : '#32D583',
                  fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700,
                }}>
                  {parseResult.missing.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {status === 'loading' && (
            <div className="flex items-center justify-center" style={{ height: 120, gap: 10 }}>
              <div
                style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: '2px solid var(--color-border)', borderTopColor: 'var(--color-accent)',
                  animation: 'spin 0.7s linear infinite',
                }}
              />
              <span style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif', fontSize: 12 }}>
                Parsing file…
              </span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Error state */}
          {status === 'error' && (
            <div
              className="flex items-start"
              style={{ gap: 10, padding: '14px 16px', borderRadius: 10, backgroundColor: 'rgba(232,90,79,0.07)', border: '1px solid rgba(232,90,79,0.2)' }}
            >
              <Warning size={16} color="var(--color-danger)" weight="fill" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ color: 'var(--color-danger)', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600 }}>
                  Failed to parse file
                </span>
                <span style={{ color: '#B07070', fontFamily: 'Inter, sans-serif', fontSize: 11 }}>
                  {parseError}
                </span>
              </div>
            </div>
          )}

          {/* Data preview table — head() rows */}
          {status === 'ok' && parseResult && parseResult.rows.length > 0 && (
            <div>
              <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 10 }}>
                Data Preview{' '}
                <span style={{ color: 'var(--color-border)', fontWeight: 400 }}>
                  — first {parseResult.rows.length} of {parseResult.totalRows.toLocaleString()} rows
                </span>
              </span>
              <div
                style={{ backgroundColor: 'var(--color-page)', borderRadius: 10, border: '1px solid var(--color-border)', overflow: 'hidden' }}
              >
                {/* Scrollable wrapper */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--color-input)', borderBottom: '1px solid var(--color-border)' }}>
                        {/* Row number column */}
                        <th style={{ width: 40, padding: '8px 12px', textAlign: 'right' }}>
                          <span style={{ color: 'var(--color-border)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600 }}>#</span>
                        </th>
                        {parseResult.headers.map((h, i) => (
                          <th
                            key={i}
                            style={{ padding: '8px 14px', textAlign: 'left', whiteSpace: 'nowrap' }}
                          >
                            <span style={{ color: 'var(--color-accent)', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700 }}>{h}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.rows.map((row, ri) => (
                        <tr
                          key={ri}
                          style={{ backgroundColor: ri % 2 === 0 ? 'transparent' : 'rgb(var(--color-hover-rgb) / 0.35)', borderBottom: ri < parseResult.rows.length - 1 ? '1px solid var(--color-elevated)' : 'none' }}
                        >
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <span style={{ color: 'var(--color-border)', fontFamily: 'Inter, sans-serif', fontSize: 11 }}>{ri + 1}</span>
                          </td>
                          {row.map((cell, ci) => {
                            const isEmpty = !cell || ['na', 'n/a', '.', 'null', 'none', 'nan'].includes(cell.toLowerCase())
                            return (
                              <td key={ci} style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                                <span style={{
                                  color: isEmpty ? 'var(--color-text-dim)' : '#D0D0D0',
                                  fontFamily: 'Inter, sans-serif', fontSize: 12,
                                  fontStyle: isEmpty ? 'italic' : 'normal',
                                }}>
                                  {isEmpty ? '—' : cell}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div
                  className="flex items-center"
                  style={{ height: 34, backgroundColor: 'var(--color-input)', padding: '0 16px', borderTop: '1px solid var(--color-border)' }}
                >
                  <span style={{ color: '#5A5A5A', fontFamily: 'Inter, sans-serif', fontSize: 11 }}>
                    {parseResult.headers.length} variables detected
                    {parseResult.missing > 0
                      ? ` · ${parseResult.missing.toLocaleString()} missing values`
                      : ' · no missing values'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Info note */}
          <div
            className="flex items-center"
            style={{ height: 34, backgroundColor: 'rgba(170,17,85,0.06)', borderRadius: 7, padding: '0 12px', gap: 8, border: '1px solid rgba(170,17,85,0.12)' }}
          >
            <Info size={13} color="var(--color-accent)" />
            <span style={{ color: 'var(--color-accent)', fontFamily: 'Inter, sans-serif', fontSize: 11 }}>
              Define a missing value marker if your file uses a custom symbol for missing values
            </span>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-end shrink-0"
          style={{ height: 60, padding: '0 24px', borderTop: '1px solid var(--color-border)', gap: 10 }}
        >
          <button
            onClick={closePanel}
            className="flex items-center justify-center transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.75)]"
            style={{ height: 38, padding: '0 22px', borderRadius: 8, border: '1px solid var(--color-border)' }}
          >
            <span style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>Cancel</span>
          </button>

          <button
            onClick={finishImport}
            disabled={!canImport}
            className="flex items-center transition-colors"
            style={{
              height: 38, padding: '0 22px', borderRadius: 8, gap: 8,
              backgroundColor: canImport ? 'var(--color-accent)' : '#232A33',
              cursor: canImport ? 'pointer' : 'not-allowed',
              opacity: canImport ? 1 : 0.5,
            }}
          >
            <span style={{ color: canImport ? 'var(--color-on-accent)' : '#7A8795', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700 }}>
              {saving ? 'Opening...' : workspaceMissing ? 'Select Workspace' : workspaceFull ? 'Workspace Full' : 'Open Dataset'}
            </span>
            <ArrowRight size={14} color={canImport ? 'var(--color-on-accent)' : '#7A8795'} />
          </button>
        </div>
      </div>
    </div>
  )
}
