import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod/v4'
import { AppError } from '../../core/errors.js'
import { wordPressWikis, type WordPressWiki } from '../../core/config.js'
import { HttpClient } from '../../core/http.js'
import type { IntegrationModule, ModuleContext, ModuleHealth } from '../../core/module.js'
import { operationPreparationMessage } from '../../core/operations.js'
import { safeToolCall, successResult } from '../../core/tool-result.js'
import { WordPressClient } from './client.js'
import { assertStatus, inspectMediaPath, loadWordPressPolicy, type WordPressPolicy } from './policy.js'
import type { ContentFieldsInput, ContentKind, MediaFieldsInput, WordPressContent, WordPressMedia, WordPressTextField } from './types.js'

const contentKind = z.enum(['page', 'post'])
const wikiKind = z.enum(wordPressWikis)
const wikiLabels: Record<WordPressWiki, string> = {
  user: 'wiki pública dos usuários',
  developer: 'wiki da informática',
}
const contentFieldsSchema = z.object({
  title: z.string().trim().min(1).max(512).optional(),
  slug: z.string().trim().min(1).max(200).optional(),
  contentHtml: z.string().max(500_000).optional(),
  excerpt: z.string().max(20_000).optional(),
  status: z.enum(['draft', 'pending', 'private', 'publish', 'future']).optional(),
  parentId: z.number().int().nonnegative().optional(),
  categoryIds: z.array(z.number().int().positive()).max(50).optional(),
  featuredMediaId: z.number().int().nonnegative().optional(),
  menuOrder: z.number().int().min(0).optional(),
})
const mediaFieldsSchema = z.object({
  title: z.string().trim().min(1).max(512).optional(),
  altText: z.string().max(2_000).optional(),
  caption: z.string().max(20_000).optional(),
  description: z.string().max(100_000).optional(),
  postId: z.number().int().positive().optional(),
})

function raw(field: WordPressTextField | undefined): string {
  return field?.raw ?? field?.rendered ?? ''
}

function normalizeContent(wiki: WordPressWiki | undefined, kind: ContentKind, item: WordPressContent): Record<string, unknown> {
  return {
    ...(wiki ? { wiki } : {}),
    kind,
    id: item.id,
    title: raw(item.title),
    slug: item.slug,
    status: item.status,
    contentHtml: raw(item.content),
    excerpt: raw(item.excerpt),
    parentId: item.parent ?? null,
    categoryIds: item.categories ?? [],
    featuredMediaId: item.featured_media ?? 0,
    menuOrder: item.menu_order ?? 0,
    modifiedGmt: item.modified_gmt,
    url: item.link,
  }
}

function normalizeMedia(wiki: WordPressWiki | undefined, item: WordPressMedia): Record<string, unknown> {
  return {
    ...(wiki ? { wiki } : {}),
    id: item.id,
    title: raw(item.title),
    slug: item.slug,
    status: item.status,
    altText: item.alt_text,
    caption: raw(item.caption),
    description: raw(item.description),
    postId: item.post,
    mimeType: item.mime_type,
    sourceUrl: item.source_url,
    modifiedGmt: item.modified_gmt,
    url: item.link,
  }
}

function contentDiff(item: WordPressContent | null, fields: ContentFieldsInput): Array<{ field: string; before?: unknown; after?: unknown }> {
  const current = item ? normalizeContent(undefined, item.parent !== undefined ? 'page' : 'post', item) : null
  return Object.keys(fields).flatMap(field => {
    const after: unknown = Reflect.get(fields, field)
    return after === undefined ? [] : [{ field, before: current?.[field], after }]
  })
}

function mediaDiff(item: WordPressMedia | null, fields: MediaFieldsInput): Array<{ field: string; before?: unknown; after?: unknown }> {
  const current = item ? normalizeMedia(undefined, item) : null
  return Object.keys(fields).flatMap(field => {
    const after: unknown = Reflect.get(fields, field)
    return after === undefined ? [] : [{ field, before: current?.[field], after }]
  })
}

export class WordPressModule implements IntegrationModule {
  readonly id = 'wordpress' as const
  #clients: Partial<Record<WordPressWiki, WordPressClient>> = {}
  #policies: Partial<Record<WordPressWiki, WordPressPolicy>> = {}

  constructor(readonly context: ModuleContext) {}

