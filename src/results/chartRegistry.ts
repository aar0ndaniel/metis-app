import type { AnalysisMode } from './panelCatalog'

export type ChartKind =
  | 'horizontal-bar'
  | 'forest-plot'
  | 'grouped-bar'
  | 'heatmap'
  | 'scatter-quadrant'
  | 'scatter-line'
  | 'histogram'
  | 'scorecard'
  | 'dot-plot'

export interface ChartConfig {
  chartKind: ChartKind
  computeOnDemand: boolean
  exportChart: boolean
  defaultPreviewHeight: number
  supportsExpand: boolean
}

const DEFAULT_PREVIEW_HEIGHT = 320

function makeChartConfig(
  chartKind: ChartKind,
  overrides: Partial<ChartConfig> = {},
): ChartConfig {
  return {
    chartKind,
    computeOnDemand: true,
    exportChart: true,
    defaultPreviewHeight: DEFAULT_PREVIEW_HEIGHT,
    supportsExpand: true,
    ...overrides,
  }
}

const CHART_REGISTRY: Record<AnalysisMode, Record<string, ChartConfig>> = {
  'pls-sem': {
    'path-coef': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 340 }),
    'total-effects': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 340 }),
    'total-indirect': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 340 }),
    'specific-indirect': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 340 }),
    'r-square': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 300 }),
    'reliability': makeChartConfig('grouped-bar', { defaultPreviewHeight: 300 }),
    'outer-loadings': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 340 }),
    'outer-weights': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 340 }),
    'vif': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 340 }),
    'f-square': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 340 }),
    'cross-loadings': makeChartConfig('heatmap', { defaultPreviewHeight: 360 }),
    'discriminant': makeChartConfig('heatmap', { defaultPreviewHeight: 340 }),
    'model-fit': makeChartConfig('scorecard', { defaultPreviewHeight: 220, supportsExpand: false }),
  },
  bootstrap: {
    'path-coef': makeChartConfig('forest-plot', { defaultPreviewHeight: 360 }),
    'total-effects': makeChartConfig('forest-plot', { defaultPreviewHeight: 360 }),
    'total-indirect': makeChartConfig('forest-plot', { defaultPreviewHeight: 360 }),
    'specific-indirect': makeChartConfig('forest-plot', { defaultPreviewHeight: 360 }),
    'outer-loadings': makeChartConfig('forest-plot', { defaultPreviewHeight: 360 }),
    'outer-weights': makeChartConfig('forest-plot', { defaultPreviewHeight: 360 }),
    'r-square': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 300 }),
    'f-square': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 340 }),
    'vif': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 340 }),
    'reliability': makeChartConfig('grouped-bar', { defaultPreviewHeight: 300 }),
    'cross-loadings': makeChartConfig('heatmap', { defaultPreviewHeight: 360 }),
    'discriminant': makeChartConfig('heatmap', { defaultPreviewHeight: 340 }),
    'htmt-confidence-intervals': makeChartConfig('heatmap', { defaultPreviewHeight: 340 }),
  },
  plspredict: {
    'plspredict-mv-summary': makeChartConfig('grouped-bar', { defaultPreviewHeight: 300 }),
    'plspredict-lv-summary': makeChartConfig('grouped-bar', { defaultPreviewHeight: 300 }),
    'pls-lm-comparison': makeChartConfig('grouped-bar', { defaultPreviewHeight: 300 }),
    'q2-predict': makeChartConfig('dot-plot', { defaultPreviewHeight: 300 }),
    'mv-predictions-errors': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 340 }),
    'lv-predictions-errors': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 340 }),
    'plsem-mv-error-hist': makeChartConfig('histogram', { defaultPreviewHeight: 300 }),
    'plsem-lv-error-hist': makeChartConfig('histogram', { defaultPreviewHeight: 300 }),
  },
  advanced: {
    'path-coef': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 340 }),
    'priority-map': makeChartConfig('scatter-quadrant', { defaultPreviewHeight: 340 }),
    'necessity-check': makeChartConfig('horizontal-bar', { defaultPreviewHeight: 340 }),
    'ceiling-lines': makeChartConfig('scatter-line', { defaultPreviewHeight: 420 }),
    'cipma-priorities': makeChartConfig('scatter-quadrant', { defaultPreviewHeight: 340 }),
    'bottleneck-table': makeChartConfig('heatmap', { defaultPreviewHeight: 360 }),
  },
}

export function getChartConfig(mode: AnalysisMode, panelId: string): ChartConfig | null {
  const config = CHART_REGISTRY[mode]?.[panelId]
  return config ? { ...config } : null
}

function supportsChart(mode: AnalysisMode, panelId: string): boolean {
  return getChartConfig(mode, panelId) !== null
}

export function shouldExportChart(mode: AnalysisMode, panelId: string): boolean {
  return getChartConfig(mode, panelId)?.exportChart === true
}

export const CHART_SUPPORTED_PANELS = new Set(
  Array.from(
    new Set(
      Object.values(CHART_REGISTRY).flatMap((registry) => Object.keys(registry)),
    ),
  ),
)
