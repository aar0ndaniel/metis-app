import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const modalSource = await fs.readFile(path.join(workspaceRoot, 'src/components/CalculatingModal.tsx'), 'utf8')
const chipSource = await fs.readFile(path.join(workspaceRoot, 'src/components/CalculatingChip.tsx'), 'utf8')
const canvasSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const resultsSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')
const contextSource = await fs.readFile(path.join(workspaceRoot, 'src/state/calculationContext.tsx'), 'utf8')

assert.doesNotMatch(
  modalSource,
  /Estimated time|Elapsed|active\.estimatedSeconds|formatDuration|startedAt|setInterval|setNow/,
  'Calculating modal should not render or calculate estimated/elapsed timing details.',
)

assert.match(
  modalSource,
  /dispatch\(\{ type: 'hide' \}\)/,
  'Calculating modal should keep the Hide affordance while a calculation runs.',
)

assert.doesNotMatch(
  chipSource,
  /estimatedSeconds|formatEstimate|Est\.|bg-neutral-|text-neutral-|border-neutral-|hover:bg-neutral-/,
  'Hidden calculation chip should not show estimated timing or force dark neutral styling in light theme.',
)

assert.match(
  chipSource,
  /background:\s*'var\(--color-panel-pop\)'[\s\S]*color:\s*'var\(--color-text-primary\)'[\s\S]*border:\s*'1px solid var\(--color-border\)'/,
  'Hidden calculation chip should use theme tokens for light and dark themes.',
)

assert.doesNotMatch(
  `${contextSource}\n${canvasSource}\n${resultsSource}`,
  /estimatedSeconds|estimateBootstrapSeconds|formatBootstrapEstimate/,
  'Calculation state and run launchers should no longer carry estimated timing values.',
)

console.log('PASS calculating modal timing static contract')
