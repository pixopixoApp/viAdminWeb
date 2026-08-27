import { Button, Card, Empty, Input, InputNumber, Space, Tag, Typography } from 'antd'
import type { Interaction } from '../../types/interaction'
import {
  GESTURE_LABEL,
  isContinuousTap,
  isSustainedPlaybackInteraction,
} from '../../types/interaction'
import type { ClipMeta } from '../../types/run'
import ClipOutcomesEditor from '../ClipOutcomesEditor'
import PreviewPlayer from '../PreviewPlayer'
import VisionInteractionFields, { VISION_TARGET_HINTS } from '../VisionInteractionFields'

const GESTURES = Object.entries(GESTURE_LABEL).map(([value, label]) => ({ value, label }))

type Props = {
  runId: string
  activeClipId: string
  rows: Interaction[]
  durationMs: number | undefined
  editing: boolean
  selectedIndex: number | null
  onSelectIndex: (i: number | null) => void
  onPlayheadChange: (ms: number) => void
  onAddAtPlayhead: () => void
  onUpdateSelected: (patch: Partial<Interaction> & { gate_end_ms?: number | null }) => void
  onRemoveSelected: () => void
  clipMeta: ClipMeta[]
  note: string
  onNoteChange: (v: string) => void
  showOutcomes?: boolean
  branchInteractionIndex?: number | null
  previewTitle?: string
  editorTitle?: string
}

export default function ClipEditor({
  runId,
  activeClipId,
  rows,
  durationMs,
  editing,
  selectedIndex,
  onSelectIndex,
  onPlayheadChange,
  onAddAtPlayhead,
  onUpdateSelected,
  onRemoveSelected,
  clipMeta,
  note,
  onNoteChange,
  showOutcomes = true,
  branchInteractionIndex = null,
  previewTitle = '标注预览',
  editorTitle = '选中互动',
}: Props) {
  const selected = selectedIndex != null ? rows[selectedIndex] : null
  const selectedIsBranch =
    selectedIndex != null &&
    selectedIndex === branchInteractionIndex &&
    !isSustainedPlaybackInteraction(selected)

  if (!activeClipId) {
    return <Card className="page-card"><Empty description="请先点击上方主片段 A 卡片上传视频" /></Card>
  }

  return (
    <>
      <Card className="page-card" title={previewTitle} size="small">
        <PreviewPlayer
          runId={runId}
          clipId={activeClipId}
          gates={rows}
          durationMs={durationMs}
          mode={editing ? 'annotate' : 'preview'}
          selectedIndex={selectedIndex}
          onSelectGate={onSelectIndex}
          onPlayheadChange={onPlayheadChange}
          onAddAtPlayhead={editing ? onAddAtPlayhead : undefined}
        />
      </Card>

      <Card
        className="page-card"
        title={editorTitle}
        size="small"
        extra={selectedIsBranch ? <Tag color="success">当前分支挑战</Tag> : null}
      >
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
                  onUpdateSelected({ gate_at_ms: Math.max(0, Math.round(Number(n || 0) * 1000)) })
                }
              />
              {isSustainedPlaybackInteraction(selected) ? (
                <Typography.Text type="secondary">
                  作用区间：当前节点 → {rows[(selectedIndex ?? -1) + 1]
                    ? `${(rows[(selectedIndex ?? -1) + 1].gate_at_ms / 1000).toFixed(2)}s 的下一节点`
                    : '视频结束'}
                </Typography.Text>
              ) : selectedIsBranch ? (
                <Typography.Text type="secondary">
                  响应时间由上方分支挑战右侧统一设置
                </Typography.Text>
              ) : (
                <>
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
                      onUpdateSelected({
                        gate_end_ms:
                          n == null
                            ? undefined
                            : Math.max(selected.gate_at_ms, Math.round(Number(n) * 1000)),
                      })
                    }
                  />
                </>
              )}
              {editing ? (
                <Button size="small" danger onClick={onRemoveSelected}>
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
                      onUpdateSelected({
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
                  disabled={!editing}
                  className={selected.custom_action ? 'on custom-action' : 'custom-action'}
                  onClick={() => onUpdateSelected({ gesture: 'tap', custom_action: true })}
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
                  onChange={(e) => onUpdateSelected({ action_description: e.target.value })}
                  placeholder="描述用户需要执行的动作"
                />
              ) : null}
              {!selected.custom_action && selected.gesture === 'camera_motion' ? (
                <VisionInteractionFields
                  value={selected.vision}
                  disabled={!editing}
                  onChange={(vision) =>
                    onUpdateSelected({
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
                Hint{selected.gesture === 'camera_motion' ? '（随识别目标自动生成）' : ''}
              </Typography.Text>
              <Input
                style={{ marginTop: 8 }}
                disabled={
                  !editing ||
                  selected.gesture === 'camera_motion' ||
                  isSustainedPlaybackInteraction(selected)
                }
                value={selected.hint || ''}
                maxLength={40}
                showCount
                onChange={(e) => onUpdateSelected({ hint: e.target.value })}
              />
            </div>

            {isSustainedPlaybackInteraction(selected) ? (
              <Typography.Text type="secondary">
                区间结束固定继续，不配置成功或失败分支。
              </Typography.Text>
            ) : showOutcomes ? (
              <ClipOutcomesEditor
                value={selected.outcomes}
                clips={clipMeta}
                currentClipId={activeClipId}
                disabled={!editing}
                onChange={(outcomes) => onUpdateSelected({ outcomes })}
              />
            ) : selectedIsBranch ? (
              <Typography.Text type="secondary">
                这是分支挑战：成功播放 B，失败播放 C，去向由上方流程统一管理。
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary">
                这是普通互动：成功或失败后都继续播放主片段 A。
              </Typography.Text>
            )}
          </Space>
        )}
      </Card>

      <Card className="page-card" title="版本备注" size="small">
        <Input.TextArea
          rows={2}
          disabled={!editing}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          maxLength={500}
          showCount
          placeholder="可选"
        />
      </Card>
    </>
  )
}
