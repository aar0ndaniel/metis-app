import { CaretDown, Check, MathOperations, SquaresFour, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import DraftNumberInput from './DraftNumberInput'

export interface AdvancedAnalysisSettings {
  targetConstruct: string
  predecessorScope: 'all' | 'direct'
  analyses: {
    ipma: boolean
    nca: boolean
    cipma: boolean
  }
  runDepth: number
  bottleneckStepSize: number
}

interface ModalConstruct {
  id: string
  name: string
  indicators?: Array<{ name?: string } | string>
}

interface ModalPath {
  from: string
  to: string
  kind?: string
}

interface AdvancedAnalysisModalProps {
  constructs: ModalConstruct[]
  paths: ModalPath[]
  initialSettings?: Partial<AdvancedAnalysisSettings>
  isRunning?: boolean
  onClose: () => void
  onRun: (settings: AdvancedAnalysisSettings) => void
}

interface SelectOption {
  value: string
  label: string
  note?: string
}

const SECONDARY_GREEN = '#87976B'

function ModalSelect({
  value,
  options,
  placeholder,
  direction = 'down',
  onChange,
}: {
  value: string
  options: SelectOption[]
  placeholder?: string
  direction?: 'down' | 'up'
  onChange: (value: string) => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [hoveredValue, setHoveredValue] = useState<string | null>(null)

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const selected = options.find((option) => option.value === value)

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        style={{
          width: '100%',
          minHeight: 40,
          backgroundColor: 'var(--color-input, var(--color-elevated))',
          color: selected ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          border: open ? `1px solid ${SECONDARY_GREEN}` : '1px solid var(--color-border)',
          boxShadow: open ? '0 0 0 1px rgba(135,151,107,0.16)' : 'none',
          padding: '10px 12px',
          borderRadius: 6,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          cursor: 'pointer',
          transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
        }}
      >
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'left',
          }}
        >
          {selected?.label ?? placeholder ?? 'Select'}
        </span>
        <CaretDown
          size={12}
          color={open ? SECONDARY_GREEN : 'var(--color-text-muted)'}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }}
        />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            insetInline: 0,
            ...(direction === 'up'
              ? { bottom: 'calc(100% + 6px)' }
              : { top: 'calc(100% + 6px)' }),
            zIndex: 30,
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-modal-popover)',
            padding: 6,
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {options.map((option) => {
            const selectedOption = option.value === value
            const hovered = hoveredValue === option.value
            return (
              <button
                key={option.value}
                type="button"
                onMouseEnter={() => setHoveredValue(option.value)}
                onMouseLeave={() => setHoveredValue((current) => (current === option.value ? null : current))}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                style={{
                  width: '100%',
                  border: 'none',
                  borderRadius: 6,
                  backgroundColor: selectedOption
                    ? 'rgba(135,151,107,0.18)'
                    : hovered
                      ? 'rgba(135,151,107,0.11)'
                      : 'transparent',
                  color: selectedOption ? 'var(--color-success-text-light)' : 'var(--color-text-secondary)',
                  padding: option.note ? '9px 10px' : '8px 10px',
                  display: 'flex',
                  alignItems: option.note ? 'flex-start' : 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.18s ease, color 0.18s ease',
                  marginBottom: 4,
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: option.note ? 2 : 0, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: selectedOption ? 600 : 500 }}>{option.label}</span>
                  {option.note && (
                    <span style={{ fontSize: 11, color: selectedOption ? 'var(--color-success-text-light-alt)' : 'var(--color-text-muted)' }}>
                      {option.note}
                    </span>
                  )}
                </span>
                <span style={{ width: 14, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                  {selectedOption ? <Check size={12} color={SECONDARY_GREEN} weight="bold" /> : null}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function hasIndicators(construct: ModalConstruct): boolean {
  return Array.isArray(construct.indicators) && construct.indicators.length > 0
}

function resolvePredecessors(
  targetConstruct: string,
  predecessorScope: 'all' | 'direct',
  constructs: ModalConstruct[],
  paths: ModalPath[],
): string[] {
  const nameById = new Map(constructs.map((construct) => [construct.id, construct.name]))
  const reverseAdj = new Map<string, Set<string>>()

  paths
    .filter((path) => path.kind !== 'moderation')
    .forEach((path) => {
      const from = nameById.get(path.from) ?? path.from
      const to = nameById.get(path.to) ?? path.to
      if (!from || !to || from === to) return
      if (!reverseAdj.has(to)) reverseAdj.set(to, new Set())
      reverseAdj.get(to)?.add(from)
    })

  const direct = [...(reverseAdj.get(targetConstruct) ?? new Set<string>())]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

  if (predecessorScope === 'direct') return direct

  const collected = new Set<string>()
  const queue = [...direct]
  while (queue.length) {
    const current = queue.shift()
    if (!current || collected.has(current)) continue
    collected.add(current)
    for (const parent of reverseAdj.get(current) ?? new Set<string>()) {
      if (!collected.has(parent)) queue.push(parent)
    }
  }

  return [...collected].sort((a, b) => a.localeCompare(b))
}

export default function AdvancedAnalysisModal({
  constructs,
  paths,
  initialSettings,
  isRunning = false,
  onClose,
  onRun,
}: AdvancedAnalysisModalProps) {
  const constructOptions = useMemo(
    () => constructs.filter(hasIndicators).map((construct) => construct.name).sort((a, b) => a.localeCompare(b)),
    [constructs],
  )

  const [targetConstruct, setTargetConstruct] = useState(initialSettings?.targetConstruct ?? '')
  const [predecessorScope, setPredecessorScope] = useState<'all' | 'direct'>(initialSettings?.predecessorScope ?? 'all')
  const [analyses, setAnalyses] = useState({
    ipma: initialSettings?.analyses?.ipma ?? true,
    nca: initialSettings?.analyses?.nca ?? true,
    cipma: initialSettings?.analyses?.cipma ?? true,
  })
  const [runDepth, setRunDepth] = useState(initialSettings?.runDepth ?? 500)
  const [bottleneckStepSize, setBottleneckStepSize] = useState(initialSettings?.bottleneckStepSize ?? 10)

  useEffect(() => {
    if (targetConstruct || !constructOptions.length) return
    setTargetConstruct(constructOptions[0])
  }, [constructOptions, targetConstruct])

  const predecessorPreview = useMemo(
    () => resolvePredecessors(targetConstruct, predecessorScope, constructs, paths),
    [constructs, paths, predecessorScope, targetConstruct],
  )

  const canRun =
    !!targetConstruct &&
    predecessorPreview.length > 0 &&
    (analyses.ipma || analyses.nca || analyses.cipma) &&
    !isRunning

  const constructSelectOptions = useMemo<SelectOption[]>(
    () => constructOptions.map((option) => ({ value: option, label: option })),
    [constructOptions],
  )

  const bottleneckOptions = useMemo<SelectOption[]>(
    () => [
      { value: '5', label: '5%', note: 'Finer bottleneck slices' },
      { value: '10', label: '10%', note: 'Recommended default' },
      { value: '20', label: '20%', note: 'Broader bottleneck slices' },
    ],
    [],
  )

  const fieldLabelStyle: CSSProperties = {
    fontSize: 13,
    color: 'var(--color-text-muted)',
    fontWeight: 500,
    marginBottom: 8,
    display: 'block',
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    backgroundColor: 'var(--color-input, var(--color-elevated))',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    padding: '10px 12px',
    borderRadius: 6,
    fontSize: 13,
    outline: 'none',
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-[520px] rounded-lg overflow-hidden border border-white/10"
        style={{ backgroundColor: 'var(--color-elevated)', display: 'flex', flexDirection: 'column', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-modal)' }}
      >
        <div
          style={{
            height: 40,
            backgroundColor: 'var(--color-surface)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            justifyContent: 'space-between',
            color: 'var(--color-on-accent)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SquaresFour size={18} weight="fill" color="var(--color-text-muted)" />
            <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'DM Sans, sans-serif', color: 'var(--color-text-secondary)' }}>
              Advanced analysis
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Advanced analysis"
            title="Close"
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              width: 28,
              height: 28,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={14} style={{ color: 'var(--color-text-muted-alt)' }} />
          </button>
        </div>

        <div style={{ padding: '26px 32px 24px 32px', minHeight: 300, backgroundColor: 'var(--color-elevated)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={fieldLabelStyle}>Target construct</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <ModalSelect
                    value={targetConstruct}
                    options={constructSelectOptions}
                    placeholder="Select a construct"
                    onChange={setTargetConstruct}
                  />
                  <span style={{ fontSize: 11, color: 'var(--color-text-dim)', lineHeight: 1.5 }}>
                    Builds on the latest PLS-SEM estimate for this model.
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={fieldLabelStyle}>Predecessors</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 24, minHeight: 40, alignItems: 'center' }}>
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'direct', label: 'Direct' },
                    ].map((option) => (
                      <label key={option.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 13 }}>
                        <input
                          type="radio"
                          name="advanced-predecessor-scope"
                          checked={predecessorScope === option.value}
                          onChange={() => setPredecessorScope(option.value as 'all' | 'direct')}
                          style={{ accentColor: SECONDARY_GREEN }}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: predecessorPreview.length ? 'var(--color-text-dim)' : 'var(--color-danger)', lineHeight: 1.5 }}>
                    {predecessorPreview.length
                      ? predecessorPreview.join(', ')
                      : 'This target has no eligible predecessors in the current structural model.'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={fieldLabelStyle}>Include analyses</span>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', minHeight: 40, alignItems: 'center' }}>
                {[
                  { key: 'ipma', label: 'IPMA' },
                  { key: 'nca', label: 'NCA' },
                  { key: 'cipma', label: 'cIPMA' },
                ].map((option) => (
                  <label key={option.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={analyses[option.key as keyof typeof analyses]}
                      onChange={(event) => {
                        const checked = event.target.checked
                        setAnalyses((previous) => ({ ...previous, [option.key]: checked }))
                      }}
                      style={{ accentColor: SECONDARY_GREEN }}
                    />
                    {option.label}
                    {option.key === 'cipma' && (
                      <span style={{ fontSize: 10, color: 'var(--color-accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Recommended
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={fieldLabelStyle}>Run depth</span>
                <DraftNumberInput
                  min={10}
                  step={100}
                  value={runDepth}
                  fallback={500}
                  onCommit={setRunDepth}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={fieldLabelStyle}>Bottleneck step size</span>
                <ModalSelect
                  value={String(bottleneckStepSize)}
                  options={bottleneckOptions}
                  direction="up"
                  onChange={(nextValue) => setBottleneckStepSize(Number(nextValue) || 10)}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '16px 20px',
            backgroundColor: 'var(--color-input, var(--color-elevated))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>
            {predecessorPreview.length ? `${predecessorPreview.length} predecessor${predecessorPreview.length === 1 ? '' : 's'} included` : 'Select a target with predecessors'}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() =>
                onRun({
                  targetConstruct,
                  predecessorScope,
                  analyses,
                  runDepth,
                  bottleneckStepSize,
                })
              }
              disabled={!canRun}
              style={{
                padding: '8px 18px',
                borderRadius: 6,
                backgroundColor: 'var(--color-accent)',
                border: '1px solid rgb(var(--color-accent-rgb) / 0.42)',
                color: 'var(--color-on-accent)',
                fontSize: 13,
                fontWeight: 700,
                cursor: canRun ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                opacity: canRun ? 1 : 0.55,
              }}
            >
              <MathOperations size={14} weight="bold" />
              {isRunning ? 'Calculating…' : 'Start calculation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
