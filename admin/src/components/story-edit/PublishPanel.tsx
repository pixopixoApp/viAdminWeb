import { Modal, Select, Space, Typography } from 'antd'
import type { VersionInfo, PickAccount } from '../../types/run'
import { versionOptionLabel } from '../../types/interaction'

type Props = {
  publishOpen: boolean
  onClose: () => void
  onPublish: () => void
  publishing: boolean
  publishVersion: string | undefined
  publishOptions: VersionInfo[]
  publishedVersion: string | null
  onPublishVersionChange: (v: string) => void
  publishUserId: string | undefined
  pickAccounts: PickAccount[]
  pickLoading: boolean
  onPublishUserIdChange: (v: string) => void
  title: string
  feedWeight: number
  isTutorial: boolean
  published: boolean
}

export default function PublishPanel({
  publishOpen,
  onClose,
  onPublish,
  publishing,
  publishVersion,
  publishOptions,
  publishedVersion,
  onPublishVersionChange,
  publishUserId,
  pickAccounts,
  pickLoading,
  onPublishUserIdChange,
  title,
  feedWeight,
  isTutorial,
  published,
}: Props) {
  return (
    <Modal
      title={published ? '更新发布' : '发布故事'}
      open={publishOpen}
      onCancel={onClose}
      onOk={onPublish}
      confirmLoading={publishing}
      okButtonProps={{ disabled: !publishVersion || !publishUserId }}
      okText={published ? '确认更新' : '确认发布'}
      cancelText="取消"
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Typography.Text type="secondary">发布版本</Typography.Text>
          <Select
            style={{ width: '100%', marginTop: 4 }}
            placeholder="选择版本"
            value={publishVersion}
            options={publishOptions.map((v) => ({
              value: v.version,
              label: versionOptionLabel(v.label, v.version, publishedVersion),
            }))}
            onChange={onPublishVersionChange}
          />
        </div>
        <div>
          <Typography.Text type="secondary">发布到</Typography.Text>
          <Select
            style={{ width: '100%', marginTop: 4 }}
            placeholder="选择 App 账号"
            loading={pickLoading}
            value={publishUserId}
            options={pickAccounts.map((a) => ({
              value: a.user_id,
              label: a.nickname || a.user_id,
            }))}
            onChange={onPublishUserIdChange}
            showSearch
            optionFilterProp="label"
          />
        </div>
        <Typography.Paragraph
          type="secondary"
          style={{ marginBottom: 0, padding: 12, background: '#f5f5f5', borderRadius: 6 }}
        >
          将《{title}》{publishVersion || '所选版本'}发布到所选 App 账号。
          Feed 权重：{feedWeight}；教学视频：{isTutorial ? '是' : '否'}（可在页头修改）
        </Typography.Paragraph>
      </Space>
    </Modal>
  )
}