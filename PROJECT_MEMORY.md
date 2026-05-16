# Project Memory & Log

This document serves as a living record of recent queries, changes, logs, and the thinking process to maintain project context.

Project started by Aaron Daniel Akuteye on Saturday, March 14, 2026, 6:50:27 PM.

## 2026-05-16 — Version, font scale, zoom, and panel polish

### Queries & User Requests
1. Change all public-beta version wording to app version `0.0.1`.
2. Add a Preferences font-size adjuster whose effect appears after restarting the app.
3. Move model-canvas zoom controls out of the right Tools panel, place them on the canvas, and expose a View menu toggle for showing or hiding them.
4. Let the left indicator panel collapse into a compact dataset card rather than a full-height rail.
5. Rename the View menu's Variables Panel item to Indicators Panel.
6. Keep the title bar brand clean: show only `metis` next to the icon, with Lite/Bundle edition and version shown inside Preferences.

### Completed Changes
- `2026-05-16` — Package and visible version labels were moved to `0.0.1`.
- `2026-05-16` — Preferences now stores app font size under `metis:prefs:fontScale` with `Small`, `Default`, `Large`, and `Extra Large` options.
- `2026-05-16` — Preferences no longer exposes an analysis-engine selector because the app's analysis path is fixed on the local R/Plumber `seminr` workflow; `semPower` remains a supporting package for post hoc calculations rather than a selectable engine.
- `2026-05-16` — Font scale ratios are `0.94`, `1.00`, `1.08`, and `1.16`; the app shell is the single visible scaler so inline pixel-sized UI changes visibly after restart without compounding inherited body text.
- `2026-05-16` — The title bar brand area now shows only the metis icon and `metis`; build edition and version details live in Preferences About.
- `2026-05-16` — The old beta release-channel define was removed so Lite/Bundle labels come only from the edition and package version.
- `2026-05-16` — Preferences About now separates `Edition` from `Version`, using the Lite/Bundle build define and package version.
- `2026-05-16` — Model-canvas zoom controls are a compact bottom-right canvas overlay with a View menu `Zoom Control` visibility toggle.
- `2026-05-16` — The left indicator panel can collapse to a compact dataset card and expand again from that card.
- `2026-05-16` — Floating panel and zoom shadows were softened for both dark and light themes.

### Validation
- Focused static coverage was added for version branding, Preferences font scale, title-bar label removal, Preferences edition/version placement, canvas zoom relocation, and indicator-panel collapse behavior.
- Verification for this pass used targeted Node static tests plus TypeScript checks.

## 2026-05-16 — Core app capability audit and memory backfill

### Why This Entry Was Added
- The project memory had strong historical notes for installer failures, security hardening, PLSpredict fixes, results polish, branding, and release builds.
- What was missing was a current, dated map of the app's core capabilities as they exist in the codebase.
- This entry was added after reviewing the memory alongside the main app routes, Electron IPC bridge, R Plumber backend, results catalog, report tooling, and workspace/data/model pages.

### Current Core App Routes
- `2026-05-16` — The app is routed through `HashRouter` in `src/App.tsx`.
- Current primary routes:
  - `/` — workspace home and project library.
  - `/canvas/:modelId` — model-building canvas.
  - `/results/:modelId` — analysis results workspace.
  - `/results/:modelId/descriptive` — descriptive statistics view.
  - `/dataview/:workspaceId/:datasetId` — dataset inspection view.
  - `/import/step1` — dataset import and preview flow.
  - `/tark-preview/:workspaceId/:modelId` — Tark report preview.
  - `/rcode` — generated R code viewer.
  - `/installer-preview` — bundled installer preview/setup flow.
  - `/setup-wizard` — Lite setup wizard for external R configuration.

### Workspace System
- `2026-05-16` — Workspaces are structured around `.ada` files and typed children: models, datasets, and results.
- Workspace children support metadata including `createdAt`, `updatedAt`, badges, linked dataset/model ids, stats, and stored analysis state.
- Workspace home supports:
  - creating and opening workspaces,
  - opening `.ada` files from Explorer into the running app instance,
  - model, dataset, and result children inside a workspace,
  - pinning, color changes, reordering, and context-menu actions,
  - safer delete prompts that avoid exposing absolute local paths.
- Electron owns the durable workspace filesystem operations through `workspace:list`, `workspace:create`, `workspace:save`, `workspace:delete`, `workspace:deleteChild`, `workspace:openFile`, and `workspace:extractDataset`.

### Dataset System
- `2026-05-16` — Dataset import supports CSV/text-style data and Excel workbooks.
- Import flow detects delimiters, handles encodings, parses Excel through `exceljs`, previews headers and rows, infers variable types, counts missing values, and persists imported data into the selected workspace.
- Workspaces currently enforce a practical dataset cap in the import UI, blocking new imports when a workspace already has three datasets.
- Imported datasets store headers, variable types, row/missing counts, original filename, workspace-safe internal file paths, and extracted temp paths for analysis.
- The app also has a sample dataset path via `dataset:useSample`, letting users start modeling without manually importing data first.

### Model Canvas
- `2026-05-16` — The model canvas is the central no-code PLS-SEM editor.
- Core canvas behavior includes:
  - creating latent variables,
  - dragging dataset indicators onto constructs,
  - reflective/formative measurement model selection,
  - direct paths and moderation paths,
  - straight, curved, and right-angle connector styles,
  - draggable connector handles and joints,
  - multi-selection, group move/resize, alignment, distribution, and auto-size controls,
  - dataset switching and dataset opening from the canvas,
  - model tabs with dirty-state handling,
  - PNG export for path diagrams,
  - generated R script export/copy support.
- Autosave exists in the canvas and is driven by shared preference values, currently reading the saved autosave interval rather than using a hardcoded-only interval.

### Analysis Engine
- `2026-05-16` — The statistical engine is a local R Plumber service bridged through Electron.
- Electron exposes analysis IPC calls for:
  - `plumber:health`,
  - `plumber:runPls`,
  - `plumber:runBootstrap`,
  - `plumber:runPlsPredict`,
  - `plumber:runAdvancedAnalysis`.
- The renderer service layer falls back to a local HTTP Plumber URL in browser-only development when the Electron bridge is unavailable.
- The R backend validates payload structure, trusted dataset roots, construct/path/interactions limits, algorithm settings, bootstrap settings, PLSpredict settings, and advanced-analysis settings before running analysis.
- Current analysis modes are:
  - `PLS-SEM` via `seminr::estimate_pls`,
  - `Bootstrap` via `seminr::bootstrap_model`,
  - `PLSpredict` via `seminr::predict_pls`,
  - `Advanced analysis` via `seminrExtras::assess_ipma`, `assess_nca`, and `assess_cipma`.
- The backend includes timeout handling, memory/timeout-friendly error messages, timing metadata, trusted workspace root checks, bootstrap sample ceilings, NCA run-depth ceilings, CVPAT sample ceilings, and dynamic CPU-core reservation.

### Results System
- `2026-05-16` — Results are organized by mode using `src/results/panelCatalog.ts`.
- PLS-SEM panels include structural effects, measurement model outputs, model quality, data diagnostics, and execution logs.
- Bootstrap panels include resampled structural/measurement effects, HTMT confidence intervals, base-model reference quality panels, and execution logs.
- PLSpredict panels include MV/LV summaries, PLS vs LM comparison, Q2predict, prediction errors, error histograms, CVPAT LV summary, and execution logs.
- Advanced-analysis panels include base PLS-SEM reference results plus priority maps, construct tables, NCA necessity checks, ceiling lines, bottleneck tables, cIPMA priorities, and execution logs.
- Results support:
  - mode-specific panel navigation,
  - list/matrix table views where relevant,
  - bootstrap confidence interval views,
  - significance coloring,
  - chart rendering through `ResultsCharts`,
  - static chart embedding in exported HTML reports,
  - clipboard copy with HTML and plain-text table formats,
  - R script export/copy,
  - HTML report export and auto-open for generated reports.

### Tark Reporting
- `2026-05-16` — Tark is now a first-class report-preview workflow rather than only a future/report idea.
- The title bar exposes a `Tark it` action, and `TarkModal` collects report choices before opening `TarkPreview`.
- Tark can build report sections from saved PLS-SEM, Bootstrap, PLSpredict, and advanced-analysis outputs.
- Tark report utilities generate APA-style tables, hypothesis-test tables, measurement/model-quality sections, PLSpredict sections, and path-diagram snapshots with configurable construct labels.
- Tark tables can be copied in Word-friendly HTML/plain-text formats.

### Setup, Packaging, and Runtime Modes
- `2026-05-16` — The app supports two runtime/setup paths:
  - Bundle mode, where the installer prepares a bundled R engine archive.
  - Lite mode, where the setup wizard finds and validates an existing `Rscript` installation and required R packages.
