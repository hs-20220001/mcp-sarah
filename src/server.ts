import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod/v4'
import { loadConfig, type AppConfig } from './core/config.js'
import { createLogger, type Logger } from './core/logger.js'
import type { IntegrationModule, ModuleContext } from './core/module.js'
import { OperationService } from './core/operations.js'
import { safeToolCall, successResult } from './core/tool-result.js'
import { bugApprovalGuidance } from './modules/tfs/bug-guidance.js'
import { TfsModule } from './modules/tfs/module.js'
import { WordPressModule } from './modules/wordpress/module.js'

function registerCoreTools(server: McpServer, modules: IntegrationModule[], context: ModuleContext): void {
  const confirmationRequired = context.config.requireConfirmation
  const applyInputSchema = confirmationRequired
    ? z.object({
      operationId: z.uuid(),
      confirmationToken: z.string().min(32),
      confirmation: z.literal('CONFIRMO'),
    })
    : z.object({
      operationId: z.uuid(),
      confirmationToken: z.string().min(32),
    })

  server.registerTool('system_get_status', {
    title: 'Consultar status do MCP Sarah',
    description: 'Mostra integrações disponíveis, configuração não sensível e, opcionalmente, testa as conexões.',
    inputSchema: z.object({ probe: z.boolean().default(false) }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, ({ probe }) => safeToolCall(async () => {
    const statuses = await Promise.all(modules.map(module => module.healthCheck(probe)))
    return successResult('Status dos módulos consultado.', {
      server: { name: 'mcp-sarah', version: '0.1.0', transport: 'stdio' },
      modules: statuses,
    })
  }))

  server.registerTool('operations_get', {
    title: 'Consultar plano de operação',
    description: 'Mostra diff, estado e expiração de um plano sem revelar o token de confirmação.',
    inputSchema: z.object({ operationId: z.uuid() }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, ({ operationId }) => safeToolCall(() => {
    const operation = context.operations.get(operationId)
    return successResult(`Plano ${operationId}: ${operation.state}.`, operation)
  }))

  server.registerTool('operations_apply', {
    title: confirmationRequired ? 'Aplicar operação confirmada' : 'Aplicar operação preparada',
    description: confirmationRequired
      ? 'Aplica uma única mutação já preparada. Use somente após mostrar o diff e receber CONFIRMO do usuário.'
      : 'Aplica uma única mutação já preparada no modo sem confirmação literal. O token do plano continua obrigatório. Para criação/edição de Bug e sua Task de Testes, aguarde a aprovação conversacional da proposta pelo usuário, sem exigir CONFIRMO.',
    inputSchema: applyInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, ({ operationId, confirmationToken }) => safeToolCall(async () => {
    const operation = await context.operations.apply(operationId, confirmationToken)
    return successResult(`Operação ${operationId} aplicada.`, operation)
  }))

  server.registerTool('operations_cancel', {
    title: 'Cancelar plano de operação',
    description: 'Invalida um plano pendente sem alterar o sistema externo.',
    inputSchema: z.object({ operationId: z.uuid() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, ({ operationId }) => safeToolCall(async () => {
    const operation = await context.operations.cancel(operationId)
    return successResult(`Plano ${operationId} cancelado.`, operation)
  }))
}

export interface ServerDependencies {
  config?: AppConfig
  logger?: Logger
}

export async function createServer(dependencies: ServerDependencies = {}): Promise<McpServer> {
  const config = dependencies.config ?? loadConfig()
  const logger = dependencies.logger ?? createLogger()
  const operations = new OperationService(config.confirmationTtlMs, logger, config.auditLogPath)
  const context: ModuleContext = { config, logger, operations }
  const modules: IntegrationModule[] = [new TfsModule(context), new WordPressModule(context)]

  await Promise.all(modules.map(module => module.initialize()))

  const server = new McpServer(
    { name: 'mcp-sarah', version: '0.1.0' },
    {
      instructions: (config.requireConfirmation
        ? 'Antes de qualquer escrita, prepare a operação, mostre o diff completo ao usuário e aguarde a confirmação literal CONFIRMO. Só então chame operations_apply com o token. Nunca tente exclusão permanente nem repita automaticamente uma escrita com resultado ambíguo.'
        : 'O modo sem confirmação literal está ativo. Antes de qualquer escrita, prepare a operação e use o diff e o preflight do plano; depois chame operations_apply com o token, sem solicitar CONFIRMO. Exceção de orientação: criação/edição de Bug e sua Task de Testes exigem aprovação conversacional da proposta antes da aplicação. Nunca tente exclusão permanente nem repita automaticamente uma escrita com resultado ambíguo.') + ` ${bugApprovalGuidance}`,
    },
  )

  registerCoreTools(server, modules, context)
  for (const module of modules) module.registerTools(server)
  return server
}
