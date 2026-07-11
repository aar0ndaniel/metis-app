import path from 'node:path'

if (!globalThis.__mockElectronHandlers) {
  globalThis.__mockElectronHandlers = new Map()
}
if (!globalThis.__mockElectronListeners) {
  globalThis.__mockElectronListeners = new Map()
}
if (!globalThis.__mockElectronUserDataPath) {
  globalThis.__mockElectronUserDataPath = path.resolve('./.tmp-tests/userData')
}

const handlers = globalThis.__mockElectronHandlers
const listeners = globalThis.__mockElectronListeners

export const ipcMain = {
  handle(channel, callback) {
    handlers.set(channel, callback)
  },
  on(channel, callback) {
    listeners.set(channel, callback)
  },
  removeHandler(channel) {
    handlers.delete(channel)
  },
  removeAllListeners(channel) {
    listeners.delete(channel)
  },
  // Test helper to call the registered handler
  async invoke(channel, ...args) {
    const handler = handlers.get(channel)
    if (!handler) {
      throw new Error(`No handler registered for channel: ${channel}`)
    }
    return handler(null, ...args)
  },
  getHandler(channel) {
    return handlers.get(channel)
  }
}

export const app = {
  getPath(name) {
    if (name === 'userData') {
      return globalThis.__mockElectronUserDataPath
    }
    return path.resolve(`./.tmp-tests/${name}`)
  },
  setUserDataPath(p) {
    globalThis.__mockElectronUserDataPath = p
  },
  // Control whenReady so we don't trigger window launch/plumber server startup automatically
  whenReady() {
    return new Promise(() => {}) // never resolves by default
  },
  on() {},
  isPackaged: false,
  getAppPath() {
    return '.'
  },
  commandLine: {
    hasSwitch() {
      return false
    }
  },
  requestSingleInstanceLock() {
    return true
  },
  quit() {},
  getVersion() {
    return '0.2.2'
  }
}

export const BrowserWindow = class {
  constructor() {
    this.webContents = {
      send() {}
    }
  }
  loadURL() {}
  loadFile() {}
  on() {}
  close() {}
}

export const dialog = {}
export const shell = {}
export const screen = {
  getPrimaryDisplay() {
    return { bounds: { width: 1024, height: 768 } }
  }
}
export const Menu = {
  buildFromTemplate() {
    return { popup() {} }
  },
  setApplicationMenu() {}
}
