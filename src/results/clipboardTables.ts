export interface ExportTableSection {
  title: string
  headers: string[]
  rows: string[][]
  note?: string
}

export interface ClipboardTableBuildOptions {
  leadingHtml?: string
  leadingText?: string
}

function escapeHtml(value: unknown): string {
  const s = String(value ?? '')
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isNumericClipboardCell(value: string): boolean {
  const text = value.trim()
  if (!text || text === '-' || text === '—') return false
  if (/^<\s*-?(?:\d+|\d*\.\d+)$/.test(text)) return true

  const normalized = text.replace(/,/g, '')
  return /^-?(?:\d+|\d*\.\d+)(?:%|e[+-]?\d+)?$/i.test(normalized)
}

function formatClipboardCellValue(value: string): string {
  const text = String(value ?? '').trim()
  if (!text || text === '-' || text === '—') return '—'
  if (/^<\s*-?(?:\d+|\d*\.\d+)$/.test(text)) return text.replace(/\s+/g, '')

  const normalized = text.replace(/,/g, '')
  if (/^-?(?:\d*\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) {
    const numericValue = Number(normalized)
    return Number.isFinite(numericValue) ? numericValue.toFixed(3) : text
  }

  return text
}

function formatAcademicHeader(header: string): string {
  const escaped = escapeHtml(header)
  return escaped
    .replace(/β/g, '<em>β</em>')
    .replace(/ρ/g, '<em>ρ</em>')
    .replace(/R²/g, '<em>R²</em>')
    .replace(/Q²/g, '<em>Q²</em>')
    .replace(/f²/g, '<em>f²</em>')
    .replace(/\bT(?=\s*(statistics?|values?|value|stat\.?))/gi, '<em>t</em>')
    .replace(/\bP(?=\s*(values?|value))/gi, '<em>p</em>')
    .replace(/\bbeta\b/gi, '<em>β</em>')
    .replace(/\bR\s*(?:square|squared)\b/gi, '<em>R²</em>')
    .replace(/\bQ\s*(?:square|squared)\b/gi, '<em>Q²</em>')
    .replace(/\bf\s*(?:square|squared)\b/gi, '<em>f²</em>')
    .replace(/\brho_A\b/gi, '<em>rho_A</em>')
}

function buildClipboardNote(section: ExportTableSection): string {
  return section.note ?? ''
}

function getClipboardColumnAlignments(section: ExportTableSection): Array<'left' | 'right'> {
  return section.headers.map((_, columnIndex) => {
    if (columnIndex === 0) return 'left'

    const values = section.rows
      .map((row) => row[columnIndex] ?? '')
      .filter((value) => {
        const text = value.trim()
        return text.length > 0 && text !== '-' && text !== '—'
      })

    return values.length > 0 && values.every(isNumericClipboardCell) ? 'right' : 'left'
  })
}

export function buildClipboardTableHtml(
  sections: ExportTableSection[],
  panelTitle: string,
  options: ClipboardTableBuildOptions = {},
): string {
  const sectionHtml = sections.map((section, index) => {
    const title = sections.length > 1 ? section.title : panelTitle
    const alignments = getClipboardColumnAlignments(section)
    const thead = section.headers.length
      ? `<thead><tr>${section.headers.map((header, columnIndex) => `<th style="font-weight:400;border:none;border-top:1.5pt solid #000000;border-bottom:1.5pt solid #000000;padding:3pt 8pt;text-align:${alignments[columnIndex] ?? 'left'};">${formatAcademicHeader(header)}</th>`).join('')}</tr></thead>`
      : ''
    const tbody = `<tbody>${section.rows.map((row, rowIndex) => {
      const isLastRow = rowIndex === section.rows.length - 1
      return `<tr>${row.map((cell, columnIndex) => `<td style="border:none;${isLastRow ? 'border-bottom:1.5pt solid #000000;' : ''}padding:3pt 8pt;text-align:${alignments[columnIndex] ?? 'left'};">${escapeHtml(formatClipboardCellValue(cell))}</td>`).join('')}</tr>`
    }).join('')}</tbody>`
    const note = buildClipboardNote(section)
    const noteHtml = `<p style="margin:6pt 0 0;font-family:&quot;Times New Roman&quot;, Times, serif;font-size:10pt;color:#000000;"><em>Note.</em>${note ? ` ${note}` : ''}</p>`

    return `
      <section style="margin:0 0 18pt;">
        <p style="margin:0 0 2pt;font-family:&quot;Times New Roman&quot;, Times, serif;font-size:12pt;color:#000000;"><strong>Table ${index + 1}</strong></p>
        <p style="margin:0 0 8pt;font-family:&quot;Times New Roman&quot;, Times, serif;font-size:12pt;color:#000000;">${escapeHtml(title)}</p>
        <table style="border-collapse:collapse;font-family:&quot;Times New Roman&quot;, Times, serif;font-size:12pt;color:#000000;border-top:1.5pt solid #000000;border-bottom:1.5pt solid #000000;margin:0 0 6pt;">
          ${thead}
          ${tbody}
        </table>
        ${noteHtml}
      </section>
    `
  }).join('')

  return `
    <html>
      <body>
        <div style="font-family:&quot;Times New Roman&quot;, Times, serif;color:#000000;">
          ${options.leadingHtml ?? ''}
          ${sectionHtml}
        </div>
      </body>
    </html>
  `
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '')
}

export function buildClipboardTableText(
  sections: ExportTableSection[],
  panelTitle?: string,
  options: ClipboardTableBuildOptions = {},
): string {
  const tableText = sections.map((section, index) => {
    const title = sections.length > 1 ? section.title : (panelTitle || section.title)
    const lines = [`Table ${index + 1}`, title]
    if (section.headers.length) lines.push(section.headers.join('\t'))
    section.rows.forEach((row) => lines.push(row.map(formatClipboardCellValue).join('\t')))
    const note = buildClipboardNote(section)
    if (note) lines.push(`Note. ${stripHtml(note)}`)
    return lines.join('\n')
  }).join('\n\n')

  return [options.leadingText, tableText].filter(Boolean).join('\n\n')
}
