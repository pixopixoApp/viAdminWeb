import { Alert, Button, Card, Form, Input, Space, Tag, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import { api } from '../api'
import AppVersionPolicyCard from '../components/AppVersionPolicyCard'
import InteractionIntentCatalogCard from '../components/InteractionIntentCatalogCard'

type SecretField = {
  set: boolean
  source: string
  value: string
  hint: string
}

type EngineSettings = {
  ready: boolean
  dify_base_url: string
  model_base_url: string
  model_name_default: string
  dify_api_key: SecretField
  model_api_key: SecretField
}

type FormValues = {
  dify_base_url: string
  model_base_url: string
  model_name_default: string
  dify_api_key?: string
  model_api_key?: string
}

export default function SettingsPage() {
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)
  const [hints, setHints] = useState<{ dify: string; model: string }>({ dify: '', model: '' })
  const [keySet, setKeySet] = useState<{ dify: boolean; model: boolean }>({ dify: false, model: false })
  const [messageApi, contextHolder] = message.useMessage()

  async function load() {
    setLoading(true)
    try {
      const data = await api<EngineSettings>('/api/v1/settings/engine')
      form.setFieldsValue({
        dify_base_url: data.dify_base_url,
        model_base_url: data.model_base_url,
        model_name_default: data.model_name_default,
        dify_api_key: '',
        model_api_key: '',
      })
      setReady(data.ready)
      setHints({
        dify: data.dify_api_key.hint,
        model: data.model_api_key.hint,
      })
      setKeySet({
        dify: data.dify_api_key.set,
        model: data.model_api_key.set,
      })
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载失败')
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
      const body: Record<string, string> = {
        dify_base_url: values.dify_base_url,
        model_base_url: values.model_base_url,
        model_name_default: values.model_name_default,
      }
      if (values.dify_api_key && values.dify_api_key.trim()) {
        body.dify_api_key = values.dify_api_key.trim()
      }
      if (values.model_api_key && values.model_api_key.trim()) {
        body.model_api_key = values.model_api_key.trim()
      }
      const data = await api<EngineSettings>('/api/v1/settings/engine', {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      form.setFieldsValue({
        dify_base_url: data.dify_base_url,
        model_base_url: data.model_base_url,
        model_name_default: data.model_name_default,
        dify_api_key: '',
        model_api_key: '',
      })
      setReady(data.ready)
      setHints({
        dify: data.dify_api_key.hint,
        model: data.model_api_key.hint,
      })
      setKeySet({
        dify: data.dify_api_key.set,
        model: data.model_api_key.set,
      })
      messageApi.success(data.ready ? '已保存，引擎已就绪' : '已保存，但仍有未填项')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {contextHolder}
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        引擎配置{' '}
        <Tag color={ready ? 'green' : 'orange'}>{ready ? '已就绪' : '未就绪'}</Tag>
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Dify / 模型网关仅保存在数据库。五项全部填写后才能上传视频或重新分析；密钥留空表示不修改已有值。
      </Typography.Paragraph>
      {!ready ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="当前未就绪：请补齐下方全部配置后再去分析视频。"
        />
      ) : null}
      <Card className="page-card" loading={loading}>
        <Form form={form} layout="vertical" onFinish={(v) => void onSave(v)} style={{ maxWidth: 560 }}>
          <Form.Item
            name="dify_base_url"
            label="DIFY_BASE_URL"
            rules={[{ required: true, message: '必填' }]}
          >
            <Input placeholder="http://..." />
          </Form.Item>
          <Form.Item
            name="dify_api_key"
            label="DIFY_API_KEY"
            extra={hints.dify || '未配置'}
            rules={keySet.dify ? [] : [{ required: true, message: '首次必须填写' }]}
          >
            <Input.Password
              placeholder={keySet.dify ? '留空则保持现有密钥' : '请填写 API Key'}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            name="model_api_key"
            label="MODEL_API_KEY"
            extra={hints.model || '未配置'}
            rules={keySet.model ? [] : [{ required: true, message: '首次必须填写' }]}
          >
            <Input.Password
              placeholder={keySet.model ? '留空则保持现有密钥' : '请填写 API Key'}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            name="model_base_url"
            label="MODEL_BASE_URL"
            rules={[{ required: true, message: '必填' }]}
          >
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item
            name="model_name_default"
            label="MODEL_NAME_DEFAULT"
            rules={[{ required: true, message: '必填' }]}
          >
            <Input placeholder="qwen3.7-plus" />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存
            </Button>
            <Button onClick={() => void load()} disabled={saving}>
              重新加载
            </Button>
          </Space>
        </Form>
      </Card>
      <InteractionIntentCatalogCard />
      <AppVersionPolicyCard />
    </>
  )
}
