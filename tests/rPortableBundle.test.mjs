import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { REQUIRED_R_PACKAGES, REQUIRED_R_RUNTIME_FILES, syncRPortableZip } from '../scripts/sync-r-portable-zip.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const requiredPackages = ['jsonlite', 'Matrix', 'plumber', 'readxl', 'seminr', 'seminrExtras', 'semPower']
const requiredPackageVersions = {
  seminr: '2.5.0',
  seminrExtras: '1.0.0',
}

assert.deepEqual(
  REQUIRED_R_PACKAGES,
  requiredPackages,
  'The bundle verifier should guard every R package required by the backend.'
)

assert.deepEqual(
  REQUIRED_R_RUNTIME_FILES.map((entry) => entry.label),
  ['Rblas.dll'],
  'The bundle verifier should guard the BLAS runtime binary so optimized math ships in R-Portable.zip.'
)

assert.equal(
  requiredPackageVersions.seminr,
  '2.5.0',
  'Bundle builds should require SEMinR 2.5.0 so prediction supports all interaction methods.'
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
const sourceRblasPath = path.join(sourceDir, 'App', 'R-Portable', 'bin', 'x64', 'Rblas.dll')
const optimizedRblasBytes = Buffer.from('optimized-rblas')
await fs.mkdir(path.dirname(sourceRblasPath), { recursive: true })
await fs.writeFile(sourceRblasPath, optimizedRblasBytes)

const staleZip = new JSZip()
for (const packageName of requiredPackages) {
  staleZip.file(
    `R-Portable/App/R-Portable/library/${packageName}/DESCRIPTION`,
    `Package: ${packageName}\nVersion: ${
      packageName === 'seminr' ? '2.4.2' : packageName === 'seminrExtras' ? '0.9.0' : requiredPackageVersions[packageName] ?? '1.0.0'
    }\n`
  )
}
staleZip.file('R-Portable/App/R-Portable/bin/x64/Rblas.dll', Buffer.from('reference-rblas'))
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

const rblasEntry = zip.file('R-Portable/App/R-Portable/bin/x64/Rblas.dll')
assert.ok(rblasEntry, 'R-Portable.zip should include Rblas.dll.')
assert.deepEqual(
  await rblasEntry.async('nodebuffer'),
  optimizedRblasBytes,
  'R-Portable.zip should refresh Rblas.dll from the extracted source runtime.'
)

assert.match(logs.join('\n'), /seminr 2\.5\.0/, 'Verification output should name the required SEMinR version explicitly.')
assert.match(logs.join('\n'), /seminrExtras/, 'Verification output should name seminrExtras explicitly.')
assert.match(logs.join('\n'), /Rblas\.dll/, 'Verification output should name stale BLAS runtime binaries explicitly.')

console.log('PASS R portable bundle coverage')
