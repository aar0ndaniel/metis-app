import type { Workspace, WorkspaceChild, WorkspaceModelChild } from '../types/workspace'
import { stripModelDisplayName } from './displayNames.ts'

interface ModelSnapshot {
  constructs: any[]
  paths: any[]
  preferredLatentShape?: unknown
}

interface WorkspacePersistenceApi {
  createWorkspace?: (workspace: Workspace) => Promise<any>
  saveWorkspace?: (workspace: Workspace) => Promise<any>
  deleteWorkspace?: (workspace: Partial<Workspace>) => Promise<any>
}

interface NewWorkspaceData {
  name: string
  description?: string
  color: string
}

interface BuildPermanentModelOptions {
  sourceModel: WorkspaceModelChild | Record<string, any>
  snapshot: ModelSnapshot
  modelId: string
  name: string
  nowIso: string
}

export function buildPermanentModelFromSource({
  sourceModel,
  snapshot,
  modelId,
  name,
  nowIso,
}: BuildPermanentModelOptions): WorkspaceModelChild {
  const sourceState = sourceModel?.state && typeof sourceModel.state === 'object' ? sourceModel.state : {}
  const {
    analysis: _analysis,
    basePlsAnalysis: _basePlsAnalysis,
    diagramBaseResults: _diagramBaseResults,
    transientResults: _transientResults,
    micomCache: _micomCache,
    ...persistentState
  } = sourceState

  const nextState: Record<string, unknown> = {
    ...structuredClone(persistentState),
    constructs: structuredClone(Array.isArray(snapshot.constructs) ? snapshot.constructs : []),
    paths: structuredClone(Array.isArray(snapshot.paths) ? snapshot.paths : []),
  }
  if (snapshot.preferredLatentShape !== undefined) {
    nextState.preferredLatentShape = snapshot.preferredLatentShape
  }

  return {
    id: modelId,
    name: `${stripModelDisplayName(name || 'Model')}.hbe`,
    type: 'model',
    badge: 'Draft',
    createdAt: nowIso,
    updatedAt: nowIso,
    ...(sourceModel.linkedDatasetId ? { linkedDatasetId: sourceModel.linkedDatasetId } : {}),
    state: nextState,
  }
}

interface PersistModelAsOptions {
  workspaces: Workspace[]
  sourceModel: WorkspaceModelChild | Record<string, any>
  snapshot: ModelSnapshot
  name: string
  targetWorkspaceId: string
  newWorkspaceData?: NewWorkspaceData
  api?: WorkspacePersistenceApi
  buildAdditionalChildren?: (model: WorkspaceModelChild) => WorkspaceChild[]
}

export interface PersistModelAsResult {
  workspaces: Workspace[]
  workspace: Workspace
  model: WorkspaceModelChild
  additionalChildren: WorkspaceChild[]
}

export async function saveWorkspaceOrThrow(
  api: WorkspacePersistenceApi | undefined,
  workspace: Workspace,
): Promise<any> {
  if (typeof api?.saveWorkspace !== 'function') {
    throw new Error('Workspace persistence is unavailable.')
  }
  const result = await api.saveWorkspace(workspace)
  if (!result?.success) {
    throw new Error(result?.error ?? 'Could not save the target workspace')
  }
  return result
}

export async function persistModelAs({
  workspaces,
  sourceModel,
  snapshot,
  name,
  targetWorkspaceId,
  newWorkspaceData,
  api = {},
  buildAdditionalChildren,
}: PersistModelAsOptions): Promise<PersistModelAsResult> {
  let targetId = targetWorkspaceId
  let availableWorkspaces = workspaces
  let createdWorkspace: Workspace | null = null

  try {
    if (newWorkspaceData && targetWorkspaceId === 'new') {
      if (
        typeof api.createWorkspace !== 'function'
        || typeof api.saveWorkspace !== 'function'
        || typeof api.deleteWorkspace !== 'function'
      ) {
        throw new Error('New-workspace promotion is unavailable because verified rollback is unavailable.')
      }
      const workspaceId = `ws-${Date.now()}`
      const workspace: Workspace = {
        id: workspaceId,
        name: `${newWorkspaceData.name}.metisws`,
        color: newWorkspaceData.color,
        expanded: true,
        children: [],
      }
      const createResult = await api.createWorkspace(workspace)
      if (!createResult?.success) {
        throw new Error(createResult?.error ?? 'Could not create the selected workspace')
      }
      createdWorkspace = { ...workspace, path: createResult.path ?? '' }
      availableWorkspaces = [...workspaces, createdWorkspace]
      targetId = workspaceId
    }

    const targetWorkspace = availableWorkspaces.find((workspace) => workspace.id === targetId)
    if (!targetWorkspace) throw new Error('Target workspace not found.')

    const linkedDatasetId = sourceModel.linkedDatasetId as string | undefined
    const sourceWorkspace = availableWorkspaces.find((workspace) => workspace.id === (sourceModel as any).sourceWorkspaceId)
      ?? availableWorkspaces.find((workspace) => workspace.children.some((child) => child.id === sourceModel.id))
    const targetLinkedDataset = linkedDatasetId
      ? targetWorkspace.children.find((child) => child.type === 'dataset' && child.id === linkedDatasetId)
      : undefined
    const copiedLinkedDataset = linkedDatasetId && sourceWorkspace?.id !== targetWorkspace.id && !targetLinkedDataset
      ? sourceWorkspace?.children.find((child) => child.type === 'dataset' && child.id === linkedDatasetId)
      : undefined
    if (linkedDatasetId && sourceWorkspace?.id !== targetWorkspace.id && !targetLinkedDataset && !copiedLinkedDataset) {
      throw new Error('The linked dataset could not be copied into the destination workspace.')
    }
    if (
      copiedLinkedDataset
      && targetWorkspace.children.some((child) => child.id === copiedLinkedDataset.id)
    ) {
      throw new Error('The destination workspace already contains an incompatible item with the linked dataset ID.')
    }

    const nowIso = new Date().toISOString()
    const model = buildPermanentModelFromSource({
      sourceModel,
      snapshot,
      modelId: `m-${Date.now()}`,
      name,
      nowIso,
    })
    const additionalChildren = buildAdditionalChildren?.(model) ?? []
    const workspace: Workspace = {
      ...targetWorkspace,
      children: [
        ...targetWorkspace.children,
        ...(copiedLinkedDataset ? [structuredClone(copiedLinkedDataset)] : []),
        model,
        ...additionalChildren,
      ],
    }

    await saveWorkspaceOrThrow(api, workspace)

    return {
      workspaces: availableWorkspaces.map((entry) => entry.id === workspace.id ? workspace : entry),
      workspace,
      model,
      additionalChildren,
    }
  } catch (error) {
    if (createdWorkspace) {
      try {
        const rollbackResult = await api.deleteWorkspace!({
          id: createdWorkspace.id,
          name: createdWorkspace.name,
          path: createdWorkspace.path,
        })
        if (!rollbackResult?.success) {
          throw new Error(rollbackResult?.error ?? 'unknown rollback error')
        }
      } catch (rollbackError: any) {
        const originalMessage = error instanceof Error ? error.message : String(error)
        throw new Error(`Save As failed (${originalMessage}); rollback failed: ${rollbackError?.message ?? rollbackError}`)
      }
    }
    throw error
  }
}
