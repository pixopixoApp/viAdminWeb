import { Button, Card, Empty, Input, InputNumber, Space, Typography } from 'antd'
import type { Interaction } from '../../types/interaction'
import { GESTURE_LABEL } from '../../types/interaction'
import type { ClipMeta } from '../../types/run'
import ClipOutcomesEditor from '../ClipOutcomesEditor'
import PreviewPlayer from '../PreviewPlayer'

const GESTURES = Object.entries(GESTURE_LABEL).map(([value, label]) => ({ value, label }))

type Props = {
  runId: string
  activeClipId: string
  rows: Interaction[]
  durationMs: number | undefined
  editing: boolean
  selectedIndex: number | null
  onSelectIndex: (i: number | null) => void
  onPlayheadChange: (ms: number) => void
  onAddAtPlayhead: () => void
  onUpdateSelected: (patch: Partial<Interaction> & { gate_end_ms?: number | null }) => void
  onRemoveSelected: () => void
  clipMeta: ClipMeta[]
  note: string
  onNoteChange: (v: string) => void
}

export default function ClipEditor({
  runId,
  activeClipId,
  rows,
  durationMs,
  editing,
  selectedIndex,
  onSelectIndex,
  onPlayheadChange,
  onAddAtPlayhead,
  onUpdateSelected,
  onRemoveSelected,
  clipMeta,
  note,
  onNoteChange,
}: Props) {
  const selected = selectedIndex != null ? rows[selectedIndex] : null

  if (!activeClipId) {
    return <Empty description="请添加片段" />
  }

  return (
    <>
      <Card className="page-card" title="标注预览" size="small">
        <PreviewPlayer
          runId={runId}
          clipId={activeClipId}
          gates={rows}
          durationMs={durationMs}
          mode={editing ? 'annotate' : 'preview'}
          selectedIndex={selectedIndex}
          onSelectGate={onSelectIndex}
          onPlayheadChange={onPlayheadChange}
          onAddAtPlayhead={editing ? onAddAtPlayhead : undefined}
        />
      </Card>

      <Card className="page-card" title="选中互动" size="small">
        {!selected ? (
          <Empty description="先在进度条加点或选中一个互动点" />
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space wrap>
              <Typography.Text type="secondary">时刻 (s)</Typography.Text>
              <InputNumber
                min={0}
                step={0.033}
                precision={3}
                disabled={!editing}
                value={Number((selected.gate_at_ms / 1000).toFixed(3))}
                onChange={(n) =>
                  onUpdateSelected({ gate_at_ms: Math.max(0, Math.round(Number(n || 0) * 1000)) })
                }
              />
              <Typography.Text type="secondary">结束 (s)</Typography.Text>
              <InputNumber
                min={Number((selected.gate_at_ms / 1000).toFixed(3))}
                step={0.033}
                precision={3}
                disabled={!editing}
                value={
                  typeof selected.gate_end_ms === 'number'
                    ? Number((selected.gate_end_ms / 1000).toFixed(3))
                    : null
                }
                onChange={(n) =>
                  onUpdateSelected({
                    gate_end_ms:
                      n == null
                        ? undefined
                        : Math.max(selected.gate_at_ms, Math.round(Number(n) * 1000)),
                  })
                }
              />
              {editing ? (
                <Button size="small" danger onClick={onRemoveSelected}>
                  删除此点
                </Button>
              ) : null}
            </Space>

            <div>
              <Typography.Text type="secondary">互动动作</Typography.Text>
              <div className="gesture-grid" style={{ marginTop: 8 }}>
                {GESTURES.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    disabled={!editing}
                    className={
                      !selected.custom_action && selected.gesture === g.value ? 'on' : undefined
                    }
                    onClick={() =>
                      onUpdateSelected({
                        gesture: g.value,
                        custom_action: false,
                        action_description: undefined,
                      })
                    }
                  >
                    {g.label} <span className="gesture-code">{g.value}</span>
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!editing}
                  className={selected.custom_action ? 'on custom-action' : 'custom-action'}
                  onClick={() => onUpdateSelected({ gesture: 'tap', custom_action: true })}
                >
                  自定义动作 <span className="gesture-code">按点击处理</span>
                </button>
              </div>
              {selected.custom_action ? (
                <Input
                  style={{ marginTop: 10 }}
                  disabled={!editing}
                  value={selected.action_description || ''}
                  maxLength={80}
                  showCount
                  onChange={(e) => onUpdateSelected({ action_description: e.target.value })}
                  placeholder="描述用户需要执行的动作"
                />
              ) : null}
            </div>

            <div>
              <Typography.Text type="secondary">Hint</Typography.Text>
              <Input
                style={{ marginTop: 8 }}
                disabled={!editing}
                value={selected.hint || ''}
                maxLength={40}
                showCount
                onChange={(e) => onUpdateSelected({ hint: e.target.value })}
              />
            </div>

            <ClipOutcomesEditor
              value={selected.outcomes}
              clips={clipMeta}
              currentClipId={activeClipId}
              disabled={!editing}
              onChange={(outcomes) => onUpdateSelected({ outcomes })}
            />
          </Space>
        )}
      </Card>

      <Card className="page-card" title="版本备注" size="small">
        <Input.TextArea
          rows={2}
          disabled={!editing}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          maxLength={500}
          showCount
          placeholder="可选"
        />
      </Card>
    </>
  )
}