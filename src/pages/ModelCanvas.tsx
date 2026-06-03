import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  MathOperations,
  Cursor,
  ArrowRight,
  Trash,
  Shuffle,
  MagnifyingGlass,
  Database,
  DotsSixVertical,
  ArrowUp,
  ArrowDown,
  ArrowClockwise,
  ArrowCounterClockwise,
  MinusCircle,
  PlusCircle as PlusCircleAlt,
  FrameCorners,
  GridFour,
  MagnetStraight,
  Minus,
  SlidersHorizontal,
  Toolbox,
  CaretDoubleRight,
  SquaresFour,
  Circle,
  X,
  CaretDown,
  WarningCircle,
  Check,
  Copy,
  Scissors,
  Clipboard, // New import for the context menu paste icon
  AlignCenterHorizontal,
  AlignCenterVertical,
  ArrowsHorizontal,
  ArrowsVertical,
  CornersOut,
  BezierCurve,
  ArrowElbowRight,
  TreeStructure
} from '@phosphor-icons/react'
import BootstrapModal from '../components/BootstrapModal'
import DraftNumberInput from '../components/DraftNumberInput'
import NewModelDialog from '../components/NewModelDialog'
import DatasetManagerModal from '../components/DatasetManagerModal'
import PlsPredictModal from '../components/PlsPredictModal'
import AdvancedAnalysisModal, { type AdvancedAnalysisSettings } from '../components/AdvancedAnalysisModal'
import { runPlsModel, runBootstrapModel, runPlsPredictModel, runAdvancedAnalysisModel } from '../services/plsApi'
import { dispatchToast } from '../components/Toast'
import { useCalculation, useCalculationDispatch, useIsCalculating, type CalcPhase } from '../state/calculationContext'
import { addRecentModel } from '../utils/recentModels'
import { stripModelDisplayName, stripWorkspaceDisplayName } from '../utils/displayNames'
import { readDatasetViewCache } from '../utils/datasetViewCache'
import { resolveDatasetFilePathFromRequest } from '../utils/datasetLoading'
import { getLinkedDatasetForModel, migrateWorkspace } from '../utils/datasetWorkspace'
import { writeWorkspaceClientCache } from '../utils/workspaceClientCache'
import { getOuterLoadingColor } from '../utils/analysisPalette'
import { inspectAnalysisInputs } from '../utils/analysisPrecheck'
import { buildAnalysisGraphSignature } from '../utils/analysisGraphSignature'
import { addDiagnostic } from '../utils/diagnostics'
import {
  normalizePlsPredictSettings,
  readPlsPredictSettingsFromState,
  type PlsPredictSettings,
} from '../utils/plsPredictSettings'
import { buildPlsModelPayloadParts, type HocPathRole } from '../utils/plsModelPayload'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Marquee {
  active: boolean
  startX: number
  startY: number
  endX: number
  endY: number
}

interface Indicator {
  name: string
  loading: number | null
  ox?: number
  oy?: number
}

type ConstructShape = 'circle' | 'oval' | 'square'
type MeasurementType = 'Reflective' | 'Formative'

interface Construct {
  id: string
  name: string
  type: MeasurementType
  color: string
  x: number
  y: number
  radius: number
  ovalWidth?: number
  ovalHeight?: number
  indicators: Indicator[]
  labelColor: string
  labelBold: boolean
  labelItalic: boolean
  labelSize: number
  shape?: ConstructShape
  indicatorDirection?: 'top' | 'right' | 'bottom' | 'left'
  captionInReport?: string
  weightingMode?: string
  indicatorAlignment?: 'top' | 'right' | 'bottom' | 'left'
  sortOrder?: string
  margin?: number
  folded?: boolean
  isHigherOrder?: boolean
}

interface Path {
  id: string
  from: string
  to: string
  kind?: 'direct' | 'moderation'
  targetPathId?: string
  hocRole?: HocPathRole
  style?: 'straight' | 'curved' | 'rightangle'
  curvature?: number
  joints?: { x: number; y: number }[]
}

interface HocPathConflict {
  id: string
  from: string
  to: string
  hocId: string
  locId: string
  currentType: MeasurementType
  suggestedType: MeasurementType
}

interface HocPathRoleChoice {
  id: string
  from: string
  to: string
  hocId: string
  locId: string
}

interface Snapshot {
  constructs: Construct[]
  paths: Path[]
}

interface GuideLine {
  x1: number
  y1: number
  x2: number
  y2: number
  label?: string
}

type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 'left' | 'right' | 'top' | 'bottom'

interface SelectionBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

interface IndicatorLayout {
  ix: number
  iy: number
  labelW: number
  labelH: number
  dir: 'top' | 'right' | 'bottom' | 'left'
}

type GroupResizeItem =
  | {
      id: string
      kind: 'construct'
      x: number
      y: number
      radius: number
      ovalWidth?: number
      ovalHeight?: number
    }
  | {
      id: string
      kind: 'indicator'
      x: number
      y: number
      parentId: string
      name: string
    }

interface GroupResizeState {
  handle: ResizeHandle
  anchorX: number
  anchorY: number
  startBounds: SelectionBounds
  items: GroupResizeItem[]
}

interface ModelDraftState {
  constructs: Construct[]
  paths: Path[]
}

interface PersistCanvasSnapshotOptions {
  workspaceSave?: 'immediate' | 'debounced'
}

const METIS_STORAGE_PREFIX = 'metis:'
const LEGACY_STORAGE_PREFIX = 'pls:'
const HOC_PATH_PROMPT_PREF_SUFFIX = 'prefs:showHocPathPrompt'
const STRUCTURAL_PATH_STROKE_WIDTH = 2.4
const SELECTED_PATH_STROKE_WIDTH = 3.2
const INDICATOR_PATH_STROKE_WIDTH = 1.8

function indicatorArrowMarkerId(constructId: string): string {
  return `indicator-arrow-${constructId.replace(/[^A-Za-z0-9_-]/g, '_')}`
}

function buildStorageKey(prefix: string, suffix: string): string {
  return `${prefix}${suffix}`
}

function estimateBootstrapSeconds(samples: number): number {
  const safeSamples = Number.isFinite(samples) && samples > 0 ? samples : 500
  return Math.max(60, Math.round((safeSamples / 1250) * 60))
}

function formatBootstrapEstimate(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes === 1 ? 'about 1 minute' : `about ${minutes} minutes`
}

function readSharedStorageValue(suffix: string): string | null {
  return localStorage.getItem(buildStorageKey(METIS_STORAGE_PREFIX, suffix))
    ?? localStorage.getItem(buildStorageKey(LEGACY_STORAGE_PREFIX, suffix))
}

function writeSharedStorageValue(suffix: string, value: string) {
  localStorage.setItem(buildStorageKey(METIS_STORAGE_PREFIX, suffix), value)
  localStorage.setItem(buildStorageKey(LEGACY_STORAGE_PREFIX, suffix), value)
}

function readShowHocPathPromptPreference(): boolean {
  const saved = readSharedStorageValue(HOC_PATH_PROMPT_PREF_SUFFIX)
  return saved === null ? true : saved === 'true'
}

function writeShowHocPathPromptPreference(value: boolean) {
  writeSharedStorageValue(HOC_PATH_PROMPT_PREF_SUFFIX, String(value))
}

