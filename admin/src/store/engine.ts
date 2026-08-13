import { create } from 'zustand'
import { engineApi } from '../services/api'
import type { EngineSettings } from '../types'

type EngineState = {
  ready: boolean
  settings: EngineSettings | null
  loading: boolean
  error: string | null
  checkReady: () => Promise<void>
  loadSettings: () => Promise<void>
  saveSettings: (body: { model_base_url: string; model_name_default: string; model_api_key?: string }) => Promise<void>
}

export const useEngine = create<EngineState>((set) => ({
  ready: false,
  settings: null,
  loading: false,
  error: null,

  checkReady: async () => {
    try {
      const data = await engineApi.getReady()
      set({ ready: data.ready, error: null })
    } catch (e) {
      set({ ready: false, error: String(e) })
    }
  },

  loadSettings: async () => {
    set({ loading: true })
    try {
      const data = await engineApi.getSettings()
      set({ settings: data, loading: false, error: null })
    } catch (e) {
      set({ loading: false, error: String(e) })
    }
  },

  saveSettings: async (body) => {
    set({ loading: true })
    try {
      const data = await engineApi.saveSettings(body)
      set({ settings: data, loading: false, error: null })
    } catch (e) {
      set({ loading: false, error: String(e) })
      throw e
    }
  },
}))
