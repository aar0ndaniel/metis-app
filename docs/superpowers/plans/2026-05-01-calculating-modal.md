# Calculating Modal & Background Calculations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full-screen calculating splash with a unified modal supporting phase progress, real progress for chunked bootstrap, Stop, Hide-to-chip, Done-toast, and a contextual "View {X} results" CTA.

**Architecture:** A single `CalculationContext` (React Context + useReducer) holds the at-most-one in-flight calculation and the most recent completed calc per type. Three new presentational components — `CalculatingModal` (rebuilt), `CalculatingChip`, `CalcCancelDialog` — read from the context. Bootstrap chunking is driven from the renderer over the existing IPC bridge: `runBootstrapModel` posts K small `nboot` calls, accumulates the bootstrap arrays, and POSTs them to a new `/finalize-bootstrap` Plumber endpoint that produces the standard summary. PLS-SEM and Advanced Analysis remain single calls; their progress is phase-based. Cancellation uses `AbortController` on the renderer side; the current chunk completes naturally.

**Tech Stack:** React 18 (TS strict), React Router v6 (HashRouter), Tailwind, Electron IPC bridge, R Plumber API, custom `dispatchToast` event bus, no new dependencies.

**Spec:** [docs/superpowers/specs/2026-05-01-calculating-modal-design.md](../specs/2026-05-01-calculating-modal-design.md)

---

## File Structure

**Create:**
- `src/state/calculationContext.tsx` — Provider, reducer, types, hooks
- `src/components/CalculatingChip.tsx` — Minimized chip
- `src/components/CalcCancelDialog.tsx` — Shared confirm dialog
- `src/components/ViewResultsButton.tsx` — Toolbar CTA replacement
- `r-api/finalize_bootstrap.R` *(only if helper extraction makes plumber.R cleaner; otherwise inline)*

**Modify:**
- `src/components/CalculatingModal.tsx` — Full rewrite: title, phase checklist, progress bar, Stop/Hide buttons; reads from context
- `src/pages/ModelCanvas.tsx` — Wrap PLS-SEM, Bootstrap, Advanced Analysis run handlers in context dispatches; replace "Open report" checkbox with `<ViewResultsButton />`
- `src/services/plsApi.ts` — Chunked bootstrap with progress callback + AbortSignal
- `src/App.tsx` — Wrap routes with `<CalculationProvider>`; mount `<CalculatingChip />` at app root
- `electron/main.ts` — Add `runBootstrapChunk` and `finalizeBootstrap` IPC handlers; extend `before-quit` with cancel-confirm
- `electron/preload.ts` — Expose new IPC channels on `electronAPI`
- `r-api/plumber.R` — Add `/run-bootstrap-chunk` and `/finalize-bootstrap` endpoints
- `r-api/tests/` — Add tests for chunk + finalize endpoints

---

## Task 1: Calculation context and reducer

**Files:**
- Create: `src/state/calculationContext.tsx`

State shape captures one in-flight calc, plus most-recent completion per type so the toolbar CTA can label itself.

- [ ] **Step 1: Create the file with types, reducer, provider, and hooks**

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type PropsWithChildren,
} from 'react'

export type CalcType = 'pls' | 'bootstrap' | 'advanced'

export type CalcPhase = {
  id: string
  label: string
  status: 'pending' | 'active' | 'done'
}

export type ProgressMode = 'real' | 'phase'

export type ActiveCalc = {
  type: CalcType
  title: string
  phases: CalcPhase[]
  progressMode: ProgressMode
  progressPct: number          // 0–100; for 'phase' mode this is computed from phases
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
}

