import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CaretRight, CheckCircle, Database, Graph, Layout, PlusCircle, X } from '@phosphor-icons/react'
import { APP_BRAND_NAME } from '../config/appBranding'
import { WALKTHROUGH_STEPS, type WalkthroughStepId } from '../utils/onboardingReleaseState'

type TourTheme = 'Dark' | 'Light'
type TourScreen = 'home' | 'canvas' | 'results' | 'import'
type TourCloseReason = 'dismissed' | 'completed'

interface TourStep {
  id: WalkthroughStepId
  screen: TourScreen
  title: string
  content: string
  icon: ReactNode
  selectors?: readonly string[]
  action?: string
}

interface OnboardingTourProps {
  currentScreen: TourScreen
  theme: TourTheme
  displayName?: string
  workspacePath?: string
  initialStepId: WalkthroughStepId
  onStepChange: (stepId: WalkthroughStepId) => void
  onClose: (reason: TourCloseReason) => void
}

const TOUR_ACCENT = 'var(--color-accent)'
const TOUR_SOFT = 'rgb(var(--color-accent-rgb) / 0.18)'
const TOUR_HEADING_FONT = 'Matter, "DM Sans", sans-serif'

const emitIcon = (IconNode: typeof Layout) => <IconNode size={26} color={TOUR_ACCENT} weight="fill" />

function buildActionWalkthrough(displayName = ''): TourStep[] {
  const firstName = displayName.trim()
  return [
    {
      id: 'welcome',
      screen: 'home',
      title: firstName ? `Welcome to ${APP_BRAND_NAME} 0.3.0, ${firstName}` : `Welcome to ${APP_BRAND_NAME} 0.3.0`,
      content: 'This walkthrough stays with you while you build and run a real model. Complete each highlighted action to continue.',
      icon: <span style={{ fontSize: 34, lineHeight: 1 }}>👋</span>,
    },
    {
      id: 'create-workspace',
      screen: 'home',
      title: 'Create your workspace',
      content: 'Select New workspace, give the project a name, and create it. The guide advances only after the workspace is saved.',
      icon: emitIcon(Layout),
      selectors: ['#tour-new-workspace-dialog', '#tour-new-workspace'],
      action: 'workspace-created',
    },
    {
      id: 'create-model',
      screen: 'home',
      title: 'Create a model',
      content: 'Choose New model, name it, and add it to the workspace you just created.',
      icon: emitIcon(Graph),
      selectors: ['#tour-new-model-dialog', '#tour-new-model'],
      action: 'model-created',
    },
    {
      id: 'add-dataset',
      screen: 'canvas',
      title: 'Add data on the model canvas',
      content: 'Use the sample dataset for a quick start, or add your own CSV or Excel file from the dataset panel.',
      icon: emitIcon(Database),
      selectors: ['#tour-add-dataset', '#collapsed-dataset-card'],
      action: 'dataset-added',
    },
    {
      id: 'draw-first-variable',
      screen: 'canvas',
      title: 'Draw your first variable',
      content: 'Select two or more related indicators in the dataset panel and drag them onto the canvas. Name the new construct and create it.',
      icon: emitIcon(PlusCircle),
      selectors: ['#tour-variable-list', '#tour-latent-variable'],
      action: 'construct-created',
    },
    {
      id: 'draw-second-variable',
      screen: 'canvas',
      title: 'Draw a second variable',
      content: 'Select a different group of indicators and drag them onto the canvas to create an analysis-ready destination construct.',
      icon: emitIcon(PlusCircle),
      selectors: ['#tour-variable-list', '#tour-latent-variable'],
      action: 'construct-created',
    },
    {
      id: 'connect-variables',
      screen: 'canvas',
      title: 'Connect the variables',
      content: 'Select Connect, then drag from the first construct to the second to create a path.',
      icon: emitIcon(Graph),
      selectors: ['#tour-connect'],
      action: 'path-created',
    },
    {
      id: 'open-analysis',
      screen: 'canvas',
      title: 'Open the Analysis menu',
      content: 'The Analysis tab in the title bar is the new home for PLS-SEM, Bootstrap, PLS Predict, MICOM, MGA, NCA, and IPMA.',
      icon: emitIcon(Graph),
      selectors: ['#tour-analysis-menu'],
      action: 'analysis-opened',
    },
    {
      id: 'run-analysis',
      screen: 'canvas',
      title: 'Run PLS-SEM',
      content: 'Choose Run PLS-SEM, review the algorithm settings, then select Calculate to run the model.',
      icon: emitIcon(CheckCircle),
      selectors: ['#tour-run-analysis-confirm', '#tour-analysis-run'],
      action: 'analysis-started',
    },
    {
      id: 'view-results',
      screen: 'results',
      title: 'Explore your results',
      content: 'You made it. Use the results sidebar to inspect the structural model, measurement model, quality criteria, and exports.',
      icon: emitIcon(CheckCircle),
      selectors: ['#tour-results-view', '.metis-results-view'],
    },
  ]
}

