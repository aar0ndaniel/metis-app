import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const resultsSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')
const titleBarSource = await fs.readFile(path.join(workspaceRoot, 'src/components/TitleBar.tsx'), 'utf8')
const pathDiagramSource = await fs.readFile(path.join(workspaceRoot, 'src/components/PathDiagram.tsx'), 'utf8')
const cssSource = await fs.readFile(path.join(workspaceRoot, 'src/index.css'), 'utf8')

assert.doesNotMatch(resultsSource, />Recalculate</, 'Results toolbar should not include the Recalculate action.')
assert.doesNotMatch(resultsSource, /Generate AI Report/, 'Results toolbar should not include the Generate AI Report action.')

assert.match(
  resultsSource,
  /<div className="h-full w-full flex flex-col overflow-hidden select-none"\s+style=\{\{ backgroundColor: 'var\(--color-sidebar-bg\)' \}\}/,
  'Results view shell should use the left sidebar background token.'
)

assert.match(
  resultsSource,
  /className="h-11 flex items-center px-3 gap-0\.5 shrink-0 z-20"\s+style=\{\{ background: 'var\(--color-titlebar-bg\)' \}\}/,
  'Results toolbar should use the titlebar background token.'
)

assert.match(
  resultsSource,
  /<div className="flex-1" \/>\s+\{\/\* Save Results \*\/\}[\s\S]*?<span className="text-xs">Save Results<\/span>[\s\S]*?<span className="text-xs">Export HTML<\/span>[\s\S]*?<span className="text-xs">Copy R Script<\/span>[\s\S]*?Graphical output/,
  'Save/export/copy actions should sit on the right side of the toolbar next to Graphical output.'
)

assert.match(
  resultsSource,
  /<div className="w-60 flex flex-col shrink-0 overflow-hidden" style=\{\{ background: 'var\(--color-sidebar-bg\)' \}\}>/,
  'Results sidebar should use the left sidebar background token.'
)

assert.match(
  cssSource,
  /:root,\s*\n\[data-theme='dark'\][\s\S]*--color-sidebar-bg:\s*var\(--color-menu-bg\);[\s\S]*--color-right-panel-bg:\s*#181818;/,
  'Dark theme should keep left results/sidebar chrome at #202020 while the right results panel uses #181818.'
)

assert.match(
  cssSource,
  /\[data-theme='light'\][\s\S]*--color-sidebar-bg:\s*#F4F4F4;[\s\S]*--color-right-panel-bg:\s*#FAFAFA;/,
  'Light theme should preserve the visible sidebar/right-panel contrast.'
)

assert.match(
  resultsSource,
  /<div className="h-10 px-3 flex items-center gap-2 shrink-0">[\s\S]*?onClick=\{\(\) => navigate\(-1\)\}[\s\S]*?<ArrowLeft size=\{14\} \/>[\s\S]*?\{sidebarModeLabel\}/,
  'Back control should be in the left sidebar before the results title.'
)

assert.match(
  resultsSource,
  /<div\s+className="flex-1 flex flex-col overflow-hidden min-h-0"\s+style=\{\{\s+background: RESULTS_PANEL_BACKGROUND,\s+borderRadius: '12px 0 0 12px',\s+\}\}/,
  'Results content area should keep rounded panel corners while using shared panel background token.'
)

assert.match(
  resultsSource,
  /style=\{\{ background: RESULTS_PANEL_BACKGROUND, cursor: isPanning\.current \? 'grabbing' : 'grab' \}\}/,
  'Path diagram canvas should use the right-panel #181818 surface.'
)

assert.match(
  resultsSource,
  /<div ref=\{panelShellRef\} className="flex-1 flex flex-col overflow-hidden min-h-0" style=\{\{ background: RESULTS_PANEL_BACKGROUND \}\}>/,
  'Results table shell should use #181818 instead of the left-panel color.'
)

assert.match(
  resultsSource,
  /<div ref=\{panelBodyRef\} className="flex-1 overflow-y-auto min-h-0 p-3"/,
  'Results table body should be padded so tables do not hit the right-panel edges.'
)

assert.match(
  resultsSource,
  /const RESULTS_TABLE_ROW_ALT_BACKGROUND = 'rgb\(var\(--color-accent-rgb\) \/ 0\.025\)'/,
  'Results tables should use a subtle accent-tinted alternate row background token.'
)