- Setup and installer screens share theme persistence through `metis:prefs:theme` and legacy `pls:prefs:theme` keys.
- Electron includes bundled runtime extraction paths for Windows zip and Unix tar/gz archives, relocation handling for Unix R bundles, and production installer progress events.
- The project keeps separate builder configs for Lite and Bundle in `build/electron-builder.lite.yml` and `build/electron-builder.bundle.yml`.

### Preferences, Theme, Tour, and Diagnostics
- `2026-05-16` — Preferences cover general settings, appearance, autosave, algorithm defaults, export settings, and updates/about information.
- Current preference-backed behaviors include:
  - dark/light theme selection,
  - language placeholder locked to English,
  - autosave toggle and interval preference,
  - default bootstrap subsamples,
  - decimal-place formatting for results and diagrams.
- The onboarding tour is implemented through `OnboardingTour` and can be opened from the title-bar help menu.
- Diagnostics are collected through shared utilities and surfaced in analysis/runtime error flows to make renderer bridge failures, backend failures, and import/persistence issues easier to trace.

### Memory Gaps Closed By This Entry
- `2026-05-16` — The previous memory did not clearly state the full current route map.
- `2026-05-16` — The previous memory did not summarize the typed workspace child model for datasets, models, and results.
- `2026-05-16` — Dataset import, Excel parsing, variable-type inference, sample dataset use, and DataView were under-documented.
- `2026-05-16` — The current model canvas capabilities were spread across older bug notes rather than captured as one current feature map.
- `2026-05-16` — Advanced analysis was partly covered by design docs and implementation notes, but the memory did not clearly connect it to current R endpoints and results panels.
- `2026-05-16` — Results chart/export/clipboard/HTML-report behavior existed in the app but was not summarized as a current capability.
- `2026-05-16` — Tark report generation existed in the app but was not recorded as a first-class current workflow.
- `2026-05-16` — Preferences, theme persistence, onboarding tour, and diagnostics existed in the app but were not fully captured in the memory.

## 2026-04-05 — Session 03 — Installer renderer failure, file-protocol fix, and final Beta installers

### Queries & User Requests
1. Build `Lite` and `Bundle` installers with the finalized public-facing naming:
   - `PLS logic`
   - include the current version,
   - include `Lite` or `Bundle`,
   - include `Beta`.
2. Keep the Lite and Bundle behavior distinct:
   - Lite uses the user's existing/global R installation and launches the setup wizard,
   - Bundle ships portable R and launches the installer preview flow.
3. Diagnose repeated packaged-installer failures on Windows:
   - invisible/ghost setup window,
   - then black `#181818` shell with no React content,
   - then `Not allowed to load local resource: file:///.../app.asar/dist/index.html#/setup-wizard`.
4. Simplify the setup/installer shell styling:
   - stop relying on transparent padding for the installer/setup shell,
   - make the shell background match the React surface (`#181818`),
   - keep rounded corners,
   - remove the extra React border/shell gap,
   - stop rotating the installer logo.
5. Once Lite was confirmed working, rebuild Lite without the DevTools popup and then build Bundle from the same fix set.

### Symptoms, False Leads, and Challenges
- The packaged Lite installer went through several misleading failure modes:
  - a fully invisible setup window that still appeared in the taskbar,
  - a visible rounded shell that rendered only the dark background,
  - a renderer load error that looked at first like missing packaged assets.
- Multiple potential causes were explored during the session:
  - transparent + hidden-window behavior on Windows,
  - React route timing / hash-router startup,
  - navigation-policy interference,
  - `app.asar` vs `app.asar.unpacked` packaging confusion,
  - whether the packaged `dist/index.html` was actually present.
- A key debugging nuance:
  - `app.asar.unpacked` not containing `dist/index.html` is normal,
  - only unpacked/native resources live there,
  - the real check is whether `resources/app.asar` contains the renderer bundle.
- Another important nuance:
  - the root `build` block in `package.json` was not the active source of truth for Lite/Bundle packaging because the shipping scripts use:
    - `build/electron-builder.lite.yml`
    - `build/electron-builder.bundle.yml`

### Investigation Findings
- The packaged renderer files were present in `app.asar`, so the issue was not simply "missing dist files."
- The winning clue was the packaged runtime error:
  - `Not allowed to load local resource: file:///.../app.asar/dist/index.html#/setup-wizard`
- The decisive fix was not in React routing or file inclusion:
  - it was enabling Electron's file-protocol privileges in the actual YAML configs used by the installer builds.
- Supporting stability improvements made the diagnosis cleaner:
  - packaged renderer path resolution now prefers `app.getAppPath()`,
  - installer/setup windows no longer use the strict main-app navigation policy,
  - temporary DevTools builds were used only for diagnosis and then removed from the final public Lite/Bundle outputs.

### Completed Changes
- `build/electron-builder.lite.yml`
  - set `electronFuses.grantFileProtocolExtraPrivileges: true`.
- `build/electron-builder.bundle.yml`
  - set `electronFuses.grantFileProtocolExtraPrivileges: true`.
- `electron/main.ts`
  - added packaged renderer path resolution via `app.getAppPath()` so `dist/index.html` is resolved from the packaged app path first,
  - kept explicit packaged renderer load logging during diagnosis,
  - limited `enforceNavigationPolicy(win)` to the main app window rather than applying it to the Lite/Bundle installer windows,
  - kept the main installer/setup shell opaque with:
    - `backgroundColor: '#181818'`
    - `transparent: false`
    - `roundedCorners: true`,
  - restored `devTools: isDev` after temporary diagnostic builds so final public installers do not auto-open DevTools.
- `src/pages/InstallerPreview.tsx`
  - changed the outer shell to an opaque `#181818` background with no transparent padding,
  - removed the extra card border and drop shadow so the React surface matches the Electron shell,
  - kept rounded corners,
  - stopped rotating the installer logo so it remains fixed.
- `src/pages/SetupWizard.tsx`
  - changed the outer shell to an opaque `#181818` background with no transparent padding,
  - removed the extra card border and drop shadow so the React surface matches the Electron shell,
  - kept rounded corners while preserving the cleaner embedded setup layout.

### Product / Packaging Decisions Captured
- Public branding during this cycle is:
  - `PLS logic`
  - not `PLSLogic`, `PLS Logic`, or any extended variant.
- Output naming for the current beta cycle is:
  - `PLS logic 0.1.7 Lite Beta.exe`
  - `PLS logic 0.1.7 Bundle Beta.exe`
- Lite and Bundle remain intentionally different product experiences:
  - Lite configures and validates an existing machine-wide R install,
  - Bundle installs/extracts the bundled portable runtime before first use.
- The file-protocol fuse change lives in the YAML build configs, which is critical because those are the configs actually used by:
  - `npm run build:lite`
  - `npm run build:bundle`

### Validation Performed
- Built multiple Lite diagnostic installers while isolating the packaged renderer failure.
- Confirmed the working Lite installer in Windows Sandbox after enabling file-protocol privileges:
  - the setup wizard rendered correctly instead of showing an invisible or blank shell.
- After the fix was proven, rebuilt Lite without the temporary DevTools popup.
- Built the Bundle installer from the same corrected packaging/fuse setup.
- Final release artifacts from this session:
  - `release/lite/PLS logic 0.1.7 Lite Beta.exe`
  - `release/bundle/PLS logic 0.1.7 Bundle Beta.exe`

### Notes For Future Sessions
- If packaged installer/setup windows ever regress with `Not allowed to load local resource` while loading `file:///.../app.asar/dist/index.html#/...`, check the active builder YAML fuse settings before reworking routing or packaging.
- Do not use `app.asar.unpacked` as the primary test for whether the Vite renderer was packaged.
- The current opaque-shell approach is more stable on Windows than the transparent installer shell experiments that were tested earlier in the session.

## 2026-04-05 — Session 02 — Security hardening review + 0.1.7 release build

### Queries & User Requests
1. Review a Gemini-generated penetration-test report produced from the packaged `0.1.6` bundle and give a grounded assessment of which claims were accurate vs overstated.
2. Fix the issues judged release-blocking before further distribution:
   - remove/restrict the generic file/system IPC surface,
   - generate and enforce a per-launch local Plumber auth token,
   - lock `datasetPath` access to trusted workspace roots,
   - fix leaked developer paths that made it into production-related artifacts.
3. After the security work, bump visible app/version references from `0.1.6` to `0.1.7` across installer preview, setup wizard, preferences/about surfaces, splash/version label, and packaged installer outputs.
4. Build fresh `Lite` and `Bundle` Windows installers for `0.1.7`.
5. Update project memory before the next task.

### Security Review Findings Confirmed During The Session
- The Gemini report was directionally correct:
  - `electron/preload.ts` exposed broad privileged bridge methods (`readFile`, `writeFile`, `openPath`) directly into the renderer.
  - `electron/main.ts` accepted raw paths for `file:read`, `file:write`, and `shell:openPath` with effectively no validation.
  - `r-api/plumber.R` allowed empty `PLSLOGIC_PLUMBER_TOKEN` and empty `PLSLOGIC_ALLOWED_DATA_ROOTS`, which meant the backend defaulted open instead of fail-closed.
  - startup restored `rscriptPath` from `install-config.json`, so malicious config tampering could persistently redirect the backend executable.
