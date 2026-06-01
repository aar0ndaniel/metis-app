import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { dispatchToast } from '../components/Toast'
import {
  MagnifyingGlass,
  CaretDown,
  CaretRight,
  DotsThreeVertical,
  Graph,
  FileCode,
  FileCsv,
  Plus,
  PlusCircle,
  ArrowsClockwise,
  ArrowRight,
  SquaresFour,
  Rows,
  X,
  PencilSimple,
  Trash,
  Palette,
  WarningCircle,
  PushPin,
} from '@phosphor-icons/react'
import { stripModelDisplayName, stripWorkspaceDisplayName } from '../utils/displayNames'
import {
  WORKSPACE_ACCENT_FALLBACK_COLORS,
  getWorkspaceAccentPalette,
  normalizeWorkspaceAccentColor,
} from '../utils/themeAccent'
import DatasetManagerModal from '../components/DatasetManagerModal'
import { getWorkspaceDatasets, migrateWorkspace } from '../utils/datasetWorkspace'
import AppLogo from '../components/AppLogo'
import type { Workspace, WorkspaceChild } from '../types/workspace'

// ─── Workspace color swatches ─────────────────────────────────────────────────
const WS_COLORS = WORKSPACE_ACCENT_FALLBACK_COLORS
type WorkspacePanelKind = 'datasets' | 'results'
type ConstructShape = 'circle' | 'oval' | 'square'
const OVAL_RX_SCALE = 1.35
const OVAL_RY_SCALE = 0.82

// ─── Context Menu ─────────────────────────────────────────────────────────────
interface CtxMenu {
  x: number
  y: number
  kind: 'workspace' | 'model' | 'dataset' | 'result'
  id: string
  pinned?: boolean
}

function SidebarContextMenu({
  menu,
  onRename,
  onDelete,
  onViewDataset,
  onManageDataset,
  onChangeColor,
  onTogglePin,
  onClose,
}: {
  menu: CtxMenu
  onRename: (id: string) => void
  onDelete: (id: string, kind: 'workspace' | 'model' | 'dataset' | 'result') => void
  onViewDataset?: (id: string) => void
  onManageDataset?: (id: string) => void
  onChangeColor?: (id: string, color: string) => void
  onTogglePin?: (id: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [showColors, setShowColors] = useState(false)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-[200] flex flex-col"
      style={{
        left: menu.x,
        top: menu.y,
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        padding: '5px 0',
        minWidth: 164,
      }}
    >
      {menu.kind === 'dataset' && (
        <>
          <button
            className="flex items-center gap-2.5 px-3.5 h-8 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] transition-colors w-full text-left"
            onClick={() => {
              onViewDataset?.(menu.id)
              onClose()
            }}
          >
            <ArrowRight size={13} color="var(--color-text-muted)" />
            <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>Open</span>
          </button>

          <button
            className="flex items-center gap-2.5 px-3.5 h-8 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] transition-colors w-full text-left"
            onClick={() => {
              onManageDataset?.(menu.id)
              onClose()
            }}
          >
            <ArrowsClockwise size={13} color="var(--color-text-muted)" />
            <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>Manage</span>
          </button>

          <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '4px 0' }} />
        </>
      )}

      <button
        className="flex items-center gap-2.5 px-3.5 h-8 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] transition-colors w-full text-left"
        onClick={() => { onRename(menu.id); onClose() }}
      >
        <PencilSimple size={13} color="var(--color-text-muted)" />
        <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>Rename</span>
      </button>

      {menu.kind === 'workspace' && (
        <button
          className="flex items-center gap-2.5 px-3.5 h-8 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] transition-colors w-full text-left"
          onClick={() => { onTogglePin?.(menu.id); onClose() }}
        >
          <PushPin size={13} color="var(--color-text-muted)" weight={menu.pinned ? 'fill' : 'regular'} />
          <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>
            {menu.pinned ? 'Unpin' : 'Pin Workspace'}
          </span>
        </button>
      )}

      {menu.kind === 'workspace' && (
        <button
          className="flex items-center gap-2.5 px-3.5 h-8 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] transition-colors w-full text-left"
          onClick={() => setShowColors((p) => !p)}
        >
          <Palette size={13} color="var(--color-text-muted)" />
          <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>Change Color</span>
        </button>
      )}

      {showColors && (
        <div className="flex flex-wrap px-3 pb-2 pt-1" style={{ gap: 6, maxWidth: 164 }}>
          {getWorkspaceAccentPalette(WS_COLORS).map((c) => (
            <button
              key={c}
              onClick={() => { onChangeColor?.(menu.id, c); onClose() }}
              className="rounded-full transition-transform hover:scale-110"
              style={{ width: 18, height: 18, backgroundColor: c, flexShrink: 0 }}
            />
          ))}
        </div>
      )}

      <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '4px 0' }} />

      <button
        className="flex items-center gap-2.5 px-3.5 h-8 hover:bg-red-500/10 transition-colors w-full text-left"
        onClick={() => { onDelete(menu.id, menu.kind); onClose() }}
      >
        <Trash size={13} color="var(--color-danger)" />
        <span style={{ color: 'var(--color-danger)', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>
          {menu.kind === 'workspace'
            ? 'Delete Workspace'
            : menu.kind === 'dataset'
              ? 'Delete Dataset'
            : menu.kind === 'result'
                ? 'Delete Saved Result'
                : 'Delete Model'}
        </span>
      </button>
    </div>
  )
}

// ─── Helper: hex → alpha color ───────────────────────────────────────────────
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function workspaceActiveBackground(color: string): string {
  return `linear-gradient(180deg, ${hexToRgba(color, 0.16)} 0%, ${hexToRgba(color, 0.06)} 100%)`
}

function workspaceActiveHeaderBackground(color: string): string {
  return hexToRgba(color, 0.13)
}

function workspaceActiveBorder(color: string): string {
  return `1px solid ${hexToRgba(color, 0.24)}`
}

function WorkspaceFolderIcon({ color, expanded }: { color: string; expanded: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        width: 16,
        height: 16,
        flexShrink: 0,
        display: 'block',
        color,
        opacity: 0.96,
        filter: 'drop-shadow(0 1px 0 rgba(255,255,255,0.03))',
      }}
    >
      {expanded ? (
        <>
          <path
            d="M21.0602 11.8201L20.9002 11.6001C20.6202 11.2601 20.2902 10.9901 19.9102 10.7901C19.4002 10.5001 18.8202 10.3501 18.2202 10.3501H5.7702C5.1702 10.3501 4.6002 10.5001 4.0802 10.7901C3.6902 11.0001 3.3402 11.2901 3.0502 11.6501C2.4802 12.3801 2.2102 13.2801 2.3002 14.1801L2.6702 18.8501C2.8002 20.2601 2.9702 22.0001 6.1402 22.0001H17.8602C21.0302 22.0001 21.1902 20.2601 21.3302 18.8401L21.3302 18.8401L21.7002 14.1901C21.7902 13.3501 21.5702 12.5101 21.0602 11.8201ZM14.3902 17.3401H9.6002C9.2102 17.3401 8.9002 17.0201 8.9002 16.6401C8.9002 16.2601 9.2102 15.9401 9.6002 15.9401H14.3902C14.7802 15.9401 15.0902 16.2601 15.0902 16.6401C15.0902 17.0301 14.7802 17.3401 14.3902 17.3401Z"
            fill="currentColor"
          />
          <path
            d="M3.38086 11.31C3.60086 11.11 3.82086 10.93 4.08086 10.79C4.59086 10.5 5.17086 10.35 5.77086 10.35H18.2309C18.8309 10.35 19.4009 10.5 19.9209 10.79C20.1809 10.93 20.4109 11.11 20.6209 11.32V10.79V9.82C20.6209 6.25 19.5309 5.16 15.9609 5.16H13.5809C13.1409 5.16 13.1309 5.15 12.8709 4.81L11.6709 3.2C11.1009 2.46 10.6509 2 9.22086 2H8.04086C4.47086 2 3.38086 3.09 3.38086 6.66V10.8V11.31Z"
            fill="currentColor"
            opacity="0.4"
          />
        </>
      ) : (
        <>
          <path
            d="M15.7201 2H8.28008C7.90008 2 7.58008 2.32 7.58008 2.7C7.58008 3.08 7.90008 3.4 8.28008 3.4H11.5401L12.9401 5.26C13.2501 5.67 13.2901 5.73 13.8701 5.73H17.5901C17.9701 5.73 18.3401 5.78 18.7001 5.88C18.7401 6.06 18.7601 6.24 18.7601 6.43V6.78C18.7601 7.16 19.0801 7.48 19.4601 7.48C19.8401 7.48 20.1601 7.16 20.1601 6.78V6.42C20.1401 3.98 18.1601 2 15.7201 2Z"
            fill="currentColor"
            opacity="0.4"
          />
          <path
            d="M20.14 6.54C19.71 6.23 19.22 6 18.69 5.87C18.34 5.77 17.96 5.72 17.58 5.72H13.86C13.28 5.72 13.24 5.66 12.93 5.25L11.53 3.39C10.88 2.53 10.37 2 8.74 2H6.42C3.98 2 2 3.98 2 6.42V17.58C2 20.02 3.98 22 6.42 22H17.58C20.02 22 22 20.02 22 17.58V10.14C22 8.65 21.27 7.34 20.14 6.54ZM14.33 16H9.67C9.28 16 8.97 15.69 8.97 15.3C8.97 14.92 9.28 14.6 9.67 14.6H14.32C14.7 14.6 15.02 14.92 15.02 15.3C15.02 15.69 14.71 16 14.33 16Z"
            fill="currentColor"
          />
        </>
      )}
    </svg>
  )
}

