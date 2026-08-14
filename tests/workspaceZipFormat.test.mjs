import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import JSZip from 'jszip'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')

async function runTest(name, fn) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? error.stack : error)
    process.exitCode = 1
  }
}

// 1. Prepare and Bundle Main Process with Test Exports
console.log('Bundling electron/main.ts for testing...')
await fsPromises.mkdir(tempDir, { recursive: true })

const originalMainPath = path.join(workspaceRoot, 'electron/main.ts')
const mainContent = await fsPromises.readFile(originalMainPath, 'utf8')

// Append exports for private functions we want to test directly
const testEntryContent = `
${mainContent}

export {
  readWorkspaceZipFile,
  isZipFile,
  writeAtomicSync,
  writeDatasetBufferIntoWorkspace,
  cleanLegacyTempDatasetDirectories,
  getTempDatasetsDir
};
`
const testEntryPath = path.join(tempDir, 'main.test-entry.ts')
await fsPromises.writeFile(testEntryPath, testEntryContent, 'utf8')

const bundleOutPath = path.join(tempDir, 'main.test.bundle.mjs')

await build({
  entryPoints: [testEntryPath],
  outfile: bundleOutPath,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: ['electron', 'tar', 'exceljs', 'jszip'],
  plugins: [{
    name: 'electron-mock-redirect',
    setup(build) {
      build.onResolve({ filter: /^electron$/ }, args => {
        return { path: path.resolve('./tests/mockElectron.js') }
      })
    }
  }],
  logLevel: 'silent',
})

// Import the bundled module dynamically
const moduleUrl = `${pathToFileURL(bundleOutPath).href}?t=${Date.now()}`
const mainModule = await import(moduleUrl)
const mockElectron = await import(pathToFileURL(path.resolve('./tests/mockElectron.js')).href)

const {
  isZipFile,
  readWorkspaceZipFile,
  writeAtomicSync,
  writeDatasetBufferIntoWorkspace,
  cleanLegacyTempDatasetDirectories,
  getTempDatasetsDir
} = mainModule

const { ipcMain, app } = mockElectron

// Setup temporary userdata directory for testing
const testUserData = path.join(tempDir, 'test-userdata')
app.setUserDataPath(testUserData)

// The mock downloads/metis data directory path
const dataPath = path.resolve('./.tmp-tests/downloads/metis')

// Helper to clean up test workspace files
async function cleanupTestFiles(paths) {
  for (const p of paths) {
    try {
      await fsPromises.rm(p, { recursive: true, force: true })
    } catch {}
  }
}

// --- TESTS ---

await runTest('Magic Byte Assertion and ZIP Workspace Creation', async () => {
  const wsPath = path.join(dataPath, 'test-created-ws.metisws')
  await cleanupTestFiles([wsPath])

  // Create new workspace via registered IPC handler
  const createHandler = ipcMain.getHandler('workspace:create')
  assert.ok(createHandler, 'Expected workspace:create IPC handler')

  const mockWsData = {
    id: 'ws-test-123',
    name: 'test-created-ws',
    children: []
  }

  const res = await createHandler(null, mockWsData)
  assert.equal(res.success, true)
  assert.equal(res.path, wsPath)

  // Verify file exists
  assert.ok(fs.existsSync(wsPath), 'Workspace file should exist on disk')

  // Check magic bytes (504b0304) at offset 0
  const fd = fs.openSync(wsPath, 'r')
  const bytes = Buffer.alloc(4)
  fs.readSync(fd, bytes, 0, 4, 0)
  fs.closeSync(fd)

  assert.equal(bytes.toString('hex'), '504b0304', 'Workspace must start with ZIP magic bytes')

  // Check isZipFile helper returns true
  const isZip = await isZipFile(wsPath)
  assert.equal(isZip, true, 'isZipFile helper should return true for ZIP workspace')

  await cleanupTestFiles([wsPath])
})

await runTest('Zip Slip Prevention and Path Traversal Protection', async () => {
  const corruptWsPath = path.join(dataPath, 'corrupt-ws.metisws')
  await cleanupTestFiles([corruptWsPath])

  // Construct a malicious ZIP file containing a dataset entry trying to traverse upwards
  const zip = new JSZip()
  
  // Fake workspace.json
  const wsData = {
    id: 'ws-corrupt',
    name: 'corrupt-ws',
    children: [
      {
        id: 'ds-traversal',
        type: 'dataset',
        name: 'traversal.csv',
        filePath: '../../traversal.csv' // traversal path
      }
    ]
  }
  zip.file('workspace.json', JSON.stringify(wsData, null, 2))
  zip.file('datasets/../../traversal.csv', 'A,B\n1,2') // JSZip allows adding paths with relative slashes

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  await fsPromises.writeFile(corruptWsPath, buffer)

  // Try to read/extract the workspace and assert it throws a traversal error
  try {
    await readWorkspaceZipFile(corruptWsPath, true)
    assert.fail('readWorkspaceZipFile should have thrown a Directory Traversal error')
  } catch (err) {
    assert.ok(
      err.message.includes('Directory traversal detected') || err.message.includes('Security Error'),
      `Expected directory traversal error, got: ${err.message}`
    )
  }

  await cleanupTestFiles([corruptWsPath])
})

