import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const captureDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(captureDir, '..', '..')

export default defineConfig({
  root: workspaceRoot,
  base: '/',
  plugins: [react()],
  define: {
    __METIS_APP_NAME__: JSON.stringify('metis'),
    __METIS_APP_VERSION__: JSON.stringify('0.3.0'),
    __METIS_APP_EDITION__: JSON.stringify('Bundle'),
  },
  resolve: {
    alias: {
      '@': path.resolve(workspaceRoot, 'src'),
    },
  },
  server: { open: false },
})