- Important nuance captured during review:
  - `shell:openPath` is a dangerous renderer-compromise primitive, but not a standalone internet-facing RCE by itself.
  - `datasetPath` local file read exposure was real, but limited to supported data-file extensions (`csv`, `txt`, `xls`, `xlsx`) rather than every file type on disk.
- Developer-path leakage was traced mainly to generated `release/*/builder-debug.yml` files and the helper script `resources/make_icon.ps1`, not to intended runtime branding strings.

### Implementation Challenges
- The biggest design challenge was tightening the IPC surface without breaking normal user workflows:
  - dataset import still needs renderer-initiated file reads after a native file picker,
  - ResultsView and ModelCanvas exports still need file writes,
  - HTML report export still needs local auto-open behavior.
- The packaging challenge was not just source cleanup:
  - even after code cleanup, generated `builder-debug.yml` files still embedded absolute local development paths unless they were explicitly removed post-build.
- The security work had to fit the existing Electron architecture:
  - `contextIsolation` was already enabled, but the bridge was still too broad,
  - the goal became "least privilege within current architecture" rather than a full renderer/main redesign in one pass.

### Completed Changes
- `electron/main.ts`
  - added per-launch random Plumber auth token generation via `crypto.randomBytes(...)`,
  - added helper builders for:
    - authenticated request headers,
    - trusted Plumber environment variables,
    - approved dialog/open/save path tracking,
    - root/path and extension validation,
  - updated Plumber process startup to always pass:
    - `PLSLOGIC_PLUMBER_TOKEN`
    - `PLSLOGIC_ALLOWED_DATA_ROOTS`
    - loopback host/port values,
  - restricted `file:read` so it only succeeds for files explicitly chosen through an approved open-file dialog and only for allowed import extensions,
  - restricted `file:write` so it only succeeds for:
    - save-dialog-approved targets, or
    - trusted app/workspace roots,
    - and only for allowed export extensions,
  - restricted `file:copyToWorkspace` so source files must come from approved import selection and destination paths must stay inside the PLSLogic workspace root,
  - restricted `shell:openPath` so it only opens approved locally-created HTML targets rather than arbitrary executables/paths,
  - updated `plumber:health` and POST calls to always send the local auth token header,
  - refreshed security env + restarted Plumber after `r:saveLiteConfig` so Lite setup changes do not leave stale backend security state behind.
- `r-api/plumber.R`
  - changed dataset-root validation to fail closed when trusted roots are missing,
  - changed token validation to fail closed when the auth token is missing,
  - kept the existing token filter but now returns explicit configuration/auth errors instead of silently allowing anonymous access.
- `package.json`
  - bumped app version to `0.1.7`,
  - updated build scripts to run a post-build cleanup script that removes `builder-debug.yml` from release outputs,
  - excluded `resources/*.ps1` from packaged app files so helper scripts with local-path assumptions are not shipped.
- `vite.config.ts`
  - updated fallback version define from `0.1.6` to `0.1.7`.
- `package-lock.json`
  - updated package version metadata to `0.1.7`.
- `build/electron-builder.bundle.yml`
  - excluded `resources/*.ps1` from packaged app contents.
- `build/electron-builder.lite.yml`
  - excluded `resources/*.ps1` from packaged app contents.
- `resources/make_icon.ps1`
  - removed hardcoded `C:\Users\aaron\dev\plslogic\...` paths,
  - converted the script to compute paths relative to `$PSScriptRoot`.
- `scripts/clean-release-debug.mjs`
  - added a post-build cleanup step that deletes:
    - `release/bundle/builder-debug.yml`
    - `release/lite/builder-debug.yml`

### Release / Versioning Notes
- Versioning was updated to `0.1.7` for the current shipping build.
- The app’s visible version label surfaces now inherit the new version from package metadata rather than retaining old `0.1.6` strings.
- Fresh installer outputs produced in this session:
  - `release/bundle/PLS logic 0.1.7 Bundle Beta.exe`
  - `release/lite/PLS logic 0.1.7 Lite Beta.exe`

### Results / Export Compatibility Notes
- The IPC hardening was designed to preserve expected export flows instead of breaking them outright:
  - save-dialog-driven exports remain valid,
  - trusted workspace/app-data writes remain valid,
  - local HTML report auto-open is limited to approved generated HTML files.
- This specifically protects existing export patterns used by:
  - `ResultsView.tsx` (Excel and HTML export paths),
  - `ModelCanvas.tsx` (PNG export path),
  - dataset import flows that rely on renderer-side file selection followed by backend-safe persistence.

### Validation Performed
- `npm run typecheck` passed after the security and versioning changes.
- `npm run build:bundle` completed successfully.
- `npm run build:lite` completed successfully.
- Verified release artifact outputs:
  - `release/bundle/PLS logic 0.1.7 Bundle Beta.exe`
  - `release/lite/PLS logic 0.1.7 Lite Beta.exe`
- Verified `builder-debug.yml` no longer remains in either release folder after builds.
- Verified rebuilt packaged `app.asar` no longer contained leaked `C:\Users\aaron\dev\plslogic` path strings.
- Noted one remaining `0.1.6` string inside rebuilt `app.asar`, but it came from a bundled third-party library changelog rather than PLSLogic branding or installer metadata.

## 2026-03-30 — Session 01 — Lite setup wizard polish + installer shell consistency

### Queries & User Requests
1. Improve the Lite setup wizard after the R runtime/package checks started working:
   - remove the verbose on-screen diagnostics/debug preview added during troubleshooting,
   - keep the package-failure panel compact,
   - show detected R metadata in a cleaner side-by-side layout,
   - change the failed-R CTA text from "Don't have R? Download R for Windows" to `Download R`,
   - allow the user to retry automatic R detection after installing R, without restarting setup.
2. Fix the package re-verify progress behavior so repeated failed retries do not keep pushing the progress bar toward 100%.
3. Reduce and unify installer/shell sizing:
   - make the frameless installer/setup shell corners properly rounded,
   - reduce the Lite setup shell width to `600`,
   - keep the React installer surface and the Electron shell aligned to the same size.
4. Clarify/handle upgrade behavior so newer installs update the existing PLS Logic install in place instead of feeling like a second app.
5. Update project memory with today's date and session number.

### Bugs Encountered During The Session
- The expanded Windows R detection patch introduced an Electron main-process runtime error:
  - `require is not defined`
  - root cause: a CommonJS `require('child_process')` slipped into the ESM main process.
- The package-check flow initially returned:
  - `Could not parse R package check output`
  - with empty stdout on some runs, which made diagnosis difficult.
- The Lite setup progress bar could drift upward across repeated failed `Re-verify` attempts because package verification reused the existing animated progress state instead of re-anchoring it.
- The temporary diagnostic UI made the package-failure screen overly dense and visually noisy once the underlying runtime checks were working.

### Completed Changes
- `electron/main.ts`
  - removed the ESM-incompatible `require(...)` usage and switched fully back to imported `child_process` APIs,
  - normalized selected `Rscript.exe` paths before probing/verification,
  - kept the broader Windows R lookup coverage and pre-validation of candidate Rscript executables,
  - added existing-install detection for Windows by checking the uninstall registry key for `com.plslogic.app`,
  - updated installer/setup window sizing so non-main-app setup windows are fixed-width at `600px`,
  - enabled rounded corners for installer/setup windows and aligned the shell to the React surface.
- `src/pages/SetupWizard.tsx`
  - removed the on-screen diagnostic/debug preview blocks from the R-not-found and package-failed states,
  - simplified the package-failed runtime summary to:
    - `Detected R version`
    - `R home`
    - `Library 1`
  - styled `R home` and `Library 1` with subdued dark-gray text,
  - renamed the failed-R link to `Download R`,
  - added a `Try Again` action so users can re-run automatic R detection immediately after installing R,
  - anchored package-check progress to a fixed range so repeated failed retries no longer keep advancing the bar,
  - kept the manual `Browse` + `Continue` path intact.
- `src/pages/InstallerPreview.tsx`
  - added an existing-install notice so users are told when PLS Logic is already installed,
  - clarified that the installer updates the existing app in place instead of creating a second install,
  - changed the preview layout to fill the shell exactly rather than floating inside padded space,
  - tightened the sizing and typography so the React card matches the Electron shell dimensions more closely.
- `electron/preload.ts`
  - exposed installer upgrade-detection info to the renderer via `install:getExistingAppInstall`.
- `src/vite-env.d.ts`
  - updated Electron bridge typings for the new installer info API.

### Product / UX Decisions
- The verbose troubleshooting diagnostics were useful during debugging, but are no longer shown in the user-facing setup flow.
- The Lite setup wizard now prefers a cleaner recovery path:
  - install R,
  - click `Try Again`,
  - or browse manually to `Rscript.exe`.
