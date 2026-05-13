# Results Parity + UX Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement sub-project A so `PLS-SEM`, `Bootstrap`, and `PLSpredict` each have mode-correct sidebars, stable panel placeholders, dedicated core panels, chart parity for priority pairings, export cleanup, and a tour-handoff markdown workflow.

**Architecture:** Keep the current results shell and path diagram placement, but extract the mode-specific panel registry, placeholder rules, and export/chart metadata out of `ResultsView.tsx` into focused modules. Backend payload changes stay incremental in `r-api/plumber.R`, with frontend mapping tightened around a canonical per-mode contract rather than a full backend rewrite.

**Tech Stack:** React 18, TypeScript, Vite, Electron, local Plumber R API, `seminr`, existing ad hoc Node test harness in `tests/*.test.mjs`, `tsc --noEmit`.

---

## File Map

### Existing files to modify

- `src/pages/ResultsView.tsx`
  - Current monolith that owns sidebar IA, result parsing, panel rendering, export, and diagram integration
- `src/components/ResultsCharts.tsx`
  - Existing chart layer and panel mapping
- `src/components/PathDiagram.tsx`
  - Diagram click handling and visual integration
- `src/pages/ModelCanvas.tsx`
  - Result run entry points and saved analysis wiring
- `src/services/plsApi.ts`
  - Request/response payload types and API helpers
- `r-api/plumber.R`
  - Source of backend result payload sections for `PLS-SEM`, `Bootstrap`, and `PLSpredict`

### New files to create

- `src/results/panelCatalog.ts`
  - Mode-specific sidebar sections, panel metadata, placeholder copy, and export/chart flags
- `src/results/panelData.ts`
  - Panel-to-payload mapping helpers and utility functions for empty-state classification
- `src/results/panelExport.ts`
  - Panel title and export section naming rules
- `src/results/panelDiagnostics.ts`
  - Base-model label helpers, mode gating helpers, and small reusable text rules
- `src/results/ResultsDetailDrawer.tsx`
  - Drawer scaffold for path/construct/indicator result drilldowns
- `tests/resultsPanelCatalog.test.mjs`
  - Node/esbuild test for panel registry behavior and placeholder logic
- `tests/resultsExportConfig.test.mjs`
  - Node/esbuild test for export title stability and mode-specific mapping
- `docs/superpowers/tour-handoffs/2026-04-21-results-parity-ux-foundation-tour.md`
  - Incrementally updated tour handoff notes for every panel/interaction added in this sub-project

## Task 1: Extract the mode-specific panel registry

**Files:**
- Create: `src/results/panelCatalog.ts`
- Create: `src/results/panelData.ts`
- Test: `tests/resultsPanelCatalog.test.mjs`
- Modify: `src/pages/ResultsView.tsx`

- [ ] **Step 1: Write the failing registry test**

Create `tests/resultsPanelCatalog.test.mjs` with assertions that:

- `PLS-SEM` exposes `Structural effects`, `Measurement model`, `Model quality`, `Data & diagnostics`, and `Run & diagnostics`
- `Bootstrap` does not expose `Model fit` or `Model selection criteria`
- `PLSpredict` exposes `CVPAT LV summary` and `CVPAT MV summary`
- `Cross-loadings` exists as a standalone panel in both `PLS-SEM` and `Bootstrap`
- `Algorithm settings` does not appear in any results mode

Suggested structure:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const workspaceRoot = 'C:\\Users\\aaron\\dev\\wytham'
const tempDir = path.join(workspaceRoot, '.tmp-tests')

async function bundleModule(relativeEntry, outfileName) {
  const entryPoint = path.join(workspaceRoot, relativeEntry)
  const outfile = path.join(tempDir, outfileName)
  await fs.mkdir(tempDir, { recursive: true })
  await build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    sourcemap: 'inline',
    logLevel: 'silent',
  })
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
}

function collectIds(sections) {
  return sections.flatMap((section) => section.items.map((item) => item.id))
}

const { getPanelSectionsForMode } = await bundleModule('src/results/panelCatalog.ts', 'results-panel-catalog.test.bundle.mjs')

