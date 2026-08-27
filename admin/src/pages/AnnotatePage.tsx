import {
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { annotateApi, runsApi } from '../services/api'
import type { Interaction, SaveStatus } from '../types/interaction'
import {
  enforceInteractionTypeRules,
  GESTURE_LABEL,
  isContinuousTap,
  isSustainedPlaybackInteraction,
  versionOptionLabel,
} from '../types/interaction'
import type { AnnotateState, VersionInfo } from '../types/run'
import PreviewPlayer from '../components/PreviewPlayer'
import VisionInteractionFields, {
  normalizeVisionConfig,
  VISION_TARGET_HINTS,
} from '../components/VisionInteractionFields'

const GESTURES = Object.entries(GESTURE_LABEL).map(([value, label]) => ({ value, label }))

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
  const [messageApi, contextHolder] = message.useMessage()
  const skipAutosave = useRef(true)
  const saveGen = useRef(0)

  const load = useCallback(async () => {
    if (!id || !version) return
    setLoading(true)
    try {
      const [data, detail] = await Promise.all([
        annotateApi.getState(id!, version!),
        runsApi.get(id!).catch(() => null),
      ])
      if (!data.editing) {
        messageApi.info('该版本已定稿')
        navigate(`/runs/${id}`, { replace: true })
        return
      }
      skipAutosave.current = true
      setState(data)
      setDisplayTitle(
        String(
          detail?.run?.title ||
            detail?.media?.title ||
            detail?.media?.filename ||
            `手动标注 · ${data.label}`,
        ),
      )
      setSourceFilename(String(detail?.media?.filename || ''))
      setPublishedVersion(detail?.run?.published_version || null)
      setVersionInfos(detail?.version_infos || [])
      const nextRows = [...(data.timeline?.interactions || [])].map(
        enforceInteractionTypeRules,
      ).sort(
        (a, b) => a.gate_at_ms - b.gate_at_ms,
      )
      setRows(nextRows)
      setNote(data.note || '')
      setSelectedIndex(nextRows.length > 0 ? 0 : null)
      setSaveStatus('idle')
      setLoading(false)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载失败')
      navigate(`/runs/${id}`, { replace: true })
      setLoading(false)
    }
  }, [id, version, messageApi, navigate])

  useEffect(() => {
    void load()
  }, [load])

  const timelinePayload = useMemo(
    () => ({
      ...(state?.timeline || {}),
      interactions: rows.map((r) => ({
        gesture: r.gesture,
        gate_at_ms: Math.round(r.gate_at_ms),
        ...(!isSustainedPlaybackInteraction(r) && typeof r.gate_end_ms === 'number'
          ? { gate_end_ms: Math.round(r.gate_end_ms) }
          : {}),
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
        ...(typeof r.reaction_start_ms === 'number' ? { reaction_start_ms: r.reaction_start_ms } : {}),
        ...(typeof r.reaction_end_ms === 'number' ? { reaction_end_ms: r.reaction_end_ms } : {}),
      })),
    }),
    [rows, state?.timeline],
  )

  const persist = useCallback(async () => {
    if (!id || !version) return
    const gen = ++saveGen.current
    setSaveStatus('saving')
    try {
      const data = await annotateApi.saveState(id!, version!, timelinePayload, note)
      if (gen !== saveGen.current) return
      skipAutosave.current = true
      setState(data)
      const nextRows = [...(data.timeline?.interactions || [])].sort(
        (a, b) => a.gate_at_ms - b.gate_at_ms,
      )
      setRows(nextRows)
      setNote(data.note || '')
      setSelectedIndex((prev) => {
        if (prev == null) return nextRows.length ? 0 : null
        return Math.min(prev, Math.max(0, nextRows.length - 1))
      })
      setSaveStatus('saved')
    } catch (err) {
      if (gen !== saveGen.current) return
      setSaveStatus('error')
      messageApi.error(err instanceof Error ? err.message : '自动保存失败')
    }
  }, [id, version, timelinePayload, note, messageApi])

  useEffect(() => {
    if (skipAutosave.current) {
      skipAutosave.current = false
      return
    }
    setSaveStatus('dirty')
    const timer = window.setTimeout(() => {
      void persist()
    }, 500)
    return () => window.clearTimeout(timer)
  }, [rows, note, persist])

  async function onSwitchVersion(nextVersion: string) {
    if (!id || !version || nextVersion === version) return
    const target = versionInfos.find((v) => v.version === nextVersion)
    setSwitching(true)
    try {
      await runsApi.switchRunVersion(id!, nextVersion)
      if (target?.editing) {
        navigate(`/runs/${id}/annotate/${nextVersion}`, { replace: true })
      } else {
        navigate(`/runs/${id}`, { replace: true })
      }
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '切换失败')
    } finally {
      setSwitching(false)
    }
  }

  async function onSaveTitle(next: string) {
    if (!id) return
    const text = next.trim()
    if (!text || text === displayTitle) return
    try {
      const updated = await runsApi.updateRunTitle(id!, text)
      setDisplayTitle(updated.title || text)
      messageApi.success('标题已更新')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '标题保存失败')
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
      await annotateApi.finalize(id!, version!, timelinePayload, note)
      messageApi.success(`已定稿 ${version}`)
      navigate(`/runs/${id}`, { replace: true })
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '定稿失败')
    } finally {
      setFinalizing(false)
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
      let updated: Interaction = {
        ...cur,
        ...patch,
        gate_at_ms,
        ...(gate_end_ms !== undefined ? { gate_end_ms } : { gate_end_ms: undefined }),
      }
      updated = enforceInteractionTypeRules(updated)
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
    const item: Interaction = { gate_at_ms: ms, gesture: 'tap', hint: '' }
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

  function setGateToPlayhead() {
    if (selectedIndex == null) return
    updateSelected({ gate_at_ms: Math.max(0, Math.round(playheadMs)) })
  }

  if (loading && !state) return <Card loading />
  if (!state || !id) return <Empty />

  const selected = selectedIndex != null ? rows[selectedIndex] : null
  const durationMs = Number(state.timeline?.media?.duration_ms || 0) || undefined
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

  const currentInfo = versionInfos.find((v) => v.version === version)
  const kindLabel = (currentInfo?.kind || 'manual') === 'manual' ? '人工标注' : 'AI 生成'
  const barNote = (note || currentInfo?.note || '').trim()

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
            editable={{
              tooltip: '点击修改标题',
              onChange: (v) => void onSaveTitle(v),
              triggerType: ['text', 'icon'],
            }}
          >
            {displayTitle || `手动标注 · ${state.label}`}
          </Typography.Title>
          <Typography.Text type="secondary">
            <Link to="/">返回列表</Link>
            {sourceFilename ? ` · 文件 ${sourceFilename}` : ''}
            {saveLabel ? ` · ${saveLabel}` : ''}
          </Typography.Text>
          <div style={{ marginTop: 10 }}>
            <Tag color={publishedVersion ? 'green' : 'blue'}>
              {publishedVersion ? '已发布' : '待发布'}
            </Tag>
          </div>
        </div>
        <Space wrap>
          {saveStatus === 'error' ? (
            <Button size="small" onClick={() => void persist()}>
              重试保存
            </Button>
          ) : null}
          <Button type="primary" loading={finalizing} onClick={() => void onFinalize()}>
            定稿
          </Button>
        </Space>
      </Space>

      {versionInfos.length > 0 ? (
        <div
          className="version-result-bar"
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 8,
          }}
        >
          <Space size="middle" wrap>
            <Typography.Text strong>查看结果</Typography.Text>
            <Typography.Text type="secondary">版本</Typography.Text>
            <Select
              style={{ width: 180 }}
              value={version}
              loading={switching}
              options={versionInfos.map((v) => ({
                value: v.version,
                label: versionOptionLabel(v.label, v.version, publishedVersion),
              }))}
              onChange={(v) => void onSwitchVersion(v)}
            />
            <Typography.Text type="secondary">
              {kindLabel}
              {barNote ? ` · ${barNote}` : ''}
            </Typography.Text>
          </Space>
        </div>
      ) : null}

      <Card className="page-card" title="基本信息" size="small">
        <Descriptions column={2} size="small">
          <Descriptions.Item label="类型">人工 · 编辑中</Descriptions.Item>
          <Descriptions.Item label="当前版本">{state.label}</Descriptions.Item>
          <Descriptions.Item label="时长">
            {durationMs != null ? `${(durationMs / 1000).toFixed(2)}s` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="节点数">{rows.length}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            <Input.TextArea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="版本备注（可选，自动保存）"
              maxLength={500}
              showCount
            />
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card className="page-card" title="标注预览" size="small">
        <PreviewPlayer
          runId={id}
          gates={rows}
          durationMs={durationMs}
          mode="annotate"
          selectedIndex={selectedIndex}
          onSelectGate={setSelectedIndex}
          onPlayheadChange={setPlayheadMs}
          onAddAtPlayhead={addAtPlayhead}
        />
      </Card>

      <Card className="page-card" title="选中互动" size="small">
        {!selected ? (
          <Empty description="先在进度条/列表选中一个点，或点击「在当前时刻加点」" />
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space wrap>
              <Typography.Text type="secondary">时刻 (s)</Typography.Text>
              <InputNumber
                min={0}
                step={0.033}
                precision={3}
                value={Number((selected.gate_at_ms / 1000).toFixed(3))}
                onChange={(n) =>
                  updateSelected({ gate_at_ms: Math.max(0, Math.round(Number(n || 0) * 1000)) })
                }
              />
              {isSustainedPlaybackInteraction(selected) ? (
                <Typography.Text type="secondary">
                  作用区间：当前节点 → {rows[(selectedIndex ?? -1) + 1]
                    ? `${(rows[(selectedIndex ?? -1) + 1].gate_at_ms / 1000).toFixed(2)}s 的下一节点`
                    : '视频结束'}
                </Typography.Text>
              ) : (
                <>
                  <Typography.Text type="secondary">结束 (s)</Typography.Text>
                  <InputNumber
                    min={Number((selected.gate_at_ms / 1000).toFixed(3))}
                    step={0.033}
                    precision={3}
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
                </>
              )}
              <Button size="small" onClick={setGateToPlayhead}>
                取当前播放时刻
              </Button>
              <Button size="small" danger onClick={removeSelected}>
                删除此点
              </Button>
            </Space>

            <div>
              <Typography.Text type="secondary">互动动作</Typography.Text>
              <div className="gesture-grid" style={{ marginTop: 8 }}>
                {GESTURES.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    className={!selected.custom_action && selected.gesture === g.value ? 'on' : undefined}
                    onClick={() =>
                      updateSelected({
                        gesture: g.value,
                        custom_action: false,
                        action_description: undefined,
                        ...(g.value === 'camera_motion' && !selected.vision
                          ? {
                              vision: {
                                target: 'hand_victory',
                                min_confidence: 0.82,
                                stable_for_ms: 400,
                                camera_facing: 'front',
                                show_preview: true,
                              },
                              vision_resolution: { target_source: 'operator' },
                              hint: VISION_TARGET_HINTS.hand_victory,
                            }
                          : {}),
                      })
                    }
                  >
                    {g.label} <span className="gesture-code">{g.value}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className={selected.custom_action ? 'on custom-action' : 'custom-action'}
                  onClick={() =>
                    updateSelected({ gesture: 'tap', custom_action: true })
                  }
                >
                  自定义动作 <span className="gesture-code">按点击处理</span>
                </button>
              </div>
              {selected.custom_action ? (
                <Input
                  style={{ marginTop: 10 }}
                  value={selected.action_description || ''}
                  maxLength={80}
                  showCount
                  onChange={(e) => updateSelected({ action_description: e.target.value })}
                  placeholder="描述用户需要执行的动作，例如：摸一摸小猫"
                />
              ) : null}
              {!selected.custom_action && selected.gesture === 'camera_motion' ? (
                <VisionInteractionFields
                  value={selected.vision}
                  onChange={(vision) =>
                    updateSelected({
                      vision,
                      vision_resolution: { target_source: 'operator' },
                      hint: VISION_TARGET_HINTS[vision.target],
                    })
                  }
                />
              ) : null}
              {isSustainedPlaybackInteraction(selected) ? (
                <Typography.Paragraph type="secondary" style={{ margin: '10px 0 0' }}>
                  {isContinuousTap(selected)
                    ? '该类型固定暂停进入、全画面识别；首次点击立即播放，每次点击续期 500ms，停止点击后暂停。'
                    : '该类型固定暂停进入、全画面识别；抬手立即暂停，停止移动 500ms 后暂停。'}
                </Typography.Paragraph>
              ) : null}
            </div>

            <div>
              <Typography.Text type="secondary">
                Hint（{selected.gesture === 'camera_motion' ? '随识别目标自动生成' : '播放器提示，最多 40 字'}）
              </Typography.Text>
              <Input
                style={{ marginTop: 8 }}
                disabled={
                  selected.gesture === 'camera_motion' ||
                  isSustainedPlaybackInteraction(selected)
                }
                value={selected.hint || ''}
                maxLength={40}
                showCount
                onChange={(e) => updateSelected({ hint: e.target.value })}
                placeholder="例如：点击屏幕继续"
              />
            </div>

            <div>
              <Typography.Text type="secondary">玩法描述（仅供记录）</Typography.Text>
              <Input.TextArea
                style={{ marginTop: 8 }}
                rows={3}
                value={selected.gameplay_description || ''}
                maxLength={500}
                showCount
                onChange={(e) => updateSelected({ gameplay_description: e.target.value })}
                placeholder="记录这个互动点的设计目的、预期反馈或运营说明；仅保存在标注备注中，不会进入播放器使用的玩法 JSON"
              />
            </div>
          </Space>
        )}
      </Card>
    </>
  )
}
