import type { McpServer } from '@modelcontextprotocol/server'
import type { AppConfig, ModuleId } from './config.js'
import type { Logger } from './logger.js'
import type { OperationService } from './operations.js'

export interface ModuleHealth {
  id: ModuleId
  configured: boolean
  reachable?: boolean
  message: string
  details?: Record<string, unknown>
}

export interface ModuleContext {
  config: AppConfig
  logger: Logger
  operations: OperationService
}

export interface IntegrationModule {
  readonly id: ModuleId
  initialize(): Promise<void>
  registerTools(server: McpServer): void
  healthCheck(probe: boolean): Promise<ModuleHealth>
}
