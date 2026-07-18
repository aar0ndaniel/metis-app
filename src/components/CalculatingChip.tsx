import { useEffect } from 'react'
import { useCalculation, useCalculationDispatch, type CalcType } from '@/state/calculationContext'
import { useLocation, useNavigate } from 'react-router-dom'

const labelForType = (t: CalcType) =>
  t === 'pls' ? 'PLS-SEM'
    : t === 'bootstrap' ? 'Bootstrap'
      : t === 'plspredict' ? 'PLSpredict'
        : t === 'advanced' ? 'Advanced analysis'
          : t === 'permutation' ? 'Permutation analysis'
            : 'Multi group analysis'

export default function CalculatingChip() {
  const state = useCalculation()
  const dispatch = useCalculationDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const routeIsResults = location.pathname.startsWith('/results/')

  useEffect(() => {
    const done = state.lastTransientDone
    if (done && (routeIsResults || location.pathname === done.resultsRoute)) {
      dispatch({ type: 'clearTransientDone' })
    }
  }, [dispatch, location.pathname, routeIsResults, state.lastTransientDone])

  if (state.lastTransientDone) {
    const done = state.lastTransientDone
    if (routeIsResults || location.pathname === done.resultsRoute) return null
    if (location.pathname !== '/' && !location.pathname.startsWith('/canvas/')) return null
    return (
      <button
        type="button"
        onClick={() => navigate(done.resultsRoute, done.navigationState ? { state: done.navigationState } : undefined)}
        className="fixed bottom-4 right-4 z-[150] flex items-center gap-2 rounded-full px-3 py-1.5 shadow-lg"
        style={{
          background: 'var(--color-calculation-accent)',
          color: 'var(--color-on-calculation-accent)',
          boxShadow: '0 12px 26px rgb(var(--color-calculation-accent-rgb) / 0.28)',
        }}
        aria-label={`Open ${labelForType(done.type)} results`}
      >
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: 'currentColor' }} />
        <span className="text-xs font-medium">{labelForType(done.type)} done - click to view</span>
      </button>
    )
  }

  if (state.active && state.active.view === 'chip' && state.active.status !== 'done') {
    const a = state.active
    const progressText = a.progressMode === 'indeterminate'
      ? (a.subLabel || 'Running')
      : `${Math.round(a.progressPct)}%`
    return (
      <div
        className="fixed bottom-4 right-4 z-[150] flex items-center gap-2 rounded-full px-3 py-1.5"
        style={{
          background: 'var(--color-panel-pop)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-floating-panel)',
        }}
        role="status"
        aria-live="polite"
        aria-label={`${labelForType(a.type)} running`}
      >
        <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-calculation-accent)' }} />
        <span className="text-xs font-medium">{labelForType(a.type)}</span>
        <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{progressText}</span>
        <button
          type="button"
          aria-label="Expand calculation modal"
          className="ml-1 p-1 rounded"
          style={{ color: 'var(--color-text-secondary)' }}
          onClick={() => dispatch({ type: 'expand' })}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14v6h6M20 10V4h-6M14 10l6-6M10 14l-6 6" /></svg>
        </button>
        <button
          type="button"
          aria-label="Dismiss chip"
          className="p-1 rounded"
          style={{ color: 'var(--color-text-secondary)' }}
          onClick={() => dispatch({ type: 'dismissChip' })}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    )
  }

  return null
}
