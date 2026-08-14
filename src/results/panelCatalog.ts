export type AnalysisMode = 'pls-sem' | 'bootstrap' | 'plspredict' | 'advanced' | 'permutation' | 'mga'

export type PanelIconKey =
  | 'graph'
  | 'table'
  | 'file-code'
  | 'check-circle'
  | 'info'
  | 'folders'
  | 'settings'

interface PanelDefinition {
  id: string
  label: string
  iconKey: PanelIconKey
  isLeaf?: boolean
  placeholderKind?: string
  showChart?: boolean
  baseModelReference?: boolean
  children?: PanelDefinition[]
}

export interface PanelSection {
  id: string
  label: string
  defaultOpen: boolean
  tone?: 'default' | 'subtle'
  items: PanelDefinition[]
}

export interface PanelCatalogOptions {
  hasInteractions?: boolean
  hasHigherOrderConstructs?: boolean
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
        { id: 'algorithm-settings', label: 'Algorithm settings', iconKey: 'settings', isLeaf: true },
        { id: 'execution-log', label: 'Execution log', iconKey: 'file-code', isLeaf: true },
      ],
    },
  ],
  bootstrap: [
    {
      id: 'resampled-structural-effects',
      label: 'Bootstrap structural effects',
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
      label: 'Bootstrap measurement effects',
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
        { id: 'algorithm-settings', label: 'Algorithm settings', iconKey: 'settings', isLeaf: true },
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
        { id: 'cvpat-lv-summary', label: 'CVPAT', iconKey: 'table' },
      ],
    },
    {
      id: 'run-diagnostics',
      label: 'Run & diagnostics',
      defaultOpen: false,
      tone: 'subtle',
      items: [
        { id: 'algorithm-settings', label: 'Algorithm settings', iconKey: 'settings', isLeaf: true },
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
        { id: 'algorithm-settings', label: 'Algorithm settings', iconKey: 'settings', isLeaf: true },
        { id: 'execution-log', label: 'Execution log', iconKey: 'file-code', isLeaf: true },
      ],
    },
  ],
  permutation: [
    {
      id: 'permutation-results',
      label: 'PERMUTATION RESULTS',
      defaultOpen: true,
      items: [
        { id: 'overview', label: 'Overview', iconKey: 'info' },
        { id: 'compositional-invariance', label: 'Compositional Invariance', iconKey: 'check-circle' },
        { id: 'equality-means', label: 'Equality of Means', iconKey: 'table' },
        { id: 'equality-variances', label: 'Equality of Variances', iconKey: 'table' },
        { id: 'invariance-classification', label: 'Invariance Classification', iconKey: 'check-circle' },
        { id: 'algorithm-settings', label: 'Algorithm settings', iconKey: 'settings', isLeaf: true },
        { id: 'execution-log', label: 'Execution Log', iconKey: 'file-code', isLeaf: true },
      ],
    },
  ],
  mga: [
    {
      id: 'multi-group-results',
      label: 'MULTI-GROUP RESULTS',
      defaultOpen: true,
      items: [
        { id: 'overview', label: 'Overview', iconKey: 'info' },
        { id: 'algorithm-settings', label: 'Algorithm settings', iconKey: 'settings', isLeaf: true },
        {
          id: 'mga-comparisons',
          label: 'MULTI GROUP COMPARISON',
          iconKey: 'table',
          children: [
            { id: 'mga-path-coefficients', label: 'Path Coefficients', iconKey: 'graph' },
            { id: 'mga-outer-loadings', label: 'Outer Loadings', iconKey: 'table' },
            { id: 'mga-outer-weights', label: 'Outer Weights', iconKey: 'table' },
          ],
        },
        {
          id: 'mga-group-specific-results',
          label: 'GROUP SPECIFIC RESULTS',
          iconKey: 'check-circle',
          children: [
            {
              id: 'mga-group-a',
              label: 'Group A',
              iconKey: 'info',
              children: [
                {
                  id: 'mga-group-a-measurement-model',
                  label: 'MEASUREMENT MODEL',
                  iconKey: 'table',
                  children: [
                    { id: 'mga-group-a-outer-loadings', label: 'Outer Loadings', iconKey: 'table' },
                    { id: 'mga-group-a-outer-weights', label: 'Outer Weights', iconKey: 'table' },
                    { id: 'mga-group-a-reliability', label: 'Construct Reliability & Validity', iconKey: 'check-circle' },
                    { id: 'mga-group-a-discriminant', label: 'Discriminant Validity', iconKey: 'check-circle' },
                    { id: 'mga-group-a-cross-loadings', label: 'Cross-Loadings', iconKey: 'table' },
                  ],
                },
                {
                  id: 'mga-group-a-model-quality',
                  label: 'MODEL QUALITY',
                  iconKey: 'check-circle',
                  children: [
                    { id: 'mga-group-a-r-square', label: 'R² / Adjusted R²', iconKey: 'graph' },
                    { id: 'mga-group-a-vif', label: 'VIF', iconKey: 'info' },
                    { id: 'mga-group-a-model-fit', label: 'Model Fit', iconKey: 'check-circle' },
                  ],
                },
                {
                  id: 'mga-group-a-structural-effects',
                  label: 'STRUCTURAL EFFECTS',
                  iconKey: 'graph',
                  children: [
                    { id: 'mga-group-a-path-coef', label: 'Path Coefficients', iconKey: 'graph' },
                    { id: 'mga-group-a-total-indirect', label: 'Total Indirect Effects', iconKey: 'graph' },
                    { id: 'mga-group-a-specific-indirect', label: 'Specific Indirect Effects', iconKey: 'graph' },
                    { id: 'mga-group-a-total-effects', label: 'Total Effects', iconKey: 'graph' },
                  ],
                },
              ],
            },
            {
              id: 'mga-group-b',
              label: 'Group B',
              iconKey: 'info',
              children: [
                {
                  id: 'mga-group-b-measurement-model',
                  label: 'MEASUREMENT MODEL',
                  iconKey: 'table',
                  children: [
                    { id: 'mga-group-b-outer-loadings', label: 'Outer Loadings', iconKey: 'table' },
                    { id: 'mga-group-b-outer-weights', label: 'Outer Weights', iconKey: 'table' },
                    { id: 'mga-group-b-reliability', label: 'Construct Reliability & Validity', iconKey: 'check-circle' },
                    { id: 'mga-group-b-discriminant', label: 'Discriminant Validity', iconKey: 'check-circle' },
                    { id: 'mga-group-b-cross-loadings', label: 'Cross-Loadings', iconKey: 'table' },
                  ],
                },
                {
                  id: 'mga-group-b-model-quality',
                  label: 'MODEL QUALITY',
                  iconKey: 'check-circle',
                  children: [
                    { id: 'mga-group-b-r-square', label: 'R² / Adjusted R²', iconKey: 'graph' },
                    { id: 'mga-group-b-vif', label: 'VIF', iconKey: 'info' },
                    { id: 'mga-group-b-model-fit', label: 'Model Fit', iconKey: 'check-circle' },
                  ],
                },
                {
                  id: 'mga-group-b-structural-effects',
                  label: 'STRUCTURAL EFFECTS',
                  iconKey: 'graph',
                  children: [
                    { id: 'mga-group-b-path-coef', label: 'Path Coefficients', iconKey: 'graph' },
                    { id: 'mga-group-b-total-indirect', label: 'Total Indirect Effects', iconKey: 'graph' },
                    { id: 'mga-group-b-specific-indirect', label: 'Specific Indirect Effects', iconKey: 'graph' },
                    { id: 'mga-group-b-total-effects', label: 'Total Effects', iconKey: 'graph' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

function clonePanelItems(items: PanelDefinition[]): PanelDefinition[] {
  return items.map((item) => ({
    ...item,
    children: item.children ? clonePanelItems(item.children) : undefined,
  }))
}

function clonePanelSections(sections: PanelSection[]): PanelSection[] {
  return sections.map((section) => ({
    ...section,
    items: clonePanelItems(section.items),
  }))
}

export function getPanelSectionsForMode(mode: AnalysisMode, options: PanelCatalogOptions = {}): PanelSection[] {
  const sections = clonePanelSections(PANEL_SECTIONS[mode])

  if (options.hasHigherOrderConstructs && (mode === 'permutation' || mode === 'mga')) {
    const items = sections[0]?.items
    if (items && !items.some((item) => item.id === 'hoc-context')) {
      const overviewIndex = items.findIndex((item) => item.id === 'overview')
      items.splice(overviewIndex >= 0 ? overviewIndex + 1 : 0, 0, {
        id: 'hoc-context',
        label: 'Higher-Order Constructs',
        iconKey: 'folders',
      })
    }
  }

  if (options.hasInteractions && mode === 'mga') {
    const comparisonGroup = sections[0]?.items.find((item) => item.id === 'mga-comparisons')
    if (comparisonGroup?.children && !comparisonGroup.children.some((item) => item.id === 'mga-moderation-effects')) {
      const pathIndex = comparisonGroup.children.findIndex((item) => item.id === 'mga-path-coefficients')
      comparisonGroup.children.splice(pathIndex >= 0 ? pathIndex + 1 : comparisonGroup.children.length, 0, {
        id: 'mga-moderation-effects',
        label: 'Moderation Effects',
        iconKey: 'table',
      })
    }
  }

  if (!options.hasInteractions) return sections

  if (mode === 'pls-sem') {
    const qualitySection = sections.find((section) => section.id === 'model-quality')
    const rSquareIndex = qualitySection?.items.findIndex((item) => item.id === 'r-square') ?? -1
    if (qualitySection && rSquareIndex >= 0) {
      qualitySection.items.splice(rSquareIndex + 1, 0, {
        id: 'moderation-r2-change',
        label: 'R² change',
        iconKey: 'graph',
      })
    }

    const qualityIndex = sections.findIndex((section) => section.id === 'model-quality')
    sections.splice(qualityIndex >= 0 ? qualityIndex + 1 : sections.length, 0, {
      id: 'moderation-effects',
      label: 'Moderation effects',
      defaultOpen: true,
      items: [
        { id: 'moderation-summary', label: 'Interaction effects', iconKey: 'table' },
        { id: 'moderation-slopes', label: 'Simple slope analysis', iconKey: 'table' },
        { id: 'moderation-slope-chart', label: 'Slope plot', iconKey: 'graph' },
      ],
    })
  }

  if (mode === 'bootstrap') {
    const qualitySection = sections.find((section) => section.id === 'base-model-quality')
    const rSquareIndex = qualitySection?.items.findIndex((item) => item.id === 'r-square') ?? -1
    if (qualitySection && rSquareIndex >= 0) {
      qualitySection.items.splice(rSquareIndex + 1, 0, {
        id: 'moderation-r2-change',
        label: 'R² change',
        iconKey: 'graph',
      })
    }

    const structuralIndex = sections.findIndex((section) => section.id === 'resampled-structural-effects')
    sections.splice(structuralIndex >= 0 ? structuralIndex + 1 : sections.length, 0, {
      id: 'moderation-effects',
      label: 'Moderation effects',
      defaultOpen: true,
      items: [
        { id: 'moderation-summary', label: 'Interaction effects', iconKey: 'table' },
        { id: 'moderation-bootstrap', label: 'Bootstrap interaction CIs', iconKey: 'table' },
        { id: 'moderation-slopes', label: 'Simple slope analysis', iconKey: 'table' },
        { id: 'moderation-slope-chart', label: 'Slope plot', iconKey: 'graph' },
      ],
    })
  }

  return sections
}

function getPanelDefinition(mode: AnalysisMode, panelId: string, options: PanelCatalogOptions = {}): PanelDefinition | null {
  const findItem = (items: PanelDefinition[]): PanelDefinition | null => {
    for (const item of items) {
      if (item.id === panelId) return { ...item }
      const childMatch = item.children ? findItem(item.children) : null
      if (childMatch) return childMatch
    }
    return null
  }

  for (const section of getPanelSectionsForMode(mode, options)) {
    const match = findItem(section.items)
    if (match) return match
  }
  return null
}
