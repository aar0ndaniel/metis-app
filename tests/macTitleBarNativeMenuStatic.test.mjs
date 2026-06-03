import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const electronMain = await fs.readFile(path.join(workspaceRoot, 'electron/main.ts'), 'utf8')
const preload = await fs.readFile(path.join(workspaceRoot, 'electron/preload.ts'), 'utf8')
const appShell = await fs.readFile(path.join(workspaceRoot, 'src/App.tsx'), 'utf8')
const titleBar = await fs.readFile(path.join(workspaceRoot, 'src/components/TitleBar.tsx'), 'utf8')
const viteEnv = await fs.readFile(path.join(workspaceRoot, 'src/vite-env.d.ts'), 'utf8')
const nativeMenuSource = electronMain.slice(
  electronMain.indexOf('function installApplicationMenu'),
  electronMain.indexOf('function hasWorkspaceFileExtension'),
)

assert.match(
  electronMain,
  /Menu,\s*type MenuItemConstructorOptions/,
  'Electron main should import native Menu support for macOS.'
)

assert.match(
  electronMain,
  /function installApplicationMenu\(\)[\s\S]*process\.platform !== 'darwin'[\s\S]*Menu\.setApplicationMenu\(Menu\.buildFromTemplate\(template\)\)/,
  'macOS should install a native application menu instead of using only renderer menu tabs.'
)

assert.match(
  electronMain,
  /nativeMenuAction\('Run PLS-SEM', 'run-pls', 'Command\+Enter'\)/,
  'Native macOS Analysis menu should dispatch the existing PLS-SEM action.'
)

assert.match(
  electronMain,
  /installApplicationMenu\(\)[\s\S]*launchWindows\(\)/,
  'The native application menu should be installed before windows are launched.'
)

assert.match(
  electronMain,
  /titleBarStyle:\s*isSetup \? 'hidden' : 'hidden'/,
  'BrowserWindow should keep titleBarStyle hidden so macOS traffic lights remain native.'
)

assert.match(
  electronMain,
  /frame:\s*process\.platform === 'darwin' && isSetup/,
  'The main macOS app window should use a native frame so titleBarStyle hidden can show traffic lights.'
)

