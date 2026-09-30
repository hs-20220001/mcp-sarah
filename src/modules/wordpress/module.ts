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
import type { ContentFieldsInput, ContentKind, MediaFieldsInput, MenuItemFieldsInput, WordPressContent, WordPressMedia, WordPressMenuItem, WordPressTextField } from './types.js'

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
const menuItemFieldsSchema = z.object({
  parentItemId: z.number().int().nonnegative().optional(),
  menuOrder: z.number().int().nonnegative().optional(),
  title: z.string().trim().min(1).max(512).optional(),
})

function menuItemTitle(item: WordPressMenuItem): string {
  return typeof item.title === 'string' ? item.title : raw(item.title)
}

function normalizeMenuItem(item: WordPressMenuItem): Record<string, unknown> {
  return { id: item.id, title: menuItemTitle(item), pageId: item.type === 'post_type' && item.object === 'page' ? item.object_id : null, type: item.type, object: item.object, parentItemId: item.parent, menuOrder: item.menu_order, menuId: item.menus, status: item.status, url: item.url }
}

function menuFingerprint(items: WordPressMenuItem[]): string {
  return createHash('sha256').update(JSON.stringify(items.map(item => [item.id, item.menus, item.parent, item.menu_order, item.type, item.object, item.object_id, menuItemTitle(item), item.url, item.status]).sort((a, b) => Number(a[0]) - Number(b[0])))).digest('hex')
}

