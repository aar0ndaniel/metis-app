import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')

function sliceBetween(startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle)
  assert.notEqual(start, -1, `Missing start marker: ${startNeedle}`)
  const end = source.indexOf(endNeedle, start)
  assert.notEqual(end, -1, `Missing end marker after ${startNeedle}: ${endNeedle}`)
  return source.slice(start, end)
}

const propertiesPanel = sliceBetween('{/* Construct Name */}', '{/* Construct Colour */}')
const constructMouseDown = sliceBetween('const onConstructMouseDown', 'const handleConstructContextMenu')
const indicatorMouseDown = sliceBetween('const onIndicatorMouseDown', 'const onSvgMouseDown')
const svgMouseDown = sliceBetween('const onSvgMouseDown', 'const onSvgMouseMove')
const createConstruct = sliceBetween('const handleCreateConstruct', 'const handleDropToCanvas')
const constructRender = sliceBetween('{constructs.map(c => {', '{multiSelectionBounds && (')
const hocWarningModal = sliceBetween('{hocPathConflict && (', '{showExitModal &&')

assert.match(
  propertiesPanel,
  /selectedConstruct\?\.isHigherOrder[\s\S]*>HOC</,
  'Properties should show an HOC pill next to the selected higher-order construct name.',
)

assert.match(
  propertiesPanel,
  /Lower-order constructs[\s\S]*selectedHocLowerOrderConstructs\.length/,
  'HOC properties should relabel the indicators section as lower-order constructs.',
)

assert.match(
  propertiesPanel,
  /selectedHocLowerOrderConstructs\.map[\s\S]*highlightConnectedConstruct/,
  'Clicking an HOC lower-order construct row should trigger a canvas highlight.',
)

assert.match(
  source,
  /const \[highlightedConstructId, setHighlightedConstructId\]/,
  'ModelCanvas should track a temporary highlighted connected construct.',
)

assert.match(
  constructRender,
  /highlightedConstructId === c\.id[\s\S]*rgb\(var\(--color-accent-rgb\) \/ 0\.\d+\)/,
  'Canvas should render an accent highlight around the connected LOC construct.',
)

assert.match(
  source,
  /const \[hocPathConflict, setHocPathConflict\]/,
  'ModelCanvas should keep pending HOC path direction conflicts in state.',
)

assert.match(
  source,
  /const suggestedType = currentType === 'Reflective' \? 'Formative' : 'Reflective'/,
  'HOC path direction logic should map opposite arrows to the alternate measurement type.',
)

assert.match(
  hocWarningModal,
  /Path direction conflict[\s\S]*Keep \{hocPathConflict\.currentType\}[\s\S]*Switch to \{hocPathConflict\.suggestedType\}/,
  'HOC path warning modal should offer keep-current and switch-to-drawn-direction actions.',
)

assert.doesNotMatch(
  source,
  /useEffect\(\(\) => \{\s*if \(selected\.length > 0\) \{\s*setRightPanelCollapsed\(false\)/,
  'Properties panel should not auto-expand from a selected-state effect.',
)

assert.match(
  constructMouseDown,
  /setRightPanelCollapsed\(false\)[\s\S]*setRightTab\('Properties'\)/,
  'Construct clicks must auto-expand the Properties panel and switch to the Properties tab.',
)

assert.match(
  indicatorMouseDown,
  /setRightPanelCollapsed\(false\)[\s\S]*setRightTab\('Properties'\)/,
  'Indicator clicks must auto-expand the Properties panel and switch to the Properties tab.',
)

assert.doesNotMatch(
  createConstruct,
  /setSelected\(\[id\]\)[\s\S]*setRightPanelCollapsed\(false\)[\s\S]*setRightTab\('Properties'\)/,
  'Creating a construct should not auto-expand the Properties panel.',
)

assert.match(
  svgMouseDown,
  /setRightPanelCollapsed\(true\)/,
  'Blank canvas clicks must auto-collapse the Properties panel.',
)

console.log('PASS model canvas HOC static coverage')
