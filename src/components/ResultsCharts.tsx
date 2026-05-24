/**
 * ResultsCharts.tsx
 * Interactive SVG charts for PLS-SEM, Bootstrap, and PLSpredict results.
 * Advanced charts are selected from the results panel header.
 * They are also embedded as static SVGs in the HTML export.
 */

import { useState } from 'react'
import { ANALYSIS_TONE_HEX, getPValueTone, parseSignificancePValue } from '../utils/analysisPalette'
import {
  extractQ2PredictRows,
  formatBottleneckDisplayValue,
  isBottleneckMetaField,
  isBottleneckOutcomeField,
  normalizeBottleneckRowsForDisplay,
} from '../results/panelTableData'
import type { AnalysisMode } from '../results/panelCatalog'
import {
  CHART_SUPPORTED_PANELS,
  getChartConfig,
  shouldExportChart,
} from '../results/chartRegistry'

export { CHART_SUPPORTED_PANELS, getChartConfig, shouldExportChart } from '../results/chartRegistry'

// ═══════════════════════════════════════════════════════════════════════════════
//  COLORS
// ═══════════════════════════════════════════════════════════════════════════════

const C_PASS   = ANALYSIS_TONE_HEX.pass
const C_WARN   = 'var(--color-warning)'
const C_FAIL   = ANALYSIS_TONE_HEX.fail
const C_ACCENT = 'var(--color-accent)'
const C_SUCCESS = 'var(--color-success)'
const C_DANGER = 'var(--color-danger)'
const C_PRIORITY_LOW = C_DANGER
const C_PRIORITY_MODERATE = C_WARN
const C_PRIORITY_HIGH = C_SUCCESS
const CHART_BG = 'var(--color-elevated)'
const CHART_GRID = 'var(--color-border)'
const CHART_TEXT = 'var(--color-text-secondary)'
const CHART_TEXT_ACTIVE = 'var(--color-text-primary)'
const CHART_MUTED = 'var(--color-text-muted)'
const CHART_ON_ACCENT = 'var(--color-on-accent)'
const CIPMA_NECESSARY_COLOR = C_DANGER
const CIPMA_SUFFICIENT_COLOR = C_SUCCESS

// Multi-construct palette for grouped charts
const PALETTE = [
  C_ACCENT,
  C_WARN,
  C_PASS,
  C_SUCCESS,
  C_DANGER,
  'var(--color-text-secondary)',
  'var(--color-title-tab)',
  'var(--color-text-muted)',
]

