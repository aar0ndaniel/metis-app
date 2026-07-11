# Metis Error Feedback Audit Preview

Prepared: July 10, 2026

Purpose: audit the Metis workflow from dataset import to analysis/results, list the likely user issues across Windows and macOS, catalog system/backend errors that can reach users, and draft friendlier feedback that tells users what to do next.

Status: preview copy only. No app code has been changed yet. The next step is for you to edit the wording you want, then we implement the approved messages with tests first.

## Source Areas Reviewed

- `electron/main.ts`: setup, runtime startup, file/workspace IPC, export/open security, R Lite/Bundle handling.
- `electron/preload.ts`: renderer bridge exposure.
- `src/pages/ImportStep1.tsx`: CSV/Excel import, parsing, workspace limits.
- `src/pages/DataView.tsx`: dataset loading, row/column edits, transforms, computed columns, save-as-new.
- `src/pages/ModelCanvas.tsx`: model building, deletion, export, analysis run flows, current layman error translator.
- `src/pages/ResultsView.tsx`: saved result loading, rerun Bootstrap/PLSpredict/Advanced, table/HTML/R export, current error normalization.
- `src/components/BootstrapModal.tsx`, `src/components/PlsPredictModal.tsx`, `src/components/AdvancedAnalysisModal.tsx`: user settings and validation guards.
- `src/components/DatasetManagerModal.tsx`: dataset rename/link/delete behavior.
- `src/results/*`: mediation, moderation, PLSpredict, advanced panel catalog and empty states.
- `src/utils/analysisPrecheck.ts`, `src/utils/plsModelPayload.ts`, `src/utils/datasetLoading.ts`, `src/utils/datasetParsing.ts`, `src/utils/datasetPersistence.ts`.
- `r-api/plumber.R`: backend API routes, R runtime validation, dataset checks, SEMinR/PLSpredict/Bootstrap/Advanced errors.
- `docs/cross-platform-release.md`, runtime verification scripts, and macOS build guidance.

## Exact User Workflow

### 1. First Launch and Setup

Metis starts in either Bundle or Lite mode.

- Bundle mode extracts the packaged R runtime into the app cache. On Windows it expects `R-Portable.zip`. On macOS it expects `R-macos-arm64.tar.gz` or `R-macos-x64.tar.gz`, extracts `R-Bundled`, runs `bin/conda-unpack`, and verifies `bin/Rscript`.
- Lite mode asks the user to choose or auto-detect a local `Rscript` executable, then checks required packages: `seminr`, `seminrExtras`, `plumber`, `semPower`, `readxl`, `jsonlite`, and `Matrix`.
- After setup, the app creates/uses the Metis workspace root and lazy-starts the local Plumber R backend.

Likely user-facing issues:

- R runtime archive missing or wrong for the platform.
- Rscript cannot start.
- Lite user selected `R` instead of `Rscript`.
- Required R packages missing.
- macOS runtime relocation fails because `conda-unpack` is missing or not executable.
- Windows blocks localhost R backend startup through firewall, port exclusion, antivirus, or process policy.
- Workspace root cannot be written due permissions, OneDrive, iCloud/Drive sync, or protected folders.

### 2. Workspace Home

The user creates or opens a workspace, imports a dataset, opens a model, deletes workspace children, or uses the sample dataset.

Likely issues:

- Workspace file cannot be read, is outside approved location, or is locked.
- Legacy `.ada` folders/files are migrated or read differently than `.metisws`.
- Workspace save can fail after a UI change if a file is locked.
- Delete can fail if the target is outside the Metis data directory.

### 3. Dataset Import

The user chooses a CSV/XLS/XLSX file through the import dialog. Metis reads it through the Electron bridge, parses it, previews rows, counts variables/cases/missing values, and persists it into the selected workspace. Each workspace supports up to 3 datasets.

Likely issues:

- Unsupported file type.
- File was not selected through the approved dialog, so security blocks the read.
- CSV delimiter or encoding is wrong, causing shifted columns or unreadable characters.
- Excel sheet is empty or has no data rows.
- Dataset has more than the backend row/column limits.
- Workspace already has 3 datasets.
- Dataset persistence fails because the workspace file is locked or the destination is not approved.

### 4. Data View and Dataset Preparation

The user can inspect a saved dataset, delete rows/columns, transform values, compute derived columns, and save the edited dataset as a new workspace dataset.

Likely issues:

- Dataset cannot be loaded from cache or extracted workspace file.
- Transform is invalid, duplicate, non-numeric where numeric is required, or has no transform rules.
- Computed column uses non-numeric inputs.
- Save-as-new fails because the workspace has 3 datasets or the workspace file is locked.
- Deleting rows/columns is local until saved as a new dataset, so users may expect the original to change.

### 5. Model Canvas

The user builds constructs, assigns indicators, draws structural paths, adds higher-order construct links, adds moderation paths, deletes model items, saves, and exports a model diagram.

Pre-analysis checks before hitting R:

- Dataset file path must exist.
- At least one construct with indicators is required.
- Every included construct must have indicators unless it is a higher-order construct with dimensions.
- At least one valid direct structural path is required.
- Indicator names in the model must exactly match dataset column headers.
- Duplicate indicators are detected as diagnostics, but currently do not block analysis.

Likely issues:

- User creates constructs but does not assign indicators.
- User draws only higher-order measurement links, but no structural path.
- User assigns indicators with renamed or mismatched dataset column names.
- User creates a higher-order construct with no lower-order dimensions.
- User adds moderation but the target path is deleted later.
- User reopens old results after changing the model and sees panels that no longer match the current model.
- Model diagram export fails if the SVG is not available or write target is blocked.

