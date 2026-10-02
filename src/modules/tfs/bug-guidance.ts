import { AppError } from '../../core/errors.js'
import { resolveCustomFields, type TfsPolicy } from './policy.js'

// Size → complexity → uncertainty, each indexed by its Sarah level (1–3).
export const bugEffortMatrix = [
  [[1, 2, 5], [2, 5, 8], [5, 8, 20]],
  [[3, 8, 8], [8, 13, 20], [13, 20, 20]],
  [[8, 13, 20], [13, 20, 20], [20, 20, 20]],
] as const

export function bugEffort(size: number, complexity: number, uncertainty: number): number {
  const effort = bugEffortMatrix[size - 1]?.[complexity - 1]?.[uncertainty - 1]
  if (effort === undefined) throw new AppError('POLICY_DENIED', 'Tamanho, Complexidade e Incerteza devem usar níveis 1, 2 ou 3 para estimar Effort.')
  return effort
}

type CustomFields = Record<string, string | number | boolean | null>

export function withBugEffort(policy: TfsPolicy, input: CustomFields, current: Record<string, unknown> = {}): CustomFields {
  const dimensions = ['size', 'complexity', 'uncertainty'] as const
  if (!dimensions.some(alias => input[alias] !== undefined)) return input
  const knownCurrent: CustomFields = {}
  for (const alias of dimensions) {
    const value = current[alias]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) knownCurrent[alias] = value
  }
  const merged = { ...knownCurrent, ...input }
  if (dimensions.some(alias => merged[alias] === undefined || merged[alias] === null)) {
    throw new AppError('POLICY_DENIED', 'Informe Tamanho, Complexidade e Incerteza antes de propor a alteração das estimativas do Bug e de Effort.')
  }
  const resolved = resolveCustomFields(policy, Object.fromEntries(dimensions.map(alias => [alias, merged[alias] ?? null])), 'Bug')
  const levels = dimensions.map(alias => {
    const options = policy.customFields[alias]?.values
    const referenceName = policy.customFields[alias]?.referenceName
    const entry = Object.entries(options ?? {}).find(([, label]) => label === resolved[referenceName ?? ''])
    return Number(entry?.[0])
  })
  const effort = bugEffort(levels[0] ?? NaN, levels[1] ?? NaN, levels[2] ?? NaN)
  if (input.effort !== undefined && input.effort !== effort) {
    throw new AppError('POLICY_DENIED', `A combinação de Tamanho, Complexidade e Incerteza corresponde a Effort ${effort}. Revise a proposta antes de preparar o Bug.`)
  }
  return { ...input, effort }
}

const effortReference = bugEffortMatrix.flatMap((complexities, size) => complexities.map((efforts, complexity) => `${size + 1}/${complexity + 1}: ${efforts.join(',')}`)).join('; ')

export const bugContextGuidance = 'Antes de propor um Bug, pesquise títulos existentes com tfs_search_work_items usando palavras do sistema e variações do nome, consulte detalhes com tfs_get_work_item e preserve exatamente o prefixo entre colchetes já usado, inclusive abreviações, espaços e pontuação (ex.: [TRIAGEM INT. E CIR.]). Nunca afirme que há um padrão sem exemplos encontrados; se não achar, proponha um prefixo novo fundamentado no nome conhecido. Se o sistema for desconhecido ou houver padrões concorrentes, peça decisão. Consulte tfs_list_classifications para areas e iterations, aprofundando depth até encontrar o caminho completo; busque Features candidatas pelo sistema/assunto, leia o pai e sua ancestralidade até o Epic. A hierarquia é Epic → Feature → Product Backlog Item ou Bug → Task; PBI e Bug são irmãos, Bug não é filho de PBI. Todo novo Bug precisa de parentId de Feature real, areaPath e iterationPath reais. Use localização do pai e itens semelhantes como candidatos, não copie automaticamente uma sprint antiga nem escolha apenas o item mais recente. Apresente ID, título, tipo, caminhos e evidências breves; se houver ambiguidade ou nenhum pai adequado, apresente candidatos e pergunte, sem inventar valores nem criar pais silenciosamente. Use snapshots/paginação quando necessário; não invente estados.'

