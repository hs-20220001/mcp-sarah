import { z } from 'zod/v4'
import type { KanboardConfig } from '../../core/config.js'
import { AppError } from '../../core/errors.js'
import type { HttpClient } from '../../core/http.js'

// Os drivers de banco do Kanboard podem serializar inteiros e flags como texto.
const id = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).pipe(z.int().positive())
const active = z.union([z.boolean(), z.literal([0, 1, '0', '1'])]).transform(v => v === true || v === 1 || v === '1')
const timestamp = z.union([z.number(), z.string()]).nullish().transform(value => {
  const ms = Number(value) * 1000
  return ms > 0 && Number.isFinite(new Date(ms).getTime()) ? new Date(ms).toISOString() : null
})
const project = z.object({ id, name: z.string(), is_active: active })
const task = z.object({ id, title: z.string(), project_id: id, column_id: id, is_active: active })
const taskDetail = task.extend({ description: z.string().nullish(), date_modification: timestamp, date_moved: timestamp, date_completed: timestamp })
const comment = z.object({ id, task_id: id, comment: z.string(), date_creation: timestamp, date_modification: timestamp })
const envelope = z.object({ jsonrpc: z.literal('2.0'), id: z.number(), result: z.unknown(), error: z.unknown().optional() })
type RpcMethod = 'getVersion' | 'getAllProjects' | 'getMyProjects' | 'getAllTasks' | 'getTask' | 'getAllComments' | 'getColumns' | 'getMe' | 'updateTask' | 'createComment'

export class KanboardClient {
  #nextId = 1

  constructor(private readonly config: KanboardConfig, private readonly http: HttpClient) {}

  get apiUrl() { return this.config.apiUrl }

  get personal() {
    const login = this.config.username.trim()
    return !!login && login === this.config.username && login.toLowerCase() !== 'jsonrpc' && !login.includes(':')
  }

  #requirePersonal() {
    if (!this.personal) throw new AppError('POLICY_DENIED', 'A chave de aplicação do Kanboard é somente leitura. Use um token pessoal com o login do titular.')
  }

  async #rpc<T>(method: RpcMethod, schema: z.ZodType<T>, params?: Record<string, number | string>): Promise<T> {
    const write = method === 'updateTask' || method === 'createComment'
    if (write) this.#requirePersonal()
    const requestId = this.#nextId++
    const credentials = Buffer.from(`${this.config.username}:${this.config.apiKey}`).toString('base64')
    const response = await this.http.request<unknown>(this.config.apiUrl, {
      method: 'POST', redirect: 'error',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }),
    }, write)
    const rpc = envelope.safeParse(response)
    if (!rpc.success || rpc.data.id !== requestId) throw new AppError('UPSTREAM_UNAVAILABLE', 'Resposta JSON-RPC inválida do Kanboard.')
    if (rpc.data.error !== undefined) throw new AppError('UPSTREAM_UNAVAILABLE', 'O Kanboard recusou a operação JSON-RPC.')
    const result = schema.safeParse(rpc.data.result)
    if (!result.success) throw new AppError('UPSTREAM_UNAVAILABLE', 'Resultado inesperado da operação no Kanboard.')
    return result.data
  }

  async probe(): Promise<void> {
    await this.#rpc('getVersion', z.string().min(1))
  }

  async listProjects() {
    const projects = await this.#rpc(this.personal ? 'getMyProjects' : 'getAllProjects', z.array(project))
    return projects.map(p => ({ id: p.id, name: p.name, active: p.is_active,
      url: new URL(`./?controller=BoardViewController&action=show&project_id=${p.id}`, this.config.apiUrl).href }))
  }

  #summarizeTask(t: z.output<typeof task>) {
    return { id: t.id, title: t.title, projectId: t.project_id, columnId: t.column_id, active: t.is_active,
      url: new URL(`./?controller=TaskViewController&action=show&task_id=${t.id}`, this.config.apiUrl).href }
  }

  async listTasks(projectId: number, status: 'open' | 'closed') {
    const tasks = await this.#rpc('getAllTasks', z.array(task), { project_id: projectId, status_id: status === 'open' ? 1 : 0 })
    return tasks.map(t => this.#summarizeTask(t))
  }

  async getTask(taskId: number) {
    const t = await this.#rpc('getTask', taskDetail.nullable(), { task_id: taskId })
    if (t === null) throw new AppError('NOT_FOUND', 'Tarefa não encontrada no Kanboard.')
    if (t.id !== taskId) throw new AppError('UPSTREAM_UNAVAILABLE', 'O Kanboard retornou outra tarefa.')
    return { ...this.#summarizeTask(t), description: t.description ?? null, changedDate: t.date_modification, movedDate: t.date_moved, closedDate: t.date_completed }
  }

  async listColumns(projectId: number) {
    return this.#rpc('getColumns', z.array(z.object({ id, title: z.string() })), { project_id: projectId })
  }

  async listComments(taskId: number) {
    const rows = await this.#rpc('getAllComments', z.array(comment), { task_id: taskId })
    return rows.filter(c => c.task_id === taskId).map(c => ({ id: c.id, text: c.comment, createdDate: c.date_creation, changedDate: c.date_modification }))
      .sort((a, b) => b.id - a.id)
  }

  async personalIdentity() {
    this.#requirePersonal()
    const actor = await this.#rpc('getMe', z.object({ id, username: z.string().min(1), name: z.string().nullish() }))
    if (actor.username !== this.config.username) throw new AppError('POLICY_DENIED', 'O login autenticado no Kanboard não corresponde ao login pessoal configurado.')
    return { id: actor.id, username: actor.username, name: actor.name || null }
  }

  async appendComment(taskId: number, actorId: number, content: string) {
    return this.#rpc('createComment', id, { task_id: taskId, user_id: actorId, content })
  }

  async editTask(taskId: number, field: 'title' | 'description', value: string) {
    await this.#rpc('updateTask', z.literal(true), { id: taskId, [field]: value })
  }
}