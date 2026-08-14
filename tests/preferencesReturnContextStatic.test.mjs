import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const appSource = fs.readFileSync(path.join(here, '..', 'src', 'App.tsx'), 'utf8')

assert.match(
  appSource,
  /preferencesReturnLocationRef\s*=\s*useRef<[^>]*>\(null\)/,
  'AppShell should keep the location that opened Preferences.'
)
assert.match(
  appSource,
  /preferencesReturnLocationRef\.current\s*=\s*\{/,
  'Opening Preferences should capture the complete routed location.'
)
assert.match(appSource, /pathname:\s*location\.pathname/, 'Preferences return context should include pathname.')
assert.match(appSource, /search:\s*location\.search/, 'Preferences return context should include query parameters.')
assert.match(appSource, /hash:\s*location\.hash/, 'Preferences return context should include the hash fragment.')
assert.match(
  appSource,
  /const\s+closePreferences\s*=\s*useCallback\(\(\)\s*=>\s*\{[\s\S]*?preferencesReturnLocationRef\.current[\s\S]*?setPrefsOpen\(false\)[\s\S]*?navigate\(returnLocation\)/,
  'Closing Preferences should restore the captured location when necessary.'
)
assert.match(
  appSource,
  /<PreferencesModal[^>]*onClose=\{closePreferences\}/,
  'PreferencesModal should use the navigation-aware close handler.'
)

console.log('PASS preferences return context static coverage')
