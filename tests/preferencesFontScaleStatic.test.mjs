import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function readSource(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

const appSource = await readSource('src/App.tsx')
const prefsSource = await readSource('src/components/PreferencesModal.tsx')
const cssSource = await readSource('src/index.css')

assert.match(
  appSource,
  /const METIS_PREF_FONT_SCALE_KEY = 'metis:prefs:fontScale'/,
  'App should define the metis font-scale preference key.',
)

assert.match(
  appSource,
  /function applySavedVisualPreferences\(options: \{ skipSavedContrast\?: boolean \} = \{\}\)[\s\S]*root\.setAttribute\('data-font-scale', readStartupFontScale\(\)\)/,
  'App should apply font scale through the shared visual-preferences path.',
)

assert.match(
  appSource,
  /window\.addEventListener\('pls:preferences-updated', applyCurrentPreferences\)/,
  'App should reapply font scale when preferences are saved.',
)

assert.match(
  prefsSource,
  /const DEFAULT_INTERFACE_CONTRAST = 75[\s\S]*const MIN_READABLE_INTERFACE_CONTRAST = 75/,
  'Preferences should default interface contrast to the readable 75% baseline.',
)

assert.match(
  prefsSource,
  /Math\.max\(MIN_READABLE_INTERFACE_CONTRAST, Math\.min\(100, parsed\)\)/,
  'Preferences should clamp saved contrast values below the readable floor.',
)

assert.match(
  prefsSource,
  /min=\{MIN_READABLE_INTERFACE_CONTRAST\}[\s\S]*onChange=\{\(event\) => setInterfaceContrast\(Math\.max\(MIN_READABLE_INTERFACE_CONTRAST, Number\(event\.target\.value\)\)\)\}/,
  'The interface contrast slider should not write values below the readable baseline.',
)

assert.match(
  prefsSource,
  /const METIS_PREF_FONT_SCALE_KEY = 'metis:prefs:fontScale'/,
  'Preferences should persist font size to the metis font-scale key.',
)

assert.match(
  prefsSource,
  /const FONT_SIZE_OPTIONS = \['Small', 'Default', 'Large', 'Extra Large'\] as const/,
  'Preferences should expose the four supported app font sizes.',
)

assert.match(
  prefsSource,
  /Applied to the workspace after preferences save\./,
  'Preferences should tell users font-size changes apply after saving preferences.',
)

assert.match(
  prefsSource,
  /const \[openPreferenceSelect, setOpenPreferenceSelect\]/,
  'Preferences should use the custom styled select state instead of native browser dropdowns.',
)

assert.match(
  prefsSource,
  /'default-seed', 'up'/,
  'The default random seed menu should open upward so its options remain visible.',
)

assert.match(
  cssSource,
  /\[data-font-scale='small'\][\s\S]*--app-font-scale:\s*0\.94;[\s\S]*\[data-font-scale='default'\][\s\S]*--app-font-scale:\s*1;[\s\S]*\[data-font-scale='large'\][\s\S]*--app-font-scale:\s*1\.08;[\s\S]*\[data-font-scale='extra-large'\][\s\S]*--app-font-scale:\s*1\.16;/,
  'Font scale ratios should be Small 0.94, Default 1.00, Large 1.08, Extra Large 1.16.',
)

assert.match(
  cssSource,
  /body[\s\S]*font-size:\s*14px;/,
  'Body font size should stay at the base size so shell zoom is the single visible font-scale multiplier.',
)

assert.match(
  cssSource,
  /\.metis-app-shell[\s\S]*zoom:\s*var\(--app-font-scale\)/,
  'The app shell should scale so inline pixel font sizes visibly change after preferences are saved.',
)

assert.match(
  cssSource,
  /\.metis-app-shell[\s\S]*width:\s*calc\(100vw \/ var\(--app-font-scale\)\)[\s\S]*height:\s*calc\(100vh \/ var\(--app-font-scale\)\)/,
  'The scaled app shell should keep the viewport from overflowing after zooming.',
)

console.log('PASS preferences font scale static coverage')
