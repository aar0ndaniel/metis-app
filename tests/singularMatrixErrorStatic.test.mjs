import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const canvasSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const plumberSource = await fs.readFile(path.join(workspaceRoot, 'r-api/plumber.R'), 'utf8')

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`)
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`)
  return source.slice(start, end)
}

const laymanErrorFormatter = sliceBetween(canvasSource, 'function toLaymanErrorMessage', 'function getAnalysisLabel')
const backendDetailIndex = laymanErrorFormatter.indexOf('Backend detail:')
const canvasSingularIndex = laymanErrorFormatter.indexOf('perfectly duplicated or collinear')

assert.notEqual(canvasSingularIndex, -1, 'ModelCanvas should explain singular matrix backend failures in plain language.')
assert.ok(
  canvasSingularIndex < backendDetailIndex,
  'ModelCanvas should map singular matrix failures before falling back to raw Backend detail text.',
)
assert.match(
  laymanErrorFormatter,
  /dgesv|exactly singular|singular matrix|computationally singular/,
  'ModelCanvas should recognize common singular-matrix backend wording.',
)

const rErrorFormatter = sliceBetween(plumberSource, 'format_analysis_error_message <- function', 'format_configured_max_error <- function')
const rawMessageReturnIndex = rErrorFormatter.lastIndexOf('\n  message\n')
const rSingularIndex = rErrorFormatter.indexOf('perfectly duplicated or collinear')

assert.notEqual(rSingularIndex, -1, 'R backend should translate singular matrix failures before returning them to the UI.')
assert.ok(
  rSingularIndex < rawMessageReturnIndex || rawMessageReturnIndex === -1,
  'R backend should map singular matrix failures before returning the raw R message.',
)
assert.match(
  rErrorFormatter,
  /dgesv|exactly singular|singular matrix|computationally singular/,
  'R backend should recognize common singular-matrix error text.',
)

console.log('PASS singular matrix error messaging static contract')
