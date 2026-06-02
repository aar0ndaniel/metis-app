import { parseDatasetBase64 } from './datasetParsing'
import {
  readDatasetViewCache,
  readLegacyDatasetViewCacheByWorkspaceName,
  writeDatasetViewCache,
} from './datasetViewCache'

export interface DatasetFileBridge {
  readFile?: (filePath: string) => Promise<any>
  extractDataset?: (payload: string | { adaFilePath: string; datasetId?: string }) => Promise<any>
}

export interface DatasetLoadRequest {
  datasetId?: string | null
  fileName?: string | null
  filePath?: string | null
  datasetTempPath?: string | null
  workspaceId?: string | null
  workspaceName?: string | null
  workspacePath?: string | null
  api?: DatasetFileBridge
}

export interface DatasetLoadResult {
  datasetId: string
  fileName: string
  filePath: string
  datasetTempPath: string
  absolutePath: string
  workspaceId: string
  workspaceName: string
  workspacePath: string
  headers: string[]
  allRows: string[][]
  totalRows: number
  missing: number
}

function isUsablePath(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function getBridge(api?: DatasetFileBridge): DatasetFileBridge | undefined {
  if (api) return api
  if (typeof window === 'undefined') return undefined
  return window.electronAPI
}

function normalizeCached(
  datasetId: string,
  cached: any,
  request: DatasetLoadRequest,
): DatasetLoadResult | null {
  if (!cached?.headers?.length || !Array.isArray(cached.allRows)) return null

  const fileName = String(request.fileName || cached.fileName || cached.filePath || `${datasetId}.csv`)
  const datasetTempPath = String(
    request.datasetTempPath || cached.datasetTempPath || cached.absolutePath || request.filePath || cached.filePath || '',
  )
  const filePath = String(request.filePath || cached.filePath || datasetTempPath || fileName)

  return {
    datasetId,
    fileName,
    filePath,
    datasetTempPath,
    absolutePath: datasetTempPath || filePath,
    workspaceId: String(request.workspaceId || cached.workspaceId || ''),
    workspaceName: String(request.workspaceName || cached.workspaceName || ''),
    workspacePath: String(request.workspacePath || cached.workspacePath || ''),
    headers: cached.headers,
    allRows: cached.allRows,
    totalRows: Number(cached.totalRows ?? cached.allRows.length ?? 0),
    missing: Number(cached.missing ?? 0),
  }
}

export function resolveDatasetFilePathFromRequest(
  request: DatasetLoadRequest,
  cached?: any,
): string {
  const candidatePaths = [
    request.datasetTempPath,
    cached?.datasetTempPath,
    cached?.absolutePath,
    cached?.filePath,
    request.filePath,
  ]

  for (const candidate of candidatePaths) {
    if (isUsablePath(candidate)) {
      return candidate.trim()
    }
  }

  const workspacePath = String(request.workspacePath || cached?.workspacePath || '').trim()
  if (!workspacePath) return ''

  const normalizedWorkspacePath = workspacePath.replace(/\\/g, '/')
  const filePath = String(request.filePath || cached?.filePath || '').trim()
  if (!filePath) return ''

  if (/^[A-Za-z]:[\\/]|^\//.test(filePath)) {
    return filePath
  }

  if (filePath === 'dataset.csv' && /\.(ada|metis|metisws)$/i.test(normalizedWorkspacePath)) {
    return ''
  }

  return `${normalizedWorkspacePath}/${filePath.replace(/^\/+/, '')}`
}

export async function loadDatasetSnapshot(request: DatasetLoadRequest): Promise<DatasetLoadResult | null> {
  const datasetId = String(request.datasetId || '').trim()
  const workspaceName = String(request.workspaceName || '').trim()
  const cached = readDatasetViewCache(datasetId) || readLegacyDatasetViewCacheByWorkspaceName(workspaceName)
  const normalizedCached = datasetId ? normalizeCached(datasetId, cached, request) : null
  if (normalizedCached) return normalizedCached
  if (!datasetId) return null

  const api = getBridge(request.api)
  if (!api?.readFile) {
    throw new Error('Dataset reader bridge is unavailable.')
  }

  const workspacePath = String(request.workspacePath || cached?.workspacePath || '').trim()
  const filePath = String(request.filePath || cached?.filePath || '').trim()
  let datasetTempPath = resolveDatasetFilePathFromRequest(request, cached)

  if (!datasetTempPath && workspacePath && api.extractDataset) {
    const extraction = await api.extractDataset({ adaFilePath: workspacePath, datasetId })
    if (extraction?.success && extraction.datasetTempPath) {
      datasetTempPath = String(extraction.datasetTempPath)
    }
  }

  if (!datasetTempPath) {
    throw new Error('Could not resolve the dataset file path.')
  }

  const fileResult = await api.readFile(datasetTempPath)
  if (!fileResult?.success || !fileResult?.data) {
    throw new Error(fileResult?.error || 'Could not read the dataset file.')
  }

  const resolvedFileName = String(request.fileName || cached?.fileName || filePath || datasetTempPath || `${datasetId}.csv`)
  const parsed = await parseDatasetBase64(resolvedFileName, fileResult.data)
  const result: DatasetLoadResult = {
    datasetId,
    fileName: resolvedFileName,
    filePath: filePath || datasetTempPath,
    datasetTempPath,
    absolutePath: datasetTempPath,
    workspaceId: String(request.workspaceId || cached?.workspaceId || ''),
    workspaceName,
    workspacePath,
    headers: parsed.headers,
    allRows: parsed.allRows,
    totalRows: parsed.totalRows,
    missing: parsed.missing,
  }

  writeDatasetViewCache(datasetId, {
    datasetId,
    fileName: result.fileName,
    filePath: result.filePath,
    workspaceId: result.workspaceId,
    workspaceName: result.workspaceName,
    workspacePath: result.workspacePath,
    headers: result.headers,
    allRows: result.allRows,
    totalRows: result.totalRows,
    missing: result.missing,
    datasetTempPath: result.datasetTempPath,
    absolutePath: result.absolutePath,
  })

  return result
}
