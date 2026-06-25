import type { VariableKind, WorkspaceDatasetChild } from '../types/workspace'
import { inferVariableTypesFromRows } from './datasetColumns'
import type { DatasetViewCacheEntry } from './datasetViewCache'

function usableHeaders(headers: unknown): string[] {
  if (!Array.isArray(headers)) return []
  return headers
    .map((header) => String(header ?? '').trim())
    .filter((header) => header.length > 0)
}

export function getModelCanvasDatasetHeaders(
  dataset?: Pick<WorkspaceDatasetChild, 'headers'> | null,
  cached?: Pick<DatasetViewCacheEntry, 'headers'> | null,
): string[] {
  const workspaceHeaders = usableHeaders(dataset?.headers)
  if (workspaceHeaders.length > 0) return workspaceHeaders
  return usableHeaders(cached?.headers)
}

export function getModelCanvasVariableTypes(
  dataset: Pick<WorkspaceDatasetChild, 'variableTypes'> | null | undefined,
  cached: Pick<DatasetViewCacheEntry, 'allRows'> | null | undefined,
  headers: string[],
): Record<string, VariableKind> {
  const savedTypes = dataset?.variableTypes ?? {}
  const hasSavedTypes = headers.some((header) => savedTypes[header] === 'MET' || savedTypes[header] === 'CAT')
  if (hasSavedTypes) return savedTypes

  if (headers.length > 0 && Array.isArray(cached?.allRows)) {
    return inferVariableTypesFromRows(headers, cached.allRows)
  }

  return {}
}
