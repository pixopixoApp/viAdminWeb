import { CloseOutlined, MailOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
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
  const [processing, setProcessing] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await creatorApplicationsApi.list(status))
      setSelectedKeys([])
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '加载权限申请失败')
    } finally {
      setLoading(false)
    }
  }, [messageApi, status])

  useEffect(() => {
    void load()
  }, [load])

  const visibleRows = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.email, row.user_id, row.message]
      .some((value) => String(value || '').toLowerCase().includes(term)))
  }, [query, rows])

  async function sendCodes(userIds: string[]) {
    if (!userIds.length) return
    setProcessing(true)
    try {
      const result = await creatorApplicationsApi.invite(userIds)
      if (result.sent_count) messageApi.success(`已生成并发送 ${result.sent_count} 个专属兑换码`)
      if (result.skipped_count) messageApi.info(`${result.skipped_count} 条申请已处理，自动跳过`)
      if (result.failed_count) {
        const detail = result.items.find((item) => item.status === 'failed')?.error
        messageApi.error(`${result.failed_count} 封邮件发送失败${detail ? `：${detail}` : ''}`)
      }
      await load()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '生成并发送兑换码失败')
    } finally {
      setProcessing(false)
    }
  }

  function confirmSend(userIds: string[]) {
    Modal.confirm({
      title: `确认处理 ${userIds.length} 条创作权限申请？`,
      content: '系统将为每位用户生成一个绑定账号的单次兑换码，并立即发送到申请邮箱。',
      okText: '生成并发送',
      cancelText: '取消',
      async onOk() {
        await sendCodes(userIds)
      },
    })
  }

  function reject(row: CreatorApplication) {
    Modal.confirm({
      title: '确认拒绝这条申请？',
      content: `${row.email} 可以在之后更新信息并重新申请。`,
      okText: '拒绝申请',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        try {
          await creatorApplicationsApi.decide(row.user_id, 'rejected')
          messageApi.success('申请已拒绝')
          await load()
        } catch (error) {
          messageApi.error(error instanceof Error ? error.message : '处理失败')
          throw error
        }
      },
    })
  }

  const columns: ColumnsType<CreatorApplication> = [
    {
      title: '申请用户',
      key: 'applicant',
      width: 260,
      render: (_, row) => (
        <div>
          <div>{row.email || '未填写邮箱'}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.user_id}</Typography.Text>
        </div>
      ),
    },
    {
      title: '申请说明',
      dataIndex: 'message',
      ellipsis: true,
      render: (value: string) => value || <Typography.Text type="secondary">未填写</Typography.Text>,
    },
    {
      title: '处理状态',
      dataIndex: 'status',
      width: 140,
      render: (value: CreatorApplicationStatus) => {
        const meta = creatorApplicationStatusMeta[value]
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '兑换码',
      key: 'invite',
      width: 150,
      render: (_, row) => row.invite_id ? (
        <Space size={6}>
          <Typography.Text code>••••-{row.invite_code_hint}</Typography.Text>
          {row.invite_status ? (
            <Tag color={inviteStatusMeta[row.invite_status].color}>
              {inviteStatusMeta[row.invite_status].label}
            </Tag>
          ) : null}
        </Space>
      ) : '—',
    },
    {
      title: '申请时间',
      dataIndex: 'created_at',
      width: 180,
      render: (value: string) => value ? new Date(value).toLocaleString() : '—',
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, row) => row.status === 'pending' ? (
        <Space>
          <Button size="small" type="primary" icon={<MailOutlined />} onClick={() => confirmSend([row.user_id])}>
            发码
          </Button>
          <Button size="small" danger icon={<CloseOutlined />} onClick={() => reject(row)}>拒绝</Button>
        </Space>
      ) : row.last_error ? (
        <Tooltip title={row.last_error}><Typography.Text type="danger">发送异常</Typography.Text></Tooltip>
      ) : <Typography.Text type="secondary">已处理</Typography.Text>,
    },
  ]

  const pendingCount = rows.filter((row) => row.status === 'pending').length
  return (
    <>
      {contextHolder}
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }} className="page-title">创作权限申请</Typography.Title>
            <Typography.Text type="secondary">审核申请后，一键生成绑定账号的一次性兑换码并发送邮件。</Typography.Text>
          </div>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
        </Space>

        {pendingCount > 0 ? <Alert type="info" showIcon message={`当前有 ${pendingCount} 条申请待处理`} /> : null}

        <Card size="small">
          <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
            <Space wrap>
              <Select
                allowClear
                placeholder="全部状态"
                style={{ width: 160 }}
                value={status}
                onChange={setStatus}
                options={Object.entries(creatorApplicationStatusMeta)
                  .map(([value, meta]) => ({ value, label: meta.label }))}
              />
              <Input.Search
                allowClear
                placeholder="邮箱、用户 ID 或说明"
                style={{ width: 260 }}
                onSearch={setQuery}
                onChange={(event) => { if (!event.target.value) setQuery('') }}
              />
            </Space>
            <Button
              type="primary"
              icon={<MailOutlined />}
              disabled={!selectedKeys.length}
              loading={processing}
              onClick={() => confirmSend(selectedKeys.map(String))}
            >
              批量生成并发送 ({selectedKeys.length})
            </Button>
          </Space>
          <Table
            rowKey="user_id"
            loading={loading}
            columns={columns}
            dataSource={visibleRows}
            scroll={{ x: 1050 }}
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: setSelectedKeys,
              getCheckboxProps: (row) => ({ disabled: row.status !== 'pending' }),
            }}
            pagination={{ pageSize: 50, showTotal: (total) => `共 ${total} 条` }}
          />
        </Card>
      </Space>
    </>
  )
}
