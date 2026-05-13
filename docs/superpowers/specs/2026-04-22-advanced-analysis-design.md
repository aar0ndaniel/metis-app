# Advanced Analysis Design

**Date:** 2026-04-22  
**Product area:** metis analysis workflow and results experience  
**Scope:** Add target-specific post-PLS diagnostics powered by `seminrExtras 1.0.0`

## Goal

Add an `Advanced analysis` workflow that becomes available only after a successful `PLS-SEM` run and provides:

- `IPMA`
- `NCA`
- `cIPMA`

The workflow must feel native to metis's current calculation flow, use the same compact modal language as the `PLS-SEM` run modal, and open into a dedicated results mode with advanced diagnostics presented alongside a small base-model reference section.

## Why This Belongs After PLS

This design follows the way `seminrExtras` structures the methods and the way Hair-style post-estimation interpretation is usually presented:

- estimate and validate the `PLS-SEM` model first
- choose a target construct
- run managerial and diagnostic follow-up analyses on the estimated model

`seminrExtras 1.0.0` frames:

- `assess_ipma()` as the IPMA-only convenience wrapper
- `assess_nca()` as the necessity analysis
- `assess_cipma()` as the integrated extension that overlays necessity on importance-performance results

That means `Advanced analysis` should be a post-estimation workflow, not another base estimation variant.

## Out of Scope

- `COA`, `CTA`, `FIMIX`, `POS`, `PCM`, `NCA-ESSE`, and other `seminrExtras` methods
- adding statistical coaching or long interpretation essays into the UI
- replacing or restructuring existing `PLS-SEM`, `Bootstrap`, or `PLSpredict` modes beyond the hooks needed for advanced analysis
- higher-order-construct-specific UX beyond what the backend already supports

## Product Principles

### 1. PLS-first gating

Users must not be able to run advanced analysis without a valid `PLS-SEM` result for the current model.

### 2. Compact setup

The advanced modal should feel like the current `PLS-SEM` modal, not the larger `Bootstrap` modal. This is a focused configuration step, not a sprawling settings dashboard.

### 3. Target-specific diagnostics

Advanced analysis is not model-global in the same way as `PLS-SEM`. It always centers on a chosen target construct and its relevant predecessors.

### 4. cIPMA is the flagship path

The UI should support running `IPMA`, `NCA`, and `cIPMA` independently, but it should treat `cIPMA` as the recommended integrated workflow and enable it by default.

### 5. Self-contained results mode

The `Advanced analysis` results mode should include the small set of base `PLS-SEM` reference panels it needs instead of forcing users to bounce back and forth between modes.

## User Workflow

## Canvas and title bar

The `Analysis` title-bar menu gains:

- `Run PLS-SEM`
- `Run Bootstrap`
- `PLSpredict`
- `Advanced analysis`

Behavior:

- `Advanced analysis` is disabled when no successful `PLS-SEM` result exists for the active model
- once `PLS-SEM` has been run successfully for the model, `Advanced analysis` becomes active
- if the current model changes after the saved `PLS-SEM` run, the app should conservatively treat advanced analysis as unavailable until `PLS-SEM` is run again

## Launching the workflow

Clicking `Advanced analysis` opens a compact centered modal styled like the existing `PLS-SEM` modal family.

The modal is driven by the active model, not by predefined construct lists.

## Modal structure

### Header

- title: `Advanced analysis`
- subtitle: concise line explaining that the run builds on the current `PLS-SEM` estimate
- close affordance matching the existing run modals

### Body

Single-column stacked controls:

1. `Target construct`
2. `Predecessors`
3. `Include analyses`
4. `Run depth`
5. `Bottleneck step size`

### Footer

- secondary close/back action
- primary action: `Start calculation`
- primary action disabled until a valid target is selected

## Modal fields

### Target construct

Dropdown populated from the current model constructs.

Rules:

- only constructs with indicators should appear
- constructs that cannot serve as endogenous targets in the current structural graph may still be listed, but if no relevant predecessors can be derived the run button must stay disabled and the modal must explain why

### Predecessors

Radio choice:

- `All`
- `Direct`

Meaning:

- `Direct` limits analysis to direct predecessors of the selected target
- `All` expands to all upstream constructs with a directed path to the target

The UI should show a short preview of the constructs that will be included for the selected scope.

### Include analyses

Checkboxes:

- `IPMA`
- `NCA`
- `cIPMA`

Defaults:

- `cIPMA` enabled by default
- `IPMA` enabled by default
- `NCA` enabled by default

Recommendation language should visually favor `cIPMA` as the integrated path without blocking independent selection.

### Run depth

Numeric input controlling the permutation / resampling depth used by the advanced analysis backend where applicable.

Default: `1000`

### Bottleneck step size

Select input:

- `5%`
- `10%`
- `20%`

Default: `10%`

## Running State

The modal transitions into a calculation state using the same interaction language as the current analysis run flow.

Progress messaging should cover:

1. preparing model scores
2. calculating importance and performance
3. running necessity analysis
4. building bottleneck outputs
5. preparing result views

If only a subset of the advanced methods is selected, the backend or UI may adjust the status copy, but the visual pattern should stay consistent.

## Results Information Architecture

`Advanced analysis` becomes a fourth results mode alongside:

- `PLS-SEM`
- `Bootstrap`
- `PLSpredict`
- `Advanced analysis`

Sidebar structure:

## PLS-SEM Results

- `Path coefficients`
- `Outer loadings`
- `Model fit`

These are reference panels copied into the advanced mode because they remain useful context for interpreting the advanced diagnostics.

## Advanced diagnostics

