import { CloudUploadOutlined, EditOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons'
import { Alert, Button, Form, Input, InputNumber, Modal, Radio, Segmented, Select, Space, Table, Tag, Typography, Upload, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, sha256Hex, uploadToSignedOss } from '../api'
import HtmlImportsPage from './HtmlImportsPage'
import { formatServerTime } from '../time'

type Run = {
  id: string
  status: string
  title?: string
  source_filename: string
  source_bytes?: number
  duration_ms?: number
  width?: number
  height?: number
  model_name: string
  analysis_version?: string | null
  processing_mode?: 'ai' | 'manual'
  content_mode?: 'single' | 'story'
  published_version?: string | null
  published_user_id?: string | null
  published_user_nickname?: string | null
  published_user_enabled?: boolean | null
  feed_weight?: number
  is_tutorial?: boolean
  created_by_name?: string | null
  created_at: string
  updated_at?: string
  source?: 'pgc' | 'ugc' | 'manual_upload'
  content_type?: 'runtime' | 'html'
  review_status?: 'pending' | 'approved' | 'rejected'
  author_user_id?: string
  author_nickname?: string
  creation_status?: string
  cover_url?: string
  preview_url?: string
}

type ModelsResp = { default: string; items: { id: string }[] }

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'
type SourceFilter = 'all' | 'pgc' | 'ugc' | 'manual_upload'

const statusFilterOptions: { label: string; value: StatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '待审核', value: 'pending' },
  { label: '已发布', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
]

const sourceOptions: { label: string; value: SourceFilter }[] = [
  { label: '全部', value: 'all' },
  { label: 'PGC', value: 'pgc' },
  { label: 'UGC', value: 'ugc' },
  { label: '手动上传', value: 'manual_upload' },
]

const statusMeta: Record<string, { label: string; color: string }> = {
  ready: { label: '待发布', color: 'blue' },
  running: { label: '分析中', color: 'processing' },
  queued: { label: '排队中', color: 'default' },
  failed: { label: '分析失败', color: 'red' },
  no_interaction: { label: '未发现互动', color: 'orange' },
  no_playable_plan: { label: '方案不可播放', color: 'orange' },
}

function formatBytes(n?: number) {
  if (!n) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(ms?: number) {
  if (ms == null) return '-'
  return `${(ms / 1000).toFixed(1)} 秒`
}

export default function RunListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState<Run[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [defaultModel, setDefaultModel] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [engineReady, setEngineReady] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(() => {
    const source = searchParams.get('source')
    return sourceOptions.some((option) => option.value === source)
      ? source as SourceFilter
      : 'pgc'
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [form] = Form.useForm()
  const processingMode = Form.useWatch<'ai' | 'manual'>('processing_mode', form) || 'ai'
  const [messageApi, contextHolder] = message.useMessage()

  function selectSource(value: SourceFilter) {
    setSourceFilter(value)
    setPage(1)
    setSearchParams(value === 'pgc' ? {} : { source: value })
  }

  const load = useCallback(async () => {
    if (sourceFilter === 'manual_upload') {
      setRows([])
      setTotal(0)
      return
    }
    setLoading(true)
    try {
      const [data, settings] = await Promise.all([
        api<{ items: Run[]; total: number }>(`/api/v1/content-management?source=${sourceFilter}&status=${statusFilter}`),
        api<{ ready: boolean }>('/api/v1/settings/engine/ready'),
      ])
      setRows(data.items)
      setTotal(data.total)
      setEngineReady(settings.ready)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [messageApi, statusFilter, sourceFilter, page, pageSize])

  useEffect(() => {
    void load()
  }, [load])

  async function openUpload() {
    setOpen(true)
    setFile(null)
    form.resetFields()
    form.setFieldsValue({ processing_mode: 'ai' })
    if (!engineReady) return
    try {
      const data = await api<ModelsResp>('/api/v1/models')
      setModels(data.items.map((i) => i.id))
      setDefaultModel(data.default)
      form.setFieldsValue({ model: data.default })
    } catch (err) {
      messageApi.warning(err instanceof Error ? err.message : '模型列表加载失败')
      setModels([])
    }
  }

  const columns: ColumnsType<Run> = [
    {
      title: '封面', key: 'cover', width: 88,
      render: (_, row) => row.cover_url ? (
        <img src={row.cover_url} alt="" style={{ width: 56, height: 76, objectFit: 'cover', borderRadius: 6 }} />
      ) : row.preview_url && row.content_type !== 'html' ? (
        <video src={row.preview_url} muted preload="metadata" style={{ width: 56, height: 76, objectFit: 'cover', borderRadius: 6, background: '#111' }} />
      ) : <div style={{ width: 56, height: 76, borderRadius: 6, background: '#1f2937', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11 }}>{row.content_type === 'html' ? 'HTML' : '视频'}</div>,
    },
    {
      title: '标题',
      dataIndex: 'title',
      render: (_t, row) => (
        <Link
          to={row.source === 'manual_upload' ? '/html-imports' : (
            row.content_mode === 'story'
              ? `/stories/${row.id}/${row.analysis_version || '0.0.1'}`
              : `/runs/${row.id}`
          )}
        >
          {row.title || row.source_filename}
        </Link>
      ),
    },
    {
      title: '来源', key: 'source', width: 92,
      render: (_, row) => <Tag color={row.source === 'ugc' ? 'purple' : row.source === 'manual_upload' ? 'cyan' : 'blue'}>{row.source === 'ugc' ? 'UGC' : row.source === 'manual_upload' ? '手动上传' : 'PGC'}</Tag>,
    },
    {
      title: '类型',
      key: 'content_mode',
      width: 90,
      render: (_, row) => (row.content_mode === 'story' ? '故事' : '单视频'),
    },
    {
      title: '状态',
      key: 'status',
      width: 150,
      render: (_, row) => {
        if (row.review_status === 'pending') return <Tag color="orange">待审核</Tag>
        if (row.review_status === 'rejected') return <Tag color="red">已拒绝</Tag>
        if (row.review_status === 'approved') return <Tag color="green">已发布</Tag>
        if (row.processing_mode === 'manual' && row.status === 'no_playable_plan') {
          return <Tag color="purple">手动处理中</Tag>
        }
        const meta = statusMeta[row.status] || { label: row.status, color: 'default' }
        if (row.status === 'ready' && row.published_version) {
          return <Tag color="green">已发布 · {row.published_version}</Tag>
        }
        return (
          <Space direction="vertical" size={4} align="start">
            <Tag color={meta.color}>{meta.label}</Tag>
            {row.published_version ? (
              <Tag color="green">已发布 · {row.published_version}</Tag>
            ) : null}
          </Space>
        )
      },
    },
    {
      title: '发布账号',
      key: 'published_user',
      width: 160,
      render: (_, row) => {
        if (!row.published_version && !row.published_user_id && !row.author_user_id) return '-'
        const name = row.author_nickname || row.author_user_id || row.published_user_nickname || row.published_user_id || '-'
        if (row.published_user_enabled === false) {
          return (
            <Space size={4} wrap>
              <span>{name}</span>
              <Tag color="orange">已停用</Tag>
            </Space>
          )
        }
        return name
      },
    },
    {
      title: '权重',
      dataIndex: 'feed_weight',
      width: 72,
      render: (v: number | undefined, row) => (
        <InputNumber min={0} max={1_000_000} size="small" value={v ?? 0} style={{ width: 86 }}
          onPressEnter={(event) => (event.currentTarget as HTMLInputElement).blur()}
          onBlur={async (event) => {
            const next = Number(event.target.value || 0)
            if (next === (row.feed_weight ?? 0) || !row.review_status) return
            try {
              await api(`/api/v1/content-management/${row.id}/feed`, { method: 'PATCH', body: JSON.stringify({ feed_weight: next }) })
              setRows((current) => current.map((item) => item.id === row.id ? { ...item, feed_weight: next } : item))
              messageApi.success('权重已保存')
            } catch (error) { messageApi.error(error instanceof Error ? error.message : '权重保存失败') }
          }}
        />
      ),
    },
    {
      title: '操作', key: 'actions', width: 160,
      render: (_, row) => row.source === 'ugc' && row.review_status === 'pending' ? (
        <Space><Button size="small" type="primary" onClick={async () => { try { await api(`/api/v1/content-management/${row.id}/review`, { method: 'POST', body: JSON.stringify({ status: 'approved' }) }); messageApi.success('已通过审核'); void load() } catch (e) { messageApi.error(e instanceof Error ? e.message : '审核失败') } }}>通过</Button><Button size="small" danger onClick={async () => { try { await api(`/api/v1/content-management/${row.id}/review`, { method: 'POST', body: JSON.stringify({ status: 'rejected' }) }); messageApi.success('已拒绝'); void load() } catch (e) { messageApi.error(e instanceof Error ? e.message : '审核失败') } }}>拒绝</Button></Space>
      ) : <Space>{row.preview_url ? <Button size="small" href={row.preview_url} target="_blank">预览</Button> : null}<Button size="small" danger onClick={async () => { if (!window.confirm('确认下架并删除此发布内容？')) return; try { await api(`/api/v1/content-management/${row.id}`, { method: 'DELETE' }); messageApi.success('已下架'); void load() } catch (e) { messageApi.error(e instanceof Error ? e.message : '下架失败') } }}>下架</Button></Space>,
    },
    {
      title: '教学',
      dataIndex: 'is_tutorial',
      width: 64,
      render: (v?: boolean) => (v ? '是' : '否'),
    },
    {
      title: '上传人',
      dataIndex: 'created_by_name',
      width: 120,
      render: (v?: string | null) => v || '-',
    },
    {
      title: '视频信息',
      key: 'media',
      width: 170,
      render: (_, row) => (
        <Space size={6} split={<Typography.Text type="secondary">·</Typography.Text>}>
          <span>{formatDuration(row.duration_ms)}</span>
          <Typography.Text type="secondary">{formatBytes(row.source_bytes)}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 180,
      render: (v: string) => formatServerTime(v),
    },
  ]

  return (
    <>
      {contextHolder}
      {!engineReady && sourceFilter !== 'manual_upload' ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="引擎未配置"
          description={
            <>
              请先到 <Link to="/settings">引擎配置</Link> 填写 Dify / 模型网关信息，才能上传并分析视频。
              <br />
              也可以选择“手动处理”，直接进入人工标注。
            </>
          }
        />
      ) : null}
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {sourceFilter === 'manual_upload' ? '内容管理' : <>内容管理 <Typography.Text type="secondary">({total})</Typography.Text></>}
        </Typography.Title>
        {sourceFilter !== 'manual_upload' ? <Space>
          <Button
            onClick={async () => {
              try {
                const created = await api<{ id: string; analysis_version?: string }>(
                  '/api/v1/stories',
                  {
                    method: 'POST',
                    body: JSON.stringify({ title: '' }),
                  },
                )
                messageApi.success('已创建故事')
                navigate(`/stories/${created.id}/${created.analysis_version || '0.0.1'}`)
              } catch (err) {
                messageApi.error(err instanceof Error ? err.message : '创建失败')
              }
            }}
          >
            创建故事
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void openUpload()}>
            上传视频
          </Button>
        </Space> : null}
      </Space>
      <Segmented<SourceFilter>
        value={sourceFilter}
        options={sourceOptions}
        onChange={selectSource}
        style={{ marginBottom: 16 }}
      />
      {sourceFilter !== 'manual_upload' ? <>
        <Segmented<StatusFilter>
          value={statusFilter}
          options={statusFilterOptions}
          onChange={(value) => {
            setStatusFilter(value)
            setPage(1)
          }}
          style={{ margin: '0 0 16px 12px' }}
        />
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p)
            setPageSize(ps)
          },
        }}
      />
      </> : <HtmlImportsPage embedded />}

      <Modal
        title="上传视频"
        className="upload-video-modal"
        width={680}
        open={open}
        onCancel={() => !uploading && setOpen(false)}
        okText={processingMode === 'manual' ? '进入手动标注' : '开始分析'}
        confirmLoading={uploading}
        okButtonProps={{ disabled: !file || (processingMode === 'ai' && !engineReady) }}
        onOk={async () => {
          const values = await form.validateFields()
          if (!file) return
          setUploading(true)
          const manual = values.processing_mode === 'manual'
          const hide = messageApi.loading(
            manual ? '正在创建手动标注任务…' : '正在上传并创建分析任务…',
            0,
          )
          try {
            const checksum = await sha256Hex(file)
            const session = await api<{
              session_id: string
              uploads: Array<{ url: string; fields: Record<string, string> }>
            }>('/api/v1/run-upload-sessions', {
              method: 'POST',
              body: JSON.stringify({
                filename: file.name,
                content_type: file.type || 'video/mp4',
                size_bytes: file.size,
                sha256: checksum,
                processing_mode: values.processing_mode,
                model: values.processing_mode === 'ai' ? values.model : '',
                brief: values.processing_mode === 'ai' ? values.brief || '' : '',
                title: (values.title || '').trim(),
              }),
            })
            if (session.uploads.length !== 1) throw new Error('服务端未返回有效上传策略')
            await uploadToSignedOss(session.uploads[0], file)
            const run = await api<Run>(
              `/api/v1/run-upload-sessions/${session.session_id}/finalize`,
              { method: 'POST' },
            )
            messageApi.success(manual ? '已创建，正在进入手动标注' : '分析任务已创建')
            setOpen(false)
            navigate(
              manual && run.analysis_version
                ? `/runs/${run.id}/annotate/${run.analysis_version}`
                : `/runs/${run.id}`,
            )
          } catch (err) {
            messageApi.error(err instanceof Error ? err.message : '上传失败')
          } finally {
            hide()
            setUploading(false)
          }
        }}
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
                <Typography.Text strong>{file ? file.name : '点击或拖入 MP4 视频'}</Typography.Text>
                <Typography.Text type="secondary">
                  {file ? `${formatBytes(file.size)} · 点击可重新选择` : '单个文件，最大 100 MB'}
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
    </>
  )
}
