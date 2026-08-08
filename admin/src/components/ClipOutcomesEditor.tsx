import { Select, Space, Typography } from 'antd'

export type OutcomeAction = 'continue' | 'goto' | 'replay'

export type OutcomeEdge = {
  action: OutcomeAction
  clip_id?: string
}

export type Outcomes = {
  success?: OutcomeEdge
  fail?: OutcomeEdge
}

type ClipOption = { clip_id: string; source_filename: string }

type Props = {
  value?: Outcomes | null
  clips: ClipOption[]
  currentClipId?: string
  disabled?: boolean
  onChange: (next: Outcomes) => void
}

const ACTION_OPTIONS: { value: OutcomeAction; label: string }[] = [
  { value: 'continue', label: '同片继续' },
  { value: 'goto', label: '跳到片段' },
  { value: 'replay', label: '重播本片' },
]

function normalizeAction(action?: string): OutcomeAction {
  if (action === 'goto' || action === 'replay' || action === 'continue') return action
  return 'continue'
}

function normalizeEdge(edge?: OutcomeEdge | { action?: string; clip_id?: string }): OutcomeEdge {
  if (!edge || !edge.action) return { action: 'continue' }
  const action = normalizeAction(edge.action)
  return {
    action,
    ...(action === 'goto' && edge.clip_id ? { clip_id: edge.clip_id } : {}),
  }
}

function EdgeRow({
  label,
  edge,
  clips,
  currentClipId,
  disabled,
  onChange,
}: {
  label: string
  edge: OutcomeEdge
  clips: ClipOption[]
  currentClipId?: string
  disabled?: boolean
  onChange: (edge: OutcomeEdge) => void
}) {
  return (
    <Space wrap style={{ width: '100%' }}>
      <Typography.Text type="secondary" style={{ width: 48 }}>
        {label}
      </Typography.Text>
      <Select
        style={{ width: 140 }}
        value={edge.action}
        options={ACTION_OPTIONS}
        disabled={disabled}
        onChange={(action) =>
          onChange({
            action,
            clip_id: action === 'goto' ? edge.clip_id || currentClipId || clips[0]?.clip_id : undefined,
          })
        }
      />
      {edge.action === 'goto' ? (
        <Select
          style={{ minWidth: 200 }}
          placeholder="选择片段"
          value={edge.clip_id || undefined}
          disabled={disabled}
          options={clips.map((c) => ({
            value: c.clip_id,
            label: c.source_filename || c.clip_id.slice(0, 8),
          }))}
          onChange={(clip_id) => onChange({ action: 'goto', clip_id })}
        />
      ) : null}
    </Space>
  )
}

export default function ClipOutcomesEditor({ value, clips, currentClipId, disabled, onChange }: Props) {
  const outcomes: Outcomes = {
    success: normalizeEdge(value?.success),
    fail: normalizeEdge(value?.fail),
  }

  function patch(key: keyof Outcomes, edge: OutcomeEdge) {
    if (disabled) return
    onChange({
      ...outcomes,
      [key]: normalizeEdge(edge),
    })
  }

  return (
    <div>
      <Typography.Text type="secondary">片段跳转（成功 / 失败）</Typography.Text>
      <Space direction="vertical" size="small" style={{ width: '100%', marginTop: 8 }}>
        <EdgeRow
          label="成功"
          edge={outcomes.success!}
          clips={clips}
          currentClipId={currentClipId}
          disabled={disabled}
          onChange={(e) => patch('success', e)}
        />
        <EdgeRow
          label="失败"
          edge={outcomes.fail!}
          clips={clips}
          currentClipId={currentClipId}
          disabled={disabled}
          onChange={(e) => patch('fail', e)}
        />
      </Space>
    </div>
  )
}
