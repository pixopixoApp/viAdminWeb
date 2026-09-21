import {
  AimOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  Space,
  Typography,
} from 'antd'
import PreviewPlayer from '../PreviewPlayer'
import PinchDirectionFields from '../PinchDirectionFields'
import RotationDirectionFields from '../RotationDirectionFields'
import SoundInteractionFields from '../SoundInteractionFields'
import VisionInteractionFields, { VISION_TARGET_HINTS } from '../VisionInteractionFields'
import type { Interaction, InteractionPatch } from '../../types/interaction'
import {
  AUTHORING_GESTURE_TYPES,
  CONTINUOUS_SOUND_AUTHORING_TYPE,
  cameraContinuousTargetCopy,
  continuousSoundTarget,
  continuousSoundTargetCopy,
  gestureAuthoringLabel,
  isCameraContinuous,
  isContinuousHold,
  isContinuousSound,
  isContinuousTap,
  isMultiTap,
  isPinch,
  isSustainedPlaybackInteraction,
  pinchDirectionCopy,
  sustainedPlaybackEndMs,
  usesRotationDirection,
} from '../../types/interaction'
import { patchForGesture } from './InteractionInspector'

const GESTURES = AUTHORING_GESTURE_TYPES.map((value) => ({
  value,
  label: gestureAuthoringLabel(value),
}))

type Props = {
  runId: string
  stateLabel: string
  sourceFilename: string
  rows: Interaction[]
  selectedIndex: number | null
  durationMs?: number
  playheadMs: number
  note: string
  onNoteChange: (value: string) => void
  onSelectIndex: (index: number) => void
  onPlayheadChange: (ms: number) => void
  onAddAtPlayhead: () => void
  onUpdateSelected: (patch: InteractionPatch) => void
  onRemoveSelected: () => void
}

