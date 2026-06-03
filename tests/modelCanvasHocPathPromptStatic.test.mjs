import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const canvas = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const preferences = await fs.readFile(path.join(workspaceRoot, 'src/components/PreferencesModal.tsx'), 'utf8')
const hocPathRoleModalStart = canvas.indexOf('{hocPathRoleChoice && (')
const hocPathRoleModalEnd = canvas.indexOf('{hocPathConflict && (', hocPathRoleModalStart)
assert.notEqual(hocPathRoleModalStart, -1, 'Missing HOC path role modal.')
assert.notEqual(hocPathRoleModalEnd, -1, 'Missing HOC conflict modal after HOC path role modal.')
const hocPathRoleModal = canvas.slice(hocPathRoleModalStart, hocPathRoleModalEnd)

assert.match(
  canvas,
  /const HOC_PATH_PROMPT_PREF_SUFFIX = 'prefs:showHocPathPrompt'/,
  'ModelCanvas should use a shared preference key for the HOC path prompt.',
)

assert.match(
  canvas,
  /function readShowHocPathPromptPreference\(\): boolean[\s\S]*return saved === null \? true : saved === 'true'/,
  'ModelCanvas should default the HOC path prompt to visible until the user disables it.',
)

assert.match(
  canvas,
  /const \[showHocPathPrompt, setShowHocPathPrompt\] = useState\(\(\) => readShowHocPathPromptPreference\(\)\)/,
  'ModelCanvas should keep the HOC path prompt preference in state.',
)

assert.match(
  canvas,
  /window\.addEventListener\('pls:preferences-updated', handleHocPathPromptPreferenceUpdated\)/,
  'ModelCanvas should refresh the HOC path prompt setting when Preferences are saved.',
)

assert.match(
  canvas,
  /const createDirectPath = useCallback\(\(fromId: string, toId: string, requestedHocRole\?: HocPathRole\)/,
  'Path creation should accept an explicit HOC role from the Shift shortcut.',
)

assert.match(
  canvas,
  /requestedHocRole === 'measurement'[\s\S]*const conflict = getHocPathConflict\(fromId, toId, id\)[\s\S]*setHocPathConflict\(conflict\)[\s\S]*commitDirectPath\(fromId, toId, id, constructs, paths, 'measurement'\)/,
  'Holding Shift while drawing an HOC-to-LOC path should still show the direction conflict prompt before creating a lower-order construct path.',
)

assert.match(
  canvas,
  /!showHocPathPrompt[\s\S]*commitDirectPath\(fromId, toId, id, constructs, paths, 'structural'\)/,
  'When the prompt is disabled, normal HOC-to-LOC drawing should create a structural path directly.',
)

assert.match(
  canvas,
  /createDirectPath\(connectStart, id, e\.shiftKey \? 'measurement' : undefined\)/,
  'Click-to-connect should honor Shift as a lower-order construct shortcut.',
)

assert.match(
  canvas,
  /createDirectPath\(connectStart, over\.id, e\.shiftKey \? 'measurement' : undefined\)/,
  'Drag-to-connect should honor Shift as a lower-order construct shortcut.',
)

assert.match(
  hocPathRoleModal,
  /width:\s*468/,
  'The HOC path modal should use a wider landscape layout so guidance text is readable.',
)

assert.match(
  hocPathRoleModal,
  /<ArrowUp size=\{12\} color="var\(--color-accent\)" weight="bold" \/>[\s\S]*<span style=\{\{ color: 'var\(--color-accent\)', fontWeight: 800 \}\}>Shift<\/span>/,
  'The HOC path modal should present Shift with a clear accent icon and label.',
)

assert.doesNotMatch(
  hocPathRoleModal,
  /border:\s*'1px solid rgb\(var\(--color-accent-rgb\) \/ 0\.46\)'|backgroundColor:\s*'rgb\(var\(--color-accent-rgb\) \/ 0\.12\)'/,
  'The Shift shortcut cue should not be styled as a pill.',
)

assert.match(
  hocPathRoleModal,
  /Hold\s*<span[\s\S]*<\/span>\s*to connect a lower-order construct\. Draw normally for a structural path\./,
  'The HOC path modal should keep the Hold Shift instruction as one continuous sentence.',
)

assert.match(
  hocPathRoleModal,
  /Do not show this again/,
  'The HOC path modal should include a do-not-show-again checkbox.',
)

assert.match(
  canvas,
  /const cancelHocPathRoleChoice = useCallback\(\(\) => \{[\s\S]*setHocPathRoleChoice\(null\)[\s\S]*setDoNotShowHocPathPrompt\(false\)/,
  'ModelCanvas should provide a close action that discards the pending HOC path choice.',
)

assert.match(
  hocPathRoleModal,
  /onClick=\{cancelHocPathRoleChoice\}[\s\S]*<X size=\{14\}/,
  'The HOC path modal should include a close icon that discards the pending path.',
)

assert.match(
  hocPathRoleModal,
  /backgroundColor:\s*C\.panelPop[\s\S]*border:\s*`1px solid \$\{C\.floatingBorderSoft\}`/,
  'The HOC path modal should use theme tokens for light and dark theme surfaces.',
)

assert.doesNotMatch(
  hocPathRoleModal,
  /backgroundColor:\s*'#242424'|backgroundColor:\s*'#2B2B2B'|color:\s*'#F5F1E7'|color:\s*'#D7CDBC'/,
  'The HOC path modal should not hardcode dark-theme-only colors.',
)

assert.match(
  canvas,
  /writeShowHocPathPromptPreference\(false\)[\s\S]*setShowHocPathPrompt\(false\)/,
  'Choosing do-not-show-again in the modal should disable future prompts immediately.',
)

assert.match(
  preferences,
  /const \[showHocPathPrompt, setShowHocPathPrompt\]\s*=\s*useState\(getSavedSetting\('showHocPathPrompt', true\)\)/,
  'Preferences General should load the HOC path prompt setting.',
)

assert.match(
  preferences,
  /localStorage\.setItem\('pls:prefs:showHocPathPrompt', String\(showHocPathPrompt\)\)/,
  'Preferences should persist the HOC path prompt setting.',
)

assert.match(
  preferences,
  /localStorage\.setItem\('metis:prefs:showHocPathPrompt', String\(showHocPathPrompt\)\)/,
  'Preferences should update the metis HOC path prompt key so it can re-enable a modal-disabled prompt.',
)

assert.match(
  preferences,
  /HOC path prompt[\s\S]*Ask before choosing between lower-order and structural HOC paths/,
  'Preferences General should expose the HOC path prompt toggle with clear wording.',
)

console.log('PASS model canvas HOC path prompt static contract')
