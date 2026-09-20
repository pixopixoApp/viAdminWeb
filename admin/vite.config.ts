import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const adminDir = dirname(fileURLToPath(import.meta.url))
const playerDir = resolve(adminDir, '../player')

const playerMimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.task': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
}

function servePlayerAssets() {
  const install = (server: { middlewares: { use: (handler: (request: { url?: string }, response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: Uint8Array | string) => void }, next: () => void) => void) => void } }) => {
    server.middlewares.use(async (request, response, next) => {
      const requestUrl = request.url || ''
      if (!requestUrl.startsWith('/player/')) {
        next()
        return
      }
      const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname)
      const relativePath = pathname.slice('/player/'.length) || 'index.html'
      const candidate = resolve(playerDir, relativePath)
      if (candidate !== playerDir && !candidate.startsWith(`${playerDir}${sep}`)) {
        response.statusCode = 403
        response.end('Forbidden')
        return
      }
      try {
        const metadata = await stat(candidate)
        const target = metadata.isDirectory() ? resolve(candidate, 'index.html') : candidate
        const body = await readFile(target)
        response.statusCode = 200
        response.setHeader('Content-Type', playerMimeTypes[extname(target)] || 'application/octet-stream')
        response.setHeader('Cache-Control', 'no-store')
        response.end(body)
      } catch {
        next()
      }
    })
  }
  return {
    name: 'pixo-player-assets',
    configureServer: install,
    configurePreviewServer: install,
  }
}

export default defineConfig({
  plugins: [react(), servePlayerAssets()],
  server: {
    port: 5173,
    proxy: {
      // 本地联调可用 IVADMIN_API_PROXY 指向任意后端（默认本机 ivadmin 8000 端口）
      '/api': process.env.IVADMIN_API_PROXY || 'http://127.0.0.1:8000',
    },
  },
})
