import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const dataView = await fs.readFile(path.join(workspaceRoot, 'src/pages/DataView.tsx'), 'utf8')
const css = await fs.readFile(path.join(workspaceRoot, 'src/index.css'), 'utf8')

assert.match(
  css,
  /--color-warning-rgb:\s*220 105 115;/,
  'Dark theme should expose warning RGB values for transparent warning UI.'
)

assert.match(
  css,
  /\[data-theme='light'\][\s\S]*--color-warning-rgb:\s*220 105 115;/,
  'Light theme should expose warning RGB values for transparent warning UI.'
)

for (const opacity of ['0.16', '0.12', '0.10', '0.07']) {
  assert.match(
    dataView,
    new RegExp(`rgb\\(var\\(--color-accent-rgb\\) / ${opacity}\\)`),
    `DataView should use very transparent theme primary selection opacity ${opacity}.`
  )
}

assert.doesNotMatch(
  dataView,
  /rgb\(var\(--color-hover-rgb\) \/ 0\.(?:95|85|75|55)\)/,
  'DataView row and column selection should not use neutral hover fills.'
)

assert.match(
  dataView,
  /className="data-view-context-action w-full flex items-center justify-between"[\s\S]*Append row/,
  'Append row context action should have the shared hover affordance.'
)

assert.match(
  dataView,
  /duplicateRowIndices\(activeRowDeletion\)[\s\S]*Duplicate rows' : 'Duplicate row'/,
  'Row context menu should expose Duplicate row for selected rows.'
)

assert.match(
  dataView,
  /className="data-view-context-action w-full flex items-center justify-between"[\s\S]*Compute/,
  'Compute context action should have the shared hover affordance.'
)

assert.match(
  dataView,
  /openTransformModal\(contextMenu\.targetIndex\)[\s\S]*>\s*Transform\s*</,
  'Column context menu should expose the Transform action.'
)

assert.match(
  dataView,
  /duplicateColumnAfter\(contextMenu\.targetIndex\)[\s\S]*>\s*Duplicate column\s*</,
  'Column context menu should expose Duplicate column before transforming copied values.'
)

assert.match(
  dataView,
  /getUniqueHeaderName\(prev,\s*`\$\{sourceHeader\} copy`\)/,
  'Duplicate column should generate names against every existing header, including adjacent prior copies.'
)

assert.match(
  dataView,
  /Transform \{transformColumnName\}/,
  'Transform modal title should include the active column name.'
)

assert.match(
  dataView,
  /width:\s*'min\(480px, calc\(100vw - 32px\)\)'[\s\S]*Transform \{transformColumnName\}/,
  'Transform modal should match the compact calculating modal width.'
)

assert.match(
  dataView,
  /borderBottom:\s*'1px solid var\(--color-border\)'[\s\S]*background:\s*'var\(--color-elevated\)'[\s\S]*Transform \{transformColumnName\}/,
  'Transform modal header should use neutral app chrome instead of an accent fill.'
)

assert.doesNotMatch(
  dataView,
  /<select\b/,
  'Transform modal should not use native select controls.'
)

assert.match(
  dataView,
  /renderTransformDropdown[\s\S]*CaretDown[\s\S]*Check/,
  'Transform modal should render app-themed dropdown popovers with selected-state affordance.'
)

assert.match(
  dataView,
  /renderTransformDropdown[\s\S]*bottom:\s*'calc\(100% \+ 4px\)'[\s\S]*width:\s*'min\(320px, calc\(100vw - 64px\)\)'[\s\S]*display:\s*'flex'[\s\S]*flexWrap:\s*'wrap'[\s\S]*minHeight:\s*22[\s\S]*fontSize:\s*10/,
  'Unique term dropdown should open upward as a compact horizontal wrapping picker.'
)

assert.match(
  dataView,
  /gridTemplateColumns:\s*'minmax\(104px, 0\.8fr\) minmax\(0, 1\.35fr\) 34px'[\s\S]*border:\s*'none'[\s\S]*renderTransformTypeTag\(draft\)/,
  'Transform rows should be one borderless horizontal line with the statistical type embedded in Change to.'
)

assert.match(
  dataView,
  /aria-label=\{`Choose statistical type for \$\{draft\.uniqueTerm \|\| 'transform'\}`\}/,
  'Embedded statistical type tag should open the themed type picker.'
)

const transformTypeTagSource = dataView.match(/const renderTransformTypeTag[\s\S]*?\n  const runTransform/)?.[0] ?? ''
assert.ok(transformTypeTagSource, 'Transform type tag helper should exist.')

assert.doesNotMatch(
  transformTypeTagSource,
  /CaretDown/,
  'Embedded statistical type tag should not show a dropdown arrow.'
)

assert.match(
  transformTypeTagSource,
  /borderRadius:\s*5[\s\S]*border:\s*'none'[\s\S]*background:\s*'rgb\(var\(--color-accent-rgb\) \/ 0\.10\)'/,
  'Embedded statistical type tag should use a subtle accent fill without a pill border.'
)