function normalizedName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR')
}

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
    server.registerTool('wordpress_list_menus', {
      title: 'Listar menus WordPress',
      description: 'Descobre menus reais da wiki escolhida, sem buscar todos os seus itens. Para encontrar posição hierárquica, consulte os itens do menu candidato ou use a sugestão.',
      inputSchema: z.object({ wiki: wikiKind.optional(), page: z.number().int().min(1).default(1), perPage: z.number().int().min(1).max(50).default(50) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const menus = await this.#requireClient(wiki).listMenus(args.page, args.perPage)
      return successResult(`${menus.length} menu(s) na ${wikiLabels[wiki]}.`, { wiki, menus: menus.map(menu => ({ id: menu.id, name: menu.name, slug: menu.slug, locations: menu.locations ?? [] })), page: args.page, hasMore: menus.length === args.perPage })
    }))

    server.registerTool('wordpress_list_menu_items', {
      title: 'Listar itens de menu WordPress',
      description: 'Lê itens reais paginados de um menu, incluindo hierarquia parentItemId e ordem; menuId deve vir da listagem da wiki selecionada.',
      inputSchema: z.object({ wiki: wikiKind.optional(), menuId: z.number().int().positive(), page: z.number().int().min(1).default(1), perPage: z.number().int().min(1).max(50).default(50) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const client = this.#requireClient(wiki)
      const menu = await client.getMenu(args.menuId)
      const items = await client.listMenuItems(args.menuId, args.page, args.perPage)
      return successResult(`${items.length} item(ns) do menu ${menu.name}.`, { wiki, menu: { id: menu.id, name: menu.name }, items: items.map(normalizeMenuItem), page: args.page, hasMore: items.length === args.perPage })
    }))

    server.registerTool('wordpress_suggest_menu_placement', {
      title: 'Sugerir posição em menu WordPress',
      description: 'Consulta menus reais e itens somente do candidato. Na wiki developer, sistemas costumam ficar em Software e desenvolvimento; na wiki user, procure o menu com nome do sistema. Sem correspondência única ou pai seguro, peça ao usuário menu e posição; nunca insere automaticamente.',
      inputSchema: z.object({ wiki: wikiKind.optional(), systemName: z.string().trim().min(1).max(200).optional(), pageParentId: z.number().int().positive().optional(), menuId: z.number().int().positive().optional(), isSystem: z.boolean().default(false) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const client = this.#requireClient(wiki)
      const menus = (args.menuId ? [await client.getMenu(args.menuId)] : await this.#allMenus(client))
        .filter(menu => this.#requirePolicy(wiki).allowedMenuIds.length === 0 || this.#requirePolicy(wiki).allowedMenuIds.includes(menu.id))
      const matches = args.menuId ? menus.filter(menu => menu.id === args.menuId) : wiki === 'developer' && args.isSystem
        ? menus.filter(menu => normalizedName(menu.name) === 'software e desenvolvimento')
        : args.systemName ? menus.filter(menu => normalizedName(menu.name) === normalizedName(args.systemName ?? '')) : []
      const menu = matches.length === 1 ? matches[0] : undefined
      if (!menu) return successResult('Não há posição única e segura para o menu. Peça ao usuário o menu e o item pai; a página NÃO foi adicionada ao menu.', { wiki, suggested: false, reason: matches.length ? 'Mais de um menu corresponde ao contexto.' : 'Nenhum menu inequívoco corresponde ao contexto informado.', menus: menus.map(entry => ({ id: entry.id, name: entry.name })) })
      const items = await client.getAllMenuItems(menu.id)
      if (args.pageParentId) await client.assertContentAllowed('page', await client.getContent('page', args.pageParentId))
      const parents = args.pageParentId ? items.filter(item => item.type === 'post_type' && item.object === 'page' && item.object_id === args.pageParentId) : []
      const root = wiki === 'developer' && args.isSystem ? items.filter(item => item.parent === 0 && normalizedName(menuItemTitle(item)) === normalizedName(menu.name)) : []
      const parentItemId = parents.length === 1 ? parents[0]?.id : args.pageParentId ? undefined : wiki === 'developer' && args.isSystem ? root.length === 1 ? root[0]?.id : undefined : 0
      if (parentItemId === undefined) return successResult('A posição hierárquica não está clara. Peça ao usuário o item pai; a página NÃO foi adicionada ao menu.', { wiki, suggested: false, reason: args.pageParentId ? 'A página-pai não aparece exatamente uma vez no menu candidato.' : 'O item raiz do menu de sistemas não foi identificado de modo único.', menu: { id: menu.id, name: menu.name } })
      await this.#assertMenuParent(client, items, parentItemId)
      const parentItem = items.find(item => item.id === parentItemId)
      return successResult(`Sugestão para ${menu.name}: confirme o menu e o item pai antes de preparar a inclusão. A página ainda NÃO foi adicionada ao menu.`, { wiki, suggested: true, menu: { id: menu.id, name: menu.name }, parentItemId, parentTitle: parentItem ? menuItemTitle(parentItem) : null, reason: parents.length === 1 ? 'A página-pai já consta neste menu.' : wiki === 'developer' ? 'Menu e item raiz de sistemas identificados na wiki da informática.' : 'Menu do sistema identificado por nome informado.' })
    }))

    server.registerTool('wordpress_prepare_create_menu_item', {
      title: 'Preparar inclusão de página em menu',
      description: 'Após criar/publicar a página e confirmar explicitamente o menu e o item pai sugeridos, prepara UMA escrita para inseri-la no menu real. Sem confirmação da posição, não inclua; reporte que a página ficou fora do menu e peça menu/posição.',
      inputSchema: z.object({ wiki: wikiKind.optional(), menuId: z.number().int().positive(), pageId: z.number().int().positive(), fields: menuItemFieldsSchema }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const client = this.#requireClient(wiki)
      const { menu, items, fingerprint } = await this.#menuSnapshot(wiki, args.menuId)
      const page = await client.getContent('page', args.pageId)
      await client.assertContentAllowed('page', page)
      if (page.status !== 'publish') throw new AppError('POLICY_DENIED', 'Publique a página antes de adicioná-la ao menu; página em rascunho permanece fora do menu.')
      if (items.some(item => item.type === 'post_type' && item.object === 'page' && item.object_id === page.id)) throw new AppError('CONFLICT', 'A página já consta neste menu; consulte os itens para editar sua posição.')
      await this.#assertMenuParent(client, items, args.fields.parentItemId ?? 0)
      const fields: MenuItemFieldsInput = { ...args.fields, parentItemId: args.fields.parentItemId ?? 0, menuOrder: args.fields.menuOrder ?? Math.max(0, ...items.map(item => item.menu_order)) + 1 }
      const plan = await this.context.operations.prepare({
        module: 'wordpress', action: 'create_menu_item', target: `${wiki}:menu:${menu.id}:page:${page.id}`, summary: `Adicionar página ${page.id} ao menu ${menu.name} da ${wikiLabels[wiki]}`,
        diff: [{ field: 'menuId', after: menu.id }, { field: 'pageId', after: page.id }, { field: 'parentItemId', after: fields.parentItemId }, { field: 'menuOrder', after: fields.menuOrder }, ...(fields.title ? [{ field: 'title', after: fields.title }] : [])],
        preflight: async () => {
          const latest = await this.#menuSnapshot(wiki, menu.id)
          if (latest.fingerprint !== fingerprint || latest.menu.name !== menu.name) throw new AppError('CONFLICT', 'O menu foi modificado após a preparação; consulte-o novamente.')
          const currentPage = await client.getContent('page', page.id)
          await client.assertContentAllowed('page', currentPage)
          if (currentPage.status !== 'publish' || currentPage.modified_gmt !== page.modified_gmt) throw new AppError('CONFLICT', 'A página foi modificada ou deixou de estar publicada.')
          await this.#assertMenuParent(client, latest.items, fields.parentItemId ?? 0)
        },
        execute: async () => ({ menuItem: normalizeMenuItem(await client.createMenuItem(menu.id, page.id, fields)) }),
      })
      return successResult(operationPreparationMessage(this.context.config.requireConfirmation, 'Plano de inclusão no menu preparado; a página AINDA NÃO foi adicionada.'), plan)
    }))

    server.registerTool('wordpress_prepare_update_menu_item', {
      title: 'Preparar atualização de item de menu',
      description: 'Reposiciona item de página existente no MESMO menu (pai/ordem/rótulo), com diff e preflight. Não muda o vínculo de página nem transfere entre menus.',
      inputSchema: z.object({ wiki: wikiKind.optional(), menuId: z.number().int().positive(), itemId: z.number().int().positive(), fields: menuItemFieldsSchema.refine(value => Object.values(value).some(entry => entry !== undefined), 'Informe ao menos um campo.') }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const wiki = this.#resolveWiki(args.wiki)
      const client = this.#requireClient(wiki)
      const { menu, items, fingerprint } = await this.#menuSnapshot(wiki, args.menuId)
      const item = items.find(entry => entry.id === args.itemId)
      if (!item) throw new AppError('NOT_FOUND', 'Item não encontrado neste menu.')
      if (item.type !== 'post_type' || item.object !== 'page') throw new AppError('POLICY_DENIED', 'Somente itens associados a páginas podem ser editados.')
      await client.assertContentAllowed('page', await client.getContent('page', item.object_id))
      if (args.fields.parentItemId !== undefined) await this.#assertMenuParent(client, items, args.fields.parentItemId, item.id)
      const plan = await this.context.operations.prepare({
        module: 'wordpress', action: 'update_menu_item', target: `${wiki}:menu:${menu.id}:item:${item.id}`, summary: `Editar item ${item.id} do menu ${menu.name} da ${wikiLabels[wiki]}`,
        diff: Object.entries(args.fields).map(([field, after]) => ({ field, before: field === 'parentItemId' ? item.parent : field === 'menuOrder' ? item.menu_order : menuItemTitle(item), after })),
        preflight: async () => {
          const latest = await this.#menuSnapshot(wiki, menu.id)
          if (latest.fingerprint !== fingerprint || latest.menu.name !== menu.name) throw new AppError('CONFLICT', 'O menu foi modificado após a preparação; consulte-o novamente.')
          await client.assertContentAllowed('page', await client.getContent('page', item.object_id))
          if (args.fields.parentItemId !== undefined) await this.#assertMenuParent(client, latest.items, args.fields.parentItemId, item.id)
        },
        execute: async () => ({ menuItem: normalizeMenuItem(await client.updateMenuItem(item.id, args.fields)) }),
      })
      return successResult(operationPreparationMessage(this.context.config.requireConfirmation, 'Plano de edição de item de menu preparado.'), plan)
    }))

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
      description: 'Prepara uma página ou post em escopo autorizado. O status padrão é draft. Para páginas: antes, consulte menus e sugira posição apenas quando for inequívoca; após criar e publicar, prepare separadamente o item do menu confirmado. Se não for incluída (ambiguidade, rascunho ou falha), informe explicitamente motivo e peça ao usuário menu/item pai. Criar página e criar item são duas escritas independentes, sem atomicidade. Informe wiki=user ou wiki=developer quando houver duas wikis.',
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
        execute: async () => ({ content: normalizeContent(wiki, args.kind, await client.createContent(args.kind, args.fields)), ...(args.kind === 'page' ? { menu: { added: false, reason: 'Criar uma página não a insere no menu lateral. Consulte e confirme a posição e prepare uma operação separada; se não for possível, informe ao usuário o motivo e solicite menu e item pai.' } } : {}) }),
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

  async #allMenus(client: WordPressClient): Promise<Array<{ id: number; name: string; slug: string }>> {
    const menus: Array<{ id: number; name: string; slug: string }> = []
    for (let page = 1; page <= 4; page += 1) {
      let totalPages: number | undefined
      const batch = await client.listMenus(page, 50, response => {
        const value = Number(response.headers.get('X-WP-TotalPages'))
        if (Number.isInteger(value) && value > 0) totalPages = value
      })
      menus.push(...batch)
      if (batch.length < 50 || page === totalPages) return menus
    }
    throw new AppError('POLICY_DENIED', 'Há mais de 200 menus; consulte-os por páginas e informe o menuId explicitamente.')
  }

  async #menuSnapshot(wiki: WordPressWiki, menuId: number): Promise<{ menu: { id: number; name: string }; items: WordPressMenuItem[]; fingerprint: string }> {
    const policy = this.#requirePolicy(wiki)
    if (policy.allowedMenuIds.length && !policy.allowedMenuIds.includes(menuId)) throw new AppError('POLICY_DENIED', 'O menu não está autorizado na política desta wiki.')
    const client = this.#requireClient(wiki)
    const menu = await client.getMenu(menuId)
    const items = await client.getAllMenuItems(menuId)
    return { menu: { id: menu.id, name: menu.name }, items, fingerprint: menuFingerprint(items) }
  }

  async #assertMenuParent(client: WordPressClient, items: WordPressMenuItem[], parentId: number, movingId?: number): Promise<void> {
    if (parentId === 0) return
    const visited = new Set<number>()
    let current = parentId
    while (current !== 0) {
      if (current === movingId || visited.has(current)) throw new AppError('POLICY_DENIED', 'A posição proposta cria um ciclo na hierarquia do menu.')
      visited.add(current)
      const parent = items.find(item => item.id === current)
      if (!parent) throw new AppError('POLICY_DENIED', 'O item pai não existe neste menu.')
      if (parent.type === 'post_type' && parent.object === 'page') {
        await client.assertContentAllowed('page', await client.getContent('page', parent.object_id))
      } else if (parent.type !== 'custom') {
        throw new AppError('POLICY_DENIED', 'O item pai deve ser uma página autorizada ou um agrupador personalizado.')
      }
      current = parent.parent
    }
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
