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
  'Light theme should use the secondary green as the accent token.'
)

assert.match(
  appSource,
  /style=\{\{ background:\s*isInstallerPreview \? 'transparent' : 'var\(--color-page\)' \}\}/,
  'The application shell background should follow the active theme.'
)

assert.match(
  prefsSource,
  /const \[theme, setTheme\] = useState<'Dark' \| 'Light'>\(\(\) => getSavedThemeSetting\(\)\)/,
  'Preferences should initialize from the saved theme instead of forcing Dark.'
)

assert.match(
  prefsSource,
  /localStorage\.setItem\('metis:prefs:theme', theme\)/,
  'Preferences should persist the selected metis theme.'
)

assert.match(
  prefsSource,
  /onClick=\{\(\) => setTheme\('Light'\)\}/,
  'Light theme should be selectable in Preferences.'
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