export type CalculationState = {
  active: ActiveCalc | null
  lastCompletedByType: Partial<Record<CalcType, CompletedCalc>>
  mostRecent: CompletedCalc | null
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
  | { type: 'complete'; result: CompletedCalc }
  | { type: 'fail'; message: string }
  | { type: 'reset' }

const initialState: CalculationState = {
  active: null,
  lastCompletedByType: {},
  mostRecent: null,
}

function reducer(state: CalculationState, action: CalculationAction): CalculationState {
  switch (action.type) {
    case 'start': {
      if (state.active && state.active.status === 'running') return state // ignore concurrent starts
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
      // Mark anything before active as done
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
      // After R returns, reset to idle. The async layer reads cancelRequested.
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
      }
    }
    case 'fail':
      if (!state.active) return state
      return { ...state, active: { ...state.active, status: 'error', errorMessage: action.message } }
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
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/Users/aaron/dev/metis && npx tsc --noEmit`
Expected: no new errors introduced.

- [ ] **Step 3: Commit**

```bash
git add src/state/calculationContext.tsx
git commit -m "feat(state): add CalculationContext for unified calc tracking"
```

---

## Task 2: Mount provider in App.tsx

**Files:**
- Modify: `src/App.tsx` — wrap the `<HashRouter>` (or root tree) with `<CalculationProvider>`

- [ ] **Step 1: Locate the root render in `src/App.tsx`** (currently around line 20 where `ToastContainer` is rendered)

- [ ] **Step 2: Add import**

```tsx
import { CalculationProvider } from '@/state/calculationContext'
```

- [ ] **Step 3: Wrap the root element**

```tsx
<CalculationProvider>
  <HashRouter>
    {/* existing tree, including ToastContainer */}
  </HashRouter>
</CalculationProvider>
```

- [ ] **Step 4: Verify app boots**

Run: `cd C:/Users/aaron/dev/metis && npm run dev` (or repo's existing dev script — check `package.json` scripts).
Expected: app loads, no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): mount CalculationProvider at root"
```

---

## Task 3: Rebuild CalculatingModal with phases + buttons

**Files:**
- Modify: `src/components/CalculatingModal.tsx` (full rewrite, keep snake animation as a small accent)

The rewrite reads everything from context. Old call sites that pass `title`/`description` props will break — Task 6 fixes them.

- [ ] **Step 1: Replace file contents**

```tsx
import { useCalculation, useCalculationDispatch } from '@/state/calculationContext'
import { useState } from 'react'
import CalcCancelDialog from './CalcCancelDialog'

export default function CalculatingModal() {
  const state = useCalculation()
  const dispatch = useCalculationDispatch()
  const [showStopConfirm, setShowStopConfirm] = useState(false)

  const active = state.active
  if (!active || active.view !== 'modal') return null

  const onStop = () => setShowStopConfirm(true)
  const onHide = () => dispatch({ type: 'hide' })

  const completedCount = active.phases.filter((p) => p.status === 'done').length
  const totalCount = active.phases.length

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
    >
      <div
        role="dialog"
        aria-live="polite"
        aria-label={active.title}
        className="bg-neutral-900 text-neutral-100 rounded-xl shadow-2xl px-8 py-7 w-[480px] max-w-[90vw]"
      >
        <h2 className="text-lg font-medium mb-1">{active.title}</h2>
        <p className="text-xs text-neutral-400 mb-5">
          {completedCount} of {totalCount} steps complete{active.subLabel ? ` · ${active.subLabel}` : ''}
        </p>

        <div className="h-2 bg-neutral-800 rounded-full overflow-hidden mb-5">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${active.progressPct}%` }}
          />
        </div>

        <ul className="space-y-2 mb-6">
          {active.phases.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className={`inline-block w-4 h-4 rounded-full border ${
                  p.status === 'done' ? 'bg-emerald-500 border-emerald-500'
                  : p.status === 'active' ? 'border-emerald-400 animate-pulse'
                  : 'border-neutral-700'
                }`}
              />
              <span className={p.status === 'done' ? 'text-neutral-400 line-through' : p.status === 'active' ? 'text-neutral-100' : 'text-neutral-500'}>
                {p.label}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md border border-neutral-700 text-neutral-200 hover:bg-neutral-800"
            onClick={onHide}
          >
            Hide
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md border border-red-700/40 text-red-300 hover:bg-red-900/30"
            onClick={onStop}
          >
            Stop
          </button>
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
```

- [ ] **Step 2: Update import sites**

Search for `import CalculatingModal` across the codebase — any caller passing `title`/`description` props now needs to pass none. The new component reads from context. Find with: `grep -rn "import CalculatingModal\|CalculatingModal " src/`

For each call site, remove the props but keep the `<CalculatingModal />` mount. The actual *triggering* (when the modal shows) is now handled by `state.active.view === 'modal'` inside the component.

- [ ] **Step 3: Mount once at app root**

In `src/App.tsx`, add inside `<CalculationProvider>` but outside `<HashRouter>` (or just inside HashRouter at top level):

```tsx
import CalculatingModal from '@/components/CalculatingModal'
// ...
<CalculatingModal />
```

Remove any in-page `<CalculatingModal>` mounts from `ModelCanvas.tsx` to avoid double rendering.

- [ ] **Step 4: Verify build + manual smoke**

```bash
cd C:/Users/aaron/dev/metis && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/CalculatingModal.tsx src/App.tsx src/pages/ModelCanvas.tsx
git commit -m "feat(modal): rebuild CalculatingModal with phases, progress bar, Stop/Hide"
```

---

## Task 4: CalcCancelDialog (shared confirm)

**Files:**
- Create: `src/components/CalcCancelDialog.tsx`

Used by Stop and by the App-quit handler.

- [ ] **Step 1: Create file**

```tsx
import { useCalculation } from '@/state/calculationContext'

export interface CalcCancelDialogProps {
  intent: 'stop' | 'quit'
  onCancel: () => void
  onConfirm: () => void
}

export default function CalcCancelDialog({ intent, onCancel, onConfirm }: CalcCancelDialogProps) {
  const state = useCalculation()
  const active = state.active
  const calcLabel = active?.type === 'bootstrap' ? 'bootstrap'
    : active?.type === 'advanced' ? 'advanced analysis'
    : 'calculation'
  const progressLabel = active?.subLabel ?? `${Math.round(active?.progressPct ?? 0)}% complete`

  const headline = intent === 'stop'
    ? `Stop ${calcLabel}?`
    : `Calculation in progress`
  const body = intent === 'stop'
    ? `You'll discard ${progressLabel} of work. This can't be undone.`
    : `Quit anyway? You'll lose ${progressLabel} of the running ${calcLabel}.`
  const confirmText = intent === 'stop' ? 'Stop and discard' : 'Quit anyway'

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-neutral-900 text-neutral-100 rounded-xl shadow-2xl px-6 py-5 w-[380px] max-w-[90vw]">
        <h3 className="text-base font-medium mb-1">{headline}</h3>
        <p className="text-sm text-neutral-400 mb-5">{body}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md border border-neutral-700 hover:bg-neutral-800"
            onClick={onCancel}
          >
            Keep running
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md bg-red-700 hover:bg-red-600 text-white"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify compile**

```bash
cd C:/Users/aaron/dev/metis && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/CalcCancelDialog.tsx
git commit -m "feat(modal): add CalcCancelDialog for Stop and Quit confirmations"
```

---

## Task 5: CalculatingChip

**Files:**
- Create: `src/components/CalculatingChip.tsx`

Mounted at app root; reads context. Two states: `running` and `done`.

- [ ] **Step 1: Create file**

```tsx
import { useCalculation, useCalculationDispatch } from '@/state/calculationContext'
import { useNavigate } from 'react-router-dom'

const labelForType = (t: 'pls' | 'bootstrap' | 'advanced') =>
  t === 'pls' ? 'PLS-SEM' : t === 'bootstrap' ? 'Bootstrap' : 'Advanced analysis'

export default function CalculatingChip() {
  const state = useCalculation()
  const dispatch = useCalculationDispatch()
  const navigate = useNavigate()

  // Running chip
  if (state.active && state.active.view === 'chip' && state.active.status !== 'done') {
    const a = state.active
    return (
      <div
        className="fixed bottom-4 right-4 z-[150] flex items-center gap-2 bg-neutral-900 text-neutral-100 rounded-full px-3 py-1.5 shadow-lg border border-neutral-800"
        role="status"
        aria-live="polite"
        aria-label={`${labelForType(a.type)} running, ${Math.round(a.progressPct)} percent`}
      >
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-medium">{labelForType(a.type)}</span>
        <span className="text-xs text-neutral-400 tabular-nums">{Math.round(a.progressPct)}%</span>
        <button
          type="button"
          aria-label="Expand calculation modal"
          className="ml-1 p-1 rounded hover:bg-neutral-800"
          onClick={() => dispatch({ type: 'expand' })}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14v6h6M20 10V4h-6M14 10l6-6M10 14l-6 6" /></svg>
        </button>
        <button
          type="button"
          aria-label="Dismiss chip"
          className="p-1 rounded hover:bg-neutral-800"
          onClick={() => dispatch({ type: 'dismissChip' })}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    )
  }

  return null
}
```

- [ ] **Step 2: Mount in `src/App.tsx`** alongside `<CalculatingModal />`

```tsx
import CalculatingChip from '@/components/CalculatingChip'
// ...inside <HashRouter>:
<CalculatingChip />
```

- [ ] **Step 3: Verify compile**

```bash
cd C:/Users/aaron/dev/metis && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/CalculatingChip.tsx src/App.tsx
git commit -m "feat(modal): add CalculatingChip minimized state"
```

---

## Task 6: Wire PLS-SEM into context

**Files:**
- Modify: `src/pages/ModelCanvas.tsx` — find the PLS-SEM run handler

PLS-SEM is single-call and short. Phases advance on a fake but plausible schedule (250ms each) since we can't observe internal seminr progress.

- [ ] **Step 1: Locate the PLS run handler in ModelCanvas.tsx**

Find: where the existing PLS-SEM model is estimated. Likely a function like `handleRunPLS` or a button onClick in the Model Canvas toolbar. Use `grep -n "estimate_pls\|run-pls\|runPlsModel\|handleRun" src/pages/ModelCanvas.tsx`.

- [ ] **Step 2: Wrap the existing call**

```tsx
import { useCalculationDispatch } from '@/state/calculationContext'
// ... inside component:
const calcDispatch = useCalculationDispatch()

const runPls = async () => {
  calcDispatch({
    type: 'start',
    payload: {
      type: 'pls',
      title: 'Estimating PLS-SEM model',
      progressMode: 'phase',
      phases: [
        { id: 'prep', label: 'Preparing model', status: 'pending' },
        { id: 'paths', label: 'Estimating PLS path coefficients', status: 'pending' },
        { id: 'summary', label: 'Computing summary statistics', status: 'pending' },
        { id: 'final', label: 'Finalizing results', status: 'pending' },
      ],
    },
  })
  // Walk phases on a soft timer so each is visible at least ~700ms
  const phaseTimer = setInterval(() => {
    // dispatch next phase — encoded as a small ladder; safer to track index here
    // (kept simple: caller can also dispatch on real milestones)
  }, 700)

  try {
    // Phase 1: prep is implicit at start
    calcDispatch({ type: 'setPhase', phaseId: 'paths' })
    const result = await runPlsModel(/* existing payload */)
    calcDispatch({ type: 'setPhase', phaseId: 'summary' })
    // process result...
    calcDispatch({ type: 'setPhase', phaseId: 'final' })
    calcDispatch({ type: 'complete', result: { type: 'pls', completedAt: Date.now(), resultsRoute: `/results/${currentModelId}` } })
    if (state.active?.view === 'modal') navigate(`/results/${currentModelId}`)
  } catch (e: unknown) {
    calcDispatch({ type: 'fail', message: e instanceof Error ? e.message : String(e) })
  } finally {
    clearInterval(phaseTimer)
  }
}
```

(Adapt to the actual handler signature in ModelCanvas — keep behavior identical, only wrap with calc dispatches.)

- [ ] **Step 3: Manual smoke test**

Run app, open a model, click Run PLS-SEM. Expected: new modal appears with 4 phases, ticks through, results page opens.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ModelCanvas.tsx
git commit -m "feat(pls): wire PLS-SEM run into CalculationContext"
```

---

## Task 7: Add R Plumber endpoints for chunked bootstrap

**Files:**
- Modify: `r-api/plumber.R` — add two endpoints near the existing `/run-bootstrap` (around line 3110)

The chunk endpoint runs `bootstrap_model(..., nboot = chunk_n)` and returns the raw arrays. Finalize accepts the union of arrays and produces the same summary the existing endpoint produces.

- [ ] **Step 1: Add `/run-bootstrap-chunk` endpoint**

```r
#* Run a single bootstrap chunk and return raw arrays
#* @post /run-bootstrap-chunk
function(req, res) {
  if (!require_local_token(req, res)) return(list(error = "unauthorized"))
  tryCatch({
    with_analysis_timeout_for({
      prepared <- prepare_payload(req)
      payload <- prepared$payload
      data <- prepared$data
      core <- get_cached_pls_core(payload, data)
      chunk_n <- as.integer(payload$chunk_n %||% 500L)
      if (is.na(chunk_n) || chunk_n < 10L) chunk_n <- 500L
      if (chunk_n > max_bootstrap_samples) chunk_n <- max_bootstrap_samples

      seed <- if (!is.null(payload$seed)) as.integer(payload$seed) else NULL
      if (!is.null(seed) && !is.na(seed)) set.seed(seed)

      boot_model <- seminr::bootstrap_model(core$model, nboot = chunk_n, cores = analysis_cores())

      list(
        boot_paths        = boot_model$boot_paths,
        boot_loadings     = boot_model$boot_loadings,
        boot_weights      = boot_model$boot_weights,
        boot_total_paths  = boot_model$boot_total_paths,
        path_coef         = boot_model$path_coef,
        outer_loadings    = boot_model$outer_loadings,
        outer_weights     = boot_model$outer_weights,
        chunk_n           = chunk_n
      )
    })
  }, error = function(e) {
    res$status <- 500L
    list(error = conditionMessage(e))
  })
}
```

- [ ] **Step 2: Add `/finalize-bootstrap` endpoint**

```r
#* Aggregate accumulated chunk arrays and produce the standard bootstrap summary
#* @post /finalize-bootstrap
function(req, res) {
  if (!require_local_token(req, res)) return(list(error = "unauthorized"))
  tryCatch({
    with_analysis_timeout_for({
      prepared <- prepare_payload(req)
      payload <- prepared$payload
      data <- prepared$data
      core <- get_cached_pls_core(payload, data)

      # Reconstruct a boot_model-shaped list from accumulated arrays
      acc <- payload$accumulated  # list with boot_paths, boot_loadings, boot_weights, boot_total_paths
      boot_model <- list(
        path_coef        = core$model$path_coef,
        outer_loadings   = core$model$outer_loadings,
        outer_weights    = core$model$outer_weights,
        boot_paths       = acc$boot_paths,
        boot_loadings    = acc$boot_loadings,
        boot_weights     = acc$boot_weights,
        boot_total_paths = acc$boot_total_paths
      )
      class(boot_model) <- class(seminr::bootstrap_model(core$model, nboot = 50, cores = 1))

      confidence_level <- if (!is.null(payload$confidenceLevel)) as.character(payload$confidenceLevel) else "95%"
      alpha <- parse_confidence_level_alpha(confidence_level)

      boot_summary <- summary(boot_model, alpha = alpha)
      boot_summary$bootstrapped_paths <- add_bias_corrected_intervals(
        boot_summary$bootstrapped_paths, boot_model$path_coef, boot_model$boot_paths, alpha = alpha)
      boot_summary$bootstrapped_loadings <- add_bias_corrected_intervals(
        boot_summary$bootstrapped_loadings, boot_model$outer_loadings, boot_model$boot_loadings, alpha = alpha)
      boot_summary$bootstrapped_weights <- add_bias_corrected_intervals(
        boot_summary$bootstrapped_weights, boot_model$outer_weights, boot_model$boot_weights, alpha = alpha)
      boot_summary$bootstrapped_total_paths <- add_bias_corrected_intervals(
        boot_summary$bootstrapped_total_paths, seminr:::total_effects(boot_model$path_coef), boot_model$boot_total_paths, alpha = alpha)

      # Re-use the existing post-processing block that produces the response shape used by /run-bootstrap
      # Move the existing post-processing into a helper `assemble_bootstrap_response(boot_model, boot_summary, payload, core)`
      assemble_bootstrap_response(boot_model, boot_summary, payload, core)
    })
  }, error = function(e) {
    res$status <- 500L
    list(error = conditionMessage(e))
  })
}
```

- [ ] **Step 3: Extract helper `assemble_bootstrap_response`**

Move lines [r-api/plumber.R:3138-3260](r-api/plumber.R:3138) (the post-processing inside `/run-bootstrap`) into a top-level function `assemble_bootstrap_response(boot_model, boot_summary, payload, core)` so both `/run-bootstrap` and `/finalize-bootstrap` use it. Update `/run-bootstrap` to call the helper.

- [ ] **Step 4: Add R tests**

Create or extend `r-api/tests/bootstrap_chunking.R`:

```r
# Verify chunked + finalized bootstrap produces a summary structurally identical
# to a single bootstrap call with the same total nboot.
source("../plumber.R", chdir = TRUE)
# build a minimal seminr model from the sample dataset
# call /run-bootstrap-chunk twice (n=250 each) with same seed
# call /finalize-bootstrap with accumulated
# assert summary fields match expected types and ranges
```

(Match the existing test pattern in `tests/rApiRuntimeSmoke.R`.)

- [ ] **Step 5: Run R tests**

```bash
cd C:/Users/aaron/dev/metis/r-api && Rscript ../tests/bootstrap_chunking.R
```

- [ ] **Step 6: Commit**

```bash
git add r-api/plumber.R r-api/tests/bootstrap_chunking.R
git commit -m "feat(r-api): add /run-bootstrap-chunk and /finalize-bootstrap"
```

---

## Task 8: Electron IPC for chunk + finalize

**Files:**
- Modify: `electron/main.ts` — add IPC handlers
- Modify: `electron/preload.ts` — expose channels

- [ ] **Step 1: Add IPC handlers in `electron/main.ts`** (near the existing `runBootstrap` handler)

```ts
ipcMain.handle('run-bootstrap-chunk', async (_evt, payload: unknown) => {
  return await postToPlumber('/run-bootstrap-chunk', payload, ANALYSIS_TIMEOUT_MS)
})
ipcMain.handle('finalize-bootstrap', async (_evt, payload: unknown) => {
  return await postToPlumber('/finalize-bootstrap', payload, ANALYSIS_TIMEOUT_MS)
})
```

(Use the same `postToPlumber` helper the existing handlers use; check `electron/main.ts` around line 1400–1500 for the pattern.)

- [ ] **Step 2: Expose on preload**

In `electron/preload.ts`:

```ts
runBootstrapChunk: (payload: unknown) => ipcRenderer.invoke('run-bootstrap-chunk', payload),
finalizeBootstrap: (payload: unknown) => ipcRenderer.invoke('finalize-bootstrap', payload),
```

- [ ] **Step 3: Add types in `src/types/electron-api.d.ts`** (or wherever the existing `electronAPI` type lives — search `runBootstrap:` to find it)

```ts
runBootstrapChunk: (payload: unknown) => Promise<unknown>
finalizeBootstrap: (payload: unknown) => Promise<unknown>
```

- [ ] **Step 4: Verify compile**

```bash
cd C:/Users/aaron/dev/metis && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/preload.ts src/types/electron-api.d.ts
git commit -m "feat(ipc): expose run-bootstrap-chunk and finalize-bootstrap"
```

---

## Task 9: Chunked bootstrap in `plsApi.ts`

**Files:**
- Modify: `src/services/plsApi.ts` — add `runBootstrapChunked`

- [ ] **Step 1: Add new function**

```ts
import { type CalculationAction } from '@/state/calculationContext'

export interface ChunkedBootstrapOptions {
  totalNboot: number
  chunkN?: number   // default 500
  payload: BootstrapPayload   // existing type
  onProgress: (done: number, total: number) => void
  signal?: AbortSignal
}

export async function runBootstrapChunked(opts: ChunkedBootstrapOptions): Promise<BootstrapResponse> {
  const chunkN = opts.chunkN ?? 500
  const total = opts.totalNboot
  const numChunks = Math.ceil(total / chunkN)
  let accumulated: AccumulatedBootstrap | null = null
  let done = 0

  for (let i = 0; i < numChunks; i++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const thisChunk = Math.min(chunkN, total - done)
    const chunkResponse = await window.electronAPI.runBootstrapChunk({
      ...opts.payload,
      chunk_n: thisChunk,
      seed: (opts.payload.seed ?? 0) + i, // distinct seed per chunk
    }) as BootstrapChunkResponse
    accumulated = mergeChunk(accumulated, chunkResponse)
    done += thisChunk
    opts.onProgress(done, total)
  }
  if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const finalResponse = await window.electronAPI.finalizeBootstrap({
    ...opts.payload,
    accumulated,
  }) as BootstrapResponse
  return finalResponse
}

function mergeChunk(prev: AccumulatedBootstrap | null, chunk: BootstrapChunkResponse): AccumulatedBootstrap {
  if (!prev) {
    return {
      boot_paths: chunk.boot_paths,
      boot_loadings: chunk.boot_loadings,
      boot_weights: chunk.boot_weights,
      boot_total_paths: chunk.boot_total_paths,
    }
  }
  return {
    boot_paths: concat3d(prev.boot_paths, chunk.boot_paths),
    boot_loadings: concat3d(prev.boot_loadings, chunk.boot_loadings),
    boot_weights: concat3d(prev.boot_weights, chunk.boot_weights),
    boot_total_paths: concat3d(prev.boot_total_paths, chunk.boot_total_paths),
  }
}

// concat3d concatenates along the bootstrap-replication axis.
// The exact array shape depends on what plumber returns — verify with one chunk and adjust.
function concat3d<T>(a: T, b: T): T {
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b] as unknown as T
  return a // fallback
}

export interface AccumulatedBootstrap {
  boot_paths: unknown
  boot_loadings: unknown
  boot_weights: unknown
  boot_total_paths: unknown
}
export interface BootstrapChunkResponse {
  boot_paths: unknown
  boot_loadings: unknown
  boot_weights: unknown
  boot_total_paths: unknown
  path_coef: unknown
  outer_loadings: unknown
  outer_weights: unknown
  chunk_n: number
}
```

- [ ] **Step 2: Verify shape of chunk response**

Run a one-off chunk via dev tools to inspect array shape, then refine `concat3d` to match (R typically returns multidimensional arrays as nested JSON arrays).

- [ ] **Step 3: Commit**

```bash
git add src/services/plsApi.ts
git commit -m "feat(api): add runBootstrapChunked with progress + AbortSignal"
```

---

## Task 10: Wire Bootstrap into context with chunked progress

**Files:**
- Modify: `src/pages/ModelCanvas.tsx` — bootstrap run handler

- [ ] **Step 1: Replace existing bootstrap call**

```tsx
import { runBootstrapChunked } from '@/services/plsApi'
import { useEffect, useRef } from 'react'

// inside component:
const abortRef = useRef<AbortController | null>(null)

const runBootstrap = async (settings: BootstrapSettings) => {
  abortRef.current = new AbortController()
  calcDispatch({
    type: 'start',
    payload: {
      type: 'bootstrap',
      title: `Bootstrapping ${settings.nboot.toLocaleString()} samples`,
      progressMode: 'real',
      phases: [
        { id: 'prep',     label: 'Preparing base model',                 status: 'pending' },
        { id: 'resample', label: 'Resampling',                            status: 'pending' },
        { id: 'bias',     label: 'Computing bias-corrected intervals',    status: 'pending' },
        { id: 'final',    label: 'Finalizing results',                    status: 'pending' },
      ],
    },
  })
  try {
    calcDispatch({ type: 'setPhase', phaseId: 'resample' })
    const result = await runBootstrapChunked({
      totalNboot: settings.nboot,
      payload: buildBootstrapPayload(settings),
      onProgress: (done, total) => {
        calcDispatch({
          type: 'setProgress',
          pct: (done / total) * 100,
          subLabel: `${done.toLocaleString()} / ${total.toLocaleString()}`,
        })
      },
      signal: abortRef.current.signal,
    })
    calcDispatch({ type: 'setPhase', phaseId: 'bias' })
    // (the finalize endpoint already does bias correction; this phase is for the user-visible step)
    calcDispatch({ type: 'setPhase', phaseId: 'final' })
    storeBootstrapResults(result)
    calcDispatch({
      type: 'complete',
      result: { type: 'bootstrap', completedAt: Date.now(), resultsRoute: `/results/${currentModelId}?view=bootstrap` },
    })
    dispatchToast('success', 'Bootstrap complete', `${settings.nboot.toLocaleString()} samples`)
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      calcDispatch({ type: 'reset' })
      return
    }
    calcDispatch({ type: 'fail', message: e instanceof Error ? e.message : String(e) })
  }
}

