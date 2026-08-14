import { useEffect } from 'react'
import { useAuth as useAuthStore } from './store/auth'
import type { Me } from './store/auth'

export type { Me }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const refresh = useAuthStore((s) => s.refresh)
  useEffect(() => {
    void refresh()
  }, [refresh])
  return <>{children}</>
}

export function useAuth() {
  return useAuthStore()
}
