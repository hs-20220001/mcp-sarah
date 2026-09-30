import { open, readFile, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod/v4'
import { AppError } from '../../core/errors.js'

const wordpressPolicySchema = z.object({
  allowedPageRootIds: z.array(z.number().int().positive()),
  allowedPostCategoryIds: z.array(z.number().int().positive()),
  allowedMenuIds: z.array(z.number().int().positive()).default([]),
  allowedStatuses: z.array(z.enum(['draft', 'pending', 'private', 'publish', 'future'])).min(1),
  allowedMediaMimeTypes: z.array(z.string().min(1)).min(1),
  maxMediaBytes: z.number().int().positive(),
})

export type WordPressPolicy = z.infer<typeof wordpressPolicySchema>

const mimeByExtension: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
}

async function detectMimeType(path: string): Promise<string | undefined> {
  const handle = await open(path, 'r')
  try {
    const signature = Buffer.alloc(12)
    const { bytesRead } = await handle.read(signature, 0, signature.length, 0)
    const bytes = signature.subarray(0, bytesRead)
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
    if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif'
    if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
    if (bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf'
    return undefined
  } finally {
    await handle.close()
  }
}

export async function loadWordPressPolicy(path: string): Promise<WordPressPolicy> {
  const source = await readFile(path, 'utf8')
  return wordpressPolicySchema.parse(parse(source))
}

export function assertStatus(policy: WordPressPolicy, status: string | undefined): void {
  if (status && !policy.allowedStatuses.includes(status as WordPressPolicy['allowedStatuses'][number])) {
    throw new AppError('POLICY_DENIED', `O status WordPress '${status}' não é permitido.`)
  }
}

export async function inspectMediaPath(path: string, allowedRoots: string[], policy: WordPressPolicy): Promise<{ path: string; size: number; mimeType: string }> {
  const resolvedFile = await realpath(resolve(path)).catch(() => { throw new AppError('NOT_FOUND', 'Arquivo de mídia não encontrado.') })
  const resolvedRoots = await Promise.all(allowedRoots.map(async root => realpath(root).catch(() => resolve(root))))
  const allowed = resolvedRoots.length === 0 || resolvedRoots.some(root => {
    const pathFromRoot = relative(root, resolvedFile)
    return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot))
  })
  if (!allowed) throw new AppError('POLICY_DENIED', 'O arquivo está fora das raízes de mídia autorizadas.')
  const fileStat = await stat(resolvedFile)
  if (!fileStat.isFile()) throw new AppError('POLICY_DENIED', 'O caminho de mídia precisa apontar para um arquivo.')
  if (fileStat.size > policy.maxMediaBytes) throw new AppError('POLICY_DENIED', `O arquivo excede o limite de ${policy.maxMediaBytes} bytes.`)
  const extensionMimeType = mimeByExtension[extname(resolvedFile).toLocaleLowerCase()]
  const mimeType = await detectMimeType(resolvedFile)
  if (!mimeType || mimeType !== extensionMimeType || !policy.allowedMediaMimeTypes.includes(mimeType)) {
    throw new AppError('POLICY_DENIED', 'O tipo real da mídia não corresponde a um formato permitido.')
  }
  return { path: resolvedFile, size: fileStat.size, mimeType }
}