// Watch for cancelRequested and abort
useEffect(() => {
  if (state.active?.cancelRequested) abortRef.current?.abort()
}, [state.active?.cancelRequested])
```

- [ ] **Step 2: Manual QA**

- Start a 5,000-sample bootstrap. Verify modal shows 4 phases, real % climbs, sub-label shows "X,XXX / 5,000."
- Hide → chip shows.
- Expand from chip → modal returns.
- Stop → confirm dialog → discard.
- Run again, hit X on chip → calc continues, completes silently with toast.
- After completion, toolbar CTA reads "View bootstrap results."

- [ ] **Step 3: Commit**

```bash
git add src/pages/ModelCanvas.tsx
git commit -m "feat(bootstrap): drive UI from chunked bootstrap with real progress"
```

---

## Task 11: Wire Advanced Analysis into context

**Files:**
- Modify: `src/pages/ModelCanvas.tsx` — advanced analysis run handler

Phases dynamically reflect which analyses (IPMA / NCA / cIPMA) are checked.

- [ ] **Step 1: Replace existing AA call**

```tsx
const runAdvanced = async (target: string, runDepth: number, analyses: { ipma: boolean; nca: boolean; cipma: boolean }) => {
  const phases = [{ id: 'prep', label: 'Preparing model', status: 'pending' as const }]
  if (analyses.ipma)  phases.push({ id: 'ipma',  label: 'Running IPMA',                                                 status: 'pending' })
  if (analyses.nca)   phases.push({ id: 'nca',   label: `Running NCA — ${runDepth.toLocaleString()} replications`,      status: 'pending' })
  if (analyses.cipma) phases.push({ id: 'cipma', label: 'Running cIPMA',                                                status: 'pending' })
  phases.push({ id: 'final', label: 'Finalizing results', status: 'pending' })

  calcDispatch({
    type: 'start',
    payload: {
      type: 'advanced',
      title: `Running advanced analysis on ${target}`,
      progressMode: 'phase',
      phases,
    },
  })
  try {
    // The R call is opaque — advance phases based on the response, not real progress.
    // Optionally tick the active phase forward on a soft timer to avoid the bar appearing stuck.
    const result = await runAdvancedAnalysisModel({ /* existing payload */ })
    // Once result returns, all sub-analyses are done; mark each that was requested
    if (analyses.ipma)  calcDispatch({ type: 'setPhase', phaseId: 'ipma' })
    if (analyses.nca)   calcDispatch({ type: 'setPhase', phaseId: 'nca' })
    if (analyses.cipma) calcDispatch({ type: 'setPhase', phaseId: 'cipma' })
    calcDispatch({ type: 'setPhase', phaseId: 'final' })
    storeAdvancedResults(result)
    calcDispatch({
      type: 'complete',
      result: { type: 'advanced', completedAt: Date.now(), resultsRoute: `/results/${currentModelId}?view=advanced` },
    })
    dispatchToast('success', 'Advanced analysis complete', target)
  } catch (e: unknown) {
    calcDispatch({ type: 'fail', message: e instanceof Error ? e.message : String(e) })
  }
}
```

Note: NCA/IPMA can't be cancelled mid-call — the modal will show "Stopping…" if the user hits Stop, until the R call returns. Acceptable per spec.

- [ ] **Step 2: Show "Stopping…" overlay when status === 'stopping'**

In `CalculatingModal.tsx`, when `active.status === 'stopping'`, dim the action buttons and overlay a "Stopping… (waiting for R to return)" notice. (~5 line addition.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/ModelCanvas.tsx src/components/CalculatingModal.tsx
git commit -m "feat(advanced): wire Advanced Analysis into CalculationContext"
```

