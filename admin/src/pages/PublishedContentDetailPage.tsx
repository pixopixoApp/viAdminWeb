import { ArrowLeftOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Collapse, Descriptions, Input, Modal, Space, Table, Tag, Typography, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '../api'
import PreviewPlayer, { GESTURE_LABEL } from '../components/PreviewPlayer'
import { formatServerTime } from '../time'

type Vision = { target?: string; min_confidence?: number; stable_for_ms?: number; camera_facing?: string; show_preview?: boolean }
type TimelineInteraction = { gate_at_ms?: number; gate_end_ms?: number; gesture?: string; hint?: string; pause_video?: boolean; vision?: Vision }
type Timeline = { interactions?: TimelineInteraction[]; media?: { duration_ms?: number } }

type ContentDetail = {
  id: string
  title: string
  description: string
  source: string
  content_type: 'runtime' | 'html'
  status: string
  author_nickname?: string
  author_user_id?: string
  feed_weight: number
  distribution_enabled: boolean
  version: string
  created_at: string
  updated_at: string
  preview_url?: string
  html_url?: string | null
  timeline?: Timeline | null
  preview_qr_url?: string | null
}

const VISION_LABELS: Record<string, string> = {
  hand_victory: '比耶', hand_thumb_up: '点赞', hand_thumb_down: '拇指向下',
  hand_open_palm: '张开手掌', hand_closed_fist: '握拳', hand_pointing_up: '食指向上',
  hand_i_love_you: '我爱你手势', face_smile: '微笑', face_wink_left: '左眼眨眼',
  face_wink_right: '右眼眨眼', face_blink: '双眼眨眼', face_mouth_open: '张嘴',
  face_mouth_pucker: '嘟嘴', face_brow_raise: '挑眉', face_brow_furrow: '皱眉',
  face_cheek_puff: '鼓腮',
}

type TimelineRow = {
  key: string
  at: number
  end?: number
  gesture: string
  hint: string
  target?: string
  confidence?: number
  stableMs?: number
  camera?: string
}

function timelineRows(timeline?: Timeline | null): TimelineRow[] {
  return (timeline?.interactions || []).map((item, index) => ({
    key: `${item.gate_at_ms || 0}-${index}`,
    at: Number(item.gate_at_ms || 0),
    end: typeof item.gate_end_ms === 'number' ? item.gate_end_ms : undefined,
    gesture: item.gesture || 'tap',
    hint: item.hint || '',
    target: item.vision?.target,
    confidence: item.vision?.min_confidence,
    stableMs: item.vision?.stable_for_ms,
    camera: item.vision?.camera_facing,
  })).sort((a, b) => a.at - b.at)
}

function seconds(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * Fallback detail only for published records that predate / bypassed a Run.
 * Normal PGC rows are routed to RunDetailPage, so both paths intentionally use
 * the same preview player, header hierarchy, QR contract and timeline language.
 */
export default function PublishedContentDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<ContentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [timelineDraft, setTimelineDraft] = useState('')
  const [messageApi, holder] = message.useMessage()

  useEffect(() => {
    let live = true
    setLoading(true)
    api<ContentDetail>(`/api/v1/content-management/${encodeURIComponent(id)}`)
      .then((result) => {
        if (!live) return
        setData(result)
        setTitleDraft(result.title || '')
        setDescriptionDraft(result.description || '')
        setTimelineDraft(result.timeline ? JSON.stringify(result.timeline, null, 2) : '')
      })
      .catch((error) => { if (live) messageApi.error(error instanceof Error ? error.message : '加载详情失败') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [id, messageApi])

  const rows = useMemo(() => timelineRows(data?.timeline), [data?.timeline])
  const gates = useMemo(() => rows.map((row) => ({ gate_at_ms: row.at, gesture: row.gesture, hint: row.hint })), [rows])

  const saveEdits = async () => {
    if (!data) return
    let timeline: Timeline | undefined
    const original = data.timeline ? JSON.stringify(data.timeline, null, 2) : ''
    if (data.content_type === 'runtime' && timelineDraft.trim() !== original.trim()) {
      try {
        if (!timelineDraft.trim()) throw new Error('时间线不能为空')
        const parsed: unknown = JSON.parse(timelineDraft)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('时间线必须是 JSON 对象')
        timeline = parsed as Timeline
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : '时间线 JSON 格式不正确')
        return
      }
    }
    setSaving(true)
    try {
      const result = await api<ContentDetail>(`/api/v1/content-management/${encodeURIComponent(data.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: titleDraft.trim(), description: descriptionDraft.trim(), ...(timeline ? { timeline } : {}) }),
      })
      setData(result)
      setTimelineDraft(result.timeline ? JSON.stringify(result.timeline, null, 2) : '')
      setEditing(false)
      messageApi.success('内容已保存，播放器协议已同步校验')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Card loading />
  if (!data) return <Alert type="error" showIcon message="内容不存在或无权限查看" />

  const isDraft = data.status === 'draft'
  const previewPath = data.preview_qr_url || ''
  const qrUrl = previewPath ? `${window.location.origin}${previewPath.startsWith('/') ? previewPath : `/${previewPath}`}` : ''
  const stateLabel = isDraft ? '草稿（不公开）' : data.distribution_enabled ? '已发布' : '暂停 App 分发'
  const stateColor = isDraft ? 'gold' : data.distribution_enabled ? 'green' : 'default'

  return (
    <>
      {holder}
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between', alignItems: 'flex-start' }} wrap>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>{data.title || data.id}</Typography.Title>
          <Typography.Text type="secondary">
            <Button type="link" size="small" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }} onClick={() => navigate(-1)}>返回列表</Button>
            {' · 直发作品记录'}
          </Typography.Text>
          <div style={{ marginTop: 10 }}>
            <Tag color={stateColor}>{stateLabel}</Tag>
            <Tag color={data.content_type === 'html' ? 'cyan' : 'blue'}>{data.content_type === 'html' ? 'HTML 互动' : 'Runtime 互动'}</Tag>
          </div>
        </div>
        <Space wrap>
          <Button type="primary" disabled={!qrUrl} onClick={() => setQrOpen(true)}>扫码预览</Button>
          <Button onClick={() => setEditing((current) => !current)}>{editing ? '收起编辑' : '编辑信息'}</Button>
        </Space>
      </Space>

      {isDraft ? <Alert style={{ marginBottom: 16 }} type="info" showIcon message="草稿只可在运营后台查看和扫码预览；不会进入 App Feed、公开详情或分享页。" /> : null}

      <Card className="page-card" title="发布与推荐" size="small">
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }}>
          <Descriptions.Item label="内容 ID">{data.id}</Descriptions.Item>
          <Descriptions.Item label="版本">{data.version || '-'}</Descriptions.Item>
          <Descriptions.Item label="来源">{data.source.toUpperCase()}</Descriptions.Item>
          <Descriptions.Item label="作者">{data.author_nickname || data.author_user_id || '-'}</Descriptions.Item>
          <Descriptions.Item label="Feed 权重">{data.feed_weight}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{formatServerTime(data.updated_at)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card className="page-card" title="效果预览" size="small">
        {data.content_type === 'html' ? (
          data.html_url ? <Button href={data.html_url} target="_blank">打开 HTML 预览</Button> : <Typography.Text type="secondary">暂无预览入口</Typography.Text>
        ) : data.preview_url ? (
          <PreviewPlayer runId={data.id} videoUrl={data.preview_url} gates={gates} durationMs={data.timeline?.media?.duration_ms} />
        ) : <Typography.Text type="secondary">暂无媒体预览</Typography.Text>}
      </Card>

      <Card className="page-card" title={`互动时间轴（${rows.length}）`} size="small">
        {rows.length ? <Table<TimelineRow> size="small" rowKey="key" pagination={false} dataSource={rows} columns={[
          { title: '时刻', dataIndex: 'at', width: 92, render: (value: number) => seconds(value) },
          { title: '互动动作', dataIndex: 'gesture', width: 140, render: (gesture: string) => <Tag>{GESTURE_LABEL[gesture] || gesture}</Tag> },
          { title: '具体识别目标', dataIndex: 'target', width: 155, render: (target?: string) => target ? <Tag color={target.startsWith('hand_') ? 'blue' : 'purple'}>{VISION_LABELS[target] || target}</Tag> : '-' },
          { title: '识别参数', key: 'vision', width: 185, render: (_, row) => row.target ? `${row.confidence ?? '-'} · ${row.stableMs ?? '-'}ms · ${row.camera === 'back' ? '后置' : '前置'}` : '-' },
          { title: '引导文案', dataIndex: 'hint', render: (hint: string) => hint || '-' },
        ]} /> : <Typography.Text type="secondary">该内容未配置互动节点。</Typography.Text>}
      </Card>

      <Card className="page-card" title="作品信息" size="small">
        {editing ? <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input value={titleDraft} maxLength={120} onChange={(event) => setTitleDraft(event.target.value)} addonBefore="标题" />
          <Input.TextArea value={descriptionDraft} maxLength={1200} rows={3} onChange={(event) => setDescriptionDraft(event.target.value)} placeholder="内容描述" />
          {data.content_type === 'runtime' ? <Collapse size="small" items={[{ key: 'timeline', label: '高级：编辑完整时间线 JSON（保存时会重新校验）', children: <Input.TextArea value={timelineDraft} rows={18} spellCheck={false} onChange={(event) => setTimelineDraft(event.target.value)} /> }]} /> : null}
          <Space><Button type="primary" loading={saving} onClick={() => void saveEdits()}>保存</Button><Button onClick={() => { setEditing(false); setTitleDraft(data.title || ''); setDescriptionDraft(data.description || ''); setTimelineDraft(data.timeline ? JSON.stringify(data.timeline, null, 2) : '') }}>取消</Button></Space>
        </Space> : <Typography.Paragraph style={{ marginBottom: 0 }}>{data.description || '暂无作品描述。'}</Typography.Paragraph>}
      </Card>

      <Modal title="扫码预览" open={qrOpen} onCancel={() => setQrOpen(false)} footer={null} destroyOnClose>
        <Space direction="vertical" align="center" style={{ width: '100%' }} size="middle">
          {qrUrl ? <QRCodeSVG value={qrUrl} size={220} includeMargin /> : null}
          <Typography.Paragraph copyable style={{ marginBottom: 0, wordBreak: 'break-all' }}>{qrUrl}</Typography.Paragraph>
          <Typography.Text type="secondary">请使用 Android App 内“扫一扫”。二维码为短时有效预览凭证，不会将草稿公开发布。</Typography.Text>
        </Space>
      </Modal>
    </>
  )
}
