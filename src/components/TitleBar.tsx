import { useState, useRef, useEffect } from 'react'
import {
  HandPointing,
  Minus,
  Square,
  CornersIn,
  X,
  Folders,
  NotePencil,
  CaretRight,
  Check,
  ChatCircleText,
  FileText,
} from '@phosphor-icons/react'
import AppLogo from './AppLogo'
import { APP_BRAND_NAME } from '../config/appBranding'
import { stripModelDisplayName } from '../utils/displayNames'

// ─── Types ────────────────────────────────────────────────────────────────────
type MenuItem =
  | { type: 'item'; label: string; shortcut?: string; icon?: string; disabled?: boolean; color?: string; action?: string }
  | { type: 'separator' }
  | { type: 'checked'; label: string; checked: boolean; disabled?: boolean; action?: string }
  | { type: 'submenu'; label: string; items?: MenuItem[]; disabled?: boolean }

interface TitleBarProps {
  /** Which screen we're on — controls which menu items are grayed out */
  currentScreen?: 'home' | 'canvas' | 'results' | 'import'
  theme?: 'Dark' | 'Light'
}

const TITLEBAR_OLIVE = '#87976B'

function buildHelpMenu(): MenuItem[] {
  return [
    { type: 'item', label: 'Documentation', shortcut: 'F1', action: 'open-docs' },
    { type: 'item', label: 'Getting Started', action: 'open-tour' },
    { type: 'item', label: 'PLS-SEM Reference' },
    { type: 'separator' },
    { type: 'item', label: `About ${APP_BRAND_NAME}`, action: 'open-about' },
  ]
}

// ─── Menu builders that take context into account ─────────────────────────────
function buildFileMenu(screen: string, recentModels: { id: string; name: string }[], status: any): MenuItem[] {
  const onResults  = screen === 'results'
  const noCanvas   = screen !== 'canvas'
  
  const recentItems: MenuItem[] = recentModels.length > 0
    ? recentModels.map(rm => ({
        type: 'item',
        label: stripModelDisplayName(rm.name),
        action: `open-recent:${rm.id}`
      }))
    : [{ type: 'item', label: 'No Recent Models', disabled: true }]

  return [
    { type: 'item', label: 'New Workspace', icon: 'folders', action: 'new-workspace' },
    { type: 'item', label: 'New Model', icon: 'note-pencil', action: 'new-model' },
    { type: 'separator' },
    { type: 'item', label: 'Open Workspace...', action: 'open-workspace' },
    { type: 'submenu', label: 'Open Recent', items: recentItems },
    { type: 'separator' },
    { type: 'item', label: 'Save',       shortcut: 'Ctrl+S',       disabled: noCanvas || !status.isDirty, action: 'file:save' },
    { type: 'item', label: 'Save As...', shortcut: 'Ctrl+Shift+S', disabled: noCanvas || !status.hasActiveModel, action: 'file:save-as' },
    { type: 'separator' },
    // Imports: greyed out on Results screen (can't import during a results session)
    { type: 'item', label: 'Import Dataset...',  action: 'import-dataset',  disabled: onResults },
    { type: 'item', label: 'Import R Script...',  action: 'import-rscript',  disabled: onResults },
    { type: 'separator' },
    // Exports: active on Results screen; still disabled if there is no model otherwise
    { type: 'item', label: 'Export R Script',     shortcut: onResults ? undefined : 'after calc.', disabled: !onResults, action: 'results:export-r-script' },
    ...(screen === 'canvas' ? [
      { type: 'separator' } as MenuItem,
      { type: 'item', label: 'Close Model', action: 'canvas:go-home' } as MenuItem,
    ] : []),
    { type: 'separator' },
    { type: 'item', label: 'Quit', shortcut: 'Alt+F4', color: 'var(--color-danger)', action: 'quit-app' },
  ]
}

