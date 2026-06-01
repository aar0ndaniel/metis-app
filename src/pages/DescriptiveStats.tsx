import { useState } from 'react'
import { MagnifyingGlass, CaretUpDown, Copy, DownloadSimple } from '@phosphor-icons/react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatRow {
  construct?: string  // separator row label
  indicator?: string
  mean?: number
  median?: number
  sd?: number
  min?: number
  max?: number
  kurt?: number
  skew?: number
  excess?: number
  cr?: number
  rho_a?: number
  ave?: number
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const ROWS: StatRow[] = [
  // ATT
  { construct: 'ATT — Attitude (Reflective)' },
  { indicator: 'ATT_1', mean: 3.94, median: 4.00, sd: 0.845, min: 1, max: 5, kurt: -0.234, skew: -0.612, excess: 2.00, cr: 0.875, rho_a: 0.816, ave: 0.638 },
  { indicator: 'ATT_2', mean: 3.87, median: 4.00, sd: 0.901, min: 1, max: 5, kurt: -0.312, skew: -0.548, excess: 1.75, cr: 0.875, rho_a: 0.816, ave: 0.638 },
  { indicator: 'ATT_3', mean: 3.72, median: 4.00, sd: 0.923, min: 1, max: 5, kurt: -0.187, skew: -0.423, excess: 1.58, cr: 0.875, rho_a: 0.816, ave: 0.638 },
  { indicator: 'ATT_4', mean: 3.81, median: 4.00, sd: 0.866, min: 2, max: 5, kurt: -0.254, skew: -0.501, excess: 1.90, cr: 0.875, rho_a: 0.816, ave: 0.638 },
  // BI
  { construct: 'BI — Behavioural Intention (Reflective)' },
  { indicator: 'BI_1', mean: 4.02, median: 4.00, sd: 0.812, min: 2, max: 5, kurt: -0.118, skew: -0.634, excess: 2.15, cr: 0.901, rho_a: 0.858, ave: 0.694 },
  { indicator: 'BI_2', mean: 3.95, median: 4.00, sd: 0.833, min: 1, max: 5, kurt: -0.203, skew: -0.589, excess: 2.03, cr: 0.901, rho_a: 0.858, ave: 0.694 },
  { indicator: 'BI_3', mean: 3.88, median: 4.00, sd: 0.871, min: 1, max: 5, kurt: -0.291, skew: -0.512, excess: 1.87, cr: 0.901, rho_a: 0.858, ave: 0.694 },
  { indicator: 'BI_4', mean: 4.11, median: 4.00, sd: 0.798, min: 2, max: 5, kurt: -0.098, skew: -0.712, excess: 2.28, cr: 0.901, rho_a: 0.858, ave: 0.694 },
  // DC
  { construct: 'DC — Digital Competence (Formative)' },
  { indicator: 'DAM', mean: 3.55, median: 4.00, sd: 1.021, min: 1, max: 5, kurt: -0.512, skew: -0.301, excess: 1.43, cr: 0.524, rho_a: 0.312, ave: 0.189 },
  { indicator: 'Ev', mean: 3.68, median: 4.00, sd: 0.987, min: 1, max: 5, kurt: -0.423, skew: -0.367, excess: 1.61, cr: 0.524, rho_a: 0.312, ave: 0.189 },
  { indicator: 'PR', mean: 3.42, median: 3.00, sd: 1.054, min: 1, max: 5, kurt: -0.601, skew: -0.218, excess: 1.39, cr: 0.524, rho_a: 0.312, ave: 0.189 },
  { indicator: 'SFA', mean: 3.61, median: 4.00, sd: 1.009, min: 1, max: 5, kurt: -0.487, skew: -0.334, excess: 1.51, cr: 0.524, rho_a: 0.312, ave: 0.189 },
  { indicator: 'SMD', mean: 3.74, median: 4.00, sd: 0.942, min: 1, max: 5, kurt: -0.398, skew: -0.412, excess: 1.67, cr: 0.524, rho_a: 0.312, ave: 0.189 },
  // PEOU
  { construct: 'PEOU — Perceived Ease of Use (Reflective)' },
  { indicator: 'PEOU_1', mean: 3.89, median: 4.00, sd: 0.856, min: 1, max: 5, kurt: -0.261, skew: -0.523, excess: 1.92, cr: 0.882, rho_a: 0.828, ave: 0.652 },
  { indicator: 'PEOU_2', mean: 3.76, median: 4.00, sd: 0.891, min: 1, max: 5, kurt: -0.334, skew: -0.461, excess: 1.77, cr: 0.882, rho_a: 0.828, ave: 0.652 },
  { indicator: 'PEOU_3', mean: 3.82, median: 4.00, sd: 0.874, min: 2, max: 5, kurt: -0.298, skew: -0.487, excess: 1.84, cr: 0.882, rho_a: 0.828, ave: 0.652 },
  { indicator: 'PEOU_4', mean: 3.91, median: 4.00, sd: 0.839, min: 1, max: 5, kurt: -0.219, skew: -0.558, excess: 1.98, cr: 0.882, rho_a: 0.828, ave: 0.652 },
  // PU
  { construct: 'PU — Perceived Usefulness (Reflective)' },
  { indicator: 'PU_1', mean: 3.98, median: 4.00, sd: 0.823, min: 2, max: 5, kurt: -0.178, skew: -0.598, excess: 2.09, cr: 0.871, rho_a: 0.807, ave: 0.628 },
  { indicator: 'PU_2', mean: 3.85, median: 4.00, sd: 0.867, min: 1, max: 5, kurt: -0.267, skew: -0.534, excess: 1.89, cr: 0.871, rho_a: 0.807, ave: 0.628 },
  { indicator: 'PU_3', mean: 3.77, median: 4.00, sd: 0.898, min: 1, max: 5, kurt: -0.345, skew: -0.478, excess: 1.74, cr: 0.871, rho_a: 0.807, ave: 0.628 },
  { indicator: 'PU_4', mean: 3.91, median: 4.00, sd: 0.845, min: 2, max: 5, kurt: -0.212, skew: -0.567, excess: 1.95, cr: 0.871, rho_a: 0.807, ave: 0.628 },
  // SE
  { construct: 'SE — Self-Efficacy (Reflective)' },
  { indicator: 'SE_1', mean: 3.63, median: 4.00, sd: 0.934, min: 1, max: 5, kurt: -0.421, skew: -0.378, excess: 1.64, cr: 0.877, rho_a: 0.793, ave: 0.706 },
  { indicator: 'SE_2', mean: 3.71, median: 4.00, sd: 0.912, min: 1, max: 5, kurt: -0.387, skew: -0.412, excess: 1.71, cr: 0.877, rho_a: 0.793, ave: 0.706 },
  { indicator: 'SE_3', mean: 3.58, median: 4.00, sd: 0.956, min: 1, max: 5, kurt: -0.456, skew: -0.345, excess: 1.59, cr: 0.877, rho_a: 0.793, ave: 0.706 },
]

