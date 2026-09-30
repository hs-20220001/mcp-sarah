import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'

function environment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
}

function waitForDashboard(child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    let stderr = ''
    const timeout = setTimeout(() => reject(new Error(`Painel não iniciou. stderr: ${stderr}`)), 10_000)
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      const match = /"dashboardUrl":"(http:\/\/127\.0\.0\.1:\d+)"/.exec(stderr)
      if (match?.[1]) {
        clearTimeout(timeout)
        resolve(match[1])
      }
    })
    child.once('exit', code => {
      clearTimeout(timeout)
      reject(new Error(`Painel encerrou antes de iniciar com código ${code}. stderr: ${stderr}`))
    })
  })
}

describe('development dashboard', () => {
  it('serve orientações, status seguro e o catálogo MCP real', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/dev.ts'], {
      cwd: process.cwd(),
      env: { ...environment(), MCP_DASHBOARD_PORT: '0', MCP_DASHBOARD_OPEN: 'false', WP_ALLOWED_MEDIA_ROOTS: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    try {
      const url = await waitForDashboard(child)
      const page = await fetch(url)
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('Seu MCP, explicado sem mistério.')

      const overviewResponse = await fetch(`${url}/api/overview?probe=false`)
      expect(overviewResponse.status).toBe(200)
      const overview = await overviewResponse.json() as {
        tools: Array<{ name: string }>
        status: { modules: Array<{ id: string; details?: Record<string, unknown> }> }
      }
      expect(overview.tools).toHaveLength(32)
      expect(overview.tools.some(tool => tool.name === 'operations_apply')).toBe(true)
      expect(overview.status.modules.find(module => module.id === 'wordpress')?.details).toMatchObject({
        pageScope: 'per-wiki',
        postScope: 'per-wiki',
        mediaPathScope: 'all',
        wikiCount: 2,
      })
    } finally {
      child.stdin.end()
      child.kill('SIGTERM')
      await Promise.race([
        once(child, 'exit'),
        delay(3_000).then(() => { child.kill('SIGKILL') }),
      ])
    }
  }, 20_000)
})