function buildEditMenu(screen: string, status: any): MenuItem[] {
  const noModel   = screen === 'home' || screen === 'import'
  const onResults   = screen === 'results'
  const noEdit    = noModel || onResults
  return [
    { type: 'item', label: 'Undo',       shortcut: 'Ctrl+Z', disabled: noEdit || !status.canUndo, action: 'edit:undo' },
    { type: 'item', label: 'Redo',       shortcut: 'Ctrl+Y', disabled: noEdit || !status.canRedo, action: 'edit:redo' },
    { type: 'separator' },
    { type: 'item', label: 'Cut',        shortcut: 'Ctrl+X', disabled: noEdit || !status.hasItems, action: 'edit:cut' },
    { type: 'item', label: 'Copy',       shortcut: 'Ctrl+C', disabled: noEdit || !status.hasItems, action: 'edit:copy' },
    { type: 'item', label: 'Paste',      shortcut: 'Ctrl+V', disabled: noEdit || !status.canPaste, action: 'edit:paste' },
    { type: 'item', label: 'Delete',     shortcut: 'Del',    disabled: noEdit || !status.hasItems, action: 'edit:delete' },
    { type: 'separator' },
    { type: 'item', label: 'Select All', shortcut: 'Ctrl+A', disabled: noEdit || !status.hasCanvasItems, action: 'edit:selectall' },
    { type: 'separator' },
    { type: 'item', label: 'Preferences', action: 'open-preferences' },
  ]
}

function buildViewMenu(screen: string, showVars: boolean, showProps: boolean, showZoomControl: boolean): MenuItem[] {
  const noCanvas  = screen !== 'canvas'
  // On results, zoom/pan is handled in the diagram toolbar; panel toggles don't apply.
  const onResults = screen === 'results'
  return [
    { type: 'item',    label: 'Zoom In',       shortcut: 'Ctrl++', disabled: noCanvas, action: 'view:zoom-in' },
    { type: 'item',    label: 'Zoom Out',      shortcut: 'Ctrl+−', disabled: noCanvas, action: 'view:zoom-out' },
    { type: 'item',    label: 'Fit to Screen', shortcut: 'Ctrl+0', disabled: noCanvas, action: 'view:fit-screen' },
    { type: 'separator' },
    { type: 'checked', label: 'Zoom Control',     checked: showZoomControl, disabled: onResults, action: 'view:toggle-zoom-control' },
    { type: 'checked', label: 'Indicators Panel', checked: showVars, disabled: onResults, action: 'view:toggle-vars' },
    { type: 'checked', label: 'Properties Panel', checked: showProps, disabled: onResults, action: 'view:toggle-props' },
  ]
}

function buildAnalysisMenu(screen: string, status: any): MenuItem[] {
  const noCanvas = screen !== 'canvas'
  return [
    { type: 'item', label: 'Run PLS-SEM',       shortcut: 'Ctrl+Enter', disabled: noCanvas || !status.hasCanvasItems, action: 'run-pls' },
    { type: 'item', label: 'Run Bootstrap',      shortcut: 'Ctrl+B',    disabled: noCanvas || !status.hasCanvasItems, action: 'run-bootstrap' },
    { type: 'item', label: 'PLS Predict',       disabled: noCanvas || !status.hasCanvasItems, action: 'run-pls-predict' },
    { type: 'item', label: 'Advanced analysis', disabled: noCanvas || !status.canRunAdvanced, action: 'run-advanced-analysis' },
    { type: 'separator' },
    { type: 'item', label: 'Algorithm Settings', disabled: noCanvas || !status.hasCanvasItems },
  ]
}

