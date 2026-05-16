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
  /document\.documentElement\.setAttribute\('data-font-scale', readStartupFontScale\(\)\)/,
  'App should apply font scale only from startup state.',
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
  /Restart metis to apply font size changes\./,
  'Preferences should tell users font-size changes require restart.',
)

assert.match(
  prefsSource,
  /direction\?: 'up' \| 'down'/,
  'Preferences SelectBox should support upward-opening menus.',
)

assert.match(
  prefsSource,
  /\.\.\.\(opensUpward \? \{ bottom: '100%', marginBottom: 4 \} : \{ top: '100%', marginTop: 4 \}\)/,
  'Upward SelectBox menus should render above the trigger.',
)

assert.match(
  prefsSource,
  /<SelectBox value=\{fontScale\}[\s\S]*direction="up"/,
  'The app font-size menu should open upward so its options remain visible.',
)

assert.match(
  cssSource,
  /\[data-font-scale='large'\][\s\S]*--app-font-scale:\s*1\.08;/,
  'Large font scale should be backed by a CSS variable.',
)

assert.match(
  cssSource,
  /body[\s\S]*font-size:\s*calc\(14px \* var\(--app-font-scale\)\)/,
  'Body font size should scale from the startup font-size variable.',
)

console.log('PASS preferences font scale static coverage')
