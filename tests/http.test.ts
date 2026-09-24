import { describe, expect, it, vi } from 'vitest'
import { HttpClient } from '../src/core/http.js'

describe('HttpClient', () => {
  it('repete leitura transitória no máximo duas vezes', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const client = new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock })
    await expect(client.request<{ ok: boolean }>('https://example.test')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('nunca repete escrita após falha transitória', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('detalhe sensível', { status: 503 }))
    const client = new HttpClient({ timeoutMs: 1_000, fetchImpl: fetchMock })
    await expect(client.request('https://example.test', { method: 'POST' }, true)).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
