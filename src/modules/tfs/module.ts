import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod/v4'
import { AppError } from '../../core/errors.js'
import { HttpClient } from '../../core/http.js'
import type { IntegrationModule, ModuleContext, ModuleHealth } from '../../core/module.js'
import { operationPreparationMessage } from '../../core/operations.js'
import { SnapshotStore } from '../../core/snapshots.js'
import { safeToolCall, successResult } from '../../core/tool-result.js'
import { TfsClient } from './client.js'
import { assertParentType, assertWorkItemType, loadTfsPolicy, resolveCustomFields, type TfsPolicy } from './policy.js'
import type { TfsComment, TfsWorkItem, WorkItemFieldsInput } from './types.js'

const pageSize = z.number().int().min(1).max(50).default(25)
const commentText = z.string().min(1).max(100_000).refine(value => value.trim().length > 0, 'O comentário não pode ser vazio.')
const customValue = z.union([z.string(), z.number(), z.boolean(), z.null()])
const pbiDescriptionGuidance = 'Para Product Backlog Item (PBI), se o usuário não pedir explicitamente outro formato e houver contexto suficiente, comece a descrição em HTML com <p><em>"<strong>Como</strong> [persona], <strong>quero</strong> [objetivo], <strong>para</strong> [benefício]."</em></p> e, em seguida, acrescente os detalhes do PBI em outros parágrafos. A frase inteira fica entre aspas e em itálico; destaque somente Como, quero e para também em negrito. Não invente informações nem altere um formato explicitamente solicitado.'
const taskGuidance = 'Para Tasks de um PBI, se o usuário não especificar quantidade ou categorias, proponha quatro Tasks: Desenvolvimento, Documentação, Comunicação e Testes. Use type="Task", parentId com o ID do PBI e títulos no padrão "<Categoria> - <título reduzido do PBI>". O sufixo deve ter no máximo o tamanho do título do PBI: use somente palavras do próprio título, na mesma ordem, removendo termos se necessário; NÃO acrescente preposições (por exemplo, "Fluxo Agendamento Cirurgia" não vira "Fluxo de Agendamento de Cirurgia"), nem resuma o conteúdo da descrição do PBI. Configure customFields.activity, respectivamente, como Development, Documentation, Communication e Testing. Se houver elementos concretos na descrição ou nos critérios de aceite do PBI, escreva uma descrição breve do que fazer em cada Task; caso contrário, deixe-a ausente, sem inventar etapas. Quando o usuário não informar responsável, área ou iteração, a ferramenta herda esses campos do PBI pai; valores explícitos prevalecem. Prepare uma operação separada por Task e siga o fluxo de diff e confirmação antes de aplicar.'
const taskFieldsGuidance = 'Para Tasks, customFields.activity aceita Communication, Deployment, Design, Development, Documentation, Requirements ou Testing; remainingWork recebe número e blocked recebe boolean. Esses três aliases são exclusivos de Task.'
const taskTitleGuidance = 'Para Task filha de PBI, use "<Categoria> - <título reduzido do PBI>". O sufixo usa somente palavras do título do PBI na mesma ordem, sem acrescentar preposições ou outras palavras, e nunca é maior que o título do PBI. Ex.: Comunicação - Fluxo Agendamento Cirurgia.'
const mutableFieldsSchema = z.object({
  title: z.string().trim().min(1).max(512).optional().describe(taskTitleGuidance),
  description: z.string().max(100_000).nullable().optional().describe(`${pbiDescriptionGuidance} Para Task, descreva brevemente o trabalho apenas quando o PBI fornecer contexto suficiente; não invente etapas.`),
  acceptanceCriteria: z.string().max(100_000).nullable().optional().describe('Critérios de aceite do work item. No PBI, corresponde ao campo Acceptance Criteria do TFS.'),
  state: z.string().trim().min(1).max(128).nullable().optional(),
  assignedTo: z.string().trim().min(1).max(256).nullable().optional(),
  areaPath: z.string().trim().min(1).max(512).nullable().optional(),
  iterationPath: z.string().trim().min(1).max(512).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(128)).max(50).nullable().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  customFields: z.record(z.string(), customValue).optional().describe(taskFieldsGuidance),
})

