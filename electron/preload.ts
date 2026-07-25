import { contextBridge, ipcRenderer } from 'electron'

type NativeMenuViewState = {
  showVars: boolean
  showProps: boolean
  showZoomControl: boolean
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize:  () => ipcRenderer.send('window:minimize'),
  maximize:  () => ipcRenderer.send('window:maximize'),
  close:     () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowStateChanged: (cb: (data: { isMaximized: boolean; isFullScreen?: boolean }) => void) => {
    const handler = (_: unknown, data: { isMaximized: boolean; isFullScreen?: boolean }) => cb(data)
    ipcRenderer.on('window:state-changed', handler)
    return () => ipcRenderer.removeListener('window:state-changed', handler)
  },
  onNativeMenuAction: (cb: (action: string) => void) => {
    const handler = (_: unknown, action: string) => cb(action)
    ipcRenderer.on('menu:action', handler)
    return () => ipcRenderer.removeListener('menu:action', handler)
  },
  setNativeMenuState: (state: NativeMenuViewState) => ipcRenderer.send('native-menu:view-state', state),
  notifyAppReady: () => ipcRenderer.send('app:renderer-ready'),
  sendRendererReady: () => ipcRenderer.send('app:renderer-ready'),
  platform:  process.platform,

  // File / directory pickers
  openFile:      (options: any) => ipcRenderer.invoke('dialog:openFile', options),
  openDirectory: (options: any) => ipcRenderer.invoke('dialog:openDirectory', options),
  showSaveDialog:(options: any) => ipcRenderer.invoke('dialog:showSaveDialog', options),

  // Raw file reading / writing
  readFile:      (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  writeFile:     (data: any) => ipcRenderer.invoke('file:write', data),
  copyToWorkspace:(data: { originalFilePath: string, workspacePath: string, datasetId: string }) => ipcRenderer.invoke('file:copyToWorkspace', data),
  saveDatasetToWorkspace: (data: { workspacePath: string; datasetId: string; fileName: string; base64Data: string }) =>
    ipcRenderer.invoke('dataset:saveToWorkspace', data),
  getDataPath:   () => ipcRenderer.invoke('app:dataPath'),
  getStoragePaths: () => ipcRenderer.invoke('app:getStoragePaths'),
  setStoragePaths: (data: { workspacePath: string; exportPath: string }) => ipcRenderer.invoke('app:setStoragePaths', data),
  getWelcomeContext: () => ipcRenderer.invoke('app:welcomeContext'),
  setThemePreference: (theme: 'dark' | 'light') => ipcRenderer.invoke('app:setThemePreference', theme),
  useSampleDataset: (data: { workspacePath: string; datasetId?: string }) => ipcRenderer.invoke('dataset:useSample', data),
  openPath:      (targetPath: string) => ipcRenderer.invoke('shell:openPath', targetPath),
  showItemInFolder: (targetPath: string) => ipcRenderer.invoke('shell:showItemInFolder', targetPath),
  openExternal:  (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Workspace persistence
  listWorkspaces:  ()       => ipcRenderer.invoke('workspace:list'),
  openWorkspaceFile: (filePath: string) => ipcRenderer.invoke('workspace:openFile', filePath),
  createWorkspace: (data: any) => ipcRenderer.invoke('workspace:create', data),
  saveWorkspace:   (data: any) => ipcRenderer.invoke('workspace:save', data),
  deleteWorkspace: (data: any) => ipcRenderer.invoke('workspace:delete', data),
  deleteWorkspaceChild: (data: any) => ipcRenderer.invoke('workspace:deleteChild', data),

  // R/Plumber service
  plumberHealth: () => ipcRenderer.invoke('plumber:health'),
  runPls: (payload: any) => ipcRenderer.invoke('plumber:runPls', payload),
  runBootstrap: (payload: any) => ipcRenderer.invoke('plumber:runBootstrap', payload),
  runPlsPredict: (payload: any) => ipcRenderer.invoke('plumber:runPlsPredict', payload),
  runAdvancedAnalysis: (payload: any) => ipcRenderer.invoke('plumber:runAdvancedAnalysis', payload),
  runPermutationAnalysis: (payload: any) => ipcRenderer.invoke('plumber:runPermutationAnalysis', payload),
  runPermutationConfiguralPrecheck: (payload: any) => ipcRenderer.invoke('plumber:runPermutationConfiguralPrecheck', payload),
  runMultiGroupAnalysis: (payload: any) => ipcRenderer.invoke('plumber:runMultiGroupAnalysis', payload),
  onConfirmQuitDuringCalc: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('confirm-quit-during-calc', handler)
    return () => ipcRenderer.removeListener('confirm-quit-during-calc', handler)
  },
  quitConfirmed: () => ipcRenderer.invoke('quit-confirmed'),
  quitCancelled: () => ipcRenderer.invoke('quit-cancelled'),

  // Workspace: extract embedded dataset to a temp file for the R backend
  extractDataset: (payload: string | { adaFilePath: string; datasetId?: string }) => ipcRenderer.invoke('workspace:extractDataset', payload),

  // Workspace: listen for a workspace file opened via OS file association
  onOpenFile: (cb: (filePath: string) => void) => {
    const handler = (_: unknown, filePath: string) => cb(filePath)
    ipcRenderer.on('workspace:openedViaFile', handler)
    return () => ipcRenderer.removeListener('workspace:openedViaFile', handler)
  },

  // Diagnostics / crash feedback
  reportRendererError: (payload: any) => ipcRenderer.invoke('app:reportRendererError', payload),

  // Installer flow
  getInstallDefaultPaths: () => ipcRenderer.invoke('install:getDefaultPaths'),
  getExistingAppInstall: () => ipcRenderer.invoke('install:getExistingAppInstall'),
  selectInstallDirectory: () => ipcRenderer.invoke('install:selectDirectory'),
  runInstall: (rootPath: string, opts?: { createShortcut?: boolean }) =>
    ipcRenderer.invoke('install:run', { rootPath, ...opts }),
  launchApp:      () => ipcRenderer.send('install:launch'),
  closeInstaller: () => ipcRenderer.send('install:close'),

  // Workspace persistence
  listWorkspaces:  ()       => ipcRenderer.invoke('workspace:list'),
  openWorkspaceFile: (filePath: string) => ipcRenderer.invoke('workspace:openFile', filePath),
  createWorkspace: (data: any) => ipcRenderer.invoke('workspace:create', data),
  saveWorkspace:   (data: any) => ipcRenderer.invoke('workspace:save', data),
  deleteWorkspace: (data: any) => ipcRenderer.invoke('workspace:delete', data),
  deleteWorkspaceChild: (data: any) => ipcRenderer.invoke('workspace:deleteChild', data),

  // R/Plumber service
  plumberHealth: () => ipcRenderer.invoke('plumber:health'),
  runPls: (payload: any) => ipcRenderer.invoke('plumber:runPls', payload),
  runBootstrap: (payload: any) => ipcRenderer.invoke('plumber:runBootstrap', payload),
  runPlsPredict: (payload: any) => ipcRenderer.invoke('plumber:runPlsPredict', payload),
  runAdvancedAnalysis: (payload: any) => ipcRenderer.invoke('plumber:runAdvancedAnalysis', payload),
  runPermutationAnalysis: (payload: any) => ipcRenderer.invoke('plumber:runPermutationAnalysis', payload),
  runPermutationConfiguralPrecheck: (payload: any) => ipcRenderer.invoke('plumber:runPermutationConfiguralPrecheck', payload),
  runMultiGroupAnalysis: (payload: any) => ipcRenderer.invoke('plumber:runMultiGroupAnalysis', payload),
  onConfirmQuitDuringCalc: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('confirm-quit-during-calc', handler)
    return () => ipcRenderer.removeListener('confirm-quit-during-calc', handler)
  },
  quitConfirmed: () => ipcRenderer.invoke('quit-confirmed'),
  quitCancelled: () => ipcRenderer.invoke('quit-cancelled'),

  // Workspace: extract embedded dataset to a temp file for the R backend
  extractDataset: (payload: string | { adaFilePath: string; datasetId?: string }) => ipcRenderer.invoke('workspace:extractDataset', payload),

  // Workspace: listen for a workspace file opened via OS file association
  onOpenFile: (cb: (filePath: string) => void) => {
    const handler = (_: unknown, filePath: string) => cb(filePath)
    ipcRenderer.on('workspace:openedViaFile', handler)
    return () => ipcRenderer.removeListener('workspace:openedViaFile', handler)
  },

  // Diagnostics / crash feedback
  reportRendererError: (payload: any) => ipcRenderer.invoke('app:reportRendererError', payload),

  // Installer flow
  getInstallDefaultPaths: () => ipcRenderer.invoke('install:getDefaultPaths'),
  getExistingAppInstall: () => ipcRenderer.invoke('install:getExistingAppInstall'),
  selectInstallDirectory: () => ipcRenderer.invoke('install:selectDirectory'),
  runInstall: (rootPath: string, opts?: { createShortcut?: boolean }) =>
    ipcRenderer.invoke('install:run', { rootPath, ...opts }),
  launchApp:      () => ipcRenderer.send('install:launch'),
  closeInstaller: () => ipcRenderer.send('install:close'),
  onInstallProgress: (cb: (data: { step: string; detail: string }) => void) => {
    const handler = (_: unknown, data: { step: string; detail: string }) => cb(data)
    ipcRenderer.on('install:progress', handler)
    return () => ipcRenderer.removeListener('install:progress', handler)
  },

  // Lite setup wizard
  findRscript:    () => ipcRenderer.invoke('r:findRscript'),
  checkPackages:  (rscriptPath: string) => ipcRenderer.invoke('r:checkPackages', rscriptPath),
  saveLiteConfig: (data: { rootPath: string; rscriptPath: string }) => ipcRenderer.invoke('r:saveLiteConfig', data),

  // Telemetry IPC
  getTelemetryStatus: () => ipcRenderer.invoke('telemetry:get-status'),
  setTelemetryConsent: (consent: boolean) => ipcRenderer.invoke('telemetry:set-consent', consent),
})
