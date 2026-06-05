import {
  createContext,
  useEffect,
  useContext,
  useReducer,
  useState,
  type Dispatch,
  type PropsWithChildren,
} from 'react'
import CalcCancelDialog from '@/components/CalcCancelDialog'

export type CalcType = 'pls' | 'bootstrap' | 'plspredict' | 'advanced'

export type CalcPhase = {
  id: string
  label: string
  status: 'pending' | 'active' | 'done'
}

export type ProgressMode = 'real' | 'phase' | 'indeterminate'

export type ActiveCalc = {
  type: CalcType
  title: string
  phases: CalcPhase[]
  progressMode: ProgressMode
  progressPct: number          // 0-100; for 'phase' mode this is computed from phases
  subLabel?: string            // e.g. "2,847 / 5,000"
  view: 'modal' | 'chip' | 'silenced'
  status: 'running' | 'stopping' | 'done' | 'error'
  errorMessage?: string
  startedAt: number
  cancelRequested: boolean
}

export type CompletedCalc = {
  type: CalcType
  completedAt: number
  resultsRoute: string         // e.g. "/results/abc?view=bootstrap"
  navigationState?: Record<string, unknown>
}

export type CalculationState = {
  active: ActiveCalc | null
  lastCompletedByType: Partial<Record<CalcType, CompletedCalc>>
  mostRecent: CompletedCalc | null
  lastTransientDone: { type: CalcType; resultsRoute: string; navigationState?: Record<string, unknown>; createdAt: number } | null
}

export type CalculationAction =
  | { type: 'start'; payload: Omit<ActiveCalc, 'view' | 'status' | 'startedAt' | 'cancelRequested' | 'progressPct'> & { progressPct?: number } }
  | { type: 'setPhase'; phaseId: string }
  | { type: 'setProgress'; pct: number; subLabel?: string }
  | { type: 'hide' }
  | { type: 'expand' }
  | { type: 'dismissChip' }
  | { type: 'requestStop' }
  | { type: 'confirmStop' }
  | { type: 'cancelStop' }
  | { type: 'complete'; result: CompletedCalc; showTransientDone?: boolean }
  | { type: 'fail'; message: string }
  | { type: 'clearTransientDone' }
  | { type: 'reset' }

const initialState: CalculationState = {
  active: null,
  lastCompletedByType: {},
  mostRecent: null,
  lastTransientDone: null,
}

function reducer(state: CalculationState, action: CalculationAction): CalculationState {
  switch (action.type) {
    case 'start': {
      if (state.active && state.active.status === 'running') return state
      const phasesNormalized = action.payload.phases.map((p, i) => ({
        ...p,
        status: i === 0 ? 'active' : 'pending',
      })) as CalcPhase[]
      return {
        ...state,
        active: {
          ...action.payload,
          phases: phasesNormalized,
          progressPct: action.payload.progressPct ?? 0,
          view: 'modal',
          status: 'running',
          startedAt: Date.now(),
          cancelRequested: false,
        },
      }
    }
    case 'setPhase': {
      if (!state.active) return state
      let advancePct = 0
      const updated = state.active.phases.map((p, i, arr) => {
        if (p.id === action.phaseId) {
          advancePct = ((i + 1) / arr.length) * 100
          return { ...p, status: 'active' as const }
        }
        return p
      })
      let foundActive = false
      const final = [...updated].reverse().map((p) => {
        if (p.status === 'active') { foundActive = true; return p }
        if (foundActive) return p.status === 'pending' ? { ...p, status: 'done' as const } : p
        return p
      }).reverse()
      return {
        ...state,
        active: {
          ...state.active,
          phases: final,
          progressPct: state.active.progressMode === 'phase' ? advancePct : state.active.progressPct,
        },
      }
    }
    case 'setProgress': {
      if (!state.active) return state
      return {
        ...state,
        active: { ...state.active, progressPct: Math.max(0, Math.min(100, action.pct)), subLabel: action.subLabel ?? state.active.subLabel },
      }
    }
    case 'hide':
      if (!state.active) return state
      return { ...state, active: { ...state.active, view: 'chip' } }
    case 'expand':
      if (!state.active) return state
      return { ...state, active: { ...state.active, view: 'modal' } }
    case 'dismissChip':
      if (!state.active) return state
      return { ...state, active: { ...state.active, view: 'silenced' } }
    case 'requestStop':
      if (!state.active) return state
      return { ...state, active: { ...state.active, status: 'stopping', cancelRequested: true } }
    case 'cancelStop':
      if (!state.active) return state
      return { ...state, active: { ...state.active, status: 'running', cancelRequested: false } }
    case 'confirmStop':
      return { ...state, active: null }
    case 'complete': {
      const completed = action.result
      const phasesAllDone = state.active
        ? state.active.phases.map((p) => ({ ...p, status: 'done' as const }))
        : []
      return {
        ...state,
        active: state.active ? { ...state.active, view: 'silenced', status: 'done', phases: phasesAllDone, progressPct: 100 } : null,
        lastCompletedByType: { ...state.lastCompletedByType, [completed.type]: completed },
        mostRecent: completed,
        lastTransientDone: action.showTransientDone === false
          ? null
          : {
              type: completed.type,
              resultsRoute: completed.resultsRoute,
              navigationState: completed.navigationState,
              createdAt: Date.now(),
            },
      }
    }
    case 'fail':
      if (!state.active) return state
      return { ...state, active: { ...state.active, status: 'error', errorMessage: action.message } }
    case 'clearTransientDone':
      return { ...state, lastTransientDone: null }
    case 'reset':
      return { ...state, active: null }
    default:
      return state
  }
}

const StateContext = createContext<CalculationState | null>(null)
const DispatchContext = createContext<Dispatch<CalculationAction> | null>(null)

export function CalculationProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [showQuitConfirm, setShowQuitConfirm] = useState(false)
  const isCalculating = state.active !== null && (state.active.status === 'running' || state.active.status === 'stopping')

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.__metisIsCalculating = isCalculating
  }, [isCalculating])

  useEffect(() => {
    if (!state.lastTransientDone) return
    const timer = window.setTimeout(() => dispatch({ type: 'clearTransientDone' }), 10_000)
    return () => window.clearTimeout(timer)
  }, [state.lastTransientDone])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const unsubscribe = window.electronAPI?.onConfirmQuitDuringCalc?.(() => {
      setShowQuitConfirm(true)
    })
    return () => unsubscribe?.()
  }, [])

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
        {showQuitConfirm && (
          <CalcCancelDialog
            intent="quit"
            onCancel={() => {
              setShowQuitConfirm(false)
              void window.electronAPI?.quitCancelled?.()
            }}
            onConfirm={() => {
              setShowQuitConfirm(false)
              dispatch({ type: 'requestStop' })
              void window.electronAPI?.quitConfirmed?.()
            }}
          />
        )}
      </DispatchContext.Provider>
    </StateContext.Provider>
  )
}

export function useCalculation() {
  const state = useContext(StateContext)
  if (!state) throw new Error('useCalculation must be used inside CalculationProvider')
  return state
}

export function useCalculationDispatch() {
  const dispatch = useContext(DispatchContext)
  if (!dispatch) throw new Error('useCalculationDispatch must be used inside CalculationProvider')
  return dispatch
}

export function useIsCalculating(): boolean {
  const state = useCalculation()
  return state.active !== null && (state.active.status === 'running' || state.active.status === 'stopping')
}
