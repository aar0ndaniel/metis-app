export type AnalysisMode = 'pls-sem' | 'bootstrap' | 'plspredict' | 'advanced'

export type PanelIconKey =
  | 'graph'
  | 'table'
  | 'file-code'
  | 'check-circle'
  | 'info'
  | 'folders'

export interface PanelDefinition {
  id: string
  label: string
  iconKey: PanelIconKey
  isLeaf?: boolean
  placeholderKind?: string
  showChart?: boolean
  baseModelReference?: boolean
}

export interface PanelSection {
  id: string
  label: string
  defaultOpen: boolean
  tone?: 'default' | 'subtle'
  items: PanelDefinition[]
}

const PANEL_SECTIONS: Record<AnalysisMode, PanelSection[]> = {
  'pls-sem': [
    {
      id: 'structural-effects',
      label: 'Structural effects',
      defaultOpen: true,
      items: [
        { id: 'path-coef', label: 'Path coefficients', iconKey: 'graph', showChart: true },
        { id: 'total-indirect', label: 'Total indirect effects', iconKey: 'graph', showChart: true },
        { id: 'specific-indirect', label: 'Specific indirect effects', iconKey: 'graph', showChart: true },
        { id: 'total-effects', label: 'Total effects', iconKey: 'graph', showChart: true },
      ],
    },
    {
      id: 'measurement-model',
      label: 'Measurement model',
      defaultOpen: true,
      items: [
        { id: 'outer-loadings', label: 'Outer loadings', iconKey: 'table' },
        { id: 'outer-weights', label: 'Outer weights', iconKey: 'table' },
        { id: 'reliability', label: 'Construct reliability & validity', iconKey: 'check-circle' },
        { id: 'discriminant', label: 'Discriminant validity', iconKey: 'check-circle' },
        { id: 'cross-loadings', label: 'Cross-loadings', iconKey: 'table' },
      ],
    },
    {
      id: 'model-quality',
      label: 'Model quality',
      defaultOpen: true,
      items: [
        { id: 'r-square', label: 'R² / Adjusted R²', iconKey: 'graph' },
        { id: 'f-square', label: 'f²', iconKey: 'graph', showChart: true },
        { id: 'vif', label: 'VIF', iconKey: 'info' },
        { id: 'model-fit', label: 'Model fit', iconKey: 'check-circle' },
        { id: 'model-select', label: 'Model selection criteria', iconKey: 'check-circle' },
      ],
    },
    {
      id: 'data-diagnostics',
      label: 'Data & diagnostics',
      defaultOpen: false,
      tone: 'subtle',
      items: [
        { id: 'latent-variables', label: 'Latent variables', iconKey: 'folders' },
        { id: 'indicator-correlations', label: 'Indicator correlations', iconKey: 'table' },
        { id: 'indicator-original', label: 'Indicator data', iconKey: 'table' },
        { id: 'indicator-standardised', label: 'Standardized indicator data', iconKey: 'table' },
      ],
    },
    {
      id: 'run-diagnostics',
      label: 'Run & diagnostics',
      defaultOpen: false,
      tone: 'subtle',
      items: [
        { id: 'execution-log', label: 'Execution log', iconKey: 'file-code', isLeaf: true },
      ],
    },
  ],
  bootstrap: [
    {
      id: 'resampled-structural-effects',
      label: 'Resampled structural effects',
      defaultOpen: true,
      items: [
        { id: 'path-coef', label: 'Path coefficients', iconKey: 'graph', showChart: true },
        { id: 'total-indirect', label: 'Total indirect effects', iconKey: 'graph', showChart: true },
        { id: 'specific-indirect', label: 'Specific indirect effects', iconKey: 'graph', showChart: true },
        { id: 'total-effects', label: 'Total effects', iconKey: 'graph', showChart: true },
      ],
    },
    {
      id: 'resampled-measurement-effects',
      label: 'Resampled measurement effects',
      defaultOpen: true,
      items: [
        { id: 'outer-loadings', label: 'Outer loadings', iconKey: 'table' },
        { id: 'outer-weights', label: 'Outer weights', iconKey: 'table' },
        { id: 'htmt-confidence-intervals', label: 'HTMT confidence intervals', iconKey: 'check-circle' },
      ],
    },
    {
      id: 'base-model-quality',
      label: 'Base model quality',
      defaultOpen: true,
      items: [
        { id: 'reliability', label: 'Construct reliability & validity', iconKey: 'check-circle', baseModelReference: true },
        { id: 'discriminant', label: 'Discriminant validity', iconKey: 'check-circle', baseModelReference: true },
        { id: 'cross-loadings', label: 'Cross-loadings', iconKey: 'table', baseModelReference: true },
        { id: 'r-square', label: 'R² / Adjusted R²', iconKey: 'graph', baseModelReference: true },
        { id: 'f-square', label: 'f²', iconKey: 'graph', showChart: true, baseModelReference: true },
        { id: 'vif', label: 'VIF', iconKey: 'info', baseModelReference: true },
      ],
    },
    {
      id: 'run-diagnostics',
      label: 'Run & diagnostics',
      defaultOpen: false,
      tone: 'subtle',
      items: [
        { id: 'execution-log', label: 'Execution log', iconKey: 'file-code', isLeaf: true },
      ],
    },
  ],
  plspredict: [
    {
      id: 'predictive-summaries',
      label: 'Predictive summaries',
      defaultOpen: true,
      items: [
        { id: 'plspredict-mv-summary', label: 'MV summary', iconKey: 'table' },
        { id: 'plspredict-lv-summary', label: 'LV summary', iconKey: 'table' },
        { id: 'pls-lm-comparison', label: 'PLS vs LM comparison', iconKey: 'graph', showChart: true },
        { id: 'q2-predict', label: 'Q²predict', iconKey: 'graph' },
      ],
    },
    {
      id: 'prediction-diagnostics',
      label: 'Prediction diagnostics',
      defaultOpen: true,
      items: [
        { id: 'mv-predictions-errors', label: 'MV predictions and errors', iconKey: 'table' },
        { id: 'lv-predictions-errors', label: 'LV predictions and errors', iconKey: 'table' },
        { id: 'plsem-mv-error-hist', label: 'MV error histograms', iconKey: 'graph', showChart: true },
        { id: 'plsem-lv-error-hist', label: 'LV error histograms', iconKey: 'graph', showChart: true },
        { id: 'cvpat-lv-summary', label: 'CVPAT LV summary', iconKey: 'table' },
      ],
    },
    {
      id: 'run-diagnostics',
      label: 'Run & diagnostics',
      defaultOpen: false,
      tone: 'subtle',
      items: [
        { id: 'execution-log', label: 'Execution log', iconKey: 'file-code', isLeaf: true },
      ],
    },
  ],
  advanced: [
    {
      id: 'advanced-pls-sem-results',
      label: 'PLS-SEM Results',
      defaultOpen: true,
      items: [
        { id: 'path-coef', label: 'Path coefficients', iconKey: 'graph', showChart: true },
        { id: 'outer-loadings', label: 'Outer loadings', iconKey: 'table' },
        { id: 'model-fit', label: 'Model fit', iconKey: 'check-circle' },
      ],
    },
    {
      id: 'advanced-diagnostics',
      label: 'Advanced diagnostics',
      defaultOpen: true,
      items: [
        { id: 'priority-map', label: 'Priority map', iconKey: 'graph', showChart: true },
        { id: 'construct-table', label: 'Construct table', iconKey: 'table' },
        { id: 'necessity-check', label: 'Necessity check', iconKey: 'check-circle' },
        { id: 'ceiling-lines', label: 'Ceiling lines', iconKey: 'graph', showChart: true },
        { id: 'bottleneck-table', label: 'Bottleneck table', iconKey: 'table' },
        { id: 'cipma-priorities', label: 'cIPMA priorities', iconKey: 'table' },
      ],
    },
    {
      id: 'run-diagnostics',
      label: 'Run & diagnostics',
      defaultOpen: false,
      tone: 'subtle',
      items: [
        { id: 'execution-log', label: 'Execution log', iconKey: 'file-code', isLeaf: true },
      ],
    },
  ],
}

export function getPanelSectionsForMode(mode: AnalysisMode): PanelSection[] {
  return PANEL_SECTIONS[mode].map((section) => ({
    ...section,
    items: section.items.map((item) => ({ ...item })),
  }))
}

export function getPanelDefinition(mode: AnalysisMode, panelId: string): PanelDefinition | null {
  for (const section of PANEL_SECTIONS[mode]) {
    const match = section.items.find((item) => item.id === panelId)
    if (match) return { ...match }
  }
  return null
}
