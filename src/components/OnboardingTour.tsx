import { useLayoutEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  CaretRight,
  Mouse,
  Graph,
  Database,
  Layout,
  CheckCircle,
  PlusCircle,
  MagnifyingGlass,
  GridFour,
  Rows,
  ArrowsClockwise,
  Cursor,
  Trash,
  SlidersHorizontal,
  Toolbox,
  PaintBucket,
  CirclesThreePlus,
  ChatCircleText,
  FileText,
} from '@phosphor-icons/react'
import { APP_BRAND_NAME } from '../config/appBranding'

interface TourStep {
  title: string
  content: string
  icon: ReactNode
  selector?: string
}

type TourTheme = 'Dark' | 'Light'

interface OnboardingTourProps {
  currentScreen: 'home' | 'canvas' | 'results' | 'import'
  theme: TourTheme
  displayName?: string
  workspacePath?: string
  onClose: () => void
}

const TOUR_ACCENT = 'var(--color-accent)'
const TOUR_SOFT = 'rgb(var(--color-accent-rgb) / 0.18)'
const TOUR_GLOW = 'rgb(var(--color-accent-rgb) / 0.24)'
const TOUR_HEADING_FONT = 'Matter, "DM Sans", sans-serif'
const TOUR_PREVIEW_SUBTLE = 'rgb(var(--color-text-secondary-rgb) / 0.08)'
const TOUR_PREVIEW_MUTED = 'rgb(var(--color-text-secondary-rgb) / 0.14)'
const TOUR_PREVIEW_LINE = 'rgb(var(--color-text-secondary-rgb) / 0.34)'
const icon = (Node: any) => <Node size={28} color={TOUR_ACCENT} weight="fill" />

