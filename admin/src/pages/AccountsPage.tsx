import { PlusOutlined, UserOutlined } from '@ant-design/icons'
import {
  Avatar,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { accountsApi, staffApi } from '../services/api'
import { useAuth } from '../auth'
import type { Account, Staff } from '../types/account'

export default function AccountsPage() {
  const { me } = useAuth()
  const canAll = me?.role === 'admin' || me?.role === 'manager'
  const [scope, setScope] = useState<'mine' | 'admin' | 'app'>('mine')
  const [rows, setRows] = useState<Account[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [reassignTarget, setReassignTarget] = useState<Account | null>(null)
  const [operators, setOperators] = useState<Staff[]>([])
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await accountsApi.list({
        scope: canAll ? scope : 'mine',
        limit: 50,
        offset: 0,
        ...(q.trim() ? { q: q.trim() } : {}),
      })
      setRows(data.items)
      setTotal(data.total)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [canAll, scope, q, messageApi])

  useEffect(() => {
    void load()
  }, [load])

  async function loadOperators() {
    if (!canAll) return
    try {
      const data = await staffApi.list(1, 200)
      setOperators(data.items.filter((s) => s.role === 'operator'))
    } catch {
      setOperators([])
    }
  }

  const columns: ColumnsType<Account> = [
    {
      title: '账号',
      key: 'user',
      render: (_, row) => (
        <Space>
          <Avatar src={row.avatar_absolute_url || undefined} icon={<UserOutlined />} />
          <div>
            <div>{row.nickname || row.user_id}</div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.user_id}
            </Typography.Text>
          </div>
        </Space>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 100,
      render: (v: string) => (v === 'admin' ? '后台创建' : '自注册'),
    },
    {
      title: '归属运营',
      dataIndex: 'owner_staff_name',
      width: 120,
      render: (v?: string | null) => v || '—',
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 90,
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'default'}>{v ? '正常' : '停用'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, row) => {
        const editable = row.source === 'admin' && (canAll || row.owner_staff_id === me?.id)
        if (!editable) return <Typography.Text type="secondary">只读</Typography.Text>
        return (
          <Space wrap>
            <Upload
              showUploadList={false}
              beforeUpload={async (file) => {
                const fd = new FormData()
                fd.append('file', file)
                try {
                  await accountsApi.uploadAvatar(row.user_id, fd)
                  messageApi.success('头像已更新')
                  await load()
                } catch (err) {
                  messageApi.error(err instanceof Error ? err.message : '上传失败')
                }
                return false
              }}
            >
              <Button size="small">头像</Button>
            </Upload>
            {row.enabled ? (
              <Button
                size="small"
                danger
                onClick={async () => {
                  try {
                    await accountsApi.deactivate(row.user_id)
                    messageApi.success('已停用')
                    await load()
                  } catch (err) {
                    messageApi.error(err instanceof Error ? err.message : '停用失败')
                  }
                }}
              >
                停用
              </Button>
            ) : (
              <Button
                size="small"
                onClick={async () => {
                  try {
                    await accountsApi.enable(row.user_id)
                    messageApi.success('已启用')
                    await load()
                  } catch (err) {
                    messageApi.error(err instanceof Error ? err.message : '启用失败')
                  }
                }}
              >
                启用
              </Button>
            )}
            {canAll ? (
              <Button
                size="small"
                onClick={() => {
                  void loadOperators()
                  setReassignTarget(row)
                }}
              >
                变更归属
              </Button>
            ) : null}
          </Space>
        )
      },
    },
  ]

  return (
    <>
      {contextHolder}
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }} className="page-title">
          账号管理
        </Typography.Title>
        <Space wrap>
          {canAll ? (
            <Select
              style={{ width: 160 }}
              value={scope}
              onChange={setScope}
              options={[
                { value: 'mine', label: '我名下' },
                { value: 'admin', label: '全部后台号' },
                { value: 'app', label: '自注册只读' },
              ]}
            />
          ) : null}
          <Input.Search
            placeholder="昵称"
            allowClear
            onSearch={(v) => setQ(v)}
            style={{ width: 180 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            void loadOperators()
            setCreateOpen(true)
          }}>
            创建账号
          </Button>
        </Space>
      </Space>
      <Typography.Paragraph type="secondary">共 {total} 个</Typography.Paragraph>
      <Table rowKey="user_id" loading={loading} columns={columns} dataSource={rows} pagination={false} />

      <Modal title="创建账号" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} destroyOnClose>
        <Form
          layout="vertical"
          onFinish={async (values) => {
            try {
              await accountsApi.create(values)
              messageApi.success('已创建')
              setCreateOpen(false)
              await load()
            } catch (err) {
              messageApi.error(err instanceof Error ? err.message : '创建失败')
            }
          }}
        >
          <Form.Item name="nickname" label="昵称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          {canAll ? (
            <Form.Item name="owner_staff_id" label="归属运营">
              <Select
                allowClear
                placeholder="默认自己"
                options={operators.map((o) => ({
                  value: o.id,
                  label: o.display_name || o.username,
                }))}
                onDropdownVisibleChange={(open) => {
                  if (open) void loadOperators()
                }}
              />
            </Form.Item>
          ) : null}
          <Button type="primary" htmlType="submit" block>
            创建
          </Button>
        </Form>
      </Modal>

      <Modal
        title="变更归属"
        open={Boolean(reassignTarget)}
        onCancel={() => setReassignTarget(null)}
        footer={null}
        destroyOnClose
      >
        <Form
          layout="vertical"
          onFinish={async (values) => {
            if (!reassignTarget) return
            try {
              await accountsApi.reassign(reassignTarget.user_id, values.owner_staff_id)
              messageApi.success('已变更归属')
              setReassignTarget(null)
              await load()
            } catch (err) {
              messageApi.error(err instanceof Error ? err.message : '变更失败')
            }
          }}
        >
          <Form.Item name="owner_staff_id" label="新归属运营" rules={[{ required: true }]}>
            <Select
              options={operators.map((o) => ({
                value: o.id,
                label: o.display_name || o.username,
              }))}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            确认
          </Button>
        </Form>
      </Modal>
    </>
  )
}