function compact(item: TfsWorkItem): Record<string, unknown> {
  return {
    id: item.id,
    rev: item.rev,
    type: item.type,
    title: item.title,
    acceptanceCriteria: item.acceptanceCriteria,
    state: item.state,
    assignedTo: item.assignedTo,
    areaPath: item.areaPath,
    iterationPath: item.iterationPath,
    tags: item.tags,
    parentId: item.parentId,
    customFields: item.customFields,
    changedDate: item.changedDate,
    url: item.webUrl,
  }
}

function compactComment(comment: TfsComment): Record<string, unknown> {
  return {
    workItemId: comment.workItemId,
    commentId: comment.commentId,
    version: comment.version,
    text: comment.text,
    createdDate: comment.createdDate,
    modifiedDate: comment.modifiedDate,
    isDeleted: comment.isDeleted,
  }
}

function fieldDiff(current: TfsWorkItem | null, input: WorkItemFieldsInput): Array<{ field: string; before?: unknown; after?: unknown }> {
  const before = current as unknown as Record<string, unknown> | null
  const diff = Object.keys(input).flatMap(field => {
    const after: unknown = Reflect.get(input, field)
    if (after === undefined) return []
    const currentValue = field === 'customFields' ? current?.customFields : before?.[field]
    return [{ field, before: currentValue, after }]
  })
  return diff
}

function parentAssignee(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object' && 'uniqueName' in value && typeof value.uniqueName === 'string' && value.uniqueName.trim()) return value.uniqueName
  return undefined
}

export class TfsModule implements IntegrationModule {
  readonly id = 'tfs' as const
  readonly #snapshots = new SnapshotStore<number>()
  #client?: TfsClient
  #policy?: TfsPolicy

  constructor(readonly context: ModuleContext) {}

  async initialize(): Promise<void> {
    const config = this.context.config.tfs
    if (!config) return
    this.#policy = await loadTfsPolicy(config.policyPath)
    this.#client = new TfsClient(config, this.#policy, new HttpClient({ timeoutMs: this.context.config.requestTimeoutMs }))
  }

  async healthCheck(probe: boolean): Promise<ModuleHealth> {
    if (!this.#client) {
      return { id: 'tfs', configured: false, message: `Configuração ausente: ${(this.context.config.configurationIssues.tfs ?? []).join(', ')}` }
    }
    const details = this.#policy ? { profile: this.#policy.profile, allowedWorkItemTypes: this.#policy.allowedWorkItemTypes } : undefined
    if (!probe) return { id: 'tfs', configured: true, message: 'Configurado; conexão não testada.', ...(details ? { details } : {}) }
    try {
      await this.#client.healthCheck()
      return { id: 'tfs', configured: true, reachable: true, message: 'Conexão validada.', ...(details ? { details } : {}) }
    } catch {
      return { id: 'tfs', configured: true, reachable: false, message: 'Falha ao validar a conexão.', ...(details ? { details } : {}) }
    }
  }

