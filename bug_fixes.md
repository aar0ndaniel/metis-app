# Bug Fixes

## 2026-06-24

### Dataset import target, ModelCanvas indicators, and Dataset Manager delete

Status: Fixed

Symptoms:
- Importing a dataset could report that the workspace dataset limit was reached even when the active workspace was not full.
- Dataset imports could target the first workspace in the Metis folder instead of the active workspace.
- ModelCanvas could have a linked dataset while the indicator list was empty.
- Dataset Manager delete was available through the context menu and multi-select, but not as a visible single-selection action.

Root cause:
- Several import actions looked up only a direct workspace id even though the active id could be a child id, such as a model or dataset.
- WorkspaceHome dataset-manager browse actions did not pass explicit workspace identity into the import picker.
- ModelCanvas needed cached or hydrated dataset headers when the workspace child did not have headers.

Fix:
- Added workspace action resolution that maps child ids back to their owning workspace.
- Passed the selected workspace id, name, and path into Dataset Manager browse imports.
- Kept the Dataset Manager active context on the owning workspace when opened from a dataset.
- Exposed the existing selected-dataset delete action for one selected dataset as well as multiple selected datasets.
- Preserved the existing ModelCanvas dataset-header hydration path.

Verification:
- `node --test tests\workspaceActiveImportTargetStatic.test.mjs tests\modelCanvasDatasetHeaders.test.mjs tests\datasetManagerDeleteStatic.test.mjs tests\workspaceHomeSidebarStatic.test.mjs`
- `npm run typecheck`

### Title-bar app icon returns to the wrong workspace from ModelCanvas

Status: Fixed

Symptoms:
- Clicking the app icon in the title bar from ModelCanvas returned to Workspace Home, but could show a predefined or fallback workspace instead of the workspace folder that owned the model being edited.

Root cause:
- The title-bar app icon dispatched `canvas:go-home`, and ModelCanvas handled that action with direct `navigate('/')` calls.
- Because App was bypassed, the return path did not explicitly restore the current model's owning workspace before rendering Workspace Home.

Fix:
- Added an App-owned `returnToWorkspaceHome` callback that resolves the preferred workspace, current canvas model, or active id to an owning workspace before navigating home.
- Passed that callback into ModelCanvas.
- Routed ModelCanvas home exits through the callback, including clean exits and Save/Discard from the unsaved-changes dialog.

Verification:
- `node --test tests\titleBarWorkspaceHomeTargetStatic.test.mjs`
