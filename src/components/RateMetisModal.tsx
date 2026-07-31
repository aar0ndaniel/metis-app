import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PaperPlaneTilt, X } from '@phosphor-icons/react'
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

// ─── Custom Vector SVG Faces matching each feeling description ────────────────
function FaceTerrible({ size = 36, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="15" />
      {/* Angry eyebrows */}
      <path d="M10 12.5L15 15.5" />
      <path d="M26 12.5L21 15.5" />
      {/* Squeezed angry eyes */}
      <path d="M11 17L15 17" />
      <path d="M21 17L25 17" />
      {/* Angry downward frown */}
      <path d="M12 25Q18 19 24 25" />
    </svg>
  )
}

function FaceDisappointed({ size = 36, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="15" />
      {/* Sad eyes */}
      <circle cx="13" cy="15" r="1.8" fill={color} stroke="none" />
      <circle cx="23" cy="15" r="1.8" fill={color} stroke="none" />
      {/* Sad drooping eyebrows */}
      <path d="M10 12Q13 13.5 15 12" />
      <path d="M26 12Q23 13.5 21 12" />
      {/* Sad curved mouth */}
      <path d="M13 24.5Q18 20.5 23 24.5" />
    </svg>
  )
}

function FaceUneasy({ size = 36, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="15" />
      {/* Worried eyes */}
      <circle cx="13" cy="15" r="2" fill={color} stroke="none" />
      <circle cx="23" cy="15" r="2" fill={color} stroke="none" />
      {/* Uneasy wavy mouth */}
      <path d="M12 23.5Q15 21.5 18 23.5T24 22.5" />
    </svg>
  )
}

function FaceNeutral({ size = 36, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="15" />
      {/* Calm neutral eyes */}
      <circle cx="13" cy="15" r="1.9" fill={color} stroke="none" />
      <circle cx="23" cy="15" r="1.9" fill={color} stroke="none" />
      {/* Flat neutral mouth */}
      <line x1="13" y1="23" x2="23" y2="23" />
    </svg>
  )
}

function FaceSatisfied({ size = 36, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="15" />
      {/* Content curved eyes */}
      <path d="M10 15.5Q13 12.5 16 15.5" />
      <path d="M20 15.5Q23 12.5 26 15.5" />
      {/* Gentle smiling mouth */}
      <path d="M12 22Q18 26.5 24 22" />
    </svg>
  )
}

function FaceHappy({ size = 36, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="15" />
      {/* Happy winking eye + open eye */}
      <path d="M10 15.5Q13 12.5 16 15.5" />
      <circle cx="23" cy="15" r="2" fill={color} stroke="none" />
      {/* Open smile mouth */}
      <path d="M12 21Q18 27.5 24 21Z" fill={color} />
    </svg>
  )
}

function FaceDelighted({ size = 36, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="15" />
      {/* Star eyes */}
      <polygon points="13,10 14.2,13 17,13.4 15,15.3 15.5,18 13,16.7 10.5,18 11,15.3 9,13.4 11.8,13" fill={color} stroke="none" />
      <polygon points="23,10 24.2,13 27,13.4 25,15.3 25.5,18 23,16.7 20.5,18 21,15.3 19,13.4 21.8,13" fill={color} stroke="none" />
      {/* Broad joyful open laughing mouth */}
      <path d="M11 20.5Q18 28.5 25 20.5Z" fill={color} />
    </svg>
  )
}

const feelings = [
  { rating: 1, Icon: FaceTerrible, animClass: 'animate-rate-shake', emoji: '😣', label: 'Terrible' },
  { rating: 2, Icon: FaceDisappointed, animClass: 'animate-rate-sad-pulse', emoji: '😞', label: 'Disappointed' },
  { rating: 3, Icon: FaceUneasy, animClass: 'animate-rate-wobble', emoji: '😕', label: 'Uneasy' },
  { rating: 4, Icon: FaceNeutral, animClass: 'animate-rate-breath', emoji: '😐', label: 'Neutral' },
  { rating: 5, Icon: FaceSatisfied, animClass: 'animate-rate-pop', emoji: '🙂', label: 'Satisfied' },
  { rating: 6, Icon: FaceHappy, animClass: 'animate-rate-bounce', emoji: '😄', label: 'Happy' },
  { rating: 7, Icon: FaceDelighted, animClass: 'animate-rate-spin-burst', emoji: '🤩', label: 'Delighted' },
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
      <style>{`
        @keyframes rateShake {
          0%, 100% { transform: scale(1.28) rotate(0deg); }
          20% { transform: scale(1.28) rotate(-7deg); }
          40% { transform: scale(1.28) rotate(7deg); }
          60% { transform: scale(1.28) rotate(-4deg); }
          80% { transform: scale(1.28) rotate(4deg); }
        }
        @keyframes rateSadPulse {
          0%, 100% { transform: scale(1.26) translateY(0); }
          50% { transform: scale(1.22) translateY(3px); }
        }
        @keyframes rateWobble {
          0%, 100% { transform: scale(1.28) translateX(0); }
          25% { transform: scale(1.28) translateX(-3px); }
          75% { transform: scale(1.28) translateX(3px); }
        }
        @keyframes rateBreath {
          0%, 100% { transform: scale(1.24); }
          50% { transform: scale(1.28); }
        }
        @keyframes ratePop {
          0% { transform: scale(1); }
          40% { transform: scale(1.36); }
          100% { transform: scale(1.28); }
        }
        @keyframes rateBounce {
          0%, 100% { transform: scale(1.28) translateY(0); }
          35% { transform: scale(1.28) translateY(-6px); }
          65% { transform: scale(1.28) translateY(-2px); }
        }
        @keyframes rateSpinBurst {
          0% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.36) rotate(14deg); }
          100% { transform: scale(1.28) rotate(0deg); }
        }

        .animate-rate-shake { animation: rateShake 0.45s ease-in-out infinite; }
        .animate-rate-sad-pulse { animation: rateSadPulse 1.2s ease-in-out infinite; }
        .animate-rate-wobble { animation: rateWobble 0.6s ease-in-out infinite; }
        .animate-rate-breath { animation: rateBreath 1.5s ease-in-out infinite; }
        .animate-rate-pop { animation: ratePop 0.35s ease-out forwards; }
        .animate-rate-bounce { animation: rateBounce 0.8s ease-in-out infinite; }
        .animate-rate-spin-burst { animation: rateSpinBurst 0.5s ease-out forwards; }
      `}</style>

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
          boxShadow: 'none',
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
                    gap: 6,
                    border: 0,
                    borderRadius: 8,
                    background: 'transparent',
                    boxShadow: 'none',
                    color: selected ? activeAccent.color : 'var(--color-text-muted)',
                    cursor: submitting ? 'default' : 'pointer',
                    opacity: submitting ? 0.6 : 1,
                    padding: '4px 6px',
                    transition: 'color 0.15s ease',
                  }}
                >
                  <div
                    className={selected ? item.animClass : ''}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: selected ? 'scale(1.28)' : 'scale(1)',
                      transition: selected ? 'none' : 'transform 0.2s ease-out',
                    }}
                  >
                    <IconComp
                      size={36}
                      color={selected ? activeAccent.color : 'var(--color-text-muted)'}
                    />
                  </div>
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
              boxShadow: 'none',
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
              boxShadow: 'none',
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
              boxShadow: 'none',
              transition: 'background 0.15s ease, color 0.15s ease',
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
