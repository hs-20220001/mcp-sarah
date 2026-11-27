import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/core/config.js'
import { HttpClient } from '../src/core/http.js'
import { KanboardClient } from '../src/modules/kanboard/client.js'
import { createServer } from '../src/server.js'

const apiUrl = 'https://kb.example/subdir/jsonrpc.php'
const apiKey = 'test-only'
const project = { id: '2', name: 'Equipe', is_active: '1', token: 'private-project-token' }
const task = { id: 4, project_id: '2', column_id: '3', title: 'Revisar', is_active: true, description: 'Detalhes' }
type Request = { jsonrpc: string; id: number; method: string; params?: Record<string, number> }

function mockRpc(result: (request: Request) => unknown) {
  return vi.fn<typeof fetch>((_url, init) => {
    if (typeof init?.body !== 'string') throw new Error('Corpo JSON esperado')
    const request = JSON.parse(init.body) as Request
    return Promise.resolve(Response.json({ jsonrpc: '2.0', id: request.id, result: result(request) }))
  })
}

function clientWith(fetchImpl: typeof fetch, username = 'jsonrpc') {
  return new KanboardClient({ apiUrl, apiKey, username }, new HttpClient({ timeoutMs: 1_000, fetchImpl }))
}

describe('Kanboard', () => {
  it.each([['jsonrpc', 'getAllProjects'], ['leitor', 'getMyProjects']])('autentica %s e não publica campos privados', async (username, method) => {
    const fetchImpl = mockRpc(() => [project])
    const projects = await clientWith(fetchImpl, username).listProjects()
    expect(projects).toEqual([{ id: 2, name: 'Equipe', active: true, url: 'https://kb.example/subdir/?controller=BoardViewController&action=show&project_id=2' }])
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe(apiUrl)
    expect(init).toMatchObject({
      method: 'POST', redirect: 'error', headers: { Authorization: `Basic ${Buffer.from(`${username}:${apiKey}`).toString('base64')}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }),
    })
  })

  it.each([
    [401, {}, 'AUTH_FAILED'], [403, {}, 'FORBIDDEN'],
    [200, { jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'private-data' } }, 'UPSTREAM_UNAVAILABLE'],
    [200, { jsonrpc: '2.0', id: 999, result: task }, 'UPSTREAM_UNAVAILABLE'],
    [200, { jsonrpc: '2.0', id: 1, result: false }, 'UPSTREAM_UNAVAILABLE'],
    [200, { jsonrpc: '2.0', id: 1, result: null }, 'NOT_FOUND'],
  ] as const)('trata HTTP %s ou envelope %j sem expor o corpo', async (status, body, code) => {
    const promise = clientWith(() => Promise.resolve(Response.json(body, { status }))).getTask(4)
    await expect(promise).rejects.toMatchObject({ code })
    await expect(promise).rejects.not.toThrow('private-data')
  })

  it.each(['https', 'http'])('consulta via MCP com paginação, filtros, detalhe, validação e probe explícito (%s)', async scheme => {
    const requests: Request[] = []
    const fetchImpl = mockRpc(request => {
      requests.push(request)
      switch (request.method) {
        case 'getVersion': return '1.2.54'
        case 'getAllProjects': return [project, { ...project, id: 3 }]
        case 'getAllTasks': return [{ ...task, is_active: request.params?.status_id }]
        case 'getTask': return task
        default: throw new Error('Método inesperado')
      }
    })
    vi.stubGlobal('fetch', fetchImpl)
    const endpoint = apiUrl.replace('https:', `${scheme}:`)
    const server = await createServer({ config: loadConfig({ KANBOARD_API_URL: endpoint, KANBOARD_API_KEY: apiKey, KANBOARD_ALLOWED_HTTP_URL: scheme === 'http' ? endpoint : '' }) })
    const client = new Client({ name: 'teste', version: '1.0' })
    const [c, s] = InMemoryTransport.createLinkedPair()
    try {
      await server.connect(s)
      await client.connect(c)
      const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args })
      const expectStatus = (content: unknown, fields: Record<string, unknown>) => {
        expect(content).toHaveProperty('modules', expect.arrayContaining([expect.objectContaining({ id: 'kanboard', ...fields })]))
      }
      const status = await call('system_get_status')
      expect(JSON.stringify(status)).not.toContain(apiKey)
      expectStatus(status.structuredContent, { configured: true })
      expect(JSON.stringify(status).includes('HTTP sem criptografia')).toBe(scheme === 'http')
      expect((await call('kanboard_get_task', { taskId: -1 })).isError).toBe(true)
      expect((await call('kanboard_list_projects', { limit: 51 })).isError).toBe(true)
      expect(fetchImpl).not.toHaveBeenCalled()
      expectStatus((await call('system_get_status', { probe: true })).structuredContent, { reachable: true })
      expect(requests[0]?.method).toBe('getVersion')
      expect(fetchImpl.mock.calls[0]?.[0]).toBe(endpoint)
      expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe('error')
      const first = await call('kanboard_list_projects', { limit: 1 })
      expect(first.structuredContent).toMatchObject({ total: 2, items: [{ id: 2 }], nextOffset: 1 })
      expect(JSON.stringify(first)).not.toContain(project.token)
      expect((await call('kanboard_list_projects', { offset: 1 })).structuredContent).toMatchObject({ items: [{ id: 3 }], nextOffset: null })
      for (const [args, flag] of [[{}, 1], [{ status: 'closed' }, 0]] as const) {
        const result = await call('kanboard_list_tasks', { projectId: 2, ...args })
        expect(result.structuredContent).toMatchObject({ items: [{ id: 4, active: Boolean(flag) }] })
        expect(JSON.stringify(result)).not.toContain(task.description)
        expect(requests.at(-1)).toMatchObject({ method: 'getAllTasks', params: { project_id: 2, status_id: flag } })
      }
      expect((await call('kanboard_get_task', { taskId: 4 })).structuredContent).toMatchObject({ id: 4, projectId: 2, columnId: 3, description: 'Detalhes' })
      expect(requests.at(-1)).toMatchObject({ method: 'getTask', params: { task_id: 4 } })
      fetchImpl.mockResolvedValueOnce(Response.json({}, { status: 401 }))
      expectStatus((await call('system_get_status', { probe: true })).structuredContent, { reachable: false })
    } finally {
      await client.close()
      await server.close()
      vi.unstubAllGlobals()
    }
  })
})