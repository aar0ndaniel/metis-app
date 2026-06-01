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
assert.match(
  constructSettingsMenu,
  /const modalWidth = 260[\s\S]*const modalHeight = 310/,
  'Construct right-click settings menu should keep its existing width and height contract.'
)
assert.match(
  constructSettingsMenu,
  /height:\s*modalHeight/,
  'Construct right-click settings menu should preserve its fixed height after the redesign.'
)
assert.match(
  constructSettingsMenu,
  /isHigherOrder:\s*construct\.isHigherOrder \|\| false/,
  'Construct right-click settings menu should edit the higher-order construct flag.'
)
assert.match(
  constructSettingsMenu,
  /Higher-order construct/,
  'Construct right-click settings menu should expose an HOC toggle like the create construct modal.'
)
assert.match(
  constructSettingsMenu,
  /isHigherOrder:\s*formData\.isHigherOrder/,
  'Applying right-click construct settings should persist the HOC toggle.'
)
assert.match(
  constructSettingsMenu,
  /background:\s*`linear-gradient\(180deg, \$\{C\.panelControl\} 0%, \$\{C\.panelPop\} 100%\)`/,
  'Construct right-click settings menu should use a token-driven shell suitable for light and dark theme.'
)
assert.doesNotMatch(
  constructSettingsMenu,
  /backgroundColor:\s*'#18181A'|rgba\(0,0,0,0\.6\)/,
  'Construct right-click settings menu should not force dark shell colors in light theme.'
)

const newConstructModal = sliceBetween('/* ─── New Construct Modal', '{hocPathConflict && (')
assert.match(
  newConstructModal,
  /width:\s*356/,
  'New latent variable modal should be wider than the compact s.pen draft.'
)
assert.match(
  newConstructModal,
  /fontSize:\s*10,[\s\S]*Enter construct name and choose a color/,
  'New latent variable helper copy should be readable at the larger modal size.'
)
assert.match(
  newConstructModal,
  /Enter construct name and choose a color/,
  'New latent variable modal should use the compact s.pen helper copy.'
)
assert.match(
  newConstructModal,
  /newConstructPalette\.map/,
  'New latent variable modal should render the active LOC or HOC color palette.'
)
assert.match(
  newConstructModal,
  /newConstructIsHigherOrder[\s\S]*HOC_SWATCH_COLORS[\s\S]*SWATCH_COLORS/,
  'Higher-order checkbox should switch the color palette between HOC and LOC colors.'
)
assert.match(
  newConstructModal,
  /newConstructType === type/,
  'New latent variable modal should expose the Reflective/Formative measurement toggle.'
)
assert.match(
  newConstructModal,
  /Higher-order construct/,
  'New latent variable modal should include the HOC checkbox label from the s.pen design.'
)
assert.match(
  source,
  /const HOC_SWATCH_COLORS = \['#D94141', '#BE185D', '#0E7490', '#52525B'\]/,
  'Higher-order constructs should use a visibly distinct palette from the LOC swatches.'
)
for (const locSwatch of ['#87976B', '#A78BFA', '#60A5FA', '#F97316']) {
  const hocPaletteDeclaration = source.match(/const HOC_SWATCH_COLORS = \[[^\]]+\]/)?.[0] ?? ''
  assert.doesNotMatch(
    hocPaletteDeclaration,
    new RegExp(locSwatch.replace('#', '#')),
    `HOC palette should not reuse the LOC swatch ${locSwatch}.`,
  )
}
assert.match(
  newConstructModal,
  /backgroundColor:\s*'var\(--color-accent\)'[\s\S]*color:\s*'var\(--color-on-accent\)'/,
  'Create CTA should use the accent color selected in Preferences.'
)
assert.match(
  source,
  /type:\s*newConstructType/,
  'New constructs should use the measurement type selected in the creation modal.'
)
assert.match(
  source,
  /isHigherOrder:\s*newConstructIsHigherOrder/,
  'New constructs should persist the higher-order construct selection.'
)
assert.doesNotMatch(
  newConstructModal,
  /color:\s*'#FFFFFF'/,
  'New latent variable modal should not force literal white text in light theme.'
)

console.log('PASS model canvas light popup coverage')
