import { startTransition, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CaretRight,
  FloppyDisk,
  Plus,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { dispatchToast } from '../components/Toast'
import {
  getUniqueHeaderName,
  prepareDatasetForPersistence,
} from '../utils/datasetColumns'
import { computeDerivedColumn, type ComputeOperation } from '../utils/dataViewCompute'
import { loadDatasetSnapshot } from '../utils/datasetLoading'
import { persistDatasetToWorkspace } from '../utils/datasetPersistence'
import {
  writeDatasetViewCache,
} from '../utils/datasetViewCache'
import { getWorkspaceDatasets, migrateWorkspace } from '../utils/datasetWorkspace'
import type { Workspace } from '../types/workspace'
import { addDiagnostic } from '../utils/diagnostics'

interface DataViewProps {
  workspaces: Workspace[]
}

type SelectionScope = 'rows' | 'columns' | 'none'
type ContextMenuKind = 'row' | 'column'
type ContextMenuPanel = 'base' | 'compute'

type DataViewContextMenu = {
  kind: ContextMenuKind
  x: number
  y: number
  targetIndex: number
  panel: ContextMenuPanel
}

type ColumnDragSelection = {
  anchorIndex: number
  baseSelection: number[]
  additive: boolean
}

const COMPUTE_ACTIONS: ComputeOperation[] = ['sum', 'mean', 'mode', 'median', 'max', 'min']
const MIN_COLUMN_WIDTH = 72
const MAX_COLUMN_WIDTH = 400
const DEFAULT_ROW_HEIGHT = 38
const HEADER_HEIGHT = 44
const INDEX_WIDTH = 64
const OVERSCAN_ROWS = 12
const CONTEXT_MENU_WIDTH = 188

function normalizeName(name: string): string {
  return name.replace(/\.(csv|xlsx|xls)$/i, '')
}

function buildRange(start: number, end: number): number[] {
  const from = Math.min(start, end)
  const to = Math.max(start, end)
  return Array.from({ length: to - from + 1 }, (_, offset) => from + offset)
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

function sameIndexList(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function shiftSizeMapOnInsert(map: Record<number, number>, insertIndex: number): Record<number, number> {
  const next: Record<number, number> = {}
  for (const [key, value] of Object.entries(map)) {
    const index = Number(key)
    next[index >= insertIndex ? index + 1 : index] = value
  }
  return next
}

function shiftSizeMapOnDelete(map: Record<number, number>, removedIndices: number[]): Record<number, number> {
  if (!removedIndices.length) return map
  const removedSet = new Set(removedIndices)
  const removedSorted = [...removedSet].sort((a, b) => a - b)
  const next: Record<number, number> = {}
  for (const [key, value] of Object.entries(map)) {
    const index = Number(key)
    if (removedSet.has(index)) continue
    const shift = removedSorted.filter((removedIndex) => removedIndex < index).length
    next[index - shift] = value
  }
  return next
}

function clampMenuPosition(x: number, y: number, width: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x, y }
  return {
    x: Math.min(x, window.innerWidth - width - 12),
    y: Math.min(y, window.innerHeight - 220),
  }
}

function findRowIndexForOffset(offsets: number[], heights: number[], target: number): number {
  if (!offsets.length) return 0
  let low = 0
  let high = offsets.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const start = offsets[mid]
    const end = start + heights[mid]
    if (target < start) {
      high = mid - 1
    } else if (target >= end) {
      low = mid + 1
    } else {
      return mid
    }
  }

  return Math.max(0, Math.min(offsets.length - 1, low))
}

function labelOperation(operation: ComputeOperation): string {
  switch (operation) {
    case 'sum':
      return 'Sum'
    case 'mean':
      return 'Mean'
    case 'mode':
      return 'Mode'
    case 'median':
      return 'Median'
    case 'max':
      return 'Max'
    case 'min':
      return 'Min'
    default:
      return 'Compute'
  }
}

export default function DataView({ workspaces }: DataViewProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspaceId = '', datasetId = '' } = useParams()
  const routeState = (location.state as {
    source?: 'workspace-home' | 'model-canvas'
    modelId?: string
    returnTo?: string
  } | null) ?? {}

  const workspace = useMemo(() => {
    const match = workspaces.find((item) => item.id === workspaceId)
    return match ? migrateWorkspace(match) : null
  }, [workspaces, workspaceId])

  const dataset = useMemo(() => {
    if (!workspace) return null
    return getWorkspaceDatasets(workspace).find((item) => item.id === datasetId) ?? null
  }, [workspace, datasetId])

  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState<number[]>([])
  const [selectedRows, setSelectedRows] = useState<number[]>([])
  const [selectionScope, setSelectionScope] = useState<SelectionScope>('none')
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; columnIndex: number } | null>(null)
  const [editingHeaderIndex, setEditingHeaderIndex] = useState<number | null>(null)
  const [highlightedHeaderIndex, setHighlightedHeaderIndex] = useState<number | null>(null)
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({})
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({})
  const [contextMenu, setContextMenu] = useState<DataViewContextMenu | null>(null)
  const [showUnsavedExitModal, setShowUnsavedExitModal] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const dragStateRef = useRef<null | { kind: 'column' | 'row'; index: number; startClient: number; startSize: number }>(null)
  const columnDragSelectionRef = useRef<ColumnDragSelection | null>(null)
  const lastSelectedColumnRef = useRef<number | null>(null)
  const lastSelectedRowRef = useRef<number | null>(null)
  const gridScrollRef = useRef<HTMLDivElement | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const pendingScrollTopRef = useRef(0)

  const datasetFileName = dataset?.originalFileName || dataset?.filePath || dataset?.name || 'dataset.csv'
  const returnTo = routeState.returnTo || (routeState.source === 'model-canvas' && routeState.modelId
    ? `/canvas/${routeState.modelId}`
    : '/')

  useEffect(() => {
    let cancelled = false

    const loadDataset = async () => {
      if (!workspace || !dataset) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const parsed = await loadDatasetSnapshot({
          datasetId: dataset.id,
          fileName: datasetFileName,
          filePath: dataset.filePath,
          datasetTempPath: dataset.datasetTempPath,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          workspacePath: workspace.path || '',
        })
        if (!parsed) {
          throw new Error('Could not load this dataset into the data view.')
        }
        if (cancelled) return

        setHeaders(parsed.headers)
        setRows(parsed.allRows)
        setColumnWidths({})
        setRowHeights({})
        setSelectedColumns([])
        setSelectedRows([])
        setSelectionScope('none')
        setEditingCell(null)
        setEditingHeaderIndex(null)
        setHighlightedHeaderIndex(null)
        setContextMenu(null)
        setHasChanges(false)
        setScrollTop(0)
        pendingScrollTopRef.current = 0
        writeDatasetViewCache(dataset.id, parsed)
        addDiagnostic({
          category: 'dataset',
          message: 'Loaded dataset into DataView.',
          details: {
            datasetId: dataset.id,
            workspaceId: workspace.id,
            fileName: parsed.fileName,
            totalRows: parsed.totalRows,
            headers: parsed.headers.length,
          },
        })
      } catch (err: any) {
        if (!cancelled) {
          addDiagnostic({
            category: 'dataset',
            level: 'error',
            message: 'DataView failed to load the selected dataset.',
            details: {
              datasetId: dataset?.id,
              workspaceId: workspace?.id,
              error: err,
            },
          })
          dispatchToast('error', 'Dataset unavailable', err?.message || 'Could not load this dataset into the data view.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDataset()
    return () => {
      cancelled = true
    }
  }, [dataset, datasetFileName, workspace])

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current
      if (!dragState) return

      if (dragState.kind === 'column') {
        const nextWidth = Math.max(96, dragState.startSize + (event.clientX - dragState.startClient))
        setColumnWidths((prev) => ({ ...prev, [dragState.index]: nextWidth }))
      } else {
        const nextHeight = Math.max(28, dragState.startSize + (event.clientY - dragState.startClient))
        setRowHeights((prev) => ({ ...prev, [dragState.index]: nextHeight }))
      }
    }

    const handleUp = () => {
      dragStateRef.current = null
      columnDragSelectionRef.current = null
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [])

  useEffect(() => {
    const handleDismiss = () => setContextMenu(null)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
        columnDragSelectionRef.current = null
      }
    }
    window.addEventListener('click', handleDismiss)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('click', handleDismiss)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    const element = gridScrollRef.current
    if (!element) return

    const updateViewport = () => setViewportHeight(element.clientHeight)
    updateViewport()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateViewport)
    observer.observe(element)
    return () => observer.disconnect()
  }, [headers.length, rows.length, loading])

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(scrollFrameRef.current)
      }
    }
  }, [])

  const selectedColumnSet = useMemo(() => new Set(selectedColumns), [selectedColumns])
  const selectedRowSet = useMemo(() => new Set(selectedRows), [selectedRows])
  const autoColumnWidths = useMemo(() => {
    if (!headers.length) return []
    if (typeof document === 'undefined') {
      return headers.map(() => MIN_COLUMN_WIDTH)
    }

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) {
      return headers.map(() => MIN_COLUMN_WIDTH)
    }

    return headers.map((header, columnIndex) => {
      let width = MIN_COLUMN_WIDTH

      context.font = '700 12px "DM Sans", sans-serif'
      width = Math.max(width, Math.ceil(context.measureText(header || `Column ${columnIndex + 1}`).width + 16))

      context.font = '12px "DM Sans", sans-serif'
      for (const row of rows) {
        const value = row[columnIndex] ?? ''
        if (!value) continue
        width = Math.max(width, Math.ceil(context.measureText(value).width + 16))
        if (width >= MAX_COLUMN_WIDTH) return MAX_COLUMN_WIDTH
      }

      return Math.min(MAX_COLUMN_WIDTH, width)
    })
  }, [headers, rows])
  const resolvedColumnWidths = useMemo(
    () => headers.map((_, index) => columnWidths[index] || autoColumnWidths[index] || MIN_COLUMN_WIDTH),
    [autoColumnWidths, columnWidths, headers],
  )
  const resolvedRowHeights = useMemo(
    () => rows.map((_, index) => rowHeights[index] || DEFAULT_ROW_HEIGHT),
    [rowHeights, rows],
  )
  const totalTableWidth = useMemo(
    () => INDEX_WIDTH + resolvedColumnWidths.reduce((sum, width) => sum + width, 0),
    [resolvedColumnWidths],
  )
  const rowMetrics = useMemo(() => {
    const offsets: number[] = []
    let totalHeight = 0
    for (const height of resolvedRowHeights) {
      offsets.push(totalHeight)
      totalHeight += height
    }
    return { offsets, totalHeight }
  }, [resolvedRowHeights])
  const visibleRange = useMemo(() => {
    if (!rows.length) return { start: 0, end: -1 }
    const bodyScrollTop = Math.max(0, scrollTop - HEADER_HEIGHT)
    const bodyViewportHeight = Math.max(0, viewportHeight - HEADER_HEIGHT)
    const overscan = OVERSCAN_ROWS * DEFAULT_ROW_HEIGHT
    const start = findRowIndexForOffset(
      rowMetrics.offsets,
      resolvedRowHeights,
      Math.max(0, bodyScrollTop - overscan),
    )
    const end = findRowIndexForOffset(
      rowMetrics.offsets,
      resolvedRowHeights,
      Math.min(rowMetrics.totalHeight, bodyScrollTop + bodyViewportHeight + overscan),
    )
    return { start, end: Math.max(start, end) }
  }, [resolvedRowHeights, rowMetrics.offsets, rowMetrics.totalHeight, rows.length, scrollTop, viewportHeight])
  const visibleRowIndices = useMemo(() => {
    if (visibleRange.end < visibleRange.start) return []
    return Array.from({ length: visibleRange.end - visibleRange.start + 1 }, (_, offset) => visibleRange.start + offset)
  }, [visibleRange.end, visibleRange.start])

  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    setRows((prev) => prev.map((row, currentRowIndex) => {
      if (currentRowIndex !== rowIndex) return row
      const next = [...row]
      next[columnIndex] = value
      return next
    }))
    setHasChanges(true)
  }

  const updateHeader = (columnIndex: number, value: string) => {
    setHeaders((prev) => {
      const next = [...prev]
      next[columnIndex] = getUniqueHeaderName(prev, value, columnIndex)
      return next
    })
    setHasChanges(true)
  }

  const insertColumnAfter = (columnIndex: number) => {
    const safeIndex = Math.max(0, Math.min(columnIndex + 1, headers.length))
    setHeaders((prev) => {
      const next = [...prev]
      next.splice(safeIndex, 0, '')
      next[safeIndex] = getUniqueHeaderName(next, `Column ${safeIndex + 1}`, safeIndex)
      return next
    })
    setRows((prev) => prev.map((row) => {
      const next = [...row]
      next.splice(safeIndex, 0, '')
      return next
    }))
    setColumnWidths((prev) => shiftSizeMapOnInsert(prev, safeIndex))
    setHighlightedHeaderIndex(safeIndex)
    setEditingHeaderIndex(safeIndex)
    setSelectionScope('columns')
    setSelectedColumns([safeIndex])
    setSelectedRows([])
    lastSelectedColumnRef.current = safeIndex
    setHasChanges(true)
  }

  const insertRowAfter = (rowIndex: number) => {
    const safeIndex = Math.max(0, Math.min(rowIndex + 1, rows.length))
    setRows((prev) => {
      const next = [...prev]
      next.splice(safeIndex, 0, Array.from({ length: headers.length }, () => ''))
      return next
    })
    setRowHeights((prev) => shiftSizeMapOnInsert(prev, safeIndex))
    setSelectionScope('rows')
    setSelectedRows([safeIndex])
    setSelectedColumns([])
    lastSelectedRowRef.current = safeIndex
    setHasChanges(true)
  }

  const deleteColumnIndices = (indices: number[]) => {
    if (!indices.length) return
    const removeSet = new Set(indices)
    const keepIndices = headers.map((_, index) => index).filter((index) => !removeSet.has(index))
    setHeaders((prev) => keepIndices.map((index) => prev[index]))
    setRows((prev) => prev.map((row) => keepIndices.map((index) => row[index] ?? '')))
    setColumnWidths((prev) => shiftSizeMapOnDelete(prev, indices))
    setSelectedColumns([])
    setSelectionScope('none')
    setContextMenu(null)
    setHasChanges(true)
  }

  const deleteRowIndices = (indices: number[]) => {
    if (!indices.length) return
    const removeSet = new Set(indices)
    setRows((prev) => prev.filter((_, index) => !removeSet.has(index)))
    setRowHeights((prev) => shiftSizeMapOnDelete(prev, indices))
    setSelectedRows([])
    setSelectionScope('none')
    setContextMenu(null)
    setHasChanges(true)
  }

  const autoFitColumn = (columnIndex: number) => {
    setColumnWidths((prev) => {
      if (!(columnIndex in prev)) return prev
      const next = { ...prev }
      delete next[columnIndex]
      return next
    })
  }

  const runCompute = (operation: ComputeOperation) => {
    if (selectedColumns.length < 2) return
    try {
      const result = computeDerivedColumn({
        headers,
        rows,
        selectedColumnIndices: selectedColumns,
        operation,
      })
      setHeaders(result.headers)
      setRows(result.rows)
      setSelectedColumns([result.insertedColumnIndex])
      setSelectionScope('columns')
      setHighlightedHeaderIndex(result.insertedColumnIndex)
      setEditingHeaderIndex(result.insertedColumnIndex)
      setContextMenu(null)
      lastSelectedColumnRef.current = result.insertedColumnIndex
      setHasChanges(true)
    } catch (err: any) {
      dispatchToast('error', 'Compute unavailable', err?.message || 'Only numeric columns can be computed together.')
    }
  }

  const saveDataset = async (mode: 'replace' | 'save-as-new'): Promise<boolean> => {
    if (!workspace || !dataset || !hasChanges) return false
    if (mode === 'save-as-new' && getWorkspaceDatasets(workspace).length >= 3) {
      addDiagnostic({
        category: 'dataset',
        level: 'warn',
        message: 'Save as new dataset was blocked by the workspace dataset limit.',
        details: {
          workspaceId: workspace.id,
          datasetId: dataset.id,
        },
      })
      dispatchToast('error', 'Dataset limit reached', 'Each workspace can hold up to 3 datasets. Delete one before saving a new dataset.')
      return false
    }

    const nextDatasetId = mode === 'replace' ? dataset.id : `ds-${Date.now()}`
    const saveFileName = `${normalizeName(datasetFileName)}.csv`
    const preparedDataset = prepareDatasetForPersistence(headers, rows)
    const preparedHeaders = preparedDataset.headers
    const preparedRows = preparedDataset.rows
    const variableTypes = preparedDataset.variableTypes

    try {
      setSaving(true)
      const persisted = await persistDatasetToWorkspace({
        workspacePath: workspace.path || '',
        datasetId: nextDatasetId,
        fileName: saveFileName,
        headers: preparedHeaders,
        allRows: preparedRows,
      })

      writeDatasetViewCache(nextDatasetId, {
        datasetId: nextDatasetId,
        fileName: saveFileName,
        filePath: persisted.internalName,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspacePath: workspace.path || '',
        headers: preparedHeaders,
        allRows: preparedRows,
        totalRows: preparedRows.length,
        missing: 0,
        absolutePath: persisted.absolutePath || persisted.datasetTempPath,
        datasetTempPath: persisted.datasetTempPath,
      })
      if (preparedDataset.headersChanged) {
        setHeaders(preparedHeaders)
      }
      if (preparedDataset.rowsChanged) {
        setRows(preparedRows)
      }

      window.dispatchEvent(new CustomEvent('pls:dataset-imported', {
        detail: {
          datasetId: nextDatasetId,
          filePath: persisted.internalName,
          fileName: saveFileName,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          headers: preparedHeaders,
          variableTypes,
          totalRows: preparedRows.length,
          missing: 0,
          datasetTempPath: persisted.datasetTempPath || '',
          source: routeState.source ?? 'workspace-home',
          modelId: routeState.modelId ?? '',
          saveMode: mode,
          setAsDefault: routeState.source !== 'model-canvas',
        },
      }))

      dispatchToast(
        'success',
        mode === 'replace' ? 'Dataset saved' : 'Dataset saved as new',
        `${preparedHeaders.length} columns and ${preparedRows.length} rows are ready in the workspace.`,
      )
      addDiagnostic({
        category: 'dataset',
        message: mode === 'replace' ? 'Saved dataset changes from DataView.' : 'Saved DataView changes as a new dataset.',
        details: {
          workspaceId: workspace.id,
          datasetId: nextDatasetId,
          sourceDatasetId: dataset.id,
          totalRows: preparedRows.length,
          headers: preparedHeaders.length,
        },
      })
      setHasChanges(false)

      if (mode === 'save-as-new') {
        navigate(`/dataview/${workspace.id}/${nextDatasetId}`, {
          replace: true,
          state: routeState,
        })
      }
      return true
    } catch (err: any) {
      addDiagnostic({
        category: 'dataset',
        level: 'error',
        message: 'DataView failed to persist the dataset.',
        details: {
          workspaceId: workspace.id,
          datasetId: nextDatasetId,
          mode,
          error: err,
        },
      })
      dispatchToast('error', 'Save failed', err?.message || 'The dataset could not be saved.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleBackNavigation = () => {
    if (hasChanges) {
      setShowUnsavedExitModal(true)
      setContextMenu(null)
      return
    }
    navigate(returnTo)
  }

  const selectRowWithEvent = (rowIndex: number, event: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
    const additive = !!(event.ctrlKey || event.metaKey)
    const shouldRange = !!event.shiftKey && lastSelectedRowRef.current !== null

    setSelectionScope('rows')
    setSelectedColumns([])

    if (shouldRange) {
      const range = buildRange(lastSelectedRowRef.current ?? rowIndex, rowIndex)
      setSelectedRows((prev) => additive ? uniqueSorted([...prev, ...range]) : range)
      lastSelectedRowRef.current = rowIndex
      return
    }

    if (additive) {
      setSelectedRows((prev) => (
        prev.includes(rowIndex)
          ? prev.filter((index) => index !== rowIndex)
          : uniqueSorted([...prev, rowIndex])
      ))
      lastSelectedRowRef.current = rowIndex
      return
    }

    setSelectedRows([rowIndex])
    lastSelectedRowRef.current = rowIndex
  }

  const handleColumnMouseDown = (columnIndex: number, event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    const additive = event.ctrlKey || event.metaKey
    const hasShiftAnchor = event.shiftKey && lastSelectedColumnRef.current !== null
    setContextMenu(null)
    setSelectionScope('columns')
    setSelectedRows([])

    if (hasShiftAnchor) {
      const range = buildRange(lastSelectedColumnRef.current ?? columnIndex, columnIndex)
      const baseSelection = additive ? selectedColumns : []
      setSelectedColumns(additive ? uniqueSorted([...baseSelection, ...range]) : range)
      columnDragSelectionRef.current = {
        anchorIndex: lastSelectedColumnRef.current ?? columnIndex,
        baseSelection,
        additive,
      }
      lastSelectedColumnRef.current = columnIndex
      return
    }

    if (additive) {
      const alreadySelected = selectedColumnSet.has(columnIndex)
      const baseSelection = alreadySelected
        ? selectedColumns.filter((index) => index !== columnIndex)
        : [...selectedColumns]
      const nextSelection = alreadySelected
        ? baseSelection
        : uniqueSorted([...selectedColumns, columnIndex])
      setSelectedColumns(nextSelection)
      columnDragSelectionRef.current = {
        anchorIndex: columnIndex,
        baseSelection,
        additive: true,
      }
      lastSelectedColumnRef.current = columnIndex
      return
    }

    setSelectedColumns([columnIndex])
    columnDragSelectionRef.current = {
      anchorIndex: columnIndex,
      baseSelection: [],
      additive: false,
    }
    lastSelectedColumnRef.current = columnIndex
  }

  const handleColumnMouseEnter = (columnIndex: number) => {
    const dragSelection = columnDragSelectionRef.current
    if (!dragSelection) return
    const range = buildRange(dragSelection.anchorIndex, columnIndex)
    const nextSelection = dragSelection.additive
      ? uniqueSorted([...dragSelection.baseSelection, ...range])
      : range
    setSelectedColumns((current) => sameIndexList(current, nextSelection) ? current : nextSelection)
  }

  const openRowContextMenu = (event: React.MouseEvent, rowIndex: number) => {
    event.preventDefault()
    event.stopPropagation()
    if (selectionScope !== 'rows' || !selectedRowSet.has(rowIndex)) {
      setSelectedRows([rowIndex])
      setSelectedColumns([])
      setSelectionScope('rows')
      lastSelectedRowRef.current = rowIndex
    }
    const position = clampMenuPosition(event.clientX, event.clientY, CONTEXT_MENU_WIDTH)
    setContextMenu({ kind: 'row', x: position.x, y: position.y, targetIndex: rowIndex, panel: 'base' })
  }

  const openColumnContextMenu = (event: React.MouseEvent, columnIndex: number) => {
    event.preventDefault()
    event.stopPropagation()
    if (selectionScope !== 'columns' || !selectedColumnSet.has(columnIndex)) {
      setSelectedColumns([columnIndex])
      setSelectedRows([])
      setSelectionScope('columns')
      lastSelectedColumnRef.current = columnIndex
    }
    const position = clampMenuPosition(event.clientX, event.clientY, CONTEXT_MENU_WIDTH)
    setContextMenu({ kind: 'column', x: position.x, y: position.y, targetIndex: columnIndex, panel: 'base' })
  }

  const showBulkRowDelete = selectionScope === 'rows' && selectedRows.length > 1
  const showBulkColumnDelete = selectionScope === 'columns' && selectedColumns.length > 1
  const activeRowDeletion = contextMenu?.kind === 'row' && selectionScope === 'rows' && selectedRowSet.has(contextMenu.targetIndex)
    ? selectedRows
    : contextMenu?.kind === 'row'
      ? [contextMenu.targetIndex]
      : []
  const activeColumnDeletion = contextMenu?.kind === 'column' && selectionScope === 'columns' && selectedColumnSet.has(contextMenu.targetIndex)
    ? selectedColumns
    : contextMenu?.kind === 'column'
      ? [contextMenu.targetIndex]
      : []
  const activeRowAppendIndex = activeRowDeletion.length ? Math.max(...activeRowDeletion) : 0
  const activeColumnAppendIndex = activeColumnDeletion.length ? Math.max(...activeColumnDeletion) : 0

  if (!workspace || !dataset) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--color-page)' }}>
        <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>
          Dataset not found.
        </span>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-page)' }}>
      <div
        className="shrink-0 flex items-center justify-between"
        style={{ height: 60, padding: '0 18px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-toolbar-bg)' }}
      >
        <div className="flex items-center" style={{ gap: 12 }}>
          <button
            onClick={handleBackNavigation}
            className="flex items-center justify-center"
            style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-elevated)' }}
          >
            <ArrowLeft size={16} color="var(--color-text-secondary)" />
          </button>
          <div className="flex flex-col">
            <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 700 }}>
              {dataset.name}
            </span>
            <span style={{ color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11 }}>
              DataView · {rows.length} rows · {headers.length} columns
            </span>
          </div>
        </div>

        <div className="flex items-center" style={{ gap: 10 }}>
          {showBulkRowDelete && (
            <button
              onClick={() => deleteRowIndices(selectedRows)}
              title="Delete selected rows"
              className="flex items-center justify-center"
              style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(217,107,77,0.25)', background: 'rgba(217,107,77,0.12)' }}
            >
              <Trash size={15} color="var(--color-danger)" />
            </button>
          )}

          {showBulkColumnDelete && (
            <button
              onClick={() => deleteColumnIndices(selectedColumns)}
              title="Delete selected columns"
              className="flex items-center justify-center"
              style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(217,107,77,0.25)', background: 'rgba(217,107,77,0.12)' }}
            >
              <Trash size={15} color="var(--color-danger)" />
            </button>
          )}

          <button
            onClick={() => void saveDataset('replace')}
            disabled={saving || !hasChanges}
            title="Save dataset"
            className="flex items-center justify-center"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid rgba(135,151,107,0.34)',
              background: hasChanges ? '#87976B' : 'var(--color-elevated)',
              opacity: saving ? 0.6 : hasChanges ? 1 : 0.45,
            }}
          >
            <FloppyDisk size={16} color={hasChanges ? 'var(--color-on-accent)' : 'var(--color-text-muted)'} weight={hasChanges ? 'fill' : 'regular'} />
          </button>
          <button
            onClick={() => void saveDataset('save-as-new')}
            disabled={saving || !hasChanges}
            title="Save as new dataset"
            className="flex items-center justify-center"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: hasChanges ? 'var(--color-surface)' : 'var(--color-elevated)',
              opacity: saving ? 0.6 : hasChanges ? 1 : 0.45,
            }}
          >
            <span className="relative flex items-center justify-center" style={{ width: 18, height: 18 }}>
              <FloppyDisk size={16} color={hasChanges ? 'var(--color-text-primary)' : 'var(--color-text-muted)'} weight={hasChanges ? 'fill' : 'regular'} />
              <span
                className="absolute flex items-center justify-center"
                style={{
                  right: -2,
                  bottom: -2,
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: hasChanges ? '#87976B' : 'var(--color-border)',
                }}
              >
                <Plus size={8} color={hasChanges ? 'var(--color-on-accent)' : 'var(--color-text-muted)'} weight="bold" />
              </span>
            </span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>Loading dataset…</span>
        </div>
      ) : (
        <div
          ref={gridScrollRef}
          onScroll={(event) => {
            pendingScrollTopRef.current = event.currentTarget.scrollTop
            if (scrollFrameRef.current !== null || typeof window === 'undefined') return
            scrollFrameRef.current = window.requestAnimationFrame(() => {
              scrollFrameRef.current = null
              const latestScrollTop = pendingScrollTopRef.current
              startTransition(() => {
                setScrollTop(latestScrollTop)
              })
            })
          }}
          className="data-view-scroll flex-1 overflow-scroll"
          style={{
            padding: '0 16px 16px',
            scrollbarGutter: 'stable both-edges',
          }}
        >
          <div style={{ minWidth: Math.max(960, totalTableWidth), position: 'relative' }}>
            <div
              className="flex sticky top-0"
              style={{
                height: HEADER_HEIGHT,
                zIndex: 12,
                overflow: 'hidden',
                isolation: 'isolate',
                background: 'var(--color-surface)',
                borderBottom: '1px solid var(--color-border)',
                boxShadow: '0 10px 24px rgba(15,18,25,0.12)',
              }}
            >
              <div
                className="flex items-center justify-center"
                style={{ width: INDEX_WIDTH, height: HEADER_HEIGHT, borderRight: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
              >
                <span style={{ color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11 }}>#</span>
              </div>
              {headers.map((header, columnIndex) => {
                const isSelected = selectedColumnSet.has(columnIndex)
                const isHighlighted = highlightedHeaderIndex === columnIndex
                return (
                  <div
                    key={`header-${columnIndex}`}
                    className="relative"
                    onContextMenu={(event) => openColumnContextMenu(event, columnIndex)}
                    style={{
                      width: resolvedColumnWidths[columnIndex],
                      height: HEADER_HEIGHT,
                      borderRight: '1px solid var(--color-border)',
                      userSelect: 'none',
                      background: isHighlighted
                        ? 'rgb(var(--color-hover-rgb) / 0.95)'
                        : isSelected
                          ? 'rgb(var(--color-hover-rgb) / 0.75)'
                          : 'var(--color-surface)',
                    }}
                  >
                    <button
                      onMouseDown={(event) => handleColumnMouseDown(columnIndex, event)}
                      onMouseEnter={() => handleColumnMouseEnter(columnIndex)}
                      onDoubleClick={() => setEditingHeaderIndex(columnIndex)}
                      className="w-full h-full flex items-center justify-start text-left"
                      style={{ padding: '0 4px', background: 'transparent', border: 'none' }}
                    >
                      {editingHeaderIndex === columnIndex ? (
                        <input
                          autoFocus
                          defaultValue={header}
                          onBlur={(event) => {
                            updateHeader(columnIndex, event.target.value.trim() || `Column ${columnIndex + 1}`)
                            setEditingHeaderIndex(null)
                            setHighlightedHeaderIndex(null)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              updateHeader(columnIndex, (event.target as HTMLInputElement).value.trim() || `Column ${columnIndex + 1}`)
                              setEditingHeaderIndex(null)
                              setHighlightedHeaderIndex(null)
                            }
                          }}
                          style={{ width: '100%', background: 'var(--color-input)', color: 'var(--color-text-primary)', border: '1px solid rgb(var(--color-accent-rgb) / 0.38)', borderRadius: 6, padding: '0 4px', fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}
                        />
                      ) : (
                        <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {header}
                        </span>
                      )}
                    </button>

                    <div
                      onDoubleClick={(event) => {
                        event.stopPropagation()
                        autoFitColumn(columnIndex)
                      }}
                      onMouseDown={(event) => {
                        event.stopPropagation()
                        dragStateRef.current = {
                          kind: 'column',
                          index: columnIndex,
                          startClient: event.clientX,
                          startSize: resolvedColumnWidths[columnIndex],
                        }
                      }}
                      style={{ position: 'absolute', top: 0, right: -3, width: 6, height: '100%', cursor: 'col-resize' }}
                    />
                  </div>
                )
              })}
            </div>

            <div style={{ height: rowMetrics.totalHeight, position: 'relative' }}>
            {visibleRowIndices.map((rowIndex) => {
              const row = rows[rowIndex]
              const isSelectedRow = selectedRowSet.has(rowIndex)
              const rowTop = rowMetrics.offsets[rowIndex]
              const rowHeight = resolvedRowHeights[rowIndex]
              const baseRowBackground = rowIndex % 2 === 0 ? 'var(--color-surface)' : 'var(--color-elevated)'
              return (
                <div
                  key={`row-${rowIndex}`}
                  className="flex"
                  onContextMenu={(event) => openRowContextMenu(event, rowIndex)}
                  style={{ position: 'absolute', top: rowTop, left: 0, right: 0, height: rowHeight, contain: 'layout paint' }}
                >
                  <div
                    className="relative"
                    style={{
                      width: INDEX_WIDTH,
                      height: rowHeight,
                      borderRight: '1px solid var(--color-border)',
                      userSelect: 'none',
                      background: isSelectedRow ? 'rgb(var(--color-hover-rgb) / 0.85)' : rowIndex % 2 === 0 ? 'var(--color-surface)' : 'var(--color-elevated)',
                    }}
                    >
                      <button
                        onClick={(event) => selectRowWithEvent(rowIndex, event)}
                        className="w-full h-full"
                        style={{ background: 'transparent', border: 'none' }}
                    >
                        <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 11 }}>{rowIndex + 1}</span>
                      </button>
                    <div
                      onMouseDown={(event) => {
                        event.stopPropagation()
                        dragStateRef.current = {
                          kind: 'row',
                          index: rowIndex,
                          startClient: event.clientY,
                          startSize: rowHeight,
                        }
                      }}
                      style={{ position: 'absolute', left: 0, right: 0, bottom: -3, height: 6, cursor: 'row-resize' }}
                    />
                  </div>

                  {headers.map((_, columnIndex) => (
                    <div
                      key={`cell-${rowIndex}-${columnIndex}`}
                      style={{
                        width: resolvedColumnWidths[columnIndex],
                        height: rowHeight,
                        borderRight: '1px solid var(--color-border)',
                        userSelect: 'none',
                        background: isSelectedRow && selectedColumnSet.has(columnIndex)
                          ? 'rgb(var(--color-hover-rgb) / 0.95)'
                          : isSelectedRow
                            ? 'rgb(var(--color-hover-rgb) / 0.75)'
                            : selectedColumnSet.has(columnIndex)
                              ? 'rgb(var(--color-hover-rgb) / 0.55)'
                              : baseRowBackground,
                      }}
                      onDoubleClick={() => setEditingCell({ rowIndex, columnIndex })}
                    >
                      {editingCell?.rowIndex === rowIndex && editingCell?.columnIndex === columnIndex ? (
                        <input
                          autoFocus
                          defaultValue={row[columnIndex] ?? ''}
                          onBlur={(event) => {
                            updateCell(rowIndex, columnIndex, event.target.value)
                            setEditingCell(null)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              updateCell(rowIndex, columnIndex, (event.target as HTMLInputElement).value)
                              setEditingCell(null)
                            }
                          }}
                          style={{ width: '100%', height: '100%', padding: '0 4px', background: 'var(--color-input)', color: 'var(--color-text-primary)', border: '1px solid rgb(var(--color-accent-rgb) / 0.32)', outline: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center"
                          style={{ padding: '0 4px' }}
                        >
                          <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                            {row[columnIndex] ?? ''}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            width: CONTEXT_MENU_WIDTH,
            borderRadius: 14,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            boxShadow: '0 20px 44px rgba(15,18,25,0.22)',
            padding: 6,
            zIndex: 50,
          }}
        >
          {contextMenu.kind === 'row' ? (
            <>
              <button
                onClick={() => {
                  insertRowAfter(activeRowAppendIndex)
                  setContextMenu(null)
                }}
                className="w-full flex items-center justify-between"
                style={{
                  height: 34,
                  borderRadius: 10,
                  border: 'none',
                  background: 'transparent',
                  padding: '0 10px',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                }}
              >
                <span>Append row</span>
                <Plus size={14} color="var(--color-text-secondary)" weight="bold" />
              </button>
              <button
                onClick={() => deleteRowIndices(activeRowDeletion)}
                className="w-full flex items-center justify-between"
                style={{
                  height: 34,
                  borderRadius: 10,
                  border: 'none',
                  background: 'transparent',
                  padding: '0 10px',
                  color: '#E0B9A9',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                }}
              >
                <span>{activeRowDeletion.length > 1 ? 'Delete rows' : 'Delete row'}</span>
                <Trash size={14} color="var(--color-danger)" />
              </button>
            </>
          ) : contextMenu.panel === 'compute' ? (
            <>
              <button
                onClick={() => setContextMenu((prev) => prev ? { ...prev, panel: 'base' } : prev)}
                className="w-full flex items-center justify-between"
                style={{
                  height: 34,
                  borderRadius: 10,
                  border: 'none',
                  background: 'transparent',
                  padding: '0 10px',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                }}
              >
                <span>Back</span>
                <CaretRight size={14} color="var(--color-text-muted)" style={{ transform: 'rotate(180deg)' }} />
              </button>
              {COMPUTE_ACTIONS.map((operation) => (
                <button
                  key={operation}
                  onClick={() => runCompute(operation)}
                  className="w-full flex items-center justify-between"
                  style={{
                    height: 34,
                    borderRadius: 10,
                    border: 'none',
                    background: 'transparent',
                    padding: '0 10px',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 12,
                  }}
                >
                  <span>{labelOperation(operation)}</span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                    {operation}
                  </span>
                </button>
              ))}
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  insertColumnAfter(activeColumnAppendIndex)
                  setContextMenu(null)
                }}
                className="w-full flex items-center justify-between"
                style={{
                  height: 34,
                  borderRadius: 10,
                  border: 'none',
                  background: 'transparent',
                  padding: '0 10px',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                }}
              >
                <span>Append column</span>
                <Plus size={14} color="var(--color-text-secondary)" weight="bold" />
              </button>
              {activeColumnDeletion.length > 1 && (
                <button
                  onClick={() => setContextMenu((prev) => prev ? { ...prev, panel: 'compute' } : prev)}
                  className="w-full flex items-center justify-between"
                  style={{
                    height: 34,
                    borderRadius: 10,
                    border: 'none',
                    background: 'transparent',
                    padding: '0 10px',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 12,
                  }}
                >
                  <span>Compute</span>
                  <CaretRight size={14} color="var(--color-text-secondary)" />
                </button>
              )}
              <button
                onClick={() => deleteColumnIndices(activeColumnDeletion)}
                className="w-full flex items-center justify-between"
                style={{
                  height: 34,
                  borderRadius: 10,
                  border: 'none',
                  background: 'transparent',
                  padding: '0 10px',
                  color: '#E0B9A9',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                }}
              >
                <span>{activeColumnDeletion.length > 1 ? 'Delete columns' : 'Delete column'}</span>
                <Trash size={14} color="var(--color-danger)" />
              </button>
            </>
          )}
        </div>
      )}

      {showUnsavedExitModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowUnsavedExitModal(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(420px, calc(100vw - 32px))',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 14,
              overflow: 'hidden',
              boxShadow: '0 28px 70px rgba(0,0,0,0.45)',
            }}
          >
            <div
              style={{
                height: 46,
                padding: '0 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--color-danger)',
                background: 'var(--color-danger)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <WarningCircle size={16} color="var(--color-on-danger)" weight="fill" />
                <span style={{ color: 'var(--color-on-danger)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700 }}>
                  Unsaved dataset changes
                </span>
              </div>
              <button
                onClick={() => setShowUnsavedExitModal(false)}
                aria-label="Close"
                className="flex items-center justify-center"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  border: '1px solid rgba(255,255,255,0.32)',
                  background: 'rgba(255,255,255,0.12)',
                }}
              >
                <X size={12} color="var(--color-on-danger)" weight="bold" />
              </button>
            </div>

            <div style={{ padding: '18px 18px 14px' }}>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, lineHeight: 1.6 }}>
                You changed this dataset. Save dataset before leaving, or discard your edits and go back.
              </p>
            </div>

            <div style={{ padding: '0 18px 18px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => {
                  setShowUnsavedExitModal(false)
                  navigate(returnTo)
                }}
                style={{
                  height: 34,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--color-danger)',
                  color: 'var(--color-on-danger)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Discard
              </button>
              <button
                onClick={async () => {
                  const saved = await saveDataset('replace')
                  if (!saved) return
                  setShowUnsavedExitModal(false)
                  navigate(returnTo)
                }}
                disabled={saving}
                style={{
                  height: 34,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(135,151,107,0.34)',
                  background: '#87976B',
                  color: 'var(--color-on-accent)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                  fontWeight: 700,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                Save dataset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
