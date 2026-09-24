export const errorCodes = [
  'CONFIG_MISSING',
  'AMBIGUOUS_REQUEST',
  'AUTH_FAILED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'POLICY_DENIED',
  'UPSTREAM_UNAVAILABLE',
  'OPERATION_EXPIRED',
] as const

export type ErrorCode = (typeof errorCodes)[number]

export class AppError extends Error {
  readonly code: ErrorCode
  readonly details: Record<string, unknown> | undefined

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }
}

export function mapHttpError(status: number): AppError {
  if (status === 401) return new AppError('AUTH_FAILED', 'Falha de autenticação no serviço externo.')
  if (status === 403) return new AppError('FORBIDDEN', 'A credencial não possui permissão para esta operação.')
  if (status === 404) return new AppError('NOT_FOUND', 'O recurso solicitado não foi encontrado.')
  if (status === 409 || status === 412) return new AppError('CONFLICT', 'O recurso foi alterado por outra operação.')
  if (status === 429) return new AppError('RATE_LIMITED', 'O serviço externo limitou temporariamente as requisições.')
  if (status >= 500) return new AppError('UPSTREAM_UNAVAILABLE', 'O serviço externo está indisponível.', { status })
  return new AppError('UPSTREAM_UNAVAILABLE', 'O serviço externo rejeitou a requisição.', { status })
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof Error) {
    return new AppError('UPSTREAM_UNAVAILABLE', 'A operação não pôde ser concluída.', {
      reason: error.name,
    })
  }
  return new AppError('UPSTREAM_UNAVAILABLE', 'A operação não pôde ser concluída.')
}
