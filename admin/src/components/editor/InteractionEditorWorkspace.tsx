import {
  AppstoreOutlined,
  DownOutlined,
  FolderOpenOutlined,
  RedoOutlined,
  RightOutlined,
  UndoOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Button, Collapse, Tabs, Tag, Tooltip, Typography } from 'antd'
import { useEffect, useState, type DragEvent, type ReactNode } from 'react'
import type { Interaction, InteractionPatch } from '../../types/interaction'
import {
  isSustainedPlaybackInteraction,
  sustainedPlaybackEndMs,
} from '../../types/interaction'
import PreviewPlayer from '../PreviewPlayer'
import {
  CUSTOM_ACTION_VALUE,
  INTERACTION_TYPE_OPTIONS,
} from './InteractionInspector'
import { adminInteractionLabel } from './interactionCopy'
import { snapToEditorFrame } from './timelineUtils'

function interactionLabel(row: Interaction) {
  return adminInteractionLabel(row)
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
  const currentFrameMs = snapToEditorFrame(playheadMs, durationMs)
  const [expandedType, setExpandedType] = useState<string | null>(null)

  function beginPaletteDrag(event: DragEvent<HTMLButtonElement>, value: string) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/x-pixo-interaction', value)
    event.dataTransfer.setData('text/plain', value)
  }

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
        点击添加到当前帧，也可以拖到时间轴。
      </Typography.Paragraph>
      <Collapse
        className="interaction-library-collapse"
        ghost
        size="small"
        accordion
        defaultActiveKey={['0']}
        expandIconPosition="end"
        items={INTERACTION_TYPE_OPTIONS.map((group, groupIndex) => ({
          key: String(groupIndex),
          label: (
            <span className="interaction-library-group-label">
              <strong>{group.label}</strong>
              <small>{group.options.length}</small>
            </span>
          ),
          children: (
            <div className="interaction-library-grid">
              {group.options.map((option) => {
                const hasChildren = Boolean(option.children?.length)
                const expanded = expandedType === option.value
                return (
                  <div
                    key={String(option.value)}
                    className={`interaction-library-option${expanded ? ' is-expanded' : ''}`}
                  >
                    <button
                      type="button"
                      className="interaction-library-primary"
                      disabled={!editing}
                      draggable={editing && !hasChildren}
                      aria-expanded={hasChildren ? expanded : undefined}
                      title={hasChildren
                        ? `${expanded ? '收起' : '展开'} ${option.label} 的二级互动`
                        : `添加 ${option.label} 到 ${formatTime(currentFrameMs)}`}
                      onClick={() => {
                        if (hasChildren) {
                          setExpandedType(expanded ? null : String(option.value))
                          return
                        }
                        onAddInteractionAt(String(option.value), currentFrameMs)
                      }}
                      onDragStart={(event) => beginPaletteDrag(event, String(option.value))}
                    >
                      <span className="interaction-library-icon" aria-hidden="true">
                        {option.value === CUSTOM_ACTION_VALUE
                          ? '＋'
                          : String(option.label).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="interaction-library-option-copy">
                        <strong>{option.label}</strong>
                        <small>{option.code || String(option.value)}</small>
                      </span>
                      {hasChildren ? (
                        <span className="interaction-library-chevron" aria-hidden="true">
                          {expanded ? <DownOutlined /> : <RightOutlined />}
                        </span>
                      ) : null}
                    </button>
                    {hasChildren && expanded ? (
                      <div className="interaction-library-secondary">
                        {option.children?.map((child) => (
                          <button
                            key={String(child.value)}
                            type="button"
                            disabled={!editing}
                            draggable={editing}
                            title={`添加 ${child.label} 到 ${formatTime(currentFrameMs)}`}
                            onClick={() => onAddInteractionAt(String(child.value), currentFrameMs)}
                            onDragStart={(event) => beginPaletteDrag(event, String(child.value))}
                          >
                            <span>{child.label}</span>
                            <small>{child.code || String(child.value)}</small>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ),
        }))}
      />
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
