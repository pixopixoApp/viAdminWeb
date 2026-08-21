import {
  Card,
  Empty,
  Modal,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { storiesApi, runsApi, accountsApi } from '../services/api'
import type { Interaction, SaveStatus } from '../types/interaction'
import type {
  StoryState,
  VersionInfo,
  ClipOnEnd,
  PickAccount,
} from '../types/run'
import { parseClipOnEnd } from '../types/run'
import {
  StoryHeader,
  VersionManager,
  ClipList,
  ClipEditor,
  PublishPanel,
} from '../components/story-edit'
import { normalizeVisionConfig } from '../components/VisionInteractionFields'

type UploadStage = 'preparing' | 'uploading' | 'processing'

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
        const resp = await storiesApi.getRedirectVersion(id)
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
  const [uploadStage, setUploadStage] = useState<UploadStage | null>(null)
  const [uploadElapsedSeconds, setUploadElapsedSeconds] = useState(0)
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
  const uploadStartedAt = useRef<number | null>(null)

  const uploading = uploadStage !== null

  useEffect(() => {
    if (!uploadStage || uploadStartedAt.current == null) return
    const updateElapsed = () => {
      const startedAt = uploadStartedAt.current
      if (startedAt != null) {
        setUploadElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
      }
    }
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(timer)
  }, [uploadStage])

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
      const resp = await storiesApi.get(id, version)
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
            ...(r.pause_video === false ? { pause_video: false } : { pause_video: true }),
            ...(r.gesture === 'camera_motion'
              ? {
                  vision: normalizeVisionConfig(r.vision),
                  vision_resolution: r.vision_resolution || { target_source: 'operator' as const },
                }
              : {}),
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
      const resp = await storiesApi.save(id, {
        entry_clip_id: entryClipId,
        clips: clipsPayload,
        note,
        version,
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
        const resp = await storiesApi.save(id, {
          entry_clip_id: entryClipId,
          clips: nextClips,
          note,
          version,
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
      await runsApi.switchRunVersion(id, nextVersion)
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
      const resp = await storiesApi.createAnnotateVersion(id, version)
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
      const resp = await accountsApi.getPick(100)
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
      const job = await runsApi.queuePublish(id, publishVersion, publishUserId)
      messageApi.success('已进入发布队列，媒体备份完成后会自动发布')
      setPublishOpen(false)
      void runsApi.waitForPublish(id, job).then(async (result) => {
        const updated = result.ivapp?.updated
        messageApi.success(updated ? `已更新发布 ${result.version}` : `已发布 ${result.version}`)
        setPublishedVersion(result.version)
        await load()
      }).catch((err) => {
        messageApi.error(err instanceof Error ? err.message : '发布失败')
      })
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
          await runsApi.unpublish(id)
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
    uploadStartedAt.current = Date.now()
    setUploadElapsedSeconds(0)
    setUploadStage('preparing')
    try {
      const session = await storiesApi.createClipUploadSession(id, {
        filename: file.name,
        content_type: file.type || 'video/mp4',
        size_bytes: file.size,
        transport: 'local',
      })
      if (!session.upload?.url) throw new Error('服务端未返回有效的本地上传地址')
      setUploadStage('uploading')
      await storiesApi.uploadClipSource(id, session.session_id, file)
      setUploadStage('processing')
      const data = await storiesApi.finalizeClipUpload(id, session.session_id)
      skipAutosave.current = true
      applyStory(data.story, data.clip.clip_id)
      messageApi.success('片段已添加')
      setSaveStatus('idle')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploadStage(null)
      uploadStartedAt.current = null
      setUploadElapsedSeconds(0)
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
      const resp = await storiesApi.finalize(id, version)
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
      const updated = await runsApi.updateRunTitle(id, text)
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
      const updated = await runsApi.updateRunFeedWeightById(id, next)
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
      const updated = await runsApi.updateRunTutorial(id, next)
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
      <StoryHeader
        title={title}
        editing={editing}
        published={published}
        saveLabel={saveLabel}
        saveStatus={saveStatus}
        feedWeight={feedWeight}
        weightSaving={weightSaving}
        isTutorial={isTutorial}
        tutorialSaving={tutorialSaving}
        onSaveTitle={onSaveTitle}
        onSaveFeedWeight={onSaveFeedWeight}
        onSaveTutorial={onSaveTutorial}
        onRetrySave={() => void persist()}
        onFinalize={onFinalize}
        finalizing={finalizing}
        onStartAnnotate={onStartAnnotate}
        forking={forking}
        publishOptionsLength={publishOptions.length}
        onOpenPublish={() => void openPublish()}
        unpublishing={unpublishing}
        onUnpublish={onUnpublish}
      />

      <VersionManager
        version={version}
        versionInfos={versionInfos}
        publishedVersion={publishedVersion}
        editing={editing}
        switching={switching}
        onSwitchVersion={onSwitchVersion}
        barNote={barNote}
      />

      <ClipList
        clipMeta={clipMeta}
        activeClipId={activeClipId}
        entryClipId={entryClipId}
        editing={editing}
        uploading={uploading}
        uploadStatusText={
          uploadStage === 'preparing'
            ? `正在校验文件… ${uploadElapsedSeconds}s`
            : uploadStage === 'uploading'
              ? `正在上传到 OSS… ${uploadElapsedSeconds}s`
              : uploadStage === 'processing'
                ? `服务器正在检查视频，跨境 OSS 可能稍慢，请勿刷新或重复上传 · ${uploadElapsedSeconds}s`
                : ''
        }
        onUploadClip={onUploadClip}
        onSwitchClip={switchClip}
        onSetEntryClip={() => {
          setEntryClipId(activeClipId)
          setStory((prev) =>
            prev ? { ...prev, entry_clip_id: activeClipId } : prev,
          )
        }}
        clipOnEnd={clipOnEnd}
        onClipOnEndChange={setClipOnEnd}
      />

      <ClipEditor
        runId={id}
        activeClipId={activeClipId}
        rows={rows}
        durationMs={durationMs}
        editing={editing}
        selectedIndex={selectedIndex}
        onSelectIndex={setSelectedIndex}
        onPlayheadChange={setPlayheadMs}
        onAddAtPlayhead={addAtPlayhead}
        onUpdateSelected={updateSelected}
        onRemoveSelected={removeSelected}
        clipMeta={clipMeta}
        note={note}
        onNoteChange={setNote}
      />

      <PublishPanel
        publishOpen={publishOpen}
        onClose={() => setPublishOpen(false)}
        onPublish={() => void onPublish()}
        publishing={publishing}
        publishVersion={publishVersion}
        publishOptions={publishOptions}
        publishedVersion={publishedVersion}
        onPublishVersionChange={setPublishVersion}
        publishUserId={publishUserId}
        pickAccounts={pickAccounts}
        pickLoading={pickLoading}
        onPublishUserIdChange={setPublishUserId}
        title={title}
        feedWeight={feedWeight}
        isTutorial={isTutorial}
        published={published}
      />
    </>
  )
}
