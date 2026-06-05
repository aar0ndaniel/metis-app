import { type AnalysisMode } from './panelCatalog'

const PANEL_DATA_PATHS: Record<AnalysisMode, Record<string, string>> = {
  'pls-sem': {
    'path-coef': 'final_results.path_coefficients',
    'total-indirect': 'final_results.total_indirect_effects',
    'specific-indirect': 'final_results.specific_indirect_effects',
    'total-effects': 'final_results.total_effects',
    'outer-loadings': 'final_results.outer_loadings',
    'outer-weights': 'final_results.outer_weights',
    'reliability': 'quality_criteria.reliability',
    'discriminant': 'quality_criteria.discriminant_validity',
    'cross-loadings': 'quality_criteria.cross_loadings',
    'r-square': 'quality_criteria.r_square',
    'f-square': 'quality_criteria.f_square',
    'vif': 'quality_criteria.vif',
    'model-fit': 'quality_criteria.model_fit',
    'model-select': 'quality_criteria.model_selection_criteria',
    'moderation-summary': 'final_results.moderation_summary',
    'moderation-slopes': 'final_results.moderation_slopes',
    'moderation-slope-chart': 'charts.moderation_slope_chart',
    'moderation-r2-change': 'quality_criteria.moderation_r2_change',
    'latent-variables': 'final_results.latent_variables',
    'indicator-correlations': 'model_and_data.indicator_data_correlations',
    'indicator-original': 'model_and_data.indicator_data_original',
    'indicator-standardised': 'model_and_data.indicator_data_standardized',
    'execution-log': 'algorithm.execution_log',
  },
  bootstrap: {
    'path-coef': 'final_results.path_coefficients',
    'total-indirect': 'final_results.total_indirect_effects',
    'specific-indirect': 'final_results.specific_indirect_effects',
    'total-effects': 'final_results.total_effects',
    'outer-loadings': 'final_results.outer_loadings',
    'outer-weights': 'final_results.outer_weights',
    'htmt-confidence-intervals': 'quality_criteria.htmt_confidence_intervals',
    'reliability': 'quality_criteria.reliability',
    'discriminant': 'quality_criteria.discriminant_validity',
    'cross-loadings': 'quality_criteria.cross_loadings',
    'r-square': 'quality_criteria.r_square',
    'f-square': 'quality_criteria.f_square',
    'vif': 'quality_criteria.vif',
    'moderation-bootstrap': 'final_results.moderation_bootstrap',
    'execution-log': 'execution_log',
  },
  plspredict: {
    'plspredict-mv-summary': 'final_results.plspredict_mv_summary',
    'plspredict-lv-summary': 'final_results.plspredict_lv_summary',
    'pls-lm-comparison': 'final_results.plspredict_mv_summary',
    'q2-predict': 'final_results.plspredict_mv_summary',
    'mv-predictions-errors': 'final_results.mv_predictions_and_errors',
    'lv-predictions-errors': 'final_results.lv_predictions_and_errors',
    'plsem-mv-error-hist': 'histograms.plsem_mv_error_histogram',
    'plsem-lv-error-hist': 'histograms.plsem_lv_error_histogram',
    'cvpat-lv-summary': 'final_results.cvpat_lv_summary',
    'execution-log': 'algorithm.execution_log',
  },
  advanced: {
    'path-coef': 'final_results.path_coefficients',
    'outer-loadings': 'final_results.outer_loadings',
    'model-fit': 'quality_criteria.model_fit',
    'priority-map': 'final_results.priority_map',
    'construct-table': 'final_results.construct_table',
    'necessity-check': 'final_results.necessity_check',
    'ceiling-lines': 'final_results.ceiling_lines',
    'bottleneck-table': 'final_results.bottleneck_table',
    'cipma-priorities': 'final_results.cipma_priorities',
    'execution-log': 'algorithm.execution_log',
  },
}

const BOOTSTRAP_BASE_MODEL_REFERENCE_PANELS = new Set([
  'reliability',
  'discriminant',
  'cross-loadings',
  'r-square',
  'f-square',
  'vif',
])

export function getPanelDataPath(mode: AnalysisMode, panelId: string): string | undefined {
  return PANEL_DATA_PATHS[mode]?.[panelId]
}

function getByPath(obj: any, path: string | undefined): any {
  if (!obj || !path) return null
  return path.split('.').reduce((acc, key) => (acc && key in acc ? acc[key] : null), obj)
}

function hasPanelData(data: any): boolean {
  if (data == null) return false
  if (Array.isArray(data)) return data.length > 0
  if (typeof data === 'object') return Object.keys(data).length > 0
  return String(data).trim() !== ''
}

function unwrapAnalysisResults(analysisResults: any): any {
  if (
    analysisResults &&
    typeof analysisResults === 'object' &&
    !Array.isArray(analysisResults) &&
    analysisResults.results &&
    typeof analysisResults.results === 'object'
  ) {
    return analysisResults.results
  }
  return analysisResults
}

const PANEL_DATA_FALLBACK_PATHS: Partial<Record<AnalysisMode, Record<string, string[]>>> = {
  bootstrap: {
    'htmt-confidence-intervals': [
      'quality_criteria.htmt_confidence_intervals',
      'quality_criteria.bootstrapped_HTMT',
      'quality_criteria.bootstrapped_htmt',
      'final_results.htmt_confidence_intervals',
      'final_results.bootstrapped_HTMT',
      'bootstrapped_HTMT',
    ],
  },
  plspredict: {
    'plspredict-mv-summary': [
      'final_results.plspredict_mv_summary',
      'final_results.plspredict_summary',
      'final_results.mv_summary',
      'final_results.prediction_summary',
      'plspredict_mv_summary',
      'plspredict_summary',
      'mv_summary',
      'prediction_summary',
    ],
    'pls-lm-comparison': [
      'final_results.plspredict_mv_summary',
      'final_results.plspredict_summary',
      'final_results.mv_summary',
      'final_results.prediction_summary',
      'plspredict_mv_summary',
      'plspredict_summary',
      'mv_summary',
      'prediction_summary',
    ],
    'q2-predict': [
      'final_results.plspredict_mv_summary',
      'final_results.plspredict_summary',
      'final_results.mv_summary',
      'final_results.prediction_summary',
      'plspredict_mv_summary',
      'plspredict_summary',
      'mv_summary',
      'prediction_summary',
    ],
    'plsem-mv-error-hist': [
      'histograms.plsem_mv_error_histogram',
      'final_results.mv_predictions_and_errors',
    ],
    'plsem-lv-error-hist': [
      'histograms.plsem_lv_error_histogram',
      'final_results.lv_predictions_and_errors',
    ],
  },
}

export function getPanelDataFromResults(mode: AnalysisMode, panelId: string, analysisResults: any): any {
  const results = unwrapAnalysisResults(analysisResults)
  const fallbackPaths = PANEL_DATA_FALLBACK_PATHS[mode]?.[panelId]
  if (fallbackPaths?.length) {
    for (const path of fallbackPaths) {
      const value = getByPath(results, path)
      if (hasPanelData(value)) return value
    }
  }

  return getByPath(results, getPanelDataPath(mode, panelId))
}

export function isBaseModelReferencePanel(mode: AnalysisMode, panelId: string): boolean {
  return mode === 'bootstrap' && BOOTSTRAP_BASE_MODEL_REFERENCE_PANELS.has(panelId)
}
