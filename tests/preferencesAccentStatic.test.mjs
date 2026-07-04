import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const appSource = await fs.readFile(path.join(workspaceRoot, 'src/App.tsx'), 'utf8')
const themeAccentSource = await fs.readFile(path.join(workspaceRoot, 'src/utils/themeAccent.ts'), 'utf8')
const indexCssSource = await fs.readFile(path.join(workspaceRoot, 'src/index.css'), 'utf8')
const preferencesSource = await fs.readFile(path.join(workspaceRoot, 'src/components/PreferencesModal.tsx'), 'utf8')
const workspaceHomeSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/WorkspaceHome.tsx'), 'utf8')
const newWorkspaceSource = await fs.readFile(path.join(workspaceRoot, 'src/components/NewWorkspaceDialog.tsx'), 'utf8')
const newModelSource = await fs.readFile(path.join(workspaceRoot, 'src/components/NewModelDialog.tsx'), 'utf8')
const advancedSource = await fs.readFile(path.join(workspaceRoot, 'src/components/AdvancedAnalysisModal.tsx'), 'utf8')
const dataViewSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/DataView.tsx'), 'utf8')
const importSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ImportStep1.tsx'), 'utf8')
const titleBarSource = await fs.readFile(path.join(workspaceRoot, 'src/components/TitleBar.tsx'), 'utf8')
const resultsSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')

assert.match(
  themeAccentSource,
  /export const DEFAULT_ACCENT_CHOICE = 'default'/,
  'App should store a default accent choice instead of forcing a single theme color.',
)

assert.match(
  themeAccentSource,
  /export const DEFAULT_DARK_ACCENT_COLOR = '#C6A24B'[\s\S]*export const DEFAULT_LIGHT_ACCENT_COLOR = '#87976B'/,
  'Default accent should remain theme-aware: yellow in dark theme and olive in light theme.',
)

assert.match(
  themeAccentSource,
  /LEGACY_DEFAULT_ACCENT_COLORS[\s\S]*DEFAULT_DARK_ACCENT_COLOR[\s\S]*DEFAULT_LIGHT_ACCENT_COLOR/,
  'Legacy stored yellow/olive defaults should migrate to the Default choice.',
)

assert.doesNotMatch(
  themeAccentSource,
  /normalized === '#2F8FB3'[\s\S]*return DEFAULT_ACCENT_CHOICE/,
  'Sea blue should remain a custom accent option, not collapse to Default.',
)

assert.match(
  indexCssSource,
  /:root,[\s\S]*\[data-theme='dark'\][\s\S]*--color-accent:\s*#C6A24B;[\s\S]*--color-accent-rgb:\s*198 162 75;/,
  'Dark theme Default accent should be yellow.',
)

assert.match(
  indexCssSource,
  /\[data-theme='light'\][\s\S]*--color-accent:\s*#87976B;[\s\S]*--color-accent-rgb:\s*135 151 107;/,
  'Light theme Default accent should be olive green.',
)

assert.match(
  appSource,
  /const savedAccentColor = readSavedAccentColor\(\)[\s\S]*savedAccentColor === DEFAULT_ACCENT_CHOICE[\s\S]*removeProperty\('--color-accent'\)[\s\S]*removeProperty\('--color-accent-rgb'\)[\s\S]*removeProperty\('--color-on-accent'\)/,
  'Default accent should remove inline accent variables so CSS theme defaults can apply.',
)

assert.match(
  appSource,
  /document\.querySelectorAll<HTMLElement>\('\.metis-app-shell'\)/,
  'Custom accent variables should also be applied to the app shell so its data-theme rule cannot override them.',
)

assert.match(
  appSource,
  /setVisualPreferenceRevision\(\(revision\) => revision \+ 1\)/,
  'Preference updates should force Workspace Home to re-render derived workspace accent colors.',
)

assert.match(
  appSource,
  /normalizeAccentChoice/,
  'App should use the shared accent normalizer.',
)

assert.match(
  themeAccentSource,
  /ACCENT_OPTIONS[\s\S]*APP_ACCENT_OPTIONS\['#2F8FB3'\]/,
  'Preferences should keep Sea blue as a custom accent option.',
)

assert.doesNotMatch(
  preferencesSource,
  /label: 'Yellow'|label: 'Olive green'/,
  'Preferences should not offer gold or olive as custom accent choices.',
)