// ─── Badge pill ───────────────────────────────────────────────────────────────
function Badge({ status, verbose = false }: { status: 'Calculated' | 'Draft'; verbose?: boolean }) {
  const isCalc = status === 'Calculated'
  void verbose
  const label = isCalc ? 'Calculated' : 'Draft'
  return (
    <span
      style={{
        color: isCalc ? 'var(--color-badge-calc-text)' : 'var(--color-badge-draft-text)',
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 10,
        fontWeight: 600,
        padding: '4px 9px',
        borderRadius: 999,
        background: isCalc
          ? 'linear-gradient(180deg, rgba(80,214,155,0.18) 0%, rgba(27,69,52,0.28) 100%)'
          : 'linear-gradient(180deg, rgb(var(--color-accent-rgb) / 0.16) 0%, rgb(var(--color-accent-rgb) / 0.08) 100%)',
        border: `1px solid ${isCalc ? 'rgba(80,214,155,0.28)' : 'rgb(var(--color-accent-rgb) / 0.22)'}`,
        whiteSpace: 'nowrap' as const,
      }}
    >
      {label}
    </span>
  )
}

interface PreviewConstruct {
  id: string
  name: string
  x: number
  y: number
  radius?: number
  ovalWidth?: number
  ovalHeight?: number
  color?: string
  shape?: ConstructShape
}

interface PreviewPath {
  from: string
  to: string
  kind?: 'direct' | 'moderation'
}

function inferTimestampFromId(id: string): string | undefined {
  const match = id.match(/^[a-z]+-(\d{10,})$/i)
  if (!match) return undefined
  const numeric = Number(match[1])
  if (!Number.isFinite(numeric)) return undefined
  return new Date(numeric).toISOString()
}

function getAnalysisSavedAt(item: WorkspaceChild): string | undefined {
  return 'state' in item ? (item.state as any)?.analysis?.savedAt : undefined
}

function resolveUpdatedAt(item: WorkspaceChild): string | undefined {
  return item.updatedAt || getAnalysisSavedAt(item) || item.createdAt || inferTimestampFromId(item.id)
}

function resolveCreatedAt(item: WorkspaceChild): string | undefined {
  return item.createdAt || inferTimestampFromId(item.id) || item.updatedAt || getAnalysisSavedAt(item)
}

