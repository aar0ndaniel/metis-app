import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CaretDown,
  Check,
  CircleNotch,
  MathOperations,
  SquaresFour,
  X,
} from '@phosphor-icons/react'
import type {
  HocEstimationMethod,
  HocMethod,
  HocSettings,
  HocTwoStageApproach,
} from '../utils/hocSettings'
import {
  HOC_ESTIMATION_METHODS,
  hocEstimationMethodLabel,
  hocSettingsFromEstimationMethod,
} from '../utils/hocSettings'

export interface MultiGroupAnalysisSettings {
  groupingVariable: string
  groupA: string
  groupB: string
  nboot: number
  alpha: number
  seed: number
  baseHocMethod?: HocEstimationMethod
  hocMethod?: HocMethod
  hocTwoStage?: HocTwoStageApproach
}

export interface MultiGroupAnalysisModalProps {
  modelName: string
  groupingOptions: string[]
  datasetRows?: string[][]
  hasHigherOrderConstructs?: boolean
  initialHocSettings?: HocSettings
  isRunning?: boolean
  onClose: () => void
  onRun?: (settings: MultiGroupAnalysisSettings) => void
}

interface GroupCount {
  value: string
  count: number
}

const MISSING_TOKENS = new Set(['', 'na', 'n/a', '.', 'null', 'none', 'nan'])
const DEFAULT_NBOOT = 500
const DEFAULT_ALPHA = 0.05
const DEFAULT_SEED = 123

function normalizeCell(value: unknown): string {
  const text = String(value ?? '').trim()
  return MISSING_TOKENS.has(text.toLowerCase()) ? '' : text
}

function summarizeGroups(headers: string[], rows: string[][], groupingVariable: string): {
  groups: GroupCount[]
  excludedMissing: number
  totalIncluded: number
} {
  const columnIndex = headers.indexOf(groupingVariable)
  if (columnIndex < 0) {
    return { groups: [], excludedMissing: 0, totalIncluded: 0 }
  }

  const counts = new Map<string, number>()
  let excludedMissing = 0
  for (const row of rows) {
    const value = normalizeCell(row?.[columnIndex])
    if (!value) {
      excludedMissing += 1
      continue
    }
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  const groups = Array.from(counts.entries()).map(([value, count]) => ({ value, count }))
  return {
    groups,
    excludedMissing,
    totalIncluded: groups.reduce((sum, group) => sum + group.count, 0),
  }
}

function validatePositiveWholeNumber(value: string): string | null {
  if (!/^\d+$/.test(value.trim())) return 'Use a positive whole number.'
  return Number(value) > 0 ? null : 'Use a positive whole number.'
}

function validateAlpha(value: string): string | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 'Use a number greater than 0 and less than 1.'
  return numeric > 0 && numeric < 1 ? null : 'Use a number greater than 0 and less than 1.'
}

function validateSeed(value: string): string | null {
  return /^-?\d+$/.test(value.trim()) ? null : 'Use any integer seed.'
}

