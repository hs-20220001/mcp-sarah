import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from '../src/server.js'

const logger = { info: vi.fn(), error: vi.fn() }
const feature = { id: 100, rev: 2, fields: { 'System.WorkItemType': 'Feature', 'System.Title': '[AIH] Integração' }, relations: [] }
const bug = {
  id: 46770, rev: 3,
  fields: {
    'System.WorkItemType': 'Bug', 'System.Title': '[AIH] Corrigir envio dos dias de UTI',
    'System.AssignedTo': { displayName: 'Pessoa', uniqueName: 'pessoa@exemplo.org' },
    'System.AreaPath': 'Sarah\\AIH', 'System.IterationPath': 'Sarah\\2026.20',
    'Microsoft.VSTS.Common.Activity': 'Requirements',
    'Sarah.Tamanho': '2 - Médio', 'Sarah.Complexidade': '1 - Baixa', 'Sarah.Incerteza': '1 - Baixa',
    'Microsoft.VSTS.Scheduling.Effort': 3,
  },
  relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://tfs.example/workItems/100' }],
}
function response(body: unknown): Response { return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }) }
function requestUrl(input: RequestInfo | URL): string { return input instanceof Request ? input.url : input instanceof URL ? input.href : input }
type Diff = Array<{ field: string; before?: unknown; after?: unknown }>
type Plan = { operationId: string; confirmationToken: string; diff: Diff }

