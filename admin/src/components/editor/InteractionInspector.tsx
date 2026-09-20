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
  CONTINUOUS_SOUND_TARGET_COPY,
  cameraContinuousTargetCopy,
  continuousSoundInteractionPatch,
  continuousSoundTarget,
  continuousSoundTargetCopy,
  isCameraContinuous,
  isContinuousHold,
  isContinuousSound,
  isContinuousTap,
  isDrawCircle,
  isMultiTap,
  isPinch,
  isSustainedPlaybackInteraction,
  pinchDirectionCopy,
  sustainedPlaybackEndMs,
  usesRotationDirection,
  type PinchDirection,
  type RotationDirection,
} from '../../types/interaction'
import type { ClipMeta } from '../../types/run'
import ClipOutcomesEditor from '../ClipOutcomesEditor'
import PinchDirectionFields from '../PinchDirectionFields'
import RotationDirectionFields from '../RotationDirectionFields'
import SoundInteractionFields from '../SoundInteractionFields'
import VisionInteractionFields, {
  normalizeVisionConfig,
  VISION_CONTINUOUS_TARGETS,
  VISION_FACE_TARGETS,
  VISION_HAND_TARGETS,
  VISION_TARGET_HINTS,
} from '../VisionInteractionFields'
import { adminGestureLabel } from './interactionCopy'

export const CUSTOM_ACTION_VALUE = '__custom_action__'

const GROUPS: Array<{ label: string; values: string[]; flattenChildren?: boolean }> = [
  {
    label: '点击与按压',
    values: [
      'tap', 'double_tap', 'multi_tap', 'rapid_tap', 'hold', 'hold_charge',
    ],
  },
  {
    label: '滑动与触控',
    values: [
      'swipe_left', 'swipe_right', 'swipe_up', 'swipe_down',
      'drag_left', 'drag_right', 'drag_up', 'drag_down',
      'scrub_left', 'scrub_right', 'scrub_up', 'scrub_down',
      'pinch', 'draw_circle', 'erase',
    ],
  },
  {
    label: '设备动作',
    values: ['tilt_left', 'tilt_right', 'shake', 'rotate', 'hold_still'],
  },
  {
    label: '摄像头识别',
    values: ['camera_motion'],
    flattenChildren: true,
  },
  {
    label: '声音识别',
    values: ['mic_level', 'mic_blow', 'mic_clap', 'mic_quiet'],
  },
  {
    label: '持续互动',
    values: [
      'continuous_tap', 'continuous_hold', 'continuous_swipe',
      'camera_continuous', CONTINUOUS_SOUND_AUTHORING_TYPE,
    ],
  },
]

const AUTHORING_SET = new Set(AUTHORING_GESTURE_TYPES)
const PRESET_SEPARATOR = '::'

export type InteractionAuthoringOption = {
  value: string
  label: string
  code?: string
  children?: InteractionAuthoringOption[]
}

function presetValue(gesture: string, variant: string) {
  return `${gesture}${PRESET_SEPARATOR}${variant}`
}

const SECONDARY_OPTIONS: Record<string, InteractionAuthoringOption[]> = {
  camera_motion: [
    ...VISION_HAND_TARGETS.map(([code, label]) => ({
      value: presetValue('camera_motion', code), label, code,
    })),
    ...VISION_FACE_TARGETS.map(([code, label]) => ({
      value: presetValue('camera_motion', code), label, code,
    })),
  ],
  camera_continuous: VISION_CONTINUOUS_TARGETS.map(([code, label]) => ({
    value: presetValue('camera_continuous', code), label, code,
  })),
  [CONTINUOUS_SOUND_AUTHORING_TYPE]: Object.entries(CONTINUOUS_SOUND_TARGET_COPY)
    .map(([code, copy]) => ({
      value: presetValue(CONTINUOUS_SOUND_AUTHORING_TYPE, code),
      label: copy.label,
      code,
    })),
  pinch: [
    { value: presetValue('pinch', 'inward'), label: '向内捏合', code: 'inward' },
    { value: presetValue('pinch', 'outward'), label: '向外张开', code: 'outward' },
  ],
  rotate: [
    { value: presetValue('rotate', 'clockwise'), label: '顺时针旋转', code: 'clockwise' },
    { value: presetValue('rotate', 'counterclockwise'), label: '逆时针旋转', code: 'counterclockwise' },
  ],
  draw_circle: [
    { value: presetValue('draw_circle', 'clockwise'), label: '顺时针画圆', code: 'clockwise' },
    { value: presetValue('draw_circle', 'counterclockwise'), label: '逆时针画圆', code: 'counterclockwise' },
  ],
}

function authoringOption(value: string): InteractionAuthoringOption {
  return {
    value,
    label: adminGestureLabel(value),
    code: value,
    ...(SECONDARY_OPTIONS[value] ? { children: SECONDARY_OPTIONS[value] } : {}),
  }
}

