# Results Parity + UX Foundation Tour Handoff

## Task 1: Mode-specific sidebar registry

- `PLS-SEM` now uses grouped sidebar sections in this order:
  - `Structural effects`
  - `Measurement model`
  - `Model quality`
  - `Data & diagnostics`
  - `Run & diagnostics`
- `Bootstrap` now uses grouped sidebar sections in this order:
  - `Resampled structural effects`
  - `Resampled measurement effects`
  - `Base model quality`
  - `Run & diagnostics`
- `PLSpredict` now uses grouped sidebar sections in this order:
  - `Predictive summaries`
  - `Prediction diagnostics`
  - `Run & diagnostics`
- `Cross-loadings` remains a standalone destination in both `PLS-SEM` and `Bootstrap`.
- `Algorithm settings` is no longer a results sidebar destination.
- `Data & diagnostics` and `Run & diagnostics` are visually demoted with a muted divider treatment and default to collapsed.
- `PLSpredict` histogram destinations remain visible even when they do not have chart data yet; follow-up tour copy should describe them as panels with mode-specific empty states rather than conditional navigation.
- the results sidebar header now reflects the active mode (`PLS-SEM Results`, `Bootstrap Results`, or `PLSpredict Results`) instead of staying stuck on `PLS-SEM`.

## Task 2: Placeholder and reference-state behavior

- `Specific indirect effects` now distinguishes between:
  - no mediation paths in the current model
  - mediation paths that need `Bootstrap` for significance
- in `PLS-SEM`, `Specific indirect effects` now also shows derived point-estimate rows when the model contains mediation chains but the backend payload does not yet provide them directly
- `Outer weights` now uses the formative-specific empty state when the model has no formative constructs.
- `CVPAT LV summary` and `CVPAT MV summary` now show a panel placeholder instead of rendering backend message rows as if they were completed results.
- `Model selection criteria` now explains that comparable outputs require nested-model comparison.
- `Model fit` now has its own explicit unavailable-state copy instead of falling back to a generic blank table.
- `HTMT confidence intervals` now has a dedicated placeholder in `Bootstrap`.
- `MV error histograms` and `LV error histograms` now use the prediction-distribution placeholder copy rather than disappearing.
- `Bootstrap` base-model reference panels now show a visible `From base model` badge in the panel header so the tour should call out that these are contextual reference values, not resampled outputs.

## Task 2B: PLSpredict run settings

- `PLSpredict` now has its own run modal instead of silently using hardcoded `10 × 10` settings.
- the modal persists `folds`, `repetitions`, and `Run CVPAT` with the current workspace model so reopened sessions reuse the last selected prediction settings.
- if `CVPAT` was not requested, the `CVPAT LV summary` and `CVPAT MV summary` panels stay visible but explain that the user must rerun with `CVPAT` enabled.
- predictive relevance now lives only in `PLSpredict` through `Q²predict`; the outdated `Q² (blindfolding)` panel is no longer part of `PLS-SEM`.

## Task 3: Chart pairing and export config

- panels with active chart companions now render the chart above the table instead of leaving the toolbar on a `coming soon` placeholder
- the toolbar now signals `Chart paired` when the selected panel includes an active chart companion
- the current chart pairing covers:
  - structural effects panels
  - `f²`
  - `PLSpredict` summary panels
  - `PLS vs LM comparison`
- the mode header and export titles now come from shared configuration, so tour copy can rely on the same naming used by the results UI and HTML export
- HTML export now embeds paired charts for chart-supported panels instead of exporting tables alone
