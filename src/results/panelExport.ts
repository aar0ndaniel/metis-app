import { type AnalysisMode } from './panelCatalog'

const PANEL_TITLES: Record<string, string> = {
  'path-coef': 'Path Coefficients',
  'total-indirect': 'Total Indirect Effects',
  'specific-indirect': 'Specific Indirect Effects',
  'total-effects': 'Total Effects',
  'outer-loadings': 'Outer Loadings',
  'outer-weights': 'Outer Weights',
  'latent-variables': 'Latent Variables',
  'r-square': 'R² / Adjusted R²',
  'f-square': 'f²',
  'reliability': 'Construct Reliability & Validity',
  'discriminant': 'Discriminant Validity',
  'vif': 'VIF',
  'cross-loadings': 'Cross-loadings',
  'model-fit': 'Model Fit',
  'priority-map': 'Priority Map',
  'construct-table': 'Construct Table',
  'necessity-check': 'Necessity Check',
  'ceiling-lines': 'NCA Ceiling Lines',
  'bottleneck-table': 'Bottleneck Table',
  'cipma-priorities': 'cIPMA Priorities',
  'model-select': 'Model Selection Criteria',
  'htmt-confidence-intervals': 'HTMT Confidence Intervals',
  'execution-log': 'Execution Log',
  'plspredict-mv-summary': 'MV Summary',
  'plspredict-lv-summary': 'LV Summary',
  'pls-lm-comparison': 'PLS vs LM Comparison',
  'q2-predict': 'Q²predict',
  'cvpat-lv-summary': 'CVPAT LV Summary',
  'mv-predictions-errors': 'MV Predictions and Errors',
  'lv-predictions-errors': 'LV Predictions and Errors',
  'plsem-mv-error-hist': 'MV Error Histograms',
  'plsem-lv-error-hist': 'LV Error Histograms',
}

const PANEL_EXPORT_TABLE_TITLES: Record<string, string[]> = {
  'path-coef': ['Path Coefficient Matrix', 'Path Coefficient Details'],
  'vif': ['Inner VIF', 'Outer VIF'],
  'discriminant': ['Fornell-Larcker', 'HTMT'],
}

export function getPanelTitle(panelId: string): string {
  return PANEL_TITLES[panelId] ?? 'Results'
}

export function getExportSectionTitles(panelId: string, count: number): string[] {
  const predefined = PANEL_EXPORT_TABLE_TITLES[panelId] ?? []
  if (predefined.length >= count) return predefined.slice(0, count)

  const baseTitle = getPanelTitle(panelId)
  if (count <= 1) return [baseTitle]
  return Array.from({ length: count }, (_, index) => predefined[index] ?? `${baseTitle} ${index + 1}`)
}

export function getModeResultsLabel(mode: AnalysisMode): string {
  if (mode === 'bootstrap') return 'Bootstrap Results'
  if (mode === 'plspredict') return 'PLSpredict Results'
  if (mode === 'advanced') return 'Advanced Analysis Results'
  return 'PLS-SEM Results'
}