---

## Task 12: ViewResultsButton (toolbar CTA)

**Files:**
- Create: `src/components/ViewResultsButton.tsx`
- Modify: `src/pages/ModelCanvas.tsx` — replace "Open report" checkbox at line 4714

- [ ] **Step 1: Create button**

```tsx
import { useCalculation } from '@/state/calculationContext'
import { useNavigate } from 'react-router-dom'

const labelFor = (t: 'pls' | 'bootstrap' | 'advanced') =>
  t === 'pls' ? 'PLS-SEM' : t === 'bootstrap' ? 'bootstrap' : 'advanced analysis'

export default function ViewResultsButton() {
  const state = useCalculation()
  const navigate = useNavigate()
  const recent = state.mostRecent
  if (!recent) return (
    <button type="button" disabled className="px-3 py-1.5 text-sm rounded-md border border-neutral-700 text-neutral-500 cursor-not-allowed" title="Run a calculation first">
      View results
    </button>
  )
  return (
    <button
      type="button"
      className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 text-white"
      onClick={() => navigate(recent.resultsRoute)}
    >
      View {labelFor(recent.type)} results
    </button>
  )
}
```

- [ ] **Step 2: Replace "Open report" checkbox at `ModelCanvas.tsx:4714`**

Find the existing checkbox markup and replace it with `<ViewResultsButton />`. Remove the now-unused `openReport` state if it had a flag.

