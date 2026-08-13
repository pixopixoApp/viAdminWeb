import { Button, Card, Select, Space, Typography, Upload, message } from 'antd'
import type { ClipMeta, ClipOnEnd } from '../../types/run'

type Props = {
  clipMeta: ClipMeta[]
  activeClipId: string
  entryClipId: string
  editing: boolean
  uploading: boolean
  onUploadClip: (file: File) => Promise<boolean>
  onSwitchClip: (clipId: string) => void
  onSetEntryClip: () => void
  clipOnEnd: ClipOnEnd | undefined
  onClipOnEndChange: (v: ClipOnEnd | undefined) => void
}

export default function ClipList({
  clipMeta,
  activeClipId,
  entryClipId,
  editing,
  uploading,
  onUploadClip,
  onSwitchClip,
  onSetEntryClip,
  clipOnEnd,
  onClipOnEndChange,
}: Props) {
  return (
    <Card className="page-card" title="片段" size="small" style={{ marginBottom: 16 }}>
      <Space wrap>
        {clipMeta.map((c) => (
          <Button
            key={c.clip_id}
            type={c.clip_id === activeClipId ? 'primary' : 'default'}
            onClick={() => onSwitchClip(c.clip_id)}
          >
            {c.source_filename || c.clip_id.slice(0, 8)}
            {c.clip_id === entryClipId ? ' · 入口' : ''}
          </Button>
        ))}
        {editing ? (
          <Upload
            accept="video/mp4,video/*"
            showUploadList={false}
            beforeUpload={(file) => {
              void onUploadClip(file)
              return false
            }}
            disabled={uploading}
          >
            <Button loading={uploading}>添加片段</Button>
          </Upload>
        ) : null}
      </Space>
      {activeClipId ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {editing ? (
            <div>
              <Button
                type="primary"
                disabled={entryClipId === activeClipId}
                onClick={() => {
                  onSetEntryClip()
                  message.success('已设为入口')
                }}
              >
                {entryClipId === activeClipId ? '当前为入口' : '设为入口'}
              </Button>
            </div>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Typography.Text type="secondary">播完后跳到</Typography.Text>
            <Select
              style={{ minWidth: 200 }}
              disabled={!editing}
              allowClear
              placeholder="无"
              value={clipOnEnd?.clip_id}
              options={clipMeta.map((c) => ({
                value: c.clip_id,
                label: c.source_filename || c.clip_id.slice(0, 8),
              }))}
              onChange={(clipId) => {
                onClipOnEndChange(clipId ? { action: 'goto', clip_id: clipId } : undefined)
              }}
            />
          </div>
        </div>
      ) : null}
      {!clipMeta.length ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          先上传至少一个片段，再标注互动与跳转。
        </Typography.Paragraph>
      ) : null}
    </Card>
  )
}