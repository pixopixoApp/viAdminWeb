import { create } from 'zustand'
import { api, getToken } from '../api'

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
  serviceUnavailable: boolean
  refresh: () => Promise<Me | null>
  setMe: (me: Me | null) => void
  hasRole: (...roles: string[]) => boolean
}

export const useAuth = create<AuthState>((set, get) => ({
  me: null,
  loading: Boolean(getToken()),
  serviceUnavailable: false,

  refresh: async () => {
    if (!getToken()) {
      set({ me: null, loading: false, serviceUnavailable: false })
      return null
    }
    set({ loading: true, serviceUnavailable: false })
    try {
      const data = await api<Me>('/api/v1/auth/me')
      set({ me: data, loading: false, serviceUnavailable: false })
      return data
    } catch {
      if (!getToken()) {
        set({ me: null, loading: false, serviceUnavailable: false })
        return null
      }
      set((state) => ({
        me: state.me,
        loading: false,
        serviceUnavailable: true,
      }))
      return null
    }
  },

  setMe: (me) => set({ me, serviceUnavailable: false }),

  hasRole: (...roles) => {
    const { me } = get()
    return Boolean(me && roles.includes(me.role))
  },
}))
