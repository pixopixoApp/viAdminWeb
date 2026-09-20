import { Button, Card, Empty, Input, Select, Space, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { isServiceUnavailableError } from '../apiError'
import InteractionEditorWorkspace from '../components/editor/InteractionEditorWorkspace'
import InteractionInspector, { patchForGesture } from '../components/editor/InteractionInspector'
import { adminInteractionLabel } from '../components/editor/interactionCopy'
import {
  EDITOR_FRAME_MS,
  snapToEditorFrame,
} from '../components/editor/timelineUtils'
import useInteractionHistory from '../components/editor/useInteractionHistory'
import ServiceBusyCard from '../components/ServiceBusyCard'
import { normalizeVisionConfig } from '../components/VisionInteractionFields'
import { annotateApi, runsApi } from '../services/api'
import type { Interaction, InteractionPatch, SaveStatus } from '../types/interaction'
import {
  enforceInteractionTypeRules,
  isPinch,
  isSustainedPlaybackInteraction,
  normalizePinchDirection,
  normalizeRotationDirection,
  usesRotationDirection,
  versionOptionLabel,
} from '../types/interaction'
import type { AnnotateState, VersionInfo } from '../types/run'

export default function AnnotatePage() {
  const { id, version } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState<AnnotateState | null>(null)
  const [displayTitle, setDisplayTitle] = useState('')
  const [sourceFilename, setSourceFilename] = useState('')
  const [publishedVersion, setPublishedVersion] = useState<string | null>(null)
  const [versionInfos, setVersionInfos] = useState<VersionInfo[]>([])
  const [rows, setRows] = useState<Interaction[]>([])
  const [note, setNote] = useState('')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [playheadMs, setPlayheadMs] = useState(0)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [finalizing, setFinalizing] = useState(false)
  const [loadUnavailable, setLoadUnavailable] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const skipAutosave = useRef(true)
  const saveGen = useRef(0)
  const playheadMsRef = useRef(0)
  playheadMsRef.current = playheadMs

  const restoreSelection = useCallback((nextRows: Interaction[]) => {
    if (nextRows.length === 0) {
      setSelectedIndex(null)
      return
    }
    const nearest = nextRows.reduce((best, row, index) => (
      Math.abs(row.gate_at_ms - playheadMsRef.current)
        < Math.abs(nextRows[best].gate_at_ms - playheadMsRef.current)
        ? index
        : best
    ), 0)
    setSelectedIndex(nearest)
  }, [])
  const {
    commitRows,
    undo,
    redo,
    resetHistory,
    canUndo,
    canRedo,
  } = useInteractionHistory(setRows, restoreSelection)

  const load = useCallback(async () => {
    if (!id || !version) return
    setLoading(true)
    setLoadUnavailable(false)
    try {
      const [data, detail] = await Promise.all([
        annotateApi.getState(id, version),
        runsApi.get(id).catch(() => null),
      ])
      if (!data.editing) {
        messageApi.info('该版本已定稿')
        navigate(`/runs/${id}`, { replace: true })
        return
      }
      skipAutosave.current = true
      setState(data)
      setDisplayTitle(String(
        detail?.run?.title
        || detail?.media?.title
        || detail?.media?.filename
        || `手动标注 · ${data.label}`,
      ))
      setSourceFilename(String(detail?.media?.filename || ''))
      setPublishedVersion(detail?.run?.published_version || null)
      setVersionInfos(detail?.version_infos || [])
      const nextRows = [...(data.timeline?.interactions || [])]
        .map(enforceInteractionTypeRules)
        .sort((left, right) => left.gate_at_ms - right.gate_at_ms)
      setRows(nextRows)
      resetHistory()
      setNote(data.note || '')
      setSelectedIndex(nextRows.length > 0 ? 0 : null)
      setSaveStatus('idle')
      setLoading(false)
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '加载失败')
      if (isServiceUnavailableError(error)) setLoadUnavailable(true)
      else navigate(`/runs/${id}`, { replace: true })
      setLoading(false)
    }
  }, [id, messageApi, navigate, resetHistory, version])

  useEffect(() => {
    void load()
  }, [load])

  const timelinePayload = useMemo(() => ({
    ...(state?.timeline || {}),
    interactions: rows.map((row) => ({
      gesture: row.gesture,
      gate_at_ms: Math.round(row.gate_at_ms),
      ...(typeof row.gate_end_ms === 'number'
        ? { gate_end_ms: Math.round(row.gate_end_ms) }
        : {}),
      ...(row.gesture === 'multi_tap' ? { tap_count: row.tap_count ?? 3 } : {}),
      ...(row.hint ? { hint: row.hint } : {}),
      ...(row.pause_video === false ? { pause_video: false } : { pause_video: true }),
      ...(usesRotationDirection(row)
        ? { rotation_direction: normalizeRotationDirection(row.rotation_direction) }
        : {}),
      ...(isPinch(row)
        ? { pinch_direction: normalizePinchDirection(row.pinch_direction) }
        : {}),
      ...(['camera_motion', 'camera_continuous'].includes(row.gesture)
        ? {
            vision: normalizeVisionConfig(row.vision, row.gesture),
            vision_resolution: row.vision_resolution || { target_source: 'operator' as const },
          }
        : {}),
      ...(row.custom_action ? { custom_action: true } : {}),
      ...(row.action_description ? { action_description: row.action_description } : {}),
      ...(row.gameplay_description ? { gameplay_description: row.gameplay_description } : {}),
      ...(typeof row.reaction_start_ms === 'number'
        ? { reaction_start_ms: row.reaction_start_ms }
        : {}),
      ...(typeof row.reaction_end_ms === 'number'
        ? { reaction_end_ms: row.reaction_end_ms }
        : {}),
    })),
  }), [rows, state?.timeline])

  const persist = useCallback(async () => {
    if (!id || !version) return
    const generation = ++saveGen.current
    setSaveStatus('saving')
    try {
      const data = await annotateApi.saveState(id, version, timelinePayload, note)
      if (generation !== saveGen.current) return
      skipAutosave.current = true
      setState(data)
      const nextRows = [...(data.timeline?.interactions || [])]
        .map(enforceInteractionTypeRules)
        .sort((left, right) => left.gate_at_ms - right.gate_at_ms)
      setRows(nextRows)
      setNote(data.note || '')
      restoreSelection(nextRows)
      setSaveStatus('saved')
    } catch (error) {
      if (generation !== saveGen.current) return
      setSaveStatus('error')
      messageApi.error(error instanceof Error ? error.message : '自动保存失败')
    }
  }, [id, messageApi, note, restoreSelection, timelinePayload, version])

  useEffect(() => {
    if (skipAutosave.current) {
      skipAutosave.current = false
      return
    }
    setSaveStatus('dirty')
    const timer = window.setTimeout(() => void persist(), 500)
    return () => window.clearTimeout(timer)
  }, [note, persist, rows])

  async function onSwitchVersion(nextVersion: string) {
    if (!id || !version || nextVersion === version) return
    const target = versionInfos.find((item) => item.version === nextVersion)
    setSwitching(true)
    try {
      await runsApi.switchRunVersion(id, nextVersion)
      navigate(
        target?.editing ? `/runs/${id}/annotate/${nextVersion}` : `/runs/${id}`,
        { replace: true },
      )
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '切换失败')
    } finally {
      setSwitching(false)
    }
  }

  async function onSaveTitle(next: string) {
    if (!id) return
    const text = next.trim()
    if (!text || text === displayTitle) return
    try {
      const updated = await runsApi.updateRunTitle(id, text)
      setDisplayTitle(updated.title || text)
      messageApi.success('标题已更新')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '标题保存失败')
    }
  }

  async function onFinalize() {
    if (!id || !version) return
    if (rows.some((row) => row.custom_action && !row.action_description?.trim())) {
      messageApi.warning('请补充自定义互动动作的描述')
      return
    }
    setFinalizing(true)
    try {
      await annotateApi.finalize(id, version, timelinePayload, note)
      messageApi.success(`已定稿 ${version}`)
      navigate(`/runs/${id}`, { replace: true })
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '定稿失败')
    } finally {
      setFinalizing(false)
    }
  }

  function updateInteractionAt(
    targetIndex: number,
    patch: InteractionPatch,
  ) {
    commitRows((previous) => {
      const current = previous[targetIndex]
      if (!current) return previous
      const hasPatchedEnd = 'gate_end_ms' in patch
      const { gate_end_ms: patchEnd, ...patchWithoutEnd } = patch
      const gateAtMs = Math.round(Number(patch.gate_at_ms ?? current.gate_at_ms) || 0)
      const patchedEnd = hasPatchedEnd
        ? patchEnd == null
          ? undefined
          : Math.round(Number(patchEnd) || 0)
        : current.gate_end_ms
      let updated = enforceInteractionTypeRules({
        ...current,
        ...patchWithoutEnd,
        gate_at_ms: gateAtMs,
        ...(patchedEnd === undefined ? {} : { gate_end_ms: patchedEnd }),
      })
      if (patchedEnd === undefined) delete updated.gate_end_ms
      else {
        const minimum = isSustainedPlaybackInteraction(updated) ? gateAtMs + 1 : gateAtMs
        if (patchedEnd < minimum) return previous
        updated = { ...updated, gate_end_ms: patchedEnd }
      }
      if (previous.some((row, index) => index !== targetIndex && row.gate_at_ms === gateAtMs)) {
        messageApi.warning('该时刻已有互动点')
        return previous
      }
      const next = previous
        .map((row, index) => (index === targetIndex ? updated : row))
        .sort((left, right) => left.gate_at_ms - right.gate_at_ms)
      setSelectedIndex(next.indexOf(updated))
      return next
    })
  }

  function updateSelected(patch: InteractionPatch) {
    if (selectedIndex != null) updateInteractionAt(selectedIndex, patch)
  }

  function addInteractionAt(gestureValue: string, atMs: number) {
    const mediaDurationMs = Number(state?.timeline?.media?.duration_ms || 0) || undefined
    commitRows((previous) => {
      const snappedMs = snapToEditorFrame(atMs, mediaDurationMs)
      const existingIndex = previous.findIndex((row) => (
        Math.round(row.gate_at_ms / EDITOR_FRAME_MS)
          === Math.round(snappedMs / EDITOR_FRAME_MS)
      ))
      const existing = existingIndex >= 0 ? previous[existingIndex] : undefined
      let item = enforceInteractionTypeRules({
        gate_at_ms: existing?.gate_at_ms ?? snappedMs,
        gesture: 'tap',
        hint: '',
        ...(existing?.gameplay_description
          ? { gameplay_description: existing.gameplay_description }
          : {}),
        ...(typeof existing?.reaction_start_ms === 'number'
          ? { reaction_start_ms: existing.reaction_start_ms }
          : {}),
        ...(typeof existing?.reaction_end_ms === 'number'
          ? { reaction_end_ms: existing.reaction_end_ms }
          : {}),
        ...(existing?.cue ? { cue: existing.cue } : {}),
        ...patchForGesture(gestureValue),
      } as Interaction)
      if (
        existing
        && isSustainedPlaybackInteraction(existing)
        && isSustainedPlaybackInteraction(item)
        && typeof existing.gate_end_ms === 'number'
      ) {
        item = { ...item, gate_end_ms: existing.gate_end_ms }
      }
      const next = (existingIndex >= 0
        ? previous.map((row, index) => (index === existingIndex ? item : row))
        : [...previous, item])
        .sort((left, right) => left.gate_at_ms - right.gate_at_ms)
      setSelectedIndex(next.indexOf(item))
      if (existing) {
        messageApi.success(
          `已将当前帧的「${adminInteractionLabel(existing)}」替换为「${adminInteractionLabel(item)}」，可撤销`,
        )
      }
      return next
    })
  }

  function removeSelected() {
    if (selectedIndex == null) return
    commitRows((previous) => {
      const next = previous.filter((_, index) => index !== selectedIndex)
      setSelectedIndex(next.length === 0 ? null : Math.min(selectedIndex, next.length - 1))
      return next
    })
  }

  if (loading && !state) return <Card loading />
  if (loadUnavailable && !state) return <ServiceBusyCard onRetry={load} />
  if (!state || !id) return <Empty />

  const selected = selectedIndex == null ? null : rows[selectedIndex] || null
  const durationMs = Number(state.timeline?.media?.duration_ms || 0) || undefined
  const selectedNextGate = selectedIndex == null ? undefined : rows[selectedIndex + 1]?.gate_at_ms
  const saveLabel = saveStatus === 'saving'
    ? '保存中…'
    : saveStatus === 'saved'
      ? '已自动保存'
      : saveStatus === 'dirty'
        ? '未保存'
        : saveStatus === 'error'
          ? '保存失败'
          : ''
  const currentInfo = versionInfos.find((item) => item.version === version)
  const kindLabel = (currentInfo?.kind || 'manual') === 'manual' ? '人工标注' : 'AI 生成'
  const barNote = (note || currentInfo?.note || '').trim()

  const projectPanel = (
    <div className="editor-project-panel">
      <Typography.Text strong>项目信息</Typography.Text>
      <dl>
        <div><dt>文件</dt><dd>{sourceFilename || '-'}</dd></div>
        <div><dt>版本</dt><dd>{state.label}</dd></div>
        <div><dt>时长</dt><dd>{durationMs == null ? '-' : `${(durationMs / 1000).toFixed(2)}s`}</dd></div>
        <div><dt>节点</dt><dd>{rows.length}</dd></div>
      </dl>
      <Typography.Text type="secondary">版本备注</Typography.Text>
      <Input.TextArea
        rows={5}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="可选，自动保存"
        maxLength={500}
        showCount
      />
    </div>
  )

  return (
    <div className="interaction-editor-page">
      {contextHolder}
      <Space
        className="interaction-editor-pagebar"
        style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}
        wrap
      >
        <Space size="middle">
          <Link to="/">返回列表</Link>
          <div>
            <Typography.Title
              level={4}
              style={{ margin: 0 }}
              className="page-title"
              editable={{
                tooltip: '点击修改标题',
                onChange: (value) => void onSaveTitle(value),
                triggerType: ['text', 'icon'],
              }}
            >
              {displayTitle || `手动标注 · ${state.label}`}
            </Typography.Title>
            <Typography.Text type="secondary">
              {sourceFilename ? `文件 ${sourceFilename}` : ''}
              {saveLabel ? ` · ${saveLabel}` : ''}
            </Typography.Text>
          </div>
          <Tag color={publishedVersion ? 'green' : 'blue'}>
            {publishedVersion ? '已发布' : '待发布'}
          </Tag>
          {versionInfos.length > 0 ? (
            <div className="editor-version-inline">
              <Typography.Text strong>版本</Typography.Text>
              <Select
                value={version}
                loading={switching}
                options={versionInfos.map((item) => ({
                  value: item.version,
                  label: versionOptionLabel(item.label, item.version, publishedVersion),
                }))}
                onChange={(value) => void onSwitchVersion(value)}
              />
              <Typography.Text
                className="editor-version-inline-note"
                type="secondary"
                title={barNote}
              >
                {kindLabel}{barNote ? ` · ${barNote}` : ''}
              </Typography.Text>
            </div>
          ) : null}
        </Space>
        <Space wrap>
          {saveStatus === 'error' ? (
            <Button size="small" onClick={() => void persist()}>重试保存</Button>
          ) : null}
          <Button type="primary" loading={finalizing} onClick={() => void onFinalize()}>
            定稿
          </Button>
        </Space>
      </Space>

      <InteractionEditorWorkspace
        runId={id}
        rows={rows}
        durationMs={durationMs}
        editing
        selectedIndex={selectedIndex}
        playheadMs={playheadMs}
        onSelectIndex={setSelectedIndex}
        onPlayheadChange={setPlayheadMs}
        onAddInteractionAt={addInteractionAt}
        onUpdateInteractionAt={updateInteractionAt}
        onRemoveSelected={removeSelected}
        inspector={(
          <InteractionInspector
            selected={selected}
            selectedIndex={selectedIndex}
            nextGateAtMs={selectedNextGate}
            durationMs={durationMs}
            playheadMs={playheadMs}
            editing
            onUpdate={updateSelected}
            onRemove={removeSelected}
            showGameplayDescription
          />
        )}
        contextTitle="项目信息"
        contextPanel={projectPanel}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
      />
    </div>
  )
}