export default function MultiGroupAnalysisModal({
  groupingOptions,
  datasetRows = [],
  hasHigherOrderConstructs = false,
  initialHocSettings = { method: 'Two-stage', twoStage: 'Disjoint two-stage' },
  isRunning = false,
  onClose,
  onRun,
}: MultiGroupAnalysisModalProps) {
  const [groupingVariable, setGroupingVariable] = useState('')
  const [swapGroupOrder, setSwapGroupOrder] = useState(false)
  const [groupingDropdownOpen, setGroupingDropdownOpen] = useState(false)
  const [nbootInput, setNbootInput] = useState('500')
  const [alphaInput, setAlphaInput] = useState(String(DEFAULT_ALPHA))
  const [seedInput, setSeedInput] = useState(String(DEFAULT_SEED))
  const baseHocMethod = hocEstimationMethodLabel(initialHocSettings)
  const [hocEstimationMethod, setHocEstimationMethod] = useState<HocEstimationMethod>(baseHocMethod)

  const cleanGroupingOptions = useMemo(
    () => groupingOptions.map((option) => String(option ?? '').trim()).filter(Boolean),
    [groupingOptions],
  )

  const groupSummary = useMemo(
    () => summarizeGroups(cleanGroupingOptions, datasetRows, groupingVariable),
    [cleanGroupingOptions, datasetRows, groupingVariable],
  )

  const hasExactlyTwoGroups = groupSummary.groups.length === 2
  const groupingCountMessage = groupingVariable && !hasExactlyTwoGroups
    ? groupSummary.groups.length > 2
      ? 'Selected grouping variable has more than two unique values. Choose a variable with exactly two groups.'
      : 'Selected grouping variable has fewer than two unique values. Choose a variable with exactly two groups.'
    : ''
  const displayGroups = hasExactlyTwoGroups && swapGroupOrder
    ? [groupSummary.groups[1], groupSummary.groups[0]]
    : groupSummary.groups
  const groupA = displayGroups[0]?.value ?? 'Group A'
  const groupB = displayGroups[1]?.value ?? 'Group B'

  const nbootError = validatePositiveWholeNumber(nbootInput)
  const alphaError = validateAlpha(alphaInput)
  const seedError = validateSeed(seedInput)

  const calculateDisabled =
    isRunning ||
    !groupingVariable ||
    !hasExactlyTwoGroups ||
    Boolean(nbootError || alphaError || seedError)

  const handleRun = () => {
    if (calculateDisabled) return
    const selectedHocSettings = hocSettingsFromEstimationMethod(hocEstimationMethod)
    onRun?.({
      groupingVariable,
      groupA,
      groupB,
      nboot: Number(nbootInput),
      alpha: Number(alphaInput),
      seed: Number(seedInput),
      ...(hasHigherOrderConstructs ? {
        baseHocMethod,
        hocMethod: selectedHocSettings.method,
        hocTwoStage: selectedHocSettings.twoStage,
      } : {}),
    })
  }

  const fieldStyle = {
    height: 36,
    borderRadius: 6,
    border: '1px solid var(--color-border)',
    background: 'var(--color-input, var(--color-elevated))',
    color: 'var(--color-text-primary)',
    fontFamily: 'DM Sans, Inter, sans-serif',
    fontSize: 13,
    padding: '0 12px',
    outline: 'none',
    width: '100%',
    fontWeight: 400,
  } as const

  const settingFieldStyle = {
    ...fieldStyle,
    height: 34,
    padding: '0 10px',
  } as const

  const labelStyle = {
    fontFamily: 'DM Sans, Inter, sans-serif',
    fontSize: 13,
    color: 'var(--color-text-primary)',
    fontWeight: 400,
  } as const

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ background: 'var(--color-overlay)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Multi Group Analysis"
        className="w-[520px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-white/10 bg-[var(--color-elevated)]"
        style={{
          height: hasHigherOrderConstructs ? 486 : 410,
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-modal)',
          color: 'var(--color-text-primary)',
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ height: 40, padding: '0 12px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
        >
          <div className="flex min-w-0 items-center" style={{ gap: 10 }}>
            <SquaresFour size={18} weight="fill" color="var(--color-text-muted)" />
            <h2
              className="truncate"
              style={{ fontFamily: 'DM Sans, Inter, sans-serif', fontSize: 13, fontWeight: 400, letterSpacing: 0, lineHeight: '18px' }}
            >
              Multi Group Analysis
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close multi group analysis"
            className="flex items-center justify-center"
            disabled={isRunning}
            onClick={onClose}
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-primary)',
              opacity: isRunning ? 0.5 : 1,
              cursor: isRunning ? 'not-allowed' : 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1" style={{ minHeight: 0, overflowY: 'hidden', padding: '18px 32px 14px' }}>
          <div className="grid" style={{ gridTemplateColumns: '120px minmax(0, 1fr)', gap: '10px 16px', alignItems: 'center' }}>
            <label htmlFor="mga-grouping-variable-button" style={labelStyle}>
              Grouping variable
            </label>
            <div className="relative">
              <button
                id="mga-grouping-variable-button"
                type="button"
                aria-haspopup="listbox"
                aria-expanded={groupingDropdownOpen}
                aria-describedby={groupingCountMessage ? 'mga-grouping-count-message' : undefined}
                disabled={isRunning}
                onClick={() => setGroupingDropdownOpen((current) => !current)}
                style={{
                  ...fieldStyle,
                  padding: '0 8px 0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                }}
              >
                <span className="truncate" style={{ color: groupingVariable ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  {groupingVariable || 'Select column'}
                </span>
                <CaretDown size={16} color="var(--color-text-muted)" />
              </button>

              {groupingDropdownOpen && (
                <div
                  role="listbox"
                  aria-label="Grouping variable"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    maxHeight: 180,
                    overflowY: 'auto',
                    background: 'var(--color-input, var(--color-elevated))',
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                    boxShadow: 'var(--shadow-floating-dropdown)',
                    zIndex: 30,
                    padding: '4px 0',
                  }}
                >
                  {cleanGroupingOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="option"
                      aria-selected={groupingVariable === option}
                      onClick={() => {
                        setGroupingVariable(option)
                        setSwapGroupOrder(false)
                        setGroupingDropdownOpen(false)
                      }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.backgroundColor = 'rgb(var(--color-hover-rgb) / 0.75)'
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.backgroundColor = groupingVariable === option
                          ? 'rgb(var(--color-accent-rgb) / 0.12)'
                          : 'transparent'
                      }}
                      className="flex w-full items-center justify-between"
                      style={{
                        minHeight: 34,
                        padding: '0 12px',
                        border: 'none',
                        background: groupingVariable === option ? 'rgb(var(--color-accent-rgb) / 0.12)' : 'transparent',
                        color: groupingVariable === option ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        fontFamily: 'DM Sans, Inter, sans-serif',
                        fontSize: 13,
                        fontWeight: 400,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span className="truncate">{option}</span>
                      {groupingVariable === option && <Check size={14} color="var(--color-text-primary)" weight="bold" />}
                    </button>
                  ))}
                  {!cleanGroupingOptions.length && (
                    <div style={{ padding: '9px 12px', color: 'var(--color-text-muted)', fontFamily: 'DM Sans, Inter, sans-serif', fontSize: 13 }}>
                      No columns available
                    </div>
                  )}
                </div>
              )}
              {groupingCountMessage && (
                <div
                  id="mga-grouping-count-message"
                  role="alert"
                  aria-live="polite"
                  style={{
                    marginTop: 6,
                    color: 'var(--color-danger)',
                    fontFamily: 'DM Sans, Inter, sans-serif',
                    fontSize: 11,
                    fontWeight: 400,
                    lineHeight: '15px',
                  }}
                >
                  {groupingCountMessage}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              margin: '16px 0 12px',
              padding: 8,
              borderRadius: 8,
              background: 'rgb(var(--color-panel-control-active-rgb) / 0.72)',
            }}
          >
            <div className="grid items-center" style={{ gridTemplateColumns: '1fr 42px 1fr', gap: 8 }}>
              <div style={{ minHeight: 44, minWidth: 0, borderRadius: 6, padding: '7px 10px', textAlign: 'left', background: 'transparent' }}>
                <div className="truncate" style={{ fontFamily: 'DM Sans, Inter, sans-serif', fontSize: 13, fontWeight: 400 }}>
                  {groupA}
                </div>
                <div style={{ marginTop: 3, fontFamily: 'DM Sans, Inter, sans-serif', fontSize: 12, fontWeight: 400, color: 'var(--color-text-muted)' }}>
                  n = {displayGroups[0]?.count?.toLocaleString() ?? '-'}
                </div>
              </div>
              <button
                type="button"
                aria-label="Swap group comparison direction"
                disabled={!hasExactlyTwoGroups || isRunning}
                onClick={() => setSwapGroupOrder((current) => !current)}
                className="flex items-center justify-center"
                style={{
                  width: 42,
                  height: 44,
                  justifySelf: 'center',
                  borderRadius: 6,
                  border: 'none',
                  background: 'rgb(var(--color-surface-rgb) / 0.42)',
                  color: hasExactlyTwoGroups ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  cursor: hasExactlyTwoGroups && !isRunning ? 'pointer' : 'not-allowed',
                  gap: 0,
                }}
              >
                <ArrowLeft size={14} />
                <ArrowRight size={14} style={{ marginLeft: -3 }} />
              </button>
              <div style={{ minHeight: 44, minWidth: 0, borderRadius: 6, padding: '7px 10px', textAlign: 'right', background: 'transparent' }}>
                <div className="truncate" style={{ fontFamily: 'DM Sans, Inter, sans-serif', fontSize: 13, fontWeight: 400 }}>
                  {groupB}
                </div>
                <div style={{ marginTop: 3, fontFamily: 'DM Sans, Inter, sans-serif', fontSize: 12, fontWeight: 400, color: 'var(--color-text-muted)' }}>
                  n = {displayGroups[1]?.count?.toLocaleString() ?? '-'}
                </div>
              </div>
            </div>
          </div>

          {hasHigherOrderConstructs && (
            <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
              <span style={labelStyle}>HOC estimation method</span>
              <div
                role="radiogroup"
                aria-label="HOC estimation method"
                className="grid"
                style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}
              >
                {HOC_ESTIMATION_METHODS.map((method) => {
                  const selected = hocEstimationMethod === method
                  return (
                    <button
                      key={method}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={isRunning}
                      onClick={() => setHocEstimationMethod(method)}
                      style={{
                        minHeight: 36,
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: selected
                          ? '1px solid rgb(var(--color-accent-rgb) / 0.62)'
                          : '1px solid var(--color-border)',
                        background: selected
                          ? 'rgb(var(--color-accent-rgb) / 0.14)'
                          : 'var(--color-input, var(--color-elevated))',
                        color: selected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        fontFamily: 'DM Sans, Inter, sans-serif',
                        fontSize: 11,
                        cursor: isRunning ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {method}
                    </button>
                  )
                })}
              </div>
              <p style={{ margin: 0, color: 'var(--color-text-muted)', fontFamily: 'DM Sans, Inter, sans-serif', fontSize: 11, lineHeight: '15px' }}>
                Defaults to the method used for the fitted PLS-SEM model. Changing it re-estimates the model for MGA using the selected method.
              </p>
            </div>
          )}

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 8, paddingTop: hasHigherOrderConstructs ? 12 : 40 }}>
            {[
              { id: 'mga-nboot', label: 'Bootstrap subsamples', value: nbootInput, error: nbootError, onChange: setNbootInput, inputMode: 'numeric' as const },
              { id: 'mga-alpha', label: 'Alpha', value: alphaInput, error: alphaError, onChange: setAlphaInput, inputMode: 'decimal' as const },
              { id: 'mga-seed', label: 'Seed', value: seedInput, error: seedError, onChange: setSeedInput, inputMode: 'numeric' as const },
            ].map((field) => (
              <label key={field.id} htmlFor={field.id} style={{ ...labelStyle, display: 'grid', gap: 5 }}>
                <span>{field.label}</span>
                <input
                  id={field.id}
                  value={field.value}
                  disabled={isRunning}
                  onChange={(event) => field.onChange(event.target.value)}
                  inputMode={field.inputMode}
                  style={{ ...settingFieldStyle, borderColor: field.error ? 'var(--color-warning)' : 'var(--color-border)' }}
                />
              </label>
            ))}
          </div>
        </div>

        <div
          className="flex items-center justify-end"
          style={{ minHeight: 65, padding: '0 20px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'var(--color-input, var(--color-elevated))' }}
        >
          <button
            type="button"
            disabled={calculateDisabled}
            onClick={handleRun}
            className="flex items-center justify-center"
            style={{
              minWidth: 132,
              height: 44,
              borderRadius: 6,
              border: calculateDisabled ? '1px solid var(--color-border)' : '1px solid rgb(var(--color-accent-rgb) / 0.42)',
              background: calculateDisabled ? 'var(--color-input)' : 'var(--color-accent)',
              color: calculateDisabled ? 'var(--color-text-muted)' : 'var(--color-on-accent)',
              fontFamily: 'DM Sans, Inter, sans-serif',
              fontSize: 13,
              fontWeight: 400,
              gap: 8,
              cursor: calculateDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            {isRunning ? <CircleNotch size={16} className="animate-spin" /> : <MathOperations size={16} weight="bold" />}
            Calculate
          </button>
        </div>
      </div>
    </div>
  )
}
