import { useState } from 'react'
import { NotePencil, X, CaretDown } from '@phosphor-icons/react'

interface Workspace { id: string; name: string; color: string }

interface Props {
  workspaces: Workspace[]
  activeWorkspaceId: string
  onClose: () => void
  title?: string
  confirmLabel?: string
  initialModelName?: string
  onCreate: (
    modelName: string,
    workspaceId: string,
    newWorkspace?: { name: string; description: string; color: string }
  ) => void
}

export default function NewModelDialog({
  workspaces,
  activeWorkspaceId,
  onClose,
  title = 'New Model',
  confirmLabel = 'Create Model',
  initialModelName = '',
  onCreate,
}: Props) {
  const [modelName, setModelName] = useState(initialModelName)
  const [wsId, setWsId] = useState(activeWorkspaceId || (workspaces.length > 0 ? workspaces[0].id : 'new'))
  const [wsOpen, setWsOpen] = useState(false)
  
  // New workspace fields
  const [newWsName, setNewWsName] = useState('')
  const [newWsDesc, setNewWsDesc] = useState('')
  const [newWsColor, setNewWsColor] = useState('#87976B')

  const selectedWs = workspaces.find((w) => w.id === wsId)
  const isCreatingNewWs = wsId === 'new'

  const handleCreate = () => {
    if (!modelName.trim()) return
    if (isCreatingNewWs && !newWsName.trim()) return
    
    onCreate(
      modelName.trim(), 
      wsId,
      isCreatingNewWs ? { name: newWsName.trim(), description: newWsDesc.trim(), color: newWsColor } : undefined
    )
  }

  const COLORS = ['#87976B', '#A78BFA', '#FFB547', '#32D583', '#6366F1', '#60A5FA', '#F97316', '#E879F9']

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'var(--color-overlay)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col"
        style={{
          width: 480,
          backgroundColor: 'var(--color-surface)',
          borderRadius: 14,
          border: '1px solid var(--color-border-subtle)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.8)',
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between"
          style={{ height: 56, padding: '0 20px', borderBottom: '1px solid var(--color-elevated)' }}
        >
          <div className="flex items-center" style={{ gap: 10 }}>
            <NotePencil size={18} color="var(--color-accent)" weight="fill" />
            <span style={{ color: 'var(--color-text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 600 }}>
               {title}
            </span>
          </div>
          <button onClick={onClose} className="transition-colors rounded p-1" style={{ background: 'transparent' }}>
            <X size={16} color="var(--color-text-muted)" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col" style={{ padding: '20px 20px 16px', gap: 14 }}>
          {/* Model name */}
          <div className="flex flex-col" style={{ gap: 6 }}>
            <span style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Model Name
            </span>
            <div
              className="flex items-center"
              style={{
                height: 40,
                backgroundColor: 'var(--color-page)',
                borderRadius: 8,
                border: '1px solid rgb(var(--color-accent-rgb) / 0.42)',
                padding: '0 12px',
              }}
            >
              <input
                autoFocus
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="e.g. Full TAM Model"
                className="bg-transparent outline-none flex-1"
                style={{ color: 'var(--color-text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 13 }}
              />
            </div>
          </div>

          {/* Workspace select */}
          <div className="flex flex-col" style={{ gap: 6 }}>
            <span style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Workspace
            </span>
            <div className="relative">
              <button
                onClick={() => setWsOpen((o) => !o)}
                className="w-full flex items-center justify-between transition-colors hover:bg-white/[0.02]"
                style={{
                  height: 40,
                  backgroundColor: 'var(--color-page)',
                  borderRadius: 8,
                  border: '1px solid var(--color-border-subtle)',
                  padding: '0 12px',
                }}
              >
                <div className="flex items-center" style={{ gap: 8 }}>
                  {isCreatingNewWs ? (
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: newWsColor }} />
                      <span style={{ color: 'var(--color-text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500 }}>
                        + Create new workspace
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: selectedWs?.color }} />
                      <span style={{ color: 'var(--color-text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
                        {selectedWs?.name}
                      </span>
                    </div>
                  )}
                </div>
                <CaretDown size={14} color="var(--color-text-muted)" />
              </button>
              
              {wsOpen && (
                <div
                  className="absolute left-0 right-0 z-10 flex flex-col overflow-hidden"
                  style={{
                    top: 44,
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 8,
                    border: '1px solid var(--color-border-subtle)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    padding: '4px 0',
                  }}
                >
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => { setWsId(ws.id); setWsOpen(false) }}
                      className="flex items-center hover:bg-white/[0.05] transition-colors"
                      style={{ height: 36, padding: '0 12px', gap: 8 }}
                    >
                      <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: ws.color }} />
                      <span style={{ color: 'var(--color-text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>{ws.name}</span>
                    </button>
                  ))}
                  <div style={{ height: 1, backgroundColor: 'var(--color-surface)', margin: '4px 0' }} />
                  <button
                    onClick={() => { setWsId('new'); setWsOpen(false) }}
                    className="flex items-center hover:bg-white/[0.05] transition-colors"
                    style={{ height: 36, padding: '0 12px', gap: 8 }}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1px dashed var(--color-text-muted)' }} />
                    <span style={{ color: 'var(--color-accent)', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600 }}>
                      + Create new workspace
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* New Workspace Fields */}
          {isCreatingNewWs && (
            <div className="flex flex-col animate-in fade-in slide-in-from-top-2 duration-200" style={{ gap: 14, paddingTop: 6, borderTop: '1px solid var(--color-elevated)' }}>
              <div className="flex flex-col" style={{ gap: 6 }}>
                <span style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Workspace Name
                </span>
                <div
                  className="flex items-center"
                  style={{
                    height: 40, backgroundColor: 'var(--color-page)', borderRadius: 8,
                    border: `1px solid ${newWsColor}`,
                    padding: '0 12px',
                  }}
                >
                  <input
                    type="text"
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    placeholder="e.g. TAM Study — KNUST 2024"
                    className="bg-transparent outline-none flex-1"
                    style={{ color: 'var(--color-text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 13 }}
                  />
                </div>
              </div>

              <div className="flex flex-col" style={{ gap: 6 }}>
                <span style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Workspace Colour
                </span>
                <div className="flex items-center" style={{ gap: 8 }}>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewWsColor(c)}
                      className="transition-all"
                      style={{
                        width: newWsColor === c ? 26 : 20,
                        height: newWsColor === c ? 26 : 20,
                        borderRadius: '50%',
                        backgroundColor: c,
                        border: newWsColor === c ? `3px solid ${c}` : '3px solid transparent',
                        outline: newWsColor === c ? `2px solid ${c}45` : 'none',
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ height: 1, backgroundColor: 'var(--color-elevated)' }} />
        <div
          className="flex items-center justify-end"
          style={{ height: 56, padding: '0 20px', gap: 10 }}
        >
          <button
            onClick={onClose}
            className="flex items-center justify-center transition-colors"
            style={{ height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-elevated)' }}
          >
            <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>Cancel</span>
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center justify-center transition-opacity"
            style={{
              height: 36, padding: '0 18px', borderRadius: 8,
              backgroundColor: 'var(--color-accent)',
              opacity: modelName.trim() ? 1 : 0.5,
            }}
          >
              <span style={{ color: 'var(--color-on-accent)', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700 }}>{confirmLabel}</span>
            </button>
        </div>
      </div>
    </div>
  )
}
