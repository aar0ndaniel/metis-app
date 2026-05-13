# metis 0.1.3 Release Notes

## Bug Fixes
- Fixed `.ada` workspace imports so extracted dataset files are resolved correctly during PLS-SEM calculations, even when the source dataset lives outside the workspace location.
- Fixed multi-selection drag behavior on the model canvas so dragging from the shared selection area moves the whole selection instead of accidentally selecting a single construct or indicator.
- Fixed canvas switching behavior so the active dataset context follows the active model tab when moving between models from different workspaces.
- Fixed title bar home navigation so returning from the canvas still respects the unsaved-changes flow.

## Improvements
- Refined the unified multi-selection frame with a lighter solid primary outline, cleaner resize handles, and more predictable cursor behavior.
- Improved model tab labels to show `workspace / model` clearly, with `*` for unsaved work and automatic removal after saving.
- Added per-model dirty-state tracking so unsaved indicators remain accurate when switching between open tabs.
- Polished the model tab strip to fit the working canvas area only, with compact sizing and better visual separation from the side panels and title bar.

## New Features
- Added single-instance `.ada` workspace opening so opening a workspace from File Explorer reuses the existing metis window instead of launching a second working session.
- Added multi-model tabs in the model canvas, including open, close, drag-to-reorder, and same-session switching between models.
- Added shared multi-selection resize handles for grouped constructs and indicators on the model canvas.
- Added clickable title bar branding so the metis logo can toggle between `WorkspaceHome` and the last model canvas you were working on.

## Notes
- Model tabs now share the available canvas tab space evenly based on how many models are open.
- Dataset display in the variables panel now updates automatically with the active model tab.
