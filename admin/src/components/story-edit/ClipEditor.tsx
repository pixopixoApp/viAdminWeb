import { Card, Empty, Input, Typography } from 'antd'
import type { ReactNode } from 'react'
import type { Interaction, InteractionPatch } from '../../types/interaction'
import { isSustainedPlaybackInteraction } from '../../types/interaction'
import type { ClipMeta } from '../../types/run'
import InteractionEditorWorkspace from '../editor/InteractionEditorWorkspace'
import InteractionInspector from '../editor/InteractionInspector'

type Props = {
  runId: string
  activeClipId: string
  rows: Interaction[]
  durationMs: number | undefined
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
  onUpdateSelected: (patch: InteractionPatch) => void
  onRemoveSelected: () => void
  clipMeta: ClipMeta[]
  note: string
  onNoteChange: (value: string) => void
  showOutcomes?: boolean
  branchInteractionIndex?: number | null
  contextTitle?: string
  contextPanel?: ReactNode
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
}

export default function ClipEditor({
  runId,
  activeClipId,
  rows,
  durationMs,
  editing,
  selectedIndex,
  playheadMs,
  onSelectIndex,
  onPlayheadChange,
  onAddInteractionAt,
  onUpdateInteractionAt,
  onUpdateSelected,
  onRemoveSelected,
  clipMeta,
  note,
  onNoteChange,
  showOutcomes = true,
  branchInteractionIndex = null,
  contextTitle = '片段 / 流程',
  contextPanel,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: Props) {
  const selected = selectedIndex == null ? null : rows[selectedIndex] || null
  const selectedIsBranch = selectedIndex != null
    && selectedIndex === branchInteractionIndex
    && !isSustainedPlaybackInteraction(selected)
  const selectedNextGate = selectedIndex == null ? undefined : rows[selectedIndex + 1]?.gate_at_ms

  if (!activeClipId) {
    return <Card className="page-card"><Empty description="请先上传或选择一个视频片段" /></Card>
  }

  const context = (
    <>
      {contextPanel}
      <section className="editor-note-panel">
        <Typography.Text strong>版本备注</Typography.Text>
        <Typography.Paragraph type="secondary">
          备注只用于运营协作，不会进入播放器玩法协议。
        </Typography.Paragraph>
        <Input.TextArea
          rows={5}
          disabled={!editing}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          maxLength={500}
          showCount
          placeholder="可选，自动保存"
        />
      </section>
    </>
  )

  return (
    <InteractionEditorWorkspace
      runId={runId}
      clipId={activeClipId}
      rows={rows}
      durationMs={durationMs}
      editing={editing}
      selectedIndex={selectedIndex}
      playheadMs={playheadMs}
      onSelectIndex={onSelectIndex}
      onPlayheadChange={onPlayheadChange}
      onAddInteractionAt={onAddInteractionAt}
      onUpdateInteractionAt={onUpdateInteractionAt}
      onRemoveSelected={onRemoveSelected}
      inspector={(
        <InteractionInspector
          selected={selected}
          selectedIndex={selectedIndex}
          nextGateAtMs={selectedNextGate}
          durationMs={durationMs}
          playheadMs={playheadMs}
          editing={editing}
          onUpdate={onUpdateSelected}
          onRemove={onRemoveSelected}
          clipMeta={clipMeta}
          activeClipId={activeClipId}
          showOutcomes={showOutcomes}
          selectedIsBranch={selectedIsBranch}
        />
      )}
      contextTitle={contextTitle}
      contextPanel={context}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={onUndo}
      onRedo={onRedo}
    />
  )
}