export const INTERACTION_TYPE_OPTIONS = [
  ...GROUPS.map((group) => ({
    label: group.label,
    options: group.values
      .filter((value) => AUTHORING_SET.has(value))
      .flatMap((value) => {
        const option = authoringOption(value)
        return group.flattenChildren && option.children?.length ? option.children : [option]
      }),
  })).filter((group) => group.options.length > 0),
]

function displayGestureValue(interaction: Interaction) {
  if (interaction.custom_action) return CUSTOM_ACTION_VALUE
  if (isContinuousSound(interaction)) return CONTINUOUS_SOUND_AUTHORING_TYPE
  if (interaction.gesture === 'camera_motion' && interaction.vision?.target) {
    return presetValue('camera_motion', interaction.vision.target)
  }
  return interaction.gesture
}

export function patchForGesture(value: string, current?: Interaction): Partial<Interaction> {
  if (value === CUSTOM_ACTION_VALUE) {
    return { gesture: 'tap', custom_action: true }
  }
  const [gestureValue, preset] = value.split(PRESET_SEPARATOR, 2)
  const cameraTarget = preset || (
    gestureValue === 'camera_continuous'
      ? CAMERA_CONTINUOUS_DEFAULT_TARGET
      : 'hand_victory'
  )
  return {
    ...(gestureValue === CONTINUOUS_SOUND_AUTHORING_TYPE
      ? continuousSoundInteractionPatch(preset || continuousSoundTarget(current))
      : { gesture: gestureValue }),
    custom_action: false,
    action_description: undefined,
    ...(['camera_motion', 'camera_continuous'].includes(gestureValue)
      ? {
          vision: normalizeVisionConfig({ target: cameraTarget }, gestureValue),
          vision_resolution: { target_source: 'operator' as const },
          hint: gestureValue === 'camera_continuous'
            ? cameraContinuousTargetCopy(cameraTarget).hint
            : VISION_TARGET_HINTS[cameraTarget],
        }
      : {}),
    ...(gestureValue === 'pinch' && preset
      ? {
          pinch_direction: preset as PinchDirection,
          hint: pinchDirectionCopy(preset).hint,
        }
      : {}),
    ...(['rotate', 'draw_circle'].includes(gestureValue) && preset
      ? { rotation_direction: preset as RotationDirection }
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
    if (sustained && typeof interaction.gate_end_ms === 'number') {
      if (next > interaction.gate_end_ms - 1) return
    }
    onUpdate({ gate_at_ms: next })
  }

  function setEnd(seconds: number | null) {
    if (seconds == null) {
      onUpdate({ gate_end_ms: undefined })
      return
    }
    onUpdate({
      gate_end_ms: Math.max(interaction.gate_at_ms + 1, Math.round(Number(seconds) * 1000)),
    })
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
              : `${adminGestureLabel(displayGestureValue(selected))} / ${displayGestureValue(selected)}`}
          </Typography.Title>
        </div>
        <Space size={6}>
          {sustained ? <Tag color="lime">持续区间</Tag> : <Tag color="blue">单点互动</Tag>}
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
            max={sustained && typeof selected.gate_end_ms === 'number'
              ? Number(((selected.gate_end_ms - 1) / 1000).toFixed(3))
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

        {selectedIsBranch && !sustained ? (
          <div className="interaction-time-note">
            <InfoCircleOutlined /> 分支响应超时由故事流程统一控制，不在主时间轴编辑。
          </div>
        ) : sustained ? (
          <label className="interaction-time-row">
            <span>期望结束</span>
            <InputNumber
              aria-label="持续互动期望结束时间"
              min={Number(((selected.gate_at_ms + 1) / 1000).toFixed(3))}
              step={0.033}
              precision={3}
              disabled={!editing}
              value={exactEnd}
              placeholder="下一节点/片尾"
              addonAfter="s"
              onChange={setEnd}
            />
            <Button
              title="设为当前播放头"
              aria-label="把结束时间设为当前播放头"
              icon={<AimOutlined />}
              disabled={!editing || playheadMs < selected.gate_at_ms + 1}
              onClick={() => setEnd(playheadMs / 1000)}
            />
            {typeof selected.gate_end_ms === 'number' ? (
              <Button disabled={!editing} onClick={() => setEnd(null)}>自动</Button>
            ) : null}
          </label>
        ) : (
          <div className="interaction-time-note">
            <InfoCircleOutlined /> 单点互动在当前帧触发，无需设置结束时间。
          </div>
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

        {!selected.custom_action && usesRotationDirection(selected) ? (
          <RotationDirectionFields
            value={selected.rotation_direction}
            disabled={!editing}
            label={isDrawCircle(selected)
              ? '画圆方向（以用户正视屏幕为准）'
              : undefined}
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
