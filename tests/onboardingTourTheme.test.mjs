import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function readSource(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

const appSource = await readSource('src/App.tsx')
const onboardingTour = await readSource('src/components/OnboardingTour.tsx')

assert.match(
  appSource,
  /<OnboardingTour[\s\S]*theme=\{theme\}/,
  'App should pass the currently selected theme into the onboarding tour.'
)

assert.match(
  onboardingTour,
  /type TourTheme = 'Dark' \| 'Light'/,
  'Onboarding tour should model the same Light/Dark theme values as the app.'
)

assert.match(
  onboardingTour,
  /theme: TourTheme/,
  'Onboarding tour props should include the current theme.'
)

assert.match(
  onboardingTour,
  /data-theme=\{theme === 'Light' \? 'light' : 'dark'\}/,
  'Onboarding tour portal root should carry the selected data-theme so CSS tokens resolve correctly.'
)

assert.match(
  onboardingTour,
  /style=\{\{ background: 'var\(--color-overlay\)' \}\}/,
  'Onboarding tour backdrop should use the active theme overlay token.'
)

assert.match(
  onboardingTour,
  /background: 'linear-gradient\(180deg, var\(--color-surface\) 0%, var\(--color-panel\) 100%\)'/,
  'Onboarding tour modal should use theme-aware surface tokens.'
)

assert.match(
  onboardingTour,
  /background: 'linear-gradient\(180deg, rgb\(var\(--color-panel-pop-rgb\) \/ 0\.98\), rgb\(var\(--color-panel-rgb\) \/ 0\.98\)\)'/,
  'Onboarding tour preview panels should adapt to light and dark theme tokens.'
)

assert.doesNotMatch(
  onboardingTour,
  /rgba\(6,8,12,0\.72\)|#171A20|#121419|rgba\(245,247,251/,
  'Onboarding tour should not force the dark theme backdrop, shell, or primary text colors.'
)

console.log('PASS onboarding tour theme coverage')