### 6. PLS-SEM Run

Metis builds a payload and calls `/run-pls`. The backend validates JSON, validates dataset access, reads CSV/Excel, builds measurement and structural models in SEMinR, estimates PLS/PLSc, and returns measurement, structural, quality, data, and execution log sections.

Likely issues:

- Local R backend is not ready.
- Dataset path is blocked, missing, too large, unsupported, or missing indicator columns.
- Model is mathematically singular because predictors or indicators are duplicated/constant/collinear.
- R package dependency is missing.
- Analysis exceeds timeout or memory.

### 7. Bootstrap and Mediation

The user opens Bootstrap settings, chooses subsamples, CI settings, sign changes, and advanced iteration settings. Metis calls `/run-bootstrap`.

Bootstrap returns path significance, loading/weight significance, confidence intervals, total effects, total indirect effects, and specific indirect effects. Mediation is not a separate route; mediation significance comes from Bootstrap/indirect effects.

Likely issues:

- Subsamples below backend minimum are clamped to at least 50.
- Too many subsamples can cause timeouts or memory failure.
- Specific indirect effects are empty if the model has no mediation chains.
- Users may expect mediation significance from PLS-SEM alone; the panel already tells them to run Bootstrap.
- Singular models fail more often during Bootstrap because resamples amplify duplicated/collinear predictors.

### 8. Moderation

The user adds a moderation path in the canvas. Metis converts it into an interaction term, adds the moderator main effect when needed, and adds an interaction path to the outcome.

Results panels:

- PLS-SEM moderation summary.
- R2 change for moderation.
- Simple slope analysis and slope plot.
- Bootstrap interaction effects.

Likely issues:

- Moderator and IV/outcome references can become invalid if a target path or construct is deleted.
- Simple slopes need current PLS-SEM results after moderation is added.
- Bootstrap moderation significance needs Bootstrap results, not just base PLS-SEM.
- Single-item moderators use observed levels when possible; multi-item moderators use low/mean/high approximations.

### 9. PLSpredict and CVPAT

The user chooses folds, repetitions, and optional CVPAT. Metis calls `/run-plspredict`.

Likely issues:

- Folds must be 2 to 20; repetitions must be 1 to 50.
- `predict_pls()` can return no prediction for unsupported model shapes.
- Higher-order constructs use a repeated-indicators representation for prediction because SEMinR does not have a published two-stage HOC prediction method.
- CVPAT requires `seminrExtras`; if missing, CVPAT is skipped and the panel shows guidance.
- Prediction error panels can be empty if SEMinR does not expose the expected slots for that model/version.

### 10. Advanced Analysis: IPMA, NCA, cIPMA

The user selects a target construct, all/direct predecessors, IPMA/NCA/cIPMA, NCA run depth, and bottleneck step size. Metis calls `/run-advanced-analysis`.

Front-end guard:

- Target must have eligible predecessors.
- At least one advanced analysis must be selected.

Backend guard:

- `seminrExtras` must be installed.
- Target construct is required and must exist.
- Selected target must have predecessors.
- NCA run depth must be within configured limits.

Likely issues:

- User selects an endogenous target with no predecessor.
- User unchecks all analysis types.
- `seminrExtras` missing.
- IPMA/NCA/cIPMA sub-analysis fails on a pathological model. The route usually logs the failed sub-analysis and still returns whatever other advanced sections succeeded.

### 11. Results, Saving, Exporting, and Deleting

Results can be saved back to the workspace, exported as HTML, exported as R script, copied as R script, copied as tables, exported as Excel tables, and viewed with path diagrams/panels.

Likely issues:

- Results reruns use a thinner error translator than the Model Canvas. Raw backend errors can leak here.
- Saving results fails if no analysis exists, workspace cannot be found, or workspace save fails.
- HTML export can fail if app storage/export path cannot be resolved, write is blocked, or auto-open is blocked.
- R script export can fail if save dialog is cancelled, write target is blocked, or bridge is unavailable.
- Excel/table copy can fail due browser clipboard permissions or generated workbook failure.
- Deleting datasets currently does not consistently check the IPC return value before updating UI.

## Backend and System Error Catalog

The table below uses the current exact error or message pattern, then proposes friendlier user feedback. These drafts intentionally keep a technical detail field available for support, but the main message tells the user what to do.

