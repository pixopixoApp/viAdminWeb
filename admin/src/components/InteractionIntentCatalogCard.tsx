import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { api } from '../api'

type CatalogStatus = 'draft' | 'active' | 'archived'

type CatalogValidation = {
  valid: boolean
  target_count: number
  alias_count: number
  unique_alias_count: number
  gesture_count: number
  checksum: string
}

type CatalogVersion = {
  id: string
  revision: number
  schema_version: string
  status: CatalogStatus
  checksum: string
  note: string
  created_by: number | null
  created_at: string
  activated_at: string | null
}

type CatalogDetail = CatalogVersion & {
  catalog: Record<string, unknown>
  validation: CatalogValidation
}

type CatalogIndex = {
  active_revision: number | null
  items: CatalogVersion[]
}

const statusLabel: Record<CatalogStatus, string> = {
  draft: '草稿',
  active: '生效中',
  archived: '历史版本',
}

const statusColor: Record<CatalogStatus, string> = {
  draft: 'gold',
  active: 'green',
  archived: 'default',
}

export default function InteractionIntentCatalogCard() {
  const [versions, setVersions] = useState<CatalogVersion[]>([])
  const [activeRevision, setActiveRevision] = useState<number | null>(null)
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null)
  const [detail, setDetail] = useState<CatalogDetail | null>(null)
  const [catalogText, setCatalogText] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  async function loadDetail(revision: number) {
    const data = await api<CatalogDetail>('/api/v1/settings/interaction-intents/' + revision)
    setSelectedRevision(revision)
    setDetail(data)
    setCatalogText(JSON.stringify(data.catalog, null, 2))
    setNote(data.note || '')
  }

  async function reload(preferredRevision?: number) {
    setLoading(true)
    try {
      const data = await api<CatalogIndex>('/api/v1/settings/interaction-intents')
      setVersions(data.items)
      setActiveRevision(data.active_revision)
      const candidate =
        preferredRevision ??
        data.active_revision ??
        data.items[0]?.revision ??
        null
      if (candidate === null) {
        setSelectedRevision(null)
        setDetail(null)
        setCatalogText('')
      } else {
        await loadDetail(candidate)
      }
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载意图目录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  function parsedCatalog(): Record<string, unknown> {
    let parsed: unknown
    try {
      parsed = JSON.parse(catalogText)
    } catch {
      throw new Error('目录 JSON 格式不正确')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('目录 JSON 顶层必须是对象')
    }
    return parsed as Record<string, unknown>
  }

  async function createDraft() {
    setBusy(true)
    try {
      const created = await api<CatalogDetail>('/api/v1/settings/interaction-intents/drafts', {
        method: 'POST',
        body: JSON.stringify({ note: '基于 v' + (activeRevision ?? '-') + ' 创建' }),
      })
      await reload(created.revision)
      messageApi.success('草稿 v' + created.revision + ' 已创建')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '创建草稿失败')
    } finally {
      setBusy(false)
    }
  }

  async function saveDraft(quiet = false): Promise<CatalogDetail | null> {
    if (!detail || detail.status !== 'draft') return detail
    let catalog: Record<string, unknown>
    try {
      catalog = parsedCatalog()
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '目录格式不正确')
      return null
    }
    const saved = await api<CatalogDetail>(
      '/api/v1/settings/interaction-intents/' + detail.revision,
      {
        method: 'PUT',
        body: JSON.stringify({ catalog, note }),
      },
    )
    setDetail(saved)
    setCatalogText(JSON.stringify(saved.catalog, null, 2))
    if (!quiet) messageApi.success('草稿 v' + saved.revision + ' 已保存')
    return saved
  }

  async function onSave() {
    setBusy(true)
    try {
      const saved = await saveDraft()
      if (saved) await reload(saved.revision)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '保存草稿失败')
    } finally {
      setBusy(false)
    }
  }

  async function onValidate() {
    if (!detail) return
    setBusy(true)
    try {
      const saved = await saveDraft(true)
      if (!saved) return
      const validation = await api<CatalogValidation>(
        '/api/v1/settings/interaction-intents/' + saved.revision + '/validate',
        { method: 'POST' },
      )
      setDetail({ ...saved, validation })
      messageApi.success(
        '校验通过：' +
          validation.unique_alias_count +
          ' 条中英文别名，覆盖 ' +
          validation.gesture_count +
          ' 个手势',
      )
      await reload(saved.revision)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '校验失败')
    } finally {
      setBusy(false)
    }
  }

  async function onActivate() {
    if (!detail || detail.status !== 'draft') return
    if (!window.confirm('确认激活意图目录 v' + detail.revision + '？仅新建的分析任务会使用它。')) {
      return
    }
    setBusy(true)
    try {
      const saved = await saveDraft(true)
      if (!saved) return
      const activated = await api<CatalogDetail>(
        '/api/v1/settings/interaction-intents/' + saved.revision + '/activate',
        { method: 'POST' },
      )
      await reload(activated.revision)
      messageApi.success('v' + activated.revision + ' 已激活')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '激活失败')
    } finally {
      setBusy(false)
    }
  }

  async function onRollback() {
    if (!detail) return
    if (
      !window.confirm(
        '确认以 v' + detail.revision + ' 的内容创建一个新版本并立即激活？原版本记录不会被删除。',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const activated = await api<CatalogDetail>(
        '/api/v1/settings/interaction-intents/' + detail.revision + '/rollback',
        { method: 'POST' },
      )
      await reload(activated.revision)
      messageApi.success('已回滚并激活为 v' + activated.revision)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '回滚失败')
    } finally {
      setBusy(false)
    }
  }

  const validation = detail?.validation

  return (
    <>
      {contextHolder}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="激活只影响之后创建的分析任务；未召回或表达冲突时会继续使用完整手势流程，不会阻断生成。"
      />
      <Card
        className="page-card"
        loading={loading}
        title={activeRevision !== null ? <>版本管理 <Tag color="green">当前 v{activeRevision}</Tag></> : '版本管理'}
      >
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            style={{ minWidth: 260 }}
            value={selectedRevision ?? undefined}
            placeholder="选择版本"
            onChange={(revision) => {
              setLoading(true)
              void loadDetail(revision)
                .catch((err) =>
                  messageApi.error(err instanceof Error ? err.message : '加载版本失败'),
                )
                .finally(() => setLoading(false))
            }}
            options={versions.map((item) => ({
              value: item.revision,
              label:
                'v' +
                item.revision +
                ' · ' +
                statusLabel[item.status] +
                (item.note ? ' · ' + item.note : ''),
            }))}
          />
          <Button type="primary" onClick={() => void createDraft()} loading={busy}>
            {activeRevision === null ? '创建第一版草稿' : '基于当前版本新建草稿'}
          </Button>
          <Button onClick={() => void reload(selectedRevision ?? undefined)} disabled={busy}>
            重新加载
          </Button>
        </Space>

        {detail ? (
          <>
            <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 4 }}>
              <Descriptions.Item label="版本">v{detail.revision}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusColor[detail.status]}>{statusLabel[detail.status]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Schema">{detail.schema_version}</Descriptions.Item>
              <Descriptions.Item label="激活时间">
                {detail.activated_at
                  ? dayjs(detail.activated_at).format('YYYY-MM-DD HH:mm:ss')
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="目标数">
                {validation?.target_count ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="唯一别名">
                {validation?.unique_alias_count ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="手势覆盖">
                {validation ? validation.gesture_count + '/30' : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="校验">
                <Tag color={validation?.valid ? 'green' : 'red'}>
                  {validation?.valid ? '通过' : '未通过'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            <Typography.Text strong>版本说明</Typography.Text>
            <Input
              style={{ margin: '8px 0 16px' }}
              value={note}
              maxLength={255}
              disabled={detail.status !== 'draft'}
              onChange={(event) => setNote(event.target.value)}
            />

            <Typography.Text strong>目录 JSON</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ margin: '4px 0 8px' }}>
              每个 target 包含 family/gesture、候选 gestures、默认降级手势，以及 zh/en
              别名。激活前会校验手势闭集、双语覆盖和重复项。
            </Typography.Paragraph>
            <Input.TextArea
              value={catalogText}
              onChange={(event) => setCatalogText(event.target.value)}
              disabled={detail.status !== 'draft'}
              autoSize={{ minRows: 18, maxRows: 32 }}
              spellCheck={false}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            />

            <Space wrap style={{ marginTop: 16 }}>
              <Button
                type="primary"
                disabled={detail.status !== 'draft'}
                loading={busy}
                onClick={() => void onSave()}
              >
                保存草稿
              </Button>
              <Button loading={busy} onClick={() => void onValidate()}>
                {detail.status === 'draft' ? '保存并校验' : '检查此版本'}
              </Button>
              <Button
                type="primary"
                ghost
                disabled={detail.status !== 'draft'}
                loading={busy}
                onClick={() => void onActivate()}
              >
                保存并激活
              </Button>
              <Button loading={busy} onClick={() => void onRollback()}>
                以此版本回滚
              </Button>
            </Space>
          </>
        ) : (
          <Alert type="warning" message="尚无意图目录版本" />
        )}
      </Card>
    </>
  )
}
