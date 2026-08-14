# Group-First HOC MGA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support Repeated Indicators, Embedded Two-stage, and Disjoint Two-stage HOCs in MGA through explicit method selection and complete group-specific estimation from raw group rows.

**Architecture:** HOC MGA takes a dedicated group-first branch: split raw rows, run `run_pls_core()` independently per group, then bootstrap each complete group model. Repeated and Disjoint use SEMinR bootstrap objects; Embedded reuses the existing full Stage-1/Stage-2 resampling function, and both shapes flow through one shared MGA comparison assembler.

**Tech Stack:** React 18, TypeScript, Vite/esbuild test bundles, Node static/behavioral tests, R, Plumber, SEMinR.

---

**Design reference:** `docs/superpowers/specs/2026-08-14-hoc-micom-mga-design.md`

**Prerequisite:** Complete and verify `docs/superpowers/plans/2026-08-14-hoc-micom-guard.md` first. This plan relies on the shared HOC detection utility but does not relax the MICOM guard.

**Repository constraint:** Preserve the dirty working tree. Do not stage or commit unless the user separately authorizes it. Pause after each task, report the exact diff and tests, and request approval before continuing.

## File Map

- Modify `src/utils/hocSettings.ts`: canonical three-choice labels and lossless label/settings conversion.
- Modify `src/components/MultiGroupAnalysisModal.tsx`: HOC-only method selector, fitted-method default, explanatory copy, and selected/base settings output.
- Modify `src/services/plsApi.ts`: carry `baseHocMethod` in typed MGA requests.
- Modify `src/pages/ModelCanvas.tsx`: resolve the valid fitted/current base HOC method, pass modal props, override MGA algorithm settings, and skip MICOM cache validation for HOC MGA.
- Modify `src/pages/ResultsView.tsx`: carry recorded fitted settings into the MGA modal and apply the selected MGA method.
- Modify `src/utils/micomCache.ts`: explicit HOC-unavailable MGA overview state.
- Modify `src/results/panelData.ts`: describe actual group-specific MGA HOC estimation in HOC context rows.
- Modify `r-api/plumber.R`: validate method provenance, produce metadata, run the HOC group-first branch, reuse complete Embedded resampling, and preserve ordinary MGA.
- Modify existing HOC/MGA/MICOM contract tests.
- Create `tests/rApiHocMgaRuntime.R`: unequal-group, multi-method, multi-interaction runtime matrix.

### Task 1: Canonical Three-Choice HOC Method Mapping

**Files:**
- Modify: `tests/hocAnalysisContract.test.mjs`
- Modify: `src/utils/hocSettings.ts`

- [ ] **Step 1: Add failing mapping assertions**

Append to `tests/hocAnalysisContract.test.mjs` after the existing normalization assertions:

```js
assert.deepEqual(hocSettings.HOC_ESTIMATION_METHODS, [
  'Repeated Indicators',
  'Embedded Two-stage',
  'Disjoint Two-stage',
])

assert.equal(
  hocSettings.hocEstimationMethodLabel({ method: 'Repeated indicators', twoStage: 'Embedded' }),
  'Repeated Indicators',
)
assert.equal(
  hocSettings.hocEstimationMethodLabel({ method: 'Two-stage', twoStage: 'Embedded' }),
  'Embedded Two-stage',
)
assert.equal(
  hocSettings.hocEstimationMethodLabel({ method: 'Two-stage', twoStage: 'Disjoint two-stage' }),
  'Disjoint Two-stage',
)

assert.deepEqual(
  hocSettings.hocSettingsFromEstimationMethod('Repeated Indicators'),
  { method: 'Repeated indicators', twoStage: 'Disjoint two-stage' },
)
assert.deepEqual(
  hocSettings.hocSettingsFromEstimationMethod('Embedded Two-stage'),
  { method: 'Two-stage', twoStage: 'Embedded' },
)
assert.deepEqual(
  hocSettings.hocSettingsFromEstimationMethod('Disjoint Two-stage'),
  { method: 'Two-stage', twoStage: 'Disjoint two-stage' },
)
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```powershell
node tests\hocAnalysisContract.test.mjs
```

Expected: FAIL because the three-choice exports do not exist.

- [ ] **Step 3: Add the minimal mapping API**

Add to `src/utils/hocSettings.ts`:

```ts
export const HOC_ESTIMATION_METHODS = [
  'Repeated Indicators',
  'Embedded Two-stage',
  'Disjoint Two-stage',
] as const

export type HocEstimationMethod = typeof HOC_ESTIMATION_METHODS[number]

export function hocEstimationMethodLabel(settings: HocSettings): HocEstimationMethod {
  if (settings.method === 'Repeated indicators') return 'Repeated Indicators'
  return settings.twoStage === 'Embedded' ? 'Embedded Two-stage' : 'Disjoint Two-stage'
}

