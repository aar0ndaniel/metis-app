import type { AnalysisMode } from '../results/panelCatalog'

export type ResultsChartPreferences = Record<string, boolean>

export function buildChartPreferenceKey(mode: AnalysisMode, panelId: string): string {
  return `${mode}:${panelId}`
}

export function getChartPreference(
  preferences: ResultsChartPreferences | null | undefined,
  mode: AnalysisMode,
  panelId: string,
): boolean {
  if (!panelId) return false
  return preferences?.[buildChartPreferenceKey(mode, panelId)] === true
}

export function toggleChartPreference(
  preferences: ResultsChartPreferences | null | undefined,
  mode: AnalysisMode,
  panelId: string,
): ResultsChartPreferences {
  const key = buildChartPreferenceKey(mode, panelId)
  const next = !(preferences?.[key] === true)
  const base = { ...(preferences || {}) }
  if (!next) {
    delete base[key]
    return base
  }
  return {
    ...base,
    [key]: true,
  }
}
