import { Button, Modal, Space, Typography, Image, message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RunDetail } from '../../types/run'
import { runsApi } from '../../services/api'
import { useAuthorizedImageUrl } from '../../hooks/useAuthorizedImageUrl'

type Props = {
  open: boolean
  run: RunDetail['run']
  onClose: () => void
  onSaved: (coverMediaObjectId: string | undefined, coverUrl: string | undefined) => void
}

const COVER_INTERVAL_MS = 500
const MAX_COVER = 40

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',')
  const mime = /data:(.*?);/.exec(head)?.[1] || 'image/jpeg'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** 单个封面候选图：对带鉴权的相对 API 路径用 token 拉取后再展示。 */
function CoverCandidate({ src }: { src: string }) {
  const displayUrl = useAuthorizedImageUrl(src)
  if (!displayUrl) return null
  return (
    <Image src={displayUrl} preview={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  )
}

export default function RunDetailCoverModal({ open, run, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [localCandidates, setLocalCandidates] = useState<string[]>([])

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const timeRef = useRef(0)

  // 已持久化的候选封面 URL 列表（后端存 JSON 字符串数组）
  let persisted: string[] = []
  try {
    const parsed = JSON.parse(run.cover_candidates_json || '[]')
    if (Array.isArray(parsed)) persisted = parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    persisted = []
  }

  const currentUrl = run.cover_url || ''
  const list = localCandidates.length > 0 ? localCandidates : persisted

  const stopExtract = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const captureFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return
    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 180
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    setLocalCandidates((prev) => {
      if (prev.length >= MAX_COVER) return prev
      return [...prev, canvas.toDataURL('image/jpeg', 0.7)]
    })
  }, [])

  const startExtract = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    stopExtract()
    setLocalCandidates([])
    setExtracting(true)
    timeRef.current = 0
    video.pause()
    const begin = () => {
      video.play().catch(() => undefined)
      try {
        const limit = Math.min(video.duration || 20, (MAX_COVER * COVER_INTERVAL_MS) / 1000)
        captureFrame()
        timeRef.current = COVER_INTERVAL_MS / 1000
        video.currentTime = timeRef.current
        timerRef.current = window.setInterval(() => {
          if (video.ended || video.currentTime > limit || !video.currentTime) {
            stopExtract()
            video.pause()
            setExtracting(false)
            return
          }
          captureFrame()
          timeRef.current += COVER_INTERVAL_MS / 1000
          try {
            video.currentTime = Math.min(timeRef.current, video.duration || limit)
          } catch {
            /* ignore */
          }
        }, COVER_INTERVAL_MS)
      } catch {
        setExtracting(false)
      }
    }
    video.addEventListener('seeked', begin, { once: true })
    video.currentTime = 0
  }, [captureFrame, stopExtract])

  useEffect(() => {
    // 打开时若没有任何持久化候选，自动重新抽帧
    if (open && persisted.length === 0 && videoRef.current) {
      const t = window.setTimeout(() => startExtract(), 400)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [open, persisted.length, startExtract])

  useEffect(() => {
    if (!open) {
      stopExtract()
      setExtracting(false)
      setLocalCandidates([])
    }
  }, [open, stopExtract])

  const handlePickDataUrl = async (dataUrl: string) => {
    if (!dataUrl.startsWith('data:')) return
    setSaving(true)
    try {
      // 把本次抽帧的所有候选都上传，收集 URL；选中的作为当前封面
      const uploaded: { media_object_id: string; cover_url: string }[] = []
      for (const src of localCandidates) {
        const blob = dataUrlToBlob(src)
        const f = new File([blob], 'cover.jpg', { type: 'image/jpeg' })
        uploaded.push(await runsApi.uploadCover(f))
      }
      const idx = localCandidates.indexOf(dataUrl)
      const mediaObjectId = idx >= 0 ? uploaded[idx]?.media_object_id : uploaded[0]?.media_object_id
      const coverCandidatesJson = JSON.stringify(uploaded.map((u) => u.cover_url))
      await runsApi.updateRunCover(run.id, {
        cover_media_object_id: mediaObjectId || undefined,
        cover_candidates_json: coverCandidatesJson,
      })
      onSaved(mediaObjectId || undefined, uploaded[idx]?.cover_url || uploaded[0]?.cover_url)
      message.success('封面已更新')
      onClose()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新封面失败')
    } finally {
      setSaving(false)
    }
  }

  const handlePickPersisted = async (coverUrl: string) => {
    setSaving(true)
    try {
      const sha = coverUrl.split('/').pop() || ''
      await runsApi.updateRunCover(run.id, {
        cover_media_object_id: sha || undefined,
        cover_candidates_json: run.cover_candidates_json || '',
      })
      onSaved(sha || undefined, coverUrl)
      message.success('封面已更新')
      onClose()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新封面失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="编辑封面" open={open} onCancel={onClose} width={640} footer={null}>
      <video
        ref={videoRef}
        src={`/api/v1/runs/${run.id}/media/video`}
        muted
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        style={{ display: 'none' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <Space style={{ marginBottom: 12, display: 'flex' }}>
        <Button size="small" loading={extracting || saving} onClick={() => startExtract()}>
          重新抽帧
        </Button>
        {extracting ? <Typography.Text type="secondary">正在抽帧…</Typography.Text> : null}
      </Space>

      {list.length === 0 ? (
        <Typography.Text type="secondary">暂无候选封面，点击"重新抽帧"从视频抽取。</Typography.Text>
      ) : (
        <>
          <Typography.Paragraph type="secondary">
            从抽帧候选中选择一张作为封面（点击"重新抽帧"可重新抽取）
          </Typography.Paragraph>
          <div className="upload-cover-scroll is-portrait" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {list.map((src, i) => (
              <div
                key={i}
                className={`upload-cover-cell${currentUrl === src ? ' is-selected' : ''}`}
                onClick={() => !saving && void (src.startsWith('data:') ? handlePickDataUrl(src) : handlePickPersisted(src))}
                style={{ width: 96, aspectRatio: '9 / 16', flex: '0 0 auto' }}
              >
                <CoverCandidate src={src} />
                {currentUrl === src ? <span className="upload-cover-check">✓</span> : null}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}
