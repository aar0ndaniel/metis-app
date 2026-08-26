import type { Workspace, WorkspaceModelChild } from '../types/workspace'
import { stripModelDisplayName } from './displayNames.ts'

export interface TemporaryModelSession {
  id: string
  name: string
  type: 'model'
  badge?: 'Calculated' | 'Draft'
  sourceModelId: string
  sourceWorkspaceId: string
  linkedDatasetId?: string
  createdAt: string
  updatedAt: string
  meta?: string
  state: {
    constructs: any[]
    paths: any[]
    preferredLatentShape?: 'circle' | 'square' | 'hexagon' | 'oval' | 'rectangle'
    preferredIndicatorsPosition?: any
    interactionTerms?: any[]
    higherOrderConstructs?: any[]
    algorithmSettings?: any
    analysisSettings?: any
    basePlsAnalysis?: any
    diagramBaseResults?: any
    transientResults?: any
    [key: string]: any
  }
  stats?: { r2?: string; srmr?: string }
}

const temporaryModelRegistry = new Map<string, TemporaryModelSession>()

export const TEMPORARY_MODEL_PREFIX = 'temp-model-'

export function isTemporaryModelId(id: string | null | undefined): boolean {
  if (typeof id !== 'string' || !id) return false
  return id.startsWith(TEMPORARY_MODEL_PREFIX)
}

export function createTemporaryModelSession(
  sourceModel: WorkspaceModelChild,
  sourceWorkspace: Workspace,
): TemporaryModelSession {
  const tempId = `${TEMPORARY_MODEL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const nowIso = new Date().toISOString()
  const baseName = stripModelDisplayName(sourceModel.name || 'Model')
  const tempName = `${baseName} — Temporary.hbe`

  const sourceState = sourceModel.state || {}
  const clonedSourceState = structuredClone(sourceState) as TemporaryModelSession['state']
  for (const transientKey of ['analysis', 'basePlsAnalysis', 'diagramBaseResults', 'transientResults', 'micomCache']) {
    delete clonedSourceState[transientKey]
  }

  const session: TemporaryModelSession = {
    id: tempId,
    name: tempName,
    type: 'model',
    badge: 'Draft',
    sourceModelId: sourceModel.id,
    sourceWorkspaceId: sourceWorkspace.id,
    linkedDatasetId: sourceModel.linkedDatasetId ?? sourceWorkspace.defaultDatasetId,
    createdAt: nowIso,
    updatedAt: nowIso,
    meta: 'Temporary experimental model copy',
    state: {
      ...clonedSourceState,
      constructs: Array.isArray(clonedSourceState.constructs) ? clonedSourceState.constructs : [],
      paths: Array.isArray(clonedSourceState.paths) ? clonedSourceState.paths : [],
      preferredLatentShape: sourceState.preferredLatentShape ?? 'circle',
      basePlsAnalysis: null,
      diagramBaseResults: null,
      transientResults: null,
    },
  }

  temporaryModelRegistry.set(tempId, session)
  return session
}

export function getTemporaryModelSession(id: string | null | undefined): TemporaryModelSession | undefined {
  if (!id) return undefined
  return temporaryModelRegistry.get(id)
}

export function setTemporaryModelSession(session: TemporaryModelSession): void {
  if (!session?.id) return
  temporaryModelRegistry.set(session.id, session)
}

export function updateTemporaryModelSession(
  id: string,
  updater: (prev: TemporaryModelSession) => TemporaryModelSession,
): TemporaryModelSession | undefined {
  const current = temporaryModelRegistry.get(id)
  if (!current) return undefined
  const updated = updater(current)
  temporaryModelRegistry.set(id, updated)
  return updated
}

export function deleteTemporaryModelSession(id: string): boolean {
  return temporaryModelRegistry.delete(id)
}

export function clearAllTemporaryModelSessions(): void {
  temporaryModelRegistry.clear()
}

export function getAllTemporaryModelSessions(): TemporaryModelSession[] {
  return Array.from(temporaryModelRegistry.values())
}
