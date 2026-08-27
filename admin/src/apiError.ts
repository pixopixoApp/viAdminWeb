export const SERVICE_BUSY_MESSAGE = '当前服务繁忙，请稍后重试'

export class ApiError extends Error {
  readonly status: number | null
  readonly serviceUnavailable: boolean

  constructor(
    message: string,
    status: number | null = null,
    serviceUnavailable = false,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.serviceUnavailable = serviceUnavailable
  }
}

export function createServiceUnavailableError(status: number | null = null): ApiError {
  return new ApiError(SERVICE_BUSY_MESSAGE, status, true)
}

export function isServiceUnavailableError(error: unknown): boolean {
  return error instanceof ApiError && error.serviceUnavailable
}

export function shouldInvalidateSession(status: number): boolean {
  return status === 401
}
