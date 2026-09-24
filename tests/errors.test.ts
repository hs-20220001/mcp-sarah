import { describe, expect, it } from 'vitest'
import { mapHttpError } from '../src/core/errors.js'

describe('HTTP error mapping', () => {
  it.each([
    [401, 'AUTH_FAILED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [412, 'CONFLICT'],
    [429, 'RATE_LIMITED'],
    [503, 'UPSTREAM_UNAVAILABLE'],
  ] as const)('mapeia %s para %s', (status, code) => {
    expect(mapHttpError(status).code).toBe(code)
  })

  it('não devolve corpo arbitrário do upstream', () => {
    expect(mapHttpError(400).message).toBe('O serviço externo rejeitou a requisição.')
  })
})