function readAutosaveDraft(modelId?: string | null): ModelDraftState | null {
  if (!modelId || typeof window === 'undefined') return null
  try {
    const raw = readSharedStorageValue(`model-draft:${modelId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const constructs = Array.isArray(parsed?.constructs) ? parsed.constructs : null
    const paths = Array.isArray(parsed?.paths) ? parsed.paths : null
    if (!constructs || !paths) return null
    return { constructs, paths }
  } catch {
    return null
  }
}

function writeAutosaveDraft(modelId: string, snapshot: ModelDraftState) {
  if (!modelId || typeof window === 'undefined') return
  try {
    writeSharedStorageValue(`model-draft:${modelId}`, JSON.stringify(snapshot))
  } catch {
    // Ignore storage quota/runtime issues and keep editing responsive.
  }
}

function clearAutosaveDraft(modelId?: string | null) {
  if (!modelId || typeof window === 'undefined') return
  try {
    localStorage.removeItem(buildStorageKey(METIS_STORAGE_PREFIX, `model-draft:${modelId}`))
    localStorage.removeItem(buildStorageKey(LEGACY_STORAGE_PREFIX, `model-draft:${modelId}`))
  } catch {
    // Ignore storage cleanup failures.
  }
}

// ─── Static data ──────────────────────────────────────────────────────────────

const SWATCH_COLORS = ['#87976B', '#A78BFA', '#60A5FA', '#F97316']
const HOC_SWATCH_COLORS = ['#D94141', '#BE185D', '#0E7490', '#52525B']
const DEFAULT_CONSTRUCT_RADIUS = 42
const OVAL_RX_SCALE = 1.35
const OVAL_RY_SCALE = 0.82
const MIN_CONSTRUCT_RADIUS = 20
const MIN_OVAL_DIMENSION = 40
const DRAFT_WRITE_DEBOUNCE_MS = 300
const WORKSPACE_SAVE_DEBOUNCE_MS = 2_000
const DEFAULT_INDICATOR_STEP = 60
const DEFAULT_INDICATOR_EDGE_GAP = 60
const INDICATOR_LABEL_HEIGHT = 22
const MIN_INDICATOR_LABEL_WIDTH = 44

function normalizeConstructShape(shape?: ConstructShape): 'circle' | 'oval' {
  return shape === 'oval' || shape === 'square' ? 'oval' : 'circle'
}

function getDefaultOvalDimensions(radius = DEFAULT_CONSTRUCT_RADIUS): { width: number; height: number } {
  return {
    width: Math.round(radius * OVAL_RX_SCALE * 2),
    height: Math.round(radius * OVAL_RY_SCALE * 2),
  }
}

function getConstructDimensions(construct: Pick<Construct, 'radius' | 'shape' | 'ovalWidth' | 'ovalHeight'>): { width: number; height: number } {
  if (normalizeConstructShape(construct.shape) === 'oval') {
    const defaults = getDefaultOvalDimensions(construct.radius)
    return {
      width: Math.max(MIN_OVAL_DIMENSION, construct.ovalWidth ?? defaults.width),
      height: Math.max(MIN_OVAL_DIMENSION, construct.ovalHeight ?? defaults.height),
    }
  }

  const diameter = construct.radius * 2
  return { width: diameter, height: diameter }
}

function getConstructRadii(construct: Pick<Construct, 'radius' | 'shape' | 'ovalWidth' | 'ovalHeight'>): { rx: number; ry: number } {
  const { width, height } = getConstructDimensions(construct)
  return { rx: width / 2, ry: height / 2 }
}

function getConstructEdgeOffset(construct: Pick<Construct, 'radius' | 'shape' | 'ovalWidth' | 'ovalHeight'>, ux: number, uy: number): number {
  const { rx, ry } = getConstructRadii(construct)
  return 1 / Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry))
}

function isPointInConstruct(construct: Pick<Construct, 'x' | 'y' | 'radius' | 'shape' | 'ovalWidth' | 'ovalHeight'>, x: number, y: number, padding = 0): boolean {
  const { rx, ry } = getConstructRadii(construct)
  const paddedRx = rx + padding
  const paddedRy = ry + padding
  return ((x - construct.x) ** 2) / (paddedRx ** 2) + ((y - construct.y) ** 2) / (paddedRy ** 2) <= 1
}

function buildConstructShapePatch(current: Construct, patch: Partial<Construct>): Construct {
  const next = applyIndicatorAlignmentDefaults(current, patch)
  const nextShape = normalizeConstructShape(next.shape)
  const currentShape = normalizeConstructShape(current.shape)

  if (nextShape === 'oval') {
    const currentDimensions = currentShape === 'oval'
      ? getConstructDimensions(current)
      : getDefaultOvalDimensions(current.radius)
    return {
      ...next,
      ovalWidth: next.ovalWidth ?? currentDimensions.width,
      ovalHeight: next.ovalHeight ?? currentDimensions.height,
    }
  }

  if (patch.shape === 'circle' && currentShape === 'oval') {
    const { width, height } = getConstructDimensions(current)
    return {
      ...next,
      radius: Math.max(MIN_CONSTRUCT_RADIUS, Math.round((width + height) / 4)),
    }
  }

  return next
}

function getIndicatorLayout(construct: Construct, indicator: Indicator, index: number, includeOffsets = true): IndicatorLayout {
  const dir = construct.indicatorAlignment || construct.indicatorDirection || 'bottom'
  const { rx, ry } = getConstructRadii(construct)
  const edgeRadius = dir === 'left' || dir === 'right' ? rx : ry
  const labelW = Math.max(MIN_INDICATOR_LABEL_WIDTH, indicator.name.length * 7 + 16)
  const labelH = INDICATOR_LABEL_HEIGHT
  const offset = (index - (construct.indicators.length - 1) / 2) * DEFAULT_INDICATOR_STEP
  const centerGap = edgeRadius + DEFAULT_INDICATOR_EDGE_GAP + (dir === 'left' || dir === 'right' ? labelW / 2 : labelH / 2)

  let ix = construct.x
  let iy = construct.y

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

  if (includeOffsets) {
    ix += indicator.ox || 0
    iy += indicator.oy || 0
  }

  return {
    ix,
    iy,
    labelW,
    labelH,
    dir,
  }
}

function applyIndicatorAlignmentDefaults(current: Construct, patch: Partial<Construct>): Construct {
  const nextAlignment = patch.indicatorAlignment || patch.indicatorDirection || current.indicatorAlignment || current.indicatorDirection || 'bottom'
  const currentAlignment = current.indicatorAlignment || current.indicatorDirection || 'bottom'
  const shouldResetOffsets = nextAlignment !== currentAlignment

  return {
    ...current,
    ...patch,
    indicatorAlignment: nextAlignment,
    indicatorDirection: nextAlignment,
    indicators: shouldResetOffsets
      ? (patch.indicators || current.indicators).map((indicator) => ({ ...indicator, ox: 0, oy: 0 }))
      : (patch.indicators || current.indicators),
  }
}

function getSelectionBounds(constructs: Construct[], selectedIds: string[], padding = 0): SelectionBounds | null {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let foundAny = false

  selectedIds.forEach((selectedId) => {
    if (selectedId.includes(':')) {
      const [constructId, indicatorName] = selectedId.split(':')
      const construct = constructs.find((item) => item.id === constructId)
      if (!construct) return
      const indicatorIndex = construct.indicators.findIndex((indicator) => indicator.name === indicatorName)
      if (indicatorIndex === -1) return
      const indicator = construct.indicators[indicatorIndex]
      const layout = getIndicatorLayout(construct, indicator, indicatorIndex)
      minX = Math.min(minX, layout.ix - layout.labelW / 2)
      minY = Math.min(minY, layout.iy - layout.labelH / 2)
      maxX = Math.max(maxX, layout.ix + layout.labelW / 2)
      maxY = Math.max(maxY, layout.iy + layout.labelH / 2)
      foundAny = true
      return
    }

    const construct = constructs.find((item) => item.id === selectedId)
    if (!construct) return
    const { rx, ry } = getConstructRadii(construct)

    minX = Math.min(minX, construct.x - rx)
    minY = Math.min(minY, construct.y - ry)
    maxX = Math.max(maxX, construct.x + rx)
    maxY = Math.max(maxY, construct.y + ry)
    foundAny = true
  })

  if (!foundAny) return null

  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}

function getModelBounds(constructs: Construct[], padding = 0): SelectionBounds | null {
  const allIds: string[] = []

  constructs.forEach((construct) => {
    allIds.push(construct.id)
    construct.indicators.forEach((indicator) => {
      allIds.push(`${construct.id}:${indicator.name}`)
    })
  })

  return getSelectionBounds(constructs, allIds, padding)
}

function cloneModelState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function buildDragGuides(dragged: Construct, stationary: Construct[]): { snappedX: number; snappedY: number; lines: GuideLine[] } {
  const ALIGN_THRESHOLD = 8
  const GAP_THRESHOLD = 8
  const SAME_AXIS_BAND = 24

  let snappedX = dragged.x
  let snappedY = dragged.y
  const lines: GuideLine[] = []

  let alignXTarget: Construct | null = null
  let alignXDist = Number.POSITIVE_INFINITY
  let alignYTarget: Construct | null = null
  let alignYDist = Number.POSITIVE_INFINITY

  stationary.forEach((candidate) => {
    const dx = Math.abs(dragged.x - candidate.x)
    if (dx < alignXDist) {
      alignXDist = dx
      alignXTarget = candidate
    }

    const dy = Math.abs(dragged.y - candidate.y)
    if (dy < alignYDist) {
      alignYDist = dy
      alignYTarget = candidate
    }
  })

  if (alignXTarget && alignXDist <= ALIGN_THRESHOLD) {
    const target = alignXTarget as Construct
    snappedX = target.x
    const y1 = Math.min(dragged.y, target.y) - Math.max(dragged.radius, target.radius) - 16
    const y2 = Math.max(dragged.y, target.y) + Math.max(dragged.radius, target.radius) + 16
    lines.push({ x1: snappedX - dragged.radius, y1, x2: snappedX - dragged.radius, y2 })
    lines.push({ x1: snappedX + dragged.radius, y1, x2: snappedX + dragged.radius, y2 })
  }

  if (alignYTarget && alignYDist <= ALIGN_THRESHOLD) {
    const target = alignYTarget as Construct
    snappedY = target.y
    const x1 = Math.min(dragged.x, target.x) - Math.max(dragged.radius, target.radius) - 16
    const x2 = Math.max(dragged.x, target.x) + Math.max(dragged.radius, target.radius) + 16
    lines.push({ x1, y1: snappedY - dragged.radius, x2, y2: snappedY - dragged.radius })
    lines.push({ x1, y1: snappedY + dragged.radius, x2, y2: snappedY + dragged.radius })
  }

  const rowCandidates = stationary
    .filter((candidate) => Math.abs(candidate.y - snappedY) <= SAME_AXIS_BAND)
    .sort((a, b) => a.x - b.x)
  const left = [...rowCandidates].reverse().find((candidate) => candidate.x < snappedX)
  const right = rowCandidates.find((candidate) => candidate.x > snappedX)
  if (left && right) {
    const leftGap = snappedX - left.x
    const rightGap = right.x - snappedX
    if (leftGap > 0 && rightGap > 0 && Math.abs(leftGap - rightGap) <= GAP_THRESHOLD) {
      const y = snappedY - Math.max(dragged.radius, left.radius, right.radius) - 30
      const label = `Equal gap (${Math.round((leftGap + rightGap) / 2)})`
      lines.push({ x1: left.x, y1: y, x2: snappedX, y2: y, label })
      lines.push({ x1: snappedX, y1: y, x2: right.x, y2: y })
    }
  }

  const columnCandidates = stationary
    .filter((candidate) => Math.abs(candidate.x - snappedX) <= SAME_AXIS_BAND)
    .sort((a, b) => a.y - b.y)
  const top = [...columnCandidates].reverse().find((candidate) => candidate.y < snappedY)
  const bottom = columnCandidates.find((candidate) => candidate.y > snappedY)
  if (top && bottom) {
    const topGap = snappedY - top.y
    const bottomGap = bottom.y - snappedY
    if (topGap > 0 && bottomGap > 0 && Math.abs(topGap - bottomGap) <= GAP_THRESHOLD) {
      const x = snappedX + Math.max(dragged.radius, top.radius, bottom.radius) + 30
      const label = `Equal gap (${Math.round((topGap + bottomGap) / 2)})`
      lines.push({ x1: x, y1: top.y, x2: x, y2: snappedY, label })
      lines.push({ x1: x, y1: snappedY, x2: x, y2: bottom.y })
    }
  }

  return { snappedX, snappedY, lines }
}

function formatAnalysisError(prefix: string, response?: { error?: string; status?: number; url?: string } | null): string {
  const errorText = response?.error || 'Unknown error'
  const statusText = typeof response?.status === 'number' ? ` (status ${response.status})` : ''
  const backendText = response?.url ? `\nBackend: ${response.url}` : ''
  const isNetworkIssue = /failed to fetch|fetch failed|network/i.test(errorText)
  const hint = isNetworkIssue
    ? '\nTip: wait a few seconds for the PLS backend to start, then retry.'
    : ''
  return `${prefix}: ${errorText}${statusText}${backendText}${hint}`
}

function bridgeDiagnosticDetails(response: any) {
  return {
    backendDetail: response?.backendDetail ?? null,
    bridgeTimings: response?.bridgeTimings ?? null,
    recentPlumberLogs: response?.recentPlumberLogs ?? null,
  }
}

function toLaymanErrorMessage(rawError: string): string {
  const cleanedRaw = (rawError || '').replace(/^:\s*/, '').trim()
  const msg = cleanedRaw.toLowerCase()

  if (/construct.*has no indicators|no constructs with indicators|add at least one construct with indicators/.test(msg)) {
    return 'One or more constructs do not have indicators assigned. Please add indicators to every construct before running the model.'
  }
  if (/no structural paths|at least one structural path|no valid structural paths/.test(msg)) {
    return 'No valid relationships were found between constructs. Please draw at least one arrow between constructs.'
  }
  if (/dataset not found|no dataset|datasetpath is required|missing indicator columns/.test(msg)) {
    return 'Your dataset could not be found or does not match the indicators in the model. Please re-import the dataset and check indicator names.'
  }
  if (/stopped responding|too heavy for the machine|could not finish receiving|could not complete.*request/.test(msg)) {
    return 'The analysis engine stopped responding during this run. Try fewer samples, close other heavy apps, or restart Metis and run it again.'
  }
  if (/backend unavailable|cannot reach local pls backend|failed to fetch|fetch failed|network/.test(msg)) {
    return 'Metis lost connection to the local analysis engine. Please restart Metis and try the analysis again.'
  }
  if (/r runtime|rscript|plumber/.test(msg)) {
    return 'The R analysis engine is missing or failed to start. Please restart the app and try again.'
  }
  if (/dgesv|exactly singular|singular matrix|computationally singular/.test(msg)) {
    return 'The model could not be estimated because the data or predictors are perfectly duplicated or collinear. Check duplicate indicators, constant columns, identical dataset columns, or predictors that move exactly together.'
  }

  if (cleanedRaw && !/^unknown error$/i.test(cleanedRaw)) {
    return `The model could not be calculated. Backend detail: ${cleanedRaw}`
  }

  return 'The model could not be calculated. Please check that all constructs have indicators, paths are connected, and the dataset is correctly imported.'
}

function getAnalysisLabel(kind: 'pls-sem' | 'bootstrap' | 'plspredict' | 'advanced'): string {
  if (kind === 'bootstrap') return 'Bootstrap'
  if (kind === 'plspredict') return 'PLSpredict'
  if (kind === 'advanced') return 'Advanced analysis'
  return 'PLS-SEM'
}

function summarizeAnalysisResults(results: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!results) return { keys: [] }
  const keys = Object.keys(results)
  return {
    keys,
    pathCount: Array.isArray((results as any).paths) ? (results as any).paths.length : undefined,
    rSquaredCount: Array.isArray((results as any).rSquared) ? (results as any).rSquared.length : undefined,
    reliabilityRows: Array.isArray((results as any).reliability) ? (results as any).reliability.length : undefined,
  }
}

// ─── Colors (neutral gray system) ────────────────────────────────────────────

const C = {
  page:       'var(--color-elevated)',
  surface:    'var(--color-surface)',
  panel:      'var(--color-panel)',
  panelPop:   'var(--color-panel-pop)',
  panelControl:'var(--color-surface)',
  panelControlActive:'var(--color-panel-control-active)',
  elevated:   'var(--color-elevated)',
  input:      'var(--color-elevated)',
  border:     'var(--color-border)',
  borderFaint:'var(--color-border)',
  floatingBorder:'var(--color-floating-border)',
  floatingBorderSoft:'var(--color-floating-border-soft)',
  floatingIconBg:'var(--color-floating-icon-bg)',
  floatingPanelShadow:'var(--shadow-floating-panel)',
  floatingMenuShadow:'var(--shadow-floating-menu)',
  panelPopShadow:'var(--shadow-panel-pop)',
  floatingDropdownShadow:'var(--shadow-floating-dropdown)',
  floatingTooltipShadow:'var(--shadow-floating-tooltip)',
  hover:      'var(--color-surface)',
  primary:    'var(--color-accent)',
  secondary:  '#87976B',
  success:    '#87976B',
  successBorder:'var(--color-success-border)',
  selectedTabBg:'rgba(var(--color-success-rgb), 0.20)',
  selectedTabBorder:'rgba(var(--color-success-rgb), 0.24)',
  successBorderSoft:'rgba(135,151,107,0.25)',
  warning:    'var(--color-warning)',
  danger:     'var(--color-danger)',
  textOnAccent:'var(--color-on-accent)',
  textOnSuccess:'#10150B',
  textOnDanger:'#FFFFFF',
  text:       'var(--color-text-primary)',
  textSec:    'var(--color-text-secondary)',
  textMuted:  'var(--color-text-muted)',
  textDim:    'var(--color-text-dim)',
  amber:      'var(--color-warning)',
  chrome:     'var(--color-chrome)',
}

// ─── Arrow helper ─────────────────────────────────────────────────────────────

function arrowPath(from: Construct, to: Construct, path?: Path): string {
  const dx = to.x - from.x, dy = to.y - from.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 1) return ''
  const ux = dx / dist, uy = dy / dist
  
  const offF = getConstructEdgeOffset(from, ux, uy)
  const offT = getConstructEdgeOffset(to, -ux, -uy)

  const sx = from.x + ux * offF
  const sy = from.y + uy * offF
  const ex = to.x - ux * offT
  const ey = to.y - uy * offT

  if (path?.style === 'curved') {
    const mx = (sx + ex) / 2
    const my = (sy + ey) / 2
    const curvature = path.curvature || 40
    // Perpendicular vector
    const px = -uy * curvature
    const py = ux * curvature
    const cx = mx + px
    const cy = my + py
    return `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`
  }

  if (path?.style === 'rightangle') {
    const joints = path.joints || []
    if (joints.length >= 2) {
      return `M${sx},${sy} L${joints[0].x},${joints[0].y} L${joints[1].x},${joints[1].y} L${ex},${ey}`
    }
    // Default right angle if no joints yet
    const midX = (sx + ex) / 2
    return `M${sx},${sy} L${midX},${sy} L${midX},${ey} L${ex},${ey}`
  }

  return `M${sx},${sy} L${ex},${ey}`
}

function linePointDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1)

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

function indicatorPath(construct: Construct, iX: number, iY: number, iW: number, iH: number, type: 'Reflective' | 'Formative', direction: string) {
  // Latent edge point
  const ux = iX - construct.x, uy = iY - construct.y
  const dist = Math.sqrt(ux*ux + uy*uy)
  if (dist < 1) return ''
  const edgeOffset = getConstructEdgeOffset(construct, ux / dist, uy / dist)
  const lx = construct.x + (ux/dist) * edgeOffset, ly = construct.y + (uy/dist) * edgeOffset

  // Indicator edge point
  let ix = iX, iy = iY
  if (direction === 'top') iy += iH/2
  else if (direction === 'bottom') iy -= iH/2
  else if (direction === 'left') ix += iW/2
  else if (direction === 'right') ix -= iW/2

  if (type === 'Reflective') return `M${lx},${ly} L${ix},${iy}`
  return `M${ix},${iy} L${lx},${ly}`
}

// ─── Loading colour ───────────────────────────────────────────────────────────
function loadColor(v: number | null): string {
  return getOuterLoadingColor(v, C.textMuted)
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ModelCanvasProps {
  workspaces: any[]
  setWorkspaces: React.Dispatch<React.SetStateAction<any[]>>
  activeWorkspaceId: string | null
  openModelTabs: string[]
  onOpenModel: (modelId: string, workspaceId?: string) => void
  onCloseModelTab: (modelId: string) => void
  onReorderModelTabs: (draggedModelId: string, targetModelId: string) => void
}

export default function ModelCanvas({
  workspaces,
  setWorkspaces,
  activeWorkspaceId,
  openModelTabs,
  onOpenModel,
  onCloseModelTab,
  onReorderModelTabs,
}: ModelCanvasProps) {
  const navigate = useNavigate()
  const { modelId } = useParams()

  // Resolve workspace by model route first; fallback to active workspace.
  const workspaceByModel = workspaces.find((w: any) => w.children?.some((c: any) => c.id === modelId))
  const resolvedWorkspace = workspaceByModel ?? workspaces.find((w: any) => w.id === activeWorkspaceId)
  const activeWs = resolvedWorkspace ? migrateWorkspace(resolvedWorkspace as any) : undefined
  const currentModel = activeWs?.children?.find((c: any) => c.id === modelId && c.type === 'model') as any
  const linkedDataset = activeWs ? getLinkedDatasetForModel(activeWs as any, modelId) : undefined
  const electronAPI = (window as any).electronAPI
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dirtyModels, setDirtyModels] = useState<Record<string, boolean>>({})
  const modelDraftsRef = useRef<Record<string, ModelDraftState>>({})
  const loadedModelIdRef = useRef<string | null>(null)
  const draftWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDraftWriteRef = useRef<{ modelId: string; draft: ModelDraftState } | null>(null)
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false)
  const [isDatasetInfoHovered, setIsDatasetInfoHovered] = useState(false)
  const linkedDatasetId = (linkedDataset as any)?.id ?? null
  const recordDiagnostic = useCallback((
    category: 'calculation' | 'dataset' | 'workspace' | 'ui',
    level: 'info' | 'warn' | 'error',
    message: string,
    details?: unknown,
  ) => {
    addDiagnostic({
      category,
      level,
      message,
      details: {
        screen: 'model-canvas',
        workspaceId: activeWs?.id ?? null,
        workspaceName: activeWs?.name ?? null,
        modelId: modelId || null,
        linkedDatasetId,
        ...((details && typeof details === 'object' && !Array.isArray(details)) ? details as Record<string, unknown> : { details }),
      },
    })
  }, [activeWs?.id, activeWs?.name, linkedDatasetId, modelId])

  const flushPendingDraftWrite = useCallback(() => {
    if (draftWriteTimerRef.current) {
      clearTimeout(draftWriteTimerRef.current)
      draftWriteTimerRef.current = null
    }

    const pending = pendingDraftWriteRef.current
    if (!pending) return

    pendingDraftWriteRef.current = null
    writeAutosaveDraft(pending.modelId, pending.draft)
  }, [])

  const cancelPendingDraftWrite = useCallback((targetModelId?: string) => {
    if (draftWriteTimerRef.current) {
      clearTimeout(draftWriteTimerRef.current)
      draftWriteTimerRef.current = null
    }

    const pending = pendingDraftWriteRef.current
    if (!pending || (targetModelId && pending.modelId !== targetModelId)) return
    pendingDraftWriteRef.current = null
  }, [])

  const scheduleDraftWrite = useCallback((targetModelId: string, draft: ModelDraftState) => {
    pendingDraftWriteRef.current = { modelId: targetModelId, draft }
    if (draftWriteTimerRef.current) {
      clearTimeout(draftWriteTimerRef.current)
    }
    draftWriteTimerRef.current = setTimeout(flushPendingDraftWrite, DRAFT_WRITE_DEBOUNCE_MS)
  }, [flushPendingDraftWrite])

  useEffect(() => {
    return () => flushPendingDraftWrite()
  }, [flushPendingDraftWrite])

  const canvasTabs = openModelTabs
    .map((tabModelId) => {
      const workspace = workspaces.find((item: any) => item.children?.some((child: any) => child.id === tabModelId && child.type === 'model'))
      const model = workspace?.children?.find((child: any) => child.id === tabModelId && child.type === 'model')
      if (!workspace || !model) return null
      return { modelId: tabModelId, workspace, model }
    })
    .filter((tab): tab is { modelId: string; workspace: any; model: any } => tab !== null)

  const readRCodeImportedState = (): { constructs: Construct[]; paths: Path[] } => {
    try {
      const raw = readSharedStorageValue('rcode-model-state')
      if (!raw) return { constructs: [], paths: [] }
      const parsed = JSON.parse(raw)
      const constructs = Array.isArray(parsed?.constructs) ? parsed.constructs : []
      const paths = Array.isArray(parsed?.paths) ? parsed.paths : []
      return { constructs, paths }
    } catch {
      return { constructs: [], paths: [] }
    }
  }

  useEffect(() => {
    if (activeWs && currentModel) {
      addRecentModel({
        id: currentModel.id,
        name: stripModelDisplayName(currentModel.name),
      })
    }
  }, [activeWs?.id, currentModel?.id])

  const resolveDatasetFilePath = (): string => {
    const directPath = (linkedDataset as any)?.datasetTempPath || (linkedDataset as any)?.filePath || (activeWs as any)?.datasetTempPath
    const cached = readDatasetViewCache((linkedDataset as any)?.id)
    const resolved = resolveDatasetFilePathFromRequest({
      datasetId: (linkedDataset as any)?.id,
      fileName: (linkedDataset as any)?.originalFileName || (linkedDataset as any)?.name,
      filePath: (linkedDataset as any)?.filePath || '',
      datasetTempPath: (linkedDataset as any)?.datasetTempPath || (activeWs as any)?.datasetTempPath || '',
      workspaceId: activeWs?.id,
      workspaceName: activeWs?.name,
      workspacePath: activeWs?.path || '',
    }, cached)

    if (resolved) {
      console.log('[ModelCanvas] Resolved dataset path:', resolved)
      return resolved
    }

    if (typeof directPath === 'string' && directPath.trim().length > 0 && /^[A-Za-z]:[\\/]|^\//.test(directPath)) {
      return directPath
    }

    console.error('[ModelCanvas] No dataset path found!')
    return ''
  }

  // Derive variables from dataset
  const dynamicVars = (linkedDataset?.headers || []).map((h: string, i: number) => ({
    idx: i + 1,
    name: h,
    type: linkedDataset?.variableTypes?.[h] ?? 'MET',
    color: (linkedDataset?.variableTypes?.[h] ?? 'MET') === 'MET' ? 'rgb(var(--color-accent-rgb) / 0.28)' : 'var(--color-text-dim)',
  }))

  // ── Canvas state ─────────────────────────────────────────────────────────────
  const [constructs, setConstructs] = useState<Construct[]>(() => {
    if (currentModel?.state?.constructs) return currentModel.state.constructs
    if (modelId === 'from-rcode') return readRCodeImportedState().constructs
    return []
  })
  const [paths, setPaths]           = useState<Path[]>(() => {
    if (currentModel?.state?.paths) return currentModel.state.paths
    if (modelId === 'from-rcode') return readRCodeImportedState().paths
    return []
  })
  const getCurrentSnapshot = useCallback((): ModelDraftState => ({
    constructs: cloneModelState(constructs),
    paths: cloneModelState(paths),
  }), [constructs, paths])
  const currentGraphSignature = useMemo(
    () => buildAnalysisGraphSignature({ constructs, paths }),
    [constructs, paths]
  )
  const canRunAdvancedAnalysis = useMemo(() => {
    const basePlsAnalysis = currentModel?.state?.basePlsAnalysis
    return Boolean(
      linkedDataset &&
      constructs.length > 0 &&
      basePlsAnalysis?.results &&
      basePlsAnalysis?.graphSignature === currentGraphSignature
    )
  }, [constructs.length, currentGraphSignature, currentModel?.state?.basePlsAnalysis, linkedDataset])
  const [isDirty, setIsDirty]       = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [activeTool, setActiveTool] = useState<'select' | 'construct' | 'connect' | 'delete'>('select')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isModalShaking, setIsModalShaking] = useState(false)
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(true)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false)
  const [propertiesIndicatorsExpanded, setPropertiesIndicatorsExpanded] = useState(false)
  const [showLeftSidebar, setShowLeftSidebar] = useState(true)
  const [showRightSidebar, setShowRightSidebar] = useState(true)
  const [showZoomControl, setShowZoomControl] = useState(true)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(250)
  const isResizingLeft = useRef(false)

  // Infinite Canvas State
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [isPanning, setIsPanning] = useState(false)
  const [isSpaceDown, setIsSpaceDown] = useState(false)

  const [selected, setSelected]     = useState<string[]>([])
  const [highlightedConstructId, setHighlightedConstructId] = useState<string | null>(null)
  const highlightedConstructTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [canvasBg, setCanvasBg]     = useState(C.page)
  const [showGrid, setShowGrid]     = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [varSearch, setVarSearch]   = useState('')
  const [selectedVars, setSelectedVars] = useState<string[]>([])
  
  // Right-click context menu state
  const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number, y: number } | null>(null)

  // Marquee selection state
  const [marquee, setMarquee] = useState<Marquee | null>(null)

  // Drawing & Resizing
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState<{ x: number, y: number } | null>(null)
  const [drawCurrent, setDrawCurrent] = useState<{ x: number, y: number } | null>(null)
  const [resizing, setResizing] = useState<{
    id: string
    handle: ResizeHandle
    centerX: number
    centerY: number
    startRadius: number
    startWidth: number
    startHeight: number
    startShape: 'circle' | 'oval'
  } | null>(null)
  const [groupResizing, setGroupResizing] = useState<GroupResizeState | null>(null)
  const [activePathDrag, setActivePathDrag] = useState<{ id: string; tx: number; ty: number } | null>(null)
  const [dragGuideLines, setDragGuideLines] = useState<GuideLine[]>([])

  // Connection Tool
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectStart, setConnectStart] = useState<string | null>(null)
  const [connectEnd, setConnectEnd] = useState<{ x: number; y: number } | null>(null)
  
  // Algorithm Dialog State
  const [showAlgorithmDialog, setShowAlgorithmDialog] = useState(false)
  const [showBootstrapModal, setShowBootstrapModal] = useState(false)
  const [showPlsPredictModal, setShowPlsPredictModal] = useState(false)
  const [showAdvancedAnalysisModal, setShowAdvancedAnalysisModal] = useState(false)
  const [cautionModal, setCautionModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  })
  const [hocPathConflict, setHocPathConflict] = useState<HocPathConflict | null>(null)
  const [hocPathRoleChoice, setHocPathRoleChoice] = useState<HocPathRoleChoice | null>(null)
  const [algoTab, setAlgoTab] = useState<'PLS setup' | 'Data'>('PLS setup')
  const [weightingScheme, setWeightingScheme] = useState<'Factor' | 'Path' | 'PCA'>('Path')
  const [plsAlgorithm, setPlsAlgorithm] = useState<'standard' | 'consistent'>('standard')
  const [resultsType, setResultsType] = useState<'Standardized' | 'Unstandardized' | 'Mean-centered'>('Standardized')
  const [initialWeight, setInitialWeight] = useState<'Default' | 'Individual'>('Default')
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null) // 'results' | 'initial' | null
  const [showDatasetManager, setShowDatasetManager] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const [calculatingType, setCalculatingType] = useState<'bootstrap' | 'plspredict' | 'advanced' | 'pls' | null>(null)
  const [showHocPathPrompt, setShowHocPathPrompt] = useState(() => readShowHocPathPromptPreference())
  const [doNotShowHocPathPrompt, setDoNotShowHocPathPrompt] = useState(false)
  const calculationState = useCalculation()
  const calcDispatch = useCalculationDispatch()
  const isContextCalculating = useIsCalculating()
  const isAnyCalculationRunning = isCalculating || isContextCalculating
  const bootstrapAbortRef = useRef<AbortController | null>(null)
  const cancelRequestedRef = useRef(false)
  const activeCalcViewRef = useRef<'modal' | 'chip' | 'silenced' | null>(null)

  // Real-time calculation
  const [liveLoadings, setLiveLoadings] = useState<Record<string, number>>({})
  const [realtimeEnabled, setRealtimeEnabled] = useState(() => {
    const saved = readSharedStorageValue('prefs:realtimeCalc')
    return saved === null ? true : saved === 'true'
  })
  const liveCalcTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    cancelRequestedRef.current = calculationState.active?.cancelRequested ?? false
    activeCalcViewRef.current = calculationState.active?.view ?? null
    if (calculationState.active?.type === 'bootstrap' && calculationState.active.cancelRequested) {
      bootstrapAbortRef.current?.abort()
    }
  }, [calculationState.active?.cancelRequested, calculationState.active?.type, calculationState.active?.view])

  // Drag-and-drop / New Construct Modal
  const [showNewConstructModal, setShowNewConstructModal] = useState(false)
  const [newConstructName, setNewConstructName] = useState('')
  const [newConstructColor, setNewConstructColor] = useState(SWATCH_COLORS[0])
  const [newConstructType, setNewConstructType] = useState<MeasurementType>('Reflective')
  const [newConstructIsHigherOrder, setNewConstructIsHigherOrder] = useState(false)
  const [hoveredNewConstructColor, setHoveredNewConstructColor] = useState<string | null>(null)
  const [newConstructPos, setNewConstructPos] = useState({ x: 0, y: 0 })
  const [pendingVars, setPendingVars] = useState<string[]>([])
  const newConstructPalette = newConstructIsHigherOrder ? HOC_SWATCH_COLORS : SWATCH_COLORS

  const resetNewConstructModal = useCallback(() => {
    setShowNewConstructModal(false)
    setNewConstructName('')
    setNewConstructColor(SWATCH_COLORS[0])
    setNewConstructType('Reflective')
    setNewConstructIsHigherOrder(false)
    setHoveredNewConstructColor(null)
    setPendingVars([])
  }, [])
  
  const [settingsModalPos, setSettingsModalPos] = useState({ x: 0, y: 0 })
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [editingConstructId, setEditingConstructId] = useState<string | null>(null)
  const [showPathSettings, setShowPathSettings] = useState(false)
  const [editingPathId, setEditingPathId] = useState<string | null>(null)
  const [pathSettingsPos, setPathSettingsPos] = useState({ x: 0, y: 0 })
  const [constructSizeDraft, setConstructSizeDraft] = useState('')
  const [constructWidthDraft, setConstructWidthDraft] = useState('')
  const [constructHeightDraft, setConstructHeightDraft] = useState('')
  const [constructSizeFocused, setConstructSizeFocused] = useState(false)
  const [constructDimensionsFocused, setConstructDimensionsFocused] = useState(false)

  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    sx: number
    sy: number
    items: Array<{ id: string; cid?: string; name?: string; ox: number; oy: number }>
  } | null>(null)
  const panStartRef = useRef<{ x: number, y: number, px: number, py: number } | null>(null)
  const dragPathRef = useRef<{ id: string, sx: number, sy: number, targetX: number, targetY: number } | null>(null)
  const dragHandleRef = useRef<{ id: string, type: 'curvature' | 'joint', index?: number, sx: number, sy: number, startVal: any } | null>(null)
  const [activeHandleDrag, setActiveHandleDrag] = useState<{ id: string, type: 'curvature' | 'joint', index?: number, x: number, y: number } | null>(null)
  const lastVarClicked = useRef<string | null>(null)

  // ── History ──────────────────────────────────────────────────────────────────
  const historyRef = useRef<Snapshot[]>([
    { 
      constructs: currentModel?.state?.constructs || [], 
      paths: currentModel?.state?.paths || [] 
    }
  ])
  const [histIdx, setHistIdx]       = useState(0)
  const canUndo = histIdx > 0
  const canRedo = histIdx < historyRef.current.length - 1

  useEffect(() => {
    const imported = modelId === 'from-rcode' ? readRCodeImportedState() : { constructs: [], paths: [] }
    const stateConstructs = currentModel?.state?.constructs ?? imported.constructs
    const statePaths = currentModel?.state?.paths ?? imported.paths
    const draftState = modelId ? modelDraftsRef.current[modelId] : undefined
    const persistedDraft = readAutosaveDraft(modelId)

    if (modelId && persistedDraft) {
      modelDraftsRef.current[modelId] = persistedDraft
    }

    const nextConstructs = persistedDraft?.constructs ?? draftState?.constructs ?? stateConstructs
    const nextPaths = persistedDraft?.paths ?? draftState?.paths ?? statePaths

    setConstructs(nextConstructs)
    setPaths(nextPaths)
    historyRef.current = [{ constructs: stateConstructs, paths: statePaths }]
    setHistIdx(0)
    setIsDirty(!!(draftState || persistedDraft))
    setSelected([])
    setSelectedPaths([])
    loadedModelIdRef.current = modelId ?? null
  }, [modelId, currentModel?.id])

  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    
    // Compare current state with first history entry (mount state)
    const initialSnap = historyRef.current[0]
    const stateMatched = 
      JSON.stringify(initialSnap.constructs) === JSON.stringify(constructs) &&
      JSON.stringify(initialSnap.paths) === JSON.stringify(paths)

    // Only set dirty if we are different from what we started with
    if (!stateMatched && !isDirty) {
      setIsDirty(true)
    } else if (stateMatched && isDirty) {
      setIsDirty(false)
    }
  }, [constructs, paths, isDirty])

  useEffect(() => {
    if (!modelId || loadedModelIdRef.current !== modelId) return

    if (isDirty) {
      const nextDraft = {
        constructs: cloneModelState(constructs),
        paths: cloneModelState(paths),
      }
      modelDraftsRef.current[modelId] = nextDraft
      scheduleDraftWrite(modelId, nextDraft)
    } else {
      cancelPendingDraftWrite(modelId)
      delete modelDraftsRef.current[modelId]
      clearAutosaveDraft(modelId)
    }

    setDirtyModels(prev => {
      const wasDirty = !!prev[modelId]
      if (isDirty === wasDirty) return prev

      if (isDirty) {
        return { ...prev, [modelId]: true }
      }

      const next = { ...prev }
      delete next[modelId]
      return next
    })
  }, [modelId, constructs, paths, isDirty, cancelPendingDraftWrite, scheduleDraftWrite])

  useEffect(() => {
    const handler = () => {
      const saved = readSharedStorageValue('prefs:realtimeCalc')
      const next = saved === null ? true : saved === 'true'
      setRealtimeEnabled(next)
      if (!next) setLiveLoadings({})
    }
    window.addEventListener('pls:preferences-updated', handler)
    return () => window.removeEventListener('pls:preferences-updated', handler)
  }, [])

  useEffect(() => {
    const handleHocPathPromptPreferenceUpdated = () => {
      setShowHocPathPrompt(readShowHocPathPromptPreference())
      setDoNotShowHocPathPrompt(false)
    }
    window.addEventListener('pls:preferences-updated', handleHocPathPromptPreferenceUpdated)
    return () => window.removeEventListener('pls:preferences-updated', handleHocPathPromptPreferenceUpdated)
  }, [])

  useEffect(() => {
    if (!realtimeEnabled) return

    const validConstructs = constructs.filter(c => c.indicators.length >= 1)
    if (!validConstructs.length || !paths.length) return

    if (liveCalcTimer.current) clearTimeout(liveCalcTimer.current)

    liveCalcTimer.current = setTimeout(async () => {
      const datasetFilePath = resolveDatasetFilePath()
      if (!datasetFilePath) return

      const payloadParts = buildPlsModelPayloadParts(constructs, paths)
      const payloadConstructs = payloadParts.constructs

      if (!payloadConstructs.length) return
      const mappedPaths = payloadParts.paths

      if (!mappedPaths.length) return

      try {
        const result = await runPlsModel({
          datasetPath: datasetFilePath,
          constructs: payloadConstructs,
          paths: mappedPaths,
        })

        if (!result.success || !result.results) return
        const ar = result.results as any
        const next: Record<string, number> = {}

        const loadingRows: any[] = ar?.final_results?.outer_loadings ?? []
        loadingRows.forEach((r: any) => {
          const indicator = String(r.row_name ?? r.indicator ?? '')
          if (!indicator) return
          Object.keys(r).filter(k => k !== 'row_name').forEach(construct => {
            const v = Number(r[construct])
            if (Number.isFinite(v) && v !== 0) next[`${construct}::${indicator}`] = v
          })
        })

        const r2Rows: any[] = ar?.quality_criteria?.r_square ?? []
        r2Rows.forEach((r: any) => {
          const name = String(r.construct ?? r.row_name ?? '')
          const r2 = Number(r.r2)
          if (name && Number.isFinite(r2)) next[`r2::${name}`] = r2
        })

        setLiveLoadings(next)
      } catch {
        // silently ignore errors in real-time mode
      }
    }, 1500)

    return () => {
      if (liveCalcTimer.current) clearTimeout(liveCalcTimer.current)
    }
  }, [constructs, paths, realtimeEnabled])

  // Context Menu Global Dismiss
  useEffect(() => {
    const handleClick = () => setCanvasContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])
  
  const handleSave = async (): Promise<boolean> => {
    console.log('[ModelCanvas] handleSave triggered', { activeWs, currentModel })
    if (!activeWs || !currentModel) {
      console.error('[ModelCanvas] Missing workspace or model context')
      return false
    }

    const snapshot = getCurrentSnapshot()
    const nowIso = new Date().toISOString()
    const updatedModel = {
      ...currentModel,
      updatedAt: nowIso,
      state: {
        ...(currentModel.state || {}),
        constructs: snapshot.constructs,
        paths: snapshot.paths,
      },
    }
    const updatedChildren = activeWs.children.map((c: any) => c.id === modelId ? updatedModel : c)
    const updatedWs = { ...activeWs, children: updatedChildren }
    
    // Optimistic UI update
    const updatedWorkspaces = workspaces.map(w => w.id === activeWs.id ? updatedWs : w)
    setWorkspaces(updatedWorkspaces)
    writeWorkspaceClientCache(JSON.stringify(updatedWorkspaces))
    
    try {
      if (!electronAPI?.saveWorkspace) {
        if (modelId) {
          cancelPendingDraftWrite(modelId)
          delete modelDraftsRef.current[modelId]
          clearAutosaveDraft(modelId)
        }
        setIsDirty(false)
        historyRef.current[0] = snapshot
        return true
      }
      console.log('[ModelCanvas] Calling saveWorkspace IPC with:', updatedWs)
      const res = await electronAPI.saveWorkspace(updatedWs)
      console.log('[ModelCanvas] saveWorkspace res:', res)
      if (res?.success) {
        if (modelId) {
          cancelPendingDraftWrite(modelId)
          delete modelDraftsRef.current[modelId]
          clearAutosaveDraft(modelId)
          setDirtyModels(prev => {
            if (!prev[modelId]) return prev
            const next = { ...prev }
            delete next[modelId]
            return next
          })
        }
        setIsDirty(false)
        historyRef.current[0] = snapshot
        return true
      } else {
        dispatchToast('error', 'Failed to save model', res?.error || 'Access denied or unknown error')
        console.error('[ModelCanvas] Save failed:', res?.error)
        return false
      }
    } catch (err: any) {
      dispatchToast('error', 'Save exception', err?.message || 'Check terminal logs')
      console.error('[ModelCanvas] Save exception:', err)
      return false
    }
  }

  const requestCloseModelTab = useCallback((targetModelId: string) => {
    if (!targetModelId) return

    const isDirtyTarget = !!dirtyModels[targetModelId]
    if (isDirtyTarget) {
      if (targetModelId !== modelId) {
        const tabWorkspace = canvasTabs.find((tab) => tab.modelId === targetModelId)?.workspace
        onOpenModel(targetModelId, tabWorkspace?.id)
      }
      setPendingCloseTabId(targetModelId)
      setShowExitModal(true)
      return
    }

    onCloseModelTab(targetModelId)
  }, [canvasTabs, dirtyModels, modelId, onCloseModelTab, onOpenModel])

  const handleSaveAs = useCallback(async (
    name: string,
    wsId: string,
    newWsData?: { name: string; description: string; color: string }
  ) => {
    if (!currentModel) return

    let targetWsId = wsId
    let nextWorkspaces = workspaces

    if (newWsData && wsId === 'new') {
      const newWsId = `ws-${Date.now()}`
      const newWorkspace = {
        id: newWsId,
        name: `${newWsData.name}.metisws`,
        color: newWsData.color,
        expanded: true,
        children: [],
      }

      const createRes = await electronAPI?.createWorkspace?.(newWorkspace)
      if (!createRes?.success) {
        dispatchToast('error', 'Save As failed', createRes?.error ?? 'Could not create the selected workspace')
        return
      }

      const createdWorkspace = { ...newWorkspace, path: createRes.path ?? '' }
      nextWorkspaces = [...workspaces, createdWorkspace]
      setWorkspaces(nextWorkspaces)
      targetWsId = newWsId
    }

    const newModelId = `m-${Date.now()}`
    const nowIso = new Date().toISOString()
    const newModel = {
      ...currentModel,
      id: newModelId,
      name: `${name}.hbe`,
      type: 'model' as const,
      badge: currentModel.badge ?? 'Draft',
      createdAt: nowIso,
      updatedAt: nowIso,
      state: {
        ...(currentModel.state || {}),
        constructs: cloneModelState(constructs),
        paths: cloneModelState(paths),
      },
    }

    const updatedWorkspaces = nextWorkspaces.map((workspace) =>
      workspace.id === targetWsId
        ? { ...workspace, children: [...workspace.children, newModel] }
        : workspace
    )

    setWorkspaces(updatedWorkspaces)
    const targetWorkspace = updatedWorkspaces.find((workspace) => workspace.id === targetWsId)

    if (targetWorkspace && electronAPI?.saveWorkspace) {
      const saveRes = await electronAPI.saveWorkspace(targetWorkspace)
      if (!saveRes?.success) {
        dispatchToast('error', 'Save As failed', saveRes?.error ?? 'Could not save the target workspace')
        return
      }
    }

    setShowSaveAsDialog(false)
    onOpenModel(newModelId, targetWsId)
    dispatchToast(
      'success',
      'Model saved',
      `${stripModelDisplayName(newModel.name)} is ready in ${stripWorkspaceDisplayName(targetWorkspace?.name ?? '') || 'the selected workspace'}`
    )
  }, [constructs, currentModel, electronAPI, onOpenModel, paths, setWorkspaces, workspaces])

  const persistSnapshotForAnalysis = useCallback((analysisState?: {
    mode: 'pls-sem' | 'bootstrap' | 'plspredict' | 'advanced'
    results: Record<string, unknown>
    savedAt: string
    graphSignature?: string
  }, analysisSettings?: {
    plspredict?: PlsPredictSettings
    advanced?: AdvancedAnalysisSettings
  }) => {
    const snapshot = getCurrentSnapshot()
    const snapshotGraphSignature = buildAnalysisGraphSignature(snapshot)
    writeSharedStorageValue('canvas-model', JSON.stringify(snapshot))
    if (modelId) {
      writeAutosaveDraft(modelId, snapshot)
    }

    if (activeWs && currentModel) {
      const existingState = currentModel.state || {}
      const updatedModel = {
        ...currentModel,
        badge: 'Calculated' as const,
        updatedAt: new Date().toISOString(),
        state: {
          ...existingState,
          constructs: snapshot.constructs,
          paths: snapshot.paths,
          analysisSettings: {
            ...(existingState.analysisSettings || {}),
            ...(analysisSettings || {}),
          },
          ...(analysisState ? { analysis: analysisState } : {}),
          basePlsAnalysis: analysisState?.mode === 'pls-sem'
            ? {
                results: analysisState.results,
                savedAt: analysisState.savedAt,
                graphSignature: analysisState.graphSignature ?? snapshotGraphSignature,
              }
            : (existingState.basePlsAnalysis || null),
          diagramBaseResults: analysisState?.mode === 'pls-sem'
            ? analysisState.results
            : existingState.diagramBaseResults,
        },
      }
      const updatedChildren = activeWs.children.map((child: any) => child.id === modelId ? updatedModel : child)
      const updatedWs = { ...activeWs, children: updatedChildren }
      const updatedWorkspaces = workspaces.map((workspace) => workspace.id === activeWs.id ? updatedWs : workspace)
      setWorkspaces(updatedWorkspaces)
      writeWorkspaceClientCache(JSON.stringify(updatedWorkspaces))
      electronAPI?.saveWorkspace?.(updatedWs)
    }

    return snapshot
  }, [activeWs, currentModel, electronAPI, getCurrentSnapshot, modelId, setWorkspaces, workspaces])

  const persistedPlsPredictSettings = useMemo(
    () => readPlsPredictSettingsFromState(currentModel?.state),
    [currentModel?.state]
  )

  const currentResultsRoute = () => `/results/${modelId || 'full-tam'}`

  const handleStartCalculation = async (algorithmOverride?: 'standard' | 'consistent') => {
    if (isAnyCalculationRunning) return
    setCalculatingType('pls')
    setIsCalculating(true)
    calcDispatch({
      type: 'start',
      payload: {
        type: 'pls',
        title: 'Estimating PLS-SEM model',
        progressMode: 'indeterminate',
        phases: [
          { id: 'prep', label: 'Preparing model', status: 'pending' },
          { id: 'paths', label: 'Estimating PLS path coefficients', status: 'pending' },
          { id: 'summary', label: 'Computing summary statistics', status: 'pending' },
          { id: 'final', label: 'Finalizing results', status: 'pending' },
        ],
      },
    })
    setShowAlgorithmDialog(false)
    try {
      const payload = buildAnalysisPayload('pls-sem', algorithmOverride)
      calcDispatch({ type: 'setPhase', phaseId: 'paths' })
      const result = await runPlsModel(payload)
      if (cancelRequestedRef.current) {
        calcDispatch({ type: 'reset' })
        return
      }

      if (!result.success || !result.results) {
        const msg = formatAnalysisError('', result)
        calcDispatch({ type: 'fail', message: toLaymanErrorMessage(msg) })
        recordDiagnostic('calculation', 'error', 'PLS-SEM calculation failed.', {
          analysisKind: 'pls-sem',
          payloadSummary: {
            datasetPath: payload.datasetPath,
            constructCount: payload.constructs.length,
            pathCount: payload.paths.length,
            interactionCount: payload.interactions?.length ?? 0,
          },
          status: result.status ?? null,
          error: result.error ?? null,
          normalizedMessage: msg,
          ...bridgeDiagnosticDetails(result),
        })
        if (/dataset not found|no dataset|backend unavailable|cannot reach local pls backend|r runtime|rscript|plumber backend unavailable/i.test(msg)) {
          setCautionModal({
            open: true,
            title: /dataset not found|no dataset/i.test(msg) ? 'No Dataset Found' : 'R Runtime / Backend Missing',
            message: msg,
          })
        } else {
          dispatchToast('error', 'PLS calculation failed', toLaymanErrorMessage(msg))
        }
        return
      }

      calcDispatch({ type: 'setPhase', phaseId: 'summary' })
      const savedAt = new Date().toISOString()
      const savedModelSnapshot = persistSnapshotForAnalysis({
        mode: 'pls-sem',
        results: result.results,
        savedAt,
        graphSignature: currentGraphSignature,
      })
      writeSharedStorageValue('analysis-mode', 'pls-sem')
      writeSharedStorageValue('analysis-results', JSON.stringify(result.results))
      recordDiagnostic('calculation', 'info', 'PLS-SEM calculation succeeded.', {
        analysisKind: 'pls-sem',
        resultSummary: summarizeAnalysisResults(result.results as Record<string, unknown>),
      })

      calcDispatch({ type: 'setPhase', phaseId: 'final' })
      const shouldAutoOpenResults = activeCalcViewRef.current === 'modal'
      calcDispatch({
        type: 'complete',
        result: {
          type: 'pls',
          completedAt: Date.now(),
          resultsRoute: currentResultsRoute(),
          navigationState: {
            savedAnalysis: {
              mode: 'pls-sem',
              results: result.results,
              savedAt,
            },
            savedModelSnapshot,
          },
        },
        showTransientDone: !shouldAutoOpenResults,
      })
      dispatchToast('success', 'PLS-SEM complete', 'Results are ready.')

      if (shouldAutoOpenResults) {
        navigate(`/results/${modelId || 'full-tam'}`, {
          state: {
            savedAnalysis: {
              mode: 'pls-sem',
              results: result.results,
              savedAt,
            },
            savedModelSnapshot,
          },
        })
      }
    } catch (error: any) {
      const msg = error?.message || 'Unexpected error'
      calcDispatch({ type: 'fail', message: toLaymanErrorMessage(msg) })
      recordDiagnostic('calculation', 'error', 'PLS-SEM calculation threw an error before completion.', {
        analysisKind: 'pls-sem',
        error: msg,
      })
      if (/dataset not found|no dataset|backend unavailable|cannot reach local pls backend|r runtime|rscript|plumber backend unavailable/i.test(msg)) {
        setCautionModal({
          open: true,
          title: /dataset not found|no dataset/i.test(msg) ? 'No Dataset Found' : 'R Runtime / Backend Missing',
          message: msg,
        })
      } else {
        dispatchToast('error', 'PLS calculation failed', toLaymanErrorMessage(msg))
      }
    } finally {
      setIsCalculating(false)
      setCalculatingType(null)
    }
  }

  // ─── Autosave Loop ──────────────────────────────────────────────────────────
  const constructsRef = useRef(constructs)
  const pathsRef = useRef(paths)
  const workspaceSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingWorkspaceSnapshotRef = useRef<ModelDraftState | null>(null)
  const workspaceSaveChainRef = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => { constructsRef.current = constructs }, [constructs])
  useEffect(() => { pathsRef.current = paths }, [paths])

  const writeWorkspaceSnapshot = useCallback(async (snapshot: ModelDraftState) => {
    if (!activeWs || !currentModel) return

    const nowIso = new Date().toISOString()
    const updatedModel = {
      ...currentModel,
      updatedAt: nowIso,
      state: {
        ...(currentModel.state || {}),
        constructs: snapshot.constructs,
        paths: snapshot.paths,
      },
    }
    const updatedChildren = activeWs.children.map((child: any) => child.id === modelId ? updatedModel : child)
    const updatedWs = { ...activeWs, children: updatedChildren }
    const updatedWorkspaces = workspaces.map((workspace) => workspace.id === activeWs.id ? updatedWs : workspace)
    setWorkspaces(updatedWorkspaces)
    writeWorkspaceClientCache(JSON.stringify(updatedWorkspaces))
    if (typeof window !== 'undefined' && (window as any).electronAPI?.saveWorkspace) {
      await (window as any).electronAPI.saveWorkspace(updatedWs)
    }
  }, [activeWs, currentModel, modelId, setWorkspaces, workspaces])

  const runWorkspaceSnapshotSave = useCallback(async (snapshot: ModelDraftState) => {
    const savePromise = workspaceSaveChainRef.current.then(() => writeWorkspaceSnapshot(snapshot))
    workspaceSaveChainRef.current = savePromise.catch(() => undefined)
    await savePromise
  }, [writeWorkspaceSnapshot])

  const flushQueuedWorkspaceSave = useCallback(async () => {
    if (workspaceSaveTimerRef.current) {
      clearTimeout(workspaceSaveTimerRef.current)
      workspaceSaveTimerRef.current = null
    }

    const snapshot = pendingWorkspaceSnapshotRef.current
    if (!snapshot) return

    pendingWorkspaceSnapshotRef.current = null
    await runWorkspaceSnapshotSave(snapshot)

    if (pendingWorkspaceSnapshotRef.current) {
      await flushQueuedWorkspaceSave()
    }
  }, [runWorkspaceSnapshotSave])

  const queueWorkspaceSnapshotSave = useCallback((snapshot: ModelDraftState) => {
    pendingWorkspaceSnapshotRef.current = snapshot
    if (workspaceSaveTimerRef.current) {
      clearTimeout(workspaceSaveTimerRef.current)
    }
    workspaceSaveTimerRef.current = setTimeout(() => {
      void flushQueuedWorkspaceSave()
    }, WORKSPACE_SAVE_DEBOUNCE_MS)
  }, [flushQueuedWorkspaceSave])

  useEffect(() => {
    return () => {
      if (workspaceSaveTimerRef.current) {
        clearTimeout(workspaceSaveTimerRef.current)
        workspaceSaveTimerRef.current = null
      }
      void flushQueuedWorkspaceSave()
    }
  }, [flushQueuedWorkspaceSave])

  const persistCanvasSnapshot = useCallback(async (
    targetConstructs: Construct[],
    targetPaths: Path[],
    options: PersistCanvasSnapshotOptions = {},
  ) => {
    const snapshot = {
      constructs: cloneModelState(targetConstructs),
      paths: cloneModelState(targetPaths),
    }
    const workspaceSave = options.workspaceSave ?? 'immediate'

    if (modelId) {
      modelDraftsRef.current[modelId] = snapshot
      if (workspaceSave === 'debounced') {
        scheduleDraftWrite(modelId, snapshot)
      } else {
        cancelPendingDraftWrite(modelId)
        writeAutosaveDraft(modelId, snapshot)
      }
    }

    writeSharedStorageValue('canvas-model', JSON.stringify(snapshot))

    if (workspaceSave === 'debounced') {
      queueWorkspaceSnapshotSave(snapshot)
      return
    }

    pendingWorkspaceSnapshotRef.current = null
    if (workspaceSaveTimerRef.current) {
      clearTimeout(workspaceSaveTimerRef.current)
      workspaceSaveTimerRef.current = null
    }
    await runWorkspaceSnapshotSave(snapshot)
  }, [
    cancelPendingDraftWrite,
    modelId,
    queueWorkspaceSnapshotSave,
    runWorkspaceSnapshotSave,
    scheduleDraftWrite,
  ])

  useEffect(() => {
    const autosaveOn = readSharedStorageValue('prefs:autosaveOn') !== 'false'
    const intervalStr = readSharedStorageValue('prefs:autosaveInterval') || 'Every 1 minute'
    const match = intervalStr.match(/\d+/)
    const minutes = match ? parseInt(match[0], 10) : 1
    
    if (!autosaveOn || isNaN(minutes)) return

    const intervalId = setInterval(() => {
      persistCanvasSnapshot(constructsRef.current, pathsRef.current)
    }, minutes * 60 * 1000)
    
    return () => clearInterval(intervalId)
  }, [persistCanvasSnapshot])

  const buildAnalysisPayload = (
    analysisKind: 'pls-sem' | 'bootstrap' | 'plspredict' | 'advanced',
    algorithmOverride?: 'standard' | 'consistent',
  ) => {
    const selectedAlgorithm = algorithmOverride ?? plsAlgorithm
    const datasetFilePath = resolveDatasetFilePath()
    if (!datasetFilePath) {
      recordDiagnostic('calculation', 'error', `${getAnalysisLabel(analysisKind)} blocked: dataset path missing.`, {
        analysisKind,
      })
      throw new Error('No dataset file path found. Please import dataset from file before calculation.')
    }

    const payloadParts = buildPlsModelPayloadParts(constructs, paths)
    const mappedPaths = payloadParts.paths
    const directPathCount = payloadParts.directPathCount
    const interactions = payloadParts.interactions
    const payloadConstructs = payloadParts.constructs

    const emptyConstructNames = constructs
      .filter((construct) => !construct.isHigherOrder && construct.indicators.length === 0)
      .map((construct) => construct.name)

    if (!payloadConstructs.length) {
      recordDiagnostic('calculation', 'warn', `${getAnalysisLabel(analysisKind)} blocked: no constructs found.`, {
        analysisKind,
        constructCount: constructs.length,
      })
      throw new Error('Add at least one construct with indicators before calculation.')
    }

    if (emptyConstructNames.length > 0) {
      recordDiagnostic('calculation', 'error', `${getAnalysisLabel(analysisKind)} precheck failed: constructs without indicators.`, {
        analysisKind,
        emptyConstructNames,
      })
      throw new Error(`One or more constructs have no indicators: ${emptyConstructNames.join(', ')}`)
    }


    if (!directPathCount) {
      recordDiagnostic('calculation', 'warn', `${getAnalysisLabel(analysisKind)} blocked: no structural paths.`, {
        analysisKind,
        constructCount: payloadConstructs.length,
      })
      throw new Error('Add at least one structural path before calculation.')
    }

    if (!mappedPaths.length) {
      recordDiagnostic('calculation', 'error', `${getAnalysisLabel(analysisKind)} precheck failed: no valid mapped structural paths.`, {
        analysisKind,
        directPathCount,
      })
      throw new Error('No valid structural paths found after mapping constructs.')
    }

    const datasetHeaders = linkedDataset?.headers || []
    const precheck = inspectAnalysisInputs(datasetHeaders, payloadConstructs, mappedPaths, interactions)

    recordDiagnostic('calculation', 'info', `${getAnalysisLabel(analysisKind)} calculation started.`, {
      analysisKind,
      algorithm: selectedAlgorithm,
      datasetPath: datasetFilePath,
      datasetHeaderCount: datasetHeaders.length,
      datasetHeaderPreview: datasetHeaders.slice(0, 24),
      constructCount: precheck.constructCount,
      pathCount: precheck.pathCount,
      interactionCount: precheck.interactionCount,
      constructs: payloadConstructs,
      paths: mappedPaths,
    })

    if (precheck.duplicateIndicators.length > 0) {
      recordDiagnostic('calculation', 'warn', `${getAnalysisLabel(analysisKind)} precheck found duplicated indicator names.`, {
        analysisKind,
        duplicateIndicators: precheck.duplicateIndicators,
      })
    }

    if (precheck.missingIndicators.length > 0) {
      recordDiagnostic('calculation', 'error', `${getAnalysisLabel(analysisKind)} precheck failed: indicator columns are missing from the linked dataset.`, {
        analysisKind,
        missingIndicators: precheck.missingIndicators,
        datasetHeaderCount: datasetHeaders.length,
        datasetHeaderPreview: datasetHeaders.slice(0, 48),
      })
      throw new Error(`Dataset is missing indicator columns: ${precheck.missingIndicators.join(', ')}`)
    }

    const innerWeighting = readSharedStorageValue('prefs:innerWeighting') || 'Path weighting scheme'
    const initialWeights = readSharedStorageValue('prefs:initialWeights') || '1 (uniform)'
    const maxIterationsStr = readSharedStorageValue('prefs:maxIterations')
    const maxIterations = maxIterationsStr ? Number(maxIterationsStr) : 300
    const stopCriterion = readSharedStorageValue('prefs:stopCriterion') || '1e-7'

    return {
      datasetPath: datasetFilePath,
      constructs: payloadConstructs,
      paths: mappedPaths,
      interactions,
      algorithm: selectedAlgorithm,
      algorithmSettings: {
        innerWeighting,
        initialWeights,
        maxIterations,
        stopCriterion
      }
    }
  }

  const handleRunBootstrap = async (settings: any) => {
    if (isAnyCalculationRunning) return
    const totalNboot = Number(settings?.subsamples) || 500
    setShowBootstrapModal(false)
    setCalculatingType('bootstrap')
    setIsCalculating(true)
    bootstrapAbortRef.current = new AbortController()
    calcDispatch({
      type: 'start',
      payload: {
        type: 'bootstrap',
        title: `Bootstrapping ${totalNboot.toLocaleString()} samples`,
        progressMode: 'indeterminate',
        subLabel: `${totalNboot.toLocaleString()} samples - estimated ${formatBootstrapEstimate(estimateBootstrapSeconds(totalNboot))}`,
        estimatedSeconds: estimateBootstrapSeconds(totalNboot),
        phases: [
          { id: 'prep', label: 'Preparing base model', status: 'pending' },
          { id: 'resample', label: 'Resampling', status: 'pending' },
          { id: 'bias', label: 'Computing bias-corrected intervals', status: 'pending' },
          { id: 'final', label: 'Finalizing results', status: 'pending' },
        ],
      },
    })
    try {
      const basePayload = buildAnalysisPayload('bootstrap', plsAlgorithm)
      calcDispatch({ type: 'setPhase', phaseId: 'resample' })
      calcDispatch({
        type: 'setProgress',
        pct: 0,
        subLabel: `${totalNboot.toLocaleString()} bootstrap samples - estimated ${formatBootstrapEstimate(estimateBootstrapSeconds(totalNboot))}`,
      })
      const bootstrapPayload = {
        ...basePayload,
        nboot: Number(settings?.subsamples) || 500,
        ciType: settings?.ciType || 'Percentile',
        confidenceLevel: settings?.confidenceLevel || '95%',
      }
      const result = await runBootstrapModel(bootstrapPayload)

      if (cancelRequestedRef.current) {
        calcDispatch({ type: 'reset' })
        return
      }

      calcDispatch({ type: 'setPhase', phaseId: 'bias' })
      calcDispatch({ type: 'setPhase', phaseId: 'final' })

      if (!result.success || !result.results) {
        const msg = formatAnalysisError('', result)
        calcDispatch({ type: 'fail', message: toLaymanErrorMessage(msg) })
        recordDiagnostic('calculation', 'error', 'Bootstrap calculation failed.', {
          analysisKind: 'bootstrap',
          payloadSummary: {
            datasetPath: basePayload.datasetPath,
            constructCount: basePayload.constructs.length,
            pathCount: basePayload.paths.length,
            interactionCount: basePayload.interactions?.length ?? 0,
            nboot: totalNboot,
            ciType: settings?.ciType || 'Percentile',
            confidenceLevel: settings?.confidenceLevel || '95%',
          },
          status: result.status ?? null,
          error: result.error ?? null,
          normalizedMessage: msg,
          ...bridgeDiagnosticDetails(result),
        })
        if (/dataset not found|no dataset|backend unavailable|cannot reach local pls backend|r runtime|rscript|plumber backend unavailable/i.test(msg)) {
          setCautionModal({
            open: true,
            title: /dataset not found|no dataset/i.test(msg) ? 'No Dataset Found' : 'R Runtime / Backend Missing',
            message: msg,
          })
        } else {
          dispatchToast('error', 'Bootstrap failed', toLaymanErrorMessage(msg))
        }
        return
      }

      const savedAt = new Date().toISOString()
      const savedDiagramBaseResults = (currentModel?.state || {}).diagramBaseResults ?? null
      const savedModelSnapshot = persistSnapshotForAnalysis({
        mode: 'bootstrap',
        results: result.results,
        savedAt,
      })
      writeSharedStorageValue('analysis-mode', 'bootstrap')
      writeSharedStorageValue('analysis-results', JSON.stringify(result.results))
      recordDiagnostic('calculation', 'info', 'Bootstrap calculation succeeded.', {
        analysisKind: 'bootstrap',
        resultSummary: summarizeAnalysisResults(result.results as Record<string, unknown>),
      })

      const shouldAutoOpenResults = activeCalcViewRef.current === 'modal'
      calcDispatch({
        type: 'complete',
        result: {
          type: 'bootstrap',
          completedAt: Date.now(),
          resultsRoute: currentResultsRoute(),
          navigationState: {
            savedAnalysis: {
              mode: 'bootstrap',
              results: result.results,
              savedAt,
            },
            savedModelSnapshot,
            savedDiagramBaseResults,
          },
        },
        showTransientDone: !shouldAutoOpenResults,
      })
      dispatchToast('success', 'Bootstrap complete', `${totalNboot.toLocaleString()} samples`)

      if (shouldAutoOpenResults) {
        navigate(`/results/${modelId || 'full-tam'}`, {
          state: {
            savedAnalysis: {
              mode: 'bootstrap',
              results: result.results,
              savedAt,
            },
            savedModelSnapshot,
            savedDiagramBaseResults,
          },
        })
      }
    } catch (error: any) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        calcDispatch({ type: 'reset' })
        return
      }
      const msg = error?.message || 'Unexpected error'
      calcDispatch({ type: 'fail', message: toLaymanErrorMessage(msg) })
      recordDiagnostic('calculation', 'error', 'Bootstrap calculation threw an error before completion.', {
        analysisKind: 'bootstrap',
        error: msg,
      })
      if (/dataset not found|no dataset|backend unavailable|cannot reach local pls backend|r runtime|rscript|plumber backend unavailable/i.test(msg)) {
        setCautionModal({
          open: true,
          title: /dataset not found|no dataset/i.test(msg) ? 'No Dataset Found' : 'R Runtime / Backend Missing',
          message: msg,
        })
      } else {
        dispatchToast('error', 'Bootstrap failed', toLaymanErrorMessage(msg))
      }
    } finally {
      bootstrapAbortRef.current = null
      setIsCalculating(false)
      setCalculatingType(null)
    }
  }

  const handleRunPlsPredict = async (settings: PlsPredictSettings) => {
    if (isAnyCalculationRunning) return
    const normalizedSettings = normalizePlsPredictSettings(settings)
    setShowPlsPredictModal(false)
    setCalculatingType('plspredict')
    setIsCalculating(true)
    const phases: CalcPhase[] = [
      { id: 'prep', label: 'Preparing prediction model', status: 'pending' },
      { id: 'validation', label: `${normalizedSettings.folds} folds x ${normalizedSettings.repetitions} repetitions`, status: 'pending' },
      ...(normalizedSettings.cvpatEnabled
        ? [{ id: 'cvpat', label: 'Running CVPAT comparison', status: 'pending' } as CalcPhase]
        : []),
      { id: 'final', label: 'Finalizing prediction results', status: 'pending' },
    ]
    calcDispatch({
      type: 'start',
      payload: {
        type: 'plspredict',
        title: 'Running PLSpredict',
        progressMode: 'indeterminate',
        phases,
      },
    })
    try {
      const basePayload = buildAnalysisPayload('plspredict', plsAlgorithm)
      calcDispatch({ type: 'setPhase', phaseId: 'validation' })
      const result = await runPlsPredictModel({
        ...basePayload,
        folds: normalizedSettings.folds,
        repetitions: normalizedSettings.repetitions,
        cvpatEnabled: normalizedSettings.cvpatEnabled,
      })

      if (cancelRequestedRef.current) {
        calcDispatch({ type: 'reset' })
        return
      }

      if (normalizedSettings.cvpatEnabled) {
        calcDispatch({ type: 'setPhase', phaseId: 'cvpat' })
      }
      calcDispatch({ type: 'setPhase', phaseId: 'final' })

      if (!result.success || !result.results) {
        const msg = formatAnalysisError('', result)
        calcDispatch({ type: 'fail', message: toLaymanErrorMessage(msg) })
        recordDiagnostic('calculation', 'error', 'PLSpredict calculation failed.', {
          analysisKind: 'plspredict',
          payloadSummary: {
            datasetPath: basePayload.datasetPath,
            constructCount: basePayload.constructs.length,
            pathCount: basePayload.paths.length,
            interactionCount: basePayload.interactions?.length ?? 0,
            folds: normalizedSettings.folds,
            repetitions: normalizedSettings.repetitions,
            cvpatEnabled: normalizedSettings.cvpatEnabled,
          },
          status: result.status ?? null,
          error: result.error ?? null,
          normalizedMessage: msg,
          ...bridgeDiagnosticDetails(result),
        })
        if (/dataset not found|no dataset|backend unavailable|cannot reach local pls backend|r runtime|rscript|plumber backend unavailable/i.test(msg)) {
          setCautionModal({
            open: true,
            title: /dataset not found|no dataset/i.test(msg) ? 'No Dataset Found' : 'R Runtime / Backend Missing',
            message: msg,
          })
        } else {
          dispatchToast('error', 'PLS Predict failed', toLaymanErrorMessage(msg))
        }
        return
      }

      const savedAt = new Date().toISOString()
      const savedModelSnapshot = persistSnapshotForAnalysis({
        mode: 'plspredict',
        results: result.results,
        savedAt,
      }, {
        plspredict: normalizedSettings,
      })
      writeSharedStorageValue('analysis-mode', 'plspredict')
      writeSharedStorageValue('analysis-results', JSON.stringify(result.results))
      recordDiagnostic('calculation', 'info', 'PLSpredict calculation succeeded.', {
        analysisKind: 'plspredict',
        resultSummary: summarizeAnalysisResults(result.results as Record<string, unknown>),
      })

      const shouldAutoOpenResults = activeCalcViewRef.current === 'modal'
      calcDispatch({
        type: 'complete',
        result: {
          type: 'plspredict',
          completedAt: Date.now(),
          resultsRoute: currentResultsRoute(),
          navigationState: {
            savedAnalysis: {
              mode: 'plspredict',
              results: result.results,
              savedAt,
            },
            savedModelSnapshot,
          },
        },
        showTransientDone: !shouldAutoOpenResults,
      })
      dispatchToast('success', 'PLSpredict complete', `${normalizedSettings.folds * normalizedSettings.repetitions} validation cycles`)

      if (shouldAutoOpenResults) {
        navigate(`/results/${modelId || 'full-tam'}`, {
          state: {
            savedAnalysis: {
              mode: 'plspredict',
              results: result.results,
              savedAt,
            },
            savedModelSnapshot,
          },
        })
      }
    } catch (error: any) {
      const msg = error?.message || 'Unexpected error'
      calcDispatch({ type: 'fail', message: toLaymanErrorMessage(msg) })
      recordDiagnostic('calculation', 'error', 'PLSpredict calculation threw an error before completion.', {
        analysisKind: 'plspredict',
        error: msg,
      })
      if (/dataset not found|no dataset|backend unavailable|cannot reach local pls backend|r runtime|rscript|plumber backend unavailable/i.test(msg)) {
        setCautionModal({
          open: true,
          title: /dataset not found|no dataset/i.test(msg) ? 'No Dataset Found' : 'R Runtime / Backend Missing',
          message: msg,
        })
      } else {
        dispatchToast('error', 'PLS Predict failed', toLaymanErrorMessage(msg))
      }
    } finally {
      setIsCalculating(false)
      setCalculatingType(null)
    }
  }

  const handleRunAdvancedAnalysis = async (settings: AdvancedAnalysisSettings) => {
    if (isAnyCalculationRunning) return
    setShowAdvancedAnalysisModal(false)
    setCalculatingType('advanced')
    setIsCalculating(true)
    const phases: CalcPhase[] = [
      { id: 'prep', label: 'Preparing model', status: 'pending' },
    ]
    if (settings.analyses?.ipma) phases.push({ id: 'ipma', label: 'Running IPMA', status: 'pending' })
    if (settings.analyses?.nca) phases.push({ id: 'nca', label: `Running NCA - ${settings.runDepth.toLocaleString()} replications`, status: 'pending' })
    if (settings.analyses?.cipma) phases.push({ id: 'cipma', label: 'Running cIPMA', status: 'pending' })
    phases.push({ id: 'final', label: 'Finalizing results', status: 'pending' })
    calcDispatch({
      type: 'start',
      payload: {
        type: 'advanced',
        title: `Running advanced analysis on ${settings.targetConstruct}`,
        progressMode: 'indeterminate',
        phases,
      },
    })
    try {
      const basePayload = buildAnalysisPayload('advanced', plsAlgorithm)
      const result = await runAdvancedAnalysisModel({
        ...basePayload,
        targetConstruct: settings.targetConstruct,
        predecessorScope: settings.predecessorScope,
        analyses: settings.analyses,
        runDepth: settings.runDepth,
        bottleneckStepSize: settings.bottleneckStepSize,
      })

      if (cancelRequestedRef.current) {
        calcDispatch({ type: 'reset' })
        return
      }

      if (!result.success || !result.results) {
        const msg = formatAnalysisError('', result)
        calcDispatch({ type: 'fail', message: toLaymanErrorMessage(msg) })
        recordDiagnostic('calculation', 'error', 'Advanced analysis failed.', {
          analysisKind: 'advanced',
          payloadSummary: {
            datasetPath: basePayload.datasetPath,
            constructCount: basePayload.constructs.length,
            pathCount: basePayload.paths.length,
            interactionCount: basePayload.interactions?.length ?? 0,
            targetConstruct: settings.targetConstruct,
            predecessorScope: settings.predecessorScope,
            runDepth: settings.runDepth,
            bottleneckStepSize: settings.bottleneckStepSize,
            analyses: settings.analyses,
          },
          status: result.status ?? null,
          error: result.error ?? null,
          normalizedMessage: msg,
          ...bridgeDiagnosticDetails(result),
        })
        if (/dataset not found|no dataset|backend unavailable|cannot reach local pls backend|r runtime|rscript|plumber backend unavailable/i.test(msg)) {
          setCautionModal({
            open: true,
            title: /dataset not found|no dataset/i.test(msg) ? 'No Dataset Found' : 'R Runtime / Backend Missing',
            message: msg,
          })
        } else {
          dispatchToast('error', 'Advanced analysis failed', toLaymanErrorMessage(msg))
        }
        return
      }

      if (settings.analyses?.ipma) calcDispatch({ type: 'setPhase', phaseId: 'ipma' })
      if (settings.analyses?.nca) calcDispatch({ type: 'setPhase', phaseId: 'nca' })
      if (settings.analyses?.cipma) calcDispatch({ type: 'setPhase', phaseId: 'cipma' })
      calcDispatch({ type: 'setPhase', phaseId: 'final' })

      const savedAt = new Date().toISOString()
      const savedModelSnapshot = persistSnapshotForAnalysis({
        mode: 'advanced',
        results: result.results as Record<string, unknown>,
        savedAt,
      }, {
        advanced: settings,
      })
      writeSharedStorageValue('analysis-mode', 'advanced')
      writeSharedStorageValue('analysis-results', JSON.stringify(result.results))
      recordDiagnostic('calculation', 'info', 'Advanced analysis succeeded.', {
        analysisKind: 'advanced',
        resultSummary: summarizeAnalysisResults(result.results as Record<string, unknown>),
        settings,
      })

      const shouldAutoOpenResults = activeCalcViewRef.current === 'modal'
      calcDispatch({
        type: 'complete',
        result: {
          type: 'advanced',
          completedAt: Date.now(),
          resultsRoute: currentResultsRoute(),
          navigationState: {
            savedAnalysis: {
              mode: 'advanced',
              results: result.results,
              savedAt,
            },
            savedModelSnapshot,
          },
        },
        showTransientDone: !shouldAutoOpenResults,
      })
      dispatchToast('success', 'Advanced analysis complete', settings.targetConstruct)

      if (shouldAutoOpenResults) {
        navigate(`/results/${modelId || 'full-tam'}`, {
          state: {
            savedAnalysis: {
              mode: 'advanced',
              results: result.results,
              savedAt,
            },
            savedModelSnapshot,
          },
        })
      }
    } catch (error: any) {
      const msg = error?.message || 'Unexpected error'
      calcDispatch({ type: 'fail', message: toLaymanErrorMessage(msg) })
      recordDiagnostic('calculation', 'error', 'Advanced analysis threw an error before completion.', {
        analysisKind: 'advanced',
        error: msg,
      })
      if (/dataset not found|no dataset|backend unavailable|cannot reach local pls backend|r runtime|rscript|plumber backend unavailable/i.test(msg)) {
        setCautionModal({
          open: true,
          title: /dataset not found|no dataset/i.test(msg) ? 'No Dataset Found' : 'R Runtime / Backend Missing',
          message: msg,
        })
      } else {
        dispatchToast('error', 'Advanced analysis failed', toLaymanErrorMessage(msg))
      }
    } finally {
      setIsCalculating(false)
      setCalculatingType(null)
    }
  }

  const renderSvgToPng = (svg: SVGSVGElement): Promise<string> =>
    new Promise((resolve, reject) => {
      const bbox = svg.getBBox()
      const padding = 60
      const scale = 2
      const exportWidth = Math.max(bbox.width + padding * 2, 1)
      const exportHeight = Math.max(bbox.height + padding * 2, 1)
      const w = exportWidth * scale
      const h = exportHeight * scale

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, w, h)
      ctx.scale(scale, scale)

      const exportSvg = svg.cloneNode(true) as SVGSVGElement
      exportSvg.removeAttribute('style')
      exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      exportSvg.setAttribute('width', String(exportWidth))
      exportSvg.setAttribute('height', String(exportHeight))
      exportSvg.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${exportWidth} ${exportHeight}`)
      exportSvg.style.background = '#FFFFFF'

      // Preserve theme custom properties so exported SVG paths that use
      // var(--color-*) resolve the same way they do in the live canvas.
      const rootStyles = getComputedStyle(document.documentElement)
      Array.from(rootStyles)
        .filter((name) => name.startsWith('--color-'))
        .forEach((name) => {
          const value = rootStyles.getPropertyValue(name).trim()
          if (value) exportSvg.style.setProperty(name, value)
        })

      // SVGs rendered through an <img> lose access to app-level CSS variable
      // resolution for presentation attributes like stroke="var(--color-border)".
      // Inline the computed paint values so structural path shafts survive export.
      const sourceElements = [svg, ...Array.from(svg.querySelectorAll('*'))]
      const exportElements = [exportSvg, ...Array.from(exportSvg.querySelectorAll('*'))]
      sourceElements.forEach((sourceEl, index) => {
        const exportEl = exportElements[index]
        if (!(sourceEl instanceof Element) || !(exportEl instanceof Element)) return
        const computed = getComputedStyle(sourceEl)

        ;([
          ['fill', computed.fill],
          ['stroke', computed.stroke],
          ['stop-color', computed.stopColor],
        ] as const).forEach(([attr, value]) => {
          const attrValue = exportEl.getAttribute(attr)
          if (!attrValue || !attrValue.includes('var(')) return
          if (!value) return
          exportEl.setAttribute(attr, value)
        })
      })

      const svgData = new XMLSerializer().serializeToString(exportSvg)
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)

      const img = new Image()
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0, exportWidth, exportHeight)
          URL.revokeObjectURL(url)
          resolve(canvas.toDataURL('image/png').split(',')[1])
        } catch (e) {
          URL.revokeObjectURL(url)
          reject(e)
        }
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Failed to render SVG to image'))
      }
      img.src = url
    })

  const handleExportPNG = async () => {
    const svg = document.querySelector('#main-canvas-svg') as SVGSVGElement
    if (!svg) { dispatchToast('error', 'Export failed', 'Canvas element not found'); return }

    try {
      // Show save dialog first so the user picks the path
      if (electronAPI?.showSaveDialog && electronAPI?.writeFile) {
        const saveRes = await electronAPI.showSaveDialog({
          title: 'Export Conceptual Framework',
          defaultPath: 'ConceptualFramework.png',
          filters: [{ name: 'PNG Image', extensions: ['png'] }]
        })
        if (saveRes?.canceled || !saveRes?.filePath) return

        let fp: string = saveRes.filePath
        if (!fp.toLowerCase().endsWith('.png')) fp += '.png'

        const pngData = await renderSvgToPng(svg)
        const writeRes = await electronAPI.writeFile({ filePath: fp, data: pngData, encoding: 'base64' })
        if (writeRes?.success) {
          dispatchToast('success', 'Model exported', fp)
        } else {
          dispatchToast('error', 'Export failed', writeRes?.error ?? 'Unknown error')
        }
      } else {
        // Browser fallback
        const pngData = await renderSvgToPng(svg)
        const link = document.createElement('a')
        link.href = `data:image/png;base64,${pngData}`
        link.download = 'ConceptualFramework.png'
        link.click()
      }
    } catch (err: any) {
      dispatchToast('error', 'Export error', err.message)
      console.error('[ModelCanvas] Export error:', err)
    }
  }

  const commit = useCallback((newC: Construct[], newP: Path[]) => {
    const trimmed = historyRef.current.slice(0, histIdx + 1)
    trimmed.push({ constructs: newC, paths: newP })
    if (trimmed.length > 60) trimmed.shift()
    historyRef.current = trimmed
    setHistIdx(trimmed.length - 1)
    persistCanvasSnapshot(newC, newP, { workspaceSave: 'debounced' })
  }, [histIdx, persistCanvasSnapshot])

  // No status sync here anymore

  const undo = useCallback(() => {
    if (histIdx <= 0) return
    const snap = historyRef.current[histIdx - 1]
    setConstructs(snap.constructs); setPaths(snap.paths); setHistIdx(histIdx - 1)
  }, [histIdx])

  const redo = useCallback(() => {
    if (histIdx >= historyRef.current.length - 1) return
    const snap = historyRef.current[histIdx + 1]
    setConstructs(snap.constructs); setPaths(snap.paths); setHistIdx(histIdx + 1)
  }, [histIdx])
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft.current) {
        setLeftSidebarWidth(Math.max(220, Math.min(420, e.clientX - 16)))
      }
    }
    const handleMouseUp = () => {
      isResizingLeft.current = false
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // ── Clipboard ─────────────────────────────────────────────────────────────────
  const clipboardRef = useRef<Construct[]>([])

  const deleteSelected = useCallback(() => {
    if (!selected.length && !selectedPaths.length) return
    
    // Separate indicators from constructs
    const selIndicators = selected.filter(s => s.includes(':'))
    const selConstructs = selected.filter(s => !s.includes(':'))

    let newC = constructs.filter(c => !selConstructs.includes(c.id))
    
    // Handle deleting indicators from their parents
    if (selIndicators.length) {
      newC = newC.map(c => {
        const toDelete = selIndicators.filter(s => s.startsWith(`${c.id}:`)).map(s => s.split(':')[1])
        if (toDelete.length) {
          return { ...c, indicators: c.indicators.filter(ind => !toDelete.includes(ind.name)) }
        }
        return c
      })
    }

    const removedPathIds = new Set(selectedPaths)
    paths.forEach((p) => {
      if (selConstructs.includes(p.from) || selConstructs.includes(p.to)) {
        removedPathIds.add(p.id)
      }
    })
    const newP = paths.filter((p) => {
      if (removedPathIds.has(p.id)) return false
      if (selConstructs.includes(p.from) || selConstructs.includes(p.to)) return false
      if (p.targetPathId && removedPathIds.has(p.targetPathId)) return false
      return true
    })
    setConstructs(newC); setPaths(newP); setSelected([]); setSelectedPaths([]); commit(newC, newP)
  }, [selected, selectedPaths, constructs, paths, commit])

  const cutSelected = useCallback(() => {
    clipboardRef.current = constructs.filter(c => selected.includes(c.id))
    deleteSelected()
  }, [selected, constructs, deleteSelected])

  const copySelected = useCallback(() => {
    clipboardRef.current = constructs.filter(c => selected.includes(c.id))
  }, [selected, constructs])

  const pasteClipboard = useCallback(() => {
    if (!clipboardRef.current.length) return
    const pasted = clipboardRef.current.map(c => ({ ...c, id: c.id + '_' + Date.now(), x: c.x + 24, y: c.y + 24 }))
    const newC = [...constructs, ...pasted]
    setConstructs(newC); setSelected(pasted.map(p => p.id)); commit(newC, paths)
  }, [constructs, paths, commit])

  const copyConstructById = useCallback((id: string) => {
    const construct = constructs.find((item) => item.id === id)
    if (!construct) return
    clipboardRef.current = [{ ...construct, indicators: construct.indicators.map((ind) => ({ ...ind })) }]
  }, [constructs])

  const cutConstructById = useCallback((id: string) => {
    const construct = constructs.find((item) => item.id === id)
    if (!construct) return
    clipboardRef.current = [{ ...construct, indicators: construct.indicators.map((ind) => ({ ...ind })) }]
    const newC = constructs.filter((item) => item.id !== id)
    const removedPathIds = new Set(paths.filter((path) => path.from === id || path.to === id).map((path) => path.id))
    const newP = paths.filter((path) => path.from !== id && path.to !== id && !(path.targetPathId && removedPathIds.has(path.targetPathId)))
    setConstructs(newC)
    setPaths(newP)
    setSelected([])
    setSelectedPaths([])
    commit(newC, newP)
  }, [constructs, paths, commit])

  const selectAll = useCallback(() => {
    if (constructs.length === 0 && paths.length === 0) return
    setSelected(constructs.map(c => c.id))
    setSelectedPaths(paths.map(p => p.id))
  }, [constructs, paths])

  const nudge = useCallback((dx: number, dy: number) => {
    if (!selected.length) return
    const selSet = new Set(selected)
    const newC = constructs.map(c => {
      const movedConstruct = selSet.has(c.id)
      const movedIndicators = c.indicators.map(ind => {
        const indId = `${c.id}:${ind.name}`
        if (!selSet.has(indId)) return ind
        return { ...ind, ox: (ind.ox || 0) + dx, oy: (ind.oy || 0) + dy }
      })
      if (!movedConstruct && movedIndicators === c.indicators) return c
      return {
        ...c,
        x: movedConstruct ? c.x + dx : c.x,
        y: movedConstruct ? c.y + dy : c.y,
        indicators: movedIndicators,
      }
    })
    setConstructs(newC); commit(newC, paths)
  }, [selected, constructs, paths, commit])

  const fitCanvasToScreen = useCallback(() => {
    const viewport = canvasRef.current
    if (!viewport) return

    const bounds = getModelBounds(constructs, 96)
    if (!bounds) {
      setZoom(100)
      setPanX(0)
      setPanY(0)
      return
    }

    const availableWidth = Math.max(viewport.clientWidth - 24, 1)
    const availableHeight = Math.max(viewport.clientHeight - 24, 1)
    const scaleX = availableWidth / Math.max(bounds.width, 1)
    const scaleY = availableHeight / Math.max(bounds.height, 1)
    const nextZoom = Math.max(30, Math.min(200, Math.min(scaleX, scaleY) * 100))
    const scale = nextZoom / 100

    setZoom(nextZoom)
    setPanX((availableWidth - bounds.width * scale) / 2 - bounds.minX * scale)
    setPanY((availableHeight - bounds.height * scale) / 2 - bounds.minY * scale)
  }, [constructs])

  // Sync status to TitleBar
  useEffect(() => {
    const status = {
      canUndo: histIdx > 0,
      canRedo: histIdx < historyRef.current.length - 1,
      canPaste: clipboardRef.current?.length > 0,
      hasItems: selected.length > 0 || selectedPaths.length > 0,
      hasCanvasItems: constructs.length > 0 || paths.length > 0,
      hasActiveModel: !!currentModel,
      isDirty,
      canRunAdvanced: canRunAdvancedAnalysis,
    }
    window.dispatchEvent(new CustomEvent('pls:action', { detail: { status } }))
  }, [canRunAdvancedAnalysis, currentModel, histIdx, isDirty, selected, selectedPaths, constructs, paths])

  // ── TitleBar event listener ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: any) => {
      const action = e.detail?.action
      if (action === 'view:toggle-vars') setShowLeftSidebar(v => !v)
      if (action === 'view:toggle-props') setShowRightSidebar(v => !v)
      if (action === 'view:toggle-zoom-control') setShowZoomControl(v => !v)
      
      switch (action) {
        case 'edit:undo': undo(); break; case 'edit:redo': redo(); break
        case 'edit:cut': cutSelected(); break; case 'edit:copy': copySelected(); break
        case 'edit:paste': pasteClipboard(); break; case 'edit:delete': deleteSelected(); break
        case 'edit:selectall': selectAll(); break
        case 'file:save':
          if (isDirty) void handleSave()
          break
        case 'file:save-as':
          setShowSaveAsDialog(true)
          break
        case 'view:zoom-in':
          setZoom(z => Math.min(200, z + 10))
          break
        case 'view:zoom-out':
          setZoom(z => Math.max(30, z - 10))
          break
        case 'view:fit-screen':
          fitCanvasToScreen()
          break
        case 'run-pls': if (!isAnyCalculationRunning) setShowAlgorithmDialog(true); break
        case 'run-bootstrap': if (!isAnyCalculationRunning) setShowBootstrapModal(true); break
        case 'run-pls-predict': if (!isAnyCalculationRunning) setShowPlsPredictModal(true); break
        case 'run-advanced-analysis':
          if (canRunAdvancedAnalysis && !isAnyCalculationRunning) setShowAdvancedAnalysisModal(true)
          break
        case 'canvas:go-home':
          if (isDirty) {
            setPendingCloseTabId(null)
            setShowExitModal(true)
          }
          else navigate('/')
          break
      }
    }
    window.addEventListener('pls:action', handler)
    return () => window.removeEventListener('pls:action', handler)
  }, [canRunAdvancedAnalysis, deleteSelected, cutSelected, copySelected, fitCanvasToScreen, handleSave, isDirty, navigate, pasteClipboard, redo, selectAll, undo])

  // ── Selected construct ────────────────────────────────────────────────────────
  const selectedConstruct = selected.length === 1 ? constructs.find(c => c.id === selected[0]) ?? null : null
  const selectedHocLowerOrderConstructs = useMemo(() => {
    if (!selectedConstruct?.isHigherOrder) return []

    const locIds: string[] = []
    paths.forEach((path) => {
      if (path.kind === 'moderation') return
      if (path.hocRole === 'structural') return
      if (path.from === selectedConstruct.id) locIds.push(path.to)
      if (path.to === selectedConstruct.id) locIds.push(path.from)
    })

    const seen = new Set<string>()
    return locIds
      .map((id) => constructs.find((construct) => construct.id === id))
      .filter((construct): construct is Construct => Boolean(construct && !construct.isHigherOrder))
      .filter((construct) => {
        if (seen.has(construct.id)) return false
        seen.add(construct.id)
        return true
      })
  }, [constructs, paths, selectedConstruct])

  const highlightConnectedConstruct = useCallback((constructId: string) => {
    setHighlightedConstructId(constructId)
    if (highlightedConstructTimerRef.current) clearTimeout(highlightedConstructTimerRef.current)
    highlightedConstructTimerRef.current = setTimeout(() => {
      setHighlightedConstructId((current) => current === constructId ? null : current)
      highlightedConstructTimerRef.current = null
    }, 1400)
  }, [])

  useEffect(() => {
    return () => {
      if (highlightedConstructTimerRef.current) clearTimeout(highlightedConstructTimerRef.current)
    }
  }, [])

  useEffect(() => {
    setPropertiesIndicatorsExpanded(false)
  }, [selectedConstruct?.id])

  const updateSelected = useCallback((patch: Partial<Construct>) => {
    if (!selectedConstruct) return
    const newC = constructs.map(c => c.id === selectedConstruct.id ? buildConstructShapePatch(c, patch) : c)
    setConstructs(newC); commit(newC, paths)
  }, [selectedConstruct, constructs, paths, commit])

  const commitConstructSizeDraft = useCallback(() => {
    if (!selectedConstruct) return
    const nextSize = Number(constructSizeDraft)
    if (!Number.isFinite(nextSize) || nextSize <= 0) {
      setConstructSizeDraft(String(Math.round(selectedConstruct.radius * 2)))
      setConstructSizeFocused(false)
      return
    }
    const committedSize = Math.max(40, Math.round(nextSize))
    updateSelected({ radius: Math.max(20, committedSize / 2) })
    setConstructSizeDraft(String(committedSize))
    setConstructSizeFocused(false)
  }, [constructSizeDraft, selectedConstruct, updateSelected])

  const commitConstructDimensionsDraft = useCallback(() => {
    if (!selectedConstruct) return
    const nextWidth = Number(constructWidthDraft)
    const nextHeight = Number(constructHeightDraft)
    const currentDimensions = getConstructDimensions(selectedConstruct)

    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) || nextWidth <= 0 || nextHeight <= 0) {
      setConstructWidthDraft(String(Math.round(currentDimensions.width)))
      setConstructHeightDraft(String(Math.round(currentDimensions.height)))
      setConstructDimensionsFocused(false)
      return
    }

    const width = Math.max(MIN_OVAL_DIMENSION, Math.round(nextWidth))
    const height = Math.max(MIN_OVAL_DIMENSION, Math.round(nextHeight))
    updateSelected({ ovalWidth: width, ovalHeight: height })
    setConstructWidthDraft(String(width))
    setConstructHeightDraft(String(height))
    setConstructDimensionsFocused(false)
  }, [constructHeightDraft, constructWidthDraft, selectedConstruct, updateSelected])

  // ── Floating Bar Action Handlers ──────────────────────────────────────────────
  const selectedConstructIds = selected.filter(id => !id.includes(':'))
  const activeSelectedConstructs = constructs.filter(c => selectedConstructIds.includes(c.id))

  useEffect(() => {
    if (constructSizeFocused) return
    setConstructSizeDraft(selectedConstruct ? String(Math.round(selectedConstruct.radius * 2)) : '')
  }, [constructSizeFocused, selectedConstruct?.id, selectedConstruct?.radius])

  useEffect(() => {
    if (constructDimensionsFocused) return
    if (!selectedConstruct) {
      setConstructWidthDraft('')
      setConstructHeightDraft('')
      return
    }
    const { width, height } = getConstructDimensions(selectedConstruct)
    setConstructWidthDraft(String(Math.round(width)))
    setConstructHeightDraft(String(Math.round(height)))
  }, [
    constructDimensionsFocused,
    selectedConstruct?.id,
    selectedConstruct?.radius,
    selectedConstruct?.ovalWidth,
    selectedConstruct?.ovalHeight,
    selectedConstruct?.shape,
  ])

  const beginGroupResize = useCallback((e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation()

    if (selected.length < 2) return

    const startBounds = getSelectionBounds(constructs, selected, 12)
    if (!startBounds) return

    const items: GroupResizeItem[] = []
    selected.forEach((selectedId) => {
      if (selectedId.includes(':')) {
        const [constructId, indicatorName] = selectedId.split(':')
        const construct = constructs.find((item) => item.id === constructId)
        if (!construct) return
        const indicatorIndex = construct.indicators.findIndex((indicator) => indicator.name === indicatorName)
        if (indicatorIndex === -1) return
        const layout = getIndicatorLayout(construct, construct.indicators[indicatorIndex], indicatorIndex)
        items.push({
          id: selectedId,
          kind: 'indicator',
          x: layout.ix,
          y: layout.iy,
          parentId: constructId,
          name: indicatorName,
        })
        return
      }

      const construct = constructs.find((item) => item.id === selectedId)
      if (!construct) return
      items.push({
        id: construct.id,
        kind: 'construct',
        x: construct.x,
        y: construct.y,
        radius: construct.radius,
        ovalWidth: getConstructDimensions(construct).width,
        ovalHeight: getConstructDimensions(construct).height,
      })
    })

    if (!items.length) return

    setGroupResizing({
      handle,
      anchorX: handle === 'tl' || handle === 'bl' ? startBounds.maxX : startBounds.minX,
      anchorY: handle === 'tl' || handle === 'tr' ? startBounds.maxY : startBounds.minY,
      startBounds,
      items,
    })
  }, [constructs, selected])

  const handleAlignHorizontalCenter = () => {
    if (activeSelectedConstructs.length < 2) return
    const avgX = activeSelectedConstructs.reduce((sum, c) => sum + c.x, 0) / activeSelectedConstructs.length
    const newC = constructs.map(c => selectedConstructIds.includes(c.id) ? { ...c, x: avgX } : c)
    setConstructs(newC); commit(newC, paths)
  }

  const handleAlignVerticalCenter = () => {
    if (activeSelectedConstructs.length < 2) return
    const avgY = activeSelectedConstructs.reduce((sum, c) => sum + c.y, 0) / activeSelectedConstructs.length
    const newC = constructs.map(c => selectedConstructIds.includes(c.id) ? { ...c, y: avgY } : c)
    setConstructs(newC); commit(newC, paths)
  }

  const handleDistributeHorizontally = () => {
    const sorted = [...activeSelectedConstructs].sort((a, b) => a.x - b.x)
    if (sorted.length > 2) {
      const minX = sorted[0].x
      const maxX = sorted[sorted.length - 1].x
      const step = (maxX - minX) / (sorted.length - 1)
      const newC = constructs.map(c => {
        const idx = sorted.findIndex(s => s.id === c.id)
        return idx !== -1 ? { ...c, x: minX + step * idx } : c
      })
      setConstructs(newC); commit(newC, paths)
    }
  }

  const handleDistributeVertically = () => {
    const sorted = [...activeSelectedConstructs].sort((a, b) => a.y - b.y)
    if (sorted.length > 2) {
      const minY = sorted[0].y
      const maxY = sorted[sorted.length - 1].y
      const step = (maxY - minY) / (sorted.length - 1)
      const newC = constructs.map(c => {
        const idx = sorted.findIndex(s => s.id === c.id)
        return idx !== -1 ? { ...c, y: minY + step * idx } : c
      })
      setConstructs(newC); commit(newC, paths)
    }
  }

  const handleAutoSizeSelected = () => {
    const defaultOval = getDefaultOvalDimensions(DEFAULT_CONSTRUCT_RADIUS)
    const newC = constructs.map(c => selectedConstructIds.includes(c.id)
      ? {
          ...c,
          radius: DEFAULT_CONSTRUCT_RADIUS,
          ...(normalizeConstructShape(c.shape) === 'oval'
            ? { ovalWidth: defaultOval.width, ovalHeight: defaultOval.height }
            : {}),
        }
      : c)
    setConstructs(newC); commit(newC, paths)
  }

  const canCalculate = constructs.length > 0 && !!linkedDataset

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.key === ' ') {
        if (!inInput) {
          setIsSpaceDown(true)
          if (activeTool !== 'select') e.preventDefault()
        }
      }
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z': if (!inInput) { e.preventDefault(); if (e.shiftKey) redo(); else undo() } return
          case 'y': if (!inInput) { e.preventDefault(); redo() } return
          case 'c': if (!inInput) { e.preventDefault(); copySelected() } return
          case 'x': if (!inInput) { e.preventDefault(); copySelected(); deleteSelected() } return
          case 'v': if (!inInput) { e.preventDefault(); pasteClipboard() } return
          case 'a': if (!inInput) { e.preventDefault(); selectAll() } return
          case 's':
            if (!inInput) {
              e.preventDefault()
              if (e.shiftKey) setShowSaveAsDialog(true)
              else if (isDirty) void handleSave()
            }
            return
          case '=': case '+': e.preventDefault(); setZoom(z => Math.min(200, z + 10)); return
          case '-': e.preventDefault(); setZoom(z => Math.max(30, z - 10)); return
          case '0': e.preventDefault(); fitCanvasToScreen(); return
          case 'enter': e.preventDefault(); if (canCalculate && !isAnyCalculationRunning) void handleStartCalculation(); return
          case 'b': e.preventDefault(); if (canCalculate && !isAnyCalculationRunning) setShowBootstrapModal(true); return
          case 'p': e.preventDefault(); if (canCalculate && !isAnyCalculationRunning) setShowPlsPredictModal(true); return
        }
      }
      if (!inInput) {
        switch (e.key.toLowerCase()) {
          case 'l': e.preventDefault(); setActiveTool('construct'); return
          case 'c': e.preventDefault(); setActiveTool('connect'); return
          case 'v': e.preventDefault(); setActiveTool('select'); return
          case 'arrowup':    e.preventDefault(); nudge(0, -10); return
          case 'arrowdown':  e.preventDefault(); nudge(0,  10); return
          case 'arrowleft':  e.preventDefault(); nudge(-10, 0); return
          case 'arrowright': e.preventDefault(); nudge( 10, 0); return
          case 'delete': case 'backspace': 
            e.preventDefault()
            deleteSelected()
            return
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setIsSpaceDown(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [selected, selectedPaths, constructs, paths, activeTool, undo, redo, copySelected, pasteClipboard, selectAll, commit, deleteSelected, fitCanvasToScreen, handleSave, isDirty, canCalculate, isAnyCalculationRunning])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY
        setZoom(z => Math.min(200, Math.max(30, z + delta * 0.5)))
      } else {
        setPanX(px => px - e.deltaX)
        setPanY(py => py - e.deltaY)
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleVarClick = (e: React.MouseEvent, name: string) => {
    let next = [...selectedVars]
    if (e.ctrlKey || e.metaKey) {
      if (next.includes(name)) next = next.filter(v => v !== name)
      else next.push(name)
    } else if (e.shiftKey && lastVarClicked.current) {
      const idxA = dynamicVars.findIndex((v: any) => v.name === lastVarClicked.current)
      const idxB = dynamicVars.findIndex((v: any) => v.name === name)
      const start = Math.min(idxA, idxB), end = Math.max(idxA, idxB)
      const range = dynamicVars.slice(start, end + 1).map((v: any) => v.name)
      next = Array.from(new Set([...next, ...range]))
    } else {
      next = [name]
    }
    setSelectedVars(next)
    lastVarClicked.current = name
  }

  const playAlertSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioCtx.createOscillator()
      const gainNode = audioCtx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(440, audioCtx.currentTime)
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1)
      oscillator.connect(gainNode); gainNode.connect(audioCtx.destination)
      oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.1)
    } catch (e) { console.error(e) }
  }

  const triggerModalAlert = () => {
    playAlertSound()
    setIsModalShaking(true)
    setTimeout(() => setIsModalShaking(false), 500)
  }

  const handlePathClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (activeTool === 'delete') {
      const newP = paths.filter(p => p.id !== id && p.targetPathId !== id)
      setPaths(newP); commit(constructs, newP); return
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedPaths(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    } else {
      setSelectedPaths([id])
      setSelected([]) // Clear construct selection unless holding ctrl
    }
  }

  const handlePathContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    setPathSettingsPos({ x: e.clientX, y: e.clientY })
    setEditingPathId(id)
    setShowPathSettings(true)
  }

  const handleSavePathSettings = (updatedPath: Path) => {
    let finalPath = { ...updatedPath }
    if (finalPath.style === 'rightangle' && (!finalPath.joints || finalPath.joints.length === 0)) {
      const f = constructs.find(c => c.id === finalPath.from)
      const t = constructs.find(c => c.id === finalPath.to)
      if (f && t) {
        const dx = t.x - f.x, dy = t.y - f.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const sx = f.x + (dx/dist) * f.radius
        const sy = f.y + (dy/dist) * f.radius
        const ex = t.x - (dx/dist) * t.radius
        const ey = t.y - (dy/dist) * t.radius
        const midX = (sx + ex) / 2
        finalPath.joints = [
          { x: midX, y: sy },
          { x: midX, y: ey }
        ]
      }
    }
    const newP = paths.map(p => p.id === finalPath.id ? finalPath : p)
    setPaths(newP)
    commit(constructs, newP)
    setShowPathSettings(false)
  }

  const getHocPathConflict = useCallback((fromId: string, toId: string, pathId: string): HocPathConflict | null => {
    const fromConstruct = constructs.find((construct) => construct.id === fromId)
    const toConstruct = constructs.find((construct) => construct.id === toId)
    if (!fromConstruct || !toConstruct) return null
    if (Boolean(fromConstruct.isHigherOrder) === Boolean(toConstruct.isHigherOrder)) return null

    const hoc = fromConstruct.isHigherOrder ? fromConstruct : toConstruct
    const loc = fromConstruct.isHigherOrder ? toConstruct : fromConstruct
    const currentType = hoc.type
    const suggestedType = currentType === 'Reflective' ? 'Formative' : 'Reflective'
    const expectedFrom = currentType === 'Reflective' ? hoc.id : loc.id
    const expectedTo = currentType === 'Reflective' ? loc.id : hoc.id
    if (fromId === expectedFrom && toId === expectedTo) return null

    return {
      id: pathId,
      from: fromId,
      to: toId,
      hocId: hoc.id,
      locId: loc.id,
      currentType,
      suggestedType,
    }
  }, [constructs])

  const getHocPathRoleChoice = useCallback((fromId: string, toId: string, pathId: string): HocPathRoleChoice | null => {
    const fromConstruct = constructs.find((construct) => construct.id === fromId)
    const toConstruct = constructs.find((construct) => construct.id === toId)
    if (!fromConstruct || !toConstruct) return null
    if (Boolean(fromConstruct.isHigherOrder) === Boolean(toConstruct.isHigherOrder)) return null

    const hoc = fromConstruct.isHigherOrder ? fromConstruct : toConstruct
    const loc = fromConstruct.isHigherOrder ? toConstruct : fromConstruct
    return {
      id: pathId,
      from: fromId,
      to: toId,
      hocId: hoc.id,
      locId: loc.id,
    }
  }, [constructs])

  const commitDirectPath = useCallback((
    fromId: string,
    toId: string,
    pathId: string,
    targetConstructs: Construct[] = constructs,
    targetPaths: Path[] = paths,
    hocRole?: HocPathRole,
  ) => {
    const existingPath = targetPaths.find((path) => path.kind !== 'moderation' && path.from === fromId && path.to === toId)
    if (existingPath) {
      const nextPaths = hocRole && existingPath.hocRole !== hocRole
        ? targetPaths.map((path) => path.id === existingPath.id ? { ...path, hocRole } : path)
        : targetPaths
      setConstructs(targetConstructs)
      setPaths(nextPaths)
      commit(targetConstructs, nextPaths)
      setSelectedPaths([existingPath.id])
      setSelected([])
      return
    }

    const newPath: Path = { id: pathId, from: fromId, to: toId, kind: 'direct', ...(hocRole ? { hocRole } : {}) }
    const newPaths = [...targetPaths, newPath]
    setConstructs(targetConstructs)
    setPaths(newPaths)
    commit(targetConstructs, newPaths)
    setSelectedPaths([pathId])
    setSelected([])
  }, [constructs, paths, commit])

  const createDirectPath = useCallback((fromId: string, toId: string, requestedHocRole?: HocPathRole) => {
    if (fromId === toId) return
    const id = `p-${Date.now()}`
    if (requestedHocRole === 'measurement') {
      const conflict = getHocPathConflict(fromId, toId, id)
      if (conflict) {
        setHocPathConflict(conflict)
        return
      }
      commitDirectPath(fromId, toId, id, constructs, paths, 'measurement')
      return
    }
    if (requestedHocRole === 'structural') {
      commitDirectPath(fromId, toId, id, constructs, paths, 'structural')
      return
    }

    const roleChoice = getHocPathRoleChoice(fromId, toId, id)
    if (roleChoice) {
      if (!showHocPathPrompt) {
        commitDirectPath(fromId, toId, id, constructs, paths, 'structural')
        return
      }
      setHocPathRoleChoice(roleChoice)
      return
    }

    commitDirectPath(fromId, toId, id)
  }, [commitDirectPath, constructs, getHocPathRoleChoice, paths, showHocPathPrompt])

  const rememberHocPathPromptChoice = useCallback(() => {
    if (!doNotShowHocPathPrompt) return
    writeShowHocPathPromptPreference(false)
    setShowHocPathPrompt(false)
    setDoNotShowHocPathPrompt(false)
  }, [doNotShowHocPathPrompt])

  const createHocMeasurementPath = useCallback(() => {
    if (!hocPathRoleChoice) return
    const conflict = getHocPathConflict(hocPathRoleChoice.from, hocPathRoleChoice.to, hocPathRoleChoice.id)
    rememberHocPathPromptChoice()
    setHocPathRoleChoice(null)
    if (conflict) {
      setHocPathConflict(conflict)
      return
    }
    commitDirectPath(hocPathRoleChoice.from, hocPathRoleChoice.to, hocPathRoleChoice.id, constructs, paths, 'measurement')
  }, [commitDirectPath, constructs, getHocPathConflict, hocPathRoleChoice, paths, rememberHocPathPromptChoice])

  const createHocStructuralPath = useCallback(() => {
    if (!hocPathRoleChoice) return
    rememberHocPathPromptChoice()
    commitDirectPath(hocPathRoleChoice.from, hocPathRoleChoice.to, hocPathRoleChoice.id, constructs, paths, 'structural')
    setHocPathRoleChoice(null)
  }, [commitDirectPath, constructs, hocPathRoleChoice, paths, rememberHocPathPromptChoice])

  const cancelHocPathRoleChoice = useCallback(() => {
    setHocPathRoleChoice(null)
    setDoNotShowHocPathPrompt(false)
  }, [])

  const keepHocMeasurementType = useCallback(() => {
    if (!hocPathConflict) return
    const expectedFrom = hocPathConflict.currentType === 'Reflective' ? hocPathConflict.hocId : hocPathConflict.locId
    const expectedTo = hocPathConflict.currentType === 'Reflective' ? hocPathConflict.locId : hocPathConflict.hocId
    commitDirectPath(expectedFrom, expectedTo, hocPathConflict.id, constructs, paths, 'measurement')
    setHocPathConflict(null)
  }, [commitDirectPath, constructs, hocPathConflict, paths])

  const switchHocMeasurementType = useCallback(() => {
    if (!hocPathConflict) return
    const nextConstructs = constructs.map((construct) => (
      construct.id === hocPathConflict.hocId
        ? { ...construct, type: hocPathConflict.suggestedType }
        : construct
    ))
    commitDirectPath(hocPathConflict.from, hocPathConflict.to, hocPathConflict.id, nextConstructs, paths, 'measurement')
    setHocPathConflict(null)
  }, [commitDirectPath, constructs, hocPathConflict, paths])

  // ── Drag ──────────────────────────────────────────────────────────────────────
  const snap = (v: number) => snapEnabled ? Math.round(v / 20) * 20 : v

  const buildDragItems = useCallback((dragIds: string[]) => {
    return dragIds
      .map(selId => {
        if (selId.includes(':')) {
          const [cid, name] = selId.split(':')
          const parent = constructs.find(c => c.id === cid)
          const indicator = parent?.indicators.find(i => i.name === name)
          if (!parent || !indicator) return null
          return { id: selId, cid, name, ox: indicator.ox || 0, oy: indicator.oy || 0 }
        }

        const construct = constructs.find(item => item.id === selId)
        if (!construct) return null
        return { id: selId, ox: construct.x, oy: construct.y }
      })
      .filter(Boolean) as Array<{ id: string; cid?: string; name?: string; ox: number; oy: number }>
  }, [constructs])

  const beginSelectionDrag = useCallback((e: React.MouseEvent, dragIds: string[]) => {
    if (e.button === 2) return
    e.stopPropagation()

    const items = buildDragItems(dragIds)
    if (!items.length) return

    dragRef.current = { sx: e.clientX, sy: e.clientY, items }
  }, [buildDragItems])

  const onConstructMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button === 2) return // Ignore right-click for dragging
    e.stopPropagation()
    if (activeTool === 'delete') {
      const newC = constructs.filter(c => c.id !== id)
      const removedPathIds = new Set(paths.filter((p) => p.from === id || p.to === id).map((p) => p.id))
      const newP = paths.filter((p) => p.from !== id && p.to !== id && !(p.targetPathId && removedPathIds.has(p.targetPathId)))
      setConstructs(newC)
      setPaths(newP)
      commit(newC, newP)
      return
    }
    
    if (activeTool === 'connect') {
      const c = constructs.find(x => x.id === id)!

      // Click-to-connect: if source already selected, second click on another construct creates a path.
      if (connectStart && connectStart !== id) {
        createDirectPath(connectStart, id, e.shiftKey ? 'measurement' : undefined)
        setIsConnecting(false)
        setConnectStart(null)
        setConnectEnd(null)
        return
      }

      setConnectStart(id)
      setConnectEnd({ x: c.x, y: c.y })
      setIsConnecting(true)
      return
    }

    let nextSelected = selected
    if (e.shiftKey) {
      if (!selected.includes(id)) {
        nextSelected = [...selected, id]
        setSelected(nextSelected)
      }
      setSelectedPaths([])
    } else if (e.ctrlKey || e.metaKey) {
      nextSelected = selected.includes(id)
        ? selected.filter(x => x !== id)
        : [...selected, id]
      setSelected(nextSelected)
      setSelectedPaths([])
    } else {
      if (!selected.includes(id) || selected.length > 1) {
        nextSelected = [id]
        setSelected(nextSelected)
      }
      setSelectedPaths([])
    }

    const dragIds = nextSelected.includes(id) ? nextSelected : [id]
    beginSelectionDrag(e, dragIds)
  }

  const handleConstructContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    setSettingsModalPos({ x: e.clientX, y: e.clientY })
    setEditingConstructId(id)
    setShowSettingsModal(true)
  }

  const onIndicatorMouseDown = (e: React.MouseEvent, cid: string, name: string) => {
    e.stopPropagation()
    const id = `${cid}:${name}`
    if (activeTool === 'delete') {
      const newC = constructs.map(c => c.id === cid ? { ...c, indicators: c.indicators.filter(ind => ind.name !== name) } : c)
      setConstructs(newC); commit(newC, paths); return
    }
    let nextSelected = selected
    if (e.shiftKey) {
      if (!selected.includes(id)) {
        nextSelected = [...selected, id]
        setSelected(nextSelected)
      }
      setSelectedPaths([])
    } else if (e.ctrlKey || e.metaKey) {
      nextSelected = selected.includes(id)
        ? selected.filter(x => x !== id)
        : [...selected, id]
      setSelected(nextSelected)
      setSelectedPaths([])
    } else {
      nextSelected = [id]
      setSelected(nextSelected)
      setSelectedPaths([])
    }

    const dragIds = nextSelected.includes(id) ? nextSelected : [id]
    beginSelectionDrag(e, dragIds)
  }

  const onSvgMouseDown = (e: React.MouseEvent) => {
    if (isSpaceDown || e.button === 1) {
      setIsPanning(true)
      panStartRef.current = { x: e.clientX, y: e.clientY, px: panX, py: panY }
      return
    }

    // FIX: Grab bounding rect from the un-transformed wrapper instead of the scaled SVG
    const rect = canvasRef.current!.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left - panX) / (zoom / 100)
    const mouseY = (e.clientY - rect.top - panY) / (zoom / 100)

    if (activeTool === 'construct') {
      setIsDrawing(true)
      setDrawStart({ x: mouseX, y: mouseY })
      setDrawCurrent({ x: mouseX, y: mouseY })
      return
    }

    // Start Marquee Selection
    if (activeTool === 'select' && e.button === 0) {
      setMarquee({ active: true, startX: mouseX, startY: mouseY, endX: mouseX, endY: mouseY })
      setSelected([])
      setSelectedPaths([])
      return
    }

    setSelected([])
    setSelectedPaths([])
  }

  const onSvgMouseMove = (e: React.MouseEvent) => {
    if (isPanning && panStartRef.current) {
      setDragGuideLines([])
      setPanX(panStartRef.current.px + (e.clientX - panStartRef.current.x))
      setPanY(panStartRef.current.py + (e.clientY - panStartRef.current.y))
      return
    }

    const scale = zoom / 100
    // FIX: Grab bounding rect from the un-transformed wrapper
    const rect = canvasRef.current!.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left - panX) / scale
    const mouseY = (e.clientY - rect.top - panY) / scale

    if (isDrawing && drawStart) {
      setDragGuideLines([])
      setDrawCurrent({ x: mouseX, y: mouseY })
      return
    }

    if (isConnecting && connectStart) {
      setDragGuideLines([])
      setConnectEnd({ x: mouseX, y: mouseY })
      return
    }

    // Update Marquee Selection
    if (marquee?.active) {
      setMarquee(m => m ? { ...m, endX: mouseX, endY: mouseY } : null)
      return
    }

    if (groupResizing) {
      setDragGuideLines([])

      const startCornerX = (groupResizing.handle === 'tl' || groupResizing.handle === 'bl')
        ? groupResizing.startBounds.minX
        : groupResizing.startBounds.maxX
      const startCornerY = (groupResizing.handle === 'tl' || groupResizing.handle === 'tr')
        ? groupResizing.startBounds.minY
        : groupResizing.startBounds.maxY

      const scaleXRaw = startCornerX === groupResizing.anchorX
        ? 1
        : (mouseX - groupResizing.anchorX) / (startCornerX - groupResizing.anchorX)
      const scaleYRaw = startCornerY === groupResizing.anchorY
        ? 1
        : (mouseY - groupResizing.anchorY) / (startCornerY - groupResizing.anchorY)

      const scaleX = Math.max(0.2, Number.isFinite(scaleXRaw) ? scaleXRaw : 1)
      const scaleY = Math.max(0.2, Number.isFinite(scaleYRaw) ? scaleYRaw : 1)
      const radiusScale = Math.max(0.2, (Math.abs(scaleX) + Math.abs(scaleY)) / 2)

      const constructSnapshots = new Map(
        groupResizing.items
          .filter((item): item is Extract<GroupResizeItem, { kind: 'construct' }> => item.kind === 'construct')
          .map((item) => [item.id, item]),
      )
      const indicatorSnapshots = new Map(
        groupResizing.items
          .filter((item): item is Extract<GroupResizeItem, { kind: 'indicator' }> => item.kind === 'indicator')
          .map((item) => [item.id, item]),
      )

      let nextConstructs = constructs.map((construct) => {
        const snapshot = constructSnapshots.get(construct.id)
        if (!snapshot) return construct

        return {
          ...construct,
          x: groupResizing.anchorX + (snapshot.x - groupResizing.anchorX) * scaleX,
          y: groupResizing.anchorY + (snapshot.y - groupResizing.anchorY) * scaleY,
          radius: Math.max(20, snapshot.radius * radiusScale),
          ...(normalizeConstructShape(construct.shape) === 'oval'
            ? {
                ovalWidth: Math.max(MIN_OVAL_DIMENSION, (snapshot.ovalWidth ?? getDefaultOvalDimensions(snapshot.radius).width) * Math.abs(scaleX)),
                ovalHeight: Math.max(MIN_OVAL_DIMENSION, (snapshot.ovalHeight ?? getDefaultOvalDimensions(snapshot.radius).height) * Math.abs(scaleY)),
              }
            : {}),
        }
      })

      const nextConstructById = new Map(nextConstructs.map((construct) => [construct.id, construct]))

      nextConstructs = nextConstructs.map((construct) => {
        const hasSelectedIndicators = construct.indicators.some((indicator) => indicatorSnapshots.has(`${construct.id}:${indicator.name}`))
        if (!hasSelectedIndicators) return construct

        const nextIndicators = construct.indicators.map((indicator, index) => {
          const snapshot = indicatorSnapshots.get(`${construct.id}:${indicator.name}`)
          if (!snapshot) return indicator

          const parent = nextConstructById.get(construct.id) || construct
          const baseLayout = getIndicatorLayout(parent, indicator, index, false)
          const nextX = groupResizing.anchorX + (snapshot.x - groupResizing.anchorX) * scaleX
          const nextY = groupResizing.anchorY + (snapshot.y - groupResizing.anchorY) * scaleY

          return {
            ...indicator,
            ox: nextX - baseLayout.ix,
            oy: nextY - baseLayout.iy,
          }
        })

        const nextConstruct = { ...construct, indicators: nextIndicators }
        nextConstructById.set(construct.id, nextConstruct)
        return nextConstruct
      })

      setConstructs(nextConstructs)
      return
    }

    if (resizing) {
      setDragGuideLines([])
      const handleSignX = resizing.handle === 'tl' || resizing.handle === 'bl' ? -1 : 1
      const handleSignY = resizing.handle === 'tl' || resizing.handle === 'tr' ? -1 : 1

      if (resizing.startShape === 'oval') {
        const handleAxis = resizing.handle === 'left' || resizing.handle === 'right'
          ? 'horizontal'
          : resizing.handle === 'top' || resizing.handle === 'bottom'
            ? 'vertical'
            : 'diagonal'

        if (handleAxis === 'horizontal') {
          const sideSignX = resizing.handle === 'left' ? -1 : 1
          const projectedWidth = (mouseX - resizing.centerX) * sideSignX * 2
          const newWidth = Math.max(MIN_OVAL_DIMENSION, Number.isFinite(projectedWidth) ? projectedWidth : resizing.startWidth)
          setConstructs(prev => prev.map(c => c.id === resizing.id ? {
            ...c,
            ovalWidth: newWidth,
            ovalHeight: resizing.startHeight,
          } : c))
          return
        }

        if (handleAxis === 'vertical') {
          const sideSignY = resizing.handle === 'top' ? -1 : 1
          const projectedHeight = (mouseY - resizing.centerY) * sideSignY * 2
          const newHeight = Math.max(MIN_OVAL_DIMENSION, Number.isFinite(projectedHeight) ? projectedHeight : resizing.startHeight)
          setConstructs(prev => prev.map(c => c.id === resizing.id ? {
            ...c,
            ovalWidth: resizing.startWidth,
            ovalHeight: newHeight,
          } : c))
          return
        }

        if (handleAxis === 'diagonal') {
          const projectedWidth = (mouseX - resizing.centerX) * handleSignX * 2
          const projectedHeight = (mouseY - resizing.centerY) * handleSignY * 2
          const widthScale = resizing.startWidth > 0 ? projectedWidth / resizing.startWidth : 1
          const heightScale = resizing.startHeight > 0 ? projectedHeight / resizing.startHeight : 1
          const aspectScale = Math.max(0.2, Number.isFinite(widthScale) ? widthScale : 1, Number.isFinite(heightScale) ? heightScale : 1)
          const newWidth = Math.max(MIN_OVAL_DIMENSION, resizing.startWidth * aspectScale)
          const newHeight = Math.max(MIN_OVAL_DIMENSION, resizing.startHeight * aspectScale)
          setConstructs(prev => prev.map(c => c.id === resizing.id ? {
            ...c,
            ovalWidth: newWidth,
            ovalHeight: newHeight,
          } : c))
          return
        }
      }

      const projectedRadius = Math.max(
        (mouseX - resizing.centerX) * handleSignX,
        (mouseY - resizing.centerY) * handleSignY,
      )
      const newRadius = Math.max(MIN_CONSTRUCT_RADIUS, Number.isFinite(projectedRadius) ? projectedRadius : resizing.startRadius)
      setConstructs(prev => prev.map(c => c.id === resizing.id ? { ...c, radius: newRadius } : c))
      return
    }

    if (dragRef.current) {
      const { sx, sy, items } = dragRef.current
      const dx = (e.clientX - sx) / scale
      const dy = (e.clientY - sy) / scale

      const draggedConstructItems = items.filter((item) => !item.cid)
      const draggedConstructIds = new Set(draggedConstructItems.map((item) => item.id))

      let adjustDx = 0
      let adjustDy = 0

      if (draggedConstructItems.length > 0) {
        const primary = draggedConstructItems[0]
        const originalConstruct = constructs.find((construct) => construct.id === primary.id)
        if (originalConstruct) {
          const candidateX = snap(primary.ox + dx)
          const candidateY = snap(primary.oy + dy)
          const stationary = constructs.filter((construct) => !draggedConstructIds.has(construct.id))
          const guideResult = buildDragGuides({ ...originalConstruct, x: candidateX, y: candidateY }, stationary)
          adjustDx = guideResult.snappedX - candidateX
          adjustDy = guideResult.snappedY - candidateY
          setDragGuideLines(guideResult.lines)
        }
      } else {
        setDragGuideLines([])
      }

      setConstructs(prev => prev.map(c => {
        const constructItem = items.find(it => it.id === c.id)
        const indicatorItems = items.filter(it => it.cid === c.id)
        if (!constructItem && indicatorItems.length === 0) return c

        let nextIndicators = c.indicators
        if (indicatorItems.length > 0) {
          const indicatorMap = new Map(indicatorItems.map(it => [it.name!, it]))
          nextIndicators = c.indicators.map(ind => {
            const it = indicatorMap.get(ind.name)
            if (!it) return ind
            return {
              ...ind,
              ox: snap(it.ox + dx),
              oy: snap(it.oy + dy),
            }
          })
        }

        if (!constructItem) {
          return { ...c, indicators: nextIndicators }
        }

        return {
          ...c,
          x: snap(constructItem.ox + dx + adjustDx),
          y: snap(constructItem.oy + dy + adjustDy),
          indicators: nextIndicators,
        }
      }))
    }
    if (!dragRef.current) setDragGuideLines([])
    if (dragPathRef.current) {
      const tx = (e.clientX - dragPathRef.current.sx) / scale + dragPathRef.current.targetX
      const ty = (e.clientY - dragPathRef.current.sy) / scale + dragPathRef.current.targetY
      setActivePathDrag({ id: dragPathRef.current.id, tx, ty })
    }

    if (dragHandleRef.current) {
      const { id, type, index, sx, sy, startVal } = dragHandleRef.current
      const dx = (e.clientX - sx) / scale
      const dy = (e.clientY - sy) / scale

      if (type === 'curvature') {
        const nextCurvature = startVal + dy // Drag up/down to adjust curvature
        setPaths(prev => prev.map(p => p.id === id ? { ...p, curvature: nextCurvature } : p))
      } else if (type === 'joint' && index !== undefined) {
        const nextX = snap(startVal.x + dx)
        const nextY = snap(startVal.y + dy)
        setPaths(prev => prev.map(p => {
          if (p.id !== id || !p.joints) return p
          const nextJoints = [...p.joints]
          nextJoints[index] = { x: nextX, y: nextY }
          return { ...p, joints: nextJoints }
        }))
      }
    }
  }

  const onSvgMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    setDragGuideLines([])
    if (isPanning) {
      setIsPanning(false)
      panStartRef.current = null
      return
    }

    if (isDrawing && drawStart && drawCurrent) {
      const radius = Math.max(20, Math.sqrt(Math.pow(drawCurrent.x - drawStart.x, 2) + Math.pow(drawCurrent.y - drawStart.y, 2)))
      setNewConstructPos({ x: drawStart.x, y: drawStart.y })
      setPendingVars([])
      setNewConstructName(`VAR_${constructs.length + 1}`)
      setNewConstructColor(SWATCH_COLORS[0])
      setShowNewConstructModal(true)
      setIsDrawing(false); setDrawStart(null); setDrawCurrent(null)
      return
    }

    // Process Marquee Selection
    if (marquee?.active) {
      const x = Math.min(marquee.startX, marquee.endX)
      const y = Math.min(marquee.startY, marquee.endY)
      const w = Math.abs(marquee.endX - marquee.startX)
      const h = Math.abs(marquee.endY - marquee.startY)

      const selectedIds: string[] = []
      constructs.forEach(c => {
        if (c.x > x && c.x < x + w && c.y > y && c.y < y + h) {
          selectedIds.push(c.id)
        }
      })
      
      setSelected(selectedIds)
      setMarquee(null)
      return
    }

    if (groupResizing) {
      commit(constructs, paths)
      setGroupResizing(null)
      return
    }

    if (resizing) {
      commit(constructs, paths)
      setResizing(null)
    }
    if (dragRef.current) { commit(constructs, paths); dragRef.current = null }
    if (isConnecting && connectStart && connectEnd) {
      const over = constructs.find(c => isPointInConstruct(c, connectEnd.x, connectEnd.y, 10))
      if (over && over.id !== connectStart) {
        createDirectPath(connectStart, over.id, e.shiftKey ? 'measurement' : undefined)
      } else {
        const targetPath = findDirectPathAtPoint(connectEnd.x, connectEnd.y, connectStart)
        if (targetPath) {
          const moderationExists = paths.some(
            (p) => p.kind === 'moderation' && p.from === connectStart && p.targetPathId === targetPath.id,
          )
          if (!moderationExists) {
            const id = `p-${Date.now()}`
            const moderationPath: Path = {
              id,
              from: connectStart,
              to: targetPath.to,
              kind: 'moderation',
              targetPathId: targetPath.id,
            }
            const newP = [...paths, moderationPath]
            setPaths(newP)
            commit(constructs, newP)
            setSelectedPaths([id])
            setSelected([])
          }
        }
      }
      setIsConnecting(false)
      setConnectStart(null)
      setConnectEnd(null)
      return
    }

    if (dragPathRef.current && activePathDrag) {
      const over = constructs.find(c => isPointInConstruct(c, activePathDrag.tx, activePathDrag.ty, 10))
      if (over && over.id !== paths.find(p => p.id === activePathDrag.id)?.from) {
        const newP = paths.map(p => {
          if (p.id === activePathDrag.id) return { ...p, to: over.id }
          if (p.kind === 'moderation' && p.targetPathId === activePathDrag.id) return { ...p, to: over.id }
          return p
        })
        setPaths(newP); commit(constructs, newP)
      }
      dragPathRef.current = null
      setActivePathDrag(null)
    }

    if (dragHandleRef.current) {
      commit(constructs, paths)
      dragHandleRef.current = null
    }
  }

  const handleCreateConstruct = () => {
    if (!newConstructName.trim()) return
    const id = `c-${Date.now()}`
    const radius = DEFAULT_CONSTRUCT_RADIUS
    const newC: Construct = {
      id, name: newConstructName, type: newConstructType, color: newConstructColor,
      x: newConstructPos.x, y: newConstructPos.y, radius, 
      indicators: pendingVars.map(v => ({ name: v, loading: null })),
      labelColor: 'var(--color-text-primary)', labelBold: true, labelItalic: false, labelSize: 13,
      shape: 'circle',
      isHigherOrder: newConstructIsHigherOrder,
    }
    const updated = [...constructs, newC]
    setConstructs(updated)
    commit(updated, paths)
    resetNewConstructModal()
    setSelected([id])
  }

  const handleDropToCanvas = (e: React.DragEvent) => {
    e.preventDefault()
    const varsJson = e.dataTransfer.getData('variables')
    if (!varsJson) return
    const draggedVars = JSON.parse(varsJson) as string[]
    
    // FIX: Grab bounding rect from the un-transformed wrapper
    const rect = canvasRef.current!.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left - panX) / (zoom / 100)
    const mouseY = (e.clientY - rect.top - panY) / (zoom / 100)

    // Check if dropped on existing construct
    const target = constructs.find(c => isPointInConstruct(c, mouseX, mouseY))

    if (target) {
      // Add to existing
      const existingNames = target.indicators.map(i => i.name)
      const newItems = draggedVars
        .filter(v => !existingNames.includes(v))
        .map(v => ({ name: v, loading: null, ox: 0, oy: 0 }))
      const updated = constructs.map(c => c.id === target.id 
        ? {
            ...c,
            type: 'Reflective' as const,
            indicators: [...c.indicators, ...newItems].map((indicator) => ({ ...indicator, ox: 0, oy: 0 })),
          }
        : c
      )
      setConstructs(updated)
      commit(updated, paths)
    } else {
      // Create new
      setNewConstructPos({ x: mouseX, y: mouseY })
      setPendingVars(draggedVars)
      setNewConstructName(draggedVars.length === 1 ? draggedVars[0] : `VAR_${constructs.length + 1}`)
      setNewConstructColor(SWATCH_COLORS[0])
      setNewConstructType('Reflective')
      setNewConstructIsHigherOrder(false)
      setHoveredNewConstructColor(null)
      setShowNewConstructModal(true)
    }
  }

  const onResizeHandleMouseDown = (e: React.MouseEvent, id: string, handle: ResizeHandle) => {
    e.stopPropagation()
    const c = constructs.find(x => x.id === id)!
    const { width, height } = getConstructDimensions(c)
    setResizing({
      id,
      handle,
      centerX: c.x,
      centerY: c.y,
      startRadius: c.radius,
      startWidth: width,
      startHeight: height,
      startShape: normalizeConstructShape(c.shape),
    })
  }

  const onPathHandleMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const p = paths.find(x => x.id === id)
    if (!p || p.kind === 'moderation') return
    const t = constructs.find(c => c.id === p.to)
    if (!t) return
    dragPathRef.current = { id, sx: e.clientX, sy: e.clientY, targetX: t.x, targetY: t.y }
  }

  const onCurvatureHandleMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const p = paths.find(x => x.id === id)
    if (!p) return
    dragHandleRef.current = { id, type: 'curvature', sx: e.clientX, sy: e.clientY, startVal: p.curvature || 40 }
  }

  const onJointHandleMouseDown = (e: React.MouseEvent, id: string, index: number) => {
    e.stopPropagation()
    const p = paths.find(x => x.id === id)
    if (!p || !p.joints) return
    dragHandleRef.current = { id, type: 'joint', index, sx: e.clientX, sy: e.clientY, startVal: { ...p.joints[index] } }
  }

  const findDirectPathAtPoint = useCallback((x: number, y: number, excludeFromId?: string): Path | null => {
    const HIT_THRESHOLD = 10
    let closestPath: Path | null = null
    let closestDistance = Number.POSITIVE_INFINITY

    paths.forEach((path) => {
      if (path.kind === 'moderation') return
      if (excludeFromId && path.from === excludeFromId) return

      const fromConstruct = constructs.find((construct) => construct.id === path.from)
      const toConstruct = constructs.find((construct) => construct.id === path.to)
      if (!fromConstruct || !toConstruct) return

      const distance = linePointDistance(x, y, fromConstruct.x, fromConstruct.y, toConstruct.x, toConstruct.y)
      if (distance > HIT_THRESHOLD) return
      if (distance < closestDistance) {
        closestDistance = distance
        closestPath = path
      }
    })

    return closestPath
  }, [paths, constructs])

  const getModerationAnchor = useCallback((path: Path): { x: number; y: number } | null => {
    const targetId = path.targetPathId
    if (targetId) {
      const targetPath = paths.find((candidate) => candidate.id === targetId && candidate.kind !== 'moderation')
      if (targetPath) {
        const fromConstruct = constructs.find((construct) => construct.id === targetPath.from)
        const toConstruct = constructs.find((construct) => construct.id === targetPath.to)
        if (fromConstruct && toConstruct) {
          return {
            x: (fromConstruct.x + toConstruct.x) / 2,
            y: (fromConstruct.y + toConstruct.y) / 2,
          }
        }
      }
    }

    const fallback = constructs.find((construct) => construct.id === path.to)
    return fallback ? { x: fallback.x, y: fallback.y } : null
  }, [paths, constructs])

  // ── Right panel state ─────────────────────────────────────────────────────────
  const [rightTab, setRightTab] = useState<'Properties' | 'Tools'>('Properties')
  const [modelSwitcherOpen, setModelSwitcherOpen] = useState(false)

  // ── Colour picker refs ────────────────────────────────────────────────────────
  const canvasBgRef   = useRef<HTMLInputElement>(null)
  const shapeFillRef  = useRef<HTMLInputElement>(null)
  const textColorRef  = useRef<HTMLInputElement>(null)

  // ── Filtered variables ────────────────────────────────────────────────────────
  const filteredVars = dynamicVars.filter((v: any) => v.name.toLowerCase().includes(varSearch.toLowerCase()))

  const multiSelectionBounds = selected.length > 1 ? getSelectionBounds(constructs, selected, 12) : null
  const hasUnifiedSelectionBounds = !!multiSelectionBounds

  // ── Floating Bar placement calculation ────────────────────────────────────────
  const getFloatingBarPos = () => {
    if (activeSelectedConstructs.length < 2) return null
    const minX = Math.min(...activeSelectedConstructs.map(c => c.x))
    const maxX = Math.max(...activeSelectedConstructs.map(c => c.x))
    const topY = Math.min(...activeSelectedConstructs.map(c => c.y - getConstructRadii(c).ry))
    
    // Convert to screen space
    const screenX = ((minX + maxX) / 2) * (zoom / 100) + panX
    let screenY = topY * (zoom / 100) + panY - 60
    if (screenY < 10) screenY = 10 // clamp so it doesn't go off-screen at top
    
    return { x: screenX, y: screenY }
  }

  const floatingBarPos = getFloatingBarPos()
  const floatingPanelTop = 16
  const floatingPanelBottom = 52
  const currentCanvasTab = canvasTabs.find((tab) => tab.modelId === modelId) ?? canvasTabs[0]
  const currentModelSwitcherLabel = currentCanvasTab
    ? `${stripModelDisplayName(String(currentCanvasTab.model?.name || currentCanvasTab.modelId).replace(/\.(hbe|ada|metisws)$/i, ''))}${dirtyModels[currentCanvasTab.modelId] ? '*' : ''}`
    : stripModelDisplayName(currentModel?.name ?? 'Untitled model')
  const currentWorkspaceSwitcherLabel = currentCanvasTab
    ? stripWorkspaceDisplayName(currentCanvasTab.workspace?.name || '')
    : stripWorkspaceDisplayName(activeWs?.name || '')

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: C.page, overflow: 'hidden' }}>
      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative', backgroundColor: C.page }}>

        {/* ── Left Panel — Variables ──────────────────────────────────────────── */}
        {showLeftSidebar && (leftPanelCollapsed ? (
          <div
            id="collapsed-dataset-card"
            tabIndex={0}
            aria-label="Expand indicator panel"
            onClick={() => setLeftPanelCollapsed(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setLeftPanelCollapsed(false)
              }
            }}
            style={{
              width: Math.min(Math.max(leftSidebarWidth, 280), 360),
              position: 'absolute',
              left: 16,
              top: floatingPanelTop,
              zIndex: 36,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minHeight: 72,
              padding: '10px 12px',
              backgroundColor: C.panel,
              border: `1px solid ${C.floatingBorder}`,
              borderRadius: 12,
              boxShadow: C.floatingPanelShadow,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {linkedDataset ? (
              <>
                <Database size={20} color={C.secondary} weight="fill" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 12, color: C.text, fontFamily: 'DM Sans, sans-serif', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {linkedDataset.name}
                  </span>
                  <span style={{ fontSize: 10, color: C.textMuted, fontFamily: 'DM Sans, sans-serif' }}>
                    Click to show indicators
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={async (event) => {
                      event.stopPropagation()
                      await persistCanvasSnapshot(constructs, paths)
                      navigate(`/dataview/${activeWs?.id}/${linkedDataset.id}`, {
                        state: {
                          source: 'model-canvas' as const,
                          modelId: modelId || '',
                          returnTo: `/canvas/${modelId}`,
                        },
                      })
                    }}
                    title="Open dataset"
                    aria-label="Open dataset"
                    style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSec, background: C.floatingIconBg, border: `1px solid ${C.borderFaint}`, borderRadius: 8, cursor: 'pointer', padding: 0 }}
                  >
                    <CornersOut size={14} weight="bold" />
                  </button>
                  <button
                    onClick={async (event) => {
                      event.stopPropagation()
                      await persistCanvasSnapshot(constructs, paths)
                      setShowDatasetManager(true)
                    }}
                    title="Change dataset"
                    aria-label="Change dataset"
                    style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, background: C.floatingIconBg, border: `1px solid ${C.borderFaint}`, borderRadius: 8, cursor: 'pointer', padding: 0 }}
                  >
                    <Shuffle size={14} weight="bold" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <WarningCircle size={20} color={C.textMuted} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 12, color: C.text, fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>
                    No dataset linked
                  </span>
                  <span style={{ fontSize: 10, color: C.textMuted, fontFamily: 'DM Sans, sans-serif' }}>
                    Click to add or choose a dataset
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{
            width: leftSidebarWidth,
            position: 'absolute',
            left: 16,
            top: floatingPanelTop,
            bottom: floatingPanelBottom,
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: C.panel,
            border: 'none',
            borderRadius: 12,
            boxShadow: C.floatingPanelShadow,
            overflow: 'hidden',
          }}>
          
          {/* Resize handle */}
          <div 
            onMouseDown={() => { isResizingLeft.current = true; document.body.style.cursor = 'col-resize' }}
            style={{ 
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, 
              cursor: 'col-resize', zIndex: 10, backgroundColor: 'transparent' 
            }}
          />

          {/* Dataset header — Conditional rendering based on dataset presence */}
          {!linkedDataset ? (
            <div
              onClick={() => setLeftPanelCollapsed(true)}
              style={{ padding: '10px 12px', margin: '16px 8px 8px', borderRadius: 8, backgroundColor: C.chrome, border: '1px dashed rgb(var(--color-accent-rgb) / 0.36)', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <WarningCircle size={18} color={C.textMuted} />
                <span style={{ fontSize: 11, color: C.textSec, fontFamily: 'DM Sans, sans-serif' }}>No dataset linked</span>
              </div>
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  window.dispatchEvent(new CustomEvent('pls:use-sample-dataset'))
                }}
                style={{
                  width: '100%',
                  padding: '6px',
                  borderRadius: 6,
                  backgroundColor: 'rgb(var(--color-accent-rgb) / 0.04)',
                  border: '1px solid rgb(var(--color-accent-rgb) / 0.12)',
                  color: C.textSec,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontFamily: 'DM Sans, sans-serif',
                  opacity: 0.82,
                }}
              >
                <ArrowCounterClockwise size={12} weight="bold" />
                USE SAMPLE DATASET
              </button>
              <button 
                onClick={async (event) => {
                  event.stopPropagation()
                  await persistCanvasSnapshot(constructs, paths)
                  window.dispatchEvent(new CustomEvent('pls:open-import-picker', {
                    detail: {
                      source: 'model-canvas',
                      modelId: modelId || '',
                      saveMode: 'save-as-new',
                    },
                  }))
                }}
                style={{ 
                  width: '100%',
                  padding: '6px',
                  borderRadius: 6,
                  backgroundColor: 'rgb(var(--color-accent-rgb) / 0.14)',
                  border: '1px solid rgb(var(--color-accent-rgb) / 0.26)',
                  color: C.text,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  boxShadow: 'inset 0 1px 0 var(--color-floating-highlight)'
                }}
              >
                <Database size={12} weight="fill" />
                ADD DATASET
              </button>
            </div>
          ) : (
            <>
              <div
                onClick={() => setLeftPanelCollapsed(true)}
                style={{ margin: '16px 8px 8px', padding: '10px 12px', borderRadius: 8, backgroundColor: C.chrome, border: '1px solid rgb(var(--color-accent-rgb) / 0.34)', position: 'relative', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Database size={18} color={C.secondary} weight="fill" />
                <div
                  onMouseEnter={() => setIsDatasetInfoHovered(true)}
                  onMouseLeave={() => setIsDatasetInfoHovered(false)}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <span style={{ fontSize: 11, color: C.textSec, fontFamily: 'DM Sans, sans-serif', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {linkedDataset.name}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={async (event) => {
                      event.stopPropagation()
                      await persistCanvasSnapshot(constructs, paths)
                      navigate(`/dataview/${activeWs?.id}/${linkedDataset.id}`, {
                        state: {
                          source: 'model-canvas' as const,
                          modelId: modelId || '',
                          returnTo: `/canvas/${modelId}`,
                        },
                      })
                    }}
                    title="Open dataset"
                    aria-label="Open dataset"
                    style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSec, background: C.floatingIconBg, border: `1px solid ${C.borderFaint}`, borderRadius: 6, cursor: 'pointer', padding: 0 }}
                  >
                    <CornersOut size={12} weight="bold" />
                  </button>
                  <button 
                    id="tour-change-dataset"
                    onClick={async (event) => {
                      event.stopPropagation()
                      await persistCanvasSnapshot(constructs, paths)
                      setShowDatasetManager(true)
                    }}
                    title="Change dataset"
                    aria-label="Change dataset"
                    style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, background: C.floatingIconBg, border: `1px solid ${C.borderFaint}`, borderRadius: 6, cursor: 'pointer', padding: 0 }}
                  >
                    <Shuffle size={12} weight="bold" />
                  </button>
                </div>
              </div>
              {isDatasetInfoHovered && linkedDataset.meta && (
                <div
                  style={{
                    position: 'absolute',
                    left: 72,
                    right: 12,
                    top: 'calc(100% + 6px)',
                    padding: '8px 10px',
                    borderRadius: 8,
                    backgroundColor: C.panelControl,
                    border: `1px solid ${C.borderFaint}`,
                    boxShadow: C.floatingTooltipShadow,
                    zIndex: 12,
                  }}
                >
                  <span style={{ fontSize: 10, color: C.textDim, fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5, display: 'block' }}>
                    {linkedDataset.meta}
                  </span>
                </div>
              )}
              </div>
            </>
          )}

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', backgroundColor: 'transparent' }}>
            <div
              style={{
                flex: 1,
                backgroundColor: C.panelControl,
                borderRadius: 8,
                height: 30,
                padding: '0 9px',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                border: `1px solid ${C.borderFaint}`,
                boxShadow: 'inset 0 1px 0 var(--color-floating-highlight-soft)',
              }}
            >
              <MagnifyingGlass size={14} color={C.textSec} />
              <input
                id="tour-search-variables"
                value={varSearch}
                onChange={e => setVarSearch(e.target.value)}
                placeholder="Search indicators..."
                style={{ background: 'none', border: 'none', outline: 'none', color: C.textSec, fontSize: 11, fontFamily: 'DM Sans, sans-serif', width: '100%' }}
              />
            </div>
          </div>

          {/* Variable list — Reduced padding from search for better density */}
          <div id="tour-variable-list" className="canvas-floating-panel-scroll" style={{ flex: 1, overflowY: 'auto', padding: '6px 0 4px', userSelect: 'none' }}>
            {!linkedDataset ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.6, fontFamily: 'DM Sans, sans-serif' }}>
                  Add a dataset to see <br/> indicators here.
                </p>
              </div>
            ) : filteredVars.length === 0 ? (
               <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: C.textMuted, fontFamily: 'DM Sans, sans-serif' }}>No variables found</p>
              </div>
            ) : filteredVars.map((v: any) => {
              const isVarSel = selectedVars.includes(v.name)
              const isMetric = v.type === 'MET'
              return (
                <div
                  key={v.name}
                  draggable={isMetric}
                  onDragStart={(e) => {
                    if (!isMetric) {
                      e.preventDefault()
                      return
                    }
                    const toDrag = selectedVars.includes(v.name) ? selectedVars : [v.name]
                    e.dataTransfer.setData('variables', JSON.stringify(toDrag))
                  }}
                  onClick={(e) => { if (isMetric) handleVarClick(e, v.name) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 20px',
                    backgroundColor: isVarSel ? 'rgb(var(--color-accent-rgb) / 0.14)' : 'transparent',
                    cursor: isMetric ? 'grab' : 'not-allowed',
                    opacity: isMetric ? 1 : 0.55,
                  }}
                >
                  <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: v.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: isMetric ? C.textMuted : C.textDim, fontFamily: 'DM Sans, sans-serif', minWidth: 12 }}>{v.idx}</span>
                  <span style={{ fontSize: 12, color: isMetric ? (isVarSel ? C.text : C.textSec) : C.textMuted, fontFamily: 'DM Sans, sans-serif', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                  <span style={{ fontSize: 10, color: isMetric ? C.textMuted : C.textDim, fontFamily: 'DM Sans, sans-serif' }}>{v.type}</span>
                </div>
              )
            })}
          </div>
        </div>
        ))}

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Infinite Grid Background & Interaction Container */}
        <div 
          ref={canvasRef}
          style={{ 
            flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: canvasBg,
            cursor: isPanning ? 'grabbing' : isSpaceDown ? 'grab' : 'default'
          }}
        >
          {showGrid && (
            <div 
              style={{ 
                position: 'absolute', inset: -5000, 
                backgroundImage: 'radial-gradient(var(--color-border) 1px, transparent 1px)', 
                backgroundSize: `${20 * (zoom/100)}px ${20 * (zoom/100)}px`,
                backgroundPosition: `${panX}px ${panY}px`,
                pointerEvents: 'none',
                opacity: 0.4
              }} 
            />
          )}

          {showZoomControl && (
            <div
              id="canvas-zoom-control"
              style={{
                position: 'absolute',
                bottom: 52,
                right: showRightSidebar ? (rightPanelCollapsed ? 84 : 300) : 20,
                zIndex: 42,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                height: 36,
                padding: '4px 5px',
                borderRadius: 10,
                backgroundColor: C.panel,
                border: `1px solid ${C.floatingBorder}`,
                boxShadow: C.floatingMenuShadow,
              }}
            >
              <SmallBtn onClick={() => setZoom(z => Math.max(30, z - 10))}>
                <MinusCircle size={16} color={C.textMuted} />
              </SmallBtn>
              <div style={{ width: 50, height: 28, borderRadius: 7, backgroundColor: C.panelControl, border: `1px solid ${C.borderFaint}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.textSec, fontFamily: 'DM Sans, sans-serif' }}>{Math.round(zoom)}%</span>
              </div>
              <SmallBtn onClick={() => setZoom(z => Math.min(200, z + 10))}>
                <PlusCircleAlt size={16} color={C.textMuted} />
              </SmallBtn>
            </div>
          )}

          {/* SVG canvas */}
          <svg
            id="main-canvas-svg"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropToCanvas}
            onContextMenu={(e) => {
              e.preventDefault()
              setCanvasContextMenu({ x: e.clientX, y: e.clientY })
            }}
            style={{ 
              position: 'absolute', inset: 0, transformOrigin: '0 0', 
              transform: `translate(${panX}px, ${panY}px) scale(${zoom / 100})`, 
              cursor: isPanning ? 'grabbing' : isSpaceDown ? 'grab' : activeTool === 'construct' ? 'crosshair' : activeTool === 'delete' ? 'not-allowed' : 'default' 
            }}
            width="10000" height="10000"
            onMouseDown={onSvgMouseDown}
            onMouseMove={onSvgMouseMove}
            onMouseUp={onSvgMouseUp}
            onMouseLeave={onSvgMouseUp}
          >
            <defs>
              <marker id="arr" markerWidth="7" markerHeight="5" refX="6.3" refY="2.5" orient="auto">
                <polygon points="0 0,7 2.5,0 5" fill="var(--color-border)" />
              </marker>
              <marker id="arr-sel" markerWidth="7" markerHeight="5" refX="6.3" refY="2.5" orient="auto">
                <polygon points="0 0,7 2.5,0 5" fill="var(--color-accent)" />
              </marker>
              <marker id="arr-mod" markerWidth="7" markerHeight="5" refX="6.3" refY="2.5" orient="auto">
                <polygon points="0 0,7 2.5,0 5" fill="var(--color-text-muted)" />
              </marker>
              {constructs.map((construct) => (
                <marker key={construct.id} id={indicatorArrowMarkerId(construct.id)} markerWidth="7" markerHeight="5" refX="6.3" refY="2.5" orient="auto">
                  <polygon points="0 0,7 2.5,0 5" fill={construct.color} />
                </marker>
              ))}
            </defs>

            {/* MARQUEE RENDERING INSIDE SVG */}
            {marquee?.active && (
              <rect
                x={Math.min(marquee.startX, marquee.endX)}
                y={Math.min(marquee.startY, marquee.endY)}
                width={Math.abs(marquee.endX - marquee.startX)}
                height={Math.abs(marquee.endY - marquee.startY)}
                fill="rgb(var(--color-accent-rgb) / 0.14)"
                stroke="var(--color-accent)"
                strokeDasharray="4 2"
                strokeWidth={1.5 / (zoom / 100)}
                pointerEvents="none"
              />
            )}

            {/* Paths */}
            {paths.map(p => {
              const f = constructs.find(c => c.id === p.from)
              if (!f) return null
              const isModeration = p.kind === 'moderation'
              const anchor = isModeration ? getModerationAnchor(p) : null
              const t = isModeration ? null : constructs.find(c => c.id === p.to)
              if (!anchor && !t) return null

              const isPathSel = selectedPaths.includes(p.id)
              const d = isModeration
                ? `M${f.x},${f.y} L${anchor!.x},${anchor!.y}`
                : arrowPath(f, t!, p)

              return (
                <g key={p.id} onContextMenu={(e) => handlePathContextMenu(e, p.id)}>
                  {/* Invisible hit-box */}
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={20}
                    style={{ cursor: activeTool === 'delete' ? 'crosshair' : 'pointer' }}
                    onClick={(e) => handlePathClick(e, p.id)}
                  />
                  {/* Visual path */}
                  <path
                    d={!isModeration && activePathDrag?.id === p.id 
                      ? `M${f.x},${f.y} L${activePathDrag.tx},${activePathDrag.ty}` 
                      : d}
                    fill="none"
                    stroke={isPathSel ? C.secondary : (isModeration ? 'var(--color-text-muted)' : 'var(--color-border)')}
                    strokeWidth={isPathSel ? SELECTED_PATH_STROKE_WIDTH : STRUCTURAL_PATH_STROKE_WIDTH}
                    strokeDasharray={isModeration ? '4,4' : undefined}
                    markerEnd={isPathSel ? 'url(#arr-sel)' : (isModeration ? 'url(#arr-mod)' : 'url(#arr)')}
                    style={{ pointerEvents: 'none' }}
                  />

                  {isModeration && anchor && (
                    <circle cx={anchor.x} cy={anchor.y} r={4} fill={isPathSel ? C.secondary : 'var(--color-text-muted)'} style={{ pointerEvents: 'none' }} />
                  )}

                  {/* Reconfiguration handle */}
                  {!isModeration && isPathSel && t && (() => {
                    const dx = t.x - f.x, dy = t.y - f.y
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1
                    const sx = f.x + (dx/dist) * f.radius
                    const sy = f.y + (dy/dist) * f.radius
                    const ex = t.x - (dx/dist) * t.radius
                    const ey = t.y - (dy/dist) * t.radius

                    return (
                      <>
                        <circle
                          cx={activePathDrag?.id === p.id ? activePathDrag.tx : ex}
                          cy={activePathDrag?.id === p.id ? activePathDrag.ty : ey}
                          r={6}
                          fill={C.secondary}
                          onMouseDown={(e) => onPathHandleMouseDown(e, p.id)}
                          style={{ cursor: 'move' }}
                        />
                        {p.style === 'curved' && (
                          <circle
                            cx={(sx + ex) / 2 - (dy / dist) * (p.curvature || 40)}
                            cy={(sy + ey) / 2 + (dx / dist) * (p.curvature || 40)}
                            r={5}
                            fill="var(--color-accent)"
                            stroke="#111827"
                            strokeWidth={1.5}
                            onMouseDown={(e) => onCurvatureHandleMouseDown(e, p.id)}
                            style={{ cursor: 'ns-resize' }}
                          />
                        )}
                        {p.style === 'rightangle' && (p.joints || []).map((j, i) => (
                          <circle
                            key={i}
                            cx={j.x} cy={j.y}
                            r={5}
                            fill="var(--color-accent)"
                            stroke="#111827"
                            strokeWidth={1.5}
                            onMouseDown={(e) => onJointHandleMouseDown(e, p.id, i)}
                            style={{ cursor: 'move' }}
                          />
                        ))}
                      </>
                    )
                  })()}
                </g>
              )
            })}

            {/* Connection Preview */}
            {isConnecting && connectStart && connectEnd && (() => {
              const start = constructs.find(c => c.id === connectStart)!
              return (
                <line 
                  x1={start.x} y1={start.y} 
                  x2={connectEnd.x} y2={connectEnd.y} 
                  stroke={C.secondary} strokeWidth={2} strokeDasharray="5,5"
                />
              )
            })()}

            {/* Drawing Preview */}
            {isDrawing && drawStart && drawCurrent && (
              <circle 
                cx={drawStart.x} cy={drawStart.y} 
                r={Math.sqrt(Math.pow(drawCurrent.x - drawStart.x, 2) + Math.pow(drawCurrent.y - drawStart.y, 2))} 
                fill="none" stroke={C.secondary} strokeWidth={2} strokeDasharray="5,5"
              />
            )}

            {dragGuideLines.map((line, idx) => (
              <g key={`guide-${idx}`}>
                <line
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke={C.amber}
                  strokeWidth={1.5}
                  strokeDasharray="6,4"
                  opacity={0.28}
                />
              </g>
            ))}

            {multiSelectionBounds && (
              <g>
                <rect
                  x={multiSelectionBounds.minX}
                  y={multiSelectionBounds.minY}
                  width={multiSelectionBounds.width}
                  height={multiSelectionBounds.height}
                  fill="transparent"
                  pointerEvents="all"
                  onMouseDown={(e) => beginSelectionDrag(e, selected)}
                  style={{ cursor: 'move' }}
                />
                <rect
                  x={multiSelectionBounds.minX}
                  y={multiSelectionBounds.minY}
                  width={multiSelectionBounds.width}
                  height={multiSelectionBounds.height}
                  fill="none"
                  stroke={C.secondary}
                  strokeOpacity={0.5}
                  strokeWidth={1 / (zoom / 100)}
                  pointerEvents="none"
                />
              </g>
            )}

            {constructs.map(c => {
              const showConstructBounds = selected.includes(c.id) && !hasUnifiedSelectionBounds
              const constructRadii = getConstructRadii(c)
              const isOval = normalizeConstructShape(c.shape) === 'oval'
              const resFontSize = Math.max(9, Math.min(constructRadii.rx, constructRadii.ry) * 0.36)
              const constructLabelColor = !c.labelColor || c.labelColor === '#FFFFFF'
                ? 'var(--color-text-primary)'
                : c.labelColor
              const showConnectedConstructHighlight = highlightedConstructId === c.id
              const indicatorMarkerEnd = `url(#${indicatorArrowMarkerId(c.id)})`

              return (
                <g key={c.id}>
                  {/* Indicators and Auto-Paths */}
                  {!c.folded && c.indicators.map((ind, i) => {
                    const { ix, iy, labelW, labelH, dir } = getIndicatorLayout(c, ind, i)
                    const indId = `${c.id}:${ind.name}`
                    const showIndicatorSelection = selected.includes(indId) && !hasUnifiedSelectionBounds
                    const p = indicatorPath(c, ix, iy, labelW, labelH, c.type, dir)
                    const liveVal = realtimeEnabled ? liveLoadings[`${c.name}::${ind.name}`] : undefined
                    const hasLive = typeof liveVal === 'number' && Number.isFinite(liveVal)
                    let pathSegments: { seg1: string; seg2: string; midX: number; midY: number } | null = null
                    if (hasLive) {
                      const m = p.match(/M([\d.\-]+),([\d.\-]+)\s+L([\d.\-]+),([\d.\-]+)/)
                      if (m) {
                        const x1 = Number(m[1]), y1 = Number(m[2]), x2 = Number(m[3]), y2 = Number(m[4])
                        const dx = x2 - x1, dy = y2 - y1
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1
                        const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2
                        const GAP = 22
                        const gx = (dx / dist) * (GAP / 2), gy = (dy / dist) * (GAP / 2)
                        pathSegments = {
                          seg1: `M${x1},${y1} L${midX - gx},${midY - gy}`,
                          seg2: `M${midX + gx},${midY + gy} L${x2},${y2}`,
                          midX,
                          midY,
                        }
                      }
                    }

                    return (
                      <g
                        key={ind.name}
                        onMouseDown={(e) => onIndicatorMouseDown(e, c.id, ind.name)}
                        style={{ cursor: hasUnifiedSelectionBounds && selected.includes(indId) ? 'default' : undefined }}
                      >
                        {hasLive && pathSegments ? (
                          <>
                            <path d={pathSegments.seg1} fill="none" stroke={c.color} strokeWidth={INDICATOR_PATH_STROKE_WIDTH} opacity={0.5} />
                            <rect x={pathSegments.midX - 17} y={pathSegments.midY - 8} width={34} height={14} rx={3} fill={C.surface} stroke={C.borderFaint} strokeWidth={0.5} />
                            <text
                              x={pathSegments.midX} y={pathSegments.midY + 1}
                              textAnchor="middle" dominantBaseline="middle"
                              fontSize={8} fill={loadColor(liveVal as number)} fontFamily="DM Sans, sans-serif" fontWeight={600}
                              style={{ pointerEvents: 'none' }}
                            >
                              {(liveVal as number).toFixed(3)}
                            </text>
                            <path d={pathSegments.seg2} fill="none" stroke={c.color} strokeWidth={INDICATOR_PATH_STROKE_WIDTH} markerEnd={indicatorMarkerEnd} opacity={0.5} />
                          </>
                        ) : (
                          <path d={p} fill="none" stroke={c.color} strokeWidth={INDICATOR_PATH_STROKE_WIDTH} markerEnd={indicatorMarkerEnd} opacity={0.5} />
                        )}

                        {/* Frame */}
                        <rect
                          x={ix - labelW/2} y={iy - labelH/2} width={labelW} height={labelH} rx={4}
                          fill={C.surface} stroke={showIndicatorSelection ? C.secondary : C.border} strokeWidth={showIndicatorSelection ? 2 : 1}
                        />
                        <text
                          x={ix} y={iy} dy="0.35em" textAnchor="middle"
                          style={{ fontSize: 11, fill: C.text, fontFamily: 'DM Sans, sans-serif', pointerEvents: 'none' }}
                        >
                          {ind.name}
                        </text>
                      </g>
                    )
                  })}

                  <g 
                    transform={`translate(${c.x},${c.y})`} 
                    onMouseDown={e => onConstructMouseDown(e, c.id)} 
                    onContextMenu={e => handleConstructContextMenu(e, c.id)}
                    style={{ cursor: hasUnifiedSelectionBounds && selected.includes(c.id) ? 'default' : 'grab' }}
                  >
                    {showConnectedConstructHighlight && (isOval ? (
                      <ellipse
                        rx={constructRadii.rx + 9}
                        ry={constructRadii.ry + 9}
                        fill="rgb(var(--color-accent-rgb) / 0.18)"
                        stroke="var(--color-accent)"
                        strokeWidth={2}
                        strokeDasharray="7 4"
                        style={{ pointerEvents: 'none' }}
                      />
                    ) : (
                      <circle
                        r={constructRadii.rx + 9}
                        fill="rgb(var(--color-accent-rgb) / 0.18)"
                        stroke="var(--color-accent)"
                        strokeWidth={2}
                        strokeDasharray="7 4"
                        style={{ pointerEvents: 'none' }}
                      />
                    ))}
                    {/* Shape */}
                    {isOval ? (
                      <ellipse rx={constructRadii.rx} ry={constructRadii.ry} fill={c.color} stroke="none" />
                    ) : (
                      <circle r={c.radius} fill={c.color} stroke="none" />
                    )}
                    
                    {/* Label */}
                    {realtimeEnabled && typeof liveLoadings[`r2::${c.name}`] === 'number' ? (
                      <>
                        <text textAnchor="middle" y={-4} fontSize={resFontSize} fill={constructLabelColor} fontFamily="DM Sans, sans-serif" fontWeight={c.labelBold ? 700 : 400} fontStyle={c.labelItalic ? 'italic' : 'normal'} style={{ pointerEvents: 'none' }}>
                          {c.name}
                        </text>
                        <text textAnchor="middle" y={resFontSize + 4} fontSize={Math.max(7, resFontSize - 3)} fill="#000000" fontFamily="DM Sans, sans-serif" style={{ pointerEvents: 'none' }}>
                          R²={(liveLoadings[`r2::${c.name}`] as number).toFixed(3)}
                        </text>
                      </>
                    ) : (
                      <text textAnchor="middle" dominantBaseline="central" fontSize={resFontSize} fill={constructLabelColor} fontFamily="DM Sans, sans-serif" fontWeight={c.labelBold ? 700 : 400} fontStyle={c.labelItalic ? 'italic' : 'normal'}>
                        {c.name}
                      </text>
                    )}

                    {/* Bounding Box */}
                    {showConstructBounds && (
                      <g transform={`translate(${-constructRadii.rx},${-constructRadii.ry})`}>
                        <rect width={constructRadii.rx * 2} height={constructRadii.ry * 2} fill="none" stroke="var(--color-text-primary)" strokeWidth={1} />
                        {(() => {
                          const cornerResizeHandles = [
                            { x: 0, y: 0, h: 'tl' as ResizeHandle },
                            { x: constructRadii.rx * 2, y: 0, h: 'tr' as ResizeHandle },
                            { x: 0, y: constructRadii.ry * 2, h: 'bl' as ResizeHandle },
                            { x: constructRadii.rx * 2, y: constructRadii.ry * 2, h: 'br' as ResizeHandle },
                          ]
                          const sideResizeHandles = isOval ? [
                            { x: 0, y: constructRadii.ry, h: 'left' as ResizeHandle },
                            { x: constructRadii.rx * 2, y: constructRadii.ry, h: 'right' as ResizeHandle },
                            { x: constructRadii.rx, y: 0, h: 'top' as ResizeHandle },
                            { x: constructRadii.rx, y: constructRadii.ry * 2, h: 'bottom' as ResizeHandle },
                          ] : []
                          return [...cornerResizeHandles, ...sideResizeHandles].map((h) => {
                            const isSideHandle = h.h === 'left' || h.h === 'right' || h.h === 'top' || h.h === 'bottom'
                            const cursor = h.h === 'left' || h.h === 'right'
                              ? 'ew-resize'
                              : h.h === 'top' || h.h === 'bottom'
                                ? 'ns-resize'
                                : (h.h === 'tl' || h.h === 'br') ? 'nwse-resize' : 'nesw-resize'
                            return (
                              <rect
                                key={h.h}
                                x={h.x - (isSideHandle ? 4 : 3)}
                                y={h.y - (isSideHandle ? 4 : 3)}
                                width={isSideHandle ? 8 : 6}
                                height={isSideHandle ? 8 : 6}
                                rx={isSideHandle ? 4 : 0}
                                fill={isSideHandle ? C.surface : 'var(--color-text-primary)'}
                                stroke={C.secondary}
                                strokeWidth={1}
                                onMouseDown={e => onResizeHandleMouseDown(e, c.id, h.h)}
                                style={{ cursor }}
                              />
                            )
                          })
                        })()}
                      </g>
                    )}
                  </g>
                </g>
              )
            })}

            {multiSelectionBounds && (
              <g>
                {[
                  { x: multiSelectionBounds.minX, y: multiSelectionBounds.minY, h: 'tl' as ResizeHandle },
                  { x: multiSelectionBounds.maxX, y: multiSelectionBounds.minY, h: 'tr' as ResizeHandle },
                  { x: multiSelectionBounds.minX, y: multiSelectionBounds.maxY, h: 'bl' as ResizeHandle },
                  { x: multiSelectionBounds.maxX, y: multiSelectionBounds.maxY, h: 'br' as ResizeHandle },
                ].map((handle) => {
                  const handleSize = 8 / (zoom / 100)
                  return (
                    <rect
                      key={handle.h}
                      x={handle.x - handleSize / 2}
                      y={handle.y - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      fill={C.surface}
                      stroke={C.secondary}
                      strokeWidth={1 / (zoom / 100)}
                      onMouseDown={(e) => beginGroupResize(e, handle.h)}
                      style={{ cursor: (handle.h === 'tl' || handle.h === 'br') ? 'nwse-resize' : 'nesw-resize' }}
                    />
                  )
                })}
              </g>
            )}
          </svg>

          {/* ── Floating Action Bar (Multi-selection Tools) ──────────────────── */}
          {floatingBarPos && (
            <div style={{
              position: 'absolute',
              left: floatingBarPos.x,
              top: floatingBarPos.y,
              transform: 'translateX(-50%)',
              backgroundColor: C.elevated,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              zIndex: 50
            }}>
              <FloatingBarBtn onClick={handleAlignHorizontalCenter} title="Align Horizontally" icon={<AlignCenterHorizontal size={18} weight="bold" color={C.textSec} />} />
              <FloatingBarBtn onClick={handleAlignVerticalCenter} title="Align Vertically" icon={<AlignCenterVertical size={18} weight="bold" color={C.textSec} />} />
              <div style={{ width: 1, height: 18, backgroundColor: C.border, margin: '0 4px' }} />
              <FloatingBarBtn onClick={handleDistributeHorizontally} title="Distribute Horizontally (Equal Gap)" icon={<ArrowsHorizontal size={18} weight="bold" color={C.textSec} />} />
              <FloatingBarBtn onClick={handleDistributeVertically} title="Distribute Vertically (Equal Gap)" icon={<ArrowsVertical size={18} weight="bold" color={C.textSec} />} />
              <div style={{ width: 1, height: 18, backgroundColor: C.border, margin: '0 4px' }} />
              <FloatingBarBtn onClick={handleAutoSizeSelected} title="Reset to Auto-Size" icon={<CornersOut size={18} weight="bold" color={C.textSec} />} />
            </div>
          )}

        </div>
        </div>

        {/* ── Canvas Context Menu ────────────────────────────────────────────── */}
        {canvasContextMenu && (
          <div
            style={{
              position: 'fixed',
              top: canvasContextMenu.y,
              left: canvasContextMenu.x,
              backgroundColor: C.panelPop,
              border: `1px solid ${C.floatingBorderSoft}`,
              borderRadius: 8,
              padding: '6px',
              boxShadow: C.floatingMenuShadow,
              zIndex: 4000,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 160
            }}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
          >
            <ContextMenuItem 
              label="Copy" 
              icon={<Copy size={16} />} 
              disabled={selected.length === 0} 
              onClick={() => { copySelected(); setCanvasContextMenu(null) }} 
            />
            <ContextMenuItem 
              label="Cut" 
              icon={<Scissors size={16} />} 
              disabled={selected.length === 0} 
              onClick={() => { cutSelected(); setCanvasContextMenu(null) }} 
            />
            <ContextMenuItem 
              label="Paste" 
              icon={<Clipboard size={16} />} 
              disabled={!clipboardRef.current || clipboardRef.current.length === 0} 
              onClick={() => { pasteClipboard(); setCanvasContextMenu(null) }} 
            />
            <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '4px 0' }} />
            <ContextMenuItem 
              label="Select All" 
              icon={<SquaresFour size={16} />} 
              disabled={constructs.length === 0 && paths.length === 0} 
              onClick={() => { selectAll(); setCanvasContextMenu(null) }} 
            />
          </div>
        )}

        {/* ── Right Panel ─────────────────────────────────────────────────────── */}
        {showRightSidebar && (
          <div style={{
            width: rightPanelCollapsed ? 52 : 268,
            position: 'absolute',
            right: 16,
            top: floatingPanelTop,
            bottom: floatingPanelBottom,
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: C.panel,
            border: 'none',
            borderRadius: 12,
            boxShadow: C.floatingPanelShadow,
            transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
          }}>

          {!rightPanelCollapsed && (
            <div style={{ padding: '12px 8px 10px', borderBottom: `1px solid ${C.borderFaint}`, display: 'flex', flexDirection: 'column', gap: 7, position: 'relative', zIndex: 70 }}>
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: 'DM Sans, sans-serif' }}>Active model</span>
              <button
                id="model-switcher"
                onClick={(e) => {
                  e.stopPropagation()
                  setModelSwitcherOpen(v => !v)
                }}
                disabled={canvasTabs.length <= 1}
                style={{
                  minHeight: 44,
                  borderRadius: 7,
                  border: `1px solid ${C.floatingBorderSoft}`,
                  backgroundColor: C.panelControl,
                  color: C.text,
                  cursor: canvasTabs.length > 1 ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 9px',
                  fontFamily: 'DM Sans, sans-serif',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: dirtyModels[modelId || ''] ? C.primary : C.secondary, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>
                    {currentModelSwitcherLabel}
                  </span>
                  {currentWorkspaceSwitcherLabel && (
                    <span style={{ fontSize: 9, color: C.textMuted, fontFamily: 'DM Sans, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {currentWorkspaceSwitcherLabel}
                    </span>
                  )}
                </span>
                <CaretDown size={12} color={C.textMuted} weight="bold" />
              </button>
              {modelSwitcherOpen && canvasTabs.length > 1 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 82,
                    left: 8,
                    right: 8,
                    zIndex: 90,
                    maxHeight: 220,
                    overflowY: 'auto',
                    padding: 4,
                    borderRadius: 8,
                    backgroundColor: C.panelControl,
                    border: `1px solid ${C.floatingBorder}`,
                    boxShadow: C.floatingDropdownShadow,
                  }}
                >
                  {canvasTabs.map((tab) => {
                    const isActiveTab = tab.modelId === modelId
                    const workspaceLabel = stripWorkspaceDisplayName(tab.workspace?.name || '')
                    const modelLabel = stripModelDisplayName(String(tab.model?.name || tab.modelId).replace(/\.(hbe|ada|metisws)$/i, ''))
                    const isDirtyTab = !!dirtyModels[tab.modelId]
                    return (
                      <button
                        key={tab.modelId}
                        onClick={() => {
                          setModelSwitcherOpen(false)
                          onOpenModel(tab.modelId, tab.workspace.id)
                        }}
                        style={{
                          width: '100%',
                          minHeight: 34,
                          borderRadius: 6,
                          border: 'none',
                          backgroundColor: isActiveTab ? C.panelControlActive : 'transparent',
                          color: isActiveTab ? C.text : C.textSec,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 8px',
                          textAlign: 'left',
                          fontFamily: 'DM Sans, sans-serif',
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: isDirtyTab ? C.primary : C.textMuted, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{modelLabel}{isDirtyTab ? '*' : ''}</span>
                          <span style={{ fontSize: 9, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workspaceLabel}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab bar / Collapse Trigger — unified darker grey */}
          <div style={{ display: 'flex', flexDirection: rightPanelCollapsed ? 'column' : 'row', height: rightPanelCollapsed ? 'auto' : 46, backgroundColor: C.panel, flexShrink: 0, padding: rightPanelCollapsed ? '12px 0' : '12px 8px 6px', alignItems: 'center', gap: rightPanelCollapsed ? 12 : 6 }}>
            <button 
              id="tour-properties-tab"
              onClick={() => { if (rightPanelCollapsed) setRightPanelCollapsed(false); setRightTab('Properties') }}
              style={{ 
                flex: rightPanelCollapsed ? 'none' : 1, width: rightPanelCollapsed ? 30 : 'auto', height: rightPanelCollapsed ? 30 : 28, 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontFamily: 'DM Sans, sans-serif', fontWeight: rightTab === 'Properties' ? 600 : 400, 
                color: rightTab === 'Properties' ? C.text : C.textMuted, backgroundColor: rightTab === 'Properties' ? C.selectedTabBg : 'transparent', 
                border: rightTab === 'Properties' ? `1px solid ${C.selectedTabBorder}` : '1px solid transparent', 
                borderRadius: 6, cursor: 'pointer' 
              }}>
              {rightPanelCollapsed ? <SlidersHorizontal size={18} /> : 'Properties'}
            </button>
            <button 
              id="tour-tools-tab"
              onClick={() => { if (rightPanelCollapsed) setRightPanelCollapsed(false); setRightTab('Tools') }}
              style={{ 
                flex: rightPanelCollapsed ? 'none' : 1, width: rightPanelCollapsed ? 30 : 'auto', height: rightPanelCollapsed ? 30 : 28, 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontFamily: 'DM Sans, sans-serif', fontWeight: rightTab === 'Tools' ? 600 : 400, 
                color: rightTab === 'Tools' ? C.text : C.textMuted, backgroundColor: rightTab === 'Tools' ? C.selectedTabBg : 'transparent', 
                border: rightTab === 'Tools' ? `1px solid ${C.selectedTabBorder}` : '1px solid transparent', 
                borderRadius: 6, cursor: 'pointer' 
              }}>
              {rightPanelCollapsed ? <Toolbox size={18} /> : 'Tools'}
            </button>
            
            {!rightPanelCollapsed && (
              <button 
                onClick={() => setRightPanelCollapsed(true)} 
                title="Collapse Sidebar"
                style={{ padding: '0 10px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <CaretDoubleRight size={14} color={C.textMuted} />
              </button>
            )}
          </div>

          {/* Panel content (hidden when collapsed) */}
          {!rightPanelCollapsed && (
            <>

          {/* ── Properties ──────────────────────────────────────────────────── */}
          {rightTab === 'Properties' && (
            <div className="canvas-floating-panel-scroll" style={{ flex: 1, overflowY: 'auto' }}>

              {/* Construct Name */}
              <div style={{ padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10, color: C.textMuted, fontFamily: 'DM Sans, sans-serif' }}>Construct Name</span>
                <div style={{ backgroundColor: C.elevated, borderRadius: 6, height: 32, padding: '0 8px 0 10px', border: `1px solid ${C.successBorderSoft}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    value={selectedConstruct?.name ?? ''}
                    onChange={e => updateSelected({ name: e.target.value })}
                    placeholder="Select a construct"
                    style={{ background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: 13, fontWeight: 600, fontFamily: 'DM Sans, sans-serif', flex: 1, minWidth: 0 }}
                  />
                  {selectedConstruct?.isHigherOrder && (
                    <span
                      style={{
                        height: 18,
                        padding: '0 7px',
                        borderRadius: 999,
                        backgroundColor: 'rgb(var(--color-accent-rgb) / 0.18)',
                        border: '1px solid rgb(var(--color-accent-rgb) / 0.42)',
                        color: 'var(--color-accent)',
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: 0.2,
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0,
                      }}
                    >HOC</span>
                  )}
                </div>
              </div>

              {/* Construct Shape Selection (Moved Up) */}
              <div style={{ padding: '12px 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 10, color: C.textMuted, fontFamily: 'DM Sans, sans-serif' }}>Construct Shape</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button 
                    onClick={() => updateSelected({ shape: 'circle' })}
                    style={{ 
                      flex: 1, height: 32, borderRadius: 8,
                      border: 'none',
                      backgroundColor: 'transparent',
                      boxShadow: 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                    }}
                  >
                    <Circle size={14} color={normalizeConstructShape(selectedConstruct?.shape) === 'circle' ? C.secondary : C.textDim} weight="fill" />
                    <span style={{ fontSize: 11, color: normalizeConstructShape(selectedConstruct?.shape) === 'circle' ? C.secondary : C.textDim, fontWeight: 700 }}>Circle</span>
                  </button>
                  <button 
                    onClick={() => updateSelected({ shape: 'oval' })}
                    style={{ 
                      flex: 1, height: 32, borderRadius: 8,
                      border: 'none',
                      backgroundColor: 'transparent',
                      boxShadow: 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                    }}
                  >
                    <Circle
                      size={14}
                      color={normalizeConstructShape(selectedConstruct?.shape) === 'oval' ? C.secondary : C.textDim}
                      weight="fill"
                      style={{ transform: 'scaleX(1.35)' }}
                    />
                    <span style={{ fontSize: 11, color: normalizeConstructShape(selectedConstruct?.shape) === 'oval' ? C.secondary : C.textDim, fontWeight: 700 }}>Oval</span>
                  </button>
                </div>
              </div>

              {/* Construct Size */}
              <div style={{ padding: '12px 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 10, color: C.textMuted, fontFamily: 'DM Sans, sans-serif' }}>
                  {selectedConstruct && normalizeConstructShape(selectedConstruct.shape) === 'oval' ? 'Width / Height' : 'Size'}
                </span>
                {selectedConstruct && normalizeConstructShape(selectedConstruct.shape) === 'oval' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {([
                      { label: 'W', value: constructWidthDraft, setValue: setConstructWidthDraft },
                      { label: 'H', value: constructHeightDraft, setValue: setConstructHeightDraft },
                    ] as const).map((field) => (
                      <label key={field.label} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 9, color: C.textDim, fontFamily: 'DM Sans, sans-serif', fontWeight: 800 }}>{field.label}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={field.value}
                          onFocus={() => setConstructDimensionsFocused(true)}
                          onBlur={() => {
                            setConstructDimensionsFocused(false)
                            const { width, height } = getConstructDimensions(selectedConstruct)
                            setConstructWidthDraft(String(Math.round(width)))
                            setConstructHeightDraft(String(Math.round(height)))
                          }}
                          onChange={(e) => field.setValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              commitConstructDimensionsDraft()
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              const { width, height } = getConstructDimensions(selectedConstruct)
                              setConstructWidthDraft(String(Math.round(width)))
                              setConstructHeightDraft(String(Math.round(height)))
                              setConstructDimensionsFocused(false)
                              e.currentTarget.blur()
                            }
                          }}
                          style={{
                            minWidth: 0,
                            height: 26,
                            borderRadius: 6,
                            border: `1px solid ${C.border}`,
                            backgroundColor: C.elevated,
                            color: C.text,
                            padding: '0 6px',
                            fontSize: 10,
                            fontFamily: 'DM Sans, sans-serif',
                            outline: 'none',
                            width: '100%',
                          }}
                        />
                      </label>
                    ))}
                    <button
                      onMouseDown={(e) => {
                        if (constructDimensionsFocused) e.preventDefault()
                      }}
                      onClick={() => {
                        if (constructDimensionsFocused) {
                          commitConstructDimensionsDraft()
                          return
                        }
                        const defaults = getDefaultOvalDimensions(DEFAULT_CONSTRUCT_RADIUS)
                        updateSelected({ radius: DEFAULT_CONSTRUCT_RADIUS, ovalWidth: defaults.width, ovalHeight: defaults.height })
                      }}
                      style={{
                        height: 26,
                        borderRadius: 6,
                        border: `1px solid ${C.border}`,
                        backgroundColor: 'var(--color-border)',
                        color: C.textSec,
                        cursor: 'pointer',
                        fontSize: 10,
                        fontFamily: 'DM Sans, sans-serif',
                        fontWeight: 700,
                        padding: '0 10px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {constructDimensionsFocused ? 'Use' : 'Reset'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={selectedConstruct ? (constructSizeFocused ? constructSizeDraft : Math.round(selectedConstruct.radius * 2)) : ''}
                      disabled={!selectedConstruct}
                      onFocus={() => {
                        if (!selectedConstruct) return
                        setConstructSizeDraft(String(Math.round(selectedConstruct.radius * 2)))
                        setConstructSizeFocused(true)
                      }}
                      onBlur={() => {
                        setConstructSizeFocused(false)
                        setConstructSizeDraft(selectedConstruct ? String(Math.round(selectedConstruct.radius * 2)) : '')
                      }}
                      onChange={(e) => setConstructSizeDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          commitConstructSizeDraft()
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setConstructSizeDraft(selectedConstruct ? String(Math.round(selectedConstruct.radius * 2)) : '')
                          setConstructSizeFocused(false)
                          e.currentTarget.blur()
                        }
                      }}
                      style={{
                        height: 26,
                        borderRadius: 6,
                        border: `1px solid ${C.border}`,
                        backgroundColor: C.elevated,
                        color: C.text,
                        padding: '0 6px',
                        fontSize: 10,
                        fontFamily: 'DM Sans, sans-serif',
                        outline: 'none',
                        opacity: selectedConstruct ? 1 : 0.5,
                        flex: 1,
                      }}
                    />
                    <button
                      disabled={!selectedConstruct}
                      onMouseDown={(e) => {
                        if (constructSizeFocused) e.preventDefault()
                      }}
                      onClick={() => {
                        if (constructSizeFocused) {
                          commitConstructSizeDraft()
                          return
                        }
                        updateSelected({ radius: DEFAULT_CONSTRUCT_RADIUS })
                      }}
                      style={{
                        height: 26,
                        borderRadius: 6,
                        border: `1px solid ${C.border}`,
                        backgroundColor: selectedConstruct ? 'var(--color-border)' : C.elevated,
                        color: selectedConstruct ? C.textSec : C.textMuted,
                        cursor: selectedConstruct ? 'pointer' : 'not-allowed',
                        fontSize: 10,
                        fontFamily: 'DM Sans, sans-serif',
                        fontWeight: 700,
                        padding: '0 10px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {constructSizeFocused ? 'Use size' : 'Auto size'}
                    </button>
                  </div>
                )}
              </div>


              {/* Indicators */}
              <div id="tour-indicators-panel" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedConstruct ? (
                  <>
                    <button
                      type="button"
                      aria-expanded={propertiesIndicatorsExpanded}
                      onClick={() => setPropertiesIndicatorsExpanded((expanded) => !expanded)}
                      style={{
                        width: '100%',
                        minHeight: 28,
                        border: 'none',
                        backgroundColor: 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: 0,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 10, color: C.textMuted, fontFamily: 'DM Sans, sans-serif' }}>
                        {selectedConstruct.isHigherOrder
                          ? `Lower-order constructs (${selectedHocLowerOrderConstructs.length})`
                          : `Indicators (${selectedConstruct.indicators.length})`}
                      </span>
                      <CaretDown
                        size={12}
                        color={C.textMuted}
                        style={{ transform: propertiesIndicatorsExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.16s ease' }}
                      />
                    </button>
                    {propertiesIndicatorsExpanded && selectedConstruct.isHigherOrder && selectedHocLowerOrderConstructs.length === 0 ? (
                      <span style={{ fontSize: 11, color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>No lower-order constructs connected</span>
                    ) : propertiesIndicatorsExpanded && selectedConstruct.isHigherOrder ? (
                      selectedHocLowerOrderConstructs.map((construct) => (
                        <button
                          key={construct.id}
                          type="button"
                          onClick={() => highlightConnectedConstruct(construct.id)}
                          style={{
                            minHeight: 32,
                            border: 'none',
                            backgroundColor: C.elevated,
                            borderRadius: 6,
                            padding: '0 8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontFamily: 'DM Sans, sans-serif',
                          }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: construct.color, flexShrink: 0 }} />
                          <span
                            title={construct.name}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: C.textSec,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {construct.name}
                          </span>
                          <span style={{ color: C.textDim, fontSize: 9, fontWeight: 700 }}>
                            LOC
                          </span>
                        </button>
                      ))
                    ) : propertiesIndicatorsExpanded && selectedConstruct.indicators.length === 0 ? (
                      <span style={{ fontSize: 11, color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>No indicators assigned</span>
                    ) : propertiesIndicatorsExpanded && selectedConstruct.indicators.map((ind, i) => (
                      <div key={`${ind.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 30, backgroundColor: C.elevated, borderRadius: 6, padding: '0 6px' }}>
                        <DotsSixVertical size={10} color={C.textDim} />
                        <span
                          title={ind.name}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 11,
                            color: 'var(--color-text-secondary)',
                            fontFamily: 'DM Sans, sans-serif',
                          }}
                        >
                          {ind.name}
                        </span>
                        <span style={{ minWidth: 34, textAlign: 'right', fontSize: 10, color: loadColor(ind.loading), fontFamily: 'DM Sans, sans-serif' }}>
                          {ind.loading !== null ? ind.loading.toFixed(3) : '-'}
                        </span>
                        <button
                          title="Remove indicator"
                          aria-label={`Remove ${ind.name}`}
                          onClick={() => updateSelected({ indicators: selectedConstruct.indicators.filter((_, index) => index !== i) })}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 5,
                            border: '1px solid transparent',
                            backgroundColor: 'transparent',
                            color: C.danger,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                          }}
                        >
                          <Minus size={12} weight="bold" />
                        </button>
                      </div>
                    ))}
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Select a construct</span>
                )}
              </div>

              {/* Measurement Model */}
              <div 
                id="tour-measurement-model"
                style={{ 
                  padding: '12px 14px 10px', display: 'flex', flexDirection: 'column', gap: 8,
                  opacity: selected.some(s => s.includes(':')) ? 0.4 : 1, pointerEvents: selected.some(s => s.includes(':')) ? 'none' : 'auto'
                }}>
                <span style={{ fontSize: 10, color: C.textMuted, fontFamily: 'DM Sans, sans-serif' }}>Measurement Model</span>
                <div style={{ backgroundColor: C.panelControl, borderRadius: 9, height: 38, padding: 4, display: 'flex', gap: 6 }}>
                  {(['Reflective', 'Formative'] as const).map(t => {
                    const active = selectedConstruct?.type === t
                    return (
                      <button key={t} onClick={() => updateSelected({ type: t })}
                        style={{
                          flex: 1,
                          borderRadius: 7,
                          fontSize: 11,
                          fontFamily: 'DM Sans, sans-serif',
                          fontWeight: active ? 800 : 500,
                          color: active ? C.textOnAccent : C.textMuted,
                          backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                          border: active ? '1px solid rgb(var(--color-accent-rgb) / 0.42)' : 'none',
                          boxShadow: active ? '0 10px 22px rgb(var(--color-accent-rgb) / 0.18)' : 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          transition: 'background-color 0.16s, box-shadow 0.16s, color 0.16s, border-color 0.16s'
                        }}>
                        {active && <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: C.textOnAccent, opacity: 0.84 }} />}
                        {t}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Construct Colour */}
              <div 
                id="tour-construct-color"
                style={{ 
                  padding: '12px 14px 10px', borderTop: `1px solid ${C.borderFaint}`, display: 'flex', flexDirection: 'column', gap: 8,
                  opacity: selected.some(s => s.includes(':')) ? 0.4 : 1, pointerEvents: selected.some(s => s.includes(':')) ? 'none' : 'auto'
                }}>
                <span style={{ fontSize: 10, color: C.textMuted, fontFamily: 'DM Sans, sans-serif' }}>Construct Colour</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {SWATCH_COLORS.map(sw => (
                    <button key={sw} onClick={() => updateSelected({ color: sw })}
                      style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: sw, border: selectedConstruct?.color === sw ? `2px solid ${C.text}` : '2px solid transparent', cursor: 'pointer', flexShrink: 0 }} />
                  ))}
                </div>
              </div>

              {/* Export */}
              <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={handleExportPNG}
                  disabled={constructs.length === 0}
                  style={{
                    height: 32,
                    borderRadius: 7,
                    border: `1px solid ${C.floatingBorderSoft}`,
                    backgroundColor: constructs.length > 0 ? C.floatingIconBg : C.elevated,
                    color: constructs.length > 0 ? C.textSec : C.textMuted,
                    cursor: constructs.length > 0 ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  <FrameCorners size={14} color={constructs.length > 0 ? C.textSec : C.textMuted} weight="bold" />
                  Export Model
                </button>
              </div>
            </div>
          )}

          {/* ── Tools ──────────────────────────────────────────────────────────── */}
          {rightTab === 'Tools' && (
            <div className="canvas-floating-panel-scroll" style={{ flex: 1, overflowY: 'auto' }}>


              {/* Indicators Alignment */}
              <SectionRow label="Indicator Position">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {(['top', 'bottom', 'left', 'right'] as const).map(dir => {
                    const active = ((selectedConstruct?.indicatorAlignment || selectedConstruct?.indicatorDirection || 'bottom')) === dir
                    const Icon = dir === 'top' ? ArrowUp : dir === 'bottom' ? ArrowDown : dir === 'left' ? ArrowLeft : ArrowRight
                    return (
                      <CompassBtn 
                        key={dir}
                        active={active}
                        onClick={() => updateSelected({ indicatorAlignment: dir, indicatorDirection: dir })}
                        style={{ height: 32 }}
                      >
                        <Icon size={14} color={active ? C.primary : C.textSec} weight={active ? "bold" : "regular"} />
                      </CompassBtn>
                    )
                  })}
                </div>
              </SectionRow>

              {/* Canvas background */}
              <SectionRow label="Canvas">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => canvasBgRef.current?.click()} style={{ width: 28, height: 28, borderRadius: 5, backgroundColor: canvasBg, border: `1px solid ${C.border}`, cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: C.textSec, fontFamily: 'DM Sans, sans-serif' }}>Background colour</span>
                  <input ref={canvasBgRef} type="color" value={canvasBg} onChange={e => setCanvasBg(e.target.value)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                </div>
              </SectionRow>


              {/* Text */}
              <SectionRow label="Text">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => textColorRef.current?.click()}
                    style={{ width: 28, height: 28, borderRadius: 5, backgroundColor: selectedConstruct?.labelColor ?? C.elevated, border: `1px solid ${C.border}`, cursor: 'pointer', flexShrink: 0 }} />
                  <button onClick={() => selectedConstruct && updateSelected({ labelBold: !selectedConstruct.labelBold })}
                    style={{ width: 28, height: 28, borderRadius: 5, backgroundColor: selectedConstruct?.labelBold ? C.hover : C.elevated, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: selectedConstruct?.labelBold ? C.text : C.textSec, fontFamily: 'DM Sans, sans-serif' }}>B</span>
                  </button>
                  <button onClick={() => selectedConstruct && updateSelected({ labelItalic: !selectedConstruct.labelItalic })}
                    style={{ width: 28, height: 28, borderRadius: 5, backgroundColor: selectedConstruct?.labelItalic ? C.hover : C.elevated, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 13, fontStyle: 'italic', color: selectedConstruct?.labelItalic ? C.text : C.textSec, fontFamily: 'DM Sans, sans-serif' }}>I</span>
                  </button>
                  <input ref={textColorRef} type="color" value={selectedConstruct?.labelColor} onChange={e => updateSelected({ labelColor: e.target.value })} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                </div>
              </SectionRow>

              {/* Grid & Snap */}
              <div style={{ position: 'relative', height: 71 }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'var(--color-border)' }} />
                <span style={{ position: 'absolute', top: 6, left: 12, fontSize: 10, fontFamily: 'Inter, sans-serif', fontWeight: 600, color: 'var(--color-text-dim)', letterSpacing: 1.5 }}>GRID &amp; SNAP</span>
                <div style={{ position: 'absolute', top: 28, left: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setShowGrid(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: 84, height: 28, borderRadius: 14, backgroundColor: C.elevated, border: 'none', cursor: 'pointer' }}>
                    <GridFour size={14} color={showGrid ? C.primary : C.textMuted} />
                    <span style={{ fontSize: 11, fontFamily: 'Inter, sans-serif', fontWeight: showGrid ? 600 : 400, color: showGrid ? C.primary : C.textMuted }}>Grid</span>
                  </button>
                  <button onClick={() => setSnapEnabled(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: 84, height: 28, borderRadius: 14, backgroundColor: C.elevated, border: 'none', cursor: 'pointer' }}>
                    <MagnetStraight size={14} color={snapEnabled ? C.primary : C.textMuted} />
                    <span style={{ fontSize: 11, fontFamily: 'Inter, sans-serif', fontWeight: snapEnabled ? 600 : 400, color: snapEnabled ? C.primary : C.textMuted }}>Snap</span>
                  </button>
                </div>
              </div>

            </div>
          )}

          </>
        )}
      </div>
    )}
      <div
        style={{
          position: 'absolute',
          bottom: 52,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          height: 52,
          padding: '8px 8px',
          borderRadius: 10,
          backgroundColor: C.panel,
          border: `1px solid ${C.floatingBorder}`,
          boxShadow: C.floatingMenuShadow,
        }}
      >
        <TBtn id="tour-select" onClick={() => setActiveTool('select')} active={activeTool === 'select'} activeTone={activeTool === 'select' ? 'yellow' : undefined} activeLabel="Select" title="Move / Select (V)">
          <Cursor size={18} color={activeTool === 'select' ? C.textOnAccent : C.textSec} weight={activeTool === 'select' ? 'bold' : 'regular'} />
        </TBtn>
        <TBtn id="tour-connect" onClick={() => setActiveTool('connect')} active={activeTool === 'connect'} activeTone={activeTool === 'connect' ? 'yellow' : undefined} activeLabel="Connect" title="Connect (C)">
          <ArrowRight size={18} color={activeTool === 'connect' ? C.textOnAccent : C.textSec} weight={activeTool === 'connect' ? 'bold' : 'regular'} />
        </TBtn>
        <TBtn id="tour-latent-variable" onClick={() => setActiveTool('construct')} active={activeTool === 'construct'} activeTone={activeTool === 'construct' ? 'yellow' : undefined} activeLabel="Latent" title="Latent Variable (L)">
          <Circle size={18} color={activeTool === 'construct' ? C.textOnAccent : C.textSec} weight={activeTool === 'construct' ? 'fill' : 'regular'} />
        </TBtn>
        <TBtn
          id="tour-delete"
          onClick={() => {
            if (activeTool === 'delete') setActiveTool('select')
            else if (selected.length || selectedPaths.length) setShowDeleteModal(true)
            else setActiveTool('delete')
          }}
          active={activeTool === 'delete'}
          disabled={!selected.length && !selectedPaths.length && activeTool !== 'delete'}
          title="Delete Selection"
        >
          <Trash size={18} color={(activeTool === 'delete' || selected.length > 0 || selectedPaths.length > 0) ? C.danger : C.textMuted} weight={activeTool === 'delete' ? 'fill' : 'regular'} />
        </TBtn>
        <div style={{ width: 1, height: 28, backgroundColor: C.floatingBorderSoft, margin: '0 3px' }} />
        <TBtn id="tour-calculate" onClick={() => setShowAlgorithmDialog(true)} disabled={!canCalculate || isAnyCalculationRunning} active={canCalculate && !isAnyCalculationRunning} activeTone={canCalculate && !isAnyCalculationRunning ? 'green' : undefined} activeLabel="Calculate" title={isAnyCalculationRunning ? 'Calculation in progress - finish or stop current' : 'Calculate (Ctrl+Enter)'}>
          <MathOperations size={18} color={canCalculate && !isAnyCalculationRunning ? C.textOnSuccess : C.textMuted} weight="bold" />
        </TBtn>
      </div>
      {/* ─── Delete Modal ─── */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={triggerModalAlert}
        >
          <div
            className={`w-[400px] bg-[var(--color-elevated)] rounded-xl border border-[var(--color-border)] overflow-hidden transition-all duration-200 ${isModalShaking ? 'animate-shake' : ''}`}
            onClick={(e) => e.stopPropagation()}
            style={{ 
              backgroundColor: 'var(--color-elevated)',
              borderRadius: 12,
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <div style={{ padding: 24 }}>
              <h2 style={{ color: 'var(--color-text-primary)', fontSize: 18, fontWeight: 600, marginBottom: 8, fontFamily: 'DM Sans, sans-serif' }}>Delete {selectedConstruct ? selectedConstruct.name : 'Selection'}?</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.5, fontFamily: 'DM Sans, sans-serif' }}>
                Are you sure you want to delete {selectedConstruct ? (`"${selectedConstruct.name}"`) : 'the selected items'}? 
                This action can be undone via Ctrl+Z.
              </p>
            </div>
            <div style={{ padding: '16px 24px', backgroundColor: 'var(--color-page)', display: 'flex', justifyContent: 'end', gap: 12 }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: 'transparent',
                  color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s',
                  fontFamily: 'DM Sans, sans-serif'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                Cancel
              </button>
              <button
                onClick={() => { deleteSelected(); setShowDeleteModal(false) }}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: 'var(--color-danger)',
                  color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s',
                  fontFamily: 'DM Sans, sans-serif'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#C25D3D'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--color-danger)'}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bootstrap Modal ────────────────────────────────────────────────── */}
      {showBootstrapModal && (
        <BootstrapModal
          onClose={() => setShowBootstrapModal(false)}
          onRun={handleRunBootstrap}
        />
      )}

      {showPlsPredictModal && (
        <PlsPredictModal
          onClose={() => setShowPlsPredictModal(false)}
          onRun={handleRunPlsPredict}
          initialSettings={persistedPlsPredictSettings}
          isRunning={calculatingType === 'plspredict' && isCalculating}
        />
      )}

      {showAdvancedAnalysisModal && (
        <AdvancedAnalysisModal
          constructs={constructs}
          paths={paths}
          onClose={() => {
            if (calculatingType === 'advanced' && isCalculating) return
            setShowAdvancedAnalysisModal(false)
          }}
          onRun={handleRunAdvancedAnalysis}
          isRunning={calculatingType === 'advanced' && isCalculating}
          initialSettings={currentModel?.state?.analysisSettings?.advanced}
        />
      )}

      {showSaveAsDialog && (
        <NewModelDialog
          title="Save Model As"
          confirmLabel="Save Model"
          initialModelName={stripModelDisplayName(currentModel?.name ?? '')}
          onClose={() => setShowSaveAsDialog(false)}
          activeWorkspaceId={activeWs?.id ?? activeWorkspaceId ?? ''}
          workspaces={workspaces}
          onCreate={handleSaveAs}
        />
      )}
      
      {showAlgorithmDialog && (
        <div 
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={triggerModalAlert}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`w-[520px] bg-[var(--color-elevated)] rounded-lg overflow-hidden border border-white/10 transition-all duration-200 ${isModalShaking ? 'animate-shake' : ''}`}
            style={{ 
              display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-modal)'
            }}
          >
            {/* Modal Title Bar */}
            <div style={{
              height: 40, backgroundColor: C.surface, display: 'flex', alignItems: 'center', padding: '0 12px',
              justifyContent: 'space-between', color: C.text, borderBottom: '1px solid var(--color-border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SquaresFour size={18} weight="fill" color={C.textMuted} />
                <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'DM Sans, sans-serif', color: C.textSec }}>PLS-SEM algorithm</span>
              </div>
              <button
                onClick={() => setShowAlgorithmDialog(false)}
                style={{
                  backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: C.textSec,
                  width: 24, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Content Area */}
            <div style={{ padding: '32px 32px 24px 32px', minHeight: 260, backgroundColor: 'var(--color-elevated)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                
                {/* Weighting Scheme */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ width: 150, fontSize: 13, color: C.textMuted, fontWeight: 400 }}>Weighting scheme</span>
                  <div style={{ display: 'flex', gap: 24 }}>
                    {['Factor', 'Path', 'PCA'].map(opt => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: C.textSec, fontSize: 13 }}>
                        <input 
                          type="radio" 
                          name="weightingScheme" 
                          value={opt} 
                          checked={weightingScheme === opt}
                          onChange={() => setWeightingScheme(opt as any)}
                          style={{ accentColor: C.primary }}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Type of results */}
                <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                  <span style={{ width: 150, fontSize: 13, color: C.textMuted, fontWeight: 400 }}>Type of results</span>
                  <div
                    onClick={() => setActiveDropdown(activeDropdown === 'results' ? null : 'results')}
                    style={{
                      flex: 1, backgroundColor: C.input, color: C.text, border: '1px solid var(--color-border)',
                      padding: '10px 12px', borderRadius: 6, fontSize: 13, outline: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}
                  >
                    <span>{resultsType}</span>
                    <CaretDown size={14} color={C.textMuted} />
                  </div>
                  {activeDropdown === 'results' && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 150, right: 0, marginTop: 4,
                      backgroundColor: C.input, border: '1px solid var(--color-border)',
                      borderRadius: 6, boxShadow: 'var(--shadow-floating-dropdown)', zIndex: 10,
                      overflow: 'hidden', padding: '4px 0'
                    }}>
                      {['Standardized', 'Unstandardized', 'Mean-centered'].map(opt => (
                        <div
                          key={opt}
                          onClick={() => { setResultsType(opt as any); setActiveDropdown(null); }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgb(var(--color-hover-rgb) / 0.75)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = resultsType === opt ? 'rgb(var(--color-accent-rgb) / 0.12)' : 'transparent')}
                          style={{
                            padding: '10px 12px', color: resultsType === opt ? C.text : C.textSec, fontSize: 13, fontWeight: resultsType === opt ? 600 : 400, cursor: 'pointer',
                            backgroundColor: resultsType === opt ? 'rgb(var(--color-accent-rgb) / 0.12)' : 'transparent'
                          }}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Math engine */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ width: 150, fontSize: 13, color: C.textMuted, fontWeight: 400 }}>Math engine</span>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: C.textSec, fontSize: 13 }}>
                      <input
                        type="radio"
                        name="plsAlgorithm"
                        checked={plsAlgorithm === 'standard'}
                        onChange={() => setPlsAlgorithm('standard')}
                        style={{ accentColor: C.primary }}
                      />
                      Standard PLS
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: C.textSec, fontSize: 13 }}>
                      <input
                        type="radio"
                        name="plsAlgorithm"
                        checked={plsAlgorithm === 'consistent'}
                        onChange={() => setPlsAlgorithm('consistent')}
                        style={{ accentColor: C.primary }}
                      />
                      Consistent PLS (PLSc)
                    </label>
                  </div>
                </div>

                {/* Initial weight */}
                <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                  <span style={{ width: 150, fontSize: 13, color: C.textMuted, fontWeight: 400 }}>Initial weight</span>
                  <div
                    onClick={() => setActiveDropdown(activeDropdown === 'initial' ? null : 'initial')}
                    style={{
                      flex: 1, backgroundColor: C.input, color: C.text, border: '1px solid var(--color-border)',
                      padding: '10px 12px', borderRadius: 6, fontSize: 13, outline: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}
                  >
                    <span>{initialWeight}</span>
                    <CaretDown size={14} color={C.textMuted} />
                  </div>
                  {activeDropdown === 'initial' && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 150, right: 0, marginTop: 4,
                      backgroundColor: C.input, border: '1px solid var(--color-border)',
                      borderRadius: 6, boxShadow: 'var(--shadow-floating-dropdown)', zIndex: 10,
                      overflow: 'hidden', padding: '4px 0'
                    }}>
                      {['Default', 'Individual'].map(opt => (
                        <div
                          key={opt}
                          onClick={() => { setInitialWeight(opt as any); setActiveDropdown(null); }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgb(var(--color-hover-rgb) / 0.75)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = initialWeight === opt ? 'rgb(var(--color-accent-rgb) / 0.12)' : 'transparent')}
                          style={{
                            padding: '10px 12px', color: initialWeight === opt ? C.text : C.textSec, fontSize: 13, fontWeight: initialWeight === opt ? 600 : 400, cursor: 'pointer',
                            backgroundColor: initialWeight === opt ? 'rgb(var(--color-accent-rgb) / 0.12)' : 'transparent'
                          }}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 20px', backgroundColor: C.input, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 13, color: C.textMuted, cursor: 'pointer' }}>Default settings</span>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => handleStartCalculation(plsAlgorithm)}
                    disabled={isAnyCalculationRunning}
                    style={{
                      padding: '8px 18px', borderRadius: 6, backgroundColor: 'var(--color-accent)', border: '1px solid rgb(var(--color-accent-rgb) / 0.42)',
                      color: 'var(--color-on-accent)', fontSize: 13, fontWeight: 700, cursor: isAnyCalculationRunning ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8, opacity: isAnyCalculationRunning ? 0.7 : 1
                    }}
                  >
                    <MathOperations size={14} weight="bold" />
                    {isAnyCalculationRunning ? 'Calculating...' : 'Start calculation'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDatasetManager && activeWs && (
        <DatasetManagerModal
          workspace={activeWs as any}
          workspaces={workspaces as any}
          setWorkspaces={setWorkspaces as any}
          context="model-canvas"
          modelId={modelId}
          onClose={() => setShowDatasetManager(false)}
          onBrowse={() => {
            setShowDatasetManager(false)
            void persistCanvasSnapshot(constructs, paths).then(() => {
              window.dispatchEvent(new CustomEvent('pls:open-import-picker', {
                detail: {
                  source: 'model-canvas',
                  modelId: modelId || '',
                  saveMode: 'save-as-new',
                  returnTo: `/canvas/${modelId}`,
                },
              }))
            })
          }}
          onViewDataset={(selectedDatasetId) => {
            navigate(`/dataview/${activeWs.id}/${selectedDatasetId}`, {
              state: {
                source: 'model-canvas' as const,
                modelId,
                returnTo: `/canvas/${modelId}`,
              },
            })
          }}
        />
      )}

      {showPathSettings && editingPathId && (() => {
        const p = paths.find(x => x.id === editingPathId)
        if (!p) return null
        const fromConstruct = constructs.find((construct) => construct.id === p.from)
        const toConstruct = constructs.find((construct) => construct.id === p.to)
        const showHocRole = Boolean(fromConstruct && toConstruct && Boolean(fromConstruct.isHigherOrder) !== Boolean(toConstruct.isHigherOrder))
        return (
          <PathSettingsModal 
            path={p} 
            showHocRole={showHocRole}
            position={pathSettingsPos} 
            onClose={() => setShowPathSettings(false)} 
            onSave={handleSavePathSettings} 
          />
        )
      })()}

      {/* ─── New Construct Modal ─── */}
      {showNewConstructModal && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--color-overlay)', backdropFilter: 'blur(3px)' }}
          onClick={() => triggerModalAlert()}
        >
          <div
            className={`overflow-hidden transition-all duration-200 ${isModalShaking ? 'animate-shake' : ''}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 356,
              backgroundColor: C.panelPop,
              borderRadius: 14,
              border: `1px solid ${C.floatingBorderSoft}`,
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <div style={{ height: 188, padding: '22px 24px 16px', display: 'flex', flexDirection: 'column', gap: 16, backgroundColor: C.panelPop }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    flexShrink: 0,
                    borderRadius: 999,
                    backgroundColor: `${newConstructColor}26`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ color: newConstructColor, fontFamily: 'DM Sans, sans-serif', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>+</span>
                </div>
                <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <h2 style={{ color: 'var(--color-text-primary)', fontSize: 16, fontWeight: 500, margin: 0, fontFamily: 'DM Sans, sans-serif', lineHeight: 1.2 }}>New Construct</h2>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 10, margin: 0, lineHeight: 1.35, fontFamily: 'DM Sans, sans-serif' }}>
                    Enter construct name and choose a color
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, borderRadius: 5, padding: '9px 8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-input)', display: 'flex', alignItems: 'center' }}>
                  <input 
                    autoFocus
                    value={newConstructName}
                    onChange={e => setNewConstructName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateConstruct()
                      if (e.key === 'Escape') resetNewConstructModal()
                    }}
                    placeholder="Construct Name"
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--color-text-primary)',
                      fontSize: 12,
                      fontFamily: 'DM Sans, sans-serif',
                      lineHeight: 1.2,
                      padding: 0,
                    }}
                  />
                </div>

                <div style={{ width: 108, display: 'flex', justifyContent: 'end', alignItems: 'center' }}>
                  <div style={{ width: 94, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ height: 22, display: 'flex', alignItems: 'center', gap: 7 }}>
                      {newConstructPalette.map((sw) => {
                        const selectedSwatch = newConstructColor === sw
                        const hoveredSwatch = hoveredNewConstructColor === sw
                        return (
                          <button
                            key={sw}
                            type="button"
                            aria-label={`Select construct color ${sw}`}
                            onClick={() => setNewConstructColor(sw)}
                            onMouseEnter={() => setHoveredNewConstructColor(sw)}
                            onMouseLeave={() => setHoveredNewConstructColor((current) => current === sw ? null : current)}
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 999,
                              backgroundColor: sw,
                              border: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transform: hoveredSwatch ? 'scale(1.08)' : 'scale(1)',
                              transition: 'transform 0.16s ease',
                            }}
                          >
                            {selectedSwatch && <Check size={9} color="#FBF9F2" weight="bold" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'end', gap: 10, padding: '7px 0' }}>
                <div
                  role="group"
                  aria-label="Measurement model"
                  style={{
                    width: 158,
                    height: 32,
                    borderRadius: 999,
                    backgroundColor: C.panelControl,
                    padding: 2,
                    display: 'flex',
                    border: `1px solid ${C.floatingBorderSoft}`,
                    boxShadow: 'var(--shadow-modal-popover)',
                  }}
                >
                  {(['Reflective', 'Formative'] as const).map((type) => {
                    const active = newConstructType === type
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setNewConstructType(type)}
                        style={{
                          flex: 1,
                          border: 'none',
                          borderRadius: 999,
                          backgroundColor: active ? C.panelControlActive : 'transparent',
                          color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                          fontSize: 10,
                          fontWeight: 400,
                          fontFamily: 'DM Sans, sans-serif',
                          cursor: 'pointer',
                          boxShadow: active ? '0 2px 6px rgba(0,0,0,0.27)' : 'none',
                        }}
                      >
                        {type}
                      </button>
                    )
                  })}
                </div>

                <button
                  type="button"
                  aria-pressed={newConstructIsHigherOrder}
                  onClick={() => {
                    const nextIsHigherOrder = !newConstructIsHigherOrder
                    const nextPalette = nextIsHigherOrder ? HOC_SWATCH_COLORS : SWATCH_COLORS
                    setNewConstructIsHigherOrder(nextIsHigherOrder)
                    setNewConstructColor((current) => nextPalette.includes(current) ? current : nextPalette[0])
                    setHoveredNewConstructColor(null)
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 28,
                    border: 'none',
                    backgroundColor: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'end',
                    gap: 6,
                    padding: 0,
                    cursor: 'pointer',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 999,
                      border: '1px solid rgb(var(--color-accent-rgb) / 0.62)',
                      backgroundColor: newConstructIsHigherOrder ? 'var(--color-accent)' : C.panelControl,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {newConstructIsHigherOrder && <Check size={8} color="var(--color-on-accent)" weight="bold" />}
                  </span>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 400, whiteSpace: 'nowrap' }}>Higher-order construct</span>
                </button>
              </div>
            </div>

            <div style={{ height: 64, padding: '0 24px', backgroundColor: 'var(--color-surface)', borderTop: `1px solid ${C.floatingBorderSoft}`, display: 'flex', justifyContent: 'end', alignItems: 'center', gap: 12 }}>
              <button
                onClick={resetNewConstructModal}
                style={{
                  width: 92,
                  height: 34,
                  borderRadius: 6,
                  border: `1px solid ${C.floatingBorderSoft}`,
                  backgroundColor: C.panelControl,
                  color: 'var(--color-text-secondary)',
                  fontSize: 11,
                  fontWeight: 400,
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateConstruct}
                style={{
                  width: 108,
                  height: 34,
                  borderRadius: 6,
                  border: '1px solid rgb(var(--color-accent-rgb) / 0.42)',
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-on-accent)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  boxShadow: '0 8px 18px rgb(var(--color-accent-rgb) / 0.16)',
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {hocPathRoleChoice && (
        <div
          className="fixed inset-0 z-[2100] flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--color-overlay)', backdropFilter: 'blur(3px)' }}
          onClick={triggerModalAlert}
        >
          <div
            className={`overflow-hidden transition-all duration-200 ${isModalShaking ? 'animate-shake' : ''}`}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 468,
              backgroundColor: C.panelPop,
              borderRadius: 14,
              border: `1px solid ${C.floatingBorderSoft}`,
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <div style={{ padding: '16px 18px 10px', display: 'flex', flexDirection: 'column', gap: 10, backgroundColor: C.panelPop }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <h2 style={{ color: 'var(--color-text-primary)', margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700 }}>
                    HOC path type
                  </h2>
                  <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: 10, lineHeight: 1.45 }}>
                    Connect {constructs.find((construct) => construct.id === hocPathRoleChoice.locId)?.name ?? 'this construct'} as a lower-order construct, or keep this as a structural path.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Discard HOC path"
                  onClick={cancelHocPathRoleChoice}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    border: `1px solid ${C.floatingBorderSoft}`,
                    backgroundColor: C.floatingIconBg,
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <X size={14} />
                </button>
              </div>
              <p style={{ color: 'var(--color-text-muted)', margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: 10, lineHeight: 1.5, display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 4, rowGap: 2 }}>
                Hold
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    color: 'var(--color-accent)',
                    fontWeight: 800,
                    lineHeight: 1,
                  }}
                >
                  <ArrowUp size={12} color="var(--color-accent)" weight="bold" />
                  <span style={{ color: 'var(--color-accent)', fontWeight: 800 }}>Shift</span>
                </span>
                to connect a lower-order construct. Draw normally for a structural path.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={doNotShowHocPathPrompt}
                  onChange={(event) => setDoNotShowHocPathPrompt(event.target.checked)}
                  style={{ width: 13, height: 13, accentColor: 'var(--color-accent)', cursor: 'pointer' }}
                />
                <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 10 }}>
                  Do not show this again
                </span>
              </label>
            </div>
            <div style={{ padding: '0 18px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, backgroundColor: C.panelPop }}>
              <button
                type="button"
                onClick={createHocMeasurementPath}
                style={{
                  width: '100%',
                  height: 32,
                  borderRadius: 6,
                  border: '1px solid rgb(var(--color-accent-rgb) / 0.42)',
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-on-accent)',
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                Use as lower-order construct
              </button>
              <button
                type="button"
                onClick={createHocStructuralPath}
                style={{
                  width: '100%',
                  height: 32,
                  borderRadius: 6,
                  border: `1px solid ${C.floatingBorderSoft}`,
                  backgroundColor: C.floatingIconBg,
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 10,
                }}
              >
                Keep structural path
              </button>
            </div>
          </div>
        </div>
      )}

      {hocPathConflict && (
        <div
          className="fixed inset-0 z-[2100] flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--color-overlay)', backdropFilter: 'blur(3px)' }}
          onClick={triggerModalAlert}
        >
          <div
            className={`overflow-hidden transition-all duration-200 ${isModalShaking ? 'animate-shake' : ''}`}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 313,
              backgroundColor: C.panelPop,
              borderRadius: 14,
              border: `1px solid ${C.floatingBorderSoft}`,
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <div style={{ minHeight: 99, padding: '18px 20px 8px', display: 'flex', flexDirection: 'column', gap: 12, backgroundColor: C.panelPop }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    border: '1px solid var(--color-warning)',
                    backgroundColor: 'rgb(var(--color-warning-rgb) / 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ color: 'var(--color-warning)', fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 800 }}>!</span>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <h2 style={{ color: 'var(--color-text-primary)', margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 500 }}>
                    Path direction conflict
                  </h2>
                  <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: 10, lineHeight: 1.35 }}>
                    Resolve the path direction before continuing.
                  </p>
                </div>
              </div>
              <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: 10, lineHeight: 1.45 }}>
                {constructs.find((construct) => construct.id === hocPathConflict.hocId)?.name ?? 'This construct'} is {hocPathConflict.currentType}, but this path suggests {hocPathConflict.suggestedType}.
              </p>
            </div>
            <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 10, backgroundColor: C.panelPop }}>
              <button
                type="button"
                onClick={keepHocMeasurementType}
                style={{
                  width: '100%',
                  height: 32,
                  borderRadius: 6,
                  border: `1px solid ${C.floatingBorderSoft}`,
                  backgroundColor: C.panelControl,
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 10,
                }}
              >
                Keep {hocPathConflict.currentType}
              </button>
              <button
                type="button"
                onClick={switchHocMeasurementType}
                style={{
                  width: '100%',
                  height: 32,
                  borderRadius: 6,
                  border: 'none',
                  backgroundColor: 'var(--color-warning)',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 10,
                }}
              >
                Switch to {hocPathConflict.suggestedType}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExitModal && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)' }}
          onClick={() => {
            setShowExitModal(false)
            setPendingCloseTabId(null)
          }}
        >
          <div
            className={`w-[420px] bg-[var(--color-elevated)] rounded-xl border border-[var(--color-border)] overflow-hidden transition-all duration-200 ${isModalShaking ? 'animate-shake' : ''}`}
            onClick={(e) => e.stopPropagation()}
            style={{ 
              backgroundColor: 'var(--color-elevated)', borderRadius: 12, border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <div style={{ padding: '24px 24px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                <div style={{
                  width: 42, height: 42, flexShrink: 0, borderRadius: '50%',
                  backgroundColor: 'rgba(135,151,107,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <WarningCircle size={22} color="#87976B" weight="fill" />
                </div>
                <div>
                  <h2 style={{ color: 'var(--color-text-primary)', fontSize: 18, fontWeight: 600, marginBottom: 4, fontFamily: 'DM Sans, sans-serif' }}>Unsaved Changes</h2>

            {cautionModal.open && (
              <div
                className="fixed inset-0 z-[2100] flex items-center justify-center p-4"
                style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)' }}
                onClick={() => setCautionModal({ open: false, title: '', message: '' })}
              >
                <div
                  className="w-[460px] bg-[var(--color-elevated)] rounded-xl border border-[var(--color-border)] overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    backgroundColor: 'var(--color-elevated)',
                    borderRadius: 12,
                    border: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-modal)',
                  }}
                >
                  <div style={{ padding: '24px 24px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 8 }}>
                      <div style={{
                        width: 42, height: 42, flexShrink: 0, borderRadius: '50%',
                        backgroundColor: 'rgba(135,151,107,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <WarningCircle size={22} color="#87976B" weight="fill" />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <h2 style={{ color: 'var(--color-text-primary)', fontSize: 18, fontWeight: 600, margin: '0 0 6px', fontFamily: 'DM Sans, sans-serif' }}>
                          {cautionModal.title}
                        </h2>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, lineHeight: 1.55, fontFamily: 'DM Sans, sans-serif', whiteSpace: 'pre-wrap', margin: 0 }}>
                          {cautionModal.message}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: '8px 24px 24px', display: 'flex', justifyContent: 'end' }}>
                    <button
                      onClick={() => setCautionModal({ open: false, title: '', message: '' })}
                      style={{
                        padding: '10px 24px', borderRadius: 10, border: '1px solid rgb(var(--color-accent-rgb) / 0.34)', backgroundColor: 'rgb(var(--color-accent-rgb) / 0.18)',
                        color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                        boxShadow: '0 4px 12px rgb(var(--color-accent-rgb) / 0.18)'
                      }}
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            )}
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 13, lineHeight: 1.5, fontFamily: 'DM Sans, sans-serif' }}>
                    {pendingCloseTabId
                      ? 'You have unsaved changes in this model canvas. Save before closing this tab?'
                      : 'You have unsaved changes in your framework. Would you like to save before going back?'}
                  </p>
                </div>
              </div>
            </div>

            <div style={{ padding: '8px 24px 24px', backgroundColor: 'transparent', display: 'flex', justifyContent: 'end', gap: 12 }}>
              <button 
                onClick={() => {
                  if (modelId) {
                    delete modelDraftsRef.current[modelId]
                    clearAutosaveDraft(modelId)
                    setDirtyModels(prev => {
                      if (!prev[modelId]) return prev
                      const next = { ...prev }
                      delete next[modelId]
                      return next
                    })
                  }
                  setIsDirty(false)
                  setShowExitModal(false)

                  if (pendingCloseTabId) {
                    const closingId = pendingCloseTabId
                    setPendingCloseTabId(null)
                    onCloseModelTab(closingId)
                    return
                  }

                  navigate('/')
                }}
                style={{
                  padding: '10px 20px', borderRadius: 10, border: 'none', backgroundColor: 'var(--color-danger)',
                  color: 'var(--color-on-danger)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                Discard
              </button>
              <button
                onClick={async () => {
                  const saved = await handleSave()
                  if (!saved) return

                  setShowExitModal(false)
                  if (pendingCloseTabId) {
                    const closingId = pendingCloseTabId
                    setPendingCloseTabId(null)
                    onCloseModelTab(closingId)
                    return
                  }

                  navigate('/')
                }}
                style={{
                  padding: '10px 24px', borderRadius: 10, border: '1px solid rgba(135,151,107,0.36)', backgroundColor: 'rgba(135,151,107,0.16)',
                  color: '#AAB68A', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                {pendingCloseTabId ? 'Save & Close' : 'Save & Exit'}
              </button>
             </div>
          </div>
        </div>
      )}

      {showSettingsModal && editingConstructId && (() => {
        const c = constructs.find(x => x.id === editingConstructId)
        if (!c) return null
        return (
          <LatentVariableSettingsModal 
            construct={c} 
            position={settingsModalPos}
            onClose={() => setShowSettingsModal(false)} 
            onCopy={() => {
              copyConstructById(c.id)
              setShowSettingsModal(false)
            }}
            onCut={() => {
              cutConstructById(c.id)
              setShowSettingsModal(false)
            }}
            onSave={(updated) => {
              const newC = constructs.map(x => x.id === c.id ? applyIndicatorAlignmentDefaults(x, updated) : x)
              commit(newC, paths)
              setConstructs(newC)
              setShowSettingsModal(false)
            }}
          />
        )
      })()}
    </div>
  </div>
  )
}

// ─── Latent Variable Settings Modal ──────────────────────────────────────────

const ModalInput = ({ label, value, onChange, type = "text" }: any) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
      <label style={{ fontSize: 9, color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textTransform: 'uppercase' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ height: 26, boxSizing: 'border-box', backgroundColor: 'var(--color-input)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '0 8px', color: 'var(--color-text-primary)', fontSize: 12, fontFamily: 'DM Sans, sans-serif' }}
      />
    </div>
  )
}

const ModalSelect = ({ label, id, value, options, activeSelect, setActiveSelect, onChange }: any) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6, position: 'relative' }}>
      <label style={{ fontSize: 9, color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textTransform: 'uppercase' }}>{label}</label>
      <div
        onClick={(e) => { e.stopPropagation(); setActiveSelect(activeSelect === id ? null : id) }}
        style={{
          height: 26, boxSizing: 'border-box',
          backgroundColor: 'var(--color-input)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '0 8px',
          color: 'var(--color-text-primary)', fontSize: 12, fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}
      >
        <span>{value}</span>
        <CaretDown size={10} color="var(--color-text-muted)" weight="bold" />
      </div>

      {activeSelect === id && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          backgroundColor: 'var(--color-panel-pop)', border: '1px solid var(--color-border)', borderRadius: 6,
          marginTop: 2, padding: 4, overflow: 'hidden', boxShadow: 'var(--shadow-modal-popover)',
          zIndex: 4100
        }}>
          {options.map((o: string) => (
            <div
              key={o}
              onClick={() => { onChange(o); setActiveSelect(null) }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              style={{
                padding: '6px 8px', borderRadius: 4, fontSize: 11, color: o === value ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', backgroundColor: o === value ? 'rgb(var(--color-accent-rgb) / 0.08)' : 'transparent',
                transition: 'background-color 0.1s'
              }}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LatentVariableSettingsModal({
  construct,
  position,
  onClose,
  onSave,
  onCopy,
  onCut,
}: {
  construct: Construct
  position: { x: number, y: number }
  onClose: () => void
  onSave: (updated: Construct) => void
  onCopy: () => void
  onCut: () => void
}) {
  const [formData, setFormData] = useState({
    name: construct.name,
    type: construct.type,
    weightingMode: construct.weightingMode || 'Automatic',
    indicatorAlignment: construct.indicatorAlignment || construct.indicatorDirection || 'top',
    margin: construct.margin || 10,
    folded: construct.folded || false,
    isHigherOrder: construct.isHigherOrder || false
  })

  const [activeSelect, setActiveSelect] = useState<string | null>(null)

  // Improved positioning logic: if clicked in bottom half of screen, pop up above cursor
  const modalWidth = 260
  const modalHeight = 310
  const isBottomHalf = position.y > window.innerHeight / 2
  
  const adjustedX = Math.min(position.x, window.innerWidth - modalWidth - 20)
  const adjustedY = isBottomHalf 
    ? position.y - modalHeight - 10 
    : position.y + 10

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000 }} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      <div 
        style={{ 
          position: 'absolute', top: adjustedY, left: adjustedX,
          width: modalWidth,
          height: modalHeight,
          boxSizing: 'border-box',
          backgroundColor: C.panelPop,
          background: `linear-gradient(180deg, ${C.panelControl} 0%, ${C.panelPop} 100%)`,
          borderRadius: 10,
          border: `1px solid ${C.floatingBorderSoft}`,
          boxShadow: C.floatingMenuShadow,
          animation: 'fadeUp 0.1s ease-out',
          userSelect: 'none',
          display: 'flex',
          flexDirection: 'column',
          padding: '10px 12px',
        }} 
        onClick={e => { e.stopPropagation(); setActiveSelect(null) }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: construct.color }} />
            <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, fontFamily: 'DM Sans, sans-serif' }}>Construct settings</h3>
          </div>
          <button onClick={onClose} style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <ModalInput label="Name" value={formData.name} onChange={(v: string) => setFormData({ ...formData, name: v })} />

          <div style={{ display: 'flex', alignItems: 'center', margin: '4px 0 12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={formData.isHigherOrder}
                onChange={(e) => setFormData({ ...formData, isHigherOrder: e.target.checked })}
                style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--color-accent)' }}
              />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif' }}>Higher-order construct</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <ModalSelect id="model" label="Model" value={formData.type} options={['Reflective', 'Formative']} activeSelect={activeSelect} setActiveSelect={setActiveSelect} onChange={(v: any) => setFormData({ ...formData, type: v })} />
            </div>
            <div style={{ flex: 1 }}>
               <ModalSelect id="align" label="Align" value={formData.indicatorAlignment} options={['top', 'bottom', 'left', 'right']} activeSelect={activeSelect} setActiveSelect={setActiveSelect} onChange={(v: any) => setFormData({ ...formData, indicatorAlignment: v })} />
            </div>
          </div>

          <div style={{ marginBottom: 6 }}>
            <ModalSelect id="weighting" label="Weights" value={formData.weightingMode} options={['Automatic', 'Factor', 'Correlation']} activeSelect={activeSelect} setActiveSelect={setActiveSelect} onChange={(v: string) => setFormData({ ...formData, weightingMode: v })} />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 2 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
              <div style={{ width: 72, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ fontSize: 9, color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textTransform: 'uppercase' }}>Margin</label>
                <DraftNumberInput
                  value={formData.margin}
                  min={0}
                  fallback={0}
                  onCommit={(value) => setFormData({ ...formData, margin: value })}
                  style={{ height: 26, boxSizing: 'border-box', backgroundColor: 'var(--color-input)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '0 8px', color: 'var(--color-text-primary)', fontSize: 12, fontFamily: 'DM Sans, sans-serif', width: '100%' }}
                />
              </div>
              <button
                type="button"
                onClick={onCopy}
                title="Copy"
                style={{ width: 26, height: 26, boxSizing: 'border-box', borderRadius: 5, border: '1px solid var(--color-border)', backgroundColor: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                onClick={onCut}
                title="Cut"
                style={{ width: 26, height: 26, boxSizing: 'border-box', borderRadius: 5, border: '1px solid var(--color-border)', backgroundColor: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Scissors size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 26 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>Folded</span>
              <div
                onClick={() => setFormData({ ...formData, folded: !formData.folded })}
                style={{ width: 28, height: 14, borderRadius: 7, backgroundColor: formData.folded ? 'var(--color-accent)' : 'var(--color-border)', position: 'relative', cursor: 'pointer', transition: '0.2s' }}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#FFFFFF', position: 'absolute', top: 2, left: formData.folded ? 16 : 2, transition: '0.2s' }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => onSave({ ...construct, ...formData, type: formData.type as 'Reflective' | 'Formative', indicatorDirection: formData.indicatorAlignment as any, isHigherOrder: formData.isHigherOrder })}
              style={{
                width: '100%', height: 30, borderRadius: 6, border: 'none', backgroundColor: 'var(--color-accent)',
                color: 'var(--color-on-accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                boxShadow: '0 4px 10px rgb(var(--color-accent-rgb) / 0.15)'
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PathSettingsModal({
  path,
  showHocRole = false,
  position,
  onClose,
  onSave,
}: {
  path: Path
  showHocRole?: boolean
  position: { x: number; y: number }
  onClose: () => void
  onSave: (p: Path) => void
}) {
  const activeHocRole = path.hocRole ?? 'measurement'
  const modalWidth = showHocRole ? 220 : 180
  const isBottomHalf = position.y > window.innerHeight / 2
  const adjustedX = Math.min(position.x, window.innerWidth - modalWidth - 20)
  const adjustedY = isBottomHalf ? position.y - (showHocRole ? 230 : 140) : position.y + 10

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000 }} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      <div 
        style={{ 
          position: 'absolute', top: adjustedY, left: adjustedX,
          width: modalWidth, backgroundColor: C.panelPop, borderRadius: 10, border: '1px solid var(--color-border)', 
          padding: '8px', boxShadow: C.floatingMenuShadow,
          animation: 'fadeUp 0.1s ease-out', userSelect: 'none'
        }} 
        onClick={e => e.stopPropagation()}
      >
        {showHocRole && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8, padding: '0 4px', textTransform: 'uppercase', fontFamily: 'DM Sans, sans-serif' }}>HOC Relationship</div>
            {(['measurement', 'structural'] as HocPathRole[]).map((role) => {
              const isActive = activeHocRole === role
              return (
                <button
                  key={role}
                  onClick={() => {
                    onSave({ ...path, hocRole: role })
                    onClose()
                  }}
                  style={{
                    width: '100%', padding: '8px', borderRadius: 6, border: 'none',
                    backgroundColor: isActive ? 'rgb(var(--color-accent-rgb) / 0.15)' : 'transparent',
                    color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)',
                    textAlign: 'left', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'DM Sans, sans-serif'
                  }}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isActive ? 'rgb(var(--color-accent-rgb) / 0.1)' : C.floatingIconBg,
                    color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)'
                  }}>
                    {role === 'measurement' ? <TreeStructure size={14} weight={isActive ? 'bold' : 'regular'} /> : <ArrowRight size={14} weight={isActive ? 'bold' : 'regular'} />}
                  </div>
                  {role === 'measurement' ? 'Lower-order construct' : 'Structural path'}
                </button>
              )
            })}
            <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '8px 4px 10px' }} />
          </>
        )}
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8, padding: '0 4px', textTransform: 'uppercase', fontFamily: 'DM Sans, sans-serif' }}>Connector Style</div>
        {(['straight', 'curved', 'rightangle'] as const).map(s => {
          const Icon = s === 'straight' ? ArrowRight : s === 'curved' ? BezierCurve : ArrowElbowRight
          const isActive = path.style === s || (!path.style && s === 'straight')
          
          return (
            <button
              key={s}
              onClick={() => {
                onSave({ ...path, style: s })
                onClose()
              }}
              style={{
                width: '100%', padding: '8px', borderRadius: 6, border: 'none',
                backgroundColor: isActive ? 'rgb(var(--color-accent-rgb) / 0.15)' : 'transparent',
                color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)',
                textAlign: 'left', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'DM Sans, sans-serif'
              }}
            >
              <div style={{ 
                width: 24, height: 24, borderRadius: 4, 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: isActive ? 'rgb(var(--color-accent-rgb) / 0.1)' : C.floatingIconBg,
                color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)'
              }}>
                <Icon size={14} weight={isActive ? 'bold' : 'regular'} />
              </div>
              {s.charAt(0).toUpperCase() + s.slice(1).replace('angle', ' Angle')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function ContextMenuItem({ label, icon, disabled, onClick }: { label: string; icon: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) onClick()
      }}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        backgroundColor: 'transparent',
        border: 'none',
        color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
        fontSize: 13,
        fontFamily: 'DM Sans, sans-serif',
        cursor: disabled ? 'default' : 'pointer',
        textAlign: 'left',
        borderRadius: 4,
        width: '100%'
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = 'rgb(var(--color-accent-rgb) / 0.16)' }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      {icon}
      {label}
    </button>
  )
}

function TBtn({ onClick, title, children, active, disabled, id, activeTone, activeLabel }: { onClick: () => void; title?: string; children: React.ReactNode; active?: boolean; disabled?: boolean; id?: string; activeTone?: 'yellow' | 'green'; activeLabel?: string }) {
  const activeBackground = activeTone === 'green'
    ? C.success
    : activeTone === 'yellow'
      ? 'var(--color-accent)'
      : C.panelControlActive
  const activeBorder = activeTone === 'green'
    ? `1px solid ${C.successBorder}`
    : activeTone === 'yellow'
      ? '1px solid rgb(var(--color-accent-rgb) / 0.58)'
      : `1px solid ${C.floatingBorder}`
  const activeColor = activeTone === 'green'
    ? C.textOnSuccess
    : activeTone === 'yellow'
      ? C.textOnAccent
      : C.text
  return (
    <button id={id} onClick={onClick} title={title} disabled={disabled}
      style={{ 
        width: active && activeLabel ? 'auto' : 34,
        minWidth: active && activeLabel ? 74 : 34,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: active && activeLabel ? 6 : 0,
        padding: active && activeLabel ? '0 10px' : 0,
        borderRadius: 7, 
        backgroundColor: active ? activeBackground : 'transparent',
        border: active ? activeBorder : '1px solid transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.34 : 1,
        color: active ? activeColor : C.textSec,
      }}>
      {children}
      {active && activeLabel && (
        <span style={{ fontSize: 11, fontWeight: 800, color: activeColor, fontFamily: 'DM Sans, sans-serif' }}>
          {activeLabel}
        </span>
      )}
    </button>
  )
}

function SectionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.borderFaint}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </div>
  )
}

function CompassBtn({ onClick, children, active, style }: { onClick: () => void; children: React.ReactNode; active?: boolean; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick}
      style={{ 
        ...style, borderRadius: 4, backgroundColor: 'transparent', 
        border: active ? `1px solid ${C.floatingBorder}` : '1px solid transparent', 
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' 
      }}>
      {children}
    </button>
  )
}

function SmallBtn({ onClick, children, wide, active, style }: { onClick?: () => void; children: React.ReactNode; wide?: boolean; active?: boolean; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick}
      style={{ 
        width: wide ? 36 : 28, height: 28, borderRadius: 6, 
        backgroundColor: C.elevated, 
        border: active ? `1px solid ${C.floatingBorder}` : '1px solid transparent', 
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style 
      }}>
      {children}
    </button>
  )
}

// New floating bar button component
function FloatingBarBtn({ onClick, title, icon }: { onClick: () => void; title: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32, height: 32,
        borderRadius: 6,
        backgroundColor: 'transparent',
        border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background-color 0.2s',
      }}
      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
    >
      {icon}
    </button>
  )
}