const CONSTRUCT_COLORS: Record<string, string> = {
  ATT: 'var(--color-accent)',
  BI: 'var(--color-accent)',
  DC: '#DC6973',
  PEOU: '#D96B4D',
  PU: '#DC6973',
  SE: '#A78BFA',
}

function getConstructTag(indicatorName: string): string {
  for (const key of Object.keys(CONSTRUCT_COLORS)) {
    if (indicatorName.startsWith(key + '_') || indicatorName === key ||
        ['DAM','Ev','PR','SFA','SMD'].includes(indicatorName)) {
      if (['DAM','Ev','PR','SFA','SMD'].includes(indicatorName)) return 'DC'
      return key
    }
  }
  return ''
}

const TABS = ['Descriptive Stats', 'Correlations', 'Reliability & Validity', 'Factor Loadings'] as const
type StatsTab = typeof TABS[number]

const fmt3 = (n?: number): string => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(3) : '—')

// ─── Component ────────────────────────────────────────────────────────────────

export default function DescriptiveStats() {
  const [activeTab, setActiveTab] = useState<StatsTab>('Descriptive Stats')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All types')

  const filteredRows = ROWS.filter((row) => {
    if (!row.indicator) return true // always show construct separators
    const matchesSearch = row.indicator.toLowerCase().includes(search.toLowerCase())
    return matchesSearch
  })

  return (
    <div className="h-full flex flex-col bg-page">
      {/* Tab bar */}
      <div className="h-11 bg-surface border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'border-primary text-text-primary'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-text-muted hidden lg:block">
            26 variables · 100 cases · 0 missing
          </span>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-text-secondary border border-border hover:bg-elevated transition-colors">
            <Copy size={12} />
            Copy to Excel / Word
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="h-10 bg-surface/80 border-b border-border flex items-center gap-3 px-4 shrink-0">
        <div className="flex items-center gap-1.5 bg-elevated rounded-lg px-2.5 py-1.5 w-52">
          <MagnifyingGlass size={12} className="text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search indicators..."
            className="bg-transparent text-xs text-text-primary placeholder-text-muted outline-none w-full"
          />
        </div>

        <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-secondary border border-border hover:bg-elevated transition-colors">
          {typeFilter}
          <CaretUpDown size={11} />
        </button>

        <button className="px-2.5 py-1.5 rounded-lg text-[11px] text-text-muted border border-border hover:bg-elevated transition-colors">
          Missing only
        </button>
      </div>

      {/* Title bar */}
      <div className="h-9 bg-surface border-b border-border flex items-center justify-between px-4 shrink-0">
        <span className="text-xs font-bold text-text-primary">Indicators</span>
        <button className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary transition-colors">
          Sort by: Name
          <CaretUpDown size={11} />
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px] border-collapse">
          {/* Header */}
          <thead className="sticky top-0 z-10">
            <tr className="bg-elevated">
              {[
                { label: 'Indicator', w: 'w-32' },
                { label: 'Mean', w: 'w-16' },
                { label: 'Median', w: 'w-16' },
                { label: 'Std. Dev.', w: 'w-20' },
                { label: 'Min', w: 'w-12' },
                { label: 'Max', w: 'w-12' },
                { label: 'Kurtosis', w: 'w-20' },
                { label: 'Skewness', w: 'w-20' },
                { label: 'Ex. Kurtosis', w: 'w-24' },
                { label: 'CR', w: 'w-16' },
                { label: 'ρA', w: 'w-16' },
                { label: 'AVE', w: 'w-16' },
                { label: 'Missing', w: 'w-16' },
              ].map((col) => (
                <th
                  key={col.label}
                  className={`text-left px-3 py-2 text-text-muted font-medium text-[10px] uppercase tracking-wider border-b border-border ${col.w}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((row, i) => {
              // Construct separator row
              if (row.construct) {
                const tag = row.construct.split(' — ')[0]
                const color = CONSTRUCT_COLORS[tag] || 'var(--color-accent)'
                return (
                  <tr key={i} className="bg-elevated border-t border-border">
                    <td
                      colSpan={13}
                      className="px-3 py-2 font-bold text-[11px]"
                      style={{ color }}
                    >
                      {row.construct}
                    </td>
                  </tr>
                )
              }

              // Data row
              const construct = getConstructTag(row.indicator || '')
              const color = CONSTRUCT_COLORS[construct] || '#F0F0F0'
              const isEven = i % 2 === 0

              return (
                <tr
                  key={i}
                  className={`border-t border-border/30 hover:bg-elevated/40 transition-colors ${
                    isEven ? 'bg-page' : 'bg-surface'
                  }`}
                >
                  {/* Indicator name */}
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-text-primary font-medium">
                        {row.indicator}
                      </span>
                    </div>
                  </td>

                  {/* Numeric columns */}
                  <td className="px-3 py-1.5 text-text-secondary">{fmt3(row.mean)}</td>
                  <td className="px-3 py-1.5 text-text-secondary">{fmt3(row.median)}</td>
                  <td className="px-3 py-1.5 text-text-secondary">{fmt3(row.sd)}</td>
                  <td className="px-3 py-1.5 text-text-muted">{row.min}</td>
                  <td className="px-3 py-1.5 text-text-muted">{row.max}</td>
                  <td className="px-3 py-1.5 text-text-secondary">{fmt3(row.kurt)}</td>
                  <td className="px-3 py-1.5 text-text-secondary">{fmt3(row.skew)}</td>
                  <td className="px-3 py-1.5 text-text-secondary">{fmt3(row.excess)}</td>

                  {/* Quality cols — amber when good */}
                  <td className="px-3 py-1.5">
                    <span className={row.cr! >= 0.7 ? 'text-secondary' : 'text-coral'}>
                      {fmt3(row.cr)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={row.rho_a! >= 0.7 ? 'text-secondary' : 'text-coral'}>
                      {fmt3(row.rho_a)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={row.ave! >= 0.5 ? 'text-secondary' : 'text-coral'}>
                      {fmt3(row.ave)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-secondary">0</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer bar */}
      <div className="h-8 bg-surface border-t border-border flex items-center justify-between px-4 shrink-0">
        <span className="text-[10px] text-text-muted">22 indicators shown</span>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors">
            <DownloadSimple size={11} />
            Export CSV
          </button>
        </div>
      </div>
    </div>
  )
}
