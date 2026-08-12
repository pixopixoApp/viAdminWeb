import { CopyOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'

type InviteStatus = 'unused' | 'redeemed' | 'revoked'
type Invite = {
  id: number
  code_hint: string
  enabled: boolean
  status: InviteStatus
  redeemed_by_user_id?: string | null
  redeemed_by_label: string
  redeemed_at?: string | null
  created_at: string
}

const PAGE_SIZE = 50
const statusMeta: Record<InviteStatus, { label: string; color: string }> = {
  unused: { label: '未兑换', color: 'green' },
  redeemed: { label: '已兑换', color: 'blue' },
  revoked: { label: '已销毁', color: 'default' },
}

export default function CreatorInvitesPage() {
  const [rows, setRows] = useState<Invite[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<InviteStatus | undefined>()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [count, setCount] = useState(10)
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([])
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      })
      if (status) params.set('status', status)
      if (query.trim()) params.set('q', query.trim())
      const data = await api<{ items: Invite[]; total: number }>(
        `/api/v1/creator-invites?${params.toString()}`,
      )
      setRows(data.items)
      setTotal(data.total)
      setSelectedKeys([])
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '加载兑换码失败')
    } finally {
      setLoading(false)
    }
  }, [messageApi, page, query, status])

  useEffect(() => {
    void load()
  }, [load])

  async function createCodes() {
    setCreating(true)
    try {
      const data = await api<{ codes: string[] }>('/api/v1/creator-invites', {
        method: 'POST',
        body: JSON.stringify({ count }),
      })
      setGeneratedCodes(data.codes)
      messageApi.success(`已创建 ${data.codes.length} 个兑换码`)
      if (page === 1) {
        await load()
      } else {
        setPage(1)
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  function revoke(ids: number[]) {
    if (!ids.length) return
    Modal.confirm({
      title: `确认销毁 ${ids.length} 个未兑换码？`,
      content: '销毁后这些兑换码将立即失效，已兑换的码不会撤销用户权限。',
      okText: '确认销毁',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        try {
          const data = await api<{
            revoked_ids: number[]
            skipped_redeemed_ids: number[]
            missing_ids: number[]
          }>('/api/v1/creator-invites/revoke', {
            method: 'POST',
            body: JSON.stringify({ invite_ids: ids }),
          })
          messageApi.success(`已销毁 ${data.revoked_ids.length} 个兑换码`)
          if (data.skipped_redeemed_ids.length) {
            messageApi.warning(`${data.skipped_redeemed_ids.length} 个已兑换码未销毁`)
          }
          await load()
        } catch (error) {
          messageApi.error(error instanceof Error ? error.message : '销毁失败')
          throw error
        }
      },
    })
  }

  function revokeAccess(row: Invite) {
    if (!row.redeemed_by_user_id) return
    Modal.confirm({
      title: '确认撤销创作权限？',
      content: `用户 ${row.redeemed_by_label || row.redeemed_by_user_id} 将无法继续创建或发布，正在执行的任务会被取消。`,
      okText: '撤销权限',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        try {
          await api(`/api/v1/creator-access/${row.redeemed_by_user_id}/revoke`, {
            method: 'POST',
          })
          messageApi.success('创作权限已撤销')
          await load()
        } catch (error) {
          messageApi.error(error instanceof Error ? error.message : '撤销权限失败')
          throw error
        }
      },
    })
  }

  const columns: ColumnsType<Invite> = [
    {
      title: '兑换码',
      dataIndex: 'code_hint',
      width: 150,
      render: (hint: string) => <Typography.Text code>••••-••••-{hint}</Typography.Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: InviteStatus) => (
        <Tag color={statusMeta[value].color}>{statusMeta[value].label}</Tag>
      ),
    },
    {
      title: '兑换用户',
      key: 'redeemedBy',
      render: (_, row) => row.redeemed_by_user_id ? (
        <div>
          <div>{row.redeemed_by_label || row.redeemed_by_user_id}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.redeemed_by_user_id}
          </Typography.Text>
        </div>
      ) : '—',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 190,
      render: (value: string) => value ? new Date(value).toLocaleString() : '—',
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_, row) => row.status === 'unused' ? (
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => revoke([row.id])}>
          销毁
        </Button>
      ) : row.status === 'redeemed' ? (
        <Button size="small" danger icon={<StopOutlined />} onClick={() => revokeAccess(row)}>
          撤销权限
        </Button>
      ) : <Typography.Text type="secondary">已失效</Typography.Text>,
    },
  ]

  const generatedText = generatedCodes.join('\n')
  return (
    <>
      {contextHolder}
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>创作兑换码</Typography.Title>
            <Typography.Text type="secondary">创建资格采用单次兑换；完整码仅在创建后展示一次。</Typography.Text>
          </div>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
        </Space>

        <Card size="small" title="批量创建">
          <Space wrap>
            <InputNumber min={1} max={100} value={count} onChange={(value) => setCount(value || 1)} />
            <Button type="primary" icon={<PlusOutlined />} loading={creating} onClick={() => void createCodes()}>
              创建兑换码
            </Button>
          </Space>
        </Card>

        <Card size="small">
          <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
            <Space wrap>
              <Select
                allowClear
                placeholder="全部状态"
                style={{ width: 140 }}
                value={status}
                onChange={(value) => { setPage(1); setStatus(value) }}
                options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
              />
              <Input.Search
                allowClear
                placeholder="尾号或用户 ID"
                style={{ width: 220 }}
                onSearch={(value) => { setPage(1); setQuery(value) }}
              />
            </Space>
            <Button
              danger
              disabled={!selectedKeys.length}
              icon={<DeleteOutlined />}
              onClick={() => revoke(selectedKeys.map(Number))}
            >
              批量销毁
            </Button>
          </Space>
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={rows}
            scroll={{ x: 820 }}
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: setSelectedKeys,
              getCheckboxProps: (row) => ({ disabled: row.status !== 'unused' }),
            }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              showSizeChanger: false,
              showTotal: (value) => `共 ${value} 个`,
              onChange: setPage,
            }}
          />
        </Card>
      </Space>

      <Modal
        title="请立即保存新兑换码"
        open={generatedCodes.length > 0}
        closable={false}
        keyboard={false}
        maskClosable={false}
        okText="我已保存"
        cancelButtonProps={{ style: { display: 'none' } }}
        onOk={() => setGeneratedCodes([])}
      >
        <Alert
          type="warning"
          showIcon
          message="关闭后后台只保留尾号，无法再次查看完整兑换码。"
          style={{ marginBottom: 12 }}
        />
        <Input.TextArea value={generatedText} readOnly autoSize={{ minRows: 6, maxRows: 14 }} />
        <Button
          icon={<CopyOutlined />}
          style={{ marginTop: 12 }}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(generatedText)
              messageApi.success('已复制全部兑换码')
            } catch {
              messageApi.error('复制失败，请手动选择并复制')
            }
          }}
        >
          复制全部
        </Button>
      </Modal>
    </>
  )
}
