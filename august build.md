# August Build: Centroid Weighting & True BCa Bootstrap Confidence Intervals

## Overview

This document details the statistical implementations added in Metis:
1. **Centroid Weighting Scheme** as a distinct, first-class PLS-SEM inner weighting estimator.
2. **True BCa (Bias-Corrected and Accelerated) Bootstrap Confidence Intervals** with non-parametric jackknife acceleration ($a$), bias-correction parameter ($\hat{z}_0$), one-tailed/two-tailed testing, and sign-change corrections.

---

## 1. Centroid Inner Weighting Scheme

### 1.1 Theoretical Foundation & Mathematical Formulation

In Partial Least Squares Structural Equation Modeling (PLS-SEM), the inner approximation step computes proxy scores ($\tilde{Y}_j$) for each latent variable from its adjacent constructs:

$$\tilde{Y}_j = \sum_{i \in \operatorname{adj}(j)} e_{ji} Y_i$$

Where $e_{ji}$ represents the **inner weight** between construct $j$ and construct $i$.

The three classic weighting schemes (Wold 1982; Lohmöller 1989; Tenenhaus et al. 2005; Hair et al. 2022) differ in how $e_{ji}$ is computed:

| Weighting Scheme | Mathematical Definition for Connected Constructs ($i \in \operatorname{adj}(j)$) | Notes / Behavior |
| :--- | :--- | :--- |
| **Path Weighting** | $e_{ji} = \beta_{ji}$ (if $i \to j$, from multiple regression)<br>$e_{ji} = r_{ji}$ (if $j \to i$, bivariate correlation) | Accounts for hypothesized causal directionality in the structural model. |
| **Factor Weighting** | $e_{ji} = r_{ji} = \operatorname{cor}(Y_j, Y_i)$ | Symmetrical correlation weighting across all adjacent constructs. |
| **Centroid Weighting** | $e_{ji} = \operatorname{sign}(\operatorname{cor}(Y_j, Y_i)) = \begin{cases} +1 & \text{if } \operatorname{cor}(Y_j, Y_i) > 0 \\ -1 & \text{if } \operatorname{cor}(Y_j, Y_i) < 0 \\ 0 & \text{if } \operatorname{cor}(Y_j, Y_i) = 0 \end{cases}$ | Uses only the directional sign of the association, creating a robust, sign-based inner proxy. |

### 1.2 Implementation in SEMinR / Metis

Implemented textbook Lohmöller (1989) Centroid inner weighting function in `r-api/plumber.R`:

```r
path_centroid <- function(smMatrix, construct_scores, dependant, paths_matrix) {
  adj <- paths_matrix + t(paths_matrix)
  sign(stats::cor(construct_scores, construct_scores)) * adj
}
```

In `resolve_pls_estimation_settings(payload)`:
- `Factor weighting` $\rightarrow$ `seminr:::path_factorial`
- `Centroid weighting` $\rightarrow$ `path_centroid`
- `Path weighting` $\rightarrow$ `seminr::path_weighting`

---

## 2. True BCa (Bias-Corrected and Accelerated) Bootstrap Confidence Intervals

### 2.1 Theoretical Foundation & Formulas (Efron 1987; Davison & Hinkley 1997; Hair et al. 2022)

Standard bootstrap percentile intervals often perform poorly on skewed or biased parameter distributions in PLS-SEM. Metis provides exact **Percentile**, **BC (Bias-Corrected)**, and **BCa (Bias-Corrected and Accelerated)** intervals.

