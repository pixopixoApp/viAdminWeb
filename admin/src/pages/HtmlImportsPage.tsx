import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  DownOutlined,
  GlobalOutlined,
  MobileOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  UpOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import type { UploadProps } from 'antd'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, uploadBinary } from '../api'
import type { HtmlImport } from '../types'

const htmlImportsCollectionUrl = '/api/v1/html-imports?route_version=3'
const capabilities = ['motion', 'microphoneLevel', 'cameraStream', 'haptics', 'mediaControl']
const activeStatuses = new Set(['inspection_queued', 'inspecting', 'processing_queued', 'processing'])
const readyStatuses = new Set(['prepared', 'review_required', 'published'])
const reviewableStatuses = new Set(['prepared', 'review_required'])
const statusLabels: Record<string, string> = {
  uploading: '正在上传',
  inspection_queued: '等待旧版校验',
  inspecting: '旧版校验中',
  inspected: '等待继续处理',
  processing_queued: '等待处理',
  processing: '处理中',
  prepared: '预览就绪 · 待验收',
  review_required: '待运营验收',
  published: '已进入 Feed',
  error: '处理失败',
}
const stageLabels: Record<string, string> = {
  queued: '任务已排队',
  requeued_after_restart: '服务恢复，任务已重新排队',
  validating_zip: '校验 ZIP',
  finalizing_upload: '校验旧版上传',
  extracting_source: '安全解压',
  scanning_source: '扫描内容与能力',
  inspection_complete: '扫描完成',
  selecting_entry: '选择入口',
  adapting_compatibility: '适配 Host SDK',
  ai_repair: 'AI 兼容修复',
  browser_qa: '浏览器校验',
  uploading_preview: '上传预览资源',
  finalizing_preview: '保存预览结果',
  ready: '预览包已就绪',
  failed: '处理失败',
}
const inspectionLabels: Record<string, string> = {
  microphone_recording: '录音或 MediaRecorder（平台只提供音量等级）',
  speech_recognition: '浏览器语音识别',
  display_capture: '屏幕采集',
  raw_audio_processing: '原始音频处理',
  frequency_audio_analysis: '音频频域分析',
  combined_camera_and_microphone_capture: '摄像头与麦克风同时采集',
  dynamic_get_user_media_constraints: '媒体约束由运行时代码生成，请重点真机验证',
  large_text_asset_was_partially_scanned: '超大文本仅扫描了首尾片段',
}

function inspectionText(values: string[]) {
  return values.map((value) => inspectionLabels[value] || value).join('；')
}

function formatBytes(value: number) {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}

function statusColor(row: HtmlImport) {
  if (activeStatuses.has(row.status) || row.status === 'uploading') return 'processing'
  if (row.status === 'error') return 'error'
  if (reviewableStatuses.has(row.status)) return 'warning'
  if (row.status === 'published') return 'success'
  return 'default'
}

