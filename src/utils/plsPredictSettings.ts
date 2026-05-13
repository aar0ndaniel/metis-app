export interface PlsPredictSettings {
  folds: number
  repetitions: number
  cvpatEnabled: boolean
}

export const DEFAULT_PLS_PREDICT_SETTINGS: PlsPredictSettings = {
  folds: 5,
  repetitions: 3,
  cvpatEnabled: false,
}

function coerceWholeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Math.round(parsed)
    }
  }
  return null
}

function clamp(value: number | null, min: number, max: number, fallback: number): number {
  if (value == null) return fallback
  return Math.min(max, Math.max(min, value))
}

export function normalizePlsPredictSettings(settings?: Partial<PlsPredictSettings> | null): PlsPredictSettings {
  return {
    folds: clamp(coerceWholeNumber(settings?.folds), 2, 20, DEFAULT_PLS_PREDICT_SETTINGS.folds),
    repetitions: clamp(coerceWholeNumber(settings?.repetitions), 1, 50, DEFAULT_PLS_PREDICT_SETTINGS.repetitions),
    cvpatEnabled: settings?.cvpatEnabled === true,
  }
}

export function readPlsPredictSettingsFromState(state?: any): PlsPredictSettings {
  return normalizePlsPredictSettings(state?.analysisSettings?.plspredict)
}

export function readPlsPredictSettingsFromResults(results?: Record<string, unknown> | null): PlsPredictSettings {
  const metaSettings = (results as any)?.meta?.analysis_settings?.plspredict
  const algorithmSettings = (results as any)?.algorithm?.settings
  const cvpatStatus = String((results as any)?.meta?.cvpat_status ?? '').trim().toLowerCase()

  return normalizePlsPredictSettings({
    folds: metaSettings?.folds ?? algorithmSettings?.folds,
    repetitions: metaSettings?.repetitions ?? algorithmSettings?.repetitions,
    cvpatEnabled:
      metaSettings?.cvpatEnabled ??
      algorithmSettings?.cvpat_enabled ??
      (cvpatStatus !== '' && cvpatStatus !== 'disabled'),
  })
}
