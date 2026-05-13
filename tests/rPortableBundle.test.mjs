import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { REQUIRED_R_PACKAGES, syncRPortableZip } from '../scripts/sync-r-portable-zip.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const requiredPackages = ['jsonlite', 'Matrix', 'plumber', 'readxl', 'seminr', 'seminrExtras', 'semPower']
const requiredPackageVersions = {
  seminrExtras: '1.0.0',
}

assert.deepEqual(
  REQUIRED_R_PACKAGES,
  requiredPackages,
  'The bundle verifier should guard every R package required by the backend.'
)

assert.equal(
  requiredPackageVersions.seminrExtras,
  '1.0.0',
  'Bundle builds should require seminrExtras 1.0.0, not an older zip copy.'
)

const packageJson = JSON.parse(await fs.readFile(path.join(workspaceRoot, 'package.json'), 'utf8'))
const bundleScript = packageJson.scripts?.['build:bundle:win'] ?? ''

assert.match(
  bundleScript,
  /node scripts\/sync-r-portable-zip\.mjs/,
  'Windows Bundle builds should sync and verify R-Portable.zip before packaging.'
)
assert.ok(
  bundleScript.indexOf('node scripts/sync-r-portable-zip.mjs') < bundleScript.indexOf('electron-builder'),
  'R-Portable.zip must be synced before electron-builder copies it into the bundle.'
)

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'metis-r-portable-'))
const sourceDir = path.join(tempRoot, 'R-Portable')
const zipPath = path.join(tempRoot, 'R-Portable.zip')

for (const packageName of requiredPackages) {
  const packageDir = path.join(sourceDir, 'App', 'R-Portable', 'library', packageName)
  await fs.mkdir(packageDir, { recursive: true })
  await fs.writeFile(
    path.join(packageDir, 'DESCRIPTION'),
    `Package: ${packageName}\nVersion: ${requiredPackageVersions[packageName] ?? '1.0.0'}\n`,
    'utf8'
  )
}

const staleZip = new JSZip()
for (const packageName of requiredPackages) {
  staleZip.file(
    `R-Portable/App/R-Portable/library/${packageName}/DESCRIPTION`,
    `Package: ${packageName}\nVersion: ${packageName === 'seminrExtras' ? '0.9.0' : requiredPackageVersions[packageName] ?? '1.0.0'}\n`
  )
}
await fs.writeFile(zipPath, await staleZip.generateAsync({ type: 'nodebuffer' }))

const logs = []
const originalLog = console.log
console.log = (...args) => logs.push(args.join(' '))

try {
  await syncRPortableZip({
    sourceDir,
    zipPath,
    skipRuntimeCheck: true,
  })
} finally {
  console.log = originalLog
}

const zip = await JSZip.loadAsync(await fs.readFile(zipPath))
for (const packageName of requiredPackages) {
  const description = zip.file(`R-Portable/App/R-Portable/library/${packageName}/DESCRIPTION`)
  assert.ok(description, `R-Portable.zip should include ${packageName}.`)
  const content = await description.async('string')
  if (requiredPackageVersions[packageName]) {
    assert.match(
      content,
      new RegExp(`^Version:\\s*${requiredPackageVersions[packageName].replace('.', '\\.')}$`, 'm'),
      `R-Portable.zip should include ${packageName} ${requiredPackageVersions[packageName]}.`
    )
  }
}

assert.match(logs.join('\n'), /seminrExtras/, 'Verification output should name seminrExtras explicitly.')

console.log('PASS R portable bundle coverage')
