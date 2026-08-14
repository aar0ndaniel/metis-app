export const HOC_METHODS = ['Repeated indicators', 'Two-stage'] as const
export const HOC_TWO_STAGE_APPROACHES = ['Embedded', 'Disjoint two-stage'] as const
export const HOC_ESTIMATION_METHODS = [
  'Repeated Indicators',
  'Embedded Two-stage',
  'Disjoint Two-stage',
] as const

export type HocMethod = typeof HOC_METHODS[number]
export type HocTwoStageApproach = typeof HOC_TWO_STAGE_APPROACHES[number]
export type HocEstimationMethod = typeof HOC_ESTIMATION_METHODS[number]

export interface HocSettings {
  method: HocMethod
  twoStage: HocTwoStageApproach
}

export const DEFAULT_HOC_SETTINGS: HocSettings = {
  method: 'Two-stage',
  twoStage: 'Disjoint two-stage',
}

function isHocMethod(value: unknown): value is HocMethod {
  return typeof value === 'string' && (HOC_METHODS as readonly string[]).includes(value)
}

function isHocTwoStageApproach(value: unknown): value is HocTwoStageApproach {
  return typeof value === 'string' && (HOC_TWO_STAGE_APPROACHES as readonly string[]).includes(value)
}

export function normalizeHocSettings(method?: unknown, twoStage?: unknown): HocSettings {
  return {
    method: isHocMethod(method) ? method : DEFAULT_HOC_SETTINGS.method,
    twoStage: isHocTwoStageApproach(twoStage) ? twoStage : DEFAULT_HOC_SETTINGS.twoStage,
  }
}

export function hocEstimationMethodLabel(settings: HocSettings): HocEstimationMethod {
  if (settings.method === 'Repeated indicators') return 'Repeated Indicators'
  return settings.twoStage === 'Embedded' ? 'Embedded Two-stage' : 'Disjoint Two-stage'
}

export function hocSettingsFromEstimationMethod(method: HocEstimationMethod): HocSettings {
  if (method === 'Repeated Indicators') {
    return { method: 'Repeated indicators', twoStage: 'Disjoint two-stage' }
  }
  if (method === 'Embedded Two-stage') {
    return { method: 'Two-stage', twoStage: 'Embedded' }
  }
  return { method: 'Two-stage', twoStage: 'Disjoint two-stage' }
}

export function readBaseHocSettingsFromAnalysisResults(results: any): HocSettings {
  const baseMethod = results?.settings?.base_hoc_method ?? results?.algorithm?.settings?.base_hoc_method
  if (
    typeof baseMethod === 'string' &&
    (HOC_ESTIMATION_METHODS as readonly string[]).includes(baseMethod)
  ) {
    return hocSettingsFromEstimationMethod(baseMethod as HocEstimationMethod)
  }

  const recorded = results?.algorithm?.settings?.algorithm_settings
  return normalizeHocSettings(recorded?.hocMethod, recorded?.hocTwoStage)
}

export function readHocSettings(
  readValue: (key: string) => string | null,
): HocSettings {
  return normalizeHocSettings(
    readValue('prefs:hocMethod'),
    readValue('prefs:hocTwoStage'),
  )
}