export function hocSettingsFromEstimationMethod(method: HocEstimationMethod): HocSettings {
  if (method === 'Repeated Indicators') {
    return { method: 'Repeated indicators', twoStage: 'Disjoint two-stage' }
  }
  if (method === 'Embedded Two-stage') {
    return { method: 'Two-stage', twoStage: 'Embedded' }
  }
  return { method: 'Two-stage', twoStage: 'Disjoint two-stage' }
}
```

The canonical ignored two-stage value for Repeated Indicators is `Disjoint two-stage`; comparison logic uses the three-choice label, so irrelevant stale two-stage values cannot create a false method change.

- [ ] **Step 4: Run the contract and verify GREEN**

Run:

```powershell
node tests\hocAnalysisContract.test.mjs
```

Expected: `PASS HOC analysis contract`.

- [ ] **Step 5: Pause for repository approval**

Report the mapping API and RED/GREEN result. Do not stage or commit. Ask permission before Task 2.

### Task 2: Add the HOC-Only MGA Selector

**Files:**
- Modify: `tests/multiGroupAnalysisModalStatic.test.mjs`
- Modify: `src/components/MultiGroupAnalysisModal.tsx`

- [ ] **Step 1: Add failing modal assertions**

Append to `tests/multiGroupAnalysisModalStatic.test.mjs`:

```js
assert.match(
  modalSource,
  /hasHigherOrderConstructs\?:\s*boolean[\s\S]*initialHocSettings\?:\s*HocSettings/,
  'MGA modal should receive HOC availability and the fitted/current HOC settings.',
)
assert.match(
  modalSource,
  /HOC estimation method[\s\S]*Repeated Indicators[\s\S]*Embedded Two-stage[\s\S]*Disjoint Two-stage/,
  'HOC MGA should expose exactly the three approved estimators.',
)
assert.match(
  modalSource,
  /hasHigherOrderConstructs\s*&&[\s\S]*role="radiogroup"/,
  'The HOC estimator control should render only for HOC models.',
)
assert.match(
  modalSource,
  /Defaults to the method used for the fitted PLS-SEM model\. Changing it re-estimates the model for MGA using the selected method\./,
  'The selector should explain that changing the fitted method re-estimates MGA.',
)
assert.match(
  modalSource,
  /baseHocMethod:[\s\S]*hocMethod:[\s\S]*hocTwoStage:/,
  'MGA settings should return both provenance and selected normalized settings.',
)
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node tests\multiGroupAnalysisModalStatic.test.mjs
```

Expected: FAIL because the modal has no HOC props or selector.

- [ ] **Step 3: Extend modal types and state**

At the top of `src/components/MultiGroupAnalysisModal.tsx`, import:

```ts
import type {
  HocEstimationMethod,
  HocMethod,
  HocSettings,
  HocTwoStageApproach,
} from '../utils/hocSettings'
import {
  HOC_ESTIMATION_METHODS,
  hocEstimationMethodLabel,
  hocSettingsFromEstimationMethod,
} from '../utils/hocSettings'
```

Extend the settings and props:

```ts
export interface MultiGroupAnalysisSettings {
  groupingVariable: string
  groupA: string
  groupB: string
  nboot: number
  alpha: number
  seed: number
  baseHocMethod?: HocEstimationMethod
  hocMethod?: HocMethod
  hocTwoStage?: HocTwoStageApproach
}

export interface MultiGroupAnalysisModalProps {
  modelName: string
  groupingOptions: string[]
  datasetRows?: string[][]
  hasHigherOrderConstructs?: boolean
  initialHocSettings?: HocSettings
  isRunning?: boolean
  onClose: () => void
  onRun?: (settings: MultiGroupAnalysisSettings) => void
}
```

Destructure defaults and initialize the selected label:

```ts
hasHigherOrderConstructs = false,
initialHocSettings = { method: 'Two-stage', twoStage: 'Disjoint two-stage' },
```

```ts
const baseHocMethod = hocEstimationMethodLabel(initialHocSettings)
const [hocEstimationMethod, setHocEstimationMethod] = useState<HocEstimationMethod>(baseHocMethod)
```

In `handleRun`, derive and return selected settings only for an HOC:

```ts
const selectedHocSettings = hocSettingsFromEstimationMethod(hocEstimationMethod)
onRun?.({
  groupingVariable,
  groupA,
  groupB,
  nboot: Number(nbootInput),
  alpha: Number(alphaInput),
  seed: Number(seedInput),
  ...(hasHigherOrderConstructs ? {
    baseHocMethod,
    hocMethod: selectedHocSettings.method,
    hocTwoStage: selectedHocSettings.twoStage,
  } : {}),
})
```

- [ ] **Step 4: Render the accessible HOC selector**

Insert this block between the group comparison band and numeric settings:

```tsx
{hasHigherOrderConstructs && (
  <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
    <span style={labelStyle}>HOC estimation method</span>
    <div
      role="radiogroup"
      aria-label="HOC estimation method"
      className="grid"
      style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}
    >
      {HOC_ESTIMATION_METHODS.map((method) => {
        const selected = hocEstimationMethod === method
        return (
          <button
            key={method}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={isRunning}
            onClick={() => setHocEstimationMethod(method)}
            style={{
              minHeight: 36,
              padding: '6px 8px',
              borderRadius: 6,
              border: selected
                ? '1px solid rgb(var(--color-accent-rgb) / 0.62)'
                : '1px solid var(--color-border)',
              background: selected
                ? 'rgb(var(--color-accent-rgb) / 0.14)'
                : 'var(--color-input, var(--color-elevated))',
              color: selected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontFamily: 'DM Sans, Inter, sans-serif',
              fontSize: 11,
              cursor: isRunning ? 'not-allowed' : 'pointer',
            }}
          >
            {method}
          </button>
        )
      })}
    </div>
    <p style={{ margin: 0, color: 'var(--color-text-muted)', fontFamily: 'DM Sans, Inter, sans-serif', fontSize: 11, lineHeight: '15px' }}>
      Defaults to the method used for the fitted PLS-SEM model. Changing it re-estimates the model for MGA using the selected method.
    </p>
  </div>
)}
```

Use `height: hasHigherOrderConstructs ? 486 : 410` for the modal shell and `paddingTop: hasHigherOrderConstructs ? 12 : 40` for the numeric settings row. Non-HOC layout remains byte-for-byte equivalent apart from the conditional expression.

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```powershell
node tests\multiGroupAnalysisModalStatic.test.mjs
npm run typecheck
```

Expected: modal contract passes and typecheck exits 0.

- [ ] **Step 6: Pause for repository approval**

Report the modal-only change and checks. Do not stage or commit. Ask permission before Task 3.

### Task 3: Carry Fitted and Selected HOC Methods Through MGA Requests

**Files:**
- Modify: `tests/multiGroupAnalysisPlumberContract.test.mjs`
- Modify: `tests/multiGroupAnalysisResultsContract.test.mjs`
- Modify: `src/services/plsApi.ts`
- Modify: `src/pages/ModelCanvas.tsx`
- Modify: `src/pages/ResultsView.tsx`

- [ ] **Step 1: Add failing request and page wiring assertions**

Add assertions requiring:

```js
assert.match(
  plsApiSource,
  /RunMultiGroupAnalysisRequest extends RunPlsRequest[\s\S]*baseHocMethod\?:\s*string/,
  'MGA requests should carry the fitted/base HOC method separately.',
)
assert.match(
  modelCanvasSource,
  /<MultiGroupAnalysisModal[\s\S]*hasHigherOrderConstructs=\{hasHigherOrderConstructs\}[\s\S]*initialHocSettings=\{initialMgaHocSettings\}/,
  'ModelCanvas should initialize HOC MGA from the fitted/current method.',
)
assert.match(
  modelCanvasSource,
  /handleRunMultiGroupAnalysis[\s\S]*normalizeHocSettings\(settings\.hocMethod, settings\.hocTwoStage\)[\s\S]*baseHocMethod:\s*settings\.baseHocMethod/,
  'ModelCanvas should send selected settings plus base provenance.',
)
assert.match(
  resultsViewSource,
  /<MultiGroupAnalysisModal[\s\S]*hasHigherOrderConstructs=\{hasHigherOrderConstructs\}[\s\S]*initialHocSettings=\{initialMgaHocSettings\}/,
  'ResultsView should initialize HOC MGA from recorded fitted settings.',
)
```

- [ ] **Step 2: Run both contracts and verify RED**

Run:

```powershell
node tests\multiGroupAnalysisPlumberContract.test.mjs
node tests\multiGroupAnalysisResultsContract.test.mjs
```

Expected: FAIL on the missing request field and modal wiring.

- [ ] **Step 3: Extend the typed request**

In `src/services/plsApi.ts` add:

```ts
export interface RunMultiGroupAnalysisRequest extends RunPlsRequest {
  groupingVariable: string
  groupA: string
  groupB: string
  nboot: number
  alpha: number
  seed: number
  baseHocMethod?: string
}
```

- [ ] **Step 4: Resolve and apply Model Canvas HOC MGA settings**

In `src/pages/ModelCanvas.tsx`, use the current graph's fitted PLS result when available:

```ts
const initialMgaHocSettings = useMemo(() => {
  const basePlsAnalysis = currentModel?.state?.basePlsAnalysis
  const fittedSettings = basePlsAnalysis?.graphSignature === currentGraphSignature
    ? basePlsAnalysis?.results?.algorithm?.settings?.algorithm_settings
    : null

  if (fittedSettings && typeof fittedSettings === 'object') {
    return normalizeHocSettings(fittedSettings.hocMethod, fittedSettings.hocTwoStage)
  }
  return readHocSettings(readSharedStorageValue)
}, [currentGraphSignature, currentModel?.state?.basePlsAnalysis, preferencesRevision])
```

In `handleRunMultiGroupAnalysis`, before building the base payload:

```ts
const selectedHocSettings = hasHigherOrderConstructs
  ? normalizeHocSettings(settings.hocMethod, settings.hocTwoStage)
  : undefined
