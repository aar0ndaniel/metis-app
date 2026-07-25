import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function readSource(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

const preferences = await readSource('src/components/PreferencesModal.tsx')
const installerPreview = await readSource('src/pages/InstallerPreview.tsx')
const setupWizard = await readSource('src/pages/SetupWizard.tsx')

assert.match(
  preferences,
  /const METIS_PREF_LANGUAGE_KEY = 'metis:prefs:language'/,
  'Preferences should define the metis language preference key.',
)

assert.match(
  preferences,
  /const LANGUAGE_OPTIONS = \['English', 'Español', 'Português', 'Français'\] as const/,
  'Preferences should offer English, Spanish, Portuguese, and French.',
)

assert.match(
  preferences,
  /type LanguagePreference = typeof LANGUAGE_OPTIONS\[number\]/,
  'Preferences should type language from the supported language options.',
)

assert.match(
  preferences,
  /function normalizeLanguagePreference\(value: unknown\): LanguagePreference[\s\S]*Español[\s\S]*Português[\s\S]*Français[\s\S]*English/,
  'Preferences should normalize saved language values to the supported list.',
)

assert.match(
  preferences,
  /function getSavedLanguageSetting\(\): LanguagePreference[\s\S]*localStorage\.getItem\(METIS_PREF_LANGUAGE_KEY\)[\s\S]*localStorage\.getItem\(LEGACY_PREF_LANGUAGE_KEY\)/,
  'Preferences should read the metis language key before the legacy language key.',
)

assert.match(
  preferences,
  /const \[language, setLanguage\]\s*=\s*useState<LanguagePreference>\(\(\) => getSavedLanguageSetting\(\)\)/,
  'Preferences should initialize language from the normalized saved language.',
)

assert.match(
  preferences,
  /localStorage\.setItem\(METIS_PREF_LANGUAGE_KEY, language\)[\s\S]*localStorage\.setItem\(LEGACY_PREF_LANGUAGE_KEY, language\)/,
  'Preferences should persist language to both metis and legacy keys.',
)

assert.match(
  preferences,
  /SelectBox value=\{language\} options=\{\[\.\.\.LANGUAGE_OPTIONS\]\} onChange=\{\(value\) => setLanguage\(normalizeLanguagePreference\(value\)\)\}/,
  'The compact Preferences language dropdown should use all supported language options.',
)

assert.match(
  preferences,
  /selectShell\(language, 180, \[\.\.\.LANGUAGE_OPTIONS\], \(value\) => setLanguage\(normalizeLanguagePreference\(value\)\)/,
  'The full Preferences language control should use all supported language options.',
)

assert.match(
  preferences,
  /selectShell\(language, 180, \[\.\.\.LANGUAGE_OPTIONS\], \(value\) => setLanguage\(normalizeLanguagePreference\(value\)\), true/,
  'The full Preferences language control should show the dropdown caret.',
)

for (const [name, source] of [
  ['InstallerPreview', installerPreview],
  ['SetupWizard', setupWizard],
]) {
  assert.match(
    source,
    /const METIS_PREF_LANGUAGE_KEY = 'metis:prefs:language'/,
    `${name} should define the metis language preference key.`,
  )
  assert.match(
    source,
    /const LANGUAGE_OPTIONS = \['English', 'Español', 'Português', 'Français'\] as const/,
    `${name} should offer English, Spanish, Portuguese, and French during setup.`,
  )
  assert.match(
    source,
    /function getSystemSetupLanguage\(\): SetupLanguage[\s\S]*navigator\.languages[\s\S]*navigator\.language/,
    `${name} should detect the computer language when possible.`,
  )
  assert.match(
    source,
    /const \[selectedLanguage, setSelectedLanguage\] = useState<SetupLanguage>\(\(\) => getInitialSetupLanguage\(\)\)/,
    `${name} should initialize setup language from saved or system language.`,
  )
  assert.match(
    source,
    /useEffect\(\(\) => \{\s+applySetupLanguage\(selectedLanguage\)\s+\}, \[selectedLanguage\]\)/,
    `${name} should persist setup language when the setup language changes.`,
  )
}

console.log('PASS preferences and setup language static coverage')
