import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/core/config.js'
import { HttpClient } from '../src/core/http.js'
import { KanboardClient } from '../src/modules/kanboard/client.js'
import { createServer } from '../src/server.js'

const endpoint = 'https://kb.example/board/jsonrpc.php'
const projectUrl = 'https://tfs.example/collection/Sarah'
const card = { id: '4', project_id: 2, column_id: '9', title: 'Teste', description: 'Texto anterior', is_active: 1, date_modification: '1790000000' }
const actor = { id: '12', username: 'teste', name: 'Conta de Teste', token: 'privado-nao-retornar', email: 'nao-retornar@example.org' }
type Rpc = { method: string; id: number; params?: Record<string, string | number> }
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); vi.unstubAllGlobals() })

async function session(rpc: (r: Rpc) => unknown, options: { username?: string; literal?: boolean; tfs?: (url: URL, init?: RequestInit) => Response } = {}) {
  const calls: Rpc[] = []
  const network = vi.fn<typeof fetch>((input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.href === endpoint) {
      expect(init?.redirect).toBe('error')
      if (typeof init?.body !== 'string') throw new Error('Corpo JSON esperado')
      const req = JSON.parse(init.body) as Rpc
      calls.push(req)
      const result = rpc(req)
      return Promise.resolve(result instanceof Response ? result : Response.json({ jsonrpc: '2.0', id: req.id, result }))
    }
    if (url.origin === 'https://tfs.example' && options.tfs) return Promise.resolve(options.tfs(url, init))
    throw new Error('Destino inesperado')
  })
  vi.stubGlobal('fetch', network)
  const config = loadConfig({ KANBOARD_API_URL: endpoint, KANBOARD_API_KEY: 'test-only', KANBOARD_USERNAME: options.username ?? 'jsonrpc',
    MCP_REQUIRE_CONFIRMATION: String(options.literal ?? false), ...(options.tfs ? { AZURE_DEVOPS_ORG_URL: 'https://tfs.example/collection', AZURE_DEVOPS_PROJECT: 'Sarah', AZURE_DEVOPS_PAT: 'test-only' } : {}) })
  const server = await createServer({ config, logger: { info: vi.fn(), error: vi.fn() } })
  const client = new Client({ name: 'teste', version: '1' })
  const [c, s] = InMemoryTransport.createLinkedPair(); await server.connect(s); await client.connect(c)
  cleanups.push(async () => { await client.close(); await server.close() })
  return { calls, client, network, call: (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }) }
}

