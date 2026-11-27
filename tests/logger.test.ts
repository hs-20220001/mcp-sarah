import { describe, expect, it } from 'vitest'
import { testing } from '../src/core/logger.js'

describe('logger redaction', () => {
  it('oculta a chave Kanboard por nome de ambiente e de configuração', () => {
    expect(testing.redact({ KANBOARD_API_KEY: 'teste', kanboard: { apiKey: 'teste' } })).toEqual({
      KANBOARD_API_KEY: '[REDACTED]', kanboard: { apiKey: '[REDACTED]' },
    })
  })
  it('remove segredos de objetos aninhados', () => {
    expect(testing.redact({ authorization: 'Basic abc', nested: { pat: '123', value: 'ok' } })).toEqual({
      authorization: '[REDACTED]',
      nested: { pat: '[REDACTED]', value: 'ok' },
    })
  })
})