  registerTools(server: McpServer): void {
    server.registerTool('tfs_list_saved_queries', {
      title: 'Listar queries salvas do TFS',
      description: 'Navega pastas e queries salvas do projeto configurado, sem alterar o TFS.',
      inputSchema: z.object({ folderPath: z.string().trim().max(512).optional(), search: z.string().trim().max(128).optional(), offset: z.number().int().min(0).default(0), limit: pageSize }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const client = this.#requireClient()
      const entries = await client.listQueries()
      const folder = args.folderPath?.replace(/\\/g, '/').replace(/\/$/, '')
      const search = args.search?.toLocaleLowerCase('pt-BR')
      const filtered = entries.filter(entry => {
        const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : ''
        return (folder === undefined || parent === folder) && (!search || `${entry.name} ${entry.path}`.toLocaleLowerCase('pt-BR').includes(search))
      })
      const page = filtered.slice(args.offset, args.offset + args.limit)
      const result = { entries: page, pageInfo: { offset: args.offset, limit: args.limit, total: filtered.length, nextOffset: args.offset + page.length < filtered.length ? args.offset + page.length : null } }
      return successResult(`${page.length} entrada(s) encontrada(s).`, result)
    }))

    server.registerTool('tfs_preview_saved_query', {
      title: 'Visualizar query salva do TFS',
      description: 'Executa uma query salva, cria um snapshot temporário e retorna a primeira página de work items.',
      inputSchema: z.object({ queryId: z.uuid(), limit: pageSize }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => this.#createSnapshotPage(await this.#requireClient().queryIds(args.queryId), 0, args.limit)))

    server.registerTool('tfs_search_work_items', {
      title: 'Pesquisar work items do TFS',
      description: 'Executa uma consulta WIQL construída a partir de filtros seguros; não aceita WIQL arbitrário.',
      inputSchema: z.object({
        text: z.string().trim().min(1).max(256).optional(),
        types: z.array(z.string().trim().min(1)).max(10).optional(),
        states: z.array(z.string().trim().min(1)).max(20).optional(),
        assignedTo: z.string().trim().min(1).max(256).optional(),
        tags: z.array(z.string().trim().min(1).max(128)).max(10).optional(),
        areaPath: z.string().trim().min(1).max(512).optional(),
        iterationPath: z.string().trim().min(1).max(512).optional(),
        changedSince: z.iso.datetime().optional(),
        maxItems: z.number().int().min(1).max(500).default(200),
        limit: pageSize,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const ids = await this.#requireClient().searchIds(args)
      return this.#createSnapshotPage(ids, 0, args.limit)
    }))

    server.registerTool('tfs_list_work_items', {
      title: 'Continuar snapshot de work items',
      description: 'Retorna a próxima página de um snapshot temporário criado por uma consulta TFS.',
      inputSchema: z.object({ snapshotId: z.uuid(), offset: z.number().int().min(0).default(0), limit: pageSize }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => this.#snapshotPage(args.snapshotId, args.offset, args.limit)))

    server.registerTool('tfs_get_work_item', {
      title: 'Consultar work item do TFS',
      description: 'Retorna campos normalizados, relações, revisão e URL de um work item.',
      inputSchema: z.object({ id: z.number().int().positive() }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const item = await this.#requireClient().getWorkItem(args.id)
      return successResult(`Work item ${item.id}: ${item.title}`, { workItem: item })
    }))

    server.registerTool('tfs_list_work_item_comments', {
      title: 'Listar comentários de work item do TFS',
      description: 'Retorna comentários de um work item com paginação por continuation token.',
      inputSchema: z.object({
        id: z.number().int().positive(),
        continuationToken: z.string().trim().max(2_048).optional(),
        order: z.enum(['asc', 'desc']).default('asc'),
        includeDeleted: z.boolean().default(false),
        limit: pageSize,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const page = await this.#requireClient().listComments(args.id, args.limit, args.continuationToken, args.order, args.includeDeleted)
      return successResult(`${page.comments.length} comentário(s) retornado(s).`, {
        workItemId: args.id,
        comments: page.comments.map(compactComment),
        continuationToken: page.continuationToken,
      })
    }))

    server.registerTool('tfs_prepare_create_work_item_comment', {
      title: 'Preparar criação de comentário no TFS',
      description: 'Valida e prepara a inserção de um comentário. Não escreve no TFS; devolve diff e token curto.',
      inputSchema: z.object({ id: z.number().int().positive(), text: commentText }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const client = this.#requireClient()
      const policy = this.#requirePolicy()
      const raw = await client.getRawWorkItem(args.id)
      const current = client.normalize(raw)
      assertWorkItemType(policy, current.type)
      const plan = await this.context.operations.prepare({
        module: 'tfs', action: 'create_work_item_comment', target: String(args.id), summary: `Adicionar comentário ao work item ${args.id}`,
        diff: [{ field: 'comment.text', after: args.text }, { field: 'workItem.rev', before: raw.rev }],
        preflight: async () => {
          const latest = await client.getRawWorkItem(args.id)
          if (latest.rev !== raw.rev) throw new AppError('CONFLICT', `A revisão mudou de ${raw.rev} para ${latest.rev}.`)
        },
        execute: async () => ({ comment: await client.addComment(args.id, args.text) as unknown as Record<string, unknown> }),
      })
      return successResult(operationPreparationMessage(this.context.config.requireConfirmation, 'Plano de criação de comentário preparado.'), plan)
    }))

    server.registerTool('tfs_prepare_update_work_item_comment', {
      title: 'Preparar alteração de comentário no TFS',
      description: 'Lê a revisão do work item e a versão do comentário antes de preparar uma alteração protegida.',
      inputSchema: z.object({ id: z.number().int().positive(), commentId: z.number().int().positive(), text: commentText }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const client = this.#requireClient()
      const policy = this.#requirePolicy()
      const raw = await client.getRawWorkItem(args.id)
      const current = client.normalize(raw)
      assertWorkItemType(policy, current.type)
      const comment = await client.getComment(args.id, args.commentId)
      if (comment.isDeleted) throw new AppError('POLICY_DENIED', 'O comentário já está deletado.')
      const plan = await this.context.operations.prepare({
        module: 'tfs', action: 'update_work_item_comment', target: `${args.id}/comments/${args.commentId}`, summary: `Alterar comentário ${args.commentId} do work item ${args.id}`,
        diff: [{ field: 'comment.text', before: comment.text, after: args.text }, { field: 'comment.version', before: comment.version }, { field: 'workItem.rev', before: raw.rev }],
        preflight: async () => {
          const latestWorkItem = await client.getRawWorkItem(args.id)
          if (latestWorkItem.rev !== raw.rev) throw new AppError('CONFLICT', `A revisão mudou de ${raw.rev} para ${latestWorkItem.rev}.`)
          const latestComment = await client.getComment(args.id, args.commentId)
          if (latestComment.version !== comment.version) throw new AppError('CONFLICT', `A versão do comentário mudou de ${comment.version} para ${latestComment.version}.`)
          if (latestComment.isDeleted) throw new AppError('CONFLICT', 'O comentário foi deletado antes da aplicação.')
        },
        execute: async () => ({ comment: await client.updateComment(args.id, args.commentId, args.text) as unknown as Record<string, unknown> }),
      })
      return successResult(operationPreparationMessage(this.context.config.requireConfirmation, 'Plano de alteração de comentário preparado.'), plan)
    }))

    server.registerTool('tfs_prepare_delete_work_item_comment', {
      title: 'Preparar deleção de comentário no TFS',
      description: 'Prepara a deleção de um comentário com verificação de revisão e versão antes da aplicação.',
      inputSchema: z.object({ id: z.number().int().positive(), commentId: z.number().int().positive() }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const client = this.#requireClient()
      const policy = this.#requirePolicy()
      const raw = await client.getRawWorkItem(args.id)
      const current = client.normalize(raw)
      assertWorkItemType(policy, current.type)
      const comment = await client.getComment(args.id, args.commentId)
      if (comment.isDeleted) throw new AppError('POLICY_DENIED', 'O comentário já está deletado.')
      const plan = await this.context.operations.prepare({
        module: 'tfs', action: 'delete_work_item_comment', target: `${args.id}/comments/${args.commentId}`, summary: `Deletar comentário ${args.commentId} do work item ${args.id}`,
        diff: [{ field: 'comment.text', before: comment.text, after: null }, { field: 'comment.version', before: comment.version }, { field: 'workItem.rev', before: raw.rev }],
        preflight: async () => {
          const latestWorkItem = await client.getRawWorkItem(args.id)
          if (latestWorkItem.rev !== raw.rev) throw new AppError('CONFLICT', `A revisão mudou de ${raw.rev} para ${latestWorkItem.rev}.`)
          const latestComment = await client.getComment(args.id, args.commentId)
          if (latestComment.version !== comment.version) throw new AppError('CONFLICT', `A versão do comentário mudou de ${comment.version} para ${latestComment.version}.`)
          if (latestComment.isDeleted) throw new AppError('CONFLICT', 'O comentário foi deletado antes da aplicação.')
        },
        execute: async () => ({ comment: await client.deleteComment(args.id, args.commentId) as unknown as Record<string, unknown> }),
      })
      return successResult(operationPreparationMessage(this.context.config.requireConfirmation, 'Plano de deleção de comentário preparado.', 'impacto'), plan)
    }))

    server.registerTool('tfs_list_classifications', {
      title: 'Listar áreas ou iterações do TFS',
      description: 'Consulta a árvore real de áreas ou iterações para evitar valores inventados.',
      inputSchema: z.object({ kind: z.enum(['areas', 'iterations']), depth: z.number().int().min(1).max(10).default(4) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const tree = await this.#requireClient().listClassifications(args.kind, args.depth)
      return successResult(`Classificações '${args.kind}' consultadas.`, { tree })
    }))

    server.registerTool('tfs_prepare_create_work_item', {
      title: 'Preparar criação de work item',
      description: `Valida e prepara a criação de um work item. Não escreve no TFS; devolve diff e token curto. ${pbiDescriptionGuidance} ${taskGuidance}`,
      inputSchema: z.object({ type: z.string().trim().min(1), title: z.string().trim().min(1).max(512).describe(taskTitleGuidance), fields: mutableFieldsSchema.omit({ title: true }).default({}) }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const client = this.#requireClient()
      const policy = this.#requirePolicy()
      const input = { type: args.type, title: args.title, ...args.fields }
      assertWorkItemType(policy, input.type)
      resolveCustomFields(policy, input.customFields ?? {}, input.type)
      let inheritedParentRev: number | undefined
      if (input.parentId) {
        const parentRaw = await client.getRawWorkItem(input.parentId)
        const parent = client.normalize(parentRaw)
        assertParentType(policy, input.type, parent.type)
        if (input.type === 'Task' && parent.type === 'Product Backlog Item') {
          if (input.assignedTo === undefined) {
            const assignee = parentAssignee(parentRaw.fields['System.AssignedTo'])
            if (assignee !== undefined) { input.assignedTo = assignee; inheritedParentRev = parentRaw.rev }
          }
          if (input.areaPath === undefined && parent.areaPath) { input.areaPath = parent.areaPath; inheritedParentRev = parentRaw.rev }
          if (input.iterationPath === undefined && parent.iterationPath) { input.iterationPath = parent.iterationPath; inheritedParentRev = parentRaw.rev }
        }
      }
      const plan = await this.context.operations.prepare({
        module: 'tfs', action: 'create_work_item', target: `new:${args.type}`, summary: `Criar ${args.type}: ${args.title}`,
        diff: fieldDiff(null, input),
        preflight: async () => {
          if (input.parentId) {
            const parent = await client.getWorkItem(input.parentId)
            assertParentType(policy, input.type, parent.type)
            if (inheritedParentRev !== undefined && parent.rev !== inheritedParentRev) throw new AppError('CONFLICT', `A revisão do PBI mudou de ${inheritedParentRev} para ${parent.rev}. Prepare novamente a Task para atualizar os campos herdados.`)
          }
        },
        execute: async () => ({ workItem: await client.create(input) as unknown as Record<string, unknown> }),
      })
      return successResult(operationPreparationMessage(this.context.config.requireConfirmation, 'Plano de criação preparado.'), plan)
    }))

    server.registerTool('tfs_prepare_update_work_item', {
      title: 'Preparar edição de work item',
      description: `Lê a revisão atual e prepara uma edição protegida por verificação otimista. ${pbiDescriptionGuidance} ${taskGuidance} ${taskFieldsGuidance}`,
      inputSchema: z.object({ id: z.number().int().positive(), fields: mutableFieldsSchema.refine(value => Object.values(value).some(entry => entry !== undefined), 'Informe ao menos um campo.') }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const client = this.#requireClient()
      const policy = this.#requirePolicy()
      const raw = await client.getRawWorkItem(args.id)
      const current = client.normalize(raw)
      const fields: WorkItemFieldsInput = args.fields
      assertWorkItemType(policy, current.type)
      resolveCustomFields(policy, fields.customFields ?? {}, current.type)
      if (fields.parentId) assertParentType(policy, current.type, (await client.getWorkItem(fields.parentId)).type)
      const plan = await this.context.operations.prepare({
        module: 'tfs', action: 'update_work_item', target: String(args.id), summary: `Editar work item ${args.id}: ${current.title}`,
        diff: fieldDiff(current, fields),
        preflight: async () => {
          const latest = await client.getRawWorkItem(args.id)
          if (latest.rev !== raw.rev) throw new AppError('CONFLICT', `A revisão mudou de ${raw.rev} para ${latest.rev}.`)
          if (fields.parentId) assertParentType(policy, current.type, (await client.getWorkItem(fields.parentId)).type)
        },
        execute: async () => ({ workItem: await client.update(args.id, current.type, raw.rev, fields, raw.relations ?? []) as unknown as Record<string, unknown> }),
      })
      return successResult(operationPreparationMessage(this.context.config.requireConfirmation, 'Plano de edição preparado.'), plan)
    }))

    server.registerTool('tfs_prepare_trash_work_item', {
      title: 'Preparar envio de work item à lixeira',
      description: 'Prepara remoção recuperável de work items, inclusive Tasks. Nunca solicita destruição permanente.',
      inputSchema: z.object({ id: z.number().int().positive() }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const client = this.#requireClient()
      const current = await client.getWorkItem(args.id)
      const plan = await this.context.operations.prepare({
        module: 'tfs', action: 'trash_work_item', target: String(args.id), summary: `Enviar work item ${args.id} à lixeira`,
        diff: [{ field: 'lifecycle', before: { state: current.state, rev: current.rev }, after: 'recycle-bin' }],
        preflight: async () => { const latest = await client.getWorkItem(args.id); if (latest.rev !== current.rev) throw new AppError('CONFLICT', `A revisão mudou de ${current.rev} para ${latest.rev}.`) },
        execute: async () => ({ deletion: await client.trash(args.id) }),
      })
      return successResult(operationPreparationMessage(this.context.config.requireConfirmation, 'Plano de lixeira preparado.', 'impacto'), plan)
    }))
  }

  #requireClient(): TfsClient {
    if (!this.#client) throw new AppError('CONFIG_MISSING', `Configuração TFS incompleta: ${(this.context.config.configurationIssues.tfs ?? []).join(', ')}`)
    return this.#client
  }

  #requirePolicy(): TfsPolicy {
    if (!this.#policy) throw new AppError('CONFIG_MISSING', 'Política TFS não carregada.')
    return this.#policy
  }

  async #createSnapshotPage(ids: number[], offset: number, limit: number) {
    const snapshot = this.#snapshots.create(ids)
    return this.#snapshotPage(snapshot.id, offset, limit)
  }

  async #snapshotPage(snapshotId: string, offset: number, limit: number) {
    const page = this.#snapshots.page(snapshotId, offset, limit)
    const items = await this.#requireClient().getWorkItems(page.items)
    const result = { snapshotId, expiresAt: page.expiresAt, workItems: items.map(compact), pageInfo: { offset, limit, total: page.total, nextOffset: page.nextOffset } }
    return successResult(`${items.length} work item(s) retornado(s).`, result)
  }
}