assert.match(
  transformTypeTagSource,
  /bottom:\s*'calc\(100% \+ 6px\)'[\s\S]*width:\s*238[\s\S]*display:\s*'flex'[\s\S]*flexWrap:\s*'wrap'[\s\S]*minHeight:\s*22[\s\S]*fontSize:\s*10/,
  'Statistical type picker should open upward with compact horizontal choices.'
)

assert.match(
  dataView,
  /padding:\s*'0 5px'[\s\S]*renderTransformTypeTag\(draft\)[\s\S]*<input/,
  'Change to field should keep the statistical type tag at the left with compact padding.'
)

assert.doesNotMatch(
  dataView,
  />\s*Statistical type\s*</,
  'Transform modal should not render statistical type as a separate field label.'
)

assert.match(
  dataView,
  /TRANSFORM_MEASUREMENT_TYPES\.map/,
  'Transform modal should render the four statistical type options from the shared transform helper.'
)

assert.match(
  dataView,
  /aria-pressed=\{editMode\}[\s\S]*PencilSimple/,
  'DataView toolbar should expose an edit-mode icon before cell editing is allowed.'
)

assert.match(
  dataView,
  /Missing values[\s\S]*Find previous[\s\S]*Find next/,
  'DataView should expose an expandable missing-values navigator with previous and next controls.'
)

assert.match(
  dataView,
  /scrollTo\(\{[\s\S]*behavior:\s*['"]smooth['"]/,
  'Missing-value navigation should move the DataView viewport smoothly to the target cell.'
)

assert.match(
  dataView,
  /missingValueLocation[\s\S]*boxShadow[\s\S]*var\(--color-accent\)/,
  'The active missing cell should render an accent edge highlight tied to its row and column.'
)

assert.match(
  dataView,
  /MISSING_VALUE_GUIDE_WIDTH\s*=\s*1[\s\S]*data-view-missing-column-guide[\s\S]*data-view-missing-row-guide/,
  'Missing-value crosshair guides should use dedicated one-pixel full-column and full-row overlays.'
)

assert.doesNotMatch(
  dataView,
  /isMissingTargetColumn\s*\?\s*MISSING_VALUE_FILL|isMissingTargetRow\s*\?\s*MISSING_VALUE_FILL|isMissingTargetColumn\s*\|\|\s*isMissingTargetRow\s*\?\s*MISSING_VALUE_FILL/,
  'Missing-value navigation should not fill every cell in the selected row or column.'
)

assert.match(
  dataView,
  /isMissingTargetCell[\s\S]*background:\s*isMissingTargetCell\s*\?\s*MISSING_VALUE_FILL/,
  'Only the missing cell at the row/column intersection should receive the fill.'
)

assert.match(
  dataView,
  /onDoubleClick=\{\(\) => \{\s*if \(!editMode\) return\s*setEditingCell\(\{ rowIndex, columnIndex \}\)/,
  'Cell double-click editing should be gated behind edit mode.'
)

assert.match(
  dataView,
  /setHighlightedHeaderIndex\(safeIndex\)\s*if \(editMode\) setEditingHeaderIndex\(safeIndex\)/,
  'Generated column headers should not open for editing unless edit mode is already enabled.'
)

assert.match(
  dataView,
  /setHighlightedHeaderIndex\(result\.insertedColumnIndex\)\s*if \(editMode\) setEditingHeaderIndex\(result\.insertedColumnIndex\)/,
  'Computed column headers should not open for editing unless edit mode is already enabled.'
)

assert.match(
  dataView,
  /rules\.some\(\(draft\) => draft\.from\.length === 0 \|\| draft\.to\.length === 0\)/,
  'Transform modal should block incomplete visible transform rows instead of applying only partial rows.'
)

assert.match(
  css,
  /\.data-view-context-action:hover\s*\{[\s\S]*background:\s*rgb\(var\(--color-accent-rgb\) \/ 0\.10\) !important;/,
  'DataView context actions should hover with a subtle theme-primary fill.'
)

assert.match(
  dataView,
  /borderBottom:\s*'1px solid var\(--color-border\)'[\s\S]*background:\s*'var\(--color-elevated\)'[\s\S]*Unsaved dataset changes/,
  'Unsaved dataset modal header should use a neutral elevated surface instead of a danger fill.'
)

assert.match(
  dataView,
  /WarningCircle size=\{16\} color="var\(--color-warning\)"/,
  'Unsaved dataset modal icon should use the app warning color.'
)

assert.match(
  dataView,
  /background:\s*'rgb\(var\(--color-warning-rgb\) \/ 0\.92\)'[\s\S]*>\s*Discard\s*</,
  'Discard should use the app warning color instead of bright danger red.'
)

assert.match(
  dataView,
  /className="data-view-unsaved-save"[\s\S]*border:\s*'1px solid rgb\(var\(--color-accent-rgb\) \/ 0\.42\)'[\s\S]*background:\s*'transparent'[\s\S]*>\s*Save changes\s*</,
  'Save changes should be an outline action without a filled background.'
)

console.log('PASS data view theme chrome coverage')
