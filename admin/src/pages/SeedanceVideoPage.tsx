import {
  DeleteOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { Button, Switch, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  cancelSeedanceTask,
  createSeedanceTask,
  deleteSeedanceTask,
  engineApi,
  listSeedanceModels,
  listSeedanceTasks,
  seedanceFileUrl,
  seedanceVideoUrl,
  uploadSeedanceVideo,
} from '../services/api'
import type { SeedanceImageInput, SeedanceModel, SeedanceTask } from '../types'
import UploadRunModal from '../components/run-list/UploadRunModal'

const MAX_VIDEO_BYTES = 200 * 1024 * 1024
const STATUS_TEXT: Record<SeedanceTask['status'], string> = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
  expired: '已过期',
}
const ACTIVE_STATUSES = new Set<SeedanceTask['status']>(['queued', 'running'])

type LocalImage = {
  data_url: string
  role: 'first_frame' | 'reference_image'
  name: string
}

type LocalVideo = {
  name: string
  blob: File
  file: string | null
  duration: number | null
  previewUrl: string
}

export default function SeedanceVideoPage() {
  const navigate = useNavigate()
  const [messageApi, contextHolder] = message.useMessage()

  const [models, setModels] = useState<SeedanceModel[]>([])
  const [model, setModel] = useState<SeedanceModel | null>(null)
  const [duration, setDuration] = useState(10)
  const [resolution, setResolution] = useState('720p')
  const [ratio, setRatio] = useState('16:9')
  const [generateAudio, setGenerateAudio] = useState(false)
  const [watermark, setWatermark] = useState(false)

  const [prompt, setPrompt] = useState('')
  const [images, setImages] = useState<LocalImage[]>([])
  const [videos, setVideos] = useState<LocalVideo[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [tasks, setTasks] = useState<SeedanceTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [engineModels, setEngineModels] = useState<string[]>([])
  const [engineReady, setEngineReady] = useState(true)

  const [mentionOpen, setMentionOpen] = useState(false)
  const [publishVideo, setPublishVideo] = useState<File | null>(null)
  const [publishTitle, setPublishTitle] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)

  const applyDefaultModel = useCallback((availableModels: SeedanceModel[]) => {
    const matched = availableModels[0] || null
    setModel(matched)
    if (matched) {
      if (!matched.durations.includes(duration)) setDuration(matched.durations[0])
      if (!matched.resolutions.includes(resolution)) setResolution(matched.resolutions[0])
      if (!matched.ratios.includes(ratio)) setRatio(matched.ratios[0])
    }
  }, [duration, ratio, resolution])

  const loadTasks = useCallback(async () => {
    try {
      const data = await listSeedanceTasks(100)
      setTasks(data.tasks)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载生成记录失败')
    } finally {
      setTasksLoading(false)
    }
  }, [messageApi])

  useEffect(() => {
    void (async () => {
      let availableModels: SeedanceModel[] = []
      try {
        const data = await listSeedanceModels()
        availableModels = data.models
        setModels(availableModels)
      } catch (err) {
        messageApi.error(err instanceof Error ? err.message : '加载模型目录失败')
      }
      applyDefaultModel(availableModels)
      await Promise.allSettled([loadTasks()])
      try {
        const [models, ready] = await Promise.all([
          engineApi.getModels(),
          engineApi.getReady(),
        ])
        setEngineModels(models.items.map((i) => i.id))
        setEngineReady(ready.ready)
      } catch {
        setEngineModels([])
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeTasks = useMemo(() => tasks.some((t) => ACTIVE_STATUSES.has(t.status)), [tasks])

  useEffect(() => {
    if (!activeTasks) return
    const timer = window.setInterval(() => void loadTasks(), 4000)
    return () => window.clearInterval(timer)
  }, [activeTasks, loadTasks])

  // ── 模型选择（仅本地状态，配置由服务端环境变量管理）──
  function selectModel(m: SeedanceModel) {
    setModel(m)
    setDuration(m.durations.includes(duration) ? duration : m.durations[0])
    setResolution(m.resolutions.includes(resolution) ? resolution : m.resolutions[0])
    setRatio(m.ratios.includes(ratio) ? ratio : m.ratios[0])
  }

  // ── 参考内容上传 ─────────────────────────────────
  function addMedia(file: File) {
    if (!model) {
      setError('模型尚未加载，请稍候再试')
      return
    }
    if (/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      addImage(file)
      return
    }
    if (/^video\/(mp4|quicktime|x-m4v)$/i.test(file.type) || /\.(mp4|mov)$/i.test(file.name || '')) {
      if (model.video.max === 0) {
        setError(`当前模型 ${model.label} 不支持参考视频，请上传图片`)
        return
      }
      addVideo(file)
      return
    }
    setError(`不支持的文件格式：${file.type || file.name}，请上传 PNG/JPG/WebP 图片或 MP4/MOV 视频`)
  }

  function addImage(file: File) {
    if (!model) {
      setError('模型尚未加载，请稍候再试')
      return
    }
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      setError(`不支持的图片格式：${file.type}，请上传 PNG/JPG/WebP`)
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(`图片 ${file.name} 超过 10MB`)
      return
    }
    const maxImages = model.provider === 'vidu' ? 1 : 10
    if (images.length >= maxImages) {
      setError(model.provider === 'vidu' ? 'Vidu 图生视频仅支持 1 张首帧图片' : '最多上传 10 张参考图')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setImages((current) => [
        ...current,
        {
          data_url: String(reader.result),
          role: model.provider === 'vidu' ? ('first_frame' as const) : ('reference_image' as const),
          name: file.name,
        },
      ])
      setError('')
    }
    reader.readAsDataURL(file)
  }

  function addVideo(file: File) {
    if (!model) {
      setError('模型尚未加载，请稍候再试')
      return
    }
    if (model.video.max === 0) {
      setError(`当前模型 ${model.label} 不支持参考视频`)
      return
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`视频 ${file.name} 超过 200MB`)
      return
    }
    if (videos.length >= model.video.max) {
      setError(`当前模型最多上传 ${model.video.max} 段参考视频`)
      return
    }
    const item: LocalVideo = {
      name: file.name,
      blob: file,
      file: null,
      duration: null,
      previewUrl: URL.createObjectURL(file),
    }
    setVideos((current) => [...current, item])
    setError('')

    const probe = document.createElement('video')
    const probeUrl = URL.createObjectURL(file)
    probe.preload = 'metadata'
    probe.muted = true
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(probeUrl)
      const dur = Math.round(probe.duration * 10) / 10
      setVideos((current) => {
        const idx = current.findIndex((v) => v === item)
        if (idx === -1) return current
        if (dur < model.video.minDur || dur > model.video.maxDur) {
          URL.revokeObjectURL(item.previewUrl)
          setError(`参考视频 ${item.name} 时长 ${dur}s，超出当前模型 ${model.video.minDur}–${model.video.maxDur}s 范围`)
          return current.filter((_, i) => i !== idx)
        }
        const total = current.reduce((sum, v) => sum + (v.duration || 0), 0) + dur
        if (total > model.video.totalMax) {
          URL.revokeObjectURL(item.previewUrl)
          setError(`参考视频合计时长不能超过 ${model.video.totalMax}s（${item.name} 已自动移除）`)
          return current.filter((_, i) => i !== idx)
        }
        return current.map((v) => (v === item ? { ...v, duration: dur } : v))
      })
    }
    probe.onerror = () => {
      URL.revokeObjectURL(probeUrl)
      setVideos((current) => {
        const idx = current.findIndex((v) => v === item)
        if (idx === -1) return current
        URL.revokeObjectURL(item.previewUrl)
        return current.filter((_, i) => i !== idx)
      })
      setError(`无法读取视频 ${item.name}，请确认文件未损坏`)
    }
    probe.src = probeUrl
  }

  function removeImage(index: number) {
    setImages((current) => current.filter((_, i) => i !== index))
  }

  function removeVideo(index: number) {
    setVideos((current) => {
      const removed = current[index]
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return current.filter((_, i) => i !== index)
    })
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    files.forEach(addMedia)
    event.target.value = ''
  }

  // ── @ 引用 ───────────────────────────────────────
  const mentionItems = useMemo(
    () => [
      ...images.map((img, i) => ({
        kind: 'image' as const,
        label: `图片${i + 1}`,
        desc: img.role === 'first_frame' ? '首帧' : '参考图',
        src: img.data_url,
      })),
      ...videos.map((video, i) => ({
        kind: 'video' as const,
        label: `视频${i + 1}`,
        desc: '参考视频',
        src: video.previewUrl,
      })),
    ],
    [images, videos],
  )

  function handlePromptChange(value: string) {
    setPrompt(value)
    const pos = promptRef.current?.selectionStart ?? value.length
    setMentionOpen(pos > 0 && value[pos - 1] === '@' && mentionItems.length > 0)
  }

  function insertMention(label: string) {
    const ta = promptRef.current
    if (!ta) return
    let start = ta.selectionStart
    const end = ta.selectionEnd
    if (start > 0 && prompt[start - 1] === '@') start -= 1
    const next = prompt.slice(0, start) + `@${label}` + prompt.slice(end)
    setPrompt(next)
    setMentionOpen(false)
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + `@${label}`.length
      ta.focus()
    })
  }

  // ── 生成 ─────────────────────────────────────────
  async function submit() {
    setError('')
    const text = prompt.trim()
    if (!text) {
      setError('请先输入视频描述')
      return
    }
    if (!model) {
      setError('模型尚未加载，请稍候再试')
      return
    }
    if (model.video.max === 0 && videos.length > 0) {
      setError(`当前模型 ${model.label} 不支持参考视频`)
      return
    }
    if (videos.length > model.video.max) {
      setError(`当前模型最多支持 ${model.video.max} 段参考视频`)
      return
    }
    setSubmitting(true)
    try {
      const uploadedVideos = []
      for (const v of videos) {
        if (v.file) {
          uploadedVideos.push({ file: v.file })
          continue
        }
        const data = await uploadSeedanceVideo(v.blob)
        v.file = data.file
        uploadedVideos.push({ file: data.file })
      }
      const imagesPayload: SeedanceImageInput[] = images.map(({ data_url, role }) => ({
        data_url,
        role,
      }))
      const data = await createSeedanceTask({
        prompt: text,
        model: model.id,
        images: imagesPayload,
        videos: uploadedVideos,
        duration,
        resolution,
        ratio,
        generate_audio: generateAudio,
        watermark,
      })
      setTasks((current) => [data.task, ...current])
      setPrompt('')
      setImages([])
      videos.forEach((v) => URL.revokeObjectURL(v.previewUrl))
      setVideos([])
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setSubmitting(false)
    }
  }

  // ── 任务操作 ─────────────────────────────────────
  async function handleCancelTask(taskId: string) {
    try {
      const data = await cancelSeedanceTask(taskId)
      setTasks((current) => current.map((t) => (t.id === taskId ? data.task : t)))
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '取消失败')
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!window.confirm('确定删除这条生成记录？')) return
    try {
      await deleteSeedanceTask(taskId)
      setTasks((current) => current.filter((t) => t.id !== taskId))
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '删除失败')
    }
  }

  async function handleUseVideo(task: SeedanceTask) {
    const url = seedanceVideoUrl(task)
    if (!url) return
    try {
      const response = await fetch(url, { credentials: 'include' })
      if (!response.ok) throw new Error(`视频获取失败（HTTP ${response.status}）`)
      const blob = await response.blob()
      const file = new File([blob], `seedance-${task.id}.mp4`, { type: blob.type || 'video/mp4' })
      setPublishTitle(task.prompt || `seedance-${task.id}`)
      setPublishVideo(file)
      setPublishOpen(true)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '视频获取失败')
    }
  }

  const totalRefs = images.length + videos.length
  const firstRef = images[0] || videos[0]

  return (
    <div className="seedance-page">
      {contextHolder}
      <div className="seedance-toolbar">
        <Typography.Text strong className="seedance-toolbar-title">
          AI 视频生成
        </Typography.Text>
        <div className="seedance-toolbar-actions">
          <Button size="small" icon={<ReloadOutlined />} onClick={() => { setTasksLoading(true); void loadTasks() }}>
            刷新
          </Button>
        </div>
      </div>

      <div className="seedance-workspace">
        <div className="seedance-hero">
          <h1 className="seedance-hero-title">开启你的视频生成，即刻造梦！</h1>
          <p className="seedance-hero-desc">
            上传参考图片/视频、输入文字，自由组合参考素材，生成你的专属 AI 视频
          </p>
        </div>

        <section className="seedance-gen-area">
          <div className={`seedance-ref-list ${totalRefs === 0 ? 'empty' : ''}`}>
            {images.map((img, i) => (
              <div className="seedance-ref-item" key={`img-${i}`}>
                <img src={img.data_url} alt={img.name} />
                <div className="seedance-ref-role">
                  {model?.provider === 'vidu' ? (
                    <span className="seedance-ref-role-static">首帧</span>
                  ) : (
                    <select
                      value={img.role}
                      onChange={(e) =>
                        setImages((current) =>
                          current.map((item, idx) =>
                            idx === i ? { ...item, role: e.target.value as LocalImage['role'] } : item,
                          ),
                        )
                      }
                    >
                      <option value="first_frame">首帧</option>
                      <option value="reference_image">参考图</option>
                    </select>
                  )}
                </div>
                <button
                  type="button"
                  className="seedance-ref-del"
                  title="移除"
                  onClick={() => removeImage(i)}
                >
                  ×
                </button>
              </div>
            ))}
            {videos.map((video, i) => (
              <div className="seedance-ref-item" key={`video-${i}`}>
                <video
                  className="seedance-ref-video"
                  src={video.previewUrl}
                  muted
                  playsInline
                  controls
                  preload="metadata"
                  title={video.name + (video.duration ? `（${video.duration}s）` : '（读取时长中…）')}
                />
                <div className="seedance-ref-role seedance-ref-role-static">参考视频</div>
                <button
                  type="button"
                  className="seedance-ref-del"
                  title="移除"
                  onClick={() => removeVideo(i)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="seedance-gen-panel">
            <div className="seedance-gen-main">
              <button
                type="button"
                className={`seedance-reference-upload ${totalRefs > 0 ? 'has-img' : ''}`}
                title="上传参考图片（PNG/JPG/WebP）或参考视频（MP4/MOV，时长受所选模型限制）"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  Array.from(e.dataTransfer.files).forEach(addMedia)
                }}
              >
                {totalRefs > 0 && firstRef ? (
                  <>
                    {firstRef.previewUrl || firstRef.data_url ? (
                      firstRef.previewUrl ? (
                        <video className="seedance-ref-thumb" src={firstRef.previewUrl} muted playsInline preload="metadata" />
                      ) : (
                        <img className="seedance-ref-thumb" src={firstRef.data_url} alt="" />
                      )
                    ) : null}
                    <span className="seedance-ref-add">+</span>
                    {totalRefs > 1 ? <span className="seedance-ref-count">+{totalRefs - 1}</span> : null}
                  </>
                ) : (
                  <>
                    <span className="seedance-ref-icon">▣</span>
                    <span className="seedance-label">参考内容</span>
                  </>
                )}
              </button>

              <div className="seedance-prompt-wrap">
                <textarea
                  ref={promptRef}
                  value={prompt}
                  rows={3}
                  maxLength={2000}
                  placeholder="上传参考图片/视频、输入文字，自由组合参考素材，定义精彩互动。例如：@视频1 中的运镜与动作，@图片1 中的场景缓缓推进，人物走向镜头……"
                  onChange={(e) => handlePromptChange(e.target.value)}
                  onBlur={() => window.setTimeout(() => setMentionOpen(false), 150)}
                />
                <span className="seedance-prompt-count">{prompt.length} / 2000</span>
                <span className="seedance-mention-hint" hidden={totalRefs === 0}>
                  输入 @ 可引用参考图/视频
                </span>
                {mentionOpen && (
                  <div className="seedance-mention-pop">
                    <div className="seedance-mention-head">引用参考内容</div>
                    {mentionItems.map((item) => (
                      <button
                        type="button"
                        className="seedance-mention-item"
                        key={item.label}
                        onClick={() => insertMention(item.label)}
                      >
                        {item.kind === 'video' ? (
                          <video src={item.src} muted playsInline preload="metadata" />
                        ) : (
                          <img src={item.src} alt="" />
                        )}
                        <span>
                          {item.label}（{item.desc}）
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="seedance-gen-controls">
              <div className="seedance-model-wrap">
                <span className="seedance-ctrl-chip seedance-model-chip">{model?.label || '加载中…'} ▾</span>
                <div className="seedance-param-pop seedance-model-pop">
                  <div className="seedance-pop-head">选择模型</div>
                  {models.map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      className="seedance-model-option"
                      onClick={() => void selectModel(m)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="seedance-params-wrap">
                <div className="seedance-param-chip">
                  <span className="seedance-p-item">
                    <span className="seedance-p-icon">▭</span>
                    <span>{ratio}</span>
                  </span>
                  <span className="seedance-p-sep">|</span>
                  <span className="seedance-p-item">
                    <span className="seedance-p-icon">◉</span>
                    <span>{resolution.toUpperCase()}</span>
                  </span>
                  <span className="seedance-p-sep">|</span>
                  <span className="seedance-p-item">
                    <span className="seedance-p-icon">⏱</span>
                    <span>{duration}s</span>
                  </span>
                  <span className="seedance-chevron">▾</span>
                </div>
                <div className="seedance-param-pop seedance-params-pop">
                  <div className="seedance-pop-head">参数设置</div>
                  <div className="seedance-param-group">
                    <span className="seedance-setting-label">画面比例</span>
                    <div className="seedance-option-list">
                      {(model?.ratios || []).map((r) => (
                        <button
                          type="button"
                          key={r}
                          className={`seedance-option ${ratio === r ? 'selected' : ''}`}
                          onClick={() => setRatio(r)}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="seedance-param-group">
                    <span className="seedance-setting-label">分辨率</span>
                    <div className="seedance-option-list">
                      {(model?.resolutions || []).map((r) => (
                        <button
                          type="button"
                          key={r}
                          className={`seedance-option ${resolution === r ? 'selected' : ''}`}
                          onClick={() => setResolution(r)}
                        >
                          {r.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="seedance-param-group">
                    <span className="seedance-setting-label">时长</span>
                    <div className="seedance-option-list">
                      {(model?.durations || []).map((d) => (
                        <button
                          type="button"
                          key={d}
                          className={`seedance-option ${duration === d ? 'selected' : ''}`}
                          onClick={() => setDuration(d)}
                        >
                          {d}s
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="seedance-param-group seedance-param-switches">
                    <label className="seedance-switch-row">
                      <span>配音 / 音效</span>
                      <Switch size="small" checked={generateAudio} onChange={setGenerateAudio} />
                    </label>
                    <label className="seedance-switch-row">
                      <span>水印</span>
                      <Switch size="small" checked={watermark} onChange={setWatermark} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="seedance-ctrl-spacer" />

              <button
                type="button"
                className="seedance-submit-btn"
                disabled={!prompt.trim() || submitting}
                title="提交生成（输入内容后可用）"
                onClick={() => void submit()}
              >
                {submitting ? <span className="seedance-spinner" /> : '↑'}
              </button>
            </div>
          </div>

          {error ? <p className="seedance-error-text">{error}</p> : null}
        </section>

        <section className="seedance-results">
          <div className="seedance-results-head">
            <h2>生成记录</h2>
            <button
              type="button"
              className="seedance-btn seedance-btn-ghost seedance-btn-sm"
              onClick={() => { setTasksLoading(true); void loadTasks() }}
            >
              刷新
            </button>
          </div>
          <div className="seedance-task-grid">
            {tasksLoading && tasks.length === 0 ? (
              <p className="seedance-empty-hint">加载中…</p>
            ) : tasks.length === 0 ? (
              <p className="seedance-empty-hint">暂无任务，先在上方输入描述开始生成吧。</p>
            ) : (
              tasks.map((task) => (
                <div className="seedance-task-card" key={task.id}>
                  <div className="seedance-task-thumb">
                    {task.status === 'succeeded' ? (
                      <video
                        controls
                        preload="metadata"
                        src={seedanceVideoUrl(task) || undefined}
                      />
                    ) : task.videos[0]?.file ? (
                      <video muted playsInline preload="metadata" src={seedanceFileUrl(task.videos[0].file)} />
                    ) : task.images[0]?.file ? (
                      <img src={seedanceFileUrl(task.images[0].file)} alt="参考图" />
                    ) : task.images[0]?.url ? (
                      <img src={task.images[0].url} alt="参考图" />
                    ) : task.images[0]?.data_url ? (
                      <img src={task.images[0].data_url} alt="参考图" />
                    ) : task.last_frame_url ? (
                      <img src={task.last_frame_url} alt="尾帧" />
                    ) : (
                      <div className="seedance-thumb-fallback">✦</div>
                    )}
                    {ACTIVE_STATUSES.has(task.status) ? (
                      <div className="seedance-running-overlay">
                        <span className="seedance-spinner" />
                        <span>正在生成…</span>
                      </div>
                    ) : null}
                    <span className={`seedance-badge ${task.status}`}>
                      {STATUS_TEXT[task.status] || task.status}
                    </span>
                  </div>
                  <div className="seedance-task-body">
                    <p className="seedance-task-prompt" title={task.prompt}>
                      {task.prompt || '(无描述)'}
                    </p>
                    <div className="seedance-task-meta">
                      {task.params?.duration ? <span className="seedance-tag">{task.params.duration}s</span> : null}
                      {task.params?.resolution ? (
                        <span className="seedance-tag">{task.params.resolution.toUpperCase()}</span>
                      ) : null}
                      {task.params?.ratio ? <span className="seedance-tag">{task.params.ratio}</span> : null}
                      <span>{task.created_at || ''}</span>
                    </div>
                    {task.error ? <p className="seedance-task-error">失败：{task.error}</p> : null}
                    <div className="seedance-task-actions">
                      {task.status === 'succeeded' && seedanceVideoUrl(task) ? (
                        <>
                          <button
                            type="button"
                            className="seedance-btn seedance-btn-sm seedance-btn-primary"
                            onClick={() => void handleUseVideo(task)}
                          >
                            使用此视频
                          </button>
                          <a
                            className="seedance-btn seedance-btn-sm seedance-btn-link"
                            href={seedanceVideoUrl(task)}
                            target="_blank"
                            rel="noreferrer"
                            title="下载视频"
                          >
                            <DownloadOutlined /> 下载
                          </a>
                        </>
                      ) : null}
                      {ACTIVE_STATUSES.has(task.status) ? (
                        <button
                          type="button"
                          className="seedance-btn seedance-btn-sm seedance-btn-danger"
                          onClick={() => void handleCancelTask(task.id)}
                        >
                          取消任务
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="seedance-btn seedance-btn-sm"
                        onClick={() => void handleDeleteTask(task.id)}
                      >
                        <DeleteOutlined /> 删除记录
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime"
        multiple
        hidden
        onChange={handleFileChange}
      />

      <UploadRunModal
        open={publishOpen}
        models={engineModels}
        defaultModel={engineModels[0] || ''}
        engineReady={engineReady}
        initialVideo={publishVideo}
        initialTitle={publishTitle}
        messageApi={{
          success: (msg: string) => messageApi.success(msg),
          error: (msg: string) => messageApi.error(msg),
          warning: (msg: string) => messageApi.warning(msg),
          loading: (msg: string, duration?: number) => messageApi.loading(msg, duration),
        }}
        onClose={() => {
          setPublishOpen(false)
          setPublishVideo(null)
          setPublishTitle('')
        }}
        onSuccess={(runId, analysisVersion, manual) => {
          setPublishOpen(false)
          setPublishVideo(null)
          setPublishTitle('')
          if (manual && analysisVersion) {
            navigate(`/runs/${runId}/annotate/${analysisVersion}`)
          } else {
            navigate(`/runs/${runId}`)
          }
        }}
      />
    </div>
  )
}
