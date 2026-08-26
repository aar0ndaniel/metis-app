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

assert.match(modal, /What's new in Metis 0\.3\.1/)
assert.match(modal, /width:\s*680/)
assert.match(modal, /height:\s*420/)
assert.match(modal, /role="dialog"/)
assert.match(modal, /aria-modal="true"/)
assert.match(modal, /aria-live="polite"/)
assert.match(modal, /ArrowLeft|CaretLeft/)
assert.match(modal, /ArrowRight|CaretRight/)
assert.match(modal, /prefers-reduced-motion/)
assert.match(modal, /flexDirection:\s*'row'/)
assert.doesNotMatch(modal, /borderBottom:\s*'1px solid var\(--color-border\)'/)
assert.doesNotMatch(modal, /borderTop:\s*'1px solid var\(--color-border\)'/)
assert.doesNotMatch(modal, /Multilingual support \(Spanish, Portuguese & French\)/)
assert.doesNotMatch(modal, /Permutation Analysis \(MICOM\)/)
assert.doesNotMatch(modal, /Multi Group Analysis \(MGA\)/)

const expectedSlideOrder = [
  'Algorithm Preferences',
  'Missing Data Highlighting',
  'Missing Data Marker',
  'Tark reports',
  'Analysis menu',
]
let previousIndex = -1
for (const label of expectedSlideOrder) {
  const index = modal.indexOf(label)
  assert.ok(index > previousIndex, `Expected slide ${label} to appear in order.`)
  previousIndex = index
}

for (const url of [
  'https://metis.emend.it.com/docs.html',
  'https://metis.emend.it.com/tark-report.html',
]) {
  assert.match(modal, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

const captures = [
  'algorithm-preferences.png',
  'missing-data-highlighting.png',
  'missing-data-marker.png',
  'tark-report.png',
  'analysis-titlebar.png',
]
const newCaptures = new Set([
  'algorithm-preferences.png',
  'missing-data-highlighting.png',
  'missing-data-marker.png',
])
for (const capture of captures) {
  assert.match(modal, new RegExp(capture.replace('.', '\\.')))
  const assetPath = (await fs.stat(path.join(workspaceRoot, 'src/assets/onboarding/0.3.1', capture)).catch(() => null))
    ? path.join(workspaceRoot, 'src/assets/onboarding/0.3.1', capture)
    : path.join(workspaceRoot, 'src/assets/onboarding/0.3.0', capture)
  await fs.access(assetPath)
  if (newCaptures.has(capture)) {
    const png = await fs.readFile(assetPath)
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${capture} must be a PNG.`)
    assert.equal(png.readUInt32BE(16), 1100, `${capture} must be 1100px wide.`)
    assert.equal(png.readUInt32BE(20), 760, `${capture} must be 760px high.`)
  }
}

assert.match(app, /<WhatsNewModal/)
assert.match(app, /completeWhatsNew\(localStorage\)/)
assert.match(app, /resolveOnboardingStage\(localStorage\)/)
assert.match(app, /setShowTour\(true\)/)

console.log('PASS 0.3.1 What’s New modal contract')
