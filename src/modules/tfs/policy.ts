import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { z } from 'zod/v4'
import { AppError } from '../../core/errors.js'

const customFieldSchema = z.object({
  referenceName: z.string().min(1),
  values: z.record(z.string(), z.string()).optional(),
  allowedWorkItemTypes: z.array(z.string().min(1)).optional(),
  valueType: z.enum(['string', 'number', 'boolean']).optional(),
})

const tfsPolicySchema = z.object({
  profile: z.string().min(1),
  allowedWorkItemTypes: z.array(z.string().min(1)).min(1),
  descriptionFields: z.object({
    default: z.string().min(1),
  }).catchall(z.string().min(1)),
  allowedParentTypes: z.record(z.string(), z.array(z.string().min(1))),
  customFields: z.record(z.string(), customFieldSchema),
})

export type TfsPolicy = z.infer<typeof tfsPolicySchema>

export async function loadTfsPolicy(path: string): Promise<TfsPolicy> {
  const source = await readFile(path, 'utf8')
  return tfsPolicySchema.parse(parse(source))
}

export function assertWorkItemType(policy: TfsPolicy, type: string): void {
  if (!policy.allowedWorkItemTypes.includes(type)) {
    throw new AppError('POLICY_DENIED', `O tipo de work item '${type}' não é permitido pelo perfil ${policy.profile}.`)
  }
}

export function descriptionField(policy: TfsPolicy, type: string): string {
  return policy.descriptionFields[type] ?? policy.descriptionFields.default
}

export function assertParentType(policy: TfsPolicy, childType: string, parentType: string): void {
  const allowed = policy.allowedParentTypes[childType] ?? []
  if (!allowed.includes(parentType)) {
    throw new AppError('POLICY_DENIED', `Um item '${childType}' não pode ter '${parentType}' como pai no perfil ${policy.profile}.`)
  }
}

export function resolveCustomFields(policy: TfsPolicy, values: Record<string, string | number | boolean | null>, workItemType?: string): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [alias, value] of Object.entries(values)) {
    const field = policy.customFields[alias]
    if (!field) throw new AppError('POLICY_DENIED', `O campo customizado '${alias}' não está permitido no perfil.`)
    if (field.allowedWorkItemTypes && (!workItemType || !field.allowedWorkItemTypes.includes(workItemType))) {
      throw new AppError('POLICY_DENIED', `O campo '${alias}' só está permitido para: ${field.allowedWorkItemTypes.join(', ')}.`)
    }
    if (value !== null && field.valueType && typeof value !== field.valueType) {
      throw new AppError('POLICY_DENIED', `O campo '${alias}' deve receber um valor do tipo ${field.valueType}.`)
    }
    const mapped = value === null ? null : field.values?.[String(value)] ?? value
    if (field.values && value !== null && mapped === value && !Object.values(field.values).includes(String(value))) {
      throw new AppError('POLICY_DENIED', `O valor '${String(value)}' não é permitido para o campo '${alias}'. Valores aceitos: ${Object.values(field.values).join(', ')}.`)
    }
    resolved[field.referenceName] = mapped
  }
  return resolved
}
