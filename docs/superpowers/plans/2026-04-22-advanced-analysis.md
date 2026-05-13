# Advanced Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gated `Advanced analysis` workflow that runs `IPMA`, `NCA`, and `cIPMA` after a valid `PLS-SEM` run and opens a dedicated results mode with a priority map plus advanced diagnostics tables.

**Architecture:** Reuse the current analysis transport stack end-to-end: `ModelCanvas` builds the payload, `plsApi` sends it over the existing Electron/Plumber bridge, `plumber.R` estimates the base model and normalizes `seminrExtras` outputs, and `ResultsView` renders a fourth analysis mode named `advanced`. Gate menu access with a persisted graph signature so stale base results do not unlock advanced analysis after model edits.

**Tech Stack:** React, TypeScript, Electron IPC, Plumber/R, `seminr`, `seminrExtras 1.0.0`, existing results panel/catalog infrastructure, Node/esbuild-based regression tests.

---

### Task 1: Add failing catalog and bridge tests for advanced analysis

**Files:**
- Modify: `C:\Users\aaron\dev\wytham\tests\resultsPanelCatalog.test.mjs`
- Modify: `C:\Users\aaron\dev\wytham\tests\resultsChartConfig.test.mjs`
- Modify: `C:\Users\aaron\dev\wytham\tests\panelTableData.test.mjs`
- Modify: `C:\Users\aaron\dev\wytham\tests\rApiBootstrapStatic.test.mjs`

- [ ] **Step 1: Write failing panel-catalog assertions for the new advanced mode**

Add checks that `getPanelSectionsForMode('advanced')` exposes:

```js
assert.deepEqual(advanced.map((section) => section.label), [
  'PLS-SEM Results',
  'Advanced diagnostics',
  'Run & diagnostics',
])

assert.deepEqual(collectIds(advanced), [
  'path-coef',
  'outer-loadings',
  'model-fit',
  'priority-map',
  'construct-table',
  'necessity-check',
  'bottleneck-table',
  'cipma-priorities',
  'execution-log',
])
```

- [ ] **Step 2: Run the catalog test to verify it fails**

Run: `cmd /c node .\tests\resultsPanelCatalog.test.mjs`  
Expected: failure because `advanced` mode and panel ids are not registered yet.

- [ ] **Step 3: Write failing chart support assertions**

Add checks in `tests/resultsChartConfig.test.mjs`:

```js
assert.ok(CHART_SUPPORTED_PANELS.has('priority-map'))

const advancedResults = {
  final_results: {
    priority_map: [
      { Construct: 'PEOU', Importance: 0.31, Performance: 61.4, Priority: 'Concentrate here', Necessary: true },
      { Construct: 'PU', Importance: 0.48, Performance: 74.2, Priority: 'Keep up', Necessary: false },
    ],
  },
}

const prioritySvg = buildChartSvgForPanel('priority-map', 'advanced', advancedResults)
assert.match(String(prioritySvg), /<svg/i)
```

- [ ] **Step 4: Run the chart test to verify it fails**

Run: `cmd /c node .\tests\resultsChartConfig.test.mjs`  
Expected: failure because `priority-map` is not chart-supported yet.

- [ ] **Step 5: Add static R API guard coverage for the advanced endpoint**

Add source assertions in `tests\rApiBootstrapStatic.test.mjs` for:

```js
assert.match(source, /pr\\$handle\\(\"POST\", \"\\/run-advanced-analysis\"/)
assert.match(source, /seminrExtras::assess_ipma/)
assert.match(source, /seminrExtras::assess_nca/)
assert.match(source, /seminrExtras::assess_cipma/)
```

- [ ] **Step 6: Run the static R API test to verify it fails**

Run: `cmd /c node .\tests\rApiBootstrapStatic.test.mjs`  
Expected: failure because the endpoint and calls do not exist yet.

### Task 2: Add shared advanced-analysis types, signatures, and payload plumbing

**Files:**
- Modify: `C:\Users\aaron\dev\wytham\src\services\plsApi.ts`
- Modify: `C:\Users\aaron\dev\wytham\electron\main.ts`
- Modify: `C:\Users\aaron\dev\wytham\electron\preload.ts`
- Modify: `C:\Users\aaron\dev\wytham\src\vite-env.d.ts`
- Create: `C:\Users\aaron\dev\wytham\src\utils\analysisGraphSignature.ts`
- Test: `C:\Users\aaron\dev\wytham\tests\panelTableData.test.mjs`

