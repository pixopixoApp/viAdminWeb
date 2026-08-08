import { InputNumber, Space, Typography } from 'antd'

type Props = {
  value: number
  disabled?: boolean
  saving?: boolean
  /** 内层是否显示「Feed 权重」文案；嵌在 Descriptions 时传 false */
  showLabel?: boolean
  onChange: (next: number) => void
}

/** Feed 权重编辑：越大 Feed 越靠前。 */
export default function FeedWeightInput({
  value,
  disabled,
  saving,
  showLabel = true,
  onChange,
}: Props) {
  return (
    <Space size={8} wrap>
      {showLabel ? <Typography.Text type="secondary">Feed 权重</Typography.Text> : null}
      <InputNumber
        min={0}
        max={1_000_000}
        step={1}
        precision={0}
        disabled={disabled || saving}
        value={value}
        onChange={(n) => {
          if (n == null || Number.isNaN(Number(n))) return
          onChange(Math.max(0, Math.min(1_000_000, Math.round(Number(n)))))
        }}
      />
      {saving ? <Typography.Text type="secondary">保存中…</Typography.Text> : null}
    </Space>
  )
}
