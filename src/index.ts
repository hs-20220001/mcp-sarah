import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createLogger } from './core/logger.js'
import { createServer } from './server.js'

const logger = createLogger()
const handle = serveStdio(() => createServer({ logger }), {
  onerror: error => logger.error('stdio_error', { error: error.message }),
})

logger.info('mcp_started', { transport: 'stdio', version: '0.1.0' })

const shutdown = (): void => {
  void handle.close().catch((error: unknown) => logger.error('shutdown_error', {
    error: error instanceof Error ? error.message : 'unknown',
  }))
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
