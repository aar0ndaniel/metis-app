import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, ArrowSquareOut, X } from '@phosphor-icons/react'
import algorithmPreferencesCapture from '../assets/onboarding/0.3.1/algorithm-preferences.png'
import analysisTitlebarCapture from '../assets/onboarding/0.3.1/analysis-titlebar.png'
import missingDataHighlightingCapture from '../assets/onboarding/0.3.1/missing-data-highlighting.png'
import missingDataMarkerCapture from '../assets/onboarding/0.3.1/missing-data-marker.png'
import tarkReportCapture from '../assets/onboarding/0.3.1/tark-report.png'

interface WhatsNewModalProps {
  theme: 'Dark' | 'Light'
  onComplete: () => void
  onDismiss: () => void
}

interface UpdateSlide {
  title: string
  description: string
  image: string
  imageAlt: string
  links?: Array<{ label: string; href: string }>
}

const slides: UpdateSlide[] = [
  {
    title: 'Algorithm Preferences',
    description: 'Set reusable defaults for PLS-SEM, bootstrap, prediction, advanced analyses, and moderation from one dedicated preferences page.',
    image: algorithmPreferencesCapture,
    imageAlt: 'The Metis Algorithm Defaults preferences page.',
  },
  {
    title: 'Missing Data Highlighting',
    description: 'Find missing values quickly with a dataset-wide count, previous and next navigation, and row-and-column highlighting for the active cell.',
    image: missingDataHighlightingCapture,
    imageAlt: 'Metis Data View highlighting a missing value and its row and column.',
  },
  {
    title: 'Missing Data Marker',
    description: 'Choose a built-in or custom missing-value marker during import so values are recognized consistently throughout analysis.',
    image: missingDataMarkerCapture,
    imageAlt: 'The Metis dataset import preview with the Missing Marker selector open.',
  },
  {
    title: 'Tark reports',
    description: 'Turn saved PLS-SEM, Bootstrap, and PLS Predict results into a guided Word-report workflow with a path-diagram preview.',
    image: tarkReportCapture,
    imageAlt: 'The Metis Tark report setup modal with its three-step report workflow.',
    links: [{ label: 'Tark report guide', href: 'https://metis.emend.it.com/tark-report.html' }],
  },
  {
    title: 'Analysis menu',
    description: 'Metis 0.3.1 brings every analysis into one title-bar menu: PLS-SEM, Bootstrap, PLS Predict, NCA and IPMA, MICOM, and MGA.',
    image: analysisTitlebarCapture,
    imageAlt: 'Metis Analysis menu open in the title bar with all analysis commands visible.',
    links: [{ label: 'Metis documentation', href: 'https://metis.emend.it.com/docs.html' }],
  },
]

