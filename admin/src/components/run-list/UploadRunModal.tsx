import { CloudUploadOutlined, EditOutlined, RobotOutlined } from '@ant-design/icons'
import { Form, Input, Modal, Radio, Select, Tag, Typography, Upload } from 'antd'
import { useWatch } from 'antd/es/form/Form'
import { runsApi } from '../../services/api'
import { useEffect, useState } from 'react'

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
      const session = await runsApi.createRunUploadSession({
        filename: file.name,
        content_type: file.type || 'video/mp4',
        size_bytes: file.size,
        transport: 'local',
        processing_mode: values.processing_mode,
        model: values.processing_mode === 'ai' ? values.model : '',
        brief: values.processing_mode === 'ai' ? values.brief || '' : '',
        title: (values.title || '').trim(),
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
    form.resetFields()
    setFile(null)
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
              setFile(f)
              if (!form.getFieldValue('title')) {
                form.setFieldsValue({ title: f.name.replace(/\.mp4$/i, '') || f.name })
              }
              return false
            }}
            onRemove={() => setFile(null)}
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
        <Form.Item name="title" label="视频标题" extra="不填写时使用视频文件名">
          <Input maxLength={255} placeholder="不填则使用视频文件名" />
        </Form.Item>
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
              <Input.TextArea rows={2} maxLength={500} showCount />
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
