import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const installerPreview = await fs.readFile(path.join(workspaceRoot, 'src/pages/InstallerPreview.tsx'), 'utf8')
const setupWizard = await fs.readFile(path.join(workspaceRoot, 'src/pages/SetupWizard.tsx'), 'utf8')
const electronMain = await fs.readFile(path.join(workspaceRoot, 'electron/main.ts'), 'utf8')

for (const [name, source] of [
  ['InstallerPreview', installerPreview],
  ['SetupWizard', setupWizard],
]) {
  assert.match(source, /type SetupTheme = 'Dark' \| 'Light'/, `${name} should model the installer theme choice.`)
  assert.match(source, /const THEME_OPTIONS = \['Light', 'Dark'\] as const/, `${name} should offer the Pencil mockup's Light then Dark theme order.`)
  assert.match(source, /const INSTALLER_PREF_THEME_KEY = 'metis:installer:theme'/, `${name} should keep the installer theme choice separate from the app's existing theme.`)
  assert.match(source, /function getSystemSetupTheme\(\): SetupTheme[\s\S]*window\.matchMedia\('\(prefers-color-scheme: light\)'\)/, `${name} should read the system color scheme for setup defaults.`)
  assert.match(source, /function getInitialSetupTheme\(\): SetupTheme[\s\S]*localStorage\.getItem\(INSTALLER_PREF_THEME_KEY\)[\s\S]*getSystemSetupTheme\(\)/, `${name} should use the saved setup theme when present, then fall back to the system theme.`)
  assert.match(source, /function previewSetupTheme\(theme: SetupTheme\)[\s\S]*document\.documentElement\.setAttribute\('data-theme', theme === 'Light' \? 'light' : 'dark'\)/, `${name} should preview the initial system setup theme without saving it as a manual choice.`)
  assert.match(source, /localStorage\.setItem\(INSTALLER_PREF_THEME_KEY, theme\)/, `${name} should remember the installer theme choice.`)
  assert.match(source, /localStorage\.setItem\(METIS_PREF_THEME_KEY, theme\)/, `${name} should persist the metis theme key.`)
  assert.match(source, /localStorage\.setItem\(LEGACY_PREF_THEME_KEY, theme\)/, `${name} should persist the legacy theme key for the current App reader.`)
  assert.match(source, /window\.dispatchEvent\(new CustomEvent\('pls:preferences-updated'\)\)/, `${name} should notify the running shell when theme changes.`)
  assert.match(source, /function applySetupTheme\(theme: SetupTheme\)[\s\S]*previewSetupTheme\(theme\)/, `${name} should preview the selected theme immediately when saving a manual choice.`)
  assert.match(source, /const handleThemeChange = \(theme: SetupTheme\) => \{\s+setSelectedTheme\(theme\)\s+applySetupTheme\(theme\)\s+\}/, `${name} should only remember a setup theme after the user changes it.`)
  assert.match(source, /useEffect\(\(\) => \{\s+previewSetupTheme\(selectedTheme\)\s+\}, \[selectedTheme\]\)/, `${name} should apply the detected system theme to the preview without marking it changed by the user.`)
  assert.doesNotMatch(source, /const handleInstall = async \(\) => \{\s+applySetupTheme\(selectedTheme\)/, `${name} should not save the detected setup theme just because installation starts.`)
  assert.match(source, /const FF = 'Matter, sans-serif'/, `${name} should use the local Matter font instead of Inter.`)
  assert.match(source, /(?:Appearance\s*<\/span>|ThemeToggle)/, `${name} should expose the simplified Appearance section.`)
  assert.match(source, /const Icon = option === 'Light' \? Sun : Moon/, `${name} should use Phosphor icons in the appearance control.`)
  assert.match(source, /<Icon size=\{(?:12|9)\}/, `${name} should render the Phosphor icon in the appearance control.`)
  assert.doesNotMatch(source, /function ThemePreviewMockup/, `${name} should not render the old large theme mockups.`)
  assert.match(source, /overflow: 'hidden'[\s\S]{0,500}<img[\s\S]{0,300}(?:maxWidth|objectFit)/, `${name} should clip and size the app logo inside its frame.`)
  assert.match(source, /import logoWhite from '\.\.\/assets\/logo-white\.svg'/, `${name} should import the white logo asset for dark mode.`)
  assert.match(source, /const logoSrc\s*=\s*selectedTheme === 'Light' \? logoBlack : logoWhite/, `${name} should use white logo in dark theme and black logo in light theme.`)
  assert.match(source, /type SetupLanguage = 'English' \| 'Español' \| 'Português' \| 'Français'/, `${name} should model the supported setup languages.`)
  assert.match(source, /const LANGUAGE_OPTIONS = \['English', 'Español', 'Português', 'Français'\] as const/, `${name} should offer English, Spanish, Portuguese, and French in setup.`)
  assert.match(source, /function getSystemSetupLanguage\(\): SetupLanguage[\s\S]*navigator\.languages[\s\S]*navigator\.language/, `${name} should try to detect the computer language for setup defaults.`)
  assert.match(source, /function getSystemSetupLanguage\(\): SetupLanguage[\s\S]*for \(const candidate of candidates\)[\s\S]*if \(language\) return language[\s\S]*return 'English'/, `${name} should fall back to English when the computer language is unsupported.`)
  assert.match(source, /function getInitialSetupLanguage\(\): SetupLanguage[\s\S]*localStorage\.getItem\(METIS_PREF_LANGUAGE_KEY\)[\s\S]*localStorage\.getItem\(LEGACY_PREF_LANGUAGE_KEY\)[\s\S]*getSystemSetupLanguage\(\)/, `${name} should use saved language first, then fall back to the computer language.`)
  assert.match(source, /function applySetupLanguage\(language: SetupLanguage\)[\s\S]*localStorage\.setItem\(METIS_PREF_LANGUAGE_KEY, language\)[\s\S]*localStorage\.setItem\(LEGACY_PREF_LANGUAGE_KEY, language\)/, `${name} should persist setup language to the metis and legacy language keys.`)
  assert.match(source, /(?:LanguageChoice|LanguageDropdown)[\s\S]*LANGUAGE_OPTIONS\.map[\s\S]*selectedLanguage[\s\S]*setSelectedLanguage/, `${name} should render a setup language selector.`)

  for (const redundantCopy of [
    /Trying not to disturb the p-values/,
    /Building a safe space for significant relationships/,
    /Giving the equations a comfortable place to live/,
    /Helping the models feel statistically supported/,
    /Reducing setup bias to acceptable levels/,
  ]) {
    assert.doesNotMatch(source, redundantCopy, `${name} should avoid redundant installer chatter.`)
  }
}

assert.match(setupWizard, /remotes::install_github\("sem-in-r\/seminrExtras"\)/, 'Setup wizard should install seminrExtras from GitHub.')
assert.match(setupWizard, /remotes::install_github\("sem-in-r\/seminr", subdir = "seminrExtras"\)/, 'Setup wizard should keep the GitHub fallback for seminrExtras.')
assert.doesNotMatch(setupWizard, /install\.packages\([^)]*seminrExtras/, 'Setup wizard should not ask users to install seminrExtras from CRAN.')
assert.match(electronMain, /const required = \[[^\]]*'seminrExtras'[^\]]*\]/, 'Lite package verification should require seminrExtras.')
assert.match(setupWizard, /stage === 'finding-r'\s+\? 'Detecting R'/, 'Setup wizard should show R detection as progress subtext.')
assert.match(setupWizard, /stage === 'pkgs-failed'[\s\S]*2 packages missing|missingPackageCount/, 'Setup wizard should keep a simplified package-missing screen.')
assert.match(setupWizard, /<Copy size=\{(?:11|10)\}/, 'Setup wizard should keep the package snippet copy action.')
assert.doesNotMatch(setupWizard, /We'll auto-detect your R install during setup\./, 'Setup wizard should not repeat the R auto-detection hint on the first screen.')
assert.match(setupWizard, /(?:const renderRPaused|stage === 'r-paused')[\s\S]*background:\s*'transparent'[\s\S]*border:\s*'none'[\s\S]*Need R/, 'Setup wizard Need R helper row should not render an outer filled card or border.')
assert.match(setupWizard, /(?:phase === 'installing'|renderInstalling)[\s\S]*\{activeStep\.label\}/, 'Setup wizard loading panel should show progress without a filled card or border.')
assert.match(installerPreview, /const SETUP_VERB = IS_WINDOWS \? 'Install' : 'Set up'/, 'Bundle setup preview should use platform-appropriate setup wording.')
assert.match(installerPreview, /IS_WINDOWS && \([\s\S]*Add desktop shortcut/, 'Bundle setup preview should only offer desktop shortcuts on Windows.')
assert.match(installerPreview, /createShortcut: IS_WINDOWS && createShortcut/, 'Bundle setup should not request Windows shortcuts on macOS or Linux.')
assert.match(installerPreview, /PATH_SEPARATOR = IS_WINDOWS \? '\\\\' : '\/'/, 'Bundle setup preview should render platform path separators.')
assert.match(setupWizard, /const RSCRIPT_LABEL = IS_WINDOWS \? 'Rscript\.exe' : 'Rscript'/, 'Lite setup should label the R launcher correctly on each platform.')
assert.match(setupWizard, /RSCRIPT_DEFAULT_PATH = IS_WINDOWS[\s\S]*Library\/Frameworks\/R\.framework\/Resources\/bin[\s\S]*\/usr\/bin/, 'Lite setup should use platform-specific R browse defaults.')
assert.match(setupWizard, /R_DOWNLOAD_URL = IS_WINDOWS[\s\S]*bin\/windows\/base\/[\s\S]*bin\/macosx\/[\s\S]*bin\/linux\//, 'Lite setup should open the right CRAN page for each platform.')
assert.match(setupWizard, /placeholder=\{RSCRIPT_PLACEHOLDER\}/, 'Lite setup should show a platform-specific Rscript placeholder.')
assert.match(setupWizard, /PATH_SEPARATOR = IS_WINDOWS \? '\\\\' : '\/'/, 'Lite setup should render platform path separators.')
assert.doesNotMatch(setupWizard, /Detected R version:/, 'Setup wizard should hide technical R version details in the package-missing UI.')
assert.doesNotMatch(setupWizard, /R home:/, 'Setup wizard should hide technical R home details in the package-missing UI.')
assert.doesNotMatch(setupWizard, /Library 1:/, 'Setup wizard should hide technical library path details in the package-missing UI.')
assert.doesNotMatch(setupWizard, /Re-verify Packages/, 'Setup wizard should use the shorter mockup button label.')
assert.doesNotMatch(setupWizard, /title: 'Locate Rscript\.exe'/, 'Lite setup should not hard-code the Windows Rscript browser title.')
assert.doesNotMatch(setupWizard, /openExternal\?\.\('https:\/\/cran\.r-project\.org\/bin\/windows\/base\/'\)/, 'Lite setup should not hard-code the Windows CRAN page.')
assert.doesNotMatch(installerPreview, /overflowY:\s*'auto'/, 'Installer preview should fit the simplified theme choices without a vertical scroll area.')
assert.match(installerPreview, /(?:className="installer-preview-phase-content"|overflow:\s*'hidden')/, 'Installer preview phase content should stay visible inside the taller shell.')
assert.match(electronMain, /const installerPreviewWidth = 450/, 'Installer windows should use the approved width.')
assert.match(electronMain, /const installerPreviewHeight = 237/, 'Installer windows should use the approved height.')
assert.match(electronMain, /width:\s+isSetup \? 1400 : installerPreviewWidth/, 'Bundle and Lite installer windows should share the same compact width.')
assert.match(electronMain, /height:\s+isSetup \? 900\s+: installerPreviewHeight/, 'Bundle and Lite installer windows should share the same compact height.')
assert.match(electronMain, /minWidth:\s*isSetup \? 1024 : installerPreviewWidth/, 'Installer minimum width should match the compact shell.')
assert.match(electronMain, /maxWidth:\s*isSetup \? undefined : installerPreviewWidth/, 'Installer maximum width should match the compact shell.')

console.log('PASS installer and setup wizard theme/package setup')
