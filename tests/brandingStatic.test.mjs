import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

function read(relPath) {
  return fs.readFileSync(path.join(workspaceRoot, relPath), 'utf8')
}

const pkg = JSON.parse(read('package.json'))
const OLD_BRAND_PATTERN = new RegExp([['WYT', 'HAM'].join(''), ['Wyt', 'ham'].join(''), ['wyt', 'ham'].join('')].join('|'))

assert.equal(pkg.name, 'metis')
assert.equal(pkg.version, '0.0.2')
assert.equal(pkg.description, 'metis')
assert.equal(pkg.author, 'metis team')
assert.equal(pkg.build.appId, 'com.metis.app')
assert.equal(pkg.build.productName, 'metis')
assert.equal(pkg.build.fileAssociations[0].name, 'metis Workspace')

const viteConfig = read('vite.config.ts')
assert.match(viteConfig, /__METIS_APP_NAME__:\s*JSON\.stringify\('metis'\)/)
assert.doesNotMatch(viteConfig, OLD_BRAND_PATTERN)

const appBranding = read('src/config/appBranding.ts')
assert.match(appBranding, /APP_BRAND_NAME\s*=\s*__METIS_APP_NAME__/)
assert.doesNotMatch(appBranding, OLD_BRAND_PATTERN)

const electronMain = read('electron/main.ts')
assert.match(electronMain, /METIS_PLUMBER_PORT/)
assert.match(electronMain, /X-METIS-TOKEN/)
assert.match(electronMain, /Software\\\\metis/)
assert.match(electronMain, /com\.metis\.app/)
assert.match(electronMain, /path\.join\(app\.getPath\('downloads'\), 'metis'\)/)
assert.match(electronMain, /src\/assets\/logo-primary\.svg/)
assert.doesNotMatch(electronMain, /src\/assets\/logo-dark-bg\.png/)
assert.match(electronMain, /gap: 8px;/)
assert.doesNotMatch(electronMain, /Public Beta v1/)
assert.doesNotMatch(electronMain, OLD_BRAND_PATTERN)

const preferences = read('src/components/PreferencesModal.tsx')
assert.doesNotMatch(preferences, /Public Beta v1/)
assert.match(preferences, /APP_BASE_RELEASE_LABEL/)

const plumber = read('r-api/plumber.R')
assert.match(plumber, /METIS_PLUMBER_TOKEN/)
assert.match(plumber, /HTTP_X_METIS_TOKEN/)
assert.match(plumber, /service = "metis-plumber"/)
assert.doesNotMatch(plumber, OLD_BRAND_PATTERN)
