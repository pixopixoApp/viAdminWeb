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

export function uploadBinary<T>(
  path: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', path)
    request.withCredentials = true
    request.setRequestHeader('Content-Type', 'application/zip')
    const token = getToken()
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))))
      }
    }
    request.onerror = () => reject(new Error('ZIP 上传网络连接失败'))
    request.onabort = () => reject(new Error('ZIP 上传已取消'))
    request.onload = () => {
      if (request.status === 401) {
        clearToken()
        window.location.href = '/login'
      }
      let body: unknown
      try {
        body = JSON.parse(request.responseText)
      } catch {
        body = null
      }
      if (request.status < 200 || request.status >= 300) {
        const detail = body && typeof body === 'object' && 'detail' in body
          ? String((body as { detail?: unknown }).detail || '')
          : request.responseText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
        reject(new Error(detail || `ZIP 上传失败（HTTP ${request.status}）`))
        return
      }
      if (!body || typeof body !== 'object') {
        reject(new Error('服务器返回了无效的上传结果'))
        return
      }
      onProgress?.(100)
      resolve(body as T)
    }
    request.send(file)
  })
}

export function uploadLocalMedia<T>(
  path: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', path)
    request.withCredentials = true
    request.setRequestHeader('Content-Type', file.type || 'video/mp4')
    const token = getToken()
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))))
      }
    }
    request.onerror = () => reject(new Error('视频上传网络连接失败'))
    request.onabort = () => reject(new Error('视频上传已取消'))
    request.onload = () => {
      if (request.status === 401) {
        clearToken()
        window.location.href = '/login'
      }
      let body: unknown
      try {
        body = JSON.parse(request.responseText)
      } catch {
        body = null
      }
      if (request.status < 200 || request.status >= 300) {
        const detail = body && typeof body === 'object' && 'detail' in body
          ? String((body as { detail?: unknown }).detail || '')
          : request.responseText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
        reject(new Error(detail || `视频上传失败（HTTP ${request.status}）`))
        return
      }
      if (!body || typeof body !== 'object') {
        reject(new Error('服务器返回了无效的上传结果'))
        return
      }
      onProgress?.(100)
      resolve(body as T)
    }
    request.send(file)
  })
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