export default function ClassicInteractionEditor({
  runId,
  stateLabel,
  sourceFilename,
  rows,
  selectedIndex,
  durationMs,
  playheadMs,
  note,
  onNoteChange,
  onSelectIndex,
  onPlayheadChange,
  onAddAtPlayhead,
  onUpdateSelected,
  onRemoveSelected,
}: Props) {
  const selected = selectedIndex == null ? null : rows[selectedIndex] || null
  const selectedNextGate = selectedIndex == null
    ? undefined
    : rows[selectedIndex + 1]?.gate_at_ms
  const selectedEffectiveEnd = selected && isSustainedPlaybackInteraction(selected)
    ? sustainedPlaybackEndMs(selected, selectedNextGate, durationMs)
    : undefined
  const selectedEndClipped = selected
    && typeof selected.gate_end_ms === 'number'
    && typeof selectedEffectiveEnd === 'number'
    && selected.gate_end_ms > selectedEffectiveEnd

  function setGateToPlayhead() {
    onUpdateSelected({ gate_at_ms: Math.max(0, Math.round(playheadMs)) })
  }

  function setEndToPlayhead() {
    if (!selected || playheadMs < selected.gate_at_ms + 1) return
    onUpdateSelected({ gate_end_ms: Math.round(playheadMs) })
  }

  function chooseGesture(value: string) {
    if (!selected) return
    const patch = patchForGesture(value, selected)
    onUpdateSelected({
      ...patch,
      custom_action: false,
      action_description: undefined,
    })
  }

  return (
    <div className="classic-interaction-editor">
      <Card className="page-card" title="基本信息" size="small">
        <Descriptions column={2} size="small">
          <Descriptions.Item label="类型">人工 · 编辑中</Descriptions.Item>
          <Descriptions.Item label="当前版本">{stateLabel}</Descriptions.Item>
          <Descriptions.Item label="时长">
            {durationMs == null ? '-' : `${(durationMs / 1000).toFixed(2)}s`}
          </Descriptions.Item>
          <Descriptions.Item label="节点数">{rows.length}</Descriptions.Item>
          <Descriptions.Item label="文件" span={2}>{sourceFilename || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            <Input.TextArea
              rows={2}
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="版本备注（可选，自动保存）"
              maxLength={500}
              showCount
            />
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card className="page-card" title="标注预览" size="small">
        <PreviewPlayer
          runId={runId}
          gates={rows}
          durationMs={durationMs}
          mode="annotate"
          selectedIndex={selectedIndex}
          onSelectGate={onSelectIndex}
          onPlayheadChange={onPlayheadChange}
          onAddAtPlayhead={onAddAtPlayhead}
        />
      </Card>

      <Card className="page-card" title="选中互动" size="small">
        {!selected ? (
          <Empty description="先在进度条或列表选中一个点，或在当前时刻加点" />
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div className="classic-interaction-time-settings">
              <label className="interaction-time-row">
                <span>开始时间</span>
                <InputNumber
                  aria-label="互动开始时间"
                  min={0}
                  max={isSustainedPlaybackInteraction(selected)
                    && typeof selected.gate_end_ms === 'number'
                    ? Number(((selected.gate_end_ms - 1) / 1000).toFixed(3))
                    : undefined}
                  step={0.033}
                  precision={3}
                  value={Number((selected.gate_at_ms / 1000).toFixed(3))}
                  addonAfter="s"
                  onChange={(value) => onUpdateSelected({
                    gate_at_ms: Math.max(0, Math.round(Number(value || 0) * 1000)),
                  })}
                />
                <Button
                  size="small"
                  icon={<AimOutlined />}
                  disabled={isSustainedPlaybackInteraction(selected)
                    && typeof selected.gate_end_ms === 'number'
                    && playheadMs > selected.gate_end_ms - 1}
                  aria-label="把开始时间设为当前播放帧"
                  onClick={setGateToPlayhead}
                >
                  取当前帧
                </Button>
              </label>

              {isSustainedPlaybackInteraction(selected) ? (
                <>
                  <label className="interaction-time-row">
                    <span>期望结束</span>
                    <InputNumber
                      aria-label="持续互动期望结束时间"
                      min={Number(((selected.gate_at_ms + 1) / 1000).toFixed(3))}
                      step={0.033}
                      precision={3}
                      value={typeof selected.gate_end_ms === 'number'
                        ? Number((selected.gate_end_ms / 1000).toFixed(3))
                        : null}
                      placeholder="自动：下一节点/片尾"
                      addonAfter="s"
                      onChange={(value) => onUpdateSelected({
                        gate_end_ms: value == null
                          ? null
                          : Math.max(
                            selected.gate_at_ms + 1,
                            Math.round(Number(value) * 1000),
                          ),
                      })}
                    />
                    <Button
                      size="small"
                      icon={<AimOutlined />}
                      disabled={playheadMs < selected.gate_at_ms + 1}
                      aria-label="把结束时间设为当前播放帧"
                      onClick={setEndToPlayhead}
                    >
                      取当前帧
                    </Button>
                    {typeof selected.gate_end_ms === 'number' ? (
                      <Button
                        size="small"
                        aria-label="恢复自动结束时间"
                        onClick={() => onUpdateSelected({ gate_end_ms: null })}
                      >
                        恢复自动
                      </Button>
                    ) : null}
                  </label>
                  <div className={`interaction-effective-end${selectedEndClipped ? ' is-warning' : ''}`}>
                    {selectedEndClipped ? <WarningOutlined /> : <InfoCircleOutlined />}
                    <span>
                      {typeof selected.gate_end_ms === 'number' ? '' : '自动模式 · '}
                      实际结束：{typeof selectedEffectiveEnd === 'number'
                        ? `${(selectedEffectiveEnd / 1000).toFixed(3)}s`
                        : '视频结束'}
                    </span>
                    {selectedEndClipped ? <strong>下一节点或片尾已截断超出部分</strong> : null}
                  </div>
                </>
              ) : null}

              <div className="classic-interaction-node-actions">
                <Button size="small" danger onClick={onRemoveSelected}>删除此点</Button>
              </div>
            </div>

            <div>
              <Typography.Text type="secondary">互动动作</Typography.Text>
              <div className="gesture-grid" style={{ marginTop: 8 }}>
                {GESTURES.map((gesture) => (
                  <button
                    key={gesture.value}
                    type="button"
                    className={!selected.custom_action && (
                      gesture.value === CONTINUOUS_SOUND_AUTHORING_TYPE
                        ? isContinuousSound(selected)
                        : selected.gesture === gesture.value
                    ) ? 'on' : undefined}
                    onClick={() => chooseGesture(gesture.value)}
                  >
                    {gesture.label} <span className="gesture-code">{gesture.value}</span>
                  </button>
                ))}
              </div>

              {selected.custom_action ? (
                <Typography.Paragraph type="secondary" style={{ margin: '10px 0 0' }}>
                  这是旧数据中的自定义动作，将继续按点击处理；当前版本不再新增自定义类型。
                </Typography.Paragraph>
              ) : null}
              {!selected.custom_action
                && ['camera_motion', 'camera_continuous'].includes(selected.gesture) ? (
                  <VisionInteractionFields
                    value={selected.vision}
                    interactionType={selected.gesture as 'camera_motion' | 'camera_continuous'}
                    onChange={(vision) => onUpdateSelected({
                      vision,
                      vision_resolution: { target_source: 'operator' },
                      hint: VISION_TARGET_HINTS[vision.target],
                    })}
                  />
                ) : null}
              {!selected.custom_action && isContinuousSound(selected) ? (
                <SoundInteractionFields value={selected} onChange={onUpdateSelected} />
              ) : null}
              {!selected.custom_action && isMultiTap(selected) ? (
                <Space wrap style={{ marginTop: 10 }}>
                  <Typography.Text type="secondary">目标点击次数</Typography.Text>
                  <InputNumber
                    min={1}
                    max={99}
                    precision={0}
                    value={selected.tap_count ?? 3}
                    onChange={(value) => onUpdateSelected({
                      tap_count: Math.min(99, Math.max(1, Math.round(Number(value ?? 3)))),
                    })}
                  />
                </Space>
              ) : null}
              {!selected.custom_action && usesRotationDirection(selected) ? (
                <RotationDirectionFields
                  value={selected.rotation_direction}
                  onChange={(rotation_direction) => onUpdateSelected({ rotation_direction })}
                />
              ) : null}
              {!selected.custom_action && isPinch(selected) ? (
                <PinchDirectionFields
                  value={selected.pinch_direction}
                  onChange={(pinch_direction) => onUpdateSelected({
                    pinch_direction,
                    hint: pinchDirectionCopy(pinch_direction).hint,
                  })}
                />
              ) : null}
              {isSustainedPlaybackInteraction(selected) ? (
                <Typography.Paragraph type="secondary" style={{ margin: '10px 0 0' }}>
                  {isCameraContinuous(selected)
                    ? `固定暂停进入；点击预览里的“${cameraContinuousTargetCopy(selected.vision?.target).simulate}”开始或续播，停止 1100ms 后暂停。${cameraContinuousTargetCopy(selected.vision?.target).editorHelp}。`
                    : isContinuousSound(selected)
                      ? `固定暂停进入；预览中按住画面模拟声音，松开 450ms 后暂停。${continuousSoundTargetCopy(continuousSoundTarget(selected)).editorHelp}。`
                      : isContinuousTap(selected)
                        ? '固定暂停进入、全画面识别；首次点击立即播放，每次点击续期 500ms。'
                        : isContinuousHold(selected)
                          ? '固定暂停进入、全画面识别；按住时播放，松开立即暂停。'
                          : '固定暂停进入、全画面识别；抬手立即暂停，停止移动 500ms 后暂停。'}
                </Typography.Paragraph>
              ) : null}
            </div>

            <div>
              <Typography.Text type="secondary">
                Hint（{['camera_motion', 'camera_continuous'].includes(selected.gesture)
                  || isContinuousSound(selected)
                  ? '随识别目标自动生成'
                  : '播放器提示，最多 40 字'}）
              </Typography.Text>
              <Input
                style={{ marginTop: 8 }}
                disabled={['camera_motion', 'camera_continuous'].includes(selected.gesture)
                  || isContinuousSound(selected)
                  || isSustainedPlaybackInteraction(selected)}
                value={selected.hint || ''}
                maxLength={40}
                showCount
                onChange={(event) => onUpdateSelected({ hint: event.target.value })}
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
                onChange={(event) => onUpdateSelected({
                  gameplay_description: event.target.value,
                })}
                placeholder="记录设计目的、预期反馈或运营说明；不会进入客户端玩法 JSON"
              />
            </div>
          </Space>
        )}
      </Card>
    </div>
  )
}
