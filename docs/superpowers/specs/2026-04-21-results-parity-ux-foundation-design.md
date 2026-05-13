# Results Parity + Results UX Foundation Design

**Date:** 2026-04-21  
**Product area:** metis results experience  
**Scope:** Sub-project A from the competitive roadmap

## Goal

Bring metis's current `PLS-SEM`, `Bootstrap`, and `PLSpredict` results experience to a stable, mode-correct, report-ready baseline without changing the core product model. Users should see only panels that belong to the current analysis mode, and every panel in that mode should remain visible with clear empty or unavailable states rather than disappearing unpredictably.

## Out of Scope

- `MGA` and grouping workflows
- higher-order construct support
- moderation method selection beyond the current model
- `seminrExtras` backlog features such as `MICOM`, permutation `MGA`, `IPMA`, nonlinear effects, endogeneity, `NCA`, and segmentation methods
- in-app interpretation text or statistical coaching
- a final guided tour implementation pass

## Product Principles

### 1. Mode-first navigation

The results sidebar must be fully mode-specific:

- `PLS-SEM` shows only `PLS-SEM` panels
- `Bootstrap` shows only `Bootstrap` panels
- `PLSpredict` shows only `PLSpredict` panels

Users must never navigate to a panel that exists only to tell them they are in the wrong mode.

### 2. Stable panels within a mode

Inside the active mode, panels should remain visible even when the panel has no rows yet, is unsupported by the current model shape, or depends on an additional run option that has not been enabled. In those cases the panel shows a precise placeholder state.

### 3. Results before diagnostics

Primary analytical outputs must appear first. Raw or low-priority diagnostic views stay accessible but are visually secondary, collapsed by default, and placed at the bottom of the sidebar.

### 4. No hidden computed outputs

Every computed backend section must either:

- map to a reachable UI panel in the correct mode, or
- be removed from the canonical payload if it is not intended for the UI

No hidden-but-computed sections should remain.

### 5. Preserve metis visual language

This work keeps the established metis shell, color system, spacing rhythm, and dark-surface aesthetic. New panel patterns, drawers, and section treatments should use the current palette and semantic tokens from `COLORS.md` rather than introducing a parallel style system.

## Results Information Architecture

## PLS-SEM

### Structural effects

- `Path coefficients`
- `Total indirect effects`
- `Specific indirect effects`
- `Total effects`

### Measurement model

- `Outer loadings`
- `Outer weights`
- `Construct reliability & validity`
- `Discriminant validity`
- `Cross-loadings`

### Model quality

- `R² / Adjusted R²`
- `f²`
- `VIF`
- `Model fit`
- `Model selection criteria`

`Model selection criteria` remains in scope for this sub-project only in `PLS-SEM`, and only as a populated analytical panel when the current analysis provides comparable model-selection outputs. It is not treated as a universal result block.
Predictive relevance is evaluated through `PLSpredict` and `Q²predict`, not through a traditional blindfolding panel in `PLS-SEM`.

### Data & diagnostics

Collapsed by default and visually separated with a muted section treatment.

- `Latent variables`
- `Indicator correlations`
- `Indicator data`
- `Standardized indicator data`

### Run & diagnostics

Collapsed by default.

- `Execution log`

## Bootstrap

### Resampled structural effects

- `Path coefficients`
- `Total indirect effects`
- `Specific indirect effects`
- `Total effects`

### Resampled measurement effects

- `Outer loadings`
- `Outer weights`
- `HTMT confidence intervals`

### Base model quality

Read-only reference values from the base `PLS-SEM` model. The UI must signal this explicitly so users do not assume these sections were recomputed by resampling.

- `Construct reliability & validity`
- `Discriminant validity`
- `Cross-loadings`
- `R² / Adjusted R²`
- `f²`
- `VIF`

`Cross-loadings` stays a standalone panel in `Bootstrap`, but it must be visually marked as `from base model` or equivalent read-only reference language.

### Run & diagnostics

Collapsed by default.

- `Execution log`