#### 1. Bias-Correction Parameter ($\hat{z}_0$)
Measures the median bias of the bootstrap distribution relative to the original sample estimate $\hat{\theta}$:
$$\hat{z}_0 = \Phi^{-1}\left( \frac{\#\{\theta^* < \hat{\theta}\}}{B} \right)$$
Where $\Phi(\cdot)$ is the standard normal cumulative distribution function, $\Phi^{-1}(\cdot)$ is the standard normal quantile function, and $B$ is the number of bootstrap replicates.

#### 2. Jackknife Acceleration Parameter ($a$)
Measures the rate of change of the standard error with respect to the true parameter value (accounting for skewness). It is computed via non-parametric **jackknife** (leave-one-out estimation across all $n$ cases):
$$\hat{\theta}_{(i)} = \text{PLS estimate with observation } i \text{ removed}$$
$$\bar{\theta}_{(\cdot)} = \frac{1}{n} \sum_{i=1}^n \hat{\theta}_{(i)}$$
$$a = \frac{\sum_{i=1}^n \left( \bar{\theta}_{(\cdot)} - \hat{\theta}_{(i)} \right)^3}{6 \left[ \sum_{i=1}^n \left( \bar{\theta}_{(\cdot)} - \hat{\theta}_{(i)} \right)^2 \right]^{3/2}}$$

#### 3. Adjusted Quantile Probabilities ($p_L, p_U$)
For a given significance level $\alpha$ and test type:
- **Two-Tailed**: $z_L = \Phi^{-1}(\alpha/2), \quad z_U = \Phi^{-1}(1 - \alpha/2)$
- **One-Tailed**: $z_L = \Phi^{-1}(\alpha), \quad z_U = \Phi^{-1}(1 - \alpha)$

The adjusted BCa percentiles are:
$$p_L = \Phi\left( \hat{z}_0 + \frac{\hat{z}_0 + z_L}{1 - a(\hat{z}_0 + z_L)} \right)$$
$$p_U = \Phi\left( \hat{z}_0 + \frac{\hat{z}_0 + z_U}{1 - a(\hat{z}_0 + z_U)} \right)$$

When $a = 0$, the BCa interval simplifies to the **BC** interval:
$$p_L = \Phi(2\hat{z}_0 + z_L), \qquad p_U = \Phi(2\hat{z}_0 + z_U)$$

### 2.2 Sign-Change Correction Engine

In PLS-SEM bootstrapping, eigenvector sign indeterminacy across resamples can produce sign-flipped scores. Metis supports:
- **None**: Raw bootstrap replicates are evaluated directly (SEMinR standard default).
- **Construct-level**: Inverts construct weights and path estimates for bootstrap sample $b$ if the correlation between bootstrap construct scores and original construct scores is negative ($\operatorname{cor}(Y_j^{*(b)}, Y_j) < 0$).
- **Individual-level**: Inverts indicator weights if indicator correlation is negative.

### 2.3 Backend Functions in `r-api/plumber.R`
- `calculate_bootstrap_ci(values, original, a = 0, ci_type = "BCa", alpha = 0.05, test_type = "two-tailed")`
- `compute_jackknife_acceleration(data, measurement_model, structural_model, estimation_settings)`
- `apply_sign_change_corrections(boot_model, original_model, method = "none")`
- `add_bootstrap_ci_intervals(summary_table, original_matrix, boot_array, a_matrix = NULL, alpha = 0.05, ci_type = "BCa", test_type = "two-tailed")`

---

## 3. Verification & Test Suite

1. **R Backend Bootstrap Test Suite (`tests/bootstrapIntervals.test.R`)**:
   - `calculate_bootstrap_ci` function definition and signature: **PASS**
   - Percentile confidence interval exact matching against empirical quantiles: **PASS**
   - Bias-Corrected (BC) quantile shifts for biased estimators: **PASS**
   - True BCa interval with non-zero jackknife acceleration parameter $a$: **PASS**
   - One-tailed vs. Two-tailed significance boundary shifts: **PASS**
   - Jackknife acceleration matrix computation on empirical SEMinR models: **PASS**
   - Construct-level sign-change realignment: **PASS**

2. **R Backend Centroid Test Suite (`tests/centroidWeighting.test.R`)**:
   - Distinct Centroid inner weights binding and convergence in 6 iterations: **PASS**

3. **PLSpredict Suite (`tests/rApiPlspredictCorrectness.R`)**:
   - Native matrices, fold $Q^2$, and residual metrics: **PASS**

4. **Frontend & TypeScript Compilation**:
   - `npx tsc --noEmit`: **PASS (0 errors)**

---

## 4. Temporary Model Copy & Session Management

### 4.1 Objective & Architecture
The **Temporary Model Copy** feature allows researchers to open an existing model as a volatile, experimental workspace copy, modify its structural or measurement specification, run statistical analyses, and inspect output without mutating the workspace or cluttering disk storage.

```
┌─────────────────────────────────────────────────────────────┐
│ Workspace Home (Context Menu on Model)                      │
│ -> "Temporary Copy" (Phosphor Copy icon)                    │
└──────────────────────────────┬──────────────────────────────┘
                               │ creates in-memory clone
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ In-Memory Temporary Session Registry                        │
│ temp-model-<timestamp>-<rand>                               │
│ • Deep-cloned constructs, paths, shapes, HOCs, settings     │
│ • Retains sourceModelId & sourceWorkspaceId                 │
│ • Volatile: Never written to .metisws, drafts, or disk      │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ ModelCanvas (isTemporary)    │ │ ResultsView (isTemporary)    │
│ • Autosave: DISABLED         │ │ • Calculation: Transient     │
│ • Ctrl + S: BLOCKED          │ │ • Save Results: INTERCEPTED  │
│ • Snapshot saves: MEMORY ONLY│ │   -> Prompts Save As dialog  │
│ • Ctrl+Shift+S / File Save As│ │   -> Prompts Model Save      │
│   -> Promotes to permanent   │ │   -> Automatically persists  │
│ • Return Home: INSTANT PURGE │ │      new model & result child│
│   (no discard/save dialogs)  │ │ • Return Home: INSTANT PURGE │
└──────────────────────────────┘ └──────────────────────────────┘
```

### 4.2 Core Persistence Rules
1. **Temporary Model $\rightarrow$ Session Memory Only**: Exists strictly in volatile JavaScript heap (`temporaryModelRegistry`). Never autosaved, never written to localStorage drafts, and destroyed without confirmation prompts when returning to Workspace Home.
2. **Promotion via Explicit Save As Only**: Ordinary `Ctrl + S` is a NO-OP. Only `Ctrl + Shift + S` or `File → Save As` promotes the temporary model to a new permanent `.hbe` file inside the destination workspace.
3. **Transient Analysis Results**: All calculation results (PLS-SEM, Bootstrap, PLSpredict, Advanced, Permutation, MGA) are held in memory/session cache until the user clicks **Save Results**.
4. **Chained Save Results on Temporary Models**: When **Save Results** is clicked on a temporary model:
   - Metis intercepts the action and displays the **Save Model As** dialog.
   - User names and saves the permanent model.
   - Metis persists the new permanent model and automatically creates the saved result child linked to the new model ID.
   - Navigates seamlessly to `/results/${newPermanentModelId}` without asking the user to click Save Results again.

### 4.3 Files Implemented & Modified
- `src/utils/temporaryModels.ts`: Registry store, deep cloning, session management (`createTemporaryModelSession`, `getTemporaryModelSession`, `updateTemporaryModelSession`, `deleteTemporaryModelSession`, `clearAllTemporaryModelSessions`, `isTemporaryModelId`).
- `src/pages/WorkspaceHome.tsx`: Context menu `Temporary Copy` option with Phosphor `Copy` icon, model cloning on click, and destruction on home boundary.
- `src/pages/ModelCanvas.tsx`: Dual-source model resolution, tab switcher support, persistence guards (no autosave, blocked Ctrl+S, in-memory snapshots), and Save As promotion.
- `src/pages/ResultsView.tsx`: Transient result flow for all models, Save Results interception, and chained Save As model + result creation.
- `src/components/TitleBar.tsx`: Disabled Save for temporary models; enabled Save As.
- `src/App.tsx`: Tab management supporting temporary sessions and cleanup on home navigation.
- `tests/temporaryModelCopyStatic.test.mjs`, `tests/temporaryModelsUnit.test.mjs`, `tests/temporaryModelCopyWorkflow.test.mjs`: Test suites verifying full lifecycle.
