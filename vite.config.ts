import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { fileURLToPath } from 'url'
import fs from 'fs'
import path from 'path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as {
  version?: string
}
const lifecycleEvent = process.env.npm_lifecycle_event ?? ''
const appEdition = lifecycleEvent.startsWith('build:lite') ? 'Lite' : 'Bundle'
const appDefines = {
  __METIS_APP_NAME__: JSON.stringify('metis'),
  __METIS_APP_VERSION__: JSON.stringify(pkg.version ?? '0.0.1'),
  __METIS_APP_EDITION__: JSON.stringify(appEdition),
}

export default defineConfig({
  base: './',
  define: appDefines,
  plugins: [
    react(),
    electron({
      main: {
        entry: './electron/main.ts',
        vite: {
          define: appDefines,
        },
        onstart(args) {
          // Launch Electron in dev mode (connects to the Vite dev server)
          args.startup()
        },
      },
      preload: {
        input: './electron/preload.ts',
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs', // Forces CommonJS format
                entryFileNames: 'preload.cjs' // Outputs strictly as .cjs
              }
            }
          }
        }
      },
      renderer: {},
    }),
  ],
  server: {
    open: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
