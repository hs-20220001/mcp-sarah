import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { platform } from 'node:os'
import { fileURLToPath } from 'node:url'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createLogger } from '../src/core/logger.js'
import { createServer } from '../src/server.js'

const logger = createLogger()
const dashboardPath = fileURLToPath(new URL('../dashboard/index.html', import.meta.url))
const dashboardHtml = await readFile(dashboardPath, 'utf8')
const configuredPort = Number(process.env.MCP_DASHBOARD_PORT ?? '3333')
const requestedPort = Number.isInteger(configuredPort) && configuredPort >= 0 && configuredPort <= 65_535 ? configuredPort : 3333

async function collectOverview(probe: boolean): Promise<Record<string, unknown>> {
  const server = await createServer({ logger })
  const client = new Client({ name: 'mcp-sarah-dashboard', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    const [catalog, status] = await Promise.all([
      client.listTools(),
      client.callTool({ name: 'system_get_status', arguments: { probe } }),
    ])
    if (status.isError) throw new Error('Não foi possível consultar o status MCP.')
    return {
      generatedAt: new Date().toISOString(),
      status: status.structuredContent,
      tools: catalog.tools.map(tool => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        annotations: tool.annotations,
      })),
    }
  } finally {
    await client.close()
    await server.close()
  }
}

function send(response: ServerResponse, status: number, contentType: string, body: string): void {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(body)
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (request.method !== 'GET') {
    send(response, 405, 'application/json; charset=utf-8', JSON.stringify({ error: 'Método não permitido.' }))
    return
  }
  if (url.pathname === '/') {
    send(response, 200, 'text/html; charset=utf-8', dashboardHtml)
    return
  }
  if (url.pathname === '/api/overview') {
    try {
      const overview = await collectOverview(url.searchParams.get('probe') === 'true')
      send(response, 200, 'application/json; charset=utf-8', JSON.stringify(overview))
    } catch (error) {
      logger.error('dashboard_overview_failed', { error: error instanceof Error ? error.message : 'Erro desconhecido.' })
      send(response, 500, 'application/json; charset=utf-8', JSON.stringify({ error: 'Não foi possível carregar o status.' }))
    }
    return
  }
  send(response, 404, 'text/plain; charset=utf-8', 'Não encontrado.')
}

function openBrowser(url: string): void {
  if (process.env.MCP_DASHBOARD_OPEN?.toLocaleLowerCase() === 'false') return
  const system = platform()
  const command = system === 'win32' ? 'cmd.exe' : system === 'darwin' ? 'open' : 'xdg-open'
  const args = system === 'win32' ? ['/c', 'start', '', url] : [url]
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false })
  child.on('error', error => logger.error('dashboard_browser_open_failed', { error: error.message, url }))
  child.unref()
}

const dashboard = createHttpServer((request, response) => {
  void handleRequest(request, response)
})

async function listen(portToUse: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      dashboard.off('listening', onListening)
      reject(error)
    }
    const onListening = (): void => {
      dashboard.off('error', onError)
      resolve()
    }
    dashboard.once('error', onError)
    dashboard.once('listening', onListening)
    dashboard.listen(portToUse, '127.0.0.1')
  })
}

try {
  await listen(requestedPort)
} catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'EADDRINUSE' || requestedPort === 0) throw error
  logger.info('dashboard_port_in_use', { requestedPort, fallback: 'automatic' })
  await listen(0)
}

const address = dashboard.address()
if (!address || typeof address === 'string') throw new Error('Não foi possível determinar a porta do painel.')
const dashboardUrl = `http://127.0.0.1:${address.port}`

const stdio = serveStdio(() => createServer({ logger }), {
  onerror: error => logger.error('stdio_error', { error: error.message }),
})

logger.info('development_started', { dashboardUrl, transport: 'stdio' })
openBrowser(dashboardUrl)

let shuttingDown = false
const shutdown = (): void => {
  if (shuttingDown) return
  shuttingDown = true
  dashboard.close(error => {
    if (error) logger.error('dashboard_close_failed', { error: error.message })
  })
  void stdio.close().catch((error: unknown) => logger.error('stdio_close_failed', {
    error: error instanceof Error ? error.message : 'Erro desconhecido.',
  }))
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
