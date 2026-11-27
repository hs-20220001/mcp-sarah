import type { TfsConfig } from '../../core/config.js'
import { normalizeError } from '../../core/errors.js'
import type { TfsClient } from '../tfs/client.js'
import type { KanboardClient } from './client.js'

export const reportGuidance = 'Em leituras e relatórios de chamados Kanboard, use kanboard_report_tasks em lotes de até 10 IDs, inclusive para fechados. Apresente coluna/estado, últimas atividades nos dois sistemas, IDs, links e evidência. Distinga tag kid: exata de mera referência, preserve múltiplos itens e não atribua a um chamado o desfecho de outro. Para entender a evolução, consulte kanboard_list_task_comments, tfs_get_work_item, Tasks filhas e tfs_list_work_item_comments quando necessário. Sinalize divergências nos dois sentidos, buscas parciais e TFS indisponível. Datas diferentes não provam esquecimento; Done não comprova implantação. Relatório não autoriza preparar, sincronizar ou fechar nada.'

export type FindCandidates = TfsClient['findKanboardCandidates']
type Candidate = Awaited<ReturnType<FindCandidates>>['items'][number]

// Links são evidência textual. Nunca requisitar uma URL extraída de texto remoto.
function urls(text: string): URL[] {
  return Array.from(text.replace(/&amp;/gi, '&').matchAll(/https?:\/\/[^\s<>"'`\])]+/gi), ([raw]) => raw.replace(/[.,;]+$/, ''))
    .filter(raw => URL.canParse(raw)).map(raw => new URL(raw)).filter(u => !u.username && !u.password)
}

function positiveId(value: string | null | undefined) {
  return value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null
}

function workItemIds(text: string, base: URL) {
  return urls(text).flatMap(url => {
    if (url.origin !== base.origin) return []
    const path = url.pathname.toLowerCase(), prefix = base.pathname.toLowerCase()
    if (!path.startsWith(prefix)) return []
    const rest = path.slice(prefix.length)
    const id = positiveId(/^_workitems\/edit\/(\d+)\/?$/.exec(rest)?.[1] ?? (/^_workitems\/?$/.test(rest) ? url.searchParams.get('id') : null))
    return id ? [id] : []
  })
}

function cardIds(text: string, base: URL) {
  return urls(text).flatMap(url => {
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return []
    const path = url.pathname.slice(base.pathname.length)
    const id = positiveId(/^task\/(\d+)\/?$/.exec(path)?.[1] ?? (/^(?:index\.php)?$/.test(path) ? url.searchParams.get('task_id') : null))
    return id ? [id] : []
  })
}

type Card = Awaited<ReturnType<KanboardClient['getTask']>>
type Comments = Awaited<ReturnType<KanboardClient['listComments']>>
type CardSources = { card: Card; comments: Comments; commentsAvailable: boolean; descriptionIds: number[]; commentIds: number[] }

function activitySide(cardDate: string | null, itemDate: string | null) {
  const kb = Date.parse(cardDate ?? ''), tfs = Date.parse(itemDate ?? '')
  return !Number.isFinite(kb) || !Number.isFinite(tfs) ? null : kb === tfs ? 'same' : kb > tfs ? 'kanboard' : 'tfs'
}

function match(item: Candidate, source: CardSources, base: URL, lastActivityDate: string | null) {
  const id = source.card.id
  const tagged = item.tags.flatMap(tag => { const n = positiveId(/^kid:(\d+)$/i.exec(tag)?.[1]); return n ? [n] : [] })
  const evidence = [
    ...(tagged.includes(id) ? ['tfs.tag'] : []),
    ...(cardIds(item.description, base).includes(id) ? ['tfs.descriptionUrl'] : []),
    ...(cardIds(item.reproSteps, base).includes(id) ? ['tfs.reproUrl'] : []),
    ...(cardIds(item.acceptanceCriteria, base).includes(id) ? ['tfs.acceptanceUrl'] : []),
    ...(source.descriptionIds.includes(item.id) ? ['kanboard.descriptionUrl'] : []),
    ...(source.commentIds.includes(item.id) ? ['kanboard.commentUrl'] : []),
  ]
  if (!evidence.length) return []
  return [{ id: item.id, type: item.type, title: item.title, state: item.state, stateChangedDate: item.stateChangedDate, changedDate: item.changedDate, url: item.webUrl,
    linkKind: tagged.includes(id) ? 'integration_tag' : tagged.length ? 'other_task_reference' : 'url_reference',
    latestActivitySide: activitySide(lastActivityDate, item.changedDate), evidence, taggedTaskIds: tagged, parentId: item.parentId, childIds: item.childIds }]
}

export async function reportTasks(kb: KanboardClient, apiUrl: string, tfs: TfsConfig | undefined, find: FindCandidates, ids: number[]) {
  const kbBase = new URL('./', apiUrl)
  const tfsBase = tfs ? new URL(`${tfs.organizationUrl}/${encodeURIComponent(tfs.project)}/`) : null
  const sources: CardSources[] = []
  const unavailableTasks: { taskId: number; code: string }[] = []
  for (const taskId of new Set(ids)) {
    let card: Card
    try { card = await kb.getTask(taskId) } catch (error) { unavailableTasks.push({ taskId, code: normalizeError(error).code }); continue }
    let comments: Comments = [], commentsAvailable = true
    try { comments = await kb.listComments(taskId) } catch { commentsAvailable = false }
    sources.push({ card, comments, commentsAvailable, descriptionIds: tfsBase ? workItemIds(card.description ?? '', tfsBase) : [],
      commentIds: tfsBase ? comments.flatMap(c => workItemIds(c.text, tfsBase)) : [] })
  }
  const linked = [...new Set(sources.flatMap(s => [...s.descriptionIds, ...s.commentIds]))]
  let items: Candidate[] = [], limited = linked.length > 100, errorCode: string | null = tfs ? null : 'CONFIG_MISSING'
  if (tfs && sources.length) {
    try {
      const result = await find(sources.map(s => s.card.id), linked.slice(0, 100))
      items = result.items; limited ||= result.limited
    } catch (error) { errorCode = normalizeError(error).code }
  }
  const columns = new Map<number, string>()
  for (const projectId of new Set(sources.map(s => s.card.projectId))) {
    try { for (const c of await kb.listColumns(projectId)) columns.set(c.id, c.title) } catch { /* Manter o ID real mesmo sem permissão para listar colunas. */ }
  }
  return { checkedAt: new Date().toISOString(), unavailableTasks, tfsError: errorCode, limited, tasks: sources.map(source => {
    const { id, title, active, projectId, columnId, url, movedDate, changedDate, closedDate } = source.card
    const latestCommentDate = source.comments.flatMap(c => [c.changedDate, c.createdDate]).filter((v): v is string => !!v).sort().at(-1) ?? null
    const lastActivityDate = [latestCommentDate, changedDate, movedDate, closedDate].filter((v): v is string => !!v).sort().at(-1) ?? null
    const workItems = items.flatMap(item => match(item, source, kbBase, source.commentsAvailable ? lastActivityDate : null))
    const unresolvedIds = [...new Set([...source.descriptionIds, ...source.commentIds])].filter(id => !workItems.some(w => w.id === id))
    return { id, title, active, projectId, columnId, columnName: columns.get(columnId) ?? null, url, movedDate, changedDate, closedDate,
      commentCount: source.commentsAvailable ? source.comments.length : null,
      latestCommentDate, lastActivityDate,
      commentsAvailable: source.commentsAvailable, workItems, unresolvedIds,
      coverage: errorCode ? 'tfs_unavailable' : limited || !source.commentsAvailable || unresolvedIds.length ? 'partial' : workItems.length ? 'found' : 'not_found' }
  }) }
}