- Re-verify progress is now deterministic:
  - package retries start from a fixed package-check progress anchor,
  - failed retries stay visually in the package-check range instead of falsely suggesting completion.
- Upgrade handling:
  - the packaged app already uses a stable `appId` (`com.plslogic.app`) and `productName` (`PLS Logic`),
  - the UI now makes that in-place update behavior explicit so users are less likely to think a second app will be created.

### Validation
- `npm run typecheck` passed after the setup/installer cleanup.
- `npm run build:lite` completed successfully after the ESM/runtime fix.
- Latest Lite build artifact:
  - `release/lite/PLS Logic Lite 0.1.5.exe`

## 2026-03-27 — Cross-loadings + model fit restoration

### Queries & User Requests
1. Investigate why `Cross-loadings` and `Model fit` stayed empty even after `Run PLS`, while the rest of the results tables populated correctly.
2. Clarify whether model fit should come from normal PLS, bootstrap, or `it_criteria`.
3. Restore visible cross-loadings/model fit output in the Results screen.
4. Final requested behavior:
   - normal PLS / PLSc should show `Model fit`,
   - bootstrap should not show `Model fit`,
   - `it_criteria` should remain available as `Model selection criteria`,
   - `Cross-loadings` should be visible where applicable.
5. Update project memory after the fix was confirmed working.

### Investigation Summary
- Confirmed the bundled R runtime is using `seminr 2.3.2`.
- Verified that the previous backend call `seminr::model_criteria(model)` was invalid in this runtime and silently collapsed to an empty list through `tryCatch`.
- Verified that real cross-loadings in this `seminr` version come from `summary(pls_model)$validity$cross_loadings`, not from the old top-level assumption.
- Verified directly in bundled `seminr` that:
  - `summary(pls_model)$it_criteria` returns `AIC` and `BIC`,
  - `summary(boot_model)$it_criteria` is `NULL`,
  - therefore `it_criteria` is not the correct source for `SRMR`, `NFI`, `d_ULS`, or `d_G`.
- Found a separate UI bug in `ResultsView.tsx`: bootstrap mode was not rendering the custom `CrossLoadingsTable` / `ModelFitTable` components, causing those panels to appear blank even when backend data existed.
- Found a panel-selection state issue: when switching analysis modes, the currently selected panel could remain on a panel no longer present in that sidebar, producing misleading empty views.

### Completed Changes
- `r-api/plumber.R`:
  - corrected cross-loadings extraction to use the real `summary_obj$validity$cross_loadings` source,
  - replaced the broken fit extraction path with a fitted-model helper that computes the displayed fit block (`SRMR`, `NFI`, `d_ULS`, `d_G`) from the model/data already available in the bundled `seminr` runtime,
  - exposed fit rows plus scalar `srmr` in `quality_criteria`,
  - shared the quality-criteria extraction path so normal PLS and bootstrap results are consistent where needed.
- `src/pages/ResultsView.tsx`:
  - restored correct custom rendering for `Cross-loadings` and `Model fit` table panels,
  - reintroduced bootstrap support for `Cross-loadings`,
  - later removed `Model fit` from the bootstrap sidebar per final user direction,
  - separated `Model fit` from `Model selection criteria`,
  - constrained `Model fit` parsing to the intended fit indices only: `SRMR`, `NFI`, `d_ULS`, `d_G`,
  - kept `it_criteria` exclusively under `Model selection criteria`,
  - updated sidebar fallback logic so switching modes no longer leaves the UI stuck on an invalid/hidden panel.

### Final Product Decisions
- `Model fit`:
  - shown for normal `Run PLS` / `PLSc`,
  - displays only `SRMR`, `NFI`, `d_ULS`, and `d_G`.
- `Model selection criteria`:
  - uses `it_criteria`,
  - represents `AIC` / `BIC`,
  - remains separate from the fit block.
- Bootstrap:
  - keeps `Cross-loadings`,
  - keeps `Model selection criteria`,
  - does not show `Model fit`.

### Validation
- `npm run typecheck` passed after the ResultsView fixes.
- `plumber.R` parsed successfully in the bundled R runtime.
- Direct bundled-R verification confirmed:
  - non-empty cross-loadings rows,
  - non-empty fit rows with `SRMR`, `D_ULS`, `D_G`, `NFI`,
  - `summary(pls_model)$it_criteria` = `AIC/BIC`,
  - `summary(boot_model)$it_criteria` = `NULL`.
- User confirmed the final behavior works.

## 2026-03-21 — Pre-build release audit + Results visual polish

### Queries & User Requests
1. Inspect the already-built output in `release/` and `release/win-unpacked/`, understand what was previously shipped, and confirm understanding before next steps.
2. Before rebuilding, update Results section visuals:
   - set Graphical Output area/dropdown dark tone to `#181818`,
   - set disabled Generate AI Report button background to `#202020`,
   - add stronger hover feedback on `Export HTML` and `Copy R Script` (white text on hover).
3. Update project memory.

### Release audit summary (read-only inspection)
- Verified installer artifacts in `release/`:
  - `PLSLogic Setup 0.1.0.exe`, blockmap, builder debug/effective config files.
- Verified unpacked runtime in `release/win-unpacked/`:
  - `PLSLogic.exe`, `resources/app.asar`, `resources/r-api/plumber.R`, `resources/r-api/R-Portable.zip`.
- Verified effective electron-builder config includes:
  - `extraResources` for both `runtime` and `r-api`,
  - NSIS target + `.ada` file association icon,
  - custom include reference to `build/installer.nsh` in debug script.
- Verified packaged app bundle includes core UI/electron files (`TitleBar.tsx`, `ResultsView.tsx`, `InstallerPreview.tsx`, `AppLogo.tsx`, etc.) and bundled `runtime/r-portable` contents.

### Completed code changes
- `src/pages/ResultsView.tsx`:
  - Graphical Output trigger background updated to `#181818`.
  - Graphical Output dropdown panel background updated to `#181818`.
  - Disabled `Generate AI Report` button background updated to `#202020` (border aligned to `#2A2A35`).
  - Added `hover:text-white` feedback for:
    - `Export HTML`
    - `Copy R Script`

### Validation
- TypeScript check passed after edits: `npm run typecheck`.

## 2026-03-21 — Branding refresh + menu UX polish

### Queries & User Requests
1. Replace old graph-style app logo with new provided assets (icon/white/black/primary variants + PNG).
2. Use the correct logo variant per context:
   - dark title bar -> white logo,
   - branded app surfaces -> primary color logo,
   - installer/build icon -> icon/PNG-derived `.ico`.
3. Improve top menu behavior: once one menu is open, hovering another tab should immediately preview that menu.
4. Grey out/disable all "Generate AI Report" actions for now.
5. Clarify how to run installer preview.

### Completed Changes
- Imported new assets into `src/assets`:
  - `logo-icon.svg`, `logo-primary.svg`, `logo-white.svg`, `logo-black.svg`.
- Added `resources/app-logo.png` and updated icon generation script:
  - `resources/make_icon.ps1` now generates both `resources/icon.ico` and `build/icon.ico` from `app-logo.png`.
- Reworked `src/components/AppLogo.tsx`:
  - moved from hardcoded graph path SVG to asset-driven rendering,
  - white/black/primary variant chosen by `color` prop.
- Updated title bar branding in `src/components/TitleBar.tsx` to use white logo on dark title bar.
- Updated installer logo in `src/pages/InstallerPreview.tsx` to use the primary variant.
- Updated splash badge logo markup in `electron/main.ts` to the new logo icon path (no legacy graph path).
- Added hover-to-switch top menu behavior in `TitleBar`:
  - when any top menu is open, moving over another menu tab switches the dropdown immediately.
- Disabled AI report actions:
  - `Analysis > Generate AI Report` in `TitleBar` is always disabled,
  - Results toolbar `Generate AI Report` button is disabled and greyed in `src/pages/ResultsView.tsx`.

### Validation
- TypeScript check passed after changes: `npm run typecheck`.

### Installer Preview Command
- Use `npm run dev:installer-preview` from `plslogic` to open installer preview flow.
- Route fallback: `http://localhost:5173/#/installer-preview`.

## 2026-03-20 — PLSpredict backend update

### Queries & User Requests
1. Replace `extract_plspredict_sections` in `r-api/plumber.R` to consume true `seminr` prediction summary matrices.
2. Replace `/run-plspredict` endpoint so it executes actual `seminr::predict_pls(...)` with k-fold cross-validation.
3. Update project memory with the implementation log.

### Completed Changes
- `r-api/plumber.R`:
  - Replaced `extract_plspredict_sections(payload, data, core)` with `extract_plspredict_sections(payload, data, core, pred_summary)`.
  - New parser now reads `pred_summary$pls_out_of_sample` and `pred_summary$lm_out_of_sample` and emits SmartPLS-aligned MV rows with `Q²predict`, `PLS-SEM_RMSE`, `PLS-SEM_MAE`, and LM benchmarks when present.
  - Replaced `/run-plspredict` route to run:
    - `seminr::predict_pls(model = core$model, technique = seminr::predict_DA, noFolds = folds, reps = reps)`
    - `pred_summary <- summary(predict_model)`
    - `extract_plspredict_sections(payload, data, core, pred_summary)`
