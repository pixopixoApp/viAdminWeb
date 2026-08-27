import {
  Card,
  Empty,
  Modal,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { storiesApi, runsApi, accountsApi } from '../services/api'
import {
  enforceInteractionTypeRules,
  isSustainedPlaybackInteraction,
  type Interaction,
  type SaveStatus,
} from '../types/interaction'
import type {
  StoryState,
  VersionInfo,
  ClipOnEnd,
  PickAccount,
  SimpleStoryConfig,
  SimpleStoryRole,
  StoryEditorMode,
} from '../types/run'
import { parseClipOnEnd } from '../types/run'
import {
  StoryHeader,
  VersionManager,
  ClipList,
  ClipEditor,
  SimpleStoryEditor,
  PublishPanel,
} from '../components/story-edit'
import { normalizeVisionConfig } from '../components/VisionInteractionFields'
import ServiceBusyCard from '../components/ServiceBusyCard'
import { isServiceUnavailableError } from '../apiError'

type UploadStage = 'preparing' | 'uploading' | 'processing'

function emptySimpleConfig(): SimpleStoryConfig {
  return {
    roles: {},
    branch_interaction_index: null,
    response_window_ms: 5000,
    failure_behavior: 'retry_previous_point',
    complete: false,
    issues: ['请上传 A 起始片段', '请上传 B 成功片段', '请上传 C 失败片段'],
  }
}

function serializeInteraction(row: Interaction) {
  return {
    gesture: row.gesture,
    gate_at_ms: Math.round(row.gate_at_ms),
    ...(!isSustainedPlaybackInteraction(row) && typeof row.gate_end_ms === 'number'
      ? { gate_end_ms: Math.round(row.gate_end_ms) }
      : {}),
    ...(row.hint ? { hint: row.hint } : {}),
    ...(row.pause_video === false ? { pause_video: false } : { pause_video: true }),
    ...(row.gesture === 'camera_motion'
      ? {
          vision: normalizeVisionConfig(row.vision),
          vision_resolution: row.vision_resolution || { target_source: 'operator' as const },
        }
      : {}),
    ...(row.custom_action ? { custom_action: true } : {}),
    ...(row.action_description ? { action_description: row.action_description } : {}),
    ...(row.gameplay_description ? { gameplay_description: row.gameplay_description } : {}),
    ...(!isSustainedPlaybackInteraction(row) && row.outcomes
      ? {
          outcomes: {
            success: row.outcomes.success || { action: 'continue' as const },
            fail: row.outcomes.fail || { action: 'continue' as const },
          },
        }
      : {}),
  }
}

/** Redirect /stories/:id → /stories/:id/{analysis_version} */
export function StoryRedirect() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [target, setTarget] = useState<string | null>(null)
  const [loadUnavailable, setLoadUnavailable] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoadUnavailable(false)
    void (async () => {
      try {
        const resp = await storiesApi.getRedirectVersion(id)
        if (cancelled) return
        setTarget(resp.run.analysis_version || '0.0.1')
      } catch (err) {
        if (cancelled) return
        if (isServiceUnavailableError(err)) {
          setLoadUnavailable(true)
        } else {
          navigate('/', { replace: true })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, navigate, retryNonce])

  if (loadUnavailable) {
    return (
      <ServiceBusyCard
        onRetry={() => {
          setLoadUnavailable(false)
          setRetryNonce((value) => value + 1)
        }}
      />
    )
  }
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
  const [loadUnavailable, setLoadUnavailable] = useState(false)
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
  const [storyEditorMode, setStoryEditorMode] = useState<StoryEditorMode>('advanced')
  const [simpleConfig, setSimpleConfig] = useState<SimpleStoryConfig>(() => emptySimpleConfig())
  const [uploadingRole, setUploadingRole] = useState<SimpleStoryRole | null>(null)
  const [upgradingEditor, setUpgradingEditor] = useState(false)
  const [feedWeight, setFeedWeight] = useState(0)
  const [weightSaving, setWeightSaving] = useState(false)
  const [isTutorial, setIsTutorial] = useState(false)
  const [tutorialSaving, setTutorialSaving] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const skipAutosave = useRef(true)
  const saveGen = useRef(0)
  const uploadStartedAt = useRef<number | null>(null)
  const selectedIndexRef = useRef<number | null>(null)

  const uploading = uploadStage !== null

  useEffect(() => {
    selectedIndexRef.current = selectedIndex
  }, [selectedIndex])

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

  const applyStory = useCallback((
    data: StoryState,
    preferClip?: string,
    preferInteractionIndex?: number | null,
  ) => {
    setStory(data)
    if (data.editor_mode) setStoryEditorMode(data.editor_mode)
    setSimpleConfig(data.simple_config || emptySimpleConfig())
    setNote(data.note || '')
    setEntryClipId(data.entry_clip_id || '')
    const simpleAId = data.simple_config?.roles.a || data.entry_clip_id || ''
    const clip = data.editor_mode === 'simple_abc'
      ? simpleAId && data.clips[simpleAId] ? simpleAId : ''
      : preferClip && data.clips[preferClip]
        ? preferClip
        : data.entry_clip_id || data.clip_meta[0]?.clip_id || ''
    setActiveClipId(clip)
    const interactions = [...(data.clips[clip]?.timeline?.interactions || [])].map(
      enforceInteractionTypeRules,
    ).sort(
      (a, b) => a.gate_at_ms - b.gate_at_ms,
    )
    setRows(interactions)
    setClipOnEnd(parseClipOnEnd(data.clips[clip]?.on_end))
    setSelectedIndex(
      interactions.length
        ? Math.min(preferInteractionIndex ?? 0, interactions.length - 1)
        : null,
    )
  }, [])

  const load = useCallback(async () => {
    if (!id || !version) return
    setLoading(true)
    setLoadUnavailable(false)
    try {
      const resp = await storiesApi.get(id, version)
      skipAutosave.current = true
      setStoryEditorMode(resp.run.editor_mode || resp.story.editor_mode || 'advanced')
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
      if (isServiceUnavailableError(err)) {
        setLoadUnavailable(true)
      } else {
        navigate('/', { replace: true })
      }
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
          interactions: rows.map(serializeInteraction),
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
    if (!id || !version || !story?.editing || storyEditorMode !== 'advanced') return false
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
      return true
    } catch (err) {
      if (gen !== saveGen.current) return
      setSaveStatus('error')
      messageApi.error(err instanceof Error ? err.message : '保存失败')
      return false
    }
  }, [id, version, story?.editing, storyEditorMode, entryClipId, clipsPayload, note, activeClipId, applyStory, messageApi])

  const persistSimple = useCallback(async () => {
    if (!id || !version || !story?.editing || storyEditorMode !== 'simple_abc') return false
    const gen = ++saveGen.current
    setSaveStatus('saving')
    try {
      const resp = await storiesApi.saveSimpleConfig(id, {
        version,
        interactions: rows.map(serializeInteraction),
        branch_interaction_index: simpleConfig.branch_interaction_index,
        response_window_ms: simpleConfig.response_window_ms,
        failure_behavior: simpleConfig.failure_behavior,
        note,
      })
      if (gen !== saveGen.current) return false
      skipAutosave.current = true
      applyStory(resp.story, resp.story.entry_clip_id, selectedIndexRef.current)
      setSaveStatus('saved')
      return true
    } catch (err) {
      if (gen !== saveGen.current) return false
      setSaveStatus('error')
      messageApi.error(err instanceof Error ? err.message : '保存失败')
      return false
    }
  }, [id, version, story?.editing, storyEditorMode, simpleConfig, rows, note, applyStory, messageApi])

  useEffect(() => {
    if (skipAutosave.current) {
      skipAutosave.current = false
      return
    }
    if (!story?.editing) return
    setSaveStatus('dirty')
    const timer = window.setTimeout(() => {
      void (storyEditorMode === 'simple_abc' ? persistSimple() : persist())
    }, 500)
    return () => window.clearTimeout(timer)
  }, [
    rows,
    note,
    entryClipId,
    clipOnEnd,
    simpleConfig,
    persist,
    persistSimple,
    story?.editing,
    storyEditorMode,
  ])

  function switchClip(clipId: string) {
    if (!story || clipId === activeClipId) return
    const nextClips = { ...clipsPayload }
    const nextStory = { ...story, clips: nextClips, entry_clip_id: entryClipId }
    setStory(nextStory)
    setActiveClipId(clipId)
    const interactions = [...(nextClips[clipId]?.timeline?.interactions || [])].map(
      enforceInteractionTypeRules,
    ).sort(
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

  async function onUploadClip(file: File, role?: SimpleStoryRole) {
    if (!id || !version) return false
    uploadStartedAt.current = Date.now()
    setUploadingRole(role || null)
    setUploadElapsedSeconds(0)
    setUploadStage('preparing')
    try {
      const session = await storiesApi.createClipUploadSession(id, {
        filename: file.name,
        content_type: file.type || 'video/mp4',
        size_bytes: file.size,
        transport: 'local',
        version,
        ...(role ? { role } : {}),
      })
      if (!session.upload?.url) throw new Error('服务端未返回有效的本地上传地址')
      setUploadStage('uploading')
      await storiesApi.uploadClipSource(id, session.session_id, file)
      setUploadStage('processing')
      const data = await storiesApi.finalizeClipUpload(id, session.session_id)
      skipAutosave.current = true
      applyStory(
        data.story,
        role ? data.story.entry_clip_id : data.clip.clip_id,
        role && role !== 'a' ? selectedIndexRef.current : undefined,
      )
      const warnings = data.story.warnings || []
      if (warnings.length) messageApi.warning(warnings.join('；'))
      else messageApi.success(role ? `${role.toUpperCase()} 片段已保存` : '片段已添加')
      setSaveStatus('idle')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploadStage(null)
      setUploadingRole(null)
      uploadStartedAt.current = null
      setUploadElapsedSeconds(0)
    }
    return false
  }

  async function onUploadSimpleRole(role: SimpleStoryRole, file: File) {
    if (role === 'a' && simpleConfig.roles.a && rows.length) {
      Modal.confirm({
        title: '替换主片段 A？',
        content: '替换后会清空 A 中已有的互动节点和分支挑战绑定，B、C 片段会保留。',
        okText: '确认替换',
        cancelText: '取消',
        onOk: async () => {
          await onUploadClip(file, role)
        },
      })
      return false
    }
    return onUploadClip(file, role)
  }

  function onUpgradeEditor() {
    if (!id) return
    Modal.confirm({
      title: '升级到高级模式？',
      content: '升级后会保留当前 A/B/C 内容，但不能再返回简化模式。',
      okText: '确认升级',
      cancelText: '取消',
      onOk: async () => {
        setUpgradingEditor(true)
        try {
          const saved = await persistSimple()
          if (!saved) throw new Error('当前配置保存失败，请先处理后再升级')
          await storiesApi.upgradeEditor(id)
          setStoryEditorMode('advanced')
          skipAutosave.current = true
          await load()
          messageApi.success('已升级到高级模式')
        } catch (err) {
          messageApi.error(err instanceof Error ? err.message : '升级失败')
          throw err
        } finally {
          setUpgradingEditor(false)
        }
      },
    })
  }

  async function onFinalize() {
    if (!id || !version) return
    if (!entryClipId) {
      messageApi.warning('请先设置入口片段')
      return
    }
    setFinalizing(true)
    try {
      const saved = await (storyEditorMode === 'simple_abc' ? persistSimple() : persist())
      if (!saved) return
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
    const cur = rows[selectedIndex]
    if (!cur) return
    const branchRow = simpleConfig.branch_interaction_index == null
      ? null
      : rows[simpleConfig.branch_interaction_index] || null
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
    let updated: Interaction = {
      ...cur,
      ...patch,
      gate_at_ms,
      ...(gate_end_ms !== undefined ? { gate_end_ms } : { gate_end_ms: undefined }),
    }
    updated = enforceInteractionTypeRules(updated)
    if (gate_end_ms === undefined || isSustainedPlaybackInteraction(updated)) {
      delete updated.gate_end_ms
    }
    const next = rows.map((row, index) => (index === selectedIndex ? updated : row)).sort(
      (a, b) => a.gate_at_ms - b.gate_at_ms,
    )
    const nextBranchRow = branchRow === cur ? updated : branchRow
    const branchWasInvalidated =
      nextBranchRow != null && isSustainedPlaybackInteraction(nextBranchRow)
    setRows(next)
    setSelectedIndex(next.indexOf(updated))
    setSimpleConfig((previous) => ({
      ...previous,
      branch_interaction_index:
        nextBranchRow && !branchWasInvalidated ? next.indexOf(nextBranchRow) : null,
      complete: false,
    }))
    if (branchWasInvalidated) {
      messageApi.warning('持续播放类互动不能作为分支挑战，请在上方重新选择挑战节点')
    }
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
    const branchRow = simpleConfig.branch_interaction_index == null
      ? null
      : rows[simpleConfig.branch_interaction_index] || null
    const next = [...rows, item].sort((a, b) => a.gate_at_ms - b.gate_at_ms)
    setRows(next)
    setSelectedIndex(next.indexOf(item))
    if (branchRow) {
      setSimpleConfig((previous) => ({
        ...previous,
        branch_interaction_index: next.indexOf(branchRow),
        complete: false,
      }))
    }
  }

  function removeSelected() {
    if (selectedIndex == null) return
    const removed = rows[selectedIndex]
    const branchRow = simpleConfig.branch_interaction_index == null
      ? null
      : rows[simpleConfig.branch_interaction_index] || null
    const next = rows.filter((_, index) => index !== selectedIndex)
    setRows(next)
    setSelectedIndex(next.length === 0 ? null : Math.min(selectedIndex, next.length - 1))
    setSimpleConfig((previous) => ({
      ...previous,
      branch_interaction_index:
        branchRow && branchRow !== removed ? next.indexOf(branchRow) : null,
      complete: false,
    }))
  }

  if (loading && !story) return <Card loading />
  if (loadUnavailable && !story) return <ServiceBusyCard onRetry={load} />
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
  const uploadStatusText =
    uploadStage === 'preparing'
      ? `正在校验文件… ${uploadElapsedSeconds}s`
      : uploadStage === 'uploading'
        ? `正在上传到 OSS… ${uploadElapsedSeconds}s`
        : uploadStage === 'processing'
          ? `服务器正在检查视频，跨境 OSS 可能稍慢，请勿刷新或重复上传 · ${uploadElapsedSeconds}s`
          : ''

  return (
    <>
      {contextHolder}
      <StoryHeader
        title={title}
        editing={editing}
        published={published}
        editorMode={storyEditorMode}
        saveLabel={saveLabel}
        saveStatus={saveStatus}
        feedWeight={feedWeight}
        weightSaving={weightSaving}
        isTutorial={isTutorial}
        tutorialSaving={tutorialSaving}
        onSaveTitle={onSaveTitle}
        onSaveFeedWeight={onSaveFeedWeight}
        onSaveTutorial={onSaveTutorial}
        onRetrySave={() => void (storyEditorMode === 'simple_abc' ? persistSimple() : persist())}
        onFinalize={onFinalize}
        finalizing={finalizing}
        finalizeDisabled={storyEditorMode === 'simple_abc' && !simpleConfig.complete}
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

      {storyEditorMode === 'simple_abc' ? (
        <>
          <SimpleStoryEditor
            story={story}
            config={simpleConfig}
            interactions={rows}
            editing={editing}
            uploadingRole={uploadingRole}
            uploadStatusText={uploadStatusText}
            upgrading={upgradingEditor}
            onUploadRole={onUploadSimpleRole}
            onBranchInteractionChange={(index) => setSimpleConfig((previous) => ({
              ...previous,
              branch_interaction_index: index,
              complete: false,
            }))}
            onResponseWindowChange={(responseWindowMs) => setSimpleConfig((previous) => ({
              ...previous,
              response_window_ms: responseWindowMs,
              complete: false,
            }))}
            onFailureBehaviorChange={(failureBehavior) => setSimpleConfig((previous) => ({
              ...previous,
              failure_behavior: failureBehavior,
              complete: false,
            }))}
            onNotice={(content) => messageApi.warning({
              content,
              className: 'story-centered-toast',
            })}
            onUpgrade={onUpgradeEditor}
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
            showOutcomes={false}
            branchInteractionIndex={simpleConfig.branch_interaction_index}
            previewTitle="主片段 A · 添加互动节点"
            editorTitle="选中 A 片段互动"
          />
        </>
      ) : (
        <>
          <ClipList
            clipMeta={clipMeta}
            activeClipId={activeClipId}
            entryClipId={entryClipId}
            editing={editing}
            uploading={uploading}
            uploadStatusText={uploadStatusText}
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
            showOutcomes
          />
        </>
      )}

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
