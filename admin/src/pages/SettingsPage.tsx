import { Alert, Button, Card, Form, Input, Space, Tag, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import { engineApi } from '../services/api'

type FormValues = {
  model_base_url: string
  model_name_default: string
  model_api_key?: string
}

export default function SettingsPage() {
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)
  const [modelKeyHint, setModelKeyHint] = useState('')
  const [modelKeySet, setModelKeySet] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  async function load() {
    setLoading(true)
    try {
      const data = await engineApi.getSettings()
      form.setFieldsValue({
        model_base_url: data.model_base_url,
        model_name_default: data.model_name_default,
        model_api_key: '',
      })
      setReady(data.ready)
      setModelKeyHint(data.model_api_key.hint)
      setModelKeySet(data.model_api_key.set)
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
      const body: { model_base_url: string; model_name_default: string; model_api_key?: string } = {
        model_base_url: values.model_base_url,
        model_name_default: values.model_name_default,
      }
      if (values.model_api_key && values.model_api_key.trim()) {
        body.model_api_key = values.model_api_key.trim()
      }
      const data = await engineApi.saveSettings(body)
      form.setFieldsValue({
        model_base_url: data.model_base_url,
        model_name_default: data.model_name_default,
        model_api_key: '',
      })
      setReady(data.ready)
      setModelKeyHint(data.model_api_key.hint)
      setModelKeySet(data.model_api_key.set)
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
      <Typography.Title level={4} style={{ marginTop: 0 }} className="page-title">
        模型网关配置{' '}
        <Tag color={ready ? 'green' : 'orange'}>{ready ? '已就绪' : '未就绪'}</Tag>
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        本地 workflow 会直接调用此模型网关。密钥留空表示保留已有值；历史 Dify 配置仅为兼容已有记录保留，不参与新任务执行。
      </Typography.Paragraph>
      {!ready ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="当前未就绪：请补齐下方三项模型配置后再去分析视频。"
        />
      ) : null}
      <Card className="page-card" loading={loading}>
        <Form form={form} layout="vertical" onFinish={(v) => void onSave(v)} style={{ maxWidth: 560 }}>
          <Form.Item
            name="model_api_key"
            label="MODEL_API_KEY"
            extra={modelKeyHint || '未配置'}
            rules={modelKeySet ? [] : [{ required: true, message: '首次必须填写' }]}
          >
            <Input.Password
              placeholder={modelKeySet ? '留空则保持现有密钥' : '请填写 API Key'}
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
    </>
  )
}
