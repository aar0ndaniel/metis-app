import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const landingpageRoot = path.resolve(workspaceRoot, '..', 'landingpage')

const style = await fs.readFile(path.join(landingpageRoot, 'style.css'), 'utf8')
const script = await fs.readFile(path.join(landingpageRoot, 'script.js'), 'utf8')

assert.match(style, /@media \(min-width: 1441px\) \{[\s\S]*\.hero-inner \{[\s\S]*min-height: calc\(100vh - 104px\);[\s\S]*justify-content: center;[\s\S]*\}/, 'Ultrawide hero layout should center the hero stack vertically.')
assert.match(style, /@media \(min-width: 1441px\) \{[\s\S]*\.hero-text \{[\s\S]*padding-top: clamp\(8px, 1\.4vh, 20px\);[\s\S]*\}/, 'Ultrawide hero layout should give the text block a small top offset while staying centered.')
assert.match(script, /card\.style\.opacity = '1';[\s\S]*card\.style\.visibility = 'visible';[\s\S]*card\.style\.transform = 'scale\(1\)';/, 'Hero frame should remain visible at the initial state.')
assert.match(script, /const threshold = Math\.max\(window\.innerHeight \* 0\.72, 620\);[\s\S]*const scale = 1 \+ \(0\.16 \* progress\);[\s\S]*const panX = -12 \* progress;[\s\S]*const panY = 18 \* \(1 - progress\);/, 'Hero frame should scale up with scroll and drift slightly to show a framed pan.')
assert.doesNotMatch(script, /card\.style\.opacity = '0';[\s\S]*card\.style\.visibility = 'hidden';/, 'Hero video should no longer be hidden until scroll.')
assert.doesNotMatch(script, /zoomTarget|translateY\(34px\)|0\.94 \+ \(0\.18 \* progress\)/, 'Old hidden-and-shrink or video-only zoom behavior should not remain in the hero zoom logic.')

console.log('PASS landing page hero motion')
