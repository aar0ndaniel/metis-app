import { type AnalysisMode } from './panelCatalog'
import { isBaseModelReferencePanel } from './panelData'

export interface PanelEmptyStateContext {
  mode: AnalysisMode
  panelId: string
  hasRows?: boolean
  hasMediationPaths?: boolean
  hasFormativeWeights?: boolean
  cvpatEnabled?: boolean
  cvpatStatus?: string
  modelSelectionComparable?: boolean
  fitAvailable?: boolean
  hasInteractions?: boolean
  advancedAnalyses?: {
    ipma?: boolean
    nca?: boolean
    cipma?: boolean
  }
}

const DEFAULT_EMPTY_STATE = 'No data available for this section.'

export function classifyPanelEmptyState(context: PanelEmptyStateContext): string {
  if (context.hasRows) return DEFAULT_EMPTY_STATE

  switch (context.panelId) {
    case 'specific-indirect':
      return context.hasMediationPaths
        ? 'Run Bootstrap to get significance for these paths.'
        : 'No specific indirect paths in the current model.'

    case 'outer-weights':
      if (context.hasFormativeWeights === false) {
        return 'No formative weights in the current model.'
      }
      return 'No outer weights available for this analysis.'

    case 'model-fit':
      if (context.fitAvailable === false) {
        return 'Model fit is not available for this analysis yet.'
      }
      return 'No model fit data available for this analysis.'

    case 'model-select':
      if (context.modelSelectionComparable === false) {
        return 'Model selection criteria are available only when comparing nested models.'
      }
      return 'No model selection criteria available for this analysis.'

    case 'htmt-confidence-intervals':
      return 'Bootstrap HTMT confidence intervals are not available yet for this analysis.'

    case 'moderation-summary':
    case 'moderation-slopes':
    case 'moderation-slope-chart':
    case 'moderation-r2-change':
    case 'moderation-bootstrap':
      if (context.hasInteractions === false) {
        return 'No moderation effects in the current model.'
      }
      return 'No moderation effect data available for this analysis.'

    case 'cvpat-lv-summary':
      if (context.cvpatStatus === 'missing-seminrextras') {
        return 'CVPAT requires seminrExtras in the R backend. Install seminrExtras, then rerun with CVPAT enabled.'
      }
      if (context.cvpatStatus === 'error') {
        return 'CVPAT could not be computed for this run. Check the execution log for details.'
      }
      if (context.cvpatEnabled === false) {
        return 'CVPAT not run — re-run analysis with CVPAT enabled.'
      }
      return 'No CVPAT results available for this analysis.'

    case 'plsem-mv-error-hist':
    case 'plsem-lv-error-hist':
      return 'No prediction error distribution available yet.'

    case 'priority-map':
      if (
        context.mode === 'advanced' &&
        context.advancedAnalyses &&
        !context.advancedAnalyses.ipma &&
        !context.advancedAnalyses.cipma
      ) {
        return 'IPMA or cIPMA was not run. Re-run Advanced analysis with IPMA or cIPMA checked.'
      }
      return 'No priority map data available for this target yet.'

    case 'construct-table':
      if (context.mode === 'advanced' && context.advancedAnalyses && !context.advancedAnalyses.ipma) {
        return 'IPMA was not run. Re-run Advanced analysis with IPMA checked.'
      }
      return 'No construct-level IPMA results available for this run.'

    case 'necessity-check':
      if (context.mode === 'advanced' && context.advancedAnalyses && !context.advancedAnalyses.nca) {
        return 'NCA was not run. Re-run Advanced analysis with NCA checked.'
      }
      return 'No necessity analysis results available for this run.'

    case 'ceiling-lines':
      if (context.mode === 'advanced' && context.advancedAnalyses && !context.advancedAnalyses.nca) {
        return 'NCA was not run. Re-run Advanced analysis with NCA checked.'
      }
      return 'No NCA ceiling line data available for this run.'

    case 'bottleneck-table':
      if (context.mode === 'advanced' && context.advancedAnalyses && !context.advancedAnalyses.nca) {
        return 'NCA was not run. Re-run Advanced analysis with NCA checked.'
      }
      return 'No bottleneck table available for this run.'

    case 'cipma-priorities':
      if (context.mode === 'advanced' && context.advancedAnalyses && !context.advancedAnalyses.cipma) {
        return 'cIPMA was not run. Re-run Advanced analysis with cIPMA checked.'
      }
      return 'No cIPMA priorities available for this run.'

    default:
      return DEFAULT_EMPTY_STATE
  }
}

export function rowsContainOnlyMessage(rows: Array<Record<string, unknown>>): boolean {
  if (!rows.length) return false

  return rows.every((row) => {
    const meaningfulKeys = Object.keys(row).filter((key) => {
      const value = row[key]
      return value != null && String(value).trim() !== ''
    })
    return meaningfulKeys.length === 1 && meaningfulKeys[0].toLowerCase() === 'message'
  })
}

export function getBaseModelReferenceLabel(mode: AnalysisMode, panelId: string): string | null {
  return isBaseModelReferencePanel(mode, panelId) ? 'From base model' : null
}
