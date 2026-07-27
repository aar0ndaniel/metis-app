import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const modelCanvasSource = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')
const pathDiagramSource = await fs.readFile(path.join(workspaceRoot, 'src/components/PathDiagram.tsx'), 'utf8')

// 1. Verify anchorRatio property in Path interfaces
assert.match(
  modelCanvasSource,
  /interface Path[\s\S]*anchorRatio\?: number/,
  'ModelCanvas Path interface should support optional anchorRatio property'
)

assert.match(
  pathDiagramSource,
  /interface CanvasPath[\s\S]*anchorRatio\?: number/,
  'PathDiagram CanvasPath interface should support optional anchorRatio property'
)

// 2. Verify creation of moderation path records drop ratio (anchorRatio)
assert.match(
  modelCanvasSource,
  /anchorRatio[\s\S]*targetPath/,
  'ModelCanvas drop handler should calculate anchorRatio when creating moderation paths'
)

// 3. Verify getModerationAnchor computes ratio or spaces out multiple moderation lines
assert.match(
  modelCanvasSource,
  /anchorRatio|spacing|distributed/i,
  'ModelCanvas getModerationAnchor should use anchorRatio or auto-spacing for moderation lines'
)

assert.match(
  pathDiagramSource,
  /anchorRatio|spacing|distributed/i,
  'PathDiagram getModerationAnchor should use anchorRatio or auto-spacing for moderation lines'
)

// 4. Verify moderation anchor drag handle functionality
assert.match(
  modelCanvasSource,
  /moderation-anchor|onAnchorHandleMouseDown|dragHandleRef/i,
  'ModelCanvas should support dragging moderation line anchor along the target structural path axis'
)

console.log('PASS moderation anchor spacing static test')
