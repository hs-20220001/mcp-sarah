import { AppError } from '../../core/errors.js'
import type { HttpClient } from '../../core/http.js'
import type { TfsConfig } from '../../core/config.js'
import { assertWorkItemType, descriptionField, resolveCustomFields, type TfsPolicy } from './policy.js'
import type { CreateWorkItemInput, TfsComment, TfsCommentPage, TfsQueryEntry, TfsRawComment, TfsRawWorkItem, TfsRelation, TfsWorkItem, WorkItemFieldsInput } from './types.js'

const commentsApiVersion = '7.0-preview.3'

interface QueryNode {
  id: string
  name: string
  path?: string
  isFolder: boolean
  queryType?: string
  children?: QueryNode[]
}

interface JsonPatchOperation {
  op: 'add' | 'remove' | 'test'
  path: string
  value?: unknown
}

interface TfsRawCommentPage {
  comments?: TfsRawComment[]
  continuationToken?: string
}

function escapeWiql(value: string): string {
  return value.replace(/'/g, "''")
}

function relationId(url: string): number | null {
  const match = /workItems\/(\d+)/i.exec(url)
  return match?.[1] ? Number(match[1]) : null
}

function assignedTo(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'displayName' in value && typeof value.displayName === 'string') return value.displayName
  return null
}

