import {
  AimOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Button, Empty, Input, InputNumber, Select, Space, Tag, Typography } from 'antd'
import type { Interaction, InteractionPatch } from '../../types/interaction'
import {
  AUTHORING_GESTURE_TYPES,
  CAMERA_CONTINUOUS_DEFAULT_TARGET,
  CONTINUOUS_SOUND_AUTHORING_TYPE,
  cameraContinuousTargetCopy,
  continuousSoundInteractionPatch,
  continuousSoundTarget,
  continuousSoundTargetCopy,
  gestureAuthoringLabel,
  isCameraContinuous,
  isContinuousHold,
  isContinuousSound,
  isContinuousTap,
  isMultiTap,
  isPinch,
  isRotate,
  isSustainedPlaybackInteraction,
  pinchDirectionCopy,
  sustainedPlaybackEndMs,
} from '../../types/interaction'
import type { ClipMeta } from '../../types/run'
import ClipOutcomesEditor from '../ClipOutcomesEditor'
import PinchDirectionFields from '../PinchDirectionFields'
import RotationDirectionFields from '../RotationDirectionFields'
import SoundInteractionFields from '../SoundInteractionFields'
import VisionInteractionFields, {
  normalizeVisionConfig,
  VISION_TARGET_HINTS,
} from '../VisionInteractionFields'

export const CUSTOM_ACTION_VALUE = '__custom_action__'

const GROUPS: Array<{ label: string; values: string[] }> = [
  {
    label: '点击与按压',
    values: [
      'tap', 'double_tap', 'multi_tap', 'rapid_tap', 'hold', 'hold_charge',
      'continuous_tap', 'continuous_hold',
    ],
  },
  {
    label: '滑动与触控',
    values: [
      'swipe_left', 'swipe_right', 'swipe_up', 'swipe_down',
      'drag_left', 'drag_right', 'drag_up', 'drag_down',
      'scrub_left', 'scrub_right', 'scrub_up', 'scrub_down',
      'continuous_swipe', 'pinch', 'draw_circle', 'erase',
    ],
  },
  {
    label: '设备动作',
    values: ['tilt_left', 'tilt_right', 'shake', 'rotate', 'hold_still'],
  },
  {
    label: '摄像头识别',
    values: ['camera_motion', 'camera_continuous'],
  },
  {
    label: '声音识别',
    values: ['mic_level', 'mic_blow', 'mic_clap', 'mic_quiet', CONTINUOUS_SOUND_AUTHORING_TYPE],
  },
]

const AUTHORING_SET = new Set(AUTHORING_GESTURE_TYPES)

export const INTERACTION_TYPE_OPTIONS = [
  ...GROUPS.map((group) => ({
    label: group.label,
    options: group.values
      .filter((value) => AUTHORING_SET.has(value))
      .map((value) => ({ value, label: gestureAuthoringLabel(value) })),
  })).filter((group) => group.options.length > 0),
  {
    label: '其他',
    options: [
      ...AUTHORING_GESTURE_TYPES
        .filter((value) => !GROUPS.some((group) => group.values.includes(value)))
        .map((value) => ({ value, label: gestureAuthoringLabel(value) })),
      { value: CUSTOM_ACTION_VALUE, label: '自定义动作' },
    ],
  },
]

function displayGestureValue(interaction: Interaction) {
  if (interaction.custom_action) return CUSTOM_ACTION_VALUE
  if (isContinuousSound(interaction)) return CONTINUOUS_SOUND_AUTHORING_TYPE
  return interaction.gesture
}

export function patchForGesture(value: string, current?: Interaction): Partial<Interaction> {
  if (value === CUSTOM_ACTION_VALUE) {
    return { gesture: 'tap', custom_action: true }
  }
  return {
    ...(value === CONTINUOUS_SOUND_AUTHORING_TYPE
      ? continuousSoundInteractionPatch(continuousSoundTarget(current))
      : { gesture: value }),
    custom_action: false,
    action_description: undefined,
    ...(['camera_motion', 'camera_continuous'].includes(value)
      ? {
          vision: normalizeVisionConfig(undefined, value),
          vision_resolution: { target_source: 'operator' as const },
          hint: VISION_TARGET_HINTS[
            value === 'camera_continuous'
              ? CAMERA_CONTINUOUS_DEFAULT_TARGET
              : 'hand_victory'
          ],
        }
      : {}),
  }
}

