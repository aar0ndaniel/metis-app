import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relativePath => fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
const [tour, app, titleBar, canvas, results] = await Promise.all([
  read('src/components/OnboardingTour.tsx'),
  read('src/App.tsx'),
  read('src/components/TitleBar.tsx'),
  read('src/pages/ModelCanvas.tsx'),
  read('src/pages/ResultsView.tsx'),
])

for (const stepId of [
  'welcome',
  'create-workspace',
  'create-model',
  'add-dataset',
  'draw-first-variable',
  'draw-second-variable',
  'connect-variables',
  'open-analysis',
  'run-analysis',
  'view-results',
]) {
  assert.match(tour, new RegExp(`id: '${stepId}'`), `Walkthrough should include ${stepId}.`)
}

for (const selector of [
  '#tour-new-workspace',
  '#tour-new-workspace-dialog',
  '#tour-new-model',
  '#tour-new-model-dialog',
  '#tour-add-dataset',
  '#tour-latent-variable',
  '#tour-connect',
  '#tour-analysis-menu',
  '#tour-analysis-run',
  '#tour-run-analysis-confirm',
  '.metis-results-view',
]) {
  assert.match(tour, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(tour, /metis:onboarding-action/)
assert.match(tour, /Complete the highlighted action/)
assert.match(tour, /pointerEvents: 'none'/, 'The overlay must let users operate highlighted app controls.')
assert.match(tour, /pointer-events-auto/, 'The walkthrough card itself must remain interactive.')
assert.match(tour, /MutationObserver/, 'The spotlight should follow dialogs and menus that open during a step.')
assert.match(tour, /onStepChange/)
assert.match(tour, /selectors: \['#tour-new-workspace-dialog', '#tour-new-workspace'\]/)
assert.match(tour, /selectors: \['#tour-new-model-dialog', '#tour-new-model'\]/)
assert.match(tour, /for \(const selector of selectors\)/, 'Selector priority must be explicit rather than DOM-order dependent.')
assert.match(tour, /aria-live="polite"/)
assert.match(tour, /previousFocusRef/)
assert.match(tour, /cardRef/)

for (const action of ['workspace-created', 'model-created', 'dataset-added']) {
  assert.match(app, new RegExp(`action: '${action}'`))
}
for (const action of ['construct-created', 'path-created', 'analysis-started']) {
  assert.match(canvas, new RegExp(`action: '${action}'`))
}
assert.match(titleBar, /id=\{menu\.label === 'Analysis' \? 'tour-analysis-menu'/)
assert.match(titleBar, /tourId: 'tour-analysis-run'/)
assert.match(titleBar, /action: 'analysis-opened'/)
assert.match(canvas, /id="tour-add-dataset"/)
assert.match(canvas, /id="tour-run-analysis-confirm"/)
assert.match(results, /id="tour-results-view"/)

const calculationHandlerIndex = canvas.indexOf('const handleStartCalculation')
const failedResultGuardIndex = canvas.indexOf('if (!result.success || !result.results)', calculationHandlerIndex)
const successfulRunEventIndex = canvas.indexOf("action: 'analysis-started'", calculationHandlerIndex)
assert.ok(
  successfulRunEventIndex > failedResultGuardIndex,
  'The walkthrough must advance past Run only after analysis returns valid results.'
)

assert.match(app, /readWalkthroughStep\(localStorage\)/)
assert.match(app, /saveWalkthroughStep\(localStorage/)
assert.match(app, /completeWalkthrough\(localStorage\)/)
assert.match(app, /dismissOnboarding\(localStorage\)/)
assert.match(app, /createResult\?\.success === false/)
assert.match(app, /saveResult\?\.success === false/)

console.log('PASS 0.3.0 action-led walkthrough contract')
