import { CloudUploadOutlined, EditOutlined, RobotOutlined } from '@ant-design/icons'
import { Form, Input, Modal, Radio, Select, Tag, Typography, Upload } from 'antd'
import { useWatch } from 'antd/es/form/Form'
import { sha256Hex, uploadToSignedOss } from '../../api'
import { runsApi } from '../../services/api'
import { useState } from 'react'

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
  onClose: () => void
  onSuccess: (runId: string, analysisVersion: string | null | undefined, manual: boolean) => void
  messageApi: MessageApi
}

export default function UploadRunModal({
  open,
  models,
  defaultModel,
  engineReady,
  onClose,
  onSuccess,
  messageApi,
}: UploadRunModalProps) {
  const [form] = Form.useForm()
  const processingMode = useWatch<'ai' | 'manual'>('processing_mode', form) || 'ai'
  const [uploading, setUploading] = useState(false)
  const fileRef = { current: null as File | null }

  const handleOk = async () => {
    const values = await form.validateFields()
    const file = fileRef.current
    if (!file) return
    setUploading(true)
    const manual = values.processing_mode === 'manual'
    const hide = messageApi.loading(
      manual ? '正在创建手动标注任务…' : '正在上传并创建分析任务…',
      0,
    )
    try {
      const checksum = await sha256Hex(file)
      const session = await runsApi.createRunUploadSession({
        filename: file.name,
        content_type: file.type || 'video/mp4',
        size_bytes: file.size,
        sha256: checksum,
        processing_mode: values.processing_mode,
        model: values.processing_mode === 'ai' ? values.model : '',
        brief: values.processing_mode === 'ai' ? values.brief || '' : '',
        title: (values.title || '').trim(),
      })
      if (session.uploads.length !== 1) throw new Error('服务端未返回有效上传策略')
      await uploadToSignedOss(session.uploads[0], file)
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
    fileRef.current = null
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
      okButtonProps={{ disabled: !fileRef.current || (processingMode === 'ai' && !engineReady) }}
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
              fileRef.current = f
              if (!form.getFieldValue('title')) {
                form.setFieldsValue({ title: f.name.replace(/\.mp4$/i, '') || f.name })
              }
              return false
            }}
            onRemove={() => { fileRef.current = null }}
          >
            <CloudUploadOutlined className="upload-video-icon" />
            <div className="upload-video-copy">
              <Typography.Text strong>{fileRef.current?.name || '点击或拖入 MP4 视频'}</Typography.Text>
              <Typography.Text type="secondary">
                {fileRef.current ? `${formatBytes(fileRef.current.size)} · 点击可重新选择` : '单个文件，最大 100 MB'}
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