| Area | Current system/backend error | Friendly feedback draft | User action | Implementation note |
|---|---|---|---|---|
| Backend auth | `metis backend is missing its local authentication token.` | Metis could not securely connect to its local analysis engine. | Restart Metis. If it happens again, reinstall or send diagnostics. | Should rarely be user-visible. Include diagnostic detail only in expanded section. |
| Backend auth | `Forbidden` | Metis blocked a request that did not come from this app session. | Restart Metis. | Treat as security/session mismatch. |
| Backend dataset security | `Dataset access is disabled until trusted metis workspace roots are configured.` | Metis has not been told which workspace folders the analysis engine may read. | Re-run setup or choose a workspace folder inside the Metis data location. | Setup/config problem. |
| Backend dataset security | `Dataset path is outside trusted metis workspace directories.` | The selected dataset is outside the folders Metis is allowed to analyze. | Re-import the dataset into the current workspace. | Keep raw path out of main UI. |
| Payload JSON | `Request body must be a non-empty JSON string.` | Metis sent an incomplete analysis request. | Save the model, restart Metis, and try again. | Indicates bridge/payload bug. |
| Payload JSON | `Request body must be a JSON object.` | Metis sent an analysis request in the wrong format. | Restart Metis and try again. | Indicates frontend/backend contract bug. |
| Runtime package | `Package 'jsonlite' is required by the API runtime.` | The R runtime is missing a required package: jsonlite. | Run setup again or install required R packages in Lite mode. | Setup wizard should point to package install snippet. |
| Runtime package | `Package 'seminr' is not installed in the bundled R runtime.` | The R runtime is missing SEMinR, which Metis needs for PLS-SEM. | Run setup again or install `seminr`. | Bundle should not ship this way. |
| Runtime package | `Package 'readxl' is required to read Excel files.` | Metis cannot read Excel files because the R package `readxl` is missing. | Install `readxl` or import the dataset as CSV. | Applies in backend read path. |
| Runtime package | `Advanced analysis requires seminrExtras in the R backend.` | Advanced analysis needs `seminrExtras`, but it is not installed in the selected R runtime. | Install `seminrExtras`, then rerun Advanced analysis. | Also used for IPMA/NCA/cIPMA. |
| Runtime package | `CVPAT skipped because the R backend does not have seminrExtras installed.` | CVPAT was skipped because `seminrExtras` is missing. | Install `seminrExtras`, then rerun PLSpredict with CVPAT enabled. | Currently appears in execution log. |
| Dataset path | `datasetPath must be a string.` | Metis could not identify the dataset file for this model. | Re-link or re-import the dataset. | Validation bug or stale model. |
| Dataset path | `datasetPath cannot be empty.` | This model is not linked to a dataset file. | Link a dataset from Dataset Manager or import one. | Frontend should prevent before backend. |
| Dataset path | `datasetPath is too long.` | The dataset file path is too long for the analysis engine. | Move the workspace to a shorter folder path and retry. | Windows long path likely. |
| Dataset path | `datasetPath contains unsupported control characters.` | The dataset path contains characters Metis cannot safely use. | Move or rename the file/workspace, then re-import. | Rare filesystem/path issue. |
| Dataset file | `Dataset not found: <path>` | Metis could not find the dataset file linked to this model. | Re-import the dataset or select the correct dataset in Dataset Manager. | Do not expose full path by default. |
| Dataset file | `Dataset file exceeds the <N> MB safety limit.` | This dataset is larger than the current Metis safety limit. | Use a smaller dataset, filter rows/columns, or ask support to raise the limit. | Include configured limit. |
| Dataset file | `Unsupported dataset extension: <ext>` | Metis can analyze CSV or Excel datasets only. | Save the data as CSV, XLS, or XLSX and import again. | Align import and backend extension support. |
| Dataset shape | `Dataset must be tabular.` | The dataset could not be read as a table. | Check that the first sheet/file contains rows and columns. | Backend read returned non-data-frame. |
| Dataset shape | `Dataset must contain at least one row and one column.` | The dataset is empty. | Import a file with a header row and at least one data row. | Match import message `Sheet appears empty`. |
| Dataset shape | `Dataset has <N> rows; the limit is <M>.` | This dataset has more rows than Metis is configured to analyze. | Filter the dataset or raise the configured row limit. | Include current limit and count. |
| Dataset shape | `Dataset has <N> columns; the limit is <M>.` | This dataset has more variables than Metis is configured to analyze. | Remove unused columns or raise the configured column limit. | Include current limit and count. |
| Dataset columns | `Dataset is missing indicator columns: <names>` | Some indicators in the model are not in the dataset. | Check spelling/case, reassign indicators, or re-import the correct dataset. | Show names and offer "open Data View". |
| Numeric limit | `<field> must be a whole number.` | Enter a whole number for this setting. | Replace decimals/text with a whole number. | Applies to bootstrap, folds, repetitions, NCA depth. |
| Numeric limit | `<field> is too large to run on this machine.` | This setting is too large for the analysis engine. | Use a smaller value. | Keep detail in technical section. |
| Numeric limit | `<field> must be at least <N>.` | This setting is below the minimum Metis can run. | Increase the value to at least `<N>`. | Applies to run depths, folds, samples. |
| Numeric limit | `<field> must be between <A> and <B>.` | This setting is outside the allowed range. | Choose a value between `<A>` and `<B>`. | Generic validator. |
| Configured limit | `<field> is above the current app limit of <N>. Lower the value or ask the person who configured this installation to raise the limit.` | This value is above the current Metis limit of `<N>`. | Lower the value or ask an admin to raise the configured limit. | Current text is already close; shorten for UI. |
| Choice validation | `<field> must be one of: <allowed>.` | Metis received an unsupported option for this setting. | Reopen the settings dialog and choose one of the listed options. | Indicates stale UI/state. |
| Array validation | `<field> must be a JSON array.` | Metis received model data in the wrong format. | Save, reopen the model, and try again. | Developer bug if user hits this. |
| Array validation | `<field> must contain at least <N> item(s).` | The model is missing required items. | Add the required constructs, indicators, or paths. | Prefer specific front-end copy. |
| Array validation | `<field> exceeds the maximum of <N> item(s).` | The model is larger than the current Metis limit. | Simplify the model or ask support to raise the configured limit. | Applies constructs/paths/interactions/indicators. |
| Construct validation | `constructs[i] must be an object.` | Metis could not read one construct in the model. | Save a copy of the model and reopen it. | Likely corrupted/stale model state. |
| Construct validation | `constructs[i].name must be a string/cannot be empty/is too long/contains unsupported control characters.` | One construct name is missing or invalid. | Rename the construct with a shorter plain-text name. | Generic scalar-string messages for construct name. |
| Construct validation | `constructs[i].type must be Reflective or Formative.` | One construct has an unsupported measurement type. | Set the construct to Reflective or Formative. | Frontend should prevent. |
| Construct validation | `constructs[i].indicators must contain at least 1 item(s).` | One or more constructs have no indicators. | Assign indicators to every regular construct before analysis. | Model Canvas already maps this well. |
| Construct validation | `constructs[i].indicators exceeds the maximum of <N> item(s).` | One construct has too many indicators for the current limit. | Remove unused indicators or raise the configured limit. | Include construct name if available. |
| Construct validation | `Duplicate construct name: <name>` | Two constructs have the same name. | Rename one construct so every construct has a unique name. | Must be fixed before backend. |
| HOC validation | `constructs[i].higher_order_type must be reflective or formative.` | One higher-order construct has an unsupported type. | Set the higher-order construct to Reflective or Formative. | Frontend should prevent. |
| HOC validation | `constructs[i].dimensions references unknown construct '<name>'.` | A higher-order construct references a lower-order construct that no longer exists. | Reconnect or recreate the lower-order construct. | Can happen after deletion. |
| HOC validation | `constructs[i].dimensions cannot include the HOC itself.` | A higher-order construct cannot use itself as a dimension. | Remove the self-link and use lower-order constructs only. | HOC path role issue. |
| HOC validation | `constructs[i].dimensions cannot reference another higher-order construct.` | Higher-order constructs cannot be nested in the current engine. | Link the HOC to regular lower-order constructs only. | Backend limitation. |
| HOC estimation | `Higher-order construct '<name>' has no lower-order dimensions.` | The higher-order construct `<name>` has no lower-order constructs attached. | Connect it to its lower-order constructs before running analysis. | Specific and actionable. |
| HOC prediction | `Higher-order construct '<name>' has no indicators to predict.` | PLSpredict cannot use `<name>` because its lower-order constructs have no indicators. | Add indicators to the lower-order constructs or remove the HOC from prediction. | PLSpredict repeated-indicator path. |
| Regular construct | `Construct '<name>' has no indicators.` | The construct `<name>` has no indicators. | Add indicators or remove the construct. | Keep construct name. |
| Path validation | `paths[i] must be an object.` | Metis could not read one relationship arrow. | Delete and redraw the affected path. | Likely stale/corrupt path. |
| Path validation | `paths[i].from references unknown construct '<name>'.` | A path starts from a construct that no longer exists. | Delete and redraw the path. | Can happen after deletion. |
| Path validation | `paths[i].to references unknown construct '<name>'.` | A path points to a construct that no longer exists. | Delete and redraw the path. | Can happen after deletion. |
| Interaction validation | `interactions[i] must be an object.` | Metis could not read one moderation effect. | Delete and recreate the moderation path. | Moderation payload issue. |
| Interaction validation | `interactions[i].iv references unknown construct '<name>'.` | A moderation effect references an IV that no longer exists. | Delete and recreate the moderation path. | Include affected name. |
| Interaction validation | `interactions[i].moderator references unknown construct '<name>'.` | A moderation effect references a moderator that no longer exists. | Delete and recreate the moderation path. | Include affected name. |
| Interaction validation | `interactions[i].outcome references unknown construct '<name>'.` | A moderation effect references an outcome that no longer exists. | Delete and recreate the moderation path. | Include affected name. |
| Algorithm settings | `algorithmSettings must be an object.` | Metis received invalid algorithm settings. | Reopen Algorithm Settings and run again. | Should be developer/stale state. |
| Algorithm settings | `algorithm must be one of: standard, consistent.` | Metis received an unsupported PLS algorithm. | Choose Standard PLS or Consistent PLS. | Current validator covers. |
| Bootstrap | `Bootstrap subsamples must be a whole number.` | Bootstrap subsamples must be a whole number. | Enter a whole number, such as 500. | Frontend should normalize. |
| Bootstrap | `Bootstrap subsamples must be at least 50.` | Bootstrap needs at least 50 subsamples. | Use 50 or more; 500 is the default. | Current backend clamps route value later but validator enforces when provided. |
| Bootstrap timeout | `Bootstrap analysis could not finish within <N> seconds...` | Bootstrap took too long for this machine. | Use fewer subsamples, close heavy apps, and try again. | Current backend text is good but should be consistent in ResultsView. |
| Bootstrap memory | `Bootstrap analysis ran out of memory...` | Bootstrap ran out of memory. | Use fewer subsamples, close other apps, or run on a machine with more RAM. | Current backend text is good. |
| PLSpredict settings | `folds must be a whole number/must be at least 2/must be between 2 and <N>.` | PLSpredict folds must be between 2 and the current limit. | Choose a fold count from 2 to 20 unless configured otherwise. | Frontend clamps to 2-20. |
| PLSpredict settings | `repetitions must be a whole number/must be at least 1/must be between 1 and <N>.` | PLSpredict repetitions must be within the current limit. | Choose 1 to 50 repetitions unless configured otherwise. | Frontend clamps to 1-50. |
| PLSpredict | `cvpatEnabled must be true or false.` | Metis received an invalid CVPAT setting. | Reopen PLSpredict settings and try again. | Stale UI/state. |
| PLSpredict unavailable | `PLSpredict could not be computed for this model. seminr returned no prediction...` | PLSpredict is not available for this model shape. | Check the execution log, simplify unsupported model parts, or run PLS-SEM/Bootstrap only. | Currently success with empty panels; keep as friendly log and panel note. |
| PLSpredict HOC note | `PLSpredict used the repeated-indicators representation of higher-order construct(s) ...` | PLSpredict adjusted higher-order constructs for prediction compatibility. | No action needed unless results look unexpected. | Informational, not an error. |
| Advanced settings | `targetConstruct references unknown construct '<name>'.` | The selected advanced-analysis target no longer exists. | Choose a current target construct and rerun. | Can happen after model edit. |
| Advanced settings | `predecessorScope must be one of: all, direct.` | Metis received an unsupported predecessor setting. | Reopen Advanced analysis and choose All or Direct. | Frontend should prevent. |
| Advanced settings | `Select at least one advanced analysis.` | Choose at least one advanced analysis to run. | Check IPMA, NCA, or cIPMA. | Same backend/frontend copy. |
| Advanced settings | `analyses must be an object.` | Metis could not read the advanced-analysis selection. | Reopen Advanced analysis and try again. | Stale UI/state. |
| Advanced settings | `analyses.ipma/nca/cipma must be true or false.` | One advanced-analysis option is invalid. | Reopen Advanced analysis and choose the analyses again. | Stale UI/state. |
| Advanced settings | `NCA run depth must be a whole number/must be at least 10/above current app limit.` | NCA run depth is outside the allowed range. | Use 10 or more, and stay under the configured limit. | Include exact limit. |
| Advanced settings | `bottleneckStepSize must be between 1 and 50.` | Bottleneck step size must be between 1 and 50 percent. | Choose 5, 10, or 20 percent from the dialog. | UI offers 5/10/20. |
| Advanced settings | `postHocAlpha must be a number between 0 and 1.` | Post-hoc alpha must be a probability between 0 and 1. | Use a value such as 0.05. | Advanced/post-hoc field. |
| Advanced settings | `postHocEffect must be a positive number.` | Post-hoc effect size must be greater than zero. | Enter a positive value. | Advanced/post-hoc field. |
| Advanced target | `targetConstruct is required for advanced analysis.` | Choose a target construct before running Advanced analysis. | Select an endogenous target. | Frontend usually auto-selects. |
| Advanced target | `Selected target '<target>' has no predecessors in the current model.` | The selected target has no incoming predictors. | Pick a target with incoming paths, or add paths to the model. | Good existing concept, make friendlier. |
| Advanced sub-analysis | `IPMA could not be computed for target '<target>': <detail>` | IPMA could not be computed for this target. | Check the execution log, then try a simpler target/model. | Should remain as execution log, not full-route failure. |
| Advanced sub-analysis | `NCA could not be computed for target '<target>': <detail>` | NCA could not be computed for this target. | Reduce NCA run depth or check model/data quality. | Include detail in log. |
| Advanced sub-analysis | `cIPMA could not be computed for target '<target>': <detail>` | cIPMA could not be computed for this target. | Try IPMA/NCA separately or simplify the model. | Include detail in log. |
| Singular data | `dgesv`, `exactly singular`, `singular matrix`, `computationally singular` | The model cannot be estimated because some indicators or predictors are duplicated, constant, or perfectly collinear. | Check duplicate columns, constant columns, duplicate indicators, and predictors that move together. | Current backend copy is good; reuse everywhere. |
| Timeout | `elapsed time limit` | This analysis took too long for the current machine/settings. | Use fewer bootstrap subsamples or a smaller NCA run depth, close heavy apps, and rerun. | Current backend formatter already maps this. |
| Memory | `cannot allocate vector`, `memory exhausted`, `cannot allocate memory` | This analysis ran out of memory. | Use a smaller run, close heavy apps, or use a machine with more RAM. | Current backend formatter already maps this. |

