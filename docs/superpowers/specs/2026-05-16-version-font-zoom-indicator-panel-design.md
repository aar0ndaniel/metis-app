# Version, Font Size, Zoom, and Indicator Panel Design

**Date:** 2026-05-16  
**Product area:** metis desktop shell and model canvas  
**Scope:** Update visible/app versioning to `0.0.1`, add restart-applied font sizing, move canvas zoom controls closer to the canvas, and add a compact collapsible indicator panel.

## Goals

- Replace public-beta version labels and app package metadata with `0.0.1`.
- Let users choose an app font size in Preferences while making it clear that the change appears after restart.
- Keep model-canvas zoom controls visible near the canvas/right-panel boundary instead of hiding them inside the Tools tab, with visibility controlled from the title bar View menu.
- Let users collapse the left dataset/indicator panel into a compact dataset card, matching the provided reference: dataset identity remains visible, but the full indicator list is hidden.
- Rename the title bar View menu's left panel label from Variables Panel to Indicators Panel.
- Reduce floating panel and zoom-control shadows in dark and light themes.

## Out of Scope

- Live font scaling while the app is running.
- Reworking all typography tokens or redesigning the app theme.
- Changing canvas zoom behavior, keyboard shortcuts, or fit/reset math beyond relocating the controls.
- Collapsing workspace home sidebars or results sidebars.

## Version Update

The app should use `0.0.1` consistently in project metadata and visible UI.

Implementation targets:

- `package.json` version metadata.
- Splash/version label in Electron startup UI.
- Preferences preview and version/about surfaces.
- Branding constants that read the package version through Vite defines.

Historical project-memory entries that mention older releases stay as historical logs.

## Font Size Preference

Preferences gains an app font-size control under Appearance.

Supported options:

- `Small`
- `Default`
- `Large`
- `Extra Large`

The chosen option is stored in localStorage under `metis:prefs:fontScale`. The running app should not hot-apply the setting from the modal. Instead, `App` reads the saved value during startup and applies a document-level `data-font-scale` attribute.

Preferences copy must make the restart behavior explicit: font-size changes apply after restarting metis.

CSS should scale the main app gently through root-level variables so the layout remains stable. The first pass should target general app surfaces and avoid forcing SVG chart labels or exported reports to change.

The font-size selector opens upward so the options stay visible at the bottom of the Preferences modal without forcing extra scrolling.

## Canvas Zoom Relocation

Zoom controls should be moved out of the right Tools tab into a floating canvas control near the right panel.

Required control:

- Zoom out icon button.
- Current percentage label.
- Zoom in icon button.

Placement:

- Absolute/floating inside the model canvas viewport.
- Bottom-right of the model canvas viewport.
- The zoom control shares the same bottom baseline as the main canvas toolbar but remains a smaller, compact pill.
- Visually close to the right panel, with enough offset that it does not overlap the panel collapse handle or canvas content controls.
- Visible by default, with a checked `Zoom Control` toggle in the title bar View menu.

The existing keyboard shortcuts and wheel/pinch zoom behavior remain unchanged.

The title bar View menu keeps the existing Zoom In, Zoom Out, and Fit to Screen commands. The new visibility toggle belongs in View alongside Indicators Panel and Properties Panel.

## Collapsible Indicator Panel

The left dataset/indicator panel gains a collapsed state separate from the full indicator-list state.

Expanded state:

- Current behavior remains: dataset header at the top, variable search/list below, drag indicators onto constructs.
- Clicking the dataset header/card collapses the panel.

Collapsed state:

- The panel becomes a compact dataset card near the upper-left canvas area rather than a full-height vertical rail.
- It should show:
  - a dataset/icon image or database-style icon,
  - dataset name,
  - existing open/change controls when a dataset is linked,
  - a clear empty/no-dataset state when none is linked.
- Clicking the dataset card expands the full indicator panel.
- The collapsed card should preserve the existing visual language: dark floating surface, subtle border, compact rounded controls, and no tall vertical sidebar.

The collapse state can live in `ModelCanvas` local state for now. Persistence across app restarts is optional and not required for this pass.

## Files Expected To Change

- `package.json`
- `electron/main.ts`
- `src/components/PreferencesModal.tsx`
- `src/App.tsx`
- `src/index.css`
- `src/pages/ModelCanvas.tsx`
- Existing static tests, or new focused tests under `tests/`, for the version label and new UI behavior where practical.

## Verification Plan

- Run `npm run typecheck`.
- Run focused static tests for branding/version/preferences/canvas if available.
- Run the existing relevant tests:
  - `tests/brandingStatic.test.mjs`
  - `tests/modelCanvasUiLayout.test.mjs`
  - any preferences/theme tests found during implementation.
- Manually inspect the code paths for:
  - `0.0.1` replacing visible public-beta labels,
  - font size preference stored but applied only from startup,
  - zoom controls present outside Tools tab,
  - collapsed indicator panel represented as a compact dataset card.
