import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function read(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

const preferences = await read('src/components/PreferencesModal.tsx')
const app = await read('src/App.tsx')
const preload = await read('electron/preload.ts')
const main = await read('electron/main.ts')
const viteEnv = await read('src/vite-env.d.ts')
const resultsView = await read('src/pages/ResultsView.tsx')

assert.match(preferences, /Metis workspace folder/, 'General preferences should show the configured Metis workspace folder.')
assert.match(preferences, /Export folder/, 'General preferences should show the configured export folder.')
assert.match(preferences, /handleBrowseWorkspaceFolder/, 'Preferences should browse for a replacement workspace folder.')
assert.match(preferences, /handleBrowseExportFolder/, 'Preferences should browse for a replacement export folder.')
assert.match(preferences, /getStoragePaths/, 'Preferences should load the current workspace and export folders from Electron.')
assert.match(preferences, /setStoragePaths/, 'Preferences should persist storage folder changes through Electron.')
assert.match(preferences, /pls:storage-locations-updated/, 'Preferences should notify the shell after storage folders change.')

assert.match(preload, /getStoragePaths:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('app:getStoragePaths'\)/, 'Preload should expose storage path loading.')
assert.match(preload, /setStoragePaths:\s*\(data: \{ workspacePath: string; exportPath: string \}\)\s*=>\s*ipcRenderer\.invoke\('app:setStoragePaths', data\)/, 'Preload should expose storage path persistence.')
assert.match(viteEnv, /getStoragePaths: \(\) => Promise<any>/, 'Renderer types should include getStoragePaths.')
assert.match(viteEnv, /setStoragePaths: \(data: \{ workspacePath: string; exportPath: string \}\) => Promise<any>/, 'Renderer types should include setStoragePaths.')

assert.match(main, /workspaceDataPath\?: string/, 'Install config should support an exact workspace data path override.')
assert.match(main, /exportPath\?: string/, 'Install config should support an exact export path override.')
assert.match(main, /function getExportPath\(\): string/, 'Electron should resolve the configured export folder separately from workspace storage.')
assert.match(main, /ipcMain\.handle\('app:getStoragePaths'/, 'Electron should expose storage paths to preferences.')
assert.match(main, /ipcMain\.handle\('app:setStoragePaths'/, 'Electron should persist storage paths from preferences.')
assert.match(main, /path\.resolve\(String\(data\?\.workspacePath/, 'Electron should normalize the selected workspace folder before saving it.')
assert.match(main, /path\.resolve\(String\(data\?\.exportPath/, 'Electron should normalize the selected export folder before saving it.')
assert.match(main, /fs\.mkdirSync\(workspacePath, \{ recursive: true \}\)/, 'Electron should create the selected workspace folder.')
assert.match(main, /fs\.mkdirSync\(exportPath, \{ recursive: true \}\)/, 'Electron should create the selected export folder.')
assert.match(main, /function updateInstallConfig[\s\S]*throw err/, 'Electron should report install config write failures instead of claiming storage paths were saved.')
assert.match(main, /normalizeSecurityPath\(getExportPath\(\)\)/, 'Trusted export roots should use the configured export path.')

assert.match(app, /loadWorkspaces\(options:\s*\{\s*allowCacheFallback: boolean\s*\}/, 'App should make cache fallback explicit when loading workspaces.')
assert.match(app, /window\.addEventListener\('pls:storage-locations-updated', handleStorageLocationsUpdated\)/, 'App should reload workspace state after storage folder changes.')
assert.match(app, /allowCacheFallback:\s*false/, 'Storage folder changes should reload from disk without the renderer workspace cache.')
assert.match(app, /handleStorageLocationsUpdated[\s\S]*navigate\('\/'\)/, 'Storage folder changes should return to Workspace Home before showing the reloaded workspace state.')
assert.match(app, /setWorkspaces\(\[\]\)/, 'App should clear workspaces when the selected workspace folder has no .ada files.')
assert.match(app, /setActiveWorkspaceId\(''\)/, 'App should clear the active workspace when the selected workspace folder is empty.')

assert.match(resultsView, /getStoragePaths/, 'HTML export should resolve the configured export folder before writing.')
assert.match(resultsView, /storagePathsResult\?\.exportPath/, 'HTML export should write to the configured export folder.')

assert.match(preferences, /<aside[\s\S]*width: 340/, 'Preferences sidebar should be narrower than the previous wide layout.')
assert.match(preferences, /Back to workspace[\s\S]*fontSize: 16|fontSize: 16[\s\S]*Back to workspace/, 'Preferences sidebar navigation should use smaller text.')

console.log('PASS preferences storage locations static contract')
