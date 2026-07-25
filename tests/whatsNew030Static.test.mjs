import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relativePath => fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')

const [modal, app] = await Promise.all([
  read('src/components/WhatsNewModal.tsx'),
  read('src/App.tsx'),
])

assert.match(modal, /What's new in Metis 0\.3\.0/)
assert.match(modal, /width:\s*520/)
assert.match(modal, /height:\s*410/)
assert.match(modal, /role="dialog"/)
assert.match(modal, /aria-modal="true"/)
assert.match(modal, /aria-live="polite"/)
assert.match(modal, /ArrowLeft|CaretLeft/)
assert.match(modal, /ArrowRight|CaretRight/)
assert.match(modal, /prefers-reduced-motion/)

for (const label of [
  'Analysis menu',
  'Four interface languages',
  'Permutation Analysis (MICOM)',
  'Multi Group Analysis (MGA)',
  'Tark reports',
]) {
  assert.match(modal, new RegExp(label.replace(/[()]/g, '\\$&')))
}

for (const url of [
  'https://metis.emend.it.com/docs.html',
  'https://metis.emend.it.com/metis-micom.html',
  'https://metis.emend.it.com/tark-report.html',
]) {
  assert.match(modal, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

const captures = [
  'analysis-titlebar.png',
  'languages.png',
  'micom.png',
  'mga.png',
  'tark-report.png',
]
for (const capture of captures) {
  assert.match(modal, new RegExp(capture.replace('.', '\\.')))
  await fs.access(path.join(workspaceRoot, 'src/assets/onboarding/0.3.0', capture))
}

assert.match(app, /<WhatsNewModal/)
assert.match(app, /completeWhatsNew\(localStorage\)/)
assert.match(app, /resolveOnboardingStage\(localStorage\)/)
assert.match(app, /setShowTour\(true\)/)

console.log('PASS 0.3.0 What’s New modal contract')
