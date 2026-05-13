import { Graph, Plus } from '@phosphor-icons/react'

interface ModelCardProps {
  name: string
  badge?: string
  subtitle?: string
  isNew?: boolean
  onClick?: () => void
}

const badgeColors: Record<string, string> = {
  Calculated: 'bg-primary text-white',
  Draft: 'bg-elevated text-text-secondary',
}

export default function ModelCard({
  name,
  badge,
  subtitle,
  isNew,
  onClick,
}: ModelCardProps) {
  if (isNew) {
    return (
      <button
        onClick={onClick}
        className="w-[200px] h-[130px] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-colors group"
      >
        <Plus
          size={24}
          className="text-text-muted group-hover:text-primary transition-colors"
        />
        <span className="text-xs text-text-muted group-hover:text-text-secondary transition-colors">
          New Model
        </span>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      className="w-[200px] h-[130px] rounded-xl bg-elevated border border-border flex flex-col justify-between p-4 hover:border-primary/40 transition-colors text-left group"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Graph size={16} weight="bold" className="text-primary" />
          <span className="text-sm font-medium text-text-primary">{name}</span>
        </div>
        {badge && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              badgeColors[badge] || 'bg-elevated text-text-secondary'
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-text-muted">{subtitle}</p>
      )}
      <div className="flex justify-end">
        <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          + Open
        </span>
      </div>
    </button>
  )
}