function buildTourData(displayName = '', workspacePath = ''): Record<'home' | 'canvas' | 'results' | 'import', TourStep[]> {
  const welcomeTitle = displayName
    ? `Glad you decided to try ${APP_BRAND_NAME}, ${displayName}`
    : `Glad you decided to try ${APP_BRAND_NAME}`
  const welcomeContent = [
    `${APP_BRAND_NAME} brings standard PLS-SEM analysis into a fluid, visual workspace.`,
    `Let's take a quick look at how to set up your workspace.`,
  ].join('\n')
  void workspacePath
  const feedbackStep: TourStep = {
    title: 'Send Feedback',
    content: 'When you are ready to send feedback to the team, open Help and choose Feedback.',
    icon: <ChatCircleText size={30} color={TOUR_ACCENT} weight="regular" />,
    selector: '#tour-help',
  }

  return {
  home: [
    { title: welcomeTitle, content: welcomeContent, icon: <span style={{ fontSize: 40, lineHeight: 1 }}>👋</span> },
    { title: 'Creating Workspaces', content: 'Organize your projects by creating workspaces. Click here to start a new workspace.', icon: icon(Layout), selector: '#tour-new-workspace' },
    { title: 'Creating Models', content: 'Add a new structural model to your active workspace to start your analysis.', icon: icon(Graph), selector: '#tour-new-model' },
    { title: 'Search Workspace', content: 'Quickly find specific models or workspaces using the search filter.', icon: icon(MagnifyingGlass), selector: '#tour-search-workspace' },
    { title: 'View Layouts', content: 'Switch between grid and list views to organize your dashboard effectively.', icon: icon(GridFour), selector: '#tour-grid-view' },
    { title: 'Switch Views', content: 'Toggle to list view for more detailed statistics and metadata.', icon: icon(Rows), selector: '#tour-list-view' },
    { title: 'Tark Reports', content: 'Turn saved PLS-SEM, Bootstrap, and PLSpredict results into a journal-ready report setup.', icon: <FileText size={30} color={TOUR_ACCENT} weight="fill" />, selector: '#tour-tark' },
    feedbackStep,
  ],
  canvas: [
    { title: 'The Modeling Canvas', content: 'This is where you build your theoretical model. Drag and drop indicators to create new latent constructs.', icon: icon(Mouse) },
    { title: 'Selection Tool', content: 'Use this tool to select and move constructs or paths on the canvas.', icon: icon(Cursor), selector: '#tour-select' },
    { title: 'Add Latent Variables', content: 'Click here to place a new latent variable construct on the canvas.', icon: icon(PlusCircle), selector: '#tour-latent-variable' },
    { title: 'Path Connector', content: 'Represent your hypotheses by drawing paths between constructs.', icon: icon(Graph), selector: '#tour-connect' },
    { title: 'Deletion Tool', content: 'Quickly remove constructs or paths by clicking on them with this tool active.', icon: icon(Trash), selector: '#tour-delete' },
    { title: 'Run Analysis', content: 'Execute the PLS-SEM algorithm and bootstraping from this central button.', icon: icon(CheckCircle), selector: '#tour-calculate' },
    { title: 'Properties Panel', content: 'Modify construct names, shapes, and types in this contextual sidebar.', icon: icon(SlidersHorizontal), selector: '#tour-properties-tab' },
    { title: 'Indicators Panel', content: 'Manage the measurement items linked to your latent variables.', icon: icon(CirclesThreePlus), selector: '#tour-indicators-panel' },
    { title: 'Measurement Model', content: 'Switch between Reflective and Formative measurement modes.', icon: icon(Layout), selector: '#tour-measurement-model' },
    { title: 'Construct Color', content: 'Categorize your model visually with secondary colors.', icon: icon(PaintBucket), selector: '#tour-construct-color' },
    { title: 'Tools & Workspace', content: 'Access canvas settings like background color and grid options.', icon: icon(Toolbox), selector: '#tour-tools-tab' },
    { title: 'Search Variables', content: 'Quickly find indicators in your dataset to drag onto the canvas.', icon: icon(MagnifyingGlass), selector: '#tour-search-variables' },
    { title: 'Change Dataset', content: 'Update the active dataset for this model if your data has been refined.', icon: icon(ArrowsClockwise), selector: '#tour-change-dataset' },
    feedbackStep,
  ],
  import: [
    { title: 'Data Integration', content: `Import your CSV or Excel files here. ${APP_BRAND_NAME} intelligently detects your headers and data types.`, icon: icon(Database) },
    feedbackStep,
  ],
  results: [
    { title: 'Interpreting Results', content: 'View your path coefficients and R-squares directly on the diagram.', icon: icon(Graph) },
    feedbackStep,
  ],
}
}

function panel(style: CSSProperties = {}): CSSProperties {
  return {
    background: 'linear-gradient(180deg, rgb(var(--color-panel-pop-rgb) / 0.98), rgb(var(--color-panel-rgb) / 0.98))',
    border: '1px solid var(--color-floating-border-soft)',
    boxShadow: 'inset 0 1px 0 var(--color-floating-highlight-soft)',
    ...style,
  }
}

function focus(active: boolean, radius = 12): CSSProperties {
  return active ? { borderColor: TOUR_ACCENT, boxShadow: `0 0 0 3px ${TOUR_SOFT}, var(--shadow-panel-pop)`, borderRadius: radius } : {}
}

function Bar({ w, h = 6, strong = false }: { w: number | string; h?: number; strong?: boolean }) {
  return <span style={{ width: w, height: h, borderRadius: 999, background: strong ? 'rgb(var(--color-accent-rgb) / 0.34)' : TOUR_PREVIEW_MUTED }} />
}

function Cell({ active = false, h = 24, children }: { active?: boolean; h?: number; children?: ReactNode }) {
  return (
    <div style={{ ...panel({ height: h, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }), ...(active ? focus(true, 10) : {}) }}>
      {children}
    </div>
  )
}

