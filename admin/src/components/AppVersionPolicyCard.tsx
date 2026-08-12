import { Alert, Button, Card, Form, Input, InputNumber, Space, Switch, Tabs, Tag, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import { api } from '../api'

type Platform = 'android' | 'ios'

type AppVersionPolicy = {
  platform: Platform
  latest_version: string
  latest_build: number
  minimum_version: string
  minimum_build: number
  store_url: string
  package_name: string
  size_bytes: number
  release_notes: string
  enabled: boolean
  updated_at: string
}

type PolicyForm = Omit<AppVersionPolicy, 'platform' | 'updated_at'>

const emptyPolicy = (platform: Platform): PolicyForm => ({
  latest_version: '',
  latest_build: 0,
  minimum_version: '',
  minimum_build: 0,
  store_url: '',
  package_name: platform === 'android' ? 'com.pixopixo.pixoandroid' : '',
  size_bytes: 0,
  release_notes: '',
  enabled: false,
})

function PolicyEditor({ platform }: { platform: Platform }) {
  const [form] = Form.useForm<PolicyForm>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exists, setExists] = useState(false)
  const [updatedAt, setUpdatedAt] = useState('')
  const [messageApi, contextHolder] = message.useMessage()
  const enabled = Form.useWatch('enabled', form) ?? false

  async function load() {
    setLoading(true)
    try {
      const policy = await api<AppVersionPolicy>(`/api/v1/settings/app-versions/${platform}`)
      form.setFieldsValue(policy)
      setExists(true)
      setUpdatedAt(policy.updated_at)
    } catch (error) {
      // A platform with no policy is a valid initial state; the first save creates it in ivapp.
      if (error instanceof Error && error.message.includes('not found')) {
        const initial = emptyPolicy(platform)
        form.setFieldsValue(initial)
        setExists(false)
        setUpdatedAt('')
      } else {
        messageApi.error(error instanceof Error ? error.message : '加载更新策略失败')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // Switching a tab creates a distinct editor, so this only runs for its platform.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform])

  async function save(values: PolicyForm) {
    setSaving(true)
    try {
      const policy = await api<AppVersionPolicy>(`/api/v1/settings/app-versions/${platform}`, {
        method: 'PUT',
        body: JSON.stringify(values),
      })
      form.setFieldsValue(policy)
      setExists(true)
      setUpdatedAt(policy.updated_at)
      messageApi.success(policy.enabled ? '更新策略已发布' : '更新策略已停用')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '保存更新策略失败')
    } finally {
      setSaving(false)
    }
  }

  const platformLabel = platform === 'android' ? 'Android' : 'iOS'
  return (
    <>
      {contextHolder}
      <Alert
        showIcon
        type={enabled ? 'info' : 'warning'}
        style={{ marginBottom: 16 }}
        message={enabled ? `${platformLabel} 客户端会在启动和手动检查时读取此策略。` : `${platformLabel} 当前不会向客户端下发更新提示。`}
        description="保存只会写入 ivapp 的 app_versions 数据库；运营后台浏览器不会接触 ivapp 内部发布密钥。"
      />
      <Form form={form} layout="vertical" onFinish={(values) => void save(values)}>
        <Form.Item name="enabled" label="下发更新提示" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>
        <Space size={16} align="start" wrap>
          <Form.Item name="latest_version" label="最新版本号" rules={[{ required: true, message: '必填' }]}>
            <Input placeholder="例如 1.0.13" style={{ width: 190 }} />
          </Form.Item>
          <Form.Item name="latest_build" label="最新构建号" rules={[{ required: true, message: '必填' }]}>
            <InputNumber min={0} precision={0} style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="minimum_version" label="最低支持版本" rules={[{ required: true, message: '必填' }]}>
            <Input placeholder="例如 1.0.12" style={{ width: 190 }} />
          </Form.Item>
          <Form.Item name="minimum_build" label="最低构建号" rules={[{ required: true, message: '必填' }]}>
            <InputNumber min={0} precision={0} style={{ width: 150 }} />
          </Form.Item>
        </Space>
        <Form.Item
          name="store_url"
          label="安装包 / 商店 HTTPS 地址"
          rules={enabled ? [
            { required: true, type: 'url', message: '启用时必须填写 HTTPS 地址' },
            {
              validator: (_, value) => !value || String(value).startsWith('https://')
                ? Promise.resolve()
                : Promise.reject(new Error('地址必须使用 HTTPS')),
            },
          ] : []}
        >
          <Input placeholder="https://cdn.pixopixo.cn/apps/pixo-v1.0.13.apk" />
        </Form.Item>
        <Space size={16} align="start" wrap style={{ width: '100%' }}>
          <Form.Item
            name="package_name"
            label="应用包名"
            rules={enabled ? [{ required: true, message: '启用时必须填写' }] : []}
            style={{ minWidth: 320, flex: 1 }}
          >
            <Input disabled={platform === 'android'} />
          </Form.Item>
          <Form.Item
            name="size_bytes"
            label="安装包大小（字节）"
            rules={enabled ? [{ type: 'number', min: 1, message: '启用时必须大于 0' }] : []}
          >
            <InputNumber min={0} precision={0} style={{ width: 220 }} />
          </Form.Item>
        </Space>
        <Form.Item name="release_notes" label="更新说明">
          <Input.TextArea rows={4} placeholder="每行一条，客户端将以列表展示" maxLength={10000} showCount />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={saving} disabled={loading}>
            保存更新策略
          </Button>
          <Button onClick={() => void load()} disabled={saving}>
            重新加载
          </Button>
          {exists ? <Tag color={enabled ? 'green' : 'default'}>{enabled ? '已启用' : '已停用'}</Tag> : <Tag>尚未创建</Tag>}
          {updatedAt ? <Typography.Text type="secondary">最后更新：{updatedAt}</Typography.Text> : null}
        </Space>
      </Form>
    </>
  )
}

export default function AppVersionPolicyCard() {
  return (
    <Card className="page-card" title="平台策略">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="最新构建号高于客户端时提示更新；低于最低构建号时强制更新。"
      />
      <Tabs
        items={(['android', 'ios'] as const).map((platform) => ({
          key: platform,
          label: platform === 'android' ? 'Android' : 'iOS',
          children: <PolicyEditor platform={platform} />,
        }))}
      />
    </Card>
  )
}
