import {
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { api, sha256Hex, uploadToSignedOss } from '../api'
import ClipOutcomesEditor, { type Outcomes } from '../components/ClipOutcomesEditor'
import FeedWeightInput from '../components/FeedWeightInput'
import PreviewPlayer, { GESTURE_LABEL } from '../components/PreviewPlayer'

const GESTURES = Object.entries(GESTURE_LABEL).map(([value, label]) => ({ value, label }))

type Interaction = {
  gate_at_ms: number
  gate_end_ms?: number
  gesture: string
  hint?: string
  custom_action?: boolean
  action_description?: string
  gameplay_description?: string
  outcomes?: Outcomes
}

type ClipOnEnd = { action: 'goto'; clip_id: string }

type ClipBody = {
  timeline?: { interactions?: Interaction[]; media?: { duration_ms?: number } }
  on_end?: ClipOnEnd
}

function parseClipOnEnd(raw: unknown): ClipOnEnd | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const edge = raw as { action?: string; clip_id?: string }
  if (edge.action !== 'goto') return undefined
  const clipId = typeof edge.clip_id === 'string' ? edge.clip_id.trim() : ''
  if (!clipId) return undefined
  return { action: 'goto', clip_id: clipId }
}

type ClipMeta = {
  clip_id: string
  source_filename: string
  duration_ms?: number | null
  width?: number | null
  height?: number | null
}

type VersionInfo = {
  version: string
  label: string
  editing: boolean
  kind?: string
  note?: string
}

type PickAccount = {
  user_id: string
  nickname?: string
  enabled: boolean
}

type StoryState = {
  entry_clip_id: string
  clips: Record<string, ClipBody>
  clip_meta: ClipMeta[]
  version: string
  editing: boolean
  note: string
  label?: string
}

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

function versionOptionLabel(label: string, ver: string, published?: string | null) {
  return published && ver === published ? `${label} - 已发布` : label
}