describe('relatório Kanboard/TFS', () => {
  it('cruza tags, URLs nos dois sentidos e estados diferentes, sem atribuir desfechos de outro chamado', async () => {
    const rows = [
      [11, 'Bug', 'Done', 'Kanboard; kid:4', 'Microsoft.VSTS.TCM.ReproSteps', 'https://kb.example/board/?action=show&amp;task_id=4'],
      [12, 'Product Backlog Item', 'Committed', '', 'System.Description', 'https://kb.example/board/task/4'],
      [13, 'Bug', 'New', 'kid:40', 'Microsoft.VSTS.TCM.ReproSteps', 'https://kb.example/board/?task_id=40'],
      [14, 'Bug', 'Done', 'kid:88', 'System.Title', 'Referenciado'],
      [15, 'Bug', 'Approved', '', 'Microsoft.VSTS.Common.AcceptanceCriteria', 'https://kb.example/board/?task_id=5'],
      [16, 'Task', 'Done', '', 'System.Description', 'Nº 4: https://outro.example/board/?task_id=4 https://kb.example/outro/task/4'],
    ] as const
    const queries: string[] = []
    const { call, calls, network, client } = await session(r => {
      if (r.method === 'getTask') return { ...card, id: r.params?.task_id, is_active: r.params?.task_id === 4, description: `sigiloso ${projectUrl}/_workitems/edit/11 https://outro.example/_workitems/edit/99` }
      if (r.method === 'getColumns') return [{ id: 9, title: 'Análise' }]
      if (r.method === 'getAllComments') return r.params?.task_id === 4 ? [{ id: '7', task_id: 4, date_creation: 1790000001, comment: `sigiloso: referência ${projectUrl}/_workitems/edit/14 https://tfs.example/collection/Outro/_workitems/edit/98` }] : []
      throw Error('RPC inesperada')
    }, { tfs: (url, init) => {
      if (url.pathname.endsWith('/wiql') && typeof init?.body === 'string') { queries.push(init.body); return Response.json({ workItems: rows.map(([id]) => ({ id })) }) }
      return Response.json({ value: rows.map(([id, type, state, tags, field, text]) => ({ id, rev: 1, fields: {
        'System.WorkItemType': type, 'System.State': state, 'System.Tags': tags, 'System.ChangedDate': id === 12 ? '2026-01-10' : '2026-10-10', 'Microsoft.VSTS.Common.StateChangeDate': '2026-09-09', [field]: text,
      } })) })
    } })
    const { structuredContent: content } = await call('kanboard_report_tasks', { taskIds: [4, 5, 4] })
    expect(content).toMatchObject({ tfsError: null, limited: false, tasks: [
      { id: 4, active: true, columnName: 'Análise', commentCount: 1, latestCommentDate: new Date(1790000001000).toISOString(), coverage: 'found', workItems: [
        { id: 11, state: 'Done', evidence: ['tfs.tag', 'tfs.reproUrl', 'kanboard.descriptionUrl'], stateChangedDate: '2026-09-09', linkKind: 'integration_tag', latestActivitySide: 'tfs' },
        { id: 12, state: 'Committed', evidence: ['tfs.descriptionUrl'], linkKind: 'url_reference', latestActivitySide: 'kanboard' }, { id: 14, taggedTaskIds: [88], evidence: ['kanboard.commentUrl'], linkKind: 'other_task_reference' },
      ] }, { id: 5, active: false, workItems: [{ id: 11, evidence: ['kanboard.descriptionUrl'] }, { id: 15, state: 'Approved', evidence: ['tfs.acceptanceUrl'] }] },
    ] })
    expect(JSON.stringify(content)).not.toContain('sigiloso')
    expect(queries).toHaveLength(1); expect(queries[0]).toContain('[System.Id] IN (11,14)'); expect(queries[0]).not.toContain('[System.State]')
    expect(calls.map(r => r.method)).toEqual(['getTask', 'getAllComments', 'getTask', 'getAllComments', 'getColumns'])
    expect(network).toHaveBeenCalledTimes(7)
    expect(client.getInstructions()).toContain('não provam esquecimento')
    expect((await call('kanboard_list_task_comments', { taskId: 4 })).structuredContent).toMatchObject({ total: 1, items: [{ id: 7 }] })
  })

  it.each(['missing', 'denied', 'empty', 'incomplete', 'limit'] as const)('distingue cobertura %s de ausência de vínculo', async mode => {
    const { call, network } = await session(r => {
      if (r.method === 'getTask') return r.params?.task_id === 4 ? card : null
      if (r.method === 'getAllComments') return mode === 'incomplete' ? false : []
      return []
    }, mode === 'missing' ? {} : { tfs: url => mode === 'denied' ? Response.json({}, { status: 403 }) : url.pathname.endsWith('/wiql')
      ? Response.json({ workItems: mode === 'limit' ? Array.from({ length: 201 }, (_, i) => ({ id: 100 + i })) : [] }) : Response.json({ value: [] }) })
    expect((await call('kanboard_report_tasks', { taskIds: Array(11).fill(4) })).isError).toBe(true)
    expect(network).not.toHaveBeenCalled()
    const content = (await call('kanboard_report_tasks', { taskIds: [4, 5] })).structuredContent
    expect(content).toMatchObject({ tfsError: mode === 'missing' ? 'CONFIG_MISSING' : mode === 'denied' ? 'FORBIDDEN' : null, limited: mode === 'limit',
      unavailableTasks: [{ taskId: 5, code: 'NOT_FOUND' }], tasks: [{ columnName: null, commentsAvailable: mode !== 'incomplete', workItems: [], coverage:
        mode === 'missing' || mode === 'denied' ? 'tfs_unavailable' : mode === 'empty' ? 'not_found' : 'partial' }] })
  })
})

