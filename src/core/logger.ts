const sensitiveKeyPattern = /(authorization|password|token|pat|secret|credential|api[_-]?key)/i

function redact(value: unknown, seen = new WeakSet()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (Array.isArray(value)) return value.map(item => redact(item, seen))

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveKeyPattern.test(key) ? '[REDACTED]' : redact(entry, seen),
    ]),
  )
}

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}

export function createLogger(): Logger {
  const write = (level: 'info' | 'error', message: string, context?: Record<string, unknown>): void => {
    const event = redact({ timestamp: new Date().toISOString(), level, message, ...context })
    process.stderr.write(`${JSON.stringify(event)}\n`)
  }

  return {
    info: (message, context) => write('info', message, context),
    error: (message, context) => write('error', message, context),
  }
}

export const testing = { redact }