## Desktop, File, and Workspace Error Catalog

| Area | Current system error | Friendly feedback draft | User action | Implementation note |
|---|---|---|---|---|
| File read security | `Renderer file read blocked: path was not selected through an approved import dialog.` | Metis can only read files selected through the import dialog. | Use Import Dataset again and choose the file from the dialog. | Security policy is correct; copy should not sound like a bug. |
| File read type | `Renderer file read blocked: unsupported file type.` | This file type is not supported for import. | Use CSV, XLS, or XLSX. | R scripts allowed only for R script import/read. |
| File write security | `Renderer file write blocked: target path is outside approved export/workspace locations.` | Metis cannot write to that location. | Choose the export dialog or save inside the workspace/export folder. | Keep as security block. |
| File write type | `Renderer file write blocked: unsupported file type.` | Metis cannot export that file type. | Export as HTML, R, SVG, PNG, or XLSX where available. | Match actual allowed types by flow. |
| Open path security | `Renderer open request blocked: target path was not created through an approved export flow.` | Metis saved the file but cannot auto-open this path. | Open the export folder manually. | Use warning, not failure, if file was saved. |
| Open path type | `Renderer open request blocked: unsupported file type.` | Metis cannot auto-open that file type. | Open the file from your file manager. | Low severity. |
| Workspace path | `Workspace path is required.` | Choose a workspace file before continuing. | Open or create a workspace. | Context-specific. |
| Workspace path | `Workspace path must point to a .metisws workspace file or legacy .ada workspace.` | This is not a Metis workspace file. | Choose a `.metisws` workspace file. | Mention legacy `.ada` only in technical detail. |
| Workspace path | `Workspace path is not approved for this action.` | Metis is not allowed to use that workspace location yet. | Open the workspace through the file picker first. | Security policy. |
| Workspace save | `Workspace save target must be a .metisws file, not a directory.` | Metis expected a workspace file, but found a folder. | Save as a new `.metisws` workspace. | Legacy folder conflict. |
| Workspace open | `Workspace file not found.` | Metis could not find that workspace file. | Check whether it was moved, renamed, deleted, or synced away. | Common sync/cloud issue. |
| Workspace open | `Could not read workspace file.` | Metis could not read this workspace. | Try opening a backup or create a new workspace. | May indicate corrupt zip/json. |
| Workspace save | `Permission Denied. Please ensure no other app (or OneDrive) is locking this location.` | Metis cannot write to this workspace because another app or sync tool is locking it. | Close Excel/OneDrive preview/sync activity, or move the workspace to a local folder. | Current text is good; adapt tone. |
| Workspace save | `File Locked: <detail>. Please close any other apps using this file.` | The workspace is locked by another app. | Close other apps using the workspace and try again. | Keep detail expandable. |
| Workspace delete | `Workspace name or path is required for deletion.` | Metis could not identify which workspace to delete. | Reopen Workspace Home and try again. | UI state bug. |
| Workspace delete | `Refusing to delete path outside metis data directory.` | Metis will not delete files outside its managed workspace folder. | Delete that file manually from your file manager if intended. | Security protection. |
| Child delete | `childId is required.` | Metis could not identify the item to delete. | Reopen the workspace and try again. | UI state bug. |
| Child delete | `workspacePath or workspaceName is required.` | Metis could not identify the workspace to update. | Reopen the workspace and try again. | UI state bug. |
| Child delete | `Refusing to modify path outside metis data directory.` | Metis will not modify a workspace outside its approved data folder. | Open the workspace through Metis first. | Security policy. |
| Child delete | `workspace.json not found in ZIP archive.` | This workspace file is missing its manifest. | Restore from backup or create a new workspace. | Corrupt `.metisws`. |
| Dataset ID | `Dataset id is required.` | Metis could not identify the dataset. | Re-import or select the dataset again. | UI state bug. |
| Dataset ID | `Dataset id contains unsupported characters.` | This dataset has an invalid internal ID. | Re-import the dataset. | Should be rare. |
| Sample data | `Packaged sample dataset was not found.` | The sample dataset is missing from this installation. | Reinstall Metis or use your own dataset. | Packaging issue. |
| Sample data | `Sample dataset appears empty.` | The packaged sample dataset is empty. | Reinstall Metis or use your own dataset. | Packaging issue. |
| Import persist | `Missing paths! Original: ..., Workspace: ..., Dataset: ...` | Metis could not complete the dataset import because required file information was missing. | Reopen the workspace and import again. | Hide path details by default. |
| Import persist | `Copy to workspace blocked: source file was not selected through an approved import dialog.` | Metis can only copy datasets selected through Import Dataset. | Re-import using the file dialog. | Security policy. |
| Import persist | `Copy to workspace blocked: unsupported dataset type.` | This dataset type cannot be saved into a workspace. | Use CSV, XLS, or XLSX. | Same as import type. |
| Import persist | `Copy to workspace blocked: destination must be an approved metis workspace.` | Metis cannot save this dataset into the selected workspace location. | Create/open a workspace through Metis, then import again. | Security policy. |
| Import persist | `Source file does not exist: <path>` | The selected dataset file is no longer available. | Check if the file was moved/deleted, then choose it again. | Cloud sync/removable drive likely. |
| Dataset save | `workspacePath, datasetId, and base64Data are required.` | Metis could not save the dataset because required information was missing. | Reopen the workspace and try again. | UI/state bug. |
| Dataset save | `Dataset save blocked: destination must be an approved metis workspace.` | Metis cannot save this edited dataset into the selected workspace. | Open the workspace through Metis and try again. | Security policy. |
| Sample save | `Sample dataset save blocked: destination must be an approved metis workspace.` | Metis cannot add the sample dataset to this workspace location. | Open or create a workspace through Metis first. | Security policy. |
| Workspace extract | `Dataset file not found in legacy workspace.` | Metis could not find the dataset stored in this legacy workspace. | Re-import the dataset into the workspace. | Legacy `.ada` path. |
| Workspace extract | `No dataset found in this workspace.` | This workspace does not have an available dataset. | Import or choose a dataset before analysis. | Friendly enough. |
| Workspace extract | `No embedded dataset in this workspace.` | This workspace has no embedded dataset to load. | Import the dataset again. | Legacy/corrupt workspace. |
| Archive security | `Security Error: Directory traversal detected...` | Metis blocked an unsafe workspace/archive path. | Do not use this workspace file; restore from a trusted backup. | Security event. |
| Archive security | `Blocked unsafe archive path: <entry>` | Metis blocked an unsafe runtime archive entry. | Use a trusted Metis installer/runtime archive. | Build/package issue. |
| R setup | `rootPath is required.` | Choose where Metis should store workspaces. | Pick a local folder and run setup again. | Setup wizard. |
| R setup | `Permission denied. Choose a different folder or run as administrator.` | Metis cannot write to that setup folder. | Choose a local user folder such as Documents, or run with permission. | Windows/macOS permissions. |
| R Lite | `No Rscript path was provided.` | Choose the Rscript executable. | Select `Rscript`, not `R`. | Lite setup. |
| R Lite | `Selected executable must be Rscript.` | The selected file is not Rscript. | Choose `Rscript.exe` on Windows or `Rscript` on macOS. | Good direct copy. |
| R Lite | `Selected Rscript executable was not found.` | Metis could not find the selected Rscript. | Reinstall R or choose the current Rscript path. | PATH moved. |
| R Lite | `Selected Rscript path is not a file.` | The selected Rscript path points to a folder. | Select the Rscript executable file. | Lite setup. |
| R Lite | `Unable to run the selected Rscript executable.` | Metis found Rscript but could not run it. | Check R installation permissions, then choose Rscript again. | Include probe error in details. |
| R package check | `Timed out while checking R packages.` | R took too long to verify packages. | Close other apps, check R startup scripts, and retry. | `.Rprofile` could hang. |
| R package check | `Rscript exited with code <code>` | R stopped while Metis was checking packages. | Open the details, fix the R error, then re-verify. | Keep stderr. |
| R package check | `Could not parse R package check output.` | Metis could not understand R's package-check response. | Check for startup messages in `.Rprofile`, then re-verify. | Common cause: Rprofile printing extra text. |
| Bundle runtime | `Bundled R runtime is missing relocation helper: <conda-unpack>` | The bundled macOS/Linux R runtime is incomplete. | Reinstall the correct Bundle build. | mac/Linux only. |
| Bundle runtime | `Bundled R archive was not found at <path>. Add the platform runtime archive before running the Bundle installer.` | This Bundle build is missing its packaged R runtime. | Use a complete Bundle installer for this platform. | Build/release issue. |
| Bundle runtime | `Bundled R archive extracted, but Rscript was not found at <path>` | Metis unpacked R but could not find Rscript inside it. | Reinstall the correct Bundle build. | Archive layout issue. |
| Bundle runtime | `Bundled R runtime could not start from <path>. <detail>` | Metis found the bundled R runtime but it would not start. | Reinstall Metis. If it persists, send diagnostics. | Include detail in support section. |
| Backend not ready | `PLS backend is not ready. <hint>` | The analysis engine is still starting or failed to start. | Wait a few seconds and retry. If it persists, run setup or restart Metis. | Hint differs for Bundle/Lite/Windows. |
| Backend stopped | `The R analysis engine stopped responding before it could return results...` | The analysis engine stopped during the run. | Use fewer samples, close heavy apps, restart Metis, and run again. | Current copy is good. |
| Backend response read | `The R analysis engine started the response but Metis could not finish receiving it...` | Metis lost the result while receiving it from R. | Use a smaller run, restart Metis, and retry. | Current copy is good. |
| Backend 404 | `404 - Resource Not Found (<pathname>)` | Metis called an analysis route that the backend does not have. | Restart Metis. | Developer/build mismatch. |
| HTTP fallback | `Cannot reach local PLS backend at <url>.` | Metis cannot connect to the local analysis engine. | Restart Metis. On Windows, check firewall/port blocking. | Use central translator. |
| Bridge missing | `Electron bridge unavailable for <action>. Preload may not be loaded...` | Metis could not reach the desktop bridge for this action. | Restart Metis. | Developer/runtime issue. |