describe('política de escrita Kanboard', () => {
  it.each(['jsonrpc', ' JSONRPC ', 'JsOnRpC', 'jsonrpc:outro'])('não oferece nem executa escrita com %s', async username => {
    const { client, network } = await session(() => null, { username })
    expect((await client.listTools()).tools.some(t => t.name === 'kanboard_prepare_task_write')).toBe(false)
    const kb = new KanboardClient({ apiUrl: endpoint, username, apiKey: 'teste' }, new HttpClient({ timeoutMs: 1000, fetchImpl: network }))
    for (const operation of [kb.personalIdentity(), kb.editTask(4, 'title', 'Novo'), kb.appendComment(4, 12, 'Novo')]) await expect(operation).rejects.toMatchObject({ code: 'POLICY_DENIED' })
    expect(network).not.toHaveBeenCalled()
  })

  it.each([true, false])('exige aprovação específica, com confirmação literal=%s', async literal => {
    const { calls, call, client } = await session(r => r.method === 'getMe' ? actor : r.method === 'getTask' ? card : 75, { literal, username: 'teste' })
    const tool = (await client.listTools()).tools.find(t => t.name === 'kanboard_prepare_task_write')
    expect(tool?.annotations?.readOnlyHint).toBe(false)
    const args = { taskId: 4, field: 'comment', value: 'Acompanhar no TFS.\nSem encerrar.' }
    expect((await call('kanboard_prepare_task_write', { ...args, user_id: 123 })).isError).toBe(true)
    expect(calls).toHaveLength(0)
    const result = await call('kanboard_prepare_task_write', args)
    expect(result.structuredContent).toMatchObject({ state: 'pending', diff: [{ field: 'actor', after: { username: 'teste', name: 'Conta de Teste' } }, { field: 'task', before: { id: 4 } }, { field: 'comment', after: args.value }] })
    expect(JSON.stringify(result)).not.toContain('privado-nao-retornar')
    const { operationId, confirmationToken } = result.structuredContent as { operationId: string; confirmationToken: string }
    const plan = { operationId, confirmationToken, ...(literal ? { confirmation: 'CONFIRMO' } : {}) }
    const approval = { ...args, username: 'teste' }
    for (const bad of [undefined, { ...approval, username: 'outro' }, { ...approval, value: 'Diferente' }, { ...approval, field: 'title' }, { ...approval, taskId: 5 }]) {
      expect((await call('operations_apply', { ...plan, kanboardApproval: bad })).isError).toBe(true)
    }
    expect(calls.map(r => r.method)).toEqual(['getMe', 'getTask'])
    expect((await call('operations_apply', { ...plan, kanboardApproval: approval })).structuredContent).toMatchObject({ state: 'applied', result: { commentId: 75 } })
    expect(calls.at(-1)).toMatchObject({ method: 'createComment', params: { task_id: 4, user_id: 12, content: args.value } })
    expect((await call('operations_apply', { ...plan, kanboardApproval: approval })).isError).toBe(true)
    expect(calls.filter(r => r.method === 'createComment')).toHaveLength(1)
  })

  it.each(['login', 'actor', 'target', 'ambiguous', 'success'] as const)('verifica identidade, versão e envio único: %s', async mode => {
    let changed = false
    const { calls, call } = await session(r => {
      if (r.method === 'getMe') return mode === 'login' ? { ...actor, username: 'outro' } : { ...actor, id: changed && mode === 'actor' ? 30 : actor.id }
      if (r.method === 'getTask') return { ...card, description: changed && mode === 'target' ? 'Concorrente' : card.description }
      return mode === 'ambiguous' ? Response.json({}, { status: 503 }) : true
    }, { username: 'teste' })
    const args = { taskId: 4, field: 'description', value: '' }
    const pre = await call('kanboard_prepare_task_write', args)
    if (mode === 'login') { expect(pre.structuredContent).toMatchObject({ error: { code: 'POLICY_DENIED' } }); return }
    changed = true
    const { operationId, confirmationToken } = pre.structuredContent as { operationId: string; confirmationToken: string }
    const applied = await call('operations_apply', { operationId, confirmationToken, kanboardApproval: { ...args, username: 'teste' } })
    const writes = calls.filter(r => r.method === 'updateTask')
    expect(writes).toHaveLength(mode === 'success' || mode === 'ambiguous' ? 1 : 0)
    if (mode === 'success') {
      expect(writes[0]?.params).toEqual({ id: 4, description: '' }); expect(applied.structuredContent).toMatchObject({ state: 'applied' })
    } else expect(applied.structuredContent).toMatchObject({ error: { code: mode === 'actor' ? 'POLICY_DENIED' : mode === 'target' ? 'CONFLICT' : 'UPSTREAM_UNAVAILABLE' } })
  })
})