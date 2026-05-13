import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CaretDown,
  FileText,
  X,
} from '@phosphor-icons/react'
import { stripModelDisplayName, stripWorkspaceDisplayName } from '../utils/displayNames'
import type { Workspace, WorkspaceModelChild, WorkspaceResultChild } from '../types/workspace'
import {
  getMissingLabel,
  getModelReadiness,
  type ModelReadiness,
} from '../utils/tarkReadiness'

type TableLabelMode = 'full' | 'short'

export interface TarkReportRequest {
  workspaceId: string
  modelId: string
  reportTitle: string
  includePathDiagram: boolean
  structuralPathMode: string
  indicatorPathMode: string
  constructValueMode: string
  includeAdvancedAnalysis: boolean
  tableLabelMode: TableLabelMode
  constructLabels: Record<string, string>
}

interface TarkModalProps {
  workspaces: Workspace[]
  activeWorkspaceId?: string
  onClose: () => void
  onTarkIt: (request: TarkReportRequest) => void
}

interface SelectOption {
  value: string
  label: string
  meta?: string
  disabled?: boolean
}

const STRUCTURAL_PATH_OPTIONS = ['Path coefficients', 'Correlations', 'Total effects', 'Indirect effects', 'Blank']
const INDICATOR_PATH_OPTIONS = ['Outer loadings', 'Outer weights', 'Outer weights / loadings', 'Blank']
const CONSTRUCT_VALUE_OPTIONS = ['R-square', 'AVE', 'Composite reliability', "Cronbach's alpha", 'Blank']
const TARK_LABEL_COLOR = 'var(--color-text-secondary)'
const TARK_CONTROL_TEXT_COLOR = 'var(--color-text-secondary-alt)'
const TARK_CONTROL_MUTED_COLOR = 'var(--color-text-muted-alt)'
const TARK_DISABLED_TEXT_COLOR = 'var(--color-text-dim)'

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        color: TARK_LABEL_COLOR,
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <span
        style={{
          color: TARK_LABEL_COLOR,
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

function InputBox({
  children,
  height = 34,
  variant = 'box',
}: {
  children: ReactNode
  height?: number
  variant?: 'box' | 'underline'
}) {
  const underline = variant === 'underline'
  return (
    <div
      className="flex items-center min-w-0"
      style={{
        width: '100%',
        height,
        padding: underline ? '0 2px' : '0 12px',
        background: underline ? 'transparent' : 'var(--color-elevated)',
        border: underline ? 'none' : '1px solid var(--color-border)',
        borderBottom: underline ? '1px solid var(--color-border)' : undefined,
        borderRadius: underline ? 0 : 7,
      }}
    >
      {children}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="outline-none bg-transparent w-full min-w-0"
      style={{
        color: TARK_CONTROL_TEXT_COLOR,
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 12,
        fontWeight: 500,
      }}
    />
  )
}

function SelectBox({
  value,
  options,
  onChange,
  placeholder = 'Select',
  placement = 'down',
}: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  placement?: 'down' | 'up'
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value)

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
          color: selected ? TARK_CONTROL_TEXT_COLOR : TARK_CONTROL_MUTED_COLOR,
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
          {selected?.label ?? placeholder}
        </span>
        <CaretDown size={12} style={{ color: TARK_CONTROL_MUTED_COLOR, flexShrink: 0 }} />
      </button>
      {open && (
        <div
          className="absolute left-0 z-50 rounded-lg overflow-hidden"
          style={{
            ...(placement === 'up' ? { bottom: 'calc(100% + 3px)' } : { top: 'calc(100% + 3px)' }),
            width: '100%',
            background: 'var(--color-elevated)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 20px rgba(0,0,0,0.376)',
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              className="w-full text-left px-3 py-2 transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.7)]"
              style={{
                color: option.disabled ? TARK_DISABLED_TEXT_COLOR : TARK_CONTROL_TEXT_COLOR,
                cursor: option.disabled ? 'default' : 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 12,
                opacity: option.disabled ? 0.68 : 1,
              }}
              onClick={() => {
                if (option.disabled) return
                onChange(option.value)
                setOpen(false)
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option.label}</span>
                {option.meta && (
                  <span style={{ flexShrink: 0, color: option.disabled ? 'var(--color-danger)' : 'var(--color-success)', fontSize: 11 }}>
                    {option.meta}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function RadioOption({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string
  value: string
  checked: boolean
  onChange: () => void
  children: ReactNode
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        color: TARK_CONTROL_TEXT_COLOR,
        fontSize: 13,
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        style={{ accentColor: TARK_CONTROL_TEXT_COLOR }}
      />
      {children}
    </label>
  )
}

function ConstructLabelField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <InputBox height={30} variant="underline">
        <TextInput value={value} onChange={onChange} ariaLabel={`Full name for ${label}`} />
      </InputBox>
    </div>
  )
}

function getConstructs(model: WorkspaceModelChild | null): Array<{ id: string; name: string }> {
  const raw = Array.isArray(model?.state?.constructs) ? model?.state?.constructs : []
  return raw.map((construct: any, index: number) => {
    const name = String(construct?.name || construct?.label || `Construct ${index + 1}`)
    return {
      id: String(construct?.id || name || `construct-${index}`),
      name,
    }
  })
}

export default function TarkModal({
  workspaces,
  activeWorkspaceId,
  onClose,
  onTarkIt,
}: TarkModalProps) {
  const initialWorkspaceId = activeWorkspaceId || workspaces[0]?.id || ''
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId)
  const [modelId, setModelId] = useState('')
  const [reportTitle, setReportTitle] = useState('Tark report')
  const [titleTouched, setTitleTouched] = useState(false)
  const [includePathDiagram, setIncludePathDiagram] = useState(true)
  const [structuralPathMode, setStructuralPathMode] = useState(STRUCTURAL_PATH_OPTIONS[0])
  const [indicatorPathMode, setIndicatorPathMode] = useState(INDICATOR_PATH_OPTIONS[0])
  const [constructValueMode, setConstructValueMode] = useState(CONSTRUCT_VALUE_OPTIONS[0])
  const [includeAdvancedAnalysis, setIncludeAdvancedAnalysis] = useState(false)
  const [tableLabelMode, setTableLabelMode] = useState<TableLabelMode>('full')
  const [constructLabels, setConstructLabels] = useState<Record<string, string>>({})

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0] ?? null,
    [workspaceId, workspaces],
  )

  const models = useMemo(
    () => selectedWorkspace?.children.filter((child): child is WorkspaceModelChild => child.type === 'model') ?? [],
    [selectedWorkspace],
  )

  const results = useMemo(
    () => selectedWorkspace?.children.filter((child): child is WorkspaceResultChild => child.type === 'result') ?? [],
    [selectedWorkspace],
  )

  const readinessByModel = useMemo(() => {
    const map = new Map<string, ModelReadiness>()
    models.forEach((model) => map.set(model.id, getModelReadiness(model.id, results, { includeAdvancedAnalysis })))
    return map
  }, [includeAdvancedAnalysis, models, results])

  const firstReadyModel = useMemo(
    () => models.find((model) => readinessByModel.get(model.id)?.ready) ?? null,
    [models, readinessByModel],
  )

  useEffect(() => {
    if (!selectedWorkspace) return
    const currentModel = models.find((model) => model.id === modelId)
    if (currentModel && readinessByModel.get(currentModel.id)?.ready) return
    setModelId(firstReadyModel?.id ?? '')
  }, [firstReadyModel, modelId, models, readinessByModel, selectedWorkspace])

  const selectedModel = useMemo(
    () => models.find((model) => model.id === modelId) ?? null,
    [modelId, models],
  )

  const selectedReadiness = selectedModel
    ? readinessByModel.get(selectedModel.id) ?? getModelReadiness(selectedModel.id, results, { includeAdvancedAnalysis })
    : null
  const constructList = useMemo(() => getConstructs(selectedModel), [selectedModel])

  useEffect(() => {
    if (!selectedModel) return
    if (!titleTouched) {
      setReportTitle(`${stripModelDisplayName(selectedModel.name)} Tark report`)
    }
  }, [selectedModel, titleTouched])

  useEffect(() => {
    setConstructLabels((previous) => {
      const next: Record<string, string> = {}
      constructList.forEach((construct) => {
        next[construct.id] = previous[construct.id] ?? construct.name
      })
      return next
    })
  }, [constructList])

  const workspaceOptions = workspaces.map((workspace) => ({
    value: workspace.id,
    label: stripWorkspaceDisplayName(workspace.name),
  }))

  const modelOptions = models.map((model) => {
    const readiness = readinessByModel.get(model.id) ?? getModelReadiness(model.id, results, { includeAdvancedAnalysis })
    return {
      value: model.id,
      label: stripModelDisplayName(model.name),
      meta: readiness.ready ? 'Ready' : `${getMissingLabel(readiness)} missing`,
      disabled: !readiness.ready,
    }
  })

  const canPreview = Boolean(selectedModel && selectedReadiness?.ready)
  const handleTarkIt = () => {
    if (!canPreview || !selectedModel || !selectedWorkspace) return

    const resolvedConstructLabels = { ...constructLabels }
    constructList.forEach((construct) => {
      const label = constructLabels[construct.id] ?? construct.name
      resolvedConstructLabels[construct.id] = label
      resolvedConstructLabels[construct.name] = label
    })

    onTarkIt({
      workspaceId: selectedWorkspace.id,
      modelId: selectedModel.id,
      reportTitle: reportTitle.trim() || `${stripModelDisplayName(selectedModel.name)} Tark report`,
      includePathDiagram,
      structuralPathMode,
      indicatorPathMode,
      constructValueMode,
      includeAdvancedAnalysis,
      tableLabelMode,
      constructLabels: resolvedConstructLabels,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: 'min(860px, 95vw)',
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
            <FileText size={18} weight="fill" color="var(--color-accent)" />
            <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'DM Sans, sans-serif', color: 'var(--color-text-secondary)' }}>
              Tark report
            </span>
          </div>

          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-[rgb(var(--color-hover-rgb)/0.7)]"
            onClick={onClose}
            aria-label="Close Tark"
            title="Close"
          >
            <X size={14} style={{ color: 'var(--color-text-muted-alt)' }} />
          </button>
        </div>

        <div className="flex-1 min-h-0" style={{ display: 'flex' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--color-elevated)' }}>
              <div className="p-5 flex flex-col gap-5">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(180px, 220px) 1fr' }}>
                    <Field label="Workspace">
                      <SelectBox
                        value={workspaceId}
                        options={workspaceOptions}
                        onChange={(value) => {
                          setWorkspaceId(value)
                          setModelId('')
                        }}
                        placeholder="Select workspace"
                      />
                    </Field>

                    <Field label="Model">
                      <SelectBox
                        value={modelId}
                        options={modelOptions}
                        onChange={(value) => {
                          setModelId(value)
                        }}
                        placeholder={models.length ? 'No report-ready model' : 'No models in workspace'}
                      />
                    </Field>
                  </div>
                </div>

                <div style={{ height: 1, background: 'var(--color-border)', opacity: 0.75 }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Field label="Report title">
                    <InputBox variant="underline">
                      <TextInput
                        value={reportTitle}
                        placeholder="Tark report title"
                        ariaLabel="Report title"
                        onChange={(value) => {
                          setTitleTouched(true)
                          setReportTitle(value)
                        }}
                      />
                    </InputBox>
                  </Field>

                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', minHeight: 34, alignItems: 'center' }}>
                    <RadioOption
                      name="tark-table-labels"
                      value="full"
                      checked={tableLabelMode === 'full'}
                      onChange={() => setTableLabelMode('full')}
                    >
                      Full construct names in tables
                    </RadioOption>
                    <RadioOption
                      name="tark-table-labels"
                      value="short"
                      checked={tableLabelMode === 'short'}
                      onChange={() => setTableLabelMode('short')}
                    >
                      Abbreviations everywhere
                      </RadioOption>
                    </div>

                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', minHeight: 30, alignItems: 'center' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        color: TARK_CONTROL_TEXT_COLOR,
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={includePathDiagram}
                        onChange={(event) => setIncludePathDiagram(event.target.checked)}
                        style={{ accentColor: TARK_CONTROL_TEXT_COLOR }}
                      />
                      Include path diagram
                    </label>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        color: TARK_CONTROL_TEXT_COLOR,
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={includeAdvancedAnalysis}
                        onChange={(event) => setIncludeAdvancedAnalysis(event.target.checked)}
                        style={{ accentColor: TARK_CONTROL_TEXT_COLOR }}
                      />
                      Include advanced analysis
                    </label>
                  </div>
                </div>

                {includePathDiagram && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <SectionTitle>Diagram values</SectionTitle>
                    <div
                      className="grid gap-3"
                      style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
                    >
                      <Field label="Structural paths">
                        <SelectBox
                          value={structuralPathMode}
                          options={STRUCTURAL_PATH_OPTIONS.map((option) => ({ value: option, label: option }))}
                          onChange={setStructuralPathMode}
                          placement="up"
                        />
                      </Field>
                      <Field label="Indicator paths">
                        <SelectBox
                          value={indicatorPathMode}
                          options={INDICATOR_PATH_OPTIONS.map((option) => ({ value: option, label: option }))}
                          onChange={setIndicatorPathMode}
                          placement="up"
                        />
                      </Field>
                      <Field label="Construct values">
                        <SelectBox
                          value={constructValueMode}
                          options={CONSTRUCT_VALUE_OPTIONS.map((option) => ({ value: option, label: option }))}
                          onChange={setConstructValueMode}
                          placement="up"
                        />
                      </Field>
                    </div>
                  </div>
                )}

                {constructList.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <SectionTitle>Construct labels</SectionTitle>
                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(2, minmax(190px, 1fr))' }}>
                      {constructList.map((construct) => (
                        <ConstructLabelField
                          key={construct.id}
                          label={construct.name}
                          value={constructLabels[construct.id] ?? construct.name}
                          onChange={(value) => setConstructLabels((previous) => ({ ...previous, [construct.id]: value }))}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                padding: '16px 20px',
                backgroundColor: 'var(--color-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                borderTop: '1px solid var(--color-border)',
                gap: 16,
              }}
            >
              <button
                type="button"
                className="flex items-center gap-1.5 px-5 py-3 rounded-lg transition-opacity"
                style={{
                  background: 'var(--color-accent)',
                  color: 'var(--color-on-accent)',
                  opacity: canPreview ? 1 : 0.5,
                  boxShadow: canPreview ? '0 8px 18px rgb(var(--color-accent-rgb) / 0.18)' : 'none',
                }}
                disabled={!canPreview}
                onClick={handleTarkIt}
              >
                <FileText size={14} weight="fill" />
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700 }}>
                  Tark it
                </span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