## Current User-Friendly Coverage Already Present

- Model Canvas already maps common raw failures into better messages for missing indicators, missing paths, missing dataset/columns, backend stopped, network, R runtime, and singular data.
- Backend already maps timeouts, memory failures, and singular-matrix failures into readable messages.
- Result panels already have useful empty states for mediation paths, formative weights, moderation, CVPAT missing `seminrExtras`, prediction histograms, and advanced-analysis sections not run.
- Advanced Analysis modal blocks runs when no target predecessor exists or no analysis type is selected.
- PLSpredict settings clamp folds/repetitions in the UI.

## Gaps to Fix

1. Results rerun path does not use the same rich layman translator as Model Canvas.

Bootstrap, PLSpredict, and Advanced analysis launched from saved Results call `normalizeAnalysisFailureMessage`, which only handles stopped/backend network errors. Many backend validation/R errors can still show raw text.

2. Dataset Manager optimistic updates do not verify delete/save failures.

`deleteDatasetIds`, rename, and link operations update state and display success without consistently checking IPC/save success. A user can think a dataset was deleted or linked, then see it return after reload.

3. Backend errors have no stable error codes.

The frontend is matching strings. It works for known messages, but it is brittle and hard to localize or explain consistently.

4. Import/Data View errors need one central copy layer.

