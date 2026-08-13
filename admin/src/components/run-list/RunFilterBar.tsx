import { PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Segmented, Space, Typography } from 'antd'
import { Link } from 'react-router-dom'

export type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'
export type SourceFilter = 'all' | 'pgc' | 'ugc' | 'manual_upload'

export const statusFilterOptions: { label: string; value: StatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '待审核', value: 'pending' },
  { label: '已发布', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
]

export const sourceOptions: { label: string; value: SourceFilter }[] = [
  { label: '全部', value: 'all' },
  { label: 'PGC', value: 'pgc' },
  { label: 'UGC', value: 'ugc' },
  { label: '手动上传', value: 'manual_upload' },
]

interface RunFilterBarProps {
  total: number
  sourceFilter: SourceFilter
  statusFilter: StatusFilter
  engineReady: boolean
  isManualUpload: boolean
  onSourceChange: (value: SourceFilter) => void
  onStatusChange: (value: StatusFilter) => void
  onCreateStory: () => void
  onUpload: () => void
}

export default function RunFilterBar({
  total,
  sourceFilter,
  statusFilter,
  engineReady,
  isManualUpload,
  onSourceChange,
  onStatusChange,
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
            <>
              请先到 <Link to="/settings">引擎配置</Link> 填写 Dify / 模型网关信息，才能上传并分析视频。
              <br />
              也可以选择"手动处理"，直接进入人工标注。
            </>
          }
        />
      ) : null}
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }} className="page-title">
          {isManualUpload ? '内容管理' : <>内容管理 <Typography.Text type="secondary">({total})</Typography.Text></>}
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
      <Segmented<SourceFilter>
        value={sourceFilter}
        options={sourceOptions}
        onChange={(value) => onSourceChange(value as SourceFilter)}
        style={{ marginBottom: 16 }}
      />
      {!isManualUpload ? (
        <Segmented<StatusFilter>
          value={statusFilter}
          options={statusFilterOptions}
          onChange={(value) => onStatusChange(value as StatusFilter)}
          style={{ margin: '0 0 16px 12px' }}
        />
      ) : null}
    </>
  )
}