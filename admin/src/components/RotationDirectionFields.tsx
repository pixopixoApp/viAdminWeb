import { Select, Space, Typography } from 'antd'
import {
  normalizeRotationDirection,
  type RotationDirection,
} from '../types/interaction'

type Props = {
  value?: RotationDirection
  disabled?: boolean
  onChange: (value: RotationDirection) => void
}

export default function RotationDirectionFields({
  value,
  disabled = false,
  onChange,
}: Props) {
  return (
    <Space direction="vertical" size={4} style={{ marginTop: 10 }}>
      <Typography.Text type="secondary">旋转方向（以用户正视屏幕为准）</Typography.Text>
      <Select
        disabled={disabled}
        value={normalizeRotationDirection(value)}
        style={{ minWidth: 220 }}
        options={[
          { value: 'clockwise', label: '顺时针' },
          { value: 'counterclockwise', label: '逆时针' },
        ]}
        onChange={(next) => onChange(next as RotationDirection)}
      />
    </Space>
  )
}
