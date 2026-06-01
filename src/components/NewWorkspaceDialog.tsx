import { useState } from 'react'
import { FolderPlus, X } from '@phosphor-icons/react'
import {
  WORKSPACE_ACCENT_FALLBACK_COLORS,
  getActiveAccentColor,
  getWorkspaceAccentPalette,
} from '../utils/themeAccent'

const COLORS = WORKSPACE_ACCENT_FALLBACK_COLORS

interface Props {
  onClose: () => void
  onCreate: (name: string, description: string, color: string) => void
}

export default function NewWorkspaceDialog({ onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(() => getActiveAccentColor())

  const handleCreate = () => {
    if (!name.trim()) return
    onCreate(name.trim(), description.trim(), color)
  }

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
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between"
          style={{ height: 56, padding: '0 20px', borderBottom: '1px solid var(--color-elevated)' }}
        >
          <div className="flex items-center" style={{ gap: 10 }}>
            <FolderPlus size={18} color="var(--color-accent)" weight="fill" />
            <span style={{ color: 'var(--color-text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 600 }}>
              New Workspace
            </span>
          </div>
          <button onClick={onClose} className="transition-colors rounded p-1" style={{ background: 'transparent' }}>
            <X size={16} color="var(--color-text-muted)" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col" style={{ padding: '20px 20px 16px', gap: 16 }}>
          {/* Workspace name */}
          <div className="flex flex-col" style={{ gap: 6 }}>
            <span style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Workspace Name
            </span>
            <div
              className="flex items-center"
              style={{
                height: 40, backgroundColor: 'var(--color-page)', borderRadius: 8,
                border: `1px solid ${color}`,
                padding: '0 12px',
              }}
            >
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="e.g. TAM Study — KNUST 2024"
                className="bg-transparent outline-none flex-1"
                style={{ color: 'var(--color-text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 13 }}
              />
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col" style={{ gap: 6 }}>
            <span style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Description <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this research project..."
              rows={3}
              className="bg-transparent outline-none resize-none"
              style={{
                backgroundColor: 'var(--color-page)',
                borderRadius: 8,
                border: '1px solid var(--color-border-subtle)',
                padding: '10px 12px',
                color: 'var(--color-text-primary)',
                fontFamily: 'Inter, sans-serif',
                fontSize: 12,
              }}
            />
          </div>

          {/* Color picker */}
          <div className="flex flex-col" style={{ gap: 8 }}>
            <span style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Workspace Colour
            </span>
            <div className="flex items-center" style={{ gap: 8 }}>
              {getWorkspaceAccentPalette(COLORS).map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="transition-all"
                  style={{
                    width: color === c ? 30 : 24,
                    height: color === c ? 30 : 24,
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: color === c ? `3px solid ${c}` : '3px solid transparent',
                    outline: color === c ? `2px solid ${c}45` : 'none',
                    flexShrink: 0,
                  }}
                  title={c}
                />
              ))}
            </div>
          </div>
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
              opacity: name.trim() ? 1 : 0.5,
            }}
          >
            <span style={{ color: 'var(--color-on-accent)', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600 }}>
              Create Workspace
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