const basePayload = buildAnalysisPayload('mga', plsAlgorithm, selectedHocSettings)
```

Add this request property:

```ts
...(hasHigherOrderConstructs ? { baseHocMethod: settings.baseHocMethod } : {}),
```

Pass modal props:

```tsx
hasHigherOrderConstructs={hasHigherOrderConstructs}
initialHocSettings={initialMgaHocSettings}
```

- [ ] **Step 5: Resolve and apply Results View HOC MGA settings**

Add this memo after `hasHigherOrderConstructs`:

```ts
const initialMgaHocSettings = useMemo(() => {
  const recorded = getByPath(analysisResults, 'algorithm.settings.algorithm_settings')
  return normalizeHocSettings(recorded?.hocMethod, recorded?.hocTwoStage)
}, [analysisResults])
```

In `handleRunMultiGroupFromResults`, normalize the selection and create a request payload:

```ts
const selectedHocSettings = hasHigherOrderConstructs
  ? normalizeHocSettings(settings.hocMethod, settings.hocTwoStage)
  : undefined
const mgaPayload = {
  ...payload,
  ...(selectedHocSettings ? {
    algorithmSettings: {
      ...(payload.algorithmSettings ?? {}),
      hocMethod: selectedHocSettings.method,
      hocTwoStage: selectedHocSettings.twoStage,
    },
    baseHocMethod: settings.baseHocMethod,
  } : {}),
}
```

Use `mgaPayload` for the MGA request and any non-HOC MICOM cache-validation payload. Pass the same two modal props as Model Canvas. Add new memo/callback dependencies.

- [ ] **Step 6: Run contracts and typecheck**

Run:

```powershell
node tests\multiGroupAnalysisPlumberContract.test.mjs
node tests\multiGroupAnalysisResultsContract.test.mjs
node tests\multiGroupAnalysisModalStatic.test.mjs
npm run typecheck
```

Expected: all tests pass and typecheck exits 0.

- [ ] **Step 7: Pause for repository approval**

Report request provenance and page wiring. Do not stage or commit. Ask permission before Task 4.

### Task 4: Represent MICOM as Unavailable in HOC MGA

**Files:**
- Modify: `tests/micomMGAWorkspaceCache.test.mjs`
- Modify: `tests/multiGroupAnalysisPlumberContract.test.mjs`
- Modify: `src/utils/micomCache.ts`
- Modify: `src/pages/ModelCanvas.tsx`
- Modify: `src/pages/ResultsView.tsx`
- Modify: `r-api/plumber.R`

- [ ] **Step 1: Add failing overview-state assertions**

In `tests/micomMGAWorkspaceCache.test.mjs` assert:

```js
assert.deepEqual(micomCache.MICOM_MGA_HOC_UNAVAILABLE_OVERVIEW, {
  status: 'unavailable',
  message: 'MICOM is unavailable for HOC models; MGA was estimated without a MICOM invariance assessment.',
  source: 'hoc-not-supported',
})
```

Add static assertions that both MGA handlers choose this constant when their payload contains `is_higher_order`, and only call `resolveMicomOverviewForMgaCache()` in the non-HOC branch.

Add a Plumber contract assertion for the exact backend overview message when `has_higher_order_construct(payload)` is true.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node tests\micomMGAWorkspaceCache.test.mjs
node tests\multiGroupAnalysisPlumberContract.test.mjs
```

Expected: FAIL because the unavailable state and conditional flow do not exist.

- [ ] **Step 3: Add the unavailable overview constant**

In `src/utils/micomCache.ts`, widen the type and export the constant:

```ts
export interface MicomOverviewForMga {
  status: 'full' | 'partial' | 'not-run' | 'unavailable'
  message: string
  source: 'cached-micom' | 'not-run' | 'hoc-not-supported'
}

export const MICOM_MGA_HOC_UNAVAILABLE_MESSAGE =
  'MICOM is unavailable for HOC models; MGA was estimated without a MICOM invariance assessment.'

export const MICOM_MGA_HOC_UNAVAILABLE_OVERVIEW: MicomOverviewForMga = Object.freeze({
  status: 'unavailable',
  message: MICOM_MGA_HOC_UNAVAILABLE_MESSAGE,
  source: 'hoc-not-supported',
})
```

