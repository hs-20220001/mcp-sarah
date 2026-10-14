import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod/v4'
import { oracleEnvironments } from '../../core/config.js'
import { AppError } from '../../core/errors.js'
import type { IntegrationModule, ModuleContext, ModuleHealth } from '../../core/module.js'
import { safeToolCall, successResult } from '../../core/tool-result.js'
import { OracleClient } from './client.js'

const environmentSchema = z.enum(oracleEnvironments).default('DEV').describe('Ambiente Oracle. O padrão é DEV; use HOM ou PRO somente quando o usuário pedir explicitamente.')
const usernameSchema = z.string().trim().min(1).max(128).optional().describe('Opcional: usuário Oracle alternativo. A conexão usa a senha configurada para o ambiente escolhido.')
const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const identifierSchema = z.string().trim().min(1).max(128)

export class OracleModule implements IntegrationModule {
  readonly id = 'oracle' as const
  #client?: OracleClient

  constructor(readonly context: ModuleContext) {}

  initialize(): Promise<void> {
    const config = this.context.config.oracle
    if (config) this.#client = new OracleClient(config, this.context.config.requestTimeoutMs)
    return Promise.resolve()
  }

  async healthCheck(probe: boolean): Promise<ModuleHealth> {
    if (!this.#client) return { id: 'oracle', configured: false, message: `Configuração ausente: ${(this.context.config.configurationIssues.oracle ?? []).join(', ')}` }
    const configuredEnvironments = this.#client.configuredEnvironments()
    const details = { defaultEnvironment: 'DEV', configuredEnvironments }
    if (!probe) return { id: 'oracle', configured: true, message: 'Configurado; conexão não testada.', details }
    try {
      await this.#client.healthCheck('DEV')
      return { id: 'oracle', configured: true, reachable: true, message: 'Conexão Oracle DEV validada.', details }
    } catch {
      return { id: 'oracle', configured: true, reachable: false, message: 'Falha ao validar a conexão Oracle DEV.', details }
    }
  }

  registerTools(server: McpServer): void {
    server.registerTool('oracle_query', {
      title: 'Consultar registros Oracle',
      description: 'Executa uma única instrução SELECT com binds em transação READ ONLY e limita o resultado a no máximo 500 linhas. Não aceita DML, DDL nem PL/SQL. DEV é o padrão; escolha HOM/PRO somente quando solicitado. Evite dados pessoais ou sensíveis desnecessários.',
      inputSchema: z.object({
        environment: environmentSchema,
        username: usernameSchema,
        sql: z.string().trim().min(1).max(20_000).describe('Uma instrução SELECT Oracle. Use binds nomeados (:nome) para valores e nunca concatene dados fornecidos pelo usuário.'),
        binds: z.record(z.string(), scalarSchema).default({}),
        maxRows: z.number().int().min(1).max(500).default(100),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const result = await this.#requireClient().query(args.sql, args.binds, args.maxRows, { environment: args.environment, ...(args.username ? { username: args.username } : {}) })
      return successResult(`${result.returnedRows} registro(s) retornado(s) de Oracle ${args.environment}${result.truncated ? ' (resultado limitado)' : ''}.`, { environment: args.environment, ...result })
    }))

    server.registerTool('oracle_describe_table', {
      title: 'Consultar parâmetros de tabela Oracle',
      description: 'Consulta metadados visíveis da tabela: colunas, tipos, tamanhos, precisão, escala, nulabilidade e valor padrão. Não lê nem altera linhas. Informe owner real quando a tabela pertencer a outro schema.',
      inputSchema: z.object({ environment: environmentSchema, username: usernameSchema, owner: identifierSchema.optional(), table: identifierSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const result = await this.#requireClient().describeTable(args.owner, args.table, { environment: args.environment, ...(args.username ? { username: args.username } : {}) })
      return successResult(`Metadados de ${result.owner}.${result.table} consultados em Oracle ${args.environment}.`, { environment: args.environment, ...result })
    }))

    server.registerTool('oracle_list_package_functions', {
      title: 'Consultar funções de package Oracle',
      description: 'Lista funções de um package visíveis ao usuário e seus argumentos/retorno conforme ALL_PROCEDURES e ALL_ARGUMENTS. Para executar uma função escalar compatível, use oracle_call_package_function. ORACLE_READONLY_FUNCTIONS_<AMBIENTE> vazia permite todas as funções que o usuário Oracle pode executar; preenchida restringe aos nomes listados. Funções podem ter efeitos colaterais mesmo em transação READ ONLY.',
      inputSchema: z.object({ environment: environmentSchema, username: usernameSchema, owner: identifierSchema.optional(), packageName: identifierSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const result = await this.#requireClient().listPackageFunctions(args.owner, args.packageName, { environment: args.environment, ...(args.username ? { username: args.username } : {}) })
      return successResult(`${result.functions.length} função(ões) encontrada(s) no package ${result.owner}.${result.packageName}.`, { environment: args.environment, ...result })
    }))

    server.registerTool('oracle_call_package_function', {
      title: 'Consultar função de package Oracle',
      description: 'Executa função escalar de package com argumentos nomeados em uma instrução SELECT dentro de transação READ ONLY. Recusa sobrecargas ambíguas, parâmetros OUT/IN OUT e tipos compostos. A transação não impede efeitos autônomos ou externos: chame somente funções aprovadas como seguras para leitura. DEV é o padrão.',
      inputSchema: z.object({ environment: environmentSchema, username: usernameSchema, owner: identifierSchema.optional(), packageName: identifierSchema, functionName: identifierSchema, arguments: z.record(z.string(), scalarSchema).default({}) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, args => safeToolCall(async () => {
      const result = await this.#requireClient().callPackageFunction(args.owner, args.packageName, args.functionName, args.arguments, { environment: args.environment, ...(args.username ? { username: args.username } : {}) })
      return successResult(`Função ${args.owner ?? args.username ?? 'schema padrão'}.${args.packageName}.${args.functionName} consultada em Oracle ${args.environment}.`, { environment: args.environment, ...result })
    }))
  }

  #requireClient(): OracleClient {
    if (!this.#client) throw new AppError('CONFIG_MISSING', `Configuração Oracle ausente: ${(this.context.config.configurationIssues.oracle ?? []).join(', ')}`)
    return this.#client
  }
}