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
const logoButtonMatch = source.match(/const brandButton[\s\S]*?<button[\s\S]*?<AppLogo size=\{14\} variant=\{logoVariant\} \/>[\s\S]*?<\/button>/)

assert.ok(logoButtonMatch, 'Title bar should keep the logo inside the brand button.')

const logoButton = logoButtonMatch[0]

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

assert.match(
  logoButton,
  /\{!isMac && \([\s\S]*\{APP_BRAND_NAME\}/,
  'Title bar brand button should show the app name with the logo on Windows and other non-macOS platforms.'
)

assert.match(
  source,
  /metis:titlebar-logo-home-hint-seen[\s\S]*Back to Workspaces/,
  'Canvas mode should show a small accent callout on the logo explaining it returns to Workspaces.'
)

assert.match(
  source,
  /background:\s*'var\(--color-accent\)'[\s\S]*color:\s*'#111111'/,
  'Logo callout should use the accent color with compact high-contrast text.'
)

console.log('PASS title bar logo has no wrapper background or border and owns the canvas hint')