- [ ] **Step 1: Add an explicit advanced request type in `plsApi.ts`**

Introduce:

```ts
export interface RunAdvancedAnalysisRequest extends RunPlsRequest {
  target: string
  scope: 'all' | 'direct'
  analyses: {
    ipma: boolean
    nca: boolean
    cipma: boolean
  }
  runDepth?: number
  bottleneckStep?: number
}
```

and:

```ts
export async function runAdvancedAnalysisModel(
  payload: RunAdvancedAnalysisRequest,
): Promise<GenericAnalysisResponse> { /* same transport pattern as bootstrap/plspredict */ }
```

- [ ] **Step 2: Expose the new IPC bridge**

Mirror the existing pattern:

```ts
ipcMain.handle('plumber:runAdvancedAnalysis', async (_, payload: any) => {
  try {
    return await postToPlumber('/run-advanced-analysis', payload)
  } catch (err: any) {
    return { success: false, status: 0, url: plumberBaseUrl, error: err.message }
  }
})
```

and in preload:

```ts
runAdvancedAnalysis: (payload: any) => ipcRenderer.invoke('plumber:runAdvancedAnalysis', payload),
```

- [ ] **Step 3: Add a reusable graph-signature helper**

Create `src/utils/analysisGraphSignature.ts` with helpers that normalize construct/path names and produce a stable signature:

```ts
export function buildAnalysisGraphSignature(input: {
  constructs?: Array<{ name?: string; indicators?: Array<{ name?: string } | string> }>
  paths?: Array<{ from?: string; to?: string }>
} | null | undefined): string
```

Use a deterministic serialization of sorted construct indicator names and sorted direct paths.

- [ ] **Step 4: Add tests for graph-signature stability**

Add assertions in `tests/panelTableData.test.mjs` or a nearby helper test bundle:

```js
assert.equal(
  buildAnalysisGraphSignature(modelA),
  buildAnalysisGraphSignature(modelB),
)
assert.notEqual(
  buildAnalysisGraphSignature(modelA),
  buildAnalysisGraphSignature(modelChanged),
)
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
cmd /c node .\tests\panelTableData.test.mjs
cmd /c node .\tests\rApiBootstrapStatic.test.mjs
```

Expected: still failing on missing implementation beyond type/bridge wiring.

### Task 3: Add the advanced backend endpoint and normalize `seminrExtras` outputs

**Files:**
- Modify: `C:\Users\aaron\dev\wytham\r-api\plumber.R`
- Test: `C:\Users\aaron\dev\wytham\tests\rApiBootstrapStatic.test.mjs`

- [ ] **Step 1: Add helper functions for predecessor resolution and row normalization**

In `plumber.R`, add helpers to:

- derive direct predecessors from `payload$paths`
- derive all upstream predecessors via graph traversal
- normalize named vectors into row lists
- normalize `table_output` matrices into row lists
- normalize bottleneck tables with ceiling labels preserved

Use helper names like:

```r
resolve_advanced_predictors <- function(payload, target, scope) { ... }
normalize_ipma_rows <- function(summary_obj, predictors) { ... }
normalize_nca_effect_rows <- function(summary_obj) { ... }
normalize_nca_bottleneck_rows <- function(summary_obj) { ... }
normalize_cipma_rows <- function(summary_obj, predictors) { ... }
```

- [ ] **Step 2: Implement the advanced endpoint**

Add:

```r
pr$handle("POST", "/run-advanced-analysis", function(req, res) {
  res$setHeader("Content-Type", "application/json")
  tryCatch({
    with_analysis_timeout({
      prepared <- prepare_payload(req)
      payload <- prepared$payload
      data <- prepared$data
      core <- run_pls_core(payload, data)
      # validate target, derive predictors, run selected analyses
      # return self-contained results payload
    })
  }, error = function(err) {
    res$status <- 500
    list(success = FALSE, error = conditionMessage(err))
  })
})
```

- [ ] **Step 3: Use `seminrExtras` directly instead of parsing printed output**

Inside the endpoint:

