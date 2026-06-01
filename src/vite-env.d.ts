/// <reference types="vite/client" />

declare const __METIS_APP_NAME__: string
declare const __METIS_APP_VERSION__: string
declare const __METIS_APP_EDITION__: string

interface Window {
  electronAPI: {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onWindowStateChanged: (cb: (data: { isMaximized: boolean }) => void) => () => void
    notifyAppReady: () => void
    sendRendererReady: () => void
    openFile: (options?: any) => Promise<any>
    openDirectory: (options?: any) => Promise<any>
    showSaveDialog: (options?: any) => Promise<any>
    readFile: (filePath: string) => Promise<any>
    writeFile: (data: any) => Promise<any>
    copyToWorkspace: (data: { originalFilePath: string, workspacePath: string, datasetId: string }) => Promise<any>
    saveDatasetToWorkspace: (data: { workspacePath: string; datasetId: string; fileName: string; base64Data: string }) => Promise<any>
    getDataPath: () => Promise<any>
    getStoragePaths: () => Promise<any>
    setStoragePaths: (data: { workspacePath: string; exportPath: string }) => Promise<any>
    getWelcomeContext: () => Promise<any>
    setThemePreference: (theme: 'dark' | 'light') => Promise<any>
    useSampleDataset: (data: { workspacePath: string; datasetId?: string }) => Promise<any>
    openPath: (targetPath: string) => Promise<any>
    openExternal: (url: string) => Promise<any>
    listWorkspaces: () => Promise<any>
    openWorkspaceFile: (filePath: string) => Promise<any>
    createWorkspace: (data: any) => Promise<any>
    saveWorkspace: (data: any) => Promise<any>
    deleteWorkspace: (data: any) => Promise<any>
    deleteWorkspaceChild: (data: any) => Promise<any>
    plumberHealth: () => Promise<any>
    runPls: (payload: any) => Promise<any>
    runBootstrap: (payload: any) => Promise<any>
    runPlsPredict: (payload: any) => Promise<any>
    runAdvancedAnalysis: (payload: any) => Promise<any>
    onConfirmQuitDuringCalc: (cb: () => void) => () => void
    quitConfirmed: () => Promise<any>
    quitCancelled: () => Promise<any>
    extractDataset: (payload: string | { adaFilePath: string; datasetId?: string }) => Promise<any>
    reportRendererError: (payload: any) => Promise<any>
    getInstallDefaultPaths: () => Promise<any>
    getExistingAppInstall: () => Promise<any>
    selectInstallDirectory: () => Promise<any>
    runInstall: (rootPath: string, opts?: { createShortcut?: boolean }) => Promise<any>
    launchApp: () => void
    closeInstaller: () => void
    onInstallProgress: (cb: (data: { step: string; detail: string }) => void) => () => void
    findRscript: () => Promise<any>
    checkPackages: (rscriptPath: string) => Promise<any>
    saveLiteConfig: (data: { rootPath: string; rscriptPath: string }) => Promise<any>
    onOpenFile: (cb: (filePath: string) => void) => () => void
    platform: string
  }
  __metisIsCalculating?: boolean
}
