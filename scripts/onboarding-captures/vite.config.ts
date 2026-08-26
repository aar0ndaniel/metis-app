import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const pkg = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8')) as { version?: string }
const captureOutput = path.join(process.env.TEMP ?? workspaceRoot, 'metis-onboarding-capture-site')

export default defineConfig({
  root: workspaceRoot,
  base: './',
  define: {
    __METIS_APP_NAME__: JSON.stringify('metis'),
    __METIS_APP_VERSION__: JSON.stringify(pkg.version ?? '0.0.1'),
    __METIS_APP_EDITION__: JSON.stringify('Bundle'),
  },
  plugins: [react()],
  build: {
    outDir: captureOutput,
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(workspaceRoot, 'scripts', 'onboarding-captures', 'index.html'),
    },
  },
  resolve: {
    alias: {
      '@': path.join(workspaceRoot, 'src'),
    },
  },
  server: {
    fs: {
      allow: [workspaceRoot],
    },
  },
})
