import { DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Segmented, Space, Typography } from 'antd'
import { Link } from 'react-router-dom'

export type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'
export type SourceFilter = 'all' | 'pgc' | 'ugc' | 'manual_upload'
export type OwnStatusFilter = 'all' | 'attention' | 'unpublished' | 'published' | 'processing'
export type ProcessStatusFilter = 'all' | 'failed' | 'no_playable_plan' | 'ready' | 'processing'

export const statusFilterOptions: { label: string; value: StatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '待审核', value: 'pending' },
  { label: '已发布', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
]

export const processStatusFilterOptions: { label: string; value: ProcessStatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '处理失败', value: 'failed' },
  { label: '不可播放', value: 'no_playable_plan' },
  { label: '分析完成', value: 'ready' },
  { label: '处理中', value: 'processing' },
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
  processStatusFilter: ProcessStatusFilter
  ownStatusFilter: OwnStatusFilter
  keyword: string
  engineReady: boolean
  isManualUpload: boolean
  onSourceChange: (value: SourceFilter) => void
  onStatusChange: (value: StatusFilter) => void
  onProcessStatusChange: (value: ProcessStatusFilter) => void
  onOwnStatusChange: (value: OwnStatusFilter) => void
  onKeywordChange: (value: string) => void
  onCreateStory: () => void
  onUpload: () => void
}

export default function RunFilterBar({
  manageAll,
  total,
  sourceFilter,
  statusFilter,
  processStatusFilter,
  ownStatusFilter,
  keyword,
  engineReady,
  isManualUpload,
  onSourceChange,
  onStatusChange,
  onProcessStatusChange,
  onOwnStatusChange,
  onKeywordChange,
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
          <Space wrap>
            <Input.Search
              allowClear
              placeholder="搜索标题 / 文件名"
              value={keyword}
              onChange={(e) => onKeywordChange(e.target.value)}
              onSearch={onKeywordChange}
              style={{ width: 240 }}
              prefix={<SearchOutlined />}
            />
            <Button onClick={onCreateStory}>创建故事</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={onUpload}>
              上传视频
            </Button>
            <Link to="/trash">
              <Button icon={<DeleteOutlined />}>垃圾箱</Button>
            </Link>
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
        <Space wrap style={{ margin: '0 0 16px 12px' }}>
          <Segmented<StatusFilter>
            value={statusFilter}
            options={statusFilterOptions}
            onChange={(value) => onStatusChange(value as StatusFilter)}
          />
          <Segmented<ProcessStatusFilter>
            value={processStatusFilter}
            options={processStatusFilterOptions}
            onChange={(value) => onProcessStatusChange(value as ProcessStatusFilter)}
          />
        </Space>
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
