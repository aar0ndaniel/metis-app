import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'src/components/PreferencesModal.tsx'), 'utf8')
const languageSource = await fs.readFile(path.join(workspaceRoot, 'src/i18n/uiLanguage.ts'), 'utf8')

const expectedCards = [
  'PLS-SEM Algorithm Defaults',
  'Higher-order Defaults',
  'Bootstrap Defaults',
  'PLS Predict Defaults',
  'NCA and IPMA Defaults',
  'Permutation Analysis (MICOM) Defaults',
  'Multi Group Analysis (MGA) Defaults',
  'Moderation Defaults',
]

for (const card of expectedCards) {
  assert.match(source, new RegExp(card.replace(/[()]/g, '\\$&')), `Algorithm preferences should render the ${card} card.`)
}

assert.doesNotMatch(source, /[A-Za-zΔ²/]+ \(c\)/, 'Algorithm preference labels should not include the internal changeability marker.')
assert.doesNotMatch(source, /<select\b/i, 'Algorithm preferences should use the existing custom dropdown pattern.')
assert.doesNotMatch(source, /plsApi|runAnalysis|fetch\(/i, 'Algorithm preferences should remain UI-only until analysis wiring is explicitly requested.')
assert.match(source, /algorithmCardHeader/, 'Algorithm cards should use a title-only header matching the S.pen hierarchy.')
assert.match(source, /background:\s*'transparent'[\s\S]*border:\s*'none'/, 'Algorithm card headers should not carry the content background or border.')
assert.match(source, /background:\s*preferenceColors\.card[\s\S]*border:\s*`1px solid \$\{preferenceColors\.border\}`/, 'Algorithm card rows should be contained in the filled card content frame.')
assert.doesNotMatch(source, /Estimation scheme|Higher-order type|PLSpredict HOC fallback|MICOM stages|Permutation mode|Core policy|Group estimation|Comparison tests|Confidence intervals|Interaction term method|ΔR² \/ f² method|Interaction inference/, 'Non-editable algorithm settings should not occupy the Preferences panel.')
assert.match(source, /Embedded/, 'The HOC two-stage approach should expose Embedded as an option.')
assert.match(source, /Disjoint/, 'The HOC two-stage approach should expose Disjoint as an option.')
assert.match(source, /hocMethod\s*!==\s*'Two-stage'/, 'The HOC two-stage approach should be disabled when Repeated indicators is selected.')
assert.match(source, /const \[openAlgorithmCards, setOpenAlgorithmCards\] = useState<Set<string>>/, 'Algorithm cards should track multiple open cards.')
assert.match(source, /const next = new Set\(current\)/, 'Accordion toggles should preserve other open cards.')
assert.match(source, /openAlgorithmCards\.has\(id\)/, 'Each algorithm card should derive expansion from its own open state.')
assert.doesNotMatch(source, /activeAlgorithmCard/, 'Algorithm accordions should not use a single exclusive active-card state.')
assert.match(source, /justifyContent:\s*'flex-end'/, 'Algorithm controls should align to the right edge of their setting rows.')
assert.match(source, /moderationModelComparison,\s*setModerationModelComparison,\s*260,\s*44,\s*4,\s*true/, 'Moderation comparison options should fill their parent control container.')
assert.match(source, /translateUiText\(label,\s*language\)/, 'Preference labels should use the active Metis UI language.')
assert.match(source, /translateUiText\(description,\s*language\)/, 'Preference descriptions should use the active Metis UI language.')
assert.match(source, /translateUiText\(option\.label,\s*language\)/, 'Segmented-control labels should use the active Metis UI language.')
assert.match(source, /width:\s*'max-content'[\s\S]*minWidth:\s*width/, 'Dropdown fields should expand to hug translated values.')
assert.match(source, /whiteSpace:\s*'nowrap'/, 'Right-side control values should remain on one line.')
assert.match(source, /width:\s*'max-content',[\s\S]*minWidth:\s*controlWidth/, 'Right-side control containers should grow around their content.')
assert.match(source, /metis-preference-select-menu[\s\S]*zIndex:\s*110/, 'Preference dropdown menus should stack above surrounding cards.')
assert.match(source, /background:\s*preferenceColors\.card[\s\S]*overflow:\s*'visible'/, 'Algorithm card content should not clip its dropdown menus.')
assert.match(source, /activePreferenceTab === 'algorithm'\s*\?\s*'auto'/, 'The algorithm preference page should scroll when its content exceeds the viewport.')
assert.match(source, /fontFamily:\s*'DM Sans, sans-serif'/, 'Algorithm preferences should keep the existing preference font.')
assert.match(languageSource, /Higher-order Defaults[\s\S]*Español[\s\S]*Português[\s\S]*Français/, 'New algorithm card titles should be localized.')
assert.match(languageSource, /NCA run depth[\s\S]*Español[\s\S]*Português[\s\S]*Français/, 'New algorithm setting descriptions should be localized.')
assert.match(languageSource, /'Disjoint':\s*\{\s*Español:[\s\S]*Português:[\s\S]*Français:/, 'The HOC Disjoint option should be localized.')
assert.match(source, /fontWeight:\s*400/, 'Algorithm preference control text should use regular font weight.')

console.log('PASS preferences algorithm panel static coverage')
