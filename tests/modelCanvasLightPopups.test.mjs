import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`)
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`)
  return source.slice(start, end)
}

const canvasContextMenu = sliceBetween('/* ── Canvas Context Menu', '/* ── Right Panel')
assert.match(
  canvasContextMenu,
  /boxShadow:\s*C\.floatingMenuShadow/,
  'Empty-canvas clipboard context menu should use the theme-aware floating menu shadow.'
)
assert.doesNotMatch(
  canvasContextMenu,
  /rgba\(0,0,0,0\.8\)/,
  'Empty-canvas clipboard context menu should not force a sharp black light-theme shadow.'
)

const constructSettingsMenu = sliceBetween('function LatentVariableSettingsModal', 'function PathSettingsModal')
assert.match(
  constructSettingsMenu,
  /backgroundColor:\s*C\.panelPop/,
  'Construct right-click settings menu should use the active theme popover surface.'
)
assert.match(
  constructSettingsMenu,
  /boxShadow:\s*C\.floatingMenuShadow/,
  'Construct right-click settings menu should use the active theme menu shadow.'
)
assert.doesNotMatch(
  constructSettingsMenu,
  /backgroundColor:\s*'#18181A'|rgba\(0,0,0,0\.6\)/,
  'Construct right-click settings menu should not force dark shell colors in light theme.'
)

const newConstructModal = sliceBetween('/* ─── New Construct Modal', '{showExitModal &&')
assert.match(
  newConstructModal,
  /backgroundColor:\s*C\.input/,
  'New latent variable name field should use the active theme input background.'
)
assert.match(
  newConstructModal,
  /color:\s*C\.text/,
  'New latent variable name field should use the active theme text color.'
)
assert.doesNotMatch(
  newConstructModal,
  /color:\s*'#FFFFFF'/,
  'New latent variable name field should not force white text in light theme.'
)

console.log('PASS model canvas light popup coverage')
