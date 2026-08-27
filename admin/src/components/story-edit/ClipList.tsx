import { Button, Card, Select, Space, Typography, Upload, message } from 'antd'
import type { ClipMeta, ClipOnEnd } from '../../types/run'

type Props = {
  clipMeta: ClipMeta[]
  activeClipId: string
  entryClipId: string
  editing: boolean
  uploading: boolean
  uploadStatusText: string
  onUploadClip: (file: File) => Promise<boolean>
  onSwitchClip: (clipId: string) => void
  onSetEntryClip: () => void
  clipOnEnd: ClipOnEnd | undefined
  onClipOnEndChange: (v: ClipOnEnd | undefined) => void
  guided?: boolean
}

export default function ClipList({
  clipMeta,
  activeClipId,
  entryClipId,
  editing,
  uploading,
  uploadStatusText,
  onUploadClip,
  onSwitchClip,
  onSetEntryClip,
  clipOnEnd,
  onClipOnEndChange,
  guided = false,
}: Props) {
  return (
    <Card className="page-card" title={guided ? '视频素材' : '片段'} size="small" style={{ marginBottom: 16 }}>
      <Space wrap>
        {!guided ? clipMeta.map((c) => (
          <Button
            key={c.clip_id}
            type={c.clip_id === activeClipId ? 'primary' : 'default'}
            onClick={() => onSwitchClip(c.clip_id)}
          >
            {c.source_filename || c.clip_id.slice(0, 8)}
            {c.clip_id === entryClipId ? ' · 入口' : ''}
          </Button>
        )) : (
          <Typography.Text type="secondary">已添加 {clipMeta.length} 个片段，在下方分配主片、成功片和失败片。</Typography.Text>
        )}
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
        {uploadStatusText ? (
          <Typography.Text type="secondary">{uploadStatusText}</Typography.Text>
        ) : null}
      </Space>
      {activeClipId && !guided ? (
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
            <Typography.Text type="secondary">片段播完后</Typography.Text>
            <Select
              style={{ minWidth: 200 }}
              disabled={!editing}
              allowClear
              placeholder="按数组顺序继续"
              value={
                clipOnEnd?.action === 'goto'
                  ? `goto:${clipOnEnd.clip_id}`
                  : clipOnEnd?.action
              }
              options={[
                { value: 'end', label: '结束体验' },
                { value: 'retry_previous_point', label: '重试上一个互动点' },
                ...clipMeta.map((c) => ({
                  value: `goto:${c.clip_id}`,
                  label: `跳到 ${c.source_filename || c.clip_id.slice(0, 8)}`,
                })),
              ]}
              onChange={(value) => {
                if (!value) onClipOnEndChange(undefined)
                else if (value === 'end') onClipOnEndChange({ action: 'end' })
                else if (value === 'retry_previous_point') {
                  onClipOnEndChange({ action: 'retry_previous_point' })
                } else if (value.startsWith('goto:')) {
                  onClipOnEndChange({ action: 'goto', clip_id: value.slice(5) })
                }
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