// Export (static HTML) light-theme colors
const EXP = {
  bg:     '#FFFFFF',
  border: '#D7DDE6',
  text:   '#1A1F2B',
  muted:  '#5F6978',
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SVG COORDINATE SYSTEM (virtual 640px wide)
// ═══════════════════════════════════════════════════════════════════════════════

const SVG_W  = 640
const L_MAR  = 172  // left margin (label column)
const R_MAR  = 52   // right margin
const T_MAR  = 28   // top margin
const B_MAR  = 36   // bottom margin
const PLOT_W = SVG_W - L_MAR - R_MAR   // = 416
const BAR_H  = 14   // bar height
const ROW_H  = 28   // row height (bar + padding)

// ═══════════════════════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function toN(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

function fmt(v: number, dp = 3): string {
  return Number.isFinite(v) ? v.toFixed(dp) : '—'
}

// Map a value from data domain to SVG pixel range
function scaleX(value: number, dMin: number, dMax: number): number {
  if (dMax === dMin) return L_MAR + PLOT_W / 2
  return L_MAR + ((value - dMin) / (dMax - dMin)) * PLOT_W
}

// Compute nice axis ticks
function niceTicks(minVal: number, maxVal: number, target = 5): { min: number; max: number; ticks: number[] } {
  const range = maxVal - minVal || 1
  const roughStep = range / target
  const mag = Math.pow(10, Math.floor(Math.log10(roughStep)))
  const norm = roughStep / mag
  const step = norm < 1.5 ? mag : norm < 3.5 ? 2 * mag : norm < 7.5 ? 5 * mag : 10 * mag
  const niceMin = Math.floor(minVal / step) * step
  const niceMax = Math.ceil(maxVal / step) * step
  const ticks: number[] = []
  for (let t = niceMin; t <= niceMax + step * 0.001; t = Math.round((t + step) * 1e9) / 1e9) {
    ticks.push(t)
  }
  return { min: niceMin, max: niceMax, ticks }
}

function trunc(s: string, max = 24): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TOOLTIP BOX (SVG element)
// ═══════════════════════════════════════════════════════════════════════════════

function TooltipBox({ x, y, lines, svgWidth = SVG_W }: { x: number; y: number; lines: string[]; svgWidth?: number }) {
  const W = 200
  const H = lines.length * 15 + 10
  const clampedX = Math.min(svgWidth - W - 4, Math.max(L_MAR, x))
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={clampedX} y={y - 4} width={W} height={H} rx={4}
        fill="var(--color-surface)" stroke={CHART_GRID} strokeWidth={0.8} />
      {lines.map((line, i) => (
        <text key={i} x={clampedX + 8} y={y + 9 + i * 15}
          fontSize={9.5} fill={CHART_TEXT}
          style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
        >{line}</text>
      ))}
    </g>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CHART AXIS + GRID (shared)
// ═══════════════════════════════════════════════════════════════════════════════

interface RefLine {
  value: number
  label?: string
  color?: string
  dash?: string
}

function XAxisLayer({
  ticks, dMin, dMax, svgH, refLines = [],
}: {
  ticks: number[]; dMin: number; dMax: number; svgH: number; refLines?: RefLine[]
}) {
  const x0 = scaleX(0, dMin, dMax)
  const plotBottom = svgH - B_MAR

  return (
    <>
      {/* Grid lines from each tick */}
      {ticks.map((t, i) => (
        <line key={i}
          x1={scaleX(t, dMin, dMax)} y1={T_MAR - 4}
          x2={scaleX(t, dMin, dMax)} y2={plotBottom}
          stroke={CHART_GRID}
          strokeWidth={t === 0 ? 1 : 0.5}
          strokeDasharray={t === 0 ? undefined : '2 4'}
        />
      ))}

      {/* Reference lines */}
      {refLines.map((r, i) => (
        <g key={`ref-${i}`}>
          <line
            x1={scaleX(r.value, dMin, dMax)} y1={T_MAR - 4}
            x2={scaleX(r.value, dMin, dMax)} y2={plotBottom}
            stroke={r.color ?? C_WARN}
            strokeWidth={1}
            strokeDasharray={r.dash ?? '4 3'}
            opacity={0.7}
          />
          {r.label && (
            <text
              x={scaleX(r.value, dMin, dMax) + 3} y={T_MAR - 6}
              fontSize={8.5} fill={r.color ?? C_WARN} opacity={0.85}
              style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
            >{r.label}</text>
          )}
        </g>
      ))}

      {/* Zero line (always solid) */}
      {dMin < 0 && dMax > 0 && (
        <line x1={x0} y1={T_MAR - 4} x2={x0} y2={plotBottom}
          stroke={CHART_GRID} strokeWidth={1} />
      )}

      {/* X-axis ticks + labels */}
      {ticks.map((t, i) => (
        <g key={`tick-${i}`}>
          <line
            x1={scaleX(t, dMin, dMax)} y1={plotBottom}
            x2={scaleX(t, dMin, dMax)} y2={plotBottom + 4}
            stroke={CHART_GRID} strokeWidth={0.5}
          />
          <text
            x={scaleX(t, dMin, dMax)} y={plotBottom + 14}
            textAnchor="middle" fontSize={9}
            fill={CHART_MUTED}
            style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
          >
            {Math.abs(t) < 0.001 ? '0' : t % 1 === 0 ? t.toString() : t.toFixed(2)}
          </text>
        </g>
      ))}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HBAR CHART — horizontal bars
// ═══════════════════════════════════════════════════════════════════════════════

export interface HBarItem {
  label: string
  value: number
  secondValue?: number   // paired bar (e.g. R² adjusted)
  color: string
  secondColor?: string
  tooltipLines?: string[]
}

export function HBarChart({
  items,
  refLines = [],
  domain,
  forceZero = true,
  pairLabels,      // legend labels for [primary, secondary] bars
}: {
  items: HBarItem[]
  refLines?: RefLine[]
  domain?: [number, number]
  forceZero?: boolean
  pairLabels?: [string, string]
}) {
  const [hover, setHover] = useState<number | null>(null)

  if (!items.length) return null

  const vals = items.flatMap(i => [i.value, i.secondValue ?? NaN].filter(Number.isFinite))
  const dataMin = Math.min(...vals)
  const dataMax = Math.max(...vals)

  let dMin = domain?.[0] ?? (forceZero ? Math.min(dataMin, 0) : dataMin)
  let dMax = domain?.[1] ?? (forceZero ? Math.max(dataMax, 0) : dataMax)
  refLines.forEach(r => { dMin = Math.min(dMin, r.value); dMax = Math.max(dMax, r.value) })

  const { min, max, ticks } = niceTicks(dMin, dMax)
  const hasPairs = items.some(i => i.secondValue !== undefined && Number.isFinite(i.secondValue))
  const rowH = hasPairs ? ROW_H + 10 : ROW_H
  const svgH = T_MAR + items.length * rowH + B_MAR + (pairLabels ? 18 : 0)
  const x0 = scaleX(0, min, max)

  return (
    <svg viewBox={`0 0 ${SVG_W} ${svgH}`} width="100%" style={{ display: 'block', userSelect: 'none' }}>
      <rect width={SVG_W} height={svgH} fill={CHART_BG} rx={6} />

      <XAxisLayer ticks={ticks} dMin={min} dMax={max} svgH={svgH - (pairLabels ? 18 : 0)} refLines={refLines} />

      {/* Bars */}
      {items.map((item, i) => {
        const y        = T_MAR + i * rowH
        const bY1      = y + (hasPairs ? 4 : (rowH - BAR_H) / 2)
        const bY2      = bY1 + BAR_H + 3
        const xVal     = scaleX(item.value, min, max)
        const barX     = Math.min(x0, xVal)
        const barW     = Math.max(1, Math.abs(xVal - x0))
        const isH      = hover === i

        return (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
            {/* Label */}
            <text x={L_MAR - 8} y={y + rowH / 2 + 3.5}
              textAnchor="end" fontSize={10}
              fill={isH ? CHART_TEXT_ACTIVE : CHART_TEXT}
              style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
            >{trunc(item.label)}</text>

            {/* Row hover bg */}
            {isH && <rect x={L_MAR} y={y + 2} width={PLOT_W} height={rowH - 4}
              fill="white" opacity={0.04} rx={2} />}

            {/* Primary bar */}
            <rect x={barX} y={bY1} width={barW} height={BAR_H}
              fill={item.color} opacity={isH ? 1 : 0.8} rx={2}>
              <animate attributeName="width" from="0" to={barW}
                dur="0.45s" calcMode="spline" keySplines="0.4 0 0.2 1" fill="freeze" />
            </rect>

            {/* Value label */}
            <text
              x={xVal + (item.value >= 0 ? 5 : -5)}
              y={bY1 + BAR_H / 2 + 3.5}
              textAnchor={item.value >= 0 ? 'start' : 'end'}
              fontSize={8.5} fill={item.color}
              opacity={isH ? 1 : 0.7}
              style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600 }}
            >{fmt(item.value)}</text>

            {/* Secondary bar */}
            {hasPairs && item.secondValue !== undefined && Number.isFinite(item.secondValue) && (() => {
              const xV2   = scaleX(item.secondValue, min, max)
              const bX2   = Math.min(x0, xV2)
              const bW2   = Math.max(1, Math.abs(xV2 - x0))
              return (
                <rect x={bX2} y={bY2} width={bW2} height={BAR_H - 2}
                  fill={item.secondColor ?? item.color} opacity={isH ? 0.6 : 0.4} rx={2}>
                  <animate attributeName="width" from="0" to={bW2}
                    dur="0.45s" calcMode="spline" keySplines="0.4 0 0.2 1" fill="freeze" />
                </rect>
              )
            })()}

            {/* Tooltip */}
            {isH && item.tooltipLines?.length && (
              <TooltipBox x={Math.max(xVal, x0) + 8} y={y + 4} lines={item.tooltipLines} />
            )}
          </g>
        )
      })}

      {/* Pair legend */}
      {pairLabels && (
        <g transform={`translate(${L_MAR}, ${svgH - 14})`}>
          <rect x={0} y={0} width={10} height={7} rx={1} fill={items[0]?.color ?? C_ACCENT} opacity={0.85} />
          <text x={14} y={7} fontSize={9} fill={CHART_MUTED}
            style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>{pairLabels[0]}</text>
          <rect x={90} y={0} width={10} height={7} rx={1} fill={items[0]?.color ?? C_ACCENT} opacity={0.4} />
          <text x={104} y={7} fontSize={9} fill={CHART_MUTED}
            style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>{pairLabels[1]}</text>
        </g>
      )}
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FOREST PLOT — Bootstrap CI intervals
// ═══════════════════════════════════════════════════════════════════════════════

export interface ForestItem {
  label: string
  estimate: number
  ci25: number
  ci975: number
  color: string
  tooltipLines?: string[]
}

export function ForestPlot({ items }: { items: ForestItem[] }) {
  const [hover, setHover] = useState<number | null>(null)

  if (!items.length) return null

  const validItems = items.filter(i => Number.isFinite(i.estimate))
  if (!validItems.length) return null

  const allVals = validItems.flatMap(i => [i.estimate, i.ci25, i.ci975].filter(Number.isFinite))
  const dataMin = Math.min(...allVals, 0)
  const dataMax = Math.max(...allVals, 0)
  const { min, max, ticks } = niceTicks(dataMin, dataMax)

  const svgH = T_MAR + items.length * ROW_H + B_MAR
  const x0   = scaleX(0, min, max)
  const DOT_R = 4

  return (
    <svg viewBox={`0 0 ${SVG_W} ${svgH}`} width="100%" style={{ display: 'block', userSelect: 'none' }}>
      <rect width={SVG_W} height={svgH} fill={CHART_BG} rx={6} />
      <XAxisLayer ticks={ticks} dMin={min} dMax={max} svgH={svgH} />

      {items.map((item, i) => {
        const cy   = T_MAR + i * ROW_H + ROW_H / 2
        const xEst = scaleX(item.estimate, min, max)
        const xLo  = Number.isFinite(item.ci25)  ? scaleX(item.ci25,  min, max) : xEst
        const xHi  = Number.isFinite(item.ci975) ? scaleX(item.ci975, min, max) : xEst
        const isH  = hover === i
        const hasCI = Number.isFinite(item.ci25) && Number.isFinite(item.ci975)

        return (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
            {/* Label */}
            <text x={L_MAR - 8} y={cy + 3.5}
              textAnchor="end" fontSize={10}
              fill={isH ? CHART_TEXT_ACTIVE : CHART_TEXT}
              style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
            >{trunc(item.label)}</text>

            {isH && <rect x={L_MAR} y={cy - ROW_H / 2 + 2} width={PLOT_W} height={ROW_H - 4}
              fill="white" opacity={0.04} rx={2} />}

            {/* CI line */}
            {hasCI && (
              <line x1={xLo} y1={cy} x2={xHi} y2={cy}
                stroke={item.color} strokeWidth={1.5}
                opacity={isH ? 0.9 : 0.65} />
            )}

            {/* CI whiskers */}
            {hasCI && <>
              <line x1={xLo} y1={cy - 5} x2={xLo} y2={cy + 5}
                stroke={item.color} strokeWidth={1} opacity={isH ? 0.9 : 0.55} />
              <line x1={xHi} y1={cy - 5} x2={xHi} y2={cy + 5}
                stroke={item.color} strokeWidth={1} opacity={isH ? 0.9 : 0.55} />
            </>}

            {/* Estimate dot */}
            <circle cx={xEst} cy={cy} r={DOT_R}
              fill={item.color} opacity={isH ? 1 : 0.85} />

            {/* Value label */}
            <text x={xHi + 6} y={cy + 3.5} fontSize={8.5}
              fill={item.color} opacity={isH ? 1 : 0.65}
              style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600 }}
            >{fmt(item.estimate)}</text>

            {isH && item.tooltipLines?.length && (
              <TooltipBox x={xEst + 10} y={cy - ROW_H / 2 + 2} lines={item.tooltipLines} />
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GROUPED VERTICAL BAR CHART — reliability, PLSpredict summaries
// ═══════════════════════════════════════════════════════════════════════════════

export interface GroupedBarGroup {
  label: string
  bars: { value: number; color: string; legendLabel: string }[]
}

export function GroupedBarChart({
  groups,
  domain,
  refLines = [],
}: {
  groups: GroupedBarGroup[]
  domain?: [number, number]
  refLines?: RefLine[]
}) {
  const [hover, setHover] = useState<string | null>(null) // `${gi}-${bi}`

  if (!groups.length) return null

  const barsPerGroup = Math.max(...groups.map(g => g.bars.length))
  const legends = groups[0]?.bars.map(b => ({ label: b.legendLabel, color: b.color })) ?? []

  // Compute dynamic domain if not provided
  const allVals = groups.flatMap(g => g.bars.map(b => b.value)).filter(Number.isFinite)
  const dynamicMin = domain?.[0] ?? Math.min(0, ...allVals)
  const dynamicMax = domain?.[1] ?? Math.max(1, ...allVals)

  // Compute a wider SVG if many groups
  const minGroupW = 52
  const groupsW   = Math.max(SVG_W - 60, groups.length * minGroupW * barsPerGroup + 60)

  const GML  = 44   // left margin (y-axis)
  const GMR  = 24   // right margin
  const GMT  = 36   // top margin (legends)
  const GMB  = 56   // bottom margin (x labels)
  const SVGH = 300
  const plotH = SVGH - GMT - GMB
  const plotW  = groupsW - GML - GMR

  const { min: yMin, max: yMax, ticks: yTicks } = niceTicks(dynamicMin, dynamicMax, 5)

  const yOf = (v: number) => GMT + plotH - ((v - yMin) / (yMax - yMin)) * plotH

  const groupW   = plotW / groups.length
  const barGap   = 2
  const groupPad = groupW * 0.15
  const barW     = Math.max(4, (groupW - 2 * groupPad - barGap * (barsPerGroup - 1)) / barsPerGroup)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={groupsW} height={SVGH} style={{ display: 'block', userSelect: 'none' }}>
        <rect width={groupsW} height={SVGH} fill={CHART_BG} rx={6} />

        {/* Y-axis grid lines */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={GML} y1={yOf(t)} x2={GML + plotW} y2={yOf(t)}
              stroke={CHART_GRID} strokeWidth={t === 0 ? 1 : 0.5}
              strokeDasharray={t === 0 ? undefined : '2 4'} />
            <text x={GML - 6} y={yOf(t) + 3.5} textAnchor="end" fontSize={9}
              fill={CHART_MUTED}
              style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
            >{t % 1 === 0 ? t : t.toFixed(2)}</text>
          </g>
        ))}

        {/* Reference lines */}
        {refLines.map((r, i) => (
          <g key={`ref-${i}`}>
            <line x1={GML} y1={yOf(r.value)} x2={GML + plotW} y2={yOf(r.value)}
              stroke={r.color ?? C_WARN} strokeWidth={1}
              strokeDasharray={r.dash ?? '4 3'} opacity={0.7} />
            {r.label && (
              <text x={GML + plotW + 3} y={yOf(r.value) + 3.5} fontSize={8.5}
                fill={r.color ?? C_WARN} opacity={0.85}
                style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
              >{r.label}</text>
            )}
          </g>
        ))}

        {/* Bars */}
        {groups.map((group, gi) => {
          const groupX = GML + gi * groupW + groupPad
          return (
            <g key={gi}>
              {group.bars.map((bar, bi) => {
                const bx     = groupX + bi * (barW + barGap)
                const by     = yOf(Math.max(yMin, bar.value))
                const bh     = Math.max(1, yOf(yMin) - by)
                const hKey   = `${gi}-${bi}`
                const isH    = hover === hKey

                return (
                  <g key={bi}
                    onMouseEnter={() => setHover(hKey)}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: 'default' }}>
                    <rect x={bx} y={by} width={barW} height={bh}
                      fill={bar.color} opacity={isH ? 1 : 0.78} rx={2}>
                      <animate attributeName="height" from="0" to={bh}
                        dur="0.45s" calcMode="spline" keySplines="0.4 0 0.2 1" fill="freeze" />
                      <animate attributeName="y" from={yOf(yMin)} to={by}
                        dur="0.45s" calcMode="spline" keySplines="0.4 0 0.2 1" fill="freeze" />
                    </rect>

                    {isH && Number.isFinite(bar.value) && (
                      <text x={bx + barW / 2} y={by - 3} textAnchor="middle" fontSize={8.5}
                        fill={bar.color}
                        style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600 }}
                      >{bar.value.toFixed(3)}</text>
                    )}
                  </g>
                )
              })}

              {/* Group label */}
              <text x={groupX + (group.bars.length * (barW + barGap) - barGap) / 2}
                y={SVGH - GMB + 14} textAnchor="middle" fontSize={9.5}
                fill={CHART_TEXT}
                style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
              >{trunc(group.label, 14)}</text>
            </g>
          )
        })}

        {/* Y-axis baseline */}
        <line x1={GML} y1={GMT} x2={GML} y2={GMT + plotH}
          stroke={CHART_GRID} strokeWidth={0.5} />
        <line x1={GML} y1={GMT + plotH} x2={GML + plotW} y2={GMT + plotH}
          stroke={CHART_GRID} strokeWidth={0.5} />

        {/* Legend row */}
        {legends.slice(0, 6).map((leg, i) => (
          <g key={i} transform={`translate(${GML + i * 90}, 8)`}>
            <rect x={0} y={0} width={9} height={9} rx={1.5} fill={leg.color} opacity={0.85} />
            <text x={13} y={8} fontSize={9} fill={CHART_TEXT}
              style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
            >{leg.label}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DATA BUILDERS — convert parsed result rows → chart-ready items
// ═══════════════════════════════════════════════════════════════════════════════

function pStatus(p: unknown): 'pass' | 'neutral' | 'fail' {
  return getPValueTone(parseSignificancePValue(p)) ?? 'neutral'
}

function pColor(status: 'pass' | 'neutral' | 'fail'): string {
  return status === 'pass' ? C_PASS : status === 'neutral' ? C_WARN : C_FAIL
}

// ─── Raw R field extractors (handle all field name variants from seminr) ──────

function rawLabel(r: any): string {
  return String(
    r.path ?? r.effect ?? r.relationship ?? r.row ?? r.row_name ?? r.rowName ?? r._row ?? ''
  ).trim()
}

function rawMetric(r: any, candidates: string[]): any {
  const normalize = (key: string) => String(key ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  const wanted = new Set(candidates.map(normalize))
  for (const [key, value] of Object.entries(r ?? {})) {
    if (wanted.has(normalize(key))) return value
  }
  return undefined
}

function rawEstimate(r: any): number {
  return Number(rawMetric(r, ['coefficient', 'coef', 'Original Est.', 'Original.Est.', 'Original Estimate', 'original_estimate', 'Bootstrap Mean', 'Bootstrap.Mean', 'estimate']) ?? NaN)
}

function rawCI25(r: any): number {
  return Number(rawMetric(r, ['ci25', '2.5% CI', '2.5%.CI', 'X2.5..CI', 'CI 2.5%', 'ci_25', 'lower']) ?? NaN)
}

function rawCI975(r: any): number {
  return Number(rawMetric(r, ['ci975', '97.5% CI', '97.5%.CI', 'X97.5..CI', 'CI 97.5%', 'ci_975', 'upper']) ?? NaN)
}

function rawPValue(r: any): string {
  const v = rawMetric(r, ['pValue', 'p_value', 'P Value', 'P.Value', 'Bootstrap P Val', 'Bootstrap.P.Val', 'Bootstrap P Value', 'bootstrap_p_value']) ?? ''
  return String(v).trim()
}

function rawTStat(r: any): number {
  return Number(rawMetric(r, ['tStatistic', 't_statistic', 'T Stat.', 'T.Stat.', 'T Statistic', 'T Value', 't_value']) ?? NaN)
}

/** Path coefficient / effects rows → HBarItems. Handles both pre-parsed and raw R formats. */
export function buildPathCoefItems(rows: any[]): HBarItem[] {
  return rows.map(r => {
    const label   = rawLabel(r)
    const value   = rawEstimate(r)
    const tStat   = rawTStat(r)
    const pVal    = rawPValue(r)
    return {
      label,
      value,
      color: pColor(pStatus(pVal)),
      tooltipLines: [
        label,
        `Coefficient: ${Number.isFinite(value) ? value.toFixed(3) : '—'}`,
        `t-stat: ${Number.isFinite(tStat) ? tStat.toFixed(3) : '—'}`,
        `p-value: ${pVal || '—'}`,
      ],
    }
  })
}

/** Path coefficient / effects rows → ForestItems (Bootstrap CI). Handles raw R formats. */
export function buildForestItems(rows: any[]): ForestItem[] {
  return rows.map(r => {
    const label   = rawLabel(r)
    const est     = rawEstimate(r)
    const ci25    = rawCI25(r)
    const ci975   = rawCI975(r)
    const pVal    = rawPValue(r)
    return {
      label,
      estimate: est,
      ci25,
      ci975,
      color: pColor(pStatus(pVal)),
      tooltipLines: [
        label,
        `Estimate: ${Number.isFinite(est) ? est.toFixed(3) : '—'}`,
        `95% CI: [${Number.isFinite(ci25) ? ci25.toFixed(3) : '—'}, ${Number.isFinite(ci975) ? ci975.toFixed(3) : '—'}]`,
        `p-value: ${pVal || '—'}`,
      ],
    }
  })
}

/** R-square rows → HBarItems (paired R² + R²adj) */
export function buildRSquareItems(rows: any[]): HBarItem[] {
  return rows.map(r => ({
    label: String(r.construct ?? ''),
    value: Number(r.r2),
    secondValue: Number.isFinite(Number(r.r2Adjusted)) ? Number(r.r2Adjusted) : undefined,
    color: Number(r.r2) >= 0.5 ? C_PASS : Number(r.r2) >= 0.25 ? C_WARN : C_ACCENT,
    secondColor: C_ACCENT,
    tooltipLines: [
      String(r.construct ?? ''),
      `R²: ${Number(r.r2).toFixed(3)}`,
      `R² adj: ${Number.isFinite(Number(r.r2Adjusted)) ? Number(r.r2Adjusted).toFixed(3) : '—'}`,
      `Assessment: ${r.assessment ?? '—'}`,
    ],
  }))
}

/** Reliability rows → GroupedBarGroups */
export function buildReliabilityGroups(rows: any[]): GroupedBarGroup[] {
  return rows.map(r => {
    const α    = parseFloat(r.cronbach)
    const rhoA = parseFloat(r.rhoA)
    const rhoC = parseFloat(r.rhoCc)
    const ave  = parseFloat(r.ave)
    return {
      label: String(r.construct ?? ''),
      bars: [
        { value: α,    color: PALETTE[0], legendLabel: "Cronbach's α" },
        { value: rhoA, color: PALETTE[1], legendLabel: 'ρA (rhoA)' },
        { value: rhoC, color: PALETTE[2], legendLabel: 'ρC (rhoC)' },
        { value: ave,  color: PALETTE[3], legendLabel: 'AVE' },
      ],
    }
  })
}

/** Outer loading rows → HBarItems */
export function buildOuterLoadingItems(rows: any[]): HBarItem[] {
  // Assign a unique color per construct
  const constructs = Array.from(new Set(rows.map(r => String(r.construct ?? ''))))
  const colorMap = new Map(constructs.map((c, i) => [c, PALETTE[i % PALETTE.length]]))

  return rows.map(r => ({
    label: `${r.indicator} (${r.construct})`,
    value: Number(r.loading),
    color: colorMap.get(String(r.construct ?? '')) ?? C_ACCENT,
    tooltipLines: [
      `${r.indicator} → ${r.construct}`,
      `Loading: ${Number(r.loading).toFixed(3)}`,
      ...(Number.isFinite(r.tStatistic) ? [`t-stat: ${Number(r.tStatistic).toFixed(3)}`] : []),
      ...(r.pValue && r.pValue !== '—' ? [`p-value: ${r.pValue}`] : []),
    ],
  }))
}

/** VIF sections → HBarItems (inner + outer merged) */
export function buildVIFItems(sections: { inner: any[]; outer: any[] }): HBarItem[] {
  const all = [
    ...sections.inner.map(r => ({ ...r, _type: 'Inner' })),
    ...sections.outer.map(r => ({ ...r, _type: 'Outer' })),
  ]
  return all.map(r => ({
    label: `${r.predictor} → ${r.endogenous}`,
    value: Number(r.vif),
    color: Number(r.vif) < 5 ? C_PASS : C_FAIL,
    tooltipLines: [
      `${r._type}: ${r.predictor} → ${r.endogenous}`,
      `VIF: ${Number(r.vif).toFixed(3)}`,
      Number(r.vif) >= 5 ? '⚠ Exceeds threshold (5.0)' : '✓ Within threshold (5.0)',
    ],
  }))
}

function getPlsPredictLabel(isMV: boolean, row: any): string {
  const candidates = isMV
    ? [row.Indicator, row.indicator, row.Item, row.item, row.MV, row.mv, row.label, row.Label, row.row, row.row_name]
    : [row.Construct, row.construct, row.LV, row.lv, row.label, row.Label, row.row, row.row_name]

  return String(candidates.find((value) => typeof value === 'string' && value.trim()) ?? '').trim()
}

function normalizePlsPredictMetric(metric: string): string {
  const compact = metric.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (compact === 'q2predict' || compact === 'qpredict' || compact === 'q2') return 'Q²predict'
  if (compact === 'plssemrmse' || compact === 'plsrmse' || compact === 'rmsepls') return 'PLS RMSE'
  if (compact === 'plssemmae' || compact === 'plsmae' || compact === 'maepls') return 'PLS MAE'
  if (compact === 'lmrmse' || compact === 'rmselm') return 'LM RMSE'
  if (compact === 'lmmae' || compact === 'maelm') return 'LM MAE'
  return metric.replace(/_/g, ' ').trim()
}

/** PLSpredict MV or LV summary → GroupedBarGroups (metric × construct) */
export function buildPlsPredictSummaryItems(
  mvRows: any[],
  lvRows: any[],
  isMV: boolean,
  options: { variant?: 'all' | 'comparison' | 'q2' } = {},
): GroupedBarGroup[] {
  const rows = isMV ? mvRows : lvRows
  if (!rows.length) return []

  const variant = options.variant ?? 'all'
  const comparisonMetrics = new Set(['PLS RMSE', 'PLS MAE', 'LM RMSE', 'LM MAE'])
  const shouldIncludeMetric = (metric: string) => {
    if (variant === 'comparison') return comparisonMetrics.has(metric)
    if (variant === 'q2') return metric === 'Q²predict'
    return true
  }

  type MetricMap = Map<string, { value: number; metric: string }[]>
  const grouped: MetricMap = new Map()
  const metrics: string[] = []
  const reservedKeys = new Set(['indicator', 'construct', 'row', 'row_name', 'metric', 'value', 'message'])

  rows.forEach((row: any) => {
    const label = getPlsPredictLabel(isMV, row)
    if (!label) return

    const longMetric = row.metric ?? row.Metric
    const longValue = row.value ?? row.Value ?? row.estimate
    const entries = longMetric != null && longValue != null
      ? [{ metric: normalizePlsPredictMetric(String(longMetric)), value: Number(longValue) }]
      : Object.entries(row)
          .map(([rawMetric, rawValue]) => {
            if (reservedKeys.has(rawMetric.toLowerCase())) return null
            const value = Number(rawValue)
            if (!Number.isFinite(value)) return null
            return {
              metric: normalizePlsPredictMetric(rawMetric),
              value,
            }
          })
          .filter((entry): entry is { metric: string; value: number } => entry !== null)

    entries.forEach(({ metric, value }) => {
      if (!shouldIncludeMetric(metric) || !Number.isFinite(value)) return
      if (!grouped.has(label)) grouped.set(label, [])
      grouped.get(label)!.push({ value, metric })
      if (!metrics.includes(metric)) metrics.push(metric)
    })
  })

  return Array.from(grouped.entries()).map(([label, bars]) => ({
    label,
    bars: metrics.map((metric, i) => {
      const match = bars.find((bar) => bar.metric === metric)
      return {
        value: match?.value ?? 0,
        color: PALETTE[i % PALETTE.length],
        legendLabel: metric,
      }
    }),
  }))
}

/** Prediction error rows → HBarItems (error per indicator/construct) */
export function buildPredictionErrorItems(rows: any[]): HBarItem[] {
  return rows.map((r: any, i: number) => {
    const label = String(r.Indicator ?? r.indicator ?? r.Construct ?? r.construct ?? r.row ?? r.row_name ?? `Item ${i + 1}`)
    const value = Number(r.Error ?? r.error ?? r.MAE ?? r.mae ?? r.RMSE ?? r.rmse ?? NaN)
    return {
      label,
      value,
      color: PALETTE[i % PALETTE.length],
      tooltipLines: [label, `Error: ${Number.isFinite(value) ? value.toFixed(4) : '—'}`],
    }
  }).filter(item => Number.isFinite(item.value))
}

/** Generic rows → HBarItems for f-square, model-selection, etc. */
export function buildGenericBarItems(rawRows: any[]): HBarItem[] {
  if (!rawRows?.length) return []

  // Find the first numeric column as the value
  const sampleRow = rawRows[0] ?? {}
  const numericKeys = Object.keys(sampleRow).filter(k => {
    const v = sampleRow[k]
    if (['row', 'row_name', 'rowname'].includes(k.toLowerCase())) return false
    return Number.isFinite(Number(v))
  })

  const valueKey = numericKeys[0]
  if (!valueKey) return []

  const rowKey = Object.keys(sampleRow).find(k => ['row', 'row_name', 'rowname', '_row'].includes(k.toLowerCase())) ?? 'row'

  return rawRows.map((r, i) => ({
    label: String(r[rowKey] ?? r.row ?? r.label ?? `Item ${i + 1}`),
    value: Number(r[valueKey]),
    color: PALETTE[i % PALETTE.length],
    tooltipLines: [`${r[rowKey] ?? `Item ${i + 1}`}: ${Number(r[valueKey]).toFixed(3)}`],
  }))
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RESULT CHART — main dispatcher component
// ═══════════════════════════════════════════════════════════════════════════════

export interface ResultChartProps {
  selectedPanel: string
  analysisMode: AnalysisMode
  pathRows?: any[]
  rSquareRows?: any[]
  reliRows?: any[]
  loadingRows?: any[]
  weightRows?: any[]
  bootLoadingRows?: any[]
  bootWeightRows?: any[]
  vifSections?: { inner: any[]; outer: any[] }
  modelFitRows?: any[]
  analysisResults?: any
}

// ─── Data path lookup (mirrors PANEL_DATA_PATHS in ResultsView) ──────────────
const CHART_DATA_PATHS: Record<string, Record<string, string>> = {
  'pls-sem': {
    'path-coef':         'final_results.path_coefficients',
    'total-indirect':    'final_results.total_indirect_effects',
    'specific-indirect': 'final_results.specific_indirect_effects',
    'total-effects':     'final_results.total_effects',
    'outer-loadings':    'final_results.outer_loadings',
    'outer-weights':     'final_results.outer_weights',
  },
  bootstrap: {
    'path-coef':         'final_results.path_coefficients',
    'total-indirect':    'final_results.total_indirect_effects',
    'specific-indirect': 'final_results.specific_indirect_effects',
    'total-effects':     'final_results.total_effects',
    'outer-loadings':    'final_results.outer_loadings',
    'outer-weights':     'final_results.outer_weights',
  },
  plspredict: {
    'plspredict-mv-summary':  'final_results.plspredict_mv_summary',
    'plspredict-lv-summary':  'final_results.plspredict_lv_summary',
    'pls-lm-comparison':      'final_results.plspredict_mv_summary',
    'q2-predict':             'final_results.plspredict_mv_summary',
    'mv-predictions-errors':  'final_results.mv_predictions_and_errors',
    'lv-predictions-errors':  'final_results.lv_predictions_and_errors',
    'plsem-mv-error-hist':    'final_results.mv_predictions_and_errors',
    'plsem-lv-error-hist':    'final_results.lv_predictions_and_errors',
  },
  advanced: {
    'path-coef': 'final_results.path_coefficients',
    'priority-map': 'final_results.priority_map',
    'necessity-check': 'final_results.necessity_check',
    'ceiling-lines': 'final_results.ceiling_lines',
    'cipma-priorities': 'final_results.cipma_priorities',
    'bottleneck-table': 'final_results.bottleneck_table',
  },
}

function getByPath(obj: any, path: string): any[] {
  if (!obj || !path) return []
  const result = path.split('.').reduce((acc: any, key: string) => acc?.[key] ?? null, obj)
  return Array.isArray(result) ? result : []
}

function unwrapAnalysisResults(analysisResults: any): any {
  if (
    analysisResults &&
    typeof analysisResults === 'object' &&
    !Array.isArray(analysisResults) &&
    analysisResults.results &&
    typeof analysisResults.results === 'object'
  ) {
    return analysisResults.results
  }
  return analysisResults
}

interface PriorityMapItem {
  label: string
  importance: number
  performance: number
  priority: string
  necessary: boolean
  target?: string
}

type PriorityMapVariant = 'priority' | 'cipma'

interface CeilingPoint {
  x: number
  y: number
}

interface CeilingSeries {
  condition: string
  target: string
  observed: CeilingPoint[]
  ceFdh: CeilingPoint[]
  crFdh: CeilingPoint[]
}

const CEILING_AXIS_TICKS = [0, 25, 50, 75, 100]

function buildPriorityMapItems(rows: any[]): PriorityMapItem[] {
  return rows
    .map((row, index) => ({
      label: String(row?.Construct ?? row?.construct ?? row?.name ?? `Item ${index + 1}`),
      importance: Number(row?.Importance ?? row?.importance),
      performance: Number(row?.Performance ?? row?.performance),
      priority: String(row?.Priority ?? row?.priority ?? ''),
      necessary: Boolean(row?.Necessary ?? row?.necessary),
      target: String(row?.Target ?? row?.target ?? row?.Outcome ?? row?.outcome ?? '').trim() || undefined,
    }))
    .filter((item) => item.label && Number.isFinite(item.importance) && Number.isFinite(item.performance))
}

function buildNecessityItems(rows: any[]): HBarItem[] {
  return rows
    .map((row: any): HBarItem | null => {
      const baseLabel = String(row?.Condition ?? row?.condition ?? row?.Construct ?? row?.construct ?? row?.row ?? row?.row_name ?? '').trim()
      const method = String(row?.Method ?? row?.method ?? '').trim()
      const label = method ? `${baseLabel} (${method})` : baseLabel
      const value = Number(row?.D ?? row?.d ?? row?.Effect_Size ?? row?.effect_size)
      const pValue = row?.P_Value ?? row?.p_value ?? row?.pValue ?? row?.p
      const necessary = Boolean(row?.Necessary ?? row?.necessary)
      const status = String(row?.Status ?? row?.status ?? (necessary ? 'necessary' : 'not necessary')).replace(/_/g, ' ')
      if (!baseLabel || !Number.isFinite(value)) return null
      return {
        label,
        value,
        color: necessary ? C_PASS : value >= 0.1 ? C_WARN : C_FAIL,
        tooltipLines: [
          label,
          `D: ${value.toFixed(3)}`,
          `p-value: ${pValue == null || String(pValue).trim() === '' ? '—' : String(pValue)}`,
          status,
        ],
      }
    })
    .filter((item): item is HBarItem => item !== null)
}

function buildCeilingSeries(rows: any[]): CeilingSeries[] {
  const groups = new Map<string, CeilingSeries>()

  rows.forEach((row) => {
    const condition = String(row?.Condition ?? row?.condition ?? row?.Construct ?? row?.construct ?? '').trim()
    const target = String(row?.Target ?? row?.target ?? '').trim()
    const series = String(row?.Series ?? row?.series ?? row?.Method ?? row?.method ?? row?.Ceiling ?? row?.ceiling ?? '').trim().toLowerCase()
    const x = Number(row?.X ?? row?.x ?? row?.condition_score ?? row?.Condition_Score ?? row?.conditionValue ?? row?.condition_value)
    const y = Number(row?.Y ?? row?.y ?? row?.target_score ?? row?.Target_Score ?? row?.targetValue ?? row?.target_value)
    if (!condition || !Number.isFinite(x) || !Number.isFinite(y)) return

    const key = `${condition}→${target}`
    const group = groups.get(key) ?? {
      condition,
      target,
      observed: [],
      ceFdh: [],
      crFdh: [],
    }
    if (series.includes('observed') || series === 'point') {
      group.observed.push({ x, y })
    } else if (series.includes('cr')) {
      group.crFdh.push({ x, y })
    } else if (series.includes('ce')) {
      group.ceFdh.push({ x, y })
    }
    groups.set(key, group)
  })

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      observed: group.observed.sort((a, b) => a.x - b.x),
      ceFdh: group.ceFdh.sort((a, b) => a.x - b.x),
      crFdh: group.crFdh.sort((a, b) => a.x - b.x),
    }))
    .filter((group) => group.observed.length || group.ceFdh.length || group.crFdh.length)
}

function getPriorityMapColor(priority: string): string {
  const normalized = String(priority ?? '').trim().toLowerCase()
  if (normalized.includes('high') || normalized.includes('important') || normalized.includes('keep up') || normalized.includes('true')) return C_PRIORITY_HIGH
  if (normalized.includes('moderate') || normalized.includes('medium')) return C_PRIORITY_MODERATE
  if (normalized.includes('low') || normalized.includes('false') || normalized.includes('weak') || normalized.includes('concentrate') || normalized.includes('must improve')) return C_PRIORITY_LOW
  if (normalized.includes('inverse') || normalized.includes('low level')) return CHART_MUTED
  if (normalized.includes('overkill')) return C_PRIORITY_MODERATE
  return C_PRIORITY_MODERATE
}

function straightLinePath(points: CeilingPoint[], xOf: (value: number) => number, yOf: (value: number) => number) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xOf(point.x).toFixed(1)} ${yOf(point.y).toFixed(1)}`).join(' ')
}

function stepLinePath(points: CeilingPoint[], xOf: (value: number) => number, yOf: (value: number) => number) {
  if (!points.length) return ''
  const [first, ...rest] = points
  let path = `M ${xOf(first.x).toFixed(1)} ${yOf(first.y).toFixed(1)}`
  let previous = first
  rest.forEach((point) => {
    path += ` L ${xOf(point.x).toFixed(1)} ${yOf(previous.y).toFixed(1)} L ${xOf(point.x).toFixed(1)} ${yOf(point.y).toFixed(1)}`
    previous = point
  })
  return path
}

function PriorityMapChart({ items, variant = 'priority' }: { items: PriorityMapItem[], variant?: PriorityMapVariant }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!items.length) return null

  const width = 640
  const height = 330
  const margin = { left: 70, right: 28, top: 30, bottom: 46 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const importanceMean = items.reduce((sum, item) => sum + item.importance, 0) / items.length
  const performanceMean = items.reduce((sum, item) => sum + item.performance, 0) / items.length
  const minImportance = 0
  const maxImportance = niceTicks(0, Math.max(0.6, ...items.map((item) => item.importance * 1.12), importanceMean * 1.12), 4).max
  const minPerformance = 0
  const maxPerformance = 100
  const xTicks = niceTicks(minImportance, maxImportance, 4).ticks.filter((tick) => tick >= minImportance && tick <= maxImportance)
  const yTicks = [0, 25, 50, 75, 100]
  const xOf = (value: number) => margin.left + ((value - minImportance) / Math.max(maxImportance - minImportance, 0.0001)) * plotWidth
  const yOf = (value: number) => margin.top + plotHeight - ((value - minPerformance) / Math.max(maxPerformance - minPerformance, 0.0001)) * plotHeight
  const targetLabel = items.find((item) => item.target)?.target || 'target construct'
  const axisTargetLabel = trunc(targetLabel, 34)
  const meanX = xOf(importanceMean)
  const meanY = yOf(Math.max(0, Math.min(100, performanceMean)))

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block', userSelect: 'none' }}>
      <rect width={width} height={height} fill={CHART_BG} rx={6} />
      <rect
        x={margin.left}
        y={margin.top}
        width={plotWidth}
        height={plotHeight}
        fill="transparent"
        stroke={CHART_GRID}
        strokeWidth={1.2}
      />
      {xTicks.map((tick) => (
        <g key={`x-${tick}`}>
          <line x1={xOf(tick)} y1={margin.top} x2={xOf(tick)} y2={margin.top + plotHeight} stroke={CHART_GRID} strokeWidth={0.8} opacity={0.55} />
          <text x={xOf(tick)} y={height - 20} textAnchor="middle" fontSize={10} fill={CHART_MUTED} style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            {tick === 0 ? '0' : tick.toFixed(maxImportance <= 1 ? 2 : 1)}
          </text>
        </g>
      ))}
      {yTicks.map((tick) => (
        <g key={`y-${tick}`}>
          <line x1={margin.left} y1={yOf(tick)} x2={margin.left + plotWidth} y2={yOf(tick)} stroke={CHART_GRID} strokeWidth={0.8} opacity={0.55} />
          <text x={margin.left - 10} y={yOf(tick) + 3} textAnchor="end" fontSize={10} fill={CHART_MUTED} style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            {tick}
          </text>
        </g>
      ))}
      <line x1={meanX} y1={margin.top} x2={meanX} y2={margin.top + plotHeight} stroke={CHART_TEXT} strokeWidth={1.1} strokeDasharray="5 5" opacity={0.85} />
      <line x1={margin.left} y1={meanY} x2={margin.left + plotWidth} y2={meanY} stroke={CHART_TEXT} strokeWidth={1.1} strokeDasharray="5 5" opacity={0.85} />
      <text x={Math.min(meanX + 8, margin.left + plotWidth - 110)} y={margin.top + 12} fontSize={10.5} fill={CHART_TEXT} style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600 }}>
        median importance
      </text>
      <text x={margin.left + 8} y={meanY - 8} fontSize={10.5} fill={CHART_TEXT} style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600 }}>
        median performance
      </text>
      <text x={margin.left + plotWidth / 2} y={height - 5} textAnchor="middle" fontSize={11} fill={CHART_TEXT} style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600 }}>
        Importance: absolute total effect on {axisTargetLabel}
      </text>
      <text x={18} y={margin.top + plotHeight / 2} textAnchor="middle" transform={`rotate(-90, 18, ${margin.top + plotHeight / 2})`} fontSize={11} fill={CHART_TEXT} style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600 }}>
        Performance (0-100)
      </text>
      {items.map((item, index) => {
        const cx = xOf(item.importance)
        const cy = yOf(Math.max(0, Math.min(100, item.performance)))
        const color = getPriorityMapColor(item.priority)
        const isCipma = variant === 'cipma'
        const isHovered = hover === index
        const labelX = cx > margin.left + plotWidth - 96 ? cx - 12 : cx + 12
        const textAnchor = cx > margin.left + plotWidth - 96 ? 'end' : 'start'
        return (
          <g key={`${item.label}-${index}`} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
            {!isCipma && item.necessary && (
              <circle cx={cx} cy={cy} r={isHovered ? 11 : 9} fill="none" stroke={C_WARN} strokeWidth={1.2} strokeDasharray="3 2" opacity={0.6} />
            )}
            {isCipma ? (
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? 6 : 5}
                fill={item.necessary ? CIPMA_NECESSARY_COLOR : 'none'}
                stroke={item.necessary ? CIPMA_NECESSARY_COLOR : CIPMA_SUFFICIENT_COLOR}
                strokeWidth={item.necessary ? 1.2 : 1.6}
                opacity={0.95}
              />
            ) : (
              <circle cx={cx} cy={cy} r={isHovered ? 7 : 6} fill={color} stroke={CHART_BG} strokeWidth={1.2} opacity={0.96} />
            )}
            <text x={labelX} y={cy + 4} textAnchor={textAnchor} fontSize={10.5} fill={CHART_TEXT_ACTIVE} style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 650 }}>
              {item.label}
            </text>
            {isHovered && (
              <TooltipBox
                x={Math.min(cx + 10, width - 210)}
                y={Math.max(cy - 40, margin.top + 4)}
                lines={[
                  `${item.label}`,
                  `Importance: ${item.importance.toFixed(3)}`,
                  `Performance: ${item.performance.toFixed(1)}`,
                  item.priority || 'Priority not classified',
                ]}
                svgWidth={width}
              />
            )}
          </g>
        )
      })}
      {variant === 'cipma' && (
        <g>
          <circle cx={width - 178} cy={margin.top + 8} r={4.5} fill={CIPMA_NECESSARY_COLOR} stroke={CIPMA_NECESSARY_COLOR} strokeWidth={1.2} />
          <text x={width - 168} y={margin.top + 11} fontSize={9} fill={CHART_MUTED} style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Necessary + sufficient</text>
          <circle cx={width - 178} cy={margin.top + 24} r={4.5} fill="none" stroke={CIPMA_SUFFICIENT_COLOR} strokeWidth={1.6} />
          <text x={width - 168} y={margin.top + 27} fontSize={9} fill={CHART_MUTED} style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Sufficient only</text>
        </g>
      )}
    </svg>
  )
}

const CEILING_SERIES_STYLES = {
  observed: {
    fill: 'rgb(var(--color-accent-rgb) / 0.52)',
    stroke: 'var(--color-elevated)',
  },
  ceFdh: {
    color: C_ACCENT,
    stroke: 'var(--color-elevated)',
  },
  crFdh: {
    color: C_SUCCESS,
    stroke: 'var(--color-elevated)',
  },
}

function normalizeCeilingValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return 50
  if (Math.abs(max - min) < 0.000001) return 50
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
}

function normalizeCeilingGroup(group: CeilingSeries): CeilingSeries {
  const allPoints = [...group.observed, ...group.ceFdh, ...group.crFdh]
  const xValues = allPoints.map((point) => point.x).filter(Number.isFinite)
  const yValues = allPoints.map((point) => point.y).filter(Number.isFinite)
  const xMin = Math.min(...xValues)
  const xMax = Math.max(...xValues)
  const yMin = Math.min(...yValues)
  const yMax = Math.max(...yValues)
  const normalizePoint = (point: CeilingPoint) => ({
    x: normalizeCeilingValue(point.x, xMin, xMax),
    y: normalizeCeilingValue(point.y, yMin, yMax),
  })

  return {
    ...group,
    observed: group.observed.map(normalizePoint),
    ceFdh: group.ceFdh.map(normalizePoint),
    crFdh: group.crFdh.map(normalizePoint),
  }
}

function formatCeilingAxisTick(value: number, suffix = false): string {
  return `${Math.round(value)}${suffix ? '%' : ''}`
}

function CeilingLinesChart({ groups }: { groups: CeilingSeries[] }) {
  if (!groups.length) return null

  const width = 640
  const height = 300
  const margin = { left: 56, right: 48, top: 28, bottom: 42 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const displayGroup = normalizeCeilingGroup(group)
        const xOf = (value: number) => margin.left + (value / 100) * plotWidth
        const yOf = (value: number) => margin.top + plotHeight - (value / 100) * plotHeight
        const conditionLabel = trunc(group.condition, 34)
        const targetLabel = trunc(group.target || 'Outcome', 24)
        return (
          <svg key={`${group.condition}-${group.target}`} viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block', userSelect: 'none' }}>
            <rect width={width} height={height} fill={CHART_BG} rx={6} />
            <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} fill="transparent" stroke={CHART_GRID} strokeWidth={1.2} />
            <g>
              <text x={margin.left + 10} y={18} fontSize={10.5} fill={CEILING_SERIES_STYLES.ceFdh.color} style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 700 }}>
                CE-FDH ceiling
              </text>
              <line x1={margin.left + 116} y1={15} x2={margin.left + 158} y2={15} stroke={CEILING_SERIES_STYLES.ceFdh.color} strokeWidth={2.6} />
              <text x={margin.left + 180} y={18} fontSize={10.5} fill={CEILING_SERIES_STYLES.crFdh.color} style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 700 }}>
                CR-FDH
              </text>
              <line x1={margin.left + 235} y1={15} x2={margin.left + 277} y2={15} stroke={CEILING_SERIES_STYLES.crFdh.color} strokeWidth={2.4} strokeDasharray="6 4" />
            </g>
            {CEILING_AXIS_TICKS.map((tick) => (
              <g key={`x-${tick}`}>
                <line x1={xOf(tick)} y1={margin.top} x2={xOf(tick)} y2={margin.top + plotHeight} stroke={CHART_GRID} strokeWidth={0.8} opacity={0.55} />
                <text x={xOf(tick)} y={height - 18} textAnchor="middle" fontSize={10} fill={CHART_MUTED} style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                  {formatCeilingAxisTick(tick)}
                </text>
              </g>
            ))}
            {CEILING_AXIS_TICKS.map((tick) => (
              <g key={`y-${tick}`}>
                <line x1={margin.left} y1={yOf(tick)} x2={margin.left + plotWidth} y2={yOf(tick)} stroke={CHART_GRID} strokeWidth={0.8} opacity={0.55} />
                <text x={margin.left + plotWidth + 9} y={yOf(tick) + 3} textAnchor="start" fontSize={10} fill={CHART_MUTED} style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                  {formatCeilingAxisTick(tick, true)}
                </text>
              </g>
            ))}
            {displayGroup.observed.map((point, index) => (
              <circle
                key={`obs-${index}`}
                cx={xOf(point.x)}
                cy={yOf(point.y)}
                r={2.8}
                fill={CEILING_SERIES_STYLES.observed.fill}
                stroke={CEILING_SERIES_STYLES.observed.stroke}
                strokeWidth={0.8}
                opacity={0.86}
              />
            ))}
            {displayGroup.ceFdh.length > 1 ? (
              <path d={stepLinePath(displayGroup.ceFdh, xOf, yOf)} fill="none" stroke={CEILING_SERIES_STYLES.ceFdh.color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
            ) : null}
            {displayGroup.ceFdh.map((point, index) => (
              <circle
                key={`ce-${index}`}
                cx={xOf(point.x)}
                cy={yOf(point.y)}
                r={4}
                fill={CEILING_SERIES_STYLES.ceFdh.color}
                stroke={CEILING_SERIES_STYLES.ceFdh.stroke}
                strokeWidth={1.5}
              />
            ))}
            {displayGroup.crFdh.length > 1 ? (
              <path d={straightLinePath(displayGroup.crFdh, xOf, yOf)} fill="none" stroke={CEILING_SERIES_STYLES.crFdh.color} strokeWidth={2.4} strokeDasharray="6 4" strokeLinecap="round" />
            ) : null}
            {displayGroup.crFdh.map((point, index) => {
              const cx = xOf(point.x)
              const cy = yOf(point.y)
              return (
                <rect
                  key={`cr-${index}`}
                  x={cx - 3.4}
                  y={cy - 3.4}
                  width={6.8}
                  height={6.8}
                  rx={1.1}
                  fill={CEILING_SERIES_STYLES.crFdh.color}
                  stroke={CEILING_SERIES_STYLES.crFdh.stroke}
                  strokeWidth={1.5}
                  transform={`rotate(45 ${cx} ${cy})`}
                />
              )
            })}
            <text x={margin.left + plotWidth / 2} y={height - 4} textAnchor="middle" fontSize={10.5} fill={CHART_TEXT} style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600 }}>
              {conditionLabel} range (0-100)
            </text>
            <text x={16} y={margin.top + plotHeight / 2} textAnchor="middle" transform={`rotate(-90, 16, ${margin.top + plotHeight / 2})`} fontSize={10.5} fill={CHART_TEXT} style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600 }}>
              {targetLabel} range (0-100)
            </text>
          </svg>
        )
      })}
    </div>
  )
}

interface DotPlotItem {
  label: string
  value: number
  color: string
  tooltipLines?: string[]
}

interface HeatmapMatrix {
  rowLabels: string[]
  colLabels: string[]
  values: Array<Array<number | null>>
  valueLabels?: string[][]
  legendLabel: string
  xAxisLabel?: string
  yAxisLabel?: string
  missingLabel?: string
}

interface ScorecardItem {
  label: string
  value: string
  meta?: string
  tone?: string
}

function getChartTitle(selectedPanel: string): string {
  const titles: Record<string, string> = {
    'path-coef': 'Path Coefficients',
    'total-effects': 'Total Effects',
    'total-indirect': 'Total Indirect Effects',
    'specific-indirect': 'Specific Indirect Effects',
    'r-square': 'R-Square',
    'reliability': 'Construct Reliability & Validity',
    'outer-loadings': 'Outer Loadings',
    'outer-weights': 'Outer Weights',
    'vif': 'Collinearity (VIF)',
    'f-square': 'Effect Size (f²)',
    'cross-loadings': 'Cross-Loadings Heatmap',
    'discriminant': 'Discriminant Validity Heatmap',
    'htmt-confidence-intervals': 'HTMT Confidence Heatmap',
    'plspredict-mv-summary': 'PLSpredict MV Summary',
    'plspredict-lv-summary': 'PLSpredict LV Summary',
    'pls-lm-comparison': 'PLS vs LM Comparison',
    'q2-predict': 'Q²predict',
    'mv-predictions-errors': 'MV Prediction Errors',
    'lv-predictions-errors': 'LV Prediction Errors',
    'plsem-mv-error-hist': 'Histogram of MV Prediction Errors',
    'plsem-lv-error-hist': 'Histogram of LV Prediction Errors',
    'priority-map': 'Priority Map',
    'necessity-check': 'NCA Necessity Effects',
    'ceiling-lines': 'NCA Ceiling Lines',
    'cipma-priorities': 'cIPMA Priorities',
    'bottleneck-table': 'NCA Bottleneck Heatmap',
    'model-fit': 'Model Fit Snapshot',
  }
  return titles[selectedPanel] ?? 'Results Chart'
}

function buildDotPlotItems(rows: Array<Record<string, unknown>>): DotPlotItem[] {
  return extractQ2PredictRows(rows).map((row) => ({
    label: row.label,
    value: row.q2Predict,
    color: row.q2Predict >= 0 ? C_PASS : C_FAIL,
    tooltipLines: [
      row.label,
      `Q²predict: ${row.q2Predict.toFixed(3)}`,
      row.q2Predict >= 0 ? 'Predictive relevance above zero' : 'Predictive relevance below zero',
    ],
  }))
}

function buildHistogramValues(rows: Array<Record<string, unknown>>): number[] {
  return rows.flatMap((row) => {
    const direct = Number(row.Error ?? row.error)
    if (Number.isFinite(direct)) return [direct]

    return Object.entries(row)
      .filter(([key]) => !/^(case|index|indicator|construct|prediction|predicted|row|row_name)$/i.test(key))
      .map(([, value]) => Number(value))
      .filter((value) => Number.isFinite(value))
  })
}

function buildMatrixFromRows(rows: any[], preferredMethod?: RegExp): HeatmapMatrix | null {
  if (!rows.length) return null

  const filteredRows = preferredMethod
    ? rows.filter((row) => preferredMethod.test(String(row?.method ?? row?.Method ?? '')))
    : rows

  const sourceRows = filteredRows.length ? filteredRows : rows
  const rowLabels = sourceRows
    .map((row) => String(row?.row ?? row?.row_name ?? row?.indicator ?? row?.Indicator ?? '').trim())
    .filter(Boolean)

  if (!rowLabels.length) return null

  const colLabels = Array.from(
    new Set(
      sourceRows.flatMap((row) =>
        Object.keys(row ?? {}).filter((key) => ![
          'row',
          'row_name',
          'rowname',
          'indicator',
          'Indicator',
          'method',
          'Method',
        ].includes(key)),
      ),
    ),
  )

  if (!colLabels.length) return null

  const values = sourceRows.map((row) =>
    colLabels.map((key) => {
      const value = Number((row ?? {})[key])
      return Number.isFinite(value) ? value : null
    }),
  )

  if (!values.some((row) => row.some((value) => value != null))) return null

  return {
    rowLabels,
    colLabels,
    values,
    legendLabel: preferredMethod?.source?.toLowerCase().includes('htmt') ? 'HTMT' : 'Loading',
  }
}

function buildCrossLoadingMatrix(rows: any[]): HeatmapMatrix | null {
  return buildMatrixFromRows(rows)
}

function buildDiscriminantMatrix(rows: any[]): HeatmapMatrix | null {
  return buildMatrixFromRows(rows, /htmt/i)
}

function buildHtmtConfidenceMatrix(rows: any[]): HeatmapMatrix | null {
  return buildMatrixFromRows(rows)
}

function bottleneckGroupRank(label: string): number {
  if (/ce[\s_-]*fdh/i.test(label)) return 0
  if (/cr[\s_-]*fdh/i.test(label)) return 1
  return 2
}

function groupBottleneckRows(rows: any[]): Array<{ method: string; rows: any[] }> {
  const normalizedRows = normalizeBottleneckRowsForDisplay(rows)
  const rowMethod = (row: any) => String(row?.Ceiling ?? row?.ceiling ?? row?.Method ?? row?.method ?? 'Bottleneck').trim() || 'Bottleneck'
  const groups = new Map<string, any[]>()

  normalizedRows.forEach((row) => {
    const method = rowMethod(row)
    const groupRows = groups.get(method) ?? []
    groupRows.push(row)
    groups.set(method, groupRows)
  })

  return Array.from(groups.entries())
    .sort(([a], [b]) => bottleneckGroupRank(a) - bottleneckGroupRank(b) || a.localeCompare(b))
    .map(([method, groupRows]) => ({ method, rows: groupRows }))
}

function buildBottleneckMatrixForGroup(sourceRows: any[], selectedMethod: string): HeatmapMatrix | null {
  if (!sourceRows.length) return null

  const levelLabelValue = (row: any, index: number) => {
    const key = Object.keys(row ?? {}).find((candidate) => isBottleneckOutcomeField(candidate))
    const label = key ? String(row?.[key] ?? '').trim() : ''
    return label || `Level ${index + 1}`
  }

  const colLabels = Array.from(
    new Set(
      sourceRows.flatMap((row) =>
        Object.keys(row ?? {}).filter((key) => {
          if (isBottleneckMetaField(key) || isBottleneckOutcomeField(key)) return false
          return sourceRows.some((candidate) => {
            const value = candidate?.[key]
            return Number.isFinite(Number(value)) || String(value ?? '').trim().toUpperCase() === 'NN'
          })
        }),
      ),
    ),
  )

  if (!colLabels.length) return null

  const levelLabels = sourceRows.map(levelLabelValue)
  const values = colLabels.map((key) =>
    sourceRows.map((row) => {
      const value = Number((row ?? {})[key])
      return Number.isFinite(value) ? value : null
    }),
  )
  const valueLabels = colLabels.map((key) =>
    sourceRows.map((row) => formatBottleneckDisplayValue((row ?? {})[key])),
  )

  if (!values.some((row) => row.some((value) => value != null)) && !valueLabels.some((row) => row.some((value) => value === 'NN'))) return null

  return {
    rowLabels: colLabels,
    colLabels: levelLabels,
    values,
    valueLabels,
    legendLabel: `${selectedMethod} required level`,
    xAxisLabel: 'Outcome level (%)',
    yAxisLabel: 'Construct',
    missingLabel: 'NN',
  }
}

function buildBottleneckMatrices(rows: any[]): HeatmapMatrix[] {
  return groupBottleneckRows(rows)
    .map(({ method, rows: groupRows }) => buildBottleneckMatrixForGroup(groupRows, method))
    .filter((matrix): matrix is HeatmapMatrix => matrix != null)
}

function buildModelFitScorecards(rows: any[]): ScorecardItem[] {
  const items: ScorecardItem[] = []
  rows.forEach((row) => {
    const label = String(row?.index ?? row?.Index ?? '').trim()
    if (!label) return
    const rawValue = row?.value ?? row?.Value
    const numericValue = Number(rawValue)
    items.push({
      label,
      value: Number.isFinite(numericValue) ? numericValue.toFixed(3) : String(rawValue ?? '—'),
      meta: String(row?.threshold ?? row?.Threshold ?? '—'),
      tone: row?.status === 'pass' ? C_PASS : C_WARN,
    })
  })
  return items
}

function histogramBins(values: number[]): Array<{ start: number; end: number; count: number }> {
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  if (range === 0) {
    return [{ start: min, end: max, count: values.length }]
  }
  const binsCount = Math.min(20, Math.max(6, Math.round(Math.sqrt(values.length))))
  const width = range / binsCount
  return Array.from({ length: binsCount }, (_, index) => {
    const start = min + index * width
    const end = index === binsCount - 1 ? max : start + width
    const count = values.filter((value) => {
      if (index === binsCount - 1) return value >= start && value <= end
      return value >= start && value < end
    }).length
    return { start, end, count }
  })
}

function DotPlotChart({ items }: { items: DotPlotItem[] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!items.length) return null

  const vals = items.map((item) => item.value)
  const dataMin = Math.min(...vals, 0)
  const dataMax = Math.max(...vals, 0)
  const { min, max, ticks } = niceTicks(dataMin, dataMax)
  const svgH = T_MAR + items.length * ROW_H + B_MAR
  const x0 = scaleX(0, min, max)

  return (
    <svg viewBox={`0 0 ${SVG_W} ${svgH}`} width="100%" style={{ display: 'block', userSelect: 'none' }}>
      <rect width={SVG_W} height={svgH} fill={CHART_BG} rx={6} />
      <XAxisLayer ticks={ticks} dMin={min} dMax={max} svgH={svgH} />
      {items.map((item, index) => {
        const y = T_MAR + index * ROW_H + ROW_H / 2
        const x = scaleX(item.value, min, max)
        const isHovered = hover === index
        return (
          <g
            key={`${item.label}-${index}`}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'default' }}
          >
            <text
              x={L_MAR - 8}
              y={y + 3.5}
              textAnchor="end"
              fontSize={10}
              fill={isHovered ? CHART_TEXT_ACTIVE : CHART_TEXT}
              style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
            >
              {trunc(item.label)}
            </text>
            <line x1={x0} y1={y} x2={x} y2={y} stroke={item.color} strokeWidth={1.2} opacity={0.4} />
            <circle cx={x} cy={y} r={isHovered ? 5 : 4} fill={item.color} opacity={0.95} />
            <text
              x={x + (item.value >= 0 ? 8 : -8)}
              y={y + 3.5}
              textAnchor={item.value >= 0 ? 'start' : 'end'}
              fontSize={8.5}
              fill={item.color}
              opacity={0.8}
              style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600 }}
            >
              {item.value.toFixed(3)}
            </text>
            {isHovered && item.tooltipLines?.length ? (
              <TooltipBox
                x={Math.min(x + 12, SVG_W - 210)}
                y={Math.max(y - 30, T_MAR + 8)}
                lines={item.tooltipLines}
              />
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

function HistogramChart({ values }: { values: number[] }) {
  if (!values.length) return null
  const bins = histogramBins(values)
  const width = 640
  const height = 260
  const margin = { left: 40, right: 20, top: 24, bottom: 34 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const maxCount = Math.max(...bins.map((bin) => bin.count), 1)
  const barWidth = plotWidth / Math.max(bins.length, 1)
  const yOf = (count: number) => margin.top + plotHeight - (count / maxCount) * plotHeight

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block', userSelect: 'none' }}>
      <rect width={width} height={height} fill={CHART_BG} rx={6} />
      <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotHeight} stroke={CHART_GRID} strokeWidth={1} />
      <line x1={margin.left} y1={margin.top + plotHeight} x2={margin.left + plotWidth} y2={margin.top + plotHeight} stroke={CHART_GRID} strokeWidth={1} />
      {bins.map((bin, index) => {
        const x = margin.left + index * barWidth + 1
        const y = yOf(bin.count)
        const barHeight = Math.max(2, margin.top + plotHeight - y)
        return (
          <g key={`${bin.start}-${bin.end}-${index}`}>
            <rect x={x} y={y} width={Math.max(barWidth - 2, 2)} height={barHeight} fill={C_ACCENT} opacity={0.78} rx={2} />
            <title>{`${bin.start.toFixed(3)} to ${bin.end.toFixed(3)}: ${bin.count}`}</title>
          </g>
        )
      })}
      <text x={margin.left} y={height - 10} fontSize={9} fill={CHART_MUTED} style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
        Min {Math.min(...values).toFixed(3)}
      </text>
      <text x={width - margin.right} y={height - 10} textAnchor="end" fontSize={9} fill={CHART_MUTED} style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
        Max {Math.max(...values).toFixed(3)}
      </text>
    </svg>
  )
}

function heatColor(value: number, minValue: number, maxValue: number): string {
  const spansZero = minValue < 0 && maxValue > 0
  if (spansZero) {
    const maxAbs = Math.max(Math.abs(minValue), Math.abs(maxValue), 0.0001)
    const intensity = Math.min(1, Math.abs(value) / maxAbs)
    const alpha = 0.12 + intensity * 0.72
    return value >= 0
      ? `rgb(var(--color-accent-rgb) / ${alpha})`
      : `rgba(198, 93, 68, ${alpha})`
  }

  const range = Math.max(maxValue - minValue, 0.0001)
  const intensity = Math.min(1, Math.max(0, (value - minValue) / range))
  return `rgb(var(--color-accent-rgb) / ${0.12 + intensity * 0.76})`
}

function HeatmapChart({ matrix }: { matrix: HeatmapMatrix }) {
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null)
  const cellWidth = 52
  const cellHeight = 30
  const cellGap = 4
  const longestRowLabel = Math.max(0, ...matrix.rowLabels.map((label) => label.length))
  const left = Math.min(220, Math.max(136, longestRowLabel * 6 + 36))
  const top = matrix.xAxisLabel ? 72 : 58
  const plotWidth = matrix.colLabels.length * (cellWidth + cellGap) - cellGap
  const plotHeight = matrix.rowLabels.length * (cellHeight + cellGap) - cellGap
  const width = Math.max(640, left + plotWidth + 32)
  const height = top + plotHeight + 72
  const finiteValues = matrix.values
    .flatMap((row) => row)
    .filter((value): value is number => value != null && Number.isFinite(value))
  const minValue = finiteValues.length ? Math.min(...finiteValues) : 0
  const maxValue = finiteValues.length ? Math.max(...finiteValues) : 1
  const maxAbs = Math.max(
    0.001,
    Math.abs(minValue),
    Math.abs(maxValue),
  )
  const rotateColumnLabels = matrix.colLabels.length > 7 || matrix.colLabels.some((label) => label.length > 10)
  const gradientId = `heatmap-${matrix.legendLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} style={{ display: 'block', minWidth: width }}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgb(var(--color-accent-rgb) / 0.12)" />
            <stop offset="100%" stopColor="rgb(var(--color-accent-rgb) / 0.88)" />
          </linearGradient>
        </defs>
        <rect width={width} height={height} fill={CHART_BG} rx={6} />
        {matrix.xAxisLabel ? (
          <text
            x={left + plotWidth / 2}
            y={20}
            textAnchor="middle"
            fontSize={10}
            fill={CHART_TEXT}
            style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 700 }}
          >
            {matrix.xAxisLabel}
          </text>
        ) : null}
        {matrix.yAxisLabel ? (
          <text
            x={18}
            y={top + plotHeight / 2}
            textAnchor="middle"
            fontSize={10}
            fill={CHART_TEXT}
            transform={`rotate(-90 18 ${top + plotHeight / 2})`}
            style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 700 }}
          >
            {matrix.yAxisLabel}
          </text>
        ) : null}
        {matrix.colLabels.map((label, index) => (
          <text
            key={`${label}-${index}`}
            x={left + index * (cellWidth + cellGap) + cellWidth / 2}
            y={rotateColumnLabels ? 42 : 34}
            textAnchor="middle"
            fontSize={9}
            fill={CHART_MUTED}
            transform={rotateColumnLabels ? `rotate(-28 ${left + index * (cellWidth + cellGap) + cellWidth / 2} 42)` : undefined}
            style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
          >
            {trunc(label, 12)}
          </text>
        ))}
        {matrix.rowLabels.map((label, rowIndex) => (
          <text
            key={label}
            x={left - 8}
            y={top + rowIndex * (cellHeight + cellGap) + cellHeight / 2 + 3}
            textAnchor="end"
            fontSize={10}
            fill={CHART_TEXT}
            style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
          >
            {trunc(label, 24)}
          </text>
        ))}
        {matrix.values.map((row, rowIndex) =>
          row.map((value, colIndex) => {
            const x = left + colIndex * (cellWidth + cellGap)
            const y = top + rowIndex * (cellHeight + cellGap)
            const isHovered = hover?.row === rowIndex && hover?.col === colIndex
            const displayValue = matrix.valueLabels?.[rowIndex]?.[colIndex] ?? (value == null ? matrix.missingLabel ?? '—' : value.toFixed(2))
            return (
              <g
                key={`${rowIndex}-${colIndex}`}
                onMouseEnter={() => setHover({ row: rowIndex, col: colIndex })}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'default' }}
              >
                <rect
                  x={x}
                  y={y}
                  width={cellWidth}
                  height={cellHeight}
                  rx={5}
                  fill={value == null ? 'rgb(var(--color-text-primary-rgb) / 0.035)' : heatColor(value, minValue, maxValue)}
                  stroke={isHovered ? 'rgb(var(--color-text-primary-rgb) / 0.45)' : 'rgb(var(--color-border-rgb) / 0.52)'}
                  strokeWidth={isHovered ? 1.4 : 0.8}
                />
                <text
                  x={x + cellWidth / 2}
                  y={y + cellHeight / 2 + 3}
                  textAnchor="middle"
                  fontSize={9}
                  fill={value != null && Math.abs(value) > maxAbs * 0.58 ? CHART_ON_ACCENT : CHART_TEXT_ACTIVE}
                  style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600 }}
                >
                  {displayValue}
                </text>
              </g>
            )
          }),
        )}
        <rect x={left} y={height - 30} width={112} height={8} rx={4} fill={`url(#${gradientId})`} />
        <text x={left} y={height - 14} fontSize={9} fill={CHART_MUTED} style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
          Higher intensity = larger absolute {matrix.legendLabel.toLowerCase()}
        </text>
        <text x={left + 120} y={height - 22} fontSize={8.5} fill={CHART_MUTED} style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
          Low → high
        </text>
        {hover ? (
          <TooltipBox
            x={Math.min(left + hover.col * (cellWidth + cellGap) + cellWidth + 10, width - 210)}
            y={Math.max(top + hover.row * (cellHeight + cellGap) - 28, top)}
            lines={[
              `${matrix.rowLabels[hover.row]} × ${matrix.colLabels[hover.col]}`,
              `${matrix.legendLabel}: ${matrix.valueLabels?.[hover.row]?.[hover.col] ?? (matrix.values[hover.row]?.[hover.col] == null ? matrix.missingLabel ?? '—' : matrix.values[hover.row]?.[hover.col]?.toFixed(3))}`,
            ]}
            svgWidth={width}
          />
        ) : null}
      </svg>
    </div>
  )
}