- [ ] **Step 4: Skip MICOM cache validation for HOC MGA**

In both page handlers, calculate:

```ts
const payloadHasHoc = containsHigherOrderConstruct(mgaPayload.constructs)
const micomOverview = payloadHasHoc
  ? MICOM_MGA_HOC_UNAVAILABLE_OVERVIEW
  : await resolveMicomOverviewForMgaCache({
      cache: cachedMicom,
      payload: micomValidationPayload,
      graphSignature: currentGraphSignature,
      runConfiguralPrecheck: runPermutationConfiguralPrecheck,
    })
```

Use the Results View graph-signature expression already present in that page. The HOC branch must not call `runPermutationConfiguralPrecheck`.

- [ ] **Step 5: Make the backend overview accurate before frontend attachment**

In `r-api/plumber.R` add:

```r
mga_hoc_micom_unavailable_message <- paste0(
  "MICOM is unavailable for HOC models; ",
  "MGA was estimated without a MICOM invariance assessment."
)
```

In `mga_overview_setup_rows()` calculate:

```r
measurement_invariance_message <- if (has_higher_order_construct(payload)) {
  mga_hoc_micom_unavailable_message
} else {
  mga_micom_overview_message(mga_result)
}
```

Use `measurement_invariance_message` in the existing Measurement Invariance Status row.

- [ ] **Step 6: Run tests and verify GREEN**

Run:

```powershell
node tests\micomMGAWorkspaceCache.test.mjs
node tests\multiGroupAnalysisPlumberContract.test.mjs
node tests\multiGroupAnalysisResultsContract.test.mjs
npm run typecheck
```

Expected: tests pass and typecheck exits 0.

- [ ] **Step 7: Pause for repository approval**

Report that HOC MGA skipped MICOM and displayed the explicit unavailable state. Do not stage or commit. Ask permission before Task 5.

### Task 5: Validate and Persist HOC Method Provenance

**Files:**
- Modify: `tests/multiGroupAnalysisPlumberContract.test.mjs`
- Modify: `r-api/plumber.R`

- [ ] **Step 1: Add failing metadata assertions**

Require the backend to validate `baseHocMethod` against the three labels and expose all provenance fields in top-level settings, algorithm settings, and `meta.analysis_settings.mga`:

```js
assert.match(
  plumberSource,
  /validate_multi_group_analysis_payload[\s\S]*baseHocMethod[\s\S]*Repeated Indicators[\s\S]*Embedded Two-stage[\s\S]*Disjoint Two-stage/,
  'MGA should validate the fitted/base HOC method label.',
)
for (const field of ['base_hoc_method', 'mga_hoc_method', 'hoc_method_changed']) {
  assert.match(plumberSource, new RegExp(field), `MGA metadata should expose ${field}.`)
}
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```powershell
node tests\multiGroupAnalysisPlumberContract.test.mjs
```

Expected: FAIL because provenance validation and metadata are missing.

- [ ] **Step 3: Validate the request provenance**

In `validate_multi_group_analysis_payload()` add:

```r
selected_hoc_method <- hoc_method_label(
  payload$algorithmSettings %||% list(),
  has_hoc = any(vapply(payload$constructs %||% list(), function(con) isTRUE(con$is_higher_order), logical(1)))
)
base_hoc_method <- require_optional_choice(
  payload$baseHocMethod,
  "baseHocMethod",
  c("Repeated Indicators", "Embedded Two-stage", "Disjoint Two-stage"),
  selected_hoc_method
)
```

Return `baseHocMethod = base_hoc_method` in the normalized MGA fields.

- [ ] **Step 4: Add one provenance resolver**

Add near the MGA response helpers:

```r
mga_hoc_method_metadata <- function(payload) {
  has_hoc <- has_higher_order_construct(payload)
  if (!has_hoc) {
    return(list(
      base_hoc_method = "Not applicable",
      mga_hoc_method = "Not applicable",
      hoc_method_changed = FALSE
    ))
  }

  mga_method <- hoc_method_label(payload$algorithmSettings %||% list(), has_hoc = TRUE)
  base_method <- as.character(payload$baseHocMethod %||% mga_method)
  list(
    base_hoc_method = base_method,
    mga_hoc_method = mga_method,
    hoc_method_changed = !identical(base_method, mga_method)
  )
}
```

- [ ] **Step 5: Persist provenance consistently**

At the beginning of `map_mga_response()` add:

```r
hoc_metadata <- mga_hoc_method_metadata(payload)
```

Add the three fields to:

- Top-level `settings`.
- `algorithm$settings`.
- `meta$analysis_settings$mga`.

Set `algorithm$settings$hoc_method` to `hoc_metadata$mga_hoc_method`. Add an execution-log row when `hoc_method_changed` is true:

```r
if (isTRUE(hoc_metadata$hoc_method_changed)) {
  execution_log[[length(execution_log) + 1L]] <- list(message = sprintf(
    "MGA re-estimated the HOC using %s instead of the fitted PLS-SEM method %s.",
    hoc_metadata$mga_hoc_method,
    hoc_metadata$base_hoc_method
  ))
}
```

- [ ] **Step 6: Run the contract and verify GREEN**

Run:

```powershell
node tests\multiGroupAnalysisPlumberContract.test.mjs
```

Expected: `PASS multi-group analysis plumber contract`.

- [ ] **Step 7: Pause for repository approval**

Report validated provenance and output locations. Do not stage or commit. Ask permission before Task 6.

### Task 6: Add Group-First Repeated and Disjoint HOC MGA

**Files:**
- Create: `tests/rApiHocMgaRuntime.R`
- Modify: `tests/multiGroupAnalysisPlumberContract.test.mjs`
- Modify: `r-api/plumber.R`

- [ ] **Step 1: Create the failing Repeated/Disjoint runtime matrix**

Create `tests/rApiHocMgaRuntime.R` with this setup:

```r
Sys.setenv(METIS_ALLOWED_DATA_ROOTS = getwd(), METIS_ANALYSIS_CORES = "1")

exprs <- parse("r-api/plumber.R")
env <- new.env(parent = globalenv())
for (i in seq_len(length(exprs) - 2L)) eval(exprs[[i]], envir = env)

