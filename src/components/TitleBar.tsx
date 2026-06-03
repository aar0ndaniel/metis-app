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
  CopySimple,
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
  activeModelName?: string
}

function buildTarkMenu(): MenuItem[] {
  return [
    { type: 'item', label: 'Create Tark Report', action: 'open-tark' },
  ]
}

function buildHelpMenu(): MenuItem[] {
  return [
    { type: 'item', label: 'Documentation', shortcut: 'F1', action: 'open-docs' },
    { type: 'item', label: 'Getting Started', action: 'open-tour' },
    { type: 'separator' },
    { type: 'item', label: 'Feedback', action: 'open-feedback' },
    { type: 'item', label: 'Report a Bug', action: 'open-report-bug' },
    { type: 'item', label: 'Cite Metis', action: 'open-cite-metis' },
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
  const menuItemColor = 'var(--color-title-menu-text)'
  const menuMutedColor = 'var(--color-title-menu-muted)'
  const menuDisabledColor = 'var(--color-title-menu-disabled)'

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
              className={`titlebar-menu-row w-full flex items-center gap-2 px-3.5 h-8 ${item.disabled ? 'titlebar-menu-row-disabled cursor-default' : ''}`}
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
                className={`titlebar-menu-row w-full flex items-center justify-between px-3.5 h-8 ${item.disabled ? 'titlebar-menu-row-disabled opacity-50 cursor-default' : ''}`}
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
        const textColor = item.disabled ? menuDisabledColor : item.color ?? menuItemColor
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
            className={`titlebar-menu-row w-full flex items-center justify-between gap-2 px-3.5 h-8 ${item.disabled ? 'titlebar-menu-row-disabled cursor-default' : ''}`}
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
export default function TitleBar({ currentScreen = 'home', theme = 'Dark', activeModelName = '' }: TitleBarProps) {
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
    { label: 'Tark it', items: buildTarkMenu(), width: 220 },
    { label: 'Help', items: buildHelpMenu(), width: 240 },
  ]

  const logoVariant = theme === 'Light' ? 'black' : 'white'
  const showTitleBarDivider = currentScreen === 'canvas'
  const isMac = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin'
  const activeModelTitle = activeModelName.trim()
  const showActiveModelTitle = isMac && (currentScreen === 'canvas' || currentScreen === 'results') && activeModelTitle.length > 0

  return (
    <div
      className="flex items-center shrink-0 select-none drag-region relative z-50"
      style={{
        height: 36,
        padding: isMac ? '0 16px 0 80px' : '0 16px',
        gap: isMac ? 16 : 24,
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

      {showActiveModelTitle && (
        <div
          className="pointer-events-none absolute left-1/2 top-0 flex h-full max-w-[44vw] -translate-x-1/2 items-center justify-center"
          style={{ ...({ WebkitAppRegion: 'drag' } as any) }}
        >
          <span
            style={{
              color: 'var(--color-title-tab)',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {activeModelTitle}
          </span>
        </div>
      )}

      {/* Divider between logo and menus */}
      {!isMac && <div style={{ width: 1, height: 20, backgroundColor: 'var(--color-surface)', flexShrink: 0 }} />}

      {/* Menu items — exact from Pencil: gap 2, padding [4,10], cornerRadius 5 */}
      {!isMac && <nav className="flex items-center no-drag" style={{ gap: 2 }}>
        {menus.map((menu) => (
          <div key={menu.label} className="relative">
            <div className="relative h-full flex items-center">
            <button
              id={menu.label === 'Tark it' ? 'tour-tark' : menu.label === 'Help' ? 'tour-help' : undefined}
              className="px-3 h-7 rounded-[6px] text-[13px] font-medium outline-none"
              style={{
                color: openMenu === menu.label ? 'var(--color-text-secondary-alt)' : 'var(--color-title-tab)',
                backgroundColor: 'transparent',
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
                    backgroundColor: 'rgb(var(--color-accent-rgb) / 0.95)',
                    borderLeft: '1px solid rgb(var(--color-accent-rgb) / 0.4)',
                    borderTop: '1px solid rgb(var(--color-accent-rgb) / 0.4)',
                    transform: 'translateX(-50%) rotate(45deg)',
                    borderTopLeftRadius: 2,
                  }}
                />
                <div
                  className="flex items-center gap-2 rounded-[10px] px-3 py-2"
                  style={{
                    minWidth: 244,
                    background: 'rgb(var(--color-accent-rgb) / 0.95)',
                    border: '1px solid rgb(var(--color-accent-rgb) / 0.38)',
                    color: 'var(--color-on-accent)',
                    boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
                  }}
                >
                  <HandPointing size={14} weight="fill" color="var(--color-on-accent)" />
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
      </nav>}

      {/* Spacer (fills remaining space, also drag region) */}
      <div className="flex-1 h-full" />

      {/* Window controls */}
      {!isMac && <div
        className="flex h-full items-center no-drag"
        style={{
          ...({ WebkitAppRegion: 'no-drag' } as any),
        }}
      >
        <button
          onClick={() => window.electronAPI?.minimize()}
          title="Minimize"
          aria-label="Minimize window"
          className={`flex h-9 w-[46px] items-center justify-center rounded-none bg-transparent transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.86)] hover:text-[var(--color-text-primary)] focus-visible:bg-[rgb(var(--color-hover-rgb)/0.95)] focus-visible:text-[var(--color-text-primary)] focus-visible:outline-none ${theme === 'Light' ? 'text-[#202124]' : 'text-[#F4F4F5]'}`}
          style={{
            margin: 0,
            padding: 0,
            border: 'none',
          }}
        >
          <Minus size={15} weight="bold" color="currentColor" />
        </button>
        <button
          onClick={() => window.electronAPI?.maximize()}
          title={isMaximized ? 'Restore' : 'Maximize'}
          aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
          className={`flex h-9 w-[46px] items-center justify-center rounded-none bg-transparent transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.86)] hover:text-[var(--color-text-primary)] focus-visible:bg-[rgb(var(--color-hover-rgb)/0.95)] focus-visible:text-[var(--color-text-primary)] focus-visible:outline-none ${theme === 'Light' ? 'text-[#202124]' : 'text-[#F4F4F5]'}`}
          style={{
            margin: 0,
            padding: 0,
            border: 'none',
          }}
        >
          {isMaximized ? (
            <CopySimple size={15} weight="bold" color="currentColor" />
          ) : (
            <Square size={14} weight="bold" color="currentColor" />
          )}
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('pls:action', { detail: { action: 'quit-app' } }))}
          title="Close"
          aria-label="Close window"
          className={`flex h-9 w-[46px] items-center justify-center rounded-none bg-transparent transition-colors hover:bg-[var(--color-warning)] hover:text-white focus-visible:bg-[var(--color-warning)] focus-visible:text-white focus-visible:outline-none ${theme === 'Light' ? 'text-[#202124]' : 'text-[#F4F4F5]'}`}
          style={{
            margin: 0,
            padding: 0,
            border: 'none',
          }}
        >
          <X size={15} weight="bold" color="currentColor" />
        </button>
      </div>}
    </div>
  )
}
