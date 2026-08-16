export interface PlsPredictSettings {
  folds: number
  repetitions: number
  technique: 'Direct antecedents (DA)' | 'Earliest antecedents (EA)'
  predictionSeed: number
  validationMode: 'K-fold' | 'LOOCV'
  cvpatEnabled: boolean
}

export const DEFAULT_PLS_PREDICT_SETTINGS: PlsPredictSettings = {
  folds: 10,
  repetitions: 1,
  technique: 'Direct antecedents (DA)',
  predictionSeed: 123,
  validationMode: 'K-fold',
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

function normalizeTechnique(value: unknown): PlsPredictSettings['technique'] {
  const text = String(value ?? '').trim().toLowerCase()
  return text.includes('earliest') || text.includes('entire') || text === 'ea'
    ? 'Earliest antecedents (EA)'
    : 'Direct antecedents (DA)'
}

function normalizeValidationMode(value: unknown): PlsPredictSettings['validationMode'] {
  return String(value ?? '').trim().toLowerCase() === 'loocv' ? 'LOOCV' : 'K-fold'
}

export function normalizePlsPredictSettings(settings?: Partial<PlsPredictSettings> | null): PlsPredictSettings {
  return {
    folds: clamp(coerceWholeNumber(settings?.folds), 2, 20, DEFAULT_PLS_PREDICT_SETTINGS.folds),
    repetitions: clamp(coerceWholeNumber(settings?.repetitions), 1, 50, DEFAULT_PLS_PREDICT_SETTINGS.repetitions),
    technique: normalizeTechnique(settings?.technique),
    predictionSeed: clamp(coerceWholeNumber(settings?.predictionSeed), 1, 2147483647, DEFAULT_PLS_PREDICT_SETTINGS.predictionSeed),
    validationMode: normalizeValidationMode(settings?.validationMode),
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
    technique: metaSettings?.technique ?? algorithmSettings?.prediction_technique,
    predictionSeed: metaSettings?.predictionSeed ?? algorithmSettings?.prediction_seed,
    validationMode: metaSettings?.validationMode ?? algorithmSettings?.cross_validation,
    cvpatEnabled:
      metaSettings?.cvpatEnabled ??
      algorithmSettings?.cvpat_enabled ??
      (cvpatStatus !== '' && cvpatStatus !== 'disabled'),
  })
}
