import { rm } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const debugFiles = [
  path.join(repoRoot, 'release', 'bundle', 'builder-debug.yml'),
  path.join(repoRoot, 'release', 'lite', 'builder-debug.yml'),
]

await Promise.all(debugFiles.map((target) => rm(target, { force: true })))