/** Redirect /stories/:id → /stories/:id/{analysis_version} */
export function StoryRedirect() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void (async () => {
      try {
        const resp = await api<{ run: { analysis_version?: string | null } }>(`/api/v1/stories/${id}`)
        if (cancelled) return
        setTarget(resp.run.analysis_version || '0.0.1')
      } catch {
        if (!cancelled) navigate('/', { replace: true })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  if (!id || !target) return <Card loading />
  return <Navigate to={`/stories/${id}/${target}`} replace />
}

export default function StoryEditPage() {
  const { id, version } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [publishedVersion, setPublishedVersion] = useState<string | null>(null)
  const [versionInfos, setVersionInfos] = useState<VersionInfo[]>([])
  const [story, setStory] = useState<StoryState | null>(null)
  const [activeClipId, setActiveClipId] = useState<string>('')
  const [rows, setRows] = useState<Interaction[]>([])
  const [clipOnEnd, setClipOnEnd] = useState<ClipOnEnd | undefined>()
  const [note, setNote] = useState('')
  const [entryClipId, setEntryClipId] = useState('')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [playheadMs, setPlayheadMs] = useState(0)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [forking, setForking] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const [publishVersion, setPublishVersion] = useState<string | undefined>()
  const [publishUserId, setPublishUserId] = useState<string | undefined>()
  const [pickAccounts, setPickAccounts] = useState<PickAccount[]>([])
  const [pickLoading, setPickLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [feedWeight, setFeedWeight] = useState(0)
  const [weightSaving, setWeightSaving] = useState(false)
  const [isTutorial, setIsTutorial] = useState(false)
  const [tutorialSaving, setTutorialSaving] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const skipAutosave = useRef(true)
  const saveGen = useRef(0)

  const applyStory = useCallback((data: StoryState, preferClip?: string) => {
    setStory(data)
    setNote(data.note || '')
    setEntryClipId(data.entry_clip_id || '')
    const clip =
      preferClip && data.clips[preferClip]
        ? preferClip
        : data.entry_clip_id || data.clip_meta[0]?.clip_id || ''
    setActiveClipId(clip)
    const interactions = [...(data.clips[clip]?.timeline?.interactions || [])].sort(
      (a, b) => a.gate_at_ms - b.gate_at_ms,
    )
    setRows(interactions)
    setClipOnEnd(parseClipOnEnd(data.clips[clip]?.on_end))
    setSelectedIndex(interactions.length ? 0 : null)
  }, [])

  const load = useCallback(async () => {
    if (!id || !version) return
    setLoading(true)
    try {
      const resp = await api<{
        run: {
          title: string
          published_version?: string | null
          published_user_id?: string | null
          analysis_version?: string | null
          feed_weight?: number
          is_tutorial?: boolean
        }
        story: StoryState
        version_infos?: VersionInfo[]
      }>(`/api/v1/stories/${id}?version=${encodeURIComponent(version)}`)
      skipAutosave.current = true
      setTitle(resp.run.title || '故事')
      setFeedWeight(resp.run.feed_weight ?? 0)
      setIsTutorial(Boolean(resp.run.is_tutorial))
      setPublishedVersion(resp.run.published_version || null)
      setPublishUserId((prev) => prev || resp.run.published_user_id || undefined)
      const infos = resp.version_infos || []
      setVersionInfos(infos)
      const publishable = infos.filter((v) => !v.editing).map((v) => v.version)
      setPublishVersion((prev) =>
        prev && publishable.includes(prev)
          ? prev
          : publishable[publishable.length - 1] || resp.run.analysis_version || version,
      )
      applyStory(resp.story)
      setSaveStatus('idle')
      setLoading(false)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载失败')
      navigate('/', { replace: true })
      setLoading(false)
    }
  }, [id, version, applyStory, messageApi, navigate])

  useEffect(() => {
    void load()
  }, [load])

  const clipsPayload = useMemo(() => {
    const base = { ...(story?.clips || {}) }
    if (activeClipId) {
      const prev = base[activeClipId] || {}
      const { on_end: _drop, ...rest } = prev
      base[activeClipId] = {
        ...rest,
        timeline: {
          ...(prev.timeline || {}),
          interactions: rows.map((r) => ({
            gesture: r.gesture,
            gate_at_ms: Math.round(r.gate_at_ms),
            ...(typeof r.gate_end_ms === 'number' ? { gate_end_ms: Math.round(r.gate_end_ms) } : {}),
            ...(r.hint ? { hint: r.hint } : {}),
            ...(r.custom_action ? { custom_action: true } : {}),
            ...(r.action_description ? { action_description: r.action_description } : {}),
            ...(r.gameplay_description ? { gameplay_description: r.gameplay_description } : {}),
            ...(r.outcomes
              ? {
                  outcomes: {
                    success: r.outcomes.success || { action: 'continue' as const },
                    fail: r.outcomes.fail || { action: 'continue' as const },
                  },
                }
              : {}),
          })),
          media: prev.timeline?.media || {
            duration_ms:
              story?.clip_meta.find((c) => c.clip_id === activeClipId)?.duration_ms || 0,
          },
        },
        ...(clipOnEnd ? { on_end: clipOnEnd } : {}),
      }
    }
    return base
  }, [story, activeClipId, rows, clipOnEnd])

  const persist = useCallback(async () => {
    if (!id || !version || !story?.editing) return
    const gen = ++saveGen.current
    setSaveStatus('saving')
    try {
      const resp = await api<{ story: StoryState }>(`/api/v1/stories/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          entry_clip_id: entryClipId,
          clips: clipsPayload,
          note,
          version,
        }),
      })
      if (gen !== saveGen.current) return
      skipAutosave.current = true
      applyStory(resp.story, activeClipId)
      setSaveStatus('saved')
    } catch (err) {
      if (gen !== saveGen.current) return
      setSaveStatus('error')
      messageApi.error(err instanceof Error ? err.message : '保存失败')
    }
  }, [id, version, story?.editing, entryClipId, clipsPayload, note, activeClipId, applyStory, messageApi])

  useEffect(() => {
    if (skipAutosave.current) {
      skipAutosave.current = false
      return
    }
    if (!story?.editing) return
    setSaveStatus('dirty')
    const timer = window.setTimeout(() => {
      void persist()
    }, 500)
    return () => window.clearTimeout(timer)
  }, [rows, note, entryClipId, clipOnEnd, persist, story?.editing])

  function switchClip(clipId: string) {
    if (!story || clipId === activeClipId) return
    const nextClips = { ...clipsPayload }
    const nextStory = { ...story, clips: nextClips, entry_clip_id: entryClipId }
    setStory(nextStory)
    setActiveClipId(clipId)
    const interactions = [...(nextClips[clipId]?.timeline?.interactions || [])].sort(
      (a, b) => a.gate_at_ms - b.gate_at_ms,
    )
    setRows(interactions)
    setClipOnEnd(parseClipOnEnd(nextClips[clipId]?.on_end))
    setSelectedIndex(interactions.length ? 0 : null)
    if (!story.editing) {
      skipAutosave.current = true
      return
    }
    setSaveStatus('dirty')
    void (async () => {
      if (!id || !version) return
      const gen = ++saveGen.current
      setSaveStatus('saving')
      try {
        const resp = await api<{ story: StoryState }>(`/api/v1/stories/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            entry_clip_id: entryClipId,
            clips: nextClips,
            note,
            version,
          }),
        })
        if (gen !== saveGen.current) return
        skipAutosave.current = true
        applyStory(resp.story, clipId)
        setSaveStatus('saved')
      } catch (err) {
        if (gen !== saveGen.current) return
        setSaveStatus('error')
        messageApi.error(err instanceof Error ? err.message : '保存失败')
      }
    })()
  }

  async function onSwitchVersion(nextVersion: string) {
    if (!id || !version || nextVersion === version) return
    setSwitching(true)
    try {
      await api(`/api/v1/runs/${id}/versions/current`, {
        method: 'POST',
        body: JSON.stringify({ version: nextVersion }),
      })
      navigate(`/stories/${id}/${nextVersion}`, { replace: true })
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '切换失败')
    } finally {
      setSwitching(false)
    }
  }

  async function onStartAnnotate() {
    if (!id || !version) return
    setForking(true)
    try {
      const resp = await api<{ version: string }>(`/api/v1/stories/${id}/versions`, {
        method: 'POST',
        body: JSON.stringify({ source_version: version }),
      })
      messageApi.success(`已创建 ${resp.version}-编辑中`)
      navigate(`/stories/${id}/${resp.version}`, { replace: true })
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '创建标注版本失败')
    } finally {
      setForking(false)
    }
  }

  async function loadPickAccounts() {
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
  }

  async function openPublish() {
    const publishable = versionInfos.filter((v) => !v.editing).map((v) => v.version)
    setPublishVersion((prev) =>
      prev && publishable.includes(prev) ? prev : publishable[publishable.length - 1],
    )
    setPublishOpen(true)
    await loadPickAccounts()
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
      messageApi.success(updated ? `已更新发布 ${result.version}` : `已发布 ${result.version}`)
      setPublishOpen(false)
      setPublishedVersion(result.version)
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
      content: '将从 App 移除该故事，管理端「已发布版本」会清空。',
      okText: '下架',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setUnpublishing(true)
        try {
          await api(`/api/v1/runs/${id}/unpublish`, { method: 'POST' })
          messageApi.success('已下架')
          setPublishedVersion(null)
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

  async function onUploadClip(file: File) {
    if (!id) return false
    setUploading(true)
    try {
      const checksum = await sha256Hex(file)
      const session = await api<{
        session_id: string
        uploads: Array<{ url: string; fields: Record<string, string> }>
      }>(`/api/v1/stories/${id}/clip-upload-sessions`, {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || 'video/mp4',
          size_bytes: file.size,
          sha256: checksum,
        }),
      })
      if (session.uploads.length !== 1) throw new Error('服务端未返回有效上传策略')
      await uploadToSignedOss(session.uploads[0], file)
      const data = await api<{ story: StoryState; clip: ClipMeta }>(
        `/api/v1/stories/${id}/clip-upload-sessions/${session.session_id}/finalize`,
        { method: 'POST' },
      )
      skipAutosave.current = true
      applyStory(data.story, data.clip.clip_id)
      messageApi.success('片段已添加')
      setSaveStatus('idle')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
    return false
  }

  async function onFinalize() {
    if (!id || !version) return
    if (!entryClipId) {
      messageApi.warning('请先设置入口片段')
      return
    }
    setFinalizing(true)
    try {
      await persist()
      const resp = await api<{ story: StoryState; version_infos?: VersionInfo[] }>(
        `/api/v1/stories/${id}/finalize?version=${encodeURIComponent(version)}`,
        { method: 'POST' },
      )
      messageApi.success(`已定稿 ${version}`)
      skipAutosave.current = true
      if (resp.version_infos) setVersionInfos(resp.version_infos)
      applyStory(resp.story, activeClipId)
      setSaveStatus('idle')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '定稿失败')
    } finally {
      setFinalizing(false)
    }
  }

  async function onSaveTitle(next: string) {
    if (!id) return
    const text = next.trim()
    if (!text || text === title) return
    try {
      const updated = await api<{ title: string }>(`/api/v1/runs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: text }),
      })
      setTitle(updated.title || text)
      messageApi.success('标题已更新')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '标题保存失败')
    }
  }

  async function onSaveFeedWeight(next: number) {
    if (!id) return
    if (next === feedWeight) return
    setWeightSaving(true)
    try {
      const updated = await api<{ feed_weight?: number }>(`/api/v1/runs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ feed_weight: next }),
      })
      setFeedWeight(updated.feed_weight ?? next)
      messageApi.success(publishedVersion ? '权重已保存并同步到 App' : '权重已保存')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '权重保存失败')
    } finally {
      setWeightSaving(false)
    }
  }

  async function onSaveTutorial(next: boolean) {
    if (!id) return
    if (next === isTutorial) return
    setTutorialSaving(true)
    try {
      const updated = await api<{ is_tutorial?: boolean }>(`/api/v1/runs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_tutorial: next }),
      })
      setIsTutorial(updated.is_tutorial ?? next)
      messageApi.success(
        publishedVersion
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

  function updateSelected(patch: Partial<Interaction> & { gate_end_ms?: number | null }) {
    if (selectedIndex == null) return
    setRows((prev) => {
      const cur = prev[selectedIndex]
      if (!cur) return prev
      const gate_at_ms = Math.round(Number(patch.gate_at_ms ?? cur.gate_at_ms) || 0)
      let gate_end_ms: number | undefined
      if ('gate_end_ms' in patch) {
        gate_end_ms =
          patch.gate_end_ms == null ? undefined : Math.round(Number(patch.gate_end_ms) || 0)
      } else {
        gate_end_ms = cur.gate_end_ms
      }
      if (typeof gate_end_ms === 'number' && gate_end_ms < gate_at_ms) {
        gate_end_ms = undefined
      }
      const updated: Interaction = {
        ...cur,
        ...patch,
        gate_at_ms,
        ...(gate_end_ms !== undefined ? { gate_end_ms } : { gate_end_ms: undefined }),
      }
      if (gate_end_ms === undefined) delete updated.gate_end_ms
      const next = prev.map((r, i) => (i === selectedIndex ? updated : r)).sort(
        (a, b) => a.gate_at_ms - b.gate_at_ms,
      )
      setSelectedIndex(next.indexOf(updated))
      return next
    })
  }

  function addAtPlayhead() {
    const ms = Math.max(0, Math.round(playheadMs))
    if (rows.some((r) => r.gate_at_ms === ms)) {
      messageApi.warning('该时刻已有互动点')
      return
    }
    const item: Interaction = {
      gate_at_ms: ms,
      gesture: 'tap',
      hint: '',
      outcomes: {
        success: { action: 'continue' },
        fail: { action: 'continue' },
      },
    }
    setRows((prev) => {
      const next = [...prev, item].sort((a, b) => a.gate_at_ms - b.gate_at_ms)
      setSelectedIndex(next.indexOf(item))
      return next
    })
  }

  function removeSelected() {
    if (selectedIndex == null) return
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== selectedIndex)
      setSelectedIndex(next.length === 0 ? null : Math.min(selectedIndex, next.length - 1))
      return next
    })
  }

  if (loading && !story) return <Card loading />
  if (!story || !id || !version) return <Empty />

  const selected = selectedIndex != null ? rows[selectedIndex] : null
  const clipMeta = story.clip_meta || []
  const activeMeta = clipMeta.find((c) => c.clip_id === activeClipId)
  const durationMs =
    Number(activeMeta?.duration_ms || story.clips[activeClipId]?.timeline?.media?.duration_ms || 0) ||
    undefined
  const saveLabel =
    saveStatus === 'saving'
      ? '保存中…'
      : saveStatus === 'saved'
        ? '已自动保存'
        : saveStatus === 'dirty'
          ? '未保存'
          : saveStatus === 'error'
            ? '保存失败'
            : ''
  const editing = story.editing
  const currentInfo = versionInfos.find((v) => v.version === version)
  const barNote = (note || currentInfo?.note || '').trim()
  const publishOptions = versionInfos.filter((v) => !v.editing)
  const published = Boolean(publishedVersion)

  return (
    <>
      {contextHolder}
      <Space
        style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between', alignItems: 'flex-start' }}
        wrap
      >
        <div>
          <Typography.Title
            level={4}
            style={{ margin: 0 }}
            className="page-title"
            editable={
              editing
                ? {
                    tooltip: '点击修改标题',
                    onChange: (v) => void onSaveTitle(v),
                    triggerType: ['text', 'icon'],
                  }
                : false
            }
          >
            {title}
          </Typography.Title>
          <Typography.Text type="secondary">
            <Link to="/">返回列表</Link>
            {saveLabel ? ` · ${saveLabel}` : ''}
          </Typography.Text>
          <div style={{ marginTop: 10 }}>
            <Tag color={published ? 'green' : 'blue'}>{published ? '已发布' : '待发布'}</Tag>
            <Tag>{editing ? '编辑中' : '已定稿'}</Tag>
            <Tag color="purple">故事</Tag>
          </div>
          <div style={{ marginTop: 10 }}>
            <FeedWeightInput
              value={feedWeight}
              saving={weightSaving}
              onChange={(n) => void onSaveFeedWeight(n)}
            />
          </div>
          <div style={{ marginTop: 10 }}>
            <Space size={8} wrap>
              <Typography.Text type="secondary">教学视频</Typography.Text>
              <Switch
                checked={isTutorial}
                loading={tutorialSaving}
                onChange={(checked) => void onSaveTutorial(checked)}
              />
              <Typography.Text type="secondary">全站至多一条</Typography.Text>
            </Space>
          </div>
        </div>
        <Space wrap>
          {saveStatus === 'error' ? (
            <Button size="small" onClick={() => void persist()}>
              重试保存
            </Button>
          ) : null}
          {editing ? (
            <Button type="primary" loading={finalizing} onClick={() => void onFinalize()}>
              定稿
            </Button>
          ) : (
            <>
              <Button loading={forking} onClick={() => void onStartAnnotate()}>
                手动标注
              </Button>
              {publishOptions.length > 0 ? (
                <Button type="primary" onClick={() => void openPublish()}>
                  {published ? '更新发布' : '发布'}
                </Button>
              ) : null}
              {published ? (
                <Button danger loading={unpublishing} onClick={() => void onUnpublish()}>
                  下架
                </Button>
              ) : null}
            </>
          )}
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
            <Typography.Text strong>版本</Typography.Text>
            <Select
              style={{ width: 200 }}
              value={version}
              loading={switching}
              options={versionInfos.map((v) => ({
                value: v.version,
                label: versionOptionLabel(v.label, v.version, publishedVersion),
              }))}
              onChange={(v) => void onSwitchVersion(v)}
            />
            <Typography.Text type="secondary">
              {editing ? '编辑中' : '已定稿'}
              {barNote ? ` · ${barNote}` : ''}
            </Typography.Text>
          </Space>
        </div>
      ) : null}

      <Card className="page-card" title="片段" size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          {clipMeta.map((c) => (
            <Button
              key={c.clip_id}
              type={c.clip_id === activeClipId ? 'primary' : 'default'}
              onClick={() => switchClip(c.clip_id)}
            >
              {c.source_filename || c.clip_id.slice(0, 8)}
              {c.clip_id === entryClipId ? ' · 入口' : ''}
            </Button>
          ))}
          {editing ? (
            <Upload
              accept="video/mp4,video/*"
              showUploadList={false}
              beforeUpload={(file) => {
                void onUploadClip(file)
                return false
              }}
              disabled={uploading}
            >
              <Button loading={uploading}>添加片段</Button>
            </Upload>
          ) : null}
        </Space>
        {activeClipId ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {editing ? (
              <div>
                <Button
                  type="primary"
                  disabled={entryClipId === activeClipId}
                  onClick={() => {
                    setEntryClipId(activeClipId)
                    setStory((prev) =>
                      prev ? { ...prev, entry_clip_id: activeClipId } : prev,
                    )
                    messageApi.success('已设为入口')
                  }}
                >
                  {entryClipId === activeClipId ? '当前为入口' : '设为入口'}
                </Button>
              </div>
            ) : null}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Typography.Text type="secondary">播完后跳到</Typography.Text>
              <Select
                style={{ minWidth: 200 }}
                disabled={!editing}
                allowClear
                placeholder="无"
                value={clipOnEnd?.clip_id}
                options={clipMeta.map((c) => ({
                  value: c.clip_id,
                  label: c.source_filename || c.clip_id.slice(0, 8),
                }))}
                onChange={(clipId) => {
                  setClipOnEnd(clipId ? { action: 'goto', clip_id: clipId } : undefined)
                }}
              />
            </div>
          </div>
        ) : null}
        {!clipMeta.length ? (
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            先上传至少一个片段，再标注互动与跳转。
          </Typography.Paragraph>
        ) : null}
      </Card>

      {!activeClipId ? (
        <Empty description="请添加片段" />
      ) : (
        <>
          <Card className="page-card" title="标注预览" size="small">
            <PreviewPlayer
              runId={id}
              clipId={activeClipId}
              gates={rows}
              durationMs={durationMs}
              mode={editing ? 'annotate' : 'preview'}
              selectedIndex={selectedIndex}
              onSelectGate={setSelectedIndex}
              onPlayheadChange={setPlayheadMs}
              onAddAtPlayhead={editing ? addAtPlayhead : undefined}
            />
          </Card>

          <Card className="page-card" title="选中互动" size="small">
            {!selected ? (
              <Empty description="先在进度条加点或选中一个互动点" />
            ) : (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Space wrap>
                  <Typography.Text type="secondary">时刻 (s)</Typography.Text>
                  <InputNumber
                    min={0}
                    step={0.033}
                    precision={3}
                    disabled={!editing}
                    value={Number((selected.gate_at_ms / 1000).toFixed(3))}
                    onChange={(n) =>
                      updateSelected({ gate_at_ms: Math.max(0, Math.round(Number(n || 0) * 1000)) })
                    }
                  />
                  <Typography.Text type="secondary">结束 (s)</Typography.Text>
                  <InputNumber
                    min={Number((selected.gate_at_ms / 1000).toFixed(3))}
                    step={0.033}
                    precision={3}
                    disabled={!editing}
                    value={
                      typeof selected.gate_end_ms === 'number'
                        ? Number((selected.gate_end_ms / 1000).toFixed(3))
                        : null
                    }
                    onChange={(n) =>
                      updateSelected({
                        gate_end_ms:
                          n == null
                            ? undefined
                            : Math.max(selected.gate_at_ms, Math.round(Number(n) * 1000)),
                      })
                    }
                  />
                  {editing ? (
                    <Button size="small" danger onClick={removeSelected}>
                      删除此点
                    </Button>
                  ) : null}
                </Space>

                <div>
                  <Typography.Text type="secondary">互动动作</Typography.Text>
                  <div className="gesture-grid" style={{ marginTop: 8 }}>
                    {GESTURES.map((g) => (
                      <button
                        key={g.value}
                        type="button"
                        disabled={!editing}
                        className={
                          !selected.custom_action && selected.gesture === g.value ? 'on' : undefined
                        }
                        onClick={() =>
                          updateSelected({
                            gesture: g.value,
                            custom_action: false,
                            action_description: undefined,
                          })
                        }
                      >
                        {g.label} <span className="gesture-code">{g.value}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={!editing}
                      className={selected.custom_action ? 'on custom-action' : 'custom-action'}
                      onClick={() => updateSelected({ gesture: 'tap', custom_action: true })}
                    >
                      自定义动作 <span className="gesture-code">按点击处理</span>
                    </button>
                  </div>
                  {selected.custom_action ? (
                    <Input
                      style={{ marginTop: 10 }}
                      disabled={!editing}
                      value={selected.action_description || ''}
                      maxLength={80}
                      showCount
                      onChange={(e) => updateSelected({ action_description: e.target.value })}
                      placeholder="描述用户需要执行的动作"
                    />
                  ) : null}
                </div>

                <div>
                  <Typography.Text type="secondary">Hint</Typography.Text>
                  <Input
                    style={{ marginTop: 8 }}
                    disabled={!editing}
                    value={selected.hint || ''}
                    maxLength={40}
                    showCount
                    onChange={(e) => updateSelected({ hint: e.target.value })}
                  />
                </div>

                <ClipOutcomesEditor
                  value={selected.outcomes}
                  clips={clipMeta}
                  currentClipId={activeClipId}
                  disabled={!editing}
                  onChange={(outcomes) => updateSelected({ outcomes })}
                />
              </Space>
            )}
          </Card>

          <Card className="page-card" title="版本备注" size="small">
            <Input.TextArea
              rows={2}
              disabled={!editing}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              showCount
              placeholder="可选"
            />
          </Card>
        </>
      )}

      <Modal
        title={published ? '更新发布' : '发布故事'}
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
                label: versionOptionLabel(v.label, v.version, publishedVersion),
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
            将《{title}》{publishVersion || '所选版本'}发布到所选 App 账号。
            Feed 权重：{feedWeight}；教学视频：{isTutorial ? '是' : '否'}（可在页头修改）
          </Typography.Paragraph>
        </Space>
      </Modal>
    </>
  )
}