function resolveSortTime(item: WorkspaceChild): number {
  const raw = resolveUpdatedAt(item) || resolveCreatedAt(item)
  if (!raw) return 0
  const parsed = new Date(raw).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function formatRelativeAge(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  const diffMs = Math.max(0, Date.now() - date.getTime())
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day

  if (diffMs < minute) return 'just now'

  const pluralize = (valueNum: number, singular: string, plural: string) =>
    `${valueNum} ${valueNum === 1 ? singular : plural} ago`

  if (diffMs < hour) {
    const minutes = Math.max(1, Math.floor(diffMs / minute))
    return pluralize(minutes, 'minute', 'minutes')
  }

  if (diffMs < day) {
    const hours = Math.max(1, Math.floor(diffMs / hour))
    return pluralize(hours, 'hour', 'hours')
  }

  if (diffMs < week) {
    const days = Math.max(1, Math.floor(diffMs / day))
    return pluralize(days, 'day', 'days')
  }

  const weeks = Math.max(1, Math.floor(diffMs / week))
  return pluralize(weeks, 'week', 'weeks')
}

function getSidebarDatasetSummary(datasets: Array<{ id: string; name: string }>) {
  if (!datasets.length) return null
  return {
    id: `datasets-${datasets[0].id}`,
    label: datasets.length === 1 ? datasets[0].name : `Datasets · ${datasets.length}`,
    count: datasets.length,
  }
}

function getSidebarResultSummary(results: Array<{ id: string; name: string }>) {
  if (!results.length) return null
  return {
    id: `results-${results[0].id}`,
    label: results.length === 1 ? results[0].name : `Saved Results · ${results.length}`,
    count: results.length,
  }
}

function getModelSnapshot(model: WorkspaceChild): { constructs: PreviewConstruct[]; paths: PreviewPath[] } {
  const rawState = ((model as any).state ?? (model as any).data ?? {}) as any
  const constructs = Array.isArray(rawState.constructs)
    ? rawState.constructs.filter((construct: any) => Number.isFinite(construct?.x) && Number.isFinite(construct?.y))
    : []
  const paths = Array.isArray(rawState.paths) ? rawState.paths.filter((path: any) => path?.from && path?.to) : []

  return { constructs, paths }
}

function normalizeConstructShape(shape?: ConstructShape): 'circle' | 'oval' {
  return shape === 'oval' || shape === 'square' ? 'oval' : 'circle'
}

function getPreviewConstructRadii(construct: PreviewConstruct): { rx: number; ry: number } {
  const radius = construct.radius ?? 42
  if (normalizeConstructShape(construct.shape) === 'oval') {
    return {
      rx: Math.max(40, construct.ovalWidth ?? Math.round(radius * OVAL_RX_SCALE * 2)) / 2,
      ry: Math.max(40, construct.ovalHeight ?? Math.round(radius * OVAL_RY_SCALE * 2)) / 2,
    }
  }

  return { rx: radius, ry: radius }
}

function getPreviewEdgeOffset(construct: PreviewConstruct, ux: number, uy: number, scale: number): number {
  const { rx, ry } = getPreviewConstructRadii(construct)
  const scaledRx = Math.max(8, Math.min(14, rx * scale * 0.5))
  const scaledRy = Math.max(8, Math.min(14, ry * scale * 0.5))
  return 1 / Math.sqrt((ux * ux) / (scaledRx * scaledRx) + (uy * uy) / (scaledRy * scaledRy))
}

function ModelDiagramPreview({ model, accentColor }: { model: WorkspaceChild; accentColor: string }) {
  const { constructs, paths } = getModelSnapshot(model)

  const shellStyle: React.CSSProperties = {
    width: '100%',
    height: 178,
    padding: 12,
    borderRadius: 12,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    boxShadow: 'inset 0 1px 0 rgb(var(--color-text-primary-rgb) / 0.02)',
  }

  const artboardStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid var(--color-border)',
    background: 'var(--color-elevated)',
    boxShadow: 'inset 0 1px 0 rgb(var(--color-text-primary-rgb) / 0.02)',
  }

  if (!constructs.length) {
    return (
      <div style={shellStyle}>
        <div className="flex items-center justify-center w-full" style={artboardStyle}>
          <span style={{ color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 500 }}>
            No diagram saved yet
          </span>
        </div>
      </div>
    )
  }

  const minX = Math.min(...constructs.map((construct) => construct.x - getPreviewConstructRadii(construct).rx))
  const minY = Math.min(...constructs.map((construct) => construct.y - getPreviewConstructRadii(construct).ry))
  const maxX = Math.max(...constructs.map((construct) => construct.x + getPreviewConstructRadii(construct).rx))
  const maxY = Math.max(...constructs.map((construct) => construct.y + getPreviewConstructRadii(construct).ry))
  const sourceWidth = Math.max(maxX - minX, 1)
  const sourceHeight = Math.max(maxY - minY, 1)

  const viewWidth = 228
  const viewHeight = 154
  const padding = 16
  const scale = Math.min((viewWidth - padding * 2) / sourceWidth, (viewHeight - padding * 2) / sourceHeight)
  const scaledWidth = sourceWidth * scale
  const scaledHeight = sourceHeight * scale
  const originX = (viewWidth - scaledWidth) / 2 - minX * scale
  const originY = (viewHeight - scaledHeight) / 2 - minY * scale

  const mapX = (value: number) => originX + value * scale
  const mapY = (value: number) => originY + value * scale
  const constructById = new Map(constructs.map((construct) => [construct.id, construct]))
  const visiblePaths = paths.filter((path) => constructById.has(path.from) && constructById.has(path.to))

  return (
    <div style={shellStyle}>
      <div style={artboardStyle}>
        <svg width="100%" height="100%" viewBox={`0 0 ${viewWidth} ${viewHeight}`} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <marker id="arrowhead" markerWidth="7" markerHeight="5" refX="6.3" refY="2.5" orient="auto">
              <polygon
                points="0 0, 7 2.5, 0 5"
                fill="var(--color-border)"
              />
            </marker>
          </defs>
          <rect x="0" y="0" width={viewWidth} height={viewHeight} fill="var(--color-elevated)" rx="8" />

          {visiblePaths.map((path) => {
            const from = constructById.get(path.from)
            const to = constructById.get(path.to)
            if (!from || !to) return null

            const x1 = mapX(from.x)
            const y1 = mapY(from.y)
            const x2 = mapX(to.x)
            const y2 = mapY(to.y)

            // Shorten lines so they don't overlap dots and show arrows
            const dx = x2 - x1
            const dy = y2 - y1
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 1) return null
            const r1 = getPreviewEdgeOffset(from, dx / dist, dy / dist, scale)
            const r2 = getPreviewEdgeOffset(to, -dx / dist, -dy / dist, scale)
            
            if (dist < r1 + r2 + 2) return null
            
            const ux = dx / dist
            const uy = dy / dist
            
            const sx = x1 + ux * r1
            const sy = y1 + uy * r1
            const ex = x2 - ux * (r2 + 3) // +3 for arrow gap
            const ey = y2 - uy * (r2 + 3)

            return (
              <line
                key={`${path.from}-${path.to}`}
                x1={sx}
                y1={sy}
                x2={ex}
                y2={ey}
                stroke={path.kind === 'moderation' ? hexToRgba(accentColor, 0.42) : 'var(--color-border)'}
                strokeWidth={path.kind === 'moderation' ? 1.05 : 1.45}
                strokeDasharray={path.kind === 'moderation' ? '4 3' : undefined}
                strokeLinecap="round"
                markerEnd="url(#arrowhead)"
              />
            )
          })}

          {constructs.map((construct) => {
            const centerX = mapX(construct.x)
            const centerY = mapY(construct.y)
            const { rx, ry } = getPreviewConstructRadii(construct)
            const scaledRx = Math.max(8, Math.min(14, rx * scale * 0.5))
            const scaledRy = Math.max(8, Math.min(14, ry * scale * 0.5))

            return (
              <g key={construct.id}>
                {normalizeConstructShape(construct.shape) === 'oval' ? (
                  <ellipse
                    cx={centerX}
                    cy={centerY}
                    rx={scaledRx}
                    ry={scaledRy}
                    fill={hexToRgba(accentColor, 0.15)}
                    stroke={accentColor}
                    strokeWidth="1.2"
                  />
                ) : (
                  <circle
                    cx={centerX}
                    cy={centerY}
                    r={scaledRx}
                    fill={hexToRgba(accentColor, 0.15)}
                    stroke={accentColor}
                    strokeWidth="1.2"
                  />
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ─── Resizable Sidebar ────────────────────────────────────────────────────────
function useSidebarResize(initialWidth: number, minWidth: number, maxWidth: number) {
  const [width, setWidth] = useState(initialWidth)
  const isDragging = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    const startX = e.clientX
    const startW = width

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      setWidth(Math.max(minWidth, Math.min(maxWidth, startW + e.clientX - startX)))
    }
    const onMouseUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [width, minWidth, maxWidth])

  return { width, onMouseDown }
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center w-full px-4 text-center"
      style={{ maxWidth: 460, minHeight: 440, margin: '0 auto' }}
    >
      <svg width="340" height="340" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="var(--color-border)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8, opacity: 0.9 }}>
        {/* Hair */}
        <circle cx="300" cy="120" r="45" fill="#222222" stroke="none"/>
        {/* Face */}
        <circle cx="300" cy="140" r="30"/>
        <circle cx="290" cy="138" r="3" fill="#222222"/>
        <circle cx="310" cy="138" r="3" fill="#222222"/>
        <path d="M292 152 Q300 158 308 152"/>
        {/* Body */}
        <path d="M260 170 Q300 185 340 170 L360 310 L240 310 Z"/>
        {/* Arms */}
        <path d="M240 210 C190 200 170 220 150 235"/>
        <path d="M150 235 C170 228 195 228 215 235"/>
        <path d="M360 210 C410 200 430 220 450 235"/>
        <path d="M450 235 C430 228 405 228 385 235"/>
        <ellipse cx="150" cy="235" rx="18" ry="8"/>
        <ellipse cx="450" cy="235" rx="18" ry="8"/>
        {/* Empty Frame */}
        <rect x="170" y="280" width="260" height="140" rx="14"/>
        <rect x="190" y="300" width="220" height="100" rx="10" strokeDasharray="6 6"/>
        {/* Legs / Shoes */}
        <path d="M260 310 L260 390"/>
        <path d="M340 310 L340 390"/>
        <rect x="235" y="390" width="50" height="20" rx="8"/>
        <rect x="315" y="390" width="50" height="20" rx="8"/>
      </svg>
      <h3 style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
        Nothing to view here
      </h3>
      <p style={{ color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, marginBottom: 20 }}>
        You haven't created any models in this workspace yet.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center"
        style={{
          gap: 7,
          padding: '8px 16px',
          borderRadius: 8,
          backgroundColor: 'var(--color-accent)',
          border: '1px solid rgb(var(--color-accent-rgb) / 0.42)',
          boxShadow: '0 10px 22px rgb(var(--color-accent-rgb) / 0.18)',
        }}
      >
        <Plus size={14} weight="bold" color="var(--color-on-accent)" />
        <span style={{ color: 'var(--color-on-accent)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700 }}>
          Create Model
        </span>
      </button>
    </div>
  )
}

interface WorkspaceHomeProps {
  workspaces: Workspace[]
  setWorkspaces: React.Dispatch<React.SetStateAction<Workspace[]>>
  activeId: string
  setActiveId: (id: string) => void
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function WorkspaceHome({ workspaces, setWorkspaces, activeId, setActiveId }: WorkspaceHomeProps) {
    const getWorkspaceLabel = (name: string) => stripWorkspaceDisplayName(name)
    const getModelLabel = (name: string) => stripModelDisplayName(name)

  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [expandedResultsByWorkspace, setExpandedResultsByWorkspace] = useState<Record<string, boolean>>({})
  const datasetsPanelRef = useRef<HTMLDivElement>(null)
  const resultsPanelRef = useRef<HTMLDivElement>(null)
  const [pendingPanelFocus, setPendingPanelFocus] = useState<{ workspaceId: string; panel: WorkspacePanelKind; nonce: number } | null>(null)
  const [highlightedPanel, setHighlightedPanel] = useState<{ workspaceId: string; panel: WorkspacePanelKind; nonce: number } | null>(null)

  // Dialog visibility for dataset replacement only; workspace/model dialogs live in App.tsx.
  const [showDatasetChoice, setShowDatasetChoice] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string; kind: 'workspace' | 'model' | 'dataset' | 'result' } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isModalShaking, setIsModalShaking] = useState(false)

  const playAlertSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioCtx.createOscillator()
      const gainNode = audioCtx.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(440, audioCtx.currentTime)
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1)

      oscillator.connect(gainNode)
      gainNode.connect(audioCtx.destination)

      oscillator.start()
      oscillator.stop(audioCtx.currentTime + 0.1)
    } catch (e) {
      console.error('Audio context error:', e)
    }
  }

  const triggerModalAlert = () => {
    playAlertSound()
    setIsModalShaking(true)
    setTimeout(() => setIsModalShaking(false), 500)
  }


  // Legacy hidden file inputs removed

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const datasetMenuRef = useRef<HTMLDivElement>(null)
  const [openDatasetMenuId, setOpenDatasetMenuId] = useState<string | null>(null)

  const stopRenameEventPropagation = (
    e:
      | React.KeyboardEvent<HTMLInputElement>
      | React.MouseEvent<HTMLInputElement>
      | React.PointerEvent<HTMLInputElement>
  ) => {
    e.stopPropagation()
  }

  const handleRenameInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setRenamingId(null)
    }
  }

  const isCurrentlyRenaming = (id: string) => renamingId === id

  // Drag and Drop ordering state
  const [draggedWsId, setDraggedWsId] = useState<string | null>(null)
  const [dragOverWsId, setDragOverWsId] = useState<string | null>(null)

  useEffect(() => {
    if (renamingId) setTimeout(() => { renameInputRef.current?.focus(); renameInputRef.current?.select() }, 20)
  }, [renamingId])

  useEffect(() => {
    if (!openDatasetMenuId) return
    const handlePointerDown = (event: MouseEvent) => {
      if (datasetMenuRef.current && !datasetMenuRef.current.contains(event.target as Node)) {
        setOpenDatasetMenuId(null)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [openDatasetMenuId])

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)

  const { width: sidebarWidth, onMouseDown: onResizeStart } = useSidebarResize(260, 180, 400)

  // Listen for pls:show-dataset-choice (dispatched by App.tsx when workspace has a dataset)
  useEffect(() => {
    const handler = () => setShowDatasetChoice(true)
    window.addEventListener('pls:show-dataset-choice', handler)
    return () => window.removeEventListener('pls:show-dataset-choice', handler)
  }, [])

  const toggle = (id: string) =>
    setWorkspaces((prev) =>
      prev.map((ws) => (ws.id === id ? { ...ws, expanded: !ws.expanded } : ws))
    )

  // ── Rename ────────────────────────────────────────────────────────────────
  const startRename = (id: string) => {
    const ws = workspaces.find((w) => w.id === id)
    const child = workspaces.flatMap((w) => w.children).find((c) => c.id === id)
    setRenameValue(ws?.name ?? child?.name ?? '')
    setRenamingId(id)
  }

  const commitRename = () => {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return }
    const v = renameValue.trim()
    const renamedAt = new Date().toISOString()
    let workspaceToPersist: Workspace | undefined
    setWorkspaces((prev) => {
      const updated = prev.map((ws) => {
        if (ws.id === renamingId) {
          workspaceToPersist = { ...ws, name: v }
          return workspaceToPersist
        }
        if (!ws.children.some((child) => child.id === renamingId)) return ws
        const nextWorkspace = {
          ...ws,
          children: ws.children.map((c) => c.id === renamingId ? { ...c, name: v, updatedAt: renamedAt } : c),
        }
        workspaceToPersist = nextWorkspace
        return nextWorkspace
      })
      return updated
    })
    if (workspaceToPersist && (window as any).electronAPI?.saveWorkspace) {
      ;(window as any).electronAPI.saveWorkspace(workspaceToPersist)
    }
    setRenamingId(null)
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const executeDelete = async (id: string, kind: 'workspace' | 'model' | 'dataset' | 'result') => {
    setIsDeleting(true)
    try {
      if (kind === 'workspace') {
        const workspaceToDelete = workspaces.find((ws) => ws.id === id)
        const res = await (window as any).electronAPI?.deleteWorkspace?.({
          id: workspaceToDelete?.id,
          name: workspaceToDelete?.name,
          path: workspaceToDelete?.path,
        })

        if (res && res.success === false) {
          dispatchToast('error', 'Delete failed', res.error || 'Could not delete workspace folder.')
          return
        }

        setWorkspaces((prev) => {
          const remaining = prev.filter((ws) => ws.id !== id)
          if (activeId === id) setActiveId(remaining[0]?.id ?? '')
          return remaining
        })
        dispatchToast('success', 'Workspace deleted')
      } else {
        const owningWorkspace = workspaces.find((ws) => ws.children.some((child) => child.id === id))
        if (!owningWorkspace) return

        const res = await (window as any).electronAPI?.deleteWorkspaceChild?.({
          workspaceName: owningWorkspace.name,
          workspacePath: owningWorkspace.path,
          childId: id,
        })

        if (res && res.success === false) {
          dispatchToast('error', 'Delete failed', res.error || 'Could not delete the selected item from workspace storage.')
          return
        }

        setWorkspaces((prev) =>
          prev.map((ws) => {
            if (ws.id !== owningWorkspace.id) return ws
            return { ...ws, children: ws.children.filter((child) => child.id !== id) }
          })
        )

        if (activeId === id) setActiveId(owningWorkspace.id)

        const label = kind === 'dataset' ? 'Dataset deleted' : kind === 'result' ? 'Saved result deleted' : 'Model deleted'
        dispatchToast('success', label)
      }
    } finally {
      setIsDeleting(false)
      setPendingDelete(null)
    }
  }

  const handleDelete = async (id: string, kind: 'workspace' | 'model' | 'dataset' | 'result') => {
    let targetName = ''
    if (kind === 'workspace') {
      targetName = getWorkspaceLabel(workspaces.find((ws) => ws.id === id)?.name || '')
    } else {
      const owningWorkspace = workspaces.find((ws) => ws.children.some((child) => child.id === id))
      const childName = owningWorkspace?.children.find(c => c.id === id)?.name || ''
      targetName = kind === 'model' ? getModelLabel(childName) : childName
    }
    setPendingDelete({ id, name: targetName, kind })
  }

  // ── Change workspace color ────────────────────────────────────────────────
  const handleChangeColor = (id: string, color: string) => {
    setWorkspaces((prev) => prev.map((ws) => ws.id === id ? { ...ws, color } : ws))
  }

  // ── Context menu trigger ─────────────────────────────────────────────────
  const openCtxMenu = (e: React.MouseEvent, id: string, kind: 'workspace' | 'model' | 'dataset' | 'result') => {
    e.preventDefault()
    e.stopPropagation()
    const ws = kind === 'workspace' ? workspaces.find(w => w.id === id) : undefined
    setCtxMenu({ x: e.clientX, y: e.clientY, kind, id, pinned: ws?.pinned })
  }

  const filtered = workspaces.filter((ws) =>
    getWorkspaceLabel(ws.name).toLowerCase().includes(search.toLowerCase())
  )

  const sortedFiltered = [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return 0
  })

  const togglePin = (id: string) => {
    setWorkspaces(prev => {
      const updated = prev.map(w => w.id === id ? { ...w, pinned: !w.pinned } : w)
      if ((window as any).electronAPI?.saveWorkspace) {
        const targetWs = updated.find(w => w.id === id)
        if (targetWs) (window as any).electronAPI.saveWorkspace(targetWs)
      }
      return updated
    })
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id)
    setDraggedWsId(id)
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (draggedWsId && draggedWsId !== id) {
      setDragOverWsId(id)
    }
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    setDragOverWsId(null)
    const sourceId = e.dataTransfer.getData('text/plain')
    if (sourceId && sourceId !== targetId) {
      setWorkspaces(prev => {
        // Enforce pinned partition visually when sorting indexes
        const sorted = [...prev].sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return 0
        })

        const sourceIndex = sorted.findIndex(w => w.id === sourceId)
        const targetIndex = sorted.findIndex(w => w.id === targetId)

        if (sourceIndex === -1 || targetIndex === -1) return prev

        const newArr = [...sorted]
        const [removed] = newArr.splice(sourceIndex, 1)
        newArr.splice(targetIndex, 0, removed)

        // Save reordered array to persist dragging
        if ((window as any).electronAPI?.saveWorkspace) {
          // You ideally need to save all workspaces to persist array ordering
          // If a backend stores workspace list order, it would be called here
        }
        return newArr
      })
    }
    setDraggedWsId(null)
  }

  const selectedWorkspace =
    workspaces.find((ws) => ws.id === activeId || ws.children.some((c) => c.id === activeId)) ??
    workspaces[0] ??
    null
  const activeWorkspace = selectedWorkspace ? migrateWorkspace(selectedWorkspace as any) : null

  const models   = activeWorkspace?.children.filter((c) => c.type === 'model')   ?? []
  const results  = [...(activeWorkspace?.children.filter((c) => c.type === 'result')  ?? [])].sort((a, b) => resolveSortTime(b) - resolveSortTime(a))
  const workspaceDatasets = activeWorkspace ? getWorkspaceDatasets(activeWorkspace as any) : []
  const defaultDataset = workspaceDatasets.find((dataset: any) => dataset.id === (activeWorkspace as any)?.defaultDatasetId) ?? workspaceDatasets[0]
  const datasets = defaultDataset ? [defaultDataset] : []

  const resolveDatasetContext = useCallback((datasetId: string) => {
    const owningWorkspace = workspaces.find((workspace) =>
      workspace.children.some((child) => child.id === datasetId && child.type === 'dataset')
    )
    if (!owningWorkspace) return null

    const migratedWorkspace = migrateWorkspace(owningWorkspace as any)
    const dataset = getWorkspaceDatasets(migratedWorkspace as any).find((entry: any) => entry.id === datasetId)
      ?? migratedWorkspace.children.find((child) => child.id === datasetId && child.type === 'dataset')

    if (!dataset) return null

    return {
      workspace: migratedWorkspace,
      dataset,
    }
  }, [workspaces])

  const openDataset = useCallback((datasetId: string) => {
    const resolved = resolveDatasetContext(datasetId)
    if (!resolved) return

    setActiveId(datasetId)
    navigate(`/dataview/${resolved.workspace.id}/${datasetId}`, {
      state: {
        source: 'workspace-home' as const,
        returnTo: '/',
      },
    })
  }, [navigate, resolveDatasetContext, setActiveId])

  const openWorkspaceChild = useCallback((child: WorkspaceChild) => {
    if (isCurrentlyRenaming(child.id)) return
    setActiveId(child.id)
    navigate(`/canvas/${child.id}`)
  }, [navigate, renamingId, setActiveId])

  const openDatasetManager = useCallback((datasetId?: string) => {
    if (datasetId) {
      const resolved = resolveDatasetContext(datasetId)
      if (!resolved) return
      setActiveId(datasetId)
    }
    setShowDatasetChoice(true)
  }, [resolveDatasetContext, setActiveId])
  const resultsExpanded = activeWorkspace ? !!expandedResultsByWorkspace[activeWorkspace.id] : false
  const isResultsPanelHighlighted = highlightedPanel?.workspaceId === activeWorkspace?.id && highlightedPanel?.panel === 'results'
  const isDatasetsPanelHighlighted = highlightedPanel?.workspaceId === activeWorkspace?.id && highlightedPanel?.panel === 'datasets'

  const focusWorkspacePanel = useCallback((workspaceId: string, panel: WorkspacePanelKind) => {
    const focus = { workspaceId, panel, nonce: Date.now() }
    setActiveId(workspaceId)
    setHighlightedPanel(focus)
    setPendingPanelFocus(focus)
    if (panel === 'results') {
      setExpandedResultsByWorkspace((prev) => ({
        ...prev,
        [workspaceId]: true,
      }))
    }
  }, [setActiveId])

  useEffect(() => {
    if (!pendingPanelFocus || activeWorkspace?.id !== pendingPanelFocus.workspaceId) return
    const target = pendingPanelFocus.panel === 'datasets' ? datasetsPanelRef.current : resultsPanelRef.current
    const frameId = window.requestAnimationFrame(() => {
      target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
    const timeoutId = window.setTimeout(() => {
      setHighlightedPanel((current) => current?.nonce === pendingPanelFocus.nonce ? null : current)
      setPendingPanelFocus((current) => current?.nonce === pendingPanelFocus.nonce ? null : current)
    }, 1800)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
    }
  }, [activeWorkspace?.id, pendingPanelFocus, resultsExpanded])

  const toggleResultsExpanded = () => {
    if (!activeWorkspace) return
    setExpandedResultsByWorkspace((prev) => ({
      ...prev,
      [activeWorkspace.id]: !prev[activeWorkspace.id],
    }))
  }

  return (
    <div className="flex h-full" style={{ backgroundColor: 'var(--color-sidebar-bg)' }}>

      {/* ═══════ SIDEBAR ═══════ */}
      <aside
        className="flex flex-col shrink-0 relative"
        style={{
          width: sidebarWidth,
          backgroundColor: 'var(--color-sidebar-bg)',
          padding: '16px 12px',
          gap: 12,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-1">
          <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600 }}>
            Workspaces
          </span>
          <button
            id="tour-new-workspace"
            title="New Workspace"
            onClick={() => window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: 'new-workspace' } }))}
            className="flex items-center justify-center transition-colors rounded"
            style={{
              width: 24,
              height: 24,
              backgroundColor: 'transparent',
              border: '1px solid transparent',
              borderRadius: 6,
              boxShadow: 'none',
            }}
          >
            <PlusCircle size={15} color="var(--color-accent)" weight="bold" />
          </button>
        </div>

        {/* Search */}
        <div
          className="flex items-center transition-colors"
          style={{
            height: 34,
            backgroundColor: 'var(--color-search-bg)',
            borderRadius: 8,
            border: `1px solid ${searchFocused ? 'var(--color-border)' : 'transparent'}`,
            padding: '0 10px',
            gap: 8,
          }}
        >
          <MagnifyingGlass size={13} color="var(--color-text-muted)" />
          <input
            id="tour-search-workspace"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search workspaces"
            className="bg-transparent outline-none flex-1"
            style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}
          />
        </div>

        {/* Workspace tree */}
        <div className="flex-1 overflow-y-auto flex flex-col" style={{ gap: 4 }}>
          {sortedFiltered.map((ws) => {
            const isExpanded = ws.expanded
            const isActive = activeId === ws.id || ws.children.some((c) => c.id === activeId)
            const isDragOver = dragOverWsId === ws.id
            const sidebarWorkspace = migrateWorkspace(ws as any)
            const sidebarDatasets = getWorkspaceDatasets(sidebarWorkspace as any)
            const sidebarResults = [...sidebarWorkspace.children.filter((c) => c.type === 'result')].sort((a, b) => resolveSortTime(b) - resolveSortTime(a))
            const datasetSummary = getSidebarDatasetSummary(sidebarDatasets)
            const resultSummary = getSidebarResultSummary(sidebarResults)
            const datasetSummaryId = datasetSummary ? `sidebar-${ws.id}-datasets` : ''
            const resultSummaryId = resultSummary ? `sidebar-${ws.id}-results` : ''
            const workspaceColor = normalizeWorkspaceAccentColor(ws.color)

            return (
              <div
                key={ws.id}
                draggable
                onDragStart={(e) => handleDragStart(e, ws.id)}
                onDragOver={(e) => handleDragOver(e, ws.id)}
                onDrop={(e) => handleDrop(e, ws.id)}
                style={{
                  borderTop: isDragOver ? '2px solid var(--color-accent)' : '2px solid transparent',
                  opacity: draggedWsId === ws.id ? 0.5 : 1
                }}
              >
                {isExpanded ? (
                  <div
                    style={{
                      background: isActive
                        ? workspaceActiveBackground(workspaceColor)
                        : 'var(--color-workspace-expanded)',
                      border: isActive ? workspaceActiveBorder(workspaceColor) : '1px solid var(--color-border)',
                      boxShadow: isActive
                        ? 'inset 0 1px 0 rgba(255,255,255,0.05)'
                        : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                      borderRadius: 12,
                      padding: '8px 0',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {/* Header row: caret (toggle only) + folder+name (select only) */}
                    <div
                      className="flex items-center w-full"
                      style={{
                        width: 'calc(100% - 16px)',
                        padding: '0 10px',
                        height: 28,
                        margin: '0 8px',
                        boxSizing: 'border-box',
                        borderRadius: 9,
                        background: isActive ? workspaceActiveHeaderBackground(workspaceColor) : 'transparent',
                      }}
                      onContextMenu={(e) => openCtxMenu(e, ws.id, 'workspace')}
                    >
                      <button
                        onClick={() => toggle(ws.id)}
                        className="flex items-center justify-center shrink-0 rounded transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.75)]"
                        style={{ width: 17, height: 20 }}
                      >
                        <CaretDown size={11} color="var(--color-text-muted)" />
                      </button>
                      <button
                        onClick={() => {
                          if (isCurrentlyRenaming(ws.id)) return
                          setActiveId(ws.id)
                        }}
                        className="flex items-center min-w-0 flex-1 text-left"
                        style={{ gap: 5 }}
                      >
                        {ws.pinned && <PushPin size={11} color="var(--color-accent)" weight="fill" style={{ flexShrink: 0 }} />}
                        <WorkspaceFolderIcon color={workspaceColor} expanded />
                        {renamingId === ws.id ? (
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={handleRenameInputKeyDown}
                            onKeyUp={stopRenameEventPropagation}
                            onClick={stopRenameEventPropagation}
                            onMouseDown={stopRenameEventPropagation}
                            onPointerDown={stopRenameEventPropagation}
                            className="outline-none flex-1 min-w-0"
                            style={{
                              backgroundColor: 'transparent',
                              borderBottom: `1px solid ${workspaceColor}`,
                              color: workspaceColor,
                              fontFamily: 'DM Sans, sans-serif',
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          />
                        ) : (
                          <span style={{
                            color: 'var(--color-text-primary)',
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: 12,
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {getWorkspaceLabel(ws.name)}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Children */}
                    <div className="flex flex-col" style={{ marginTop: 2 }}>
                      {ws.children.filter((c) => c.type === 'model').map((child) => (
                        <button
                          key={child.id}
                          onClick={() => {
                            if (isCurrentlyRenaming(child.id)) return
                            setActiveId(ws.id)
                            navigate(`/canvas/${child.id}`)
                          }}
                          onMouseEnter={() => setHoveredId(child.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          onContextMenu={(e) => openCtxMenu(e, child.id, 'model')}
                          className="flex items-center w-full text-left transition-colors"
                          style={{
                            width: 'calc(100% - 16px)',
                            boxSizing: 'border-box',
                            gap: 6,
                            height: 28,
                            margin: '0 8px',
                            paddingLeft: 27,
                            paddingRight: 10,
                            background: activeId === child.id
                              ? `linear-gradient(180deg, ${hexToRgba(workspaceColor, 0.11)} 0%, rgba(255,255,255,0.018) 100%)`
                              : hoveredId === child.id
                                ? hexToRgba(workspaceColor, 0.12)
                                : 'transparent',
                            border: activeId === child.id
                              ? `1px solid ${hexToRgba(workspaceColor, 0.14)}`
                              : hoveredId === child.id
                                ? `1px solid ${hexToRgba(workspaceColor, 0.22)}`
                                : '1px solid transparent',
                            boxShadow: activeId === child.id
                              ? 'inset 0 1px 0 rgba(255,255,255,0.045)'
                              : hoveredId === child.id
                                ? 'inset 0 1px 0 rgba(255,255,255,0.02)'
                                : 'none',
                            backdropFilter: activeId === child.id ? 'blur(8px) saturate(106%)' : 'none',
                            borderRadius: activeId === child.id || hoveredId === child.id ? 8 : 0,
                          }}
                        >
                          <Graph size={12} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
                          {renamingId === child.id ? (
                            <input
                              ref={renameInputRef}
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={handleRenameInputKeyDown}
                              onKeyUp={stopRenameEventPropagation}
                              onClick={stopRenameEventPropagation}
                              onMouseDown={stopRenameEventPropagation}
                              onPointerDown={stopRenameEventPropagation}
                              className="outline-none flex-1 min-w-0"
                              style={{
                                backgroundColor: 'transparent',
                                borderBottom: '1px solid var(--color-accent)',
                                color: 'var(--color-text-primary)',
                                fontFamily: 'DM Sans, sans-serif',
                                fontSize: 11,
                                fontWeight: 500,
                              }}
                            />
                          ) : (
                            <span style={{
                              color: activeId === child.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                              fontFamily: 'DM Sans, sans-serif',
                              fontSize: 11,
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                            }}>
                              {getModelLabel(child.name)}
                            </span>
                          )}
                        </button>
                      ))}

                      {resultSummary && (
                        <button
                          key={resultSummary.id}
                          onClick={() => focusWorkspacePanel(ws.id, 'results')}
                          onMouseEnter={() => setHoveredId(resultSummaryId)}
                          onMouseLeave={() => setHoveredId(null)}
                          className="flex items-center w-full text-left transition-colors"
                          style={{
                            width: 'calc(100% - 16px)',
                            boxSizing: 'border-box',
                            gap: 6,
                            height: 28,
                            margin: '0 8px',
                            paddingLeft: 27,
                            paddingRight: 10,
                            background: highlightedPanel?.workspaceId === ws.id && highlightedPanel.panel === 'results'
                              ? `linear-gradient(180deg, ${hexToRgba(workspaceColor, 0.13)} 0%, rgba(255,255,255,0.02) 100%)`
                              : hoveredId === resultSummaryId
                                ? hexToRgba(workspaceColor, 0.12)
                                : 'transparent',
                            border: highlightedPanel?.workspaceId === ws.id && highlightedPanel.panel === 'results'
                              ? `1px solid ${hexToRgba(workspaceColor, 0.2)}`
                              : hoveredId === resultSummaryId
                                ? `1px solid ${hexToRgba(workspaceColor, 0.22)}`
                                : '1px solid transparent',
                            boxShadow: highlightedPanel?.workspaceId === ws.id && highlightedPanel.panel === 'results'
                              ? 'inset 0 1px 0 rgba(255,255,255,0.045)'
                              : hoveredId === resultSummaryId
                                ? 'inset 0 1px 0 rgba(255,255,255,0.02)'
                                : 'none',
                            borderRadius: highlightedPanel?.workspaceId === ws.id && highlightedPanel.panel === 'results' || hoveredId === resultSummaryId ? 8 : 0,
                          }}
                        >
                          <FileCode size={12} style={{ flexShrink: 0, color: 'rgb(var(--color-accent-rgb) / 0.72)' }} />
                          <span style={{
                            color: 'var(--color-text-secondary)',
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: 11,
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}>
                            {resultSummary.label}
                          </span>
                        </button>
                      )}

                      {datasetSummary && (
                        <button
                          key={datasetSummary.id}
                          onClick={() => openDatasetManager(sidebarDatasets[0]?.id)}
                          onMouseEnter={() => setHoveredId(datasetSummaryId)}
                          onMouseLeave={() => setHoveredId(null)}
                          className="flex items-center w-full text-left transition-colors"
                          style={{
                            width: 'calc(100% - 16px)',
                            boxSizing: 'border-box',
                            gap: 6,
                            height: 28,
                            margin: '0 8px',
                            paddingLeft: 27,
                            paddingRight: 10,
                            background: highlightedPanel?.workspaceId === ws.id && highlightedPanel.panel === 'datasets'
                              ? `linear-gradient(180deg, ${hexToRgba(workspaceColor, 0.13)} 0%, rgba(255,255,255,0.02) 100%)`
                              : hoveredId === datasetSummaryId
                                ? hexToRgba(workspaceColor, 0.12)
                                : 'transparent',
                            border: highlightedPanel?.workspaceId === ws.id && highlightedPanel.panel === 'datasets'
                              ? `1px solid ${hexToRgba(workspaceColor, 0.2)}`
                              : hoveredId === datasetSummaryId
                                ? `1px solid ${hexToRgba(workspaceColor, 0.22)}`
                                : '1px solid transparent',
                            boxShadow: highlightedPanel?.workspaceId === ws.id && highlightedPanel.panel === 'datasets'
                              ? 'inset 0 1px 0 rgba(255,255,255,0.045)'
                              : hoveredId === datasetSummaryId
                                ? 'inset 0 1px 0 rgba(255,255,255,0.02)'
                                : 'none',
                            borderRadius: highlightedPanel?.workspaceId === ws.id && highlightedPanel.panel === 'datasets' || hoveredId === datasetSummaryId ? 8 : 0,
                          }}
                        >
                          <FileCsv size={12} color="#32D583" style={{ flexShrink: 0 }} />
                          <span style={{
                            color: 'var(--color-text-secondary)',
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: 11,
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}>
                            {datasetSummary.label}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Collapsed */
                  <div
                    className="flex items-center w-full"
                    onMouseEnter={() => setHoveredId(ws.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onContextMenu={(e) => openCtxMenu(e, ws.id, 'workspace')}
                    style={{
                      width: 'calc(100% - 16px)',
                      boxSizing: 'border-box',
                      borderRadius: 12,
                      margin: '0 8px',
                      padding: '0 10px',
                      height: 32,
                      background: isActive
                        ? workspaceActiveBackground(workspaceColor)
                        : hoveredId === ws.id
                          ? hexToRgba(workspaceColor, 0.12)
                          : 'transparent',
                      border: isActive
                        ? workspaceActiveBorder(workspaceColor)
                        : hoveredId === ws.id
                          ? `1px solid ${hexToRgba(workspaceColor, 0.22)}`
                          : '1px solid transparent',
                      boxShadow: isActive
                        ? 'inset 0 1px 0 rgba(255,255,255,0.05)'
                        : 'none',
                    }}
                  >
                    <button
                      onClick={() => toggle(ws.id)}
                      className="flex items-center justify-center shrink-0 rounded transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.75)]"
                      style={{ width: 17, height: 20 }}
                    >
                      <CaretRight size={11} color="var(--color-text-muted)" />
                    </button>
                    <button
                      onClick={() => {
                        if (isCurrentlyRenaming(ws.id)) return
                        toggle(ws.id)
                        setActiveId(ws.id)
                      }}
                      className="flex items-center min-w-0 flex-1 text-left"
                      style={{ gap: 5 }}
                    >
                      {ws.pinned && <PushPin size={11} color="var(--color-accent)" weight="fill" style={{ flexShrink: 0 }} />}
                      <WorkspaceFolderIcon color={workspaceColor} expanded={false} />
                      {renamingId === ws.id ? (
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={handleRenameInputKeyDown}
                          onKeyUp={stopRenameEventPropagation}
                          onClick={stopRenameEventPropagation}
                          onMouseDown={stopRenameEventPropagation}
                          onPointerDown={stopRenameEventPropagation}
                          className="outline-none flex-1 min-w-0"
                          style={{
                            backgroundColor: 'transparent',
                            borderBottom: `1px solid ${workspaceColor}`,
                            color: workspaceColor,
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                        />
                      ) : (
                        <span style={{
                          color: 'var(--color-text-primary)',
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: 12,
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {getWorkspaceLabel(ws.name)}
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={onResizeStart}
          className="absolute top-2 bottom-2 right-0 w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-10"
          style={{ borderRadius: '0 12px 12px 0' }}
        />
      </aside>

      {/* ═══════ MAIN CONTENT ═══════ */}
      <main
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--color-right-panel-bg)',
          borderRadius: '12px 0 0 12px',
          padding: '16px 16px 16px 16px',
          gap: 20
        }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between shrink-0">
          <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 18, fontWeight: 700 }}>
            {activeWorkspace ? getWorkspaceLabel(activeWorkspace.name) : 'No Workspace Selected'}
          </span>
          <div className="flex items-center" style={{ gap: 8 }}>
            {/* Grid / List toggle */}
            <div
              className="flex items-center"
              style={{ backgroundColor: 'var(--color-toggle-track-bg)', borderRadius: 8, padding: 3, gap: 2 }}
            >
              <button
                id="tour-grid-view"
                onClick={() => setViewMode('grid')}
                title="Grid view"
                className="flex items-center justify-center transition-colors"
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  backgroundColor: viewMode === 'grid' ? 'var(--color-toggle-active-bg)' : 'transparent',
                  boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <SquaresFour size={15} color={viewMode === 'grid' ? 'var(--color-text-primary)' : 'var(--color-text-muted)'} />
              </button>
              <button
                id="tour-list-view"
                onClick={() => setViewMode('list')}
                title="List view"
                className="flex items-center justify-center transition-colors"
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  backgroundColor: viewMode === 'list' ? 'var(--color-toggle-active-bg)' : 'transparent',
                  boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <Rows size={15} color={viewMode === 'list' ? 'var(--color-text-primary)' : 'var(--color-text-muted)'} />
              </button>
            </div>

            {/* New Model */}
            {models.length > 0 && (
              <button
                id="tour-new-model"
                onClick={() => window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: 'new-model' } }))}
                className="flex items-center"
                style={{
                  gap: 7,
                  padding: '7px 12px',
                  borderRadius: 8,
                  backgroundColor: 'var(--color-accent)',
                  border: '1px solid rgb(var(--color-accent-rgb) / 0.42)',
                  boxShadow: '0 8px 18px rgb(var(--color-accent-rgb) / 0.16)',
                }}
              >
                <Plus size={14} weight="bold" color="var(--color-on-accent)" />
                <span style={{ color: 'var(--color-on-accent)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700 }}>
                  New Model
                </span>
              </button>
            )}
          </div>
        </div>

        {/* ── GRID VIEW ── */}
        {viewMode === 'grid' && (
          <div className="flex-1 overflow-y-auto">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(216px, 1fr))',
                gap: 14,
              }}
            >
              {models.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', minHeight: 520 }}>
                  <EmptyState
                    onAdd={() => window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: 'new-model' } }))}
                  />
                </div>
              ) : (
                models.map((model) => (
                  <div
                    key={model.id}
                    onMouseEnter={() => setHoveredId(model.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onContextMenu={(e) => openCtxMenu(e, model.id, 'model')}
                    className="flex flex-col text-left"
                    style={{
                      width: '100%',
                      gap: 10,
                    }}
                  >
                    <button
                      onClick={() => openWorkspaceChild(model)}
                      className="w-full transition-transform duration-150"
                      style={{
                        padding: 0,
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        borderRadius: 12,
                        transform: hoveredId === model.id ? 'translateY(-1px)' : 'none',
                      }}
                    >
                      <ModelDiagramPreview model={model} accentColor={normalizeWorkspaceAccentColor(activeWorkspace?.color)} />
                    </button>

                    <div className="flex items-start justify-between w-full" style={{ gap: 10, padding: '0 2px' }}>
                      <div className="flex flex-col min-w-0" style={{ gap: 4 }}>
                        <span
                          style={{
                            color: 'var(--color-text-primary)',
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: 14,
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {getModelLabel(model.name)}
                        </span>
                        <span
                          style={{
                            color: 'var(--color-text-muted)',
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                        >
                          {formatRelativeAge(resolveUpdatedAt(model))}
                        </span>
                      </div>
                      {model.badge && (
                        <div style={{ flexShrink: 0, marginTop: 1 }}>
                          <Badge status={model.badge} />
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}

              {models.length > 0 && (
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: 'new-model' } }))}
                    onMouseEnter={() => setHoveredId('new-model')}
                    onMouseLeave={() => setHoveredId(null)}
                  className="flex flex-col items-center justify-center transition-all"
                  style={{
                    width: '100%',
                    minHeight: 178,
                    borderRadius: 12,
                    background: hoveredId === 'new-model' ? 'var(--color-hover)' : 'var(--color-workspace-expanded)',
                    border: '1px dashed var(--color-border)',
                    gap: 8,
                  }}
                >
                  <Plus size={18} color={hoveredId === 'new-model' ? 'var(--color-accent)' : 'var(--color-text-muted)'} />
                  <span style={{
                    color: hoveredId === 'new-model' ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600,
                  }}>
                    New Model
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {viewMode === 'list' && (
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col" style={{ gap: 2 }}>
              <div className="flex items-center" style={{ padding: '0 12px', height: 28, gap: 12 }}>
                <span style={{ flex: 1, color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Name</span>
                <span style={{ width: 120, color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Status</span>
                <span style={{ width: 124, color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Created</span>
                <span style={{ width: 124, color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Updated</span>
                <span style={{ width: 60 }} />
              </div>
              <div style={{ height: 1, backgroundColor: 'var(--color-surface)' }} />

              {models.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', minHeight: 520 }}>
                  <EmptyState
                    onAdd={() => window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: 'new-model' } }))}
                  />
                </div>
              ) : (
                models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => openWorkspaceChild(model)}
                    onMouseEnter={() => setHoveredId(model.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onContextMenu={(e) => openCtxMenu(e, model.id, 'model')}
                    className="flex items-center w-full text-left transition-colors"
                    style={{
                      width: 'calc(100% - 16px)',
                      boxSizing: 'border-box',
                      margin: '0 8px',
                      padding: '0 12px', height: 44, borderRadius: 8, gap: 12,
                      backgroundColor: hoveredId === model.id ? 'var(--color-surface)' : 'transparent',
                    }}
                  >
                    <div className="flex items-center flex-1 min-w-0" style={{ gap: 8 }}>
                      <Graph size={14} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
                      <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getModelLabel(model.name)}
                      </span>
                    </div>
                    <div style={{ width: 120 }}>{model.badge && <Badge status={model.badge} />}</div>
                    <span style={{ width: 124, color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {formatRelativeAge(resolveCreatedAt(model))}
                    </span>
                    <span style={{ width: 124, color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {formatRelativeAge(resolveUpdatedAt(model))}
                    </span>
                    <div className="flex items-center justify-center" style={{ width: 60, gap: 4 }}>
                      <ArrowRight size={13} color={hoveredId === model.id ? 'var(--color-accent)' : 'var(--color-text-muted)'} />
                      <span style={{ color: hoveredId === model.id ? 'var(--color-accent)' : 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11 }}>Open</span>
                    </div>
                  </button>
                ))
              )}

              {models.length > 0 && (
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: 'new-model' } }))}
                  onMouseEnter={() => setHoveredId('new-model')}
                  onMouseLeave={() => setHoveredId(null)}
                  className="flex items-center w-full text-left transition-colors"
                  style={{
                    width: 'calc(100% - 16px)',
                    boxSizing: 'border-box',
                    margin: '0 8px',
                    padding: '0 12px', height: 44, borderRadius: 8, gap: 8,
                    backgroundColor: hoveredId === 'new-model' ? 'rgb(var(--color-accent-rgb) / 0.12)' : 'transparent',
                  }}
                >
                  <Plus size={14} color={hoveredId === 'new-model' ? 'var(--color-accent)' : 'var(--color-text-muted)'} style={{ flexShrink: 0 }} />
                  <span style={{ color: hoveredId === 'new-model' ? 'var(--color-accent)' : 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 500 }}>New Model</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Saved results section */}
        {results.length > 0 && (
          <div
            ref={resultsPanelRef}
            style={{
              marginTop: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              borderRadius: 12,
              padding: isResultsPanelHighlighted ? 10 : 0,
              backgroundColor: isResultsPanelHighlighted ? 'rgb(var(--color-accent-rgb) / 0.08)' : 'transparent',
              border: isResultsPanelHighlighted ? '1px solid rgb(var(--color-accent-rgb) / 0.24)' : '1px solid transparent',
              transition: 'background-color 180ms ease, border-color 180ms ease, padding 180ms ease',
            }}
          >
            <div className="flex items-center justify-between">
              <button
                onClick={toggleResultsExpanded}
                className="flex items-center text-left"
                style={{ gap: 8 }}
              >
                {resultsExpanded ? (
                  <CaretDown size={13} color="var(--color-text-muted)" />
                ) : (
                  <CaretRight size={13} color="var(--color-text-muted)" />
                )}
                <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 600 }}>
                  Saved Results
                </span>
              </button>
              <span style={{ color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 600 }}>
                {results.length} {results.length === 1 ? 'result' : 'results'}
              </span>
            </div>
            {resultsExpanded && (
              <div
                className="flex shrink-0 overflow-x-auto"
                style={{
                  gap: 10,
                  paddingBottom: 4,
                  scrollSnapType: 'x proximity',
                }}
              >
                {results.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      setActiveId(result.id)
                      const fallbackModelId = activeWorkspace?.children.find((c) => c.type === 'model')?.id
                      const linkedModelId = result.linkedModelId || fallbackModelId || result.id
                      navigate(`/results/${linkedModelId}`, {
                        state: {
                          savedResultId: result.id,
                          savedAnalysis: result.state?.analysis,
                          savedModelSnapshot: result.state?.modelSnapshot,
                        },
                      })
                    }}
                    onMouseEnter={() => setHoveredId(result.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onContextMenu={(e) => openCtxMenu(e, result.id, 'result')}
                    className="flex flex-col text-left transition-colors"
                    style={{
                      minWidth: 228,
                      maxWidth: 228,
                      flexShrink: 0,
                      borderRadius: 12,
                      padding: '12px 14px',
                      gap: 10,
                      backgroundColor: hoveredId === result.id ? 'var(--color-border)' : 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                      scrollSnapAlign: 'start',
                    }}
                  >
                    <div className="flex items-center justify-between" style={{ gap: 10 }}>
                      <div className="flex items-center" style={{ gap: 8, minWidth: 0 }}>
                        <FileCode size={15} style={{ flexShrink: 0, color: 'rgb(var(--color-accent-rgb) / 0.72)' }} />
                        <span
                          style={{
                            color: 'var(--color-text-muted)',
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: 11,
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatRelativeAge(resolveUpdatedAt(result))}
                        </span>
                      </div>
                      <ArrowRight size={12} color={hoveredId === result.id ? 'rgb(var(--color-accent-rgb) / 0.72)' : 'var(--color-text-muted)'} />
                    </div>
                    <div className="flex flex-col flex-1 min-w-0" style={{ gap: 4 }}>
                      <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {result.name}
                      </span>
                      <span style={{ color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {result.meta || 'Saved analysis output'}
                      </span>
                      <span style={{ color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11 }}>
                        Created {formatRelativeAge(resolveCreatedAt(result))}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {datasets.length > 0 && (
          <div
            ref={datasetsPanelRef}
            style={{
              marginTop: 10,
              borderRadius: 12,
              padding: isDatasetsPanelHighlighted ? 10 : 0,
              backgroundColor: isDatasetsPanelHighlighted ? 'rgb(var(--color-accent-rgb) / 0.08)' : 'transparent',
              border: isDatasetsPanelHighlighted ? '1px solid rgb(var(--color-accent-rgb) / 0.24)' : '1px solid transparent',
              transition: 'background-color 180ms ease, border-color 180ms ease, padding 180ms ease',
            }}
          >
            <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 600 }}>
              Dataset
            </span>
            <div className="flex flex-col shrink-0" style={{ gap: 8, marginTop: 12 }}>
              {datasets.map((dataset) => (
                <div
                  key={dataset.id}
                  className="flex items-center"
                  style={{ borderRadius: 10, backgroundColor: 'var(--color-chrome)', padding: '10px 14px', gap: 12, position: 'relative' }}
                >
                  <FileCsv size={18} color="var(--color-accent)" style={{ flexShrink: 0 }} />
                  <div className="flex flex-col flex-1 min-w-0" style={{ gap: 2 }}>
                    <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {dataset.name}
                    </span>
                    {dataset.meta && (
                      <span style={{ color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11 }}>
                        {dataset.meta}
                      </span>
                    )}
                  </div>
                  <div ref={openDatasetMenuId === dataset.id ? datasetMenuRef : undefined} style={{ position: 'relative' }}>
                    <button
                      id="tour-update-dataset"
                      onClick={() => setOpenDatasetMenuId((current) => current === dataset.id ? null : dataset.id)}
                      className="flex items-center justify-center transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.75)]"
                      style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                    >
                      <DotsThreeVertical size={14} color="var(--color-text-secondary)" weight="bold" />
                    </button>

                    {openDatasetMenuId === dataset.id && (
                      <div
                        className="flex flex-col"
                        style={{
                          position: 'absolute',
                          bottom: 34,
                          right: 0,
                          width: 136,
                          borderRadius: 10,
                          backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          boxShadow: '0 14px 36px rgba(0,0,0,0.55)',
                          padding: '6px 0',
                          zIndex: 40,
                          transformOrigin: 'bottom right',
                        }}
                      >
                        <button
                          onClick={() => {
                            setOpenDatasetMenuId(null)
                            openDataset(dataset.id)
                          }}
                          className="flex items-center transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.75)]"
                          style={{ height: 34, padding: '0 12px', gap: 8, textAlign: 'left' }}
                        >
                          <ArrowRight size={12} color="var(--color-text-secondary)" />
                          <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600 }}>Open</span>
                        </button>
                        <button
                          onClick={() => {
                            setOpenDatasetMenuId(null)
                            openDatasetManager(dataset.id)
                          }}
                          className="flex items-center transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.75)]"
                          style={{ height: 34, padding: '0 12px', gap: 8, textAlign: 'left' }}
                        >
                          <ArrowsClockwise size={12} color="var(--color-text-secondary)" />
                          <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600 }}>Manage</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Hidden file inputs removed - now using Electron native dialogs via App.tsx */}

      {/* ─── Context Menu ─── */}
      {ctxMenu && (
        <SidebarContextMenu
          menu={ctxMenu}
          onViewDataset={openDataset}
          onManageDataset={openDatasetManager}
          onRename={startRename}
          onDelete={handleDelete}
          onChangeColor={handleChangeColor}
          onTogglePin={togglePin}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* ─── Dataset Manager ─── */}
      {showDatasetChoice && (
        activeWorkspace && (
          <DatasetManagerModal
            workspace={activeWorkspace as any}
            workspaces={workspaces as any}
            setWorkspaces={setWorkspaces as any}
            context="workspace-home"
            onClose={() => setShowDatasetChoice(false)}
            onBrowse={() => {
              setShowDatasetChoice(false)
              window.dispatchEvent(new CustomEvent('pls:open-import-picker', {
                detail: {
                  returnTo: '/',
                  source: 'workspace-home',
                  saveMode: 'save-as-new',
                },
              }))
            }}
            onViewDataset={openDataset}
          />
        )
      )}

      {/* ─── Generic Delete Confirmation Modal ─── */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-[240] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.72)' }}
          onClick={() => {
            if (isDeleting) return
            setPendingDelete(null)
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`${isModalShaking ? 'animate-shake' : ''}`}
            style={{
              width: 500,
              background: 'var(--color-page)',
              borderRadius: 14,
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-modal)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <WarningCircle size={18} color="var(--color-danger)" weight="fill" />
                <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 700 }}>
                  Delete {pendingDelete.kind.charAt(0).toUpperCase() + pendingDelete.kind.slice(1)}
                </span>
              </div>
              <button
                onClick={() => {
                  if (isDeleting) return
                  setPendingDelete(null)
                }}
                style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={15} color="#5A5A6A" />
              </button>
            </div>

            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, lineHeight: 1.5 }}>
                This will permanently delete <strong>{pendingDelete.name}</strong> from this workspace.
              </span>
              <span style={{ color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>
                This action cannot be undone.
              </span>
            </div>

            <div style={{ padding: '0 16px 16px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => {
                  if (isDeleting) return
                  setPendingDelete(null)
                }}
                style={{
                  height: 34,
                  padding: '0 12px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => executeDelete(pendingDelete.id, pendingDelete.kind)}
                disabled={isDeleting}
                style={{
                  height: 34,
                  padding: '0 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--color-danger)',
                  color: 'var(--color-on-accent)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  opacity: isDeleting ? 0.7 : 1,
                }}
              >
                {isDeleting ? 'Deleting…' : `Delete ${pendingDelete.kind.charAt(0).toUpperCase() + pendingDelete.kind.slice(1)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
