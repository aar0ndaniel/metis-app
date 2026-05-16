# Version, Font Size, Zoom, and Indicator Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change metis to version `0.0.1`, add restart-applied app font sizing, move canvas zoom controls into the canvas, and collapse the left indicator panel into a compact dataset card.

**Architecture:** Keep the changes in existing shell and canvas files. Preferences persists a font-size choice to localStorage, App applies it at startup through a root data attribute, TitleBar exposes canvas visibility toggles in the View menu, and ModelCanvas keeps zoom/collapse UI state locally.

**Tech Stack:** Electron, React, TypeScript, Vite, static Node tests.

---

### Task 1: Version And Preference Tests

**Files:**
- Modify: `tests/brandingStatic.test.mjs`
- Create: `tests/preferencesFontScaleStatic.test.mjs`

- [x] **Step 1: Write failing version tests**

Add assertions that `package.json` uses version `0.0.1`, Electron no longer renders `Public Beta v1`, and Preferences uses the version branding label instead of a hardcoded public beta label.

- [x] **Step 2: Write failing font preference tests**

Create `tests/preferencesFontScaleStatic.test.mjs` to assert:

```js
assert.match(appSource, /const METIS_PREF_FONT_SCALE_KEY = 'metis:prefs:fontScale'/)
assert.match(appSource, /document\.documentElement\.setAttribute\('data-font-scale', readStartupFontScale\(\)\)/)
assert.match(prefsSource, /const METIS_PREF_FONT_SCALE_KEY = 'metis:prefs:fontScale'/)
assert.match(prefsSource, /const FONT_SIZE_OPTIONS = \['Small', 'Default', 'Large', 'Extra Large'\] as const/)
assert.match(prefsSource, /Restart metis to apply font size changes\./)
```

- [x] **Step 3: Run tests and confirm RED**

Run:

```powershell
node --test tests/brandingStatic.test.mjs tests/preferencesFontScaleStatic.test.mjs
```

Expected: fail because version/font-scale behavior is not implemented yet.

### Task 2: Canvas UI Tests

**Files:**
- Modify: `tests/modelCanvasUiLayout.test.mjs`

- [x] **Step 1: Write failing canvas assertions**

Add static assertions for:

```js
assert.match(source, /const \[leftPanelCollapsed,\s*setLeftPanelCollapsed\]\s*=\s*useState\(false\)/)
assert.match(source, /id="canvas-zoom-control"/)
assert.match(source, /id="collapsed-dataset-card"/)
assert.doesNotMatch(source.slice(source.indexOf('rightTab === \\'Tools\\''), source.indexOf('{/* ─── Toolbar')), /ZOOM/)
```

- [x] **Step 2: Run test and confirm RED**

Run:

```powershell
node --test tests/modelCanvasUiLayout.test.mjs
```

Expected: fail because the canvas zoom control and collapsed dataset card do not exist yet.

### Task 3: Implement Version And Font Preference

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `electron/main.ts`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `src/components/PreferencesModal.tsx`

- [x] **Step 1: Set package metadata**

Set both package metadata files to version `0.0.1`.

- [x] **Step 2: Replace public-beta UI labels**

Change splash and Preferences preview labels from `Public Beta v1` to the app version label.

- [x] **Step 3: Add startup-only font scale**

Add `METIS_PREF_FONT_SCALE_KEY`, read it once at App startup, set `data-font-scale`, and add CSS variables for `small`, `default`, `large`, and `extra-large`.

- [x] **Step 4: Add Preferences control**

Add a font-size selector in Appearance. Save to `metis:prefs:fontScale` and show the restart note.

- [x] **Step 5: Run tests and confirm GREEN for task**

Run:

```powershell
node --test tests/brandingStatic.test.mjs tests/preferencesFontScaleStatic.test.mjs
```

Expected: pass.

### Task 4: Implement Canvas Zoom And Indicator Collapse

**Files:**
- Modify: `src/pages/ModelCanvas.tsx`
- Modify: `tests/modelCanvasUiLayout.test.mjs`

- [x] **Step 1: Add left panel collapsed state**

Add local `leftPanelCollapsed` state and render either the expanded panel or a compact dataset card.

- [x] **Step 2: Move zoom controls**

Add `id="canvas-zoom-control"` floating near the right panel. Remove the zoom block from the Tools tab.

- [x] **Step 3: Run canvas tests**

Run:

```powershell
node --test tests/modelCanvasUiLayout.test.mjs
```

Expected: pass.

### Task 5: Verification And Review

**Files:**
- Inspect all modified files.

- [x] **Step 1: Typecheck**

Run:

```powershell
cmd /c npm run typecheck
```

Expected: exit code `0`.

- [x] **Step 2: Run focused static tests**

Run:

```powershell
node --test tests/brandingStatic.test.mjs tests/preferencesFontScaleStatic.test.mjs tests/modelCanvasUiLayout.test.mjs tests/lightThemeStatic.test.mjs
```

Expected: exit code `0`.

- [x] **Step 3: Slops and flops self-review**

Check the diff for:

- awkward copy,
- hardcoded stale version labels,
- duplicated zoom controls,
- font scaling applied live from Preferences,
- collapsed left panel becoming a tall vertical rail,
- obvious TypeScript or layout mistakes.

### Task 6: User Polish Requests

**Files:**
- Modify: `src/components/PreferencesModal.tsx`
- Modify: `src/components/TitleBar.tsx`
- Modify: `src/components/OnboardingTour.tsx`
- Modify: `src/index.css`
- Modify: `src/pages/ModelCanvas.tsx`
- Modify: `tests/modelCanvasUiLayout.test.mjs`
- Modify: `tests/preferencesFontScaleStatic.test.mjs`

- [x] **Step 1: Make font-size dropdown open upward**

Add upward placement support to `SelectBox` and set the app font-size selector to `direction="up"`.

- [x] **Step 2: Reduce floating panel and zoom shadows**

Lower dark and light theme floating shadow intensity through shared CSS variables.

- [x] **Step 3: Move zoom to bottom right**

Place the canvas zoom overlay at the bottom right, offset from the right panel and bottom toolbar baseline.

- [x] **Step 4: Add title bar View menu zoom visibility**

Add a checked `Zoom Control` toggle to the View menu, keep the existing Zoom In/Out/Fit commands there, and wire it to `ModelCanvas` so the bottom-right zoom overlay can be hidden or shown.

- [x] **Step 5: Rename Variables Panel to Indicators Panel**

Update the title bar View menu label while preserving the existing `view:toggle-vars` action path for the left panel.

- [x] **Step 6: Clean stale tour copy**

Remove the onboarding text that said zoom lives in the Tools tab.
