import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { loadConfig } from '../src/core/config.js'
import { createServer } from '../src/server.js'

if (process.env.MCP_LIVE_TESTS !== 'CONFIRMO_LEITURA') {
  throw new Error('Smoke test ao vivo bloqueado. Defina MCP_LIVE_TESTS=CONFIRMO_LEITURA explicitamente.')
}

const config = loadConfig()
const issues = Object.entries(config.configurationIssues)
if (issues.length > 0) {
  throw new Error(`Configuração incompleta: ${issues.map(([module, names]) => `${module}: ${names.join(', ')}`).join('; ')}`)
}
const server = await createServer({ config })
const client = new Client({ name: 'mcp-sarah-live-smoke', version: '1.0.0' })
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

await server.connect(serverTransport)
await client.connect(clientTransport)
try {
  const result = await client.callTool({ name: 'system_get_status', arguments: { probe: true } })
  if (result.isError) throw new Error('O probe MCP retornou erro.')
  const modules = (result.structuredContent as { modules?: Array<{ configured: boolean; reachable?: boolean; message: string }> } | undefined)?.modules ?? []
  const failures = modules.filter(module => module.configured && module.reachable !== true)
  if (failures.length > 0) throw new Error(`Probe falhou: ${failures.map(module => module.message).join('; ')}`)
  process.stderr.write(`${JSON.stringify({ level: 'info', message: 'live_smoke_ok', modules: modules.length })}\n`)
} finally {
  await client.close()
  await server.close()
}
