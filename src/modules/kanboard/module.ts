import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod/v4'
import { AppError } from '../../core/errors.js'
import { HttpClient } from '../../core/http.js'
import type { IntegrationModule, ModuleContext, ModuleHealth } from '../../core/module.js'
import { safeToolCall, successResult } from '../../core/tool-result.js'
import { KanboardClient } from './client.js'
import { reportGuidance, reportTasks, type FindCandidates } from './report.js'
import { prepareTaskWrite, writeGuidance, writeSchema } from './write.js'

const pagination = { offset: z.int().nonnegative().default(0), limit: z.int().min(1).max(50).default(25) }
const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false }

function page<T>(all: T[], offset: number, limit: number) {
  return { items: all.slice(offset, offset + limit), total: all.length, nextOffset: offset + limit < all.length ? offset + limit : null }
}

export class KanboardModule implements IntegrationModule {
  readonly id = 'kanboard'
  #client?: KanboardClient

  constructor(private readonly context: ModuleContext, private readonly findCandidates: FindCandidates) {}

  initialize(): Promise<void> {
    const { kanboard, requestTimeoutMs } = this.context.config
    if (kanboard) this.#client = new KanboardClient(kanboard, new HttpClient({ timeoutMs: requestTimeoutMs }))
    return Promise.resolve()
  }

  #configurationMessage(): string {
    const issues = this.context.config.configurationIssues.kanboard ?? ['KANBOARD_API_URL', 'KANBOARD_API_KEY']
    return `Verifique a configuração do Kanboard: ${issues.join(', ')}.`
  }

  #requireClient(): KanboardClient {
    if (!this.#client) throw new AppError('CONFIG_MISSING', this.#configurationMessage())
    return this.#client
  }

  async healthCheck(probe: boolean): Promise<ModuleHealth> {
    if (!this.#client) return { id: this.id, configured: false, message: this.#configurationMessage() }
    const mode = this.#client.personal ? ' Conta pessoal; escrita exige confirmação de identidade e conteúdo.' : ' Chave da aplicação: somente leitura.'
    const warning = mode + (this.#client.apiUrl.startsWith('http:') ? ' HTTP sem criptografia: a chave e os dados trafegam em claro.' : '')
    if (!probe) return { id: this.id, configured: true, message: `Configurado; conexão não testada.${warning}` }
    try {
      await this.#client.probe()
      return { id: this.id, configured: true, reachable: true, message: `Conexão Kanboard validada.${warning}` }
    } catch {
      return { id: this.id, configured: true, reachable: false, message: `Falha ao consultar a API Kanboard.${warning}` }
    }
  }

  registerTools(server: McpServer): void {
    server.registerTool('kanboard_list_projects', {
      title: 'Listar projetos do Kanboard', description: 'Lista projetos acessíveis à credencial configurada. Use o nextOffset para continuar.',
      inputSchema: z.object(pagination), annotations,
    }, ({ offset, limit }) => safeToolCall(async () => {
      const result = page(await this.#requireClient().listProjects(), offset, limit)
      return successResult(`${result.items.length} projeto(s) nesta página.`, result)
    }))

    server.registerTool('kanboard_list_tasks', {
      title: 'Listar tarefas do Kanboard', description: `Lista tarefas abertas ou fechadas de um projeto, opcionalmente por coluna. ${reportGuidance}`,
      inputSchema: z.object({ projectId: z.int().positive(), columnId: z.int().positive().optional(), status: z.enum(['open', 'closed']).default('open'), ...pagination }), annotations,
    }, ({ projectId, columnId, status, offset, limit }) => safeToolCall(async () => {
      const tasks = await this.#requireClient().listTasks(projectId, status)
      const result = page(tasks.filter(t => columnId === undefined || t.columnId === columnId), offset, limit)
      return successResult(`${result.items.length} tarefa(s) nesta página do projeto ${projectId}.`, result)
    }))

    server.registerTool('kanboard_get_task', {
      title: 'Consultar tarefa do Kanboard', description: `Obtém uma tarefa por ID, com descrição, datas e link. ${reportGuidance}`,
      inputSchema: z.object({ taskId: z.int().positive() }), annotations,
    }, ({ taskId }) => safeToolCall(async () => successResult(`Tarefa ${taskId} consultada.`, await this.#requireClient().getTask(taskId))))

    server.registerTool('kanboard_list_task_comments', {
      title: 'Ler comentários de uma tarefa', description: 'Lista comentários visíveis, dos IDs mais recentes para os mais antigos. Não reproduza dados pessoais desnecessários no relatório.',
      inputSchema: z.object({ taskId: z.int().positive(), ...pagination }), annotations,
    }, ({ taskId, offset, limit }) => safeToolCall(async () => successResult(`Comentários da tarefa ${taskId}.`, page(await this.#requireClient().listComments(taskId), offset, limit))))

    server.registerTool('kanboard_report_tasks', {
      title: 'Comparar andamento no Kanboard e no TFS', description: reportGuidance,
      inputSchema: z.object({ taskIds: z.array(z.int().positive()).min(1).max(10) }), annotations,
    }, ({ taskIds }) => safeToolCall(async () => {
      const kb = this.#requireClient()
      const result = await reportTasks(kb, kb.apiUrl, this.context.config.tfs, this.findCandidates, taskIds)
      return successResult(`Consulta de ${result.tasks.length} chamado(s); confira cobertura, evidências e indisponibilidades antes de concluir.`, result)
    }))

    if (!this.#client?.personal) return
    server.registerTool('kanboard_prepare_task_write', {
      title: 'Preparar comentário ou edição de tarefa como conta pessoal', description: writeGuidance,
      inputSchema: writeSchema, annotations: { ...annotations, readOnlyHint: false },
    }, args => safeToolCall(async () => {
      const plan = await prepareTaskWrite(this.#requireClient(), this.context.operations, args)
      return successResult(`${plan.summary} ${writeGuidance}`, plan)
    }))
  }
}