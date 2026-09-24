import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../src/core/config.js'
import type { Logger } from '../src/core/logger.js'
import { createServer } from '../src/server.js'
import { resolve } from 'node:path'

const logger: Logger = { info: vi.fn(), error: vi.fn() }

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input instanceof URL ? input.href : input
}

function workItem(rev = 4): Record<string, unknown> {
  return {
    id: 36657,
    rev,
    url: 'https://tfs.example/workItems/36657',
    fields: { 'System.WorkItemType': 'Product Backlog Item', 'System.Title': 'Permissões', 'System.State': 'To Do' },
    relations: [],
  }
}

describe('MCP server', () => {
  it('publica todas as ferramentas e relata módulos não configurados', async () => {
    const config: AppConfig = {
      requestTimeoutMs: 1_000,
      confirmationTtlMs: 60_000,
      requireConfirmation: true,
      configurationIssues: {
        tfs: ['AZURE_DEVOPS_PAT'],
        wordpress: ['WP_APPLICATION_PASSWORD'],
      },
    }
    const server = await createServer({ config, logger })
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      const tools = await client.listTools()
      expect(tools.tools).toHaveLength(27)
      expect(tools.tools.some(tool => tool.name.startsWith('tfs_'))).toBe(true)
      expect(tools.tools.some(tool => tool.name.startsWith('wordpress_'))).toBe(true)
      expect(tools.tools.some(tool => tool.name === 'tfs_list_work_item_comments')).toBe(true)
      expect(tools.tools.some(tool => tool.name === 'tfs_prepare_create_work_item_comment')).toBe(true)
      expect(tools.tools.some(tool => tool.name === 'tfs_prepare_update_work_item_comment')).toBe(true)
      expect(tools.tools.some(tool => tool.name === 'tfs_prepare_delete_work_item_comment')).toBe(true)

      const result = await client.callTool({ name: 'system_get_status', arguments: { probe: false } })
      expect(result.isError).not.toBe(true)
      expect(result.structuredContent).toMatchObject({
        server: { name: 'mcp-sarah' },
        modules: [
          { id: 'tfs', configured: false },
          { id: 'wordpress', configured: false },
        ],
      })

      const missingConfirmation = await client.callTool({
        name: 'operations_apply',
        arguments: { operationId: '00000000-0000-0000-0000-000000000001', confirmationToken: 'x'.repeat(43) },
      })
      expect(missingConfirmation.isError).toBe(true)

      const unavailable = await client.callTool({ name: 'tfs_get_work_item', arguments: { id: 1 } })
      expect(unavailable.isError).toBe(true)
      expect(unavailable.structuredContent).toMatchObject({ error: { code: 'CONFIG_MISSING' } })
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('publica o catálogo completo com annotations coerentes', async () => {
    const config: AppConfig = {
      requestTimeoutMs: 1_000,
      confirmationTtlMs: 60_000,
      requireConfirmation: true,
      configurationIssues: {},
      tfs: { organizationUrl: 'https://tfs.example', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: resolve('config/tfs-sarah.yaml') },
      wordpress: { username: 'user', applicationPassword: 'secret', allowedMediaRoots: [], wikis: { user: { baseUrl: 'https://wp.example', policyPath: resolve('config/wordpress.yaml') } } },
    }
    const server = await createServer({ config, logger })
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      const tools = (await client.listTools()).tools
      expect(tools).toHaveLength(27)
      expect(tools.find(tool => tool.name === 'tfs_get_work_item')?.annotations?.readOnlyHint).toBe(true)
      expect(tools.find(tool => tool.name === 'tfs_prepare_update_work_item')?.annotations?.destructiveHint).toBe(false)
      expect(tools.find(tool => tool.name === 'tfs_list_work_item_comments')?.annotations?.readOnlyHint).toBe(true)
      expect(tools.find(tool => tool.name === 'tfs_prepare_create_work_item_comment')?.annotations?.destructiveHint).toBe(false)
      expect(tools.find(tool => tool.name === 'tfs_prepare_update_work_item_comment')?.annotations?.destructiveHint).toBe(false)
      expect(tools.find(tool => tool.name === 'tfs_prepare_delete_work_item_comment')?.annotations?.destructiveHint).toBe(true)
      expect(tools.find(tool => tool.name === 'operations_apply')?.annotations?.readOnlyHint).toBe(false)
      expect(tools.find(tool => tool.name === 'wordpress_prepare_trash_media')?.annotations?.destructiveHint).toBe(true)
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('exige a wiki quando duas origens WordPress estão configuradas', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(response([{ id: 7, modified_gmt: '2026-01-01', slug: 'pagina', status: 'publish', link: 'https://developers.example/pagina', title: { raw: 'Página' }, content: { raw: '<p>Conteúdo</p>' }, excerpt: { raw: '' }, parent: 0, menu_order: 0 }]))
    vi.stubGlobal('fetch', fetchMock)
    const server = await createServer({
      config: {
        requestTimeoutMs: 1_000,
        confirmationTtlMs: 60_000,
        requireConfirmation: true,
        configurationIssues: {},
        wordpress: {
          username: 'user',
          applicationPassword: 'secret',
          allowedMediaRoots: [],
          wikis: {
            user: { baseUrl: 'https://users.example', policyPath: resolve('config/wordpress.yaml') },
            developer: { baseUrl: 'https://developers.example', policyPath: resolve('config/wordpress.yaml') },
          },
        },
      },
      logger,
    })
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      const ambiguous = await client.callTool({ name: 'wordpress_search_content', arguments: { kind: 'page' } })
      expect(ambiguous.isError).toBe(true)
      expect(ambiguous.structuredContent).toMatchObject({ error: { code: 'AMBIGUOUS_REQUEST' } })
      expect(fetchMock).not.toHaveBeenCalled()

      const status = await client.callTool({ name: 'system_get_status', arguments: { probe: false } })
      const modules = (status.structuredContent as { modules?: Array<{ id: string; details?: Record<string, unknown> }> }).modules ?? []
      expect(modules.find(module => module.id === 'wordpress')).toMatchObject({
        details: { wikiCount: 2, wikis: [{ wiki: 'user' }, { wiki: 'developer' }] },
      })

      const selected = await client.callTool({ name: 'wordpress_search_content', arguments: { wiki: 'developer', kind: 'page' } })
      expect(selected.isError).not.toBe(true)
      expect(selected.structuredContent).toMatchObject({ wiki: 'developer', items: [{ wiki: 'developer', id: 7 }] })
      expect(fetchMock.mock.calls[0]?.[0]).toContain('https://developers.example/wp-json/wp/v2/pages')
    } finally {
      await client.close()
      await server.close()
      vi.unstubAllGlobals()
    }
  })

  it('aplica sem CONFIRMO quando o modo opt-in está desativado', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockImplementation((input, init) => {
      const url = requestUrl(input)
      const method = init?.method ?? 'GET'
      if (method === 'GET') return Promise.resolve(response(workItem()))
      if (method === 'POST') return Promise.resolve(response({ workItemId: 36657, commentId: 50, version: 1, text: 'Automático', isDeleted: false }))
      throw new Error(`Método inesperado: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const server = await createServer({
      config: {
        requestTimeoutMs: 1_000,
        confirmationTtlMs: 60_000,
        requireConfirmation: false,
        configurationIssues: {},
        tfs: { organizationUrl: 'https://tfs.example', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: resolve('config/tfs-sarah.yaml') },
      },
      logger,
    })
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      const prepared = await client.callTool({ name: 'tfs_prepare_create_work_item_comment', arguments: { id: 36657, text: 'Automático' } })
      const plan = prepared.structuredContent as { operationId: string; confirmationToken: string }
      const applied = await client.callTool({ name: 'operations_apply', arguments: { operationId: plan.operationId, confirmationToken: plan.confirmationToken } })

      expect(applied.isError).not.toBe(true)
      expect(applied.structuredContent).toMatchObject({ state: 'applied', result: { comment: { commentId: 50 } } })
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    } finally {
      await client.close()
      await server.close()
      vi.unstubAllGlobals()
    }
  })

  it('prepara e aplica criação, alteração e deleção de comentários', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    let commentVersion = 1
    let commentDeleted = false
    fetchMock.mockImplementation((input, init) => {
      const url = requestUrl(input)
      const method = init?.method ?? 'GET'
      if (method === 'GET' && url.includes('/comments/50')) {
        return Promise.resolve(response({ workItemId: 36657, commentId: 50, version: commentVersion, text: commentVersion === 1 ? 'Novo' : 'Atualizado', isDeleted: commentDeleted }))
      }
      if (method === 'GET') return Promise.resolve(response(workItem()))
      if (method === 'POST') return Promise.resolve(response({ workItemId: 36657, commentId: 50, version: 1, text: 'Novo', isDeleted: false }))
      if (method === 'PATCH') {
        commentVersion = 2
        return Promise.resolve(response({ workItemId: 36657, commentId: 50, version: commentVersion, text: 'Atualizado', isDeleted: false }))
      }
      if (method === 'DELETE') {
        commentDeleted = true
        return Promise.resolve(response({ workItemId: 36657, commentId: 50, version: 3, text: 'Atualizado', isDeleted: true }))
      }
      throw new Error(`Método inesperado: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const server = await createServer({
      config: {
        requestTimeoutMs: 1_000,
        confirmationTtlMs: 60_000,
        requireConfirmation: true,
        configurationIssues: {},
        tfs: { organizationUrl: 'https://tfs.example', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: resolve('config/tfs-sarah.yaml') },
      },
      logger,
    })
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      const createResult = await client.callTool({ name: 'tfs_prepare_create_work_item_comment', arguments: { id: 36657, text: 'Novo' } })
      const createPlan = createResult.structuredContent as { operationId: string; confirmationToken: string }
      expect(createResult.isError).not.toBe(true)
      const created = await client.callTool({ name: 'operations_apply', arguments: { operationId: createPlan.operationId, confirmationToken: createPlan.confirmationToken, confirmation: 'CONFIRMO' } })
      expect(created.isError).not.toBe(true)
      expect(created.structuredContent).toMatchObject({ state: 'applied', result: { comment: { commentId: 50 } } })

      const updateResult = await client.callTool({ name: 'tfs_prepare_update_work_item_comment', arguments: { id: 36657, commentId: 50, text: 'Atualizado' } })
      const updatePlan = updateResult.structuredContent as { operationId: string; confirmationToken: string }
      const updated = await client.callTool({ name: 'operations_apply', arguments: { operationId: updatePlan.operationId, confirmationToken: updatePlan.confirmationToken, confirmation: 'CONFIRMO' } })
      expect(updated.isError).not.toBe(true)
      expect(updated.structuredContent).toMatchObject({ state: 'applied', result: { comment: { version: 2 } } })

      const deleteResult = await client.callTool({ name: 'tfs_prepare_delete_work_item_comment', arguments: { id: 36657, commentId: 50 } })
      const deletePlan = deleteResult.structuredContent as { operationId: string; confirmationToken: string }
      const deleted = await client.callTool({ name: 'operations_apply', arguments: { operationId: deletePlan.operationId, confirmationToken: deletePlan.confirmationToken, confirmation: 'CONFIRMO' } })
      expect(deleted.isError).not.toBe(true)
      expect(deleted.structuredContent).toMatchObject({ state: 'applied', result: { comment: { isDeleted: true } } })
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1)
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1)
    } finally {
      await client.close()
      await server.close()
      vi.unstubAllGlobals()
    }
  })

  it('bloqueia alteração quando a versão do comentário muda antes da aplicação', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    let commentReads = 0
    const patch = vi.fn()
    fetchMock.mockImplementation((input, init) => {
      const url = requestUrl(input)
      const method = init?.method ?? 'GET'
      if (method === 'GET' && url.includes('/comments/50')) {
        commentReads += 1
        return Promise.resolve(response({ workItemId: 36657, commentId: 50, version: commentReads === 1 ? 1 : 2, text: 'Comentário', isDeleted: false }))
      }
      if (method === 'PATCH') {
        patch()
        return Promise.resolve(response({ workItemId: 36657, commentId: 50, version: 3, text: 'Atualizado', isDeleted: false }))
      }
      return Promise.resolve(response(workItem()))
    })
    vi.stubGlobal('fetch', fetchMock)
    const server = await createServer({
      config: {
        requestTimeoutMs: 1_000,
        confirmationTtlMs: 60_000,
        requireConfirmation: true,
        configurationIssues: {},
        tfs: { organizationUrl: 'https://tfs.example', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: resolve('config/tfs-sarah.yaml') },
      },
      logger,
    })
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      const prepared = await client.callTool({ name: 'tfs_prepare_update_work_item_comment', arguments: { id: 36657, commentId: 50, text: 'Atualizado' } })
      const plan = prepared.structuredContent as { operationId: string; confirmationToken: string }
      const applied = await client.callTool({ name: 'operations_apply', arguments: { operationId: plan.operationId, confirmationToken: plan.confirmationToken, confirmation: 'CONFIRMO' } })
      expect(applied.isError).toBe(true)
      expect(applied.structuredContent).toMatchObject({ error: { code: 'CONFLICT' } })
      expect(patch).not.toHaveBeenCalled()
    } finally {
      await client.close()
      await server.close()
      vi.unstubAllGlobals()
    }
  })
})
