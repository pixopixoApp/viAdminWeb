import { Button, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link } from 'react-router-dom'
import { formatServerTime } from '../../time'
import { statusMeta, type Run } from '../../types/run'

export function formatBytes(n?: number) {
  if (!n) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(ms?: number) {
  if (ms == null) return '-'
  return `${(ms / 1000).toFixed(1)} 秒`
}

interface RunTableProps {
  manageAll: boolean
  rows: Run[]
  loading: boolean
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number, pageSize: number) => void
  onReview: (run: Run) => void
  onDelete: (run: Run) => void
  onEditWeight: (run: Run) => void
}

export default function RunTable({
  manageAll,
  rows,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
  onReview,
  onDelete,
  onEditWeight,
}: RunTableProps) {
  const sourceColumn: ColumnsType<Run>[number] = {
    title: '来源',
    key: 'source',
    width: 92,
    render: (_, row) => <Tag color={row.source === 'ugc' ? 'purple' : row.source === 'manual_upload' ? 'cyan' : 'blue'}>{row.source === 'ugc' ? 'UGC' : row.source === 'manual_upload' ? '手动上传' : 'PGC'}</Tag>,
  }

  const columns: ColumnsType<Run> = [
    {
      title: '封面', key: 'cover', width: 88,
      render: (_, row) => row.cover_url ? (
        <img src={row.cover_url} alt="" style={{ width: 56, height: 76, objectFit: 'cover', borderRadius: 6 }} />
      ) : row.preview_url && row.content_type !== 'html' ? (
        <video src={row.preview_url} muted preload="metadata" style={{ width: 56, height: 76, objectFit: 'cover', borderRadius: 6, background: '#111' }} />
      ) : <div style={{ width: 56, height: 76, borderRadius: 6, background: '#1f2937', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11 }}>{row.content_type === 'html' ? 'HTML' : '视频'}</div>,
    },
    {
      title: '标题',
      dataIndex: 'title',
      render: (_t, row) => (
        <Link
          to={row.source === 'manual_upload' ? '/html-imports' : row.has_run === false ? `/content/${row.id}` : (
            row.content_mode === 'story'
              ? `/stories/${row.id}/${row.analysis_version || '0.0.1'}`
              : `/runs/${row.id}`
          )}
        >
          {row.title || row.source_filename}
        </Link>
      ),
    },
    ...(manageAll ? [sourceColumn] : []),
    {
      title: '类型',
      key: 'content_mode',
      width: 90,
      render: (_, row) => (row.content_mode === 'story' ? '故事' : '单视频'),
    },
    {
      title: '状态',
      key: 'status',
      width: 150,
      render: (_, row) => {
        if (row.review_status === 'pending') return <Tag color="orange">待审核</Tag>
        if (row.review_status === 'rejected') return <Tag color="red">已拒绝</Tag>
        if (row.review_status === 'approved') return <Tag color="green">已发布</Tag>
        if (row.processing_mode === 'manual' && row.status === 'no_playable_plan') {
          return <Tag color="purple">手动处理中</Tag>
        }
        const meta = statusMeta[row.status] || { label: row.status, color: 'default' }
        if (row.status === 'ready' && row.published_version) {
          return <Tag color="green">已发布 · {row.published_version}</Tag>
        }
        return (
          <Space direction="vertical" size={4} align="start">
            <Tag color={meta.color}>{meta.label}</Tag>
            {row.published_version ? (
              <Tag color="green">已发布 · {row.published_version}</Tag>
            ) : null}
          </Space>
        )
      },
    },
    {
      title: '发布账号',
      key: 'published_user',
      width: 160,
      render: (_, row) => {
        if (!row.published_version && !row.published_user_id && !row.author_user_id) return '-'
        const name = row.author_nickname || row.author_user_id || row.published_user_nickname || row.published_user_id || '-'
        if (row.published_user_enabled === false) {
          return (
            <Space size={4} wrap>
              <span>{name}</span>
              <Tag color="orange">已停用</Tag>
            </Space>
          )
        }
        return name
      },
    },
    {
      title: '权重',
      dataIndex: 'feed_weight',
      width: 72,
      render: (_v: number | undefined, row) => manageAll ? (
        <Button size="small" onClick={() => onEditWeight(row)}>
          {row.feed_weight ?? 0}
        </Button>
      ) : (
        <span>{row.feed_weight ?? 0}</span>
      ),
    },
    {
      title: '操作', key: 'actions', width: manageAll ? 160 : 90,
      render: (_, row) => row.source === 'ugc' && row.review_status === 'pending' ? (
        <Space>
          <Button size="small" type="primary" onClick={() => onReview(row)}>审核</Button>
        </Space>
      ) : manageAll ? (
        <Space>
          <Link to={row.has_run === false ? `/content/${row.id}` : `/runs/${row.id}`}>
            <Button size="small">详情</Button>
          </Link>
          {row.preview_url ? <Button size="small" href={row.preview_url} target="_blank">预览</Button> : null}
          <Button size="small" danger onClick={() => onDelete(row)}>下架</Button>
        </Space>
      ) : (
        <Space>
          <Link to={`/runs/${row.id}`}>
            <Button size="small">详情</Button>
          </Link>
        </Space>
      ),
    },
    {
      title: '教学',
      dataIndex: 'is_tutorial',
      width: 64,
      render: (v?: boolean) => (v ? '是' : '否'),
    },
    {
      title: '上传人',
      dataIndex: 'created_by_name',
      width: 120,
      render: (v?: string | null) => v || '-',
    },
    {
      title: '视频信息',
      key: 'media',
      width: 170,
      render: (_, row) => (
        <Space size={6} split={<Typography.Text type="secondary">·</Typography.Text>}>
          <span>{formatDuration(row.duration_ms)}</span>
          <Typography.Text type="secondary">{formatBytes(row.source_bytes)}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 180,
      render: (v: string) => formatServerTime(v),
    },
  ]

  return (
    <Table
      rowKey="id"
      loading={loading}
      columns={columns}
      dataSource={rows}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        showTotal: (t) => `共 ${t} 条`,
        onChange: onPageChange,
      }}
    />
  )
}