## PLSpredict

### Predictive summaries

- `MV summary`
- `LV summary`
- `PLS vs LM comparison`
- `Q²predict`

### Prediction diagnostics

- `MV predictions and errors`
- `LV predictions and errors`
- `MV error histograms`
- `LV error histograms`
- `CVPAT LV summary`
- `CVPAT MV summary`

### Run & diagnostics

Collapsed by default.

- `Execution log`

## Explicit Removals

- `Algorithm settings` must be removed from the results sidebar. These belong to run configuration and saved-analysis metadata, not primary result navigation.
- `Model fit` must not appear in `Bootstrap`.
- `Model selection criteria` must not appear in `Bootstrap`.
- `Model selection criteria` must not appear in `PLSpredict`.
- `Q² (blindfolding)` must not appear as a `PLS-SEM` sidebar destination; `seminr`'s predictive relevance story is handled through `PLSpredict` and `Q²predict`.

## Panel Behavior Rules

## Placeholder and empty-state rules

Every panel needs one of the following state types:

- populated with real data
- empty because the current model has no applicable rows
- unavailable because the analysis option was not run
- unsupported for the current model shape or backend output

These states must be expressed with specific copy, never generic blanks.

### Required placeholder semantics

#### Specific indirect effects

- If the model has no mediation paths: `No specific indirect paths in the current model.`
- If specific indirect paths exist in `PLS-SEM` but significance is not yet available: `Run Bootstrap to get significance for these paths.`

#### Outer weights

- If the current model has no formative constructs: `No formative weights in the current model.`
- The implementation must handle both `NULL`-like shapes and empty matrices/data frames from `seminr` without treating them as runtime failures.

#### Model fit

- In `PLS-SEM`, keep the panel visible even when the current result payload does not contain fit rows.
- If fit is unavailable for the current result shape, the panel should say so explicitly instead of disappearing.

#### Model selection criteria

- Visible only in `PLS-SEM`.
- If the current run does not provide comparable model-selection outputs: `Model selection criteria are available only when comparing nested models.`

#### Bootstrap HTMT confidence intervals

- Visible in `Bootstrap`.
- Placeholder until implemented: `Bootstrap HTMT confidence intervals are not available yet for this analysis.`

#### Bootstrap base-model reference panels

For `Cross-loadings`, `Discriminant validity`, `Construct reliability & validity`, `R² / Adjusted R²`, `f²`, and `VIF` shown in `Bootstrap`, the panel header or summary strip must communicate that these are `from base model` or `base PLS reference`, not recomputed bootstrap outputs.

#### CVPAT

- `CVPAT LV summary` and `CVPAT MV summary` stay visible in `PLSpredict`.
- Placeholder when CVPAT was not enabled: `CVPAT not run — re-run analysis with CVPAT enabled.`

#### Histograms

- If no prediction error distribution is available: `No prediction error distribution available yet.`

## Results panel implementation direction

The current generic table fallback should remain only as a true fallback, not as the default experience for core statistical outputs. The first dedicated panel set for this sub-project should include:

- `Path coefficients`
- `Total indirect effects`
- `Specific indirect effects`
- `Total effects`
- `f²`
- `Model selection criteria`
- `Prediction summaries`

`Cross-loadings` remains its own panel and is not folded into `Discriminant validity`.

## Charts and visual pairing

The chart layer in `ResultsCharts.tsx` should be activated as a first-class companion to tables instead of remaining mostly dormant. The rule is:

- if a panel has a meaningful visual companion, show chart plus table together
- if a panel is inherently tabular, use a dedicated table-only layout

Priority chart pairings:

- structural effects panels
- `f²`
- prediction error distributions
- `PLS vs LM` predictive comparisons

These four pairings are required deliverables for this sub-project, not optional enhancements.

## Diagram drilldown

For this sub-project, the interactive path diagram applies to the results modes that already present diagram tooling: `PLS-SEM` and `Bootstrap`. The drawer patterns defined here should be reusable later if a prediction-oriented diagram view is introduced, but `PLSpredict` does not gain a new primary diagram surface in this phase.

