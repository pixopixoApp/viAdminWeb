import { CloudUploadOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Form, Input, Modal, Select, Space, Table, Tag, Typography, Upload, message } from 'antd'
import type { UploadProps } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { api, sha256Hex, uploadToSignedOss } from '../api'

type HtmlImport = {
  id: string; status: string; source_filename: string; item_id: string; entry: string
  entry_candidates: string[]; suggested_capabilities: string[]; required_capabilities: string[]
  title: string; description: string; author_user_id: string; package_version?: string | null
  html_url?: string | null; error_message: string; created_at: string
}
type UploadSession = { session_id: string; uploads: Array<{ client_ref: string; url: string; fields: Record<string, string> }> }
const capabilities = ['motion', 'microphoneLevel', 'cameraStream', 'haptics', 'mediaControl']

export default function HtmlImportsPage({ embedded = false }: { embedded?: boolean }) {
  const [rows, setRows] = useState<HtmlImport[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<HtmlImport | null>(null)
  const [form] = Form.useForm<Pick<HtmlImport, 'entry' | 'title' | 'description' | 'required_capabilities'>>()
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api<{ items: HtmlImport[] }>('/api/v1/html-imports')
      setRows(result.items)
    } catch (error) { messageApi.error(error instanceof Error ? error.message : '加载 HTML 内容失败') } finally { setLoading(false) }
  }, [messageApi])
  useEffect(() => { void load() }, [load])

  const uploadProps: UploadProps = {
    accept: '.zip,application/zip', maxCount: 1, showUploadList: false,
    beforeUpload: async (file) => {
      try {
        if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('请上传 ZIP 包')
        messageApi.loading({ content: '正在计算校验并申请 OSS 上传凭证…', key: 'html-import', duration: 0 })
        const sha256 = await sha256Hex(file)
        const created = await api<{ import: HtmlImport; upload: UploadSession }>('/api/v1/html-imports', {
          method: 'POST', body: JSON.stringify({ filename: file.name, size_bytes: file.size, sha256 }),
        })
        const policy = created.upload.uploads.find((item) => item.client_ref === 'source')
        if (!policy) throw new Error('未收到源包上传凭证')
        await uploadToSignedOss(policy, file as File)
        messageApi.loading({ content: '正在校验 ZIP 并扫描资源…', key: 'html-import', duration: 0 })
        const finalized = await api<{ import: HtmlImport }>(`/api/v1/html-imports/${created.import.id}/finalize-source`, {
          method: 'POST', body: JSON.stringify({ session_id: created.upload.session_id, manifest_hash: sha256 }),
        })
        setSelected(finalized.import); form.setFieldsValue(finalized.import)
        messageApi.success({ content: 'ZIP 已校验，请补全发布信息', key: 'html-import' }); await load()
      } catch (error) { messageApi.error({ content: error instanceof Error ? error.message : '导入失败', key: 'html-import' }) }
      return Upload.LIST_IGNORE
    },
  }

  async function save() {
    if (!selected) return
    const values = await form.validateFields()
    const updated = await api<HtmlImport>(`/api/v1/html-imports/${selected.id}`, { method: 'PATCH', body: JSON.stringify(values) })
    setSelected(updated); messageApi.success('已保存；如已打包，会要求重新准备')
    await load()
  }
  async function prepare() {
    if (!selected) return
    await save()
    messageApi.loading({ content: '正在安全打包、注入 Host SDK 并运行浏览器校验…', key: 'prepare', duration: 0 })
    try {
      const result = await api<{ import: HtmlImport; preview: string }>(`/api/v1/html-imports/${selected.id}/prepare`, { method: 'POST' })
      setSelected(result.import); form.setFieldsValue(result.import)
      messageApi.success({ content: '已生成不可变预览包，请完成 Android 真机验收后发布', key: 'prepare' }); await load()
    } catch (error) { messageApi.error({ content: error instanceof Error ? error.message : '准备失败', key: 'prepare' }) }
  }
  async function suggest() {
    if (!selected) return
    try {
      const result = await api<{ import: HtmlImport; suggestion_source: string }>(`/api/v1/html-imports/${selected.id}/suggest`, { method: 'POST' })
      setSelected(result.import); form.setFieldsValue(result.import)
      messageApi.success(result.suggestion_source === 'dmx' ? '已使用模型生成建议，可继续编辑' : '模型不可用，已生成基础建议')
      await load()
    } catch (error) { messageApi.error(error instanceof Error ? error.message : '生成建议失败') }
  }
  function publish() {
    if (!selected) return
    Modal.confirm({ title: '确认发布 HTML 内容？', content: '发布后会进入混合推荐流。请确认已完成 Android 真机验收。', async onOk() {
      await api(`/api/v1/html-imports/${selected.id}/publish`, { method: 'POST' })
      messageApi.success('已发布'); await load()
    } })
  }

  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    {contextHolder}
    <Card
      title={embedded ? '手动上传 · HTML 互动内容' : 'HTML 互动内容'}
      extra={<Space><Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button><Upload {...uploadProps}><Button type="primary" icon={<CloudUploadOutlined />}>上传 ZIP</Button></Upload></Space>}
    >
      <Alert
        type="info"
        showIcon
        message="源 ZIP 直传私有 OSS；平台会阻止外部脚本、iframe、HTTP 和越界路径。准备完成的包是不可变版本，发布前仍需 Android 真机验收。"
        description={embedded ? '操作顺序：上传 ZIP → 补全元数据 → 准备预览包 → Android 真机验收 → 确认发布。' : undefined}
      />
    </Card>
    <Table rowKey="id" loading={loading} dataSource={rows} pagination={false} onRow={(row) => ({ onClick: () => { setSelected(row); form.setFieldsValue(row) } })} columns={[
      { title: '源包', dataIndex: 'source_filename' }, { title: '状态', dataIndex: 'status', render: (value) => <Tag>{value}</Tag> },
      { title: '标题', dataIndex: 'title', render: (value) => value || <Typography.Text type="secondary">待填写</Typography.Text> },
      { title: '版本', dataIndex: 'package_version', render: (value) => value ? value.slice(0, 12) : '—' },
      { title: '创建时间', dataIndex: 'created_at', render: (value) => value ? new Date(value).toLocaleString() : '—' },
    ]} />
    {selected && <Card title={`编辑：${selected.source_filename}`} extra={<Tag>{selected.item_id}</Tag>}>
      {selected.error_message && <Alert type="error" showIcon message={selected.error_message} style={{ marginBottom: 16 }} />}
      <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="虚拟作者">{selected.author_user_id}</Descriptions.Item>
        <Descriptions.Item label="建议能力">{selected.suggested_capabilities.join(', ') || '无'}</Descriptions.Item>
      </Descriptions>
      <Form form={form} layout="vertical">
        <Form.Item label="入口 HTML" name="entry" rules={[{ required: true }]}><Select options={selected.entry_candidates.map((value) => ({ value }))} /></Form.Item>
        <Form.Item label="标题" name="title" rules={[{ required: true, max: 120 }]}><Input /></Form.Item>
        <Form.Item label="描述" name="description"><Input.TextArea rows={3} maxLength={1200} /></Form.Item>
        <Form.Item label="声明能力" name="required_capabilities"><Select mode="multiple" options={capabilities.map((value) => ({ value }))} /></Form.Item>
      </Form>
      <Space><Button onClick={() => void suggest()}>AI 生成建议</Button><Button onClick={() => void save()}>保存元数据</Button><Button type="primary" icon={<PlayCircleOutlined />} onClick={() => void prepare()} disabled={!selected.entry}>准备预览包</Button><Button onClick={publish} disabled={selected.status !== 'prepared'}>确认发布</Button>{selected.html_url && <Button href={selected.html_url} target="_blank">打开预览</Button>}</Space>
    </Card>}
  </Space>
}