assert.match(
  preferencesSource,
  /choice === DEFAULT_ACCENT_CHOICE[\s\S]*theme === 'Light' \? DEFAULT_LIGHT_ACCENT_COLOR : DEFAULT_DARK_ACCENT_COLOR/,
  'Preferences preview should resolve Default to olive on light theme and yellow on dark theme.',
)

assert.match(
  preferencesSource,
  /defaultAccentSwatchBackground[\s\S]*linear-gradient\(90deg, \$\{DEFAULT_DARK_ACCENT_COLOR\} 0 50%, \$\{DEFAULT_LIGHT_ACCENT_COLOR\} 50% 100%\)/,
  'Default accent swatch should show yellow and olive side by side.',
)

assert.match(
  preferencesSource,
  /setAccentColour\(DEFAULT_ACCENT_CHOICE\)/,
  'Preference reset should restore theme-aware Default accent.',
)

assert.match(
  preferencesSource,
  /const activeAccentColour = resolveAccentColour\(accentColour, theme\)/,
  'Preference controls should use a resolved active accent for preview colors.',
)

assert.match(
  workspaceHomeSource,
  /normalizeWorkspaceAccentColor/,
  'Workspace Home should normalize legacy workspace colors to the current accent.',
)

assert.match(
  workspaceHomeSource,
  /getWorkspaceAccentPalette/,
  'Workspace Home workspace swatches should include the current accent.',
)

assert.match(
  workspaceHomeSource,
  /id="tour-new-workspace"[\s\S]*backgroundColor:\s*'transparent'[\s\S]*<PlusCircle size=\{15\} color="var\(--color-accent\)"/,
  'The new workspace plus button should be transparent with an accent-colored icon.',
)

assert.match(
  newWorkspaceSource,
  /getActiveAccentColor/,
  'New workspace dialog should default the workspace color to the current preference accent.',
)

assert.match(
  newWorkspaceSource,
  /getWorkspaceAccentPalette/,
  'New workspace dialog color picker should include the current preference accent.',
)

assert.match(
  newWorkspaceSource,
  /backgroundColor:\s*'var\(--color-accent\)'/,
  'New workspace create CTA should use the current preference accent.',
)

assert.match(
  newModelSource,
  /getActiveAccentColor/,
  'New model dialog should default an inline-created workspace to the current preference accent.',
)

assert.match(
  newModelSource,
  /backgroundColor:\s*'var\(--color-accent\)'[\s\S]*>\s*<span style=\{\{ color: 'var\(--color-on-accent\)'/,
  'New model create CTA should use the current preference accent.',
)

assert.doesNotMatch(
  advancedSource,
  /SECONDARY_GREEN|rgba\(135,151,107/,
  'Advanced analysis controls should use the current CSS accent, not a hardcoded olive.',
)

assert.doesNotMatch(
  dataViewSource,
  /rgba\(135,151,107|background: hasChanges \? '#87976B'/,
  'Dataset save controls should use the current CSS accent.',
)

assert.match(
  importSource,
  /return \{ label: 'CSV File',\s+color: 'var\(--color-accent\)'[\s\S]*workspace\.id === value \? 'var\(--color-accent\)'[\s\S]*color: 'var\(--color-accent\)'[\s\S]*<Info size=\{13\} color="var\(--color-accent\)"/,
  'Import preview accent highlights should use the current CSS accent while workspace swatches remain hex colors.',
)

assert.doesNotMatch(
  titleBarSource,
  /rgba\(135,151,107/,
  'Title bar analysis hint should use the current CSS accent.',
)

assert.match(
  resultsSource,
  /function getCurrentExportAccent\(\)[\s\S]*--color-accent[\s\S]*--color-accent-rgb[\s\S]*--color-on-accent/,
  'HTML export should read the current app accent from CSS variables.',
)

assert.match(
  resultsSource,
  /buildPathDiagramSvg\(savedModel, diagramResults, exportAccent\)/,
  'Exported path diagrams should receive the current accent palette.',
)

assert.doesNotMatch(
  resultsSource,
  /rgba\(135,151,107|rgba\(198,162,75/,
  'HTML export CSS should avoid hardcoded olive/gold primary accent rgba values.',
)

console.log('PASS preference accent defaults and custom color propagation')
