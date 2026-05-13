import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BugBeetle,
  CaretDown,
  Copy,
  FloppyDisk,
  Trash,
  X,
} from '@phosphor-icons/react'
import {
  clearDiagnostics,
  formatDiagnosticsAsJson,
  formatDiagnosticsForCopy,
  getDiagnostics,
  subscribeDiagnostics,
  type DiagnosticCategory,
  type DiagnosticEntry,
} from '../utils/diagnostics'

interface DiagnosticsConsoleProps {
  open: boolean
  onClose: () => void
}

type DiagnosticsFilter = 'all' | DiagnosticCategory

type FrameState = {
  x: number
  y: number
  width: number
  height: number
}

const FILTERS: Array<{ id: DiagnosticsFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'calculation', label: 'Calculation' },
  { id: 'dataset', label: 'Dataset' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'ui', label: 'UI' },
]

const MIN_WIDTH = 520
const MIN_HEIGHT = 280

function createDefaultFrame(): FrameState {
  if (typeof window === 'undefined') {
    return { x: 24, y: 56, width: 700, height: 420 }
  }

  const width = Math.min(700, Math.max(MIN_WIDTH, window.innerWidth - 48))
  const height = Math.min(420, Math.max(MIN_HEIGHT, window.innerHeight - 96))
  const x = Math.max(16, window.innerWidth - width - 24)
  const y = 56
  return { x, y, width, height }
}

function clampFrame(frame: FrameState): FrameState {
  if (typeof window === 'undefined') return frame

  const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - 24)
  const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - 24)
  const width = Math.min(maxWidth, Math.max(MIN_WIDTH, frame.width))
  const height = Math.min(maxHeight, Math.max(MIN_HEIGHT, frame.height))
  const x = Math.min(Math.max(8, frame.x), Math.max(8, window.innerWidth - width - 8))
  const y = Math.min(Math.max(44, frame.y), Math.max(8, window.innerHeight - height - 8))

  return { x, y, width, height }
}

function levelColor(level: DiagnosticEntry['level']): string {
  if (level === 'error') return 'var(--color-danger)'
  if (level === 'warn') return 'rgb(var(--color-accent-rgb) / 0.95)'
  return 'var(--color-text-secondary)'
}

function categoryTint(category: DiagnosticEntry['category']): string {
  if (category === 'calculation') return 'rgba(135,151,107,0.18)'
  if (category === 'dataset') return 'rgba(104,122,162,0.18)'
  if (category === 'workspace') return 'rgb(var(--color-accent-rgb) / 0.18)'
  return 'rgba(255,255,255,0.08)'
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
}

