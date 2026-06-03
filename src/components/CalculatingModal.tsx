import { useEffect, useState } from 'react'
import { EyeSlash, StopCircle } from '@phosphor-icons/react'
import { useCalculation, useCalculationDispatch } from '@/state/calculationContext'
import CalcCancelDialog from './CalcCancelDialog'

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60
  if (minutes <= 0) return `${remainder}s`
  if (remainder === 0) return `${minutes} min`
  return `${minutes} min ${remainder}s`
}

export default function CalculatingModal() {
  const state = useCalculation()
  const dispatch = useCalculationDispatch()
  const [showStopConfirm, setShowStopConfirm] = useState(false)
  const [now, setNow] = useState(Date.now())

  const active = state.active
  useEffect(() => {
    if (!active || active.view !== 'modal' || (active.status !== 'running' && active.status !== 'stopping')) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])

  if (!active || active.view !== 'modal') return null

  const onStop = () => setShowStopConfirm(true)
  const onHide = () => dispatch({ type: 'hide' })

  const currentPhase = active.phases.find((p) => p.status === 'active')
    ?? [...active.phases].reverse().find((p) => p.status === 'done')
    ?? active.phases[0]
  const isStopping = active.status === 'stopping'
  const isError = active.status === 'error'
  const isIndeterminate = active.progressMode === 'indeterminate' && (active.status === 'running' || active.status === 'stopping')
  const visibleProgressPct = active.status === 'running' || active.status === 'stopping'
    ? Math.max(active.progressPct, 6)
    : active.progressPct
  const elapsedSeconds = Math.max(0, (now - active.startedAt) / 1000)
  const estimateText = active.estimatedSeconds ? `About ${formatDuration(active.estimatedSeconds)}` : 'Varies by model'

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'var(--color-overlay)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
    >
      <div
        role="dialog"
        aria-live="polite"
        aria-label={active.title}
        className="rounded-xl px-8 py-7 w-[480px] max-w-[90vw]"
        style={{
          background: 'var(--color-elevated)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <h2 className="text-lg font-medium mb-1">{active.title}</h2>
        <p className="text-xs mb-5" style={{ color: 'var(--color-text-secondary)' }}>
          {active.subLabel || currentPhase?.label || 'Working'}
        </p>

        <div className="grid grid-cols-2 gap-2 mb-5">
          <div
            className="rounded-lg px-3 py-2"
            style={{
              background: 'rgb(var(--color-calculation-accent-rgb) / 0.10)',
              border: '1px solid rgb(var(--color-calculation-accent-rgb) / 0.22)',
            }}
          >
            <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--color-text-secondary)' }}>
              Estimated time
            </div>
            <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {estimateText}
            </div>
          </div>
          <div
            className="rounded-lg px-3 py-2"
            style={{
              background: 'var(--color-panel-control)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--color-text-secondary)' }}>
              Elapsed
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
              {formatDuration(elapsedSeconds)}
            </div>
          </div>
        </div>

        <div className="h-2 rounded-full overflow-hidden mb-5 calculation-progress-track" style={{ background: 'var(--color-input)' }}>
          <div
            className={isIndeterminate
              ? 'h-full calculation-progress-indeterminate'
              : 'h-full calculation-progress-fill transition-all duration-300'}
            style={isIndeterminate ? undefined : { width: `${visibleProgressPct}%` }}
          />
        </div>

        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 mb-6 text-sm"
          style={{
            background: 'rgb(var(--color-calculation-accent-rgb) / 0.08)',
            color: 'var(--color-text-primary)',
            border: '1px solid rgb(var(--color-calculation-accent-rgb) / 0.18)',
          }}
        >
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full calculation-progress-pulse"
            style={{ background: 'var(--color-calculation-accent)' }}
          />
          <span>{currentPhase?.label || 'Working'}</span>
        </div>

        {isStopping && (
          <p className="text-xs mb-3" style={{ color: 'var(--color-warning)' }}>Stopping... waiting for the current step to return.</p>
        )}
        {isError && (
          <p className="text-xs mb-3" style={{ color: 'var(--color-danger)' }}>{active.errorMessage || 'Calculation failed.'}</p>
        )}

        <div className="flex justify-end gap-2">
          {isError ? (
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-md border"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
                background: 'var(--color-panel-control)',
              }}
              onClick={() => dispatch({ type: 'reset' })}
            >
              Dismiss
            </button>
          ) : (
            <>
              <button
                type="button"
                aria-label="Hide calculation"
                title="Hide calculation"
                disabled={isStopping}
                className="h-9 px-3 flex items-center justify-center gap-2 rounded-md border disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-secondary)',
                  background: 'var(--color-panel-control)',
                }}
                onClick={onHide}
              >
                <EyeSlash size={16} weight="bold" />
                <span>Hide</span>
              </button>
              <button
                type="button"
                aria-label="Stop calculation"
                title="Stop calculation"
                disabled={isStopping}
                className="h-9 px-3 flex items-center justify-center gap-2 rounded-md border disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  borderColor: 'rgb(var(--color-danger-rgb, 217 107 77) / 0.45)',
                  color: 'var(--color-danger)',
                  background: 'var(--color-panel-control)',
                }}
                onClick={onStop}
              >
                <StopCircle size={16} weight="fill" />
                <span>Stop</span>
              </button>
            </>
          )}
        </div>
      </div>
      {showStopConfirm && (
        <CalcCancelDialog
          intent="stop"
          onCancel={() => setShowStopConfirm(false)}
          onConfirm={() => {
            setShowStopConfirm(false)
            dispatch({ type: 'requestStop' })
          }}
        />
      )}
    </div>
  )
}
