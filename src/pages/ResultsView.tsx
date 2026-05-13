import { useState, useRef, useEffect, useCallback, useMemo, type ElementType } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { dispatchToast } from '../components/Toast'
import { runBootstrapModel, runPlsPredictModel, runAdvancedAnalysisModel, type RunPlsRequest } from '../services/plsApi'
import {
  ArrowLeft,
  Table,
  FileCode,
  Code,
  ArrowSquareOut,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  ArrowsInSimple,
  ArrowsOutSimple,
  Graph,
  ChartBar,
  ChartLineUp,
  ChartPieSlice,
  ChartScatter,
  CirclesThree,
  CaretDown,
  CaretRight,
  Copy,
  Database,
  Download,
  FlowArrow,
  CheckCircle,
  Gauge,
  GitBranch,
  Info,
  ListChecks,
  Scales,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TerminalWindow,
  TreeStructure,
  WaveSine,
  Folders,
  Check,
} from '@phosphor-icons/react'
import PathDiagramSVG from '../components/PathDiagram'
import { readDatasetViewCache } from '../utils/datasetViewCache'
import { resolveDatasetFilePathFromRequest } from '../utils/datasetLoading'
import { getLinkedDatasetForModel, migrateWorkspace } from '../utils/datasetWorkspace'
import { readWorkspaceClientCache, writeWorkspaceClientCache } from '../utils/workspaceClientCache'
import {
  getAnalysisToneColor,
  getAnalysisToneBadgeClass,
  getAnalysisToneTextClass,
  getOuterLoadingColor,
  getOuterLoadingTone,
  parseSignificancePValue,
} from '../utils/analysisPalette'
import BootstrapModal from '../components/BootstrapModal'
import PlsPredictModal from '../components/PlsPredictModal'
import AdvancedAnalysisModal, { type AdvancedAnalysisSettings } from '../components/AdvancedAnalysisModal'
import { ResultChart } from '../components/ResultsCharts'
import { APP_BRAND_NAME } from '../config/appBranding'
import { stripModelDisplayName } from '../utils/displayNames'
import { buildAnalysisGraphSignature } from '../utils/analysisGraphSignature'
import { getPanelSectionsForMode, type AnalysisMode, type PanelIconKey } from '../results/panelCatalog'
import { getPanelDataFromResults } from '../results/panelData'
import { classifyPanelEmptyState, getBaseModelReferenceLabel, rowsContainOnlyMessage } from '../results/panelDiagnostics'
import { getExportSectionTitles, getModeResultsLabel, getPanelTitle } from '../results/panelExport'
import { buildClipboardTableHtml, buildClipboardTableText, type ExportTableSection } from '../results/clipboardTables'
import { deriveSpecificIndirectRows } from '../results/panelDerivedData'
import {
  buildConstructIndicatorLookup,
  buildMeasurementMatrix,
  extractPlsLmComparisonRows,
  extractQ2PredictRows,
  formatBottleneckDisplayValue,
  formatPreciseNumber,
  getDefaultPanelTableView,
  getPanelTableViews,
  isBootstrapSignificancePanel,
  buildIndirectEffectPairLookup,
  buildTotalEffectPairLookup,
  normalizeBootstrapSignificanceRows,
  normalizeIndexedTableLabel,
  shouldRenderBlankPanelCell,
  type PanelCellDisplayContext,
  type BootstrapIntervalView,
  type ResultsTableView,
} from '../results/panelTableData'
import {
  normalizePlsPredictSettings,
  readPlsPredictSettingsFromResults,
  readPlsPredictSettingsFromState,
  type PlsPredictSettings,
} from '../utils/plsPredictSettings'
import { useCalculationDispatch, useIsCalculating, type CalcPhase } from '../state/calculationContext'

// ─── Display mode option lists (from Pencil ui.pen spec) ─────────────────────
const STRUCTURAL_OPTIONS  = ['Blank', 'Correlations', 'Indirect effects', 'Path coefficients', 'Total effects']
const MEASUREMENT_OPTIONS = ['Blank', 'Outer loadings', 'Outer weights', 'Outer weights / loadings']
const CONSTRUCT_OPTIONS   = ['Blank', 'Average variance extracted (AVE)', 'Composite reliability (rhoa)', 'Composite reliability (rhoc)', "Cronbach's alpha", 'R-square', 'R-square adjusted']

const EXPORT_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 246.27 322.64" aria-hidden="true" fill="currentColor">
  <polygon points="196.35 238.72 53.7 322.64 74.68 127.55 196.35 238.72"/>
  <polygon points="153.13 189.64 74.68 117.7 246.27 0 153.13 189.64"/>
  <path d="M49.09,294.95L0,46.57c10.52,10.23,20.82,20.72,31.05,31.25,12.73,13.09,25.47,26.34,37.74,39.88-2.74,30.83-6.68,61.54-10.05,92.3-3.03,27.62-5.07,56.05-8.8,83.5-.09.63-.06,1.29-.85,1.46Z"/>
</svg>
`

const EXPORT_COPY_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" aria-hidden="true" fill="currentColor">
  <path d="M216,32H88A8,8,0,0,0,80,40V80H40A8,8,0,0,0,32,88V216A8,8,0,0,0,40,224H168A8,8,0,0,0,176,216V176H216A8,8,0,0,0,224,168V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88A8,8,0,0,0,168,80H96V48H208Z"/>
</svg>
`

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface PathRow {
  path: string
  coefficient: number
  tStatistic: number
  pValue: string
  ci25: number
  ci975: number
  status: 'pass' | 'neutral' | 'fail'
}

interface RSquareRow {
  construct: string
  r2: number
  r2Adjusted: number
  assessment: string
  status: 'pass' | 'neutral'
}

interface ReliabilityRow {
  construct: string
  cronbach: string
  rhoA: string
  rhoCc: string
  ave: string
  status: 'pass' | 'neutral'
}

interface OuterLoadingRow {
  indicator: string
  construct: string
  loading: number
  tStatistic: number
  pValue: string
  status: 'pass' | 'neutral' | 'fail'
}

interface VIFRow {
  predictor: string
  endogenous: string
  vif: number
  status: 'pass' | 'neutral' | 'fail'
}

interface VIFSections {
  inner: VIFRow[]
  outer: VIFRow[]
}

interface ModelFitRow {
  index: string
  value: string | number
  threshold: string
  status: 'pass' | 'neutral'
}

interface SidebarItem {
  id: string
  label: string
  icon: ElementType
  isLeaf?: boolean
}

interface SidebarSection {
  id: string
  label: string
  defaultOpen: boolean
  tone?: 'default' | 'subtle'
  items: SidebarItem[]
}

const RESULTS_PANEL_BACKGROUND = 'var(--color-right-panel-bg)'
const RESULTS_TABLE_ROW_BACKGROUND = RESULTS_PANEL_BACKGROUND
const RESULTS_TABLE_ROW_ALT_BACKGROUND = 'rgb(var(--color-accent-rgb) / 0.025)'

function resultsTableRowStyle(index: number) {
  return {
    background: index % 2 === 0
      ? RESULTS_TABLE_ROW_BACKGROUND
      : RESULTS_TABLE_ROW_ALT_BACKGROUND,
  }
}

const SIDEBAR_ICON_MAP: Record<PanelIconKey, ElementType> = {
  graph: Graph,
  table: Table,
  'file-code': FileCode,
  'check-circle': CheckCircle,
  info: Info,
  folders: Folders,
}

const PANEL_ICON_OVERRIDES: Record<string, ElementType> = {
  'path-coef': Graph,
  'total-indirect': GitBranch,
  'specific-indirect': TreeStructure,
  'total-effects': FlowArrow,
  'outer-loadings': ChartBar,
  'outer-weights': Gauge,
  reliability: ShieldCheck,
  discriminant: Scales,
  'cross-loadings': Table,
  'r-square': ChartLineUp,
  'f-square': ChartScatter,
  vif: Info,
  'model-fit': CheckCircle,
  'model-select': ListChecks,
  'latent-variables': Folders,
  'indicator-correlations': CirclesThree,
  'indicator-original': Database,
  'indicator-standardised': SlidersHorizontal,
  'execution-log': TerminalWindow,
  'htmt-confidence-intervals': ShieldCheck,
  'plspredict-mv-summary': Table,
  'plspredict-lv-summary': ChartPieSlice,
  'pls-lm-comparison': ChartBar,
  'q2-predict': Target,
  'mv-predictions-errors': WaveSine,
  'lv-predictions-errors': ChartLineUp,
  'plsem-mv-error-hist': ChartScatter,
  'plsem-lv-error-hist': ChartPieSlice,
  'cvpat-lv-summary': CheckCircle,
  'priority-map': Target,
  'construct-table': Database,
  'necessity-check': ShieldCheck,
  'ceiling-lines': ChartLineUp,
  'bottleneck-table': Gauge,
  'cipma-priorities': ListChecks,
}

function buildSidebarSections(mode: AnalysisMode): SidebarSection[] {
  return getPanelSectionsForMode(mode).map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      id: item.id,
      label: item.label,
      icon: PANEL_ICON_OVERRIDES[item.id] ?? SIDEBAR_ICON_MAP[item.iconKey],
      isLeaf: item.isLeaf,
    })),
  }))
}

function modelHasMediationPaths(savedModel: any): boolean {
  const paths = Array.isArray(savedModel?.paths) ? savedModel.paths : []
  if (paths.length < 2) return false

  const incomingByTarget = new Map<string, Set<string>>()
  const outgoingBySource = new Map<string, Set<string>>()

  paths.forEach((path: any) => {
    const from = String(path?.from ?? '')
    const to = String(path?.to ?? '')
    if (!from || !to || from === to) return

    if (!outgoingBySource.has(from)) outgoingBySource.set(from, new Set())
    outgoingBySource.get(from)?.add(to)

    if (!incomingByTarget.has(to)) incomingByTarget.set(to, new Set())
    incomingByTarget.get(to)?.add(from)
  })

  for (const [mid, sources] of incomingByTarget.entries()) {
    const targets = outgoingBySource.get(mid)
    if (!targets?.size) continue

    for (const source of sources) {
      for (const target of targets) {
        if (source !== target) return true
      }
    }
  }

  return false
}

// ============================================================================
// RESULT PARSERS  — extract real R/seminr data from analysisResults
// ============================================================================

function getDecimals() {
  const d = readSharedStorageValue('prefs:decimalPlaces')
  return d ? parseInt(d, 10) : 3
}

/** Number formatter respecting user decimal preferences */
function fmtNum(v: unknown): string {
  if (v == null) return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return typeof v === 'string' && v.trim() ? v.trim() : '—'
  return n.toFixed(getDecimals())
}

function toNum(v: unknown, fallback = Number.NaN): number {
  if (v == null) return fallback
  if (typeof v === 'string' && !v.trim()) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function getRowValue(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== 'object') return ''
  const raw = row.row ?? row.row_name ?? row.rowName ?? row.Row ?? row.ROW ?? row._row
  return String(raw ?? '').trim()
}

function isRowField(key: string): boolean {
  return ['row', 'row_name', 'rowname', 'row name', '_row'].includes(key.toLowerCase())
}