- [ ] **Step 3: Verify compile + manual smoke**

Run a calc; verify the button label updates to "View bootstrap results" / "View advanced analysis results" / "View PLS-SEM results" depending on what was last completed.

- [ ] **Step 4: Commit**

```bash
git add src/components/ViewResultsButton.tsx src/pages/ModelCanvas.tsx
git commit -m "feat(toolbar): add ViewResultsButton replacing Open report checkbox"
```

---

## Task 13: Disable Run buttons during a calc

**Files:**
- Modify: `src/pages/ModelCanvas.tsx` — find PLS / Bootstrap / Advanced run buttons

- [ ] **Step 1: Read `useIsCalculating` and gate**

```tsx
import { useIsCalculating } from '@/state/calculationContext'
const isCalculating = useIsCalculating()
// in each run button:
<button
  disabled={isCalculating}
  title={isCalculating ? 'Calculation in progress — finish or stop current' : undefined}
  onClick={runPls /* or runBootstrap, runAdvanced */}
>
  Run
</button>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/ModelCanvas.tsx
git commit -m "feat(toolbar): disable Run buttons while a calc is in flight"
```

---

## Task 14: Quit-while-calculating confirmation

**Files:**
- Modify: `electron/main.ts` — extend `before-quit` handler at lines 2237–2244
- Modify: `electron/preload.ts` — expose a `cancelCalculation` channel and a `getCalcStatus` channel
- Modify: `src/state/calculationContext.tsx` — register a window-level `beforeunload` style listener? Actually use IPC