function ScorecardChart({ items }: { items: ScorecardItem[] }) {
  if (!items.length) return null
  return (
    <div className="grid gap-3 p-3 md:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border/60 bg-elevated/60 p-4"
          style={{ boxShadow: `inset 0 0 0 1px ${item.tone ?? 'rgb(var(--color-border-rgb) / 0.5)'}` }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{item.label}</div>
          <div className="mt-2 text-2xl font-semibold text-text-primary" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>{item.value}</div>
          {item.meta ? <div className="mt-1 text-[11px] text-text-secondary">Threshold {item.meta}</div> : null}
        </div>
      ))}
    </div>
  )
}

export function ResultChart(props: ResultChartProps) {
  const { selectedPanel, analysisMode, pathRows = [], rSquareRows = [], reliRows = [],
    loadingRows = [], weightRows = [], bootLoadingRows = [], bootWeightRows = [],
    vifSections, modelFitRows = [], analysisResults } = props

  const ar = unwrapAnalysisResults(analysisResults)

  // ── Helper: get raw rows for a panel using the data path table ──────────────
  const rawRows = (panel: string): any[] => {
    const path = CHART_DATA_PATHS[analysisMode]?.[panel]
    return path ? getByPath(ar, path) : []
  }

  const sigLegend = [
    { label: 'p < .05 (significant)', color: C_PASS },
    { label: 'p ≥ .05 (not significant)', color: C_FAIL },
  ]

  // ── Bootstrap: path-coef, total-indirect, specific-indirect, total-effects ──
  // All use ForestPlot with CI intervals; each panel has its own data path
  if (analysisMode === 'bootstrap' && [
    'path-coef', 'total-indirect', 'specific-indirect', 'total-effects',
  ].includes(selectedPanel)) {
    // Use pre-parsed pathRows for path-coef (richest parsing incl. p-value derivation)
    // Use raw data for the indirect/total-effects panels
    const rows = selectedPanel === 'path-coef' ? pathRows : rawRows(selectedPanel)
    const items = buildForestItems(rows)
    if (!items.length) return <NoChartData />
    const labels: Record<string, string> = {
      'path-coef': 'Path Coefficients — 95% Bootstrap CI',
      'total-indirect': 'Total Indirect Effects — 95% CI',
      'specific-indirect': 'Specific Indirect Effects — 95% CI',
      'total-effects': 'Total Effects — 95% Bootstrap CI',
    }
    return (
      <div className="p-3 pt-2">
        <ChartTitle label={labels[selectedPanel] ?? '95% Bootstrap CI'} />
        <ForestPlot items={items} />
        <ChartLegend items={sigLegend} />
      </div>
    )
  }

  // ── Bootstrap outer loadings/weights → ForestPlot using bootstrap rows ──────
  if (analysisMode === 'bootstrap' && (selectedPanel === 'outer-loadings' || selectedPanel === 'outer-weights')) {
    const preRows = selectedPanel === 'outer-loadings' ? bootLoadingRows : bootWeightRows
    // map pre-parsed bootstrap rows to raw-compatible shape
    const mapped = preRows.map(r => ({
      path: `${r.indicator} (${r.construct})`,
      coefficient: r.originalEst,
      ci25: r.ci25,
      ci975: r.ci975,
      pValue: String(r.pVal ?? r.pValue ?? ''),
      tStatistic: r.tStat,
    }))
    const items = buildForestItems(mapped.length ? mapped : rawRows(selectedPanel))
    if (!items.length) return <NoChartData />
    const label = selectedPanel === 'outer-loadings' ? 'Outer Loadings — Bootstrap CI' : 'Outer Weights — Bootstrap CI'
    return (
      <div className="p-3 pt-2">
        <ChartTitle label={label} />
        <ForestPlot items={items} />
        <ChartLegend items={sigLegend} />
      </div>
    )
  }

  switch (selectedPanel) {
    case 'cross-loadings': {
      const matrix = buildCrossLoadingMatrix(ar?.quality_criteria?.cross_loadings ?? [])
      if (!matrix) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label={getChartTitle(selectedPanel)} />
          <HeatmapChart matrix={matrix} />
        </div>
      )
    }

    case 'discriminant': {
      const matrix = buildDiscriminantMatrix(ar?.quality_criteria?.discriminant_validity ?? [])
      if (!matrix) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label={getChartTitle(selectedPanel)} />
          <HeatmapChart matrix={matrix} />
        </div>
      )
    }

    case 'htmt-confidence-intervals': {
      const matrix = buildHtmtConfidenceMatrix(rawRows('htmt-confidence-intervals'))
      if (!matrix) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label={getChartTitle(selectedPanel)} />
          <HeatmapChart matrix={matrix} />
        </div>
      )
    }

    case 'priority-map':
    case 'cipma-priorities': {
      const items = buildPriorityMapItems(rawRows(selectedPanel))
      if (!items.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label={getChartTitle(selectedPanel)} />
          <PriorityMapChart items={items} variant={selectedPanel === 'cipma-priorities' ? 'cipma' : 'priority'} />
        </div>
      )
    }

    case 'necessity-check': {
      const items = buildNecessityItems(rawRows('necessity-check'))
      if (!items.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label="NCA Necessity Effects" />
          <HBarChart
            items={items}
            forceZero={false}
            refLines={[
              { value: 0.1, label: 'Small', color: C_WARN, dash: '3 3' },
              { value: 0.3, label: 'Medium', color: C_WARN, dash: '3 3' },
              { value: 0.5, label: 'Large', color: C_PASS, dash: '3 3' },
            ]}
          />
        </div>
      )
    }

    case 'ceiling-lines': {
      const groups = buildCeilingSeries(rawRows('ceiling-lines'))
      if (!groups.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label="NCA Ceiling Lines" />
          <CeilingLinesChart groups={groups} />
          <ChartLegend items={[
            { label: 'Observed scores', color: CHART_TEXT_ACTIVE },
            { label: 'CE-FDH ceiling', color: CEILING_SERIES_STYLES.ceFdh.color },
            { label: 'CR-FDH regression', color: CEILING_SERIES_STYLES.crFdh.color },
          ]} />
        </div>
      )
    }

    case 'bottleneck-table': {
      const matrices = buildBottleneckMatrices(rawRows('bottleneck-table'))
      if (!matrices.length) return <NoChartData />
      return (
        <div className="space-y-5 p-3 pt-2">
          {matrices.map((matrix) => (
            <div key={matrix.legendLabel}>
              <ChartTitle label={`${matrix.legendLabel.replace(/ required level$/i, '')} bottleneck heatmap`} />
              <HeatmapChart matrix={matrix} />
            </div>
          ))}
        </div>
      )
    }

    // ── PLS-SEM path coefficients ─────────────────────────────────────────────
    case 'path-coef': {
      const items = buildPathCoefItems(pathRows.length ? pathRows : rawRows('path-coef'))
      if (!items.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label="Path Coefficients" />
          <HBarChart items={items} />
          <ChartLegend items={sigLegend} />
        </div>
      )
    }

    // ── PLS-SEM total-effects, total-indirect, specific-indirect ─────────────
    case 'total-effects':
    case 'total-indirect':
    case 'specific-indirect': {
      const rows = rawRows(selectedPanel)
      const items = buildPathCoefItems(rows)
      if (!items.length) return <NoChartData />
      const labels: Record<string, string> = {
        'total-effects': 'Total Effects',
        'total-indirect': 'Total Indirect Effects',
        'specific-indirect': 'Specific Indirect Effects',
      }
      return (
        <div className="p-3 pt-2">
          <ChartTitle label={labels[selectedPanel]} />
          <HBarChart items={items} />
          <ChartLegend items={sigLegend} />
        </div>
      )
    }

    // ── R-square ──────────────────────────────────────────────────────────────
    case 'r-square': {
      const items = buildRSquareItems(rSquareRows)
      if (!items.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label="R-Square" />
          <HBarChart
            items={items}
            domain={[0, 1]}
            forceZero={false}
            refLines={[
              { value: 0.25, label: 'Weak',   color: C_FAIL, dash: '3 3' },
              { value: 0.50, label: 'Large',  color: C_WARN, dash: '3 3' },
              { value: 0.75, label: 'Subst.', color: C_PASS, dash: '3 3' },
            ]}
            pairLabels={['R²', 'R² adj']}
          />
        </div>
      )
    }

    // ── Reliability ───────────────────────────────────────────────────────────
    case 'reliability': {
      const groups = buildReliabilityGroups(reliRows)
      if (!groups.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label="Construct Reliability & Validity" />
          <GroupedBarChart
            groups={groups}
            domain={[0, 1]}
            refLines={[
              { value: 0.5, label: 'AVE ≥ 0.50',  color: C_WARN, dash: '3 3' },
              { value: 0.7, label: 'Rel. ≥ 0.70', color: C_PASS, dash: '3 3' },
            ]}
          />
        </div>
      )
    }

    // ── Outer loadings (PLS-SEM) ──────────────────────────────────────────────
    case 'outer-loadings': {
      const items = buildOuterLoadingItems(loadingRows)
      if (!items.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label="Outer Loadings" />
          <HBarChart items={items} domain={[0, 1]} forceZero={false}
            refLines={[{ value: 0.7, label: '0.70', color: C_WARN, dash: '3 3' }]} />
        </div>
      )
    }

    // ── Outer weights (PLS-SEM) ───────────────────────────────────────────────
    case 'outer-weights': {
      const items = buildOuterLoadingItems(weightRows)
      if (!items.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label="Outer Weights" />
          <HBarChart items={items} />
        </div>
      )
    }

    // ── VIF ───────────────────────────────────────────────────────────────────
    case 'vif': {
      if (!vifSections) return <NoChartData />
      const items = buildVIFItems(vifSections)
      if (!items.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label="Collinearity (VIF)" />
          <HBarChart items={items} forceZero={false}
            refLines={[{ value: 5, label: 'Threshold 5.0', color: C_FAIL, dash: '4 3' }]} />
        </div>
      )
    }

    // ── f-square ──────────────────────────────────────────────────────────────
    case 'f-square': {
      const raw: any[] = ar?.quality_criteria?.f_square ?? []
      const items = buildGenericBarItems(raw)
      if (!items.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label="Effect Size (f²)" />
          <HBarChart items={items} forceZero={false}
            refLines={[
              { value: 0.02, label: 'Small',  color: C_WARN, dash: '3 3' },
              { value: 0.15, label: 'Medium', color: C_WARN, dash: '3 3' },
              { value: 0.35, label: 'Large',  color: C_PASS, dash: '3 3' },
            ]} />
        </div>
      )
    }

    // ── PLSpredict MV / LV summary ────────────────────────────────────────────
    case 'plspredict-mv-summary':
    case 'plspredict-lv-summary': {
      const isMV  = selectedPanel === 'plspredict-mv-summary'
      const items = buildPlsPredictSummaryItems(
        ar?.final_results?.plspredict_mv_summary ?? [],
        ar?.final_results?.plspredict_lv_summary ?? [],
        isMV,
      )
      if (!items.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label={isMV ? 'PLSpredict MV Summary' : 'PLSpredict LV Summary'} />
          <GroupedBarChart groups={items} />
        </div>
      )
    }

    case 'pls-lm-comparison': {
      const items = buildPlsPredictSummaryItems(
        ar?.final_results?.plspredict_mv_summary ?? [],
        ar?.final_results?.plspredict_lv_summary ?? [],
        true,
        { variant: 'comparison' },
      )
      if (!items.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label="PLS vs LM Comparison" />
          <GroupedBarChart groups={items} />
        </div>
      )
    }

    case 'q2-predict': {
      const items = buildDotPlotItems(rawRows('q2-predict'))
      if (!items.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label={getChartTitle(selectedPanel)} />
          <DotPlotChart items={items} />
        </div>
      )
    }

    // ── PLSpredict prediction errors ──────────────────────────────────────────
    case 'mv-predictions-errors':
    case 'lv-predictions-errors': {
      const rows = rawRows(selectedPanel)
      const items = buildPredictionErrorItems(rows)
      if (!items.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label={selectedPanel === 'mv-predictions-errors' ? 'MV Prediction Errors' : 'LV Prediction Errors'} />
          <HBarChart items={items} />
        </div>
      )
    }

    case 'plsem-mv-error-hist':
    case 'plsem-lv-error-hist': {
      const values = buildHistogramValues(rawRows(selectedPanel))
      if (!values.length) return <NoChartData />
      return (
        <div className="p-3 pt-2">
          <ChartTitle label={getChartTitle(selectedPanel)} />
          <HistogramChart values={values} />
        </div>
      )
    }

    case 'model-fit': {
      const items = buildModelFitScorecards(modelFitRows)
      if (!items.length) return <NoChartData />
      return (
        <div className="pt-2">
          <ChartTitle label={getChartTitle(selectedPanel)} />
          <ScorecardChart items={items} />
        </div>
      )
    }

    default:
      return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SMALL HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function ChartTitle({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span style={{
        fontFamily: 'DM Sans, system-ui, sans-serif',
        fontSize: 11, fontWeight: 600,
        color: CHART_MUTED,
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>{label}</span>
    </div>
  )
}

function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-4 mt-2 flex-wrap">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div style={{
            width: 10, height: 10, borderRadius: 2,
            background: item.color, opacity: 0.85, flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'DM Sans, system-ui, sans-serif',
            fontSize: 10, color: CHART_MUTED,
          }}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

