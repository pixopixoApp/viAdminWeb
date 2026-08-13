import { PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { formatServerTime } from '../time'

type Staff = {
  id: number
  username: string
  display_name: string
  role: string
  status: string
  must_change_password: boolean
  run_count: number
  last_login_at?: string | null
  created_at?: string | null
}

const roleLabel: Record<string, string> = {
  admin: '超级管理员',
  manager: '管理员',
  operator: '运营',
}

export default function StaffPage() {
  const { me } = useAuth()
  const [rows, setRows] = useState<Staff[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState<Staff | null>(null)
  const [messageApi, contextHolder] = message.useMessage()
  const isAdmin = me?.role === 'admin'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{ items: Staff[]; total: number }>('/api/v1/staff?page=1&page_size=200')
      setRows(data.items)
      setTotal(data.total)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [messageApi])

  useEffect(() => {
    void load()
  }, [load])

  const columns: ColumnsType<Staff> = [
    { title: '显示名', dataIndex: 'display_name' },
    { title: '登录名', dataIndex: 'username' },
    {
      title: '角色',
      dataIndex: 'role',
      render: (v: string) => roleLabel[v] || v,
    },
    { title: '上传视频数', dataIndex: 'run_count', width: 110 },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v: string, row) => (
        <Space>
          <Tag color={v === 'enabled' ? 'green' : 'default'}>{v === 'enabled' ? '启用' : '停用'}</Tag>
          {row.must_change_password ? <Tag color="orange">须改密</Tag> : null}
        </Space>
      ),
    },
    {
      title: '最后登录',
      dataIndex: 'last_login_at',
      render: (v?: string | null) => (v ? formatServerTime(v) : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, row) => (
        <Space wrap>
          <Button size="small" onClick={() => setResetOpen(row)}>
            重置密码
          </Button>
          {row.status === 'enabled' ? (
            <Button
              size="small"
              danger
              disabled={row.id === me?.id}
              onClick={() => void setStatus(row, 'disabled')}
            >
              停用
            </Button>
          ) : (
            <Button size="small" onClick={() => void setStatus(row, 'enabled')}>
              启用
            </Button>
          )}
        </Space>
      ),
    },
  ]

  async function setStatus(row: Staff, status: string) {
    try {
      await api(`/api/v1/staff/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      messageApi.success('已更新')
      await load()
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '更新失败')
    }
  }

  return (
    <>
      {contextHolder}
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }} className="page-title">
          人员管理
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          创建人员
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">共 {total} 人</Typography.Paragraph>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={rows} pagination={false} />

      <Modal
        title="创建人员"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          layout="vertical"
          onFinish={async (values) => {
            try {
              await api('/api/v1/staff', {
                method: 'POST',
                body: JSON.stringify(values),
              })
              messageApi.success('已创建，对方首次登录须改密')
              setCreateOpen(false)
              await load()
            } catch (err) {
              messageApi.error(err instanceof Error ? err.message : '创建失败')
            }
          }}
        >
          <Form.Item name="username" label="登录名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="display_name" label="显示名">
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[
              { required: true },
              { pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/, message: '至少 8 位，含字母和数字' },
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
            initialValue="operator"
            rules={[{ required: true }]}
          >
            <Select
              options={
                isAdmin
                  ? [
                      { value: 'manager', label: '管理员' },
                      { value: 'operator', label: '运营' },
                    ]
                  : [{ value: 'operator', label: '运营' }]
              }
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            创建
          </Button>
        </Form>
      </Modal>

      <Modal
        title={`重置密码 · ${resetOpen?.display_name || ''}`}
        open={Boolean(resetOpen)}
        onCancel={() => setResetOpen(null)}
        footer={null}
        destroyOnClose
      >
        <Form
          layout="vertical"
          onFinish={async (values) => {
            if (!resetOpen) return
            try {
              await api(`/api/v1/staff/${resetOpen.id}/reset-password`, {
                method: 'POST',
                body: JSON.stringify(values),
              })
              messageApi.success('已重置，对方下次登录须改密')
              setResetOpen(null)
              await load()
            } catch (err) {
              messageApi.error(err instanceof Error ? err.message : '重置失败')
            }
          }}
        >
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true },
              { pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/, message: '至少 8 位，含字母和数字' },
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            确认重置
          </Button>
        </Form>
      </Modal>
    </>
  )
}