const plsSem = getPanelSectionsForMode('pls-sem')
const bootstrap = getPanelSectionsForMode('bootstrap')
const plspredict = getPanelSectionsForMode('plspredict')

assert.deepEqual(plsSem.map((section) => section.label), [
  'Structural effects',
  'Measurement model',
  'Model quality',
  'Data & diagnostics',
  'Run & diagnostics',
])
assert.ok(collectIds(plsSem).includes('cross-loadings'))
assert.ok(collectIds(bootstrap).includes('cross-loadings'))
assert.ok(!collectIds(bootstrap).includes('model-fit'))
assert.ok(!collectIds(bootstrap).includes('model-select'))
assert.ok(!collectIds(plspredict).includes('algorithm-settings'))
assert.ok(collectIds(plspredict).includes('cvpat-lv-summary'))
assert.ok(collectIds(plspredict).includes('cvpat-mv-summary'))
```

- [ ] **Step 2: Run the registry test to verify it fails**

Run:

```powershell
node .\tests\resultsPanelCatalog.test.mjs
```

Expected:

- FAIL because `src/results/panelCatalog.ts` does not exist yet

- [ ] **Step 3: Implement the panel catalog and mapping helpers**

Create `src/results/panelCatalog.ts` with:

- `AnalysisMode = 'pls-sem' | 'bootstrap' | 'plspredict'`
- `PanelDefinition`
- `PanelSection`
- `getPanelSectionsForMode(mode)`
- per-panel metadata including:
  - `title`
  - `dataPath`
  - `placeholderKind`
  - `showChart`
  - `baseModelReference`

Create `src/results/panelData.ts` with:

- `getPanelDataPath(mode, panelId)`
- `classifyPanelEmptyState(...)`
- `isBaseModelReferencePanel(mode, panelId)`

Use the approved IA from the design doc exactly. Keep `Cross-loadings` standalone. Keep `Execution log` in the final collapsed section for each mode.

- [ ] **Step 4: Refactor `ResultsView.tsx` to use the extracted catalog**

Replace the in-file sidebar constants and panel-path tables with imports from:

- `src/results/panelCatalog.ts`
- `src/results/panelData.ts`

The visible behavior after this step:

- sidebars differ per mode
- `Algorithm settings` is gone
- `Bootstrap` no longer includes `Model fit`
- `Data & diagnostics` and `Run & diagnostics` are bottom sections for `PLS-SEM`

- [ ] **Step 5: Run the registry test again**

Run:

```powershell
node .\tests\resultsPanelCatalog.test.mjs
```

Expected:

- PASS

- [ ] **Step 6: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected:

- exit code `0`

- [ ] **Step 7: Update the tour handoff incrementally**

Append to `docs/superpowers/tour-handoffs/2026-04-21-results-parity-ux-foundation-tour.md`:

- the new mode-specific sidebar section structure
- the fact that `Cross-loadings` remains standalone
- the presence of collapsed `Data & diagnostics` and `Run & diagnostics`

- [ ] **Step 8: Commit**

```powershell
git add src/results/panelCatalog.ts src/results/panelData.ts src/pages/ResultsView.tsx tests/resultsPanelCatalog.test.mjs docs/superpowers/tour-handoffs/2026-04-21-results-parity-ux-foundation-tour.md
git commit -m "feat: add mode-specific results panel catalog"
```

## Task 2: Implement placeholder rules and dedicated core panels

**Files:**
- Modify: `src/pages/ResultsView.tsx`
- Create: `src/results/panelDiagnostics.ts`
- Test: `tests/resultsPanelCatalog.test.mjs`

- [ ] **Step 1: Extend the failing test for placeholder semantics**

Add assertions that the helper layer can distinguish:

- no mediation paths
- mediation exists but bootstrap significance missing
- no formative weights
- `CVPAT` not enabled
- model selection criteria unavailable

Suggested helper expectations:

```js
assert.equal(
  classifyPanelEmptyState({ mode: 'pls-sem', panelId: 'specific-indirect', hasRows: false, hasMediationPaths: false }),
  'No specific indirect paths in the current model.'
)

assert.equal(
  classifyPanelEmptyState({ mode: 'pls-sem', panelId: 'specific-indirect', hasRows: false, hasMediationPaths: true }),
  'Run Bootstrap to get significance for these paths.'
)

