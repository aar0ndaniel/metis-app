export interface PersistDatasetInput {
  workspacePath: string
  datasetId: string
  fileName: string
  originalFilePath?: string
  fileContent?: string
  headers: string[]
  allRows: string[][]
}

export interface PersistDatasetResult {
  internalName: string
  datasetTempPath?: string
  absolutePath?: string
}

function escapeCsvCell(value: string): string {
  const safeValue = typeof value === 'string' ? value : String(value ?? '')
  if (safeValue.includes('"') || safeValue.includes(',') || safeValue.includes('\n') || safeValue.includes('\r')) {
    return `"${safeValue.replace(/"/g, '""')}"`
  }
  return safeValue
}

export function buildCsvText(headers: string[], allRows: string[][]): string {
  const headerLine = headers.map((header) => escapeCsvCell(header)).join(',')
  const dataLines = allRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
  return [headerLine, ...dataLines].join('\n')
}

export function encodeBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)))
}

export async function persistDatasetToWorkspace(input: PersistDatasetInput): Promise<PersistDatasetResult> {
  const api = (window as any).electronAPI
  if (!api) return { internalName: '' }

  if (input.originalFilePath && input.originalFilePath.trim().length > 0) {
    const copyResult = await api.copyToWorkspace({
      originalFilePath: input.originalFilePath,
      workspacePath: input.workspacePath,
      datasetId: input.datasetId,
    })

    if (!copyResult?.success) {
      throw new Error(copyResult?.error || 'Failed to copy dataset into the workspace.')
    }

    return {
      internalName: copyResult.internalName || input.fileName,
      datasetTempPath: typeof copyResult.datasetTempPath === 'string' && copyResult.datasetTempPath.trim().length > 0
        ? copyResult.datasetTempPath
        : (typeof copyResult.path === 'string' ? copyResult.path : undefined),
      absolutePath: typeof copyResult.path === 'string' ? copyResult.path : undefined,
    }
  }

  const csvText = buildCsvText(input.headers, input.allRows)
  const base64Data = input.fileContent || encodeBase64(csvText)
  const saveResult = await api.saveDatasetToWorkspace({
    workspacePath: input.workspacePath,
    datasetId: input.datasetId,
    fileName: input.fileName,
    base64Data,
  })

  if (!saveResult?.success) {
    throw new Error(saveResult?.error || 'Failed to save dataset into the workspace.')
  }

  return {
    internalName: saveResult.internalName || input.fileName,
    datasetTempPath: typeof saveResult.datasetTempPath === 'string' && saveResult.datasetTempPath.trim().length > 0
      ? saveResult.datasetTempPath
      : (typeof saveResult.path === 'string' ? saveResult.path : undefined),
    absolutePath: typeof saveResult.path === 'string' ? saveResult.path : undefined,
  }
}