data <- env$read_dataset(file.path(getwd(), "sample dataset.csv"))
data$Group <- c(rep("A", 29L), rep("B", nrow(data) - 29L))

make_payload <- function(method, two_stage) list(
  constructs = list(
    list(name = "PEOU", type = "Reflective", indicators = as.list(paste0("PEOU_", 1:4))),
    list(name = "PU", type = "Reflective", indicators = as.list(paste0("PU_", 1:4))),
    list(name = "HOC", is_higher_order = TRUE, higher_order_type = "Reflective", dimensions = list("PEOU", "PU")),
    list(name = "ATT", type = "Reflective", indicators = as.list(paste0("ATT_", 1:4))),
    list(name = "BI", type = "Reflective", indicators = as.list(paste0("BI_", 1:4)))
  ),
  paths = list(
    list(from = "HOC", to = "BI"),
    list(from = "ATT", to = "BI"),
    list(from = "PEOU", to = "BI"),
    list(from = "HOC*ATT", to = "BI"),
    list(from = "PEOU*HOC", to = "BI")
  ),
  interactions = list(
    list(iv = "HOC", moderator = "ATT", outcome = "BI"),
    list(iv = "PEOU", moderator = "HOC", outcome = "BI")
  ),
  algorithm = "standard",
  algorithmSettings = list(hocMethod = method, hocTwoStage = two_stage),
  groupingVariable = "Group",
  groupA = "A",
  groupB = "B",
  nboot = 2L,
  alpha = 0.10,
  seed = 123L,
  baseHocMethod = env$hoc_method_label(list(hocMethod = method, hocTwoStage = two_stage), TRUE)
)

assert_hoc_mga <- function(method, two_stage) {
  payload <- make_payload(method, two_stage)
  set.seed(payload$seed)
  result <- env$run_hoc_mga_bootstrap_tables(data, payload, cores = 1L)
  stopifnot(length(result$groupSpecific$groupA$final_results$path_coefficients) > 0L)
  stopifnot(length(result$groupSpecific$groupB$final_results$path_coefficients) > 0L)

  comparison_paths <- vapply(
    result$pathCoefficients$henselerPlsMga,
    function(row) as.character(row$path %||% ""),
    character(1)
  )
  stopifnot("HOC*ATT -> BI" %in% comparison_paths)
  stopifnot("PEOU*HOC -> BI" %in% comparison_paths)

  for (group_name in c("groupA", "groupB")) {
    rows <- result$groupSpecific[[group_name]]$final_results$path_coefficients
    labels <- vapply(rows, function(row) as.character(row$path %||% row$row_name %||% ""), character(1))
    stopifnot(all(c("HOC -> BI", "ATT -> BI", "PEOU -> BI", "HOC*ATT -> BI", "PEOU*HOC -> BI") %in% labels))
  }

  numbers <- vapply(result$descriptives, function(row) as.integer(row$Number), integer(1))
  stopifnot(29L %in% numbers, 35L %in% numbers)
  invisible(result)
}

assert_hoc_mga("Repeated indicators", "Disjoint two-stage")
assert_hoc_mga("Two-stage", "Disjoint two-stage")

cat("PASS HOC MGA repeated/disjoint runtime\n")
```

Define `%||%` at test scope before `assert_hoc_mga` because the helper operator lives in the parsed environment:

```r
`%||%` <- function(x, y) if (is.null(x)) y else x
```

- [ ] **Step 2: Add a failing route/static contract**

Require `run_hoc_mga_bootstrap_tables()` to call `run_pls_core()` once for each raw group and require `/run-multi-group-analysis` to choose it only when `has_higher_order_construct(payload)` is true. Ordinary MGA must retain `run_mga_bootstrap_tables()`.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
r-api\R-Portable\App\R-Portable\bin\Rscript.exe tests\rApiHocMgaRuntime.R
node tests\multiGroupAnalysisPlumberContract.test.mjs
```

Expected: FAIL because `run_hoc_mga_bootstrap_tables()` does not exist.

- [ ] **Step 4: Normalize bootstrap path extraction**

Replace `mga_boot_paths_matrix()` with an implementation that works for both SEMinR and Embedded bootstrap arrays:

```r
mga_boot_paths_matrix <- function(pls_boot, sm_matrix = pls_boot$smMatrix) {
  boot_array <- pls_boot$boot_paths
  if (!is.null(boot_array) && length(dim(boot_array)) >= 3L && !is.null(sm_matrix)) {
    sources <- seminr:::path_sources(sm_matrix)
    targets <- seminr:::path_targets(sm_matrix)
    path_names <- seminr:::to_path_labels(sm_matrix)
    repetitions <- dim(boot_array)[3]
    out <- matrix(NA_real_, nrow = repetitions, ncol = length(path_names))
    for (index in seq_along(path_names)) {
      out[, index] <- suppressWarnings(as.numeric(boot_array[sources[[index]], targets[[index]], ]))
    }
    colnames(out) <- path_names
    return(out)
  }

  boot_paths <- seminr:::boot_paths_df(pls_boot)
  if (is.null(dim(boot_paths))) {
    path_names <- seminr:::to_path_labels(sm_matrix)
    boot_paths <- matrix(boot_paths, ncol = 1L)
    colnames(boot_paths) <- path_names[seq_len(ncol(boot_paths))]
  }
  boot_paths
}
```

Update `mga_path_entries()` to pass its reference `smMatrix` into both calls.

- [ ] **Step 5: Let group-specific output accept a full core**

Change the signature to:

```r
mga_group_bootstrap_sections <- function(payload, group_data, group_core, group_boot, embedded = FALSE) {
```

At its start, add:

```r
alpha <- payload$alpha
algorithm <- if (!is.null(payload$algorithm)) tolower(as.character(payload$algorithm)) else "standard"
if (!(algorithm %in% c("standard", "consistent"))) algorithm <- "standard"
algorithm_label <- if (algorithm == "consistent") "Consistent PLS (PLSc)" else "Standard PLS"
confidence_level <- sprintf("%g%%", (1 - alpha) * 100)

if (isTRUE(embedded)) {
  response <- assemble_embedded_bootstrap_response(
    payload, group_data, group_core, group_boot, payload$nboot,
    confidence_level, algorithm, algorithm_label, alpha
  )
  return(response$results %||% response)
}

group_model <- group_core$model
```