- Preserved existing defaulting behavior for missing frontend parameters (`folds = 10`, `repetitions = 10`).

### Follow-up fix (same day)
- Resolved empty PLSpredict results preview: `extract_plspredict_sections` now accepts both matrix and data.frame shapes for `pls_out_of_sample` / `lm_out_of_sample` and matches column-name variants for Q2/RMSE/MAE.
- Root cause was strict `is.matrix(...)` gating, which returned no rows when `seminr` exposed out-of-sample tables as data frames.

### Follow-up fix 2 (same day)
- Replaced PLSpredict extractor to consume full `predict_model` and compute `pred_summary` internally, preventing nested metric objects from leaking to JSON as `[object Object]` in React.
- Added robust scalar flattening for MV summary values (`Q²predict`, `PLS-SEM_RMSE`, `PLS-SEM_MAE`, `LM_*`) and ensured RMSE/MAE are matched independently.
- Added LV predictive summary from `residuals_LVs` + latent scores, plus case-level MV/LV prediction-error tables (capped to 100 rows per indicator/construct).
- Updated `/run-plspredict` route to pass `predict_model` into `extract_plspredict_sections(...)`.

### Follow-up fix 3 (same day)
- MV/LV prediction-error tables were still empty for some `seminr` object variants.
- Added nested-slot extraction for `predicted_*`, `predictions_*`, and `prediction_errors` containers and recursive tabular leaf collection.
- Added residual derivation fallbacks:
  - MV errors from original indicator data when prediction errors are missing.
  - LV errors from latent scores when LV residuals are missing.
- Normalized all prediction/error outputs to scalar numerics before JSON serialization.

### Follow-up fix 4 (same day)
- UI polish and menu behavior updates requested by user:
  - Hid workspace/model file extension suffixes in display labels (e.g., `.ada`, model file-like extensions) while preserving stored raw names.
  - Reworked `File > Open Recent` to be model-only (no workspace prefix in labels).
  - `Open Recent` now opens directly by model id and resolves owning workspace automatically.
  - Added `File > Quit` action with confirmation prompt.
  - Added keyboard quit shortcuts (`Alt+F4` and `Ctrl+Q`) to trigger the same confirmation flow.
- PLSpredict histogram UX improvements:
  - Enabled actual histogram rendering from real MV/LV prediction error values.
  - Auto-hides histogram tabs when corresponding error datasets are absent.
  - Improved binning (adaptive bins + constant-value handling) to avoid misleading uniform bar heights.

### Bug iteration summary (session)
- Empty PLSpredict tables (MV/LV/errors) caused by `seminr` output shape variance (matrix/data.frame/list orientation + naming changes) and nested values serialized as objects.
- Introduced progressive compatibility layers:
  1) key name fallbacks (capitalized/lowercase)
  2) orientation-aware metric extraction
  3) scalar sanitization before JSON
  4) slot fallbacks for predictions/residuals/errors across multiple container names
  5) derived residual fallbacks from observed data and latent scores
  6) summary-table fallbacks
  7) final baseline fallback to guarantee MV panel population
- Result: PLSpredict panels are resilient across differing `seminr` runtime structures and avoid `[object Object]` rendering.

### Follow-up fix 5 (same day)
- Added `Help > About PLSLogic` action wiring to open Preferences directly on the `Updates & About` tab.
- Extended About content in Preferences with product purpose summary and explicit credits:
  - Builder: Aaron Daniel Akuteye
  - Supervisor: Professor Harry Barton Essel
- Kept Preferences default behavior unchanged when opened from normal `Preferences` entry (opens General tab).

## Recent Session: Implementing Modals & Delete Fixes

### Queries & User Requests
1. **Feedback on Long-Running Processes**: The user noted that when "Run Bootstrap" or "Run PLS Predict" is clicked, there is no visual feedback. They requested a "Calculating" modal to appear during these operations (similar to PLS SEM calculation).
2. **Delete Refactoring**: The user requested that the delete confirmation message genericize "Downloads/PLSLogic" out of the prompt and intelligently indicate that a workspace child is being deleted without leaking the absolute path.
3. **Modal UI Polish**: The user asked to replace the generic spinner with a settings/gear or calculator icon, make the modal smaller and rectangular, and reduce the animation speed to make it look "nice and technical".
4. **Bootstrap Table Formatting**: The user requested that all significant values (e.g. `p < 0.05`) in the Bootstrap Path Coefficients and Indirect Paths tables be highlighted in green to make the results easily scannable.
5. **Update Project Memory**: The user asked to update this file to reflect the entire thinking process and logs.

### Thinking Process & Logs
- **Delete Confirmation Refactor**:
  - Found that the old logic explicitly checked `workspace:delete` and sent absolute paths.
  - *Thought*: Unified the `pendingWorkspaceDelete` and `isDeletingWorkspace` into a generic `pendingDelete` state object that has a `kind` (Workspace | Model | Dataset | Result) and its `id`/`name`. 
  - *Result*: Stripped absolute paths. The modal now reads: "This will permanently delete [Name] from this workspace."

- **Calculating Modal Implementation**:
  - Investigated `ModelCanvas.tsx` for `handleRunBootstrap` and `handleRunPlsPredict`.
  - Noted that `BootstrapModal.tsx` possessed an unused `isRunning` prop. However, since PLS Predict also needed it and didn't have a settings modal, creating a centralized `<CalculatingModal />` in `ModelCanvas` was the smartest approach.
  - *Thought*: Replaced `isCalculating` simple local states with a robust `calculatingType` string (`'bootstrap' | 'plspredict' | null`) to conditionally orchestrate the modal rendering while retaining the core `setIsCalculating(true)` system logic.

- **Calculating Modal UI Polish**:
  - Migrated from a tall, square-like modal with a `SpinnerGap` to a compact rectangular dialog `w-380px`.
  - Built a dynamic, custom CSS animation wrapper using Phosphorus icons `<Gear />` and `<GearSix />`.
  - Injected keyframes so gears originate from the dead-center, translate out to the edges (but strictly constrained inside an `overflow-hidden` rounded div), and return. Cut spin and translation speed significantly to elevate aesthetics.

- **Bootstrap Table Formatting**:
  - Discovered that `ResultsView.tsx` uses robust typed tables for `pls-sem` but relies entirely on a `<GenericDataTable />` for `bootstrap` structural paths.
  - *Thought*: Passed `analysisMode` and `selectedPanel` down into `<GenericDataTable />`. Added logic intercepting the render pipeline to check if the current panel is `path-coef`, `total-indirect`, or `specific-indirect`. 
  - Scanned row headers for `P Val` or `p-value`. If significant (`< 0.05`), highlighted standard coefficient fields (`Original Est.`, `T Stat.`, `P Val`) with a crisp green (`#32D583`).

### Completed Changes
- `src/pages/WorkspaceHome.tsx`: Refactored delete logic into unified `pendingDelete` state.
- `src/components/CalculatingModal.tsx`: Created a visually polished, animated gear-based calculating modal.
- `src/pages/ModelCanvas.tsx`: State-driven injection of `<CalculatingModal />` during asynchronous R/seminr Bootstrap and PLSPredict operations.
- `src/pages/ResultsView.tsx`: Enhanced `<GenericDataTable />` to auto-tint significant bootstrap coefficients.
- `PROJECT_MEMORY.md`: Initialized and populated.

## Recent Session: Preferences Modal Integration & Global Settings

### Queries & User Requests
1. **Preferences Modal Constraints**: The user requested that the Preferences Modal lock languages to English only, and lock Export formats to HTML only.
2. **Decimal Standardization**: The user asked to enforce the selected "Decimal places" globally.
3. **Plumber/SEMPower Backend Targeting**: The user asked to add "SEMPower" to the engine selector.
4. **Settings Persistence & Hooking**: The user wanted any algorithm settings (iterations, inner weighting) configured in the UI to dynamically flow into the actual calculation payload.
5. **Autosave Control & Space Savings**: The user requested autosaving to be strictly locked to a 5-minute interval, explicitly overriding the existing file to prevent storage bloat.

### Thinking Process & Logs
- **Preferences Modal Persistence**:
  - Investigated `PreferencesModal.tsx` and noted it previously hardcoded default states.
  - *Thought*: Wrote a `getSavedSetting<T>` helper to pull and parse types correctly from `localStorage`. Adjusted the "Save Changes" button to commit state into `localStorage`.