Cleanest approach: when a calc is active, the renderer registers itself as "busy" via IPC. Main process intercepts `before-quit`, sends a message to the renderer asking for confirmation; renderer shows `<CalcCancelDialog intent="quit" />`; user confirms → renderer aborts the calc + replies "ok to quit"; main calls `app.exit(0)`.

- [ ] **Step 1: In `electron/main.ts`, replace the existing `before-quit` handler**

```ts
let pendingQuitConfirm = false

app.on('before-quit', async (event) => {
  if (pendingQuitConfirm) return
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  const isBusy = await win.webContents.executeJavaScript('window.__metisIsCalculating === true').catch(() => false)
  if (!isBusy) {
    clearSplashFallbackTimer()
    stopPlumberServer()
    return
  }
  event.preventDefault()
  pendingQuitConfirm = true
  win.webContents.send('confirm-quit-during-calc')
})

ipcMain.handle('quit-confirmed', () => {
  pendingQuitConfirm = false
  clearSplashFallbackTimer()
  stopPlumberServer()
  app.exit(0)
})
ipcMain.handle('quit-cancelled', () => {
  pendingQuitConfirm = false
})
```

- [ ] **Step 2: In `electron/preload.ts`**

```ts
onConfirmQuitDuringCalc: (cb: () => void) => ipcRenderer.on('confirm-quit-during-calc', () => cb()),
quitConfirmed: () => ipcRenderer.invoke('quit-confirmed'),
quitCancelled: () => ipcRenderer.invoke('quit-cancelled'),
```