assert.equal(
  classifyPanelEmptyState({ mode: 'plspredict', panelId: 'cvpat-lv-summary', cvpatEnabled: false }),
  'CVPAT not run — re-run analysis with CVPAT enabled.'
)
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node .\tests\resultsPanelCatalog.test.mjs
```

Expected:

- FAIL because the placeholder classifier does not yet satisfy all requested cases

- [ ] **Step 3: Implement placeholder helpers**

Create `src/results/panelDiagnostics.ts` with focused helpers:

- `getSpecificIndirectPlaceholder(...)`
- `getOuterWeightsPlaceholder(...)`
- `getCvpatPlaceholder(...)`
- `getModelSelectionPlaceholder(...)`
- `getBaseModelReferenceBadge(...)`

Make sure outer weights logic treats both empty matrices and null-like backend shapes as "no formative weights", not as crashes.

- [ ] **Step 4: Replace generic fallbacks for the first dedicated panels**

In `ResultsView.tsx`, add dedicated renderers for:

- `Path coefficients`
- `Total indirect effects`
- `Specific indirect effects`
- `Total effects`
- `f²`
- `Model selection criteria`
- `Prediction summaries`

For the remaining panels, keep `GenericDataTable` as a true fallback only.

- [ ] **Step 5: Surface base-model reference labels in `Bootstrap`**

For `Cross-loadings`, `Discriminant validity`, `Construct reliability & validity`, `R² / Adjusted R²`, `f²`, and `VIF` in `Bootstrap`, render a visible `from base model` or equivalent badge in the panel header or summary strip.

- [ ] **Step 6: Run the test again**

Run:

```powershell
node .\tests\resultsPanelCatalog.test.mjs
```

Expected:

- PASS

- [ ] **Step 7: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected:

- exit code `0`

- [ ] **Step 8: Update the tour handoff incrementally**

Append:

- placeholder meanings for `Specific indirect effects`
- `CVPAT not run`
- `from base model` reference panels

- [ ] **Step 9: Commit**

```powershell
git add src/results/panelDiagnostics.ts src/pages/ResultsView.tsx tests/resultsPanelCatalog.test.mjs docs/superpowers/tour-handoffs/2026-04-21-results-parity-ux-foundation-tour.md
git commit -m "feat: add results placeholders and dedicated core panels"
```

## Task 3: Add missing backend payload sections for parity

**Files:**
- Modify: `r-api/plumber.R`
- Modify: `src/services/plsApi.ts`
- Modify: `src/pages/ResultsView.tsx`

- [ ] **Step 1: Write a failing frontend regression for expected panel presence**

Extend `tests/resultsPanelCatalog.test.mjs` or create a new test helper module that validates the frontend contract expects:

- no legacy `Q² (blindfolding)` panel in `PLS-SEM`
- `HTMT confidence intervals` in `Bootstrap`
- `Model selection criteria` only in `PLS-SEM`

Expected failing condition:

- payload mapping lacks one or more required paths or the UI classifier does not know how to handle them

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node .\tests\resultsPanelCatalog.test.mjs
```

Expected:

- FAIL due to missing payload expectations or unhandled panel metadata

- [ ] **Step 3: Update `r-api/plumber.R`**

Implement or expose:

- bootstrap `HTMT confidence intervals`
- explicit omission of `Model fit` from `Bootstrap`
- stable model-selection payload naming for `PLS-SEM` when available

If a backend result is not yet implementable in this slice, return a shape that allows the frontend panel to display a stable placeholder instead of breaking.

- [ ] **Step 4: Update frontend mapping**

Update:

- `src/services/plsApi.ts` types if needed
- `src/results/panelData.ts`
- `src/pages/ResultsView.tsx`

so the new backend sections are reachable or cleanly placeholder-backed.

- [ ] **Step 5: Re-run frontend tests**

Run:

```powershell
node .\tests\resultsPanelCatalog.test.mjs
```

Expected:

- PASS

- [ ] **Step 6: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected:

- exit code `0`

- [ ] **Step 7: Update the tour handoff incrementally**

Append:

