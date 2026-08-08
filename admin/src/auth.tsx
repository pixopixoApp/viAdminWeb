import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, clearToken, getToken } from './api'

export type Me = {
  id: number
  username: string
  display_name: string
  role: string
  status: string
  must_change_password: boolean
}

type AuthState = {
  me: Me | null
  loading: boolean
  refresh: () => Promise<Me | null>
  setMe: (me: Me | null) => void
  hasRole: (...roles: string[]) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(Boolean(getToken()))

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null)
      setLoading(false)
      return null
    }
    setLoading(true)
    try {
      const data = await api<Me>('/api/v1/auth/me')
      setMe(data)
      return data
    } catch {
      setMe(null)
      clearToken()
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<AuthState>(
    () => ({
      me,
      loading,
      refresh,
      setMe,
      hasRole: (...roles: string[]) => Boolean(me && roles.includes(me.role)),
    }),
    [me, loading, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
