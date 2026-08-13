import { create } from 'zustand'
import { api, clearToken, getToken } from '../api'

export type Me = {
  id: number
  username: string
  display_name: string
  role: string
  status: string
  must_change_password: boolean
}

export type UserRole = 'admin' | 'manager' | 'operator'

type AuthState = {
  me: Me | null
  loading: boolean
  refresh: () => Promise<Me | null>
  setMe: (me: Me | null) => void
  hasRole: (...roles: string[]) => boolean
}

export const useAuth = create<AuthState>((set, get) => ({
  me: null,
  loading: Boolean(getToken()),

  refresh: async () => {
    if (!getToken()) {
      set({ me: null, loading: false })
      return null
    }
    set({ loading: true })
    try {
      const data = await api<Me>('/api/v1/auth/me')
      set({ me: data, loading: false })
      return data
    } catch {
      clearToken()
      set({ me: null, loading: false })
      return null
    }
  },

  setMe: (me) => set({ me }),

  hasRole: (...roles) => {
    const { me } = get()
    return Boolean(me && roles.includes(me.role))
  },
}))