Parsing and persistence errors are currently clear enough in some places, raw in others. Users need consistent "what happened / what to do" structure.

5. Runtime setup messages need platform-specific action buttons.

Windows should emphasize Rscript, firewall/port, OneDrive/Defender locks. macOS should emphasize correct architecture, Gatekeeper/notarization, `conda-unpack`, executable bits, and choosing `Rscript`.

6. Heavy analysis errors need setting-specific recovery.

Bootstrap should suggest fewer subsamples. NCA should suggest lower run depth. PLSpredict should suggest fewer folds/repetitions or disabling CVPAT. The backend has a generic timeout string but the UI can make it contextual.

## Windows Issues and Solutions

| Issue | What user sees | Likely cause | Suggested solution |
|---|---|---|---|
| Rscript not found in Lite | Setup cannot find Rscript | R not installed, unusual install path, PATH missing | Install R, choose `Rscript.exe`, then re-verify packages. |
| Wrong executable selected | `Selected executable must be Rscript.` | User selected `R.exe` or folder | Choose `Rscript.exe`, usually under `R\R-x.y.z\bin\x64`. |
| Missing R packages | Package check lists missing packages | Fresh R install | Show copyable install command for required packages. |
| Local backend cannot connect | `Cannot reach local PLS backend` or backend not ready | Firewall, port exclusion, antivirus, corporate policy | Restart Metis; allow localhost `127.0.0.1`; use another allowed port if configured. |
| Workspace locked | Permission/file locked errors | OneDrive, Defender, Excel preview, Explorer sync | Close apps, pause sync, move workspace to a local unsynced folder. |
| Bundle extraction blocked | Bundled R missing/cannot start | Antivirus quarantine or partial extraction | Reinstall Bundle; allow Metis cache/runtime folder. |
| Long path problems | Path too long or file missing | Deep OneDrive/Desktop folders | Move workspace near `Documents\Metis` or another shorter local path. |
| Protected folder write failure | Permission denied | Program Files, admin-only folder, controlled folder access | Choose a user-writable folder. |

