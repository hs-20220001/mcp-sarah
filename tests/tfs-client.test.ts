import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpClient } from '../src/core/http.js'
import { TfsClient } from '../src/modules/tfs/client.js'
import { loadTfsPolicy } from '../src/modules/tfs/policy.js'

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

describe('TfsClient', () => {
  beforeEach(() => fetchMock.mockReset())

  it('cria work item com POST, JSON Patch, perfil Sarah e API 7.0', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    fetchMock.mockResolvedValue(response({ id: 10, rev: 1, url: 'api', fields: { 'System.WorkItemType': 'Task', 'System.Title': 'Criar teste', 'System.State': 'To Do' } }))
    const client = new TfsClient(
      { organizationUrl: 'https://tfs.example/tfs/DefaultCollection', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: '' },
      policy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    await client.create({ type: 'Task', title: 'Criar teste', customFields: { size: 1 } })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = firstRequest()
    expect(url).toContain('/_apis/wit/workitems/$Task?api-version=7.0')
    expect(init?.method).toBe('POST')
    if (typeof init?.body !== 'string') throw new Error('Corpo JSON ausente.')
    const patch = JSON.parse(init.body) as Array<{ path: string; value: unknown }>
    expect(patch).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/fields/System.Title', value: 'Criar teste' }),
      expect.objectContaining({ path: '/fields/Sarah.Tamanho', value: '1 - Mínimo' }),
    ]))
    expect(new Headers(init.headers).get('authorization')).toMatch(/^Basic /)
  })

  it('cria uma Task ligada ao PBI com Activity, Remaining Work e Blocked', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    fetchMock.mockResolvedValue(response({
      id: 11,
      rev: 1,
      url: 'api',
      fields: {
        'System.WorkItemType': 'Task',
        'System.Title': 'Testes - Campo Implante obrigatório',
        'System.State': 'To Do',
        'Microsoft.VSTS.Common.Activity': 'Testing',
        'Microsoft.VSTS.Scheduling.RemainingWork': 6,
        'Microsoft.VSTS.CMMI.Blocked': false,
        'System.Description': 'Validar o campo Implante.',
      },
      relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://tfs.example/tfs/DefaultCollection/Sarah/_apis/wit/workItems/10' }],
    }))
    const client = new TfsClient(
      { organizationUrl: 'https://tfs.example/tfs/DefaultCollection', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: '' },
      policy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    const result = await client.create({
      type: 'Task',
      title: 'Testes - Campo Implante obrigatório',
      description: 'Validar o campo Implante.',
      parentId: 10,
      customFields: { activity: 'Testing', remainingWork: 6, blocked: false },
    })

    expect(result).toMatchObject({
      parentId: 10,
      customFields: { activity: 'Testing', remainingWork: 6, blocked: false },
    })
    const [, init] = firstRequest()
    if (typeof init?.body !== 'string') throw new Error('Corpo JSON ausente.')
    const patch = JSON.parse(init.body) as Array<{ path: string; value: unknown }>
    expect(patch).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/fields/Microsoft.VSTS.Common.Activity', value: 'Testing' }),
      expect.objectContaining({ path: '/fields/Microsoft.VSTS.Scheduling.RemainingWork', value: 6 }),
      expect.objectContaining({ path: '/fields/Microsoft.VSTS.CMMI.Blocked', value: false }),
    ]))
    expect(patch.find(operation => operation.path === '/relations/-')?.value).toMatchObject({ rel: 'System.LinkTypes.Hierarchy-Reverse' })
  })

  it('grava descrição, Acceptance Criteria e prioridade de um PBI', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    fetchMock.mockResolvedValue(response({
      id: 10,
      rev: 1,
      url: 'api',
      fields: {
        'System.WorkItemType': 'Product Backlog Item',
        'System.Title': 'Agendamento',
        'System.Description': '<p><em>"Como usuário, quero agendar."</em></p><p>Detalhes.</p>',
        'Microsoft.VSTS.Common.AcceptanceCriteria': '<p>Critério de aceite.</p>',
        'Microsoft.VSTS.Common.Priority': 2,
        'System.State': 'New',
      },
    }))
    const client = new TfsClient(
      { organizationUrl: 'https://tfs.example/tfs/DefaultCollection', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: '' },
      policy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    const result = await client.create({
      type: 'Product Backlog Item',
      title: 'Agendamento',
      description: '<p><em>"Como usuário, quero agendar."</em></p><p>Detalhes.</p>',
      acceptanceCriteria: '<p>Critério de aceite.</p>',
      customFields: { priority: 2 },
    })

    expect(result).toMatchObject({
      description: '<p><em>"Como usuário, quero agendar."</em></p><p>Detalhes.</p>',
      acceptanceCriteria: '<p>Critério de aceite.</p>',
      customFields: { priority: 2 },
    })
    const [, init] = firstRequest()
    if (typeof init?.body !== 'string') throw new Error('Corpo JSON ausente.')
    const patch = JSON.parse(init.body) as Array<{ path: string; value: unknown }>
    expect(patch).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/fields/System.Description', value: '<p><em>"Como usuário, quero agendar."</em></p><p>Detalhes.</p>' }),
      expect.objectContaining({ path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria', value: '<p>Critério de aceite.</p>' }),
      expect.objectContaining({ path: '/fields/Microsoft.VSTS.Common.Priority', value: 2 }),
    ]))
  })

  it('envia work item apenas para a lixeira', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    fetchMock.mockResolvedValue(response({ id: 10 }))
    const client = new TfsClient(
      { organizationUrl: 'https://tfs.example/tfs/DefaultCollection', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: '' },
      policy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    await client.trash(10)
    const [url, init] = firstRequest()
    expect(url).toContain('destroy=false')
    expect(url).not.toContain('destroy=true')
    expect(init?.method).toBe('DELETE')
  })

  it('edita com teste de revisão no JSON Patch', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    fetchMock.mockResolvedValue(response({ id: 10, rev: 4, url: 'api', fields: { 'System.WorkItemType': 'Task', 'System.Title': 'Atualizado', 'System.State': 'To Do' } }))
    const client = new TfsClient(
      { organizationUrl: 'https://tfs.example/tfs/DefaultCollection', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: '' },
      policy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    await client.update(10, 'Task', 3, { title: 'Atualizado' }, [])
    const [, init] = firstRequest()
    if (typeof init?.body !== 'string') throw new Error('Corpo JSON ausente.')
    const operations = JSON.parse(init.body) as Array<{ op: string; path: string; value?: unknown }>
    expect(operations[0]).toEqual({ op: 'test', path: '/rev', value: 3 })
    expect(init.method).toBe('PATCH')
  })

  it('edita campos de Task com Activity e tipos corretos no JSON Patch', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    fetchMock.mockResolvedValue(response({
      id: 11,
      rev: 3,
      url: 'api',
      fields: {
        'System.WorkItemType': 'Task',
        'System.Title': 'Documentação - Campo Implante obrigatório',
        'System.State': 'To Do',
        'Microsoft.VSTS.Common.Activity': 'Documentation',
        'Microsoft.VSTS.Scheduling.RemainingWork': 2,
        'Microsoft.VSTS.CMMI.Blocked': true,
      },
      relations: [],
    }))
    const client = new TfsClient(
      { organizationUrl: 'https://tfs.example/tfs/DefaultCollection', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: '' },
      policy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    await client.update(11, 'Task', 2, {
      title: 'Documentação - Campo Implante obrigatório',
      customFields: { activity: 'Documentation', remainingWork: 2, blocked: true },
    }, [])
    const [, init] = firstRequest()
    if (typeof init?.body !== 'string') throw new Error('Corpo JSON ausente.')
    const operations = JSON.parse(init.body) as Array<{ op: string; path: string; value?: unknown }>
    expect(operations).toEqual(expect.arrayContaining([
      { op: 'test', path: '/rev', value: 2 },
      { op: 'add', path: '/fields/System.Title', value: 'Documentação - Campo Implante obrigatório' },
      { op: 'add', path: '/fields/Microsoft.VSTS.Common.Activity', value: 'Documentation' },
      { op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.RemainingWork', value: 2 },
      { op: 'add', path: '/fields/Microsoft.VSTS.CMMI.Blocked', value: true },
    ]))
  })

  it('edita Acceptance Criteria e campos Planning com teste de revisão', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    fetchMock.mockResolvedValue(response({
      id: 10,
      rev: 5,
      url: 'api',
      fields: {
        'System.WorkItemType': 'Product Backlog Item',
        'System.Title': 'Atualizado',
        'System.Description': '<p>Descrição.</p>',
        'Microsoft.VSTS.Common.AcceptanceCriteria': '<p>Novos critérios.</p>',
        'Sarah.Tamanho': '3 - Máximo',
        'Microsoft.VSTS.Scheduling.Effort': 20,
        'System.State': 'New',
      },
    }))
    const client = new TfsClient(
      { organizationUrl: 'https://tfs.example/tfs/DefaultCollection', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: '' },
      policy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    await client.update(10, 'Product Backlog Item', 4, {
      acceptanceCriteria: '<p>Novos critérios.</p>',
      customFields: { size: 3, effort: 20 },
    }, [])
    const [, init] = firstRequest()
    if (typeof init?.body !== 'string') throw new Error('Corpo JSON ausente.')
    const operations = JSON.parse(init.body) as Array<{ op: string; path: string; value?: unknown }>
    expect(operations).toEqual(expect.arrayContaining([
      { op: 'test', path: '/rev', value: 4 },
      { op: 'add', path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria', value: '<p>Novos critérios.</p>' },
      { op: 'add', path: '/fields/Sarah.Tamanho', value: '3 - Máximo' },
      { op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.Effort', value: 20 },
    ]))
  })

  it('lista comentários com paginação e a versão preview da API', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    fetchMock.mockResolvedValue(response({
      comments: [{ workItemId: 36657, commentId: 42, version: 3, text: 'Comentário', createdDate: '2026-09-24T10:00:00Z', isDeleted: false }],
      continuationToken: 'next token',
    }))
    const client = new TfsClient(
      { organizationUrl: 'https://tfs.example/tfs/DefaultCollection', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: '' },
      policy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    const result = await client.listComments(36657, 25, 'previous token', 'desc', true)

    expect(result.comments[0]).toMatchObject({ commentId: 42, version: 3, text: 'Comentário', modifiedDate: null })
    expect(result.continuationToken).toBe('next token')
    const [url, init] = firstRequest()
    const parsed = new URL(url)
    expect(parsed.pathname).toContain('/_apis/wit/workItems/36657/comments')
    expect(parsed.searchParams.get('$top')).toBe('25')
    expect(parsed.searchParams.get('continuationToken')).toBe('previous token')
    expect(parsed.searchParams.get('order')).toBe('desc')
    expect(parsed.searchParams.get('includeDeleted')).toBe('true')
    expect(parsed.searchParams.get('api-version')).toBe('7.0-preview.3')
    expect(init?.method).toBeUndefined()
  })

  it('insere e altera comentário com os corpos esperados', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    fetchMock
      .mockResolvedValueOnce(response({ workItemId: 36657, commentId: 50, version: 1, text: 'Novo' }))
      .mockResolvedValueOnce(response({ workItemId: 36657, commentId: 50, version: 2, text: 'Atualizado' }))
    const client = new TfsClient(
      { organizationUrl: 'https://tfs.example/tfs/DefaultCollection', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: '' },
      policy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    await client.addComment(36657, 'Novo')
    await client.updateComment(36657, 50, 'Atualizado')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, addInit] = fetchMock.mock.calls[0] ?? []
    const [updateUrl, updateInit] = fetchMock.mock.calls[1] ?? []
    expect(addInit?.method).toBe('POST')
    expect(addInit?.body).toBe(JSON.stringify({ text: 'Novo' }))
    expect(updateUrl).toContain('/workItems/36657/comments/50?api-version=7.0-preview.3')
    expect(updateInit?.method).toBe('PATCH')
    expect(updateInit?.body).toBe(JSON.stringify({ text: 'Atualizado' }))
  })

  it('deleta comentário pelo endpoint de comentários', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    fetchMock.mockResolvedValue(response({ workItemId: 36657, commentId: 50, version: 3, text: 'Removido', isDeleted: true }))
    const client = new TfsClient(
      { organizationUrl: 'https://tfs.example/tfs/DefaultCollection', project: 'Sarah', pat: 'secret', apiVersion: '7.0', policyPath: '' },
      policy,
      new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock }),
    )

    const result = await client.deleteComment(36657, 50)

    expect(result.isDeleted).toBe(true)
    const [url, init] = firstRequest()
    expect(url).toContain('/workItems/36657/comments/50?api-version=7.0-preview.3')
    expect(init?.method).toBe('DELETE')
  })
})
