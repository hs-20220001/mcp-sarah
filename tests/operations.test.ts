import { describe, expect, it, vi } from 'vitest'
import { OperationService } from '../src/core/operations.js'
import type { Logger } from '../src/core/logger.js'

const logger: Logger = { info: vi.fn(), error: vi.fn() }

describe('OperationService', () => {
  it('prepara, exige token e aplica exatamente uma vez', async () => {
    const execute = vi.fn().mockResolvedValue({ id: 123 })
    const service = new OperationService(60_000, logger)
    const plan = await service.prepare({
      module: 'tfs', action: 'create', target: 'new:Task', summary: 'Criar task', diff: [{ field: 'title', after: 'Teste' }],
      preflight: vi.fn().mockResolvedValue(undefined), execute,
    })

    await expect(service.apply(plan.operationId, 'x'.repeat(43))).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(execute).not.toHaveBeenCalled()

    const applied = await service.apply(plan.operationId, plan.confirmationToken)
    expect(applied.state).toBe('applied')
    expect(execute).toHaveBeenCalledTimes(1)
    await expect(service.apply(plan.operationId, plan.confirmationToken)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('expira planos pendentes', async () => {
    vi.useFakeTimers()
    try {
      const service = new OperationService(1_000, logger)
      const plan = await service.prepare({ module: 'wordpress', action: 'update', target: 'page:1', summary: 'Editar', diff: [], preflight: vi.fn(), execute: vi.fn() })
      await vi.advanceTimersByTimeAsync(1_001)
      expect(service.get(plan.operationId).state).toBe('expired')
      await expect(service.apply(plan.operationId, plan.confirmationToken)).rejects.toMatchObject({ code: 'OPERATION_EXPIRED' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('bloqueia a operação quando o preflight detecta conflito', async () => {
    const service = new OperationService(60_000, logger)
    const execute = vi.fn()
    const plan = await service.prepare({
      module: 'tfs', action: 'update', target: '1', summary: 'Editar', diff: [],
      preflight: vi.fn().mockRejectedValue(Object.assign(new Error('mudou'), { code: 'CONFLICT', name: 'AppError' })), execute,
    })

    await expect(service.apply(plan.operationId, plan.confirmationToken)).rejects.toBeDefined()
    expect(execute).not.toHaveBeenCalled()
  })

  it('cancela um plano e impede sua aplicação', async () => {
    const service = new OperationService(60_000, logger)
    const execute = vi.fn()
    const plan = await service.prepare({ module: 'tfs', action: 'create', target: 'new', summary: 'Criar', diff: [], preflight: vi.fn(), execute })
    expect((await service.cancel(plan.operationId)).state).toBe('cancelled')
    await expect(service.apply(plan.operationId, plan.confirmationToken)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('impede duas aplicações concorrentes do mesmo plano', async () => {
    let release = (): void => undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    const service = new OperationService(60_000, logger)
    const execute = vi.fn(async () => { await gate; return { id: 1 } })
    const plan = await service.prepare({ module: 'wordpress', action: 'update', target: 'post:1', summary: 'Editar', diff: [], preflight: vi.fn(), execute })

    const first = service.apply(plan.operationId, plan.confirmationToken)
    await expect(service.apply(plan.operationId, plan.confirmationToken)).rejects.toMatchObject({ code: 'CONFLICT' })
    release()
    await expect(first).resolves.toMatchObject({ state: 'applied' })
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