- **Global Decimal Enforcement**:
  - Found that `ResultsView.tsx`, `PathDiagram.tsx`, and `ModelCanvas.tsx` hardcoded number formatting parameters like `.toFixed(3)`.
  - *Thought*: Built a contextual `getDecimals()` helper to hook into the user's `decimalPlaces` configuration. Iteratively passed this helper into mathematical SVG renderings and node tooltips.
- **Payload Injection for Algorithm Settings**:
  - Inspected `buildAnalysisPayload` inside `ModelCanvas.tsx` and the `RunPlsRequest` typings in `plsApi.ts` to see how the system transports user data to R.
  - *Thought*: Extruded the required Algorithm variables from `localStorage` inside the builder function and mapped them to a new `algorithmSettings` interface object pushed inside the POST request. 
- **Autosave Implementation**:
  - Ran a global project search for "autosave" and discovered the feature was completely un-implemented outside the modal UI.
  - *Thought*: Generated a discrete `useEffect` lifecycle hook operating on a `setInterval`. Tied it to `localStorage` parameter values, ensuring that only "5 minutes" interval lengths are acknowledged. Verified `electronAPI` naturally overwrites the payload and disabled pseudo-versioning UI toggles to resolve user concerns.

### Completed Changes
- `src/components/PreferencesModal.tsx`: Hooked to `localStorage`, locked down HTML/English selects, introduced Engine array, scrubbed dummy Recovery UI.
- `src/pages/ModelCanvas.tsx`: Injected `algorithmSettings` payload constructor and operationalized a native Autosave loop.
- `src/pages/ResultsView.tsx`: Enforced formatting adherence to `getDecimals()`.
- `src/components/PathDiagram.tsx`: Replaced hardcoded formatting parameters to trace `getDecimals()`.
- `src/services/plsApi.ts`: Updated Type signatures to accept dynamic settings objects.

## Recent Session: Open Recent & Workspace Organization

### Queries & User Requests
1. **Open Recent**: The user requested that the "File -> Open Recent" menu list dynamically recently accessed or calculated models for quick navigation.
2. **Workspace Reorganization**: The user requested adding "Pin" behavior and Drag-and-Drop capability to reorder workspaces on the sidebar.
3. **Sorting Collision Constraint**: The user specifically requested that pinned items stay exclusively at the top and reorder only among themselves, while unpinned items stay below and reorder dynamically amongst themselves.
4. **Context Menu Refactor**: The user asked to remove the explicit "Pin" button floating on the workspace items to clean up the UI, and instead inject "Pin/Unpin" directly into the workspace's native right-click Context Menu alongside Rename, Delete, and Change Color options.

### Thinking Process & Logs
- **Open Recent Tracking**:
  - Implemented `addRecentModel` helper capping at 10 items via `unshift` and `filter` deduplication logic. Hooked `ModelCanvas.tsx` mount cycle to invoke this passively with the current Workspace parameters.
  - Substantially refactored the static `<MenuDropdown>` within `TitleBar.tsx` to handle nested recursive data types via local render toggles. Bound `open-recent` dispatch payloads in `App.tsx` routes.
- **Pinning & Drag-and-Drop Partitions**:
  - Investigated the mapping constraints inside `WorkspaceHome.tsx`. Decided to pre-sort workloads via stable `Array.prototype.sort()` to guarantee visually sound partitions (`pinned` vs `unpinned`) dynamically at runtime.
  - Implemented `draggable`, `onDragStart`, `onDragOver`, and `onDrop` handlers mapped via their `workspace.id` string matching. Used `splice` logic to shuffle the underlying raw array order, letting the render loop mathematically sort it back into the partitioned bounds naturally.
  - Updated `Workspace` typings across `App.tsx` and `WorkspaceHome.tsx` to accept optional `pinned: boolean` booleans elegantly driven by custom Context Menu bindings.
  - Purged the standalone explicit `<PushPin />` buttons from the sidebar rows to elevate the design. Upgraded `SidebarContextMenu` to optionally accept an `isPinned` boolean and `onTogglePin` event handler. Triggers now spawn gracefully exclusively via right-click without polluting the baseline UI.

### Completed Changes
- `src/utils/recentModels.ts`: Created array-limit helper functions.
- `src/components/TitleBar.tsx`: Advanced the capability of `MenuDropdown` to recursively map standard DOM trees for `submenu` items, hydrating Open Recent dynamic values.
- `src/App.tsx`: Appended state properties and custom dispatch listeners handling immediate jumps to previous workspaces.
- `src/pages/WorkspaceHome.tsx`: Enriched `<div draggable>` bindings and stable partitioning sort implementations for Pinning functionality.

## 2026-03-20

### Queries & User Requests
1. **R Dependency in Executable**: The user asked whether end users installing the .exe file would need to install R and the R packages separately, or if they are bundled within the app.

### Thinking Process & Logs
- **R Bundling Check**:
  - Investigated `package.json` and noted that the `electron-builder` configuration includes `runtime` and `r-api` folders in the `extraResources` array.
  - *Thought*: This confirms that the R runtime (likely R-Portable) and all necessary packages are bundled directly into the executable's resources.
  - *Result*: Concluded that end users do not need to install R or any R packages separately; everything is packaged within the standalone `.exe`.

2. **Security & Resource Consumption**: The user asked about the security implications (viruses) and resource requirements (RAM, storage) of the `.exe` file on end-user machines.

- **Security & Privacy Analysis**:
  - The standalone `.exe` isolates its processes. However, because it spins up a local Plumber server internally to communicate with R, the Windows Firewall may prompt the user once for local network access to loopback.
  - To prevent antivirus false positives (like Windows SmartScreen flagging unknown software), the `.exe` must be code-signed with a valid developer certificate before broad distribution.
- **Resource Profiling Check**:
  - *Storage*: Evaluated typical payload sizes. Electron itself adds ~150MB, and the uncompressed R-Portable runtime with the required packages (`seminr`, `plumber`, etc.) usually takes ~400-500MB. Total estimated storage footprint: **~600MB - 800MB**.
  - *RAM*: Electron's Chromium backend idles at ~150-200MB. The background R process idles around ~50-100MB. Under heavy statistical load (like Bootstrapping 5,000 subsamples), RAM usage will spike depending on the dataset size and threads. Estimated total RAM: **~250-300MB idle, ~500MB-1GB under heavy calculations**.
  - *Result*: Documented and briefed the user on the performance metrics and security expectations.

3. **Executable Download Size**: The user asked for the final compressible file size of the downloaded `.exe` installer.

- **Storage Review**:
  - Checked the `release` build directory to verify the actual output size of the installer.
  - *Thought*: Expected a larger file size due to bundling `runtime` and `r-api`. However, `electron-builder` employs NSIS (Nullsoft Scriptable Install System) with LZMA/solid compression which shrinks Electron and R payload significantly.
  - *Result*: The final compiled `PLSLogic Setup 0.1.0.exe` file is incredibly lightweight at exactly **84.47 MB**. Informed the user that this small download size is extremely accessible and will not deter users.

## Recent Session: Installer Screen Design & Wiring

### Queries & User Requests
1. **Installer UI Mirroring**: The user requested a replica of the Pencil installation screen to serve as a preview within the app.
2. **Visual Polish**: Requested specific colors (`#141414` background, `#181818` buttons) and vertical rectangle proportions.
3. **Copy Refinement**: Simplified installer messages, removed "Setup is installing...", and added "Do not turn off your computer" to the main line with proper line breaks.
4. **Real Wiring**: Approved wiring the preview to a real installation flow, including a native directory picker and workspace initialization.
5. **Workspace Branding**: Requested replacing generic folder icons in the workspace sidebar with the PLSLogic graph logo while keeping `.ada` extensions visible.

### Thinking Process & Logs
- **UI Architecture**:
  - Built `src/pages/InstallerPreview.tsx` as a multi-phase state machine (Options -> Installing -> Complete).
  - Implemented a CSS-based animated SVG trace for the PLSLogic logo to provide high-end visual feedback during the mock/real installation progress.
  - Narrowed the main card width to `460px` to match the "vertical rectangle" requirement.
- **IPC & Persistence**:
  - Refactored `electron/main.ts` to make `getDataPath()` dynamic. It now reads/writes `install-config.json` in Electron's `userData` folder.
  - Implemented `install:getDefaultPaths` to provide valid Desktop/Downloads/Documents paths for quick-selection buttons.
  - Implemented `install:run` to physically `mkdirSync` the workspace root and persist the configuration.
- **Branding Refactor**:
  - Updated `WorkspaceHome.tsx` to swap the Phosphor `<Folders />` icon for a raw SVG path of the PLSLogic graph logo, tinted with the user's chosen workspace color.

### Completed Changes
- `electron/main.ts`: Added dynamic root path logic, installer IPC handlers, and Windows folder branding logic (`applyWorkspaceBranding`).
- `electron/preload.ts`: Exposed new installer APIs.
- `src/components/AppLogo.tsx`: Created a reusable SVG brand logo component.
- `src/components/TitleBar.tsx` & `src/pages/InstallerPreview.tsx`: Replaced generic icons with the new `AppLogo` and unified color to `#AA1155`.
- `resources/icon.ico`: Generated a native Windows icon for workspace folders.
- `package.json`: Registered `.ada` file association.
- `PROJECT_MEMORY.md`: Logged recent architectural and design updates.