export const bugCreationGuidance = `Para novo Bug, use título "[Sistema] <descrição objetiva>" com o prefixo pesquisado (ex.: [AIH] Corrigir envio dos dias de UTI e identificação de hospital dia). Em fields.description (Steps to Reproduce), registre problema, comportamento observado e esperado apenas quando conhecidos; passos, ambiente e evidências somente se fornecidos. Não invente causa técnica, impacto, dados ou solução. Proponha acceptanceCriteria curtos e verificáveis baseados no relato; omita se o contexto não os sustentar. customFields.activity é Development por padrão, salvo outra opção fundamentada no pedido. Estime size, complexity e uncertainty com níveis 1–3, justificativa breve e lacunas explícitas; informação ausente não prova baixa incerteza. Effort é pontuação, não horas, e deriva da matriz do referencial: para cada par tamanho/complexidade, os três valores são Incerteza 1,2,3: ${effortReference}. Mostre todas as estimativas e Effort antes da preparação; a ferramenta calcula o Effort correspondente quando recebe as dimensões e rejeita divergência explícita. Não invente responsável, prioridade ou severidade: diferencie informado, estimado, padrão verificado e não informado. ${bugContextGuidance}`

export const bugTaskGuidance = 'Na criação de Bug, sugira somente uma Task opcional de Testes, type="Task", customFields.activity="Testing", título "Testes - <título reduzido do Bug>"; o sufixo usa apenas palavras do título do Bug na mesma ordem, preservando o prefixo do sistema quando usado, sem adicionar palavras/preposições e sem ficar maior que o título do Bug. Descreva validações apenas com base no relato e nos critérios de aceite. O usuário pode aprovar somente o Bug ou Bug + Task. Crie o Bug primeiro e use seu ID real como parentId da Task; cada criação é uma operação separada, sem atomicidade. Responsável, área e iteração ausentes da Task herdam valores existentes do Bug pai, com revisão protegida; valores explícitos prevalecem. Antes de sugerir Testes para Bug existente, consulte relações e Tasks filhas para não duplicar; não sugira as quatro Tasks padrão de PBI para Bug. Se a Task falhar, informe que o Bug foi criado e a Task não.'

export const bugApprovalGuidance = 'Para criação e edição de Bug e sua Task de Testes, apresente proposta estruturada (campo, valor proposto, origem/justificativa; na edição, também valor atual), incluindo título, descrição, critérios de aceite, Activity, estimativas/Effort, área, iteração, pai, responsável, prioridade/severidade e campos não informados. Ao final, pergunte: "Confirma esta proposta ou deseja alterar algum valor? Deseja incluir a Task de Testes?" Aguarde aprovação explícita do usuário antes de aplicar qualquer escrita desse fluxo, mesmo com MCP_REQUIRE_CONFIRMATION=false; nesse modo a aprovação é conversacional, sem exigir a palavra literal CONFIRMO. A aprovação da proposta não substitui token/preflight nem aprova mudanças adicionais. Prepare os planos, confira o diff contra a proposta aprovada e peça nova aprovação se houver mudanças materiais; não aplique silenciosamente valores extras.'

export const bugUpdateGuidance = 'Ao editar Bug, consulte o item atual e altere somente os campos solicitados/aprovados. Não normalize título, descrição, Activity, estimativas, área, iteração ou pai indiscriminadamente. Sugira adequação ao padrão apenas quando solicitada ou necessária, explique o motivo e apresente antes/depois para aprovação. Preserve a relação pai existente em edições não relacionadas; se estiver ausente/incompatível, sinalize e proponha correção, sem migração silenciosa. Pesquise prefixos e classificações quando for propor mudança desses campos. Ao alterar Tamanho, Complexidade ou Incerteza, use os valores atuais das outras dimensões, apresente Effort recalculado e peça aprovação; se faltar dimensão, pergunte em vez de inventar. A edição não cria Task automaticamente.'