# Calculating Modal & Background Calculations Design

**Date:** 2026-05-01
**Product area:** metis calculation flow (PLS-SEM, Bootstrap, Advanced Analysis)
**Scope:** Replace the full-screen calculating animation with a unified, dismissible modal that supports stop, hide-to-chip, and background completion. Rename the post-calc CTA to reflect what was just calculated.

## Goal

Make long-running calculations (Bootstrap up to 5,000 samples, Advanced Analysis with NCA/IPMA/cIPMA) feel responsive and recoverable. Today the splash animation is fine for 3–5 seconds but unbearable for 1–3 minutes — users have no way to stop, no progress signal, and no way to do anything else while the calc runs.

The new flow:

- A unified **Calculating Modal** for every calc type with phase checklist, progress bar, **Stop**, and **Hide**
- A minimized **Calculating Chip** in the bottom-right when hidden, showing %, expand, and X
- Toast + chip "Done" state on completion; results CTA in the toolbar renames to **View {bootstrap | advanced analysis | PLS-SEM} results** based on most recent calc
- Single calc at a time (backend is single-threaded R Plumber); other Run buttons disable with tooltip while one runs

## Out of Scope (V2 candidates)

- Persistence of completed results across app restart
- Queue / multiple calcs in flight (Plumber is single-process)
- True iteration progress for NCA/IPMA (would require forking `seminrExtras`)
- Resuming a stopped calc from partial state
- Changing default `runDepth` for NCA, default `nboot` for Bootstrap, or the 3-core cap (separate performance work)

## UX Flow

1. **User clicks Run** on PLS-SEM / Bootstrap / Advanced Analysis → calculating modal opens
   - Title contextual to the calc (e.g. *"Bootstrapping 5,000 samples"*, *"Running advanced analysis on Customer Loyalty"*)
   - Phase checklist (✓ as each phase finishes)
   - Progress bar — **real %** for Bootstrap (chunk-based), **phase-based** for PLS-SEM and Advanced Analysis
   - Buttons: **Stop** · **Hide**
2. **Hide** → modal collapses to chip (bottom-right). Chip shows: calc-type icon, %, expand, X
3. **Expand on chip** → modal reopens
4. **X on chip** → chip vanishes; calc continues silently; results still flow to toast + Analysis tab
5. **Stop** → confirm dialog *"Stop {calc}? You'll discard {X} of {Y} samples."* → on Yes, R job cancelled, results discarded; on No, calc continues
6. **Calc completes:**
   - Modal still open → results view opens directly
   - Chip visible → chip flips to *"Done · click to view"* + brief toast (5–8s)
   - Chip X'd → toast only
   - Toolbar CTA *"Generate report"* → *"View {most recent} results"*
   - Analysis tab in title bar lists all completed results for the session
7. **Concurrency lock:** while any calc runs, other Run buttons disable with tooltip *"Calculation in progress"*
8. **App quit during calc** → confirm dialog *"Calculation in progress. Quit anyway? You'll lose {X} of {Y} samples."* → Yes cancels R + quits, No cancels quit

## Phase Checklists

**PLS-SEM** (~3–5 sec, phase-based)
1. Preparing model
2. Estimating PLS path coefficients
3. Computing summary statistics
4. Finalizing results

**Bootstrap** (real progress)
1. Preparing base model
2. Resampling **(N / total)** ← real progress bar tied to chunk completion
3. Computing bias-corrected intervals
4. Finalizing results

**Advanced Analysis** (phase-based, dynamic by user-selected analyses)
1. Preparing model
2. Running IPMA *(only if checked)*
3. Running NCA — *{run_depth} replications* *(only if checked)*
4. Running cIPMA *(only if checked)*
5. Finalizing results

## Component Architecture

- **`CalculatingModal`** — full-screen-ish overlay; props: `calcType`, `title`, `phases[]`, `currentPhase`, `progressMode: 'real' | 'phase'`, `progressPct`, `subLabel` (e.g. *"2,847 / 5,000"*), `onStop`, `onHide`
- **`CalculatingChip`** — fixed bottom-right; props: `calcType`, `progressPct`, `state: 'running' | 'done'`, `onExpand`, `onDismiss`. State `'done'` swaps the % readout for *"Done · click to view"* and removes the X
- **`CalcCancelDialog`** — confirm dialog for Stop and for Quit-while-calc; shared component
- **`CalcDoneToast`** — 5–8s auto-dismiss, click-to-open
- **`useCalculationStore`** (Zustand or existing store mechanism — match repo convention) — single source of truth for `currentCalc` (one at most), `lastCompleted` (per type), `chipState`, etc. Hooks: `startCalc`, `setPhase`, `setProgress`, `cancelCalc`, `completeCalc`, `dismissChip`
- **Toolbar CTA** — reads `lastCompleted` from store; label = *"View {type} results"*; routes to the appropriate results view

## Backend Changes

The biggest backend change is **chunking the bootstrap** so we can show real progress and support cancellation.

### Bootstrap chunking

