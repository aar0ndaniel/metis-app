import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const source = await fs.readFile(path.join(workspaceRoot, 'src/components/TitleBar.tsx'), 'utf8')

const logoWrapperMatch = source.match(/<div\s+className="flex items-center justify-center shrink-0"[\s\S]*?<AppLogo size=\{14\} variant=\{logoVariant\} \/>[\s\S]*?<\/div>/)

assert.ok(logoWrapperMatch, 'Title bar should keep a dedicated AppLogo wrapper.')

const logoWrapper = logoWrapperMatch[0]

assert.doesNotMatch(
  logoWrapper,
  /background(?:Color)?:/,
  'Title bar AppLogo wrapper should not set its own background.'
)

assert.doesNotMatch(
  logoWrapper,
  /border:/,
  'Title bar AppLogo wrapper should not set its own border.'
)

console.log('PASS title bar logo has no wrapper background or border')
