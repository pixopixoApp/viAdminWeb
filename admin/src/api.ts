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
