import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relativePath => fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')

const [modal, app, preload, main, types] = await Promise.all([
  read('src/components/RateMetisModal.tsx'),
  read('src/App.tsx'),
  read('electron/preload.ts'),
  read('electron/main.ts'),
  read('src/vite-env.d.ts'),
])

assert.match(modal, /Rate Metis/)
assert.match(modal, /role="dialog"/)
assert.match(modal, /width:\s*520/)
assert.match(modal, /height:\s*410/)
assert.match(modal, /<textarea/)
assert.match(modal, />\s*Send\s*</)
assert.match(modal, />\s*Cancel\s*</)
assert.doesNotMatch(modal, /borderBottom|borderTop/)

for (const feeling of ['Terrible', 'Disappointed', 'Uneasy', 'Neutral', 'Satisfied', 'Happy', 'Delighted']) {
  assert.match(modal, new RegExp(feeling))
}
for (const emoji of ['😣', '😞', '😕', '😐', '🙂', '😄', '🤩']) {
  assert.match(modal, new RegExp(emoji))
}

assert.match(app, /RateMetisModal/)
assert.match(app, /markSuccessfulLaunch/)
assert.match(app, /setShowRateMetis\(true\)/)
assert.match(preload, /markSuccessfulLaunch|feedback:mark-launch-success/)
assert.match(preload, /submitFeedback|feedback:submit/)
assert.match(preload, /declineFeedback|feedback:decline/)
assert.match(main, /telemetry-outbox\.json/)
assert.match(main, /feedback:get-status/)
assert.match(main, /feedback:mark-launch-success/)
assert.match(main, /feedback:submit/)
assert.match(main, /version:\s*app\.getVersion\(\)/)
assert.match(main, /build_variant:\s*isLiteBuild\(\)\s*\?\s*'lite'\s*:\s*'bundle'/)
assert.match(main, /platform:\s*process\.platform/)
assert.match(main, /arch:\s*process\.arch/)
assert.match(main, /feedback:decline/)
assert.match(main, /net\.isOnline\(\)/)
assert.match(main, /METIS_TELEMETRY_ENDPOINT/)
assert.match(types, /markSuccessfulLaunch/)
assert.match(types, /submitFeedback/)

console.log('PASS Rate Metis feedback modal, metadata payload, and offline telemetry contract')