type Props = {
  selected: Interaction | null
  selectedIndex: number | null
  nextGateAtMs?: number
  durationMs?: number
  playheadMs: number
  editing: boolean
  onUpdate: (patch: InteractionPatch) => void
  onRemove: () => void
  clipMeta?: ClipMeta[]
  activeClipId?: string
  showOutcomes?: boolean
  selectedIsBranch?: boolean
  showGameplayDescription?: boolean
}

export default function InteractionInspector({
  selected,
  selectedIndex,
  nextGateAtMs,
  durationMs,
  playheadMs,
  editing,
  onUpdate,
  onRemove,
  clipMeta = [],
  activeClipId,
  showOutcomes = false,
  selectedIsBranch = false,
  showGameplayDescription = false,
}: Props) {
  if (!selected) {
    return (
      <div className="interaction-inspector-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="选择时间轴或节点列表中的互动"
        />
        <Typography.Paragraph type="secondary">
          也可以把左侧互动类型拖到时间轴的目标时刻。
        </Typography.Paragraph>
      </div>
    )
  }

  const interaction = selected
  const sustained = isSustainedPlaybackInteraction(selected)
  const effectiveEnd = sustained
    ? sustainedPlaybackEndMs(selected, nextGateAtMs, durationMs)
    : undefined
  const clipped = sustained
    && typeof selected.gate_end_ms === 'number'
    && typeof effectiveEnd === 'number'
    && selected.gate_end_ms > effectiveEnd
  const exactStart = Number((selected.gate_at_ms / 1000).toFixed(3))
  const exactEnd = typeof selected.gate_end_ms === 'number'
    ? Number((selected.gate_end_ms / 1000).toFixed(3))
    : null

  function setStart(seconds: number | null) {
    const next = Math.max(0, Math.round(Number(seconds ?? 0) * 1000))
    if (typeof interaction.gate_end_ms === 'number') {
      const maximum = sustained ? interaction.gate_end_ms - 1 : interaction.gate_end_ms
      if (next > maximum) return
    }
    onUpdate({ gate_at_ms: next })
  }

  function setEnd(seconds: number | null) {
    if (seconds == null) {
      onUpdate({ gate_end_ms: undefined })
      return
    }
    const minimum = sustained ? interaction.gate_at_ms + 1 : interaction.gate_at_ms
    onUpdate({ gate_end_ms: Math.max(minimum, Math.round(Number(seconds) * 1000)) })
  }

  return (
    <div className="interaction-inspector">
      <div className="interaction-inspector-heading">
        <div>
          <Typography.Text type="secondary">选中互动</Typography.Text>
          <Typography.Title level={5}>
            {String((selectedIndex ?? 0) + 1).padStart(2, '0')} · {' '}
            {selected.custom_action
              ? selected.action_description || '自定义动作'
              : gestureAuthoringLabel(displayGestureValue(selected))}
          </Typography.Title>
        </div>
        <Space size={6}>
          {sustained ? <Tag color="lime">持续区间</Tag> : <Tag color="blue">响应互动</Tag>}
          {editing ? (
            <Button
              danger
              type="text"
              icon={<DeleteOutlined />}
              aria-label="删除当前互动"
              onClick={onRemove}
            />
          ) : null}
        </Space>
      </div>

      <section className="interaction-inspector-section">
        <div className="interaction-inspector-section-title">
          <Typography.Text strong>时间与作用区间</Typography.Text>
          <Typography.Text type="secondary">精确到 0.001 秒</Typography.Text>
        </div>

        <label className="interaction-time-row">
          <span>开始</span>
          <InputNumber
            aria-label="互动开始时间"
            min={0}
            max={typeof selected.gate_end_ms === 'number'
              ? Number(((selected.gate_end_ms - (sustained ? 1 : 0)) / 1000).toFixed(3))
              : undefined}
            step={0.033}
            precision={3}
            disabled={!editing}
            value={exactStart}
            addonAfter="s"
            onChange={setStart}
          />
          <Button
            title="设为当前播放头"
            aria-label="把开始时间设为当前播放头"
            icon={<AimOutlined />}
            disabled={!editing}
            onClick={() => setStart(playheadMs / 1000)}
          />
        </label>

        {selectedIsBranch ? (
          <div className="interaction-time-note">
            <InfoCircleOutlined /> 响应结束由故事流程中的分支响应时间统一控制。
          </div>
        ) : (
          <label className="interaction-time-row">
            <span>{sustained ? '期望结束' : '响应结束'}</span>
            <InputNumber
              aria-label={sustained ? '持续互动期望结束时间' : '互动响应结束时间'}
              min={Number(((selected.gate_at_ms + (sustained ? 1 : 0)) / 1000).toFixed(3))}
              step={0.033}
              precision={3}
              disabled={!editing}
              value={exactEnd}
              placeholder={sustained ? '下一节点/片尾' : '播放器默认'}
              addonAfter="s"
              onChange={setEnd}
            />
            <Button
              title="设为当前播放头"
              aria-label="把结束时间设为当前播放头"
              icon={<AimOutlined />}
              disabled={!editing || playheadMs < selected.gate_at_ms + (sustained ? 1 : 0)}
              onClick={() => setEnd(playheadMs / 1000)}
            />
            {typeof selected.gate_end_ms === 'number' ? (
              <Button disabled={!editing} onClick={() => setEnd(null)}>自动</Button>
            ) : null}
          </label>
        )}

        {sustained ? (
          <div className={`interaction-effective-end${clipped ? ' is-warning' : ''}`}>
            {clipped ? <WarningOutlined /> : <InfoCircleOutlined />}
            <span>
              实际结束：{typeof effectiveEnd === 'number'
                ? `${(effectiveEnd / 1000).toFixed(3)}s`
                : '视频结束'}
              {typeof effectiveEnd === 'number'
                ? ` · 实际时长 ${Math.max(0, (effectiveEnd - selected.gate_at_ms) / 1000).toFixed(3)}s`
                : ''}
            </span>
            {clipped ? <strong>下一节点或片尾已截断超出部分</strong> : null}
          </div>
        ) : null}
      </section>

      <section className="interaction-inspector-section">
        <div className="interaction-inspector-section-title">
          <Typography.Text strong>互动动作</Typography.Text>
        </div>
        <Select
          className="interaction-type-select"
          aria-label="互动动作类型"
          showSearch
          optionFilterProp="label"
          disabled={!editing}
          value={displayGestureValue(selected)}
          options={INTERACTION_TYPE_OPTIONS}
          onChange={(value) => onUpdate(patchForGesture(value, selected))}
        />

        {selected.custom_action ? (
          <Input
            disabled={!editing}
            value={selected.action_description || ''}
            maxLength={80}
            showCount
            onChange={(event) => onUpdate({ action_description: event.target.value })}
            placeholder="描述用户需要执行的动作，例如：摸一摸小猫"
          />
        ) : null}

        {!selected.custom_action && ['camera_motion', 'camera_continuous'].includes(selected.gesture) ? (
          <VisionInteractionFields
            value={selected.vision}
            interactionType={selected.gesture as 'camera_motion' | 'camera_continuous'}
            disabled={!editing}
            onChange={(vision) => onUpdate({
              vision,
              vision_resolution: { target_source: 'operator' },
              hint: VISION_TARGET_HINTS[vision.target],
            })}
          />
        ) : null}

        {!selected.custom_action && isContinuousSound(selected) ? (
          <SoundInteractionFields value={selected} disabled={!editing} onChange={onUpdate} />
        ) : null}

        {!selected.custom_action && isMultiTap(selected) ? (
          <label className="interaction-parameter-row">
            <span>目标点击次数</span>
            <InputNumber
              min={1}
              max={99}
              precision={0}
              disabled={!editing}
              value={selected.tap_count ?? 3}
              onChange={(value) => onUpdate({
                tap_count: Math.min(99, Math.max(1, Math.round(Number(value ?? 3)))),
              })}
            />
          </label>
        ) : null}

        {!selected.custom_action && isPinch(selected) ? (
          <PinchDirectionFields
            value={selected.pinch_direction}
            disabled={!editing}
            onChange={(pinch_direction) => onUpdate({
              pinch_direction,
              hint: pinchDirectionCopy(pinch_direction).hint,
            })}
          />
        ) : null}

        {!selected.custom_action && isRotate(selected) ? (
          <RotationDirectionFields
            value={selected.rotation_direction}
            disabled={!editing}
            onChange={(rotation_direction) => onUpdate({ rotation_direction })}
          />
        ) : null}

        {sustained ? (
          <Typography.Paragraph className="interaction-help" type="secondary">
            {isCameraContinuous(selected)
              ? `固定暂停进入；识别「${cameraContinuousTargetCopy(selected.vision?.target).label}」时续播，停止 1100ms 后暂停。`
              : isContinuousSound(selected)
                ? `固定暂停进入；${continuousSoundTargetCopy(continuousSoundTarget(selected)).editorHelp}。`
                : isContinuousTap(selected)
                  ? '固定暂停进入；首次点击开始播放，每次点击续期 500ms。'
                  : isContinuousHold(selected)
                    ? '固定暂停进入；按住时播放，松开立即暂停。'
                    : '固定暂停进入；持续往复滑动时播放，停止移动后暂停。'}
          </Typography.Paragraph>
        ) : null}
      </section>

      <section className="interaction-inspector-section">
        <div className="interaction-inspector-section-title">
          <Typography.Text strong>播放器提示</Typography.Text>
          <Typography.Text type="secondary">最多 40 字</Typography.Text>
        </div>
        <Input
          disabled={
            !editing
            || ['camera_motion', 'camera_continuous'].includes(selected.gesture)
            || isContinuousSound(selected)
            || sustained
          }
          value={selected.hint || ''}
          maxLength={40}
          showCount
          onChange={(event) => onUpdate({ hint: event.target.value })}
          placeholder={sustained ? '持续互动提示由类型自动生成' : '例如：点击屏幕继续'}
        />
      </section>

      {sustained ? (
        <div className="interaction-time-note">
          <InfoCircleOutlined /> 区间结束后固定继续播放，不配置成功或失败分支。
        </div>
      ) : showOutcomes ? (
        <section className="interaction-inspector-section">
          <ClipOutcomesEditor
            value={selected.outcomes}
            clips={clipMeta}
            currentClipId={activeClipId}
            disabled={!editing}
            onChange={(outcomes) => onUpdate({ outcomes })}
          />
        </section>
      ) : selectedIsBranch ? (
        <div className="interaction-time-note">
          <InfoCircleOutlined /> 这是分支挑战；成功与失败去向由故事流程统一管理。
        </div>
      ) : null}

      {showGameplayDescription ? (
        <section className="interaction-inspector-section">
          <div className="interaction-inspector-section-title">
            <Typography.Text strong>玩法描述</Typography.Text>
            <Typography.Text type="secondary">仅供运营记录</Typography.Text>
          </div>
          <Input.TextArea
            disabled={!editing}
            rows={3}
            value={selected.gameplay_description || ''}
            maxLength={500}
            showCount
            onChange={(event) => onUpdate({ gameplay_description: event.target.value })}
            placeholder="记录设计目的、预期反馈或运营说明"
          />
        </section>
      ) : null}
    </div>
  )
}
