import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('SetupWizard contains telemetry consent state and Esc keyboard handler', () => {
  const wizardPath = path.join(process.cwd(), 'src', 'pages', 'SetupWizard.tsx')
  const content = fs.readFileSync(wizardPath, 'utf-8')

  assert.ok(content.includes('telemetryConsent'), 'SetupWizard should manage telemetryConsent state')
  assert.ok(content.includes('setTelemetryConsent'), 'SetupWizard should call electronAPI.setTelemetryConsent')
  assert.ok(/Anonymous (?:Installation )?[Tt]elemetry/.test(content), 'SetupWizard should render Telemetry header')
  assert.ok(content.includes("e.key === 'Escape'"), 'SetupWizard should support Esc shortcut to decline telemetry')
})

test('InstallerPreview contains real telemetry consent state', () => {
  const previewPath = path.join(process.cwd(), 'src', 'pages', 'InstallerPreview.tsx')
  const content = fs.readFileSync(previewPath, 'utf-8')

  assert.ok(content.includes('telemetryConsent'), 'InstallerPreview should manage real telemetry consent state')
  assert.ok(content.includes('setTelemetryConsent'), 'InstallerPreview should call electronAPI.setTelemetryConsent')
})

console.log('✔ telemetrySetupStatic.test.mjs passed!')