After the new Embedded early return, retain the existing statements that build `boot_summary$bootstrapped_paths`, bootstrapped loadings, bootstrapped weights, total paths, and the `assemble_bootstrap_response(...)` call. Change the model assignment to `group_model <- group_core$model` and remove only the local `group_core <- list(...)` reconstruction.

- [ ] **Step 6: Extract one shared MGA assembler**

Move the comparison and result-list portion of `run_mga_bootstrap_tables()` into this complete helper:

```r
assemble_mga_bootstrap_tables <- function(
  payload,
  group1_data,
  group2_data,
  group1_core,
  group2_core,
  group1_boot,
  group2_boot,
  embedded = FALSE
) {
  group1_model <- group1_core$model
  group2_model <- group2_core$model
  group1_summary <- group1_core$summary %||% summary(group1_model)
  group2_summary <- group2_core$summary %||% summary(group2_model)
  group1_n <- nrow(group1_data)
  group2_n <- nrow(group2_data)

  path_entries <- mga_path_entries(group1_model, group1_model, group2_model, group1_boot, group2_boot)
  specific_indirect_entries <- mga_specific_indirect_entries(payload, group1_model, group2_model, group1_boot, group2_boot)
  total_indirect_entries <- mga_effect_matrix_entries(
    seminr:::total_indirect_effects(group1_model$path_coef),
    seminr:::total_indirect_effects(group2_model$path_coef),
    mga_boot_total_indirect_array(group1_boot),
    mga_boot_total_indirect_array(group2_boot)
  )
  total_effect_entries <- mga_effect_matrix_entries(
    seminr:::total_effects(group1_model$path_coef),
    seminr:::total_effects(group2_model$path_coef),
    group1_boot$boot_total_paths,
    group2_boot$boot_total_paths
  )
  loading_entries <- mga_measurement_entries(
    group1_model$outer_loadings,
    group2_model$outer_loadings,
    group1_boot$boot_loadings,
    group2_boot$boot_loadings
  )
  weight_entries <- mga_measurement_entries(
    group1_model$outer_weights,
    group2_model$outer_weights,
    group1_boot$boot_weights,
    group2_boot$boot_weights
  )

  list(
    groupSpecific = list(
      groupA = mga_group_bootstrap_sections(payload, group1_data, group1_core, group1_boot, embedded),
      groupB = mga_group_bootstrap_sections(payload, group2_data, group2_core, group2_boot, embedded)
    ),
    descriptives = c(
      mga_descriptive_rows(payload$groupA, payload, group1_data, group1_model, group1_summary),
      mga_descriptive_rows(payload$groupB, payload, group2_data, group2_model, group2_summary)
    ),
    pathCoefficients = mga_compare_entries(path_entries, payload, "groupA_beta", "groupB_beta", group1_n, group2_n),
    specificIndirectEffects = mga_compare_entries(specific_indirect_entries, payload, "groupA_beta", "groupB_beta", group1_n, group2_n),
    totalIndirectEffects = mga_compare_entries(total_indirect_entries, payload, "groupA_beta", "groupB_beta", group1_n, group2_n),
    totalEffects = mga_compare_entries(total_effect_entries, payload, "groupA_beta", "groupB_beta", group1_n, group2_n),
    outerLoadings = mga_compare_entries(loading_entries, payload, "groupA_loading", "groupB_loading", group1_n, group2_n),
    outerWeights = mga_compare_entries(weight_entries, payload, "groupA_weight", "groupB_weight", group1_n, group2_n)
  )
}
```

Refactor existing `run_mga_bootstrap_tables()` to wrap its rerun models as `list(model = ..., summary = ...)` and call this assembler. This preserves ordinary MGA behavior and its public helper signature.

- [ ] **Step 7: Add the non-Embedded HOC group-first helper**

Add:

```r
run_hoc_mga_bootstrap_tables <- function(data, payload, cores = 1L, timings = NULL) {
  condition <- mga_group_condition(data, payload$groupingVariable, payload$groupA)
  group1_data <- data[condition, , drop = FALSE]
  group2_data <- data[!condition, , drop = FALSE]
  hoc_settings <- normalize_hoc_settings(payload$algorithmSettings %||% list())
  embedded <- identical(hoc_settings$hocMethod, "Two-stage") &&
    identical(hoc_settings$hocTwoStage, "Embedded")
  if (embedded) stop("Embedded HOC MGA requires full two-stage resampling.", call. = FALSE)

  group1_core <- timed_or_direct(timings, "fit HOC MGA group A", run_pls_core(payload, group1_data))
  group2_core <- timed_or_direct(timings, "fit HOC MGA group B", run_pls_core(payload, group2_data))
  group1_boot <- timed_or_direct(
    timings,
    "bootstrap HOC MGA group A",
    seminr::bootstrap_model(group1_core$model, nboot = payload$nboot, cores = cores)
  )
  group2_boot <- timed_or_direct(
    timings,
    "bootstrap HOC MGA group B",
    seminr::bootstrap_model(group2_core$model, nboot = payload$nboot, cores = cores)
  )

  assemble_mga_bootstrap_tables(
    payload, group1_data, group2_data,
    group1_core, group2_core, group1_boot, group2_boot,
    embedded = FALSE
  )
}
```

Do not route Embedded through it until Task 7. Add the route branch only for HOC Repeated or Disjoint; Embedded continues to fail the new focused test until its complete branch is implemented.

- [ ] **Step 8: Run focused runtime tests and verify GREEN for two methods**

Run:

```powershell
r-api\R-Portable\App\R-Portable\bin\Rscript.exe tests\rApiHocMgaRuntime.R
node tests\multiGroupAnalysisPlumberContract.test.mjs
```

Expected: Repeated and Disjoint runtime assertions pass; static route contract passes.

- [ ] **Step 9: Re-run ordinary MGA contracts**

Run:

```powershell
node tests\multiGroupAnalysisResultsContract.test.mjs
node tests\multiGroupAnalysisPlumberContract.test.mjs
```

Expected: both pass, proving ordinary result contracts remain intact.

- [ ] **Step 10: Pause for repository approval**

Report group-first Repeated/Disjoint behavior, unequal sample sizes, joint interaction rows, and ordinary MGA preservation. Do not stage or commit. Ask permission before Task 7.

### Task 7: Add Full Embedded Group and Resample Estimation

