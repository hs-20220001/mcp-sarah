import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertParentType, loadTfsPolicy, resolveCustomFields } from '../src/modules/tfs/policy.js'

describe('TFS policy', () => {
  it('mapeia aliases Sarah para reference names e rótulos', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    expect(resolveCustomFields(policy, { size: 1, effort: 8, priority: 2 })).toEqual({
      'Sarah.Tamanho': '1 - Mínimo',
      'Microsoft.VSTS.Scheduling.Effort': 8,
      'Microsoft.VSTS.Common.Priority': 2,
    })
  })

  it('converte e limita os valores disponíveis dos campos Planning', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    expect(resolveCustomFields(policy, {
      size: 3,
      complexity: 3,
      uncertainty: 3,
      strategicImpact: 3,
      tangibility: 3,
      urgency: 3,
    })).toEqual({
      'Sarah.Tamanho': '3 - Máximo',
      'Sarah.Complexidade': '3 - Alta',
      'Sarah.Incerteza': '3 - Alta',
      'Sarah.ImpactoEstrategico': '3 - Alto',
      'Sarah.Tangibilidade': '3 - Alta',
      'Sarah.Urgencia': '3 - Alta',
    })
    expect(resolveCustomFields(policy, { size: '2 - Médio' })).toEqual({ 'Sarah.Tamanho': '2 - Médio' })
    expect(() => resolveCustomFields(policy, { size: 4 })).toThrow(/Valores aceitos/)
  })

  it('mapeia Activity e valida os campos exclusivos de Task', async () => {
    const policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml'))
    expect(resolveCustomFields(policy, { activity: 'Testing', remainingWork: 4.5, blocked: true }, 'Task')).toEqual({
      'Microsoft.VSTS.Common.Activity': 'Testing',
      'Microsoft.VSTS.Scheduling.RemainingWork': 4.5,
      'Microsoft.VSTS.CMMI.Blocked': true,
    })
    expect(resolveCustomFields(policy, { activity: 'Documentation' }, 'Task')).toEqual({ 'Microsoft.VSTS.Common.Activity': 'Documentation' })
    expect(() => resolveCustomFields(policy, { activity: 'Invalid' }, 'Task')).toThrow(/Valores aceitos/)
    expect(() => resolveCustomFields(policy, { activity: 'Testing' }, 'Product Backlog Item')).toThrow(/só está permitido para: Task/)
    expect(() => resolveCustomFields(policy, { remainingWork: '4' }, 'Task')).toThrow(/tipo number/)
    expect(() => resolveCustomFields(policy, { blocked: 'true' }, 'Task')).toThrow(/tipo boolean/)
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
