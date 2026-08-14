import { Select, Space, Switch, Typography } from 'antd'

export type VisionConfig = {
  registry_version?: 'v1'
  target?: string
  camera_facing?: 'front' | 'back'
  show_preview?: boolean
  min_confidence?: number
  stable_for_ms?: number
}

const HAND_TARGETS = [
  ['hand_victory', '比耶'],
  ['hand_thumb_up', '点赞'],
  ['hand_thumb_down', '踩'],
  ['hand_open_palm', '张开手掌'],
  ['hand_closed_fist', '握拳'],
  ['hand_pointing_up', '食指向上'],
  ['hand_i_love_you', '我爱你手势'],
]
const FACE_TARGETS = [
  ['face_smile', '微笑'],
  ['face_wink_left', '左眼眨眼（以本人为准）'],
  ['face_wink_right', '右眼眨眼（以本人为准）'],
  ['face_blink', '双眼眨眼'],
  ['face_mouth_open', '张嘴'],
  ['face_mouth_pucker', '嘟嘴'],
  ['face_brow_raise', '挑眉'],
  ['face_brow_furrow', '皱眉'],
  ['face_cheek_puff', '鼓腮'],
]

const TARGET_DEFAULTS: Record<string, Pick<Required<VisionConfig>, 'min_confidence' | 'stable_for_ms'>> = {
  hand_victory: { min_confidence: 0.82, stable_for_ms: 400 },
  hand_thumb_up: { min_confidence: 0.6, stable_for_ms: 250 },
  hand_thumb_down: { min_confidence: 0.82, stable_for_ms: 400 },
  hand_open_palm: { min_confidence: 0.55, stable_for_ms: 250 },
  hand_closed_fist: { min_confidence: 0.82, stable_for_ms: 400 },
  hand_pointing_up: { min_confidence: 0.55, stable_for_ms: 250 },
  hand_i_love_you: { min_confidence: 0.6, stable_for_ms: 250 },
  face_smile: { min_confidence: 0.5, stable_for_ms: 150 },
  face_wink_left: { min_confidence: 0.5, stable_for_ms: 150 },
  face_wink_right: { min_confidence: 0.5, stable_for_ms: 150 },
  face_blink: { min_confidence: 0.5, stable_for_ms: 150 },
  face_mouth_open: { min_confidence: 0.5, stable_for_ms: 150 },
  face_mouth_pucker: { min_confidence: 0.5, stable_for_ms: 150 },
  face_brow_raise: { min_confidence: 0.65, stable_for_ms: 250 },
  face_brow_furrow: { min_confidence: 0.5, stable_for_ms: 150 },
  face_cheek_puff: { min_confidence: 0.5, stable_for_ms: 150 },
}

const DEFAULT_VISION: Required<VisionConfig> = {
  registry_version: 'v1',
  target: 'hand_victory',
  camera_facing: 'front',
  show_preview: true,
  min_confidence: 0.82,
  stable_for_ms: 400,
}

export function normalizeVisionConfig(value?: VisionConfig): Required<VisionConfig> {
  const target = value?.target || DEFAULT_VISION.target
  return {
    ...DEFAULT_VISION,
    ...value,
    target,
    min_confidence: value?.min_confidence ?? (target.startsWith('face_') ? 0.72 : 0.82),
  }
}

export default function VisionInteractionFields({
  value,
  disabled = false,
  onChange,
}: {
  value?: VisionConfig
  disabled?: boolean
  onChange: (next: Required<VisionConfig>) => void
}) {
  const current = normalizeVisionConfig(value)
  const update = (patch: Partial<VisionConfig>) => onChange(normalizeVisionConfig({ ...current, ...patch }))
  const selectTarget = (target: string) => onChange(normalizeVisionConfig({
    ...current,
    target,
    ...(TARGET_DEFAULTS[target] || {}),
  }))
  return (
    <div style={{ marginTop: 14, padding: 12, background: '#f6f8ff', borderRadius: 8 }}>
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Typography.Text strong>第二步：选择具体识别目标（必选）</Typography.Text>
        <Typography.Text type="secondary">
          `camera_motion` 只是镜头识别大类；请在下方选择具体手势或表情。Android 真机端侧识别，不上传或保存摄像头画面。
        </Typography.Text>
        <Space wrap>
          <Typography.Text type="secondary">具体手势 / 表情</Typography.Text>
          <Select
            style={{ minWidth: 230 }}
            popupClassName="vision-target-dropdown"
            disabled={disabled}
            value={current.target}
            onChange={selectTarget}
            options={[
              { label: '手势', options: HAND_TARGETS.map(([value, label]) => ({ value, label })) },
              { label: '表情', options: FACE_TARGETS.map(([value, label]) => ({ value, label })) },
            ]}
          />
          <Typography.Text type="secondary">镜头</Typography.Text>
          <Select
            style={{ width: 100 }}
            disabled={disabled}
            value={current.camera_facing}
            onChange={(camera_facing) => update({ camera_facing })}
            options={[{ value: 'front', label: '前置' }, { value: 'back', label: '后置' }]}
          />
          <Typography.Text type="secondary">显示摄像头画面</Typography.Text>
          <Switch
            disabled={disabled}
            checked={current.show_preview}
            onChange={(show_preview) => update({ show_preview })}
          />
        </Space>
      </Space>
    </div>
  )
}