- `PLSpredict` run-settings modal behavior and saved-state reuse
- `HTMT confidence intervals` panel behavior
- `Model selection criteria` conditional placeholder

- [ ] **Step 8: Commit**

```powershell
git add r-api/plumber.R src/services/plsApi.ts src/results/panelData.ts src/pages/ResultsView.tsx tests/resultsPanelCatalog.test.mjs docs/superpowers/tour-handoffs/2026-04-21-results-parity-ux-foundation-tour.md
git commit -m "feat: add missing results parity payload sections"
```

## Task 4: Activate chart parity for priority pairings

**Files:**
- Modify: `src/components/ResultsCharts.tsx`
- Modify: `src/pages/ResultsView.tsx`
- Create: `tests/resultsExportConfig.test.mjs`

- [ ] **Step 1: Write the failing chart config test**

Create `tests/resultsExportConfig.test.mjs` to assert the configuration layer marks these as required chart-bearing panels:

- structural effects
- `f²`
- prediction error distributions
- `PLS vs LM` predictive comparisons

Suggested expectations:

```js
const { panelHasRequiredChart } = await bundleModule('src/results/panelCatalog.ts', 'results-export-config.test.bundle.mjs')

assert.equal(panelHasRequiredChart('pls-sem', 'path-coef'), true)
assert.equal(panelHasRequiredChart('pls-sem', 'f-square'), true)
assert.equal(panelHasRequiredChart('plspredict', 'mv-error-histogram'), true)
assert.equal(panelHasRequiredChart('plspredict', 'pls-vs-lm-comparison'), true)
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node .\tests\resultsExportConfig.test.mjs
```

Expected:

- FAIL because the chart metadata and helper do not exist yet

- [ ] **Step 3: Add chart requirement metadata**

Implement chart flags in the panel catalog and update `ResultsCharts.tsx` so the four required pairings render charts inside the corresponding panels.

- [ ] **Step 4: Update `ResultsView.tsx` to pair charts with tables**

For the priority pairings, render chart + table together rather than dormant or hidden chart states.

- [ ] **Step 5: Re-run the chart config test**

Run:

```powershell
node .\tests\resultsExportConfig.test.mjs
```

Expected:

- PASS

- [ ] **Step 6: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected:

- exit code `0`

- [ ] **Step 7: Update the tour handoff incrementally**

Append:

- which panels now have chart companions
- any new interactions or legends worth covering later in the tour

- [ ] **Step 8: Commit**

```powershell
git add src/components/ResultsCharts.tsx src/pages/ResultsView.tsx src/results/panelCatalog.ts tests/resultsExportConfig.test.mjs docs/superpowers/tour-handoffs/2026-04-21-results-parity-ux-foundation-tour.md
git commit -m "feat: activate chart parity for results panels"
```

## Task 5: Add the results detail drawer and export cleanup

**Files:**
- Create: `src/results/ResultsDetailDrawer.tsx`
- Create: `src/results/panelExport.ts`
- Modify: `src/pages/ResultsView.tsx`
- Modify: `src/components/PathDiagram.tsx`
- Modify: `src/pages/ModelCanvas.tsx`
- Test: `tests/resultsExportConfig.test.mjs`

- [ ] **Step 1: Extend the export test first**

Add expectations that export titles are stable and mode-specific:

- `Path coefficients` exports as `Path Coefficients`
- `Model selection criteria` exports only in `PLS-SEM`
- `CVPAT` titles remain mode-correct

Also assert that helper functions do not provide export entries for removed panels like `algorithm-settings`.

- [ ] **Step 2: Run the export test to verify it fails**

Run:

```powershell
node .\tests\resultsExportConfig.test.mjs
```

Expected:

- FAIL because stable export helpers are incomplete

- [ ] **Step 3: Implement export helpers**

Create `src/results/panelExport.ts` and move panel-title/export-title logic out of `ResultsView.tsx`.

- [ ] **Step 4: Implement the detail drawer scaffold**

Create `src/results/ResultsDetailDrawer.tsx` and wire the initial click behavior:

- path click opens the drawer in `PLS-SEM` and `Bootstrap`
- construct click opens the drawer in `PLS-SEM` and `Bootstrap`
- indicator click opens the drawer in `PLS-SEM` and `Bootstrap`

