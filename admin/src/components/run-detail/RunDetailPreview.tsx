import { Card } from 'antd'
import PreviewPlayer from '../PreviewPlayer'
import type { Gate } from '../../types/interaction'

type Props = {
  runId: string
  gates: Gate[]
  durationMs?: number
  visible: boolean
}

export default function RunDetailPreview({ runId, gates, durationMs, visible }: Props) {
  if (!visible) return null
  return (
    <Card className="page-card" title="效果预览" size="small">
      <PreviewPlayer
        runId={runId}
        gates={gates}
        durationMs={durationMs}
      />
    </Card>
  )
}