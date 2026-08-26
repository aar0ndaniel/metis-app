import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'src/pages/ModelCanvas.tsx'), 'utf8')

assert.match(source, /const DRAFT_WRITE_DEBOUNCE_MS = 300/, 'ModelCanvas should debounce local recovery writes during rapid canvas updates.')
assert.match(source, /pendingDraftWriteRef/, 'ModelCanvas should keep the latest local recovery draft pending while debouncing writes.')
assert.match(source, /flushPendingDraftWrite/, 'ModelCanvas should be able to flush a pending local recovery draft before save/navigation.')
assert.match(source, /cancelPendingDraftWrite/, 'ModelCanvas should cancel pending local recovery writes after a clean save.')

assert.match(source, /const WORKSPACE_SAVE_DEBOUNCE_MS = 2_000/, 'ModelCanvas should debounce full workspace .metisws saves after canvas edits.')
assert.match(source, /queueWorkspaceSnapshotSave/, 'ModelCanvas should queue full workspace saves instead of writing every edit synchronously.')
assert.match(
  source,
  /const commit = useCallback\(\(newC: Construct\[\], newP: Path\[\]\) => \{[\s\S]*persistCanvasSnapshot\(newC, newP, \{ workspaceSave: 'debounced' \}\)/,
  'Canvas commits should queue the expensive workspace save path.',
)

const liveCalcStart = source.search(/useEffect\(\(\) => \{\r?\n\s+if \(!realtimeEnabled\) return/)
assert.notEqual(liveCalcStart, -1, 'ModelCanvas should contain the real-time calculation effect.')
const liveCalcEnd = source.indexOf('  // Context Menu Global Dismiss', liveCalcStart)
assert.notEqual(liveCalcEnd, -1, 'ModelCanvas real-time calculation effect should end before the context menu effect.')
const liveCalcEffect = source.slice(liveCalcStart, liveCalcEnd)
const beforeLiveTimeout = liveCalcEffect.slice(0, liveCalcEffect.indexOf('liveCalcTimer.current = setTimeout'))

assert.doesNotMatch(
  beforeLiveTimeout,
  /resolveDatasetFilePath\(\)/,
  'Real-time calculation should not resolve/log dataset paths on every canvas movement before its debounce fires.',
)
assert.match(
  liveCalcEffect,
  /liveCalcTimer\.current = setTimeout\(async \(\) => \{[\s\S]*const datasetFilePath = resolveDatasetFilePath\(\)/,
  'Real-time calculation should resolve the dataset path only inside the debounced calculation callback.',
)
assert.match(
  liveCalcEffect,
  /\}, \[currentGraphSignature,.*realtimeEnabled\]\)/,
  'Real-time calculation should react only to the statistical graph signature, so construct renames and visual edits do not recalculate.',
)

console.log('PASS model canvas performance contract')
