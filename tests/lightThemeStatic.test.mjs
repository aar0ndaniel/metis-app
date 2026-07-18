import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function readSource(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

const indexCss = await readSource('src/index.css')
const appSource = await readSource('src/App.tsx')
const prefsSource = await readSource('src/components/PreferencesModal.tsx')
const electronMain = await readSource('electron/main.ts')

assert.match(
  indexCss,
  /\[data-theme='light'\][\s\S]*--color-accent:\s*#87976B;/,
  'Light theme Default accent should use olive green.'
)

assert.match(
  appSource,
  /style=\{\{ background:\s*isInstallerPreview \? 'transparent' : 'var\(--color-page\)' \}\}/,
  'The application shell background should follow the active theme.'
)

assert.match(
  indexCss,
  /html,\s*\nbody\s*\{[\s\S]*background:\s*var\(--color-page\);/,
  'The document background should use the active page color so scaled shell edges never show the native window background.'
)

assert.match(
  indexCss,
  /#root\s*\{[\s\S]*background:\s*var\(--color-page\);/,
  'The React root should use the active page color instead of transparent edges.'
)

const appShellBlock = indexCss.match(/\.metis-app-shell\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
assert.ok(appShellBlock, 'The app shell CSS block should exist.')
assert.doesNotMatch(
  appShellBlock,
  /\b(?:border|outline|box-shadow|filter)\s*:/,
  'The application shell should not draw or composite an outer border, outline, shadow, or filter around the whole app.'
)

assert.match(
  prefsSource,
  /const \[theme, setTheme\] = useState<'Dark' \| 'Light'>\(\(\) => getSavedThemeSetting\(\)\)/,
  'Preferences should initialize from the saved theme instead of forcing Dark.'
)

assert.match(
  prefsSource,
  /type ThemePreference = 'Dark' \| 'Light' \| 'Auto'/,
  'Preferences should model Auto as a real theme preference.'
)

assert.match(
  prefsSource,
  /localStorage\.setItem\('metis:prefs:theme', themePreference\)/,
  'Preferences should persist the selected metis theme preference.'
)

assert.match(
  prefsSource,
  /onClick=\{\(\) => setThemeChoice\(item\.value\)\}/,
  'Light theme should be selectable in Preferences.'
)

assert.match(
  appSource,
  /type ThemePreference = AppTheme \| 'Auto'/,
  'App should model Auto as a real theme preference.'
)

assert.match(
  appSource,
  /window\.matchMedia\('\(prefers-color-scheme: light\)'\)/,
  'Auto theme should resolve from the system color scheme.'
)

assert.doesNotMatch(
  prefsSource,
  /Coming soon|not-allowed|<Lock\b/,
  'Light theme should not be presented as locked.'
)

assert.match(
  electronMain,
  /function readStoredThemePreference\(\): 'dark' \| 'light'/,
  'Electron should read the stored theme so the startup splash can match it.'
)

assert.match(
  electronMain,
  /path\.join\(app\.getPath\('userData'\), 'theme-preference\.json'\)/,
  'Theme preference should be persisted where the splash screen can read it before the renderer loads.'
)

assert.match(
  electronMain,
  /const splashTheme = readStoredThemePreference\(\)/,
  'Splash HTML should be built from the stored theme.'
)

console.log('PASS light theme static coverage')
