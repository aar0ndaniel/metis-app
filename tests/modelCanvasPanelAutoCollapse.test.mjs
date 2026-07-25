/**
 * modelCanvasPanelAutoCollapse.test.mjs
 *
 * Static test that verifies the properties panel auto-expand / auto-collapse
 * behavior is wired correctly in ModelCanvas.tsx:
 *
 *  - Clicking a construct → panel expands (setRightPanelCollapsed(false))
 *  - Clicking an indicator → panel expands (setRightPanelCollapsed(false))
 *  - Clicking empty canvas → panel collapses (setRightPanelCollapsed(true))
 *  - Existing manual collapse button is preserved
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(
  path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'),
  'utf8',
)

// ── Helper: extract a named function body from the source ──────────────────────
function extractFunction(src, fnName) {
  const start = src.indexOf(`const ${fnName} =`)
  if (start === -1) return null
  // Walk forward to find the matching closing brace for the arrow function body
  let depth = 0
  let bodyStart = src.indexOf('{', start)
  if (bodyStart === -1) return null
  let i = bodyStart
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    if (src[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return src.slice(start, i + 1)
}

// ── 1. onConstructMouseDown expands the panel on selection ────────────────────
const constructMouseDown = extractFunction(source, 'onConstructMouseDown')
assert.ok(
  constructMouseDown !== null,
  'onConstructMouseDown function must exist in ModelCanvas.tsx',
)

// The panel should be expanded when a construct is normally clicked (select tool)
assert.match(
  constructMouseDown,
  /setRightPanelCollapsed\(false\)/,
  'onConstructMouseDown: must call setRightPanelCollapsed(false) so the panel expands when a construct is selected',
)

// The Properties tab should be activated when a construct is selected
assert.match(
  constructMouseDown,
  /setRightTab\('Properties'\)/,
  "onConstructMouseDown: must call setRightTab('Properties') so the Properties tab is shown when a construct is selected",
)

// ── 2. onIndicatorMouseDown expands the panel on selection ────────────────────
const indicatorMouseDown = extractFunction(source, 'onIndicatorMouseDown')
assert.ok(
  indicatorMouseDown !== null,
  'onIndicatorMouseDown function must exist in ModelCanvas.tsx',
)

assert.match(
  indicatorMouseDown,
  /setRightPanelCollapsed\(false\)/,
  'onIndicatorMouseDown: must call setRightPanelCollapsed(false) so the panel expands when an indicator is selected',
)

assert.match(
  indicatorMouseDown,
  /setRightTab\('Properties'\)/,
  "onIndicatorMouseDown: must call setRightTab('Properties') so the Properties tab is shown when an indicator is selected",
)

// ── 3. onSvgMouseDown collapses the panel on empty-canvas click ───────────────
const svgMouseDown = extractFunction(source, 'onSvgMouseDown')
assert.ok(
  svgMouseDown !== null,
  'onSvgMouseDown function must exist in ModelCanvas.tsx',
)

assert.match(
  svgMouseDown,
  /setRightPanelCollapsed\(true\)/,
  'onSvgMouseDown: must call setRightPanelCollapsed(true) so the panel collapses when empty canvas space is clicked',
)

// ── 4. The manual collapse button is preserved ────────────────────────────────
assert.match(
  source,
  /onClick=\{.*setRightPanelCollapsed\(true\).*\}[\s\S]{0,40}title="Collapse Sidebar"/,
  'manual collapse button (title="Collapse Sidebar") must still call setRightPanelCollapsed(true)',
)

// ── 5. The panel still starts collapsed (default state unchanged) ─────────────
assert.match(
  source,
  /const \[rightPanelCollapsed,\s*setRightPanelCollapsed\]\s*=\s*useState\(true\)/,
  'rightPanelCollapsed must still initialise to true (collapsed by default)',
)

// ── 6. Regression: expand does NOT happen during delete/connect tool modes ────
// The setRightPanelCollapsed(false) calls should come after the early-return
// guards for delete and connect tools, so we check that the delete/connect
// returns are present before any panel expansion in onConstructMouseDown.
const deleteReturnIndex = constructMouseDown.indexOf("activeTool === 'delete'")
const connectReturnIndex = constructMouseDown.indexOf("activeTool === 'connect'")
const panelExpandIndex = constructMouseDown.indexOf('setRightPanelCollapsed(false)')

assert.ok(
  deleteReturnIndex < panelExpandIndex,
  'onConstructMouseDown: delete-tool guard must appear before setRightPanelCollapsed(false)',
)
assert.ok(
  connectReturnIndex < panelExpandIndex,
  'onConstructMouseDown: connect-tool guard must appear before setRightPanelCollapsed(false)',
)

console.log('PASS model canvas properties panel auto-expand/collapse contract')
