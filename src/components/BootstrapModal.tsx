/**
 * BootstrapModal — Bootstrap Settings dialog.
 * Centred modal overlay — not full-screen.
 * Colors follow the app dark theme: no indigo / blue.
 */

import { useState } from 'react'
import {
  CaretDown,
  CircleNotch,
  FloppyDisk,
  MathOperations,
  SquaresFour,
  X,
} from '@phosphor-icons/react'
import DraftNumberInput from './DraftNumberInput'

interface BootstrapSettings {
  subsamples: number
  resampling: 'Individual' | 'All'
  ciType: 'Percentile' | 'BCa' | 't-statistic'
  confidenceLevel: '90%' | '95%' | '99%'
  tails: 'Two-tailed' | 'One-tailed'
  signChanges: 'none' | 'individual' | 'construct'
  maxIterations: number
  stopCriterion: string
}

interface BootstrapModalProps {
  onClose: () => void
  onRun: (settings: BootstrapSettings) => void
  isRunning?: boolean
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
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

function PlainInput({
  value,
  onChange,
  placeholder,
}: {
  value: string | number
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="outline-none bg-transparent w-full min-w-0"
      style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 500 }}
    />
  )
}

function SelectBox({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative min-w-0" style={{ width: '100%' }}>
      <button
        type="button"
        className="flex items-center justify-between px-3 w-full min-w-0 transition-colors"
        style={{
          height: 34,
          background: 'var(--color-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 7,
          color: 'var(--color-text-secondary)',
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 13,
        }}
        onClick={() => setOpen((previous) => !previous)}
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
          {value}
        </span>
        <CaretDown size={12} style={{ color: 'var(--color-text-muted-alt)', flexShrink: 0 }} />
      </button>
      {open && (
        <div
          className="absolute left-0 z-50 rounded-lg overflow-hidden"
          style={{
            top: 'calc(100% + 3px)',
            width: '100%',
            background: 'var(--color-elevated)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 20px rgba(0,0,0,0.376)',
          }}
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="w-full text-left px-3 py-2 transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.7)]"
              style={{
                color: 'var(--color-text-secondary)',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 12,
              }}
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  )
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

const SIGN_CHANGE_OPTIONS = [
  { value: 'none', label: 'No changes' },
  { value: 'construct', label: 'Construct-level sign changes' },
  { value: 'individual', label: 'Individual sign changes' },
] as const

export default function BootstrapModal({ onClose, onRun, isRunning = false }: BootstrapModalProps) {
  const [settings, setSettings] = useState<BootstrapSettings>({
    subsamples: 500,
    resampling: 'Individual',
    ciType: 'Percentile',
    confidenceLevel: '95%',
    tails: 'Two-tailed',
    signChanges: 'none',
    maxIterations: 300,
    stopCriterion: '1e-7',
  })
  const [showAdvanced, setShowAdvanced] = useState(false)

  const set = <K extends keyof BootstrapSettings>(key: K, value: BootstrapSettings[K]) =>
    setSettings((previous) => ({ ...previous, [key]: value }))

  const estMinutes = Math.max(1, Math.round(settings.subsamples / 1250))
  const estTime = estMinutes <= 1 ? '~1 min' : `~${estMinutes} min`

  const signLabel = SIGN_CHANGE_OPTIONS.find((option) => option.value === settings.signChanges)?.label ?? 'No changes'

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
          width: 'min(820px, 95vw)',
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
              Bootstrap settings
            </span>
          </div>

          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.7)]"
            disabled={isRunning}
            onClick={onClose}
            aria-label="Close Bootstrap settings"
            title="Close"
          >
            <X size={14} style={{ color: 'var(--color-text-muted-alt)' }} />
          </button>
        </div>

        <div className="flex-1 min-h-0" style={{ display: 'flex' }}>
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
                      Bootstrapping in progress. Please wait while results load.
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <SectionTitle>General</SectionTitle>
                  <div className="grid gap-4 items-end" style={{ gridTemplateColumns: 'minmax(180px, 220px) 1fr' }}>
                    <Field label="Subsamples">
                      <InputBox>
                        <DraftNumberInput
                          value={settings.subsamples}
                          min={1}
                          fallback={500}
                          onCommit={(value) => set('subsamples', value)}
                          className="outline-none bg-transparent w-full"
                          style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 500 }}
                        />
                      </InputBox>
                    </Field>

                    <Field label="Resampling">
                      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', minHeight: 34, alignItems: 'center' }}>
                        {(['Individual', 'All'] as const).map((option) => (
                          <label
                            key={option}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              cursor: 'pointer',
                              color: 'var(--color-text-secondary)',
                              fontSize: 13,
                              fontFamily: 'DM Sans, sans-serif',
                            }}
                          >
                            <input
                              type="radio"
                              name="bootstrap-resampling"
                              checked={settings.resampling === option}
                              onChange={() => set('resampling', option)}
                              style={{ accentColor: 'var(--color-accent)' }}
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                    </Field>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <SectionTitle>Confidence intervals</SectionTitle>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ width: 148 }}>
                      <Field label="CI type">
                        <SelectBox
                          value={settings.ciType}
                          options={['Percentile', 'BCa', 't-statistic']}
                          onChange={(value) => set('ciType', value as BootstrapSettings['ciType'])}
                        />
                      </Field>
                    </div>

                    <div style={{ width: 124 }}>
                      <Field label="Confidence level">
                        <SelectBox
                          value={settings.confidenceLevel}
                          options={['90%', '95%', '99%']}
                          onChange={(value) => set('confidenceLevel', value as BootstrapSettings['confidenceLevel'])}
                        />
                      </Field>
                    </div>

                    <div style={{ width: 144 }}>
                      <Field label="Tails">
                        <SelectBox
                          value={settings.tails}
                          options={['Two-tailed', 'One-tailed']}
                          onChange={(value) => set('tails', value as BootstrapSettings['tails'])}
                        />
                      </Field>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ width: 220 }}>
                    <Field label="Sign changes">
                      <SelectBox
                        value={signLabel}
                        options={SIGN_CHANGE_OPTIONS.map((option) => option.label)}
                        onChange={(label) => {
                          const match = SIGN_CHANGE_OPTIONS.find((option) => option.label === label)
                          if (match) set('signChanges', match.value)
                        }}
                      />
                    </Field>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((previous) => !previous)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      width: 220,
                    }}
                  >
                    <SectionTitle>Advanced</SectionTitle>
                    <CaretDown
                      size={14}
                      color="var(--color-text-muted-alt)"
                      style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.18s ease' }}
                    />
                  </button>
                  {showAdvanced && (
                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', maxWidth: 420 }}>
                      <Field label="Max iterations">
                        <InputBox>
                          <DraftNumberInput
                            value={settings.maxIterations}
                            min={1}
                            fallback={300}
                            onCommit={(value) => set('maxIterations', value)}
                            className="outline-none bg-transparent w-full"
                            style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 500 }}
                          />
                        </InputBox>
                      </Field>

                      <Field label="Stop criterion">
                        <InputBox>
                          <PlainInput value={settings.stopCriterion} onChange={(value) => set('stopCriterion', value)} />
                        </InputBox>
                      </Field>
                    </div>
                  )}
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
                gap: 16,
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--color-text-muted-alt)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                Default settings
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  type="button"
                  className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.7)]"
                  style={{ color: 'var(--color-text-secondary-alt)' }}
                  disabled={isRunning}
                  aria-label="Save preset"
                  title="Save preset"
                >
                  <FloppyDisk size={14} />
                </button>

                <button
                  type="button"
                  className="flex items-center gap-1.5 px-5 py-3 rounded-lg transition-opacity"
                  style={{
                    background: 'var(--color-accent)',
                    color: 'var(--color-on-accent)',
                    opacity: isRunning ? 0.8 : 1,
                    boxShadow: '0 8px 18px rgb(var(--color-accent-rgb) / 0.18)',
                  }}
                  disabled={isRunning}
                  onClick={() => onRun(settings)}
                >
                  {isRunning ? <CircleNotch size={14} className="animate-spin" /> : <MathOperations size={14} weight="bold" />}
                  <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700 }}>
                    {isRunning ? 'Bootstrapping…' : 'Run Bootstrap'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div
            style={{
              width: 224,
              flex: '0 0 224px',
              background: 'var(--color-page)',
              borderLeft: '1px solid var(--color-border)',
              padding: '18px 14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <SectionTitle>Summary</SectionTitle>
            <div className="flex flex-col gap-1.5">
              {[
                `Subsamples: ${settings.subsamples}`,
                `Resampling: ${settings.resampling}`,
                `CI type: ${settings.ciType}`,
                `Confidence level: ${settings.confidenceLevel}`,
                `Tails: ${settings.tails}`,
                `Sign changes: ${signLabel}`,
                ...(showAdvanced
                  ? [`Max iterations: ${settings.maxIterations}`, `Stop criterion: ${settings.stopCriterion}`]
                  : []),
              ].map((line, index) => (
                <p key={index} style={{ color: 'var(--color-text-secondary-alt)', fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 500, margin: 0 }}>
                  {line}
                </p>
              ))}
              <p style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 500, margin: '6px 0 0' }}>
                Estimated time: {estTime}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
