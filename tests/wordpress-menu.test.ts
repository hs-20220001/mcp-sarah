import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../src/core/config.js'
import type { Logger } from '../src/core/logger.js'
import { createServer } from '../src/server.js'

const logger: Logger = { info: vi.fn(), error: vi.fn() }

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function urlOf(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input instanceof URL ? input.href : input
}

function page(id: number, status = 'publish') {
  return { id, modified_gmt: '2026-09-30', status, slug: `pagina-${id}`, link: `https://example.org/${id}`, title: { raw: `Página ${id}` }, content: { raw: '' }, excerpt: { raw: '' }, parent: 0 }
}

function item(id: number, pageId: number, parent = 0, menuId = 5) {
  return { id, title: { raw: `Item ${id}` }, status: 'publish', type: 'post_type', object: 'page', object_id: pageId, parent, menu_order: id, menus: menuId, url: `https://example.org/${pageId}` }
}

async function setup(policyPath = resolve('config/wordpress.yaml')) {
  const config: AppConfig = {
    requestTimeoutMs: 1_000, confirmationTtlMs: 60_000, requireConfirmation: true, configurationIssues: {},
    wordpress: { username: 'user', applicationPassword: 'secret', allowedMediaRoots: [], wikis: {
      developer: { baseUrl: 'https://dev.example', policyPath },
      user: { baseUrl: 'https://users.example', policyPath },
    } },
  }
  const server = await createServer({ config, logger })
  const client = new Client({ name: 'menu-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return { client, close: async () => { await client.close(); await server.close() } }
}

afterEach(() => vi.unstubAllGlobals())

describe('menus WordPress via MCP', () => {
  it('sugere menu developer, cria página separada e só inclui item após segundo plano confirmado', async () => {
    const requests = vi.fn<typeof fetch>()
    requests.mockImplementation((input, init) => {
      const url = urlOf(input)
      if (url.includes('/menus?')) return Promise.resolve(response([{ id: 5, name: 'Software e desenvolvimento', slug: 'software-e-desenvolvimento' }]))
      if (url.includes('/menus/5?')) return Promise.resolve(response({ id: 5, name: 'Software e desenvolvimento' }))
      if (url.includes('/menu-items?')) return Promise.resolve(response([{ ...item(500, 1), title: { raw: 'Software e desenvolvimento' } }]))
      if (url.endsWith('/pages') && init?.method === 'POST') return Promise.resolve(response(page(42)))
      if (url.includes('/pages/42?')) return Promise.resolve(response(page(42)))
      if (url.endsWith('/menu-items') && init?.method === 'POST') return Promise.resolve(response(item(900, 42, 500)))
      if (url.includes('/pages/1?')) return Promise.resolve(response(page(1)))
      throw new Error(`Requisição inesperada: ${url}`)
    })
    vi.stubGlobal('fetch', requests)
    const { client, close } = await setup()
    try {
      const suggestion = await client.callTool({ name: 'wordpress_suggest_menu_placement', arguments: { wiki: 'developer', isSystem: true } })
      expect(suggestion.structuredContent).toMatchObject({ wiki: 'developer', suggested: true, menu: { id: 5 }, parentItemId: 500 })
      const create = await client.callTool({ name: 'wordpress_prepare_create_content', arguments: { wiki: 'developer', kind: 'page', fields: { title: 'Sistema Exemplo', status: 'publish' } } })
      const pagePlan = create.structuredContent as { operationId: string; confirmationToken: string }
      const pageApplied = await client.callTool({ name: 'operations_apply', arguments: { ...pagePlan, confirmation: 'CONFIRMO' } })
      expect(pageApplied.structuredContent).toMatchObject({ state: 'applied', result: { content: { id: 42 }, menu: { added: false } } })
      const prepared = await client.callTool({ name: 'wordpress_prepare_create_menu_item', arguments: { wiki: 'developer', menuId: 5, pageId: 42, fields: { parentItemId: 500 } } })
      expect(prepared.isError).not.toBe(true)
      const diff = (prepared.structuredContent as { diff: Array<{ field: string; after: unknown }> }).diff
      expect(diff.find(entry => entry.field === 'parentItemId')?.after).toBe(500)
      expect(requests.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
      const menuPlan = prepared.structuredContent as { operationId: string; confirmationToken: string }
      const added = await client.callTool({ name: 'operations_apply', arguments: { ...menuPlan, confirmation: 'CONFIRMO' } })
      expect(added.structuredContent).toMatchObject({ state: 'applied', result: { menuItem: { id: 900, parentItemId: 500 } } })
      const post = requests.mock.calls.find(([input, init]) => urlOf(input).endsWith('/menu-items') && init?.method === 'POST')
      if (typeof post?.[1]?.body !== 'string') throw new Error('POST de item de menu não realizado.')
      expect(JSON.parse(post[1].body)).toMatchObject({ menus: 5, type: 'post_type', object: 'page', object_id: 42, status: 'publish', parent: 500 })
    } finally { await close() }
  })

  it('encontra menu da wiki user pelo nome do sistema e página-pai real; sem nome inequívoco pede escolha', async () => {
    const requests = vi.fn<typeof fetch>()
    requests.mockImplementation(input => {
      const url = urlOf(input)
      if (url.includes('/menus?')) return Promise.resolve(response([{ id: 9, name: 'Sistema Alfa' }, { id: 10, name: 'Sistema Beta' }]))
      if (url.includes('/menu-items?')) return Promise.resolve(response([item(700, 80, 0, 9)]))
      if (url.includes('/pages/80?')) return Promise.resolve(response(page(80)))
      throw new Error(`Requisição inesperada: ${url}`)
    })
    vi.stubGlobal('fetch', requests)
    const { client, close } = await setup()
    try {
      const ambiguous = await client.callTool({ name: 'wordpress_suggest_menu_placement', arguments: { wiki: 'user' } })
      expect(ambiguous.structuredContent).toMatchObject({ suggested: false, menus: [{ id: 9 }, { id: 10 }] })
      const suggestion = await client.callTool({ name: 'wordpress_suggest_menu_placement', arguments: { wiki: 'user', systemName: 'Sistema Alfa', pageParentId: 80 } })
      expect(suggestion.structuredContent).toMatchObject({ wiki: 'user', suggested: true, menu: { id: 9 }, parentItemId: 700 })
      expect(requests.mock.calls.every(([input]) => urlOf(input).startsWith('https://users.example/'))).toBe(true)
      expect(requests.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    } finally { await close() }
  })

  it('bloqueia aplicação se o menu mudou e não repete escrita', async () => {
    let listCount = 0
    const requests = vi.fn<typeof fetch>()
    requests.mockImplementation(input => {
      const url = urlOf(input)
      if (url.includes('/menus/5?')) return Promise.resolve(response({ id: 5, name: 'Software e desenvolvimento' }))
      if (url.includes('/menu-items?')) return Promise.resolve(response(listCount++ ? [item(500, 1), item(600, 80)] : [item(500, 1)]))
      if (url.includes('/pages/42?')) return Promise.resolve(response(page(42)))
      if (url.includes('/pages/1?')) return Promise.resolve(response(page(1)))
      throw new Error(`Requisição inesperada: ${url}`)
    })
    vi.stubGlobal('fetch', requests)
    const { client, close } = await setup()
    try {
      const prepared = await client.callTool({ name: 'wordpress_prepare_create_menu_item', arguments: { wiki: 'developer', menuId: 5, pageId: 42, fields: { parentItemId: 500 } } })
      const plan = prepared.structuredContent as { operationId: string; confirmationToken: string }
      const result = await client.callTool({ name: 'operations_apply', arguments: { ...plan, confirmation: 'CONFIRMO' } })
      expect(result.isError).toBe(true)
      expect(result.structuredContent).toMatchObject({ error: { code: 'CONFLICT' } })
      expect(requests.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    } finally { await close() }
  })

  it('nega rascunhos, duplicações e ciclos; permite reposicionar página existente', async () => {
    let draft = true
    const requests = vi.fn<typeof fetch>()
    requests.mockImplementation((input, init) => {
      const url = urlOf(input)
      if (url.includes('/menus/5?')) return Promise.resolve(response({ id: 5, name: 'Software e desenvolvimento' }))
      if (url.includes('/menu-items?')) return Promise.resolve(response([item(500, 1), item(501, 42, 500)]))
      if (url.includes('/pages/42?')) return Promise.resolve(response(page(42, draft ? 'draft' : 'publish')))
      if (url.includes('/pages/1?')) return Promise.resolve(response(page(1)))
      if (url.includes('/pages/66?')) return Promise.resolve(response(page(66, 'draft')))
      if (url.includes('/menu-items/501') && init?.method === 'POST') return Promise.resolve(response(item(501, 42, 0)))
      throw new Error(`Requisição inesperada: ${url}`)
    })
    vi.stubGlobal('fetch', requests)
    const { client, close } = await setup()
    try {
      const denied = await client.callTool({ name: 'wordpress_prepare_create_menu_item', arguments: { wiki: 'developer', menuId: 5, pageId: 66, fields: {} } })
      expect(denied.structuredContent).toMatchObject({ error: { code: 'POLICY_DENIED' } })
      draft = false
      const duplicate = await client.callTool({ name: 'wordpress_prepare_create_menu_item', arguments: { wiki: 'developer', menuId: 5, pageId: 42, fields: {} } })
      expect(duplicate.structuredContent).toMatchObject({ error: { code: 'CONFLICT' } })
      const cycle = await client.callTool({ name: 'wordpress_prepare_update_menu_item', arguments: { wiki: 'developer', menuId: 5, itemId: 500, fields: { parentItemId: 501 } } })
      expect(cycle.structuredContent).toMatchObject({ error: { code: 'POLICY_DENIED' } })
      const prepared = await client.callTool({ name: 'wordpress_prepare_update_menu_item', arguments: { wiki: 'developer', menuId: 5, itemId: 501, fields: { parentItemId: 0 } } })
      const plan = prepared.structuredContent as { operationId: string; confirmationToken: string }
      const applied = await client.callTool({ name: 'operations_apply', arguments: { ...plan, confirmation: 'CONFIRMO' } })
      expect(applied.structuredContent).toMatchObject({ state: 'applied', result: { menuItem: { id: 501, parentItemId: 0 } } })
      const post = requests.mock.calls.find(([input, init]) => urlOf(input).includes('/menu-items/501') && init?.method === 'POST')
      if (typeof post?.[1]?.body !== 'string') throw new Error('POST de edição não realizado.')
      expect(JSON.parse(post[1].body)).toEqual({ parent: 0 })
    } finally { await close() }
  })

  it('aplica allowlist de menus por wiki antes de qualquer leitura remota para escrita', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'mcp-sarah-menus-'))
    const policyPath = resolve(directory, 'wordpress.yaml')
    const source = await readFile(resolve('config/wordpress.yaml'), 'utf8')
    await writeFile(policyPath, source.replace('allowedMenuIds: []', 'allowedMenuIds: [5]'))
    const requests = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', requests)
    try {
      const { client, close } = await setup(policyPath)
      try {
        const result = await client.callTool({ name: 'wordpress_prepare_create_menu_item', arguments: { wiki: 'user', menuId: 9, pageId: 42, fields: {} } })
        expect(result.structuredContent).toMatchObject({ error: { code: 'POLICY_DENIED' } })
        expect(requests).not.toHaveBeenCalled()
      } finally { await close() }
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})