**Files:**
- Modify: `tests/rApiHocMgaRuntime.R`
- Modify: `tests/multiGroupAnalysisPlumberContract.test.mjs`
- Modify: `r-api/plumber.R`

- [ ] **Step 1: Extend the runtime test and verify RED**

Before restoring `run_pls_core`, wrap it to record the row counts used by every complete fit:

```r
original_run_pls_core <- env$run_pls_core
captured_fit_rows <- integer(0)
env$run_pls_core <- function(payload, fit_data) {
  captured_fit_rows <<- c(captured_fit_rows, nrow(fit_data))
  original_run_pls_core(payload, fit_data)
}
```

Add:

```r
embedded_result <- assert_hoc_mga("Two-stage", "Embedded")
stopifnot(sum(captured_fit_rows == 29L) >= 3L)
stopifnot(sum(captured_fit_rows == 35L) >= 3L)
stopifnot(!any(captured_fit_rows == nrow(data)))
```

The minimum of three per group proves one original fit plus more than one complete bootstrap fit. Additional calls from isolated diagnostics are acceptable, but no call may receive pooled rows.

Run:

```powershell
r-api\R-Portable\App\R-Portable\bin\Rscript.exe tests\rApiHocMgaRuntime.R
```

Expected: FAIL with the explicit Embedded HOC MGA resampling error.

- [ ] **Step 2: Replace the Embedded stop with the complete bootstrap branch**

In `run_hoc_mga_bootstrap_tables()`, fit both group cores first, then choose bootstraps:

```r
group1_core <- timed_or_direct(timings, "fit HOC MGA group A", run_pls_core(payload, group1_data))
group2_core <- timed_or_direct(timings, "fit HOC MGA group B", run_pls_core(payload, group2_data))

if (embedded) {
  group1_boot <- timed_or_direct(
    timings,
    "embedded HOC MGA group A bootstrap",
    run_embedded_hoc_bootstrap(payload, group1_data, group1_core, payload$nboot, timings = timings)
  )
  group2_boot <- timed_or_direct(
    timings,
    "embedded HOC MGA group B bootstrap",
    run_embedded_hoc_bootstrap(payload, group2_data, group2_core, payload$nboot, timings = timings)
  )
} else {
  group1_boot <- timed_or_direct(
    timings,
    "bootstrap HOC MGA group A",
    seminr::bootstrap_model(group1_core$model, nboot = payload$nboot, cores = cores)
  )
  group2_boot <- timed_or_direct(
    timings,
    "bootstrap HOC MGA group B",
    seminr::bootstrap_model(group2_core$model, nboot = payload$nboot, cores = cores)
  )
}

assemble_mga_bootstrap_tables(
  payload, group1_data, group2_data,
  group1_core, group2_core, group1_boot, group2_boot,
  embedded = embedded
)
```

The route calls `set.seed(payload$seed)` once before this helper. Do not pass the same explicit seed separately to each group; sequential draws preserve reproducibility without forcing identical resample streams.

- [ ] **Step 3: Route every HOC method through group-first estimation**

In `/run-multi-group-analysis`, replace unconditional pooled-core construction with:

```r
if (has_higher_order_construct(payload)) {
  mga_result <- time_phase(
    timings,
    "group-first HOC bootstrap MGA tables",
    run_hoc_mga_bootstrap_tables(mga_data, payload, cores = cores, timings = timings),
    details = list(
      nboot = payload$nboot,
      hoc_method = hoc_method_label(payload$algorithmSettings, TRUE),
      cores = cores,
      detected_cores = core_plan$detected_cores,
      reserved_cores = core_plan$reserved_cores,
      core_policy = core_plan$policy
    )
  )
} else {
  mga_core <- time_phase(timings, "estimate selected-group pls model", run_pls_core(payload, mga_data))
  mga_condition <- mga_group_condition(mga_data, payload$groupingVariable, payload$groupA)
  mga_result <- time_phase(
    timings,
    "seminr bootstrap MGA tables",
    run_mga_bootstrap_tables(
      pls_model = mga_core$model,
      condition = mga_condition,
      payload = payload,
      cores = cores
    ),
    details = list(
      nboot = payload$nboot,
      cores = cores,
      detected_cores = core_plan$detected_cores,
      reserved_cores = core_plan$reserved_cores,
      core_policy = core_plan$policy
    )
  )
}
```

Compute `core_plan`, `cores`, and `set.seed(payload$seed)` before this branch.

- [ ] **Step 4: Record the Embedded execution path**

In `map_mga_response()`, append these log rows for every HOC:

```r
if (has_higher_order_construct(payload)) {
  execution_log[[length(execution_log) + 1L]] <- list(message = sprintf(
    "Group A and Group B were fitted independently using %s.",
    hoc_metadata$mga_hoc_method
  ))
}
if (identical(hoc_metadata$mga_hoc_method, "Embedded Two-stage")) {
  execution_log[[length(execution_log) + 1L]] <- list(message = sprintf(
    "Embedded Stage 1 and Stage 2 were rerun for every bootstrap resample in both groups (%s per group).",
    payload$nboot
  ))
}
```

Set `meta$engine` to `Metis Embedded two-stage bootstrap PLS-MGA` for Embedded; retain `seminr::bootstrap_model PLS-MGA` otherwise.

- [ ] **Step 5: Run the runtime matrix and verify GREEN**

Run:

```powershell
r-api\R-Portable\App\R-Portable\bin\Rscript.exe tests\rApiHocMgaRuntime.R
```

Expected: `PASS HOC MGA repeated/disjoint runtime` after updating the final message to `PASS HOC MGA group-first runtime`; no captured fit uses 64 pooled rows.

- [ ] **Step 6: Run existing Embedded and moderation regressions**

Run:

```powershell
r-api\R-Portable\App\R-Portable\bin\Rscript.exe tests\rApiHocEmbeddedRuntime.R
r-api\R-Portable\App\R-Portable\bin\Rscript.exe tests\rApiModerationValidation.R
r-api\R-Portable\App\R-Portable\bin\Rscript.exe tests\rApiPlspredictJointInteraction.R
```

Expected: all scripts exit 0 and print their `PASS` messages. These prove the reused Embedded estimator, ordinary moderation validation, and joint multi-interaction construction remain intact.

- [ ] **Step 7: Pause for repository approval**

