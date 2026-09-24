import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { AppError, normalizeError } from './errors.js'
import type { Logger } from './logger.js'

export type OperationState = 'pending' | 'applying' | 'applied' | 'cancelled' | 'expired' | 'blocked' | 'failed'

export interface OperationDiff {
  field: string
  before?: unknown
  after?: unknown
}

export interface PrepareOperationInput {
  module: string
  action: string
  target: string
  summary: string
  diff: OperationDiff[]
  preflight: () => Promise<void>
  execute: () => Promise<Record<string, unknown>>
}

interface StoredOperation extends PrepareOperationInput {
  id: string
  state: OperationState
  tokenHash: Buffer
  createdAt: number
  expiresAt: number
  result?: Record<string, unknown>
  error?: { code: string; message: string }
}

export interface PublicOperation {
  operationId: string
  module: string
  action: string
  target: string
  summary: string
  diff: OperationDiff[]
  state: OperationState
  createdAt: string
  expiresAt: string
  result?: Record<string, unknown>
  error?: { code: string; message: string }
}

export function operationPreparationMessage(requireConfirmation: boolean, summary: string, impact = 'o diff'): string {
  return requireConfirmation
    ? `${summary} Exiba ${impact} e obtenha CONFIRMO antes de aplicar.`
    : `${summary} O modo sem confirmação está ativo; o ${impact} e o preflight continuam obrigatórios antes da aplicação.`
}

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}

export class OperationService {
  readonly #operations = new Map<string, StoredOperation>()

  constructor(
    readonly ttlMs: number,
    readonly logger: Logger,
    readonly auditLogPath?: string,
  ) {}

  async prepare(input: PrepareOperationInput): Promise<PublicOperation & { confirmationToken: string }> {
    this.#purge()
    const confirmationToken = randomBytes(32).toString('base64url')
    const operation: StoredOperation = {
      ...input,
      id: randomUUID(),
      state: 'pending',
      tokenHash: tokenHash(confirmationToken),
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
    }
    this.#operations.set(operation.id, operation)
    await this.#audit(operation, 'prepared')
    return { ...this.#public(operation), confirmationToken }
  }

  get(id: string): PublicOperation {
    this.#purge()
    const operation = this.#operations.get(id)
    if (!operation) throw new AppError('NOT_FOUND', 'Plano de operação inexistente.')
    return this.#public(operation)
  }

  async cancel(id: string): Promise<PublicOperation> {
    const operation = this.#getPending(id)
    operation.state = 'cancelled'
    await this.#audit(operation, 'cancelled')
    return this.#public(operation)
  }

  async apply(id: string, token: string): Promise<PublicOperation> {
    const operation = this.#getPending(id)
    const suppliedHash = tokenHash(token)
    if (!timingSafeEqual(operation.tokenHash, suppliedHash)) {
      throw new AppError('FORBIDDEN', 'Token de confirmação inválido.')
    }

    operation.state = 'applying'
    try {
      await operation.preflight()
      operation.result = await operation.execute()
      operation.state = 'applied'
      await this.#audit(operation, 'applied')
    } catch (error) {
      const normalized = normalizeError(error)
      operation.state = normalized.code === 'CONFLICT' || normalized.code === 'POLICY_DENIED' ? 'blocked' : 'failed'
      operation.error = { code: normalized.code, message: normalized.message }
      await this.#audit(operation, operation.state)
      throw normalized
    }
    return this.#public(operation)
  }

  #getPending(id: string): StoredOperation {
    this.#purge()
    const operation = this.#operations.get(id)
    if (!operation) throw new AppError('NOT_FOUND', 'Plano de operação inexistente.')
    if (operation.state === 'expired') throw new AppError('OPERATION_EXPIRED', 'O plano de operação expirou.')
    if (operation.state !== 'pending') throw new AppError('CONFLICT', `O plano está no estado ${operation.state}.`)
    return operation
  }

  #purge(): void {
    const now = Date.now()
    for (const operation of this.#operations.values()) {
      if (operation.state === 'pending' && operation.expiresAt <= now) operation.state = 'expired'
    }
  }

  #public(operation: StoredOperation): PublicOperation {
    return {
      operationId: operation.id,
      module: operation.module,
      action: operation.action,
      target: operation.target,
      summary: operation.summary,
      diff: operation.diff,
      state: operation.state,
      createdAt: new Date(operation.createdAt).toISOString(),
      expiresAt: new Date(operation.expiresAt).toISOString(),
      ...(operation.result ? { result: operation.result } : {}),
      ...(operation.error ? { error: operation.error } : {}),
    }
  }

  async #audit(operation: StoredOperation, event: string): Promise<void> {
    const record = {
      timestamp: new Date().toISOString(),
      event,
      operationId: operation.id,
      module: operation.module,
      action: operation.action,
      target: operation.target,
      state: operation.state,
    }
    this.logger.info('operation_audit', record)
    if (!this.auditLogPath) return
    try {
      await mkdir(dirname(this.auditLogPath), { recursive: true })
      await appendFile(this.auditLogPath, `${JSON.stringify(record)}\n`, 'utf8')
    } catch (error) {
      this.logger.error('audit_write_failed', {
        operationId: operation.id,
        error: error instanceof Error ? error.message : 'Erro desconhecido.',
      })
    }
  }
}
