import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  PaperPlaneTilt,
  X,
  SmileyAngry,
  SmileySad,
  SmileyNervous,
  SmileyMeh,
  Smiley,
  SmileyWink,
  SmileySticker,
} from '@phosphor-icons/react'
import {
  getAccentOption,
  METIS_PREF_ACCENT_COLOR_KEY,
  LEGACY_PREF_ACCENT_COLOR_KEY,
} from '../utils/themeAccent'

export interface RateMetisSubmission {
  rating: number
  feeling: string
  comment: string
}

interface RateMetisModalProps {
  theme: 'Dark' | 'Light'
  onSubmit: (submission: RateMetisSubmission) => Promise<void> | void
  onCancel: () => void
  submitting?: boolean
  error?: string
}

const feelings = [
  { rating: 1, Icon: SmileyAngry, emoji: '😣', label: 'Terrible' },
  { rating: 2, Icon: SmileySad, emoji: '😞', label: 'Disappointed' },
  { rating: 3, Icon: SmileyNervous, emoji: '😕', label: 'Uneasy' },
  { rating: 4, Icon: SmileyMeh, emoji: '😐', label: 'Neutral' },
  { rating: 5, Icon: Smiley, emoji: '🙂', label: 'Satisfied' },
  { rating: 6, Icon: SmileyWink, emoji: '😄', label: 'Happy' },
  { rating: 7, Icon: SmileySticker, emoji: '🤩', label: 'Delighted' },
] as const

export default function RateMetisModal({ theme, onSubmit, onCancel, submitting = false, error = '' }: RateMetisModalProps) {
  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)

  const savedAccent = typeof localStorage !== 'undefined'
    ? localStorage.getItem(METIS_PREF_ACCENT_COLOR_KEY) ?? localStorage.getItem(LEGACY_PREF_ACCENT_COLOR_KEY)
    : null
  const activeAccent = getAccentOption(savedAccent)

  useEffect(() => {
    closeRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, submitting])

  const selectedFeeling = feelings.find((feeling) => feeling.rating === rating)

  const modal = (
    <div
      className="fixed inset-0 z-[3200] flex items-center justify-center p-4"
      data-theme={theme === 'Light' ? 'light' : 'dark'}
      style={{
        background: 'var(--color-overlay)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        '--color-accent': activeAccent.color,
        '--color-accent-rgb': activeAccent.rgb,
        '--color-on-accent': activeAccent.onAccent,
      } as React.CSSProperties}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rate-metis-title"
        className="flex flex-col overflow-hidden rounded-xl"
        style={{
          width: 520,
          height: 410,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          background: 'var(--color-elevated)',
          border: '1px solid var(--color-floating-border-soft)',
          boxShadow: 'var(--shadow-modal)',
          color: 'var(--color-text-primary)',
          fontFamily: 'DM Sans, Inter, sans-serif',
        }}
      >
        <header className="flex items-center" style={{ flexShrink: 0, padding: '20px 20px 8px 26px' }}>
          <div className="min-w-0">
            <h2 id="rate-metis-title" style={{ margin: 0, fontSize: 21, fontWeight: 600, lineHeight: 1.2 }}>
              Rate Metis
            </h2>
            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: 12, lineHeight: 1.3 }}>
              How is Metis feeling in your hands?
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close Rate Metis"
            disabled={submitting}
            onClick={onCancel}
            style={{
              marginLeft: 'auto',
              width: 28,
              height: 28,
              display: 'grid',
              placeItems: 'center',
              border: 0,
              borderRadius: 7,
              background: 'transparent',
              color: 'var(--color-text-muted)',
              cursor: submitting ? 'default' : 'pointer',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            <X size={15} />
          </button>
        </header>

        <div className="flex-1 flex flex-col" style={{ minHeight: 0, padding: '6px 20px 10px', overflowY: 'auto' }}>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, marginBottom: 10 }}>
            Choose the feeling that best matches your experience.
          </div>

          <div
            role="radiogroup"
            aria-label="Metis feeling"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 4,
              padding: '4px 0',
              marginBottom: 12,
            }}
          >
            {feelings.map((item) => {
              const selected = rating === item.rating
              const IconComp = item.Icon
              return (
                <button
                  key={item.rating}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${item.label}, ${item.rating} out of 7 ${item.emoji}`}
                  onClick={() => setRating(item.rating)}
                  disabled={submitting}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    border: 0,
                    borderRadius: 8,
                    background: 'transparent',
                    boxShadow: 'none',
                    color: selected ? activeAccent.color : 'var(--color-text-muted)',
                    cursor: submitting ? 'default' : 'pointer',
                    opacity: submitting ? 0.6 : 1,
                    padding: '4px 6px',
                    transition: 'all 0.15s ease',
                    transform: selected ? 'scale(1.15)' : 'scale(1)',
                  }}
                >
                  <IconComp
                    size={28}
                    weight={selected ? 'fill' : 'regular'}
                    style={{
                      color: selected ? activeAccent.color : 'var(--color-text-muted)',
                      filter: selected ? `drop-shadow(0 0 6px ${activeAccent.color})` : 'none',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: selected ? 600 : 400,
                      color: selected ? activeAccent.color : 'var(--color-text-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>

          <label htmlFor="rate-metis-comment" style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: 11, marginBottom: 6 }}>
            What should we know? <span style={{ color: 'var(--color-text-muted)' }}>(optional)</span>
          </label>
          <textarea
            id="rate-metis-comment"
            value={comment}
            maxLength={2000}
            disabled={submitting}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Tell us what worked, what felt difficult, or what you would change."
            style={{
              width: '100%',
              height: 125,
              minHeight: 110,
              padding: '10px 12px',
              resize: 'none',
              boxSizing: 'border-box',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              background: 'var(--color-input)',
              color: 'var(--color-text-primary)',
              fontFamily: 'DM Sans, Inter, sans-serif',
              fontSize: 11.5,
              lineHeight: 1.45,
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, color: 'var(--color-text-muted)', fontSize: 9.5 }}>
            <span>{selectedFeeling ? `${selectedFeeling.label} selected` : 'Select one feeling to continue'}</span>
            <span>{comment.length}/2000</span>
          </div>
          {error && <div role="alert" style={{ marginTop: 6, color: 'var(--color-danger)', fontSize: 10 }}>{error}</div>}
        </div>

        <footer className="flex items-center justify-end" style={{ height: 54, flexShrink: 0, gap: 9, padding: '0 20px' }}>
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            style={{
              height: 34,
              padding: '0 16px',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              cursor: submitting ? 'default' : 'pointer',
              opacity: submitting ? 0.5 : 1,
              fontFamily: 'inherit',
              fontSize: 11.5,
            }}
          >
            <span>Cancel</span>
          </button>
          <button
            type="button"
            disabled={submitting || rating === null}
            onClick={() => {
              if (rating === null || !selectedFeeling) return
              void onSubmit({ rating, feeling: selectedFeeling.label, comment: comment.trim() })
            }}
            style={{
              height: 34,
              padding: '0 18px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              border: 0,
              borderRadius: 8,
              background: rating === null ? 'var(--color-input)' : activeAccent.color,
              color: rating === null ? 'var(--color-text-muted)' : activeAccent.onAccent,
              cursor: submitting || rating === null ? 'default' : 'pointer',
              fontFamily: 'inherit',
              fontSize: 11.5,
              fontWeight: 600,
              boxShadow: rating !== null ? `0 2px 10px ${activeAccent.color}4D` : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <PaperPlaneTilt size={13} weight="bold" />
            {submitting ? <span>Sending…</span> : <span>Send</span>}
          </button>
        </footer>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}
