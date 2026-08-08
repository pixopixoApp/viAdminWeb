import {
  Button,
  Card,
  Collapse,
  Descriptions,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import FeedWeightInput from '../components/FeedWeightInput'
import PreviewPlayer from '../components/PreviewPlayer'
import { formatServerTime } from '../time'

type VersionInfo = {
  version: string
  label: string
  kind: string
  note: string
  editing: boolean
  source_version?: string
}

type Detail = {
  run: {
    id: string
    status: string
    title?: string
    model_name: string
    error_message?: string
    analysis_version?: string | null
    published_version?: string | null
    published_user_id?: string | null
    published_user_nickname?: string | null
    published_user_enabled?: boolean | null
    feed_weight?: number
    is_tutorial?: boolean
  }
  media: Record<string, unknown>
  frames: { tier: string; pts_ms?: number; url?: string }[]
  analysis_refine: {
    model?: string
    interactions?: Record<string, unknown>[]
  }
  gameplay: {
    dropped?: Record<string, unknown>[]
  }
  timeline?: {
    interactions?: {
      gate_at_ms: number
      gesture?: string
      cue?: string
      hint?: string
    }[]
  } | null
  next_version?: string | null
  versions?: string[]
  version_infos?: VersionInfo[]
  current_meta?: { kind?: string; note?: string; editing?: boolean }
  preview_qr_url?: string | null
}

type PickAccount = {
  user_id: string
  nickname: string
  enabled: boolean
}

function versionOptionLabel(label: string, version: string, published?: string | null) {
  return published && version === published ? `${label} - 已发布` : label
}

type AnalyticsLogItem = {
  id: number
  video_id: string
  token: string
  data: string
  created_at: string
}

export default function RunDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [annotating, setAnnotating] = useState(false)
  const [publishVersion, setPublishVersion] = useState<string | undefined>()
  const [publishUserId, setPublishUserId] = useState<string | undefined>()
  const [pickAccounts, setPickAccounts] = useState<PickAccount[]>([])
  const [pickLoading, setPickLoading] = useState(false)
  const [reanalyzeOpen, setReanalyzeOpen] = useState(false)
  const [reanalyzeVersion, setReanalyzeVersion] = useState('')
  const [reanalyzeModel, setReanalyzeModel] = useState('')
  const [reanalyzeBrief, setReanalyzeBrief] = useState('')
  const [reanalyzeNote, setReanalyzeNote] = useState('')
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [engineReady, setEngineReady] = useState(true)
  const [logs, setLogs] = useState<AnalyticsLogItem[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [weightSaving, setWeightSaving] = useState(false)
  const [tutorialSaving, setTutorialSaving] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const loadLogs = useCallback(async () => {
    if (!id) return
    setLogsLoading(true)
    setLogsError(null)
    try {
      const resp = await api<{ items: AnalyticsLogItem[] }>(
        `/api/v1/runs/${id}/analytics-logs?limit=500`,
      )
      setLogs(resp.items || [])
    } catch (e) {
      setLogs([])
      setLogsError(e instanceof Error ? e.message : String(e))
    } finally {
      setLogsLoading(false)
    }
  }, [id])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [detail, settings] = await Promise.all([
        api<Detail>(`/api/v1/runs/${id}`),
        api<{ ready: boolean }>('/api/v1/settings/engine/ready'),
      ])
      const ver = detail.run.analysis_version
      if (detail.current_meta?.editing && ver) {
        navigate(`/runs/${id}/annotate/${ver}`, { replace: true })
        return
      }
      setData(detail)
      setEngineReady(settings.ready)
      const current = ver || detail.versions?.[detail.versions.length - 1]
      const infos = detail.version_infos || []
      const publishable = infos.filter((v) => !v.editing).map((v) => v.version)
      setPublishVersion((prev) =>
        prev && publishable.includes(prev) ? prev : publishable[publishable.length - 1] || current,
      )
      setPublishUserId((prev) => prev || detail.run.published_user_id || undefined)
      setReanalyzeVersion(detail.next_version || '0.0.1')
      setReanalyzeModel(detail.run.model_name)
      setReanalyzeBrief(String(detail.media.brief || ''))
      setReanalyzeNote('')
      void loadLogs()
      setLoading(false)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载失败')
      setData(null)
      setLoading(false)
    }
  }, [id, loadLogs, messageApi, navigate])

  const loadPickAccounts = useCallback(async () => {
    setPickLoading(true)
    try {
      const resp = await api<{ items: PickAccount[] }>('/api/v1/accounts/pick?limit=100')
      const items = (resp.items || []).filter((a) => a.enabled)
      setPickAccounts(items)
      setPublishUserId((prev) => {
        if (prev && items.some((a) => a.user_id === prev)) return prev
        return items[0]?.user_id
      })
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '账号列表加载失败')
      setPickAccounts([])
    } finally {
      setPickLoading(false)
    }
  }, [messageApi])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadPickAccounts()
  }, [loadPickAccounts])

  async function openReanalyze() {
    if (!data) return
    if (!engineReady) {
      messageApi.warning('请先在「引擎配置」页配齐 Dify / 模型信息')
      return
    }
    setReanalyzeVersion(data.next_version || '0.0.1')
    setReanalyzeModel(data.run.model_name)
    setReanalyzeBrief(String(data.media.brief || ''))
    setReanalyzeNote('')
    setReanalyzeOpen(true)
    setModelsLoading(true)
    try {
      const resp = await api<{ default: string; items: { id: string }[] }>('/api/v1/models')
      const ids = resp.items.map((i) => i.id)
      if (data.run.model_name && !ids.includes(data.run.model_name)) {
        ids.unshift(data.run.model_name)
      }
      setModelOptions(ids)
      setReanalyzeModel((prev) => prev || resp.default || ids[0] || '')
    } catch (err) {
      messageApi.warning(err instanceof Error ? err.message : '模型列表加载失败')
      setReanalyzeOpen(false)
    } finally {
      setModelsLoading(false)
    }
  }
  async function onSwitchVersion(version: string) {
    if (!id || !data || version === data.run.analysis_version) return
    const target = data.version_infos?.find((v) => v.version === version)
    setSwitching(true)
    try {
      await api(`/api/v1/runs/${id}/versions/current`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      })
      messageApi.success(`已切换到 ${version}`)
      if (target?.editing) {
        navigate(`/runs/${id}/annotate/${version}`, { replace: true })
        return
      }
      await load()
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '切换失败')
    } finally {
      setSwitching(false)
    }
  }

  async function onSaveFeedWeight(next: number) {
    if (!id || !data) return
    if (next === (data.run.feed_weight ?? 0)) return
    setWeightSaving(true)
    try {
      const updated = await api<Detail['run']>(`/api/v1/runs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ feed_weight: next }),
      })
      setData((prev) =>
        prev
          ? { ...prev, run: { ...prev.run, feed_weight: updated.feed_weight ?? next } }
          : prev,
      )
      messageApi.success(
        data.run.published_version ? '权重已保存并同步到 App' : '权重已保存',
      )
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '权重保存失败')
    } finally {
      setWeightSaving(false)
    }
  }

  async function onSaveTutorial(next: boolean) {
    if (!id || !data) return
    if (next === Boolean(data.run.is_tutorial)) return
    setTutorialSaving(true)
    try {
      const updated = await api<Detail['run']>(`/api/v1/runs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_tutorial: next }),
      })
      setData((prev) =>
        prev
          ? { ...prev, run: { ...prev.run, is_tutorial: updated.is_tutorial ?? next } }
          : prev,
      )
      messageApi.success(
        data.run.published_version
          ? next
            ? '已设为教学视频并同步到 App（其它教学标记已取消）'
            : '已取消教学视频并同步到 App'
          : next
            ? '已设为教学视频'
            : '已取消教学视频',
      )
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '教学标记保存失败')
    } finally {
      setTutorialSaving(false)
    }
  }

  async function onPublish() {
    if (!id || !publishVersion) return
    if (!publishUserId) {
      messageApi.warning('请选择发布账号')
      return
    }
    setPublishing(true)
    try {
      const result = await api<{ id: string; version: string; ivapp: { updated?: boolean } }>(
        `/api/v1/runs/${id}/publish`,
        {
          method: 'POST',
          body: JSON.stringify({ version: publishVersion, user_id: publishUserId }),
        },
      )
      const updated = result.ivapp?.updated
      messageApi.success(
        updated ? `已更新发布 ${result.version}` : `已发布 ${result.version}`,
      )
      setPublishOpen(false)
      await load()
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '发布失败')
    } finally {
      setPublishing(false)
    }
  }

  async function onUnpublish() {
    if (!id) return
    Modal.confirm({
      title: '确认下架？',
      content: '将从 App 移除该视频，管理端「已发布版本」会清空。',
      okText: '下架',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setUnpublishing(true)
        try {
          await api(`/api/v1/runs/${id}/unpublish`, { method: 'POST' })
          messageApi.success('已下架')
          await load()
        } catch (err) {
          messageApi.error(err instanceof Error ? err.message : '下架失败')
          throw err
        } finally {
          setUnpublishing(false)
        }
      },
    })
  }

  async function onSaveTitle(next: string) {
    if (!id || !data) return
    const text = next.trim()
    const current = String(data.run.title || data.media.title || data.media.filename || '')
    if (text === current) return
    try {
      const updated = await api<{ title: string }>(`/api/v1/runs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: text }),
      })
      setData((prev) =>
        prev
          ? {
              ...prev,
              run: { ...prev.run, title: updated.title },
              media: { ...prev.media, title: updated.title },
            }
          : prev,
      )
      messageApi.success('标题已更新')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '标题保存失败')
    }
  }

  async function onReanalyze() {
    if (!id) return
    setReanalyzing(true)
    try {
      await api(`/api/v1/runs/${id}/reanalyze`, {
        method: 'POST',
        body: JSON.stringify({
          version: reanalyzeVersion || undefined,
          model: reanalyzeModel || undefined,
          brief: reanalyzeBrief,
          note: reanalyzeNote || undefined,
        }),
      })
      messageApi.success(`重新分析完成（${reanalyzeVersion} / ${reanalyzeModel}）`)
      setReanalyzeOpen(false)
      await load()
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '重新分析失败')
    } finally {
      setReanalyzing(false)
    }
  }

  async function onStartAnnotate() {
    if (!id || !data?.run.analysis_version) return
    setAnnotating(true)
    try {
      const resp = await api<{ version: string }>(`/api/v1/runs/${id}/annotate/start`, {
        method: 'POST',
        body: JSON.stringify({ source_version: data.run.analysis_version }),
      })
      messageApi.success(`已创建 ${resp.version}-编辑中`)
      navigate(`/runs/${id}/annotate/${resp.version}`, { replace: true })
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '创建标注版本失败')
    } finally {
      setAnnotating(false)
    }
  }

  if (loading && !data) return <Card loading />
  if (!data) return <Empty />

  const busy = data.run.status === 'running' || data.run.status === 'queued'
  const currentMeta = data.current_meta || {}
  const versionInfos = data.version_infos || []
  const isManual = currentMeta.kind === 'manual'
  const canPlay = ['ready', 'no_interaction', 'no_playable_plan'].includes(data.run.status)
  const gates = data.timeline?.interactions || []
  const publishOptions = versionInfos.filter((v) => !v.editing)
  const currentNote = String(currentMeta.note || '')
  const published = data.run.published_version
  const displayTitle = String(
    data.run.title || data.media.title || data.media.filename || data.run.id,
  )
  const previewPath = data.preview_qr_url || `/api/v1/video_detail?video_id=${id || ''}`
  const qrUrl = `${window.location.origin}${previewPath.startsWith('/') ? previewPath : `/${previewPath}`}`
  const businessStatus = published ? '已发布' : '待发布'
  const businessStatusColor = published ? 'green' : 'blue'
  return (
    <>
      {contextHolder}
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between', alignItems: 'flex-start' }} wrap>
        <div>
          <Typography.Title
            level={4}
            style={{ margin: 0 }}
            editable={{
              tooltip: '点击修改标题',
              onChange: (v) => void onSaveTitle(v),
              triggerType: ['text', 'icon'],
            }}
          >
            {displayTitle}
          </Typography.Title>
          <Typography.Text type="secondary">
            <Link to="/">返回列表</Link>
            {data.media.filename ? ` · 文件 ${String(data.media.filename)}` : ''}
          </Typography.Text>
          <div style={{ marginTop: 10 }}>
            <Tag color={businessStatusColor}>{businessStatus}</Tag>
            {data.run.published_user_enabled === false ? (
              <Tag color="orange">发布账号已停用</Tag>
            ) : null}
          </div>
        </div>
        <Space wrap>
          <Button disabled={busy || !engineReady} onClick={() => void openReanalyze()}>
            重新分析
          </Button>
          <Button
            disabled={busy || !data.run.analysis_version}
            loading={annotating}
            onClick={() => void onStartAnnotate()}
          >
            手动标注
          </Button>
          <Button disabled={!canPlay || !qrUrl} onClick={() => setQrOpen(true)}>
            扫码预览
          </Button>
          {publishOptions.length > 0 ? (
            <Button type="primary" disabled={busy} onClick={() => setPublishOpen(true)}>
              {published ? '更新发布' : '发布'}
            </Button>
          ) : null}
          {published ? (
            <Button danger loading={unpublishing} onClick={() => void onUnpublish()}>
              下架
            </Button>
          ) : null}
        </Space>
      </Space>

      {versionInfos.length > 0 ? (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: '#fff',
            border: '1px solid #f0f0f0',
            borderRadius: 8,
          }}
        >
          <Space size="middle" wrap>
            <Typography.Text strong>查看结果</Typography.Text>
            <Typography.Text type="secondary">版本</Typography.Text>
            <Select
              style={{ width: 180 }}
              value={data.run.analysis_version || undefined}
              loading={switching}
              options={versionInfos.map((v) => ({
                value: v.version,
                label: versionOptionLabel(v.label, v.version, published),
              }))}
              onChange={(v) => void onSwitchVersion(v)}
              disabled={busy}
            />
            <Typography.Text type="secondary">
              {isManual ? '人工标注' : 'AI 生成'}
              {currentNote ? ` · ${currentNote}` : ''}
            </Typography.Text>
          </Space>
        </div>
      ) : null}

      {data.run.error_message ? (
        <Card className="page-card" title="错误" size="small">
          <Typography.Text type="danger">{data.run.error_message}</Typography.Text>
        </Card>
      ) : null}

      <Card className="page-card" title="基本信息" size="small">
        <Descriptions column={2} size="small">
          <Descriptions.Item label="状态">
            {businessStatus}
          </Descriptions.Item>
          <Descriptions.Item label="生成方式">{isManual ? '人工标注' : 'AI 生成'}</Descriptions.Item>
          <Descriptions.Item label="模型">{data.run.model_name}</Descriptions.Item>
          <Descriptions.Item label="当前版本">
            {versionInfos.find((v) => v.version === data.run.analysis_version)?.label ||
              data.run.analysis_version ||
              '-'}
          </Descriptions.Item>
          <Descriptions.Item label="已发布版本">{data.run.published_version || '-'}</Descriptions.Item>
          <Descriptions.Item label="发布账号">
            {data.run.published_user_nickname || data.run.published_user_id || '-'}
            {data.run.published_user_enabled === false ? (
              <Tag color="orange" style={{ marginLeft: 8 }}>
                已停用
              </Tag>
            ) : null}
          </Descriptions.Item>
          <Descriptions.Item label="Feed 权重" span={2}>
            <FeedWeightInput
              value={data.run.feed_weight ?? 0}
              saving={weightSaving}
              showLabel={false}
              onChange={(n) => void onSaveFeedWeight(n)}
            />
          </Descriptions.Item>
          <Descriptions.Item label="教学视频" span={2}>
            <Space size={8} wrap>
              <Switch
                checked={Boolean(data.run.is_tutorial)}
                loading={tutorialSaving}
                onChange={(checked) => void onSaveTutorial(checked)}
              />
              <Typography.Text type="secondary">
                全站至多一条；未看时 Feed 置顶
              </Typography.Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="备注">{currentNote || '-'}</Descriptions.Item>
          <Descriptions.Item label="时长">
            {data.media.duration_ms != null ? `${(Number(data.media.duration_ms) / 1000).toFixed(2)}s` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="分辨率">
            {data.media.width && data.media.height ? `${data.media.width}×${data.media.height}` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="大小">
            {data.media.bytes != null ? `${(Number(data.media.bytes) / 1024 / 1024).toFixed(2)} MB` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="SHA256">
            <Typography.Text code copyable={{ text: String(data.media.sha256 || '') }}>
              {data.media.sha256 ? `${String(data.media.sha256).slice(0, 16)}…` : '-'}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="创作要求" span={2}>
            {String(data.media.brief || '-')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {canPlay ? (
        <Card className="page-card" title="效果预览" size="small">
          <PreviewPlayer
            runId={data.run.id}
            gates={gates}
            durationMs={Number(data.media.duration_ms || 0) || undefined}
          />
        </Card>
      ) : null}

      {!isManual ? (
        <Card className="page-card" title={`抽帧 (${data.frames.length})`} size="small">
          {data.frames.length === 0 ? (
            <Empty description="暂无抽帧" />
          ) : (
            <div className="frame-grid">
              {data.frames.map((frame, index) => (
                <figure key={`${frame.tier}-${frame.pts_ms}-${index}`}>
                  <div className="frame-thumb">
                    {frame.url ? (
                      <img src={frame.url} alt="" loading="lazy" />
                    ) : null}
                  </div>
                  <figcaption>
                    {frame.tier} · {frame.pts_ms != null ? `${(frame.pts_ms / 1000).toFixed(2)}s` : '-'}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {!isManual ? (
      <Card className="page-card" title="分析明细" size="small">
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          模型：{data.analysis_refine.model || data.run.model_name}
        </Typography.Paragraph>
        <Collapse
          items={[
            {
              key: 'model',
              label: '模型分析结构',
              children: (
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(_, i) => `a-${i}`}
                  dataSource={data.analysis_refine.interactions || []}
                  columns={[
                    { title: '手势', dataIndex: 'gesture' },
                    {
                      title: '模型时刻',
                      dataIndex: 'model_reaction_at_ms',
                      render: (ms?: number) => (ms != null ? `${(ms / 1000).toFixed(2)}s` : '-'),
                    },
                    {
                      title: '精修后',
                      dataIndex: 'first_changed_ms',
                      render: (ms?: number) => (ms != null ? `${(ms / 1000).toFixed(2)}s` : '-'),
                    },
                    { title: '精修方式', dataIndex: 'refined_by', ellipsis: true },
                    { title: 'Hint', dataIndex: 'hint', ellipsis: true },
                  ]}
                />
              ),
            },
            {
              key: 'dropped',
              label: `丢弃候选（${(data.gameplay.dropped || []).length}）`,
              children: (
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(_, i) => `d-${i}`}
                  dataSource={data.gameplay.dropped || []}
                  locale={{ emptyText: '无丢弃候选' }}
                  columns={[
                    { title: '手势', dataIndex: 'gesture' },
                    {
                      title: '时刻',
                      dataIndex: 'first_changed_ms',
                      render: (ms?: number) => (ms != null ? `${ms}ms` : '-'),
                    },
                    {
                      title: '原因',
                      dataIndex: 'reason_codes',
                      render: (codes?: string[]) => (codes || []).join(', ') || '-',
                    },
                    { title: 'Hint', dataIndex: 'hint', ellipsis: true },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>
      ) : null}

      <Card
        className="page-card"
        title={`埋点日志 (${logs.length})`}
        size="small"
        extra={
          <Button size="small" loading={logsLoading} onClick={() => void loadLogs()}>
            刷新
          </Button>
        }
      >
        {logsError ? (
          <Typography.Text type="danger">{logsError}</Typography.Text>
        ) : (
          <Table
            size="small"
            rowKey="id"
            loading={logsLoading}
            pagination={false}
            dataSource={logs}
            locale={{ emptyText: <Empty description="暂无埋点" /> }}
            columns={[
              { title: 'ID', dataIndex: 'id', width: 80 },
              { title: 'token', dataIndex: 'token', width: 140, ellipsis: true },
              { title: 'data', dataIndex: 'data', ellipsis: true },
              { title: '时间', dataIndex: 'created_at', width: 200, render: (v: string) => formatServerTime(v) },
            ]}
          />
        )}
      </Card>

      <Modal
        title={published ? '更新发布' : '发布视频'}
        open={publishOpen}
        onCancel={() => setPublishOpen(false)}
        onOk={() => void onPublish()}
        confirmLoading={publishing}
        okButtonProps={{ disabled: !publishVersion || !publishUserId }}
        okText={published ? '确认更新' : '确认发布'}
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Typography.Text type="secondary">发布版本</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              placeholder="选择版本"
              value={publishVersion}
              options={publishOptions.map((v) => ({
                value: v.version,
                label: versionOptionLabel(v.label, v.version, published),
              }))}
              onChange={setPublishVersion}
            />
          </div>
          <div>
            <Typography.Text type="secondary">发布到</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              placeholder="选择 App 账号"
              loading={pickLoading}
              value={publishUserId}
              options={pickAccounts.map((a) => ({
                value: a.user_id,
                label: a.nickname || a.user_id,
              }))}
              onChange={setPublishUserId}
              showSearch
              optionFilterProp="label"
            />
          </div>
          <Typography.Paragraph
            type="secondary"
            style={{ marginBottom: 0, padding: 12, background: '#f5f5f5', borderRadius: 6 }}
          >
            将《{displayTitle}》{publishVersion || '所选版本'}发布到所选 App 账号。
            Feed 权重：{data.run.feed_weight ?? 0}；教学视频：
            {data.run.is_tutorial ? '是' : '否'}（可在基本信息中修改）
          </Typography.Paragraph>
        </Space>
      </Modal>

      <Modal
        title="重新分析"
        open={reanalyzeOpen}
        onCancel={() => setReanalyzeOpen(false)}
        onOk={() => void onReanalyze()}
        confirmLoading={reanalyzing}
        okText="开始"
      >
        <Typography.Paragraph type="secondary">
          保留旧版本目录，在新版本目录中重跑。默认下一版由服务端建议。
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Typography.Text type="secondary">模型</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              showSearch
              loading={modelsLoading}
              value={reanalyzeModel || undefined}
              options={modelOptions.map((mid) => ({ value: mid, label: mid }))}
              onChange={setReanalyzeModel}
              placeholder="选择模型"
            />
          </div>
          <div>
            <Typography.Text type="secondary">Brief（创作者要求）</Typography.Text>
            <Input.TextArea
              style={{ marginTop: 4 }}
              rows={3}
              maxLength={500}
              showCount
              value={reanalyzeBrief}
              onChange={(e) => setReanalyzeBrief(e.target.value)}
              placeholder="可选，会发给分析模型"
            />
          </div>
          <div>
            <Typography.Text type="secondary">版本备注</Typography.Text>
            <Input
              style={{ marginTop: 4 }}
              maxLength={200}
              value={reanalyzeNote}
              onChange={(e) => setReanalyzeNote(e.target.value)}
              placeholder="可选，仅展示在版本信息里"
            />
          </div>
          <Input
            addonBefore="版本"
            value={reanalyzeVersion}
            onChange={(e) => setReanalyzeVersion(e.target.value)}
            placeholder="0.0.2"
          />
        </Space>
      </Modal>

      <Modal
        title="扫码预览"
        open={qrOpen}
        onCancel={() => setQrOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Space direction="vertical" align="center" style={{ width: '100%' }} size="middle">
          {qrUrl ? <QRCodeSVG value={qrUrl} size={220} includeMargin /> : null}
          <Typography.Paragraph copyable style={{ marginBottom: 0, wordBreak: 'break-all' }}>
            {qrUrl}
          </Typography.Paragraph>
          <Typography.Text type="secondary">
            App 扫码后拉取详情并播放；微信等普通扫码只会打开链接看到 JSON。请用手机可访问的后台地址打开本页再扫。
          </Typography.Text>
        </Space>
      </Modal>
    </>
  )
}
