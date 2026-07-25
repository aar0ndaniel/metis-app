export const ONBOARDING_RELEASE = '0.3.0'

export const ONBOARDING_STORAGE_KEYS = {
  whatsNewViewed: `metis:onboarding:${ONBOARDING_RELEASE}:whats-new-viewed`,
  walkthroughStep: `metis:onboarding:${ONBOARDING_RELEASE}:walkthrough-step`,
  walkthroughCompleted: `metis:onboarding:${ONBOARDING_RELEASE}:walkthrough-completed`,
  dismissed: `metis:onboarding:${ONBOARDING_RELEASE}:dismissed`,
} as const

export const WALKTHROUGH_STEPS = [
  { id: 'welcome', screen: 'home' },
  { id: 'create-workspace', screen: 'home' },
  { id: 'create-model', screen: 'home' },
  { id: 'add-dataset', screen: 'canvas' },
  { id: 'draw-first-variable', screen: 'canvas' },
  { id: 'draw-second-variable', screen: 'canvas' },
  { id: 'connect-variables', screen: 'canvas' },
  { id: 'open-analysis', screen: 'canvas' },
  { id: 'run-analysis', screen: 'canvas' },
  { id: 'view-results', screen: 'results' },
] as const

export type WalkthroughStepId = typeof WALKTHROUGH_STEPS[number]['id']
export type OnboardingStage = 'whats-new' | 'walkthrough' | 'closed'

type OnboardingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const walkthroughStepIds = new Set<string>(WALKTHROUGH_STEPS.map(step => step.id))

export function resolveOnboardingStage(storage: OnboardingStorage): OnboardingStage {
  if (
    storage.getItem(ONBOARDING_STORAGE_KEYS.dismissed) === 'true'
    || storage.getItem(ONBOARDING_STORAGE_KEYS.walkthroughCompleted) === 'true'
  ) return 'closed'

  return storage.getItem(ONBOARDING_STORAGE_KEYS.whatsNewViewed) === 'true'
    ? 'walkthrough'
    : 'whats-new'
}

export function completeWhatsNew(storage: OnboardingStorage): void {
  storage.setItem(ONBOARDING_STORAGE_KEYS.whatsNewViewed, 'true')
}

export function readWalkthroughStep(storage: OnboardingStorage): WalkthroughStepId {
  const stored = storage.getItem(ONBOARDING_STORAGE_KEYS.walkthroughStep)
  return stored && walkthroughStepIds.has(stored) ? stored as WalkthroughStepId : 'welcome'
}

export function saveWalkthroughStep(storage: OnboardingStorage, step: string): void {
  storage.setItem(ONBOARDING_STORAGE_KEYS.walkthroughStep, step)
}

export function completeWalkthrough(storage: OnboardingStorage): void {
  storage.setItem(ONBOARDING_STORAGE_KEYS.walkthroughCompleted, 'true')
  storage.removeItem(ONBOARDING_STORAGE_KEYS.walkthroughStep)
}

export function dismissOnboarding(storage: OnboardingStorage): void {
  storage.setItem(ONBOARDING_STORAGE_KEYS.dismissed, 'true')
}