- `Priority map`
- `Construct table`
- `Necessity check`
- `Bottleneck table`
- `cIPMA priorities`

Default selected panel when advanced results open: `Priority map`

## Panel Definitions

### Priority map

Primary visual panel.

Purpose:

- show the importance-performance plane for the selected target
- support standard IPMA display
- support cIPMA overlay when cIPMA results are available

Expected behavior:

- plot all included predecessor constructs
- use the mean importance/performance crosshairs
- color by managerial quadrant
- optionally mark necessary constructs when cIPMA is present
- hover state shows construct name, importance, performance, and quadrant label

### Construct table

Tabular numeric summary for the IPMA result.

Minimum columns:

- construct
- importance
- performance
- quadrant

Optional columns if available:

- standardized importance
- total effect variant used

### Necessity check

Tabular summary of `NCA` results.

Minimum columns:

- condition
- effect size `d`
- p-value
- ceiling line accuracy
- qualitative effect-size label
- status classification

### Bottleneck table

Tabular bottleneck output from `NCA`.

The table should reflect the selected bottleneck step size and preserve the structure returned by the backend rather than flattening it into prose.

### cIPMA priorities

Ranked summary list combining:

- importance
- performance
- necessity status
- actionable priority category

This should read as the most decision-ready advanced output.

Minimum columns:

- construct
- importance
- performance
- necessary
- priority classification

## Backend Design

Add a new backend route for advanced analysis.

Suggested endpoint:

- `POST /run-advanced-analysis`

## Input contract

The payload extends the same model payload used for `PLS-SEM`:

- dataset path
- constructs
- paths
- interactions
- algorithm and algorithm settings

Plus advanced settings:

- `target`
- `scope` (`all` or `direct`)
- `analyses` (`ipma`, `nca`, `cipma`)
- `runDepth`
- `bottleneckStep`
- optional seed if we later expose it

## Backend execution flow

1. estimate the base `PLS-SEM` model from the current payload
2. validate that the target exists and has usable predecessors for the selected scope
3. build the predecessor set:
   - `direct` = direct incoming constructs to the target
   - `all` = all upstream constructs with a directed path to the target
4. run selected `seminrExtras` analyses:
   - `assess_ipma()`
   - `assess_nca()`
   - `assess_cipma()`
5. normalize outputs into JSON rows and chart-ready summaries
6. return the advanced payload with reference `PLS-SEM` sections included

## Response contract

The advanced mode response should be self-contained.

Suggested structure:

```text
results = {
  final_results = {
    path_coefficients,
    outer_loadings,
    model_fit,
    priority_map,
    construct_table,
    necessity_check,
    bottleneck_table,
    cipma_priorities
  },
  meta = {
    mode = "advanced",
    target,
    scope,
    selected_analyses,
    advanced_settings
  },
  algorithm = {
    settings,
    execution_log
  }
}
```

The chart-driving data for `Priority map` should be returned in a normalized form rather than relying on client-side scraping from printed R output.

## Frontend Architecture

## Services

Add a new API call in `src/services/plsApi.ts`:

- `runAdvancedAnalysisModel(payload)`

## Canvas state and navigation

In `ModelCanvas.tsx`:

- add modal state for advanced analysis
- add a handler to run the advanced endpoint
- persist results with `mode: 'advanced'`
- continue storing the current model snapshot with the result payload

## Results mode support

In the results system:

- extend `AnalysisMode` with `'advanced'`
- add advanced sections to `panelCatalog.ts`
- add panel data paths and fallback logic in `panelData.ts`
- add dedicated renderers in `ResultsView.tsx`
- add chart support for `Priority map`

## Gating rules

The canvas and title bar need a shared notion of:

- whether the model has a valid saved `PLS-SEM` result
- whether that saved result matches the current graph state closely enough to trust

The conservative version is acceptable for the first pass:

- any canvas edit after the saved `PLS-SEM` result invalidates advanced analysis availability until `PLS-SEM` is rerun

## Empty and error states

### Before PLS

`Advanced analysis` disabled with no modal access.

### No valid target

Run button disabled and helper copy explains that the chosen target has no valid predecessors for the selected scope.

### Missing backend support

Use the existing backend caution and toast patterns.

### Selected analysis not run

Panels remain visible but show precise empty-state messages such as:

- `IPMA not run for this advanced analysis session.`
- `NCA not run for this advanced analysis session.`
- `cIPMA not run for this advanced analysis session.`

## Testing Scope

## Frontend

- advanced menu gating based on saved `PLS-SEM` availability
- target construct option generation from live model state
- predecessor derivation for `direct` and `all`
- modal validation and disabled run states
- advanced results mode registration in the panel catalog
- default selected panel is `Priority map`
- chart/table rendering for normalized advanced payloads

## Backend

- advanced endpoint accepts a valid analysis payload
- target and predecessor validation behaves correctly
- `IPMA`, `NCA`, and `cIPMA` normalization produces stable JSON rows
- bottleneck output preserves table structure
- self-contained advanced result payload includes base reference sections

## Acceptance Criteria

1. After a successful `PLS-SEM` run, `Advanced analysis` becomes available from the `Analysis` menu.
2. The advanced modal uses the compact `PLS` modal style, not the large `Bootstrap` layout.
3. Construct choices come from the active model, not predefined sample constructs.
4. Running advanced analysis opens a dedicated `Advanced analysis` results mode.
5. The results sidebar contains:
   - `PLS-SEM Results`
   - `Advanced diagnostics`
6. The default opening panel is `Priority map`.
7. `cIPMA` is supported and visually treated as the recommended integrated analysis.
8. All advanced panels show either populated results or clear empty states; none silently disappear.