## macOS Issues and Solutions

| Issue | What user sees | Likely cause | Suggested solution |
|---|---|---|---|
| Wrong Bundle architecture | Bundled R cannot start | arm64 app has x64 runtime archive or reverse | Install the Bundle matching Apple Silicon or Intel architecture. |
| macOS too old for runtime | Bundled R cannot start | Bundle runtime built for macOS 13.3+ Accelerate stack | Upgrade macOS or use Lite with a compatible R install. |
| `conda-unpack` missing | Missing relocation helper | Runtime archive layout is incomplete | Use a complete macOS Bundle installer. |
| Runtime not executable | Bundled R cannot start | Archive lost executable bits or quarantine | Reinstall signed/notarized build; release pipeline must preserve executable bits. |
| Gatekeeper/quarantine | App or R helper blocked | Unsigned/unnotarized build or downloaded archive quarantine | Use notarized installer; if internal build, remove quarantine per release instructions. |
| Lite Rscript not found | Setup cannot find Rscript | R installed outside standard locations | Choose `/Library/Frameworks/R.framework/Resources/bin/Rscript`, `/opt/homebrew/bin/Rscript`, or `/usr/local/bin/Rscript`. |
| User selects `R` not `Rscript` | Selected executable error | Wrong binary | Choose `Rscript`. |
| Workspace permission failure | Cannot save/open/export | Documents/Desktop/iCloud permission or file provider lock | Choose a local folder Metis can write to; grant file access if prompted. |