async function session(requireConfirmation = true) {
  const server = await createServer({
    config: {
      requestTimeoutMs: 1_000, confirmationTtlMs: 60_000, requireConfirmation, configurationIssues: {},
      tfs: { organizationUrl: 'https://tfs.example', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: resolve('config/tfs-sarah.yaml') },
    }, logger,
  })
  const client = new Client({ name: 'bug-tests', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return { client, close: async () => { await client.close(); await server.close() } }
}

describe('Bugs pelo MCP (fetch simulado)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([true, false])('publica descoberta, proposta e aprovação com confirmação literal=%s', async requireConfirmation => {
    const { client, close } = await session(requireConfirmation)
    try {
      const tools = (await client.listTools()).tools
      const create = tools.find(tool => tool.name === 'tfs_prepare_create_work_item')?.description ?? ''
      const update = tools.find(tool => tool.name === 'tfs_prepare_update_work_item')?.description ?? ''
      for (const name of ['tfs_prepare_create_work_item', 'tfs_prepare_update_work_item']) {
        const tool = tools.find(tool => tool.name === name)
        const fields = (tool?.inputSchema as { properties?: { fields?: { properties?: Record<string, { description?: string }> } } }).properties?.fields?.properties
        for (const guidance of [tool?.description, fields?.description?.description, fields?.acceptanceCriteria?.description]) {
          expect(guidance).toContain('envie HTML simples real, não Markdown')
          expect(guidance).toContain('<ul><li>')
          expect(guidance).toContain('<ol><li>')
          expect(guidance).toContain('não template obrigatório')
          expect(guidance).toContain('não reformate campos não solicitados')
        }
      }
      for (const text of [create, update]) {
        expect(text).toContain('[TRIAGEM INT. E CIR.]')
        expect(text).toContain('tfs_search_work_items')
        expect(text).toContain('tfs_list_classifications')
        expect(text).toContain('PBI e Bug são irmãos')
        expect(text).toContain('areaPath e iterationPath reais')
        expect(text).toContain('Confirma esta proposta ou deseja alterar algum valor?')
        expect(text).toContain('mesmo com MCP_REQUIRE_CONFIRMATION=false')
        expect(text).toContain('Testes - <título reduzido do Bug>')
        expect(text).toContain('não duplicar')
      }
      expect(create).toContain('Development por padrão')
      expect(create).toContain('2/1: 3,8,8')
      expect(create).toContain('proponha quatro Tasks') // PBI remains unchanged.
      expect(update).toContain('altere somente os campos solicitados/aprovados')
      expect(update).toContain('sem migração silenciosa')
      expect(client.getInstructions()).toContain('aprovação explícita do usuário')
      if (!requireConfirmation) {
        expect(client.getInstructions()).toContain('Exceção de orientação')
        expect(tools.find(tool => tool.name === 'operations_apply')?.description).toContain('aprovação conversacional')
      }
    } finally { await close() }
  })

  it('inclui Activity padrão, matriz Effort e relação Feature no diff e POST do Bug', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => Promise.resolve(response(init?.method === 'POST' ? bug : feature)))
    vi.stubGlobal('fetch', fetchMock)
    const { client, close } = await session()
    try {
      const result = await client.callTool({ name: 'tfs_prepare_create_work_item', arguments: {
        type: 'Bug', title: '[AIH] Corrigir envio dos dias de UTI',
        fields: { parentId: 100, areaPath: 'Sarah\\AIH', iterationPath: 'Sarah\\2026.20', description: '<p>Dias de UTI incompletos.</p>', customFields: { size: 2, complexity: 1, uncertainty: 1 } },
      } })
      expect(result.isError).not.toBe(true)
      const plan = result.structuredContent as Plan
      expect(plan.diff.find(entry => entry.field === 'customFields')?.after).toEqual({ activity: 'Development', size: 2, complexity: 1, uncertainty: 1, effort: 3 })
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
      const applied = await client.callTool({ name: 'operations_apply', arguments: { operationId: plan.operationId, confirmationToken: plan.confirmationToken, confirmation: 'CONFIRMO' } })
      expect(applied.isError).not.toBe(true)
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
      const patch = JSON.parse(post?.[1]?.body as string) as Array<{ path: string; value: unknown }>
      expect(patch).toEqual(expect.arrayContaining([
        { op: 'add', path: '/fields/Microsoft.VSTS.Common.Activity', value: 'Development' },
        { op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.Effort', value: 3 },
        { op: 'add', path: '/fields/Microsoft.VSTS.TCM.ReproSteps', value: '<p>Dias de UTI incompletos.</p>' },
      ]))
      expect(patch.find(entry => entry.path === '/relations/-')?.value).toMatchObject({ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://tfs.example/Sarah/_apis/wit/workItems/100' })
    } finally { await close() }
  })

  it.each(['create', 'update'])('preserva HTML de parágrafos e listas no diff e JSON Patch (%s)', async action => {
    const description = '<p><strong>Contexto:</strong> Falha relatada pela equipe de AIH.</p><p><strong>Comportamento observado:</strong></p><ul><li>Dias de UTI incompletos.</li><li>Modalidade Hospital Dia não identificada.</li></ul><p><strong>Comportamento esperado:</strong></p><ul><li>Enviar todos os dias de UTI.</li><li>Identificar a modalidade Hospital Dia.</li></ul><p>Preservar texto literal: A &amp; B, valor &lt; 3.</p>'
    const acceptanceCriteria = '<ol><li>A integração envia os dias de UTI completos.</li><li>A AIH identifica a modalidade Hospital Dia.</li></ol>'
    const rawBug = { ...bug, fields: { ...bug.fields, 'Microsoft.VSTS.TCM.ReproSteps': description, 'Microsoft.VSTS.Common.AcceptanceCriteria': acceptanceCriteria } }
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      if (init?.method === 'POST' || init?.method === 'PATCH') return Promise.resolve(response(rawBug))
      return Promise.resolve(response(requestUrl(input).includes('/workitems/100?') ? feature : rawBug))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { client, close } = await session()
    try {
      const fields = { description, acceptanceCriteria }
      const prepared = await client.callTool(action === 'create'
        ? { name: 'tfs_prepare_create_work_item', arguments: { type: 'Bug', title: '[AIH] Corrigir integração', fields: { ...fields, parentId: 100, areaPath: 'Sarah\\AIH', iterationPath: 'Sarah\\2026.20' } } }
        : { name: 'tfs_prepare_update_work_item', arguments: { id: 46770, fields } })
      expect(prepared.isError).not.toBe(true)
      const plan = prepared.structuredContent as Plan
      expect(plan.diff.find(entry => entry.field === 'description')?.after).toBe(description)
      expect(plan.diff.find(entry => entry.field === 'acceptanceCriteria')?.after).toBe(acceptanceCriteria)
      if (action === 'update') expect(plan.diff).toHaveLength(2)
      const applied = await client.callTool({ name: 'operations_apply', arguments: { operationId: plan.operationId, confirmationToken: plan.confirmationToken, confirmation: 'CONFIRMO' } })
      expect(applied.isError).not.toBe(true)
      expect(applied.structuredContent).toMatchObject({ result: { workItem: { description, acceptanceCriteria } } })
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === (action === 'create' ? 'POST' : 'PATCH'))
      const patch = JSON.parse(call?.[1]?.body as string) as Array<{ path: string; value: unknown }>
      expect(patch).toEqual(expect.arrayContaining([
        { op: 'add', path: '/fields/Microsoft.VSTS.TCM.ReproSteps', value: description },
        { op: 'add', path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria', value: acceptanceCriteria },
      ]))
      if (action === 'update') expect(patch).toHaveLength(3) // Revision test plus only the requested fields.
    } finally { await close() }
  })

  it('encontra prefixo existente, classificações e ancestralidade usando ferramentas de leitura', async () => {
    const existing = { ...bug, fields: { ...bug.fields, 'System.Title': '[TRIAGEM INT. E CIR.] Corrigir fluxo de internação' } }
    const parent = { ...feature, relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://tfs.example/workItems/50' }] }
    const epic = { id: 50, rev: 1, fields: { 'System.WorkItemType': 'Epic', 'System.Title': 'Internação e cirurgia' } }
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      const url = requestUrl(input)
      if (url.includes('/wiql?')) {
        const query = (JSON.parse(init?.body as string) as { query: string }).query
        return Promise.resolve(response({ workItems: [{ id: query.includes("'Feature'") ? 100 : 46770 }] }))
      }
      if (url.includes('workitems?ids=100')) return Promise.resolve(response({ value: [parent] }))
      if (url.includes('workitems?ids=46770')) return Promise.resolve(response({ value: [existing] }))
      if (url.includes('/workitems/100?')) return Promise.resolve(response(parent))
      if (url.includes('/workitems/50?')) return Promise.resolve(response(epic))
      if (url.includes('/classificationnodes/areas?')) return Promise.resolve(response({ name: 'Sarah', children: [{ name: 'Triagem', path: '\\Sarah\\Area\\Triagem' }] }))
      if (url.includes('/classificationnodes/iterations?')) return Promise.resolve(response({ name: 'Sarah', children: [{ name: '2026.20', path: '\\Sarah\\Iteration\\2026.20' }] }))
      throw new Error(`Requisição inesperada: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const { client, close } = await session()
    try {
      const titles = await client.callTool({ name: 'tfs_search_work_items', arguments: { text: 'TRIAGEM', types: ['Bug', 'Product Backlog Item'] } })
      expect(titles.structuredContent).toMatchObject({ workItems: [{ title: '[TRIAGEM INT. E CIR.] Corrigir fluxo de internação' }] })
      const candidates = await client.callTool({ name: 'tfs_search_work_items', arguments: { text: 'Internação', types: ['Feature'] } })
      expect(candidates.structuredContent).toMatchObject({ workItems: [{ id: 100, type: 'Feature', parentId: 50 }] })
      const detail = await client.callTool({ name: 'tfs_get_work_item', arguments: { id: 100 } })
      expect(detail.structuredContent).toMatchObject({ workItem: { id: 100, parentId: 50 } })
      const ancestor = await client.callTool({ name: 'tfs_get_work_item', arguments: { id: 50 } })
      expect(ancestor.structuredContent).toMatchObject({ workItem: { type: 'Epic' } })
      const areas = await client.callTool({ name: 'tfs_list_classifications', arguments: { kind: 'areas', depth: 6 } })
      const iterations = await client.callTool({ name: 'tfs_list_classifications', arguments: { kind: 'iterations', depth: 6 } })
      expect(areas.structuredContent).toMatchObject({ tree: { children: [{ name: 'Triagem' }] } })
      expect(iterations.structuredContent).toMatchObject({ tree: { children: [{ name: '2026.20' }] } })
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2) // Only WIQL queries, no writes.
      expect(fetchMock.mock.calls.filter(([input]) => requestUrl(input).includes('/classificationnodes/')).every(([input]) => requestUrl(input).includes('$depth=6'))).toBe(true)
    } finally { await close() }
  })

  it('preserva Activity explícita e bloqueia ausência de localização/pai, estimativa incompleta e pai PBI', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(response(feature)))
    vi.stubGlobal('fetch', fetchMock)
    const { client, close } = await session()
    try {
      const fields = { parentId: 100, areaPath: 'Sarah\\AIH', iterationPath: 'Sarah\\2026.20' }
      for (const missing of ['parentId', 'areaPath', 'iterationPath'] as const) {
        const invalid = await client.callTool({ name: 'tfs_prepare_create_work_item', arguments: { type: 'Bug', title: '[AIH] Correção', fields: { ...fields, [missing]: null } } })
        expect(invalid.structuredContent).toMatchObject({ error: { code: 'POLICY_DENIED' } })
      }
      const incomplete = await client.callTool({ name: 'tfs_prepare_create_work_item', arguments: { type: 'Bug', title: '[AIH] Correção', fields: { ...fields, customFields: { size: 2 } } } })
      expect(incomplete.structuredContent).toMatchObject({ error: { code: 'POLICY_DENIED' } })
      expect(fetchMock).not.toHaveBeenCalled()
      const explicit = await client.callTool({ name: 'tfs_prepare_create_work_item', arguments: { type: 'Bug', title: '[AIH] Correção', fields: { ...fields, customFields: { activity: 'Requirements' } } } })
      expect(explicit.isError).not.toBe(true)
      expect((explicit.structuredContent as Plan).diff.find(entry => entry.field === 'customFields')?.after).toEqual({ activity: 'Requirements' })
      fetchMock.mockResolvedValue(response({ ...feature, fields: { 'System.WorkItemType': 'Product Backlog Item' } }))
      const wrongParent = await client.callTool({ name: 'tfs_prepare_create_work_item', arguments: { type: 'Bug', title: '[AIH] Correção', fields } })
      expect(wrongParent.structuredContent).toMatchObject({ error: { code: 'POLICY_DENIED' } })
    } finally { await close() }
  })

  it('edita apenas os campos aprovados, recalcula Effort parcial e preserva pai legado em edição não relacionada', async () => {
    const legacyBug = { ...bug, relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://tfs.example/workItems/200' }] }
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(response(legacyBug)))
    vi.stubGlobal('fetch', fetchMock)
    const { client, close } = await session()
    try {
      const titleOnly = await client.callTool({ name: 'tfs_prepare_update_work_item', arguments: { id: 46770, fields: { title: '[AIH] Corrigir envio dos dias de UTI e identificação de hospital dia' } } })
      expect(titleOnly.isError).not.toBe(true)
      expect((titleOnly.structuredContent as Plan).diff).toHaveLength(1)
      const unlink = await client.callTool({ name: 'tfs_prepare_update_work_item', arguments: { id: 46770, fields: { parentId: null } } })
      expect(unlink.structuredContent).toMatchObject({ error: { code: 'POLICY_DENIED' } })
      const result = await client.callTool({ name: 'tfs_prepare_update_work_item', arguments: { id: 46770, fields: { customFields: { complexity: 2 } } } })
      expect(result.isError).not.toBe(true)
      const plan = result.structuredContent as Plan
      expect(plan.diff).toHaveLength(1)
      expect(plan.diff[0]?.after).toEqual({ complexity: 2, effort: 8 })
      const applied = await client.callTool({ name: 'operations_apply', arguments: { operationId: plan.operationId, confirmationToken: plan.confirmationToken, confirmation: 'CONFIRMO' } })
      expect(applied.isError).not.toBe(true)
      const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
      expect(JSON.parse(patchCall?.[1]?.body as string)).toEqual([
        { op: 'test', path: '/rev', value: 3 },
        { op: 'add', path: '/fields/Sarah.Complexidade', value: '2 - Moderada' },
        { op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.Effort', value: 8 },
      ])
    } finally { await close() }
  })

  it('Task Testing herda campos do Bug, preserva overrides e bloqueia revisão alterada', async () => {
    let parent = bug
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      if (init?.method === 'POST') return Promise.resolve(response({ id: 46771, rev: 1, fields: { 'System.WorkItemType': 'Task' } }))
      return Promise.resolve(response(parent))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { client, close } = await session()
    try {
      const args = { type: 'Task', title: 'Testes - [AIH] Corrigir envio dos dias de UTI', fields: { parentId: 46770, customFields: { activity: 'Testing' } } }
      const prepared = await client.callTool({ name: 'tfs_prepare_create_work_item', arguments: args })
      expect(prepared.isError).not.toBe(true)
      const plan = prepared.structuredContent as Plan
      expect(plan.diff).toEqual(expect.arrayContaining([
        { field: 'assignedTo', after: 'pessoa@exemplo.org' },
        { field: 'areaPath', after: 'Sarah\\AIH' },
        { field: 'iterationPath', after: 'Sarah\\2026.20' },
      ]))
      const applied = await client.callTool({ name: 'operations_apply', arguments: { operationId: plan.operationId, confirmationToken: plan.confirmationToken, confirmation: 'CONFIRMO' } })
      expect(applied.isError).not.toBe(true)
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
      expect(JSON.parse(post?.[1]?.body as string)).toEqual(expect.arrayContaining([
        { op: 'add', path: '/fields/System.AssignedTo', value: 'pessoa@exemplo.org' },
        { op: 'add', path: '/fields/System.AreaPath', value: 'Sarah\\AIH' },
        { op: 'add', path: '/fields/System.IterationPath', value: 'Sarah\\2026.20' },
        { op: 'add', path: '/fields/Microsoft.VSTS.Common.Activity', value: 'Testing' },
      ]))
      const override = await client.callTool({ name: 'tfs_prepare_create_work_item', arguments: { ...args, fields: { ...args.fields, assignedTo: null, areaPath: 'Sarah\\Outra', iterationPath: null } } })
      expect((override.structuredContent as Plan).diff).toEqual(expect.arrayContaining([
        { field: 'assignedTo', after: null }, { field: 'areaPath', after: 'Sarah\\Outra' }, { field: 'iterationPath', after: null },
      ]))
      const conflicted = await client.callTool({ name: 'tfs_prepare_create_work_item', arguments: args })
      parent = { ...bug, rev: 4 }
      const conflictPlan = conflicted.structuredContent as Plan
      const conflict = await client.callTool({ name: 'operations_apply', arguments: { operationId: conflictPlan.operationId, confirmationToken: conflictPlan.confirmationToken, confirmation: 'CONFIRMO' } })
      expect(conflict.structuredContent).toMatchObject({ error: { code: 'CONFLICT' } })
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    } finally { await close() }
  })
})