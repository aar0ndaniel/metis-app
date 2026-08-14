# HOC MICOM Guard and Group-First MGA Design

**Date:** 2026-08-14  
**Product area:** Metis MICOM, multi-group analysis, higher-order constructs, moderation  
**Status:** Approved on 2026-08-14; implementation planning complete, code changes pending execution approval.

## Goal

Make Metis explicit and statistically safe when a model containing higher-order constructs (HOCs) is used with MICOM or multi-group analysis (MGA).

The approved product direction is:

- MICOM is unavailable for every model containing an HOC.
- MGA remains available and supports Repeated Indicators, Embedded Two-stage, and Disjoint Two-stage estimation.
- MGA estimates each selected group independently from that group's raw rows before any comparison is calculated.
- Embedded MGA reruns Stage 1 and Stage 2 within every group and every bootstrap resample.
- Interaction coefficients used by MGA come from the joint structural model, including when an HOC participates in an interaction.

## Scope

This design covers:

- Frontend and backend MICOM guards for HOC models.
- An HOC estimation-method control in MGA when, and only when, the model contains an HOC.
- Separate reporting of the fitted PLS-SEM HOC method and the method selected for MGA.
- Group-first estimation and bootstrap behavior for all three supported HOC methods.
- HOC-dependent interaction estimation in group models and bootstrap resamples.
- The MICOM status shown in successful HOC MGA results.
- Focused static, behavioral, and R runtime regression coverage.

This design does not change ordinary MICOM estimation, the implementation in `r-api/micom.R`, HOC estimation in ordinary PLS-SEM, or the mathematical definition of the existing interaction estimators.

## Product Decisions

### MICOM is blocked for HOC models

When a model contains an HOC, attempting to start MICOM must not open or run the MICOM workflow. Metis must provide this exact feedback:

> MICOM is currently not available for models containing higher-order constructs. Run MICOM on a model without higher-order constructs.

The guard applies in both places from which MICOM can be launched:

- Model Canvas.
- Results View follow-up analysis.

The same rule must be enforced at the backend boundary so an old or stale renderer cannot bypass it. Both current MICOM routes in `r-api/plumber.R` must reject an HOC payload before fitting or retrieving a PLS core:

- `/run-permutation-configural-precheck`
- `/run-permutation-analysis`

The backend condition is `has_higher_order_construct(payload)`. The returned error must preserve the exact user-facing message above. `r-api/micom.R` must not be modified; it remains the ordinary-model MICOM implementation.

### MGA carries the fitted HOC method forward by default

For an HOC model, the MGA modal exposes one HOC estimation control with these three choices:

- Repeated Indicators
- Embedded Two-stage
- Disjoint Two-stage

The control is hidden for models without an HOC.

The default is the method used by the fitted PLS-SEM model. Results View resolves this from the recorded fitted algorithm settings. Model Canvas uses the recorded fitted method when available and otherwise falls back to the current normalized HOC setting used for the model.

The user may deliberately change the method for MGA. The modal must explain the consequence:

> Defaults to the method used for the fitted PLS-SEM model. Changing it re-estimates the model for MGA using the selected method.

The MGA request continues to use the existing normalized `hocMethod` and `hocTwoStage` fields. A single three-choice presentation maps to them as follows:

| MGA choice | `hocMethod` | `hocTwoStage` |
| --- | --- | --- |
| Repeated Indicators | `Repeated indicators` | Canonical ignored/default two-stage value |
| Embedded Two-stage | `Two-stage` | `Embedded` |
| Disjoint Two-stage | `Two-stage` | `Disjoint two-stage` |

The backend and saved result metadata must distinguish the base fitted method from the MGA method:

- `base_hoc_method`
- `mga_hoc_method`
- `hoc_method_changed`

`hoc_method_changed` is true only when the normalized selected MGA method differs from the normalized base fitted method. This prevents results from implying that an intentionally changed estimator is identical to the fitted PLS-SEM specification.

## MGA Estimation Architecture

### Group-first invariant

For an HOC MGA, the selected raw rows must be split before any model is fitted:

```text
Selected raw rows
       |
  split by group
    /       \
Group A    Group B
   |          |
run_pls_core run_pls_core
   |          |
group model group model
```

The current pooled-first flow must not be used for HOC MGA. In particular, the route must not fit one `mga_core` on the combined selected groups and then derive HOC group estimates from that pooled model. Ordinary non-HOC MGA remains outside this group-first rewrite and retains its existing estimation path.

Each group receives the same normalized payload and selected HOC method, but only that group's raw rows. Failure to fit either group fails the analysis; Metis must not return a comparison assembled from one valid and one invalid group.

### Repeated Indicators

For each group independently:

1. Fit the complete Repeated Indicators HCM from that group's raw manifest indicators.
2. Include the direction-aware HOC-LOC relationships and the original nomological model.
3. Bootstrap the complete group model from that group's rows.
4. Use group-specific original estimates and bootstrap distributions in the MGA comparison tables.

No HOC score, loading, weight, or interaction score may be taken from the pooled selected-group data.

### Embedded Two-stage

For each group independently:

1. Run Embedded Stage 1 on the group's raw rows.
2. Generate that group's Stage-1 construct scores.
3. Build and fit Embedded Stage 2 from those scores.

For every bootstrap resample within each group:

1. Resample that group's raw rows.
2. Rerun Embedded Stage 1.
3. Generate new Stage-1 scores for that resample.
4. Rerun Embedded Stage 2.
5. Store the resulting paths and measurement estimates for the group bootstrap distribution.

The existing ordinary Embedded bootstrap implementation is the canonical estimator and should be reused or adapted. MGA must not introduce a second mathematical definition of Embedded estimation.

The following shortcuts are prohibited:

- Reusing pooled Stage-1 scores for either group.
- Computing Stage-1 scores once per group and reusing them for every bootstrap sample.
- Bootstrapping only the final Stage-2 score model.

### Disjoint Two-stage

For each group independently:

1. Fit the complete SEMinR Disjoint Two-stage HCM from that group's raw rows.
2. Bootstrap the complete group model from that group's rows.
3. Use those group-specific estimates and distributions in MGA comparisons.

The existing SEMinR Disjoint estimator remains authoritative; this work changes the group-fitting order, not the Disjoint estimator itself.

### Shared MGA comparison assembly

Repeated Indicators and Disjoint can continue using SEMinR bootstrap objects after their models are fitted group-first. Embedded uses its full two-stage bootstrap result. Both result shapes should feed the existing MGA comparison families through a small normalized extraction boundary rather than duplicating comparison statistics.

The existing MGA outputs remain available:

- Group-specific PLS sections.
- Path coefficients.
- Outer loadings.
- Outer weights.
- Existing supported indirect and total-effect data retained by the current result contract.
- Bias-corrected interval, Henseler PLS-MGA, and parametric comparison views where currently supported.

## HOC Interactions

All interaction terms in the user's structural model are estimated jointly within each group. The coefficient used in an MGA comparison must come from that joint group model.

For Embedded estimation, all HOC-dependent construct and interaction scores must be re-estimated within every group fit and every bootstrap resample. Nothing score-dependent may leak from:

- The pooled selected-group model.
- The other selected group.
- A previous bootstrap sample.

This rule applies directly when the HOC is involved in the interaction, including:

- HOC as an IV in `HOC x Moderator -> Y`.
- HOC as the moderator in `X x HOC -> Y`.
- HOC as the outcome of an interaction path when the model permits that structural role.

Interactions that do not involve an HOC continue through the ordinary interaction machinery, but they are still rebuilt as part of the complete group/resample fit.

The existing isolated one-interaction refits remain diagnostic calculations for delta-R-squared and f-squared. Their coefficients must never replace joint-model interaction coefficients in MGA comparisons. This work must preserve the separation between:

- Joint interaction estimation used for the actual structural model and MGA coefficients.
- Single/isolated diagnostic refits used for interaction effect-size reporting.

Original IV and moderator main effects must remain in every fitted group model.

## HOC MGA and MICOM Status

HOC MGA must not attempt the silent MICOM cache validation or configural precheck because MICOM is unavailable for these models.

Successful HOC MGA results must show this Measurement Invariance Status message:

> MICOM is unavailable for HOC models; MGA was estimated without a MICOM invariance assessment.

The frontend MICOM overview model should add an explicit unavailable state rather than classifying this as merely not run:

- `status: 'unavailable'`
- `source: 'hoc-not-supported'`

Ordinary models retain the existing MICOM cache, precheck, and full/partial/not-run behavior.

## Result Metadata and Execution Log

HOC MGA result settings must record:

- The selected grouping variable and group values.
- Bootstrap count, alpha, and seed.
- `base_hoc_method`.
- `mga_hoc_method`.
- `hoc_method_changed`.

The algorithm execution log must state that Group A and Group B were fitted independently. Embedded results must additionally state that Stage 1 and Stage 2 were rerun for every bootstrap resample.

HOC context shown in MGA results must describe the actual MGA method rather than the current generic statement that fitted HOC scores were reused from the same model specification.

## Error Handling

- MICOM HOC attempts return the exact approved message without starting calculation progress.
- An invalid or unavailable MGA HOC selection is rejected rather than silently substituted.
- If one selected group cannot fit the requested HOC model, the response identifies the group and estimator that failed.
- Embedded resample failures follow the existing bootstrap failure policy; they must not silently substitute scores from the original group fit.
- HOC MGA must not attach a stale ordinary-model MICOM cache entry.

