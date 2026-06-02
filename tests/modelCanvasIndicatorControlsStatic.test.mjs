import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const indicatorInterface = source.slice(source.indexOf('interface Indicator'), source.indexOf('type ConstructShape'))

assert.match(source, /const SWATCH_COLORS = \['#87976B', '#A78BFA', '#60A5FA', '#F97316'\]/, 'LOC construct swatches should use the approved light-safe palette.')
assert.match(source, /const HOC_SWATCH_COLORS = \['#D94141', '#BE185D', '#0E7490', '#52525B'\]/, 'HOC construct swatches should remain visually distinct from LOC swatches.')
assert.match(source, /useState\(SWATCH_COLORS\[0\]\)/, 'New construct color state should start from a visible LOC palette color.')
assert.match(source, /setNewConstructColor\(SWATCH_COLORS\[0\]\)/, 'Resetting the new construct modal should return to the first LOC palette color.')
assert.match(indicatorInterface, /ox\?: number[\s\S]*oy\?: number/, 'Indicators should persist manual position offsets.')
assert.doesNotMatch(indicatorInterface, /width\?: number|height\?: number/, 'Indicators should not persist custom size fields.')
assert.doesNotMatch(source, /indicatorResizing|onIndicatorResizeHandleMouseDown/, 'Selected indicators should not expose resize handles.')
assert.match(source, /<path d=\{p\} fill="none" stroke=\{c\.color\}/, 'Indicator connector paths should inherit construct color.')
assert.match(source, /fill=\{C\.surface\} stroke=\{showIndicatorSelection \? C\.secondary : C\.border\}/, 'Indicator boxes should use theme-aware surfaces and borders.')

console.log('PASS model canvas indicator controls static contract')
