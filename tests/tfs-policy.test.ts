import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertParentType, loadTfsPolicy, resolveCustomFields } from '../src/modules/tfs/policy.js'

describe('TFS policy', () => {
  it('mapeia aliases Sarah para reference names e rótulos', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    expect(resolveCustomFields(policy, { size: 1, effort: 8 })).toEqual({
      'Sarah.Tamanho': '1 - Mínimo',
      'Microsoft.VSTS.Scheduling.Effort': 8,
    })
  })

  it('rejeita campos não autorizados', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    expect(() => resolveCustomFields(policy, { unknown: 'x' })).toThrow(/não está permitido/)
  })

  it('valida a hierarquia configurada sem inventar relações', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    expect(() => assertParentType(policy, 'Task', 'Product Backlog Item')).not.toThrow()
    expect(() => assertParentType(policy, 'Feature', 'Task')).toThrow(/não pode ter/)
  })
})
