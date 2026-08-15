import { PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Segmented, Space, Typography } from 'antd'
import { Link } from 'react-router-dom'

export type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'
export type SourceFilter = 'all' | 'pgc' | 'ugc' | 'manual_upload'
export type OwnStatusFilter = 'all' | 'attention' | 'unpublished' | 'published' | 'processing'

export const statusFilterOptions: { label: string; value: StatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '待审核', value: 'pending' },
  { label: '已发布', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
]

export const ownStatusFilterOptions: { label: string; value: OwnStatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '待处理', value: 'attention' },
  { label: '待发布', value: 'unpublished' },
  { label: '已发布', value: 'published' },
  { label: '处理中', value: 'processing' },
]

export const sourceOptions: { label: string; value: SourceFilter }[] = [
  { label: '全部', value: 'all' },
  { label: 'PGC', value: 'pgc' },
  { label: 'UGC', value: 'ugc' },
  { label: '手动上传', value: 'manual_upload' },
]

interface RunFilterBarProps {
  manageAll: boolean
  total: number
  sourceFilter: SourceFilter
  statusFilter: StatusFilter
  ownStatusFilter: OwnStatusFilter
  engineReady: boolean
  isManualUpload: boolean
  onSourceChange: (value: SourceFilter) => void
  onStatusChange: (value: StatusFilter) => void
  onOwnStatusChange: (value: OwnStatusFilter) => void
  onCreateStory: () => void
  onUpload: () => void
}

export default function RunFilterBar({
  manageAll,
  total,
  sourceFilter,
  statusFilter,
  ownStatusFilter,
  engineReady,
  isManualUpload,
  onSourceChange,
  onStatusChange,
  onOwnStatusChange,
  onCreateStory,
  onUpload,
}: RunFilterBarProps) {
  return (
    <>
      {!engineReady && !isManualUpload ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="引擎未配置"
          description={
            manageAll ? (
              <>
                请先到 <Link to="/settings">引擎配置</Link> 填写 Dify / 模型网关信息，才能上传并分析视频。
                <br />
                也可以选择"手动处理"，直接进入人工标注。
              </>
            ) : (
              <>
                引擎暂未配置，请联系管理员完成引擎配置后再上传视频。
                <br />
                也可以选择"手动处理"，直接进入人工标注。
              </>
            )
          }
        />
      ) : null}
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }} className="page-title">
          {isManualUpload ? '内容管理' : manageAll ? (
            <>内容管理 <Typography.Text type="secondary">({total})</Typography.Text></>
          ) : (
            <>视频列表 <Typography.Text type="secondary">({total})</Typography.Text></>
          )}
        </Typography.Title>
        {!isManualUpload ? (
          <Space>
            <Button onClick={onCreateStory}>创建故事</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={onUpload}>
              上传视频
            </Button>
          </Space>
        ) : null}
      </Space>
      {manageAll ? (
        <Segmented<SourceFilter>
          value={sourceFilter}
          options={sourceOptions}
          onChange={(value) => onSourceChange(value as SourceFilter)}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      {!isManualUpload && manageAll ? (
        <Segmented<StatusFilter>
          value={statusFilter}
          options={statusFilterOptions}
          onChange={(value) => onStatusChange(value as StatusFilter)}
          style={{ margin: '0 0 16px 12px' }}
        />
      ) : null}
      {!manageAll ? (
        <Segmented<OwnStatusFilter>
          value={ownStatusFilter}
          options={ownStatusFilterOptions}
          onChange={(value) => onOwnStatusChange(value as OwnStatusFilter)}
          style={{ marginBottom: 16 }}
        />
      ) : null}
    </>
  )
}