// ─── Dropdown component ───────────────────────────────────────────────────────
function MenuDropdown({
  items,
  width,
  onClose,
}: {
  items: MenuItem[]
  width: number
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hoveredSubmenu, setHoveredSubmenu] = useState<number | null>(null)
  const menuItemColor = 'var(--color-text-primary)'
  const menuMutedColor = 'var(--color-title-tab)'
  const menuDisabledColor = 'var(--color-text-dim)'

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute top-0 left-0 mt-0 z-50 rounded-[10px] border overflow-visible"
      style={{
        width,
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-surface)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        padding: '6px 0',
      }}
    >
      {items.map((item, i) => {
        if (item.type === 'separator') {
          return <div key={i} className="h-px mx-0" style={{ backgroundColor: 'var(--color-border)' }} />
        }

        if (item.type === 'checked') {
          const checkedColor = item.disabled ? menuDisabledColor : menuItemColor
          const handleClick = item.disabled ? undefined : () => {
            if (item.action) {
              window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: item.action } }))
            }
            onClose()
          }
          return (
            <button
              key={i}
              className={`w-full flex items-center gap-2 px-3.5 h-8 transition-colors ${item.disabled ? 'cursor-default' : 'hover:bg-[rgb(var(--color-hover-rgb)/0.75)]'}`}
              onClick={handleClick}
            >
              {item.checked && !item.disabled && <Check size={12} color={menuItemColor} />}
              {(!item.checked || item.disabled) && <span className="w-3" />}
              <span className="text-[13px]" style={{ color: checkedColor, fontFamily: 'Inter, DM Sans, sans-serif' }}>
                {item.label}
              </span>
            </button>
          )
        }

        if (item.type === 'submenu') {
          return (
            <div
              key={i}
              className="relative w-full"
              onMouseEnter={() => setHoveredSubmenu(i)}
              onMouseLeave={() => setHoveredSubmenu(null)}
            >
              <button
                className={`w-full flex items-center justify-between px-3.5 h-8 transition-colors ${hoveredSubmenu === i ? 'bg-[rgb(var(--color-hover-rgb)/0.75)]' : 'hover:bg-[rgb(var(--color-hover-rgb)/0.75)]'} ${item.disabled ? 'opacity-50 cursor-default' : ''}`}
                onClick={item.disabled ? undefined : () => {}}
              >
                <span className="text-[13px]" style={{ color: item.disabled ? menuDisabledColor : menuItemColor, fontFamily: 'Inter, DM Sans, sans-serif' }}>
                  {item.label}
                </span>
                <CaretRight size={12} color={item.disabled ? menuDisabledColor : menuItemColor} />
              </button>
              
              {hoveredSubmenu === i && item.items && item.items.length > 0 && !item.disabled && (
                <div className="absolute left-full top-[-6px] ml-1">
                  <MenuDropdown items={item.items} width={200} onClose={onClose} />
                </div>
              )}
            </div>
          )
        }

        // Regular item
        const textColor = item.disabled ? menuDisabledColor : menuItemColor
        const scColor = item.disabled ? menuDisabledColor : menuMutedColor

        const handleClick = item.disabled ? undefined : () => {
          if (item.action) {
            window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: item.action } }))
          }
          onClose()
        }

        return (
          <button
            key={i}
            className={`w-full flex items-center justify-between gap-2 px-3.5 h-8 transition-colors ${
              item.disabled ? 'cursor-default' : 'hover:bg-[rgb(var(--color-hover-rgb)/0.75)]'
            }`}
            onClick={handleClick}
          >
            <span className="flex items-center gap-2">
              {item.icon === 'folders' && <Folders size={14} color={item.disabled ? menuDisabledColor : menuItemColor} />}
              {item.icon === 'note-pencil' && <NotePencil size={14} color={item.disabled ? menuDisabledColor : menuItemColor} />}
              <span className="text-[13px]" style={{ color: textColor, fontFamily: 'Inter, DM Sans, sans-serif' }}>
                {item.label}
              </span>
            </span>
            {item.shortcut && (
              <span className="text-[11px]" style={{ color: scColor, fontFamily: 'Inter, DM Sans, sans-serif' }}>
                {item.shortcut}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── TitleBar ──────────────────────────────────────────────────────────────────
export default function TitleBar({ currentScreen = 'home', theme = 'Dark' }: TitleBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [showVars, setShowVars] = useState(true)
  const [showProps, setShowProps] = useState(true)
  const [showZoomControl, setShowZoomControl] = useState(true)
  const [isMaximized, setIsMaximized] = useState(false)
  const [recentModels, setRecentModels] = useState<{ id: string; name: string }[]>([])
  const [showAdvancedHint, setShowAdvancedHint] = useState(false)
  const hintTimerRef = useRef<number | null>(null)
  const [status, setStatus] = useState({
    canUndo: false,
    canRedo: false,
    canPaste: false,
    hasItems: false,
    hasCanvasItems: false,
    hasActiveModel: false,
    isDirty: false,
    canRunAdvanced: false,
    showAdvancedHintToken: 0,
  })

  // Periodically refresh recent models whenever the menu is opened
  useEffect(() => {
    if (openMenu === 'File') {
      try {
        const stored = localStorage.getItem('metis:recentModels')
        if (stored) {
          const parsed = JSON.parse(stored)
          const normalized = Array.isArray(parsed)
            ? parsed
                .filter((item: any) => item && item.id && item.name)
                .map((item: any) => ({ id: String(item.id), name: String(item.name) }))
            : []
          setRecentModels(normalized)
        }
      } catch (e) {}
    }
  }, [openMenu])

  useEffect(() => {
    const handler = (e: any) => {
      const action = e.detail?.action
      if (action === 'view:toggle-vars') setShowVars(v => !v)
      if (action === 'view:toggle-props') setShowProps(v => !v)
      if (action === 'view:toggle-zoom-control') setShowZoomControl(v => !v)
      if (action === 'open-feedback') {
        void window.electronAPI?.openExternal?.('https://metis.emend.it.com/feedback.html')
      }
      
      const st = e.detail?.status
      if (st) {
        setStatus(prev => ({ ...prev, ...st }))
      }
    }
    window.addEventListener('pls:action', handler)
    return () => window.removeEventListener('pls:action', handler)
  }, [])

  useEffect(() => {
    let alive = true
    const syncWindowState = async () => {
      try {
        const maximized = await window.electronAPI?.isMaximized?.()
        if (alive && typeof maximized === 'boolean') {
          setIsMaximized(maximized)
        }
      } catch {}
    }

    syncWindowState()

    const unsub = window.electronAPI?.onWindowStateChanged?.(({ isMaximized }) => {
      setIsMaximized(isMaximized)
    })

    return () => {
      alive = false
      unsub?.()
    }
  }, [])

  const toggleMenu = (label: string) => {
    if (label === 'Analysis') setShowAdvancedHint(false)
    setOpenMenu((prev) => (prev === label ? null : label))
  }

  useEffect(() => {
    if (currentScreen !== 'results' || !status.canRunAdvanced || !status.showAdvancedHintToken) {
      setShowAdvancedHint(false)
      if (hintTimerRef.current) {
        window.clearTimeout(hintTimerRef.current)
        hintTimerRef.current = null
      }
      return
    }

    setShowAdvancedHint(true)
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current)
    hintTimerRef.current = window.setTimeout(() => {
      setShowAdvancedHint(false)
      hintTimerRef.current = null
    }, 4000)

    return () => {
      if (hintTimerRef.current) {
        window.clearTimeout(hintTimerRef.current)
        hintTimerRef.current = null
      }
    }
  }, [currentScreen, status.canRunAdvanced, status.showAdvancedHintToken])

  // Build menus with context-aware disabled states
  const menus: { label: string; items: MenuItem[]; width: number }[] = [
    { label: 'File', items: buildFileMenu(currentScreen, recentModels, status), width: 240 },
    { label: 'Edit', items: buildEditMenu(currentScreen, status), width: 220 },
    { label: 'View', items: buildViewMenu(currentScreen, showVars, showProps, showZoomControl), width: 230 },
    { label: 'Analysis', items: buildAnalysisMenu(currentScreen, status), width: 230 },
    { label: 'Help', items: buildHelpMenu(), width: 220 },
  ]

  const logoVariant = theme === 'Light' ? 'black' : 'white'
  const showTitleBarDivider = currentScreen === 'canvas'

  return (
    <div
      className="flex items-center shrink-0 select-none drag-region"
      style={{
        height: 36,
        padding: '0 16px',
        gap: 24,
        borderBottom: showTitleBarDivider ? '1px solid var(--color-border)' : '1px solid transparent',
        ...(theme === 'Light'
          ? { background: 'var(--color-titlebar-bg)' }
          : { background: '#202020' }),
        ...({ WebkitAppRegion: 'drag' } as any),
      }}
    >
      <div className="flex items-center no-drag shrink-0" style={{ gap: 7, ...({ WebkitAppRegion: 'no-drag' } as any) }}>
        {/* Logo mark */}
        <button
          className="flex items-center no-drag shrink-0"
          style={{ gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          title={currentScreen === 'home' ? 'Return to last model' : 'Go to workspace home'}
          onClick={() => window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: 'toggle-home-canvas' } }))}
        >
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
            }}
          >
            <AppLogo size={14} variant={logoVariant} />
          </div>
          <span
            style={{
              color: 'var(--color-text-primary)',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0,
              opacity: 0.9,
            }}
          >
            {APP_BRAND_NAME}
          </span>
        </button>
      </div>

      {/* Divider between logo and menus */}
      <div style={{ width: 1, height: 20, backgroundColor: 'var(--color-surface)', flexShrink: 0 }} />

      {/* Menu items — exact from Pencil: gap 2, padding [4,10], cornerRadius 5 */}
      <nav className="flex items-center no-drag" style={{ gap: 2 }}>
        {menus.map((menu) => (
          <div key={menu.label} className="relative">
            <div className="relative h-full flex items-center">
            <button
              className="px-3 h-7 rounded-[6px] text-[13px] font-medium transition-colors outline-none"
              style={{
                color: openMenu === menu.label ? 'var(--color-text-primary)' : 'var(--color-title-tab)',
                backgroundColor: openMenu === menu.label ? 'rgb(var(--color-text-primary-rgb) / 0.08)' : 'transparent',
                fontFamily: 'Inter, DM Sans, sans-serif'
              }}
              onClick={() => toggleMenu(menu.label)}
              onMouseEnter={() => {
                if (openMenu && openMenu !== menu.label) {
                  setOpenMenu(menu.label)
                }
              }}
            >
              {menu.label}
            </button>

            {menu.label === 'Analysis' && showAdvancedHint && (
              <div
                className="absolute left-1/2 top-full z-40 mt-2 -translate-x-1/2"
                style={{ pointerEvents: 'none' }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: -6,
                    left: '50%',
                    width: 12,
                    height: 12,
                    backgroundColor: 'rgba(135,151,107,0.95)',
                    borderLeft: '1px solid rgba(173,192,141,0.4)',
                    borderTop: '1px solid rgba(173,192,141,0.4)',
                    transform: 'translateX(-50%) rotate(45deg)',
                    borderTopLeftRadius: 2,
                  }}
                />
                <div
                  className="flex items-center gap-2 rounded-[10px] px-3 py-2"
                  style={{
                    minWidth: 244,
                    background: 'rgba(135,151,107,0.95)',
                    border: '1px solid rgba(173,192,141,0.38)',
                    color: '#10150B',
                    boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
                  }}
                >
                  <HandPointing size={14} weight="fill" color="#10150B" />
                  <span
                    style={{
                      fontFamily: 'Inter, DM Sans, sans-serif',
                      fontSize: 12,
                      fontWeight: 700,
                      lineHeight: 1.35,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Click here for NCA and cIPMA in Advanced analysis
                  </span>
                </div>
              </div>
            )}
            
            {openMenu === menu.label && (
              <div className="absolute top-full left-0 mt-0.5 z-50">
                <MenuDropdown 
                  items={menu.items} 
                  width={menu.width} 
                  onClose={() => setOpenMenu(null)} 
                />
              </div>
            )}
          </div>
          </div>
        ))}
      </nav>

      {/* Spacer (fills remaining space, also drag region) */}
      <div className="flex-1 h-full" />

      <div
        className="no-drag flex items-center"
        style={{
          gap: 6,
          ...({ WebkitAppRegion: 'no-drag' } as any),
        }}
      >
        {/* Tark report entry point */}
        <button
          id="tour-tark"
          className="no-drag flex items-center justify-center transition-opacity hover:opacity-80"
          style={{
            height: 24,
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: TITLEBAR_OLIVE,
            padding: '0 5px',
            gap: 5,
            fontFamily: 'Matter, "DM Sans", sans-serif',
            fontSize: 11,
            fontWeight: 600,
            width: 'fit-content',
            maxWidth: 'min(320px, 32vw)',
            overflow: 'hidden',
            flexShrink: 1,
          }}
          title="Tark journal-ready report"
          aria-label="Open Tark"
          onClick={() => window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: 'open-tark' } }))}
        >
          <FileText size={14} weight="fill" color={TITLEBAR_OLIVE} />
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minWidth: 0,
              width: 'fit-content',
              maxWidth: 'min(282px, 28vw)',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'clip', whiteSpace: 'nowrap' }}>Tark it</span>
          </span>
        </button>

        <button
          id="tour-feedback"
          className="no-drag flex items-center justify-center transition-opacity hover:opacity-80"
          style={{
            height: 24,
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: 'var(--color-title-tab)',
            padding: '0 5px',
            gap: 5,
            fontFamily: 'Matter, "DM Sans", sans-serif',
            fontSize: 11,
            fontWeight: 600,
            flexShrink: 0,
          }}
          title="Send feedback to the team"
          aria-label="Send feedback"
          onClick={() => window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: 'open-feedback' } }))}
        >
          <ChatCircleText size={14} weight="regular" color="var(--color-title-tab)" />
          <span style={{ whiteSpace: 'nowrap' }}>Feedback</span>
        </button>
      </div>

      {/* Window controls */}
      <div
        className="flex items-center no-drag"
        style={{
          gap: 2,
          marginRight: 2,
          ...({ WebkitAppRegion: 'no-drag' } as any),
        }}
      >
        <button
          onClick={() => window.electronAPI?.minimize()}
          title="Minimize"
          aria-label="Minimize window"
          className="group flex h-[20px] w-[20px] items-center justify-center rounded-full transition-all duration-200 ease-out focus-visible:outline-none"
          style={{
            margin: 0,
            padding: 0,
            border: 'none',
            background: 'transparent',
          }}
        >
          <span
            className="flex h-[14px] w-[14px] items-center justify-center rounded-full transition-all duration-200 ease-out group-hover:scale-[1.04] group-hover:brightness-105 group-focus-visible:scale-[1.04]"
            style={{
              border: '1px solid #67676B',
              background: 'linear-gradient(180deg, #808085 0%, #626267 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
              color: '#E2E2E5',
            }}
          >
            <Minus size={8} weight="bold" className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
          </span>
        </button>
        <button
          onClick={() => window.electronAPI?.maximize()}
          title={isMaximized ? 'Restore' : 'Maximize'}
          aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
          className="group flex h-[20px] w-[20px] items-center justify-center rounded-full transition-all duration-200 ease-out focus-visible:outline-none"
          style={{
            marginRight: 0,
            padding: 0,
            border: 'none',
            background: 'transparent',
          }}
        >
          <span
            className="flex h-[14px] w-[14px] items-center justify-center rounded-full transition-all duration-200 ease-out group-hover:scale-[1.04] group-hover:brightness-105 group-focus-visible:scale-[1.04]"
            style={{
              border: '1px solid #B99B78',
              background: isMaximized
                ? 'linear-gradient(180deg, #DABFA1 0%, #BB9369 100%)'
                : 'linear-gradient(180deg, #DABFA1 0%, #BB9369 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
              color: '#473120',
            }}
          >
            {isMaximized ? (
              <CornersIn size={8} weight="bold" className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
            ) : (
              <Square size={7} weight="bold" className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
            )}
          </span>
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: 'quit-app' } }))}
          title="Close"
          aria-label="Close window"
          className="group flex h-[20px] w-[20px] items-center justify-center rounded-full transition-all duration-200 ease-out focus-visible:outline-none"
          style={{
            marginRight: 0,
            padding: 0,
            border: 'none',
            background: 'transparent',
          }}
        >
          <span
            className="flex h-[14px] w-[14px] items-center justify-center rounded-full transition-all duration-200 ease-out group-hover:scale-[1.04] group-hover:brightness-105 group-focus-visible:scale-[1.04]"
            style={{
              border: '1px solid #92516E',
              background: 'linear-gradient(180deg, #B17391 0%, #7B3554 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
              color: '#F3D7E2',
            }}
          >
            <X size={8} weight="bold" className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
          </span>
        </button>
      </div>
    </div>
  )
}
