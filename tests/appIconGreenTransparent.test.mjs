import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relativePath => fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')

const [generator, greenLogo] = await Promise.all([
  read('scripts/gen_icon.py'),
  read('src/assets/logo-icon.svg'),
])

assert.match(generator, /SRC_SVG\s*=\s*REPO_ROOT\s*\/\s*"src"\s*\/\s*"assets"\s*\/\s*"logo-icon\.svg"/)
assert.match(greenLogo, /fill:\s*#aab68a/i)
assert.match(generator, /image\.fill\(Qt\.transparent\)/)
assert.doesNotMatch(generator, /Draw solid black background/)
assert.doesNotMatch(generator, /drawRoundedRect/)
assert.doesNotMatch(generator, /logo-white\.svg/)

console.log('PASS app icon uses the green transparent logo source')
