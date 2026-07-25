import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'src/components/PreferencesModal.tsx'), 'utf8')

assert.match(
  source,
  /const GENERAL_PREVIEW_WIDTH = 2040/,
  'Full Preferences preview should reserve extra horizontal space for longer translated labels.',
)

assert.match(
  source,
  /width: 410,[\s\S]{0,160}background: preferenceColors\.sidebar/,
  'Full Preferences sidebar should be wider so translated nav labels do not wrap.',
)

assert.match(
  source,
  /<nav className="flex flex-col" style=\{\{ width: 386, gap: 4 \}\}/,
  'Full Preferences nav should expand with the wider sidebar.',
)

assert.match(
  source,
  /<span style=\{\{ color: itemColor,[\s\S]{0,160}whiteSpace: 'nowrap'/,
  'Full Preferences nav labels should stay on one line.',
)

assert.match(
  source,
  /style=\{\{ width: 'min\(1180px, 96vw\)'/,
  'Compact Preferences modal should have a wider parent for translated labels.',
)

assert.match(
  source,
  /style=\{\{ width: 360, background: UI\.elevated/,
  'Compact Preferences sidebar should be wider for translated nav labels.',
)

assert.match(
  source,
  /<span style=\{\{ color: active \? UI\.text : UI\.textMuted,[\s\S]{0,180}whiteSpace: 'nowrap'/,
  'Compact Preferences nav labels should not wrap.',
)

assert.match(
  source,
  /const segmentedControl = \([\s\S]*minWidth\?: number,[\s\S]*width: 'max-content'/,
  'Preferences segmented controls should expand to fit translated labels instead of fixed English widths.',
)

assert.match(
  source,
  /minWidth: option\.width,[\s\S]{0,520}whiteSpace: 'nowrap'/,
  'Segmented control buttons should use minimum widths and no wrapping.',
)

assert.match(
  source,
  /const actionButton = \([\s\S]*<span style=\{\{ color: textColor,[\s\S]{0,220}whiteSpace: 'nowrap'/,
  'Full update action buttons should keep translated labels on one line.',
)

assert.match(
  source,
  /whiteSpace: 'nowrap'[\s\S]{0,80}>Check updates<\/span>/,
  'Compact check-updates action should keep translated labels on one line.',
)

assert.match(
  source,
  /whiteSpace: 'nowrap'[\s\S]{0,80}>Release notes<\/span>/,
  'Compact release-notes action should keep translated labels on one line.',
)

console.log('PASS preferences localization layout static coverage')
