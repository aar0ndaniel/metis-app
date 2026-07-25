import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, ArrowSquareOut, X } from '@phosphor-icons/react'
import analysisTitlebarCapture from '../assets/onboarding/0.3.0/analysis-titlebar.png'
import languagesCapture from '../assets/onboarding/0.3.0/languages.png'
import micomCapture from '../assets/onboarding/0.3.0/micom.png'
import mgaCapture from '../assets/onboarding/0.3.0/mga.png'
import tarkReportCapture from '../assets/onboarding/0.3.0/tark-report.png'

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
    title: 'Analysis menu',
    description: 'Metis 0.3.0 brings every analysis into one title-bar menu: PLS-SEM, Bootstrap, PLS Predict, NCA and IPMA, MICOM, and MGA.',
    image: analysisTitlebarCapture,
    imageAlt: 'Metis Analysis menu open in the title bar with all analysis commands visible.',
    links: [{ label: 'Metis documentation', href: 'https://metis.emend.it.com/docs.html' }],
  },
  {
    title: 'Four interface languages',
    description: 'Choose English, Español, Português, or Français from Preferences. The selected language is remembered across launches.',
    image: languagesCapture,
    imageAlt: 'Metis Preferences showing the open language selector with English, Spanish, Portuguese, and French.',
  },
  {
    title: 'Permutation Analysis (MICOM)',
    description: 'Check configural, compositional, and equality invariance before comparing groups, with a guided permutation setup.',
    image: micomCapture,
    imageAlt: 'The Metis Permutation Analysis MICOM modal.',
    links: [
      { label: 'MICOM guide', href: 'https://metis.emend.it.com/metis-micom.html' },
      { label: 'Metis documentation', href: 'https://metis.emend.it.com/docs.html' },
    ],
  },
  {
    title: 'Multi Group Analysis (MGA)',
    description: 'Compare structural paths across groups with bootstrap subsamples, alpha controls, reproducible seeds, and dedicated results.',
    image: mgaCapture,
    imageAlt: 'The Metis Multi Group Analysis modal.',
    links: [{ label: 'Metis documentation', href: 'https://metis.emend.it.com/docs.html' }],
  },
  {
    title: 'Tark reports',
    description: 'Turn saved PLS-SEM, Bootstrap, and PLS Predict results into a guided Word-report workflow with a path-diagram preview.',
    image: tarkReportCapture,
    imageAlt: 'The Metis Tark report setup modal with its three-step report workflow.',
    links: [{ label: 'Tark report guide', href: 'https://metis.emend.it.com/tark-report.html' }],
  },
  {
    title: 'Latent construct shapes',
    description: 'Select your preferred construct shape (Circle, Oval, and Rectangle) from the drop-up menu on the canvas toolbar. Your choice is remembered per model.',
    image: analysisTitlebarCapture,
    imageAlt: 'Latent tool shape picker menu open on the canvas toolbar with Circle, Oval, and Rectangle options.',
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="metis-whats-new-title"
        style={{
          width: 520,
          height: 410,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 14,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-floating-border-soft)',
          boxShadow: 'var(--shadow-modal)',
          color: 'var(--color-text-primary)',
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        <header style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 14px 0 16px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ minWidth: 0 }}>
            <h1 id="metis-whats-new-title" style={{ margin: 0, fontSize: 15, lineHeight: 1.2, fontWeight: 750 }}>What's new in Metis 0.3.0</h1>
            <p style={{ margin: '2px 0 0', color: 'var(--color-text-muted)', fontSize: 10 }}>Welcome — review each update, then build your first model.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close 0.3.0 updates"
            onClick={onDismiss}
            style={{ marginLeft: 'auto', width: 28, height: 28, border: 0, borderRadius: 8, background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
          >
            <X size={14} />
          </button>
        </header>

        <div aria-live="polite" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '12px 14px 10px', gap: 9 }}>
          <figure style={{ margin: 0, height: 184, flexShrink: 0, overflow: 'hidden', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-page)' }}>
            <img
              key={slide.image}
              src={slide.image}
              alt={slide.imageAlt}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: slide.title === 'Analysis menu' ? 'top left' : 'center', display: 'block', animation: reduceMotion ? 'none' : 'metis-whats-new-in 180ms ease-out' }}
            />
          </figure>
          <section style={{ minHeight: 72 }}>
            <h2 style={{ margin: 0, fontSize: 14, lineHeight: 1.25, fontWeight: 750 }}>{slide.title}</h2>
            <p style={{ margin: '5px 0 0', color: 'var(--color-text-secondary)', fontSize: 10.5, lineHeight: 1.45 }}>{slide.description}</p>
            {slide.links && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 5, flexWrap: 'wrap' }}>
                {slide.links.map(link => (
                  <a key={link.href} href={link.href} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-accent)', fontSize: 10, fontWeight: 700, textDecoration: 'none' }}>
                    {link.label}<ArrowSquareOut size={10} weight="bold" />
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer style={{ height: 58, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderTop: '1px solid var(--color-border)', background: 'rgb(var(--color-elevated-rgb) / 0.42)' }}>
          <button
            type="button"
            aria-label="Previous update"
            disabled={currentSlide === 0}
            onClick={() => setCurrentSlide(index => Math.max(0, index - 1))}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-floating-icon-bg)', color: 'var(--color-text-secondary)', cursor: currentSlide === 0 ? 'default' : 'pointer', opacity: currentSlide === 0 ? 0.38 : 1, display: 'grid', placeItems: 'center' }}
          >
            <ArrowLeft size={13} weight="bold" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} aria-label={`Update ${currentSlide + 1} of ${slides.length}`}>
            {slides.map((item, index) => (
              <button key={item.title} type="button" aria-label={`View ${item.title}`} onClick={() => setCurrentSlide(index)} style={{ width: index === currentSlide ? 18 : 6, height: 6, padding: 0, border: 0, borderRadius: 999, background: index === currentSlide ? 'var(--color-accent)' : 'rgb(var(--color-text-secondary-rgb) / 0.22)', cursor: 'pointer', transition: reduceMotion ? 'none' : 'width 180ms ease, background 180ms ease' }} />
            ))}
          </div>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{currentSlide + 1} / {slides.length}</span>
          <button
            type="button"
            onClick={() => isLastSlide ? onComplete() : setCurrentSlide(index => index + 1)}
            style={{ marginLeft: 'auto', height: 34, padding: '0 14px', borderRadius: 9, border: '1px solid rgb(var(--color-accent-rgb) / 0.42)', background: 'var(--color-accent)', color: 'var(--color-on-accent)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 750 }}
          >
            {isLastSlide ? 'Start walkthrough' : 'Next update'}
            <ArrowRight size={12} weight="bold" />
          </button>
        </footer>
        <style>{`@media (prefers-reduced-motion: no-preference) { @keyframes metis-whats-new-in { from { opacity: .65; transform: translateX(5px); } to { opacity: 1; transform: translateX(0); } } }`}</style>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}