Do not move the diagram. Keep the current upper diagram region and add the drawer behavior around the existing shell.

- [ ] **Step 5: Rewire export and diagram integration**

Update:

- `ResultsView.tsx`
- `PathDiagram.tsx`
- `ModelCanvas.tsx` if needed for saved state or callback plumbing

so export titles are mode-aware and the drawer opens without disturbing the diagram layout.

- [ ] **Step 6: Re-run export test**

Run:

```powershell
node .\tests\resultsExportConfig.test.mjs
```

Expected:

- PASS

- [ ] **Step 7: Run the existing dataset regression test**

Run:

```powershell
node .\tests\datasetLoading.test.mjs
```

Expected:

- PASS

- [ ] **Step 8: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected:

- exit code `0`

- [ ] **Step 9: Update the tour handoff incrementally**

Append:

- path drawer interaction
- construct drawer interaction
- indicator drawer interaction
- export naming changes that future tour text should reflect

- [ ] **Step 10: Commit**

```powershell
git add src/results/ResultsDetailDrawer.tsx src/results/panelExport.ts src/pages/ResultsView.tsx src/components/PathDiagram.tsx src/pages/ModelCanvas.tsx tests/resultsExportConfig.test.mjs docs/superpowers/tour-handoffs/2026-04-21-results-parity-ux-foundation-tour.md
git commit -m "feat: add results detail drawer and export cleanup"
```

## Task 6: Final verification and integration review

**Files:**
- Review only: all files touched in Tasks 1-5

- [ ] **Step 1: Run the full local verification set**

Run:

```powershell
node .\tests\resultsPanelCatalog.test.mjs
node .\tests\resultsExportConfig.test.mjs
node .\tests\datasetLoading.test.mjs
npm run typecheck
```

Expected:

- all commands exit `0`

- [ ] **Step 2: Smoke-check the saved-results flows manually**

Manual verification target:

- `PLS-SEM` shows mode-correct sidebar sections
- `Bootstrap` has no `Model fit`
- `PLSpredict` shows `CVPAT` placeholders when disabled
- diagram layout above the lower results area is unchanged

- [ ] **Step 3: Confirm the tour handoff markdown is complete**

Open `docs/superpowers/tour-handoffs/2026-04-21-results-parity-ux-foundation-tour.md` and verify it includes:

- every new sidebar section
- every new panel
- every new drawer interaction
- every new chart interaction
- every new empty-state language

- [ ] **Step 4: Commit any final cleanup**

```powershell
git add docs/superpowers/tour-handoffs/2026-04-21-results-parity-ux-foundation-tour.md src/pages/ResultsView.tsx src/components/ResultsCharts.tsx src/components/PathDiagram.tsx src/results/panelCatalog.ts src/results/panelData.ts src/results/panelDiagnostics.ts src/results/panelExport.ts src/results/ResultsDetailDrawer.tsx r-api/plumber.R src/services/plsApi.ts tests/resultsPanelCatalog.test.mjs tests/resultsExportConfig.test.mjs
git commit -m "chore: finalize results parity implementation"
```

## Self-Review

### Spec coverage

This plan covers:

- mode-specific sidebars
- stable placeholders within each mode
- standalone `Cross-loadings`
- `Bootstrap` base-model reference labeling
- `PLS-SEM`-only `Model selection criteria`
- missing parity sections such as `HTMT confidence intervals`
- chart parity for all four required pairings
- export/report cleanup
- detail drawer behavior
- incremental tour handoff markdown updates

### Placeholder scan

No `TODO`, `TBD`, or "implement later" placeholders remain in the task steps.

### Type consistency

The plan consistently uses:

- `pls-sem`
- `bootstrap`
- `plspredict`
- `model-select`
- `cross-loadings`
- `Q²predict`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-results-parity-ux-foundation.md`.

The user already chose the `Subagent-Driven` approach for this session, including a standing reviewer agent named `Kiiro`, so execution should proceed with:

- one bounded implementation slice at a time
- `Kiiro` reviewing each completed slice against this plan
- fix workers dispatched for concrete issues while the next non-overlapping slice continues