function findTourTarget(selectors?: readonly string[]) {
  if (!selectors) return null
  for (const selector of selectors) {
    const target = document.querySelector<HTMLElement>(selector)
    if (target) return target
  }
  return null
}

export default function OnboardingTour({
  currentScreen,
  theme,
  displayName = '',
  workspacePath = '',
  initialStepId,
  onStepChange,
  onClose,
}: OnboardingTourProps) {
  void workspacePath
  const steps = useMemo(() => buildActionWalkthrough(displayName), [displayName])
  const initialIndex = Math.max(0, steps.findIndex(step => step.id === initialStepId))
  const [currentStep, setCurrentStep] = useState(initialIndex)
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null)
  const [modalPos, setModalPos] = useState({ top: 24, left: 24, width: 366 })
  const frameRef = useRef<number | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const lastTargetRef = useRef<HTMLElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const step = steps[currentStep]
  const isWelcomeStep = step.id === 'welcome'
  const isResultsStep = step.id === 'view-results'
  const isOnExpectedScreen = step.screen === currentScreen

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => previousFocusRef.current?.focus({ preventScroll: true })
  }, [])

  const advance = useCallback(() => {
    if (currentStep >= steps.length - 1) {
      onClose('completed')
      return
    }
    const nextIndex = currentStep + 1
    setCurrentStep(nextIndex)
    onStepChange(steps[nextIndex].id)
  }, [currentStep, onClose, onStepChange, steps])

  useEffect(() => {
    const handleAction = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action
      if (step.action && action === step.action) advance()
    }
    window.addEventListener('metis:onboarding-action', handleAction)
    return () => window.removeEventListener('metis:onboarding-action', handleAction)
  }, [advance, step.action])

  useLayoutEffect(() => {
    const place = () => {
      const width = Math.min(isWelcomeStep ? 430 : 366, window.innerWidth - 24)
      const height = isWelcomeStep ? 240 : 210
      const target = isOnExpectedScreen ? findTourTarget(step.selectors) : null
      if (!target) {
        lastTargetRef.current = null
        setSpotlightRect(null)
        setModalPos({
          top: Math.max(16, window.innerHeight / 2 - height / 2),
          left: Math.max(16, window.innerWidth / 2 - width / 2),
          width,
        })
        return
      }

      if (target !== lastTargetRef.current) {
        lastTargetRef.current = target
        if (!target.contains(document.activeElement)) target.focus({ preventScroll: true })
      }
      const rect = target.getBoundingClientRect()
      let top = rect.bottom + 16
      let left = rect.left + rect.width / 2 - width / 2
      if (top + height > window.innerHeight - 16) top = rect.top - height - 16
      if (top < 16) top = Math.max(16, window.innerHeight / 2 - height / 2)
      left = Math.max(16, Math.min(window.innerWidth - width - 16, left))
      setSpotlightRect(rect)
      setModalPos({ top, left, width })
    }

    const schedulePlace = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(place)
    }
    place()
    const observer = new MutationObserver(schedulePlace)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', schedulePlace)
    window.addEventListener('scroll', schedulePlace, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedulePlace)
      window.removeEventListener('scroll', schedulePlace, true)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [currentScreen, isOnExpectedScreen, isWelcomeStep, step.selectors])

  useEffect(() => {
    if (!isWelcomeStep && !isResultsStep) return
    const frame = requestAnimationFrame(() => cardRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [currentStep, isResultsStep, isWelcomeStep])

  const tourOverlay = (
    <div className="fixed inset-0 z-[3000] overflow-hidden" data-theme={theme === 'Light' ? 'light' : 'dark'} style={{ pointerEvents: 'none' }}>
      {!spotlightRect && <div className="absolute inset-0" style={{ background: 'var(--color-overlay)' }} />}
      {spotlightRect && (
        <div
          className="absolute"
          style={{
            left: spotlightRect.left - 8,
            top: spotlightRect.top - 8,
            width: spotlightRect.width + 16,
            height: spotlightRect.height + 16,
            borderRadius: 11,
            border: `2px solid ${TOUR_ACCENT}`,
            boxShadow: `0 0 0 9999px var(--color-overlay), 0 0 0 7px ${TOUR_SOFT}`,
            pointerEvents: 'none',
          }}
        />
      )}

      <div className="fixed pointer-events-auto" style={{ top: modalPos.top, left: modalPos.left, width: modalPos.width }}>
        <div
          ref={cardRef}
          role="dialog"
          aria-labelledby="metis-walkthrough-title"
          aria-describedby="metis-walkthrough-description"
          tabIndex={-1}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 16,
            background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-panel) 100%)',
            border: '1px solid var(--color-floating-border-soft)',
            boxShadow: 'var(--shadow-modal)',
            color: 'var(--color-text-primary)',
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          <span aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
            Walkthrough step {currentStep + 1} of {steps.length}: {step.title}
          </span>
          <button
            type="button"
            aria-label="Close walkthrough"
            onClick={() => onClose('dismissed')}
            style={{ position: 'absolute', top: 11, right: 11, width: 26, height: 26, padding: 0, display: 'grid', placeItems: 'center', border: 0, borderRadius: 8, background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
          >
            <X size={13} />
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '16px 42px 13px 15px' }}>
            <div style={{ width: 48, height: 48, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 13, background: 'rgb(var(--color-accent-rgb) / 0.14)', boxShadow: `inset 0 0 0 1px ${TOUR_SOFT}` }}>
              {step.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <span style={{ color: 'var(--color-accent)', fontSize: 9, lineHeight: 1.2, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Step {currentStep + 1} of {steps.length}</span>
              <h2 id="metis-walkthrough-title" style={{ margin: '4px 0 0', color: 'var(--color-text-primary)', fontFamily: TOUR_HEADING_FONT, fontSize: isWelcomeStep ? 18 : 16, lineHeight: 1.18, fontWeight: 650 }}>{step.title}</h2>
              <p id="metis-walkthrough-description" style={{ margin: '7px 0 0', color: 'var(--color-text-secondary)', fontSize: 11, lineHeight: 1.48 }}>{step.content}</p>
              {!isOnExpectedScreen && (
                <p style={{ margin: '7px 0 0', color: 'var(--color-accent)', fontSize: 10, lineHeight: 1.4, fontWeight: 700 }}>
                  {step.screen === 'canvas' ? 'Open the model canvas to continue.' : step.screen === 'results' ? 'Run the model to open Results and continue.' : 'Return to Workspaces to continue.'}
                </p>
              )}
            </div>
          </div>

          <div style={{ minHeight: 48, display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px', borderTop: '1px solid var(--color-floating-border-soft)', background: 'rgb(var(--color-elevated-rgb) / 0.42)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {WALKTHROUGH_STEPS.map((item, index) => <span key={item.id} style={{ width: index === currentStep ? 15 : 5, height: 5, borderRadius: 999, background: index === currentStep ? TOUR_ACCENT : 'rgb(var(--color-text-secondary-rgb) / 0.2)' }} />)}
            </div>
            {step.action && isOnExpectedScreen && (
              <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)', fontSize: 9.5, fontWeight: 650 }}>Complete the highlighted action</span>
            )}
            {(isWelcomeStep || isResultsStep) && (
              <button
                type="button"
                onClick={advance}
                style={{ marginLeft: 'auto', height: 32, padding: '0 13px', display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 9, border: '1px solid rgb(var(--color-accent-rgb) / 0.42)', background: TOUR_ACCENT, color: 'var(--color-on-accent)', cursor: 'pointer', fontSize: 10, fontWeight: 750 }}
              >
                {isResultsStep ? 'Finish walkthrough' : 'Create my workspace'}
                <CaretRight size={10} weight="bold" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(tourOverlay, document.body) : tourOverlay
}
