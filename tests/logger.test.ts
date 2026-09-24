import { describe, expect, it } from 'vitest'
import { testing } from '../src/core/logger.js'

describe('logger redaction', () => {
  it('remove segredos de objetos aninhados', () => {
    expect(testing.redact({ authorization: 'Basic abc', nested: { pat: '123', value: 'ok' } })).toEqual({
      authorization: '[REDACTED]',
      nested: { pat: '[REDACTED]', value: 'ok' },
    })
  })
})