  async initialize(): Promise<void> {
    const config = this.context.config.wordpress
    if (!config) return
    for (const wiki of wordPressWikis) {
      const profile = config.wikis[wiki]
      if (!profile) continue
      const policy = await loadWordPressPolicy(profile.policyPath)
      this.#policies[wiki] = policy
      this.#clients[wiki] = new WordPressClient({
        baseUrl: profile.baseUrl,
        username: config.username,
        applicationPassword: config.applicationPassword,
      }, policy, new HttpClient({ timeoutMs: this.context.config.requestTimeoutMs }))
    }
  }

  async healthCheck(probe: boolean): Promise<ModuleHealth> {
    const wikis = this.#configuredWikis()
    if (wikis.length === 0) return { id: 'wordpress', configured: false, message: `Configuração ausente: ${(this.context.config.configurationIssues.wordpress ?? []).join(', ')}` }
    const details = this.#scopeDetails()
    if (!probe) return { id: 'wordpress', configured: true, message: 'Configurado; conexão não testada.', details }
    const reachable = await Promise.all(wikis.map(async wiki => {
      try {
        await this.#requireClient(wiki).healthCheck()
        return true
      } catch {
        return false
      }
    }))
    if (reachable.every(Boolean)) {
      return { id: 'wordpress', configured: true, reachable: true, message: 'Conexão validada.', details }
    }
    return { id: 'wordpress', configured: true, reachable: false, message: 'Falha ao validar a conexão.', details }
  }

  registerTools(server: McpServer): void {
    server.registerTool('wordpress_search_content', {
      title: 'Pesquisar conteúdo WordPress',
      description: 'Busca páginas ou posts com contexto editável e paginação limitada. Informe wiki=user ou wiki=developer quando houver mais de uma wiki configurada.',
      inputSchema: z.object({ wiki: wikiKind.optional(), kind: contentKind, search: z.string().trim().min(1).max(256).optional(), slug: z.string().trim().min(1).max(200).optional(), status: z.string().trim().min(1).max(32).optional(), parentId: z.number().int().nonnegative().optional(), categoryId: z.number().int().positive().optional(), page: z.number().int().min(1).default(1), perPage: z.number().int().min(1).max(50).default(20) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const items = await this.#requireClient(wiki).searchContent(args.kind, args)
      return successResult(`${items.length} item(ns) encontrado(s) na ${wikiLabels[wiki]}.`, { wiki, items: items.map(item => normalizeContent(wiki, args.kind, item)), page: args.page, perPage: args.perPage, hasMore: items.length === args.perPage })
    }))

    server.registerTool('wordpress_get_content', {
      title: 'Consultar conteúdo WordPress',
      description: 'Obtém HTML bruto editável, metadados e URL de uma página ou post. Informe wiki=user ou wiki=developer quando houver mais de uma wiki configurada.',
      inputSchema: z.object({ wiki: wikiKind.optional(), kind: contentKind, id: z.number().int().positive() }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const item = await this.#requireClient(wiki).getContent(args.kind, args.id)
      return successResult(`${args.kind} ${args.id} na ${wikiLabels[wiki]}: ${raw(item.title)}`, { wiki, content: normalizeContent(wiki, args.kind, item) })
    }))

    server.registerTool('wordpress_search_media', {
      title: 'Pesquisar mídias WordPress',
      description: 'Busca anexos do WordPress por texto ou MIME type. Informe wiki=user ou wiki=developer quando houver mais de uma wiki configurada.',
      inputSchema: z.object({ wiki: wikiKind.optional(), search: z.string().trim().min(1).max(256).optional(), mimeType: z.string().trim().min(1).max(128).optional(), page: z.number().int().min(1).default(1), perPage: z.number().int().min(1).max(50).default(20) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const items = await this.#requireClient(wiki).searchMedia(args)
      return successResult(`${items.length} mídia(s) encontrada(s) na ${wikiLabels[wiki]}.`, { wiki, items: items.map(item => normalizeMedia(wiki, item)), page: args.page, perPage: args.perPage, hasMore: items.length === args.perPage })
    }))

    server.registerTool('wordpress_get_media', {
      title: 'Consultar mídia WordPress',
      description: 'Obtém metadados, associação e URL de uma mídia. Informe wiki=user ou wiki=developer quando houver mais de uma wiki configurada.',
      inputSchema: z.object({ wiki: wikiKind.optional(), id: z.number().int().positive() }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const item = await this.#requireClient(wiki).getMedia(args.id)
      return successResult(`Mídia ${args.id} na ${wikiLabels[wiki]}: ${raw(item.title)}`, { wiki, media: normalizeMedia(wiki, item) })
    }))

    server.registerTool('wordpress_prepare_create_content', {
      title: 'Preparar criação de conteúdo WordPress',
      description: 'Prepara uma página ou post em escopo autorizado. O status padrão é draft. Informe wiki=user ou wiki=developer quando houver mais de uma wiki configurada.',
      inputSchema: z.object({ wiki: wikiKind.optional(), kind: contentKind, fields: contentFieldsSchema.extend({ title: z.string().trim().min(1).max(512), status: z.enum(['draft', 'pending', 'private', 'publish', 'future']).default('draft') }) }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const client = this.#requireClient(wiki)
      await client.assertCreateAllowed(args.kind, args.fields)
      const plan = await this.context.operations.prepare({
        module: 'wordpress', action: 'create_content', target: `${wiki}:new:${args.kind}`, summary: `Criar ${args.kind} na ${wikiLabels[wiki]}: ${args.fields.title}`,
        diff: contentDiff(null, args.fields),
        preflight: async () => client.assertCreateAllowed(args.kind, args.fields),
        execute: async () => ({ content: normalizeContent(wiki, args.kind, await client.createContent(args.kind, args.fields)) }),
      })
      return successResult(operationPreparationMessage(this.context.config.requireConfirmation, 'Plano de criação preparado.'), plan)
    }))

    server.registerTool('wordpress_prepare_update_content', {
      title: 'Preparar edição de conteúdo WordPress',
      description: 'Prepara edição parcial e bloqueia se o conteúdo mudar antes da aplicação. Informe wiki=user ou wiki=developer quando houver mais de uma wiki configurada.',
      inputSchema: z.object({ wiki: wikiKind.optional(), kind: contentKind, id: z.number().int().positive(), fields: contentFieldsSchema.refine(value => Object.values(value).some(entry => entry !== undefined), 'Informe ao menos um campo.') }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const client = this.#requireClient(wiki)
      assertStatus(this.#requirePolicy(wiki), args.fields.status)
      const current = await client.getContent(args.kind, args.id)
      await client.assertContentAllowed(args.kind, current)
      const intended = { ...current, parent: args.fields.parentId ?? current.parent, categories: args.fields.categoryIds ?? current.categories }
      await client.assertContentAllowed(args.kind, intended)
      const plan = await this.context.operations.prepare({
        module: 'wordpress', action: 'update_content', target: `${wiki}:${args.kind}:${args.id}`, summary: `Editar ${args.kind} ${args.id} na ${wikiLabels[wiki]}: ${raw(current.title)}`,
        diff: contentDiff(current, args.fields),
        preflight: async () => {
          const latest = await client.getContent(args.kind, args.id)
          await client.assertContentAllowed(args.kind, latest)
          const latestIntended = { ...latest, parent: args.fields.parentId ?? latest.parent, categories: args.fields.categoryIds ?? latest.categories }
          await client.assertContentAllowed(args.kind, latestIntended)
          if (latest.modified_gmt !== current.modified_gmt) throw new AppError('CONFLICT', 'O conteúdo foi modificado após a preparação.')
        },
          execute: async () => ({ content: normalizeContent(wiki, args.kind, await client.updateContent(args.kind, args.id, args.fields)) }),
      })
      return successResult(operationPreparationMessage(this.context.config.requireConfirmation, 'Plano de edição preparado.'), plan)
    }))

    server.registerTool('wordpress_prepare_trash_content', {
      title: 'Preparar envio de conteúdo à lixeira',
      description: 'Prepara remoção recuperável de página ou post, sem force=true. Informe wiki=user ou wiki=developer quando houver mais de uma wiki configurada.',
      inputSchema: z.object({ wiki: wikiKind.optional(), kind: contentKind, id: z.number().int().positive() }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const client = this.#requireClient(wiki)
      const current = await client.getContent(args.kind, args.id)
      await client.assertContentAllowed(args.kind, current)
      const plan = await this.context.operations.prepare({
        module: 'wordpress', action: 'trash_content', target: `${wiki}:${args.kind}:${args.id}`, summary: `Enviar ${args.kind} ${args.id} da ${wikiLabels[wiki]} à lixeira`,
        diff: [{ field: 'status', before: current.status, after: 'trash' }],
        preflight: async () => { const latest = await client.getContent(args.kind, args.id); await client.assertContentAllowed(args.kind, latest); if (latest.modified_gmt !== current.modified_gmt) throw new AppError('CONFLICT', 'O conteúdo foi modificado após a preparação.') },
        execute: async () => ({ deletion: await client.trashContent(args.kind, args.id) }),
      })
      return successResult(operationPreparationMessage(this.context.config.requireConfirmation, 'Plano de lixeira preparado.', 'impacto'), plan)
    }))

    server.registerTool('wordpress_prepare_upload_media', {
      title: 'Preparar upload de mídia WordPress',
      description: 'Valida caminho, tamanho, MIME, associação e hash antes de preparar o upload. Informe wiki=user ou wiki=developer quando houver mais de uma wiki configurada.',
      inputSchema: z.object({ wiki: wikiKind.optional(), path: z.string().trim().min(1), fields: mediaFieldsSchema.extend({ postId: z.number().int().positive() }) }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const client = this.#requireClient(wiki)
      const policy = this.#requirePolicy(wiki)
      const inspected = await inspectMediaPath(args.path, this.context.config.wordpress?.allowedMediaRoots ?? [], policy)
      await client.assertAssociatedContentAllowed(args.fields.postId)
      const initialHash = await this.#fileHash(inspected.path)
      const plan = await this.context.operations.prepare({
        module: 'wordpress', action: 'upload_media', target: `${wiki}:${inspected.path}`, summary: `Enviar mídia ${inspected.path} na ${wikiLabels[wiki]}`,
        diff: [{ field: 'file', after: { path: inspected.path, size: inspected.size, mimeType: inspected.mimeType, sha256: initialHash } }, ...mediaDiff(null, args.fields)],
        preflight: async () => { const current = await inspectMediaPath(inspected.path, this.context.config.wordpress?.allowedMediaRoots ?? [], policy); if (await this.#fileHash(current.path) !== initialHash) throw new AppError('CONFLICT', 'O arquivo mudou após a preparação.'); await client.assertAssociatedContentAllowed(args.fields.postId) },
        execute: async () => ({ media: normalizeMedia(wiki, await client.uploadMedia({ path: inspected.path, mimeType: inspected.mimeType, bytes: await readFile(inspected.path) }, args.fields)) }),
      })
      return successResult(operationPreparationMessage(this.context.config.requireConfirmation, 'Plano de upload preparado.', 'metadados'), plan)
    }))

    server.registerTool('wordpress_prepare_update_media', {
      title: 'Preparar edição de mídia WordPress',
      description: 'Prepara edição de metadados de uma mídia associada a conteúdo autorizado. Informe wiki=user ou wiki=developer quando houver mais de uma wiki configurada.',
      inputSchema: z.object({ wiki: wikiKind.optional(), id: z.number().int().positive(), fields: mediaFieldsSchema.refine(value => Object.values(value).some(entry => entry !== undefined), 'Informe ao menos um campo.') }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const client = this.#requireClient(wiki)
      const current = await client.getMedia(args.id)
      await client.assertMediaAllowed(current)
      if (args.fields.postId) await client.assertAssociatedContentAllowed(args.fields.postId)
      const plan = await this.context.operations.prepare({
        module: 'wordpress', action: 'update_media', target: `${wiki}:media:${args.id}`, summary: `Editar mídia ${args.id} na ${wikiLabels[wiki]}`,
        diff: mediaDiff(current, args.fields),
        preflight: async () => {
          const latest = await client.getMedia(args.id)
          await client.assertMediaAllowed(latest)
          if (args.fields.postId) await client.assertAssociatedContentAllowed(args.fields.postId)
          if (latest.modified_gmt !== current.modified_gmt) throw new AppError('CONFLICT', 'A mídia foi modificada após a preparação.')
        },
        execute: async () => ({ media: normalizeMedia(wiki, await client.updateMedia(args.id, args.fields)) }),
      })
      return successResult(operationPreparationMessage(this.context.config.requireConfirmation, 'Plano de edição preparado.'), plan)
    }))

    server.registerTool('wordpress_prepare_trash_media', {
      title: 'Preparar envio de mídia à lixeira',
      description: 'Prepara remoção recuperável; falha se a instalação não oferecer lixeira de mídia. Informe wiki=user ou wiki=developer quando houver mais de uma wiki configurada.',
      inputSchema: z.object({ wiki: wikiKind.optional(), id: z.number().int().positive() }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const client = this.#requireClient(wiki)
      const current = await client.getMedia(args.id)
      await client.assertMediaAllowed(current)
      const plan = await this.context.operations.prepare({
        module: 'wordpress', action: 'trash_media', target: `${wiki}:media:${args.id}`, summary: `Enviar mídia ${args.id} da ${wikiLabels[wiki]} à lixeira`,
        diff: [{ field: 'status', before: current.status, after: 'trash' }],
        preflight: async () => { const latest = await client.getMedia(args.id); await client.assertMediaAllowed(latest); if (latest.modified_gmt !== current.modified_gmt) throw new AppError('CONFLICT', 'A mídia foi modificada após a preparação.') },
        execute: async () => ({ deletion: await client.trashMedia(args.id) }),
      })
      return successResult(operationPreparationMessage(this.context.config.requireConfirmation, 'Plano de lixeira preparado.', 'impacto'), plan)
    }))
  }

  #configuredWikis(): WordPressWiki[] {
    return wordPressWikis.filter(wiki => this.#clients[wiki] !== undefined)
  }

  #resolveWiki(wiki: WordPressWiki | undefined): WordPressWiki {
    const configured = this.#configuredWikis()
    if (configured.length === 0) throw new AppError('CONFIG_MISSING', `Configuração WordPress incompleta: ${(this.context.config.configurationIssues.wordpress ?? []).join(', ')}`)
    if (wiki) {
      if (!configured.includes(wiki)) throw new AppError('CONFIG_MISSING', `A ${wikiLabels[wiki]} não está configurada.`, { wiki, configuredWikis: configured })
      return wiki
    }
    if (configured.length === 1) {
      const only = configured[0]
      if (only) return only
    }
    throw new AppError('AMBIGUOUS_REQUEST', 'Informe qual wiki deve ser usada: user (pública dos usuários) ou developer (da informática).', {
      parameter: 'wiki',
      options: configured.map(option => ({ value: option, label: wikiLabels[option] })),
    })
  }

  #requireClient(wiki: WordPressWiki): WordPressClient {
    const client = this.#clients[wiki]
    if (!client) throw new AppError('CONFIG_MISSING', `A ${wikiLabels[wiki]} não está configurada.`, { wiki })
    return client
  }

  #requirePolicy(wiki: WordPressWiki): WordPressPolicy {
    const policy = this.#policies[wiki]
    if (!policy) throw new AppError('CONFIG_MISSING', `A política da ${wikiLabels[wiki]} não foi carregada.`, { wiki })
    return policy
  }

  #scopeDetails(): Record<string, unknown> {
    const profiles = this.#configuredWikis().map(wiki => {
      const policy = this.#requirePolicy(wiki)
      return {
        wiki,
        label: wikiLabels[wiki],
        baseUrl: this.context.config.wordpress?.wikis[wiki]?.baseUrl,
        pageScope: policy.allowedPageRootIds.length === 0 ? 'all' : 'restricted',
        pageRootCount: policy.allowedPageRootIds.length,
        postScope: policy.allowedPostCategoryIds.length === 0 ? 'all' : 'restricted',
        postCategoryCount: policy.allowedPostCategoryIds.length,
        allowedMediaMimeTypes: policy.allowedMediaMimeTypes,
        maxMediaBytes: policy.maxMediaBytes,
      }
    })
    const mediaRootCount = this.context.config.wordpress?.allowedMediaRoots.length ?? 0
    const firstProfile = profiles[0]
    const details: Record<string, unknown> = {
      pageScope: profiles.length === 1 && firstProfile ? firstProfile.pageScope : 'per-wiki',
      postScope: profiles.length === 1 && firstProfile ? firstProfile.postScope : 'per-wiki',
      mediaPathScope: mediaRootCount === 0 ? 'all' : 'restricted',
      mediaRootCount,
      wikiCount: profiles.length,
      wikis: profiles,
    }
    if (profiles.length === 1 && firstProfile) {
      details.pageRootCount = firstProfile.pageRootCount
      details.postCategoryCount = firstProfile.postCategoryCount
      details.allowedMediaMimeTypes = firstProfile.allowedMediaMimeTypes
      details.maxMediaBytes = firstProfile.maxMediaBytes
    }
    return details
  }

  async #fileHash(path: string): Promise<string> {
    return createHash('sha256').update(await readFile(path)).digest('hex')
  }
}