```r
ipma_result <- if (isTRUE(payload$analyses$ipma)) seminrExtras::assess_ipma(core$model, target = target, scale_min = 1, scale_max = 7, seed = 123) else NULL
nca_result <- if (isTRUE(payload$analyses$nca)) seminrExtras::assess_nca(core$model, target = target, predictors = predictors, test.rep = run_depth, steps = bottleneck_steps, seed = 123) else NULL
cipma_result <- if (isTRUE(payload$analyses$cipma)) seminrExtras::assess_cipma(core$model, target = target, scale_min = 1, scale_max = 7, nca = TRUE, nca_test.rep = run_depth, nca_steps = bottleneck_steps, seed = 123) else NULL
```

Filter `ipma` / `cipma` summary rows to the selected predictor set so `scope = "direct"` is respected even though the package returns all upstream predictors.

- [ ] **Step 4: Return the self-contained advanced payload**

Return:

```r
results <- list(
  final_results = list(
    path_coefficients = extract_path_results(core$model, payload$paths),
    outer_loadings = as_rows(core$summary$loadings),
    model_fit = extract_model_fit(core$model)$rows,
    priority_map = priority_rows,
    construct_table = construct_rows,
    necessity_check = necessity_rows,
    bottleneck_table = bottleneck_rows,
    cipma_priorities = cipma_rows
  ),
  algorithm = list(
    settings = list(mode = "Advanced analysis", target = target, scope = scope, run_depth = run_depth, bottleneck_step = bottleneck_steps),
    execution_log = execution_log
  ),
  meta = list(mode = "advanced", target = target, scope = scope, selected_analyses = payload$analyses, engine = "seminr")
)
```

- [ ] **Step 5: Run the static backend test**

Run: `cmd /c node .\tests\rApiBootstrapStatic.test.mjs`  
Expected: PASS for the new endpoint and function-call guards.

### Task 4: Add the compact advanced modal and canvas gating

**Files:**
- Create: `C:\Users\aaron\dev\wytham\src\components\AdvancedAnalysisModal.tsx`
- Modify: `C:\Users\aaron\dev\wytham\src\pages\ModelCanvas.tsx`
- Modify: `C:\Users\aaron\dev\wytham\src\components\TitleBar.tsx`

- [ ] **Step 1: Build the modal component using the compact PLS modal language**

Create `AdvancedAnalysisModal.tsx` with props:

```ts
interface AdvancedAnalysisSettings {
  target: string
  scope: 'all' | 'direct'
  analyses: { ipma: boolean; nca: boolean; cipma: boolean }
  runDepth: number
  bottleneckStep: 5 | 10 | 20
}

interface AdvancedAnalysisModalProps {
  constructs: string[]
  predecessorPreview: string[]
  settings: AdvancedAnalysisSettings
  canRun: boolean
  isRunning?: boolean
  onChange: (next: AdvancedAnalysisSettings) => void
  onClose: () => void
  onRun: () => void
}
```

Use a narrow single-column layout closer to the existing PLS algorithm dialog than `BootstrapModal`.

- [ ] **Step 2: Track advanced availability from saved PLS results**

In `ModelCanvas.tsx`:

- persist `lastPlsGraphSignature` when PLS completes
- compute `currentGraphSignature` from current constructs and paths
- derive:

```ts
const hasMatchingBasePls =
  !!currentModel?.state?.diagramBaseResults &&
  currentModel?.state?.lastPlsGraphSignature === currentGraphSignature
```

- [ ] **Step 3: Broadcast the gating flag to the title bar**

Extend the status object:

```ts
const status = {
  ...,
  canRunAdvanced: hasMatchingBasePls,
}
```

Then update `TitleBar.tsx`:

```ts
{ type: 'item', label: 'Advanced analysis', disabled: noCanvas || !status.canRunAdvanced, action: 'run-advanced-analysis' }
```

and handle:

```ts
case 'run-advanced-analysis': setShowAdvancedModal(true); break
```

- [ ] **Step 4: Add the run handler**

In `ModelCanvas.tsx`, mirror the bootstrap/plspredict pattern:

```ts
const handleRunAdvancedAnalysis = async () => {
  const basePayload = buildAnalysisPayload('pls-sem', plsAlgorithm)
  const result = await runAdvancedAnalysisModel({ ...basePayload, ...advancedSettings })
  // persist, navigate, error handling
}
```

Persist:

```ts
mode: 'advanced'
```

and keep `diagramBaseResults` untouched so path overlays remain anchored to the base PLS estimate.

- [ ] **Step 5: Run typecheck after wiring**

Run: `cmd /c npm run typecheck`  
Expected: PASS.