### Path click

Open a detail drawer with the best available statistics for the current mode:

- `PLS-SEM`: direct effect, total effect, indirect effect where applicable
- `Bootstrap`: coefficient, `t`, `p`, confidence interval, and related indirect/total effect data where applicable

### Construct click

Open construct-level metrics such as:

- `R²`
- adjusted `R²`
- reliability metrics

### Indicator click

Open indicator-level metrics such as:

- loading
- weight

The drawer is part of this design scope, but implementation can phase the full metric set after the panel contract is stabilized.

## Export and report cleanup

HTML export remains the primary report-ready output for this sub-project. Export cleanup must guarantee:

- stable table titles
- stable column naming
- mode-aware section ordering
- panel-aware export labels
- no accidental generic section names when dedicated panels are shown

Export organization should follow the active results mode rather than a shared global taxonomy.

## Canonical payload direction

The results payload between `r-api/plumber.R` and `src/pages/ResultsView.tsx` must be treated as a stable contract per mode.

Immediate contract objectives:

- keep only UI-intended sections in each mode
- name sections consistently enough that panels do not need ad hoc per-run branching
- preserve the distinction between:
  - base-model outputs
  - resampled outputs
  - out-of-sample prediction outputs

This sub-project does not require a total backend rewrite, but it does require explicit panel-to-payload mapping and cleanup of orphan sections.

## Main implementation surfaces

- `src/pages/ResultsView.tsx`
- `src/components/ResultsCharts.tsx`
- `src/components/PathDiagram.tsx`
- `src/pages/ModelCanvas.tsx`
- `src/services/plsApi.ts`
- `r-api/plumber.R`

Likely supporting surfaces:

- result persistence structures in workspace/model state
- export helpers inside `ResultsView`
- any shared result-parsing utilities extracted during the refactor

## Acceptance Criteria

### Results parity

- every computed backend section is reachable in the correct mode or intentionally removed
- no panel from one mode appears in another mode
- every panel in a mode has a defined populated or placeholder state

### PLS-SEM

- structural, measurement, and model-quality panels render correctly from saved artifacts
- `Cross-loadings` remains a standalone panel

### Bootstrap

- resampled structural and measurement panels render correctly
- base-model reference panels are labeled as base-model reference
- `Model fit` is absent
- `HTMT confidence intervals` has a stable panel state

### PLSpredict

- summaries, diagnostics, case-level errors, and histograms render correctly from saved artifacts
- predictive relevance is surfaced through `Q²predict`, not through a legacy blindfolding panel in `PLS-SEM`
- `CVPAT` panels are visible but clearly indicate when the run omitted CVPAT

### Chart parity

- charts and tables reflect the same underlying values
- dormant chart-only states are removed
- each priority pairing renders a chart in the corresponding panel:
  - structural effects panels
  - `f²`
  - prediction error distributions
  - `PLS vs LM` predictive comparisons

### Export

- HTML export is readable and report-ready for all three modes
- section titles and table labels remain stable

## Tour Handoff Requirement

Tour implementation is deferred until after this sub-project, but this work must leave behind enough structured notes to make the later tour pass fast and deterministic.

Implementation of this sub-project should therefore also produce a companion markdown handoff file for the results surfaces added or changed here, covering:

- mode entry points
- every new sidebar section
- every new panel
- every new drawer or chart interaction
- any new empty-state language that the tour should explain

This handoff markdown must be updated incrementally as each panel, interaction, or empty state is implemented. It must not be written retrospectively at the end of the sub-project.

This tour handoff is required as a deliverable of the implementation phase, but not implemented as an in-app tour in this design phase.

## Notes for Planning

- Keep the current metis layout shell rather than redesigning the app chrome.
- Prefer extracting panel-specific logic out of `ResultsView.tsx` instead of continuing to grow a single monolith.
- Preserve compatibility with saved result artifacts where reasonable, but favor a cleaner canonical contract for newly saved results.
