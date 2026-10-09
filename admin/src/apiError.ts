export const SERVICE_BUSY_MESSAGE = '当前服务繁忙，请稍后重试'
export const UPLOAD_STORAGE_FULL_MESSAGE = '服务器上传空间不足，请联系管理员清理后重试'

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

export function createUploadStorageError(): ApiError {
  return new ApiError(UPLOAD_STORAGE_FULL_MESSAGE, 507)
}

export function createServerError(status: number): ApiError {
  return status === 507
    ? createUploadStorageError()
    : createServiceUnavailableError(status)
}

export function isServiceUnavailableError(error: unknown): boolean {
  return error instanceof ApiError && error.serviceUnavailable
}

export function shouldInvalidateSession(status: number): boolean {
  return status === 401
}