await runTest('Atomic Save Retries & Cleanup on Absolute Failure', async () => {
  const targetPath = path.join(tempDir, 'atomic-test-file.txt')
  const tmpPath = `${targetPath}.tmp`
  await cleanupTestFiles([targetPath, tmpPath])

  // 1. Success path
  writeAtomicSync(targetPath, 'Hello Atomic')
  assert.equal(fs.readFileSync(targetPath, 'utf8'), 'Hello Atomic')
  assert.ok(!fs.existsSync(tmpPath), 'Temp file should be cleaned up on success')

  // 2. Failure path with mocked fs.renameSync throwing EPERM/EACCES
  const originalRename = fs.renameSync
  let attemptCount = 0
  fs.renameSync = () => {
    attemptCount++
    const err = new Error('Permission denied')
    err.code = 'EPERM'
    throw err
  }

  try {
    writeAtomicSync(targetPath, 'Failed Write')
    assert.fail('writeAtomicSync should have thrown when renameSync failed completely')
  } catch (err) {
    assert.equal(err.code, 'EPERM')
  } finally {
    // Restore renameSync
    fs.renameSync = originalRename
  }

  assert.equal(attemptCount, 3, 'Should attempt renaming 3 times before failing')
  assert.ok(!fs.existsSync(tmpPath), 'Temp file should be cleaned up on absolute failure')
  assert.equal(fs.readFileSync(targetPath, 'utf8'), 'Hello Atomic', 'Original file content should be preserved')

  await cleanupTestFiles([targetPath, tmpPath])
})

await runTest('Session Isolated Temp Directory Lifecycle', async () => {
  const currentSessionDir = getTempDatasetsDir()
  
  // Make sure we have a path underUserData/temp-datasets/session-[hex]
  assert.ok(currentSessionDir.includes('temp-datasets'), 'Temp dataset path must reside under temp-datasets')
  assert.match(path.basename(currentSessionDir), /^session-[a-f0-9]{16}$/, 'Session folder name should match session-[hex]')

  // Create the temp directory on disk
  await fsPromises.mkdir(currentSessionDir, { recursive: true })
  assert.ok(fs.existsSync(currentSessionDir), 'Current session temp directory should exist')

  // Create a fake legacy session folder
  const baseTempDir = path.dirname(currentSessionDir)
  const legacySessionDir = path.join(baseTempDir, 'session-deadbeef12345678')
  await fsPromises.mkdir(legacySessionDir, { recursive: true })
  assert.ok(fs.existsSync(legacySessionDir), 'Legacy session folder should exist')

  // Run cleanLegacyTempDatasetDirectories
  cleanLegacyTempDatasetDirectories()

  // Verify legacy folder is cleaned up but current folder is preserved
  assert.ok(!fs.existsSync(legacySessionDir), 'Legacy session folder should have been cleaned up')
  assert.ok(fs.existsSync(currentSessionDir), 'Current session folder should be preserved during startup cleanup')

  await cleanupTestFiles([legacySessionDir])
})

