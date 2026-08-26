export type AnalysisTone = 'pass' | 'neutral' | 'fail'

export const ANALYSIS_TONE_HEX: Record<AnalysisTone, string> = {
  pass: '#87976B',
  neutral: '#DC6973',
  fail: '#D96B4D',
}

// A publication-safe deep red reserved for measurement values below the .70 threshold.
export const POOR_MEASUREMENT_COLOR = '#B4232C'

export const ANALYSIS_TONE_TEXT_CLASS: Record<AnalysisTone, string> = {
  pass: 'text-secondary',
  neutral: 'text-amber',
  fail: 'text-danger',
}

export const ANALYSIS_TONE_BADGE_CLASS: Record<AnalysisTone, string> = {
  pass: 'bg-secondary/15 text-secondary',
  neutral: 'bg-amber/15 text-amber',
  fail: 'bg-danger/15 text-danger',
}

export function getAnalysisToneColor(tone: AnalysisTone): string {
  return ANALYSIS_TONE_HEX[tone]
}

export function getAnalysisToneTextClass(tone: AnalysisTone): string {
  return ANALYSIS_TONE_TEXT_CLASS[tone]
}

export function getAnalysisToneBadgeClass(tone: AnalysisTone): string {
  return ANALYSIS_TONE_BADGE_CLASS[tone]
}

export function parseSignificancePValue(value: unknown): number | null {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null

  const compact = raw.replace(/\s+/g, '')
  const lessThanMatch = compact.match(/^<([0-9]*\.?[0-9]+)$/)
  if (lessThanMatch) {
    const threshold = Number(lessThanMatch[1])
    if (!Number.isFinite(threshold)) return null
    if (threshold <= 0.001) return 0.0009
    if (threshold <= 0.05) return 0.0499
    return Math.max(0, threshold - 0.0001)
  }

  const n = Number(compact)
  return Number.isFinite(n) ? n : null
}

export function getPValueTone(pValue?: number | null): AnalysisTone | undefined {
  if (pValue == null || !Number.isFinite(pValue)) return undefined
  if (pValue < 0.05) return 'pass'
  return 'fail'
}

export function getPValueColor(pValue?: number | null, fallback = 'rgb(var(--color-text-secondary-rgb) / 0.65)'): string {
  const tone = getPValueTone(pValue)
  return tone ? ANALYSIS_TONE_HEX[tone] : fallback
}

export function getOuterLoadingTone(value?: number | null): AnalysisTone | undefined {
  if (value == null || !Number.isFinite(value)) return undefined
  return value >= 0.7 ? 'pass' : 'fail'
}

export function getOuterLoadingColor(value?: number | null, fallback = '#7A7A7A'): string {
  const tone = getOuterLoadingTone(value)
  return tone ? ANALYSIS_TONE_HEX[tone] : fallback
}
