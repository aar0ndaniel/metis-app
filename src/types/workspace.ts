export type VariableKind = 'MET' | 'CAT'

export interface WorkspaceChildBase {
  id: string
  name: string
  type: 'model' | 'dataset' | 'result'
  badge?: 'Calculated' | 'Draft'
  createdAt?: string
  updatedAt?: string
  meta?: string
}

export interface WorkspaceModelChild extends WorkspaceChildBase {
  type: 'model'
  linkedDatasetId?: string
  state?: any
  stats?: { r2?: string; srmr?: string }
}

export interface WorkspaceDatasetChild extends WorkspaceChildBase {
  type: 'dataset'
  filePath?: string
  datasetTempPath?: string
  originalFileName?: string
  headers?: string[]
  variableTypes?: Record<string, VariableKind>
  totalRows?: number
  missing?: number
  linkedModelId?: string
}

export interface WorkspaceResultChild extends WorkspaceChildBase {
  type: 'result'
  linkedModelId?: string
  state?: any
  stats?: { r2?: string; srmr?: string }
}

export type WorkspaceChild =
  | WorkspaceModelChild
  | WorkspaceDatasetChild
  | WorkspaceResultChild

export interface Workspace {
  id: string
  name: string
  color: string
  expanded: boolean
  pinned?: boolean
  path?: string
  datasetTempPath?: string
  defaultDatasetId?: string
  children: WorkspaceChild[]
}

export function isDatasetChild(child: WorkspaceChild | null | undefined): child is WorkspaceDatasetChild {
  return Boolean(child && child.type === 'dataset')
}

export function isModelChild(child: WorkspaceChild | null | undefined): child is WorkspaceModelChild {
  return Boolean(child && child.type === 'model')
}