## Testing Strategy

Implementation follows test-driven development: each focused behavior receives a failing regression test before production code is changed.

### MICOM guards

- Model Canvas blocks MICOM for an HOC model and shows the exact message.
- Results View blocks MICOM for an HOC model and shows the exact message.
- Both Plumber MICOM routes reject `has_higher_order_construct(payload)` with the exact message.
- Ordinary non-HOC MICOM precheck and full analysis remain unchanged.
- `r-api/micom.R` remains untouched.

### MGA selector and metadata

- The three-choice selector is visible only for an HOC model.
- It defaults to the fitted PLS-SEM HOC method.
- Changing it sends the normalized selected method.
- Saved results expose `base_hoc_method`, `mga_hoc_method`, and the correct `hoc_method_changed` value.
- Non-HOC MGA preserves the current modal and request behavior.

### Group-first runtime matrix

Runtime tests cover Repeated Indicators, Embedded Two-stage, and Disjoint Two-stage. Every method must cover:

- Unequal Group A and Group B sample sizes.
- More than one bootstrap resample.
- Complete group-specific estimation from raw group rows.
- Original main effects retained.
- Interaction paths present in the MGA comparison result.

Each method also covers these interaction cases:

- HOC as IV: `HOC x Moderator -> Y`.
- HOC as moderator: `X x HOC -> Y`.
- Two or more simultaneous interactions estimated jointly.

Embedded tests additionally prove that:

- Group A and Group B have separate Stage-1 fits.
- Every bootstrap sample reruns Stage 1 and Stage 2.
- No original, pooled, cross-group, or prior-resample Stage-1 score is reused.

The interaction regression suite must also confirm that joint coefficients and isolated diagnostic fits remain separate procedures.

### Verification commands

At minimum, the completed implementation must run:

- `npm run typecheck`
- `node tests\multiGroupAnalysisModalStatic.test.mjs`
- `node tests\multiGroupAnalysisPlumberContract.test.mjs`
- `node tests\multiGroupAnalysisResultsContract.test.mjs`
- `node tests\permutationAnalysisPlumberContract.test.mjs`
- `node tests\permutationAnalysisResultsContract.test.mjs`
- `node tests\micomMGAWorkspaceCache.test.mjs`
- The focused new R runtime regression for HOC MGA methods and interactions.
- Existing HOC, Embedded bootstrap, moderation, and ordinary MICOM runtime regressions affected by the implementation.

## Expected Implementation Surfaces

The likely production files are:

- `src/components/MultiGroupAnalysisModal.tsx`
- `src/pages/ModelCanvas.tsx`
- `src/pages/ResultsView.tsx`
- `src/utils/hocSettings.ts`
- `src/utils/micomCache.ts`
- `r-api/plumber.R`

Focused tests will update existing MICOM/MGA/HOC contracts and add an R runtime regression dedicated to group-first HOC MGA estimation and interactions.

`r-api/micom.R` is explicitly excluded.

## Incremental Implementation Boundaries

Implementation should remain small and reviewable:

1. Add failing MICOM HOC guard tests, then implement only the frontend/backend guards.
2. Add failing MGA selector and metadata tests, then implement only the selector and payload/result contract.
3. Add failing group-first Repeated Indicators and Disjoint tests, then remove the pooled-first dependency for those methods.
4. Add failing Embedded group/resample tests, then add the dedicated Embedded MGA bootstrap branch using the existing Embedded estimator.
5. Add failing HOC interaction runtime cases, then close any method-specific score or result-extraction gaps.
6. Run focused verification, request code review, address findings, and run broader verification before completion.

Each boundary requires separate approval under the repository's incremental-change rules.

## Acceptance Criteria

The design is complete when all of the following are true:

- MICOM cannot run against an HOC payload from either UI entry point or either backend route.
- The exact approved MICOM message is shown.
- Ordinary MICOM remains functional and `r-api/micom.R` is unchanged.
- HOC MGA defaults to the fitted method, allows an explicit method change, and records that change honestly.
- Group A and Group B are fitted independently before comparison.
- Repeated Indicators, Embedded, and Disjoint use complete group-specific estimation.
- Embedded reruns both stages in every group bootstrap resample.
- Joint HOC interaction coefficients, original main effects, and comparison rows are preserved.
- Isolated interaction diagnostics remain separate from MGA coefficients.
- HOC MGA results explicitly report that MICOM is unavailable rather than merely not run.
- Focused TypeScript, static contract, and R runtime tests pass.

## Open Questions

No product or statistical design questions remain. Implementation details may be refined only when they preserve the invariants and metadata contract in this specification.