export default function DiagnosticsConsole({ open, onClose }: DiagnosticsConsoleProps) {
  const [entries, setEntries] = useState<DiagnosticEntry[]>(() => getDiagnostics())
  const [filter, setFilter] = useState<DiagnosticsFilter>('all')
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const [frame, setFrame] = useState<FrameState>(() => createDefaultFrame())
  const dragRef = useRef<null | { offsetX: number; offsetY: number }>(null)
  const resizeRef = useRef<null | { startX: number; startY: number; startWidth: number; startHeight: number }>(null)

  useEffect(() => subscribeDiagnostics(() => setEntries(getDiagnostics())), [])

  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    const handleResize = () => setFrame((previous) => clampFrame(previous))

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [onClose, open])

  useEffect(() => {
    if (!open) return undefined

    const handleMouseMove = (event: MouseEvent) => {
      if (dragRef.current) {
        setFrame((previous) => clampFrame({
          ...previous,
          x: event.clientX - dragRef.current!.offsetX,
          y: event.clientY - dragRef.current!.offsetY,
        }))
      }

      if (resizeRef.current) {
        setFrame((previous) => clampFrame({
          ...previous,
          width: resizeRef.current!.startWidth + (event.clientX - resizeRef.current!.startX),
          height: resizeRef.current!.startHeight + (event.clientY - resizeRef.current!.startY),
        }))
      }
    }

    const handleMouseUp = () => {
      dragRef.current = null
      resizeRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [open])

  const filteredEntries = useMemo(() => (
    filter === 'all' ? entries : entries.filter((entry) => entry.category === filter)
  ), [entries, filter])

  const handleCopy = async () => {
    const payload = formatDiagnosticsForCopy(filteredEntries)
    if (!payload.trim()) return
    try {
      await navigator.clipboard.writeText(payload)
    } catch {
      const area = document.createElement('textarea')
      area.value = payload
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
  }

  const handleSave = async () => {
    const payload = formatDiagnosticsAsJson(filteredEntries)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `metis-diagnostics-${stamp}.json`
    const api = (window as any).electronAPI

    if (api?.showSaveDialog && api?.writeFile) {
      const result = await api.showSaveDialog({
        title: 'Save diagnostics',
        defaultPath: fileName,
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      })

      if (result?.canceled || !result?.filePath) return
      await api.writeFile({ filePath: result.filePath, data: payload })
      return
    }

    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  const toggleExpanded = (entryId: string) => {
    setExpandedIds((previous) => (
      previous.includes(entryId)
        ? previous.filter((id) => id !== entryId)
        : [...previous, entryId]
    ))
  }

  if (!open) return null

  return (
    <div
      className="fixed z-[140] overflow-hidden rounded-[14px] border shadow-2xl"
      style={{
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height,
        background: 'linear-gradient(180deg, rgba(32,32,32,0.98) 0%, rgb(var(--color-panel-rgb) / 0.98) 100%)',
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: '0 28px 60px rgba(0,0,0,0.55)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2 select-none"
        style={{
          borderColor: 'rgba(255,255,255,0.08)',
          cursor: 'move',
          background: 'rgba(255,255,255,0.03)',
        }}
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest('button')) return
          dragRef.current = {
            offsetX: event.clientX - frame.x,
            offsetY: event.clientY - frame.y,
          }
        }}
      >
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          <div
            className="flex h-7 w-7 items-center justify-center rounded-[8px]"
            style={{
              background: 'rgb(var(--color-accent-rgb) / 0.16)',
              border: '1px solid rgb(var(--color-accent-rgb) / 0.24)',
            }}
          >
            <BugBeetle size={15} color="var(--color-accent)" />
          </div>
          <div className="min-w-0">
            <div
              className="truncate text-[13px] font-semibold"
              style={{ color: 'var(--color-text-primary)', fontFamily: 'Inter, DM Sans, sans-serif' }}
            >
              Diagnostics
            </div>
            <div
              className="text-[11px]"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, DM Sans, sans-serif' }}
            >
              metis app events
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="flex h-8 items-center gap-1 rounded-[8px] px-2 transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            onClick={() => void handleCopy()}
            title="Copy visible diagnostics"
          >
            <Copy size={14} />
            <span className="text-[11px]" style={{ fontFamily: 'Inter, DM Sans, sans-serif' }}>Copy</span>
          </button>
          <button
            className="flex h-8 items-center gap-1 rounded-[8px] px-2 transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            onClick={() => void handleSave()}
            title="Save diagnostics"
          >
            <FloppyDisk size={14} />
            <span className="text-[11px]" style={{ fontFamily: 'Inter, DM Sans, sans-serif' }}>Save</span>
          </button>
          <button
            className="flex h-8 items-center gap-1 rounded-[8px] px-2 transition-colors"
            style={{ color: 'var(--color-danger)' }}
            onClick={() => clearDiagnostics()}
            title="Clear diagnostics"
          >
            <Trash size={14} />
            <span className="text-[11px]" style={{ fontFamily: 'Inter, DM Sans, sans-serif' }}>Clear</span>
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            onClick={onClose}
            title="Close diagnostics"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        {FILTERS.map((option) => {
          const active = filter === option.id
          return (
            <button
              key={option.id}
              className="rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
              style={{
                background: active ? 'rgb(var(--color-accent-rgb) / 0.18)' : 'rgba(255,255,255,0.04)',
                border: active ? '1px solid rgb(var(--color-accent-rgb) / 0.24)' : '1px solid rgba(255,255,255,0.06)',
                color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                fontFamily: 'Inter, DM Sans, sans-serif',
              }}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          )
        })}
        <div className="ml-auto text-[11px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, DM Sans, sans-serif' }}>
          {filteredEntries.length} entries
        </div>
      </div>

      <div
        className="h-[calc(100%-93px)] overflow-auto"
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          background: 'rgba(0,0,0,0.16)',
        }}
      >
        {filteredEntries.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div>
              <div className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                No diagnostics yet
              </div>
              <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                Run an import, open a dataset, or calculate a model to populate this panel.
              </div>
            </div>
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const expanded = expandedIds.includes(entry.id)
            return (
              <div
                key={entry.id}
                className="w-full cursor-pointer border-b px-3 py-2 text-left transition-colors"
                style={{
                  borderColor: 'rgba(255,255,255,0.05)',
                  background: expanded ? 'rgba(255,255,255,0.03)' : 'transparent',
                }}
                onClick={() => toggleExpanded(entry.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-[132px] text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    {formatTimestamp(entry.timestamp)}
                  </div>
                  <div
                    className="rounded-full px-2 py-[2px] text-[10px] uppercase tracking-wide"
                    style={{
                      color: levelColor(entry.level),
                      background: categoryTint(entry.category),
                    }}
                  >
                    {entry.level}
                  </div>
                  <div
                    className="rounded-full px-2 py-[2px] text-[10px] uppercase tracking-wide"
                    style={{
                      color: 'var(--color-text-secondary)',
                      background: 'rgba(255,255,255,0.06)',
                    }}
                  >
                    {entry.category}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="break-words text-[12px]"
                      style={{
                        color: entry.level === 'error' ? '#F0D8D3' : 'var(--color-text-primary)',
                        lineHeight: 1.5,
                      }}
                    >
                      {entry.message}
                    </div>
                    {expanded && entry.details != null && (
                      <pre
                        className="mt-2 overflow-auto rounded-[10px] border px-3 py-2 text-[11px] whitespace-pre-wrap"
                        style={{
                          borderColor: 'rgba(255,255,255,0.08)',
                          background: 'rgba(0,0,0,0.22)',
                          color: 'var(--color-text-secondary)',
                          maxHeight: 220,
                        }}
                      >
                        {typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details, null, 2)}
                      </pre>
                    )}
                  </div>
                  <CaretDown
                    size={14}
                    style={{
                      color: 'var(--color-text-muted)',
                      transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 160ms ease',
                    }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>

      <div
        className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize rounded-sm"
        style={{ background: 'linear-gradient(135deg, transparent 0%, transparent 40%, rgba(255,255,255,0.18) 40%, rgba(255,255,255,0.18) 58%, transparent 58%, transparent 100%)' }}
        onMouseDown={(event) => {
          event.preventDefault()
          resizeRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            startWidth: frame.width,
            startHeight: frame.height,
          }
        }}
      />
    </div>
  )
}
