import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const indicatorInterface = source.slice(source.indexOf('interface Indicator'), source.indexOf('type ConstructShape'))

assert.match(source, /const DEFAULT_CONSTRUCT_COLOR = '#C6A24B'/, 'Construct drawing should default to the dark theme yellow accent.')
assert.match(source, /const SWATCH_COLORS = \[DEFAULT_CONSTRUCT_COLOR, '#7C5CFF', '#E46F61', '#179C8E'\]/, 'LOC construct swatches should include yellow by replacing one existing color.')
assert.match(source, /useState\(DEFAULT_CONSTRUCT_COLOR\)/, 'New construct color state should start from a palette color.')
assert.match(source, /setNewConstructColor\(DEFAULT_CONSTRUCT_COLOR\)/, 'Resetting the new construct modal should return to yellow instead of an unlisted CSS variable.')
assert.match(indicatorInterface, /labelT\?: number/, 'Indicators should persist score-label position.')
assert.doesNotMatch(indicatorInterface, /width\?: number|height\?: number/, 'Indicators should not persist custom size fields.')
assert.match(source, /interface Path[\s\S]*labelT\?: number/, 'Structural paths should persist statistic label position.')
assert.doesNotMatch(source, /indicatorResizing|onIndicatorResizeHandleMouseDown/, 'Selected indicators should not expose resize handles.')
assert.match(source, /fill=\{indicatorFill\(c\.color\)\} stroke=\{showIndicatorSelection \? C\.secondary : c\.color\}/, 'Indicator boxes should inherit construct color.')
assert.match(source, /dragIndicatorLabelRef/, 'Indicator score labels should be draggable.')
assert.match(source, /dragPathLabelRef/, 'Structural path statistics should be draggable.')
assert.match(source, /STRUCTURAL_PATH_NEUTRAL = 'rgb\(var\(--color-text-secondary-rgb\) \/ 0\.74\)'/, 'Neutral structural paths should use visible grey in dark theme.')

console.log('PASS model canvas indicator controls static contract')
