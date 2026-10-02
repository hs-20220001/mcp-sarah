import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { bugCreationGuidance, bugEffort, withBugEffort } from '../src/modules/tfs/bug-guidance.js'
import { loadTfsPolicy, type TfsPolicy } from '../src/modules/tfs/policy.js'

// Independent transcription of the supplied image: size, complexity, uncertainty, score.
const reference = [
  [1, 1, 1, 1], [1, 1, 2, 2], [1, 1, 3, 5],
  [1, 2, 1, 2], [1, 2, 2, 5], [1, 2, 3, 8],
  [1, 3, 1, 5], [1, 3, 2, 8], [1, 3, 3, 20],
  [2, 1, 1, 3], [2, 1, 2, 8], [2, 1, 3, 8],
  [2, 2, 1, 8], [2, 2, 2, 13], [2, 2, 3, 20],
  [2, 3, 1, 13], [2, 3, 2, 20], [2, 3, 3, 20],
  [3, 1, 1, 8], [3, 1, 2, 13], [3, 1, 3, 20],
  [3, 2, 1, 13], [3, 2, 2, 20], [3, 2, 3, 20],
  [3, 3, 1, 20], [3, 3, 2, 20], [3, 3, 3, 20],
] as const

describe('Referência de esforço para Bug', () => {
  let policy: TfsPolicy
  beforeAll(async () => { policy = await loadTfsPolicy(resolve('config/tfs-sarah.yaml')) })

  it.each(reference)('combinação %i/%i/%i corresponde a %i pontos', (size, complexity, uncertainty, effort) => {
    expect(bugEffort(size, complexity, uncertainty)).toBe(effort)
    expect(withBugEffort(policy, { size, complexity, uncertainty })).toEqual({ size, complexity, uncertainty, effort })
  })

  it('mantém documento e orientação MCP alinhados às 27 combinações', async () => {
    const document = await readFile(resolve('docs/integrations/tfs-effort-reference.md'), 'utf8')
    const rows = document.split(/\r?\n/).filter(line => /^\| [123] \| [123] \| [123] \|/.test(line))
    expect(rows).toHaveLength(27)
    for (const [size, complexity, uncertainty, effort] of reference) {
      expect(rows).toContain(`| ${size} | ${complexity} | ${uncertainty} | ${effort} |`)
    }
    expect(bugCreationGuidance).toContain('1/3: 5,8,20')
    expect(bugCreationGuidance).toContain('2/1: 3,8,8')
    expect(bugCreationGuidance).toContain('3/3: 20,20,20')
  })

  it('aceita rótulos e códigos e recalcula usando as dimensões atuais sem copiá-las para a edição', () => {
    expect(withBugEffort(policy, { size: '2 - Médio', complexity: '1', uncertainty: '1 - Baixa', effort: 3 }).effort).toBe(3)
    expect(withBugEffort(policy, { complexity: '2 - Moderada' }, { size: '2 - Médio', complexity: '1 - Baixa', uncertainty: '1 - Baixa', effort: 3 })).toEqual({ complexity: '2 - Moderada', effort: 8 })
    expect(withBugEffort(policy, { activity: 'Testing' }, { size: 2, complexity: 1, uncertainty: 1, effort: 99 })).toEqual({ activity: 'Testing' })
    expect(withBugEffort(policy, { effort: 5 })).toEqual({ effort: 5 })
  })

  it('bloqueia níveis inválidos, dimensões incompletas e Effort divergente', () => {
    expect(() => bugEffort(0, 1, 1)).toThrow(/níveis 1, 2 ou 3/)
    expect(() => bugEffort(1, 4, 1)).toThrow(/níveis 1, 2 ou 3/)
    expect(() => bugEffort(1, 1, 1.5)).toThrow(/níveis 1, 2 ou 3/)
    expect(() => withBugEffort(policy, { size: 2 })).toThrow(/Informe Tamanho/)
    expect(() => withBugEffort(policy, { size: null, complexity: 1, uncertainty: 1 })).toThrow(/Informe Tamanho/)
    expect(() => withBugEffort(policy, { size: 2 }, { complexity: {}, uncertainty: 1 })).toThrow(/Informe Tamanho/)
    expect(() => withBugEffort(policy, { size: 'desconhecido', complexity: 1, uncertainty: 1 })).toThrow(/Valores aceitos/)
    expect(() => withBugEffort(policy, { size: 2, complexity: 1, uncertainty: 1, effort: 20 })).toThrow(/corresponde a Effort 3/)
  })
})