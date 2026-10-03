import { ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Input, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { invitesApi } from '../services/api'
import type { Invite, InviteStatus } from '../types/report'
import { inviteStatusMeta } from '../types/report'

const PAGE_SIZE = 50

export default function CreatorInvitesPage() {
  const [rows, setRows] = useState<Invite[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<InviteStatus | undefined>()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await invitesApi.listInvites({
        limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
        ...(status ? { status } : {}), ...(query.trim() ? { q: query.trim() } : {}),
      })
      setRows(data.items)
      setTotal(data.total)
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '加载创作访问码历史失败')
    } finally {
      setLoading(false)
    }
  }, [messageApi, page, query, status])

  useEffect(() => { void load() }, [load])

  const columns: ColumnsType<Invite> = [
    {
      title: '历史访问码', dataIndex: 'code_hint', width: 170,
      render: (hint: string) => <Typography.Text code>••••-••••-{hint}</Typography.Text>,
    },
    {
      title: '状态', dataIndex: 'status', width: 110,
      render: (value: InviteStatus) => <Tag color={inviteStatusMeta[value].color}>
        {inviteStatusMeta[value].label}
      </Tag>,
    },
    {
      title: '历史兑换用户', key: 'redeemedBy',
      render: (_, row) => row.redeemed_by_user_id ? <div>
        <div>{row.redeemed_by_label || row.redeemed_by_user_id}</div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.redeemed_by_user_id}</Typography.Text>
      </div> : '—',
    },
    {
      title: '创建时间', dataIndex: 'created_at', width: 190,
      render: (value: string) => value ? new Date(value).toLocaleString() : '—',
    },
  ]

  return <>
    {contextHolder}
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Typography.Title level={5} style={{ margin: 0 }}>创作访问码历史</Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
      </Space>
      <Card size="small">
        <Space style={{ marginBottom: 16 }} wrap>
          <Select allowClear placeholder="全部状态" style={{ width: 140 }} value={status}
            onChange={(value) => { setPage(1); setStatus(value) }}
            options={Object.entries(inviteStatusMeta).map(([value, meta]) => ({ value, label: meta.label }))} />
          <Input.Search allowClear placeholder="尾号或用户 ID" style={{ width: 220 }}
            onSearch={(value) => { setPage(1); setQuery(value) }} />
        </Space>
        <Table rowKey="id" loading={loading} columns={columns} dataSource={rows} scroll={{ x: 760 }}
          pagination={{ current: page, pageSize: PAGE_SIZE, total, showSizeChanger: false,
            showTotal: (value) => `共 ${value} 个`, onChange: setPage }} />
      </Card>
    </Space>
  </>
}
