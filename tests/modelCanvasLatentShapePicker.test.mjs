/**
 * modelCanvasLatentShapePicker.test.mjs
 *
 * Static test for Latent Tool shape picker (Circle, Oval, Rectangle) drop-up menu,
 * construct creation shape behavior, model persistence, and What's New modal integration.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const canvasSource = await fs.readFile(
  path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'),
  'utf8',
)
const whatsNewSource = await fs.readFile(
  path.join(workspaceRoot, 'src/components/WhatsNewModal.tsx'),
  'utf8',
)

// 1. ModelCanvas has state for tracking preferred/active latent construct shape
assert.match(
  canvasSource,
  /preferredLatentShape|activeLatentShape/,
  'ModelCanvas must maintain state for preferred/active latent construct shape (Circle, Oval, Rectangle).',
)

// 2. Latent tool toolbar button has a drop-up popover selector for shapes
assert.match(
  canvasSource,
  /id="latent-shape-picker"|latentShapePickerOpen|showLatentShapeMenu/,
  'ModelCanvas toolbar must include a drop-up shape selector popover for the Latent tool.',
)

// 3. Shape popover offers Circle, Oval, and Rectangle options
assert.match(
  canvasSource,
  /['"]circle['"][\s\S]*['"]oval['"][\s\S]*['"]rectangle['"]|['"]Circle['"][\s\S]*['"]Oval['"][\s\S]*['"]Rectangle['"]/,
  'Latent shape picker popover must offer Circle, Oval, and Rectangle choices.',
)

// 4. Construct creation uses the selected preferred shape
assert.match(
  canvasSource,
  /handleCreateConstruct[\s\S]*shape:\s*(preferredLatentShape|activeLatentShape|currentLatentShape)/,
  'handleCreateConstruct must set new construct shape from the selected preferred latent shape.',
)

// 5. Per-model persistence saves the preferred shape into model state
assert.match(
  canvasSource,
  /preferredLatentShape:\s*snapshot\.preferredLatentShape|preferredLatentShape,/,
  'Model snapshot/persistence must save preferredLatentShape into model state.',
)

// 6. WhatsNewModal documents construct shape options (Circle, Oval, Rectangle)
assert.match(
  whatsNewSource,
  /Circle, Oval, and Rectangle|construct shape|latent tool shape/i,
  'WhatsNewModal must include update info for Latent shape options (Circle, Oval, Rectangle).',
)

// 7. Shape picker button styling and height
assert.match(
  canvasSource,
  /id="latent-shape-picker"[\s\S]*?height:\s*34/,
  'Latent shape picker button height must be 34px to match the latent tool button.',
)

// 8. Shape picker button has no accent color background fill (remains transparent)
assert.match(
  canvasSource,
  /id="latent-shape-picker"[\s\S]*?backgroundColor:\s*['"]transparent['"]/,
  'Latent shape picker button background must be transparent to avoid accent color fill.',
)

// 9. Drop-up popover is moved 10px higher (18px above the menu bar)
assert.match(
  canvasSource,
  /bottom:\s*['"]calc\(100% \+ 18px\)['"]/,
  'Latent shape picker drop-up popover must be positioned 18px above the toolbar.',
)

console.log('PASS model canvas latent shape picker contract')
