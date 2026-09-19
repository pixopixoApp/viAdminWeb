import {
  AppstoreOutlined,
  FolderOpenOutlined,
  RedoOutlined,
  UndoOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Button, Tabs, Tag, Tooltip, Typography } from 'antd'
import { useEffect, type ReactNode } from 'react'
import type { Interaction, InteractionPatch } from '../../types/interaction'
import {
  gestureAuthoringLabel,
  isContinuousSound,
  isSustainedPlaybackInteraction,
  sustainedPlaybackEndMs,
} from '../../types/interaction'
import PreviewPlayer from '../PreviewPlayer'
import {
  CUSTOM_ACTION_VALUE,
  INTERACTION_TYPE_OPTIONS,
} from './InteractionInspector'

function interactionLabel(row: Interaction) {
  if (row.custom_action) return row.action_description || '自定义动作'
  if (isContinuousSound(row)) return gestureAuthoringLabel('mic_continuous')
  return gestureAuthoringLabel(row.gesture)
}

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, ms) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const millis = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

type Props = {
  runId: string
  videoUrl?: string
  clipId?: string
  rows: Interaction[]
  durationMs?: number
  editing: boolean
  selectedIndex: number | null
  playheadMs: number
  onSelectIndex: (index: number | null) => void
  onPlayheadChange: (ms: number) => void
  onAddInteractionAt: (gestureValue: string, ms: number) => void
  onUpdateInteractionAt: (
    index: number,
    patch: InteractionPatch,
  ) => void
  onRemoveSelected?: () => void
  inspector: ReactNode
  contextTitle?: string
  contextPanel?: ReactNode
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
}

export default function InteractionEditorWorkspace({
  runId,
  videoUrl,
  clipId,
  rows,
  durationMs,
  editing,
  selectedIndex,
  playheadMs,
  onSelectIndex,
  onPlayheadChange,
  onAddInteractionAt,
  onUpdateInteractionAt,
  onRemoveSelected,
  inspector,
  contextTitle = '片段 / 流程',
  contextPanel,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: Props) {
  useEffect(() => {
    if (!editing) return
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) onRedo?.()
        else onUndo?.()
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIndex != null) {
        event.preventDefault()
        onRemoveSelected?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editing, onRedo, onRemoveSelected, onUndo, selectedIndex])

  const palette = (
    <div className="interaction-library">
      <Typography.Paragraph type="secondary">
        点击可添加到播放头，也可以拖到下方时间轴。
      </Typography.Paragraph>
      {INTERACTION_TYPE_OPTIONS.map((group) => (
        <section className="interaction-library-group" key={String(group.label)}>
          <Typography.Text strong>{group.label}</Typography.Text>
          <div className="interaction-library-grid">
            {group.options.map((option) => (
              <button
                key={String(option.value)}
                type="button"
                disabled={!editing}
                draggable={editing}
                title={`添加 ${option.label}`}
                onClick={() => onAddInteractionAt(String(option.value), playheadMs)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'copy'
                  event.dataTransfer.setData('application/x-pixo-interaction', String(option.value))
                  event.dataTransfer.setData('text/plain', String(option.value))
                }}
              >
                <span className="interaction-library-icon" aria-hidden="true">
                  {option.value === CUSTOM_ACTION_VALUE
                    ? '＋'
                    : String(option.label).slice(0, 1).toUpperCase()}
                </span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )

  const nodes = (
    <div className="interaction-workspace-node-list">
      {rows.length === 0 ? (
        <div className="interaction-node-empty">
          <UnorderedListOutlined />
          <span>还没有互动节点</span>
          <small>从互动库添加，或拖到时间轴。</small>
        </div>
      ) : rows.map((row, index) => {
        const effectiveEnd = isSustainedPlaybackInteraction(row)
          ? sustainedPlaybackEndMs(row, rows[index + 1]?.gate_at_ms, durationMs)
          : undefined
        const clipped = typeof row.gate_end_ms === 'number'
          && typeof effectiveEnd === 'number'
          && row.gate_end_ms > effectiveEnd
        return (
          <button
            key={`${row.gate_at_ms}-${index}-${row.gesture}`}
            type="button"
            className={selectedIndex === index ? 'is-selected' : undefined}
            onClick={() => onSelectIndex(index)}
          >
            <span className="interaction-node-order">{String(index + 1).padStart(2, '0')}</span>
            <span className="interaction-node-copy">
              <strong>{interactionLabel(row)}</strong>
              <small>
                {formatTime(row.gate_at_ms)}
                {typeof effectiveEnd === 'number'
                  ? ` → ${formatTime(effectiveEnd)}`
                  : typeof row.gate_end_ms === 'number'
                    ? ` → ${formatTime(row.gate_end_ms)}`
                    : ''}
              </small>
            </span>
            {clipped ? (
              <Tooltip title="期望结束时间已被下一节点或片尾截断">
                <WarningOutlined className="interaction-node-warning" />
              </Tooltip>
            ) : null}
          </button>
        )
      })}
    </div>
  )

  const items = [
    {
      key: 'library',
      label: <span><AppstoreOutlined /> 互动库</span>,
      children: palette,
    },
    {
      key: 'nodes',
      label: <span><UnorderedListOutlined /> 节点 {rows.length}</span>,
      children: nodes,
    },
    ...(contextPanel ? [{
      key: 'context',
      label: <span><FolderOpenOutlined /> {contextTitle}</span>,
      children: <div className="interaction-workspace-context">{contextPanel}</div>,
    }] : []),
  ]

  return (
    <div className="interaction-workspace">
      <div className="interaction-workspace-toolbar">
        <div className="interaction-workspace-status">
          <Tag color="blue">互动编辑</Tag>
          <span>{rows.length} 个节点</span>
          <span className="interaction-workspace-timecode">{formatTime(playheadMs)}</span>
        </div>
        <div className="interaction-workspace-actions">
          <Tooltip title="撤销（⌘/Ctrl + Z）">
            <Button
              type="text"
              icon={<UndoOutlined />}
              aria-label="撤销"
              disabled={!editing || !canUndo}
              onClick={onUndo}
            />
          </Tooltip>
          <Tooltip title="重做（Shift + ⌘/Ctrl + Z）">
            <Button
              type="text"
              icon={<RedoOutlined />}
              aria-label="重做"
              disabled={!editing || !canRedo}
              onClick={onRedo}
            />
          </Tooltip>
        </div>
      </div>

      <aside className="interaction-workspace-left" aria-label="互动资源与节点">
        <Tabs size="small" defaultActiveKey="library" items={items} />
      </aside>

      <PreviewPlayer
        runId={runId}
        videoUrl={videoUrl}
        clipId={clipId}
        gates={rows}
        durationMs={durationMs}
        mode={editing ? 'annotate' : 'preview'}
        selectedIndex={selectedIndex}
        onSelectGate={onSelectIndex}
        onPlayheadChange={onPlayheadChange}
        workspace
        onAddInteractionAt={editing ? onAddInteractionAt : undefined}
        onUpdateGate={editing ? onUpdateInteractionAt : undefined}
      />

      <aside className="interaction-workspace-inspector" aria-label="互动属性">
        {inspector}
      </aside>
    </div>
  )
}
