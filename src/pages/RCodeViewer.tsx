import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, UploadSimple, ArrowRight } from '@phosphor-icons/react'

const DEMO_CODE = `# seminr model script — TAM Study KNUST
library(seminr)

# Define measurement model
mm <- constructs(
  reflective("ATT",  multi_items("ATT_",  1:4)),
  reflective("BI",   multi_items("BI_",   1:4)),
  composite("DC",    single_item(c("DAM","Ev","PR","SFA","SMD"))),
  reflective("PEOU", multi_items("PEOU_", 1:4)),
  reflective("PU",   multi_items("PU_",   1:4)),
  reflective("SE",   multi_items("SE_",   1:3))
)

# Define structural model
sm <- relationships(
  paths(from = c("DC", "SE"),   to = c("PEOU", "PU")),
  paths(from = "PEOU",          to = c("ATT", "PU")),
  paths(from = "PU",            to = "ATT"),
  paths(from = "ATT",           to = "BI")
)

# Estimate PLS model
model <- estimate_pls(
  data               = read.csv("Data_analysis_UPDATED_new.csv"),
  measurement_model  = mm,
  structural_model   = sm
)

# Summarise results
sum_model <- summary(model)
print(sum_model$paths)
print(sum_model$reliability)
`

function CodeLine({ line, idx }: { line: string; idx: number }) {
  let content: React.ReactNode = line || ' '
  if (line.trim().startsWith('#')) {
    content = <span style={{ color: 'var(--color-text-muted)' }}>{line}</span>
  } else if (line.trim().startsWith('library')) {
    content = (
      <>
        <span style={{ color: '#A78BFA' }}>library</span>
        <span style={{ color: '#B0B0B0' }}>{line.slice(line.indexOf('('))}</span>
      </>
    )
  } else if (line.includes('<-')) {
    const idx2 = line.indexOf('<-')
    const lhs = line.slice(0, idx2)
    const rhs = line.slice(idx2 + 2)
    content = (
      <>
        <span style={{ color: '#F0F0F0' }}>{lhs}</span>
        <span style={{ color: 'var(--color-text-muted)' }}>{'<-'}</span>
        <span style={{ color: 'var(--color-accent)' }}>{rhs}</span>
      </>
    )
  } else if (/paths\(|reflective\(|composite\(|multi_items\(|single_item\(/.test(line)) {
    content = <span style={{ color: 'var(--color-accent)' }}>{line}</span>
  } else if (/print\(|summary\(|estimate_pls\(|read\.csv\(/.test(line)) {
    content = <span style={{ color: '#32D583' }}>{line}</span>
  } else {
    content = <span style={{ color: '#B0B0B0' }}>{line}</span>
  }
  return (
    <div className="flex hover:bg-white/[0.02]">
      <span
        className="text-right pr-4 select-none shrink-0"
        style={{ width: 48, color: 'var(--color-border)', fontSize: 11, lineHeight: '22px', fontFamily: 'monospace' }}
      >
        {idx + 1}
      </span>
      <span style={{ fontSize: 12, lineHeight: '22px', fontFamily: 'monospace', flex: 1, paddingRight: 24 }}>
        {content}
      </span>
    </div>
  )
}

type ParsedConstruct = {
  id: string
  name: string
  type: 'Reflective' | 'Formative'
  color: string
  x: number
  y: number
  radius: number
  indicators: Array<{ name: string; loading: number | null; ox?: number; oy?: number }>
  labelColor: string
  labelBold: boolean
  labelItalic: boolean
  labelSize: number
  shape?: 'circle' | 'square'
  indicatorDirection?: 'top' | 'right' | 'bottom' | 'left'
}

type ParsedPath = { id: string; from: string; to: string }

function parseQuotedTokens(input: string): string[] {
  const out: string[] = []
  const regex = /"([^"]+)"|'([^']+)'/g
  let match: RegExpExecArray | null = null
  while ((match = regex.exec(input)) !== null) {
    const val = match[1] ?? match[2]
    if (val && val.trim()) out.push(val.trim())
  }
  return out
}

function parseArgGroup(line: string, key: string): string | null {
  const re = new RegExp(`${key}\\s*=\\s*(c\\([^)]*\\)|"[^"]*"|'[^']*')`)
  const m = line.match(re)
  if (!m) return null
  return m[1]
}

function parseRModelToCanvas(source: string): { constructs: ParsedConstruct[]; paths: ParsedPath[] } {
  const lines = source.split(/\r?\n/).map((line) => line.trim())

  const constructs: ParsedConstruct[] = []
  const constructByName = new Map<string, string>()

  lines.forEach((line) => {
    const isConstruct = /^(reflective|composite)\s*\(/i.test(line)
    if (!isConstruct) return

    const tokens = parseQuotedTokens(line)
    if (!tokens.length) return

    const constructName = tokens[0]
    let indicatorNames = tokens.slice(1)

    const multiMatches = Array.from(line.matchAll(/multi_items\s*\(\s*["']([^"']+)["']\s*,\s*(\d+)\s*:\s*(\d+)\s*\)/gi))
    if (multiMatches.length) {
      const expanded: string[] = []
      multiMatches.forEach((m) => {
        const prefix = m[1]
        const start = Number(m[2])
        const end = Number(m[3])
        if (!Number.isFinite(start) || !Number.isFinite(end)) return
        for (let i = start; i <= end; i += 1) expanded.push(`${prefix}${i}`)
      })
      if (expanded.length) indicatorNames = expanded
    }

    if (/single_item\s*\(/i.test(line) || /\bc\s*\(/i.test(line)) {
      const listTokens = parseQuotedTokens(line).slice(1)
      if (listTokens.length) indicatorNames = listTokens
    }

    indicatorNames = Array.from(new Set(indicatorNames.filter(Boolean)))
    const isReflective = /^reflective\s*\(/i.test(line)

    const idx = constructs.length
    const id = `rc_${constructName.replace(/\s+/g, '_').toLowerCase()}_${idx}`
    constructByName.set(constructName, id)

    const perRow = 4
    const row = Math.floor(idx / perRow)
    const col = idx % perRow

    constructs.push({
      id,
      name: constructName,
      type: isReflective ? 'Reflective' : 'Formative',
      color: 'var(--color-accent)',
      x: 220 + col * 260,
      y: 180 + row * 220,
      radius: 42,
      indicators: indicatorNames.map((name) => ({ name, loading: null })),
      labelColor: '#F0F0F0',
      labelBold: false,
      labelItalic: false,
      labelSize: 14,
      shape: 'circle',
      indicatorDirection: 'bottom',
    })
  })

  const paths: ParsedPath[] = []
  lines.forEach((line) => {
    if (!/^paths\s*\(/i.test(line)) return

    const fromRaw = parseArgGroup(line, 'from')
    const toRaw = parseArgGroup(line, 'to')
    if (!fromRaw || !toRaw) return

    const fromVals = parseQuotedTokens(fromRaw)
    const toVals = parseQuotedTokens(toRaw)
    if (!fromVals.length || !toVals.length) return

    fromVals.forEach((fromName) => {
      toVals.forEach((toName) => {
        const fromId = constructByName.get(fromName)
        const toId = constructByName.get(toName)
        if (!fromId || !toId || fromId === toId) return
        const id = `rcp_${fromId}_${toId}`
        if (paths.some((p) => p.id === id)) return
        paths.push({ id, from: fromId, to: toId })
      })
    })
  })

  return { constructs, paths }
}

export default function RCodeViewer() {
  const navigate = useNavigate()
  const location = useLocation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileName = (location.state as { fileName?: string })?.fileName ?? 'Untitled.R'
  const initialFilePath = (location.state as { filePath?: string })?.filePath
  const [codeText, setCodeText] = useState<string>(DEMO_CODE)

  useEffect(() => {
    const readInitial = async () => {
      if (!initialFilePath) return
      const api = (window as any).electronAPI
      if (!api?.readFile) return
      const res = await api.readFile(initialFilePath)
      if (!res?.success || !res?.data) return
      const decoded = atob(res.data)
      setCodeText(decoded)
    }
    readInitial()
  }, [initialFilePath])

  const parsedModel = useMemo(() => parseRModelToCanvas(codeText), [codeText])

  const handleImport = () => {
    fileInputRef.current?.click()
  }

  const handleContinue = () => {
    localStorage.setItem('pls:rcode-model-state', JSON.stringify(parsedModel))
    localStorage.setItem('pls:canvas-model', JSON.stringify(parsedModel))
    navigate('/canvas/from-rcode')
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--color-page)' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".r,.R"
        className="hidden"
        onChange={() => {
          const file = fileInputRef.current?.files?.[0]
          if (!file) return
          const reader = new FileReader()
          reader.onload = () => {
            const text = String(reader.result ?? '')
            if (text.trim()) setCodeText(text)
            if (fileInputRef.current) fileInputRef.current.value = ''
          }
          reader.readAsText(file)
        }}
      />

      {/* Header */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          height: 52,
          padding: '0 20px',
          backgroundColor: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          gap: 12,
        }}
      >
        <div className="flex items-center" style={{ gap: 12 }}>
          <button
            onClick={() => navigate('/')}
            className="flex items-center transition-colors hover:bg-white/[0.05] rounded"
            style={{ gap: 6, padding: '5px 10px', borderRadius: 6 }}
          >
            <ArrowLeft size={14} color="var(--color-text-muted)" />
            <span style={{ color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>Back</span>
          </button>
          <div style={{ width: 1, height: 16, backgroundColor: 'var(--color-hover)' }} />
          <span style={{ color: '#F0F0F0', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600 }}>
            {fileName}
          </span>
        </div>

        <button
          onClick={handleImport}
          className="flex items-center transition-colors hover:bg-white/[0.05]"
          style={{ gap: 6, padding: '6px 12px', borderRadius: 6, backgroundColor: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}
        >
          <UploadSimple size={13} color="#B0B0B0" />
          <span style={{ color: '#B0B0B0', fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 500 }}>
            Import .R file
          </span>
        </button>
      </div>

      {/* Code editor */}
      <div
        className="flex-1 overflow-auto"
        style={{ backgroundColor: 'var(--color-input)', fontFamily: 'monospace' }}
      >
        <div style={{ padding: '16px 0', minHeight: '100%' }}>
          {codeText.split('\n').map((line, idx) => (
            <CodeLine key={idx} line={line} idx={idx} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          height: 56,
          padding: '0 20px',
          backgroundColor: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <span style={{ color: 'var(--color-text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11, maxWidth: 440 }}>
          Model structure and constructs will be extracted from the R script automatically when you continue.
        </span>
        <button
          onClick={handleContinue}
          className="flex items-center shrink-0"
          style={{ gap: 8, padding: '8px 16px', borderRadius: 8, backgroundColor: 'var(--color-accent)' }}
        >
          <span style={{ color: 'var(--color-on-accent)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700 }}>
            Continue to Model Builder
          </span>
          <ArrowRight size={13} color="var(--color-on-accent)" />
        </button>
      </div>
    </div>
  )
}
