import type { MeasurementType, RunPlsInteraction, RunPlsPath } from '../services/plsApi'

export interface AnalysisConstructSummary {
  name: string
  type: MeasurementType
  indicators: string[]
}

export interface AnalysisPrecheckResult {
  constructCount: number
  pathCount: number
  interactionCount: number
  duplicateIndicators: string[]
  missingIndicators: string[]
}

export function inspectAnalysisInputs(
  datasetHeaders: string[],
  constructs: AnalysisConstructSummary[],
  paths: RunPlsPath[],
  interactions: RunPlsInteraction[] = [],
): AnalysisPrecheckResult {
  const indicatorCounts = new Map<string, number>()
  const headerSet = new Set(datasetHeaders)

  constructs.forEach((construct) => {
    construct.indicators
      .filter((indicator) => indicator.trim().length > 0)
      .forEach((indicator) => {
        indicatorCounts.set(indicator, (indicatorCounts.get(indicator) ?? 0) + 1)
      })
  })

  const duplicateIndicators = [...indicatorCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([indicator]) => indicator)
    .sort((left, right) => left.localeCompare(right))

  const missingIndicators = [...indicatorCounts.keys()]
    .filter((indicator) => !headerSet.has(indicator))
    .sort((left, right) => left.localeCompare(right))

  return {
    constructCount: constructs.length,
    pathCount: paths.length,
    interactionCount: interactions.length,
    duplicateIndicators,
    missingIndicators,
  }
}
