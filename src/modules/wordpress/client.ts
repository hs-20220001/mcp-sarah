import { basename } from 'node:path'
import { AppError } from '../../core/errors.js'
import type { WordPressClientConfig } from '../../core/config.js'
import type { HttpClient } from '../../core/http.js'
import { assertStatus, type WordPressPolicy } from './policy.js'
import type { ContentFieldsInput, ContentKind, MediaFieldsInput, WordPressContent, WordPressMedia } from './types.js'

function endpoint(kind: ContentKind): 'pages' | 'posts' {
  return kind === 'page' ? 'pages' : 'posts'
}

export class WordPressClient {
  readonly #apiBase: string
  readonly #headers: HeadersInit

  constructor(
    readonly config: WordPressClientConfig,
    readonly policy: WordPressPolicy,
    readonly http: HttpClient,
  ) {
    this.#apiBase = config.baseUrl.endsWith('/wp-json') ? `${config.baseUrl}/wp/v2` : `${config.baseUrl}/wp-json/wp/v2`
    this.#headers = {
      Authorization: `Basic ${Buffer.from(`${config.username}:${config.applicationPassword}`).toString('base64')}`,
      Accept: 'application/json',
    }
  }

  async healthCheck(): Promise<void> {
    await this.#request('/users/me?context=edit')
  }

  async searchContent(kind: ContentKind, filters: { search?: string | undefined; slug?: string | undefined; status?: string | undefined; parentId?: number | undefined; categoryId?: number | undefined; page: number; perPage: number }): Promise<WordPressContent[]> {
    const params = new URLSearchParams({ context: 'edit', page: String(filters.page), per_page: String(filters.perPage) })
    if (filters.search) params.set('search', filters.search)
    if (filters.slug) params.set('slug', filters.slug)
    if (filters.status) params.set('status', filters.status)
    if (kind === 'page' && filters.parentId !== undefined) params.set('parent', String(filters.parentId))
    if (kind === 'post' && filters.categoryId !== undefined) params.set('categories', String(filters.categoryId))
    return this.#request<WordPressContent[]>(`/${endpoint(kind)}?${params.toString()}`)
  }

  async getContent(kind: ContentKind, id: number): Promise<WordPressContent> {
    return this.#request<WordPressContent>(`/${endpoint(kind)}/${id}?context=edit`)
  }

  async searchMedia(filters: { search?: string | undefined; mimeType?: string | undefined; page: number; perPage: number }): Promise<WordPressMedia[]> {
    const params = new URLSearchParams({ context: 'edit', page: String(filters.page), per_page: String(filters.perPage) })
    if (filters.search) params.set('search', filters.search)
    if (filters.mimeType) params.set('mime_type', filters.mimeType)
    return this.#request<WordPressMedia[]>(`/media?${params.toString()}`)
  }

  async getMedia(id: number): Promise<WordPressMedia> {
    return this.#request<WordPressMedia>(`/media/${id}?context=edit`)
  }

  async assertContentAllowed(kind: ContentKind, content: WordPressContent): Promise<void> {
    if (kind === 'post') {
      if (this.policy.allowedPostCategoryIds.length === 0) return
      if (!(content.categories ?? []).some(id => this.policy.allowedPostCategoryIds.includes(id))) {
        throw new AppError('POLICY_DENIED', 'O post está fora das categorias autorizadas.')
      }
      return
    }
    if (this.policy.allowedPageRootIds.length === 0) return
    let cursor = content
    const visited = new Set<number>()
    for (let depth = 0; depth < 50; depth += 1) {
      if (this.policy.allowedPageRootIds.includes(cursor.id)) return
      if (!cursor.parent || visited.has(cursor.parent)) break
      visited.add(cursor.parent)
      cursor = await this.getContent('page', cursor.parent)
    }
    throw new AppError('POLICY_DENIED', 'A página está fora das árvores autorizadas.')
  }

  async assertCreateAllowed(kind: ContentKind, fields: ContentFieldsInput): Promise<void> {
    assertStatus(this.policy, fields.status)
    if (kind === 'page') {
      if (this.policy.allowedPageRootIds.length === 0) return
      if (!fields.parentId) throw new AppError('POLICY_DENIED', 'Uma nova página precisa informar parentId dentro de uma árvore autorizada.')
      await this.assertContentAllowed('page', await this.getContent('page', fields.parentId))
      return
    }
    if (this.policy.allowedPostCategoryIds.length > 0 && !fields.categoryIds?.some(id => this.policy.allowedPostCategoryIds.includes(id))) {
      throw new AppError('POLICY_DENIED', 'O novo post precisa pertencer a uma categoria autorizada.')
    }
  }

  async assertMediaAllowed(media: WordPressMedia): Promise<void> {
    if (!media.post) throw new AppError('POLICY_DENIED', 'Mídias sem conteúdo associado não podem ser alteradas ou removidas.')
    await this.assertAssociatedContentAllowed(media.post)
  }

  async assertAssociatedContentAllowed(id: number): Promise<void> {
    try {
      const page = await this.getContent('page', id)
      await this.assertContentAllowed('page', page)
      return
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'NOT_FOUND') throw error
    }
    await this.assertContentAllowed('post', await this.getContent('post', id))
  }

  async createContent(kind: ContentKind, fields: ContentFieldsInput): Promise<WordPressContent> {
    return this.#request<WordPressContent>(`/${endpoint(kind)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.#contentPayload(fields)),
    }, true)
  }

  async updateContent(kind: ContentKind, id: number, fields: ContentFieldsInput): Promise<WordPressContent> {
    return this.#request<WordPressContent>(`/${endpoint(kind)}/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.#contentPayload(fields)),
    }, true)
  }

  async trashContent(kind: ContentKind, id: number): Promise<Record<string, unknown>> {
    return this.#request<Record<string, unknown>>(`/${endpoint(kind)}/${id}?force=false`, { method: 'DELETE' }, true)
  }

  async uploadMedia(file: { path: string; mimeType: string; bytes: Uint8Array }, fields: MediaFieldsInput): Promise<WordPressMedia> {
    const name = basename(file.path).replace(/["\r\n]/g, '_')
    const form = new FormData()
    form.append('file', new Blob([
      file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer,
    ], { type: file.mimeType }), name)
    if (fields.title !== undefined) form.append('title', fields.title)
    if (fields.altText !== undefined) form.append('alt_text', fields.altText)
    if (fields.caption !== undefined) form.append('caption', fields.caption)
    if (fields.description !== undefined) form.append('description', fields.description)
    if (fields.postId !== undefined) form.append('post', String(fields.postId))
    return this.#request<WordPressMedia>('/media', {
      method: 'POST',
      body: form,
    }, true)
  }

  async updateMedia(id: number, fields: MediaFieldsInput): Promise<WordPressMedia> {
    const payload: Record<string, unknown> = {}
    if (fields.title !== undefined) payload.title = fields.title
    if (fields.altText !== undefined) payload.alt_text = fields.altText
    if (fields.caption !== undefined) payload.caption = fields.caption
    if (fields.description !== undefined) payload.description = fields.description
    if (fields.postId !== undefined) payload.post = fields.postId
    return this.#request<WordPressMedia>(`/media/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }, true)
  }

  async trashMedia(id: number): Promise<Record<string, unknown>> {
    try {
      return await this.#request<Record<string, unknown>>(`/media/${id}?force=false`, { method: 'DELETE' }, true)
    } catch (error) {
      if (error instanceof AppError && error.details?.status === 501) {
        throw new AppError('POLICY_DENIED', 'Esta instalação não oferece lixeira de mídia; exclusão permanente não será usada.')
      }
      throw error
    }
  }

  #contentPayload(fields: ContentFieldsInput): Record<string, unknown> {
    assertStatus(this.policy, fields.status)
    const payload: Record<string, unknown> = {}
    if (fields.title !== undefined) payload.title = fields.title
    if (fields.slug !== undefined) payload.slug = fields.slug
    if (fields.contentHtml !== undefined) payload.content = fields.contentHtml
    if (fields.excerpt !== undefined) payload.excerpt = fields.excerpt
    if (fields.status !== undefined) payload.status = fields.status
    if (fields.parentId !== undefined) payload.parent = fields.parentId
    if (fields.categoryIds !== undefined) payload.categories = fields.categoryIds
    if (fields.featuredMediaId !== undefined) payload.featured_media = fields.featuredMediaId
    if (fields.menuOrder !== undefined) payload.menu_order = fields.menuOrder
    return payload
  }

  async #request<T>(path: string, init: RequestInit = {}, write = false): Promise<T> {
    const headers = new Headers(this.#headers)
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    return this.http.request<T>(`${this.#apiBase}${path}`, { ...init, headers }, write)
  }
}
