import { setTimeout as delay } from 'node:timers/promises'
import { AppError, mapHttpError } from './errors.js'

const retryableStatuses = new Set([429, 502, 503, 504])

export interface HttpClientOptions {
  timeoutMs: number
  fetchImpl?: typeof fetch
}

export class HttpClient {
  readonly #timeoutMs: number
  readonly #fetch: typeof fetch

  constructor(options: HttpClientOptions) {
    this.#timeoutMs = options.timeoutMs
    this.#fetch = options.fetchImpl ?? fetch
  }

  async request<T>(url: string, init: RequestInit = {}, write = false): Promise<T> {
    const attempts = write ? 1 : 3
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.#timeoutMs)
      try {
        const response = await this.#fetch(url, { ...init, signal: controller.signal })
        if (!response.ok) {
          if (!write && retryableStatuses.has(response.status) && attempt < attempts) {
            await delay(100 * 2 ** (attempt - 1))
            continue
          }
          throw mapHttpError(response.status)
        }
        if (response.status === 204) return undefined as T
        return await response.json() as T
      } catch (error) {
        if (error instanceof AppError) throw error
        if (!write && attempt < attempts) {
          await delay(100 * 2 ** (attempt - 1))
          continue
        }
        if (error instanceof Error && error.name === 'AbortError') {
          throw new AppError('UPSTREAM_UNAVAILABLE', 'A requisição ao serviço externo excedeu o tempo limite.')
        }
        throw new AppError('UPSTREAM_UNAVAILABLE', 'Não foi possível conectar ao serviço externo.')
      } finally {
        clearTimeout(timeout)
      }
    }
    throw new AppError('UPSTREAM_UNAVAILABLE', 'Não foi possível concluir a requisição.')
  }
}
