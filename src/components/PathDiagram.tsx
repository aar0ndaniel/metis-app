/**
 * PathDiagram — PLS-SEM path diagram rendered in canvas-native coordinate space.
 *
 * Accepts CanvasConstruct[] and CanvasPath[] directly from the ModelCanvas
 * localStorage snapshot, using the IDENTICAL indicator positioning formula,
 * arrowPath, and indicatorPath functions as ModelCanvas — so the diagram is
 * a pixel-perfect mirror of what the user drew.
 *
 * Three independent display modes (all default to 'Blank'):
 *   structuralMode  — value shown on structural arrows between constructs
 *   measurementMode — value shown on measurement arrows between indicators & constructs
 *   constructMode   — value shown inside construct circles
 */

import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  ANALYSIS_TONE_HEX,
  getOuterLoadingColor,
  getPValueColor,
  getPValueTone,
} from '../utils/analysisPalette'

function getDecimals() {
  const d = localStorage.getItem('pls:prefs:decimalPlaces')
  return d ? parseInt(d, 10) : 3
}

// ─── Canvas Types (mirror ModelCanvas) ───────────────────────────────────────

interface CanvasIndicator {
  name: string
  loading: number | null
  ox?: number
  oy?: number
  labelT?: number
}

type CanvasConstructShape = 'circle' | 'oval' | 'square'

export interface CanvasConstruct {
  id: string
  name: string
  type: 'Reflective' | 'Formative'
  color: string
  x: number
  y: number
  radius: number
  ovalWidth?: number
  ovalHeight?: number
  indicators: CanvasIndicator[]
  shape?: CanvasConstructShape
  indicatorDirection?: 'top' | 'right' | 'bottom' | 'left'
  indicatorAlignment?: 'top' | 'right' | 'bottom' | 'left'
  folded?: boolean
}

export interface CanvasPath {
  id: string
  from: string
  to: string
  style?: 'straight' | 'curved' | 'rightangle'
  curvature?: number
  joints?: { x: number; y: number }[]
  labelT?: number
}

// ─── Result Overlay Types ────────────────────────────────────────────────────

interface ConstructScores {
  r2?:       number
  r2Adj?:    number
  ave?:      number
  rhoA?:     number
  rhoC?:     number
  cronbach?: number
}

interface PathResult {
  coef?:           number
  pValue?:         number
  totalEffect?:    number
  fSquare?:        number
  indirectEffect?: number
  correlation?:    number
  covariance?:     number
}

export interface DiagramResults {
  constructScores?: Record<string, ConstructScores>  // keyed by construct id
  pathResults?:     Record<string, PathResult>        // keyed by "${from}-${to}"
  measurementResults?: Record<string, { loading?: number; weight?: number }> // keyed by "${construct}::${indicator}"
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface PathDiagramProps {
  canvasConstructs?: CanvasConstruct[]
  canvasPaths?:      CanvasPath[]
  results?:          DiagramResults
  structuralMode?:   string
  measurementMode?:  string
  constructMode?:    string
  className?:        string
  interactive?:      boolean
  selectedConstructIds?: string[]
  selectedIndicatorKeys?: string[]
  hoveredConstructId?: string | null
  onConstructMouseDown?: (constructId: string, event: ReactMouseEvent<SVGGElement>) => void
  onIndicatorMouseDown?: (constructId: string, indicatorName: string, event: ReactMouseEvent<SVGGElement>) => void
  onPathLabelMouseDown?: (pathId: string, event: ReactMouseEvent<SVGGElement>) => void
  onIndicatorLabelMouseDown?: (constructId: string, indicatorName: string, event: ReactMouseEvent<SVGGElement>) => void
  onResizeMouseDown?: (constructId: string, event: ReactMouseEvent<SVGGElement>) => void
  onConstructContextMenu?: (constructId: string, event: ReactMouseEvent<SVGGElement>) => void
  onConstructHover?: (constructId: string | null) => void
}

// ─── Positioning Constants (must match ModelCanvas exactly) ──────────────────
const STEP = 60
const EDGE_GAP = 60
const LABEL_H = 22
const MIN_LABEL_W = 44
const MIN_LABEL_T = 0.12
const MAX_LABEL_T = 0.88
const OVAL_RX_SCALE = 1.35
const OVAL_RY_SCALE = 0.82
const STRUCTURAL_PATH_NEUTRAL = 'rgb(var(--color-text-secondary-rgb) / 0.74)'

function normalizeConstructShape(shape?: CanvasConstructShape): 'circle' | 'oval' {
  return shape === 'oval' || shape === 'square' ? 'oval' : 'circle'
}

function getDefaultOvalDimensions(radius: number): { width: number; height: number } {
  return {
    width: Math.round(radius * OVAL_RX_SCALE * 2),
    height: Math.round(radius * OVAL_RY_SCALE * 2),
  }
}

function getCanvasConstructRadii(construct: Pick<CanvasConstruct, 'radius' | 'shape' | 'ovalWidth' | 'ovalHeight'>): { rx: number; ry: number } {
  if (normalizeConstructShape(construct.shape) === 'oval') {
    const defaults = getDefaultOvalDimensions(construct.radius)
    return {
      rx: Math.max(40, construct.ovalWidth ?? defaults.width) / 2,
      ry: Math.max(40, construct.ovalHeight ?? defaults.height) / 2,
    }
  }

  return { rx: construct.radius, ry: construct.radius }
}

function getCanvasConstructEdgeOffset(construct: Pick<CanvasConstruct, 'radius' | 'shape' | 'ovalWidth' | 'ovalHeight'>, ux: number, uy: number): number {
  const { rx, ry } = getCanvasConstructRadii(construct)
  return 1 / Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry))
}

