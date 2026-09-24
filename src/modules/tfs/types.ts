export interface TfsQueryEntry {
  id: string
  name: string
  path: string
  kind: 'folder' | 'query'
}

export interface TfsRelation {
  rel: string
  url: string
  attributes?: Record<string, unknown>
}

export interface TfsRawWorkItem {
  id: number
  rev: number
  fields: Record<string, unknown>
  relations?: TfsRelation[]
  url: string
}

export interface TfsRawComment {
  workItemId: number
  commentId: number
  version: number
  text: string
  createdDate?: string
  modifiedDate?: string
  isDeleted?: boolean
}

export interface TfsComment {
  workItemId: number
  commentId: number
  version: number
  text: string
  createdDate: string | null
  modifiedDate: string | null
  isDeleted: boolean
}

export interface TfsCommentPage {
  comments: TfsComment[]
  continuationToken: string | null
}

export interface TfsWorkItem {
  id: number
  rev: number
  type: string
  title: string
  description: string
  state: string
  assignedTo: string | null
  areaPath: string | null
  iterationPath: string | null
  tags: string[]
  parentId: number | null
  childIds: number[]
  customFields: Record<string, unknown>
  changedDate: string | null
  webUrl: string
}

export interface WorkItemFieldsInput {
  title?: string | undefined
  description?: string | null | undefined
  state?: string | null | undefined
  assignedTo?: string | null | undefined
  areaPath?: string | null | undefined
  iterationPath?: string | null | undefined
  tags?: string[] | null | undefined
  parentId?: number | null | undefined
  customFields?: Record<string, string | number | boolean | null> | undefined
}

export interface CreateWorkItemInput extends WorkItemFieldsInput {
  type: string
  title: string
}