function NoChartData() {
  return (
    <div className="flex items-center justify-center py-8 text-text-muted" style={{ fontSize: 12 }}>
      No chart data available for this section.
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EXPORT SVG BUILDER — generates static SVG strings for the HTML report
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generates a complete inline SVG string for a given panel + analysis results.
 * Used by the HTML export to embed charts as static, interactive SVGs.
 * Colors are hardcoded to the light theme (matching the exported report).
 */
export function buildChartSvgForPanel(
  panel: string,
  mode: AnalysisMode,
  analysisResults: any,
): string | null {
  const ar = unwrapAnalysisResults(analysisResults)
  if (!CHART_SUPPORTED_PANELS.has(panel) || !getChartConfig(mode, panel) || !ar) return null

  const rawRows = (panelId: string): any[] => {
    const path = CHART_DATA_PATHS[mode]?.[panelId]
    return path ? getByPath(ar, path) : []
  }

  try {
    if (mode === 'bootstrap' && ['path-coef','total-indirect','specific-indirect','total-effects'].includes(panel)) {
      const rows = rawRows(panel)
      const items = buildForestItems(rows)
      if (!items.length) return null
      return exportForestPlot(items, '95% Bootstrap Confidence Intervals')
    }

    if (['path-coef', 'total-effects', 'total-indirect', 'specific-indirect'].includes(panel)) {
      const rows = rawRows(panel)
      const items = buildPathCoefItems(rows)
      if (!items.length) return null
      return exportHBarChart(items, getChartTitle(panel), [])
    }

    if (panel === 'r-square') {
      const rows = ar?.quality_criteria?.r_square ?? []
      const parsedRows = rows.map((r: any) => ({
        construct: String(r.construct ?? Object.keys(r).find(k => !['r2','r_square','r2_adjusted'].includes(k.toLowerCase())) ?? ''),
        r2: Number(r.r2 ?? r['R²'] ?? r['R2'] ?? r.r_square),
        r2Adjusted: Number(r.r2_adj ?? r['R²adj'] ?? r['R2_adj'] ?? r.r2_adjusted),
        assessment: '',
      }))
      const items = buildRSquareItems(parsedRows)
      if (!items.length) return null
      return exportHBarChart(items, 'R-Square', [
        { value: 0.25, label: 'Weak',  color: C_FAIL },
        { value: 0.50, label: 'Large', color: C_WARN },
        { value: 0.75, label: 'Subst.', color: C_PASS },
      ], [0, 1], ['R²', 'R² adj'])
    }

    if (panel === 'reliability') {
      const rows = ar?.quality_criteria?.reliability ?? []
      const parsedRows = rows.map((r: any) => ({
        construct: String(r.row ?? r.row_name ?? r.construct ?? ''),
        cronbach: String(r.alpha ?? r['cronbach_alpha'] ?? r["Cronbach's alpha"] ?? r.cronbach ?? '0'),
        rhoA: String(r.rho_a ?? r.rho_A ?? r.rhoa ?? r.rhoA ?? '0'),
        rhoCc: String(r.rho_c ?? r.rho_C ?? r.rhoc ?? r.rhoCc ?? r.cr ?? '0'),
        ave: String(r.ave ?? r.AVE ?? '0'),
      }))
      const groups = buildReliabilityGroups(parsedRows)
      if (!groups.length) return null
      return exportGroupedBarChart(groups, 'Construct Reliability & Validity', [
        { value: 0.5, label: 'AVE ≥ 0.50', color: C_WARN },
        { value: 0.7, label: 'Rel. ≥ 0.70', color: C_PASS },
      ])
    }

    if (panel === 'outer-loadings' || panel === 'outer-weights') {
      const rows = rawRows(panel)
      const items: HBarItem[] = rows.slice(0, 30).map((r: any, i: number) => ({
        label: String(r.indicator ?? r.row ?? `Item ${i + 1}`),
        value: Number(rawMetric(r, ['loading', 'weight', 'Original Est.', 'Original.Est.', 'Original Estimate', 'original_estimate']) ?? 0),
        color: PALETTE[i % PALETTE.length],
      }))
      if (!items.length) return null
      const refLines = panel === 'outer-loadings'
        ? [{ value: 0.7, label: '0.70', color: C_WARN }]
        : []
      return exportHBarChart(items, panel === 'outer-loadings' ? 'Outer Loadings' : 'Outer Weights', refLines, panel === 'outer-loadings' ? [0, 1] : undefined)
    }

    if (panel === 'cross-loadings') {
      const matrix = buildCrossLoadingMatrix(ar?.quality_criteria?.cross_loadings ?? [])
      return matrix ? exportHeatmapChart(matrix, getChartTitle(panel)) : null
    }

    if (panel === 'discriminant') {
      const matrix = buildDiscriminantMatrix(ar?.quality_criteria?.discriminant_validity ?? [])
      return matrix ? exportHeatmapChart(matrix, getChartTitle(panel)) : null
    }

    if (panel === 'htmt-confidence-intervals') {
      const matrix = buildHtmtConfidenceMatrix(rawRows(panel))
      return matrix ? exportHeatmapChart(matrix, getChartTitle(panel)) : null
    }

    if (panel === 'vif') {
      const innerRaw: any[] = ar?.quality_criteria?.inner_vif ?? ar?.quality_criteria?.vif ?? []
      const outerRaw: any[] = ar?.quality_criteria?.outer_vif ?? ar?.quality_criteria?.vif_items ?? []
      const toVifItem = (r: any): HBarItem | null => {
        const vif = Number(r.vif ?? r.VIF ?? r.value)
        if (!Number.isFinite(vif)) return null
        const label = `${r.predictor ?? r.item ?? ''} → ${r.endogenous ?? r.construct ?? ''}`
        return { label, value: vif, color: vif < 5 ? C_PASS : C_FAIL }
      }
      const items = [...innerRaw, ...outerRaw].map(toVifItem).filter(Boolean) as HBarItem[]
      if (!items.length) return null
      return exportHBarChart(items, 'Collinearity (VIF)', [{ value: 5, label: 'Threshold 5.0', color: C_FAIL }], undefined, undefined, false)
    }

    if (panel === 'f-square') {
      const raw: any[] = ar?.quality_criteria?.f_square ?? []
      const items = buildGenericBarItems(raw)
      if (!items.length) return null
      return exportHBarChart(items, 'Effect Size (f²)', [
        { value: 0.02, label: 'Small',  color: C_WARN },
        { value: 0.15, label: 'Medium', color: C_WARN },
        { value: 0.35, label: 'Large',  color: C_PASS },
      ], undefined, undefined, false)
    }

    if (panel === 'plspredict-mv-summary' || panel === 'plspredict-lv-summary' || panel === 'pls-lm-comparison') {
      const isMV = panel !== 'plspredict-lv-summary'
      const variant = panel === 'pls-lm-comparison' ? 'comparison' : 'all'
      const groups = buildPlsPredictSummaryItems(
        ar?.final_results?.plspredict_mv_summary ?? [],
        ar?.final_results?.plspredict_lv_summary ?? [],
        isMV,
        { variant },
      )
      if (!groups.length) return null
      return exportGroupedBarChart(groups, getChartTitle(panel))
    }

    if (panel === 'q2-predict') {
      const items = buildDotPlotItems(rawRows(panel))
      return items.length ? exportDotPlotChart(items, getChartTitle(panel)) : null
    }

    if (panel === 'plsem-mv-error-hist' || panel === 'plsem-lv-error-hist') {
      const values = buildHistogramValues(rawRows(panel))
      return values.length ? exportHistogramChart(values, getChartTitle(panel)) : null
    }

    if (panel === 'priority-map' || panel === 'cipma-priorities') {
      const items = buildPriorityMapItems(rawRows(panel))
      if (!items.length) return null
      return exportPriorityMapChart(items, getChartTitle(panel), panel === 'cipma-priorities' ? 'cipma' : 'priority')
    }

    if (panel === 'necessity-check') {
      const items = buildNecessityItems(rawRows(panel))
      if (!items.length) return null
      return exportHBarChart(items, 'NCA Necessity Effects', [
        { value: 0.1, label: 'Small', color: C_WARN },
        { value: 0.3, label: 'Medium', color: C_WARN },
        { value: 0.5, label: 'Large', color: C_PASS },
      ], undefined, undefined, false)
    }

    if (panel === 'ceiling-lines') {
      const groups = buildCeilingSeries(rawRows(panel))
      return groups.length ? exportCeilingLineChart(groups, 'NCA Ceiling Lines') : null
    }

    if (panel === 'bottleneck-table') {
      const matrices = buildBottleneckMatrices(rawRows(panel))
      return matrices.length
        ? matrices.map((matrix) => exportHeatmapChart(matrix, `${matrix.legendLabel.replace(/ required level$/i, '')} Bottleneck Heatmap`)).join('')
        : null
    }

    if (panel === 'model-fit') {
      const items = buildModelFitScorecards(
        Array.isArray(ar?.quality_criteria?.model_fit)
          ? ar.quality_criteria.model_fit
          : [],
      )
      return items.length ? exportScorecardChart(items, getChartTitle(panel)) : null
    }

  } catch {
    return null
  }

  return null
}

// ─── Export SVG string builders ──────────────────────────────────────────────

interface ExpRefLine { value: number; label?: string; color?: string }

function expScaleX(v: number, dMin: number, dMax: number, plotW: number, lMar: number): number {
  if (dMax === dMin) return lMar + plotW / 2
  return lMar + ((v - dMin) / (dMax - dMin)) * plotW
}

function expTrunc(s: string, max = 24): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function expEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function exportHBarChart(
  items: HBarItem[],
  title: string,
  refLines: ExpRefLine[] = [],
  domain?: [number, number],
  pairLabels?: [string, string],
  forceZero = true,
): string {
  const EML = 172, EMR = 52, EMT = 28, EMB = 36
  const ESVGW = 640, EBARH = 14, EROWH = pairLabels ? 38 : 28
  const hasPairs = pairLabels !== undefined && items.some(i => i.secondValue !== undefined && Number.isFinite(i.secondValue))

  const vals = items.flatMap(i => [i.value, i.secondValue ?? NaN].filter(Number.isFinite))
  const dataMin = Math.min(...vals)
  const dataMax = Math.max(...vals)
  let dMin = domain?.[0] ?? (forceZero ? Math.min(dataMin, 0) : dataMin)
  let dMax = domain?.[1] ?? (forceZero ? Math.max(dataMax, 0) : dataMax)
  refLines.forEach(r => { dMin = Math.min(dMin, r.value); dMax = Math.max(dMax, r.value) })

  const { min, max, ticks } = niceTicks(dMin, dMax)
  const plotW = ESVGW - EML - EMR
  const svgH  = EMT + items.length * EROWH + EMB + (pairLabels ? 20 : 0)
  const x0    = expScaleX(0, min, max, plotW, EML)
  const sX    = (v: number) => expScaleX(v, min, max, plotW, EML)

  const gridLines = ticks.map(t =>
    `<line x1="${sX(t)}" y1="${EMT - 4}" x2="${sX(t)}" y2="${svgH - EMB}" stroke="${EXP.border}" stroke-width="${t === 0 ? 1 : 0.5}" ${t !== 0 ? 'stroke-dasharray="2 4"' : ''}/>`
  ).join('')

  const refLinesSvg = refLines.map(r =>
    `<line x1="${sX(r.value)}" y1="${EMT - 4}" x2="${sX(r.value)}" y2="${svgH - EMB}" stroke="${r.color ?? C_WARN}" stroke-width="1" stroke-dasharray="4 3" opacity="0.7"/>
    ${r.label ? `<text x="${sX(r.value) + 3}" y="${EMT - 7}" font-size="8.5" fill="${r.color ?? C_WARN}" opacity="0.85" font-family="system-ui,sans-serif">${r.label}</text>` : ''}`
  ).join('')

  const barsSvg = items.map((item, i) => {
    const y   = EMT + i * EROWH
    const bY1 = y + (hasPairs ? 4 : (EROWH - EBARH) / 2)
    const xV  = sX(item.value)
    const bX  = Math.min(x0, xV)
    const bW  = Math.max(1, Math.abs(xV - x0))

    const sec = hasPairs && item.secondValue !== undefined && Number.isFinite(item.secondValue) ? (() => {
      const xV2 = sX(item.secondValue!)
      const bX2 = Math.min(x0, xV2)
      const bW2 = Math.max(1, Math.abs(xV2 - x0))
      return `<rect x="${bX2}" y="${bY1 + EBARH + 2}" width="${bW2}" height="${EBARH - 2}" fill="${item.secondColor ?? item.color}" opacity="0.4" rx="2">
        <animate attributeName="width" from="0" to="${bW2}" dur="0.5s" calcMode="spline" keySplines="0.4 0 0.2 1" fill="freeze"/>
      </rect>`
    })() : ''

    return `
      <text x="${EML - 8}" y="${y + EROWH / 2 + 3.5}" text-anchor="end" font-size="10" fill="${EXP.text}" font-family="system-ui,sans-serif">${expTrunc(item.label)}</text>
      <rect x="${bX}" y="${bY1}" width="${bW}" height="${EBARH}" fill="${item.color}" opacity="0.85" rx="2">
        <animate attributeName="width" from="0" to="${bW}" dur="0.5s" calcMode="spline" keySplines="0.4 0 0.2 1" fill="freeze"/>
      </rect>
      ${sec}
      <text x="${xV + (item.value >= 0 ? 5 : -5)}" y="${bY1 + EBARH / 2 + 3.5}" text-anchor="${item.value >= 0 ? 'start' : 'end'}" font-size="8.5" fill="${item.color}" opacity="0.75" font-family="system-ui,sans-serif" font-weight="600">${item.value.toFixed(3)}</text>
    `
  }).join('')

  const axisSvg = ticks.map(t =>
    `<line x1="${sX(t)}" y1="${svgH - EMB}" x2="${sX(t)}" y2="${svgH - EMB + 4}" stroke="${EXP.border}" stroke-width="0.5"/>
    <text x="${sX(t)}" y="${svgH - EMB + 14}" text-anchor="middle" font-size="9" fill="${EXP.muted}" font-family="system-ui,sans-serif">${Math.abs(t) < 0.001 ? '0' : t % 1 === 0 ? t : t.toFixed(2)}</text>`
  ).join('')

  const legendSvg = pairLabels ? `
    <rect x="${EML}" y="${svgH - 14}" width="9" height="7" fill="${items[0]?.color ?? C_ACCENT}" opacity="0.85" rx="1"/>
    <text x="${EML + 13}" y="${svgH - 8}" font-size="9" fill="${EXP.muted}" font-family="system-ui,sans-serif">${pairLabels[0]}</text>
    <rect x="${EML + 90}" y="${svgH - 14}" width="9" height="7" fill="${items[0]?.color ?? C_ACCENT}" opacity="0.4" rx="1"/>
    <text x="${EML + 103}" y="${svgH - 8}" font-size="9" fill="${EXP.muted}" font-family="system-ui,sans-serif">${pairLabels[1]}</text>
  ` : ''

  return `<figure style="margin:0 0 16px">
    <figcaption style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-family:system-ui,sans-serif">${title}</figcaption>
    <svg viewBox="0 0 ${ESVGW} ${svgH}" width="100%" style="display:block;border-radius:6px">
      <rect width="${ESVGW}" height="${svgH}" fill="${EXP.bg}" rx="6"/>
      ${gridLines}${refLinesSvg}${barsSvg}${axisSvg}${legendSvg}
    </svg>
  </figure>`
}

function exportForestPlot(items: ForestItem[], title: string): string {
  const EML = 172, EMR = 52, EMT = 28, EMB = 36
  const ESVGW = 640, EROWH = 28, DOT_R = 3.5

  const allVals = items.flatMap(i => [i.estimate, i.ci25, i.ci975].filter(Number.isFinite))
  const dataMin = Math.min(...allVals, 0)
  const dataMax = Math.max(...allVals, 0)
  const { min, max, ticks } = niceTicks(dataMin, dataMax)
  const plotW = ESVGW - EML - EMR
  const svgH  = EMT + items.length * EROWH + EMB
  const sX    = (v: number) => expScaleX(v, min, max, plotW, EML)

  const gridLines = ticks.map(t =>
    `<line x1="${sX(t)}" y1="${EMT - 4}" x2="${sX(t)}" y2="${svgH - EMB}" stroke="${EXP.border}" stroke-width="${t === 0 ? 1 : 0.5}" ${t !== 0 ? 'stroke-dasharray="2 4"' : ''}/>`
  ).join('')

  const itemsSvg = items.map((item, i) => {
    const cy   = EMT + i * EROWH + EROWH / 2
    const xEst = sX(item.estimate)
    const xLo  = Number.isFinite(item.ci25)  ? sX(item.ci25)  : xEst
    const xHi  = Number.isFinite(item.ci975) ? sX(item.ci975) : xEst
    const hasCI = Number.isFinite(item.ci25) && Number.isFinite(item.ci975)

    return `
      <text x="${EML - 8}" y="${cy + 3.5}" text-anchor="end" font-size="10" fill="${EXP.text}" font-family="system-ui,sans-serif">${expTrunc(item.label)}</text>
      ${hasCI ? `<line x1="${xLo}" y1="${cy}" x2="${xHi}" y2="${cy}" stroke="${item.color}" stroke-width="1.5" opacity="0.65"/>
        <line x1="${xLo}" y1="${cy - 5}" x2="${xLo}" y2="${cy + 5}" stroke="${item.color}" stroke-width="1" opacity="0.55"/>
        <line x1="${xHi}" y1="${cy - 5}" x2="${xHi}" y2="${cy + 5}" stroke="${item.color}" stroke-width="1" opacity="0.55"/>` : ''}
      <circle cx="${xEst}" cy="${cy}" r="${DOT_R}" fill="${item.color}" opacity="0.9"/>
      <text x="${xHi + 6}" y="${cy + 3.5}" font-size="8.5" fill="${item.color}" opacity="0.75" font-family="system-ui,sans-serif" font-weight="600">${item.estimate.toFixed(3)}</text>
    `
  }).join('')

  const axisSvg = ticks.map(t =>
    `<line x1="${sX(t)}" y1="${svgH - EMB}" x2="${sX(t)}" y2="${svgH - EMB + 4}" stroke="${EXP.border}" stroke-width="0.5"/>
    <text x="${sX(t)}" y="${svgH - EMB + 14}" text-anchor="middle" font-size="9" fill="${EXP.muted}" font-family="system-ui,sans-serif">${Math.abs(t) < 0.001 ? '0' : t % 1 === 0 ? t : t.toFixed(2)}</text>`
  ).join('')

  return `<figure style="margin:0 0 16px">
    <figcaption style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-family:system-ui,sans-serif">${title}</figcaption>
    <svg viewBox="0 0 ${ESVGW} ${svgH}" width="100%" style="display:block;border-radius:6px">
      <rect width="${ESVGW}" height="${svgH}" fill="${EXP.bg}" rx="6"/>
      ${gridLines}${itemsSvg}${axisSvg}
    </svg>
  </figure>`
}

function exportGroupedBarChart(
  groups: GroupedBarGroup[],
  title: string,
  refLines: ExpRefLine[] = [],
): string {
  const ESVGW  = Math.max(640, groups.length * 88 + 80)
  const GML = 44, GMR = 24, GMT = 36, GMB = 56
  const SVGH = 280, plotH = SVGH - GMT - GMB
  const plotW = ESVGW - GML - GMR

  const barsPerGroup = groups[0]?.bars.length ?? 1
  const { min: yMin, max: yMax, ticks: yTicks } = niceTicks(0, 1, 5)
  const yOf = (v: number) => GMT + plotH - ((v - yMin) / (yMax - yMin)) * plotH
  const groupW   = plotW / groups.length
  const groupPad = groupW * 0.15
  const barGap   = 2
  const barW     = Math.max(4, (groupW - 2 * groupPad - barGap * (barsPerGroup - 1)) / barsPerGroup)

  const gridLines = yTicks.map(t =>
    `<line x1="${GML}" y1="${yOf(t)}" x2="${GML + plotW}" y2="${yOf(t)}" stroke="${EXP.border}" stroke-width="${t === 0 ? 1 : 0.5}" ${t !== 0 ? 'stroke-dasharray="2 4"' : ''}/>
    <text x="${GML - 6}" y="${yOf(t) + 3.5}" text-anchor="end" font-size="9" fill="${EXP.muted}" font-family="system-ui,sans-serif">${t % 1 === 0 ? t : t.toFixed(2)}</text>`
  ).join('')

  const refLinesSvg = refLines.map(r =>
    `<line x1="${GML}" y1="${yOf(r.value)}" x2="${GML + plotW}" y2="${yOf(r.value)}" stroke="${r.color ?? C_WARN}" stroke-width="1" stroke-dasharray="4 3" opacity="0.7"/>
    ${r.label ? `<text x="${GML + plotW + 3}" y="${yOf(r.value) + 3.5}" font-size="8.5" fill="${r.color ?? C_WARN}" opacity="0.85" font-family="system-ui,sans-serif">${r.label}</text>` : ''}`
  ).join('')

  const barsSvg = groups.map((group, gi) => {
    const groupX = GML + gi * groupW + groupPad
    const bars = group.bars.map((bar, bi) => {
      const bx = groupX + bi * (barW + barGap)
      const by = yOf(Math.max(yMin, bar.value))
      const bh = Math.max(1, yOf(yMin) - by)
      return `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" fill="${bar.color}" opacity="0.78" rx="2">
        <animate attributeName="height" from="0" to="${bh}" dur="0.5s" calcMode="spline" keySplines="0.4 0 0.2 1" fill="freeze"/>
        <animate attributeName="y" from="${yOf(yMin)}" to="${by}" dur="0.5s" calcMode="spline" keySplines="0.4 0 0.2 1" fill="freeze"/>
      </rect>`
    }).join('')

    return `${bars}
    <text x="${groupX + (group.bars.length * (barW + barGap) - barGap) / 2}" y="${SVGH - GMB + 14}" text-anchor="middle" font-size="9.5" fill="${EXP.text}" font-family="system-ui,sans-serif">${expTrunc(group.label, 14)}</text>`
  }).join('')

  const legends = groups[0]?.bars ?? []
  const legendSvg = legends.slice(0, 6).map((leg, i) =>
    `<rect x="${GML + i * 90}" y="8" width="9" height="9" rx="1.5" fill="${leg.color}" opacity="0.85"/>
    <text x="${GML + i * 90 + 13}" y="16" font-size="9" fill="${EXP.text}" font-family="system-ui,sans-serif">${leg.legendLabel}</text>`
  ).join('')

  return `<figure style="margin:0 0 16px;overflow-x:auto">
    <figcaption style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-family:system-ui,sans-serif">${title}</figcaption>
    <svg width="${ESVGW}" height="${SVGH}" style="display:block;border-radius:6px;min-width:${ESVGW}px">
      <rect width="${ESVGW}" height="${SVGH}" fill="${EXP.bg}" rx="6"/>
      ${gridLines}${refLinesSvg}${barsSvg}
      <line x1="${GML}" y1="${GMT}" x2="${GML}" y2="${GMT + plotH}" stroke="${EXP.border}" stroke-width="0.5"/>
      <line x1="${GML}" y1="${GMT + plotH}" x2="${GML + plotW}" y2="${GMT + plotH}" stroke="${EXP.border}" stroke-width="0.5"/>
      ${legendSvg}
    </svg>
  </figure>`
}

function exportPriorityMapChart(items: PriorityMapItem[], title: string, variant: PriorityMapVariant = 'priority'): string {
  const width = 640
  const height = 330
  const margin = { left: 70, right: 28, top: 30, bottom: 46 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const importanceMean = items.reduce((sum, item) => sum + item.importance, 0) / items.length
  const performanceMean = items.reduce((sum, item) => sum + item.performance, 0) / items.length
  const minImportance = 0
  const maxImportance = niceTicks(0, Math.max(0.6, ...items.map((item) => item.importance * 1.12), importanceMean * 1.12), 4).max
  const minPerformance = 0
  const maxPerformance = 100
  const xOf = (value: number) => margin.left + ((value - minImportance) / Math.max(maxImportance - minImportance, 0.0001)) * plotWidth
  const yOf = (value: number) => margin.top + plotHeight - ((value - minPerformance) / Math.max(maxPerformance - minPerformance, 0.0001)) * plotHeight
  const targetLabel = items.find((item) => item.target)?.target || 'target construct'
  const meanX = xOf(importanceMean)
  const meanY = yOf(Math.max(0, Math.min(100, performanceMean)))
  const xTicks = niceTicks(minImportance, maxImportance, 4).ticks.filter((tick) => tick >= minImportance && tick <= maxImportance)
  const yTicks = [0, 25, 50, 75, 100]

  const xTickSvg = xTicks.map((tick) => `
    <line x1="${xOf(tick)}" y1="${margin.top}" x2="${xOf(tick)}" y2="${margin.top + plotHeight}" stroke="${EXP.border}" stroke-width="0.8" opacity="0.55"/>
    <text x="${xOf(tick)}" y="${height - 20}" text-anchor="middle" font-size="10" fill="${EXP.muted}" font-family="system-ui,sans-serif">${tick === 0 ? '0' : tick.toFixed(maxImportance <= 1 ? 2 : 1)}</text>
  `).join('')

  const yTickSvg = yTicks.map((tick) => `
    <line x1="${margin.left}" y1="${yOf(tick)}" x2="${margin.left + plotWidth}" y2="${yOf(tick)}" stroke="${EXP.border}" stroke-width="0.8" opacity="0.55"/>
    <text x="${margin.left - 10}" y="${yOf(tick) + 3}" text-anchor="end" font-size="10" fill="${EXP.muted}" font-family="system-ui,sans-serif">${tick}</text>
  `).join('')

  const isCipma = variant === 'cipma'
  const points = items.map((item) => {
    const color = getPriorityMapColor(item.priority)
    const cx = xOf(item.importance)
    const cy = yOf(Math.max(0, Math.min(100, item.performance)))
    const halo = !isCipma && item.necessary
      ? `<circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="${C_WARN}" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.6"/>`
      : ''
    const marker = isCipma
      ? item.necessary
        ? `<circle cx="${cx}" cy="${cy}" r="5" fill="${CIPMA_NECESSARY_COLOR}" stroke="${CIPMA_NECESSARY_COLOR}" stroke-width="1.2" opacity="0.95"/>`
        : `<circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="${CIPMA_SUFFICIENT_COLOR}" stroke-width="1.6" opacity="0.95"/>`
      : `<circle cx="${cx}" cy="${cy}" r="5" fill="${color}" stroke="${EXP.bg}" stroke-width="1.2" opacity="0.95"/>`
    const labelX = cx > margin.left + plotWidth - 96 ? cx - 12 : cx + 12
    const textAnchor = cx > margin.left + plotWidth - 96 ? 'end' : 'start'
    return `
      ${halo}
      ${marker}
      <text x="${labelX}" y="${cy + 4}" text-anchor="${textAnchor}" font-size="10.5" fill="${EXP.text}" font-family="system-ui,sans-serif" font-weight="650">${expEscape(expTrunc(item.label, 16))}</text>
    `
  }).join('')
  const legend = isCipma
    ? `<circle cx="${width - 178}" cy="${margin.top + 8}" r="4.5" fill="${CIPMA_NECESSARY_COLOR}" stroke="${CIPMA_NECESSARY_COLOR}" stroke-width="1.2"/>
      <text x="${width - 168}" y="${margin.top + 11}" font-size="9" fill="${EXP.muted}" font-family="system-ui,sans-serif">Necessary + sufficient</text>
      <circle cx="${width - 178}" cy="${margin.top + 24}" r="4.5" fill="none" stroke="${CIPMA_SUFFICIENT_COLOR}" stroke-width="1.6"/>
      <text x="${width - 168}" y="${margin.top + 27}" font-size="9" fill="${EXP.muted}" font-family="system-ui,sans-serif">Sufficient only</text>`
    : ''

  return `<figure style="margin:0 0 16px">
    <figcaption style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-family:system-ui,sans-serif">${title}</figcaption>
    <svg viewBox="0 0 ${width} ${height}" width="100%" style="display:block;border-radius:6px">
      <rect width="${width}" height="${height}" fill="${EXP.bg}" rx="6"/>
      <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="transparent" stroke="${EXP.border}" stroke-width="1.2"/>
      <line x1="${meanX}" y1="${margin.top}" x2="${meanX}" y2="${margin.top + plotHeight}" stroke="${EXP.border}" stroke-width="1" stroke-dasharray="4 4" opacity="0.8"/>
      <line x1="${margin.left}" y1="${meanY}" x2="${margin.left + plotWidth}" y2="${meanY}" stroke="${EXP.border}" stroke-width="1" stroke-dasharray="4 4" opacity="0.8"/>
      <text x="${Math.min(meanX + 8, margin.left + plotWidth - 110)}" y="${margin.top + 12}" font-size="10.5" fill="${EXP.muted}" font-family="system-ui,sans-serif" font-weight="600">median importance</text>
      <text x="${margin.left + 8}" y="${meanY - 8}" font-size="10.5" fill="${EXP.muted}" font-family="system-ui,sans-serif" font-weight="600">median performance</text>
      ${xTickSvg}
      ${yTickSvg}
      <text x="${margin.left + plotWidth / 2}" y="${height - 5}" text-anchor="middle" font-size="11" fill="${EXP.text}" font-family="system-ui,sans-serif" font-weight="600">Importance: absolute total effect on ${expEscape(expTrunc(targetLabel, 28))}</text>
      <text x="18" y="${margin.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90, 18, ${margin.top + plotHeight / 2})" font-size="11" fill="${EXP.text}" font-family="system-ui,sans-serif" font-weight="600">Performance (0-100)</text>
      ${points}
      ${legend}
    </svg>
  </figure>`
}

function exportCeilingLineChart(groups: CeilingSeries[], title: string): string {
  const width = 640
  const chartHeight = 300
  const gap = 14
  const margin = { left: 56, right: 48, top: 28, bottom: 42 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = chartHeight - margin.top - margin.bottom
  const totalHeight = groups.length * chartHeight + Math.max(groups.length - 1, 0) * gap

  const charts = groups.map((group, groupIndex) => {
    const offsetY = groupIndex * (chartHeight + gap)
    const displayGroup = normalizeCeilingGroup(group)
    const xOf = (value: number) => margin.left + (value / 100) * plotWidth
    const yOf = (value: number) => offsetY + margin.top + plotHeight - (value / 100) * plotHeight
    const xTicks = CEILING_AXIS_TICKS.map((tick) => `
      <line x1="${xOf(tick)}" y1="${offsetY + margin.top}" x2="${xOf(tick)}" y2="${offsetY + margin.top + plotHeight}" stroke="${EXP.border}" stroke-width="0.8" opacity="0.55"/>
      <text x="${xOf(tick)}" y="${offsetY + chartHeight - 18}" text-anchor="middle" font-size="10" fill="${EXP.muted}" font-family="system-ui,sans-serif">${formatCeilingAxisTick(tick)}</text>
    `).join('')
    const yTicks = CEILING_AXIS_TICKS.map((tick) => `
      <line x1="${margin.left}" y1="${yOf(tick)}" x2="${margin.left + plotWidth}" y2="${yOf(tick)}" stroke="${EXP.border}" stroke-width="0.8" opacity="0.55"/>
      <text x="${margin.left + plotWidth + 9}" y="${yOf(tick) + 3}" text-anchor="start" font-size="10" fill="${EXP.muted}" font-family="system-ui,sans-serif">${formatCeilingAxisTick(tick, true)}</text>
    `).join('')
    const observed = displayGroup.observed.map((point) =>
      `<circle cx="${xOf(point.x)}" cy="${yOf(point.y)}" r="2.8" fill="${CEILING_SERIES_STYLES.observed.fill}" stroke="${EXP.bg}" stroke-width="0.8" opacity="0.86"/>`
    ).join('')
    const cePath = displayGroup.ceFdh.length > 1
      ? `<path d="${stepLinePath(displayGroup.ceFdh, xOf, yOf)}" fill="none" stroke="${CEILING_SERIES_STYLES.ceFdh.color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`
      : ''
    const cePoints = displayGroup.ceFdh.map((point) =>
      `<circle cx="${xOf(point.x)}" cy="${yOf(point.y)}" r="4" fill="${CEILING_SERIES_STYLES.ceFdh.color}" stroke="${EXP.bg}" stroke-width="1.5"/>`
    ).join('')
    const crPath = displayGroup.crFdh.length > 1
      ? `<path d="${straightLinePath(displayGroup.crFdh, xOf, yOf)}" fill="none" stroke="${CEILING_SERIES_STYLES.crFdh.color}" stroke-width="2.4" stroke-dasharray="6 4" stroke-linecap="round"/>`
      : ''
    const crPoints = displayGroup.crFdh.map((point) => {
      const cx = xOf(point.x)
      const cy = yOf(point.y)
      return `<rect x="${cx - 3.4}" y="${cy - 3.4}" width="6.8" height="6.8" rx="1.1" fill="${CEILING_SERIES_STYLES.crFdh.color}" stroke="${EXP.bg}" stroke-width="1.5" transform="rotate(45 ${cx} ${cy})"/>`
    }).join('')
    return `
      <rect x="0" y="${offsetY}" width="${width}" height="${chartHeight}" fill="${EXP.bg}" rx="6"/>
      <rect x="${margin.left}" y="${offsetY + margin.top}" width="${plotWidth}" height="${plotHeight}" fill="transparent" stroke="${EXP.border}" stroke-width="1.2"/>
      <text x="${margin.left + 10}" y="${offsetY + 18}" font-size="10.5" fill="${CEILING_SERIES_STYLES.ceFdh.color}" font-family="system-ui,sans-serif" font-weight="700">CE-FDH ceiling</text>
      <line x1="${margin.left + 116}" y1="${offsetY + 15}" x2="${margin.left + 158}" y2="${offsetY + 15}" stroke="${CEILING_SERIES_STYLES.ceFdh.color}" stroke-width="2.6"/>
      <text x="${margin.left + 180}" y="${offsetY + 18}" font-size="10.5" fill="${CEILING_SERIES_STYLES.crFdh.color}" font-family="system-ui,sans-serif" font-weight="700">CR-FDH</text>
      <line x1="${margin.left + 235}" y1="${offsetY + 15}" x2="${margin.left + 277}" y2="${offsetY + 15}" stroke="${CEILING_SERIES_STYLES.crFdh.color}" stroke-width="2.4" stroke-dasharray="6 4"/>
      ${xTicks}
      ${yTicks}
      ${observed}
      ${cePath}
      ${cePoints}
      ${crPath}
      ${crPoints}
      <text x="${margin.left + plotWidth / 2}" y="${offsetY + chartHeight - 4}" text-anchor="middle" font-size="10.5" fill="${EXP.text}" font-family="system-ui,sans-serif" font-weight="600">${expEscape(expTrunc(group.condition, 32))} range (0-100)</text>
      <text x="16" y="${offsetY + margin.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90, 16, ${offsetY + margin.top + plotHeight / 2})" font-size="10.5" fill="${EXP.text}" font-family="system-ui,sans-serif" font-weight="600">${expEscape(expTrunc(group.target || 'Outcome', 24))} range (0-100)</text>
    `
  }).join('')

  return `<figure style="margin:0 0 16px">
    <figcaption style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-family:system-ui,sans-serif">${title}</figcaption>
    <svg viewBox="0 0 ${width} ${totalHeight}" width="100%" style="display:block;border-radius:6px">
      ${charts}
    </svg>
  </figure>`
}

function exportDotPlotChart(items: DotPlotItem[], title: string): string {
  const EML = 172, EMR = 52, EMT = 28, EMB = 36
  const ESVGW = 640
  const dataMin = Math.min(...items.map((item) => item.value), 0)
  const dataMax = Math.max(...items.map((item) => item.value), 0)
  const { min, max, ticks } = niceTicks(dataMin, dataMax)
  const plotW = ESVGW - EML - EMR
  const svgH = EMT + items.length * ROW_H + EMB
  const sX = (value: number) => expScaleX(value, min, max, plotW, EML)
  const x0 = sX(0)

  const gridLines = ticks.map((tick) =>
    `<line x1="${sX(tick)}" y1="${EMT - 4}" x2="${sX(tick)}" y2="${svgH - EMB}" stroke="${EXP.border}" stroke-width="${tick === 0 ? 1 : 0.5}" ${tick !== 0 ? 'stroke-dasharray="2 4"' : ''}/>`
  ).join('')

  const pointsSvg = items.map((item, index) => {
    const cy = EMT + index * ROW_H + ROW_H / 2
    const x = sX(item.value)
    return `
      <text x="${EML - 8}" y="${cy + 3.5}" text-anchor="end" font-size="10" fill="${EXP.text}" font-family="system-ui,sans-serif">${expTrunc(item.label)}</text>
      <line x1="${x0}" y1="${cy}" x2="${x}" y2="${cy}" stroke="${item.color}" stroke-width="1.2" opacity="0.4"/>
      <circle cx="${x}" cy="${cy}" r="4" fill="${item.color}" opacity="0.95"/>
      <text x="${x + (item.value >= 0 ? 8 : -8)}" y="${cy + 3.5}" text-anchor="${item.value >= 0 ? 'start' : 'end'}" font-size="8.5" fill="${item.color}" font-family="system-ui,sans-serif" font-weight="600">${item.value.toFixed(3)}</text>
    `
  }).join('')

  const axisSvg = ticks.map((tick) =>
    `<line x1="${sX(tick)}" y1="${svgH - EMB}" x2="${sX(tick)}" y2="${svgH - EMB + 4}" stroke="${EXP.border}" stroke-width="0.5"/>
    <text x="${sX(tick)}" y="${svgH - EMB + 14}" text-anchor="middle" font-size="9" fill="${EXP.muted}" font-family="system-ui,sans-serif">${Math.abs(tick) < 0.001 ? '0' : tick % 1 === 0 ? tick : tick.toFixed(2)}</text>`
  ).join('')

  return `<figure style="margin:0 0 16px">
    <figcaption style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-family:system-ui,sans-serif">${title}</figcaption>
    <svg viewBox="0 0 ${ESVGW} ${svgH}" width="100%" style="display:block;border-radius:6px">
      <rect width="${ESVGW}" height="${svgH}" fill="${EXP.bg}" rx="6"/>
      ${gridLines}${pointsSvg}${axisSvg}
    </svg>
  </figure>`
}

function exportHistogramChart(values: number[], title: string): string {
  const bins = histogramBins(values)
  if (!bins.length) return ''
  const width = 640
  const height = 260
  const margin = { left: 40, right: 20, top: 24, bottom: 34 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const maxCount = Math.max(...bins.map((bin) => bin.count), 1)
  const barWidth = plotWidth / Math.max(bins.length, 1)

  const barsSvg = bins.map((bin, index) => {
    const x = margin.left + index * barWidth + 1
    const y = margin.top + plotHeight - (bin.count / maxCount) * plotHeight
    const barHeight = Math.max(2, margin.top + plotHeight - y)
    return `<rect x="${x}" y="${y}" width="${Math.max(barWidth - 2, 2)}" height="${barHeight}" fill="${C_ACCENT}" opacity="0.78" rx="2"/>`
  }).join('')

  return `<figure style="margin:0 0 16px">
    <figcaption style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-family:system-ui,sans-serif">${title}</figcaption>
    <svg viewBox="0 0 ${width} ${height}" width="100%" style="display:block;border-radius:6px">
      <rect width="${width}" height="${height}" fill="${EXP.bg}" rx="6"/>
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="${EXP.border}" stroke-width="1"/>
      <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" stroke="${EXP.border}" stroke-width="1"/>
      ${barsSvg}
      <text x="${margin.left}" y="${height - 10}" font-size="9" fill="${EXP.muted}" font-family="system-ui,sans-serif">Min ${Math.min(...values).toFixed(3)}</text>
      <text x="${width - margin.right}" y="${height - 10}" text-anchor="end" font-size="9" fill="${EXP.muted}" font-family="system-ui,sans-serif">Max ${Math.max(...values).toFixed(3)}</text>
    </svg>
  </figure>`
}

function exportHeatmapChart(matrix: HeatmapMatrix, title: string): string {
  const cellWidth = 52
  const cellHeight = 30
  const cellGap = 4
  const longestRowLabel = Math.max(0, ...matrix.rowLabels.map((label) => label.length))
  const left = Math.min(220, Math.max(136, longestRowLabel * 6 + 36))
  const top = matrix.xAxisLabel ? 72 : 58
  const plotWidth = matrix.colLabels.length * (cellWidth + cellGap) - cellGap
  const plotHeight = matrix.rowLabels.length * (cellHeight + cellGap) - cellGap
  const width = Math.max(640, left + plotWidth + 32)
  const height = top + plotHeight + 72
  const finiteValues = matrix.values
    .flatMap((row) => row)
    .filter((value): value is number => value != null && Number.isFinite(value))
  const minValue = finiteValues.length ? Math.min(...finiteValues) : 0
  const maxValue = finiteValues.length ? Math.max(...finiteValues) : 1
  const maxAbs = Math.max(
    0.001,
    Math.abs(minValue),
    Math.abs(maxValue),
  )
  const rotateColumnLabels = matrix.colLabels.length > 7 || matrix.colLabels.some((label) => label.length > 10)

  const axisSvg = `${matrix.xAxisLabel ? `<text x="${left + plotWidth / 2}" y="20" text-anchor="middle" font-size="10" fill="${EXP.text}" font-family="system-ui,sans-serif" font-weight="700">${expEscape(matrix.xAxisLabel)}</text>` : ''}${matrix.yAxisLabel ? `<text x="18" y="${top + plotHeight / 2}" text-anchor="middle" font-size="10" fill="${EXP.text}" transform="rotate(-90 18 ${top + plotHeight / 2})" font-family="system-ui,sans-serif" font-weight="700">${expEscape(matrix.yAxisLabel)}</text>` : ''}`

  const labelsSvg = matrix.colLabels.map((label, index) =>
    `<text x="${left + index * (cellWidth + cellGap) + cellWidth / 2}" y="${rotateColumnLabels ? 42 : 34}" text-anchor="middle" font-size="9" fill="${EXP.muted}" ${rotateColumnLabels ? `transform="rotate(-28 ${left + index * (cellWidth + cellGap) + cellWidth / 2} 42)"` : ''} font-family="system-ui,sans-serif">${expTrunc(label, 12)}</text>`
  ).join('') + matrix.rowLabels.map((label, rowIndex) =>
    `<text x="${left - 8}" y="${top + rowIndex * (cellHeight + cellGap) + cellHeight / 2 + 3}" text-anchor="end" font-size="10" fill="${EXP.text}" font-family="system-ui,sans-serif">${expTrunc(label, 24)}</text>`
  ).join('')

  const cellsSvg = matrix.values.map((row, rowIndex) =>
    row.map((value, colIndex) => {
      const x = left + colIndex * (cellWidth + cellGap)
      const y = top + rowIndex * (cellHeight + cellGap)
      const fill = value == null ? 'rgba(255,255,255,0.03)' : heatColor(value, minValue, maxValue)
      const textFill = value != null && Math.abs(value) > maxAbs * 0.58 ? '#111111' : EXP.text
      const displayValue = matrix.valueLabels?.[rowIndex]?.[colIndex] ?? (value == null ? matrix.missingLabel ?? '—' : value.toFixed(2))
      return `
        <rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" rx="5" fill="${fill}" stroke="${EXP.border}" stroke-width="0.45"/>
        <text x="${x + cellWidth / 2}" y="${y + cellHeight / 2 + 3}" text-anchor="middle" font-size="9" fill="${textFill}" font-family="system-ui,sans-serif" font-weight="600">${expEscape(displayValue)}</text>
      `
    }).join('')
  ).join('')

  return `<figure style="margin:0 0 16px;overflow-x:auto">
    <figcaption style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-family:system-ui,sans-serif">${title}</figcaption>
    <svg width="${width}" height="${height}" style="display:block;min-width:${width}px;border-radius:6px">
      <rect width="${width}" height="${height}" fill="${EXP.bg}" rx="6"/>
      ${axisSvg}
      ${labelsSvg}
      ${cellsSvg}
      <text x="${left}" y="${height - 14}" font-size="9" fill="${EXP.muted}" font-family="system-ui,sans-serif">Higher intensity = larger absolute ${matrix.legendLabel.toLowerCase()}</text>
    </svg>
  </figure>`
}

function exportScorecardChart(items: ScorecardItem[], title: string): string {
  const width = 640
  const cardHeight = 96
  const gap = 12
  const cardWidth = (width - gap * 3) / 2
  const rows = Math.ceil(items.length / 2)
  const height = 24 + rows * (cardHeight + gap) + 20

  const cardsSvg = items.map((item, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = gap + col * (cardWidth + gap)
    const y = 24 + row * (cardHeight + gap)
    return `
      <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="10" fill="${EXP.bg}" stroke="${item.tone ?? EXP.border}" stroke-width="1"/>
      <text x="${x + 16}" y="${y + 22}" font-size="10" fill="${EXP.muted}" font-family="system-ui,sans-serif">${item.label}</text>
      <text x="${x + 16}" y="${y + 56}" font-size="26" fill="${EXP.text}" font-family="system-ui,sans-serif" font-weight="700">${item.value}</text>
      ${item.meta ? `<text x="${x + 16}" y="${y + 78}" font-size="10" fill="${EXP.muted}" font-family="system-ui,sans-serif">Threshold ${item.meta}</text>` : ''}
    `
  }).join('')

  return `<figure style="margin:0 0 16px">
    <figcaption style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-family:system-ui,sans-serif">${title}</figcaption>
    <svg viewBox="0 0 ${width} ${height}" width="100%" style="display:block;border-radius:6px">
      <rect width="${width}" height="${height}" fill="#161616" rx="6"/>
      ${cardsSvg}
    </svg>
  </figure>`
}
