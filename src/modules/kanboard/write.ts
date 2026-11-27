import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod/v4'
import { AppError } from '../../core/errors.js'
import type { OperationService } from '../../core/operations.js'
import type { KanboardClient } from './client.js'

export const writeGuidance = 'Kanboard: jsonrpc (chave global) é somente leitura. Apenas a pedido de escrita e com login pessoal, prepare uma operação, mostre ao solicitante nome e login autenticados, tarefa, ação e conteúdo exato do diff; pergunte se autoriza essa escrita nessa identidade e aguarde sua resposta explícita. Mesmo com MCP_REQUIRE_CONFIRMATION=false, nunca preencha kanboardApproval sem essa aprovação. Mudança de alvo, conta ou conteúdo exige novo plano e nova aprovação.'
const fields = { taskId: z.int().positive(), field: z.enum(['comment', 'title', 'description']), value: z.string().max(100_000) }
export const approvalSchema = z.strictObject({ username: z.string().min(1).max(256), ...fields })
export const writeSchema = z.strictObject(fields).refine(v => v.field === 'description' || (!!v.value.trim() && (v.field !== 'title' || v.value.length <= 255)), 'Comentário/título não pode ser vazio e o título aceita até 255 caracteres.')

export async function prepareTaskWrite(kb: KanboardClient, operations: OperationService, args: z.output<typeof writeSchema>) {
  const actor = await kb.personalIdentity()
  const task = await kb.getTask(args.taskId)
  const { field, value } = args
  if (field !== 'comment' && (task[field] ?? '') === value) throw new AppError('POLICY_DENIED', 'O campo já contém o valor solicitado.')
  const summary = `${field === 'comment' ? 'Adicionar comentário' : field === 'title' ? 'Alterar título' : 'Alterar descrição'} na tarefa ${task.id} como ${actor.name ?? actor.username} (${actor.username}).`
  return operations.prepare({
    module: 'kanboard', action: field === 'comment' ? 'create_comment' : 'update_task', target: String(task.id), summary,
    requiredApproval: { username: actor.username, ...args },
    diff: [{ field: 'actor', after: actor }, { field: 'task', before: { id: task.id, title: task.title, projectId: task.projectId, url: task.url } },
      { field, ...(field === 'comment' ? {} : { before: task[field] }), after: value }],
    preflight: async () => {
      if (!isDeepStrictEqual(await kb.personalIdentity(), actor)) throw new AppError('POLICY_DENIED', 'A identidade Kanboard mudou. Prepare outra operação.')
      if (!isDeepStrictEqual(await kb.getTask(task.id), task)) throw new AppError('CONFLICT', 'A tarefa mudou. Revise o novo diff antes de escrever.')
    },
    execute: async () => {
      const commentId = field === 'comment' ? await kb.appendComment(task.id, actor.id, value) : undefined
      if (field !== 'comment') await kb.editTask(task.id, field, value)
      return { taskId: task.id, url: task.url, username: actor.username, ...(commentId ? { commentId } : {}) }
    },
  })
}