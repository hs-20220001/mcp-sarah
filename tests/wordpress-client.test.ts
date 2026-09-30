import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpClient } from '../src/core/http.js'
import { WordPressClient } from '../src/modules/wordpress/client.js'
import { inspectMediaPath, loadWordPressPolicy } from '../src/modules/wordpress/policy.js'

const fetchMock = vi.fn<typeof fetch>()

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function firstRequest(): [string, RequestInit | undefined] {
  const call = fetchMock.mock.calls[0]
  if (!call) throw new Error('Nenhuma requisição foi capturada.')
  const [input, init] = call
  const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input
  return [url, init]
}

describe('WordPressClient', () => {
  beforeEach(() => fetchMock.mockReset())

  it('cria conteúdo usando Application Password e status draft', async () => {
    const policy = await loadWordPressPolicy(resolve('config/wordpress.yaml'))
    fetchMock.mockResolvedValue(response({ id: 1, modified_gmt: '2026-01-01', slug: 'teste', status: 'draft', link: 'https://docs/teste', title: { raw: 'Teste' }, content: { raw: '' }, excerpt: { raw: '' } }))
    const client = new WordPressClient(
      { baseUrl: 'https://docs.example', username: 'user', applicationPassword: 'app-pass' },
      policy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    await client.createContent('post', { title: 'Teste', status: 'draft', categoryIds: [1] })
    const [url, init] = firstRequest()
    expect(url).toBe('https://docs.example/wp-json/wp/v2/posts')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toMatch(/^Basic /)
    if (typeof init?.body !== 'string') throw new Error('Corpo JSON ausente.')
    expect(JSON.parse(init.body)).toMatchObject({ title: 'Teste', status: 'draft', categories: [1] })
  })

  it('nunca usa force=true ao enviar conteúdo para a lixeira', async () => {
    const policy = await loadWordPressPolicy(resolve('config/wordpress.yaml'))
    fetchMock.mockResolvedValue(response({ deleted: true }))
    const client = new WordPressClient(
      { baseUrl: 'https://docs.example', username: 'user', applicationPassword: 'app-pass' },
      policy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    await client.trashContent('page', 12)
    const [url, init] = firstRequest()
    expect(url).toContain('force=false')
    expect(url).not.toContain('force=true')
    expect(init?.method).toBe('DELETE')
  })

  it('envia arquivo e metadados em uma única mutação multipart', async () => {
    const policy = await loadWordPressPolicy(resolve('config/wordpress.yaml'))
    fetchMock.mockResolvedValue(response({ id: 8, modified_gmt: '2026-01-01', slug: 'media', status: 'inherit', link: 'https://docs/media', source_url: 'https://docs/media.png', mime_type: 'image/png', post: 4, title: { raw: 'Capa' }, caption: { raw: '' }, description: { raw: '' }, alt_text: 'Capa' }))
    const client = new WordPressClient(
      { baseUrl: 'https://docs.example', username: 'user', applicationPassword: 'app-pass' },
      policy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    await client.uploadMedia({ path: 'media.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }, { title: 'Capa', altText: 'Capa', postId: 4 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = firstRequest()
    expect(url).toBe('https://docs.example/wp-json/wp/v2/media')
    expect(init?.body).toBeInstanceOf(FormData)
    const form = init?.body as FormData
    expect(form.get('title')).toBe('Capa')
    expect(form.get('alt_text')).toBe('Capa')
    expect(form.get('post')).toBe('4')
  })

  it('aceita mídia somente dentro de uma raiz local permitida', async () => {
    const policy = await loadWordPressPolicy(resolve('config/wordpress.yaml'))
    const directory = await mkdtemp(resolve(tmpdir(), 'mcp-sarah-'))
    const mediaPath = resolve(directory, 'media.png')
    try {
      await writeFile(mediaPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      const inspected = await inspectMediaPath(mediaPath, [directory], policy)
      expect(inspected.mimeType).toBe('image/png')
      await expect(inspectMediaPath(mediaPath, [resolve('config')], policy)).rejects.toThrow(/fora das raízes/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('trata raízes de mídia vazias como acesso irrestrito', async () => {
    const policy = await loadWordPressPolicy(resolve('config/wordpress.yaml'))
    const directory = await mkdtemp(resolve(tmpdir(), 'mcp-sarah-open-'))
    const mediaPath = resolve(directory, 'media.png')
    try {
      await writeFile(mediaPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      await expect(inspectMediaPath(mediaPath, [], policy)).resolves.toMatchObject({ mimeType: 'image/png' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('permite criar páginas e posts sem IDs quando as listas estão vazias', async () => {
    const policy = await loadWordPressPolicy(resolve('config/wordpress.yaml'))
    const client = new WordPressClient(
      { baseUrl: 'https://docs.example', username: 'user', applicationPassword: 'app-pass' },
      policy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    await expect(client.assertCreateAllowed('page', { title: 'Página' })).resolves.toBeUndefined()
    await expect(client.assertCreateAllowed('post', { title: 'Post' })).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('mantém listas preenchidas como restrições de escrita', async () => {
    const policy = await loadWordPressPolicy(resolve('config/wordpress.yaml'))
    const restrictedPolicy = { ...policy, allowedPageRootIds: [10], allowedPostCategoryIds: [20] }
    const client = new WordPressClient(
      { baseUrl: 'https://docs.example', username: 'user', applicationPassword: 'app-pass' },
      restrictedPolicy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    await expect(client.assertCreateAllowed('page', { title: 'Página' })).rejects.toThrow(/precisa informar parentId/)
    await expect(client.assertCreateAllowed('post', { title: 'Post', categoryIds: [99] })).rejects.toThrow(/categoria autorizada/)
    await expect(client.assertCreateAllowed('post', { title: 'Post', categoryIds: [20] })).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lê um menu com exatamente 100 itens sem buscar página fora do limite', async () => {
    const policy = await loadWordPressPolicy(resolve('config/wordpress.yaml'))
    const items = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, menus: 5, parent: 0, menu_order: index + 1, title: { raw: `Item ${index + 1}` }, type: 'post_type', object: 'page', object_id: index + 1, url: 'https://docs.example/', status: 'publish' }))
    fetchMock.mockResolvedValue(new Response(JSON.stringify(items), { status: 200, headers: { 'Content-Type': 'application/json', 'X-WP-TotalPages': '1' } }))
    const client = new WordPressClient({ baseUrl: 'https://docs.example', username: 'user', applicationPassword: 'secret' }, policy, new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }))
    expect(await client.getAllMenuItems(5)).toHaveLength(100)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