function getCanvasConstructEdgePoint(construct: CanvasConstruct, ux: number, uy: number): { x: number; y: number } {
  const offset = getCanvasConstructEdgeOffset(construct, ux, uy)
  return {
    x: construct.x + ux * offset,
    y: construct.y + uy * offset,
  }
}

function getIndicatorDimensions(indicator: CanvasIndicator): { labelW: number; labelH: number } {
  return {
    labelW: Math.max(MIN_LABEL_W, indicator.name.length * 7 + 16),
    labelH: LABEL_H,
  }
}

function clampLabelT(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(MIN_LABEL_T, Math.min(MAX_LABEL_T, value as number))
}

function indicatorFill(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}24` : 'rgb(var(--color-accent-rgb) / 0.14)'
}

function splitLineAtT(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  t: number,
  gap = 24,
): { path1: string; path2: string; x: number; y: number } {
  const dx = endX - startX
  const dy = endY - startY
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const x = startX + dx * t
  const y = startY + dy * t
  const gapUx = (dx / dist) * (gap / 2)
  const gapUy = (dy / dist) * (gap / 2)
  return {
    path1: `M${startX},${startY} L${x - gapUx},${y - gapUy}`,
    path2: `M${x + gapUx},${y + gapUy} L${endX},${endY}`,
    x,
    y,
  }
}

// ─── Arrow & Path Helpers (identical to ModelCanvas) ─────────────────────────

/** Split edge-to-edge path between two construct shapes, leaving a gap for the label. */
function arrowPathSplit(from: CanvasConstruct, to: CanvasConstruct, p: CanvasPath, gap = 40, labelT = 0.5): [string, string, { mx: number; my: number }] {
  const dx = to.x - from.x, dy = to.y - from.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 1) return ['', '', { mx: 0, my: 0 }]
  const ux = dx / dist, uy = dy / dist
  const t = clampLabelT(labelT)
  const start = getCanvasConstructEdgePoint(from, ux, uy)
  const end = getCanvasConstructEdgePoint(to, -ux, -uy)
  const startX = start.x
  const startY = start.y
  const endX = end.x
  const endY = end.y

  if (p.style === 'curved') {
    const curvature = p.curvature || 40
    const cx = (startX + endX) / 2 - uy * curvature
    const cy = (startY + endY) / 2 + ux * curvature
    const q0x = startX + (cx - startX) * t
    const q0y = startY + (cy - startY) * t
    const q1x = cx + (endX - cx) * t
    const q1y = cy + (endY - cy) * t
    const midX = q0x + (q1x - q0x) * t
    const midY = q0y + (q1y - q0y) * t

    return [
      `M${startX},${startY} Q${q0x},${q0y} ${midX},${midY}`,
      `M${midX},${midY} Q${q1x},${q1y} ${endX},${endY}`,
      { mx: midX, my: midY }
    ]
  }

  if (p.style === 'rightangle' && p.joints && p.joints.length >= 2) {
    const points = [{ x: startX, y: startY }, ...p.joints, { x: endX, y: endY }]
    const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y))
    const total = lengths.reduce((sum, length) => sum + length, 0) || 1
    let target = total * t
    let segmentIndex = 0
    while (segmentIndex < lengths.length - 1 && target > lengths[segmentIndex]) {
      target -= lengths[segmentIndex]
      segmentIndex += 1
    }
    const a = points[segmentIndex]
    const b = points[segmentIndex + 1]
    const segmentT = lengths[segmentIndex] ? target / lengths[segmentIndex] : 0
    const midX = a.x + (b.x - a.x) * segmentT
    const midY = a.y + (b.y - a.y) * segmentT
    const before = points.slice(0, segmentIndex + 1).map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')
    const afterPoints = points.slice(segmentIndex + 1)
    const p1 = `${before} L${midX},${midY}`
    const p2 = `M${midX},${midY} ${afterPoints.map((point) => `L${point.x},${point.y}`).join(' ')}`
    return [p1, p2, { mx: midX, my: midY }]
  }

  const midX = startX + (endX - startX) * t
  const midY = startY + (endY - startY) * t
  const gapUx = ux * (gap / 2)
  const gapUy = uy * (gap / 2)
  const seg1X = midX - gapUx
  const seg1Y = midY - gapUy
  const seg2X = midX + gapUx
  const seg2Y = midY + gapUy
  const path1 = `M${startX},${startY} L${seg1X},${seg1Y}`
  const path2 = `M${seg2X},${seg2Y} L${endX},${endY}`
  return [path1, path2, { mx: midX, my: midY }]
}

function fullArrowPath(from: CanvasConstruct, to: CanvasConstruct, p: CanvasPath): string {
  const dx = to.x - from.x, dy = to.y - from.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 1) return ''
  const ux = dx / dist, uy = dy / dist
  const start = getCanvasConstructEdgePoint(from, ux, uy)
  const end = getCanvasConstructEdgePoint(to, -ux, -uy)
  const startX = start.x
  const startY = start.y
  const endX = end.x
  const endY = end.y

  if (p.style === 'curved') {
    const curvature = p.curvature || 40
    const cx = (startX + endX) / 2 - uy * curvature
    const cy = (startY + endY) / 2 + ux * curvature
    return `M${startX},${startY} Q${cx},${cy} ${endX},${endY}`
  }

  if (p.style === 'rightangle' && p.joints && p.joints.length > 0) {
    return `M${startX},${startY} ${p.joints.map((joint) => `L${joint.x},${joint.y}`).join(' ')} L${endX},${endY}`
  }

  return `M${startX},${startY} L${endX},${endY}`
}

/**
 * Connection between construct circle edge and indicator box edge.
 * Identical to ModelCanvas indicatorPath, but uses construct radius from props.
 */
function indicatorPath(
  cX: number, cY: number,
  iX: number, iY: number,
  iW: number, iH: number,
  r: number,
  type: 'Reflective' | 'Formative',
  direction: string,
): string {
  const ux = iX - cX, uy = iY - cY
  const dist = Math.sqrt(ux * ux + uy * uy)
  if (dist < 1) return ''
  // Point on construct circle edge toward indicator
  const lx = cX + (ux / dist) * r
  const ly = cY + (uy / dist) * r
  // Point on indicator box edge toward construct
  let ix = iX, iy = iY
  if      (direction === 'top')    iy += iH / 2
  else if (direction === 'bottom') iy -= iH / 2
  else if (direction === 'left')   ix += iW / 2
  else if (direction === 'right')  ix -= iW / 2
  // Reflective: construct → indicator (arrowhead at box)
  // Formative:  indicator → construct (arrowhead at circle)
  if (type === 'Reflective') return `M${lx},${ly} L${ix},${iy}`
  return `M${ix},${iy} L${lx},${ly}`
}

/** Extract midpoint + perpendicular offset from an "M x1,y1 L x2,y2" path string. */
function pathMidpoint(d: string, perpOffset = 12): { mx: number; my: number } {
  const m = d.match(/M([\d.\-]+),([\d.\-]+)\s+L([\d.\-]+),([\d.\-]+)/)
  if (!m) return { mx: 0, my: 0 }
  const x1 = parseFloat(m[1]), y1 = parseFloat(m[2])
  const x2 = parseFloat(m[3]), y2 = parseFloat(m[4])
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  return {
    mx: (x1 + x2) / 2 - (dy / len) * perpOffset,
    my: (y1 + y2) / 2 + (dx / len) * perpOffset,
  }
}

// ─── Result Overlay Helpers ───────────────────────────────────────────────────

function getConstructScore(scores: ConstructScores, mode: string): number | undefined {
  switch (mode) {
    case 'R-square':                         return scores.r2
    case 'R-square adjusted':                return scores.r2Adj
    case 'Average variance extracted (AVE)': return scores.ave
    case 'Composite reliability (rhoa)':     return scores.rhoA
    case 'Composite reliability (rhoc)':     return scores.rhoC
    case "Cronbach's alpha":                 return scores.cronbach
    default:                                 return undefined
  }
}

function getPathValue(result: PathResult, mode: string): number | undefined {
  switch (mode) {
    case 'Path coefficients': return result.coef
    case 'Total effects':     return result.totalEffect
    case 'f-square':          return result.fSquare
    case 'Indirect effects':  return result.indirectEffect
    case 'Correlations':      return result.correlation
    case 'Covariances':       return result.covariance
    default:                  return undefined
  }
}

function getMeasurementValue(loading: number | null, mode: string): number | undefined {
  if (loading === null || loading === undefined) return undefined
  switch (mode) {
    case 'Outer loadings':
    case 'Outer weights':
    case 'Outer weights / loadings':
      return loading
    default:
      return undefined
  }
}

function getMeasurementValueFromResults(
  measurementEntry: { loading?: number; weight?: number } | undefined,
  fallbackLoading: number | null,
  mode: string,
  constructType?: 'Reflective' | 'Formative',
): number | undefined {
  if (mode === 'Outer loadings') {
    if (measurementEntry?.loading !== undefined) return measurementEntry.loading
    return getMeasurementValue(fallbackLoading, mode)
  }

  if (mode === 'Outer weights') {
    if (measurementEntry?.weight !== undefined) return measurementEntry.weight
    return getMeasurementValue(fallbackLoading, mode)
  }

  if (mode === 'Outer weights / loadings') {
    if (constructType === 'Formative') {
      if (measurementEntry?.weight !== undefined) return measurementEntry.weight
      if (measurementEntry?.loading !== undefined) return measurementEntry.loading
    } else {
      if (measurementEntry?.loading !== undefined) return measurementEntry.loading
      if (measurementEntry?.weight !== undefined) return measurementEntry.weight
    }
    return getMeasurementValue(fallbackLoading, mode)
  }

  return getMeasurementValue(fallbackLoading, mode)
}

function shouldUseOuterLoadingTone(
  mode: string,
  constructType?: 'Reflective' | 'Formative',
): boolean {
  if (mode === 'Outer loadings') return true
  if (mode === 'Outer weights / loadings') return constructType !== 'Formative'
  return false
}

function pValueColor(pValue?: number): string {
  return getPValueColor(pValue, STRUCTURAL_PATH_NEUTRAL)
}

function pValueMarkerId(pValue?: number): string {
  const tone = getPValueTone(pValue)
  if (!tone) return 'pd-arr-dim'
  if (tone === 'pass') return 'pd-arr-green'
  return 'pd-arr-red'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PathDiagram({
  canvasConstructs,
  canvasPaths,
  results,
  structuralMode  = 'Blank',
  measurementMode = 'Blank',
  constructMode   = 'Blank',
  className = '',
  interactive = false,
  selectedConstructIds = [],
  selectedIndicatorKeys = [],
  hoveredConstructId = null,
  onConstructMouseDown,
  onIndicatorMouseDown,
  onPathLabelMouseDown,
  onIndicatorLabelMouseDown,
  onResizeMouseDown,
  onConstructContextMenu,
  onConstructHover,
}: PathDiagramProps) {
  // Require real canvas data — no demo fallback
  const cs  = canvasConstructs && canvasConstructs.length > 0 ? canvasConstructs : []
  const ps  = canvasPaths      && canvasPaths.length      > 0 ? canvasPaths      : []
  const res = results ?? {}

  // Empty state when no model has been built yet
  if (!cs.length) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full gap-3 text-text-muted ${className}`}
        style={{ minHeight: 120 }}
      >
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="18" stroke="var(--color-border)" strokeWidth="2" strokeDasharray="4 3" />
          <circle cx="20" cy="20" r="5" fill="var(--color-border)" />
        </svg>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif' }}>
          Add constructs &amp; paths in the canvas to see the diagram
        </span>
      </div>
    )
  }

  const byId = Object.fromEntries(cs.map(c => [c.id, c]))
  const byName = Object.fromEntries(cs.map(c => [c.name, c]))

  const showStruct  = structuralMode  !== 'Blank'
  const showMeasure = measurementMode !== 'Blank'
  const showCon     = constructMode   !== 'Blank'

  // ── Compute indicator positions (identical formula to ModelCanvas) ──────────
  type IndicatorEntry = {
    constructId: string
    name:   string
    loading: number | null
    ix:     number
    iy:     number
    labelW: number
    labelH: number
    labelT?: number
  }

  const allIndicators: IndicatorEntry[] = []

  cs.forEach(c => {
    if (c.folded) return
    c.indicators.forEach((ind, i) => {
      const { ix, iy, labelW, labelH } = getIndicatorLayout(c, ind, i)
      allIndicators.push({ constructId: c.id, name: ind.name, loading: ind.loading, ix, iy, labelW, labelH, labelT: ind.labelT })
    })
  })

  const selectedBounds = getSelectedBounds(cs, allIndicators, selectedConstructIds, selectedIndicatorKeys)

  const measurementResults = res.measurementResults ?? {}

  const lookupMeasurement = (constructId: string, indicatorName: string): { loading?: number; weight?: number } | undefined => {
    const c = byId[constructId]
    if (!c) return undefined

    const byIdKey = `${constructId}::${indicatorName}`
    const byNameKey = `${c.name}::${indicatorName}`
    return measurementResults[byIdKey] ?? measurementResults[byNameKey]
  }

  const lookupPathResult = (fromId: string, toId: string): PathResult | undefined => {
    const fromById = byId[fromId]
    const toById = byId[toId]
    const fromByName = byName[fromId]
    const toByName = byName[toId]

    const fromName = fromById?.name ?? fromByName?.name
    const toName = toById?.name ?? toByName?.name

    return (
      res.pathResults?.[`${fromId}-${toId}`] ??
      (fromName && toName ? res.pathResults?.[`${fromName}-${toName}`] : undefined)
    )
  }

  const lookupConstructScores = (constructId: string): ConstructScores => {
    const byIdScores = res.constructScores?.[constructId]
    if (byIdScores) return byIdScores
    const c = byId[constructId]
    if (!c) return {}
    return res.constructScores?.[c.name] ?? {}
  }

  const hasIncomingPath = (constructId: string): boolean => ps.some((path) => path.to === constructId)

  // ── Dynamic viewBox from bounding box of all elements ──────────────────────
  const PAD = 80
  const allX: number[] = [
    ...cs.map(c => c.x - getCanvasConstructRadii(c).rx - 5),
    ...cs.map(c => c.x + getCanvasConstructRadii(c).rx + 5),
    ...allIndicators.flatMap(i => [i.ix - i.labelW / 2, i.ix + i.labelW / 2]),
  ]
  const allY: number[] = [
    ...cs.map(c => c.y - getCanvasConstructRadii(c).ry - 5),
    ...cs.map(c => c.y + getCanvasConstructRadii(c).ry + 5),
    ...allIndicators.map(i => i.iy - i.labelH / 2),
    ...allIndicators.map(i => i.iy + i.labelH / 2),
  ]
  const vbMinX = Math.min(...allX) - PAD
  const vbMinY = Math.min(...allY) - PAD
  const vbW    = Math.max(...allX) - Math.min(...allX) + PAD * 2
  const vbH    = Math.max(...allY) - Math.min(...allY) + PAD * 2

  return (
    <svg
      viewBox={`${vbMinX} ${vbMinY} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      className={className}
      style={{ display: 'block' }}
    >
      <defs>
        {/* Arrow for measurement paths (same as ModelCanvas #arr) */}
        <marker id="pd-arr" markerWidth="7" markerHeight="5" refX="6.3" refY="2.5" orient="auto">
          <polygon points="0 0,7 2.5,0 5" fill="context-stroke" />
        </marker>
        {/* Structural arrows — coloured by significance */}
        <marker id="pd-arr-dim"   markerWidth="7" markerHeight="5" refX="6.3" refY="2.5" orient="auto">
          <polygon points="0 0,7 2.5,0 5" fill={STRUCTURAL_PATH_NEUTRAL} />
        </marker>
        <marker id="pd-arr-green" markerWidth="7" markerHeight="5" refX="6.3" refY="2.5" orient="auto">
          <polygon points="0 0,7 2.5,0 5" fill={ANALYSIS_TONE_HEX.pass} />
        </marker>
        <marker id="pd-arr-amber" markerWidth="7" markerHeight="5" refX="6.3" refY="2.5" orient="auto">
          <polygon points="0 0,7 2.5,0 5" fill={ANALYSIS_TONE_HEX.neutral} />
        </marker>
        <marker id="pd-arr-red"   markerWidth="7" markerHeight="5" refX="6.3" refY="2.5" orient="auto">
          <polygon points="0 0,7 2.5,0 5" fill={ANALYSIS_TONE_HEX.fail} />
        </marker>
      </defs>

      {/* ── Measurement paths (drawn first, below everything) ── */}
      {allIndicators.map(ind => {
        const c = byId[ind.constructId]
        if (!c) return null
        const dir = c.indicatorAlignment || c.indicatorDirection || 'bottom'
        // Compute indicator arrow split for label
        const ux = ind.ix - c.x
        const uy = ind.iy - c.y
        const dist = Math.sqrt(ux * ux + uy * uy)
        if (dist < 1) return null
        const start = getCanvasConstructEdgePoint(c, ux / dist, uy / dist)
        const startX = start.x
        const startY = start.y
        let ix = ind.ix, iy = ind.iy
        if      (dir === 'top')    iy += ind.labelH / 2
        else if (dir === 'bottom') iy -= ind.labelH / 2
        else if (dir === 'left')   ix += ind.labelW / 2
        else if (dir === 'right')  ix -= ind.labelW / 2
        const labelSplit = splitLineAtT(startX, startY, ix, iy, clampLabelT(ind.labelT), 24)
        const measurementEntry = lookupMeasurement(ind.constructId, ind.name)
        const val = showMeasure ? getMeasurementValueFromResults(measurementEntry, ind.loading, measurementMode, c.type) : undefined
        const measurementTextColor = shouldUseOuterLoadingTone(measurementMode, c.type)
          ? getOuterLoadingColor(val, c.color + 'CC')
          : c.color + 'CC'
        // When blank (no value label), render a single unbroken measurement arrow
        if (val === undefined) {
          let iEndX = ind.ix, iEndY = ind.iy
          if      (dir === 'top')    iEndY += ind.labelH / 2
          else if (dir === 'bottom') iEndY -= ind.labelH / 2
          else if (dir === 'left')   iEndX += ind.labelW / 2
          else if (dir === 'right')  iEndX -= ind.labelW / 2
          const cDist = Math.sqrt((ind.ix - c.x) ** 2 + (ind.iy - c.y) ** 2)
          if (cDist < 1) return null
          const latentEdge = getCanvasConstructEdgePoint(c, (ind.ix - c.x) / cDist, (ind.iy - c.y) / cDist)
          return (
            <g key={`mp-${ind.constructId}-${ind.name}`}>
              <path
                d={`M${latentEdge.x},${latentEdge.y} L${iEndX},${iEndY}`}
                fill="none"
                stroke={c.color}
                strokeWidth={1.2}
                markerEnd="url(#pd-arr)"
                opacity={0.5}
              />
            </g>
          )
        }

        return (
          <g key={`mp-${ind.constructId}-${ind.name}`}>
            <path
              d={labelSplit.path1}
              fill="none"
              stroke={c.color}
              strokeWidth={1.2}
              opacity={0.5}
            />
            <path
              d={labelSplit.path2}
              fill="none"
              stroke={c.color}
              strokeWidth={1.2}
              markerEnd="url(#pd-arr)"
              opacity={0.5}
            />
            {val !== undefined && (
              <g
                onMouseDown={interactive && onIndicatorLabelMouseDown ? (event) => onIndicatorLabelMouseDown(ind.constructId, ind.name, event) : undefined}
                style={{ cursor: interactive ? 'grab' : 'default' }}
              >
                <text
                  x={labelSplit.x} y={labelSplit.y}
                  fill={measurementTextColor}
                  fontSize={8} fontWeight="700"
                  fontFamily="Inter, system-ui, sans-serif"
                  textAnchor="middle" dominantBaseline="middle"
                  style={{ userSelect: 'none' }}
                >
                  {val.toFixed(getDecimals())}
                </text>
              </g>
            )}
          </g>
        )
      })}

      {/* ── Structural paths ── */}
      {ps.map(p => {
        const from = byId[p.from]
        const to   = byId[p.to]
        if (!from || !to) return null

        const [path1, path2, mid] = arrowPathSplit(from, to, p, 40, p.labelT)
        const pResult  = lookupPathResult(p.from, p.to)
        const pathVal  = showStruct ? (pResult ? getPathValue(pResult, structuralMode) : undefined) : undefined
        const useColor = structuralMode === 'Path coefficients'
        const lineColor = useColor ? pValueColor(pResult?.pValue) : STRUCTURAL_PATH_NEUTRAL
        const markerId  = useColor ? pValueMarkerId(pResult?.pValue) : 'pd-arr-dim'

        // When blank (no value label), render a single unbroken arrow
        if (pathVal === undefined) {
          const d = fullArrowPath(from, to, p)
          if (!d) return null
          return (
            <g key={`sp-${p.id}`}>
              <path
                d={d}
                fill="none"
                stroke={lineColor}
                strokeWidth={1.5}
                markerEnd={`url(#${markerId})`}
              />
            </g>
          )
        }

        return (
          <g key={`sp-${p.id}`}>
            <path
              d={path1}
              fill="none"
              stroke={lineColor}
              strokeWidth={1.5}
            />
            <path
              d={path2}
              fill="none"
              stroke={lineColor}
              strokeWidth={1.5}
              markerEnd={`url(#${markerId})`}
            />
            {pathVal !== undefined && (
              <g
                onMouseDown={interactive && onPathLabelMouseDown ? (event) => onPathLabelMouseDown(p.id, event) : undefined}
                style={{ cursor: interactive ? 'grab' : 'default' }}
              >
                <text
                  x={mid.mx} y={mid.my}
                  fill={useColor ? lineColor : 'var(--color-text-secondary)'}
                  fontSize={9} fontWeight="700"
                  fontFamily="Inter, system-ui, sans-serif"
                  textAnchor="middle" dominantBaseline="middle"
                  style={{ userSelect: 'none' }}
                >
                  {pathVal.toFixed(getDecimals())}
                </text>
              </g>
            )}
          </g>
        )
      })}

      {selectedBounds && (
        <rect
          x={selectedBounds.minX}
          y={selectedBounds.minY}
          width={selectedBounds.width}
          height={selectedBounds.height}
          rx={4}
          fill="none"
          stroke="var(--color-accent)"
          strokeOpacity={0.45}
          strokeWidth={1.2}
          pointerEvents="none"
        />
      )}

      {/* ── Indicator boxes ── */}
      {allIndicators.map(ind => {
        const indicatorKey = `${ind.constructId}::${ind.name}`
        const isSelected = selectedIndicatorKeys.includes(indicatorKey)
        return (
        <g
          key={`ib-${ind.constructId}-${ind.name}`}
          onMouseDown={interactive && onIndicatorMouseDown ? (event) => onIndicatorMouseDown(ind.constructId, ind.name, event) : undefined}
          style={{ cursor: interactive ? 'grab' : 'default' }}
        >
          <rect
            x={ind.ix - ind.labelW / 2} y={ind.iy - ind.labelH / 2}
            width={ind.labelW} height={ind.labelH}
            rx={4}
            fill={indicatorFill(byId[ind.constructId]?.color ?? '')}
            stroke={isSelected ? 'var(--color-accent)' : (byId[ind.constructId]?.color ?? 'var(--color-border)')}
            strokeWidth={isSelected ? 1.5 : 1}
          />
          <text
            x={ind.ix} y={ind.iy}
            dy="0.35em"
            textAnchor="middle"
            textLength={Math.max(8, ind.labelW - 10)}
            lengthAdjust="spacingAndGlyphs"
            style={{
              fontSize: 11,
              fill: 'var(--color-text-secondary)',
              fontFamily: 'DM Sans, sans-serif',
              pointerEvents: 'none',
            }}
          >
            {ind.name}
          </text>
        </g>
      )})}

      {/* ── Construct shapes ── */}
      {cs.map(c => {
        const scores   = lookupConstructScores(c.id)
        const isR2Mode = constructMode === 'R-square' || constructMode === 'R-square adjusted'
        const incoming = hasIncomingPath(c.id)
        const scoreVal = showCon && (!isR2Mode || incoming) ? getConstructScore(scores, constructMode) : undefined
        const hasScore = scoreVal !== undefined && Number.isFinite(scoreVal)
        const r        = c.radius
        const { rx, ry } = getCanvasConstructRadii(c)
        const isOval = normalizeConstructShape(c.shape) === 'oval'
        const isSelected = selectedConstructIds.includes(c.id)
        const tooltipItems: Array<{ label: string; value?: number }> = [
          { label: 'R-Square', value: incoming ? scores.r2 : undefined },
          { label: 'R-Square Adjusted', value: incoming ? scores.r2Adj : undefined },
          { label: 'Average Variance Extracted (AVE)', value: scores.ave },
          { label: "Cronbach's Alpha", value: scores.cronbach },
          { label: 'Rho_A', value: scores.rhoA },
          { label: 'Rho_C', value: scores.rhoC },
        ]

        const tooltipWidth = 244
        const tooltipHeight = 30 + tooltipItems.length * 18

        return (
          <g
            key={c.id}
            onMouseEnter={() => onConstructHover?.(c.id)}
            onMouseLeave={() => onConstructHover?.(null)}
            onMouseDown={interactive && onConstructMouseDown ? (event) => onConstructMouseDown(c.id, event) : undefined}
            onContextMenu={interactive && onConstructContextMenu ? (event) => onConstructContextMenu(c.id, event) : undefined}
            style={{ cursor: interactive ? 'grab' : 'default' }}
          >
            {/* Outer glow ring */}
            {isOval ? (
              <ellipse cx={c.x} cy={c.y} rx={rx + 5} ry={ry + 5}
                fill="none" stroke={c.color} strokeWidth={1} opacity={0.12} />
            ) : (
              <circle cx={c.x} cy={c.y} r={r + 5}
                fill="none" stroke={c.color} strokeWidth={1} opacity={0.12} />
            )}
            {/* Main filled shape */}
            {isOval ? (
              <ellipse cx={c.x} cy={c.y} rx={rx} ry={ry}
                fill={c.color + '20'} stroke={c.color} strokeWidth={isSelected ? 3 : 2} />
            ) : (
              <circle cx={c.x} cy={c.y} r={r}
                fill={c.color + '20'} stroke={c.color} strokeWidth={isSelected ? 3 : 2} />
            )}

            {hasScore ? (
              /* Score mode: big number + small label */
              <>
                <text x={c.x} y={c.y - 6}
                  fill={c.color} fontSize={12} fontWeight="700"
                  fontFamily="Inter, system-ui, sans-serif"
                  textAnchor="middle" dominantBaseline="middle">
                  {scoreVal.toFixed(getDecimals())}
                </text>
                <text x={c.x} y={c.y + 9}
                  fill={c.color + 'AA'} fontSize={8.5}
                  fontFamily="Inter, system-ui, sans-serif"
                  textAnchor="middle" dominantBaseline="middle">
                  {c.name}
                </text>
              </>
            ) : (
              /* Default mode: name + type */
              <>
                <text x={c.x} y={c.y - 5}
                  fill={c.color}
                  fontSize={c.name.length > 5 ? 11 : 13} fontWeight="700"
                  fontFamily="Inter, system-ui, sans-serif"
                  textAnchor="middle" dominantBaseline="middle">
                  {c.name}
                </text>
                <text x={c.x} y={c.y + 10}
                  fill={c.color + 'AA'} fontSize={7.5}
                  fontFamily="Inter, system-ui, sans-serif"
                  textAnchor="middle" dominantBaseline="middle">
                  {c.type}
                </text>
              </>
            )}

            {interactive && isSelected && (
              <g
                onMouseDown={onResizeMouseDown ? (event) => onResizeMouseDown(c.id, event) : undefined}
                style={{ cursor: 'nwse-resize' }}
              >
                <circle
                  cx={c.x + rx * 0.72}
                  cy={c.y + ry * 0.72}
                  r={5}
                  fill="var(--color-accent)"
                  stroke="var(--color-border)"
                  strokeWidth={1.5}
                />
              </g>
            )}

            {hoveredConstructId === c.id && (
              <g pointerEvents="none">
                <rect
                  x={c.x + rx + 16}
                  y={c.y - tooltipHeight / 2}
                  width={tooltipWidth}
                  height={tooltipHeight}
                  rx={10}
                  fill="var(--color-surface)"
                  stroke="var(--color-border)"
                  strokeWidth={1}
                  opacity={0.96}
                />
                <text
                  x={c.x + rx + 28}
                  y={c.y - tooltipHeight / 2 + 18}
                  fill="var(--color-text-primary)"
                  fontSize={10}
                  fontWeight="700"
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  {c.name} Quality Criteria
                </text>
                {tooltipItems.map((item, index) => (
                  <g key={`${c.id}-${item.label}`}>
                    <text
                      x={c.x + rx + 28}
                      y={c.y - tooltipHeight / 2 + 40 + index * 18}
                      fill="var(--color-text-secondary)"
                      fontSize={8.5}
                      fontFamily="Inter, system-ui, sans-serif"
                    >
                      {item.label}
                    </text>
                    <text
                      x={c.x + rx + tooltipWidth - 12}
                      y={c.y - tooltipHeight / 2 + 40 + index * 18}
                      fill="var(--color-text-primary)"
                      fontSize={8.5}
                      fontWeight="700"
                      textAnchor="end"
                      fontFamily="Inter, system-ui, sans-serif"
                    >
                      {Number.isFinite(item.value as number) ? (item.value as number).toFixed(getDecimals()) : '—'}
                    </text>
                  </g>
                ))}
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function getSelectedBounds(
  constructs: CanvasConstruct[],
  indicators: Array<{ constructId: string; name: string; ix: number; iy: number; labelW: number; labelH: number }>,
  selectedConstructIds: string[],
  selectedIndicatorKeys: string[],
): { minX: number; minY: number; width: number; height: number } | null {
  if (selectedConstructIds.length + selectedIndicatorKeys.length < 2) return null

  const boxes: Array<{ left: number; right: number; top: number; bottom: number }> = []
  const indicatorKeySet = new Set(selectedIndicatorKeys)

  constructs.forEach((construct) => {
    if (!selectedConstructIds.includes(construct.id)) return
    const { rx, ry } = getCanvasConstructRadii(construct)
    boxes.push({
      left: construct.x - rx - 8,
      right: construct.x + rx + 8,
      top: construct.y - ry - 8,
      bottom: construct.y + ry + 8,
    })
  })

  indicators.forEach((indicator) => {
    if (!indicatorKeySet.has(`${indicator.constructId}::${indicator.name}`)) return
    boxes.push({
      left: indicator.ix - indicator.labelW / 2 - 8,
      right: indicator.ix + indicator.labelW / 2 + 8,
      top: indicator.iy - indicator.labelH / 2 - 8,
      bottom: indicator.iy + indicator.labelH / 2 + 8,
    })
  })

  if (!boxes.length) return null

  const minX = Math.min(...boxes.map((box) => box.left))
  const minY = Math.min(...boxes.map((box) => box.top))
  const maxX = Math.max(...boxes.map((box) => box.right))
  const maxY = Math.max(...boxes.map((box) => box.bottom))

  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function getIndicatorLayout(c: CanvasConstruct, ind: CanvasIndicator, index: number) {
  const dir = c.indicatorAlignment || c.indicatorDirection || 'bottom'
  const { rx, ry } = getCanvasConstructRadii(c)
  const edgeRadius = dir === 'left' || dir === 'right' ? rx : ry
  const { labelW, labelH } = getIndicatorDimensions(ind)
  const offset = (index - (c.indicators.length - 1) / 2) * STEP
  const centerGap = edgeRadius + EDGE_GAP + (dir === 'left' || dir === 'right' ? labelW / 2 : labelH / 2)

  let ix = c.x
  let iy = c.y
  if (dir === 'top') {
    iy -= centerGap
    ix += offset
  } else if (dir === 'bottom') {
    iy += centerGap
    ix += offset
  } else if (dir === 'left') {
    ix -= centerGap
    iy += offset
  } else if (dir === 'right') {
    ix += centerGap
    iy += offset
  }

  return {
    ix: ix + (ind.ox || 0),
    iy: iy + (ind.oy || 0),
    labelW,
    labelH,
    dir,
  }
}