Today: `bootstrap_model(model, nboot = 5000, cores = 3)` — single blocking call ([r-api/plumber.R:3136](r-api/plumber.R:3136)).

Proposed: chunk into `K` calls of `nboot / K` and aggregate. K = 10 by default (so a 5,000-sample run posts 10× 500-sample chunks). Each chunk returns the partial bootstrap arrays; the server accumulates them and returns the final summary only after the last chunk.

Two implementation options:

- **A.** Run all chunks in a single Plumber endpoint, but emit progress via Server-Sent Events (SSE) or repeated GET-status polls keyed off a job ID. Cleaner protocol; needs SSE/polling plumbing.
- **B.** Drive the chunking from the Electron main process: it makes K POSTs (each `nboot = 500`), aggregates client-side or via repeated POSTs to a `/bootstrap/aggregate` endpoint. Fewer plumber changes, simpler cancellation (client just stops calling).

Recommend **B**: less server-side state, easier cancellation, plumber stays REST-like. Aggregation lives in TypeScript (Electron main → renderer). Final summary statistics (CIs, bias-corrected intervals) need to be computable from accumulated bootstrap arrays — verify `add_bias_corrected_intervals` and `parse_boot_array` can be applied to the union of chunk arrays. If not, do the post-processing in a final `/bootstrap/finalize` POST that accepts the accumulated arrays.

### Cancellation

- Frontend: user clicks Stop → store sets `cancelRequested = true` → next chunk's POST is skipped, abort signal sent on any in-flight request via `AbortController`
- Backend: in-flight chunk completes naturally (we don't kill mid-bootstrap — too messy with `parallel::makeCluster`); the client just stops aggregating
- Worst-case wait after Stop: one chunk's duration. With K=10, that's roughly 1/10 of the total time — for a 3-min bootstrap, ~18 sec
- App quit: same path as Stop, plus `app.quit()` after the abort settles

### Advanced Analysis cancellation

NCA/IPMA/cIPMA are not chunked — Stop on these has to wait for the current `seminrExtras::assess_*` call to return. Modal stays open showing *"Stopping…"* until the R call returns; then results discarded. This is honest about the limitation; user can still hit Stop, they just have to wait out the current sub-analysis.

### PLS-SEM cancellation

Stop on PLS-SEM behaves the same as advanced analysis — wait for the call to return. PLS-SEM is short enough (3–5 sec) that this is a non-issue.

## State Machine

```
        ┌─────────┐
        │  idle   │
        └────┬────┘
             │ user clicks Run
             ▼
        ┌─────────┐    Hide        ┌──────────┐
        │ running │ ─────────────► │ minimized│
        │ (modal) │ ◄───────────── │  (chip)  │
        └──┬───┬──┘    Expand      └─────┬────┘
           │   │                         │ X
           │   │                         ▼
           │   │                    ┌──────────┐
           │   │                    │ silenced │
           │   │                    │ (no UI)  │
           │   │                    └─────┬────┘
           │   │                          │
           │   │ Stop or quit             │
           │   ▼                          │
           │  cancel (R job aborted) ──► idle
           │                              │
           │ all phases complete          │
           ▼                              ▼
        ┌─────────┐    show toast    ┌──────────┐
        │  done   │ ◄────────────────│  done    │
        │(modal)  │                  │ (silenced│
        │         │                  │ → toast) │
        └─────────┘                  └──────────┘
```

Single calc at a time → state lives at top of `useCalculationStore`. Other Run buttons read `state !== 'idle'` and disable.

## Error Handling

- **Backend error mid-calc** → modal flips to error state with retry/dismiss; chip disappears; toast on completion is suppressed
- **R process dies** → existing watchdog should restart it; calc fails with clear message
- **User loses network connection to local Plumber** (rare in Electron, but possible) → treat as error; show retry

## Testing

- Unit tests for `useCalculationStore` state transitions (start, hide, expand, dismiss, stop, complete, error)
- Component snapshots for modal in each phase state, chip in running and done states
- Integration test: start bootstrap, hide, expand, stop, confirm — verify cancellation propagates and store returns to idle
- Manual QA matrix: each calc type × {complete normally, hide & complete, hide & dismiss & complete, stop, quit during}

## Renaming the toolbar CTA

The existing *"Generate report"* button reads from a "last completed calc" piece of state. Implementation:

- Store exposes `lastCompletedType: 'pls' | 'bootstrap' | 'advanced' | null`
- Button label: `View ${labelFor(lastCompletedType)} results`
- Click routes to the matching results view (existing routes; no new pages)
- Disabled when `lastCompletedType === null` (initial state, no calcs run yet)

## Open questions for implementation

- Confirm whether `add_bias_corrected_intervals` and `seminr:::parse_boot_array` can run against the union of chunked bootstrap arrays. If not, add a finalize endpoint.
- Confirm chunked bootstrap with `cores = 3` per chunk doesn't introduce excessive PSOCK cluster startup overhead. If it does, raise the cores cap (separate performance work) or reduce K.
- Confirm chip placement doesn't conflict with any existing fixed-position UI (e.g. notifications, tooltips).
