import { useCalculation } from '@/state/calculationContext'

export interface CalcCancelDialogProps {
  intent: 'stop' | 'quit'
  onCancel: () => void
  onConfirm: () => void
}

export default function CalcCancelDialog({ intent, onCancel, onConfirm }: CalcCancelDialogProps) {
  const state = useCalculation()
  const active = state.active
  const calcLabel = active?.type === 'bootstrap' ? 'bootstrap'
    : active?.type === 'plspredict' ? 'PLSpredict'
    : active?.type === 'advanced' ? 'advanced analysis'
    : 'calculation'
  const progressLabel = active?.subLabel ?? `${Math.round(active?.progressPct ?? 0)}% complete`

  const headline = intent === 'stop'
    ? `Stop ${calcLabel}?`
    : `Calculation in progress`
  const body = intent === 'stop'
    ? `You'll discard ${progressLabel} of work. This can't be undone.`
    : `Quit anyway? You will lose ${progressLabel} of the running ${calcLabel}.`
  const confirmText = intent === 'stop' ? 'Stop and discard' : 'Quit anyway'

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-neutral-900 text-neutral-100 rounded-xl shadow-2xl px-6 py-5 w-[380px] max-w-[90vw]">
        <h3 className="text-base font-medium mb-1">{headline}</h3>
        <p className="text-sm text-neutral-400 mb-5">{body}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md border border-neutral-700 hover:bg-neutral-800"
            onClick={onCancel}
          >
            Keep running
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md bg-red-700 hover:bg-red-600 text-white"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
