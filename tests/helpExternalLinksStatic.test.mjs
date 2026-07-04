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
assert.match(titleBar, /function buildTarkMenu\(\): MenuItem\[\]/, 'TitleBar should define a top-level Tark menu.')
assert.match(titleBar, /\{ label: 'Tark it', items: buildTarkMenu\(\), width: 220 \},\s*\n\s*\{ label: 'Help', items: buildHelpMenu\(\), width: 240 \}/, 'Tark it should be a menu tab immediately before Help.')
assert.match(titleBar, /label: 'Create Tark Report'[\s\S]*action: 'open-tark'/, 'Tark menu should open the Tark report flow.')
assert.match(titleBar, /label: 'Feedback'[\s\S]*action: 'open-feedback'/, 'Help should expose feedback.')
assert.match(titleBar, /label: 'Report a Bug'[\s\S]*action: 'open-report-bug'/, 'Help should expose bug reporting.')
assert.match(titleBar, /label: 'Cite Metis'[\s\S]*action: 'open-cite-metis'/, 'Help should expose the Metis citation page.')
assert.match(titleBar, /menu\.label === 'Help' \? 'tour-help'/, 'Help menu tab should be available as the onboarding target for feedback guidance.')
assert.doesNotMatch(titleBar, /id="tour-feedback"/, 'Feedback should no longer render as a separate titlebar button near the window controls.')
assert.doesNotMatch(titleBar, /PLS-SEM Reference/, 'Help should replace the old reference placeholder with Cite Metis.')
assert.doesNotMatch(titleBar, /feedback\.html/, 'TitleBar should not point feedback at the old feedback page.')
assert.match(app, /METIS_DOCS_URL\s*=\s*'https:\/\/metis\.emend\.it\.com\/docs\.html'/, 'App should define the public docs URL.')
assert.match(app, /METIS_FEEDBACK_URL\s*=\s*'https:\/\/metis\.emend\.it\.com\/submit-feedback\.html'/, 'App should define the public general feedback URL.')
assert.match(app, /METIS_BUG_REPORT_URL\s*=\s*'https:\/\/github\.com\/aar0ndaniel\/metis-app\/issues\/new\?labels=bug'/, 'App should define the public bug report URL.')
assert.match(app, /METIS_CITATION_URL\s*=\s*'https:\/\/metis\.emend\.it\.com\/how-to-cite\.html'/, 'App should define the public citation URL from the landing page.')
assert.match(app, /action === 'open-docs'[\s\S]*openMetisExternal\(METIS_DOCS_URL\)/, 'App should open docs externally from the Help menu.')
assert.match(app, /action === 'open-feedback'[\s\S]*openMetisExternal\(METIS_FEEDBACK_URL\)/, 'App should open the website feedback form from Help and the titlebar feedback button.')
assert.match(app, /action === 'open-report-bug'[\s\S]*openMetisExternal\(METIS_BUG_REPORT_URL\)/, 'App should open the GitHub bug form from Help.')
assert.match(app, /action === 'open-cite-metis'[\s\S]*openMetisExternal\(METIS_CITATION_URL\)/, 'App should open the landing-page citation guidance from Help.')

assert.match(preferences, /METIS_UPDATES_URL\s*=\s*'https:\/\/metis\.emend\.it\.com\/updates\.html'/, 'About should define the public updates URL.')
assert.match(preferences, /METIS_DOCS_URL\s*=\s*'https:\/\/metis\.emend\.it\.com\/docs\.html'/, 'About should define the public docs URL.')
assert.match(preferences, /onClick=\{\(\) => openMetisExternal\(METIS_UPDATES_URL\)\}/, 'Updates button should open the public updates page.')
assert.match(preferences, /onClick=\{\(\) => openMetisExternal\(METIS_DOCS_URL\)\}/, 'Docs button should open the public docs page.')

console.log('PASS Help and About external links')
