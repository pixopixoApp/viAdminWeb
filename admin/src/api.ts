const TOKEN_KEY = 'ivadmin_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {})
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!(init.body instanceof FormData) && !headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  })
  if (response.status === 401) {
    clearToken()
    if (!path.includes('/auth/login')) {
      window.location.href = '/login'
    }
  }
  if (response.status === 403) {
    try {
      const data = await response.clone().json()
      if (data?.detail === 'must_change_password') {
        window.location.href = '/change-password'
      }
    } catch {
      /* ignore */
    }
  }
  if (!response.ok) {
    let detail = response.statusText
    try {
      const data = await response.json()
      detail = data.detail || JSON.stringify(data)
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function sha256Hex(file: Blob): Promise<string> {
  const bytes = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

export async function uploadToSignedOss(
  policy: { url: string; fields: Record<string, string> },
  file: File,
): Promise<void> {
  let uploadUrl: URL
  try {
    uploadUrl = new URL(policy.url)
  } catch {
    throw new Error('服务端返回了无效的 OSS 上传地址')
  }
  if (uploadUrl.protocol !== 'https:') {
    throw new Error('OSS 上传地址必须使用 HTTPS')
  }
  const body = new FormData()
  Object.entries(policy.fields).forEach(([name, value]) => body.append(name, value))
  // OSS PostObject requires the file part to be last.
  body.append('file', file, file.name)
  const response = await fetch(uploadUrl.toString(), {
    method: 'POST',
    body,
    credentials: 'omit',
  })
  // A retry after OSS accepted the body can receive 409 because every ingress
  // key is immutable. Finalization still verifies the exact size and SHA-256,
  // so this is safe to treat as an idempotent upload result.
  if (![200, 201, 204, 409].includes(response.status)) {
    throw new Error(`OSS 上传失败（HTTP ${response.status}）`)
  }
}