function fieldText(fields: Record<string, unknown>, name: string): string {
  return typeof fields[name] === 'string' ? fields[name] : ''
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export interface WorkItemSearch {
  text?: string | undefined
  types?: string[] | undefined
  states?: string[] | undefined
  assignedTo?: string | undefined
  tags?: string[] | undefined
  areaPath?: string | undefined
  iterationPath?: string | undefined
  changedSince?: string | undefined
  maxItems: number
}

export class TfsClient {
  readonly #baseUrl: string
  readonly #headers: HeadersInit

  constructor(
    readonly config: TfsConfig,
    readonly policy: TfsPolicy,
    readonly http: HttpClient,
  ) {
    this.#baseUrl = `${config.organizationUrl}/${encodeURIComponent(config.project)}/_apis`
    this.#headers = {
      Authorization: `Basic ${Buffer.from(`:${config.pat}`).toString('base64')}`,
      Accept: 'application/json',
    }
  }

  async healthCheck(): Promise<void> {
    await this.#request('/wit/workitemtypes?$top=1')
  }

  async listQueries(): Promise<TfsQueryEntry[]> {
    const response = await this.#request<{ value: QueryNode[] }>('/wit/queries?$depth=10&$expand=clauses')
    const entries: TfsQueryEntry[] = []
    const visit = (nodes: QueryNode[], prefix = ''): void => {
      for (const node of nodes) {
        const path = prefix ? `${prefix}/${node.name}` : node.name
        if (node.isFolder) {
          entries.push({ id: node.id, name: node.name, path, kind: 'folder' })
          visit(node.children ?? [], path)
        } else if (node.queryType === 'flat') {
          entries.push({ id: node.id, name: node.name, path, kind: 'query' })
        }
      }
    }
    visit(response.value)
    return entries
  }

  async queryIds(queryId: string): Promise<number[]> {
    const result = await this.#request<{ workItems?: Array<{ id: number }> }>(`/wit/wiql/${encodeURIComponent(queryId)}`)
    return (result.workItems ?? []).map(item => item.id)
  }

  async searchIds(filters: WorkItemSearch): Promise<number[]> {
    const clauses = [`[System.TeamProject] = '${escapeWiql(this.config.project)}'`]
    if (filters.text) clauses.push(`[System.Title] CONTAINS '${escapeWiql(filters.text)}'`)
    if (filters.types?.length) clauses.push(`[System.WorkItemType] IN (${filters.types.map(value => `'${escapeWiql(value)}'`).join(', ')})`)
    if (filters.states?.length) clauses.push(`[System.State] IN (${filters.states.map(value => `'${escapeWiql(value)}'`).join(', ')})`)
    if (filters.assignedTo) clauses.push(`[System.AssignedTo] = '${escapeWiql(filters.assignedTo)}'`)
    for (const tag of filters.tags ?? []) clauses.push(`[System.Tags] CONTAINS '${escapeWiql(tag)}'`)
    if (filters.areaPath) clauses.push(`[System.AreaPath] UNDER '${escapeWiql(filters.areaPath)}'`)
    if (filters.iterationPath) clauses.push(`[System.IterationPath] UNDER '${escapeWiql(filters.iterationPath)}'`)
    if (filters.changedSince) clauses.push(`[System.ChangedDate] >= '${escapeWiql(filters.changedSince)}'`)
    const query = `SELECT [System.Id] FROM WorkItems WHERE ${clauses.join(' AND ')} ORDER BY [System.ChangedDate] DESC`
    const result = await this.#request<{ workItems?: Array<{ id: number }> }>(
      `/wit/wiql?$top=${filters.maxItems}`,
      { method: 'POST', body: JSON.stringify({ query }), headers: { 'Content-Type': 'application/json' } },
    )
    return (result.workItems ?? []).map(item => item.id).slice(0, filters.maxItems)
  }

  async getWorkItems(ids: number[]): Promise<TfsWorkItem[]> {
    const items: TfsWorkItem[] = []
    for (let offset = 0; offset < ids.length; offset += 200) {
      const batch = ids.slice(offset, offset + 200)
      if (batch.length === 0) continue
      const result = await this.#request<{ value: TfsRawWorkItem[] }>(`/wit/workitems?ids=${batch.join(',')}&$expand=relations`)
      items.push(...result.value.map(item => this.normalize(item)))
    }
    return items
  }

  async getRawWorkItem(id: number): Promise<TfsRawWorkItem> {
    return this.#request<TfsRawWorkItem>(`/wit/workitems/${id}?$expand=relations`)
  }

  async getWorkItem(id: number): Promise<TfsWorkItem> {
    return this.normalize(await this.getRawWorkItem(id))
  }

  async listComments(workItemId: number, top: number, continuationToken?: string, order: 'asc' | 'desc' = 'asc', includeDeleted = false): Promise<TfsCommentPage> {
    const query = new URLSearchParams({ '$top': String(top), order, includeDeleted: String(includeDeleted) })
    if (continuationToken) query.set('continuationToken', continuationToken)
    const result = await this.#request<TfsRawCommentPage>(`/wit/workItems/${workItemId}/comments?${query.toString()}`, {}, false, commentsApiVersion)
    return {
      comments: (result.comments ?? []).map(comment => this.normalizeComment(comment)),
      continuationToken: result.continuationToken ?? null,
    }
  }

  async getComment(workItemId: number, commentId: number): Promise<TfsComment> {
    const comment = await this.#request<TfsRawComment>(`/wit/workItems/${workItemId}/comments/${commentId}`, {}, false, commentsApiVersion)
    return this.normalizeComment(comment)
  }

  async addComment(workItemId: number, text: string): Promise<TfsComment> {
    const comment = await this.#request<TfsRawComment>(
      `/wit/workItems/${workItemId}/comments`,
      { method: 'POST', body: JSON.stringify({ text }), headers: { 'Content-Type': 'application/json' } },
      true,
      commentsApiVersion,
    )
    return this.normalizeComment(comment)
  }

  async updateComment(workItemId: number, commentId: number, text: string): Promise<TfsComment> {
    const comment = await this.#request<TfsRawComment>(
      `/wit/workItems/${workItemId}/comments/${commentId}`,
      { method: 'PATCH', body: JSON.stringify({ text }), headers: { 'Content-Type': 'application/json' } },
      true,
      commentsApiVersion,
    )
    return this.normalizeComment(comment)
  }

  async deleteComment(workItemId: number, commentId: number): Promise<TfsComment> {
    const comment = await this.#request<TfsRawComment>(
      `/wit/workItems/${workItemId}/comments/${commentId}`,
      { method: 'DELETE' },
      true,
      commentsApiVersion,
    )
    return this.normalizeComment(comment)
  }

  async listClassifications(kind: 'areas' | 'iterations', depth: number): Promise<Record<string, unknown>> {
    return this.#request<Record<string, unknown>>(`/wit/classificationnodes/${kind}?$depth=${depth}`)
  }

  normalize(item: TfsRawWorkItem): TfsWorkItem {
    const type = fieldText(item.fields, 'System.WorkItemType')
    const reverse = (item.relations ?? []).find(relation => relation.rel === 'System.LinkTypes.Hierarchy-Reverse')
    const children = (item.relations ?? [])
      .filter(relation => relation.rel === 'System.LinkTypes.Hierarchy-Forward')
      .map(relation => relationId(relation.url))
      .filter((id): id is number => id !== null)
    const customFields = Object.fromEntries(
      Object.entries(this.policy.customFields).map(([alias, definition]) => [alias, item.fields[definition.referenceName] ?? null]),
    )
    const tags = fieldText(item.fields, 'System.Tags').split(';').map(tag => tag.trim()).filter(Boolean)
    return {
      id: item.id,
      rev: item.rev,
      type,
      title: fieldText(item.fields, 'System.Title'),
      description: fieldText(item.fields, descriptionField(this.policy, type)),
      state: fieldText(item.fields, 'System.State'),
      assignedTo: assignedTo(item.fields['System.AssignedTo']),
      areaPath: fieldText(item.fields, 'System.AreaPath') || null,
      iterationPath: fieldText(item.fields, 'System.IterationPath') || null,
      tags,
      parentId: reverse ? relationId(reverse.url) : null,
      childIds: children,
      customFields,
      changedDate: fieldText(item.fields, 'System.ChangedDate') || null,
      webUrl: `${this.config.organizationUrl}/${encodeURIComponent(this.config.project)}/_workitems/edit/${item.id}`,
    }
  }

  normalizeComment(comment: TfsRawComment): TfsComment {
    return {
      workItemId: comment.workItemId,
      commentId: comment.commentId,
      version: comment.version,
      text: comment.text,
      createdDate: nullableText(comment.createdDate),
      modifiedDate: nullableText(comment.modifiedDate),
      isDeleted: comment.isDeleted ?? false,
    }
  }

  async create(input: CreateWorkItemInput): Promise<TfsWorkItem> {
    assertWorkItemType(this.policy, input.type)
    const operations = this.#fieldOperations(input.type, input)
    if (input.parentId !== undefined && input.parentId !== null) operations.push(this.#parentAdd(input.parentId))
    const created = await this.#request<TfsRawWorkItem>(
      `/wit/workitems/$${encodeURIComponent(input.type)}`,
      { method: 'POST', body: JSON.stringify(operations), headers: { 'Content-Type': 'application/json-patch+json' } },
      true,
    )
    return this.normalize(created)
  }

  async update(id: number, type: string, expectedRev: number, input: WorkItemFieldsInput, currentRelations: TfsRelation[]): Promise<TfsWorkItem> {
    assertWorkItemType(this.policy, type)
    const operations: JsonPatchOperation[] = [{ op: 'test', path: '/rev', value: expectedRev }, ...this.#fieldOperations(type, input)]
    if ('parentId' in input) {
      const parentIndex = currentRelations.findIndex(relation => relation.rel === 'System.LinkTypes.Hierarchy-Reverse')
      if (parentIndex >= 0) operations.push({ op: 'remove', path: `/relations/${parentIndex}` })
      if (input.parentId !== null && input.parentId !== undefined) operations.push(this.#parentAdd(input.parentId))
    }
    if (operations.length === 1) throw new AppError('POLICY_DENIED', 'Nenhum campo foi informado para alteração.')
    const updated = await this.#request<TfsRawWorkItem>(
      `/wit/workitems/${id}`,
      { method: 'PATCH', body: JSON.stringify(operations), headers: { 'Content-Type': 'application/json-patch+json' } },
      true,
    )
    return this.normalize(updated)
  }

  async trash(id: number): Promise<Record<string, unknown>> {
    await this.#request<unknown>(`/wit/workitems/${id}?destroy=false`, { method: 'DELETE' }, true)
    return { id, recycled: true }
  }

  #fieldOperations(type: string, input: WorkItemFieldsInput): JsonPatchOperation[] {
    const operations: JsonPatchOperation[] = []
    const setField = (referenceName: string, value: unknown): void => {
      const path = `/fields/${referenceName}`
      operations.push(value === null ? { op: 'remove', path } : { op: 'add', path, value })
    }
    if (input.title !== undefined) setField('System.Title', input.title)
    if (input.description !== undefined) setField(descriptionField(this.policy, type), input.description)
    if (input.state !== undefined) setField('System.State', input.state)
    if (input.assignedTo !== undefined) setField('System.AssignedTo', input.assignedTo)
    if (input.areaPath !== undefined) setField('System.AreaPath', input.areaPath)
    if (input.iterationPath !== undefined) setField('System.IterationPath', input.iterationPath)
    if (input.tags !== undefined) setField('System.Tags', input.tags === null ? null : input.tags.join('; '))
    if (input.customFields) {
      for (const [referenceName, value] of Object.entries(resolveCustomFields(this.policy, input.customFields))) setField(referenceName, value)
    }
    return operations
  }

  #parentAdd(parentId: number): JsonPatchOperation {
    return {
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'System.LinkTypes.Hierarchy-Reverse',
        url: `${this.config.organizationUrl}/${encodeURIComponent(this.config.project)}/_apis/wit/workItems/${parentId}`,
        attributes: { comment: 'Relação definida via MCP Sarah' },
      },
    }
  }

  async #request<T>(path: string, init: RequestInit = {}, write = false, apiVersion = this.config.apiVersion): Promise<T> {
    const separator = path.includes('?') ? '&' : '?'
    const url = `${this.#baseUrl}${path}${separator}api-version=${encodeURIComponent(apiVersion)}`
    const headers = new Headers(this.#headers)
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    return this.http.request<T>(url, { ...init, headers }, write)
  }
}
