import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const pathDiagramSource = await fs.readFile(path.join(workspaceRoot, 'src/components/PathDiagram.tsx'), 'utf8')
const resultsViewSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ResultsView.tsx'), 'utf8')

assert.match(
  pathDiagramSource,
  /interface CanvasPath[\s\S]*kind\?: 'direct' \| 'moderation'[\s\S]*targetPathId\?: string/,
  'Results path diagram should preserve moderation path metadata.'
)

assert.match(
  pathDiagramSource,
  /p\.kind === 'moderation'[\s\S]*targetPathId[\s\S]*lookupModerationPathResult/,
  'Results path diagram should render moderation paths through their target structural path and interaction result.'
)

assert.match(
  resultsViewSource,
  /function buildPathDiagramSvg[\s\S]*p\.kind === 'moderation'[\s\S]*targetPathId[\s\S]*IV\*Moderator/,
  'Exported results report diagram should render moderation paths as moderator-to-target-path arrows.'
)

assert.match(
  resultsViewSource,
  /deriveModerationSummaryRows[\s\S]*deriveModerationSlopeRows[\s\S]*deriveModerationR2ChangeRows[\s\S]*deriveModerationBootstrapRows/,
  'ResultsView should import and use derived moderation result panels.'
)

assert.match(
  resultsViewSource,
  /effectiveSelectedPanel === 'r-square'[\s\S]*moderationR2Rows/,
  'R-square panel should receive moderation R2 change rows when interactions exist.'
)

assert.match(
  resultsViewSource,
  /interaction\.type === 'pathLabel'[\s\S]*path\.kind === 'moderation'[\s\S]*targetPathId[\s\S]*labelT: nextT/,
  'Moderation path statistics should be draggable along the moderator-to-target-path arrow.'
)

console.log('PASS moderation results static coverage')
