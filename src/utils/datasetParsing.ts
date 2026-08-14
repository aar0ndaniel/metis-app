import { isMissingDatasetValue } from './datasetMissing'

export interface ParseResult {
  headers: string[]
  rows: string[][]
  allRows: string[][]
  totalRows: number
  missing: number
  delimiter: string
}

const HEAD_ROWS = 5

function detectDelimiter(firstLine: string): string {
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestCount = 0
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length - 1
    if (count > bestCount) {
      bestCount = count
      best = candidate
    }
  }
  return best
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function stringifyExcelCellValue(value: any): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    return value.map((item) => stringifyExcelCellValue(item)).filter(Boolean).join(' ')
  }
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text
    if (Array.isArray(value.richText)) {
      return value.richText.map((item: any) => String(item?.text ?? '')).join('')
    }
    if (value.result !== undefined && value.result !== null) {
      return stringifyExcelCellValue(value.result)
    }
    if (typeof value.hyperlink === 'string' && typeof value.text === 'string') {
      return value.text
    }
    return String(value)
  }
  return String(value)
}

function parseCSVText(text: string, delimiter: string): ParseResult {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line) => line.trim())

  function splitLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuote = false
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]
      if (character === '"') {
        if (inQuote && line[index + 1] === '"') {
          current += '"'
          index += 1
        } else {
          inQuote = !inQuote
        }
      } else if (character === delimiter && !inQuote) {
        result.push(current.trim())
        current = ''
      } else {
        current += character
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = splitLine(lines[0] || '')
  const allRows = lines.slice(1).map(splitLine)
  const rows = allRows.slice(0, HEAD_ROWS)
  let missing = 0
  allRows.forEach((row) => row.forEach((cell) => {
    if (isMissingDatasetValue(cell)) missing += 1
  }))

  return { headers, rows, allRows, totalRows: allRows.length, missing, delimiter }
}

export async function parseExcelBase64(base64: string): Promise<ParseResult> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const bytes = decodeBase64ToUint8Array(base64)
  await workbook.xlsx.load(bytes.buffer as ArrayBuffer)

  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('Sheet appears empty')

  const data: string[][] = []
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : []
    data[rowNumber - 1] = values.map((cell) => stringifyExcelCellValue(cell))
  })

  if (data.length < 2) throw new Error('Sheet appears empty')

  const headers = data[0].map(String)
  const allRows = data.slice(1).map((row) => row.map(String))
  const rows = allRows.slice(0, HEAD_ROWS)
  let missing = 0
  allRows.forEach((row) => row.forEach((cell) => {
    if (isMissingDatasetValue(cell)) missing += 1
  }))

  return { headers, rows, allRows, totalRows: allRows.length, missing, delimiter: '' }
}

export async function parseDatasetBase64(fileName: string, base64: string, explicitDelimiter?: string): Promise<ParseResult> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'xlsx' || ext === 'xls') {
    return parseExcelBase64(base64)
  }
  if (ext !== 'csv' && ext !== '') {
    throw new Error('Unsupported dataset format. Please use CSV or Excel.')
  }

  const text = decodeURIComponent(escape(atob(base64)))
  const delimiter = explicitDelimiter || detectDelimiter(text.split(/\r?\n/)[0] ?? '')
  return parseCSVText(text, delimiter)
}
