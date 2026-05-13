/**
 * Toast — in-app notification system matching metis design system.
 *
 * Usage:
 *   import { useToast, ToastContainer } from '../components/Toast'
 *
 *   // In a top-level component:
 *   const { toasts, toast } = useToast()
 *   <ToastContainer toasts={toasts} />
 *
 *   // Trigger anywhere:
 *   toast.success('Saved successfully')
 *   toast.error('Calculation failed: ...')
 *   toast.warning('No dataset linked')
 *   toast.info('Results copied to clipboard')
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  CheckCircle,
  WarningCircle,
  Info,
  XCircle,
  X,
} from '@phosphor-icons/react'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  kind: ToastKind
  title: string
  body?: string
  duration: number // ms, 0 = persist
}

interface ToastActions {
  success: (title: string, body?: string, duration?: number) => void
  error:   (title: string, body?: string, duration?: number) => void
  warning: (title: string, body?: string, duration?: number) => void
  info:    (title: string, body?: string, duration?: number) => void
  dismiss: (id: string) => void
}

// ─── Singleton event bus ──────────────────────────────────────────────────────
// Allows imperative toast() calls from anywhere without prop-drilling.

const TOAST_EVENT = 'pls:toast'

export function dispatchToast(kind: ToastKind, title: string, body?: string, duration = 4500) {
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, { detail: { kind, title, body, duration } })
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast(): { toasts: ToastItem[]; toast: ToastActions } {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const add = useCallback((kind: ToastKind, title: string, body?: string, duration = 4500) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev, { id, kind, title, body: body ?? '', duration }])
  }, [])

  // Listen for imperative dispatchToast() calls from anywhere in the app
  useEffect(() => {
    const handler = (e: Event) => {
      const { kind, title, body, duration } = (e as CustomEvent).detail
      add(kind, title, body, duration)
    }
    window.addEventListener(TOAST_EVENT, handler)
    return () => window.removeEventListener(TOAST_EVENT, handler)
  }, [add])

  const toast: ToastActions = {
    success: (title, body, dur) => add('success', title, body, dur),
    error:   (title, body, dur) => add('error',   title, body, dur ?? 0),
    warning: (title, body, dur) => add('warning', title, body, dur),
    info:    (title, body, dur) => add('info',    title, body, dur),
    dismiss,
  }

  return { toasts, toast }
}

// ─── Individual Toast ─────────────────────────────────────────────────────────

const KIND_CONFIG: Record<ToastKind, { icon: typeof CheckCircle; accent: string; bg: string }> = {
  success: { icon: CheckCircle, accent: 'var(--color-accent)', bg: 'rgb(var(--color-accent-rgb) / 0.14)' },
  error:   { icon: XCircle,     accent: 'var(--color-danger)', bg: '#2A100F' },
  warning: { icon: WarningCircle, accent: '#87976B', bg: '#1A201A' },
  info:    { icon: Info,          accent: '#60A5FA', bg: '#0A1827' },
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const { icon: Icon, accent, bg } = KIND_CONFIG[item.kind]
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (item.duration > 0) {
      timerRef.current = setTimeout(onDismiss, item.duration)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [item.duration, onDismiss])

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        backgroundColor: bg,
        border: `1px solid ${accent}45`,
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        padding: '10px 14px',
        minWidth: 280,
        maxWidth: 400,
        pointerEvents: 'all',
        animation: 'toast-in 0.2s ease',
      }}
    >
      <Icon size={18} color={accent} style={{ flexShrink: 0, marginTop: 1 }} weight="fill" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          color: 'var(--color-text-primary)',
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 13,
          fontWeight: 600,
          margin: 0,
          lineHeight: 1.3,
        }}>
          {item.title}
        </p>
        {item.body && (
          <p style={{
            color: 'var(--color-text-muted)',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 11,
            margin: '3px 0 0',
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}>
            {item.body}
          </p>
        )}
      </div>
      <button
        onClick={onDismiss}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
          opacity: 0.6,
          marginTop: 1,
        }}
        aria-label="Dismiss"
      >
        <X size={14} color="var(--color-text-primary)" />
      </button>
    </div>
  )
}

// ─── Container ────────────────────────────────────────────────────────────────

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (!toasts.length) return null
  return (
    <>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        {toasts.map(t => (
          <ToastCard key={t.id} item={t} onDismiss={() => onDismiss(t.id)} />
        ))}
      </div>
    </>
  )
}