Report full group-specific Embedded resampling, fit-row evidence, execution metadata, and regression results. Do not stage or commit. Ask permission before Task 8.

### Task 8: Report the Actual MGA HOC Method in Results Context

**Files:**
- Modify: `tests/multiGroupAnalysisResultsContract.test.mjs`
- Modify: `src/results/panelData.ts`

- [ ] **Step 1: Change the HOC context expectation and verify RED**

For an MGA result with:

```js
settings: {
  base_hoc_method: 'Embedded Two-stage',
  mga_hoc_method: 'Repeated Indicators',
  hoc_method_changed: true,
}
```

expect:

```js
'MICOM/MGA handling': 'MGA re-estimated each group independently using Repeated Indicators. This differs from the fitted PLS-SEM method Embedded Two-stage.',
```

Keep legacy MICOM HOC-context expectations unchanged for old saved results.

Run:

```powershell
node tests\multiGroupAnalysisResultsContract.test.mjs
```

Expected: FAIL because HOC context still uses the generic fitted-score sentence.

- [ ] **Step 2: Add one method-aware context formatter**

In `src/results/panelData.ts` add:

```ts
function getHocAnalysisHandling(results: any): string {
  const method = textValue(
    getByPath(results, 'settings.mga_hoc_method') ??
    getByPath(results, 'algorithm.settings.mga_hoc_method') ??
    getByPath(results, 'algorithm.settings.hoc_method'),
  )
  const baseMethod = textValue(
    getByPath(results, 'settings.base_hoc_method') ??
    getByPath(results, 'algorithm.settings.base_hoc_method'),
  )
  const changed = Boolean(
    getByPath(results, 'settings.hoc_method_changed') ??
    getByPath(results, 'algorithm.settings.hoc_method_changed'),
  )

  if (String(results?.method ?? '').toUpperCase() === 'MGA' && method && method !== 'Not applicable') {
    const base = `MGA re-estimated each group independently using ${method}.`
    return changed && baseMethod && baseMethod !== 'Not applicable'
      ? `${base} This differs from the fitted PLS-SEM method ${baseMethod}.`
      : base
  }

  return 'Uses fitted HOC construct scores from the same SEMinR model specification.'
}
```

Pass `results` into `normalizeHocResultRows()` and replace both hard-coded HOC handling values in `normalizeHocResultRows()` and `getHocContextRows()` with `getHocAnalysisHandling(results)`.

- [ ] **Step 3: Run results contracts and verify GREEN**

Run:

```powershell
node tests\multiGroupAnalysisResultsContract.test.mjs
node tests\permutationAnalysisResultsContract.test.mjs
```

Expected: both pass; MGA is method-aware and legacy permutation results remain readable.

- [ ] **Step 4: Pause for repository approval**

Report the result-context wording and legacy compatibility. Do not stage or commit. Ask permission before final verification.

### Task 9: Full Verification and Requesting Code Review

**Files:**
- Verify all scoped files; production edits require a new failing test.

- [ ] **Step 1: Run TypeScript and static contracts**

Run:

```powershell
npm run typecheck
node tests\hocAnalysisContract.test.mjs
node tests\multiGroupAnalysisModalStatic.test.mjs
node tests\multiGroupAnalysisPlumberContract.test.mjs
node tests\multiGroupAnalysisResultsContract.test.mjs
node tests\micomMGAWorkspaceCache.test.mjs
node tests\permutationAnalysisPlumberContract.test.mjs
node tests\permutationAnalysisResultsContract.test.mjs
```

Expected: typecheck exits 0; every Node test prints `PASS`.

- [ ] **Step 2: Run R runtime regressions**

Run:

```powershell
r-api\R-Portable\App\R-Portable\bin\Rscript.exe tests\rApiHocMgaRuntime.R
r-api\R-Portable\App\R-Portable\bin\Rscript.exe tests\rApiHocEmbeddedRuntime.R
r-api\R-Portable\App\R-Portable\bin\Rscript.exe tests\rApiModerationValidation.R
r-api\R-Portable\App\R-Portable\bin\Rscript.exe tests\rApiMicomHocGuard.R
node tests\micomHocStep1.test.mjs
```

Expected: every runtime regression exits 0. The HOC MGA runtime must cover unequal groups, `nboot = 2`, both HOC interaction roles, two simultaneous interactions, retained main effects, and all three estimators.

- [ ] **Step 3: Inspect scoped changes and user work safety**

Run:

```powershell
git diff -- src\utils\hocSettings.ts src\components\MultiGroupAnalysisModal.tsx src\services\plsApi.ts src\pages\ModelCanvas.tsx src\pages\ResultsView.tsx src\utils\micomCache.ts src\results\panelData.ts r-api\plumber.R tests\hocAnalysisContract.test.mjs tests\multiGroupAnalysisModalStatic.test.mjs tests\multiGroupAnalysisPlumberContract.test.mjs tests\multiGroupAnalysisResultsContract.test.mjs tests\micomMGAWorkspaceCache.test.mjs tests\rApiHocMgaRuntime.R
git status --short -- r-api\micom.R
```

Expected: the scoped diff contains only approved behavior; `r-api/micom.R` remains untouched.

- [ ] **Step 4: Invoke the requesting-code-review workflow**

Provide the reviewer with:

- Design: `docs/superpowers/specs/2026-08-14-hoc-micom-mga-design.md`.
- This plan.
- The scoped diff and all test outputs.
- A focused checklist: group split before HOC fitting, no Embedded score leakage, provenance metadata honesty, joint interaction coefficients, isolated diagnostic separation, ordinary MGA preservation, and MICOM unavailability.

If commits are later authorized, use base/head SHAs as required by `requesting-code-review/code-reviewer.md`. Without commits, explicitly give the reviewer the current scoped diff instead of fabricating SHA boundaries.

- [ ] **Step 5: Resolve Critical and Important findings through TDD**

For every accepted finding, first add a failing regression that reproduces it, verify RED, make the minimal correction, and verify GREEN. Re-run Tasks 9.1 and 9.2 after all corrections.

- [ ] **Step 6: Final handoff**

Report:

- Files changed.
- Behavior delivered for each HOC estimator.
- Exact tests and outcomes.
- Review findings and resolutions.
- Any checks not run and residual risks.

Do not stage, commit, push, or merge without explicit user authorization.