await runTest('Workspace Saving and Dataset Imports (ZIP format)', async () => {
  const wsPath = path.join(dataPath, 'test-ws.metisws')
  await cleanupTestFiles([wsPath])

  // 1. Create a workspace
  const createHandler = ipcMain.getHandler('workspace:create')
  await createHandler(null, { id: 'ws-1', name: 'test-ws', children: [] })

  // 2. Import a dataset via writeDatasetBufferIntoWorkspace
  const datasetId = 'ds-import'
  const csvBuffer = Buffer.from('ColA,ColB\nVal1,Val2\nVal3,Val4', 'utf8')
  const importResult = await writeDatasetBufferIntoWorkspace(wsPath, datasetId, csvBuffer, 'my_data.csv')

  assert.equal(importResult.success, true)
  assert.equal(importResult.internalName, 'ds-import.csv')
  assert.ok(fs.existsSync(importResult.path), 'Extracted dataset temp path should exist')
  assert.equal(fs.readFileSync(importResult.path, 'utf8'), 'ColA,ColB\nVal1,Val2\nVal3,Val4')

  // 3. Verify ZIP contents
  const zipBuffer = await fsPromises.readFile(wsPath)
  const zip = await JSZip.loadAsync(zipBuffer)
  
  assert.ok(zip.file('workspace.json'), 'ZIP must contain workspace.json')
  assert.ok(zip.file('datasets/ds-import.csv'), 'ZIP must contain datasets/ds-import.csv')

  const wsJsonText = await zip.file('workspace.json').async('text')
  const parsedWs = JSON.parse(wsJsonText)
  
  // Verify manifest children updated with dataset
  const datasetChild = parsedWs.children.find(c => c.id === 'ds-import')
  assert.ok(datasetChild, 'Manifest must list the new dataset child')
  assert.equal(datasetChild.filePath, 'ds-import.csv')
  assert.equal(datasetChild.originalFileName, 'my_data.csv')

  // 4. Test workspace:save updates and deletes
  const saveHandler = ipcMain.getHandler('workspace:save')
  
  // Update manifest to add a second dummy dataset and save
  parsedWs.children.push({
    id: 'ds-dummy',
    type: 'dataset',
    name: 'dummy.csv',
    filePath: 'ds-dummy.csv'
  })
  
  // Write a dummy file directly to the ZIP datasets to simulate it being saved
  zip.file('datasets/ds-dummy.csv', 'dummy content')
  const updatedZipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  await fsPromises.writeFile(wsPath, updatedZipBuffer)

  // Now perform a workspace:save call with the updated parsedWs
  const saveRes = await saveHandler(null, { ...parsedWs, path: wsPath })
  assert.equal(saveRes.success, true)

  // Verify ds-dummy.csv exists in the saved zip
  const savedZipBuffer = await fsPromises.readFile(wsPath)
  const savedZip = await JSZip.loadAsync(savedZipBuffer)
  assert.ok(savedZip.file('datasets/ds-dummy.csv'), 'ds-dummy.csv should exist in ZIP')

  // Now, save again but remove ds-dummy child to test cleanup of deleted datasets
  const wsDataWithRemoval = {
    ...parsedWs,
    children: parsedWs.children.filter(c => c.id !== 'ds-dummy'),
    path: wsPath
  }
  
  const saveRes2 = await saveHandler(null, wsDataWithRemoval)
  assert.equal(saveRes2.success, true)

  // Verify ds-dummy.csv has been cleaned up/removed from ZIP datasets
  const finalZipBuffer = await fsPromises.readFile(wsPath)
  const finalZip = await JSZip.loadAsync(finalZipBuffer)
  assert.ok(!finalZip.file('datasets/ds-dummy.csv'), 'ds-dummy.csv should have been removed from ZIP on save')
  assert.ok(finalZip.file('datasets/ds-import.csv'), 'ds-import.csv should still exist in ZIP')

  // 5. Test workspace:deleteChild IPC handler
  const deleteChildHandler = ipcMain.getHandler('workspace:deleteChild')
  assert.ok(deleteChildHandler, 'Expected workspace:deleteChild handler to be registered')

  const deleteRes = await deleteChildHandler(null, { workspacePath: wsPath, childId: 'ds-import' })
  assert.equal(deleteRes.success, true)
  assert.equal(deleteRes.deleted, true)

  // Verify ds-import.csv has been removed from datasets/ in the ZIP
  const postDeleteZipBuffer = await fsPromises.readFile(wsPath)
  const postDeleteZip = await JSZip.loadAsync(postDeleteZipBuffer)
  assert.ok(!postDeleteZip.file('datasets/ds-import.csv'), 'ds-import.csv should be removed from ZIP on deleteChild')

  const postDeleteWsJsonText = await postDeleteZip.file('workspace.json').async('text')
  const postDeleteParsedWs = JSON.parse(postDeleteWsJsonText)
  assert.ok(!postDeleteParsedWs.children.some(c => c.id === 'ds-import'), 'ds-import should be removed from children in workspace.json')

  await cleanupTestFiles([wsPath])
})

await runTest('Legacy non-ZIP workspace content is rejected instead of migrated', async () => {
  const legacyWsPath = path.join(dataPath, 'legacy-ws.metisws')
  await cleanupTestFiles([legacyWsPath])

  await fsPromises.writeFile(legacyWsPath, JSON.stringify({ id: 'ws-legacy', name: 'legacy-ws', children: [] }), 'utf8')

  assert.equal(await isZipFile(legacyWsPath), false, 'Legacy format should not be detected as ZIP')

  const saveHandler = ipcMain.getHandler('workspace:save')
  const saveRes = await saveHandler(null, {
    id: 'ws-legacy',
    name: 'legacy-ws',
    children: [],
    path: legacyWsPath
  })

  assert.equal(saveRes.success, false)
  assert.match(saveRes.error, /ZIP|metisws/i)
  assert.equal(await isZipFile(legacyWsPath), false, 'Rejected legacy content must remain non-ZIP')

  await cleanupTestFiles([legacyWsPath])
})

await runTest('Legacy workspace extensions are rejected', async () => {
  const openHandler = ipcMain.getHandler('workspace:openFile')
  for (const extension of ['.ada', '.metis']) {
    const legacyPath = path.join(dataPath, `legacy-ws${extension}`)
    await cleanupTestFiles([legacyPath])
    await fsPromises.writeFile(legacyPath, '{}', 'utf8')
    const openRes = await openHandler(null, legacyPath)

    assert.equal(openRes.success, false)
    assert.match(openRes.error, /\.metisws/i)

    await cleanupTestFiles([legacyPath])
  }
})

console.log('All tests completed.')