## Implementation Plan

### Phase 1: Tests First

- Add tests for a central analysis error translator covering backend auth, dataset, model validation, R package, timeout, memory, singular, Bootstrap, PLSpredict, CVPAT, Advanced, and workspace security errors.
- Add a static/behavioral test proving ResultsView uses the same translator as ModelCanvas.
- Add Dataset Manager tests showing delete/rename/link failures do not display success or mutate state permanently.
- Add setup/runtime message tests for Windows Lite, Bundle not ready, macOS Bundle relocation, and package-check failures.
- Add panel/empty-state regression tests only where copy changes affect mediation, moderation, PLSpredict, IPMA/NCA/cIPMA messages.

### Phase 2: Centralize Error Copy

- Create `src/utils/userFriendlyErrors.ts` or similar.
- Export functions for analysis errors, dataset/import errors, workspace/file errors, and setup/runtime errors.
- Return structured output: title, message, action, severity, technicalDetail.
- Replace duplicated translators in ModelCanvas and ResultsView.
- Keep technical details expandable in diagnostics, not in the primary toast.

### Phase 3: Backend Contract Improvement

- Keep current string messages for backward compatibility.
- Add optional `errorCode`, `errorCategory`, and `userAction` fields to failed backend responses.
- Use codes such as `DATASET_MISSING_COLUMNS`, `MODEL_NO_INDICATORS`, `MODEL_SINGULAR`, `R_PACKAGE_MISSING`, `ANALYSIS_TIMEOUT`, `ANALYSIS_MEMORY`, `ADVANCED_TARGET_NO_PREDECESSORS`, `PLSPREDICT_UNSUPPORTED_MODEL`.
- Update frontend translator to prefer codes and fall back to string matching.

### Phase 4: Workflow Fixes

- ResultsView: use the central translator for Bootstrap, PLSpredict, and Advanced reruns.
- DatasetManagerModal: check return values from `deleteWorkspaceChild` and `saveWorkspace`; show failure and avoid success toast on failure.
- Import/DataView: map parser and persistence failures into specific guidance.
- SetupWizard: present platform-specific recovery steps and keep raw R stderr in diagnostics.
- Export flows: distinguish "file saved but could not open" from "file could not be saved".

### Phase 5: Cross-Platform QA

- Windows Bundle: first setup, runtime extraction, PLS-SEM, Bootstrap, PLSpredict, Advanced, HTML/R/Excel export.
- Windows Lite: auto-detect Rscript, choose Rscript manually, missing package flow, blocked localhost recovery.
- macOS arm64 Bundle: correct archive, relocation, notarized app, first run, all analysis modes.
- macOS x64 Bundle: correct archive and runtime startup.
- macOS Lite: common Rscript locations and package check.
- Shared workflow: import CSV/XLSX, invalid file type, empty sheet, missing indicator columns, singular dataset, workspace lock, dataset delete failure, old results after model edit.

## Suggested Copy Pattern

Use this structure for toasts and modal errors:

- Title: short and specific, for example `Dataset columns do not match`.
- Message: one plain-language sentence, for example `Some indicators in the model are not present in the linked dataset.`
- Action: one next step, for example `Check spelling/case or re-import the correct dataset.`
- Details: optional support-only text, for example `Backend detail: Dataset is missing indicator columns: ATT1, ATT2`.

## Priority List

1. Reuse the stronger Model Canvas analysis translator in ResultsView.
2. Add stable backend error codes for common analysis failures.
3. Fix Dataset Manager optimistic delete/rename/link behavior.
4. Add platform-specific setup/runtime guidance for Windows and macOS.
5. Improve import/DataView persistence and parse messages.
6. Make heavy-run recovery contextual by analysis type.
7. Request code review before merging the implementation branch.