function HomePreview({ step }: { step: TourStep }) {
  const selector = step.selector || ''
  const welcome = !selector
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '74px 1fr', gap: 10, height: '100%', padding: 14 }}>
      <div style={panel({ borderRadius: 16, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 })}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Bar w={28} />
          <Cell active={selector === '#tour-new-workspace'} h={18}><PlusCircle size={10} color={TOUR_ACCENT} weight="fill" /></Cell>
        </div>
        {[0, 1, 2].map((item) => <div key={item} style={panel({ height: 28, borderRadius: 10, background: item === 0 ? 'rgb(var(--color-accent-rgb) / 0.1)' : TOUR_PREVIEW_SUBTLE })} />)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ ...panel({ flex: 1, height: 26, borderRadius: 10, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6 }), ...focus(selector === '#tour-search-workspace', 10) }}>
            <MagnifyingGlass size={10} color={TOUR_ACCENT} weight="bold" />
            <Bar w={54} h={5} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Cell active={selector === '#tour-grid-view'} h={24}><GridFour size={11} color={TOUR_ACCENT} weight="fill" /></Cell>
            <Cell active={selector === '#tour-list-view'} h={24}><Rows size={11} color={TOUR_ACCENT} weight="fill" /></Cell>
            <Cell active={selector === '#tour-tark'} h={24}><FileText size={11} color={TOUR_ACCENT} weight="fill" /></Cell>
            <Cell active={selector === '#tour-help'} h={24}><ChatCircleText size={11} color={TOUR_ACCENT} weight="regular" /></Cell>
          </div>
        </div>
        <div style={{ ...panel({ borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 96 }), ...(welcome ? focus(true, 16) : {}) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Bar w={74} strong /><Bar w={108} /></div>
            <div style={{ ...panel({ height: 24, padding: '0 10px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 5 }), ...focus(selector === '#tour-new-model', 999) }}>
              <PlusCircle size={10} color={TOUR_ACCENT} weight="fill" />
              <Bar w={30} h={5} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[0, 1].map((item) => <div key={item} style={panel({ height: 42, borderRadius: 12, background: item === 0 ? 'rgb(var(--color-accent-rgb) / 0.08)' : TOUR_PREVIEW_SUBTLE })} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function CanvasPreview({ step }: { step: TourStep }) {
  const selector = step.selector || ''
  const canvas = !selector
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 112px', gap: 10, height: '100%', padding: 14 }}>
      <div style={panel({ borderRadius: 16, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 })}>
        <div style={{ ...panel({ height: 24, borderRadius: 9 }), ...focus(selector === '#tour-change-dataset', 9) }} />
        <div style={{ ...panel({ height: 24, borderRadius: 9, padding: '0 9px', display: 'flex', alignItems: 'center', gap: 5 }), ...focus(selector === '#tour-search-variables', 9) }}>
          <MagnifyingGlass size={10} color={TOUR_ACCENT} weight="bold" />
          <Bar w={28} h={4} />
        </div>
        {[0, 1, 2].map((item) => <div key={item} style={panel({ height: 18, borderRadius: 8, background: item === 1 ? 'rgb(var(--color-accent-rgb) / 0.08)' : TOUR_PREVIEW_SUBTLE })} />)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ ...panel({ height: 34, borderRadius: 16, padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }) }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <Cell active={selector === '#tour-select'} h={24}><Cursor size={11} color={TOUR_ACCENT} weight="fill" /></Cell>
            <Cell active={selector === '#tour-latent-variable'} h={24}><PlusCircle size={11} color={TOUR_ACCENT} weight="fill" /></Cell>
            <Cell active={selector === '#tour-connect'} h={24}><Graph size={11} color={TOUR_ACCENT} weight="fill" /></Cell>
            <Cell active={selector === '#tour-delete'} h={24}><Trash size={11} color={TOUR_ACCENT} weight="fill" /></Cell>
          </div>
          <div style={{ ...panel({ height: 24, padding: '0 10px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 5 }), ...focus(selector === '#tour-calculate', 999) }}>
            <CheckCircle size={10} color={TOUR_ACCENT} weight="fill" />
            <Bar w={30} h={4} />
          </div>
        </div>
        <div style={{ ...panel({ flex: 1, borderRadius: 18, position: 'relative', overflow: 'hidden' }), ...(canvas ? focus(true, 18) : {}) }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgb(var(--color-border-rgb) / 0.5) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--color-border-rgb) / 0.5) 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.34 }} />
          <div style={{ position: 'absolute', left: 34, top: 46, width: 42, height: 42, borderRadius: '50%', background: 'rgb(var(--color-accent-rgb) / 0.16)', border: `2px solid ${TOUR_ACCENT}`, boxShadow: selector === '#tour-select' ? `0 0 0 5px ${TOUR_SOFT}` : 'none' }} />
          <div style={{ position: 'absolute', left: 124, top: 98, width: 42, height: 42, borderRadius: '50%', background: 'rgb(var(--color-accent-rgb) / 0.12)', border: `2px solid ${selector === '#tour-delete' ? TOUR_ACCENT : 'rgb(var(--color-accent-rgb) / 0.75)'}`, boxShadow: selector === '#tour-delete' ? `0 0 0 5px ${TOUR_SOFT}` : 'none' }} />
          {selector === '#tour-latent-variable' && <div style={{ position: 'absolute', left: 84, top: 40, width: 42, height: 42, borderRadius: '50%', background: 'rgb(var(--color-accent-rgb) / 0.08)', border: `2px dashed ${TOUR_ACCENT}`, boxShadow: `0 0 0 5px ${TOUR_SOFT}` }} />}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 200 150">
            <path d="M68 68 L123 106" stroke={selector === '#tour-connect' ? TOUR_ACCENT : TOUR_PREVIEW_LINE} strokeWidth={selector === '#tour-connect' ? 3 : 2} fill="none" />
            {selector === '#tour-connect' && <path d="M118 100 L126 106 L116 108" stroke={TOUR_ACCENT} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
        </div>
      </div>
      <div style={panel({ borderRadius: 16, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 })}>
        <div style={{ ...panel({ height: 34, borderRadius: 12, padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }), ...focus(selector === '#tour-properties-tab', 12) }}><Bar w={42} h={5} /><span style={{ width: 12, height: 12, borderRadius: '50%', background: TOUR_PREVIEW_MUTED }} /></div>
        <div style={{ ...panel({ borderRadius: 12, padding: 10 }), ...focus(selector === '#tour-indicators-panel', 12) }}>{[0, 1, 2].map((item) => <div key={item} style={{ marginBottom: item === 2 ? 0 : 6 }}><Bar w="100%" h={7} /></div>)}</div>
        <div style={{ ...panel({ borderRadius: 12, padding: 10 }), ...focus(selector === '#tour-measurement-model', 12) }}><div style={{ display: 'flex', gap: 6 }}><div style={{ flex: 1, height: 22, borderRadius: 999, background: 'rgb(var(--color-accent-rgb) / 0.22)', border: `1px solid ${TOUR_ACCENT}` }} /><div style={{ flex: 1, height: 22, borderRadius: 999, background: TOUR_PREVIEW_SUBTLE }} /></div></div>
        <div style={{ ...panel({ borderRadius: 12, padding: 10 }), ...focus(selector === '#tour-construct-color', 12) }}><div style={{ display: 'flex', gap: 6 }}>{['var(--color-accent)', '#2F8FB3', '#7C5CFF', '#E46F61'].map((color, index) => <span key={color} style={{ width: index === 0 ? 16 : 12, height: index === 0 ? 16 : 12, borderRadius: '50%', background: color, border: index === 0 ? '2px solid var(--color-text-primary)' : 'none' }} />)}</div></div>
        <div style={{ ...panel({ flex: 1, borderRadius: 12, padding: 10 }), ...focus(selector === '#tour-tools-tab', 12) }}>
          {[0, 1].map((row) => <div key={row} style={{ display: 'flex', gap: 6, marginBottom: row === 1 ? 0 : 8 }}>{[0, 1, 2].map((cell) => <div key={cell} style={{ flex: 1, height: 18, borderRadius: 8, background: TOUR_PREVIEW_SUBTLE }} />)}</div>)}
        </div>
      </div>
    </div>
  )
}

function ImportPreview() {
  return (
    <div style={{ height: '100%', padding: 14 }}>
      <div style={panel({ height: '100%', borderRadius: 18, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 })}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Bar w={68} strong /><Cell active h={24}><Database size={12} color={TOUR_ACCENT} weight="fill" /></Cell></div>
        <div style={{ height: 88, borderRadius: 16, border: `1px dashed ${TOUR_ACCENT}`, background: 'rgb(var(--color-accent-rgb) / 0.08)', boxShadow: `0 0 0 3px ${TOUR_SOFT}`, display: 'grid', placeItems: 'center' }}><Database size={24} color={TOUR_ACCENT} weight="fill" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{[0, 1].map((item) => <div key={item} style={panel({ height: 34, borderRadius: 12 })} />)}</div>
      </div>
    </div>
  )
}

function ResultsPreview() {
  return (
    <div style={{ height: '100%', padding: 14 }}>
      <div style={panel({ height: '100%', borderRadius: 18, padding: 12, display: 'grid', gridTemplateColumns: '1fr 88px', gap: 10 })}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>{[0, 1, 2].map((item) => <div key={item} style={panel({ height: 42, borderRadius: 12, background: item === 0 ? 'rgb(var(--color-accent-rgb) / 0.08)' : TOUR_PREVIEW_SUBTLE })} />)}</div>
          <div style={panel({ flex: 1, borderRadius: 14 })} />
        </div>
        <div style={panel({ borderRadius: 14, position: 'relative' })}>
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 88 132">
            <circle cx="28" cy="34" r="14" fill="rgb(var(--color-accent-rgb) / 0.16)" stroke={TOUR_ACCENT} strokeWidth="2" />
            <circle cx="58" cy="90" r="14" fill="rgb(var(--color-accent-rgb) / 0.12)" stroke="rgb(var(--color-accent-rgb) / 0.75)" strokeWidth="2" />
            <path d="M36 46 L50 76" stroke={TOUR_ACCENT} strokeWidth="2.5" fill="none" />
          </svg>
        </div>
      </div>
    </div>
  )
}
function TourArtwork({ step, currentStep, totalSteps, isWelcomeStep }: { step: TourStep; currentStep: number; totalSteps: number; isWelcomeStep: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        minHeight: isWelcomeStep ? 102 : 92,
        borderRadius: 18,
        overflow: 'hidden',
        background: 'linear-gradient(145deg, rgb(var(--color-accent-rgb) / 0.16) 0%, rgb(var(--color-accent-rgb) / 0.05) 24%, rgb(var(--color-panel-rgb) / 0.98) 76%)',
        border: 'none',
        boxShadow: 'none',
      }}
    >
      {!isWelcomeStep && (
        <div style={{ position: 'absolute', top: 12, left: 12, minWidth: 48, height: 20, padding: '0 8px', borderRadius: 999, background: 'rgb(var(--color-surface-rgb) / 0.82)', border: '1px solid var(--color-floating-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 9, fontWeight: 700 }}>
            {String(currentStep + 1).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
          </span>
        </div>
      )}
      <div style={{ padding: isWelcomeStep ? '34px 16px 16px' : '34px 14px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: isWelcomeStep ? 70 : 62,
            height: isWelcomeStep ? 70 : 62,
            borderRadius: 18,
            background: isWelcomeStep ? 'transparent' : 'rgb(var(--color-accent-rgb) / 0.16)',
            border: 'none',
            boxShadow: isWelcomeStep ? 'none' : `0 10px 18px ${TOUR_GLOW}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <div style={{ transform: isWelcomeStep ? 'scale(1)' : 'scale(0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {step.icon}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingTour({ currentScreen, theme, displayName = '', workspacePath = '', onClose }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null)
  const [modalPos, setModalPos] = useState(() => {
    const width = typeof window === 'undefined' ? 380 : Math.min(380, window.innerWidth - 20)
    const height = width < 340 ? 244 : 214
    const top = typeof window === 'undefined' ? 24 : Math.max(16, window.innerHeight / 2 - height / 2)
    const left = typeof window === 'undefined' ? 24 : Math.max(16, window.innerWidth / 2 - width / 2)
    return { top, left, opacity: 1, width }
  })
  const tourData = useMemo(() => buildTourData(displayName, workspacePath), [displayName, workspacePath])
  const steps = useMemo(() => tourData[currentScreen] || tourData.home, [tourData, currentScreen])
  const step = steps[Math.min(currentStep, Math.max(steps.length - 1, 0))]
  const isWelcomeStep = currentScreen === 'home' && currentStep === 0 && !step?.selector
  const trimmedDisplayName = displayName.trim()

  useLayoutEffect(() => {
    const place = () => {
      const width = Math.min(isWelcomeStep ? 448 : 380, window.innerWidth - 24)
      const height = isWelcomeStep ? 274 : width < 340 ? 244 : 214
      const el = step.selector ? document.querySelector(step.selector) : null
      if (!el) {
        setSpotlightRect(null)
        setModalPos({ top: Math.max(16, window.innerHeight / 2 - height / 2), left: Math.max(16, window.innerWidth / 2 - width / 2), opacity: 1, width })
        return
      }
      const rect = el.getBoundingClientRect()
      let top = rect.bottom + 18
      let left = rect.left + rect.width / 2 - width / 2
      if (top + height > window.innerHeight - 16) top = rect.top - height - 18
      if (top < 16) top = Math.max(16, window.innerHeight / 2 - height / 2)
      left = Math.max(16, Math.min(window.innerWidth - width - 16, left))
      setSpotlightRect(rect)
      setModalPos({ top, left, opacity: 1, width })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [currentStep, isWelcomeStep, step?.selector, steps])

  const handleNext = () => {
    if (currentStep === steps.length - 1) {
      localStorage.setItem('pls:tour-completed', 'true')
      onClose()
    } else setCurrentStep((value) => value + 1)
  }

  const handleSkip = () => {
    localStorage.setItem('pls:tour-completed', 'true')
    onClose()
  }

  const compact = modalPos.width < 350
  const tourOverlay = (
    <div className="fixed inset-0 z-[3000] overflow-hidden" data-theme={theme === 'Light' ? 'light' : 'dark'}>
      {!spotlightRect && (
        <div
          className="absolute inset-0"
          style={{ background: 'var(--color-overlay)' }}
        />
      )}
      {spotlightRect && (
        <div
          className="absolute"
          style={{
            left: spotlightRect.left - 10,
            top: spotlightRect.top - 10,
            width: spotlightRect.width + 20,
            height: spotlightRect.height + 20,
            borderRadius: 12,
            border: `2px solid ${TOUR_ACCENT}`,
            boxShadow: `0 0 0 9999px var(--color-overlay), 0 0 0 8px ${TOUR_SOFT}`,
            pointerEvents: 'none',
          }}
        />
      )}
      <div className="fixed pointer-events-auto transition-all duration-300 ease-out" style={{ top: modalPos.top, left: modalPos.left, width: modalPos.width, opacity: modalPos.opacity, transform: `translateY(${modalPos.opacity === 1 ? 0 : 10}px)` }}>
        <div style={{ position: 'relative', borderRadius: 18, background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-panel) 100%)', border: '1px solid var(--color-floating-border-soft)', boxShadow: 'var(--shadow-modal)', overflow: 'hidden' }}>
          <button onClick={handleSkip} style={{ position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} /></button>
          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '120px 1fr', gap: compact ? 12 : 14, padding: isWelcomeStep ? '16px 44px 10px 16px' : '14px 42px 10px 14px' }}>
            <TourArtwork step={step} currentStep={currentStep} totalSteps={steps.length} isWelcomeStep={isWelcomeStep} />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, paddingTop: compact ? 0 : 2 }}>
              <h2 style={{ margin: 0, color: 'var(--color-text-primary)', fontFamily: TOUR_HEADING_FONT, fontSize: isWelcomeStep ? 18 : 16, fontWeight: isWelcomeStep ? 560 : 600, lineHeight: isWelcomeStep ? 1.1 : 1.14, maxWidth: isWelcomeStep ? 318 : 240 }}>
                {isWelcomeStep ? (
                  <>
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      Glad you decided to try {APP_BRAND_NAME}
                      {trimmedDisplayName ? ',' : ''}
                    </span>
                    {trimmedDisplayName ? (
                      <>
                        {' '}
                        <span style={{ color: 'var(--color-text-primary)' }}>{trimmedDisplayName}</span>
                      </>
                    ) : null}
                  </>
                ) : (
                  step.title
                )}
              </h2>
              <p style={{ margin: isWelcomeStep ? '12px 0 0' : '8px 0 0', color: isWelcomeStep ? 'rgb(var(--color-text-secondary-rgb) / 0.72)' : 'rgb(var(--color-text-secondary-rgb) / 0.86)', fontFamily: 'DM Sans, sans-serif', fontSize: isWelcomeStep ? 12 : 11, lineHeight: isWelcomeStep ? 1.52 : 1.45, maxWidth: isWelcomeStep ? 290 : 240, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                {step.content}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: isWelcomeStep ? '10px 16px 14px' : '10px 14px 12px', borderTop: '1px solid var(--color-floating-border-soft)', background: 'linear-gradient(180deg, rgb(var(--color-surface-rgb) / 0.54), rgb(var(--color-elevated-rgb) / 0.44))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{steps.map((_, index) => <span key={index} style={{ width: index === currentStep ? 16 : 5, height: 5, borderRadius: 999, background: index === currentStep ? TOUR_ACCENT : 'rgb(var(--color-text-secondary-rgb) / 0.18)', transition: 'width 0.2s ease, background 0.2s ease' }} />)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <button
                onClick={handleSkip}
                style={{
                  border: isWelcomeStep ? '1px solid var(--color-floating-border-soft)' : 'none',
                  background: isWelcomeStep ? 'var(--color-floating-icon-bg)' : 'transparent',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: isWelcomeStep ? 11 : 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: isWelcomeStep ? '0 14px' : '4px 2px',
                  height: isWelcomeStep ? 34 : 'auto',
                  borderRadius: isWelcomeStep ? 999 : 0,
                }}
              >
                {isWelcomeStep ? `I'll explore on my own` : 'Skip'}
              </button>
              <button onClick={handleNext} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: isWelcomeStep ? 36 : 30, padding: isWelcomeStep ? '0 16px' : '0 12px', borderRadius: 999, border: '1px solid rgb(var(--color-accent-rgb) / 0.42)', background: 'var(--color-accent)', color: 'var(--color-on-accent)', fontFamily: 'DM Sans, sans-serif', fontSize: isWelcomeStep ? 11 : 10, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 16px rgb(var(--color-accent-rgb) / 0.18)' }}>
                {isWelcomeStep ? 'Show Me Around' : currentStep === steps.length - 1 ? 'Finish' : 'Next'}
                {currentStep < steps.length - 1 && <CaretRight size={10} weight="bold" color="var(--color-on-accent)" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(tourOverlay, document.body) : tourOverlay
}
