import { Database, ArrowSquareOut, ArrowClockwise } from '@phosphor-icons/react'

interface DatasetRowProps {
  filename: string
  rows: number
  columns: number
  onOpen?: () => void
  onUpdate?: () => void
}

export default function DatasetRow({
  filename,
  rows,
  columns,
  onOpen,
  onUpdate,
}: DatasetRowProps) {
  return (
    <div className="flex items-center justify-between bg-elevated rounded-lg px-4 py-3 border border-border">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-cyan/10 flex items-center justify-center">
          <Database size={16} className="text-cyan" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">{filename}</p>
          <p className="text-xs text-text-muted">
            {rows} rows · {columns} columns
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onUpdate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-text-secondary hover:bg-surface transition-colors border border-border"
        >
          <ArrowClockwise size={13} />
          Update
        </button>
        <button
          onClick={onOpen}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-primary hover:bg-primary/10 transition-colors border border-primary/30"
        >
          <ArrowSquareOut size={13} />
          Open
        </button>
      </div>
    </div>
  )
}
