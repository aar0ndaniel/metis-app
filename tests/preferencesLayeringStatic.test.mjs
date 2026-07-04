import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function readSource(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

const preferences = await readSource('src/components/PreferencesModal.tsx')
const modelCanvas = await readSource('src/pages/ModelCanvas.tsx')

const preferencesStage = preferences.match(/className="fixed inset-0 z-\[(\d+)\] overflow-hidden"/)
assert.ok(preferencesStage, 'Preferences full-screen stage should declare an explicit z-index.')

const zoomControl = modelCanvas.match(/id="canvas-zoom-control"[\s\S]*?zIndex:\s*(\d+)/)
assert.ok(zoomControl, 'Canvas zoom control should declare an explicit z-index.')

const bottomToolbar = modelCanvas.match(/bottom:\s*52,[\s\S]*?left:\s*'50%'[\s\S]*?zIndex:\s*(\d+)/)
assert.ok(bottomToolbar, 'Canvas bottom toolbar should declare an explicit z-index.')

const preferencesZ = Number(preferencesStage[1])
const zoomZ = Number(zoomControl[1])
const toolbarZ = Number(bottomToolbar[1])

assert.ok(
  preferencesZ > zoomZ,
  `Preferences full-screen stage z-index (${preferencesZ}) should sit above canvas zoom controls (${zoomZ}).`,
)
assert.ok(
  preferencesZ > toolbarZ,
  `Preferences full-screen stage z-index (${preferencesZ}) should sit above the canvas bottom toolbar (${toolbarZ}).`,
)

console.log('PASS preferences layering static coverage')
