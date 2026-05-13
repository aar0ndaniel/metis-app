import { useMemo, useState } from 'react'
import {
  CircleNotch,
  MathOperations,
  SquaresFour,
  X,
} from '@phosphor-icons/react'
import {
  DEFAULT_PLS_PREDICT_SETTINGS,
  normalizePlsPredictSettings,
  type PlsPredictSettings,
} from '../utils/plsPredictSettings'
import DraftNumberInput from './DraftNumberInput'

interface PlsPredictModalProps {
  onClose: () => void
  onRun: (settings: PlsPredictSettings) => void
  initialSettings?: Partial<PlsPredictSettings> | null
  isRunning?: boolean
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        color: 'var(--color-text-secondary-alt)',
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1.2,
      }}
    >
      {children}
    </span>
  )
}

function InlineField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div
      className="grid gap-3 items-center"
      style={{ gridTemplateColumns: 'minmax(0, 1fr) 140px' }}
    >
      <span
        style={{
          color: 'var(--color-text-muted-alt)',
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 13,
          fontWeight: 400,
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function InputBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center px-3 min-w-0"
      style={{
        width: '100%',
        height: 34,
        background: 'var(--color-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 7,
      }}
    >
      {children}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="relative inline-flex items-center rounded-full transition-all"
      style={{
        width: 48,
        height: 26,
        background: checked ? 'var(--color-accent)' : 'var(--color-elevated)',
        border: `1px solid ${checked ? 'var(--color-accent)' : 'var(--color-border)'}`,
        boxShadow: checked ? '0 4px 12px rgb(var(--color-accent-rgb) / 0.18)' : 'none',
        opacity: disabled ? 0.7 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span
        className="absolute rounded-full transition-all"
        style={{
          top: 3,
          left: checked ? 25 : 3,
          width: 18,
          height: 18,
          background: checked ? 'var(--color-on-accent)' : 'var(--color-text-dim)',
        }}
      />
    </button>
  )
}

export default function PlsPredictModal({
  onClose,
  onRun,
  initialSettings,
  isRunning = false,
}: PlsPredictModalProps) {
  const initial = useMemo(
    () => normalizePlsPredictSettings(initialSettings ?? DEFAULT_PLS_PREDICT_SETTINGS),
    [initialSettings]
  )
  const [settings, setSettings] = useState<PlsPredictSettings>(initial)

  const normalized = normalizePlsPredictSettings(settings)
  const validationCycles = normalized.folds * normalized.repetitions

  const set = <K extends keyof PlsPredictSettings>(key: K, value: PlsPredictSettings[K]) => {
    setSettings((previous) => ({ ...previous, [key]: value }))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onMouseDown={(event) => {
        if (!isRunning && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: 'min(560px, 92vw)',
          maxHeight: '88vh',
          background: 'var(--color-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        }}
      >
        <div
          style={{
            height: 40,
            backgroundColor: 'var(--color-surface)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--color-border)',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <SquaresFour size={18} weight="fill" color="var(--color-text-muted)" />
            <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'DM Sans, sans-serif', color: 'var(--color-text-secondary)' }}>
              PLSpredict settings
            </span>
          </div>

          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.7)]"
            disabled={isRunning}
            onClick={onClose}
            aria-label="Close PLSpredict settings"
            title="Close"
          >
            <X size={14} style={{ color: 'var(--color-text-muted-alt)' }} />
          </button>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--color-elevated)' }}>
            <div className="p-5 flex flex-col gap-5">
              {isRunning && (
                <div
                  className="w-full flex items-center gap-2 px-3 py-2"
                  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                >
                  <CircleNotch size={14} className="animate-spin" style={{ color: 'var(--color-text-secondary)' }} />
                  <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 500 }}>
                    Prediction validation is in progress. Please wait while results load.
                  </span>
                </div>
              )}

              <div
                className="grid gap-4 items-start"
                style={{ gridTemplateColumns: 'minmax(140px, 160px) 1fr' }}
              >
                <SectionTitle>Cross-validation</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 260 }}>
                  <InlineField label="Folds">
                    <InputBox>
                      <DraftNumberInput
                        value={settings.folds}
                        min={2}
                        max={20}
                        fallback={DEFAULT_PLS_PREDICT_SETTINGS.folds}
                        onCommit={(value) => set('folds', value)}
                        className="outline-none bg-transparent w-full"
                        style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 500 }}
                      />
                    </InputBox>
                  </InlineField>

                  <InlineField label="Repetitions">
                    <InputBox>
                      <DraftNumberInput
                        value={settings.repetitions}
                        min={1}
                        max={50}
                        fallback={DEFAULT_PLS_PREDICT_SETTINGS.repetitions}
                        onCommit={(value) => set('repetitions', value)}
                        className="outline-none bg-transparent w-full"
                        style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 500 }}
                      />
                    </InputBox>
                  </InlineField>

                  <InlineField label="Validation cycles">
                    <InputBox>
                      <span
                        style={{
                          color: 'var(--color-text-secondary)',
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {validationCycles}
                      </span>
                    </InputBox>
                  </InlineField>
                </div>
              </div>

              <div
                className="grid gap-4 items-start"
                style={{ gridTemplateColumns: 'minmax(140px, 160px) 1fr' }}
              >
                <SectionTitle>Prediction diagnostics</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 260 }}>
                  <InlineField label="CVPAT">
                    <div
                      style={{
                        height: 34,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                      }}
                    >
                      <Toggle
                        checked={settings.cvpatEnabled}
                        onChange={(value) => set('cvpatEnabled', value)}
                        disabled={isRunning}
                        ariaLabel="Run CVPAT"
                      />
                    </div>
                  </InlineField>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '16px 20px',
              backgroundColor: 'var(--color-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--color-border)',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--color-text-muted-alt)', fontFamily: 'DM Sans, sans-serif' }}>
              Default settings
            </span>

            <button
              type="button"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg transition-opacity"
              style={{
                background: 'var(--color-accent)',
                color: 'var(--color-on-accent)',
                opacity: isRunning ? 0.8 : 1,
                boxShadow: '0 8px 18px rgb(var(--color-accent-rgb) / 0.18)',
              }}
              disabled={isRunning}
              onClick={() => onRun(normalized)}
            >
              {isRunning ? <CircleNotch size={14} className="animate-spin" /> : <MathOperations size={14} weight="bold" />}
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700 }}>
                {isRunning ? 'Running…' : 'Run PLSpredict'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
