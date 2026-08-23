import { CheckCircleFilled, CloudUploadOutlined, EditOutlined, RobotOutlined } from '@ant-design/icons'
import { Form, Image, Input, Modal, Radio, Select, Tag, Typography, Upload } from 'antd'
import { useWatch } from 'antd/es/form/Form'
import { runsApi } from '../../services/api'
import { useCallback, useEffect, useRef, useState } from 'react'

type MessageApi = {
  success: (msg: string) => void
  error: (msg: string) => void
  warning: (msg: string) => void
  loading: (msg: string, duration?: number) => () => void
}

interface UploadRunModalProps {
  open: boolean
  models: string[]
  defaultModel: string
  engineReady: boolean
  initialVideo?: File | null
  initialTitle?: string
  onClose: () => void
  onSuccess: (runId: string, analysisVersion: string | null | undefined, manual: boolean) => void
  messageApi: MessageApi
}

/** 每隔 COVER_CAPTURE_INTERVAL_MS 抽取一帧作为封面候选；最多抽这么多张。 */
const COVER_CAPTURE_INTERVAL_MS = 500
const MAX_COVER_CANDIDATES = 40

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',')
  const mime = /data:(.*?);/.exec(head)?.[1] || 'image/jpeg'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export default function UploadRunModal({
  open,
  models,
  defaultModel,
  engineReady,
  initialVideo,
  initialTitle,
  onClose,
  onSuccess,
  messageApi,
}: UploadRunModalProps) {
  const [form] = Form.useForm()
  const processingMode = useWatch<'ai' | 'manual'>('processing_mode', form) || 'ai'
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [coverCandidates, setCoverCandidates] = useState<string[]>([])
  const [selectedCover, setSelectedCover] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const captureTimer = useRef<number | null>(null)
  const currentTimeRef = useRef(0)

  const stopExtracting = useCallback(() => {
    if (captureTimer.current !== null) {
      window.clearInterval(captureTimer.current)
      captureTimer.current = null
    }
  }, [])

  // 选择视频后生成临时 URL 并重置封面状态
  useEffect(() => {
    if (open && file) {
      const url = URL.createObjectURL(file)
      setVideoUrl(url)
      setCoverCandidates([])
      setSelectedCover(null)
      return () => URL.revokeObjectURL(url)
    }
    return undefined
  }, [open, file])

  // 关闭弹窗时清理定时器
  useEffect(() => {
    if (!open) stopExtracting()
  }, [open, stopExtracting])

  useEffect(() => {
    if (open && initialVideo) {
      setFile(initialVideo)
      form.setFieldsValue({
        title: (initialTitle || initialVideo.name.replace(/\.mp4$/i, '') || initialVideo.name).trim(),
      })
    }
  }, [open, initialVideo, initialTitle, form])

  // 模型列表只保留默认模型时，打开弹窗即自动选中，无需手动选择
  useEffect(() => {
    if (open && processingMode === 'ai') {
      const next = defaultModel || models[0]
      if (next) form.setFieldsValue({ model: next })
    }
  }, [open, processingMode, defaultModel, models, form])

  const captureFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return
    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 180
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    setCoverCandidates((prev) => {
      if (prev.length >= MAX_COVER_CANDIDATES) return prev
      return [...prev, canvas.toDataURL('image/jpeg', 0.7)]
    })
  }, [])

  const startExtracting = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    stopExtracting()
    setCoverCandidates([])
    setSelectedCover(null)
    setExtracting(true)
    currentTimeRef.current = 0
    video.pause()
    const begin = () => {
      video.play().catch(() => undefined)
      try {
        // 根据视频实际宽高判断横竖屏，决定封面展示比例
        const w = video.videoWidth || 0
        const h = video.videoHeight || 0
        setOrientation(w > 0 && h > 0 && w < h ? 'portrait' : 'landscape')
        const duration = video.duration || 20
        const limit = Math.min(duration, (MAX_COVER_CANDIDATES * COVER_CAPTURE_INTERVAL_MS) / 1000)
        captureFrame()
        currentTimeRef.current = COVER_CAPTURE_INTERVAL_MS / 1000
        video.currentTime = currentTimeRef.current
        captureTimer.current = window.setInterval(() => {
          if (video.ended || video.currentTime > limit || !video.currentTime) {
            stopExtracting()
            video.pause()
            setExtracting(false)
            return
          }
          captureFrame()
          currentTimeRef.current += COVER_CAPTURE_INTERVAL_MS / 1000
          try {
            video.currentTime = Math.min(currentTimeRef.current, video.duration || limit)
          } catch {
            /* ignore */
          }
        }, COVER_CAPTURE_INTERVAL_MS)
      } catch {
        setExtracting(false)
      }
    }
    video.addEventListener('seeked', begin, { once: true })
    video.currentTime = 0
  }, [captureFrame, stopExtracting])

  const onFileSelected = useCallback((f: File) => {
    setFile(f)
    if (!form.getFieldValue('title')) {
      form.setFieldsValue({ title: f.name.replace(/\.mp4$/i, '') || f.name })
    }
  }, [form])

  // 视频加载后延迟片刻再开始抽帧（等元数据可用）
  useEffect(() => {
    if (videoUrl) {
      const timer = window.setTimeout(() => startExtracting(), 300)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [videoUrl, startExtracting])

  const handleOk = async () => {
    const values = await form.validateFields()
    if (!file) return
    setUploading(true)
    const manual = values.processing_mode === 'manual'
    const hide = messageApi.loading(
      manual ? '正在创建手动标注任务…' : '正在上传并创建分析任务…',
      0,
    )
    try {
      // 上传所有抽帧候选封面，收集 URL 列表（JSON 字符串）
      let coverMediaObjectId: string | undefined
      let coverCandidatesJson: string | undefined
      if (coverCandidates.length > 0) {
        const uploaded: { media_object_id: string; cover_url: string }[] = []
        for (const src of coverCandidates) {
          if (!src.startsWith('data:')) continue
          const blob = dataUrlToBlob(src)
          const coverFile = new File([blob], 'cover.jpg', { type: blob.type || 'image/jpeg' })
          const coverResp = await runsApi.uploadCover(coverFile)
          uploaded.push(coverResp)
        }
        coverCandidatesJson = JSON.stringify(uploaded.map((u) => u.cover_url))
        // 选中的那张作为当前封面
        if (selectedCover && selectedCover.startsWith('data:')) {
          const idx = coverCandidates.indexOf(selectedCover)
          coverMediaObjectId = idx >= 0 ? uploaded[idx]?.media_object_id : uploaded[0]?.media_object_id
        } else {
          coverMediaObjectId = uploaded[0]?.media_object_id
        }
      }
      const session = await runsApi.createRunUploadSession({
        filename: file.name,
        content_type: file.type || 'video/mp4',
        size_bytes: file.size,
        transport: 'local',
        processing_mode: values.processing_mode,
        model: values.processing_mode === 'ai' ? values.model : '',
        brief: values.processing_mode === 'ai' ? values.brief || '' : '',
        description: values.description || '',
        title: (values.title || '').trim(),
        cover_media_object_id: coverMediaObjectId,
        cover_candidates_json: coverCandidatesJson,
      })
      if (!session.upload?.url) throw new Error('服务端未返回有效的本地上传地址')
      await runsApi.uploadRunSource(session.session_id, file)
      const run = await runsApi.finalizeRunUpload(session.session_id)
      messageApi.success(manual ? '已创建，正在进入手动标注' : '分析任务已创建')
      onSuccess(run.id, run.analysis_version, manual)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '上传失败')
    } finally {
      hide()
      setUploading(false)
    }
  }

  const handleCancel = () => {
    if (uploading) return
    stopExtracting()
    form.resetFields()
    setFile(null)
    setVideoUrl(null)
    setCoverCandidates([])
    setSelectedCover(null)
    onClose()
  }

  return (
    <Modal
      title="上传视频"
      className="upload-video-modal"
      width={680}
      open={open}
      onCancel={handleCancel}
      okText={processingMode === 'manual' ? '进入手动标注' : '开始分析'}
      confirmLoading={uploading}
      okButtonProps={{ disabled: !file || (processingMode === 'ai' && !engineReady) }}
      onOk={handleOk}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ processing_mode: 'ai', model: defaultModel }}
      >
        <Form.Item label="视频文件" required>
          <Upload.Dragger
            className="upload-video-dragger"
            accept="video/mp4,.mp4"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(f) => {
              onFileSelected(f)
              return false
            }}
            onRemove={() => { setFile(null); setCoverCandidates([]); setSelectedCover(null) }}
          >
            <CloudUploadOutlined className="upload-video-icon" />
            <div className="upload-video-copy">
              <Typography.Text strong>{file?.name || '点击或拖入 MP4 视频'}</Typography.Text>
              <Typography.Text type="secondary">
                {file ? `${formatBytes(file.size)} · 点击可重新选择` : '单个文件，最大 2 GB'}
              </Typography.Text>
            </div>
          </Upload.Dragger>
        </Form.Item>
        <Form.Item label="作品描述">
          <div className="upload-title-brief">
            <Form.Item name="title" noStyle>
              <Input
                className="upload-title-brief-input"
                maxLength={255}
                placeholder="填写作品标题"
                bordered={false}
              />
            </Form.Item>
            <div className="upload-title-brief-divider" />
            <Form.Item name="description" noStyle>
              <Input.TextArea
                className="upload-title-brief-textarea"
                maxLength={500}
                placeholder="添加作品简介："
                bordered={false}
                autoSize={{ minRows: 1, maxRows: 4 }}
              />
            </Form.Item>
          </div>
        </Form.Item>
        {videoUrl ? (
          <Form.Item label="视频封面">
            <div>
              <video
                ref={videoRef}
                src={videoUrl}
                muted
                playsInline
                preload="metadata"
                style={{ display: 'none' }}
                crossOrigin="anonymous"
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              {extracting ? (
                <Typography.Text type="secondary">正在抽取封面…</Typography.Text>
              ) : null}
              {coverCandidates.length > 0 ? (
                <>
                  <Typography.Paragraph type="secondary" style={{ margin: '0 0 8px' }}>
                    已每隔 500ms 抽取 {coverCandidates.length} 张，点击选择一张作为封面
                    {selectedCover ? '（已选择）' : ''}
                  </Typography.Paragraph>
                  <div className={`upload-cover-scroll ${orientation === 'portrait' ? 'is-portrait' : 'is-landscape'}`}>
                    {coverCandidates.map((src, i) => (
                      <div
                        key={i}
                        className={`upload-cover-cell${selectedCover === src ? ' is-selected' : ''}`}
                        onClick={() => setSelectedCover(src)}
                      >
                        <Image src={src} preview={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <span className="upload-cover-time">{((i + 1) * COVER_CAPTURE_INTERVAL_MS / 1000).toFixed(1)}s</span>
                        {selectedCover === src ? (
                          <span className="upload-cover-check"><CheckCircleFilled /></span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </Form.Item>
        ) : null}
        <Form.Item name="processing_mode" label="处理方式" className="upload-mode-field">
          <Radio.Group className="upload-mode-group">
            <Radio value="ai" className={`upload-mode-card ${processingMode === 'ai' ? 'is-selected' : ''}`}>
              <span className="upload-mode-icon ai"><RobotOutlined /></span>
              <span className="upload-mode-content">
                <span className="upload-mode-title">
                  AI 分析 <Tag color="blue">默认</Tag>
                </span>
                <span className="upload-mode-description">模型识别互动节点，完成后预览结果</span>
              </span>
            </Radio>
            <Radio value="manual" className={`upload-mode-card ${processingMode === 'manual' ? 'is-selected' : ''}`}>
              <span className="upload-mode-icon manual"><EditOutlined /></span>
              <span className="upload-mode-content">
                <span className="upload-mode-title">手动处理</span>
                <span className="upload-mode-description">跳过模型，直接进入空白时间轴标注</span>
              </span>
            </Radio>
          </Radio.Group>
        </Form.Item>
        {processingMode === 'ai' ? (
          <>
            {!engineReady ? (
              <div className="upload-engine-warning">
                AI 引擎尚未配置，请先配置引擎或改选手动处理。
              </div>
            ) : null}
            <Form.Item
              name="model"
              label="分析模型"
              preserve={false}
              rules={[{ required: true, message: '请选择模型' }]}
            >
              <Select
                showSearch
                optionFilterProp="value"
                options={models.map((id) => ({ value: id, label: id }))}
              />
            </Form.Item>
            <Form.Item name="brief" label="创作者要求（可选）" preserve={false}>
              <Input.TextArea rows={2} maxLength={500} showCount placeholder="发送给分析模型，可选" />
            </Form.Item>
          </>
        ) : null}
      </Form>
    </Modal>
  )
}

function formatBytes(n?: number) {
  if (!n) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