export default function WhatsNewModal({ theme, onComplete, onDismiss }: WhatsNewModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const slide = slides[currentSlide]
  const isLastSlide = currentSlide === slides.length - 1
  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
      if (event.key === 'ArrowLeft' && currentSlide > 0) setCurrentSlide(index => index - 1)
      if (event.key === 'ArrowRight' && !isLastSlide) setCurrentSlide(index => index + 1)
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])'))
        .filter(element => !element.hasAttribute('disabled'))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentSlide, isLastSlide, onDismiss])

  const modal = (
    <div
      className="fixed inset-0 z-[3100] flex items-center justify-center p-4"
      data-theme={theme === 'Light' ? 'light' : 'dark'}
      style={{ background: 'var(--color-overlay)', backdropFilter: 'blur(4px)' }}
    >
      <div
        ref={dialogRef}
        className="metis-whats-new-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metis-whats-new-title"
        style={{
          width: 680,
          height: 420,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 16,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-floating-border-soft)',
          boxShadow: 'var(--shadow-modal)',
          color: 'var(--color-text-primary)',
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        <header style={{ height: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '30px 54px 0 20px' }}>
          <div style={{ minWidth: 0 }}>
            <h1 id="metis-whats-new-title" style={{ margin: 0, fontSize: 20, lineHeight: 1.2, fontWeight: 400 }}>What's new in Metis 0.3.1</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: 13 }}>Welcome — review each update, then build your first model.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close 0.3.1 updates"
            onClick={onDismiss}
            style={{ marginLeft: 'auto', width: 32, height: 32, border: '1px solid var(--color-floating-border-soft)', borderRadius: 10, background: 'var(--color-floating-icon-bg)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
          >
            <X size={14} />
          </button>
        </header>

        <div className="metis-whats-new-deck" aria-live="polite" style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          <div
            className="metis-whats-new-body-row"
            style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 22, padding: '16px 20px', height: '100%', width: '100%', boxSizing: 'border-box' }}
          >
          <figure className="metis-whats-new-figure" style={{ margin: 0, width: '52%', height: '100%', maxHeight: 240, flexShrink: 0, overflow: 'hidden', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-page)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              key={slide.image}
              src={slide.image}
              alt={slide.imageAlt}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top left', display: 'block', animation: reduceMotion ? 'none' : 'metis-whats-new-in 180ms ease-out' }}
            />
          </figure>
          <section className="metis-whats-new-info" style={{ width: '48%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16, lineHeight: 1.3, fontWeight: 400 }}>{slide.title}</h2>
            <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 12, lineHeight: 1.5 }}>{slide.description}</p>
            {slide.links && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                {slide.links.map(link => (
                  <a key={link.href} href={link.href} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-accent)', fontSize: 11, fontWeight: 400, textDecoration: 'none' }}>
                    {link.label}<ArrowSquareOut size={10} weight="bold" />
                  </a>
                ))}
              </div>
            )}
          </section>
          </div>
        </div>

        <footer style={{ height: 58, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
          <button
            type="button"
            aria-label="Previous update"
            disabled={currentSlide === 0}
            onClick={() => setCurrentSlide(index => Math.max(0, index - 1))}
            style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: currentSlide === 0 ? 'default' : 'pointer', opacity: currentSlide === 0 ? 0.38 : 1, display: 'grid', placeItems: 'center' }}
          >
            <ArrowLeft size={13} weight="bold" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} aria-label={`Update ${currentSlide + 1} of ${slides.length}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {slides.map((item, index) => (
              <button key={item.title} type="button" aria-label={`View ${item.title}`} onClick={() => setCurrentSlide(index)} style={{ width: index === currentSlide ? 22 : 7, height: 7, padding: 0, border: 0, borderRadius: 999, background: index === currentSlide ? 'var(--color-accent)' : 'rgb(var(--color-text-secondary-rgb) / 0.22)', cursor: 'pointer', transition: reduceMotion ? 'none' : 'width 180ms ease, background 180ms ease' }} />
            ))}
            </div>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{currentSlide + 1} / {slides.length}</span>
          </div>
          <button
            type="button"
            onClick={() => isLastSlide ? onComplete() : setCurrentSlide(index => index + 1)}
            style={{ height: 36, padding: '0 16px', borderRadius: 999, border: '1px solid rgb(var(--color-accent-rgb) / 0.42)', background: 'var(--color-accent)', color: 'var(--color-on-accent)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 400 }}
          >
            {isLastSlide ? 'Start walkthrough' : 'Next update'}
            <ArrowRight size={12} weight="bold" />
          </button>
        </footer>
        <style>{`@media (prefers-reduced-motion: no-preference) { @keyframes metis-whats-new-in { from { opacity: .65; transform: translateX(5px); } to { opacity: 1; transform: translateX(0); } } } @media (max-width: 640px) { .metis-whats-new-dialog { width: calc(100vw - 24px) !important; height: auto !important; max-height: calc(100vh - 24px) !important; } .metis-whats-new-body-row { flex-direction: column !important; padding: 14px 16px !important; gap: 14px !important; } .metis-whats-new-figure, .metis-whats-new-info { width: 100% !important; } .metis-whats-new-figure { height: 150px !important; } }`}</style>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}
