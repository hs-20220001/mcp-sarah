import type { CallToolResult } from '@modelcontextprotocol/server'
import { normalizeError } from './errors.js'

export function successResult(message: string, data: object): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: data,
  }
}

export function errorResult(error: unknown): CallToolResult {
  const normalized = normalizeError(error)
  const data = {
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
    },
  }
  return {
    isError: true,
    content: [{ type: 'text', text: `${normalized.code}: ${normalized.message}` }],
    structuredContent: data,
  }
}

export async function safeToolCall(action: () => Promise<CallToolResult> | CallToolResult): Promise<CallToolResult> {
  try {
    return await action()
  } catch (error) {
    return errorResult(error)
  }
}
