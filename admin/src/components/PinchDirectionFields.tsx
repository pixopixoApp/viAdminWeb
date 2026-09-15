import { Select, Space, Typography } from 'antd'
import { normalizePinchDirection, pinchDirectionCopy, type PinchDirection } from '../types/interaction'

// Same one-way fingertip motion and invisible reset as the App's Runtime guide.
export function PinchDirectionGuide({ value }: { value?: PinchDirection }) {
  const direction = normalizePinchDirection(value)
  return <>
    <style>{`
      .pixo-pinch-guide { width: 58px; height: 58px; color: var(--ant-color-primary, #1677ff); }
      .pixo-pinch-guide g { fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
      .pixo-pinch-guide .finger-a { animation: pixo-pinch-in-a 1.6s ease-in-out infinite; }
      .pixo-pinch-guide .finger-b { animation: pixo-pinch-in-b 1.6s ease-in-out infinite; }
      .pixo-pinch-guide[data-direction="outward"] .finger-a { animation-name: pixo-pinch-out-a; }
      .pixo-pinch-guide[data-direction="outward"] .finger-b { animation-name: pixo-pinch-out-b; }
      @keyframes pixo-pinch-in-a { 0%,10% { transform:translate(-4px,-4px);opacity:1; } 50%,62% { transform:translate(3px,3px);opacity:1; } 68%,100% { transform:translate(3px,3px);opacity:0; } }
      @keyframes pixo-pinch-in-b { 0%,10% { transform:translate(4px,4px);opacity:1; } 50%,62% { transform:translate(-3px,-3px);opacity:1; } 68%,100% { transform:translate(-3px,-3px);opacity:0; } }
      @keyframes pixo-pinch-out-a { 0%,10% { transform:translate(3px,3px);opacity:1; } 50%,62% { transform:translate(-4px,-4px);opacity:1; } 68%,100% { transform:translate(-4px,-4px);opacity:0; } }
      @keyframes pixo-pinch-out-b { 0%,10% { transform:translate(-3px,-3px);opacity:1; } 50%,62% { transform:translate(4px,4px);opacity:1; } 68%,100% { transform:translate(4px,4px);opacity:0; } }
      @media (prefers-reduced-motion:reduce) { .pixo-pinch-guide .finger-a,.pixo-pinch-guide .finger-b { animation:none;opacity:1; } }
    `}</style>
    <svg className="pixo-pinch-guide" data-direction={direction} viewBox="0 0 48 48" role="img" aria-label={pinchDirectionCopy(direction).label}>
      <g><path d={direction === 'outward' ? 'M15 15h-5v5m0-5 7 7M33 33h5v-5m0 5-7-7' : 'M13 13l7 7m-5 0h5v-5M35 35l-7-7m5 0h-5v5'} /></g>
      <g className="finger-a"><circle cx="16" cy="16" r="4" /><path d="M16 20v5" /></g>
      <g className="finger-b"><circle cx="32" cy="32" r="4" /><path d="M32 36v5" /></g>
    </svg>
  </>
}

export default function PinchDirectionFields({ value, disabled = false, onChange }: {
  value?: PinchDirection
  disabled?: boolean
  onChange: (direction: PinchDirection) => void
}) {
  return <Space direction="vertical" size={4} style={{ marginTop: 10 }}>
    <Typography.Text type="secondary">第二步：选择 Pinch 方向</Typography.Text>
    <Select aria-label="Pinch 方向" disabled={disabled} value={normalizePinchDirection(value)} style={{ minWidth: 220 }}
      options={(['inward', 'outward'] as PinchDirection[]).map((direction) => ({ value: direction, label: pinchDirectionCopy(direction).label }))}
      onChange={onChange} />
    <Space><PinchDirectionGuide value={value} /><Typography.Text type="secondary">{pinchDirectionCopy(value).hint}，只判定所选方向</Typography.Text></Space>
  </Space>
}
