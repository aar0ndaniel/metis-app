import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, PencilSimple, Trash, X } from '@phosphor-icons/react'
import { dispatchToast } from './Toast'
import {
  deleteDatasetsFromWorkspace,
  getWorkspaceDatasets,
  migrateWorkspace,
  renameDatasetInWorkspace,
  setModelLinkedDataset,
} from '../utils/datasetWorkspace'
import { clearDatasetViewCache, clearLegacyDatasetViewCacheByWorkspaceName } from '../utils/datasetViewCache'
import type { Workspace } from '../types/workspace'

interface DatasetManagerModalProps {
  workspace: Workspace
  workspaces: Workspace[]
  setWorkspaces: React.Dispatch<React.SetStateAction<Workspace[]>>
  context: 'workspace-home' | 'model-canvas'
  modelId?: string
  onBrowse: () => void
  onClose: () => void
  onViewDataset?: (datasetId: string) => void
}

type DatasetContextMenu = {
  datasetId: string
  x: number
  y: number
}

const CONTEXT_MENU_WIDTH = 132

export default function DatasetManagerModal({
  workspace,
  workspaces,
  setWorkspaces,
  context,
  modelId,
  onBrowse,
  onClose,
  onViewDataset,
}: DatasetManagerModalProps) {
  const hydratedWorkspace = useMemo(() => migrateWorkspace(workspace), [workspace])
  const datasets = useMemo(() => getWorkspaceDatasets(hydratedWorkspace), [hydratedWorkspace])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [contextMenu, setContextMenu] = useState<DatasetContextMenu | null>(null)

  const currentModel = hydratedWorkspace.children.find((child: any) => child.type === 'model' && child.id === modelId) as any
  const activeDatasetId = context === 'model-canvas'
    ? currentModel?.linkedDatasetId
    : hydratedWorkspace.defaultDatasetId
  const singleSelectedDatasetId = selectedIds.length === 1 ? selectedIds[0] : null
  const canUseSelectedDataset = !!singleSelectedDatasetId && singleSelectedDatasetId !== activeDatasetId

  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('click', handleClick)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('click', handleClick)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const getDatasetOperationMessage = (error: unknown, fallback: string) => (
    error instanceof Error && error.message ? error.message : fallback
  )

  const persistWorkspace = async (nextWorkspace: Workspace) => {
    const saveResult = await (window as any).electronAPI?.saveWorkspace?.(nextWorkspace)
    if (saveResult?.success === false) {
      throw new Error(saveResult.error || 'Could not save workspace changes.')
    }

    const nextWorkspaces = workspaces.map((item) => item.id === nextWorkspace.id ? nextWorkspace : item)
    setWorkspaces(nextWorkspaces)
    window.dispatchEvent(new CustomEvent('pls:workspaces-updated', {
      detail: {
        workspaces: nextWorkspaces,
      },
    }))
  }

  const commitRename = async (datasetId: string) => {
    const cleanName = renameDraft.trim()
    if (!cleanName) {
      setRenamingId(null)
      return
    }
    try {
      const nextWorkspace = renameDatasetInWorkspace(hydratedWorkspace, datasetId, cleanName)
      await persistWorkspace(nextWorkspace)
      setRenamingId(null)
      setContextMenu(null)
    } catch (error) {
      dispatchToast(
        'error',
        'Dataset update failed',
        getDatasetOperationMessage(error, 'Could not rename this dataset. Try again, or check that the workspace file is still writable.'),
      )
    }
  }

  const deleteDatasetIds = async (datasetIds: string[]) => {
    if (!datasetIds.length) return

    try {
      const nextWorkspace = deleteDatasetsFromWorkspace(hydratedWorkspace, datasetIds)
      await persistWorkspace(nextWorkspace)

      for (const datasetId of datasetIds) {
        const deleteResult = await (window as any).electronAPI?.deleteWorkspaceChild?.({
          workspacePath: hydratedWorkspace.path,
          childId: datasetId,
        })
        if (deleteResult?.success === false) {
          throw new Error(deleteResult.error || 'Could not delete this dataset from the workspace.')
        }
        clearDatasetViewCache(datasetId)
      }
      clearLegacyDatasetViewCacheByWorkspaceName(hydratedWorkspace.name)

      setSelectedIds((prev) => prev.filter((id) => !datasetIds.includes(id)))
      setContextMenu(null)
      dispatchToast(
        'success',
        'Datasets updated',
        datasetIds.length > 1
          ? 'The selected datasets were removed from this workspace.'
          : 'The dataset was removed from this workspace.',
      )
    } catch (error) {
      dispatchToast(
        'error',
        'Dataset update failed',
        getDatasetOperationMessage(error, 'Could not delete the selected dataset. Try again, or check that the workspace folder is still available.'),
      )
    }
  }

  const chooseDataset = async (datasetId: string) => {
    if (datasetId === activeDatasetId) return false

    let nextWorkspace = hydratedWorkspace
    if (context === 'model-canvas' && modelId) {
      nextWorkspace = setModelLinkedDataset(hydratedWorkspace, modelId, datasetId)
    } else {
      nextWorkspace = {
        ...hydratedWorkspace,
        defaultDatasetId: datasetId,
      }
    }

    try {
      await persistWorkspace(nextWorkspace)
      return true
    } catch (error) {
      dispatchToast(
        'error',
        'Dataset update failed',
        getDatasetOperationMessage(error, 'Could not select this dataset. Try again, or check that the workspace file is still writable.'),
      )
      return false
    }
  }

  const getRangeIds = (fromIndex: number, toIndex: number) => {
    const start = Math.min(fromIndex, toIndex)
    const end = Math.max(fromIndex, toIndex)
    return datasets.slice(start, end + 1).map((dataset) => dataset.id)
  }

  const setRangeSelection = (index: number, additive: boolean) => {
    const anchorIndex = lastSelectedIndex ?? index
    const rangeIds = getRangeIds(anchorIndex, index)
    setSelectedIds((prev) => additive ? Array.from(new Set([...prev, ...rangeIds])) : rangeIds)
    setLastSelectedIndex(index)
  }

  const toggleSingleSelection = (datasetId: string, index: number) => {
    setSelectedIds((prev) => (
      prev.includes(datasetId)
        ? prev.filter((item) => item !== datasetId)
        : [...prev, datasetId]
    ))
    setLastSelectedIndex(index)
  }

  const clampContextMenu = (clientX: number, clientY: number) => ({
    x: Math.min(clientX, window.innerWidth - CONTEXT_MENU_WIDTH - 12),
    y: Math.min(clientY, window.innerHeight - 96),
  })

  const handleRowClick = (
    event: React.MouseEvent<HTMLDivElement>,
    datasetId: string,
    index: number,
  ) => {
    if (renamingId === datasetId) return

    const isModifierSelection = event.ctrlKey || event.metaKey
    const isRangeSelection = event.shiftKey && lastSelectedIndex !== null
    setContextMenu(null)

    if (isRangeSelection) {
      setRangeSelection(index, isModifierSelection)
      return
    }

    if (isModifierSelection) {
      toggleSingleSelection(datasetId, index)
      return
    }

    setSelectedIds([datasetId])
    setLastSelectedIndex(index)
  }

  const handleCheckboxClick = (
    event: React.MouseEvent<HTMLInputElement>,
    datasetId: string,
    index: number,
  ) => {
    event.stopPropagation()
    const isModifierSelection = event.ctrlKey || event.metaKey
    const isRangeSelection = event.shiftKey && lastSelectedIndex !== null
    setContextMenu(null)

    if (isRangeSelection) {
      setRangeSelection(index, isModifierSelection)
      return
    }

    toggleSingleSelection(datasetId, index)
  }

  const handleRowDoubleClick = (datasetId: string) => {
    if (!onViewDataset) return
    onClose()
    onViewDataset(datasetId)
  }

  const openDatasetMenu = (
    event: React.MouseEvent<HTMLDivElement>,
    datasetId: string,
    index: number,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    setLastSelectedIndex(index)
    const position = clampContextMenu(event.clientX, event.clientY)
    setContextMenu({
      datasetId,
      x: position.x,
      y: position.y,
    })
  }

  return (
    <div
      className="fixed inset-0 z-[2200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex flex-col"
        style={{
          width: 'min(540px, 88vw)',
          maxHeight: '76vh',
          background: 'var(--color-page)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <div
          className="flex items-center justify-between shrink-0"
          style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex flex-col">
            <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 700 }}>
              Dataset Manager
            </span>
            <span style={{ color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11 }}>
              {context === 'model-canvas' && currentModel
                ? currentModel.name
                : 'Workspace datasets'}
            </span>
          </div>
          <button
            onClick={onClose}
            title="Close"
            style={{
              width: 30,
              height: 30,
              padding: 0,
              borderRadius: 9,
              border: '1px solid var(--color-border)',
              background: 'rgba(255,255,255,0.04)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <X size={15} color="var(--color-text-secondary)" />
          </button>
        </div>

        <div className="flex-1 overflow-auto" style={{ padding: 14 }}>
          {datasets.map((dataset, index) => {
            const isSelected = selectedIds.includes(dataset.id)
            const isActive = activeDatasetId === dataset.id
            const isHovered = hoveredId === dataset.id

            return (
              <div
                key={dataset.id}
                className="flex items-center"
                onClick={(event) => void handleRowClick(event, dataset.id, index)}
                onDoubleClick={() => handleRowDoubleClick(dataset.id)}
                onContextMenu={(event) => openDatasetMenu(event, dataset.id, index)}
                onMouseEnter={() => setHoveredId(dataset.id)}
                onMouseLeave={() => setHoveredId((current) => current === dataset.id ? null : current)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: isSelected
                    ? '1px solid rgba(255,255,255,0.16)'
                    : isHovered
                      ? '1px solid rgba(255,255,255,0.10)'
                      : '1px solid transparent',
                  background: isSelected
                    ? 'rgba(255,255,255,0.08)'
                    : isHovered
                      ? 'rgba(255,255,255,0.04)'
                      : 'transparent',
                  marginBottom: 8,
                  gap: 12,
                  cursor: renamingId === dataset.id ? 'text' : 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => undefined}
                  onClick={(event) => handleCheckboxClick(event, dataset.id, index)}
                  style={{ width: 14, height: 14, accentColor: '#8E949A', flexShrink: 0 }}
                />

                <div className="flex-1 min-w-0">
                  {renamingId === dataset.id ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onBlur={() => void commitRename(dataset.id)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void commitRename(dataset.id)
                        if (event.key === 'Escape') {
                          setRenamingId(null)
                          setContextMenu(null)
                        }
                      }}
                      style={{
                        width: '100%',
                        height: 32,
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: 'rgba(10,12,13,0.82)',
                        color: 'var(--color-text-primary)',
                        padding: '0 10px',
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        display: 'block',
                        color: 'var(--color-text-primary)',
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {dataset.name}
                    </span>
                  )}
                </div>

                {isActive && renamingId !== dataset.id && (
                  <div
                    className="flex items-center"
                    style={{
                      height: 24,
                      padding: '0 8px',
                      borderRadius: 999,
                      background: 'rgb(var(--color-hover-rgb) / 0.55)',
                      border: '1px solid var(--color-border)',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 700 }}>
                      Active
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div
          className="shrink-0 flex items-center justify-between"
          style={{ padding: '14px 16px', borderTop: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center" style={{ gap: 8 }}>
            {selectedIds.length >= 1 && (
              <button
                onClick={() => void deleteDatasetIds(selectedIds)}
                title={selectedIds.length === 1 ? 'Delete selected dataset' : `Delete ${selectedIds.length} selected datasets`}
                style={{
                  width: 30,
                  height: 30,
                  padding: 0,
                  borderRadius: 9,
                  border: '1px solid rgba(217,107,77,0.24)',
                  background: 'rgba(217,107,77,0.12)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Trash size={14} color="var(--color-danger)" />
              </button>
            )}
          </div>

          <div className="flex items-center" style={{ gap: 8 }}>
            {canUseSelectedDataset && singleSelectedDatasetId && (
              <button
                onClick={() => void chooseDataset(singleSelectedDatasetId).then((wasUpdated) => {
                  if (wasUpdated) {
                    setSelectedIds([])
                    setLastSelectedIndex(null)
                  }
                })}
                title="Use selected dataset"
                style={{
                  height: 30,
                  padding: '0 12px',
                  borderRadius: 9,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                Use
              </button>
            )}

            <button
              onClick={onBrowse}
              disabled={datasets.length >= 3}
              title={datasets.length >= 3 ? 'Workspace full' : 'Browse dataset'}
              style={{
                width: 30,
                height: 30,
                padding: 0,
                borderRadius: 9,
                border: '1px solid var(--color-border)',
                background: 'rgba(255,255,255,0.05)',
                opacity: datasets.length >= 3 ? 0.45 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FolderOpen size={15} color="var(--color-accent)" weight="fill" />
            </button>
          </div>
        </div>
      </div>

      {contextMenu && (() => {
        const menuDataset = datasets.find((dataset) => dataset.id === contextMenu.datasetId)
        if (!menuDataset) return null

        return (
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex flex-col"
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              width: CONTEXT_MENU_WIDTH,
              borderRadius: 10,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-modal-popover)',
              padding: '6px 0',
              zIndex: 2250,
            }}
          >
            <button
              onClick={() => {
                setContextMenu(null)
                setRenamingId(menuDataset.id)
                setRenameDraft(menuDataset.name)
              }}
              className="flex items-center transition-colors hover:bg-white/[0.05]"
              style={{ height: 34, padding: '0 12px', gap: 8, textAlign: 'left' }}
            >
              <PencilSimple size={13} color="var(--color-text-secondary)" />
              <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600 }}>
                Rename
              </span>
            </button>
            <button
              onClick={() => void deleteDatasetIds([menuDataset.id])}
              className="flex items-center transition-colors hover:bg-white/[0.05]"
              style={{ height: 34, padding: '0 12px', gap: 8, textAlign: 'left' }}
            >
              <Trash size={13} color="var(--color-danger)" />
              <span style={{ color: 'var(--color-danger)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600 }}>
                Delete
              </span>
            </button>
          </div>
        )
      })()}
    </div>
  )
}