export default function HtmlImportsPage({ embedded = false }: { embedded?: boolean }) {
  const [rows, setRows] = useState<HtmlImport[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<HtmlImport | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [uploadingId, setUploadingId] = useState('')
  const [uploadPercent, setUploadPercent] = useState(0)
  const [formDirty, setFormDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishingId, setPublishingId] = useState('')
  const [form] = Form.useForm<Pick<HtmlImport, 'entry' | 'title' | 'description' | 'required_capabilities'>>()
  const [messageApi, contextHolder] = message.useMessage()
  const [modalApi, modalContextHolder] = Modal.useModal()

  const replaceRow = useCallback((row: HtmlImport) => {
    setRows((current) => [row, ...current.filter((item) => item.id !== row.id)])
    setSelected(row)
  }, [])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const result = await api<{ items: HtmlImport[] }>(htmlImportsCollectionUrl)
      setRows(result.items)
      setSelected((current) => current
        ? result.items.find((row) => row.id === current.id) || current
        : current)
    } catch (error) {
      if (!silent) messageApi.error(error instanceof Error ? error.message : '加载 HTML 内容失败')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [messageApi])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const needsPolling = rows.some((row) =>
      activeStatuses.has(row.status)
      || ['pending', 'uploading'].includes(row.source_backup?.status || ''),
    )
    if (!needsPolling) return undefined
    const timer = window.setInterval(() => { void load(true) }, 2000)
    return () => window.clearInterval(timer)
  }, [load, rows])
  useEffect(() => {
    if (selected) {
      form.setFieldsValue(selected)
      setFormDirty(false)
    } else {
      form.resetFields()
      setFormDirty(false)
    }
    // Polling may update progress every two seconds. Only reset fields when
    // the selected content or editable server values actually change.
  }, [
    form,
    selected?.id,
    selected?.entry,
    selected?.title,
    selected?.description,
    selected?.required_capabilities.join('\u0000'),
  ])

  function toggleDetails(row: HtmlImport) {
    if (selected?.id === row.id) {
      setSelected(null)
      setQrOpen(false)
      return
    }
    setSelected(row)
    form.setFieldsValue(row)
    setFormDirty(false)
  }

  const uploadProps: UploadProps = {
    accept: '.zip,application/zip',
    maxCount: 1,
    showUploadList: false,
    disabled: Boolean(uploadingId),
    beforeUpload: async (rawFile) => {
      const file = rawFile as File
      try {
        if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('请上传 ZIP 包')
        if (file.size > 512 * 1024 * 1024) throw new Error('ZIP 不能超过 512 MB')
        setUploadPercent(0)
        const created = await api<{
          import: HtmlImport
          upload: { method: 'PUT'; url: string }
        }>('/api/v1/html-imports/local-uploads', {
          method: 'POST',
          body: JSON.stringify({ filename: file.name, size_bytes: file.size }),
        })
        setUploadingId(created.import.id)
        replaceRow(created.import)
        const queued = await uploadBinary<{ import: HtmlImport; poll_after_ms: number }>(
          created.upload.url,
          file,
          setUploadPercent,
        )
        replaceRow(queued.import)
        messageApi.success('ZIP 上传完成，服务器已自动开始处理；可以离开页面后再回来查看')
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : '导入失败')
      } finally {
        setUploadingId('')
        setUploadPercent(0)
        await load(true)
      }
      return Upload.LIST_IGNORE
    },
  }

  async function save(rebuildReadyPackage = true) {
    if (!selected) return null
    setSaving(true)
    try {
      const values = await form.validateFields()
      const shouldRebuild = rebuildReadyPackage && readyStatuses.has(selected.status)
      const updated = await api<HtmlImport>(`/api/v1/html-imports/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      })
      if (shouldRebuild && updated.status === 'inspected') {
        const queued = await api<{ import: HtmlImport; poll_after_ms: number }>(
          `/api/v1/html-imports/${selected.id}/prepare`,
          { method: 'POST' },
        )
        replaceRow(queued.import)
        setFormDirty(false)
        messageApi.success('信息已保存，预览包正在后台重新生成')
        return queued.import
      }
      replaceRow(updated)
      setFormDirty(false)
      messageApi.success('信息已保存')
      await load(true)
      return updated
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '保存失败')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function retryPipeline() {
    if (!selected) return
    try {
      const queued = await api<{ import: HtmlImport; poll_after_ms: number }>(
        `/api/v1/html-imports/${selected.id}/retry`,
        { method: 'POST' },
      )
      replaceRow(queued.import)
      messageApi.success('已复用服务器上的源 ZIP 重新排队，页面会自动刷新')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '重新排队失败')
    }
  }

  async function retryBackup() {
    if (!selected) return
    try {
      const queued = await api<{ import: HtmlImport; poll_after_ms: number }>(
        `/api/v1/html-imports/${selected.id}/retry-backup`,
        { method: 'POST' },
      )
      replaceRow(queued.import)
      messageApi.success('源 ZIP 备份已重新排队，不影响预览使用')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '备份重试失败')
    }
  }

  async function continueLegacyImport() {
    if (!selected) return
    const updated = await save(false)
    if (!updated) return
    try {
      const queued = await api<{ import: HtmlImport; poll_after_ms: number }>(
        `/api/v1/html-imports/${selected.id}/prepare`,
        { method: 'POST' },
      )
      replaceRow(queued.import)
      messageApi.success('已转入统一后台处理流程')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '启动处理失败')
    }
  }

  function confirmPublish() {
    if (!selected || !reviewableStatuses.has(selected.status)) return
    const row = selected
    modalApi.confirm({
      title: `确认审核通过「${row.title || row.source_filename}」？`,
      content: <Space direction="vertical" size={6}>
        <Typography.Text>当前已保存的不可变预览版本将立即进入 Feed 内容池。</Typography.Text>
        <Typography.Text type="secondary">发布后具备正常分发资格，实际露出顺序由 Feed 排序策略决定。</Typography.Text>
      </Space>,
      okText: '审核通过并发布',
      cancelText: '继续检查',
      centered: true,
      onOk: async () => {
        setPublishingId(row.id)
        try {
          const result = await api<{ import: HtmlImport; published: Record<string, unknown> }>(
            `/api/v1/html-imports/${row.id}/publish`,
            { method: 'POST' },
          )
          replaceRow(result.import)
          setFormDirty(false)
          messageApi.success('审核通过，内容已进入 Feed 内容池')
        } catch (error) {
          messageApi.error(error instanceof Error ? error.message : '发布失败')
          throw error
        } finally {
          setPublishingId('')
        }
      },
    })
  }

  const inspection = selected?.qa_result?.inspection
  const unsupportedFeatures = inspection?.unsupported_features || []
  const compatibilityWarnings = inspection?.compatibility_warnings || []
  const previewPath = selected?.preview_qr_url || ''
  const qrUrl = previewPath
    ? `${window.location.origin}${previewPath.startsWith('/') ? previewPath : `/${previewPath}`}`
    : ''
  const processing = selected?.processing
  const uploadingSelected = selected?.id === uploadingId
  const processingActive = selected ? activeStatuses.has(selected.status) : false
  const published = selected?.status === 'published'
  const reviewable = selected ? reviewableStatuses.has(selected.status) : false
  const controlsDisabled = processingActive || uploadingSelected || published
  const displayedProgress = uploadingSelected
    ? Math.max(1, Math.round(uploadPercent * 0.15))
    : processing?.progress_percent || (readyStatuses.has(selected?.status || '') ? 100 : 0)
  const stageTitle = uploadingSelected
    ? `正在上传 ZIP（${uploadPercent}%）`
    : stageLabels[processing?.stage || 'queued'] || '正在后台处理'
  const backup = selected?.source_backup
  const ai = selected?.qa_result?.ai
  const selectedUpdatedText = useMemo(() => {
    const value = processing?.heartbeat_at || processing?.updated_at || selected?.updated_at
    return value ? new Date(value).toLocaleString() : ''
  }, [processing?.heartbeat_at, processing?.updated_at, selected?.updated_at])

  const detailPanel = selected ? <div className="html-import-detail" aria-live="polite">
    <div className="html-import-detail-header">
      <div>
        <Space wrap size={8}>
          <Typography.Title level={5} style={{ margin: 0 }}>{selected.source_filename}</Typography.Title>
          <Tag color={statusColor(selected)}>{statusLabels[selected.status] || selected.status}</Tag>
        </Space>
        <Typography.Text type="secondary" copyable={{ text: selected.item_id }}>
          内容 ID：{selected.item_id}
        </Typography.Text>
      </div>
      <Button type="text" icon={<UpOutlined />} onClick={() => toggleDetails(selected)}>收起详情</Button>
    </div>

    {(processingActive || uploadingSelected || selected.status === 'error' || readyStatuses.has(selected.status)) && <div className="html-import-progress-panel">
      <Space direction="vertical" style={{ width: '100%' }} size={6}>
        <Space wrap>
          <Typography.Text strong>{stageTitle}</Typography.Text>
          {processing?.stage_index ? <Tag>阶段 {processing.stage_index}/{processing.stage_total || 8}</Tag> : null}
          {processing?.attempt ? <Tag>第 {processing.attempt} 次处理</Tag> : null}
          {selectedUpdatedText ? <Typography.Text type="secondary">最近更新：{selectedUpdatedText}</Typography.Text> : null}
        </Space>
        <Progress
          percent={displayedProgress}
          status={selected.status === 'error' ? 'exception' : (displayedProgress === 100 ? 'success' : 'active')}
          size="small"
        />
        <Typography.Text type="secondary">
          {uploadingSelected
            ? '文件正在上传到服务器；上传完成后会自动继续处理。'
            : processing?.detail || (readyStatuses.has(selected.status) ? '预览包已经生成，可以开始验收。' : '任务在服务器后台执行，可以离开本页面。')}
        </Typography.Text>
      </Space>
    </div>}

    {selected.error_message && <Alert
      type="error"
      showIcon
      message={`处理失败${processing?.failed_stage ? `：${stageLabels[processing.failed_stage] || processing.failed_stage}` : ''}`}
      description={selected.error_message}
      action={processing?.can_retry ? <Button danger onClick={() => void retryPipeline()}>重试处理</Button> : undefined}
    />}
    {reviewable && <Alert
      type="warning"
      showIcon
      message="等待运营验收"
      description="先使用 Android 扫码或浏览器打开确认内容；确认无误后，点击“审核通过并进入 Feed”。"
    />}
    {published && <Alert
      type="success"
      showIcon
      message="内容已审核通过并进入 Feed 内容池"
      description="该内容已经具备正常分发资格，实际露出顺序由 Feed 排序策略决定。"
    />}
    {backup && ['pending', 'uploading'].includes(backup.status) && <Alert
      type="info"
      showIcon
      message="预览已经可用，源 ZIP 正在后台备份到 OSS"
      description={<Progress percent={backup.progress_percent || 0} size="small" status="active" />}
    />}
    {backup?.status === 'failed' && <Alert
      type="warning"
      showIcon
      message="预览不受影响，但源 ZIP 备份失败"
      description={backup.error_message}
      action={<Button onClick={() => void retryBackup()}>重试备份</Button>}
    />}
    {unsupportedFeatures.length > 0 && <Alert
      type="warning"
      showIcon
      message="检测到不能安全自动兼容的能力，请重点真机复核"
      description={inspectionText(unsupportedFeatures)}
    />}
    {compatibilityWarnings.length > 0 && <Alert
      type="info"
      showIcon
      message="兼容性提示"
      description={inspectionText(compatibilityWarnings)}
    />}
    {ai?.used && <Alert
      type="warning"
      showIcon
      message={`派生副本使用了 ${ai.calls || 0} 次 AI 兼容修复，请务必真机复核`}
      description={ai.history?.map((item) => item.summary).filter(Boolean).join('；') || 'AI 仅处理运行兼容问题，原始 ZIP 未改动。'}
    />}

    <Descriptions className="html-import-summary" size="small" column={{ xs: 1, sm: 2, lg: 4 }} colon={false}>
      <Descriptions.Item label="虚拟作者">{selected.author_user_id}</Descriptions.Item>
      <Descriptions.Item label="建议能力">{selected.suggested_capabilities.join(', ') || '无'}</Descriptions.Item>
      <Descriptions.Item label="源包备份">{backup?.status === 'ready' ? '已完成' : (backup ? '进行中或待处理' : '—')}</Descriptions.Item>
      <Descriptions.Item label="处理方式">{ai?.used ? 'Host SDK + 受限 AI 修复' : '确定性 Host SDK 适配'}</Descriptions.Item>
    </Descriptions>

    <Form
      form={form}
      layout="vertical"
      disabled={controlsDisabled}
      onValuesChange={() => setFormDirty(true)}
      className="html-import-form"
    >
      <div className="html-import-form-grid">
        <Form.Item label="入口 HTML" name="entry" rules={[{ required: true }]}>
          <Select options={selected.entry_candidates.map((value) => ({ value }))} />
        </Form.Item>
        <Form.Item label="标题" name="title" rules={[{ required: true, max: 120 }]}><Input /></Form.Item>
        <Form.Item className="html-import-form-wide" label="描述" name="description">
          <Input.TextArea rows={2} maxLength={1200} showCount />
        </Form.Item>
        <Form.Item className="html-import-form-wide" label="平台识别的原生能力（可手动补充）" name="required_capabilities">
          <Select mode="multiple" options={capabilities.map((value) => ({ value }))} />
        </Form.Item>
      </div>
    </Form>

    {formDirty && reviewable && <Typography.Text type="warning" className="html-import-unsaved-hint">
      元数据有未保存修改；保存后会生成新的不可变预览包，需要再次验收才能发布。
    </Typography.Text>}

    <div className="html-import-actions">
      <Space wrap>
        {!published && <Button
          icon={<SaveOutlined />}
          onClick={() => void save()}
          disabled={controlsDisabled || !formDirty}
          loading={saving}
        >{reviewable ? '保存并重新生成预览' : '保存信息'}</Button>}
        {selected.status === 'inspected' && <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={() => void continueLegacyImport()}
          disabled={!selected.entry || formDirty}
        >继续生成预览</Button>}
        <Button icon={<MobileOutlined />} onClick={() => setQrOpen(true)} disabled={!qrUrl}>Android 扫码预览</Button>
        {selected.html_url && <Button icon={<GlobalOutlined />} href={selected.html_url} target="_blank" rel="noreferrer">浏览器打开</Button>}
      </Space>
      <div className="html-import-publish-action">
        {reviewable && <Button
          type="primary"
          size="large"
          icon={<CheckCircleOutlined />}
          onClick={confirmPublish}
          disabled={formDirty || controlsDisabled}
          loading={publishingId === selected.id}
          title={formDirty ? '请先保存修改并等待新的预览包生成' : undefined}
        >审核通过并进入 Feed</Button>}
        {published && <Tag color="success" icon={<CheckCircleOutlined />}>已发布并启用分发</Tag>}
      </div>
    </div>
  </div> : null

  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    {contextHolder}
    {modalContextHolder}
    <Card
      title={embedded ? '手动上传 · HTML 互动内容' : 'HTML 互动内容'}
      extra={<Space>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
        <Upload {...uploadProps}>
          <Button type="primary" loading={Boolean(uploadingId)} icon={<CloudUploadOutlined />}>上传 ZIP 并自动处理</Button>
        </Upload>
      </Space>}
    >
      <Alert
        type="info"
        showIcon
        message="上传后自动处理；展开内容完成验收，再明确发布到 Feed。"
        description="操作顺序：上传 ZIP → 等待预览就绪 → Android 扫码或浏览器验收 → 点击“审核通过并进入 Feed”。原 ZIP 始终不被改写。"
      />
    </Card>

    <Table
      className="html-import-table"
      rowKey="id"
      loading={loading}
      dataSource={rows}
      pagination={false}
      scroll={{ x: 980 }}
      rowClassName={(row) => row.id === selected?.id ? 'html-import-row-selected' : ''}
      onRow={(row) => ({
        onClick: (event) => {
          const target = event.target as HTMLElement
          if (target.closest('button, a, input, textarea, .ant-select, [role="button"]')) return
          toggleDetails(row)
        },
      })}
      expandable={{
        expandedRowKeys: selected ? [selected.id] : [],
        expandedRowRender: () => detailPanel,
        showExpandColumn: false,
      }}
      columns={[
        { title: '源包', dataIndex: 'source_filename' },
        { title: '大小', dataIndex: 'source_bytes', width: 90, render: (value: number) => formatBytes(value) },
        { title: '状态', dataIndex: 'status', render: (_: string, row: HtmlImport) => <Tag color={statusColor(row)}>{statusLabels[row.status] || row.status}</Tag> },
        {
          title: '进度',
          width: 180,
          render: (_: unknown, row: HtmlImport) => {
            const localUpload = row.id === uploadingId
            const percent = localUpload ? Math.round(uploadPercent * 0.15) : row.processing?.progress_percent
            return (activeStatuses.has(row.status) || localUpload)
              ? <Progress percent={percent || 0} size="small" status="active" />
              : (percent === 100 ? '100%' : '—')
          },
        },
        { title: '标题', dataIndex: 'title', render: (value: string) => value || <Typography.Text type="secondary">自动生成中</Typography.Text> },
        { title: '版本', dataIndex: 'package_version', render: (value: string | null) => value ? value.slice(0, 12) : '—' },
        { title: '创建时间', dataIndex: 'created_at', render: (value: string) => value ? new Date(value).toLocaleString() : '—' },
        {
          title: '操作',
          key: 'detail-action',
          width: 132,
          fixed: 'right',
          align: 'right',
          render: (_: unknown, row: HtmlImport) => {
            const expanded = row.id === selected?.id
            return <Button
              type="link"
              icon={expanded ? <UpOutlined /> : <DownOutlined />}
              aria-expanded={expanded}
              onClick={(event) => {
                event.stopPropagation()
                toggleDetails(row)
              }}
            >{expanded ? '收起详情' : '查看并操作'}</Button>
          },
        },
      ]}
    />

    <Modal title="Android 真机预览" open={qrOpen} onCancel={() => setQrOpen(false)} footer={null} destroyOnClose>
      <Space direction="vertical" align="center" style={{ width: '100%' }} size="middle">
        {qrUrl ? <QRCodeSVG value={qrUrl} size={220} includeMargin /> : null}
        <Typography.Paragraph copyable style={{ marginBottom: 0, wordBreak: 'break-all' }}>{qrUrl}</Typography.Paragraph>
        <Typography.Text type="secondary">请使用 Pixo Android App 内“扫一扫”。这里只播放当前不可变预览包，不会自动发布到 Feed。</Typography.Text>
      </Space>
    </Modal>
  </Space>
}
