import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function readSource(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

const css = await readSource('src/index.css')

assert.match(
  css,
  /--shadow-modal:\s*0 14px 34px rgba\(0, 0, 0, 0\.38\), inset 0 1px 0 var\(--color-floating-highlight-soft\)/,
  'Dark theme should define a quieter shared modal shadow.'
)

assert.match(
  css,
  /\[data-theme='light'\][\s\S]*--shadow-modal:\s*0 14px 34px rgba\(15, 18, 25, 0\.12\), inset 0 1px 0 var\(--color-floating-highlight\)/,
  'Light theme should define a subtle shared modal shadow.'
)

assert.match(
  css,
  /--shadow-modal-popover:\s*0 8px 18px rgba\(0, 0, 0, 0\.28\)/,
  'Dark theme modal popovers should be less heavy than old dialog shadows.'
)

assert.match(
  css,
  /\[data-theme='light'\][\s\S]*--shadow-modal-popover:\s*0 8px 18px rgba\(15, 18, 25, 0\.10\)/,
  'Light theme modal popovers should remain subtle.'
)

const modalSources = new Map(
  await Promise.all([
    'src/App.tsx',
    'src/components/AdvancedAnalysisModal.tsx',
    'src/components/BootstrapModal.tsx',
    'src/components/CalcCancelDialog.tsx',
    'src/components/CalculatingModal.tsx',
    'src/components/DatasetManagerModal.tsx',
    'src/components/NewModelDialog.tsx',
    'src/components/NewWorkspaceDialog.tsx',
    'src/components/OnboardingTour.tsx',
    'src/components/PlsPredictModal.tsx',
    'src/components/PreferencesModal.tsx',
    'src/components/TarkModal.tsx',
    'src/pages/DataView.tsx',
    'src/pages/ImportStep1.tsx',
    'src/pages/ModelCanvas.tsx',
    'src/pages/WorkspaceHome.tsx',
  ].map(async (relativePath) => [relativePath, await readSource(relativePath)]))
)

for (const [relativePath, source] of modalSources) {
  assert.doesNotMatch(
    source,
    /0 (?:16px 40px|16px 48px|24px 60px|24px 64px|28px 70px|28px 72px) rgba\(0,0,0,0\.(?:45|7|78|8|9|28)\)/,
    `${relativePath} should not use the old heavy modal shadow literal.`
  )
}

for (const relativePath of [
  'src/components/AdvancedAnalysisModal.tsx',
  'src/components/CalcCancelDialog.tsx',
  'src/components/CalculatingModal.tsx',
  'src/pages/ModelCanvas.tsx',
]) {
  assert.doesNotMatch(
    modalSources.get(relativePath),
    /shadow-2xl/,
    `${relativePath} should not rely on Tailwind shadow-2xl for modal surfaces.`
  )
}

for (const relativePath of [
  'src/components/NewWorkspaceDialog.tsx',
  'src/components/NewModelDialog.tsx',
  'src/components/BootstrapModal.tsx',
  'src/components/PlsPredictModal.tsx',
  'src/components/DatasetManagerModal.tsx',
  'src/components/TarkModal.tsx',
  'src/components/PreferencesModal.tsx',
  'src/pages/ModelCanvas.tsx',
]) {
  assert.match(
    modalSources.get(relativePath),
    /boxShadow:\s*'var\(--shadow-modal\)'/,
    `${relativePath} should use the shared modal shadow token.`
  )
}

console.log('PASS modal subtle shadow coverage')
