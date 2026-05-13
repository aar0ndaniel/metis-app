import {
  isDatasetChild,
  isModelChild,
  type Workspace,
  type WorkspaceChild,
  type WorkspaceDatasetChild,
  type WorkspaceModelChild,
} from '../types/workspace'

function getDatasetChildren(children: WorkspaceChild[]): WorkspaceDatasetChild[] {
  return children.filter(isDatasetChild)
}

function getDatasetIdSet(children: WorkspaceChild[]): Set<string> {
  return new Set(getDatasetChildren(children).map((child) => child.id))
}

function normalizeDatasetChild(
  dataset: WorkspaceDatasetChild,
  workspaceDatasetTempPath?: string
): WorkspaceDatasetChild {
  if (dataset.datasetTempPath || !workspaceDatasetTempPath) return dataset
  return {
    ...dataset,
    datasetTempPath: workspaceDatasetTempPath,
  }
}

export function migrateWorkspace(workspace: Workspace): Workspace {
  const children = Array.isArray(workspace.children) ? workspace.children : []
  const migratedChildren = children.map((child) => {
    if (!isDatasetChild(child)) return child
    return normalizeDatasetChild(child, workspace.datasetTempPath)
  })

  const datasetChildren = getDatasetChildren(migratedChildren)
  const datasetIds = new Set(datasetChildren.map((child) => child.id))
  const defaultDatasetId = datasetIds.has(workspace.defaultDatasetId ?? '')
    ? workspace.defaultDatasetId
    : datasetChildren[0]?.id

  const linkedChildren = migratedChildren.map((child) => {
    if (!isModelChild(child)) return child
    const linkedDatasetId = datasetIds.has(child.linkedDatasetId ?? '')
      ? child.linkedDatasetId
      : defaultDatasetId
    return {
      ...child,
      ...(linkedDatasetId ? { linkedDatasetId } : {}),
    }
  })

  return {
    ...workspace,
    defaultDatasetId,
    children: linkedChildren,
  }
}

interface UpsertDatasetOptions {
  setAsDefault?: boolean
  linkedModelId?: string
}

export function upsertDatasetInWorkspace(
  workspace: Workspace,
  dataset: WorkspaceDatasetChild,
  options: UpsertDatasetOptions = {}
): Workspace {
  const migrated = migrateWorkspace(workspace)
  const datasets = getDatasetChildren(migrated.children)
  const existingIndex = datasets.findIndex((child) => child.id === dataset.id)

  if (existingIndex === -1 && datasets.length >= 3) {
    throw new Error('Workspace dataset limit reached. Delete a dataset before adding another one.')
  }

  const normalizedDataset = normalizeDatasetChild(dataset, migrated.datasetTempPath)
  const children = existingIndex === -1
    ? [...migrated.children, normalizedDataset]
    : migrated.children.map((child) => child.id === dataset.id ? normalizedDataset : child)

  const defaultDatasetId = options.setAsDefault
    ? normalizedDataset.id
    : (migrated.defaultDatasetId && getDatasetIdSet(children).has(migrated.defaultDatasetId))
      ? migrated.defaultDatasetId
      : normalizedDataset.id

  const linkedChildren = children.map((child) => {
    if (!isModelChild(child)) return child
    if (options.linkedModelId && child.id === options.linkedModelId) {
      return { ...child, linkedDatasetId: normalizedDataset.id }
    }
    if (!child.linkedDatasetId) {
      return { ...child, linkedDatasetId: defaultDatasetId }
    }
    return child
  })

  return migrateWorkspace({
    ...migrated,
    defaultDatasetId,
    children: linkedChildren,
  })
}

export function setModelLinkedDataset(workspace: Workspace, modelId: string, datasetId: string): Workspace {
  const migrated = migrateWorkspace(workspace)
  const datasetIds = getDatasetIdSet(migrated.children)
  if (!datasetIds.has(datasetId)) {
    throw new Error(`Cannot link model to missing dataset: ${datasetId}`)
  }

  let foundModel = false
  const children = migrated.children.map((child) => {
    if (!isModelChild(child) || child.id !== modelId) return child
    foundModel = true
    return {
      ...child,
      linkedDatasetId: datasetId,
    }
  })

  if (!foundModel) {
    throw new Error(`Model not found: ${modelId}`)
  }

  return {
    ...migrated,
    children,
  }
}

export function deleteDatasetsFromWorkspace(workspace: Workspace, datasetIdsToDelete: string[]): Workspace {
  const migrated = migrateWorkspace(workspace)
  const removeIds = new Set(datasetIdsToDelete)
  if (!removeIds.size) return migrated

  const children = migrated.children.filter((child) => !(isDatasetChild(child) && removeIds.has(child.id)))
  const remainingDatasets = getDatasetChildren(children)
  const defaultDatasetId = remainingDatasets.some((child) => child.id === migrated.defaultDatasetId)
    ? migrated.defaultDatasetId
    : remainingDatasets[0]?.id

  const relinkedChildren = children.map((child) => {
    if (!isModelChild(child)) return child
    if (!child.linkedDatasetId || removeIds.has(child.linkedDatasetId)) {
      return {
        ...child,
        ...(defaultDatasetId ? { linkedDatasetId: defaultDatasetId } : { linkedDatasetId: undefined }),
      }
    }
    return child
  }) as WorkspaceChild[]

  return {
    ...migrated,
    defaultDatasetId,
    children: relinkedChildren,
  }
}

export function renameDatasetInWorkspace(workspace: Workspace, datasetId: string, name: string): Workspace {
  const migrated = migrateWorkspace(workspace)
  return {
    ...migrated,
    children: migrated.children.map((child) => (
      isDatasetChild(child) && child.id === datasetId
        ? { ...child, name }
        : child
    )),
  }
}

export function getLinkedDatasetForModel(workspace: Workspace, modelId?: string | null): WorkspaceDatasetChild | undefined {
  const migrated = migrateWorkspace(workspace)
  const datasets = getDatasetChildren(migrated.children)
  if (!modelId) {
    return datasets.find((child) => child.id === migrated.defaultDatasetId) ?? datasets[0]
  }

  const model = migrated.children.find((child): child is WorkspaceModelChild => isModelChild(child) && child.id === modelId)
  if (!model) return datasets.find((child) => child.id === migrated.defaultDatasetId) ?? datasets[0]
  return datasets.find((child) => child.id === model.linkedDatasetId)
    ?? datasets.find((child) => child.id === migrated.defaultDatasetId)
    ?? datasets[0]
}

export function getWorkspaceDatasets(workspace: Workspace): WorkspaceDatasetChild[] {
  return getDatasetChildren(migrateWorkspace(workspace).children)
}
