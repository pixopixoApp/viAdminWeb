import { Card, Empty, Modal, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { runsApi, engineApi, accountsApi } from '../services/api'
import { RANDOM_USER_MARKER, type RunDetail, type PlaybackMetrics, type PickAccount } from '../types/run'
import RunDetailHeader from '../components/run-detail/RunDetailHeader'
import RunDetailCoverModal from '../components/run-detail/RunDetailCoverModal'
import RunDetailPreview from '../components/run-detail/RunDetailPreview'
import RunDetailInteraction from '../components/run-detail/RunDetailInteraction'
import RunDetailPublish from '../components/run-detail/RunDetailPublish'

export default function RunDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<RunDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [coverEditOpen, setCoverEditOpen] = useState(false)
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
  const [playbackMetrics, setPlaybackMetrics] = useState<PlaybackMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [weightSaving, setWeightSaving] = useState(false)
  const [tutorialSaving, setTutorialSaving] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const loadPlaybackMetrics = useCallback(async () => {
    if (!id) return
    setMetricsLoading(true)
    try {
      const metrics = await runsApi.getMetrics(id)
      setPlaybackMetrics(metrics)
    } catch {
      setPlaybackMetrics(null)
    } finally {
      setMetricsLoading(false)
    }
  }, [id])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [detail, settings] = await Promise.all([
        runsApi.get(id),
        engineApi.getReady(),
      ])
      if (detail.run.content_mode === 'story') {
        navigate(`/stories/${id}/${detail.run.analysis_version || detail.versions?.[detail.versions.length - 1] || '0.0.1'}`, {
          replace: true,
        })
        return
      }
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
      if (detail.run.published_version) {
        void loadPlaybackMetrics()
      } else {
        setPlaybackMetrics(null)
      }
      setLoading(false)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载失败')
      setData(null)
      setLoading(false)
    }
  }, [id, loadPlaybackMetrics, messageApi, navigate])

  const loadPickAccounts = useCallback(async () => {
    setPickLoading(true)
    try {
      const resp = await accountsApi.getPick(100)
      const items = (resp.items || []).filter((a) => a.enabled)
      setPickAccounts(items)
      setPublishUserId((prev) => {
        if (prev && (prev === RANDOM_USER_MARKER || items.some((a) => a.user_id === prev))) return prev
        // 无绑定账号时默认随机发布
        return items[0]?.user_id || RANDOM_USER_MARKER
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

  useEffect(() => {
    if (!id || !data || !['queued', 'running'].includes(data.run.status)) return
    let polling = false
    const timer = window.setInterval(async () => {
      if (polling) return
      polling = true
      try {
        const detail = await runsApi.get(id)
        if (['queued', 'running'].includes(detail.run.status)) {
          setData(detail)
        } else {
          await load()
        }
      } catch {
        // Keep the current state visible and retry; the normal load path owns errors.
      } finally {
        polling = false
      }
    }, 2_000)
    return () => window.clearInterval(timer)
  }, [data?.run.status, id, load])

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
      const resp = await engineApi.getModels()
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
      await runsApi.switchRunVersion(id, version)
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
      const updated = await runsApi.updateRunFeedWeightById(id, next)
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
      const updated = await runsApi.updateRunTutorial(id, next)
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
      const job = await runsApi.queuePublish(id, publishVersion, publishUserId)
      messageApi.success('已进入发布队列，媒体备份完成后会自动发布')
      setPublishOpen(false)
      void runsApi.waitForPublish(id, job).then(async (result) => {
        const updated = result.ivapp?.updated
        messageApi.success(updated ? `已更新发布 ${result.version}` : `已发布 ${result.version}`)
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
      content: '将从 App 移除该视频，管理端「已发布版本」会清空。',
      okText: '下架',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setUnpublishing(true)
        try {
          await runsApi.unpublish(id)
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
      const updated = await runsApi.updateRunTitle(id, text)
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

  async function onSaveDescription(next: string) {
    if (!id || !data) return
    const text = next.trim()
    const current = String(data.run.description || '')
    if (text === current) return
    try {
      const updated = await runsApi.updateRunDescription(id, text)
      setData((prev) =>
        prev
          ? { ...prev, run: { ...prev.run, description: updated.description || '' } }
          : prev,
      )
      messageApi.success('作品简介已更新')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '作品简介保存失败')
    }
  }

  async function onReanalyze() {
    if (!id) return
    setReanalyzing(true)
    try {
      await runsApi.reanalyze(id, {
        version: reanalyzeVersion || undefined,
        model: reanalyzeModel || undefined,
        brief: reanalyzeBrief,
        note: reanalyzeNote || undefined,
      })
      messageApi.success(`已加入分析队列（${reanalyzeVersion} / ${reanalyzeModel}）`)
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
      const resp = await runsApi.startAnnotate(id, data.run.analysis_version)
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
  const generationStatus = {
    queued: { label: '排队中', color: 'default' },
    running: { label: '分析中', color: 'processing' },
    ready: { label: '分析完成', color: 'green' },
    failed: { label: '分析失败', color: 'red' },
    no_interaction: { label: '未发现互动', color: 'orange' },
    no_playable_plan: { label: '方案不可播放', color: 'orange' },
  }[data.run.status] || { label: data.run.status, color: 'default' }

  return (
    <>
      {contextHolder}
      <RunDetailHeader
        displayTitle={displayTitle}
        filename={String(data.media.filename || '')}
        coverUrl={data.run.cover_url || undefined}
        description={data.run.description || undefined}
        errorMessage={data.run.error_message}
        businessStatus={businessStatus}
        businessStatusColor={businessStatusColor}
        generationStatus={generationStatus}
        publishedAccountDisabled={data.run.published_user_enabled === false}
        publishVisible={publishOptions.length > 0}
        actionDisabled={busy}
        canPlay={canPlay}
        qrUrl={qrUrl}
        annotating={annotating}
        annotateDisabled={busy || !data.run.analysis_version}
        engineReady={engineReady}
        reanalyzeDisabled={busy}
        unpublishing={unpublishing}
        published={Boolean(published)}
        onSaveTitle={(v) => void onSaveTitle(v)}
        onSaveDescription={(v) => void onSaveDescription(v)}
        onEditCover={() => setCoverEditOpen(true)}
        onPublish={() => setPublishOpen(true)}
        onQrOpen={() => setQrOpen(true)}
        onStartAnnotate={() => void onStartAnnotate()}
        onReanalyze={() => void openReanalyze()}
        onUnpublish={() => void onUnpublish()}
      />

      <RunDetailPreview
        runId={data.run.id}
        gates={gates}
        durationMs={Number(data.media.duration_ms || 0) || undefined}
        visible={canPlay}
      />

      <RunDetailInteraction
        data={data}
        visible={!isManual}
      />

      <RunDetailPublish
        data={data}
        published={published || undefined}
        businessStatus={businessStatus}
        businessStatusColor={businessStatusColor}
        generationStatus={generationStatus}
        displayTitle={displayTitle}
        publishOptions={publishOptions}
        publishVersion={publishVersion}
        publishUserId={publishUserId}
        pickAccounts={pickAccounts}
        pickLoading={pickLoading}
        publishing={publishing}
        publishOpen={publishOpen}
        onPublish={() => void onPublish()}
        onPublishCancel={() => setPublishOpen(false)}
        onPublishVersionChange={setPublishVersion}
        onPublishUserIdChange={setPublishUserId}
        qrOpen={qrOpen}
        qrUrl={qrUrl}
        onQrClose={() => setQrOpen(false)}
        metricsLoading={metricsLoading}
        playbackMetrics={playbackMetrics}
        onRefreshMetrics={() => void loadPlaybackMetrics()}
        versionInfos={versionInfos}
        currentVersion={data.run.analysis_version || ''}
        currentNote={currentNote}
        isManual={isManual}
        busy={busy}
        switching={switching}
        onSwitchVersion={(v) => void onSwitchVersion(v)}
        weightSaving={weightSaving}
        onSaveFeedWeight={(n) => void onSaveFeedWeight(n)}
        tutorialSaving={tutorialSaving}
        onSaveTutorial={(b) => void onSaveTutorial(b)}
        reanalyzeOpen={reanalyzeOpen}
        reanalyzeVersion={reanalyzeVersion}
        reanalyzeModel={reanalyzeModel}
        reanalyzeBrief={reanalyzeBrief}
        reanalyzeNote={reanalyzeNote}
        reanalyzing={reanalyzing}
        modelOptions={modelOptions}
        modelsLoading={modelsLoading}
        onReanalyze={() => void onReanalyze()}
        onReanalyzeCancel={() => setReanalyzeOpen(false)}
        onReanalyzeVersionChange={setReanalyzeVersion}
        onReanalyzeModelChange={setReanalyzeModel}
        onReanalyzeBriefChange={setReanalyzeBrief}
        onReanalyzeNoteChange={setReanalyzeNote}
      />

      <RunDetailCoverModal
        open={coverEditOpen}
        run={data.run}
        onClose={() => setCoverEditOpen(false)}
        onSaved={(coverMediaObjectId, coverUrl) => {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  run: { ...prev.run, cover_media_object_id: coverMediaObjectId || null, cover_url: coverUrl || null },
                }
              : prev,
          )
        }}
      />
    </>
  )
}
