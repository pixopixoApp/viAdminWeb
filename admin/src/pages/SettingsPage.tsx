import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { engineApi } from '../services/api'
import ReferralRewardsPage from './ReferralRewardsPage'

const US_MODEL = 'qwen3.7-plus-us'

type FormValues = {
  model_base_url: string
  model_name_default: string
  model_api_key?: string
  us_enabled: boolean
  us_model_base_url?: string
  us_model_api_key?: string
}

function RegionalEngineSettings() {
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)
  const [modelKeyHint, setModelKeyHint] = useState('')
  const [modelKeySet, setModelKeySet] = useState(false)
  const [usKeyHint, setUsKeyHint] = useState('')
  const [usKeySet, setUsKeySet] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  async function load() {
    setLoading(true)
    try {
      const data = await engineApi.getSettings()
      const usProfile = data.model_profiles?.[US_MODEL]
      form.setFieldsValue({
        model_base_url: data.model_base_url,
        model_name_default: data.model_name_default,
        model_api_key: '',
        us_enabled: Boolean(usProfile?.enabled),
        us_model_base_url: usProfile?.base_url || '',
        us_model_api_key: '',
      })
      setReady(data.ready)
      setModelKeyHint(data.model_api_key.hint)
      setModelKeySet(data.model_api_key.set)
      setUsKeyHint(usProfile?.api_key.hint || '')
      setUsKeySet(Boolean(usProfile?.api_key.set))
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onSave(values: FormValues) {
    setSaving(true)
    try {
      const usProfile: { enabled: boolean; base_url?: string; api_key?: string } = {
        enabled: values.us_enabled,
      }
      if (values.us_enabled) {
        usProfile.base_url = values.us_model_base_url?.trim() || ''
        if (values.us_model_api_key?.trim()) usProfile.api_key = values.us_model_api_key.trim()
      }
      const data = await engineApi.saveSettings({
        model_base_url: values.model_base_url,
        model_name_default: values.model_name_default,
        ...(values.model_api_key?.trim() ? { model_api_key: values.model_api_key.trim() } : {}),
        model_profiles: { [US_MODEL]: usProfile },
      })
      const savedUsProfile = data.model_profiles?.[US_MODEL]
      form.setFieldsValue({
        model_base_url: data.model_base_url,
        model_name_default: data.model_name_default,
        model_api_key: '',
        us_enabled: Boolean(savedUsProfile?.enabled),
        us_model_base_url: savedUsProfile?.base_url || '',
        us_model_api_key: '',
      })
      setReady(data.ready)
      setModelKeyHint(data.model_api_key.hint)
      setModelKeySet(data.model_api_key.set)
      setUsKeyHint(savedUsProfile?.api_key.hint || '')
      setUsKeySet(Boolean(savedUsProfile?.api_key.set))
      messageApi.success(data.ready ? '区域引擎配置已保存' : '已保存，但中国区仍有未填项')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {contextHolder}
      <Typography.Paragraph type="secondary">
        中国区作为默认引擎；弗吉尼亚区使用独立网关和密钥。密钥留空表示保留已有值。
      </Typography.Paragraph>
      {!ready ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="中国区引擎未就绪：请补齐默认模型、网关和密钥。"
        />
      ) : null}
      <Card className="page-card" loading={loading}>
        <Form form={form} layout="vertical" onFinish={(values) => void onSave(values)} style={{ maxWidth: 640 }}>
          <Typography.Title level={5}>
            中国区 <Tag color={ready ? 'green' : 'orange'}>{ready ? '已就绪' : '未就绪'}</Tag>
          </Typography.Title>
          <Form.Item name="model_name_default" label="默认模型" rules={[{ required: true, message: '必填' }]}>
            <Input placeholder="qwen3.7-plus" />
          </Form.Item>
          <Form.Item name="model_base_url" label="模型网关" rules={[{ required: true, message: '必填' }]}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item
            name="model_api_key"
            label="API Key"
            extra={modelKeyHint || '未配置'}
            rules={modelKeySet ? [] : [{ required: true, message: '首次必须填写' }]}
          >
            <Input.Password
              placeholder={modelKeySet ? '留空则保持现有密钥' : '请填写 API Key'}
              autoComplete="new-password"
            />
          </Form.Item>

          <Typography.Title level={5} style={{ marginTop: 28 }}>弗吉尼亚区</Typography.Title>
          <Form.Item name="us_enabled" label="启用独立区域引擎" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(previous, current) => previous.us_enabled !== current.us_enabled}>
            {({ getFieldValue }) => getFieldValue('us_enabled') ? (
              <>
                <Form.Item label="模型"><Input value={US_MODEL} disabled /></Form.Item>
                <Form.Item
                  name="us_model_base_url"
                  label="模型网关"
                  rules={[{ required: true, message: '启用后必须填写' }]}
                >
                  <Input placeholder="https://..." />
                </Form.Item>
                <Form.Item
                  name="us_model_api_key"
                  label="API Key"
                  extra={usKeyHint || '未配置'}
                  rules={usKeySet ? [] : [{ required: true, message: '启用后必须填写' }]}
                >
                  <Input.Password
                    placeholder={usKeySet ? '留空则保持现有密钥' : '请填写 API Key'}
                    autoComplete="new-password"
                  />
                </Form.Item>
              </>
            ) : null}
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>保存区域配置</Button>
            <Button onClick={() => void load()} disabled={saving}>重新加载</Button>
          </Space>
        </Form>
      </Card>
    </>
  )
}

export default function SettingsPage() {
  const { me } = useAuth()
  const items = [
    { key: 'business', label: '业务配置', children: <ReferralRewardsPage embedded /> },
    ...(me?.role === 'admin' ? [{
      key: 'regions',
      label: '区域引擎',
      children: <RegionalEngineSettings />,
    }] : []),
  ]

  return (
    <>
      <Typography.Title level={4} style={{ marginTop: 0 }} className="page-title">全局配置</Typography.Title>
      <Typography.Paragraph type="secondary">
        集中管理全局业务规则与各区域引擎，减少独立菜单入口。
      </Typography.Paragraph>
      <Tabs items={items} />
    </>
  )
}