assert.match(
  nativeMenuSource,
  /label:\s*'File'[\s\S]*nativeMenuAction\('New Workspace', 'new-workspace'[\s\S]*nativeMenuAction\('New Model', 'new-model'[\s\S]*nativeMenuAction\('Open Workspace\.\.\.', 'open-workspace'[\s\S]*label:\s*'Open Recent'[\s\S]*label:\s*'No Recent Models'[\s\S]*nativeMenuAction\('Save', 'file:save'[\s\S]*nativeMenuAction\('Save As\.\.\.', 'file:save-as'[\s\S]*nativeMenuAction\('Import Dataset\.\.\.', 'import-dataset'[\s\S]*nativeMenuAction\('Import R Script\.\.\.', 'import-rscript'[\s\S]*nativeMenuAction\('Export R Script', 'results:export-r-script'[\s\S]*nativeMenuAction\('Close Model', 'canvas:go-home'/,
  'Native macOS File menu should expose the same explicit renderer File menu children and actions.'
)

assert.match(
  nativeMenuSource,
  /label:\s*'Edit'[\s\S]*nativeMenuAction\('Undo', 'edit:undo'[\s\S]*nativeMenuAction\('Redo', 'edit:redo'[\s\S]*nativeMenuAction\('Cut', 'edit:cut'[\s\S]*nativeMenuAction\('Copy', 'edit:copy'[\s\S]*nativeMenuAction\('Paste', 'edit:paste'[\s\S]*nativeMenuAction\('Delete', 'edit:delete'[\s\S]*nativeMenuAction\('Select All', 'edit:selectall'[\s\S]*nativeMenuAction\('Preferences', 'open-preferences', 'Command\+,'\)/,
  'Native macOS Edit menu should expose the same explicit renderer Edit menu children and actions.'
)

assert.match(
  nativeMenuSource,
  /label:\s*'View'[\s\S]*nativeMenuAction\('Zoom In', 'view:zoom-in'[\s\S]*nativeMenuAction\('Zoom Out', 'view:zoom-out'[\s\S]*nativeMenuAction\('Fit to Screen', 'view:fit-screen'[\s\S]*nativeMenuAction\('Zoom Control', 'view:toggle-zoom-control'[\s\S]*nativeMenuAction\('Indicators Panel', 'view:toggle-vars'[\s\S]*nativeMenuAction\('Properties Panel', 'view:toggle-props'/,
  'Native macOS View menu should expose the same explicit renderer View menu children and actions.'
)

assert.doesNotMatch(
  nativeMenuSource,
  /Toggle Zoom Control|Toggle Indicators Panel|Toggle Properties Panel|togglefullscreen/,
  'Native macOS View menu should not keep old labels or extra items missing from the React titlebar menu.'
)

assert.match(
  nativeMenuSource,
  /label:\s*'Analysis'[\s\S]*nativeMenuAction\('Run PLS-SEM', 'run-pls'[\s\S]*nativeMenuAction\('Run Bootstrap', 'run-bootstrap'[\s\S]*nativeMenuAction\('PLS Predict', 'run-pls-predict'[\s\S]*nativeMenuAction\('Advanced analysis', 'run-advanced-analysis'[\s\S]*label:\s*'Algorithm Settings', enabled:\s*false/,
  'Native macOS Analysis menu should expose the same explicit renderer Analysis menu children and actions.'
)

assert.match(
  nativeMenuSource,
  /label:\s*'Tark it'[\s\S]*nativeMenuAction\('Create Tark Report', 'open-tark'\)/,
  'Native macOS Tark menu should dispatch the same Tark action as the renderer menu.'
)

assert.match(
  nativeMenuSource,
  /label:\s*'Help'[\s\S]*nativeMenuAction\('Documentation', 'open-docs'[\s\S]*nativeMenuAction\('Getting Started', 'open-tour'[\s\S]*nativeMenuAction\('Feedback', 'open-feedback'[\s\S]*nativeMenuAction\('Report a Bug', 'open-report-bug'[\s\S]*nativeMenuAction\('Cite Metis', 'open-cite-metis'[\s\S]*nativeMenuAction\(`About \$\{appName\}`, 'open-about'\)/,
  'Native macOS Help menu should expose the same explicit renderer Help menu children and actions.'
)

assert.doesNotMatch(
  nativeMenuSource,
  /role:\s*'windowMenu'/,
  'Native macOS menu bar should stay scoped to metis, File, Edit, View, Analysis, Tark it, and Help.'
)

assert.match(
  preload,
  /onNativeMenuAction:\s*\(cb: \(action: string\) => void\) => \{[\s\S]*ipcRenderer\.on\('menu:action', handler\)/,
  'Preload should expose native menu actions to the renderer through a scoped listener.'
)

assert.match(
  viteEnv,
  /onNativeMenuAction: \(cb: \(action: string\) => void\) => \(\) => void/,
  'The renderer type contract should include native menu action subscriptions.'
)

assert.match(
  appShell,
  /onNativeMenuAction\?\.\(\(action: string\) => \{[\s\S]*new CustomEvent\('pls:action', \{ detail: \{ action \} \}\)/,
  'Native menu actions should reuse the existing renderer pls:action flow.'
)

assert.match(
  titleBar,
  /const isMac = typeof window !== 'undefined' && window\.electronAPI\?\.platform === 'darwin'/,
  'TitleBar should detect macOS from the Electron platform bridge.'
)

assert.match(
  titleBar,
  /padding:\s*isMac \? '0 16px 0 80px' : '0 16px'/,
  'macOS titlebar should reserve space for native traffic lights.'
)

assert.match(
  titleBar,
  /\{!isMac && <nav className="flex items-center no-drag"/,
  'Renderer menu tabs should be hidden on macOS because the native app menu owns them.'
)

assert.match(
  titleBar,
  /\{!isMac && <div[\s\S]*className="flex h-full items-center no-drag"/,
  'Windows-style renderer window controls should be hidden on macOS.'
)

assert.match(
  titleBar,
  /activeModelName\?: string/,
  'TitleBar should accept the active model name for macOS title chrome.'
)

assert.match(
  titleBar,
  /const showActiveModelTitle = isMac && \(currentScreen === 'canvas' \|\| currentScreen === 'results'\) && activeModelTitle\.length > 0/,
  'TitleBar should show the active model title only on macOS canvas and results screens.'
)

assert.match(
  appShell,
  /const currentResultsModelId = location\.pathname\.startsWith\('\/results\/'\)[\s\S]*location\.pathname\.startsWith\('\/tark-preview\/'\)/,
  'AppShell should resolve the active model id from results and Tark preview routes.'
)

assert.match(
  appShell,
  /const activeTitleModelName = \(\(\) => \{[\s\S]*stripModelDisplayName\(model\.name \|\| modelId\)[\s\S]*<TitleBar currentScreen=\{currentScreen\} theme=\{theme\} activeModelName=\{activeTitleModelName\} \/>/,
  'AppShell should pass the resolved active model name into the titlebar.'
)

console.log('PASS macOS native titlebar menu contract')