assert.match(
  resultsSource,
  /function resultsTableRowStyle\(index: number\)[\s\S]*index % 2 === 0[\s\S]*RESULTS_TABLE_ROW_BACKGROUND[\s\S]*RESULTS_TABLE_ROW_ALT_BACKGROUND/,
  'Results table rows should alternate between #181818 and the subtle separator tint.'
)

assert.doesNotMatch(
  resultsSource,
  /<tr[^>]+className=\{[^}]*bg-page[^}]*bg-elevated[^}]*\}/,
  'Right-side table rows should not alternate through bg-elevated, which is too close to the left panel color.'
)

assert.doesNotMatch(
  resultsSource,
  /<tr[^>]+className="bg-\[#181818\]"/,
  'Right-side table rows should use the shared subtle row style instead of a flat row class.'
)

assert.doesNotMatch(
  resultsSource,
  /background: idx % 2 === 0 \? '#181818' : '#1E1E1E'/,
  'Sticky table cells should not use the elevated row color near #202020.'
)

assert.match(
  resultsSource,
  /const PANEL_ICON_OVERRIDES: Record<string, ElementType> = \{/,
  'Results sidebar should define per-panel icon overrides to avoid repetitive icons.'
)

assert.match(
  resultsSource,
  /icon: PANEL_ICON_OVERRIDES\[item\.id\] \?\? SIDEBAR_ICON_MAP\[item\.iconKey\]/,
  'Results sidebar should prefer panel-specific icons before the fallback icon key.'
)

for (const iconOverride of [
  /'total-indirect': GitBranch/,
  /'specific-indirect': TreeStructure/,
  /'outer-weights': Gauge/,
  /reliability: ShieldCheck/,
  /discriminant: Scales/,
  /'execution-log': TerminalWindow/,
]) {
  assert.match(resultsSource, iconOverride, `Missing expected unique sidebar icon override: ${iconOverride}`)
}

assert.doesNotMatch(
  titleBarSource,
  /showTitleBarDivider|borderBottom:/,
  'TitleBar should not render a bottom divider on canvas, results, preferences, or workspace screens.'
)

assert.match(
  titleBarSource,
  /label:\s*'Export R Script'[\s\S]*?action:\s*'results:export-r-script'/,
  'TitleBar Export R Script should dispatch the results export action.'
)

assert.match(
  resultsSource,
  /if \(action === 'results:export-r-script'\) void handleExportRScript\(\)/,
  'Results view should handle the title-bar Export R Script action.'
)

assert.match(
  titleBarSource,
  /\.\.\.\(screen === 'canvas' \? \[[\s\S]*?label:\s*'Close Model'[\s\S]*?action:\s*'canvas:go-home'/,
  'Close Model should only be added to the File menu while the model canvas is active.'
)

assert.doesNotMatch(
  titleBarSource,
  /label:\s*'Close Model',\s*disabled:\s*noModel/,
  'Close Model should not be present as a disabled item on non-canvas pages.'
)

assert.doesNotMatch(
  pathDiagramSource,
  /fill="#202020"/,
  'Path diagram elements should not use the left-panel #202020 fill.'
)

assert.match(
  pathDiagramSource,
  /function fullArrowPath\(from:\s*CanvasConstruct,\s*to:\s*CanvasConstruct,\s*p:\s*CanvasPath\):\s*string/,
  'Blank path diagrams should preserve curved and right-angle connector geometry.'
)

assert.match(
  pathDiagramSource,
  /if \(pathVal === undefined\)[\s\S]*fullArrowPath\(from,\s*to,\s*p\)/,
  'Blank structural paths should use the same connector geometry as value-labelled paths.'
)

assert.match(
  pathDiagramSource,
  /const STRUCTURAL_PATH_NEUTRAL = 'rgb\(var\(--color-text-secondary-rgb\) \/ 0\.74\)'/,
  'Neutral structural paths should use a visible grey token in dark theme.'
)

assert.match(
  pathDiagramSource,
  /type CanvasConstructShape = 'circle' \| 'oval' \| 'rectangle' \| 'square'/,
  'Result diagrams should preserve rectangle construct shape metadata.'
)

assert.match(
  pathDiagramSource,
  /normalizeConstructShape\(shape\?: CanvasConstructShape\): 'circle' \| 'oval' \| 'rectangle'[\s\S]*shape === 'rectangle' \? 'rectangle'/,
  'Result diagrams should keep rectangle constructs distinct from ovals.'
)

assert.match(
  pathDiagramSource,
  /isRectangle[\s\S]*<rect[\s\S]*x=\{c\.x - rx\}[\s\S]*width=\{rx \* 2\}[\s\S]*height=\{ry \* 2\}/,
  'Result diagrams should render rectangle constructs as rectangles.'
)

assert.match(
  pathDiagramSource,
  /interface CanvasIndicator[\s\S]*labelT\?: number/,
  'Path diagrams should mirror persisted indicator score-label positions.'
)

assert.doesNotMatch(
  pathDiagramSource.slice(pathDiagramSource.indexOf('interface CanvasIndicator'), pathDiagramSource.indexOf('type CanvasConstructShape')),
  /width\?: number|height\?: number/,
  'Path diagram indicators should not persist custom size fields.'
)

assert.match(
  pathDiagramSource,
  /labelT\?: number/,
  'Path diagrams should mirror persisted structural statistic label positions.'
)

assert.match(
  pathDiagramSource,
  /onPathLabelMouseDown/,
  'Interactive result diagrams should expose structural statistic label drags.'
)

assert.match(
  pathDiagramSource,
  /onIndicatorLabelMouseDown/,
  'Interactive result diagrams should expose indicator score label drags.'
)

assert.doesNotMatch(
  pathDiagramSource,
  /onIndicatorResizeMouseDown/,
  'Interactive result diagrams should not expose indicator resize handles.'
)

assert.match(
  resultsSource,
  /handlePathLabelMouseDown[\s\S]*handleIndicatorLabelMouseDown/,
  'Results path diagram wrapper should wire movable labels.'
)

assert.doesNotMatch(
  resultsSource,
  /handleIndicatorResizeMouseDown/,
  'Results path diagram wrapper should not wire indicator resizing.'
)

assert.doesNotMatch(
  resultsSource,
  /ctx2d\.fillStyle\s*=\s*RESULTS_PANEL_BACKGROUND[\s\S]*?ctx2d\.fillRect\(0,\s*0,\s*canvas\.width,\s*canvas\.height\)/,
  'PNG path diagram export should preserve transparency instead of painting the dark panel background.'
)

assert.match(
  resultsSource,
  /function preparePathDiagramSvgForExport\(svg:\s*SVGSVGElement\):\s*SVGSVGElement/,
  'Path diagram PNG/SVG export should clone and normalize the live SVG before serializing.'
)

assert.match(
  resultsSource,
  /getComputedStyle\(document\.documentElement\)[\s\S]*startsWith\('--color-'\)/,
  'Path diagram export should copy theme color variables onto the standalone SVG.'
)

assert.match(
  resultsSource,
  /exportEl\.setAttribute\('fill',\s*computed\.fill\)/,
  'Path diagram export should inline computed fill colors so indicator boxes do not turn black.'
)

assert.match(
  resultsSource,
  /tagName === 'text'[\s\S]*exportEl\.setAttribute\('font-family',\s*computed\.fontFamily\)/,
  'Path diagram export should inline text styling so indicator names remain visible.'
)

assert.match(
  resultsSource,
  /serializeToString\(preparePathDiagramSvgForExport\(svgEl\)\)/,
  'Path diagram SVG and PNG downloads should serialize the export-normalized SVG.'
)

assert.match(
  resultsSource,
  /const EXPORT_COPY_ICON_SVG = `/,
  'Exported HTML reports should use the new inline copy icon.'
)

assert.match(
  resultsSource,
  /class="copy-table-button"/,
  'Exported HTML report tables should render a copy button.'
)

assert.match(
  resultsSource,
  /function copyExportTable\(button\)/,
  'Exported HTML reports should include a table-copy handler.'
)

assert.match(
  resultsSource,
  /function copyRichTextToClipboard\(html,\s*text\)/,
  'Exported HTML reports should use a local-file friendly rich clipboard fallback.'
)

assert.match(
  resultsSource,
  /event\.clipboardData\.setData\('text\/html',\s*html\)/,
  'The exported HTML fallback should place rich table HTML directly onto the copy event.'
)

assert.match(
  resultsSource,
  /if \(copyRichTextToClipboard\(payload\.html,\s*payload\.text\)\) \{/,
  'The exported HTML copy button should try the synchronous rich copy path before async clipboard permissions.'
)

assert.match(
  resultsSource,
  /font-family:&quot;Times New Roman&quot;, Times, serif/,
  'Exported HTML table copy should use the same APA-friendly Word paste style.'
)

assert.match(
  resultsSource,
  /new ClipboardItem/,
  'Exported HTML table copy should write rich HTML to the clipboard when available.'
)

console.log('PASS results view matches WorkspaceHome shell styling')
