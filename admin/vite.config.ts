import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 本地联调可用 IVADMIN_API_PROXY 指向任意后端（默认本机 ivadmin 8000 端口）
      '/api': process.env.IVADMIN_API_PROXY || 'http://127.0.0.1:8000',
    },
  },
})
