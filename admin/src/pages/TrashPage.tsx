import { Button, Space, Table, Typography, message, Popconfirm } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { runsApi } from '../services/api'
import { formatServerTime } from '../time'
import type { Run } from '../types/run'

export default function TrashPage({ embedded = false, onTotalChange }: { embedded?: boolean; onTotalChange?: (total: number) => void }) {
  const { me } = useAuth()
  const manageAll = me?.role === 'admin' || me?.role === 'manager'
  const [rows, setRows] = useState<Run[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await runsApi.listTrash(page, pageSize)
      setRows(data.items)
      setTotal(data.total)
      onTotalChange?.(data.total)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载垃圾箱失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, messageApi, onTotalChange])

  useEffect(() => {
    void load()
  }, [load])

  const handleRestore = useCallback(async (run: Run) => {
    try {
      await runsApi.restore(run.id)
      messageApi.success('已恢复')
      void load()
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : '恢复失败')
    }
  }, [messageApi, load])

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
      render: (_t, row) => row.title || row.source_filename,
    },
    {
      title: '类型',
      key: 'content_mode',
      width: 90,
      render: (_, row) => (row.content_mode === 'story' ? '故事' : '单视频'),
    },
    {
      title: '状态',
      key: 'status',
      width: 130,
      render: (_, row) => row.published_version ? '已发布' : (row.status === 'ready' ? '就绪' : row.status),
    },
    {
      title: '删除时间',
      dataIndex: 'deleted_at',
      width: 180,
      render: (v?: string) => (v ? formatServerTime(v) : '-'),
    },
    {
      title: '操作', key: 'actions', width: 120,
      render: (_, row) => (
        <Space>
          <Popconfirm
            title="恢复视频"
            description="确定要从此视频移出垃圾箱并恢复吗？"
            okText="恢复"
            cancelText="取消"
            onConfirm={() => handleRestore(row)}
          >
            <Button size="small" type="primary">恢复</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      {contextHolder}
      {!embedded ? (
        <Typography.Title level={4} style={{ margin: '0 0 16px' }} className="page-title">
          垃圾箱 <Typography.Text type="secondary">({total})</Typography.Text>
        </Typography.Title>
      ) : null}
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
          onChange: (p, ps) => { setPage(p); setPageSize(ps) },
        }}
      />
    </>
  )
}