### Task 5: Add advanced results mode, panels, and priority map chart

**Files:**
- Modify: `C:\Users\aaron\dev\wytham\src\results\panelCatalog.ts`
- Modify: `C:\Users\aaron\dev\wytham\src\results\panelData.ts`
- Modify: `C:\Users\aaron\dev\wytham\src\results\panelExport.ts`
- Modify: `C:\Users\aaron\dev\wytham\src\results\panelDiagnostics.ts`
- Modify: `C:\Users\aaron\dev\wytham\src\components\ResultsCharts.tsx`
- Modify: `C:\Users\aaron\dev\wytham\src\pages\ResultsView.tsx`

- [ ] **Step 1: Register the new mode and panel ids**

In `panelCatalog.ts` add:

```ts
export type AnalysisMode = 'pls-sem' | 'bootstrap' | 'plspredict' | 'advanced'
```

with sections:

```ts
{
  id: 'pls-reference',
  label: 'PLS-SEM Results',
  items: [
    { id: 'path-coef', label: 'Path coefficients', iconKey: 'graph', showChart: true },
    { id: 'outer-loadings', label: 'Outer loadings', iconKey: 'table' },
    { id: 'model-fit', label: 'Model fit', iconKey: 'check-circle' },
  ],
},
{
  id: 'advanced-diagnostics',
  label: 'Advanced diagnostics',
  items: [
    { id: 'priority-map', label: 'Priority map', iconKey: 'graph', showChart: true },
    { id: 'construct-table', label: 'Construct table', iconKey: 'table' },
    { id: 'necessity-check', label: 'Necessity check', iconKey: 'table' },
    { id: 'bottleneck-table', label: 'Bottleneck table', iconKey: 'table' },
    { id: 'cipma-priorities', label: 'cIPMA priorities', iconKey: 'table' },
  ],
}
```

- [ ] **Step 2: Add panel data paths and empty-state copy**

Map the advanced panels in `panelData.ts` and add placeholder copy in `panelDiagnostics.ts`:

```ts
'priority-map': 'final_results.priority_map'
'construct-table': 'final_results.construct_table'
'necessity-check': 'final_results.necessity_check'
'bottleneck-table': 'final_results.bottleneck_table'
'cipma-priorities': 'final_results.cipma_priorities'
```

and messages:

```ts
'IPMA not run for this advanced analysis session.'
'NCA not run for this advanced analysis session.'
'cIPMA not run for this advanced analysis session.'
```

- [ ] **Step 3: Add the priority map chart**

In `ResultsCharts.tsx`, add `priority-map` support that renders an SVG scatter plot with:

- mean crosshairs
- importance on x-axis
- performance on y-axis
- necessary constructs visually distinguished when present

Use normalized row keys from the backend rather than raw package classes.

- [ ] **Step 4: Extend `ResultsView`**

Update:

- nav-state hydration to accept `savedAnalysis.mode === 'advanced'`
- default selected panel for advanced mode to `priority-map`
- dedicated render branches for the new tables
- export HTML to include the advanced sections and chart

- [ ] **Step 5: Run the results regression tests**

Run:

```bash
cmd /c node .\tests\resultsPanelCatalog.test.mjs
cmd /c node .\tests\resultsChartConfig.test.mjs
cmd /c node .\tests\panelTableData.test.mjs
```

Expected: PASS.

### Task 6: Verify the integrated flow

**Files:**
- Modify: `C:\Users\aaron\dev\wytham\docs\superpowers\plans\2026-04-22-advanced-analysis.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
cmd /c node .\tests\rApiBootstrapStatic.test.mjs
cmd /c node .\tests\resultsPanelCatalog.test.mjs
cmd /c node .\tests\resultsChartConfig.test.mjs
cmd /c node .\tests\panelTableData.test.mjs
cmd /c npm run typecheck
cmd /c npx vite build
```

Expected: all commands exit `0`.

- [ ] **Step 2: Manual smoke-check**

Verify in-app:

- run `PLS-SEM`
- confirm `Advanced analysis` becomes enabled
- edit the model and confirm it becomes disabled again
- rerun `PLS-SEM`
- open advanced modal
- run a target with default settings
- confirm results open with `Priority map` selected

- [ ] **Step 3: Mark plan complete**

Update this plan file checkboxes to reflect the finished work and note any intentional follow-ups left out of scope.
