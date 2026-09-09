import { Select, Space, Typography } from 'antd'
import type { Interaction } from '../types/interaction'
import {
  CONTINUOUS_SOUND_TARGET_COPY,
  continuousSoundInteractionPatch,
  continuousSoundTarget,
} from '../types/interaction'

export default function SoundInteractionFields({
  value,
  disabled = false,
  onChange,
}: {
  value: Pick<Interaction, 'gesture'>
  disabled?: boolean
  onChange: (patch: Pick<Interaction, 'gesture' | 'hint' | 'pause_video'>) => void
}) {
  const target = continuousSoundTarget(value)
  return (
    <div className="vision-interaction-fields sound-interaction-fields">
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Typography.Text strong>第二步：选择具体识别方式（必选）</Typography.Text>
        <Typography.Text type="secondary">
          Continuous Sound 是持续声音交互大类；请选择吹气音量或人声音调作为持续播放标准。
        </Typography.Text>
        <Space wrap>
          <Typography.Text type="secondary">持续声音方式</Typography.Text>
          <Select
            style={{ minWidth: 280 }}
            disabled={disabled}
            value={target}
            onChange={(nextTarget) => onChange(continuousSoundInteractionPatch(nextTarget))}
            options={Object.entries(CONTINUOUS_SOUND_TARGET_COPY).map(([value, copy]) => ({
              value,
              label: copy.label,
            }))}
          />
        </Space>
      </Space>
    </div>
  )
}
