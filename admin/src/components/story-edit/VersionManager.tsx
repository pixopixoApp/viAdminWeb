import { Select, Space, Typography } from 'antd'
import type { VersionInfo } from '../../types/run'
import { versionOptionLabel } from '../../types/interaction'

type Props = {
  version: string
  versionInfos: VersionInfo[]
  publishedVersion: string | null
  editing: boolean
  switching: boolean
  onSwitchVersion: (v: string) => void
  barNote: string
}

export default function VersionManager({
  version,
  versionInfos,
  publishedVersion,
  editing,
  switching,
  onSwitchVersion,
  barNote,
}: Props) {
  if (versionInfos.length === 0) return null

  return (
    <div
      style={{
        marginBottom: 16,
        padding: '10px 14px',
        background: '#fff',
        border: '1px solid #f0f0f0',
        borderRadius: 8,
      }}
    >
      <Space size="middle" wrap>
        <Typography.Text strong>版本</Typography.Text>
        <Select
          style={{ width: 200 }}
          value={version}
          loading={switching}
          options={versionInfos.map((v) => ({
            value: v.version,
            label: versionOptionLabel(v.label, v.version, publishedVersion),
          }))}
          onChange={(v) => void onSwitchVersion(v)}
        />
        <Typography.Text type="secondary">
          {editing ? '编辑中' : '已定稿'}
          {barNote ? ` · ${barNote}` : ''}
        </Typography.Text>
      </Space>
    </div>
  )
}