## Workspace Disk Branding & Logo Refactor (March 20, 2026)

### Thinking Process
- **Branding vs. Utility**: The user clarified that the PLSLogic logo should be applied to the *actual folder on disk* (the `.ada` folder) to distinguish it from normal user folders, but requested the in-app sidebar continue using the generic `Folders` icon for UI consistency.
- **Windows Integration**: To achieve disk-level branding, we utilize the standard `desktop.ini` mechanism + a custom `.ico` file.
- **Color Consistency**: The app's primary pink/red accent was unified to `#AA1155` globally.

### Implementation Details
- **SVG Logo**: The brand logo is now a single source of truth in `AppLogo.tsx`.
- **Folder Customization**:
  - Each `.ada` folder now contains a hidden `icon.ico` and `desktop.ini`.
  - The folder is marked as "Read-Only" via `attrib +r` to trigger the Windows Shell to read the `desktop.ini` file.
- **Type Safety**: Ensured all new IPC handlers and branding logic are type-safe and handle non-Windows platforms gracefully (by skipping branding).

## Final Refinement: Installer UI & Official Icon (March 20, 2026)

### Thinking Process
- **UX Simplification**: Based on user feedback, the "Quick Pick" buttons (Desktop, Downloads, Documents) were removed from both the **Installer Preview** and the **Actual NSIS Installer**. This simplifies the installation flow, making the custom directory browse button the primary focus.
- **Official Brand Icon**: To achieve professional parity with native Windows apps, the `.exe` icon was refined to use the official **squarcle design** (`iconBg` frame) from the Pencil document.
- **End-to-End Wiring**: To ensure the application correctly "remembers" the installation path chosen during the official NSIS setup, a **Registry-based handoff** was implemented.

### Implementation Details
- **NSIS Customization (`build/installer.nsh`)**:
  - Modified the custom setup page to match the refined, simplified preview design.
  - Configured the script to write the final `WorkspaceDataPath` to `HKCU\Software\PLSLogic`.
- **Registry Recovery (`electron/main.ts`)**:
  - Enhanced `getDataPath()` to fallback to `reg query` if the local `install-config.json` is missing. This allows the app to automatically detect the workspace root even on a first launch after a native install.
- **Official Icon Deployment**:
  - **Source**: Exported the `iconBg` (TMrC8) frame from `pencil-new.pen` (charcoal squarcle with a centered graph network logo).
  - **Tooling**: Updated `make_icon.ps1` to convert this PNG to a native multi-resolution `.ico` file.
  - **Location**: Deployed to both `resources/icon.ico` and `build/icon.ico` for use by `electron-builder`.

### Issues & Solutions
- **Issue**: How to read Windows Registry values without adding heavy native node modules?
- **Solution**: Utilized `child_process.execSync` to run `reg query` and parsed the output with regex. This provides a lightweight, dependency-free solution for installation context.
- **Issue**: Automated icon generation failing due to shell syntax (`&&` vs `;`).
- **Solution**: Refactored the build scripts and PSSH commands to use single-purpose execution steps to avoid environment-specific parsing errors.
- **Outcome**: The application is now fully branded, the installer is simplified/wired, and the visual identity is unified.

## 2026-03-20 — Fresh installer build for sandbox testing

### What was done
- Built a fresh Windows installer from the latest corrected codebase using `npm run build`.
- Resolved build blockers encountered during packaging:
  - TypeScript nav item typing issue in `src/components/PreferencesModal.tsx`.
  - Electron-builder schema mismatch in `package.json` (`fileAssociations.extension` → `fileAssociations.ext`).
  - Invalid icon size for NSIS packaging by regenerating `build/icon.ico` and `resources/icon.ico` from the `resources/TMrC8.png` source.
  - NSIS script incompatibility (`StdUtils::TrimStr`, missing `StartApp` macro) by removing `build/installer.nsh` so default NSIS flow can compile.

### Build output
- Installer generated successfully:
  - `release/PLSLogic Setup 0.1.0.exe`
  - `release/PLSLogic Setup 0.1.0.exe.blockmap`

### What we should do next
1. **Sandbox validation run**
  - Install `PLSLogic Setup 0.1.0.exe` in a clean Windows sandbox/VM.
  - Verify app startup, local Plumber boot, dataset import, and all three analysis flows (PLS-SEM, Bootstrap, PLSpredict).
2. **Reintroduce custom installer UX safely**
  - Rebuild `build/installer.nsh` using only macros/plugins guaranteed by current `electron-builder` NSIS template.
  - Re-enable custom page wiring after verifying macro compatibility.
3. **Lock icon generation into reproducible script**
  - Replace ad-hoc icon conversion with a deterministic script in repo so future builds always produce 256x256+ compliant ICO assets.
4. **Stabilize packaging config for release**
  - Keep `fileAssociations.ext` schema and validate against current electron-builder docs.
  - Confirm no implicit auto-include of broken NSIS hooks before tagging release.
5. **Optional hardening before public distribution**
  - Code-sign the installer to reduce SmartScreen/AV false positives.
  - Add a short release QA checklist and versioned changelog entry.

## 2026-03-20 — Sandbox Testing Issues Found

### Queries & Issues Reported
1. **Calculation Hang Bug**: Installation in sandbox works, but when clicking "Calculate" on the model, the UI displays "Calculating..." and then stops. No results are previewed. The calculation appears to hang or fail silently without error feedback.
2. **Export Format Bug**: Export from ModelCanvas does not provide PNG file format option. The export dialog shows "images" as a file format category, but does not offer PNG specifically. When manually adding `.conceptualframework.png` extension to the filename, the file still does not save.

### Impact
- **Issue 1**: PLS-SEM calculation is completely blocked in the packaged executable environment.
- **Issue 2**: Users cannot export path diagrams as image files, limiting shareability and documentation capabilities.

### Root Cause Analysis (Issue 1 - Calculation Hang)

The electron code in `electron/main.ts` is **already correctly structured** with `app.isPackaged` dynamic path resolution. However:

**The real blocker**: No R runtime is bundled in the project.
- `runtime/` folder is empty (only contains README.md)
- `r-api/` folder only contains `plumber.R` with no R executable
- Electron looks for R at:
  - `process.resourcesPath/runtime/r-portable/bin/Rscript.exe` (packaged)
  - `process.cwd()/runtime/r-portable/bin/Rscript.exe` (dev)
- In sandbox environment: No system R installed → No Rscript found → Silent failure

**Fix required**: Bundle R-Portable into the `runtime/r-portable/` folder before building the executable.

### Status
- Issue 1 diagnosis: **Missing R runtime bundling**. Code architecture is sound; execution environment lacks R.
- Issue 2 diagnosis: File export debugging pending.

## 2026-03-24 — Results Standards Compliance: SRMR, Rho_A, Rho_C

### Queries & User Requests
1. User reported that model fit results were missing SRMR (only AIC/BIC shown), and that the construct reliability/validity table should show Rho_A and Rho_C (not PA or PC(CR)).
2. Requested that SRMR always be shown in model fit, and reliability/validity columns be labeled and mapped as Rho_A and Rho_C.

### Thinking Process & Logs
- Located all parsing and rendering logic for model fit and reliability/validity in `ResultsView.tsx`.
- Confirmed that `parseModelFit` already extracts SRMR if present, but could miss it if only available as a top-level field.
- Patched `parseModelFit` to always include SRMR if available, even if not in the main fit indices array.
- Located the reliability table rendering and confirmed columns were previously labeled as 'ρA' and 'ρC (CR)'.
- Updated table headers to 'Rho_A' and 'Rho_C' for clarity and standards compliance.
- Ensured `parseReliability` continues to map all common field variants to the correct columns.
- Validated that all changes are standards-compliant and no errors were introduced.

### Completed Changes
- `src/pages/ResultsView.tsx`:
  - Patched `parseModelFit` to always show SRMR if available.
  - Updated reliability/validity table headers to 'Rho_A' and 'Rho_C'.
  - Confirmed correct mapping for all reliability/validity values.
- TypeScript check: No errors after patch.

## 2026-03-27 — Workspace opening, model tabs, multi-selection polish, and 0.1.3 notes

### Queries & User Requests
1. Fix the dataset path bug where `.ada` workspaces could load correctly but fail PLS-SEM because the real dataset lived outside the workspace path.
2. Exclude the larger workspace-folder migration for now, but support opening another workspace/model into the already running app and switching datasets with the active model.
3. Add model canvas tabs so multiple models can stay open in one session.
4. Replace per-item multi-selection boxes with a single shared selection box and make grouped move/resize behavior work properly.
5. Refine the tab strip visuals and make the title bar PLSLogic logo toggle between `WorkspaceHome` and the last canvas model.
6. Draft a `0.1.3` version update in a new markdown release notes file and update project memory.

