import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const source = await fs.readFile(path.join(workspaceRoot, 'src/components/TitleBar.tsx'), 'utf8')
const analysisMenuMatch = source.match(/function buildAnalysisMenu[\s\S]*?\n\}/)

assert.ok(analysisMenuMatch, 'TitleBar should keep a buildAnalysisMenu function.')

const analysisMenu = analysisMenuMatch[0]

assert.doesNotMatch(
  analysisMenu,
  /label:\s*'Correlation'/,
  'Analysis menu should not show the disabled Correlation item.'
)

assert.doesNotMatch(
  analysisMenu,
  /label:\s*'Regression'/,
  'Analysis menu should not show the disabled Regression item.'
)

assert.match(
  analysisMenu,
  /label:\s*'Advanced analysis'/,
  'Analysis menu should still include Advanced analysis.'
)

console.log('PASS title bar analysis menu contract')
