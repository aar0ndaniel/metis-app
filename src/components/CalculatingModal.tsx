import { useEffect, useState } from 'react'
import { EyeSlash, StopCircle } from '@phosphor-icons/react'
import { useCalculation, useCalculationDispatch } from '@/state/calculationContext'
import { getSavedCalculationGameSetting } from '@/utils/calculationGameEngine'
import CalcCancelDialog from './CalcCancelDialog'
import Calculation2048Game from './Calculation2048Game'

export default function CalculatingModal() {
  const state = useCalculation()
  const dispatch = useCalculationDispatch()
  const [showStopConfirm, setShowStopConfirm] = useState(false)
  const [gameEnabled, setGameEnabled] = useState(getSavedCalculationGameSetting)

  useEffect(() => {
    const handlePrefsUpdated = () => {
      setGameEnabled(getSavedCalculationGameSetting())
    }
    window.addEventListener('pls:preferences-updated', handlePrefsUpdated)
    return () => {
      window.removeEventListener('pls:preferences-updated', handlePrefsUpdated)
    }
  }, [])

  const active = state.active
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

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'var(--color-overlay)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
    >
      <div
        role="dialog"
        aria-live="polite"
        aria-label={active.title}
        className="rounded-2xl px-5 py-4 w-[350px] max-w-[90vw] max-h-[95vh] overflow-y-auto"
        style={{
          background: 'var(--color-elevated)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <h2 className="text-sm font-semibold mb-0.5">{active.title}</h2>
        <p className="text-xs mb-2 truncate" style={{ color: 'var(--color-text-secondary)' }}>
          {active.subLabel || currentPhase?.label || 'Working...'}
        </p>

        <div className="h-1.5 rounded-full overflow-hidden mb-2.5 calculation-progress-track" style={{ background: 'var(--color-input)' }}>
          <div
            className={isIndeterminate
              ? 'h-full calculation-progress-indeterminate'
              : 'h-full calculation-progress-fill transition-all duration-300'}
            style={isIndeterminate ? undefined : { width: `${visibleProgressPct}%` }}
          />
        </div>

        {gameEnabled && !isError && (
          <div className="my-2 pt-2 border-t border-[var(--color-border)]">
            <Calculation2048Game />
          </div>
        )}

        {isStopping && (
          <p className="text-xs my-2" style={{ color: 'var(--color-warning)' }}>Stopping... waiting for the current step to return.</p>
        )}
        {isError && (
          <p className="text-xs my-2" style={{ color: 'var(--color-danger)' }}>{active.errorMessage || 'Calculation failed.'}</p>
        )}

        <div className="flex justify-end gap-1.5 mt-2.5">
          {isError ? (
            <button
              type="button"
              className="px-2.5 py-1 text-xs rounded-md border"
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
                className="h-7 px-2.5 text-xs flex items-center justify-center gap-1.5 rounded-md border disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-secondary)',
                  background: 'var(--color-panel-control)',
                }}
                onClick={onHide}
              >
                <EyeSlash size={14} weight="bold" />
                <span>Hide</span>
              </button>
              <button
                type="button"
                aria-label="Stop calculation"
                title="Stop calculation"
                disabled={isStopping}
                className="h-7 px-2.5 text-xs flex items-center justify-center gap-1.5 rounded-md border disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  borderColor: 'rgb(var(--color-danger-rgb, 217 107 77) / 0.45)',
                  color: 'var(--color-danger)',
                  background: 'var(--color-panel-control)',
                }}
                onClick={onStop}
              >
                <StopCircle size={14} weight="fill" />
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