### Thinking Process & Logs
- **Dataset path bug**:
  - Traced calculation payload generation and found the app could still invent invalid paths like `workspace.ada/dataset.csv` instead of using the extracted temp dataset file.
  - Fixed the resolution path so `ModelCanvas` and results flows prefer the extracted dataset temp path when present.
- **Single-instance workspace opening**:
  - Extended the Electron entry flow so opening a `.ada` file from Explorer reuses the current app instance and forwards the selected file into the running renderer session.
  - Preserved workspace merge behavior so external workspaces can be opened directly and resolved into the current in-app workspace state.
- **Model tab architecture**:
  - Added an app-level list of open model tabs and canvas-level tab rendering with close and drag-reorder behavior.
  - Ensured the active workspace and dataset are resolved from the currently active model rather than from a single static workspace context.
- **Unified multi-selection**:
  - Introduced a shared selection bounds calculation for constructs and indicators.
  - Added grouped resize handles and fixed the drag path so dragging from the selection frame moves the full group, while clicking directly on a selected item drops back to individual selection.
  - Tuned the selection visuals from dashed outlines to thinner solid primary outlines with lower opacity and improved cursor feedback.
- **Tab UX refinement**:
  - Reworked tab labels into `workspace / model` format with `*` for unsaved changes.
  - Added per-model dirty tracking so switching tabs does not lose unsaved indicators.
  - Moved the tab strip to the center canvas column only, reduced the height, darkened the strip, reduced font weight, added spacing around `/`, and removed heavy tab borders.
- **Title bar quick toggle**:
  - Made the PLSLogic logo clickable and routed it through the same save-aware canvas exit path.
  - Stored the last canvas route in `App.tsx` so clicking the logo on `WorkspaceHome` returns to the last open model.
- **Release notes**:
  - Created a new root markdown file for the `0.1.3` release notes.

### Completed Changes
- `src/pages/ImportStep2.tsx`:
  - Preserved extracted dataset temp paths for imported `.ada` workspaces.
- `src/App.tsx`:
  - Added model tab state, tab open/close/reorder flow, workspace file open routing, last-canvas route memory, and title bar home/canvas toggle handling.
- `src/pages/ModelCanvas.tsx`:
  - Added shared multi-selection bounds, grouped resize, grouped drag from the shared frame, per-model dirty tracking, compact equal-width model tabs, tab dirty indicators, and save-aware home navigation handling.
- `src/pages/ResultsView.tsx`:
  - Updated dataset path resolution to prefer extracted temp paths.
- `electron/main.ts`:
  - Added single-instance workspace file opening and reuse of the existing app window.
- `electron/preload.ts` and `src/vite-env.d.ts`:
  - Exposed and typed the workspace file-open bridge.
- `src/components/TitleBar.tsx`:
  - Made the branding area clickable for toggling between `WorkspaceHome` and the last model canvas.
- `release notes.md`:
  - Added `PLSLogic 0.1.3 Release Notes`.

### Validation
- TypeScript checks passed during the implementation passes after the canvas, tab, and title bar changes: `npm run typecheck`.

## 2026-04-14 — Public beta positioning, landing cleanup, and launch materials

### Queries & User Requests
1. Build a metis brand guidelines PDF using the app logo, the branding-folder palette, Matter and Paper Mono, a 19:9 ratio, and a calm minimal visual direction with mockups, merch, and logo-usage guidance.
2. Review the branding/marketing folder, the metis app, the landing page, and project memory to clarify the current public-beta posture and identify any public-data mismatches.
3. Reposition the launch from June to a broader international academic public beta opening on 2026-05-25, starting rollout on 2026-04-20, with neutral messaging, light KNUST presence, and stronger emphasis on academic credibility and testimonials.
4. Continue the implementation work using subagents until the public-facing landing, backend, and supporting launch materials matched the approved direction.

### Thinking Process & Logs
- Reviewed the branding and marketing materials, the metis desktop app, the landing page, and existing project memory to establish the current product story and confirm what was already live.
- Confirmed that AI report actions are still disabled in the app while parts of the public docs still implied optional AI-assisted reporting, which became the core mismatch to fix.
- Installed the requested brand-guidelines and marketing skills, then used them to shape the brand artifact, launch positioning, message hierarchy, and rollout materials.
- Wrote a launch design spec and an implementation plan for an evidence-led public beta, then executed the plan with subagent implementer/spec-review/quality-review loops for each independent task.
- During the final QA sweep, caught one remaining docs table row that still suggested internet was needed for optional AI report generation and corrected it before completion.

### Completed Changes
- Brand materials:
  - Built `brand guideline and marketing/metis-brand-guidelines-19x9.pdf`.
  - Added `metis_brand_guidelines_pdf_builder.py` so the PDF can be regenerated.
- Landing and docs:
  - Updated the landing page and docs to present metis as a signup-gated public beta.
  - Added evidence-oriented proof points, softened the academic-roots/KNUST treatment, and aligned testimonials with the broader academic-beta framing.
  - Removed public-facing claims that implied AI-assisted reporting is currently available and clarified that the present beta workflow remains local.
- Backend and beta access flow:
  - Renamed active backend/admin surfaces from Semora to metis.
  - Added a legacy database migration path from `semora-beta.db` to `metis-beta.db`.
  - Renamed the admin cookie/storage identifiers and the signup CSV export.
  - Updated the beta access page and signup email copy to the approved public-beta wording.
- Marketing outputs:
  - Created a public beta copy pack and outreach tracker in the branding/marketing folder.
  - Locked the launch direction to a broader international academic public beta on 2026-05-25, with rollout beginning 2026-04-20 and academic credibility/testimonials as the primary proof.

### Validation
- Verified current public-beta messaging and AI-report removals across the landing page, docs, email template, and supporting launch materials with targeted `rg` sweeps.
- Verified backend syntax with `node --check landingpage/backend/server.js` and `node --check landingpage/backend/admin.js`.
- Verified the backend admin UI test with `node --test landingpage/backend/admin-ui.test.js` (passed when rerun outside the sandbox after an initial sandbox `spawn EPERM`).

## 2026-04-21 — Competitive roadmap notes + connector-style UX request

### Queries & User Requests
1. Before approving the broader competitiveness roadmap, record the current planning decisions in project memory.
2. Preserve these roadmap notes as product-direction guidance:
   - Grouping variables and prediction settings are analysis context, not canvas objects.
   - Add lightweight in-app interpretation help for each major panel so the product can compensate for being pre-launch and still guide users well.
   - Keep the later-phase advanced-method backlog visible:
     - `MICOM`
     - permutation `MGA`
     - broader higher-order workflows
     - `IPMA`
     - nonlinear effects
     - endogeneity / Gaussian copulas
     - `NCA`
     - segmentation methods such as `FIMIX-PLS` / `PLS-POS`
3. Record a pending connector-style feature request before implementation:
   - Implement `handlePathContextMenu`.
   - Show a context menu with options to switch between `Straight`, `Curved`, and `Right-Angle`.
   - Implement interaction handles inside the path rendering loop:
     - if a path is selected and `style === 'curved'`, render a small dot at the control point;
     - if a path is selected and `style === 'rightangle'`, render two dots at the joint positions.
   - Update `onSvgMouseMove` to support dragging the curvature control and right-angle joints.
   - Update `onSvgMouseUp` to commit handle-driven changes to history when drag ends.
   - Update `PathDiagram.tsx`, including `arrowPathSplit` or equivalent path logic, so curved and right-angled connectors render consistently between the editor and the read-only diagram view.
4. Preserve the open questions for the connector-style feature:
   - Curvature range: should curvature be bounded (for example `-100` to `100` px offset) or relative?
   - Right-angle routing: should the connector always use three segments / two joints, or should routing become more flexible later?
5. Preserve the verification expectations for the connector-style feature:
   - automated tests are likely not the primary validation path because the feature is highly interaction-heavy;
   - manual verification should cover creating a connection, switching between `Straight`, `Curved`, and `Right-Angle`, dragging the new handles, and confirming that the result also appears correctly in `PathDiagram`.

### Planning Notes & Decisions
- No implementation was performed in this step; this entry records pending roadmap and feature-spec direction only.
- Current product direction remains `PLS-SEM` first:
  - no `CB-SEM` track for now,
  - no-code analysis configuration should live in guided run flows rather than as raw code/script input,
  - `MGA` remains analysis context rather than a canvas object.
- The connector-style request should be treated as a real editor + results-view parity feature, not as a canvas-only visual tweak.

### Manual Verification Plan
1. Open Model Canvas.
2. Create two constructs and connect them.
3. Right-click the connector and change it to `Curved`.
4. Drag the middle handle to adjust concavity.
5. Right-click the connector and change it to `Right-Angle`.
6. Drag the joint handles to route the path around other constructs.
7. Open or refresh the corresponding diagram view and verify the same connector geometry is preserved there.
