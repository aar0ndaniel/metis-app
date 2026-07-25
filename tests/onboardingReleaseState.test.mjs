import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const workspaceRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, match => match.slice(1))), '..')
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'metis-onboarding-state-'))
const outfile = path.join(tempDir, 'onboardingReleaseState.bundle.mjs')

await build({
  entryPoints: [path.join(workspaceRoot, 'src/utils/onboardingReleaseState.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'silent',
})

const onboarding = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)

class MemoryStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}

const {
  ONBOARDING_RELEASE,
  ONBOARDING_STORAGE_KEYS,
  WALKTHROUGH_STEPS,
  completeWhatsNew,
  completeWalkthrough,
  dismissOnboarding,
  readWalkthroughStep,
  resolveOnboardingStage,
  saveWalkthroughStep,
} = onboarding

assert.equal(ONBOARDING_RELEASE, '0.3.0')
assert.ok(ONBOARDING_STORAGE_KEYS.whatsNewViewed.includes('0.3.0'))
assert.ok(ONBOARDING_STORAGE_KEYS.walkthroughStep.includes('0.3.0'))
assert.deepEqual(
  WALKTHROUGH_STEPS.map(step => step.id),
  [
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
  ],
)

const fresh = new MemoryStorage()
fresh.setItem('metis:tour-completed', 'true')
fresh.setItem('pls:tour-completed', 'true')
assert.equal(resolveOnboardingStage(fresh), 'whats-new', 'Legacy 0.2.x completion flags must not suppress the 0.3.0 update flow.')

completeWhatsNew(fresh)
assert.equal(resolveOnboardingStage(fresh), 'walkthrough')
assert.equal(readWalkthroughStep(fresh), 'welcome')

saveWalkthroughStep(fresh, 'connect-variables')
assert.equal(readWalkthroughStep(fresh), 'connect-variables', 'The walkthrough must resume at the last unfinished action.')

saveWalkthroughStep(fresh, 'not-a-real-step')
assert.equal(readWalkthroughStep(fresh), 'welcome', 'Invalid persisted values must fail safely to the welcome step.')

completeWalkthrough(fresh)
assert.equal(resolveOnboardingStage(fresh), 'closed')

const dismissed = new MemoryStorage()
dismissOnboarding(dismissed)
assert.equal(resolveOnboardingStage(dismissed), 'closed')

console.log('PASS 0.3.0 onboarding release persistence')
