import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const modelCanvasSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const pathDiagramSource = await fs.readFile(path.join(workspaceRoot, 'src/components/PathDiagram.tsx'), 'utf8')

for (const [label, source] of [
  ['ModelCanvas', modelCanvasSource],
  ['PathDiagram', pathDiagramSource],
]) {
  assert.match(
    source,
    /const LABEL_BOX_FILL_RATIO = 0\.8/,
    `${label} should fit construct names inside an 80% width/height label box.`,
  )
  assert.match(
    source,
    /const LABEL_MIN_FONT_SIZE = 6/,
    `${label} should shrink construct names to a bounded minimum instead of overflowing.`,
  )
  assert.match(
    source,
    /function tokenizeConstructLabel\([\s\S]*?matchAll\(\S+[\s\S]*?endsWith\('-'\)/,
    `${label} should tokenize construct labels at whitespace and after literal hyphens only.`,
  )
  assert.match(
    source,
    /function wrapConstructLabelLines\([\s\S]*?candidateWidth > maxWidth[\s\S]*?return null/,
    `${label} should shrink the font when an unbreakable word is too wide, not split the word.`,
  )
  assert.doesNotMatch(
    source,
    /wrapConstructLabelLines\([\s\S]*?,\s*true\)/,
    `${label} should not force a last-resort label layout that can overflow the construct.`,
  )
  assert.match(
    source,
    /const fallbackText = text\.trim\(\) \|\| ' '[\s\S]*?fallbackWidthAtOne[\s\S]*?ellipseLimit[\s\S]*?fallbackFontSize[\s\S]*?buildLayout\(\[\{ text: fallbackText, width: fallbackWidth \}\], fallbackFontSize\)/,
    `${label} should keep shrinking a single-line fallback until it fits the construct geometry.`,
  )
  assert.doesNotMatch(
    source,
    /hyphenat|softHyphen|&shy;|\\u00ad|insertHyphen|splitWord|breakWord/,
    `${label} should not hyphenate or split construct names mid-word.`,
  )
  assert.match(
    source,
    /layoutConstructLabel\([\s\S]*?shapeKind === 'rectangle'[\s\S]*?ellipseFit <= 1/,
    `${label} should validate the wrapped label block against rectangle and curved construct geometry.`,
  )
  assert.match(
    source,
    /\.lines\.map\([\s\S]*?<tspan[\s\S]*?line\.text/,
    `${label} should render wrapped construct names as tspans instead of a single overflowing text node.`,
  )
}

assert.doesNotMatch(
  modelCanvasSource,
  /<text textAnchor="middle" dominantBaseline="central" fontSize=\{resFontSize\}[\s\S]*?\{c\.name\}/,
  'ModelCanvas should not render default construct names as a single resFontSize text node.',
)

assert.doesNotMatch(
  modelCanvasSource,
  /realtimeEnabled && typeof liveLoadings\[`r2::\$\{c\.name\}`\] === 'number'[\s\S]*?\{c\.name\}/,
  'ModelCanvas realtime R-square labels should not render construct names as a single overflowing text node.',
)

assert.match(
  modelCanvasSource,
  /const constructLabelAvailableRy = hasLiveR2[\s\S]*?layoutConstructLabel\([\s\S]*?ry: constructLabelAvailableRy[\s\S]*?constructLabelLayout\.lines\.map[\s\S]*?R²=/,
  'ModelCanvas realtime R-square labels should reserve vertical room and still render wrapped construct name tspans.',
)

assert.doesNotMatch(
  pathDiagramSource,
  /fontSize=\{c\.name\.length > 5 \? 11 : 13\}/,
  'PathDiagram should not use the old fixed name-length font rule for construct names.',
)

console.log('PASS construct labels fit construct width and height without mid-word hyphenation')
