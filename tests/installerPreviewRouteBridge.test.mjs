import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const appSource = await fs.readFile(path.join(workspaceRoot, 'src/App.tsx'), 'utf8')

assert.match(
  appSource,
  /<HashRouter>[\s\S]*<AppShell \/>[\s\S]*<\/HashRouter>/,
  'App should keep installer routes hash-based by rendering directly inside HashRouter.'
)

assert.doesNotMatch(appSource, /const INSTALLER_PREVIEW_ROUTES = \['\/installer-preview', '\/setup-wizard'\] as const/, 'App should not maintain a direct URL installer route bridge list.')

assert.match(
  appSource,
  /useState<AppTheme>\(\(\) => isInstallerPreview \? 'Light' : getSavedTheme\(\)\)/,
  'Installer routes should not inherit an existing dark app preference on first render.'
)

assert.match(
  appSource,
  /if \(isInstallerPreview\) \{\s+setTheme\('Light'\)\s+\} else \{\s+setTheme\(getSavedTheme\(\)\)\s+\}/,
  'Installer routes should reset their wrapper theme to Light when opened.'
)

assert.doesNotMatch(appSource, /function bridgeDirectInstallerRouteToHash\(\)/, 'App should not rewrite direct installer URLs to hash routes.')

assert.doesNotMatch(appSource, /window\.history\.replaceState\(null, '', `\/#\$\{directInstallerRoute\}`\)/, 'App should not modify history for direct installer routes.')

assert.doesNotMatch(appSource, /bridgeDirectInstallerRouteToHash\(\)/, 'App should not invoke installer route bridge logic before mounting.')

console.log('PASS installer routes remain hash-based without direct URL bridge')