function isPValueHeader(header: string): boolean {
  const h = header.toLowerCase().replace(/\s+/g, ' ').trim()
  const compact = String(header ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  return (
    h.includes('p val') ||
    h === 'p_value' ||
    h === 'p-value' ||
    h === 'pvalue' ||
    compact === 'pvalue' ||
    compact === 'pval' ||
    compact === 'bootstrappvalue' ||
    compact === 'bootstrappval' ||
    compact.endsWith('pvalue') ||
    compact.endsWith('pval')
  )
}

function isSignificanceEffectHeader(header: string): boolean {
  const compact = normalizeMetricKey(header)
  return (
    compact === 'coefficient' ||
    compact === 'coef' ||
    compact === 'estimate' ||
    compact === 'loading' ||
    compact === 'weight' ||
    compact.includes('originalest') ||
    compact.includes('originalsample') ||
    compact.includes('bootstrapmean') ||
    compact.includes('samplemean')
  )
}

function parsePValue(value: unknown): number | null {
  return parseSignificancePValue(value)
}

function formatPValueDisplay(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (/^<\s*/.test(raw)) return raw.replace(/\s+/g, '').replace(/^<0\./, '<.')
  const parsed = parsePValue(value)
  if (parsed == null) return '—'
  if (parsed <= 0.001) return '<.001'
  return fmtNum(parsed)
}

function pStatus(p: string | number | null | undefined): 'pass' | 'neutral' | 'fail' {
  const parsed = parsePValue(p)
  if (parsed == null) return 'neutral'
  if (parsed < 0.05 || String(p).trim() === '<0.001' || String(p).trim() === '< 0.001') return 'pass'
  return 'fail'
}

function pSignificanceTone(p: unknown): 'pass' | 'fail' | null {
  const parsed = parsePValue(p)
  if (parsed == null) return null
  return parsed < 0.05 ? 'pass' : 'fail'
}

function significanceCellClass(pValue: unknown, enabled: boolean): string {
  if (!enabled) return ''
  const tone = pSignificanceTone(pValue)
  return tone ? `${getStatusColor(tone)} font-semibold` : ''
}

function normalizeMetricKey(key: string): string {
  return String(key ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function findMetricValue(
  row: Record<string, unknown> | null | undefined,
  candidates: string[],
): unknown {
  if (!row || typeof row !== 'object') return undefined
  const candidateSet = new Set(candidates.map((candidate) => normalizeMetricKey(candidate)))
  for (const [key, value] of Object.entries(row)) {
    if (isRowField(key)) continue
    if (candidateSet.has(normalizeMetricKey(key))) return value
  }
  return undefined
}

function toFiniteMetric(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'string' && !value.trim()) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function formatMetricValue(value: unknown): string {
  const n = toFiniteMetric(value)
  return n == null ? '—' : fmtNum(n)
}

function isTStatisticHeader(header: string): boolean {
  const compact = normalizeMetricKey(header)
  return compact === 'tstat' || compact === 'tstatistic' || compact === 'tvalue' || compact === 'tvalues'
}

function findPValueCell(row: Record<string, unknown> | null | undefined): unknown {
  if (!row || typeof row !== 'object') return undefined
  for (const [key, value] of Object.entries(row)) {
    if (isRowField(key)) continue
    if (isPValueHeader(key)) return value
  }
  return findMetricValue(row, ['p value', 'p_value', 'p-value', 'pvalue', 'bootstrap p val', 'bootstrap p value'])
}

function findTStatisticCell(row: Record<string, unknown> | null | undefined): unknown {
  if (!row || typeof row !== 'object') return undefined
  for (const [key, value] of Object.entries(row)) {
    if (isRowField(key)) continue
    if (isTStatisticHeader(key)) return value
  }
  return findMetricValue(row, ['t stat', 't statistic', 't value', 't_value', 'tstatistic', 't_values'])
}

function findEstimateCell(row: Record<string, unknown> | null | undefined): unknown {
  return findMetricValue(row, [
    'coefficient',
    'coef',
    'original est',
    'original estimate',
    'original_estimate',
    'original coefficient',
    'bootstrap mean',
    'estimate',
  ])
}

function findCiLowerCell(row: Record<string, unknown> | null | undefined): unknown {
  return findMetricValue(row, [
    '2.5% ci',
    '2.5%.ci',
    'x2.5..ci',
    'ci 2.5%',
    'ci 2.5',
    'lower ci',
    'lower',
    'ci25',
    'ci_25',
  ])
}

function findCiUpperCell(row: Record<string, unknown> | null | undefined): unknown {
  return findMetricValue(row, [
    '97.5% ci',
    '97.5%.ci',
    'x97.5..ci',
    'ci 97.5%',
    'ci 97.5',
    'upper ci',
    'upper',
    'ci975',
    'ci_975',
  ])
}

function approximateTwoTailedPValueFromT(tStatistic: unknown): number | null {
  const t = Math.abs(toNum(tStatistic, Number.NaN))
  if (!Number.isFinite(t)) return null

  // Normal approximation fallback when seminr returns t-values but omits explicit p-values.
  const erf = (x: number): number => {
    const sign = x < 0 ? -1 : 1
    const ax = Math.abs(x)
    const a1 = 0.254829592
    const a2 = -0.284496736
    const a3 = 1.421413741
    const a4 = -1.453152027
    const a5 = 1.061405429
    const p = 0.3275911
    const tVal = 1 / (1 + p * ax)
    const y = 1 - (((((a5 * tVal + a4) * tVal) + a3) * tVal + a2) * tVal + a1) * tVal * Math.exp(-ax * ax)
    return sign * y
  }

  const normalCdf = (value: number) => 0.5 * (1 + erf(value / Math.SQRT2))
  const pValue = 2 * (1 - normalCdf(t))
  return Math.min(1, Math.max(0, pValue))
}

function inferMeasurementRowIdentity(
  row: Record<string, unknown>,
  constructsMap?: Map<string, string>,
): { indicator: string; construct: string } {
  const rowLabel = getRowValue(row)
  const directIndicator = String(row.indicator ?? row.Indicator ?? '').trim()
  const directConstruct = String(row.construct ?? row.Construct ?? row.composite ?? '').trim()

  const knownPairs = constructsMap ? Array.from(constructsMap.entries()) : []
  const knownConstructs = new Set(knownPairs.map(([, construct]) => construct))

  const resolveFromIndicator = (indicator: string): { indicator: string; construct: string } => ({
    indicator,
    construct: constructsMap?.get(indicator) || directConstruct,
  })

  if (directIndicator) return resolveFromIndicator(directIndicator)
  if (!rowLabel) return { indicator: '', construct: directConstruct }

  if (constructsMap?.has(rowLabel)) {
    return { indicator: rowLabel, construct: constructsMap.get(rowLabel) || directConstruct }
  }

  const splitParts = rowLabel
    .split(/\s*(?:→|->|<-|←|~>|=>)\s*/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (splitParts.length >= 2) {
    for (let i = 0; i < splitParts.length - 1; i += 1) {
      const left = splitParts[i]
      const right = splitParts[i + 1]
      if (constructsMap?.has(left) && knownConstructs.has(right)) {
        return { indicator: left, construct: right }
      }
      if (constructsMap?.has(right) && knownConstructs.has(left)) {
        return { indicator: right, construct: left }
      }
    }
  }

  const compactLabel = rowLabel.replace(/\s+/g, '').toLowerCase()
  for (const [indicator, construct] of knownPairs) {
    const compactIndicator = indicator.replace(/\s+/g, '').toLowerCase()
    const compactConstruct = construct.replace(/\s+/g, '').toLowerCase()
    if (compactLabel.includes(compactIndicator) && compactLabel.includes(compactConstruct)) {
      return { indicator, construct }
    }
  }

  return resolveFromIndicator(rowLabel)
}

function coefColorFromP(p: string | number | null | undefined): string {
  return getAnalysisToneColor(pStatus(p))
}

/** Parse path coefficients from real R results. */
function parsePathCoefficients(ar: any): PathRow[] {
  const rows: any[] = ar?.final_results?.path_coefficients ?? []
  if (!rows.length) return []
  const parsePathLabel = (value: unknown): { from: string; to: string } => {
    const label = String(value ?? '').trim()
    if (!label) return { from: '', to: '' }
    const parts = label.split(/\s*(?:→|->|~>|=>)\s*/)
    if (parts.length >= 2) {
      return {
        from: String(parts[0] ?? '').trim(),
        to: String(parts[1] ?? '').trim(),
      }
    }
    return { from: label, to: '' }
  }
  return rows.map((r: any) => {
    const parsedPath = parsePathLabel(r.path ?? getRowValue(r) ?? r.Path ?? r.relationship)
    const from = String(r.from ?? r.From ?? parsedPath.from ?? '').trim()
    const to   = String(r.to ?? r.To ?? parsedPath.to ?? '').trim()
    const coef = toNum(findEstimateCell(r), Number.NaN)
    const tStat = toNum(findTStatisticCell(r), Number.NaN)
    const pValueCell = findPValueCell(r)
    const rawPText = pValueCell == null ? '' : String(pValueCell).trim()
    const derivedPValue = rawPText ? null : approximateTwoTailedPValueFromT(tStat)
    const pVal = rawPText || (derivedPValue != null ? String(derivedPValue) : '—')
    const ci25 = toNum(findCiLowerCell(r), Number.NaN)
    const ci975 = toNum(findCiUpperCell(r), Number.NaN)
    return {
      path: to ? `${from} → ${to}` : from,
      coefficient: coef,
      tStatistic: tStat,
      pValue: pVal,
      ci25,
      ci975,
      status: pStatus(pVal),
    } as PathRow
  })
}

/** Build cross-matrix (columns = endogenous, rows = exogenous) from path rows. */
function buildCrossMatrix(rows: PathRow[]) {
  const toSet = new Set<string>()
  const fromSet = new Set<string>()
  rows.forEach(r => {
    const [f, t] = r.path.split(' → ')
    if (f) fromSet.add(f); if (t) toSet.add(t)
  })
  // endogenous constructs form columns
  const cols = Array.from(toSet)
  // exogenous constructs form rows — constructs that appear as 'from'
  const matRows = Array.from(fromSet).map(id => {
    const data: Record<string, number | null> = {}
    cols.forEach(col => {
      const match = rows.find(r => r.path === `${id} → ${col}`)
      data[col] = match ? match.coefficient : null
    })
    return { id, data }
  })
  return { cols, matRows }
}

/** Parse R-square from real R results. */
function parseRSquare(ar: any): RSquareRow[] {
  const raw: any[] = ar?.quality_criteria?.r_square ?? []
  if (!raw.length) return []
  return raw
    .map((r: any) => {
      const construct = String(r.construct ?? r.Construct ?? getRowValue(r) ?? '').trim()
      const r2 = toNum(findMetricValue(r, ['r2', 'r^2', 'r square', 'r-square']), Number.NaN)
      const r2Adjusted = toNum(
        findMetricValue(r, [
          'adjr2',
          'adj r2',
          'adj r^2',
          'adjr^2',
          'adj r square',
          'adjr square',
          'r2 adjusted',
          'r^2 adjusted',
          'r square adjusted',
          'r-square adjusted',
          'adjusted r2',
          'adjusted r^2',
          'r2 adj',
          'r^2 adj',
          'r2_adj',
          'r2adj',
        ]),
        Number.NaN
      )
      if (!construct || (!Number.isFinite(r2) && !Number.isFinite(r2Adjusted))) return null
      const assessmentBase = Number.isFinite(r2) ? r2 : r2Adjusted
      const assessment =
        assessmentBase >= 0.75 ? 'Substantial' :
        assessmentBase >= 0.50 ? 'Large' :
        assessmentBase >= 0.25 ? 'Moderate' :
        'Weak'
      const status: 'pass' | 'neutral' = assessmentBase >= 0.50 ? 'pass' : 'neutral'
      return {
        construct,
        r2,
        r2Adjusted,
        assessment,
        status,
      }
    })
    .filter((row): row is RSquareRow => row !== null)
}

/** Parse construct reliability from real seminr summary$reliability matrix. */
function parseReliability(ar: any): ReliabilityRow[] {
  const raw: any[] = ar?.quality_criteria?.reliability ?? []
  if (!raw.length) return []
  // seminr returns rows keyed by construct name; field names vary by version
  return raw.map((r: any) => {
    const cronbach = findMetricValue(r, ['alpha', "cronbach's alpha", 'cronbach alpha', 'cronbach_alpha', 'cronbach'])
    const rhoA = findMetricValue(r, ['rho_a', 'rho a', 'rhoa'])
    const rhoCc = findMetricValue(r, ['rho_c', 'rho c', 'rhoc', 'rhocc', 'cr', 'composite reliability', 'composite_reliability'])
    const ave = findMetricValue(r, ['ave', 'average variance extracted', 'average_variance_extracted'])
    const construct = String(getRowValue(r) || (r.construct ?? r.Construct ?? ''))
    const aveNum = toFiniteMetric(ave)
    const rhoCcNum = toFiniteMetric(rhoCc)
    const status: 'pass' | 'neutral' = (aveNum ?? Number.NaN) >= 0.5 && (rhoCcNum ?? Number.NaN) >= 0.7 ? 'pass' : 'neutral'
    return {
      construct,
      cronbach: formatMetricValue(cronbach),
      rhoA: formatMetricValue(rhoA),
      rhoCc: formatMetricValue(rhoCc),
      ave: formatMetricValue(ave),
      status,
    } as ReliabilityRow
  })
}

/** Parse outer loadings from real seminr summary$loadings matrix or bootstrap results. */
function parseOuterLoadings(ar: any, constructsMap?: Map<string, string>): OuterLoadingRow[] {
  const rawFinal: any[] = ar?.final_results?.outer_loadings ?? []
  const raw = rawFinal
  if (!raw.length) return []

  const result: OuterLoadingRow[] = []

  const hasOriginalEst = raw.some(r => r && findEstimateCell(r) !== undefined)

  if (hasOriginalEst) {
    raw.forEach((r: any) => {
      const identity = inferMeasurementRowIdentity(r, constructsMap)
      const indicator = identity.indicator
      const loading = toNum(findEstimateCell(r), Number.NaN)
      if (!indicator || !Number.isFinite(loading)) return
      const construct = identity.construct || 'Unknown'
      const tStatistic = toNum(findTStatisticCell(r), Number.NaN)
      const pValueCell = findPValueCell(r)
      const rawPText = pValueCell == null ? '' : String(pValueCell).trim()
      const derivedPValue = rawPText ? null : approximateTwoTailedPValueFromT(tStatistic)
      const pValue = rawPText || (derivedPValue != null ? String(derivedPValue) : '—')
      result.push({
        indicator,
        construct,
        loading,
        tStatistic,
        pValue,
        status: getOuterLoadingTone(loading) ?? 'neutral',
      })
    })
    return result
  }

  raw.forEach((r: any) => {
    const identity = inferMeasurementRowIdentity(r, constructsMap)
    const indicator = identity.indicator
    if (!indicator) return
    Object.keys(r).filter(k => !isRowField(k)).forEach(construct => {
      const v = r[construct]
      const loading = toNum(v, Number.NaN)
      if (!Number.isFinite(loading) || loading === 0) return
      result.push({
        indicator,
        construct,
        loading,
        tStatistic: Number.NaN,
        pValue: '—',
        status: getOuterLoadingTone(loading) ?? 'neutral',
      })
    })
  })
  return result
}

/** Parse outer weights (same structure as outer loadings). */
function parseOuterWeights(ar: any, constructsMap?: Map<string, string>): OuterLoadingRow[] {
  const rawFinal: any[] = ar?.final_results?.outer_weights ?? []
  const raw = rawFinal
  if (!raw.length) return []

  const result: OuterLoadingRow[] = []

  const hasOriginalEst = raw.some(r => r && findEstimateCell(r) !== undefined)

  if (hasOriginalEst) {
    raw.forEach((r: any) => {
      const identity = inferMeasurementRowIdentity(r, constructsMap)
      const indicator = identity.indicator
      const loading = toNum(findEstimateCell(r), Number.NaN)
      if (!indicator || !Number.isFinite(loading)) return
      const construct = identity.construct || 'Unknown'
      const tStatistic = toNum(findTStatisticCell(r), Number.NaN)
      const pValueCell = findPValueCell(r)
      const rawPText = pValueCell == null ? '' : String(pValueCell).trim()
      const derivedPValue = rawPText ? null : approximateTwoTailedPValueFromT(tStatistic)
      const pValue = rawPText || (derivedPValue != null ? String(derivedPValue) : '—')
      result.push({
        indicator,
        construct,
        loading,
        tStatistic,
        pValue,
        status: pStatus(pValue),
      })
    })
    return result
  }

  raw.forEach((r: any) => {
    const indicator = String(getRowValue(r) || (r.indicator ?? '')).trim()
    if (!indicator) return
    Object.keys(r).filter(k => !isRowField(k)).forEach(construct => {
      const loading = toNum(r[construct], Number.NaN)
      if (!Number.isFinite(loading) || loading === 0) return
      result.push({ indicator, construct, loading, tStatistic: Number.NaN, pValue: '—', status: 'neutral' })
    })
  })
  return result
}

/** Parse VIF matrix rows into table rows. */
function parseVIFRows(raw: any, predictorLookup?: Map<string, string[]>): VIFRow[] {
  if (!raw) return []
  // Normalise to array: R may serialise a named list as a plain object instead of an array.
  const rows: any[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'object'
      ? Object.entries(raw as Record<string, unknown>).map(([endogenous, preds]) =>
          typeof preds === 'object' && preds !== null
            ? { row_name: endogenous, ...(preds as object) }
            : { row_name: endogenous, value: preds }
        )
      : []
  if (!rows.length) return []
  const numericBaseByEndogenous = new Map<string, 0 | 1>()
  rows.forEach((r: any) => {
    const endogenous = String(r.endogenous ?? r.construct ?? r.to ?? r.row_name ?? '').trim()
    if (!endogenous) return

    const predictorLabels = [
      r.predictor,
      r.item,
      r.indicator,
      r.from,
      ...Object.keys(r).filter(k => !['row', 'row_name', 'rowname', 'row name', 'endogenous', 'construct', 'method'].includes(k.toLowerCase())),
    ].map((label) => String(label ?? '').trim())

    if (predictorLabels.includes('0')) {
      numericBaseByEndogenous.set(endogenous, 0)
    } else if (!numericBaseByEndogenous.has(endogenous)) {
      numericBaseByEndogenous.set(endogenous, 1)
    }
  })
  const result: VIFRow[] = []
  rows.forEach((r: any) => {
    const longVif = toNum(r.vif ?? r.VIF ?? r.value, NaN)
    const longEndogenous = String(r.endogenous ?? r.construct ?? r.to ?? r.row_name ?? '')
    const predictorCandidates = predictorLookup?.get(longEndogenous) ?? []
    const numericBase = numericBaseByEndogenous.get(longEndogenous) ?? 1
    const normalizePredictorName = (value: string): string => normalizeIndexedTableLabel(value, predictorCandidates, numericBase)
    const longPredictor = normalizePredictorName(String(r.predictor ?? r.item ?? r.indicator ?? r.from ?? ''))

    if (Number.isFinite(longVif) && longVif > 0 && longPredictor && longEndogenous) {
      result.push({
        predictor: longPredictor,
        endogenous: longEndogenous,
        vif: longVif,
        status: longVif < 5 ? 'pass' : 'fail',
      })
      return
    }

    const endogenous = String(r.row_name ?? r.endogenous ?? r.construct ?? '')
    if (!endogenous) return
    Object.keys(r)
      .filter(k => !['row', 'row_name', 'rowname', 'row name', 'endogenous', 'construct', 'method'].includes(k.toLowerCase()))
      .forEach(predictor => {
        const predictorName = normalizePredictorName(predictor)
        const vif = toNum(r[predictor], NaN)
        if (!Number.isFinite(vif) || vif <= 0) return
        result.push({ predictor: predictorName, endogenous, vif, status: vif < 5 ? 'pass' : 'fail' })
      })
  })
  return result
}

function dedupeVIFRows(rows: VIFRow[]): VIFRow[] {
  const seen = new Set<string>()
  const deduped: VIFRow[] = []
  rows.forEach((row) => {
    const key = `${row.predictor.toLowerCase()}|${row.endogenous.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    deduped.push(row)
  })
  return deduped
}

/** Parse VIF from both inner (construct) and outer (indicator) sections. */
function parseVIF(ar: any, savedModel?: { constructs?: CanvasConstruct[]; paths?: CanvasPath[] } | null): VIFSections {
  const predictorLookup = buildPredictorLookup(savedModel)
  const indicatorLookup = buildConstructIndicatorLookup(savedModel)
  const innerRaw: any[] =
    ar?.quality_criteria?.inner_vif ??
    ar?.quality_criteria?.vif ??
    ar?.quality_criteria?.vif_antecedents ??
    []

  const outerRaw: any[] =
    ar?.quality_criteria?.outer_vif ??
    ar?.quality_criteria?.vif_items ??
    ar?.quality_criteria?.outer_model_vif ??
    []

  return {
    inner: dedupeVIFRows(parseVIFRows(innerRaw, predictorLookup)),
    outer: dedupeVIFRows(parseVIFRows(outerRaw, indicatorLookup)),
  }
}

/** Parse model fit from the PLS quality criteria payload. */
function parseModelFit(ar: any): ModelFitRow[] {
  const rawSource =
    ar?.quality_criteria?.model_fit ??
    ar?.quality_criteria?.fit_indices ??
    []

  const raw: any[] = Array.isArray(rawSource)
    ? rawSource
    : (rawSource && typeof rawSource === 'object' ? [rawSource] : [])

  const normalizeIndex = (value: unknown): string =>
    String(value ?? '')
      .trim()
      .replace(/[\s\-]+/g, '_')
      .toUpperCase()

  const displayIndex = (normalized: string): string => {
    const MAP: Record<string, string> = {
      SRMR: 'SRMR',
      NFI: 'NFI',
      D_ULS: 'd_ULS',
      D_G: 'd_G',
      RMS_THETA: 'RMS_theta',
    }
    return MAP[normalized] ?? normalized
  }

  const THRESHOLDS: Record<string, { threshold: string; test: (v: number) => boolean }> = {
    SRMR:      { threshold: '< 0.08',  test: v => v < 0.08 },
    NFI:       { threshold: '> 0.90',  test: v => v > 0.90 },
    RMS_THETA: { threshold: '< 0.12',  test: v => v < 0.12 },
    D_ULS:     { threshold: 'HI95 comparison', test: () => false },
    D_G:       { threshold: 'HI95 comparison', test: () => false },
  }
  const ALLOWED_INDICES = new Set(['SRMR', 'NFI', 'D_ULS', 'D_G'])

  const metricCandidates: Array<{ index: string; value: unknown }> = []
  raw.forEach((r: any) => {
    const rowIndex = r.row ?? r.row_name ?? r.rowName ?? r.index ?? r.criteria
    // Only treat rowIndex as the metric name when an explicit numeric 'value' field is present.
    // When it_criteria comes back as a matrix ("Saturated Model" / "Estimated Model" rows),
    // row_name is a model type — not a metric — so we must expand all numeric columns instead.
    if (rowIndex != null && String(rowIndex).trim() && r.value != null) {
      metricCandidates.push({ index: String(rowIndex), value: r.value })
      return
    }

    // Expand every numeric column as a separate metric candidate.
    // This handles both the no-rowIndex case and the matrix-row-name case.
    Object.entries(r).forEach(([key, value]) => {
      if (['row', 'row_name', 'rowname', 'index', 'criteria', 'method'].includes(key.toLowerCase())) return
      const n = toNum(value, NaN)
      if (!Number.isFinite(n)) return
      metricCandidates.push({ index: key, value })
    })
  })

  const directSrmr = ar?.quality_criteria?.srmr
  if (directSrmr != null) {
    metricCandidates.push({ index: 'SRMR', value: directSrmr })
  }

  const seen = new Set<string>()
  const parsed: ModelFitRow[] = []
  metricCandidates.forEach((candidate) => {
    const normalizedIndex = normalizeIndex(candidate.index)
    if (!normalizedIndex || !ALLOWED_INDICES.has(normalizedIndex) || seen.has(normalizedIndex)) return
    seen.add(normalizedIndex)

    const cfg = THRESHOLDS[normalizedIndex]
    const numVal = toNum(candidate.value, NaN)
    const status: 'pass' | 'neutral' =
      cfg && Number.isFinite(numVal) ? (cfg.test(numVal) ? 'pass' : 'neutral') : 'neutral'

    parsed.push({
      index: displayIndex(normalizedIndex),
      value: Number.isFinite(numVal) ? numVal : String(candidate.value ?? '—'),
      threshold: cfg?.threshold ?? '—',
      status,
    })
  })

  // Ensure SRMR is always present (even if missing from input)
  if (!parsed.some(row => row.index === 'SRMR')) {
    const srmr = ar?.quality_criteria?.srmr
    if (srmr != null) {
      const numVal = toNum(srmr, NaN)
      parsed.unshift({
        index: 'SRMR',
        value: Number.isFinite(numVal) ? numVal : String(srmr),
        threshold: THRESHOLDS.SRMR.threshold,
        status: Number.isFinite(numVal) && THRESHOLDS.SRMR.test(numVal) ? 'pass' : 'neutral',
      })
    }
  }

  return parsed
}

/** Parse execution log messages. */
function parseExecutionLog(ar: any): string {
  const logs: any[] = ar?.algorithm?.execution_log ?? ar?.execution_log ?? []
  if (!logs.length) return 'No execution log available.'
  return logs.map((l: any) => {
    const msg = typeof l === 'string' ? l : (l.message ?? JSON.stringify(l))
    return `[R/seminr] ${msg}`
  }).join('\n')
}

function normalizeAnalysisFailureMessage(error: unknown): string {
  const raw = String(error || '').trim()
  const msg = raw.toLowerCase()
  if (/stopped responding|too heavy for the machine|could not finish receiving|could not complete.*request/.test(msg)) {
    return 'The analysis engine stopped responding during this run. Try fewer samples, close other heavy apps, or restart Metis and run it again.'
  }
  if (/failed to fetch|fetch failed|network|cannot reach local pls backend/.test(msg)) {
    return 'Metis lost connection to the local analysis engine. Please restart Metis and try the analysis again.'
  }
  return raw || 'Unknown backend error'
}

/** Build DiagramResults from analysisResults for PathDiagramSVG overlay. */
function buildDiagramResults(
  ar: any,
  canvasConstructs?: CanvasConstruct[],
  canvasPaths?: Array<{ from: string; to: string }>,
  fallbackAr?: any,
): import('../components/PathDiagram').DiagramResults {
  const constructScores: Record<string, any> = {}
  const pathResults: Record<string, any> = {}
  const measurementResults: Record<string, { loading?: number; weight?: number }> = {}

  // Pre-build indicator → construct name map from canvas model (used for bootstrap format)
  const indicatorConstructMap = new Map<string, string>()
  ;(canvasConstructs ?? []).forEach((c) => {
    ;(c.indicators ?? []).forEach((ind) => {
      indicatorConstructMap.set(String(ind.name ?? '').trim(), c.name)
    })
  })

  const nameById = new Map<string, string>()
  const idByName = new Map<string, string>()
  ;(canvasConstructs ?? []).forEach((c) => {
    nameById.set(c.id, c.name)
    idByName.set(c.name, c.id)
  })

  const setConstructScore = (nameOrId: string, partial: Record<string, number>) => {
    if (!nameOrId) return
    constructScores[nameOrId] = { ...(constructScores[nameOrId] ?? {}), ...partial }
    const asId = idByName.get(nameOrId)
    const asName = nameById.get(nameOrId)
    if (asId) constructScores[asId] = { ...(constructScores[asId] ?? {}), ...partial }
    if (asName) constructScores[asName] = { ...(constructScores[asName] ?? {}), ...partial }
  }

  const setPathResult = (from: string, to: string, partial: Record<string, number>) => {
    if (!from || !to) return
    const nameKey = `${from}-${to}`
    pathResults[nameKey] = { ...(pathResults[nameKey] ?? {}), ...partial }

    const fromId = idByName.get(from)
    const toId = idByName.get(to)
    if (fromId && toId) {
      const idKey = `${fromId}-${toId}`
      pathResults[idKey] = { ...(pathResults[idKey] ?? {}), ...partial }
    }
  }

  const upsertMeasurement = (construct: string, indicator: string, partial: { loading?: number; weight?: number }) => {
    if (!construct || !indicator) return
    const nameKey = `${construct}::${indicator}`
    measurementResults[nameKey] = { ...(measurementResults[nameKey] ?? {}), ...partial }

    const constructId = idByName.get(construct)
    if (constructId) {
      const idKey = `${constructId}::${indicator}`
      measurementResults[idKey] = { ...(measurementResults[idKey] ?? {}), ...partial }
    }
  }

  const applySource = (source: any) => {
    if (!source) return

    parseRSquare(source).forEach((row) => {
      setConstructScore(row.construct, {
        r2: row.r2,
        r2Adj: row.r2Adjusted,
      })
    })

    parseReliability(source).forEach((row) => {
      setConstructScore(row.construct, {
        ave: toNum(row.ave, NaN),
        rhoA: toNum(row.rhoA, NaN),
        rhoC: toNum(row.rhoCc, NaN),
        cronbach: toNum(row.cronbach, NaN),
      })
    })

    parsePathCoefficients(source).forEach((row) => {
      const [from, to] = row.path.split(' → ')
      if (!from || !to) return
      const parsedPValue = parsePValue(row.pValue)
      const partial: Record<string, number> = {}
      if (Number.isFinite(row.coefficient)) partial.coef = row.coefficient
      if (parsedPValue != null) partial.pValue = parsedPValue
      if (!Object.keys(partial).length) return
      setPathResult(from, to, partial)
    })

    const totalRows: any[] = source?.final_results?.total_effects ?? []
    totalRows.forEach((r: any) => {
      const fromDirect = String(r.from ?? '')
      const toDirect = String(r.to ?? '')
      if (fromDirect && toDirect) {
        setPathResult(fromDirect, toDirect, { totalEffect: toNum(r.coefficient ?? r.value) })
        return
      }

      const fromRow = String(r.row_name ?? '')
      if (!fromRow) return
      Object.keys(r).filter((k) => k !== 'row_name').forEach((to) => {
        const v = toNum(r[to], NaN)
        if (!Number.isFinite(v) || v === 0) return
        setPathResult(fromRow, to, { totalEffect: v })
      })
    })

    const totalIndirectRows: any[] = source?.final_results?.total_indirect_effects ?? []
    totalIndirectRows.forEach((r: any) => {
      const fromDirect = String(r.from ?? '')
      const toDirect = String(r.to ?? '')
      if (fromDirect && toDirect) {
        setPathResult(fromDirect, toDirect, { indirectEffect: toNum(r.coefficient ?? r.value) })
        return
      }

      const fromRow = String(r.row_name ?? '')
      if (!fromRow) return
      Object.keys(r).filter((k) => k !== 'row_name').forEach((to) => {
        const v = toNum(r[to], NaN)
        if (!Number.isFinite(v) || v === 0) return
        setPathResult(fromRow, to, { indirectEffect: v })
      })
    })

    const fSquareRows: any[] = source?.quality_criteria?.f_square ?? []
    fSquareRows.forEach((r: any) => {
      const endogenous = String(r.row_name ?? r.endogenous ?? '')
      if (!endogenous) return
      Object.keys(r).filter((k) => k !== 'row_name').forEach((predictor) => {
        const f2 = toNum(r[predictor], NaN)
        if (!Number.isFinite(f2) || f2 === 0) return
        setPathResult(predictor, endogenous, { fSquare: f2 })
      })
    })

    const indicatorMap = new Map<string, string>()
    if (canvasConstructs) {
      canvasConstructs.forEach(c => {
        c.indicators?.forEach(ind => indicatorMap.set(ind.name, c.name))
      })
    }

    parseOuterLoadings(source, indicatorMap).forEach((row) => {
      upsertMeasurement(row.construct, row.indicator, { loading: row.loading })
    })

    parseOuterWeights(source, indicatorMap).forEach((row) => {
      upsertMeasurement(row.construct, row.indicator, { weight: row.loading })
    })

    const lvRows: any[] = source?.final_results?.latent_variables ?? []
    if (lvRows.length) {
      const numericRows = lvRows.map((row: any) => {
        const out: Record<string, number> = {}
        Object.entries(row).forEach(([k, v]) => {
          if (k === 'row_name') return
          const n = Number(v)
          if (Number.isFinite(n)) out[k] = n
        })
        return out
      })

      const variables = Array.from(new Set(numericRows.flatMap((r) => Object.keys(r))))

      const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
      const covariance = (a: number[], b: number[]) => {
        if (a.length < 2 || b.length < 2 || a.length !== b.length) return NaN
        const ma = mean(a)
        const mb = mean(b)
        const num = a.reduce((sum, _, i) => sum + (a[i] - ma) * (b[i] - mb), 0)
        return num / (a.length - 1)
      }

      variables.forEach((from) => {
        variables.forEach((to) => {
          if (from === to) return
          const a: number[] = []
          const b: number[] = []
          numericRows.forEach((row) => {
            const va = row[from]
            const vb = row[to]
            if (Number.isFinite(va) && Number.isFinite(vb)) {
              a.push(va)
              b.push(vb)
            }
          })

          if (a.length < 2) return
          const cov = covariance(a, b)
          if (!Number.isFinite(cov)) return
          const sda = Math.sqrt(covariance(a, a))
          const sdb = Math.sqrt(covariance(b, b))
          const cor = sda > 0 && sdb > 0 ? cov / (sda * sdb) : NaN

          const isModelEdge = (canvasPaths ?? []).some((p) => {
            const fromName = nameById.get(p.from) ?? p.from
            const toName = nameById.get(p.to) ?? p.to
            return fromName === from && toName === to
          })

          if (!isModelEdge) return
          const partial: Record<string, number> = { covariance: cov }
          if (Number.isFinite(cor)) partial.correlation = cor
          setPathResult(from, to, partial)
        })
      })
    }
  }

  if (fallbackAr) applySource(fallbackAr)
  applySource(ar)

  return { constructScores, pathResults, measurementResults }
}

function getByPath(obj: any, path: string | undefined): any {
  if (!obj || !path) return null
  return path.split('.').reduce((acc, key) => (acc && key in acc ? acc[key] : null), obj)
}

function rowsFromData(data: any): Array<Record<string, unknown>> {
  if (!data) return []
  if (Array.isArray(data)) {
    if (!data.length) return []
    if (typeof data[0] === 'object' && data[0] !== null) return data
    return data.map((value, index) => ({ index: index + 1, value }))
  }
  if (typeof data === 'object') {
    return Object.entries(data).map(([key, value]) => ({ key, value }))
  }
  return [{ value: data }]
}

function formatDisplayValue(
  value: unknown,
  header?: string,
  selectedPanel?: string,
  cellContext?: PanelCellDisplayContext
): string {
  if (shouldRenderBlankPanelCell(selectedPanel, header, value, cellContext)) return ''
  if (value == null) return '—'
  if (selectedPanel === 'bottleneck-table' && !isRowField(header ?? '')) {
    return formatBottleneckDisplayValue(value)
  }
  if (header && isPValueHeader(header)) return formatPValueDisplay(value)

  if (typeof value === 'number' && Number.isFinite(value)) {
    return fmtNum(value)
  }
  if (Array.isArray(value)) {
    if (!value.length) return '—'
    const firstNumeric = value.find((v) => typeof v === 'number' && Number.isFinite(v))
    if (typeof firstNumeric === 'number') {
      return fmtNum(firstNumeric)
    }
    const first = value[0]
    return typeof first === 'object' && first !== null ? formatDisplayValue(first, header, selectedPanel, cellContext) : String(first)
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const vals = Object.values(obj)
    const firstNumeric = vals.find((v) => typeof v === 'number' && Number.isFinite(v))
    if (typeof firstNumeric === 'number') {
      return fmtNum(firstNumeric)
    }
    if (vals.length) return formatDisplayValue(vals[0], header, selectedPanel, cellContext)
    return '—'
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return '—'
    const num = Number(trimmed)
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      return fmtNum(num)
    }
    return trimmed
  }
  return String(value)
}

function normalizeRowFields(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {}
  const rowVal = row.row ?? row.row_name ?? row.rowName ?? row.Row ?? row.ROW ?? row._row
  if (rowVal != null && String(rowVal).trim() !== '') {
    normalized.row = rowVal
  }

  Object.entries(row).forEach(([key, value]) => {
    if (isRowField(key)) return
    normalized[key] = value
  })

  return normalized
}

function formatRowsForDisplay(rows: Array<Record<string, unknown>>): Array<Record<string, string>> {
  return rows.map((row) => {
    const normalizedRow = normalizeRowFields(row)
    const out: Record<string, string> = {}
    Object.entries(normalizedRow).forEach(([key, value]) => {
      out[key] = formatDisplayValue(value, key)
    })
    return out
  })
}

function escapeHtml(value: unknown): string {
  const s = String(value ?? '')
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const EXPORT_CONSTRUCT_COLOR = '#87976B'
const EXPORT_CONSTRUCT_STROKE_COLOR = '#65744F'
const EXPORT_INDICATOR_COLOR = '#C6A24B'
const EXPORT_INDICATOR_STROKE_COLOR = '#9B7A2E'
const EXPORT_DIAGRAM_TEXT_COLOR = '#1A1F2B'
const EXPORT_DIAGRAM_MUTED_COLOR = '#5F6978'
const EXPORT_DIAGRAM_BORDER_COLOR = '#D7DDE6'
const EXPORT_DIAGRAM_SURFACE_COLOR = '#FFFFFF'

function buildPathDiagramSvg(
  model: { constructs: CanvasConstruct[]; paths: CanvasPath[] } | null,
  diagramResults: import('../components/PathDiagram').DiagramResults,
): string {
  if (!model?.constructs?.length) {
    return `<div style="padding:24px;color:${EXPORT_DIAGRAM_MUTED_COLOR}">No saved path diagram available.</div>`
  }

  const constructs = model.constructs
  const paths = model.paths ?? []
  const byId = Object.fromEntries(constructs.map(c => [c.id, c]))

  const indicatorEntries: Array<{
    constructId: string
    constructName: string
    name: string
    ix: number
    iy: number
    labelW: number
  }> = []

  constructs.forEach((c) => {
    if (c.folded) return
    c.indicators.forEach((ind, i) => {
      const { ix, iy, labelW } = getResultsIndicatorLayout(c, ind, i)
      indicatorEntries.push({ constructId: c.id, constructName: c.name, name: ind.name, ix, iy, labelW })
    })
  })

  const allX = [
    ...constructs.map(c => c.x - c.radius - 5),
    ...constructs.map(c => c.x + c.radius + 5),
    ...indicatorEntries.flatMap(i => [i.ix - i.labelW / 2, i.ix + i.labelW / 2]),
  ]
  const allY = [
    ...constructs.map(c => c.y - c.radius - 5),
    ...constructs.map(c => c.y + c.radius + 5),
    ...indicatorEntries.map(i => i.iy - RESULTS_INDICATOR_LABEL_H / 2),
    ...indicatorEntries.map(i => i.iy + RESULTS_INDICATOR_LABEL_H / 2),
  ]
  const PAD = 80
  const vbMinX = Math.min(...allX) - PAD
  const vbMinY = Math.min(...allY) - PAD
  const vbW = Math.max(...allX) - Math.min(...allX) + PAD * 2
  const vbH = Math.max(...allY) - Math.min(...allY) + PAD * 2

  const markerDefs = `
    <defs>
      <marker id="exp-arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon points="0 0,8 3,0 6" fill="${EXPORT_CONSTRUCT_COLOR}"></polygon>
      </marker>
      <marker id="exp-arr-measure" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon points="0 0,8 3,0 6" fill="${EXPORT_INDICATOR_COLOR}"></polygon>
      </marker>
    </defs>
  `

  // Draws a split arrow with a gap for the label
  const arrowPathSplit = (from: CanvasConstruct, to: CanvasConstruct, gap = 32): [string, string, {x: number, y: number}] => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1) return ['', '', {x: 0, y: 0}]
    const ux = dx / dist
    const uy = dy / dist
    const startX = from.x + ux * from.radius
    const startY = from.y + uy * from.radius
    const endX = to.x - ux * to.radius
    const endY = to.y - uy * to.radius
    const midX = (startX + endX) / 2
    const midY = (startY + endY) / 2
    // Move gap/2 away from midpoint in both directions
    const gapUx = ux * (gap / 2)
    const gapUy = uy * (gap / 2)
    const seg1X = midX - gapUx
    const seg1Y = midY - gapUy
    const seg2X = midX + gapUx
    const seg2Y = midY + gapUy
    // Path 1: start to before label, Path 2: after label to end
    const path1 = `M${startX},${startY} L${seg1X},${seg1Y}`
    const path2 = `M${seg2X},${seg2Y} L${endX},${endY}`
    return [path1, path2, {x: midX, y: midY}]
  }

  const indicatorPath = (
    cX: number,
    cY: number,
    iX: number,
    iY: number,
    iW: number,
    iH: number,
    r: number,
    type: 'Reflective' | 'Formative',
    direction: string,
  ): string => {
    const ux = iX - cX
    const uy = iY - cY
    const dist = Math.sqrt(ux * ux + uy * uy)
    if (dist < 1) return ''
    const lx = cX + (ux / dist) * r
    const ly = cY + (uy / dist) * r
    let ix = iX
    let iy = iY
    if      (direction === 'top')    iy += iH / 2
    else if (direction === 'bottom') iy -= iH / 2
    else if (direction === 'left')   ix += iW / 2
    else if (direction === 'right')  ix -= iW / 2
    if (type === 'Reflective') return `M${lx},${ly} L${ix},${iy}`
    return `M${ix},${iy} L${lx},${ly}`
  }

  const midPoint = (d: string, offset = 10): { x: number; y: number } => {
    const m = d.match(/M([\d.\-]+),([\d.\-]+)\s+L([\d.\-]+),([\d.\-]+)/)
    if (!m) return { x: 0, y: 0 }
    const x1 = Number(m[1]), y1 = Number(m[2]), x2 = Number(m[3]), y2 = Number(m[4])
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    return {
      x: (x1 + x2) / 2 - (dy / len) * offset,
      y: (y1 + y2) / 2 + (dx / len) * offset,
    }
  }

  const measurementMap = diagramResults.measurementResults ?? {}

  const measurementSvg = indicatorEntries.map((ind) => {
    const c = byId[ind.constructId]
    if (!c) return ''
    const dir = c.indicatorAlignment || c.indicatorDirection || 'bottom'
    // Compute indicator arrow split for label
    const ux = ind.ix - c.x
    const uy = ind.iy - c.y
    const dist = Math.sqrt(ux * ux + uy * uy)
    if (dist < 1) return ''
    const r = c.radius
    const startX = c.x + (ux / dist) * r
    const startY = c.y + (uy / dist) * r
    let ix = ind.ix, iy = ind.iy
    if      (dir === 'top')    iy += RESULTS_INDICATOR_LABEL_H / 2
    else if (dir === 'bottom') iy -= RESULTS_INDICATOR_LABEL_H / 2
    else if (dir === 'left')   ix += ind.labelW / 2
    else if (dir === 'right')  ix -= ind.labelW / 2
    // Split at midpoint for label
    const midX = (startX + ix) / 2
    const midY = (startY + iy) / 2
    const gap = 24
    const gapUx = (ix - startX) / dist * (gap / 2)
    const gapUy = (iy - startY) / dist * (gap / 2)
    const seg1X = midX - gapUx
    const seg1Y = midY - gapUy
    const seg2X = midX + gapUx
    const seg2Y = midY + gapUy
    const path1 = `M${startX},${startY} L${seg1X},${seg1Y}`
    const path2 = `M${seg2X},${seg2Y} L${ix},${iy}`
    const val = measurementMap[`${c.name}::${ind.name}`]?.loading
    const txt = Number.isFinite(val as number) ? `<text x="${midX}" y="${midY}" text-anchor="middle" font-size="9" fill="${EXPORT_INDICATOR_STROKE_COLOR}">${(val as number).toFixed(getDecimals())}</text>` : ''
    return `<g><path d="${path1}" stroke="${EXPORT_INDICATOR_COLOR}" stroke-width="1.2" fill="none"></path><path d="${path2}" stroke="${EXPORT_INDICATOR_COLOR}" stroke-width="1.2" fill="none" marker-end="url(#exp-arr-measure)"></path>${txt}</g>`
  }).join('')

  const pathSvg = paths.map((p) => {
    const from = byId[p.from]
    const to = byId[p.to]
    if (!from || !to) return ''
    const [path1, path2, mid] = arrowPathSplit(from, to, 40)
    const pathVal = diagramResults.pathResults?.[`${from.name}-${to.name}`]?.coef
    const txt = Number.isFinite(pathVal as number) ? `<text x="${mid.x}" y="${mid.y}" text-anchor="middle" font-size="11" font-weight="700" fill="${EXPORT_CONSTRUCT_STROKE_COLOR}">${(pathVal as number).toFixed(getDecimals())}</text>` : ''
    return `<g><path d="${path1}" stroke="${EXPORT_CONSTRUCT_COLOR}" stroke-width="1.8" fill="none"></path><path d="${path2}" stroke="${EXPORT_CONSTRUCT_COLOR}" stroke-width="1.8" fill="none" marker-end="url(#exp-arr)"></path>${txt}</g>`
  }).join('')

  const constructSvg = constructs.map((c) => {
    const hasIncoming = paths.some((path) => path.to === c.id)
    const r2 = diagramResults.constructScores?.[c.name]?.r2
    const r2Text = hasIncoming && Number.isFinite(r2 as number)
      ? `<text x="${c.x}" y="${c.y + 6}" text-anchor="middle" font-size="13" font-weight="700" fill="${EXPORT_DIAGRAM_TEXT_COLOR}">${(r2 as number).toFixed(getDecimals())}</text>`
      : ''
    return `
      <g>
        <circle cx="${c.x}" cy="${c.y}" r="${c.radius}" fill="${EXPORT_CONSTRUCT_COLOR}" stroke="${EXPORT_CONSTRUCT_STROKE_COLOR}" stroke-width="2"></circle>
        ${r2Text}
        <text x="${c.x}" y="${c.y + c.radius + 18}" text-anchor="middle" font-size="12" font-weight="700" fill="${EXPORT_DIAGRAM_TEXT_COLOR}">${escapeHtml(c.name)}</text>
      </g>
    `
  }).join('')

  const indicatorBoxes = indicatorEntries.map((ind) => `
    <g>
      <rect x="${ind.ix - ind.labelW / 2}" y="${ind.iy - RESULTS_INDICATOR_LABEL_H / 2}" width="${ind.labelW}" height="${RESULTS_INDICATOR_LABEL_H}" rx="4" fill="${EXPORT_INDICATOR_COLOR}" stroke="${EXPORT_INDICATOR_STROKE_COLOR}" stroke-width="1"></rect>
      <text x="${ind.ix}" y="${ind.iy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${EXPORT_DIAGRAM_TEXT_COLOR}">${escapeHtml(ind.name)}</text>
    </g>
  `).join('')

  return `
    <svg viewBox="${vbMinX} ${vbMinY} ${vbW} ${vbH}" width="100%" height="640" style="display:block;background:${EXPORT_DIAGRAM_SURFACE_COLOR};border:1px solid ${EXPORT_DIAGRAM_BORDER_COLOR};border-radius:10px">
      ${markerDefs}
      ${measurementSvg}
      ${pathSvg}
      ${indicatorBoxes}
      ${constructSvg}
    </svg>
  `
}

function formatResultTableHeader(header: string, selectedPanel?: string): string {
  const normalizedHeader = String(header ?? '').trim().replace(/[\s_-]+/g, '').toLowerCase()
  if (selectedPanel === 'necessity-check' && normalizedHeader === 'd') {
    return 'Effect size (d)'
  }
  if (normalizedHeader === 'row') {
    return 'Row'
  }
  return String(header ?? '').replace(/_/g, ' ')
}

function buildExportTableHtml(
  rows: Array<Record<string, unknown>>,
  selectedPanel?: string,
  getCellContext?: (row: Record<string, unknown>) => PanelCellDisplayContext | undefined
): string {
  if (!rows.length) {
    return '<div class="empty">No data available for this section.</div>'
  }
  const normalizedRows = rows.map((row) => normalizeRowFields(row))
  const headers = Array.from(new Set(normalizedRows.flatMap((row) => Object.keys(row))))
  const orderedHeaders = headers.includes('row') ? ['row', ...headers.filter((h) => h !== 'row')] : headers
  const thead = `<thead><tr>${orderedHeaders.map((h) => `<th>${escapeHtml(formatResultTableHeader(h, selectedPanel))}</th>`).join('')}</tr></thead>`
  const tbody = `<tbody>${normalizedRows.map((row) => {
    const cellContext = getCellContext?.(row)
    return `<tr>${orderedHeaders.map((h) => `<td>${escapeHtml(formatDisplayValue(row[h], h, selectedPanel, cellContext))}</td>`).join('')}</tr>`
  }).join('')}</tbody>`
  return `<div class="table-wrap"><table>${thead}${tbody}</table></div>`
}

function buildExportTableFromRows(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  if (!rows.length) {
    return '<div class="empty">No data available for this section.</div>'
  }
  const thead = `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>`
  const tbody = `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell == null ? '—' : String(cell))}</td>`).join('')}</tr>`).join('')}</tbody>`
  return `<div class="table-wrap"><table>${thead}${tbody}</table></div>`
}

// ============================================================================
// HELPERS
// ============================================================================

function getStatusColor(status: 'pass' | 'neutral' | 'fail'): string {
  return getAnalysisToneTextClass(status)
}

function getStatusBgColor(status: 'pass' | 'neutral' | 'fail'): string {
  return getAnalysisToneBadgeClass(status)
}

// ============================================================================
// SIDEBAR SECTION
// ============================================================================

function SidebarSectionComponent({
  section, selectedPanel, onSelectPanel,
}: {
  section: SidebarSection
  selectedPanel: string
  onSelectPanel: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(section.defaultOpen)
  const sectionLabelClass = section.tone === 'subtle'
    ? 'text-text-muted/80'
    : 'text-text-secondary'

  return (
    <div className={section.tone === 'subtle' ? 'mt-3 border-t border-white/5 pt-2' : ''}>
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer hover:bg-[rgb(var(--color-hover-rgb)/0.75)] select-none"
        onClick={() => setIsOpen(o => !o)}
      >
        {isOpen
          ? <CaretDown size={11} className="text-text-muted shrink-0" />
          : <CaretRight size={11} className="text-text-muted shrink-0" />}
        <span className={`text-[10px] font-semibold uppercase tracking-wider truncate ${sectionLabelClass}`}>
          {section.label}
        </span>
      </div>

      {isOpen && section.items.map(item => {
        const Icon = item.icon
        const sel = selectedPanel === item.id
        return (
          <div
            key={item.id}
            className={`flex items-center gap-2 pr-3 py-1.5 cursor-pointer text-xs transition-colors
              ${sel
                ? 'bg-primary/15 text-text-primary border-l-2 border-primary pl-[22px]'
                : 'pl-6 text-text-muted hover:text-text-secondary hover:bg-[rgb(var(--color-hover-rgb)/0.75)]'}`}
            onClick={() => onSelectPanel(item.id)}
          >
            <Icon size={13} className="shrink-0 opacity-70" />
            <span className="truncate">{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// CANVAS TYPES (match ModelCanvas structure, used for localStorage bridge)
// ============================================================================

interface CanvasConstruct {
  id: string; name: string; type: 'Reflective' | 'Formative'
  color: string; x: number; y: number; radius: number
  indicators: { name: string; loading: number; ox?: number; oy?: number }[]
  indicatorDirection?: 'top' | 'right' | 'bottom' | 'left'
  indicatorAlignment?: 'top' | 'right' | 'bottom' | 'left'
  folded?: boolean
}
interface CanvasPath { id: string; from: string; to: string }

const METIS_STORAGE_PREFIX = 'metis:'
const LEGACY_STORAGE_PREFIX = 'pls:'
const RESULTS_INDICATOR_STEP = 60
const RESULTS_INDICATOR_EDGE_GAP = 60
const RESULTS_INDICATOR_LABEL_H = 22
const RESULTS_MIN_INDICATOR_LABEL_W = 44

function buildStorageKey(prefix: string, suffix: string): string {
  return `${prefix}${suffix}`
}

function readSharedStorageValue(suffix: string): string | null {
  return localStorage.getItem(buildStorageKey(METIS_STORAGE_PREFIX, suffix))
    ?? localStorage.getItem(buildStorageKey(LEGACY_STORAGE_PREFIX, suffix))
}

function writeSharedStorageValue(suffix: string, value: string) {
  localStorage.setItem(buildStorageKey(METIS_STORAGE_PREFIX, suffix), value)
  localStorage.setItem(buildStorageKey(LEGACY_STORAGE_PREFIX, suffix), value)
}

function cloneResultsModelSnapshot(source?: { constructs: CanvasConstruct[]; paths: CanvasPath[] } | null): { constructs: CanvasConstruct[]; paths: CanvasPath[] } {
  return {
    constructs: (source?.constructs ?? []).map((construct) => ({
      ...construct,
      indicators: (construct.indicators ?? []).map((indicator) => ({ ...indicator })),
    })),
    paths: (source?.paths ?? []).map((path) => ({ ...path })),
  }
}

function resetResultsIndicatorLayout(construct: CanvasConstruct, nextAlignment: 'top' | 'right' | 'bottom' | 'left'): CanvasConstruct {
  return {
    ...construct,
    indicatorAlignment: nextAlignment,
    indicatorDirection: nextAlignment,
    indicators: construct.indicators.map((indicator) => ({ ...indicator, ox: 0, oy: 0 })),
  }
}

function getResultsIndicatorLayout(construct: CanvasConstruct, indicator: { name: string; ox?: number; oy?: number }, index: number, includeOffsets = true) {
  const dir = construct.indicatorAlignment || construct.indicatorDirection || 'bottom'
  const labelW = Math.max(RESULTS_MIN_INDICATOR_LABEL_W, indicator.name.length * 7 + 16)
  const offset = (index - (construct.indicators.length - 1) / 2) * RESULTS_INDICATOR_STEP
  const centerGap = construct.radius + RESULTS_INDICATOR_EDGE_GAP + (dir === 'left' || dir === 'right' ? labelW / 2 : RESULTS_INDICATOR_LABEL_H / 2)

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

  return { ix, iy, labelW, labelH: RESULTS_INDICATOR_LABEL_H, dir }
}

function readModelSnapshotFromWorkspaceCache(modelId?: string): { constructs: CanvasConstruct[]; paths: CanvasPath[] } | null {
  if (!modelId) return null
  try {
    const raw = readWorkspaceClientCache()
    const all = raw ? JSON.parse(raw) : []
    const workspace = Array.isArray(all)
      ? all.find((ws: any) => ws.children?.some((child: any) => child.id === modelId))
      : null
    if (!workspace) return null

    const migratedWorkspace = migrateWorkspace(workspace)
    const modelChild = migratedWorkspace.children?.find((child: any) => child.id === modelId && child.type === 'model') as any
    const snapshot = modelChild?.state?.constructs && modelChild?.state?.paths
      ? {
        constructs: modelChild.state.constructs as CanvasConstruct[],
        paths: modelChild.state.paths as CanvasPath[],
      }
      : null

    return snapshot ? cloneResultsModelSnapshot(snapshot) : null
  } catch {
    return null
  }
}

function readSavedModelSnapshot(modelId?: string): { constructs: CanvasConstruct[]; paths: CanvasPath[] } | null {
  const workspaceSnapshot = readModelSnapshotFromWorkspaceCache(modelId)
  if (workspaceSnapshot) return workspaceSnapshot

  if (modelId) return null

  try {
    const raw = readSharedStorageValue('results-canvas-model') || readSharedStorageValue('canvas-model')
    return raw ? cloneResultsModelSnapshot(JSON.parse(raw) as { constructs: CanvasConstruct[]; paths: CanvasPath[] }) : null
  } catch {
    return null
  }
}

function resolveSavedModelSnapshot(
  modelId?: string,
  navState?: { savedModelSnapshot?: { constructs: CanvasConstruct[]; paths: CanvasPath[] } | null } | null,
): { constructs: CanvasConstruct[]; paths: CanvasPath[] } | null {
  if (navState?.savedModelSnapshot) {
    return cloneResultsModelSnapshot(navState.savedModelSnapshot)
  }
  return readSavedModelSnapshot(modelId)
}

function buildPredictorLookup(savedModel: { constructs?: CanvasConstruct[]; paths?: CanvasPath[] } | null | undefined): Map<string, string[]> {
  const lookup = new Map<string, string[]>()
  if (!savedModel?.constructs?.length || !savedModel?.paths?.length) return lookup

  const nameById = new Map(savedModel.constructs.map((construct) => [construct.id, construct.name]))
  savedModel.paths.forEach((path) => {
    const from = nameById.get(path.from) || path.from
    const to = nameById.get(path.to) || path.to
    if (!from || !to) return
    lookup.set(to, [...(lookup.get(to) ?? []), from])
  })

  return lookup
}

// ============================================================================
// DIAGRAM CANVAS — zoom/pan, view-only
// ============================================================================

function DiagramCanvas({
  zoom, panX, panY, onZoomChange, onPanChange,
  structuralMode, measurementMode, constructMode,
  canvasConstructs, canvasPaths,
  results,
  onModelChange,
}: {
  zoom: number
  panX: number
  panY: number
  onZoomChange: (z: number) => void
  onPanChange: (x: number, y: number) => void
  structuralMode: string
  measurementMode: string
  constructMode: string
  canvasConstructs?: CanvasConstruct[]
  canvasPaths?: CanvasPath[]
  results?: any
  onModelChange?: (next: { constructs: CanvasConstruct[]; paths: CanvasPath[] }) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgWrapRef   = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  const panXRef = useRef(panX)
  const panYRef = useRef(panY)
  zoomRef.current = zoom
  panXRef.current = panX
  panYRef.current = panY

  const [selectedConstructIds, setSelectedConstructIds] = useState<string[]>([])
  const [selectedIndicatorKeys, setSelectedIndicatorKeys] = useState<string[]>([])
  const [hoveredConstructId, setHoveredConstructId] = useState<string | null>(null)

  type DiagramDragItem =
    | { type: 'construct'; id: string; originX: number; originY: number }
    | { type: 'indicator'; constructId: string; indicatorName: string; originOx: number; originOy: number }

  type DiagramInteraction =
    | { type: 'drag'; startX: number; startY: number; items: DiagramDragItem[] }
    | { type: 'resize'; id: string; centerX: number; centerY: number }

  const interactionRef = useRef<DiagramInteraction | null>(null)
  const isPanning  = useRef(false)
  const panStart   = useRef({ x: 0, y: 0, px: 0, py: 0 })

  // Right-click context menu
  const [ctxMenu, setCtxMenu] = useState<
    | { kind: 'canvas'; x: number; y: number }
    | { kind: 'construct'; x: number; y: number; constructId: string }
    | null
  >(null)
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [ctxMenu])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setCtxMenu({ kind: 'canvas', x: e.clientX, y: e.clientY })
  }

  function preparePathDiagramSvgForExport(svg: SVGSVGElement): SVGSVGElement {
    const exportSvg = svg.cloneNode(true) as SVGSVGElement
    exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    exportSvg.style.background = 'transparent'

    const vb = svg.viewBox.baseVal
    if (vb?.width && vb?.height) {
      exportSvg.setAttribute('width', String(Math.max(1, vb.width)))
      exportSvg.setAttribute('height', String(Math.max(1, vb.height)))
      exportSvg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`)
    }

    const rootStyles = getComputedStyle(document.documentElement)
    Array.from(rootStyles)
      .filter((name) => name.startsWith('--color-'))
      .forEach((name) => {
        const value = rootStyles.getPropertyValue(name).trim()
        if (value) exportSvg.style.setProperty(name, value)
      })

    const sourceElements = [svg, ...Array.from(svg.querySelectorAll('*'))]
    const exportElements = [exportSvg, ...Array.from(exportSvg.querySelectorAll('*'))]
    sourceElements.forEach((sourceEl, index) => {
      const exportEl = exportElements[index]
      if (!(sourceEl instanceof Element) || !(exportEl instanceof Element)) return

      const computed = getComputedStyle(sourceEl)
      const tagName = sourceEl.tagName.toLowerCase()
      const attrFill = exportEl.getAttribute('fill') ?? ''
      const attrStroke = exportEl.getAttribute('stroke') ?? ''
      const styleAttr = sourceEl.getAttribute('style') ?? ''
      const hasPaintFill = attrFill !== 'none' && (
        attrFill.includes('var(') ||
        styleAttr.includes('fill') ||
        tagName === 'text' ||
        tagName === 'rect' ||
        tagName === 'circle' ||
        tagName === 'ellipse' ||
        tagName === 'polygon'
      )

      if (hasPaintFill && computed.fill && computed.fill !== 'none') {
        exportEl.setAttribute('fill', computed.fill)
      }

      if (
        attrStroke &&
        attrStroke !== 'none' &&
        computed.stroke &&
        computed.stroke !== 'none'
      ) {
        exportEl.setAttribute('stroke', computed.stroke)
      }

      if (exportEl.hasAttribute('stroke-width') && computed.strokeWidth) {
        exportEl.setAttribute('stroke-width', computed.strokeWidth)
      }

      if (exportEl.hasAttribute('opacity') && computed.opacity) {
        exportEl.setAttribute('opacity', computed.opacity)
      }

      if (tagName === 'text') {
        exportEl.setAttribute('font-family', computed.fontFamily)
        exportEl.setAttribute('font-size', computed.fontSize)
        exportEl.setAttribute('font-weight', computed.fontWeight)
      }
    })

    return exportSvg
  }

  const downloadSvg = () => {
    const svgEl = svgWrapRef.current?.querySelector('svg')
    if (!svgEl) return
    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(preparePathDiagramSvgForExport(svgEl))
    const blob = new Blob([svgStr], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'path-diagram.svg'
    a.click()
    URL.revokeObjectURL(url)
    setCtxMenu(null)
  }

  const downloadPng = () => {
    const svgEl = svgWrapRef.current?.querySelector('svg')
    if (!svgEl) return
    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(preparePathDiagramSvgForExport(svgEl))
    const vbAttr = svgEl.getAttribute('viewBox')
    let w = 1200, h = 800
    if (vbAttr) {
      const parts = vbAttr.split(/[\s,]+/)
      if (parts.length >= 4) { w = Math.max(400, parseFloat(parts[2]) || 1200); h = Math.max(300, parseFloat(parts[3]) || 800) }
    }
    const SCALE = 2
    const canvas = document.createElement('canvas')
    canvas.width  = w * SCALE
    canvas.height = h * SCALE
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return
    const img = new Image()
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    img.onload = () => {
      ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      const a = document.createElement('a')
      a.download = 'path-diagram.png'
      a.href = canvas.toDataURL('image/png')
      a.click()
    }
    img.src = url
    setCtxMenu(null)
  }

  const cloneConstructs = useCallback((source?: CanvasConstruct[]) => {
    return (source ?? []).map((construct) => ({
      ...construct,
      indicators: (construct.indicators ?? []).map((indicator) => ({ ...indicator })),
    }))
  }, [])

  const commitModelChange = useCallback((updater: (constructs: CanvasConstruct[]) => CanvasConstruct[]) => {
    if (!onModelChange) return
    const nextConstructs = updater(cloneConstructs(canvasConstructs))
    const nextPaths = (canvasPaths ?? []).map((path) => ({ ...path }))
    onModelChange({ constructs: nextConstructs, paths: nextPaths })
  }, [canvasConstructs, canvasPaths, cloneConstructs, onModelChange])

  const getSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svgEl = svgWrapRef.current?.querySelector('svg')
    if (!svgEl) return null
    const rect = svgEl.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const vb = svgEl.viewBox.baseVal
    return {
      x: vb.x + ((clientX - rect.left) / rect.width) * vb.width,
      y: vb.y + ((clientY - rect.top) / rect.height) * vb.height,
    }
  }, [])

  const buildDragItems = useCallback((constructIds: string[], indicatorKeys: string[]): DiagramDragItem[] => {
    const items: DiagramDragItem[] = []
    const constructs = canvasConstructs ?? []

    constructIds.forEach((constructId) => {
      const construct = constructs.find((item) => item.id === constructId)
      if (!construct) return
      items.push({
        type: 'construct',
        id: construct.id,
        originX: construct.x,
        originY: construct.y,
      })
    })

    indicatorKeys.forEach((indicatorKey) => {
      const [constructId, indicatorName] = indicatorKey.split('::')
      const construct = constructs.find((item) => item.id === constructId)
      const indicator = construct?.indicators?.find((item) => item.name === indicatorName)
      if (!construct || !indicator) return
      items.push({
        type: 'indicator',
        constructId,
        indicatorName,
        originOx: indicator.ox ?? 0,
        originOy: indicator.oy ?? 0,
      })
    })

    return items
  }, [canvasConstructs])

  const resolveConstructSelection = useCallback((constructId: string, additive: boolean) => {
    if (additive) {
      const nextConstructIds = selectedConstructIds.includes(constructId)
        ? selectedConstructIds.filter((id) => id !== constructId)
        : [...selectedConstructIds, constructId]
      return {
        constructIds: nextConstructIds.length ? nextConstructIds : [constructId],
        indicatorKeys: selectedIndicatorKeys,
      }
    }

    if (selectedConstructIds.includes(constructId)) {
      return {
        constructIds: selectedConstructIds.length ? selectedConstructIds : [constructId],
        indicatorKeys: selectedIndicatorKeys,
      }
    }

    return { constructIds: [constructId], indicatorKeys: [] }
  }, [selectedConstructIds, selectedIndicatorKeys])

  const resolveIndicatorSelection = useCallback((indicatorKey: string, additive: boolean) => {
    if (additive) {
      const nextIndicatorKeys = selectedIndicatorKeys.includes(indicatorKey)
        ? selectedIndicatorKeys.filter((key) => key !== indicatorKey)
        : [...selectedIndicatorKeys, indicatorKey]
      return {
        constructIds: selectedConstructIds,
        indicatorKeys: nextIndicatorKeys.length ? nextIndicatorKeys : [indicatorKey],
      }
    }

    if (selectedIndicatorKeys.includes(indicatorKey)) {
      return {
        constructIds: selectedConstructIds,
        indicatorKeys: selectedIndicatorKeys.length ? selectedIndicatorKeys : [indicatorKey],
      }
    }

    return { constructIds: [], indicatorKeys: [indicatorKey] }
  }, [selectedConstructIds, selectedIndicatorKeys])

  const handleConstructContextMenu = useCallback((constructId: string, e: React.MouseEvent<SVGGElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selectedConstructIds.includes(constructId)) {
      setSelectedConstructIds([constructId])
      setSelectedIndicatorKeys([])
    }
    setCtxMenu({ kind: 'construct', x: e.clientX, y: e.clientY, constructId })
  }, [selectedConstructIds])

  const applyConstructAlignment = useCallback((alignment: 'top' | 'right' | 'bottom' | 'left') => {
    if (ctxMenu?.kind !== 'construct') return
    const targetIds = selectedConstructIds.includes(ctxMenu.constructId)
      ? selectedConstructIds
      : [ctxMenu.constructId]
    commitModelChange((constructs) => constructs.map((construct) => (
      targetIds.includes(construct.id)
        ? resetResultsIndicatorLayout(construct, alignment)
        : construct
    )))
    setSelectedIndicatorKeys([])
    setCtxMenu(null)
  }, [commitModelChange, ctxMenu, selectedConstructIds])

  const toggleFoldedConstructs = useCallback(() => {
    if (ctxMenu?.kind !== 'construct') return
    const anchorConstruct = (canvasConstructs ?? []).find((construct) => construct.id === ctxMenu.constructId)
    const targetIds = selectedConstructIds.includes(ctxMenu.constructId)
      ? selectedConstructIds
      : [ctxMenu.constructId]
    const nextFolded = !anchorConstruct?.folded

    commitModelChange((constructs) => constructs.map((construct) => (
      targetIds.includes(construct.id)
        ? { ...construct, folded: nextFolded }
        : construct
    )))
    setSelectedIndicatorKeys([])
    setCtxMenu(null)
  }, [canvasConstructs, commitModelChange, ctxMenu, selectedConstructIds])

  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) return
    const target = e.target as HTMLElement
    const tagName = target?.tagName?.toLowerCase?.() ?? ''
    if (e.target !== e.currentTarget && tagName !== 'svg') return
    setSelectedConstructIds([])
    setSelectedIndicatorKeys([])
    isPanning.current = true
    panStart.current = { x: e.clientX, y: e.clientY, px: panXRef.current, py: panYRef.current }
  }

  const handleConstructMouseDown = useCallback((constructId: string, e: React.MouseEvent<SVGGElement>) => {
    if (e.button === 2) return
    e.preventDefault()
    e.stopPropagation()
    const point = getSvgPoint(e.clientX, e.clientY)
    const construct = (canvasConstructs ?? []).find((item) => item.id === constructId)
    if (!point || !construct) return
    const additive = e.ctrlKey || e.metaKey || e.shiftKey
    const nextSelection = resolveConstructSelection(constructId, additive)
    setSelectedConstructIds(nextSelection.constructIds)
    setSelectedIndicatorKeys(nextSelection.indicatorKeys)
    interactionRef.current = {
      type: 'drag',
      startX: point.x,
      startY: point.y,
      items: buildDragItems(nextSelection.constructIds, nextSelection.indicatorKeys),
    }
    document.body.style.cursor = 'grabbing'
  }, [buildDragItems, canvasConstructs, getSvgPoint, resolveConstructSelection])

  const handleIndicatorMouseDown = useCallback((constructId: string, indicatorName: string, e: React.MouseEvent<SVGGElement>) => {
    if (e.button === 2) return
    e.preventDefault()
    e.stopPropagation()
    const point = getSvgPoint(e.clientX, e.clientY)
    const construct = (canvasConstructs ?? []).find((item) => item.id === constructId)
    const indicator = construct?.indicators?.find((item) => item.name === indicatorName)
    if (!point || !construct || !indicator) return
    const additive = e.ctrlKey || e.metaKey || e.shiftKey
    const indicatorKey = `${constructId}::${indicatorName}`
    const nextSelection = resolveIndicatorSelection(indicatorKey, additive)
    setSelectedConstructIds(nextSelection.constructIds)
    setSelectedIndicatorKeys(nextSelection.indicatorKeys)
    interactionRef.current = {
      type: 'drag',
      startX: point.x,
      startY: point.y,
      items: buildDragItems(nextSelection.constructIds, nextSelection.indicatorKeys),
    }
    document.body.style.cursor = 'grabbing'
  }, [buildDragItems, canvasConstructs, getSvgPoint, resolveIndicatorSelection])

  const handleResizeMouseDown = useCallback((constructId: string, e: React.MouseEvent<SVGGElement>) => {
    if (e.button === 2) return
    e.preventDefault()
    e.stopPropagation()
    const construct = (canvasConstructs ?? []).find((item) => item.id === constructId)
    if (!construct) return
    setSelectedConstructIds((current) => current.includes(constructId) ? current : [constructId])
    setSelectedIndicatorKeys([])
    interactionRef.current = {
      type: 'resize',
      id: constructId,
      centerX: construct.x,
      centerY: construct.y,
    }
    document.body.style.cursor = 'nwse-resize'
  }, [canvasConstructs])

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const interaction = interactionRef.current
      if (interaction) {
        const point = getSvgPoint(e.clientX, e.clientY)
        if (!point) return

        if (interaction.type === 'drag') {
          const dx = point.x - interaction.startX
          const dy = point.y - interaction.startY
          const constructItems = new Map(
            interaction.items
              .filter((item): item is Extract<DiagramDragItem, { type: 'construct' }> => item.type === 'construct')
              .map((item) => [item.id, item]),
          )
          const indicatorItems = new Map(
            interaction.items
              .filter((item): item is Extract<DiagramDragItem, { type: 'indicator' }> => item.type === 'indicator')
              .map((item) => [`${item.constructId}::${item.indicatorName}`, item]),
          )

          commitModelChange((constructs) => constructs.map((construct) => (
            {
              ...construct,
              x: constructItems.has(construct.id)
                ? constructItems.get(construct.id)!.originX + dx
                : construct.x,
              y: constructItems.has(construct.id)
                ? constructItems.get(construct.id)!.originY + dy
                : construct.y,
              indicators: construct.indicators.map((indicator) => {
                const item = indicatorItems.get(`${construct.id}::${indicator.name}`)
                if (!item) return indicator
                return {
                  ...indicator,
                  ox: item.originOx + dx,
                  oy: item.originOy + dy,
                }
              }),
            }
          )))
          return
        }

        const nextRadius = Math.max(26, Math.min(140, Math.hypot(point.x - interaction.centerX, point.y - interaction.centerY)))
        commitModelChange((constructs) => constructs.map((construct) => (
          construct.id === interaction.id
            ? { ...construct, radius: nextRadius }
            : construct
        )))
        return
      }

      if (!isPanning.current) return
      onPanChange(
        panStart.current.px + (e.clientX - panStart.current.x),
        panStart.current.py + (e.clientY - panStart.current.y),
      )
    }

    const handleUp = () => {
      interactionRef.current = null
      isPanning.current = false
      document.body.style.cursor = ''
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [commitModelChange, getSvgPoint, onPanChange])

  // Wheel: Ctrl/pinch = zoom, plain = pan
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.5
        const next  = Math.min(300, Math.max(20, zoomRef.current + delta))
        onZoomChange(Math.round(next))
      } else {
        onPanChange(panXRef.current - e.deltaX, panYRef.current - e.deltaY)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onZoomChange, onPanChange])

  const scale = zoom / 100

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden relative"
      style={{ background: RESULTS_PANEL_BACKGROUND, cursor: isPanning.current ? 'grabbing' : 'grab' }}
      onMouseDown={handleBackgroundMouseDown}
      onContextMenu={handleContextMenu}
    >
      {/* Positioned, scaled diagram — fills container via viewBox */}
      <div
        ref={svgWrapRef}
        style={{
          position: 'absolute',
          transformOrigin: '0 0',
          transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
          width: 900,
          height: 500,
          pointerEvents: 'auto',
        }}
      >
        <PathDiagramSVG
          canvasConstructs={canvasConstructs}
          canvasPaths={canvasPaths}
          structuralMode={structuralMode}
          measurementMode={measurementMode}
          constructMode={constructMode}
          results={results}
          interactive
          selectedConstructIds={selectedConstructIds}
          selectedIndicatorKeys={selectedIndicatorKeys}
          hoveredConstructId={hoveredConstructId}
          onConstructMouseDown={handleConstructMouseDown}
          onIndicatorMouseDown={handleIndicatorMouseDown}
          onResizeMouseDown={handleResizeMouseDown}
          onConstructContextMenu={handleConstructContextMenu}
          onConstructHover={setHoveredConstructId}
        />
      </div>

      {/* Right-click context menu */}
      {ctxMenu?.kind === 'canvas' && (
        <div
          style={{
            position: 'fixed',
            top: ctxMenu.y,
            left: ctxMenu.x,
            zIndex: 200,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: '4px 0',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: 160,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={downloadSvg}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 14px', background: 'none', border: 'none',
              color: 'var(--color-text-secondary)', fontSize: 12, fontFamily: 'Inter, DM Sans, sans-serif',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgb(var(--color-hover-rgb) / 0.75)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            Download SVG
          </button>
          <button
            onClick={downloadPng}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 14px', background: 'none', border: 'none',
              color: 'var(--color-text-secondary)', fontSize: 12, fontFamily: 'Inter, DM Sans, sans-serif',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgb(var(--color-hover-rgb) / 0.75)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            Download PNG
          </button>
        </div>
      )}

      {ctxMenu?.kind === 'construct' && (() => {
        const contextConstruct = (canvasConstructs ?? []).find((construct) => construct.id === ctxMenu.constructId)
        const foldLabel = contextConstruct?.folded ? 'Show Indicators' : 'Hide Indicators'

        return (
          <div
            style={{
              position: 'fixed',
              top: ctxMenu.y,
              left: ctxMenu.x,
              zIndex: 200,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '6px 0',
              boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
              minWidth: 180,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={toggleFoldedConstructs}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 14px',
                background: 'none',
                border: 'none',
                color: 'var(--color-text-primary)',
                fontSize: 12,
                fontFamily: 'Inter, DM Sans, sans-serif',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgb(var(--color-hover-rgb) / 0.75)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              {foldLabel}
            </button>
            <div style={{ height: 1, margin: '4px 0', background: 'var(--color-border)' }} />
            {(['top', 'bottom', 'left', 'right'] as const).map((alignment) => (
              <button
                key={alignment}
                onClick={() => applyConstructAlignment(alignment)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 14px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  fontSize: 12,
                  fontFamily: 'Inter, DM Sans, sans-serif',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgb(var(--color-hover-rgb) / 0.75)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                Align indicators {alignment}
              </button>
            ))}
          </div>
        )
      })()}
    </div>
  )
}

// ============================================================================
// TABLE COMPONENTS
// ============================================================================

function EmptyTableState({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-muted">
      <Table size={22} className="opacity-30" />
      <span className="text-xs">{label ?? 'No data — run the analysis to populate this table'}</span>
    </div>
  )
}

function PathCoefficientTable({ rows, view }: { rows: PathRow[]; view: ResultsTableView }) {
  if (!rows.length) return <EmptyTableState label="No path coefficients — run PLS-SEM or Bootstrap" />
  const { cols, matRows } = buildCrossMatrix(rows)

  if (view === 'matrix') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-primary/20">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border sticky left-0 z-10"
                style={{ minWidth: 70 }}>
                From \ To
              </th>
              {cols.map(col => (
                <th key={col} className="px-4 py-2.5 text-center text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border min-w-[90px]">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matRows.map((row, idx) => (
              <tr key={row.id} style={resultsTableRowStyle(idx)}>
                <td className="px-4 py-2 font-semibold text-text-primary border-b border-border/40 sticky left-0 z-10"
                  style={resultsTableRowStyle(idx)}>
                  {row.id}
                </td>
                {cols.map(col => {
                  const val = row.data[col]
                  const matchRow = rows.find(r => r.path === `${row.id} → ${col}`)
                  return (
                    <td key={col} className="px-4 py-2 text-center border-b border-border/40 tabular-nums">
                      {val !== null
                        ? <span className="font-medium" style={{ color: coefColorFromP(matchRow?.pValue) }}>{formatPreciseNumber(val, getDecimals())}</span>
                        : <span className="text-text-muted/30">—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-primary/20">
          {['Path','Coefficient','T-Statistic','p-Value','CI 2.5%','CI 97.5%','Decision'].map(h => (
            <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx} style={resultsTableRowStyle(idx)}>
            <td className="px-4 py-2 text-text-primary font-medium border-b border-border/40">{row.path}</td>
            <td className={`px-4 py-2 border-b border-border/40 tabular-nums ${getStatusColor(row.status)}`}>{formatPreciseNumber(row.coefficient, getDecimals())}</td>
            <td className="px-4 py-2 text-text-secondary border-b border-border/40 tabular-nums">{Number.isFinite(row.tStatistic) ? fmtNum(row.tStatistic) : '—'}</td>
            <td className={`px-4 py-2 border-b border-border/40 ${getStatusColor(pStatus(row.pValue))}`}>{formatPValueDisplay(row.pValue)}</td>
            <td className="px-4 py-2 text-text-muted border-b border-border/40 tabular-nums">{Number.isFinite(row.ci25) ? fmtNum(row.ci25) : '—'}</td>
            <td className="px-4 py-2 text-text-muted border-b border-border/40 tabular-nums">{Number.isFinite(row.ci975) ? fmtNum(row.ci975) : '—'}</td>
            <td className="px-4 py-2 border-b border-border/40">
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${getStatusBgColor(row.status)}`}>
                {row.status === 'pass' ? 'Significant' : row.status === 'neutral' ? 'N/A' : 'Not Sig.'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RSquareTable({ rows }: { rows: RSquareRow[] }) {
  if (!rows.length) return <EmptyTableState />
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-primary/20">
          {['Construct','R²','R² Adjusted','Assessment'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx} style={resultsTableRowStyle(idx)}>
            <td className="px-4 py-2 text-text-primary font-medium border-b border-border/40">{row.construct}</td>
            <td className={`px-4 py-2 border-b border-border/40 tabular-nums ${getStatusColor(row.status)}`}>{fmtNum(row.r2)}</td>
            <td className="px-4 py-2 text-text-secondary border-b border-border/40 tabular-nums">{fmtNum(row.r2Adjusted)}</td>
            <td className="px-4 py-2 text-text-secondary border-b border-border/40">{row.assessment}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ReliabilityTable({ rows }: { rows: ReliabilityRow[] }) {
  if (!rows.length) return <EmptyTableState />
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-primary/20">
          {['Construct',"Cronbach's α",'Rho_A','Rho_C','AVE'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => {
          const statusColor = getStatusColor(row.status)
          return (
            <tr key={idx} style={resultsTableRowStyle(idx)}>
              <td className="px-4 py-2 text-text-primary font-medium border-b border-border/40">{row.construct}</td>
              <td className={`px-4 py-2 border-b border-border/40 tabular-nums ${statusColor}`}>{row.cronbach}</td>
              <td className={`px-4 py-2 border-b border-border/40 tabular-nums ${statusColor}`}>{row.rhoA}</td>
              <td className={`px-4 py-2 border-b border-border/40 tabular-nums ${statusColor}`}>{row.rhoCc}</td>
              <td className={`px-4 py-2 border-b border-border/40 tabular-nums ${statusColor}`}>{row.ave}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function OuterLoadingsTable({
  rows,
  label,
  mode = 'outer-loadings',
  view = 'list',
}: {
  rows: OuterLoadingRow[]
  label?: string
  mode?: 'outer-loadings' | 'outer-weights'
  view?: ResultsTableView
}) {
  if (!rows.length) return <EmptyTableState label={label} />
  const valueLabel = mode === 'outer-weights' ? 'Weight' : 'Loading'
  const sortedRows = [...rows].sort((a, b) => {
    const constructCompare = a.construct.localeCompare(b.construct)
    if (constructCompare !== 0) return constructCompare
    return a.indicator.localeCompare(b.indicator)
  })

  if (view === 'matrix') {
    const { cols, matRows } = buildMeasurementMatrix(sortedRows)
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-primary/20">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border sticky left-0 z-10 bg-page">
                Indicator
              </th>
              {cols.map((construct) => (
                <th key={construct} className="px-4 py-2.5 text-center text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border min-w-[96px]">
                  {construct}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matRows.map((row, idx) => (
              <tr key={row.id} style={resultsTableRowStyle(idx)}>
                <td className="px-4 py-2 text-text-primary font-medium border-b border-border/40 sticky left-0 z-10"
                  style={resultsTableRowStyle(idx)}>
                  {row.id}
                </td>
                {cols.map((construct) => {
                  const val = row.data[construct]
                  return (
                    <td key={construct} className="px-4 py-2 text-center border-b border-border/40 tabular-nums">
                      {val == null ? (
                        <span className="text-text-muted/30">—</span>
                      ) : (
                        <span className="font-medium" style={{ color: getOuterLoadingColor(val, 'var(--color-text-secondary)') }}>
                          {fmtNum(val)}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-primary/20">
            {['Construct', 'Indicator', valueLabel].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, idx) => (
            <tr key={`${row.construct}-${row.indicator}-${idx}`} style={resultsTableRowStyle(idx)}>
              <td className="px-4 py-2 text-text-primary font-medium border-b border-border/40">{row.construct}</td>
              <td className="px-4 py-2 text-text-secondary border-b border-border/40">{row.indicator}</td>
              <td className={`px-4 py-2 border-b border-border/40 tabular-nums ${getStatusColor(row.status)}`}>
                {fmtNum(row.loading)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BootstrapLoadingTable({ rows, label, view = 'stats' }: { rows: any[]; label?: string; view?: BootstrapIntervalView }) {
  if (!rows.length) return <EmptyTableState label={label} />
  const headers = view === 'stats'
    ? ['Indicator','Construct','Original Sample','Sample Mean','SDEV','T Stat.','P Value']
    : view === 'bc'
      ? ['Indicator','Construct','Original sample (O)','Sample mean (M)','Bias','2.5%','97.5%']
      : ['Indicator','Construct','Original Sample','Sample Mean','2.5% CI','97.5% CI']

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-primary/20">
            {headers.map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const cells = view === 'stats'
              ? [fmtNum(row.originalEst), fmtNum(row.bootstrapMean), fmtNum(row.bootstrapSD), fmtNum(row.tStat), formatPValueDisplay(row.pValue)]
              : view === 'bc'
                ? [fmtNum(row.originalEst), fmtNum(row.bootstrapMean), fmtNum(row.bias), fmtNum(row.bcCi25), fmtNum(row.bcCi975)]
                : [fmtNum(row.originalEst), fmtNum(row.bootstrapMean), fmtNum(row.ci25), fmtNum(row.ci975)]

            return (
              <tr key={idx} style={resultsTableRowStyle(idx)}>
                <td className="px-4 py-2 text-text-primary font-medium border-b border-border/40 whitespace-nowrap">{row.indicator}</td>
                <td className="px-4 py-2 text-text-secondary border-b border-border/40 whitespace-nowrap">{row.construct}</td>
                {cells.map((cell, cellIndex) => {
                  const cellHeader = headers[cellIndex + 2] ?? ''
                  const cellClass = significanceCellClass(
                    row.pValue,
                    isPValueHeader(cellHeader) || isSignificanceEffectHeader(cellHeader),
                  )
                  return (
                    <td key={cellIndex} className={`px-4 py-2 border-b border-border/40 tabular-nums whitespace-nowrap ${cellClass || 'text-text-secondary'}`}>{cell}</td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function BootstrapSignificanceTable({
  rows,
  label,
  view = 'stats',
}: {
  rows: Array<Record<string, unknown>>
  label?: string
  view?: BootstrapIntervalView
}) {
  const normalizedRows = normalizeBootstrapSignificanceRows(rows)
  if (!normalizedRows.length) return <EmptyTableState label={label} />

  const headers = view === 'stats'
    ? ['Path', 'Original Sample', 'Sample Mean', 'SDEV', 'T Stat.', 'P Value']
    : view === 'bc'
      ? ['Path', 'Original sample (O)', 'Sample mean (M)', 'Bias', '2.5%', '97.5%']
      : ['Path', 'Original Sample', 'Sample Mean', '2.5% CI', '97.5% CI']

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-primary/20">
            {headers.map((header) => (
              <th key={header} className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border whitespace-nowrap">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {normalizedRows.map((row, idx) => {
            const cells = view === 'stats'
              ? [fmtNum(row.originalEst), fmtNum(row.bootstrapMean), fmtNum(row.bootstrapSD), fmtNum(row.tStat), formatPValueDisplay(row.pValue)]
              : view === 'bc'
                ? [fmtNum(row.originalEst), fmtNum(row.bootstrapMean), fmtNum(row.bias), fmtNum(row.bcCiLower), fmtNum(row.bcCiUpper)]
                : [fmtNum(row.originalEst), fmtNum(row.bootstrapMean), fmtNum(row.ciLower), fmtNum(row.ciUpper)]

            return (
              <tr key={`${row.label}-${idx}`} style={resultsTableRowStyle(idx)}>
                <td className="px-4 py-2 text-text-primary font-medium border-b border-border/40 whitespace-nowrap">{row.label}</td>
                {cells.map((cell, cellIndex) => {
                  const cellHeader = headers[cellIndex + 1] ?? ''
                  const cellClass = significanceCellClass(
                    row.pValue,
                    isPValueHeader(cellHeader) || isSignificanceEffectHeader(cellHeader),
                  )
                  return (
                    <td key={cellIndex} className={`px-4 py-2 border-b border-border/40 tabular-nums whitespace-nowrap ${cellClass || 'text-text-secondary'}`}>{cell}</td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Q2PredictTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  const q2Rows = extractQ2PredictRows(rows)
  if (!q2Rows.length) return <EmptyTableState />

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-primary/20">
          {['Indicator', 'Q²predict'].map((header) => (
            <th key={header} className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {q2Rows.map((row, idx) => (
          <tr key={`${row.label}-${idx}`} style={resultsTableRowStyle(idx)}>
            <td className="px-4 py-2 text-text-primary font-medium border-b border-border/40">{row.label}</td>
            <td className="px-4 py-2 text-text-secondary border-b border-border/40 tabular-nums">{fmtNum(row.q2Predict)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PlsLmComparisonTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  const comparisonRows = extractPlsLmComparisonRows(rows)
  if (!comparisonRows.length) return <EmptyTableState />

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-primary/20">
            {['Indicator', 'PLS RMSE', 'PLS MAE', 'LM RMSE', 'LM MAE'].map((header) => (
              <th key={header} className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border whitespace-nowrap">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparisonRows.map((row, idx) => (
            <tr key={`${row.label}-${idx}`} style={resultsTableRowStyle(idx)}>
              <td className="px-4 py-2 text-text-primary font-medium border-b border-border/40 whitespace-nowrap">{row.label}</td>
              <td className="px-4 py-2 text-text-secondary border-b border-border/40 tabular-nums">{row.plsRmse == null ? '—' : fmtNum(row.plsRmse)}</td>
              <td className="px-4 py-2 text-text-secondary border-b border-border/40 tabular-nums">{row.plsMae == null ? '—' : fmtNum(row.plsMae)}</td>
              <td className="px-4 py-2 text-text-secondary border-b border-border/40 tabular-nums">{row.lmRmse == null ? '—' : fmtNum(row.lmRmse)}</td>
              <td className="px-4 py-2 text-text-secondary border-b border-border/40 tabular-nums">{row.lmMae == null ? '—' : fmtNum(row.lmMae)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CrossLoadingsTable({ ar }: { ar: any }) {
  const raw: any[] = ar?.quality_criteria?.cross_loadings ?? []
  if (!raw.length) return <EmptyTableState label="No cross-loadings data — run PLS-SEM analysis" />

  // Collect all construct column names (everything except row_name)
  const allKeys = Array.from(new Set(raw.flatMap((r: any) => Object.keys(r))))
  const constructs = allKeys.filter(k => k !== 'row_name' && k !== 'indicator' && k !== 'Indicator')

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-primary/20">
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border sticky left-0 z-10 bg-page">
              Indicator
            </th>
            {constructs.map(c => (
              <th key={c} className="px-4 py-2.5 text-center text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border min-w-[90px]">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {raw.map((r: any, idx: number) => {
            const indicator = String(r.row_name ?? r.indicator ?? r.Indicator ?? '')
            // Find max absolute loading to highlight the primary construct
            const vals = constructs.map(c => toNum(r[c], NaN)).filter(v => Number.isFinite(v))
            const maxAbs = vals.length > 0 ? Math.max(...vals.map(Math.abs)) : NaN

            return (
              <tr key={idx} style={resultsTableRowStyle(idx)}>
                <td
                  className="px-4 py-2 text-text-primary font-medium border-b border-border/40 sticky left-0 z-10"
                  style={resultsTableRowStyle(idx)}
                >
                  {indicator}
                </td>
                {constructs.map(c => {
                  const val = toNum(r[c], NaN)
                  const isPrimary = Number.isFinite(val) && Number.isFinite(maxAbs) && Math.abs(Math.abs(val) - maxAbs) < 0.0001
                  const primaryColor = getOuterLoadingColor(val, 'var(--color-text-secondary)')
                  return (
                    <td
                      key={c}
                      className={`px-4 py-2 text-center border-b border-border/40 tabular-nums ${isPrimary ? 'font-semibold' : 'text-text-secondary'}`}
                      style={isPrimary ? { color: primaryColor } : undefined}
                    >
                      {Number.isFinite(val) ? fmtNum(val) : '—'}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="px-4 py-2 text-[10px] text-text-muted">
        Highlighted values indicate the highest loading for each indicator. For reflective constructs, each indicator should load highest on its own construct.
      </div>
    </div>
  )
}

function VIFTable({ rows }: { rows: VIFRow[] }) {
  if (!rows.length) return <EmptyTableState />
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-primary/20">
          {['Predictor','Endogenous','VIF','Decision'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx} style={resultsTableRowStyle(idx)}>
            <td className="px-4 py-2 text-text-primary font-medium border-b border-border/40">{row.predictor}</td>
            <td className="px-4 py-2 text-text-secondary border-b border-border/40">{row.endogenous}</td>
            <td className={`px-4 py-2 border-b border-border/40 tabular-nums ${getStatusColor(row.status)}`}>{fmtNum(row.vif)}</td>
            <td className="px-4 py-2 border-b border-border/40">
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${getStatusBgColor(row.status)}`}>
                {row.status === 'pass' ? 'Pass' : 'High'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function VIFPanel({ sections }: { sections: VIFSections }) {
  if (!sections.inner.length && !sections.outer.length) {
    return <EmptyTableState label="No data — run the analysis to populate this table" />
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <div className="px-4 py-3 font-semibold text-sm bg-primary/20 text-text-primary">Inner VIF (Construct → Construct)</div>
        <VIFTable rows={sections.inner} />
      </div>
      <div>
        <div className="px-4 py-3 font-semibold text-sm bg-primary/20 text-text-primary">Outer VIF (Indicator → Construct)</div>
        <VIFTable rows={sections.outer} />
      </div>
    </div>
  )
}

function ModelFitTable({ rows, label }: { rows: ModelFitRow[]; label?: string }) {
  if (!rows.length) return <EmptyTableState label={label} />
  return (
    <div>
      <div className="px-4 py-3 text-[11px] text-text-muted border-b border-border/40" style={{ background: RESULTS_PANEL_BACKGROUND }}>
        Model fit reports SRMR, NFI, d_ULS, and d_G from the fitted Standard PLS or PLSc model.
        AIC and BIC are reported separately under Model selection criteria.
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-primary/20">
            {['Index','Value','Threshold','Decision'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} style={resultsTableRowStyle(idx)}>
              <td className="px-4 py-2 text-text-primary font-medium border-b border-border/40">{row.index}</td>
              <td className={`px-4 py-2 border-b border-border/40 tabular-nums ${getStatusColor(row.status)}`}>
                {typeof row.value === 'number' ? fmtNum(row.value) : row.value}
              </td>
              <td className="px-4 py-2 text-text-secondary border-b border-border/40">{row.threshold}</td>
              <td className="px-4 py-2 border-b border-border/40">
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${getStatusBgColor(row.status)}`}>
                  {row.status === 'pass' ? 'Pass' : 'N/A'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DiscriminantValidityPanel({ ar }: { ar: any }) {
  const dvData = ar?.quality_criteria?.discriminant_validity ?? []
  if (!dvData.length) {
    return <EmptyTableState label="No discriminant validity data available" />
  }

  // Separate by method (e.g., 'Fornell-Larcker' vs 'HTMT')
  const byMethod: Record<string, Array<Record<string, unknown>>> = {}
  dvData.forEach((row: any) => {
    const method = String(row.method ?? row.Method ?? 'Unknown')
    if (!byMethod[method]) byMethod[method] = []
    byMethod[method].push(row)
  })

  const flKey = Object.keys(byMethod).find(m => m.toLowerCase().includes('fornell') || m.toLowerCase().includes('larcker'))
  const hmtKey = Object.keys(byMethod).find(m => m.toLowerCase().includes('htmt'))
  
  const flData = flKey ? byMethod[flKey] : []
  const hmtData = hmtKey ? byMethod[hmtKey] : []

  const renderTable = (title: string, rows: Array<Record<string, unknown>>, headingClass: string) => {
    if (!rows.length) return null
    
    const displayRows = formatRowsForDisplay(rows)
    if (!displayRows.length) return null

    const headers = Array.from(new Set(displayRows.flatMap(r => Object.keys(r)))).filter(h => h !== 'method' && h !== 'Method')
    const hasRowCol = displayRows.some(r => 'row' in r)
    const cols = hasRowCol ? ['row', ...headers.filter(h => h !== 'row')] : headers

    return (
      <div key={title} className="mb-6">
        <div className={`px-4 py-3 font-semibold text-sm ${headingClass}`}>{title}</div>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
              {cols.map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => {
              const rowCells = cols.map(col => row[col] ?? '—')
              return (
                <tr key={idx} style={resultsTableRowStyle(idx)}>
                  {rowCells.map((val, colIdx) => (
                    <td key={colIdx} className={`px-4 py-2 border-b border-border/40 ${colIdx === 0 ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                      {val}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-0">
      {renderTable('Fornell-Larcker', flData, 'bg-blue-600/30 text-cyan')}
      {renderTable('HTMT', hmtData, 'bg-green-600/30 text-green-100')}
      {!flData.length && !hmtData.length && <EmptyTableState label="Unable to parse discriminant validity data" />}
    </div>
  )
}

function ExecutionLogPanel({ log }: { log: string }) {
  return (
    <pre className="p-4 text-[11px] text-text-secondary font-mono whitespace-pre-wrap break-words leading-relaxed">
      {log || 'No execution log available.'}
    </pre>
  )
}

function GenericDataTable({
  data,
  analysisMode,
  selectedPanel,
  emptyLabel,
  savedModel,
}: {
  data: any
  analysisMode?: string
  selectedPanel?: string
  emptyLabel?: string
  savedModel?: any
}) {
  const rawRows = rowsFromData(data)
  if (!rawRows.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted py-10">
        <Table size={22} className="opacity-30" />
        <span className="text-xs">{emptyLabel || 'No data available for this section'}</span>
      </div>
    )
  }

  const rows = rawRows.map((row) => normalizeRowFields(row))

  const otherHeaders = Array.from(new Set(rows.flatMap((row) => Object.keys(row)).filter((h) => h !== 'row')))
  const hasRowHeader = rows.some((row) => 'row' in row)
  const headers = hasRowHeader ? ['row', ...otherHeaders] : otherHeaders

  const isBootstrapSignificancePanel = analysisMode === 'bootstrap' &&
    ['path-coef', 'total-indirect', 'specific-indirect', 'total-effects', 'outer-loadings', 'outer-weights'].includes(selectedPanel || '')

  const pValueHeader = headers.find((header) => isPValueHeader(header))
  const indirectEffectPairs = selectedPanel === 'total-indirect'
    ? buildIndirectEffectPairLookup(savedModel)
    : null
  const totalEffectPairs = selectedPanel === 'total-effects'
    ? buildTotalEffectPairLookup(savedModel)
    : null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-primary/20">
            {headers.map((header) => (
              <th key={header} className="px-4 py-2 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border">
                {formatResultTableHeader(header, selectedPanel)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const pTone = pValueHeader ? pSignificanceTone(row[pValueHeader]) : null

            return (
              <tr key={rowIndex} style={resultsTableRowStyle(rowIndex)}>
                {headers.map((header) => {
                  const isPCol = isPValueHeader(header)
                  const isEffectCell = isSignificanceEffectHeader(header)
                  const significanceColorClass = isBootstrapSignificancePanel && (isPCol || isEffectCell) && pTone
                    ? `${getStatusColor(pTone)} font-semibold`
                    : ''
                  const rowClass = header.toLowerCase() === 'row' ? 'text-text-primary font-medium' : 'text-text-secondary'
                  const cellContext = indirectEffectPairs || totalEffectPairs
                    ? { rowLabel: row.row, indirectEffectPairs, totalEffectPairs }
                    : undefined
                  const value = formatDisplayValue(row[header], header, selectedPanel, cellContext)
                  
                  return (
                    <td key={`${rowIndex}-${header}`} className={`px-4 py-2 border-b border-border/40 whitespace-pre-wrap break-words ${significanceColorClass || rowClass}`}>
                      {value}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// TABLE PANEL
// ============================================================================

type AdvancedPanelViewMode = 'table' | 'chart'

const SUPPORTED_PANELS = ['path-coef','r-square','reliability','outer-loadings','outer-weights','cross-loadings','vif','discriminant','model-fit','q2-predict','pls-lm-comparison','execution-log']
const ADVANCED_INLINE_CHART_PANELS = new Set([
  'path-coef',
  'priority-map',
  'necessity-check',
  'ceiling-lines',
  'cipma-priorities',
  'bottleneck-table',
])
const CHART_ONLY_ADVANCED_PANELS = new Set([
  'ceiling-lines',
])
const PLSPREDICT_ERROR_HISTOGRAM_PANELS = ['plsem-mv-error-hist', 'plsem-lv-error-hist']

function isPlsPredictErrorHistogram(panelId: string): boolean {
  return PLSPREDICT_ERROR_HISTOGRAM_PANELS.includes(panelId)
}

function extractTableSectionsFromDom(container: HTMLElement | null, selectedPanel: string): ExportTableSection[] {
  if (!container) return []
  const tables = Array.from(container.querySelectorAll('table'))
  if (!tables.length) return []

  const titles = getExportSectionTitles(selectedPanel, tables.length)

  return tables
    .map((table, index) => {
      const htmlTable = table as HTMLTableElement
      const headerCells = htmlTable.tHead?.rows?.[0]?.cells
      const headers = headerCells
        ? Array.from(headerCells).map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
        : []

      const bodyRows = Array.from(htmlTable.tBodies).flatMap((tbody) => Array.from(tbody.rows))
      const rows = bodyRows.map((row) =>
        Array.from(row.cells).map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
      )

      if (!headers.length && !rows.length) return null

      return {
        title: titles[index] ?? `${getPanelTitle(selectedPanel)} ${index + 1}`,
        headers,
        rows,
      } satisfies ExportTableSection
    })
    .filter((section): section is ExportTableSection => section !== null)
}

function sanitizeExcelSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, ' ').trim()
  const fallback = cleaned || `Sheet ${index + 1}`
  return fallback.slice(0, 31)
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').replace(/\s+/g, ' ').trim()
}

function safeExcelCellValue(value: string): string {
  const text = String(value ?? '')
  return /^[=+\-@]/.test(text) ? `'${text}` : text
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function TablePanel({
  selectedPanel, diagramHeight, onDiagramHeightChange, diagramCollapsed, analysisMode, panelData, analysisResults, savedModel, tableView, tableViewOptions, onTableViewChange
}: {
  selectedPanel: string
  diagramHeight: number
  onDiagramHeightChange: (h: number) => void
  diagramCollapsed: boolean
  analysisMode: AnalysisMode
  panelData: any
  analysisResults: any
  savedModel: any
  tableView: ResultsTableView
  tableViewOptions: ResultsTableView[]
  onTableViewChange: (nextView: ResultsTableView) => void
}) {
  const isDragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartH = useRef(0)
  const dragStartPanelH = useRef(0)
  const panelShellRef = useRef<HTMLDivElement>(null)
  const panelBodyRef = useRef<HTMLDivElement>(null)
  const [bootstrapIntervalView, setBootstrapIntervalView] = useState<BootstrapIntervalView>('stats')
  const [advancedPanelViewModes, setAdvancedPanelViewModes] = useState<Record<string, AdvancedPanelViewMode>>({})
  const showBootstrapIntervalControl = analysisMode === 'bootstrap' && isBootstrapSignificancePanel(selectedPanel)
  // Derive real data from analysisResults
  const pathRows      = parsePathCoefficients(analysisResults)
  const rSquareRows   = parseRSquare(analysisResults)
  const reliRows      = parseReliability(analysisResults)
  const loadingRows   = parseOuterLoadings(analysisResults)
  const weightRows    = parseOuterWeights(analysisResults)
  const vifSections   = parseVIF(analysisResults, savedModel)
  const modelFitRows  = parseModelFit(analysisResults)
  const execLog       = parseExecutionLog(analysisResults)

  const indicatorConstructMap = new Map<string, string>()
  if (savedModel?.constructs) {
    savedModel.constructs.forEach((c: any) => {
      ;(c.indicators ?? []).forEach((ind: any) => {
        indicatorConstructMap.set(String(ind.name ?? '').trim(), c.name)
      })
    })
  }

  const parseBootstrapMeasurements = (rows: any[]) => {
    const normalizedRows = normalizeBootstrapSignificanceRows(rows || [])
    return (rows || []).map((r: any, index: number) => {
      const normalized = normalizedRows[index]
      const identity = inferMeasurementRowIdentity(r, indicatorConstructMap)
      const indicator = identity.indicator
      return {
        indicator,
        construct: identity.construct || '—',
        originalEst: normalized?.originalEst ?? NaN,
        bootstrapMean: normalized?.bootstrapMean ?? NaN,
        bootstrapSD: normalized?.bootstrapSD ?? NaN,
        tStat: normalized?.tStat ?? NaN,
        pValue: normalized?.pValue ?? null,
        bias: normalized?.bias ?? NaN,
        ci25: normalized?.ciLower ?? NaN,
        ci975: normalized?.ciUpper ?? NaN,
        bcCi25: normalized?.bcCiLower ?? NaN,
        bcCi975: normalized?.bcCiUpper ?? NaN,
      }
    })
  }

  const bootLoadingRows = analysisMode === 'bootstrap' ? parseBootstrapMeasurements(analysisResults?.final_results?.outer_loadings) : []
  const bootWeightRows  = analysisMode === 'bootstrap' ? parseBootstrapMeasurements(analysisResults?.final_results?.outer_weights) : []

  const derivedSpecificIndirectRows = analysisMode === 'pls-sem' && selectedPanel === 'specific-indirect'
    ? deriveSpecificIndirectRows(savedModel, analysisResults)
    : []
  const panelRows = rowsFromData(panelData)
  const cvpatPlaceholderRows = rowsContainOnlyMessage(panelRows)
  const cvpatRequested = readPlsPredictSettingsFromResults(analysisResults).cvpatEnabled
  const cvpatStatus = String((analysisResults as any)?.meta?.cvpat_status ?? '').trim().toLowerCase()
  const advancedAnalyses = analysisMode === 'advanced'
    ? (
        (analysisResults as any)?.meta?.analysis_settings?.advanced?.analyses ??
        (analysisResults as any)?.algorithm?.settings?.analyses ??
        null
      )
    : null
  const usingDerivedSpecificIndirectRows = selectedPanel === 'specific-indirect' && derivedSpecificIndirectRows.length > 0 && !panelRows.length
  const emptyStateLabel = classifyPanelEmptyState({
    mode: analysisMode,
    panelId: selectedPanel,
    hasRows: panelRows.length > 0 && !cvpatPlaceholderRows,
    hasMediationPaths: modelHasMediationPaths(savedModel),
    hasFormativeWeights: Array.isArray(savedModel?.constructs)
      ? savedModel.constructs.some((construct: any) => String(construct?.type || '').toLowerCase() === 'formative')
      : undefined,
    cvpatEnabled: selectedPanel === 'cvpat-lv-summary'
      ? cvpatRequested
      : undefined,
    cvpatStatus: selectedPanel === 'cvpat-lv-summary'
      ? cvpatStatus
      : undefined,
    modelSelectionComparable: selectedPanel === 'model-select' ? panelRows.length > 0 : undefined,
    fitAvailable: selectedPanel === 'model-fit' ? modelFitRows.length > 0 : undefined,
    advancedAnalyses: advancedAnalyses
      ? {
          ipma: advancedAnalyses.ipma === true,
          nca: advancedAnalyses.nca === true,
          cipma: advancedAnalyses.cipma === true,
        }
      : undefined,
  })
  const baseModelReferenceLabel = getBaseModelReferenceLabel(analysisMode, selectedPanel)
  const displayPanelData = cvpatPlaceholderRows
    ? []
    : usingDerivedSpecificIndirectRows
      ? derivedSpecificIndirectRows
      : panelData
  const panelNotice = usingDerivedSpecificIndirectRows
    ? 'Run Bootstrap to get significance for these paths.'
    : null
  const q2PredictRows = panelRows as Array<Record<string, unknown>>
  const plsLmComparisonRows = panelRows as Array<Record<string, unknown>>

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const minPanelVisibleHeight = 42
      const maxDiagramHeight = Math.max(
        80,
        dragStartH.current + dragStartPanelH.current - minPanelVisibleHeight,
      )
      const nextHeight = dragStartH.current + (e.clientY - dragStartY.current)
      onDiagramHeightChange(Math.max(80, Math.min(maxDiagramHeight, nextHeight)))
    }
    const onUp = () => { if (isDragging.current) { isDragging.current = false; document.body.style.cursor = '' } }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [onDiagramHeightChange])

  useEffect(() => {
    setBootstrapIntervalView('stats')
  }, [analysisMode, selectedPanel])

  const startDrag = (e: React.MouseEvent) => {
    isDragging.current = true
    dragStartY.current = e.clientY
    dragStartH.current = diagramHeight
    dragStartPanelH.current = panelShellRef.current?.getBoundingClientRect().height ?? 0
    document.body.style.cursor = 'row-resize'
    e.preventDefault()
  }

  const isSemResultsMode = analysisMode === 'pls-sem' || analysisMode === 'bootstrap' || analysisMode === 'advanced'
  const basePanelTitle = getPanelTitle(selectedPanel)
  const panelTitle = analysisMode === 'bootstrap' && isBootstrapSignificancePanel(selectedPanel) && bootstrapIntervalView !== 'stats'
    ? `${basePanelTitle} - ${bootstrapIntervalView === 'bc' ? 'Confidence intervals bias corrected' : 'Confidence intervals'}`
    : basePanelTitle
  const hasAdvancedPanelChart = analysisMode === 'advanced' && ADVANCED_INLINE_CHART_PANELS.has(selectedPanel)
  const isAdvancedChartOnlyPanel = analysisMode === 'advanced' && CHART_ONLY_ADVANCED_PANELS.has(selectedPanel)
  const advancedPanelViewKey = `${analysisMode}:${selectedPanel}`
  const advancedPanelViewMode: AdvancedPanelViewMode = isAdvancedChartOnlyPanel
    ? 'chart'
    : hasAdvancedPanelChart
      ? advancedPanelViewModes[advancedPanelViewKey] ?? 'table'
      : 'table'
  const shouldRenderInlineChart =
    (hasAdvancedPanelChart && advancedPanelViewMode === 'chart') ||
    (
      analysisMode === 'plspredict' &&
      isPlsPredictErrorHistogram(selectedPanel)
    )
  const shouldRenderTableContent = !isAdvancedChartOnlyPanel && !(hasAdvancedPanelChart && advancedPanelViewMode === 'chart')
  const shouldRenderTableActions = !isAdvancedChartOnlyPanel

  const getVisibleTableSections = useCallback(() => {
    return extractTableSectionsFromDom(panelBodyRef.current, selectedPanel)
  }, [selectedPanel])

  const handleCopyTable = useCallback(async () => {
    const sections = getVisibleTableSections()
    if (!sections.length) {
      dispatchToast('warning', 'No table available', 'This panel does not currently show a table you can copy.')
      return
    }

    const html = buildClipboardTableHtml(sections, panelTitle)
    const text = buildClipboardTableText(sections, panelTitle)

    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })
        await navigator.clipboard.write([item])
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        throw new Error('Clipboard API unavailable')
      }

      dispatchToast('success', 'Table copied', 'Paste into Word to keep the table formatting.')
    } catch (error: any) {
      dispatchToast('error', 'Copy failed', error?.message || 'Could not copy the selected table.')
    }
  }, [getVisibleTableSections, panelTitle])

  const handleDownloadTable = useCallback(async () => {
    const sections = getVisibleTableSections()
    if (!sections.length) {
      dispatchToast('warning', 'No table available', 'This panel does not currently show a table you can download.')
      return
    }

    try {
      const ExcelJS = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'metis'
      workbook.created = new Date()

      sections.forEach((section, index) => {
        const aoa = section.headers.length ? [section.headers, ...section.rows] : section.rows
        const worksheet = workbook.addWorksheet(sanitizeExcelSheetName(section.title, index))
        aoa.forEach((row) => {
          worksheet.addRow(row.map((cell) => safeExcelCellValue(cell)))
        })
      })

      const fileName = `${sanitizeFilename(panelTitle || 'results-table')}.xlsx`
      const workbookBuffer = await workbook.xlsx.writeBuffer()
      const electronAPI = (window as any).electronAPI

      if (electronAPI?.showSaveDialog && electronAPI?.writeFile) {
        const saveRes = await electronAPI.showSaveDialog({
          defaultPath: fileName,
          filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
        })
        if (saveRes?.canceled || !saveRes?.filePath) return

        const writeRes = await electronAPI.writeFile({
          filePath: saveRes.filePath,
          data: arrayBufferToBase64(workbookBuffer as ArrayBuffer),
          encoding: 'base64',
        })
        if (!writeRes?.success) {
          throw new Error(writeRes?.error || 'Could not save the Excel workbook.')
        }
      } else {
        const blob = new Blob(
          [workbookBuffer],
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        )
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        link.click()
        URL.revokeObjectURL(url)
      }
      dispatchToast('success', 'Excel exported', fileName)
    } catch (error: any) {
      dispatchToast('error', 'Download failed', error?.message || 'Could not export the selected table to Excel.')
    }
  }, [getVisibleTableSections, panelTitle])

  return (
    <div ref={panelShellRef} className="flex-1 flex flex-col overflow-hidden min-h-0" style={{ background: RESULTS_PANEL_BACKGROUND }}>
      {!diagramCollapsed && (
        <div
          className="h-1.5 shrink-0 cursor-row-resize transition-colors hover:bg-primary/40"
          style={{ background: RESULTS_PANEL_BACKGROUND }}
          onMouseDown={startDrag}
          title="Drag to resize diagram"
        />
      )}
      <div className="h-9 border-b border-border flex items-center px-4 gap-2 shrink-0" style={{ background: RESULTS_PANEL_BACKGROUND }}>
        <span className="text-xs font-semibold text-text-primary">{panelTitle}</span>
        {baseModelReferenceLabel && (
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            {baseModelReferenceLabel}
          </span>
        )}
        <div className="flex-1" />
        {tableViewOptions.length > 1 && (
          <>
            <div className="flex items-center rounded-md p-0.5" style={{ backgroundColor: 'var(--color-toggle-track-bg)' }}>
              {tableViewOptions.map((viewOption) => {
                const active = tableView === viewOption
                const label = viewOption === 'matrix' ? 'Matrix' : 'List'
                return (
                  <button
                    key={viewOption}
                    type="button"
                    onClick={() => onTableViewChange(viewOption)}
                    className="rounded px-2 py-1 text-[11px] font-semibold transition-colors"
                    style={{
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                      color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      background: active ? 'var(--color-toggle-active-bg)' : 'transparent',
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                    title={`Show ${label.toLowerCase()} view`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <div className="w-px h-4 bg-border/50" />
          </>
        )}
        {showBootstrapIntervalControl && (
          <>
            <div className="flex items-center rounded-md p-0.5" style={{ backgroundColor: 'var(--color-toggle-track-bg)' }}>
              {(['stats', 'ci', 'bc'] as BootstrapIntervalView[]).map((option) => {
                const active = bootstrapIntervalView === option
                const label = option === 'stats' ? 'Stats' : option === 'ci' ? 'CI' : 'BC CI'
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setBootstrapIntervalView(option)}
                    aria-pressed={active}
                    className="rounded px-2 py-1 text-[11px] font-semibold transition-colors"
                    style={{
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                      color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      background: active ? 'var(--color-toggle-active-bg)' : 'transparent',
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                    title={label}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <div className="w-px h-4 bg-border/50" />
          </>
        )}
        {hasAdvancedPanelChart && !isAdvancedChartOnlyPanel && (
          <>
            <div className="flex items-center rounded-md p-0.5" style={{ backgroundColor: 'var(--color-toggle-track-bg)' }}>
              {(['table', 'chart'] as AdvancedPanelViewMode[]).map((modeOption) => {
                const active = advancedPanelViewMode === modeOption
                const label = modeOption === 'table' ? 'Table' : 'Chart'
                const ModeIcon = modeOption === 'table' ? Table : ChartLineUp
                return (
                  <button
                    key={modeOption}
                    type="button"
                    onClick={() => setAdvancedPanelViewModes((previous) => ({
                      ...previous,
                      [advancedPanelViewKey]: modeOption,
                    }))}
                    aria-pressed={active}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors"
                    style={{
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                      color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      background: active ? 'var(--color-toggle-active-bg)' : 'transparent',
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                    title={`Show ${label.toLowerCase()}`}
                  >
                    <ModeIcon size={12} />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
            <div className="w-px h-4 bg-border/50" />
          </>
        )}
        {shouldRenderTableActions && (
          <>
            <button onClick={handleCopyTable} className="p-1.5 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] rounded" title="Copy table">
              <Copy size={14} className="text-text-muted" />
            </button>
            <button onClick={handleDownloadTable} className="p-1.5 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] rounded" title="Download table">
              <Download size={14} className="text-text-muted" />
            </button>
          </>
        )}
      </div>
      <div ref={panelBodyRef} className="flex-1 overflow-y-auto min-h-0 p-3" style={{ background: RESULTS_PANEL_BACKGROUND }}>
        {panelNotice && (
          <div className="border-b border-border/40 px-4 py-3 text-[11px] text-text-secondary" style={{ background: RESULTS_PANEL_BACKGROUND }}>
            {panelNotice}
          </div>
        )}
        {shouldRenderInlineChart && (
          <div className="mb-3">
            <ResultChart
              selectedPanel={selectedPanel}
              analysisMode={analysisMode}
              pathRows={pathRows}
              rSquareRows={rSquareRows}
              reliRows={reliRows}
              loadingRows={loadingRows}
              weightRows={weightRows}
              bootLoadingRows={bootLoadingRows}
              bootWeightRows={bootWeightRows}
              vifSections={vifSections}
              modelFitRows={modelFitRows}
              analysisResults={analysisResults}
            />
          </div>
        )}
        {isSemResultsMode ? (
          shouldRenderTableContent ? (
            <>
            {selectedPanel === 'path-coef' && (
              analysisMode === 'bootstrap'
                ? <BootstrapSignificanceTable rows={panelRows} label={emptyStateLabel} view={bootstrapIntervalView} />
                : <PathCoefficientTable rows={pathRows} view={tableView} />
            )}
            {selectedPanel === 'r-square'       && <RSquareTable rows={rSquareRows} />}
            {selectedPanel === 'reliability'    && <ReliabilityTable rows={reliRows} />}
            {analysisMode === 'bootstrap' ? (
              <>
                {selectedPanel === 'outer-loadings' && <BootstrapLoadingTable rows={bootLoadingRows} label={emptyStateLabel} view={bootstrapIntervalView} />}
                {selectedPanel === 'outer-weights'  && <BootstrapLoadingTable rows={bootWeightRows} label={emptyStateLabel} view={bootstrapIntervalView} />}
              </>
            ) : (
              <>
                {selectedPanel === 'outer-loadings' && <OuterLoadingsTable rows={loadingRows} view={tableView} />}
                {selectedPanel === 'outer-weights'  && <OuterLoadingsTable rows={weightRows} label={emptyStateLabel} mode="outer-weights" view={tableView} />}
              </>
            )}
            {selectedPanel === 'cross-loadings' && <CrossLoadingsTable ar={analysisResults} />}
            {selectedPanel === 'vif'            && <VIFPanel sections={vifSections} />}
            {selectedPanel === 'discriminant'   && <DiscriminantValidityPanel ar={analysisResults} />}
            {selectedPanel === 'model-fit'      && <ModelFitTable rows={modelFitRows} label={emptyStateLabel} />}
            {selectedPanel === 'execution-log'  && <ExecutionLogPanel log={execLog} />}
            {analysisMode === 'bootstrap' && ['total-indirect', 'specific-indirect', 'total-effects'].includes(selectedPanel) && (
              <BootstrapSignificanceTable rows={panelRows} label={emptyStateLabel} view={bootstrapIntervalView} />
            )}
            {!SUPPORTED_PANELS.includes(selectedPanel) && !(analysisMode === 'bootstrap' && isBootstrapSignificancePanel(selectedPanel)) && (
              <GenericDataTable data={displayPanelData} analysisMode={analysisMode} selectedPanel={selectedPanel} emptyLabel={emptyStateLabel} savedModel={savedModel} />
            )}
            </>
          ) : null
        ) : (
          <>
            {analysisMode === 'plspredict' && selectedPanel === 'q2-predict' && (
              <Q2PredictTable rows={q2PredictRows} />
            )}
            {analysisMode === 'plspredict' && selectedPanel === 'pls-lm-comparison' && (
              <PlsLmComparisonTable rows={plsLmComparisonRows} />
            )}
            {analysisMode === 'plspredict' && selectedPanel === 'execution-log' && (
              <ExecutionLogPanel log={execLog} />
            )}
            {!['q2-predict', 'pls-lm-comparison', 'execution-log', 'plsem-mv-error-hist', 'plsem-lv-error-hist'].includes(selectedPanel) && (
              <GenericDataTable data={displayPanelData} analysisMode={analysisMode} selectedPanel={selectedPanel} emptyLabel={emptyStateLabel} savedModel={savedModel} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ResultsView() {
  const navigate = useNavigate()
  const location = useLocation()
  const { modelId } = useParams()
  const navState = (location.state ?? null) as {
    savedAnalysis?: any
    savedModelSnapshot?: { constructs: CanvasConstruct[]; paths: CanvasPath[] } | null
    savedDiagramBaseResults?: Record<string, unknown> | null
  } | null

  // ── Load model from ModelCanvas (saved to localStorage before navigating) ──
  const [savedModel, setSavedModel] = useState<{ constructs: CanvasConstruct[]; paths: CanvasPath[] } | null>(() => resolveSavedModelSnapshot(modelId, navState))

  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('pls-sem')
  const [analysisResults, setAnalysisResults] = useState<Record<string, unknown> | null>(null)
  const [selectedPanel,     setSelectedPanel]    = useState('path-coef')
  const [diagramHeight,     setDiagramHeight]    = useState(300)
  const [diagramCollapsed,  setDiagramCollapsed] = useState(false)
  const [bootstrapOpen,     setBootstrapOpen]    = useState(false)
  const [plspredictOpen,    setPlsPredictOpen]   = useState(false)
  const [advancedOpen,      setAdvancedOpen]     = useState(false)
  const [tableViewPreferences, setTableViewPreferences] = useState<Record<string, ResultsTableView>>({})
  const calcDispatch = useCalculationDispatch()
  const isContextCalculating = useIsCalculating()

  // ── Three diagram display modes (from ui.pen Path Coefficient Dropdown spec) ──
  const [structuralMode,  setStructuralMode]  = useState('Path coefficients')
  const [measurementMode, setMeasurementMode] = useState('Outer weights / loadings')
  const [constructMode,   setConstructMode]   = useState('R-square')

  // ── Display panel popover ──
  const [displayPanelOpen, setDisplayPanelOpen] = useState(false)
  const [activeSubRow,     setActiveSubRow]     = useState<string | null>(null)
  const displayPanelRef = useRef<HTMLDivElement>(null)

  // Close panel when clicking outside
  useEffect(() => {
    if (!displayPanelOpen) return
    const handler = (e: MouseEvent) => {
      if (displayPanelRef.current && !displayPanelRef.current.contains(e.target as Node)) {
        setDisplayPanelOpen(false)
        setActiveSubRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [displayPanelOpen])

  // Diagram zoom / pan
  const [zoom, setZoom] = useState(100)
  const [panX, setPanX] = useState(20)
  const [panY, setPanY] = useState(20)
  const [analysisBusy, setAnalysisBusy] = useState(false)
  const isAnalysisRunning = analysisBusy || isContextCalculating
  const [plsResultsForDiagram, setPlsResultsForDiagram] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    const savedAnalysis = navState?.savedAnalysis

    if (savedAnalysis?.results && (savedAnalysis?.mode === 'pls-sem' || savedAnalysis?.mode === 'bootstrap' || savedAnalysis?.mode === 'plspredict' || savedAnalysis?.mode === 'advanced')) {
      if (navState?.savedModelSnapshot) {
        try {
          writeSharedStorageValue('results-canvas-model', JSON.stringify(cloneResultsModelSnapshot(navState.savedModelSnapshot)))
        } catch {
          // no-op
        }
        setSavedModel(cloneResultsModelSnapshot(navState.savedModelSnapshot as { constructs: CanvasConstruct[]; paths: CanvasPath[] }))
      }

      if (savedAnalysis.mode !== 'bootstrap') {
        setPlsResultsForDiagram(savedAnalysis.results as Record<string, unknown>)
      } else if (navState?.savedDiagramBaseResults) {
        setPlsResultsForDiagram(navState.savedDiagramBaseResults)
        try {
          writeSharedStorageValue('analysis-results-for-diagram', JSON.stringify(navState.savedDiagramBaseResults))
        } catch {
          // no-op
        }
      }
      setAnalysisMode(savedAnalysis.mode)
      if (savedAnalysis.mode === 'advanced') setSelectedPanel('priority-map')
      setAnalysisResults(savedAnalysis.results as Record<string, unknown>)
      setDiagramCollapsed(false)
      writeSharedStorageValue('analysis-mode', savedAnalysis.mode)
      writeSharedStorageValue('analysis-results', JSON.stringify(savedAnalysis.results))
      return
    }

    try {
      const modeRaw = readSharedStorageValue('analysis-mode')
      if (modeRaw === 'bootstrap' || modeRaw === 'plspredict' || modeRaw === 'pls-sem' || modeRaw === 'advanced') {
        setAnalysisMode(modeRaw)
        if (modeRaw === 'advanced') setSelectedPanel('priority-map')
      }

      const raw = readSharedStorageValue('analysis-results')
      if (!raw) return
      const parsed = JSON.parse(raw)
      setSavedModel(resolveSavedModelSnapshot(modelId, navState))
      if (modeRaw !== 'bootstrap') {
        setPlsResultsForDiagram(parsed as Record<string, unknown>)
      } else {
        try {
          const plsRaw = readSharedStorageValue('analysis-results-for-diagram')
          if (plsRaw) setPlsResultsForDiagram(JSON.parse(plsRaw) as Record<string, unknown>)
        } catch { /* no-op */ }
      }
      setAnalysisResults(parsed as Record<string, unknown>)
      setDiagramCollapsed(false)
    } catch {
      setAnalysisMode('pls-sem')
      setAnalysisResults(null)
    }
  }, [modelId, navState])

  useEffect(() => {
    if (!savedModel) return
    try {
      writeSharedStorageValue('results-canvas-model', JSON.stringify(savedModel))
    } catch {
      // no-op
    }
  }, [savedModel])

  const sidebarData = useMemo(() => buildSidebarSections(analysisMode), [analysisMode])

  useEffect(() => {
    const availablePanels = sidebarData.flatMap((section) => section.items.map((item) => item.id))
    if (availablePanels.includes(selectedPanel)) return
    const firstPanel = availablePanels[0]
    if (firstPanel) setSelectedPanel(firstPanel)
  }, [selectedPanel, sidebarData])

  useEffect(() => {
    setTableViewPreferences({})
  }, [analysisMode, analysisResults])

  const panelData = getPanelDataFromResults(analysisMode, selectedPanel, analysisResults)
  const tableViewKey = `${analysisMode}:${selectedPanel}`
  const tableViewOptions = getPanelTableViews(selectedPanel, analysisMode)
  const tableView = tableViewOptions.length
    ? tableViewPreferences[tableViewKey] ?? getDefaultPanelTableView(selectedPanel)
    : 'list'
  const handleTableViewChange = useCallback((nextView: ResultsTableView) => {
    setTableViewPreferences((previous) => ({
      ...previous,
      [tableViewKey]: nextView,
    }))
  }, [tableViewKey])

  const resolveWorkspaceContext = useCallback(() => {
    const raw = readWorkspaceClientCache()
    const all = raw ? JSON.parse(raw) : []
    if (!Array.isArray(all)) {
      return {
        allWorkspaces: [] as any[],
        workspace: null as any,
        migratedWorkspace: null as any,
        modelChild: null as any,
        dataset: null as any,
      }
    }

    const workspace = all.find((entry: any) => entry.children?.some((child: any) => child.id === modelId)) ?? null
    const migratedWorkspace = workspace ? migrateWorkspace(workspace) : null
    const modelChild = migratedWorkspace?.children?.find((child: any) => child.id === modelId) ?? null
    const dataset = migratedWorkspace ? getLinkedDatasetForModel(migratedWorkspace as any, modelId) : null

    return {
      allWorkspaces: all,
      workspace,
      migratedWorkspace,
      modelChild,
      dataset,
    }
  }, [modelId])

  const persistedPlsPredictSettings = useMemo(() => {
    const hasResultSettings =
      !!(analysisResults as any)?.meta?.analysis_settings?.plspredict ||
      !!(analysisResults as any)?.algorithm?.settings?.folds
    if (hasResultSettings) {
      return readPlsPredictSettingsFromResults(analysisResults)
    }

    const { modelChild } = resolveWorkspaceContext()
    return readPlsPredictSettingsFromState(modelChild?.state)
  }, [analysisResults, resolveWorkspaceContext])

  const canRunAdvancedAnalysis = useMemo(() => {
    const { modelChild } = resolveWorkspaceContext()
    const basePlsAnalysis = modelChild?.state?.basePlsAnalysis
    if (!basePlsAnalysis?.results || !savedModel) return false
    return basePlsAnalysis.graphSignature === buildAnalysisGraphSignature(savedModel)
  }, [resolveWorkspaceContext, savedModel])

  useEffect(() => {
    const shouldShowAdvancedHint =
      analysisMode === 'pls-sem' &&
      canRunAdvancedAnalysis &&
      !isAnalysisRunning

    const status = {
      hasCanvasItems: Boolean(savedModel?.constructs?.length || savedModel?.paths?.length),
      hasActiveModel: Boolean(savedModel),
      canRunAdvanced: canRunAdvancedAnalysis,
      showAdvancedHintToken: shouldShowAdvancedHint ? Date.now() : 0,
    }
    window.dispatchEvent(new CustomEvent('pls:action', { detail: { status } }))
  }, [isAnalysisRunning, analysisMode, analysisResults, canRunAdvancedAnalysis, savedModel])

  const persistResultsToWorkspace = useCallback((options: {
    mode: AnalysisMode
    results: Record<string, unknown>
    savedAt: string
    analysisSettings?: {
      plspredict?: PlsPredictSettings
      advanced?: AdvancedAnalysisSettings
    }
  }) => {
    const { allWorkspaces, migratedWorkspace, modelChild } = resolveWorkspaceContext()
    if (!migratedWorkspace || !modelChild) return

    const existingState = modelChild.state || {}
    const updatedModel = {
      ...modelChild,
      badge: 'Calculated' as const,
      updatedAt: new Date().toISOString(),
      state: {
        ...existingState,
        analysis: {
          mode: options.mode,
          results: options.results,
          savedAt: options.savedAt,
        },
        analysisSettings: {
          ...(existingState.analysisSettings || {}),
          ...(options.analysisSettings || {}),
        },
      },
    }

    const updatedChildren = migratedWorkspace.children.map((child: any) => child.id === modelId ? updatedModel : child)
    const updatedWorkspace = { ...migratedWorkspace, children: updatedChildren }
    const updatedAll = allWorkspaces.map((entry: any) => entry.id === updatedWorkspace.id ? updatedWorkspace : entry)
    writeWorkspaceClientCache(JSON.stringify(updatedAll))
    window.dispatchEvent(new CustomEvent('pls:workspaces-updated', { detail: { workspaces: updatedAll } }))
    ;(window as any).electronAPI?.saveWorkspace?.(updatedWorkspace)
  }, [modelId, resolveWorkspaceContext])

  const resolveRunPayload = useCallback((): RunPlsRequest | null => {
    const model = savedModel
    if (!model?.constructs?.length || !model?.paths?.length) {
      dispatchToast('warning', 'Model unavailable', 'Saved model geometry was not found for this results session.')
      return null
    }

    const { dataset, migratedWorkspace } = resolveWorkspaceContext()

    const cached = readDatasetViewCache(dataset?.id)
    const datasetPath = resolveDatasetFilePathFromRequest({
      datasetId: dataset?.id,
      fileName: dataset?.originalFileName || dataset?.filePath || dataset?.name,
      filePath: dataset?.filePath || '',
      datasetTempPath: dataset?.datasetTempPath || '',
      workspaceId: migratedWorkspace?.id,
      workspaceName: migratedWorkspace?.name,
      workspacePath: migratedWorkspace?.path || '',
    }, cached)

    if (!datasetPath) {
      dispatchToast('warning', 'No dataset found', 'This model has no linked dataset path available for re-analysis.')
      return null
    }

    const constructs = model.constructs
      .map((construct) => ({
        name: construct.name,
        type: construct.type,
        indicators: construct.indicators.map((indicator) => indicator.name).filter(Boolean),
      }))
      .filter((construct) => construct.indicators.length > 0)

    if (!constructs.length) {
      dispatchToast('warning', 'No constructs', 'No construct indicators found in saved model state.')
      return null
    }

    const constructNameById = new Map(model.constructs.map((construct) => [construct.id, construct.name]))
    const paths = model.paths
      .map((path) => ({
        from: constructNameById.get(path.from) || path.from,
        to: constructNameById.get(path.to) || path.to,
      }))
      .filter((path) => !!path.from && !!path.to && path.from !== path.to)

    if (!paths.length) {
      dispatchToast('warning', 'No structural paths', 'No valid structural paths found in saved model state.')
      return null
    }

    const algorithm = (getByPath(analysisResults, 'meta.algorithm') || getByPath(analysisResults, 'algorithm.settings.algorithm') || 'standard') as 'standard' | 'consistent'

    return {
      datasetPath,
      constructs,
      paths,
      algorithm: algorithm === 'consistent' ? 'consistent' : 'standard',
    }
  }, [analysisResults, modelId, resolveWorkspaceContext, savedModel])

  const currentResultsRoute = useCallback(() => `${location.pathname}${location.search || ''}`, [location.pathname, location.search])

  const startResultsCalculation = useCallback((
    type: 'bootstrap' | 'plspredict' | 'advanced',
    title: string,
    phases: CalcPhase[],
    subLabel?: string,
  ) => {
    calcDispatch({
      type: 'start',
      payload: {
        type,
        title,
        progressMode: 'indeterminate',
        phases,
        subLabel,
      },
    })
  }, [calcDispatch])

  const handleRunBootstrapFromResults = useCallback(async (settings: any) => {
    if (isAnalysisRunning) return

    const payload = resolveRunPayload()
    if (!payload) return

    setBootstrapOpen(false)
    setAnalysisBusy(true)
    const nboot = Number(settings?.subsamples) || 500
    startResultsCalculation(
      'bootstrap',
      `Bootstrapping ${nboot.toLocaleString()} samples`,
      [
        { id: 'prep', label: 'Preparing base model', status: 'pending' },
        { id: 'resample', label: 'Resampling', status: 'pending' },
        { id: 'final', label: 'Finalizing results', status: 'pending' },
      ],
      `${nboot.toLocaleString()} bootstrap samples`,
    )
    try {
      calcDispatch({ type: 'setPhase', phaseId: 'resample' })
      const bootstrapPayload = {
        ...payload,
        nboot,
        ciType: settings?.ciType || 'Percentile',
        confidenceLevel: settings?.confidenceLevel || '95%',
      }
      const result = await runBootstrapModel(bootstrapPayload)

      if (!result.success || !result.results) {
        const message = normalizeAnalysisFailureMessage(result.error)
        calcDispatch({ type: 'fail', message })
        dispatchToast('error', 'Bootstrap failed', message)
        return
      }

      calcDispatch({ type: 'setPhase', phaseId: 'final' })
      // Cache current PLS-SEM results as fallback for the bootstrap diagram overlay
      if (analysisMode === 'pls-sem' && analysisResults) {
        setPlsResultsForDiagram(analysisResults)
        try { writeSharedStorageValue('analysis-results-for-diagram', JSON.stringify(analysisResults)) } catch { /* no-op */ }
      }
      writeSharedStorageValue('analysis-mode', 'bootstrap')
      writeSharedStorageValue('analysis-results', JSON.stringify(result.results))
      setAnalysisMode('bootstrap')
      setAnalysisResults(result.results)
      setDiagramCollapsed(false)
      requestAnimationFrame(() => {
        calcDispatch({
          type: 'complete',
          result: { type: 'bootstrap', completedAt: Date.now(), resultsRoute: currentResultsRoute() },
          showTransientDone: false,
        })
      })
      dispatchToast('success', 'Bootstrap complete')
    } catch (error: any) {
      const message = error?.message || 'Unexpected error'
      calcDispatch({ type: 'fail', message })
      dispatchToast('error', 'Bootstrap failed', message)
    } finally {
      setAnalysisBusy(false)
    }
  }, [analysisResults, analysisMode, calcDispatch, currentResultsRoute, isAnalysisRunning, resolveRunPayload, startResultsCalculation])

  const handleRunPlsPredictFromResults = useCallback(async (settings: PlsPredictSettings) => {
    if (isAnalysisRunning) return

    const payload = resolveRunPayload()
    if (!payload) return

    const normalizedSettings = normalizePlsPredictSettings(settings)
    setPlsPredictOpen(false)
    setAnalysisBusy(true)
    const phases: CalcPhase[] = [
      { id: 'validation', label: 'Preparing prediction settings', status: 'pending' },
      { id: 'predict', label: 'Running cross-validation', status: 'pending' },
      ...(normalizedSettings.cvpatEnabled ? [{ id: 'cvpat', label: 'Running CVPAT comparison', status: 'pending' } as CalcPhase] : []),
      { id: 'final', label: 'Finalizing prediction results', status: 'pending' },
    ]
    startResultsCalculation('plspredict', 'Running PLSpredict', phases)
    try {
      calcDispatch({ type: 'setPhase', phaseId: 'predict' })
      const result = await runPlsPredictModel({
        ...payload,
        folds: normalizedSettings.folds,
        repetitions: normalizedSettings.repetitions,
        cvpatEnabled: normalizedSettings.cvpatEnabled,
      })

      if (!result.success || !result.results) {
        const message = normalizeAnalysisFailureMessage(result.error)
        calcDispatch({ type: 'fail', message })
        dispatchToast('error', 'PLS Predict failed', message)
        return
      }

      calcDispatch({ type: 'setPhase', phaseId: 'final' })
      const savedAt = new Date().toISOString()
      writeSharedStorageValue('analysis-mode', 'plspredict')
      writeSharedStorageValue('analysis-results', JSON.stringify(result.results))
      setAnalysisMode('plspredict')
      setAnalysisResults(result.results)
      persistResultsToWorkspace({
        mode: 'plspredict',
        results: result.results as Record<string, unknown>,
        savedAt,
        analysisSettings: {
          plspredict: normalizedSettings,
        },
      })
      calcDispatch({
        type: 'complete',
        result: { type: 'plspredict', completedAt: Date.now(), resultsRoute: currentResultsRoute() },
        showTransientDone: false,
      })
      dispatchToast('success', 'PLS Predict complete')
    } catch (error: any) {
      const message = error?.message || 'Unexpected error'
      calcDispatch({ type: 'fail', message })
      dispatchToast('error', 'PLS Predict failed', message)
    } finally {
      setAnalysisBusy(false)
    }
  }, [calcDispatch, currentResultsRoute, isAnalysisRunning, persistResultsToWorkspace, resolveRunPayload, startResultsCalculation])

  const handleRunAdvancedFromResults = useCallback(async (settings: AdvancedAnalysisSettings) => {
    if (isAnalysisRunning) return

    const payload = resolveRunPayload()
    if (!payload) return

    setAnalysisBusy(true)
    const phases: CalcPhase[] = [
      { id: 'prep', label: 'Preparing advanced analysis', status: 'pending' },
      ...(settings.analyses?.ipma ? [{ id: 'ipma', label: 'Running IPMA', status: 'pending' } as CalcPhase] : []),
      ...(settings.analyses?.nca ? [{ id: 'nca', label: `Running NCA - ${settings.runDepth.toLocaleString()} replications`, status: 'pending' } as CalcPhase] : []),
      ...(settings.analyses?.cipma ? [{ id: 'cipma', label: 'Running cIPMA', status: 'pending' } as CalcPhase] : []),
      { id: 'final', label: 'Finalizing advanced results', status: 'pending' },
    ]
    startResultsCalculation('advanced', `Running advanced analysis on ${settings.targetConstruct}`, phases)
    try {
      const firstAnalysisPhase = phases.find((phase) => phase.id !== 'prep' && phase.id !== 'final')
      if (firstAnalysisPhase) calcDispatch({ type: 'setPhase', phaseId: firstAnalysisPhase.id })
      const result = await runAdvancedAnalysisModel({
        ...payload,
        targetConstruct: settings.targetConstruct,
        predecessorScope: settings.predecessorScope,
        analyses: settings.analyses,
        runDepth: settings.runDepth,
        bottleneckStepSize: settings.bottleneckStepSize,
      })

      if (!result.success || !result.results) {
        const message = normalizeAnalysisFailureMessage(result.error)
        calcDispatch({ type: 'fail', message })
        dispatchToast('error', 'Advanced analysis failed', message)
        return
      }

      calcDispatch({ type: 'setPhase', phaseId: 'final' })
      const savedAt = new Date().toISOString()
      writeSharedStorageValue('analysis-mode', 'advanced')
      writeSharedStorageValue('analysis-results', JSON.stringify(result.results))
      setPlsResultsForDiagram(result.results as Record<string, unknown>)
      setAnalysisMode('advanced')
      setSelectedPanel('priority-map')
      setAnalysisResults(result.results)
      persistResultsToWorkspace({
        mode: 'advanced',
        results: result.results as Record<string, unknown>,
        savedAt,
        analysisSettings: {
          advanced: settings,
        },
      })
      setAdvancedOpen(false)
      calcDispatch({
        type: 'complete',
        result: { type: 'advanced', completedAt: Date.now(), resultsRoute: currentResultsRoute() },
        showTransientDone: false,
      })
      dispatchToast('success', 'Advanced analysis complete')
    } catch (error: any) {
      const message = error?.message || 'Unexpected error'
      calcDispatch({ type: 'fail', message })
      dispatchToast('error', 'Advanced analysis failed', message)
    } finally {
      setAnalysisBusy(false)
    }
  }, [calcDispatch, currentResultsRoute, isAnalysisRunning, persistResultsToWorkspace, resolveRunPayload, startResultsCalculation])

  const generateRScript = useCallback(() => {
    if (!savedModel?.constructs?.length) {
      return '# No model available to export'
    }
    const constructBlocks = savedModel.constructs.map((construct) => {
      const fn = construct.type === 'Formative' ? 'composite' : 'reflective'
      const indicators = construct.indicators.map((indicator) => `'${indicator.name}'`).join(', ')
      return `  ${fn}('${construct.name}', c(${indicators}))`
    })

    const constructNameById = new Map(savedModel.constructs.map((construct) => [construct.id, construct.name]))
    const pathBlocks = savedModel.paths.map((path) => {
      const fromName = constructNameById.get(path.from) || path.from
      const toName = constructNameById.get(path.to) || path.to
      return `  paths(from='${fromName}', to='${toName}')`
    })

    return [
      'library(seminr)',
      '',
      'mm <- constructs(',
      constructBlocks.join(',\n'),
      ')',
      '',
      'sm <- relationships(',
      pathBlocks.join(',\n'),
      ')',
      '',
      "model <- estimate_pls(data = survey_data, measurement_model = mm, structural_model = sm)",
      'summary(model)',
    ].join('\n')
  }, [savedModel])

  const handleCopyRScript = useCallback(async () => {
    try {
      const script = generateRScript()
      await navigator.clipboard.writeText(script)
      dispatchToast('success', 'R script copied to clipboard')
    } catch {
      dispatchToast('error', 'Failed to copy R script to clipboard')
    }
  }, [generateRScript])

  const handleExportRScript = useCallback(async () => {
    try {
      const script = generateRScript()
      const modelName = (() => {
        try {
          const raw = readWorkspaceClientCache()
          const all = raw ? JSON.parse(raw) : []
          const workspace = all.find((ws: any) => ws.children?.some((child: any) => child.id === modelId))
          const model = workspace?.children?.find((child: any) => child.id === modelId)
          return stripModelDisplayName(model?.name || modelId || 'Model') || 'Model'
        } catch {
          return stripModelDisplayName(modelId || 'Model') || 'Model'
        }
      })()
      const fileName = `${sanitizeFilename(`${modelName}-r-script`)}.R`
      const electronAPI = (window as any).electronAPI

      if (electronAPI?.showSaveDialog && electronAPI?.writeFile) {
        const saveRes = await electronAPI.showSaveDialog({
          defaultPath: fileName,
          filters: [{ name: 'R Script', extensions: ['R', 'r'] }],
        })
        if (saveRes?.canceled || !saveRes?.filePath) return

        const writeRes = await electronAPI.writeFile({
          filePath: saveRes.filePath,
          data: script,
          encoding: 'utf-8',
        })
        if (!writeRes?.success) {
          throw new Error(writeRes?.error || 'Could not save the R script.')
        }
        dispatchToast('success', 'R script exported', saveRes.filePath)
        return
      }

      const blob = new Blob([script], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      URL.revokeObjectURL(url)
      dispatchToast('success', 'R script exported', fileName)
    } catch (error: any) {
      dispatchToast('error', 'R script export failed', error?.message || 'Could not export the R script.')
    }
  }, [generateRScript, modelId])

  const handleExportHtml = useCallback(async () => {
    try {
      const electronAPI = (window as any).electronAPI
      if (!electronAPI?.writeFile || !electronAPI?.getDataPath || !electronAPI?.openPath) {
        dispatchToast('error', 'Export HTML is available in the Electron desktop app only.')
        return
      }

      const modelName = (() => {
        try {
          const raw = readWorkspaceClientCache()
          const all = raw ? JSON.parse(raw) : []
          const workspace = all.find((ws: any) => ws.children?.some((child: any) => child.id === modelId))
          const model = workspace?.children?.find((child: any) => child.id === modelId)
          return stripModelDisplayName(model?.name || modelId || 'Model') || 'Model'
        } catch {
          return stripModelDisplayName(modelId || 'Model') || 'Model'
        }
      })()

      const tabSections: Array<{ title?: string; items: Array<{ id: string; label: string }> }> = [
        { items: [{ id: 'path-diagram', label: 'Path diagram' }] },
        ...sidebarData.map((section) => ({
          title: section.label,
          items: section.items.map((item) => ({ id: item.id, label: item.label })),
        })),
      ]

      const diagramResults = buildDiagramResults(analysisResults, savedModel?.constructs, savedModel?.paths)
      const pathDiagramHtml = buildPathDiagramSvg(savedModel, diagramResults)

      const navHtml = tabSections.map((section) => {
        const heading = section.title ? `<div class="group-title">${escapeHtml(section.title)}</div>` : ''
        const items = section.items.map((item) => (
          `<a class="nav-item" href="#sec-${item.id}" data-target="sec-${item.id}">${escapeHtml(item.label)}</a>`
        )).join('')
        return `${heading}${items}`
      }).join('')

      const tabContentHtml = tabSections.flatMap((section) => section.items).map((item) => {
        if (item.id === 'path-diagram') {
          return `<section id="sec-${item.id}" class="result-section"><div class="section-head"><h2>${escapeHtml(item.label)}</h2></div>${pathDiagramHtml}</section>`
        }

        const data = getPanelDataFromResults(analysisMode, item.id, analysisResults)
        const rows = rowsFromData(data)
        const derivedRows = analysisMode === 'pls-sem' && item.id === 'specific-indirect' && !rows.length
          ? deriveSpecificIndirectRows(savedModel, analysisResults)
          : []
        const displayRows = rowsContainOnlyMessage(rows)
          ? []
          : derivedRows.length
            ? derivedRows
            : rows
        const indirectEffectPairs = item.id === 'total-indirect'
          ? buildIndirectEffectPairLookup(savedModel)
          : null
        const totalEffectPairs = item.id === 'total-effects'
          ? buildTotalEffectPairLookup(savedModel)
          : null
        const exportTableView = tableViewPreferences[`${analysisMode}:${item.id}`] ?? getDefaultPanelTableView(item.id)
        let tableHtml = buildExportTableHtml(
          displayRows,
          item.id,
          indirectEffectPairs || totalEffectPairs
            ? (row) => ({ rowLabel: row.row, indirectEffectPairs, totalEffectPairs })
            : undefined
        )

        if (item.id === 'path-coef') {
          const exportPathRows = parsePathCoefficients(analysisResults)
          if (exportTableView === 'matrix') {
            const { cols, matRows } = buildCrossMatrix(exportPathRows)
            tableHtml = buildExportTableFromRows(
              ['From / To', ...cols],
              matRows.map((row) => [
                row.id,
                ...cols.map((col) => row.data[col] == null ? '—' : formatPreciseNumber(row.data[col], getDecimals())),
              ]),
            )
          } else {
            tableHtml = buildExportTableFromRows(
              ['Path', 'Coefficient', 'T-Statistic', 'P-Value', 'CI 2.5%', 'CI 97.5%', 'Decision'],
              exportPathRows.map((row) => [
                row.path,
                formatPreciseNumber(row.coefficient, getDecimals()),
                Number.isFinite(row.tStatistic) ? fmtNum(row.tStatistic) : '—',
                formatPValueDisplay(row.pValue),
                Number.isFinite(row.ci25) ? fmtNum(row.ci25) : '—',
                Number.isFinite(row.ci975) ? fmtNum(row.ci975) : '—',
                row.status === 'pass' ? 'Significant' : row.status === 'neutral' ? 'N/A' : 'Not Sig.',
              ]),
            )
          }
        } else if (analysisMode !== 'bootstrap' && (item.id === 'outer-loadings' || item.id === 'outer-weights')) {
          const measurementRows = item.id === 'outer-loadings'
            ? parseOuterLoadings(analysisResults)
            : parseOuterWeights(analysisResults)
          const valueLabel = item.id === 'outer-weights' ? 'Weight' : 'Loading'
          if (exportTableView === 'matrix') {
            const { cols, matRows } = buildMeasurementMatrix(measurementRows)
            tableHtml = buildExportTableFromRows(
              ['Indicator', ...cols],
              matRows.map((row) => [
                row.id,
                ...cols.map((col) => row.data[col] == null ? '—' : fmtNum(row.data[col])),
              ]),
            )
          } else {
            tableHtml = buildExportTableFromRows(
              ['Construct', 'Indicator', valueLabel],
              measurementRows.map((row) => [row.construct, row.indicator, fmtNum(row.loading)]),
            )
          }
        } else if (item.id === 'q2-predict') {
          const q2Rows = extractQ2PredictRows(rows)
          tableHtml = buildExportTableFromRows(
            ['Indicator', 'Q²predict'],
            q2Rows.map((row) => [row.label, fmtNum(row.q2Predict)]),
          )
        } else if (item.id === 'pls-lm-comparison') {
          const comparisonRows = extractPlsLmComparisonRows(rows)
          tableHtml = buildExportTableFromRows(
            ['Indicator', 'PLS RMSE', 'PLS MAE', 'LM RMSE', 'LM MAE'],
            comparisonRows.map((row) => [
              row.label,
              row.plsRmse == null ? '—' : fmtNum(row.plsRmse),
              row.plsMae == null ? '—' : fmtNum(row.plsMae),
              row.lmRmse == null ? '—' : fmtNum(row.lmRmse),
              row.lmMae == null ? '—' : fmtNum(row.lmMae),
            ]),
          )
        }
        const body = item.id === 'execution-log'
          ? `<pre class="exec-log">${escapeHtml(parseExecutionLog(analysisResults))}</pre>`
          : tableHtml
        const copyButton = /<table[\s>]/i.test(body)
          ? `<button type="button" class="copy-table-button" title="Copy table for Word" aria-label="Copy ${escapeHtml(item.label)} table">${EXPORT_COPY_ICON_SVG}</button>`
          : ''
        return `<section id="sec-${item.id}" class="result-section"><div class="section-head"><h2>${escapeHtml(item.label)}</h2>${copyButton}</div>${body}</section>`
      }).join('')

      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>metis Results - ${escapeHtml(modelName)}</title>
  <style>
    :root { --bg:#F4F6F8; --card:#FFFFFF; --line:#D7DDE6; --text:#1A1F2B; --muted:#5F6978; --brand:#87976B; --indicator:#C6A24B; --color-page:#F4F6F8; --color-page-rgb:244 246 248; --color-surface:#FFFFFF; --color-surface-rgb:255 255 255; --color-elevated:#FFFFFF; --color-elevated-rgb:255 255 255; --color-border:#D7DDE6; --color-border-rgb:215 221 230; --color-text-primary:#1A1F2B; --color-text-primary-rgb:26 31 43; --color-text-secondary:#5F6978; --color-text-secondary-rgb:95 105 120; --color-text-muted:#8A94A5; --color-text-muted-rgb:138 148 165; --color-on-accent:#181818; --color-accent:#87976B; --color-accent-rgb:135 151 107; --color-success:#87976B; --color-warning:#9B7A2E; --color-danger:#C65D44; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, Segoe UI, Arial, sans-serif; background: var(--bg); color: var(--text); }
    .app { display:flex; height:100vh; overflow:hidden; }
    .sidebar { width: 320px; background:#FFFFFF; border-right:1px solid var(--line); padding:18px 14px; overflow:auto; position:sticky; top:0; height:100vh; flex-shrink:0; }
    .brand { display:flex; gap:10px; align-items:center; margin-bottom:8px; }
    .logo { width:28px; height:28px; display:grid; place-items:center; flex-shrink:0; color:var(--brand); }
    .logo svg { width:100%; height:100%; display:block; }
    .brand-title { font-size:17px; font-weight:800; letter-spacing:.2px; }
    .model-name { color:var(--muted); font-size:12px; margin:4px 0 16px 38px; word-break:break-word; }
    .group-title { margin:14px 8px 6px; color:var(--muted); font-size:11px; text-transform:uppercase; font-weight:700; letter-spacing:.5px; }
    .nav-item { display:block; width:100%; text-align:left; border:0; background:transparent; color:var(--color-on-accent); border-radius:8px; padding:8px 10px; font-size:13px; cursor:pointer; margin:2px 0; text-decoration:none; }
    .nav-item:hover { background:rgba(135,151,107,0.08); }
    .nav-item.active { background:rgb(var(--color-accent-rgb) / 0.16); color:var(--color-on-accent); font-weight:700; }
    .content { flex:1; padding:18px; overflow:auto; height:100vh; }
    .result-section { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:14px; scroll-margin-top:10px; }
    .section-head { display:flex; align-items:center; gap:12px; margin:0 0 14px; }
    h2 { margin:0; font-size:18px; flex:1; }
    .copy-table-button { width:30px; height:30px; display:grid; place-items:center; border:1px solid var(--line); border-radius:8px; background:#FFFFFF; color:var(--muted); cursor:pointer; transition:background .15s ease,color .15s ease,border-color .15s ease; }
    .copy-table-button svg { width:15px; height:15px; display:block; }
    .copy-table-button:hover { color:var(--text); background:rgba(135,151,107,0.08); border-color:rgba(135,151,107,0.35); }
    .copy-table-button.copied { color:var(--brand); border-color:rgba(135,151,107,0.55); background:rgba(135,151,107,0.12); }
    .table-wrap { overflow:auto; border:1px solid var(--line); border-radius:10px; }
    table { border-collapse: collapse; width:100%; font-size:12px; }
    th, td { border-bottom:1px solid var(--line); padding:8px 10px; text-align:left; vertical-align:top; }
    th { background:rgb(var(--color-accent-rgb) / 0.16); color:var(--color-on-accent); font-size:11px; text-transform:uppercase; letter-spacing:.4px; }
    tr:nth-child(even) td { background:#F8FAFC; }
    .empty { color:var(--muted); font-size:13px; padding:12px; border:1px dashed var(--line); border-radius:10px; background:#FFFFFF; }
    .exec-log { margin:0; background:#F8FAFC; border:1px solid var(--line); border-radius:10px; padding:12px; font-size:12px; white-space:pre-wrap; }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo">${EXPORT_LOGO_SVG}</div>
        <div class="brand-title">${APP_BRAND_NAME}</div>
      </div>
      <div class="model-name">${escapeHtml(modelName)}</div>
      ${navHtml}
    </aside>
    <main class="content">
      ${tabContentHtml}
    </main>
  </div>
  <script>
    const navItems = Array.from(document.querySelectorAll('.nav-item'));
    const sections = Array.from(document.querySelectorAll('.result-section'));
    const content = document.querySelector('.content');

    function escapeClipboardHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function isNumericClipboardCell(value) {
      const text = String(value || '').trim();
      if (!text || text === '-' || text === '—') return false;
      if (/^<[ ]*-?(?:[0-9]+|[0-9]*[.][0-9]+)$/.test(text)) return true;
      const normalized = text.replace(/,/g, '');
      return /^-?(?:[0-9]+|[0-9]*[.][0-9]+)(?:%|e[+-]?[0-9]+)?$/i.test(normalized);
    }

    function formatClipboardCellValue(value) {
      const text = String(value || '').trim();
      if (!text || text === '-' || text === '—') return '—';
      if (/^<[ ]*-?(?:[0-9]+|[0-9]*[.][0-9]+)$/.test(text)) return text.replaceAll(' ', '');
      const normalized = text.replace(/,/g, '');
      if (/^-?(?:[0-9]*[.][0-9]+)(?:e[+-]?[0-9]+)?$/i.test(normalized)) {
        const numericValue = Number(normalized);
        return Number.isFinite(numericValue) ? numericValue.toFixed(3) : text;
      }
      return text;
    }

    function formatClipboardHeader(value) {
      return escapeClipboardHtml(value)
        .replace(/β/g, '<em>β</em>')
        .replace(/ρ/g, '<em>ρ</em>')
        .replace(/R²/g, '<em>R²</em>')
        .replace(/Q²/g, '<em>Q²</em>')
        .replace(/f²/g, '<em>f²</em>')
        .replace(/T statistics/gi, '<em>t</em> statistics')
        .replace(/T-Statistic/gi, '<em>t</em>-Statistic')
        .replace(/P values/gi, '<em>p</em> values')
        .replace(/P-Value/gi, '<em>p</em>-Value')
        .replace(/R square/gi, '<em>R²</em>')
        .replace(/Q2predict/gi, '<em>Q²</em>predict');
    }

    function getClipboardColumnAlignments(headers, rows) {
      const columnCount = Math.max(headers.length, ...rows.map((row) => row.length), 0);
      return Array.from({ length: columnCount }, (_, columnIndex) => {
        if (columnIndex === 0) return 'left';
        const values = rows
          .map((row) => row[columnIndex] || '')
          .filter((value) => {
            const text = String(value).trim();
            return text.length > 0 && text !== '-' && text !== '—';
          });
        return values.length > 0 && values.every(isNumericClipboardCell) ? 'right' : 'left';
      });
    }

    function buildExportClipboardPayload(section) {
      const table = section.querySelector('table');
      if (!table) return null;
      const title = (section.querySelector('h2')?.textContent || 'Results table').trim();
      const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => (cell.textContent || '').trim());
      const rows = Array.from(table.querySelectorAll('tbody tr')).map((row) => (
        Array.from(row.querySelectorAll('td')).map((cell) => (cell.textContent || '').trim())
      ));
      if (!rows.length) return null;

      const alignments = getClipboardColumnAlignments(headers, rows);
      const thead = headers.length
        ? '<thead><tr>' + headers.map((header, columnIndex) => (
            '<th style="font-weight:400;border:none;border-top:1.5pt solid #000000;border-bottom:1.5pt solid #000000;padding:3pt 8pt;text-align:' + (alignments[columnIndex] || 'left') + ';">' + formatClipboardHeader(header) + '</th>'
          )).join('') + '</tr></thead>'
        : '';
      const tbody = '<tbody>' + rows.map((row, rowIndex) => {
        const isLastRow = rowIndex === rows.length - 1;
        return '<tr>' + row.map((cell, columnIndex) => (
          '<td style="border:none;' + (isLastRow ? 'border-bottom:1.5pt solid #000000;' : '') + 'padding:3pt 8pt;text-align:' + (alignments[columnIndex] || 'left') + ';">' + escapeClipboardHtml(formatClipboardCellValue(cell)) + '</td>'
        )).join('') + '</tr>';
      }).join('') + '</tbody>';

      const html = '<html><body><div style="font-family:&quot;Times New Roman&quot;, Times, serif;color:#000000;">' +
        '<section style="margin:0 0 18pt;">' +
        '<p style="margin:0 0 2pt;font-family:&quot;Times New Roman&quot;, Times, serif;font-size:12pt;color:#000000;"><strong>Table 1</strong></p>' +
        '<p style="margin:0 0 8pt;font-family:&quot;Times New Roman&quot;, Times, serif;font-size:12pt;color:#000000;">' + escapeClipboardHtml(title) + '</p>' +
        '<table style="border-collapse:collapse;font-family:&quot;Times New Roman&quot;, Times, serif;font-size:12pt;color:#000000;border-top:1.5pt solid #000000;border-bottom:1.5pt solid #000000;margin:0 0 6pt;">' +
        thead + tbody +
        '</table>' +
        '<p style="margin:6pt 0 0;font-family:&quot;Times New Roman&quot;, Times, serif;font-size:10pt;color:#000000;"><em>Note.</em></p>' +
        '</section></div></body></html>';

      const textLines = ['Table 1', title];
      if (headers.length) textLines.push(headers.join('\t'));
      rows.forEach((row) => textLines.push(row.map(formatClipboardCellValue).join('\t')));
      return { html, text: textLines.join('\n') };
    }

    function copyRichTextToClipboard(html, text) {
      let copiedRichHtml = false;
      const marker = document.createElement('span');
      marker.textContent = text || 'Results table';
      marker.style.position = 'fixed';
      marker.style.left = '0';
      marker.style.top = '0';
      marker.style.opacity = '0';
      marker.style.pointerEvents = 'none';
      marker.style.whiteSpace = 'pre';
      document.body.appendChild(marker);

      const handleCopy = (event) => {
        if (!event.clipboardData) return;
        event.preventDefault();
        event.clipboardData.setData('text/html', html);
        event.clipboardData.setData('text/plain', text);
        copiedRichHtml = true;
      };

      document.addEventListener('copy', handleCopy);
      const range = document.createRange();
      range.selectNodeContents(marker);
      const selection = window.getSelection();
      if (!selection) {
        document.removeEventListener('copy', handleCopy);
        marker.remove();
        return false;
      }
      const previousRanges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange());
      selection.removeAllRanges();
      selection.addRange(range);

      let commandSucceeded = false;
      try {
        commandSucceeded = document.execCommand('copy');
      } catch {
        commandSucceeded = false;
      } finally {
        selection.removeAllRanges();
        previousRanges.forEach((previousRange) => selection.addRange(previousRange));
        document.removeEventListener('copy', handleCopy);
        marker.remove();
      }

      return commandSucceeded && copiedRichHtml;
    }

    async function copyExportTable(button) {
      const section = button.closest('.result-section');
      const payload = section ? buildExportClipboardPayload(section) : null;
      if (!payload) return;

      try {
        if (copyRichTextToClipboard(payload.html, payload.text)) {
          button.classList.add('copied');
          window.setTimeout(() => button.classList.remove('copied'), 1200);
          return;
        }

        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([payload.html], { type: 'text/html' }),
              'text/plain': new Blob([payload.text], { type: 'text/plain' }),
            }),
          ]);
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(payload.text);
        } else {
          throw new Error('Clipboard unavailable');
        }
        button.classList.add('copied');
        window.setTimeout(() => button.classList.remove('copied'), 1200);
      } catch (error) {
        try {
          if (!navigator.clipboard?.writeText) throw error;
          await navigator.clipboard.writeText(payload.text);
          button.classList.add('copied');
          window.setTimeout(() => button.classList.remove('copied'), 1200);
        } catch {}
      }
    }

    function setActive(targetId) {
      navItems.forEach((item) => item.classList.toggle('active', item.dataset.target === targetId));
    }

    navItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = item.dataset.target;
        if (!targetId) return;
        const el = document.getElementById(targetId);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActive(targetId);
      });
    });

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible.length) setActive(visible[0].target.id);
    }, { root: content, threshold: [0.2, 0.4, 0.6], rootMargin: '-10% 0px -65% 0px' });

    sections.forEach((sec) => observer.observe(sec));
    document.querySelectorAll('.copy-table-button').forEach((button) => {
      button.addEventListener('click', () => copyExportTable(button));
    });
    if (sections.length) setActive(sections[0].id);
  </script>
</body>
</html>`

      const dataPathResult = await electronAPI.getDataPath()
      const dataPath = dataPathResult?.path || dataPathResult?.dataPath
      if (!dataPath) throw new Error('Could not resolve app data path for export')

      const safeModel = String(modelName).replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 40) || 'model'
      const filePath = `${String(dataPath).replace(/\\/g, '/')}/exports/metis-${safeModel}-${Date.now()}.html`

      const writeRes = await electronAPI.writeFile({
        filePath,
        data: html,
        encoding: 'utf-8',
      })
      if (!writeRes?.success) throw new Error(writeRes?.error || 'Write failed')

      const openRes = await electronAPI.openPath(filePath)
      if (!openRes?.success) {
        dispatchToast('warning', 'HTML exported', `File saved at ${filePath} (could not auto-open browser).`)
        return
      }

      dispatchToast('success', 'HTML report opened in default browser')
    } catch (err: any) {
      dispatchToast('error', `HTML export failed: ${err?.message || 'Unknown error'}`)
    }
  }, [analysisMode, analysisResults, modelId, savedModel, sidebarData])

  const handleSaveResults = useCallback(async () => {
    try {
      if (!analysisResults) {
        dispatchToast('warning', 'Save failed', 'No analysis results available to save.')
        return
      }

      const raw = readWorkspaceClientCache()
      const allWorkspaces = raw ? JSON.parse(raw) : []
      const workspace = allWorkspaces.find((ws: any) => ws.children?.some((child: any) => child.id === modelId))
      if (!workspace) {
        dispatchToast('error', 'Save failed', 'Could not find workspace for this model.')
        return
      }

      const modelChild = workspace.children.find((child: any) => child.id === modelId)
      const modelBaseName = String(modelChild?.name || modelId || 'Model').replace(/\.hbe$/i, '')
      const modeLabel = analysisMode === 'bootstrap' ? 'Bootstrap' : analysisMode === 'plspredict' ? 'PLSpredict' : analysisMode === 'advanced' ? 'Advanced analysis' : 'PLS-SEM'
      const savedAtIso = new Date().toISOString()
      const resultId = `r-${Date.now()}`
      const resultName = `${modelBaseName} — ${modeLabel}`

      const savedResultChild = {
        id: resultId,
        name: resultName,
        type: 'result' as const,
        badge: 'Calculated' as const,
        createdAt: savedAtIso,
        updatedAt: savedAtIso,
        meta: `${modeLabel} result`,
        linkedModelId: modelId,
        state: {
          analysis: {
            mode: analysisMode,
            results: analysisResults,
            savedAt: savedAtIso,
          },
          modelSnapshot: savedModel,
        },
      }

      const updatedChildren = workspace.children.map((child: any) => {
        if (child.id !== modelId) return child
        const existingState = child.state || {}
        return {
          ...child,
          updatedAt: new Date().toISOString(),
          state: {
            ...existingState,
            analysis: {
              mode: analysisMode,
              results: analysisResults,
              savedAt: new Date().toISOString(),
            },
          },
        }
      }).concat(savedResultChild)

      const updatedWorkspace = { ...workspace, children: updatedChildren }
      const updatedAll = allWorkspaces.map((ws: any) => ws.id === workspace.id ? updatedWorkspace : ws)
      writeWorkspaceClientCache(JSON.stringify(updatedAll))
      window.dispatchEvent(new CustomEvent('pls:workspaces-updated', { detail: { workspaces: updatedAll } }))
      await (window as any).electronAPI?.saveWorkspace?.(updatedWorkspace)
      dispatchToast('success', `Saved result: ${resultName}`)
    } catch (err: any) {
      dispatchToast('error', 'Save failed', err?.message || 'Unknown error')
    }
  }, [analysisMode, analysisResults, modelId, savedModel])

  const showDiagramTools = analysisMode === 'pls-sem' || analysisMode === 'bootstrap' || analysisMode === 'advanced'
  const showDiagram = showDiagramTools && !diagramCollapsed
  const sidebarModeLabel = getModeResultsLabel(analysisMode)

  const zoomIn  = useCallback(() => setZoom(z => Math.min(300, z + 10)), [])
  const zoomOut = useCallback(() => setZoom(z => Math.max(20,  z - 10)), [])
  const zoomFit = useCallback(() => { setZoom(100); setPanX(20); setPanY(20) }, [])
  const handlePanChange = useCallback((x: number, y: number) => { setPanX(x); setPanY(y) }, [])

  // Keyboard: Ctrl/Cmd +, -, 0, B
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if      (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn()  }
      else if (e.key === '-')                   { e.preventDefault(); zoomOut() }
      else if (e.key === '0')                   { e.preventDefault(); zoomFit() }
      else if (e.key === 'b' || e.key === 'B')  { e.preventDefault(); if (!isAnalysisRunning) setBootstrapOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isAnalysisRunning, zoomIn, zoomOut, zoomFit])

  // TitleBar menu actions
  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<{ action: string }>).detail?.action
      if (action === 'run-bootstrap' && !isAnalysisRunning) setBootstrapOpen(true)
      if (action === 'run-pls-predict' && !isAnalysisRunning) setPlsPredictOpen(true)
      if (action === 'run-advanced-analysis' && canRunAdvancedAnalysis && !isAnalysisRunning) setAdvancedOpen(true)
      if (action === 'results:export-r-script') void handleExportRScript()
    }
    window.addEventListener('pls:action', handler)
    return () => window.removeEventListener('pls:action', handler)
  }, [canRunAdvancedAnalysis, handleExportRScript, isAnalysisRunning])

  return (
    <div className="h-full w-full flex flex-col overflow-hidden select-none" style={{ backgroundColor: 'var(--color-sidebar-bg)' }}>

      {/* ══════════════════════════════════════════════════════════════
          SINGLE FULL-WIDTH TOOLBAR
          Save Results | Export HTML | Copy R Script
          [spacer]
          ⊙ Graphical output ▾ | | zoom− % zoom+ | ⤢ | | ⊟ Collapse
      ══════════════════════════════════════════════════════════════ */}
      <div
        className="h-11 flex items-center px-3 gap-0.5 shrink-0 z-20"
        style={{ background: 'var(--color-titlebar-bg)' }}
      >
        {/* Spacer */}
        <div className="flex-1" />

        {/* Save Results */}
        <button onClick={handleSaveResults} className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] rounded transition-colors text-text-muted">
          <Download size={14} />
          <span className="text-xs">Save Results</span>
        </button>

        <div className="w-px h-5 bg-border/50 mx-1.5" />

        {/* Export HTML */}
        <button onClick={handleExportHtml} className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] hover:text-text-primary rounded transition-colors" style={{ color: 'var(--color-title-tab)' }}>
          <FileCode size={14} />
          <span className="text-xs">Export HTML</span>
        </button>

        {/* Copy R Script */}
        <button onClick={handleCopyRScript} className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] hover:text-text-primary rounded transition-colors text-text-muted">
          <Code size={14} />
          <span className="text-xs">Copy R Script</span>
        </button>

        {showDiagramTools && <div className="w-px h-5 bg-border/50 mx-1.5" />}

        {/* ── Diagram display panel (right side) ── */}
        {showDiagramTools && <div className="relative" ref={displayPanelRef}>
          {/* Trigger button — matches ui.pen dispDrop */}
          <button
            className="flex items-center gap-1.5 h-7 px-2.5 rounded transition-colors"
            style={{
              background: 'var(--color-page)',
              border: '1px solid var(--color-border)',
              color:        'var(--color-text-primary)',
            }}
            onClick={() => { setDisplayPanelOpen(o => !o); setActiveSubRow(null) }}
          >
            <Graph size={12} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 600 }}>
              Graphical output
            </span>
            <CaretDown size={9} style={{ color: 'var(--color-text-muted)' }} />
          </button>

          {/* Popover panel — mirrors ui.pen "Path Coefficient Dropdown" */}
          {displayPanelOpen && (
            <div
              className="absolute z-50"
              style={{
                top: 'calc(100% + 6px)',
                right: 0,
                width: 297,
                background: 'var(--color-page)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                boxShadow: '0 8px 24px 2px rgba(0,0,0,0.4)',
                padding: 12,
              }}
            >
              {/* Panel header */}
              <div className="flex items-center gap-2 mb-2">
                <Graph size={14} style={{ color: 'var(--color-text-secondary)' }} />
                <span style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600 }}>
                  Graphical output
                </span>
              </div>
              <div style={{ height: 1, background: 'var(--color-border)', marginBottom: 10 }} />

              {/* Three setting rows */}
              {([
                { key: 'structural',  label: 'Structural model',  value: structuralMode,  options: STRUCTURAL_OPTIONS,  setter: setStructuralMode  as (v: string) => void },
                { key: 'measurement', label: 'Measurement model', value: measurementMode, options: MEASUREMENT_OPTIONS, setter: setMeasurementMode as (v: string) => void },
                { key: 'constructs',  label: 'Constructs',        value: constructMode,   options: CONSTRUCT_OPTIONS,   setter: setConstructMode   as (v: string) => void },
              ]).map(row => (
                <div key={row.key} style={{ marginBottom: 8 }}>
                  {/* Row header */}
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>
                      {row.label}
                    </span>
                    <button
                      className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                      onClick={() => setActiveSubRow(activeSubRow === row.key ? null : row.key)}
                    >
                      <span style={{ color: 'var(--color-accent)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600 }}>
                        {row.value}
                      </span>
                      <CaretDown size={9} style={{ color: 'var(--color-accent)', transform: activeSubRow === row.key ? 'rotate(180deg)' : 'none' }} />
                    </button>
                  </div>
                  {/* Expanded option list */}
                  {activeSubRow === row.key && (
                    <div
                      className="mt-1.5 rounded overflow-hidden"
                      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
                    >
                      {row.options.map(opt => (
                        <button
                          key={opt}
                          className="w-full flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.75)]"
                          onClick={() => { row.setter(opt); setActiveSubRow(null) }}
                        >
                          <span style={{ width: 12, flexShrink: 0 }}>
                            {opt === row.value && <Check size={10} color="var(--color-accent)" />}
                          </span>
                          <span style={{
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: 11,
                            color: opt === row.value ? 'var(--color-accent)' : '#8B8B9E',
                          }}>
                            {opt}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Highlight paths row (static, no sub-dropdown for now) */}
              <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
                <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>
                  Highlight paths
                </span>
                <span style={{ color: '#8B8B9E', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600 }}>
                  Off
                </span>
              </div>
            </div>
          )}
        </div>}

        {/* Zoom */}
        {showDiagramTools && <button onClick={zoomOut} className="p-1.5 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] rounded text-text-muted" title="Zoom out (Ctrl −)">
          <MagnifyingGlassMinus size={14} />
        </button>}
        {showDiagramTools && <span className="text-[11px] text-text-muted w-9 text-center tabular-nums">{zoom}%</span>}
        {showDiagramTools && <button onClick={zoomIn} className="p-1.5 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] rounded text-text-muted" title="Zoom in (Ctrl +)">
          <MagnifyingGlassPlus size={14} />
        </button>}
        {showDiagramTools && <button onClick={zoomFit} className="p-1.5 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] rounded text-text-muted" title="Fit to screen (Ctrl 0)">
          <ArrowSquareOut size={14} />
        </button>}

        {showDiagramTools && <div className="w-px h-5 bg-border/50 mx-1.5" />}

        {/* Collapse / Expand */}
        {showDiagramTools && (!diagramCollapsed ? (
          <button onClick={() => setDiagramCollapsed(true)}
            className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] rounded text-xs text-text-muted transition-colors">
            <ArrowsInSimple size={13} />
            <span>Collapse</span>
          </button>
        ) : (
          <button onClick={() => setDiagramCollapsed(false)}
            className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-[rgb(var(--color-hover-rgb)/0.75)] rounded text-xs text-text-muted transition-colors">
            <ArrowsOutSimple size={13} />
            <span>Expand</span>
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MAIN AREA  (sidebar + content)
      ══════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Left sidebar — fixed 240px, no divider border ── */}
        <div className="w-60 flex flex-col shrink-0 overflow-hidden" style={{ background: 'var(--color-sidebar-bg)' }}>
          <div className="h-10 px-3 flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate(-1)}
              className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.75)] hover:text-text-primary"
              title="Back"
              aria-label="Back"
            >
              <ArrowLeft size={14} />
            </button>
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider truncate">
              {sidebarModeLabel}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {sidebarData.map(section => (
              <SidebarSectionComponent
                key={section.id}
                section={section}
                selectedPanel={selectedPanel}
                onSelectPanel={setSelectedPanel}
              />
            ))}
          </div>
        </div>

        {/* ── Content area ── */}
        <div
          className="flex-1 flex flex-col overflow-hidden min-h-0"
          style={{
            background: RESULTS_PANEL_BACKGROUND,
            borderRadius: '12px 0 0 12px',
          }}
        >

          {/* Diagram canvas — shown when not collapsed */}
          {showDiagram && (
            <div className="shrink-0 overflow-hidden border-b border-border" style={{ height: diagramHeight }}>
              <DiagramCanvas
                zoom={zoom} panX={panX} panY={panY}
                onZoomChange={setZoom}
                onPanChange={handlePanChange}
                structuralMode={structuralMode}
                measurementMode={measurementMode}
                constructMode={constructMode}
                canvasConstructs={savedModel?.constructs}
                canvasPaths={savedModel?.paths}
                results={analysisResults ? buildDiagramResults(
                  analysisResults,
                  savedModel?.constructs,
                  savedModel?.paths,
                  analysisMode === 'bootstrap' ? (plsResultsForDiagram ?? undefined) : undefined,
                ) : undefined}
                onModelChange={setSavedModel}
              />
            </div>
          )}

          {/* Table panel — drag handle + toolbar + scrollable body */}
          <TablePanel
            selectedPanel={selectedPanel}
            diagramHeight={diagramHeight}
            onDiagramHeightChange={setDiagramHeight}
            diagramCollapsed={!showDiagram}
            analysisMode={analysisMode}
            panelData={panelData}
            analysisResults={analysisResults}
            savedModel={savedModel}
            tableView={tableView}
            tableViewOptions={tableViewOptions}
            onTableViewChange={handleTableViewChange}
          />
        </div>
      </div>

      {/* Bootstrap Settings overlay */}
      {bootstrapOpen && (
        <BootstrapModal
          onClose={() => {
            if (isAnalysisRunning) return
            setBootstrapOpen(false)
          }}
          onRun={handleRunBootstrapFromResults}
          isRunning={isAnalysisRunning}
        />
      )}

      {plspredictOpen && (
        <PlsPredictModal
          onClose={() => {
            if (isAnalysisRunning) return
            setPlsPredictOpen(false)
          }}
          onRun={handleRunPlsPredictFromResults}
          initialSettings={persistedPlsPredictSettings}
          isRunning={isAnalysisRunning}
        />
      )}

      {advancedOpen && (
        <AdvancedAnalysisModal
          constructs={savedModel?.constructs ?? []}
          paths={savedModel?.paths ?? []}
          onClose={() => {
            if (isAnalysisRunning) return
            setAdvancedOpen(false)
          }}
          onRun={handleRunAdvancedFromResults}
          initialSettings={(resolveWorkspaceContext().modelChild?.state?.analysisSettings?.advanced ?? undefined) as Partial<AdvancedAnalysisSettings> | undefined}
          isRunning={isAnalysisRunning}
        />
      )}
    </div>
  )
}
