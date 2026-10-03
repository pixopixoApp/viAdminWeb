import { ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Input, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { creatorApplicationsApi } from '../services/api'
import type { CreatorApplication, CreatorApplicationStatus } from '../types/report'
import { creatorApplicationStatusMeta, inviteStatusMeta } from '../types/report'

export default function CreatorApplicationsPage() {
  const [rows, setRows] = useState<CreatorApplication[]>([])
  const [status, setStatus] = useState<CreatorApplicationStatus | undefined>()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await creatorApplicationsApi.list(status))
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '加载资格申请历史失败')
    } finally {
      setLoading(false)
    }
  }, [messageApi, status])

  useEffect(() => { void load() }, [load])

  const visibleRows = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.email, row.user_id, row.message]
      .some((value) => String(value || '').toLowerCase().includes(term)))
  }, [query, rows])

  const columns: ColumnsType<CreatorApplication> = [
    {
      title: '申请用户', key: 'applicant', width: 260,
      render: (_, row) => <div><div>{row.email || '未填写邮箱'}</div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.user_id}</Typography.Text></div>,
    },
    {
      title: '申请说明', dataIndex: 'message', ellipsis: true,
      render: (value: string) => value || <Typography.Text type="secondary">未填写</Typography.Text>,
    },
    {
      title: '历史状态', dataIndex: 'status', width: 140,
      render: (value: CreatorApplicationStatus) => {
        const meta = creatorApplicationStatusMeta[value]
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '历史访问码', key: 'invite', width: 170,
      render: (_, row) => row.invite_id ? <Space size={6}>
        <Typography.Text code>••••-{row.invite_code_hint}</Typography.Text>
        {row.invite_status ? <Tag color={inviteStatusMeta[row.invite_status].color}>
          {inviteStatusMeta[row.invite_status].label}
        </Tag> : null}
      </Space> : '—',
    },
    {
      title: '申请时间', dataIndex: 'created_at', width: 180,
      render: (value: string) => value ? new Date(value).toLocaleString() : '—',
    },
  ]

  return <>
    {contextHolder}
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Typography.Title level={5} style={{ margin: 0 }}>资格申请历史</Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
      </Space>
      <Card size="small">
        <Space style={{ marginBottom: 16 }} wrap>
          <Select allowClear placeholder="全部状态" style={{ width: 160 }} value={status}
            onChange={setStatus} options={Object.entries(creatorApplicationStatusMeta)
              .map(([value, meta]) => ({ value, label: meta.label }))} />
          <Input.Search allowClear placeholder="邮箱、用户 ID 或说明" style={{ width: 260 }}
            onSearch={setQuery} onChange={(event) => { if (!event.target.value) setQuery('') }} />
        </Space>
        <Table rowKey="user_id" loading={loading} columns={columns} dataSource={visibleRows}
          scroll={{ x: 900 }} pagination={{ pageSize: 50, showTotal: (total) => `共 ${total} 条` }} />
      </Card>
    </Space>
  </>
}
