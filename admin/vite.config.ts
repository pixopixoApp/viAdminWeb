import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const adminDir = dirname(fileURLToPath(import.meta.url))
const playerDir = resolve(adminDir, '../player')
const localEditorDemoId = '00000000-0000-4000-8000-000000000018'
const localEditorDemoVersion = '0.0.2'
const localEditorDemoApi = `/api/v1/runs/${localEditorDemoId}`
const localEditorDemoVideo = resolve(
  adminDir,
  '../../pixo-website-sustained-ranges/tests/fixtures/source.mp4',
)

type MiddlewareServer = {
  middlewares: {
    use: (
      handler: (
        request: IncomingMessage,
        response: ServerResponse,
        next: () => void,
      ) => void,
    ) => void
  }
}

function sendJson(response: ServerResponse, value: unknown, statusCode = 200) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(value))
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

function localEditorDemo() {
  let title = '持续交互时间范围演示'
  let note = '持续交互范围 UI 演示'
  let editing = true
  let timeline = {
    // Keep the authored timeline aligned with the bundled 2.416667 s fixture.
    // The client Runtime rejects multiple cues that all fall beyond media end.
    media: { duration_ms: 2_417, width: 720, height: 1280 },
    interactions: [
      {
        gesture: 'continuous_tap',
        gate_at_ms: 300,
        gate_end_ms: 900,
        hint: '持续点击以播放',
        pause_video: true,
      },
      {
        gesture: 'continuous_hold',
        gate_at_ms: 1_100,
        gate_end_ms: 1_700,
        hint: '按住屏幕以播放',
        pause_video: true,
      },
      {
        gesture: 'multi_tap',
        tap_count: 7,
        gate_at_ms: 2_050,
        hint: '连续点击 7 次',
        pause_video: true,
      },
    ],
  }

  const state = () => ({
    version: localEditorDemoVersion,
    label: `${localEditorDemoVersion}-编辑中`,
    editing,
    note,
    timeline,
  })
  const detail = () => ({
    run: {
      id: localEditorDemoId,
      status: 'ready',
      title,
      model_name: 'demo',
      analysis_version: localEditorDemoVersion,
      published_version: null,
    },
    media: {
      filename: 'sustained-range-demo.mp4',
      duration_ms: 2_417,
      width: 720,
      height: 1280,
    },
    analysis_refine: {},
    gameplay: {},
    version_infos: [{
      version: localEditorDemoVersion,
      label: `${localEditorDemoVersion}-编辑中`,
      kind: 'manual',
      note,
      editing,
    }],
  })

  const install = (server: MiddlewareServer) => {
    server.middlewares.use(async (request, response, next) => {
      const pathname = decodeURIComponent(
        new URL(request.url || '/', 'http://localhost').pathname,
      )
      const annotatePath = `${localEditorDemoApi}/annotate/${localEditorDemoVersion}`

      if (pathname === `${localEditorDemoApi}/media/video`) {
        try {
          const body = await readFile(localEditorDemoVideo)
          response.statusCode = 200
          response.setHeader('Content-Type', 'video/mp4')
          response.setHeader('Content-Length', String(body.length))
          response.setHeader('Cache-Control', 'no-store')
          response.end(body)
        } catch {
          response.statusCode = 404
          response.end('Demo video not found')
        }
        return
      }

      if (pathname === annotatePath && request.method === 'GET') {
        sendJson(response, state())
        return
      }
      if (pathname === annotatePath && request.method === 'PUT') {
        try {
          const body = await readJsonBody(request)
          if (body.timeline && typeof body.timeline === 'object') {
            timeline = body.timeline as typeof timeline
          }
          if (typeof body.note === 'string') note = body.note
          sendJson(response, state())
        } catch {
          sendJson(response, { detail: '演示数据格式无效' }, 400)
        }
        return
      }
      if (pathname === `${annotatePath}/finalize` && request.method === 'POST') {
        editing = false
        sendJson(response, { ok: true })
        return
      }
      if (pathname === localEditorDemoApi && request.method === 'PATCH') {
        try {
          const body = await readJsonBody(request)
          if (typeof body.title === 'string' && body.title.trim()) title = body.title.trim()
          sendJson(response, { title })
        } catch {
          sendJson(response, { detail: '演示数据格式无效' }, 400)
        }
        return
      }
      if (pathname === localEditorDemoApi && request.method === 'GET') {
        sendJson(response, detail())
        return
      }
      next()
    })
  }

  return {
    name: 'pixo-local-editor-demo',
    configureServer: install,
  }
}

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
  const install = (server: MiddlewareServer) => {
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
  plugins: [react(), localEditorDemo(), servePlayerAssets()],
  server: {
    port: 5173,
    proxy: {
      // 本地联调可用 IVADMIN_API_PROXY 指向任意后端（默认本机 ivadmin 8000 端口）
      '/api': process.env.IVADMIN_API_PROXY || 'http://127.0.0.1:8000',
    },
  },
})
