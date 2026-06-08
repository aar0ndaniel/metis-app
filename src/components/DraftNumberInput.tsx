import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

interface DraftNumberInputProps {
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
  step?: number
  fallback?: number
  disabled?: boolean
  className?: string
  style?: CSSProperties
  ariaLabel?: string
}

function clampNumber(value: number, min?: number, max?: number): number {
  let next = value
  if (typeof min === 'number') next = Math.max(min, next)
  if (typeof max === 'number') next = Math.min(max, next)
  return next
}

function resolveDraftNumber(
  draft: string,
  currentValue: number,
  options: { min?: number; max?: number; fallback?: number } = {},
): number {
  const raw = draft.trim()
  const parsed = raw === '' ? Number.NaN : Number(raw)
  const fallback = options.fallback ?? currentValue
  const next = Number.isFinite(parsed) ? parsed : fallback
  return clampNumber(Math.round(next), options.min, options.max)
}

export default function DraftNumberInput({
  value,
  onCommit,
  min,
  max,
  step = 1,
  fallback,
  disabled,
  className,
  style,
  ariaLabel,
}: DraftNumberInputProps) {
  const [draft, setDraft] = useState(String(value))
  const [focused, setFocused] = useState(false)
  const committedByKeyRef = useRef(false)

  useEffect(() => {
    if (!focused) setDraft(String(value))
  }, [focused, value])

  const commitDraft = () => {
    const next = resolveDraftNumber(draft, value, { min, max, fallback })
    setDraft(String(next))
    onCommit(next)
  }

  const handleChange = (raw: string) => {
    setDraft(raw)
    if (raw.trim() === '') return
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      committedByKeyRef.current = true
      commitDraft()
      event.currentTarget.blur()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(String(value))
      event.currentTarget.blur()
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      min={min}
      max={max}
      step={step}
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        if (committedByKeyRef.current) {
          committedByKeyRef.current = false
          return
        }
        commitDraft()
      }}
      onChange={(event) => handleChange(event.target.value)}
      onKeyDown={handleKeyDown}
      className={className}
      style={style}
    />
  )
}
