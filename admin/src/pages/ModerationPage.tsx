import { CheckOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons'
import { Button, Card, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'

type ReportStatus = 'pending' | 'actioned' | 'dismissed'
type Report = {
  id: string
  reporter_user_id: string
  reporter_label: string
  target_type: 'video' | 'user'
  target_id: string
  target_user_id?: string | null
  target_label: string
  reason: string
  details: string
  status: ReportStatus
  resolution: string
  reviewed_by: string
  created_at: string
}

const reasonLabels: Record<string, string> = {
  spam: '垃圾或误导内容',
  harassment: '骚扰或欺凌',
  hate_or_violence: '仇恨或暴力',
  dangerous_acts: '危险行为',
  sexual_content: '裸露或色情内容',
  intellectual_property: '知识产权问题',
  other: '其他',
}
const PAGE_SIZE = 50

export default function ModerationPage() {
  const [rows, setRows] = useState<Report[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [actingId, setActingId] = useState<string | null>(null)
  const [status, setStatus] = useState<ReportStatus | undefined>('pending')
  const [targetType, setTargetType] = useState<'video' | 'user' | undefined>()
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      })
      if (status) params.set('status', status)
      if (targetType) params.set('target_type', targetType)
      const data = await api<{ items: Report[]; total: number }>(
        `/api/v1/moderation/reports?${params.toString()}`,
      )
      setRows(data.items)
      setTotal(data.total)
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '加载举报失败')
    } finally {
      setLoading(false)
    }
  }, [messageApi, page, status, targetType])

  useEffect(() => { void load() }, [load])

  function decide(
    row: Report,
    decision: { status: 'actioned' | 'dismissed'; action: 'none' | 'remove_content' | 'disable_user' },
  ) {
    const destructive = decision.action !== 'none'
    const actionLabel = decision.action === 'remove_content'
      ? '下架内容'
      : decision.action === 'disable_user'
        ? '停用用户'
        : decision.status === 'dismissed' ? '驳回举报' : '标记已处理'
    Modal.confirm({
      title: `确认${actionLabel}？`,
      content: destructive ? '该操作会立即影响客户端可见性或登录状态。' : '审核结果会被记录。',
      okText: '确认',
      okButtonProps: { danger: destructive },
      cancelText: '取消',
      async onOk() {
        setActingId(row.id)
        try {
          await api(`/api/v1/moderation/reports/${row.id}/decision`, {
            method: 'POST',
            body: JSON.stringify({ ...decision, resolution: actionLabel }),
          })
          messageApi.success(`${actionLabel}成功`)
          await load()
        } catch (error) {
          messageApi.error(error instanceof Error ? error.message : `${actionLabel}失败`)
          throw error
        } finally {
          setActingId(null)
        }
      },
    })
  }

  const columns: ColumnsType<Report> = [
    {
      title: '举报对象',
      key: 'target',
      width: 240,
      render: (_, row) => (
        <div>
          <Space><Tag>{row.target_type === 'video' ? '视频' : '用户'}</Tag>{row.target_label}</Space>
          <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.target_id}</Typography.Text></div>
        </div>
      ),
    },
    {
      title: '原因',
      key: 'reason',
      width: 220,
      render: (_, row) => (
        <div>
          <div>{reasonLabels[row.reason] || row.reason}</div>
          {row.details ? <Typography.Text type="secondary">{row.details}</Typography.Text> : null}
        </div>
      ),
    },
    {
      title: '举报人',
      key: 'reporter',
      width: 180,
      render: (_, row) => (
        <div>{row.reporter_label}<div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.reporter_user_id}</Typography.Text></div></div>
      ),
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 180,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: ReportStatus) => (
        <Tag color={value === 'pending' ? 'orange' : value === 'actioned' ? 'green' : 'default'}>
          {value === 'pending' ? '待处理' : value === 'actioned' ? '已处理' : '已驳回'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 270,
      fixed: 'right',
      render: (_, row) => row.status !== 'pending' ? (
        <Typography.Text type="secondary">{row.reviewed_by || '已完成'}</Typography.Text>
      ) : (
        <Space wrap>
          {row.target_type === 'video' ? (
            <Button size="small" danger loading={actingId === row.id} onClick={() => decide(row, { status: 'actioned', action: 'remove_content' })}>
              下架内容
            </Button>
          ) : null}
          {row.target_user_id ? (
            <Button size="small" danger icon={<StopOutlined />} loading={actingId === row.id} onClick={() => decide(row, { status: 'actioned', action: 'disable_user' })}>
              停用用户
            </Button>
          ) : null}
          <Button size="small" icon={<CheckOutlined />} loading={actingId === row.id} onClick={() => decide(row, { status: 'dismissed', action: 'none' })}>
            驳回
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      {contextHolder}
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>内容安全审核</Typography.Title>
            <Typography.Text type="secondary">共 {total} 条符合条件的举报</Typography.Text>
          </div>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>刷新</Button>
        </Space>
        <Card size="small">
          <Space style={{ marginBottom: 16 }} wrap>
            <Select
              allowClear
              style={{ width: 140 }}
              placeholder="全部状态"
              value={status}
              onChange={(value) => { setPage(1); setStatus(value) }}
              options={[
                { value: 'pending', label: '待处理' },
                { value: 'actioned', label: '已处理' },
                { value: 'dismissed', label: '已驳回' },
              ]}
            />
            <Select
              allowClear
              style={{ width: 140 }}
              placeholder="全部对象"
              value={targetType}
              onChange={(value) => { setPage(1); setTargetType(value) }}
              options={[{ value: 'video', label: '视频' }, { value: 'user', label: '用户' }]}
            />
          </Space>
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={rows}
            scroll={{ x: 1200 }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              showSizeChanger: false,
              showTotal: (value) => `共 ${value} 条`,
              onChange: setPage,
            }}
          />
        </Card>
      </Space>
    </>
  )
}
