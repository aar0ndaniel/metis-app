import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const titleBar = await fs.readFile(path.join(workspaceRoot, 'src/components/TitleBar.tsx'), 'utf8')
const app = await fs.readFile(path.join(workspaceRoot, 'src/App.tsx'), 'utf8')
const preferences = await fs.readFile(path.join(workspaceRoot, 'src/components/PreferencesModal.tsx'), 'utf8')

assert.match(titleBar, /label: 'Documentation'[\s\S]*action: 'open-docs'/, 'Help Documentation should dispatch the open-docs action.')
assert.match(app, /METIS_DOCS_URL\s*=\s*'https:\/\/metis\.emend\.it\.com\/docs\.html'/, 'App should define the public docs URL.')
assert.match(app, /action === 'open-docs'[\s\S]*openMetisExternal\(METIS_DOCS_URL\)/, 'App should open docs externally from the Help menu.')

assert.match(preferences, /METIS_UPDATES_URL\s*=\s*'https:\/\/metis\.emend\.it\.com\/updates\.html'/, 'About should define the public updates URL.')
assert.match(preferences, /METIS_DOCS_URL\s*=\s*'https:\/\/metis\.emend\.it\.com\/docs\.html'/, 'About should define the public docs URL.')
assert.match(preferences, /onClick=\{\(\) => openMetisExternal\(METIS_UPDATES_URL\)\}/, 'Updates button should open the public updates page.')
assert.match(preferences, /onClick=\{\(\) => openMetisExternal\(METIS_DOCS_URL\)\}/, 'Docs button should open the public docs page.')

console.log('PASS Help and About external links')