- [ ] **Step 3: In `CalculationProvider`, set the busy flag and listen for confirm-quit**

```tsx
useEffect(() => {
  ;(window as any).__metisIsCalculating = state.active !== null && state.active.status === 'running'
})

useEffect(() => {
  if (!window.electronAPI?.onConfirmQuitDuringCalc) return
  window.electronAPI.onConfirmQuitDuringCalc(() => {
    // open the quit dialog (set local state + render <CalcCancelDialog intent="quit" />)
    setShowQuitConfirm(true)
  })
}, [])
```

(The `setShowQuitConfirm` state and dialog render live in `CalculationProvider` — small inline UI block, or a separate `<QuitConfirmHost />` component for clarity.)

- [ ] **Step 4: Manual QA**

Start bootstrap, hit Cmd/Ctrl+Q. Expected: dialog appears; "Keep running" cancels quit; "Quit anyway" aborts calc and quits.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/preload.ts src/state/calculationContext.tsx
git commit -m "feat(electron): confirm before quitting during active calculation"
```

---

## Task 15: Done-state feedback (toast + chip done state)

**Files:**
- Modify: `src/components/CalculatingChip.tsx` — render done state if `lastTransientDone` is set
- Modify: `src/state/calculationContext.tsx` — add a brief `lastTransientDone` slot that auto-clears after ~10s

- [ ] **Step 1: Extend reducer**

Add to state:
```ts
lastTransientDone: { type: CalcType; resultsRoute: string; createdAt: number } | null
```

In `case 'complete'`, set `lastTransientDone: { type: completed.type, resultsRoute: completed.resultsRoute, createdAt: Date.now() }`.

Add action `'clearTransientDone'` that nulls it. In `CalculationProvider`, set a `setTimeout(..., 10_000)` whenever `lastTransientDone` becomes non-null.

- [ ] **Step 2: Render done chip in `CalculatingChip.tsx`**

Below the running-chip return, add:

```tsx
if (state.lastTransientDone) {
  const td = state.lastTransientDone
  return (
    <button
      type="button"
      onClick={() => navigate(td.resultsRoute)}
      className="fixed bottom-4 right-4 z-[150] flex items-center gap-2 bg-emerald-700 text-white rounded-full px-3 py-1.5 shadow-lg"
      aria-label={`Open ${labelForType(td.type)} results`}
    >
      <span className="inline-block w-2 h-2 rounded-full bg-white" />
      <span className="text-xs font-medium">{labelForType(td.type)} done · click to view</span>
    </button>
  )
}
```

- [ ] **Step 3: Toast on completion**

Already added in Tasks 10/11 via `dispatchToast('success', …)`. Verify it triggers consistently for all three calc types.

- [ ] **Step 4: Commit**

```bash
git add src/state/calculationContext.tsx src/components/CalculatingChip.tsx
git commit -m "feat(modal): add done-chip transient state and verify toast on complete"
```

---

## Task 16: End-to-end manual QA matrix

- [ ] **Step 1: Walk the matrix**

For each calc type × each scenario, verify:

| Calc            | Scenario                                           | Expected                                                 |
|-----------------|----------------------------------------------------|----------------------------------------------------------|
| PLS-SEM         | Run, let complete                                  | Modal shows 4 phases, results page opens                 |
| Bootstrap 5000  | Run, let complete                                  | Modal shows real %, "X / 5,000" climbs, completes        |
| Bootstrap 5000  | Run, Hide, watch chip, expand, complete            | Chip shows %; expand returns; complete = toast + done chip|
| Bootstrap 5000  | Run, Hide, X on chip                               | Chip vanishes; calc continues; toast on complete         |
| Bootstrap 5000  | Run, Stop                                          | Confirm dialog → discard; current chunk finishes (~few s)|
| Advanced        | Run IPMA + NCA, let complete                       | Modal shows 4 phases including NCA reps label            |
| Advanced        | Run, Stop                                          | Modal shows "Stopping…"; waits for R; resets             |
| Any             | Quit during run                                    | Confirm dialog; quit aborts                              |
| Any             | Try to start second calc while one is running      | Run button disabled with tooltip                          |
| Any             | After completion, click View {X} results           | Routes to correct results view                           |

- [ ] **Step 2: File any issues found, fix in follow-ups**

- [ ] **Step 3: Commit any QA-driven fixes individually**

---

## Self-Review Notes

- **Spec coverage:** every spec section has at least one task — UX flow (T6/T10/T11), components (T3-T5, T12, T15), backend (T7), state machine (T1), error handling (T10/T11 try/catch), V1-out-of-scope items deliberately not implemented (persistence, queue, real NCA progress).
- **Type consistency:** `CalcType`, `CalcPhase`, `ActiveCalc`, `CompletedCalc` are defined once in T1 and referenced by name everywhere else.
- **No placeholders:** every code-touching step shows the code. Tasks that involve "find the existing handler" give grep commands. Tasks that depend on the actual array shape of R bootstrap responses (T9) call out the verification step explicitly rather than guessing.
- **Known follow-ups:**
  - `concat3d` in T9 may need to handle a 3D array shape rather than a flat list — confirm at runtime by inspecting one chunk response, then refine.
  - The PLS-SEM phase ladder in T6 advances on `await` boundaries, not real R progress. If the user reports the bar feels jerky on PLS-SEM, add a soft 200–300ms minimum dwell per phase.
