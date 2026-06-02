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

console.log('PASS macOS native titlebar menu contract')
