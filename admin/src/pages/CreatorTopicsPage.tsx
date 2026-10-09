import {
  App,
  Avatar,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  creatorTopicsApi,
  type CreatorTopic,
  type CreatorTopicCreator,
} from '../services/api'

type TopicDialog = { mode: 'create' } | { mode: 'rename'; topic: CreatorTopic } | null
type ArchiveDialog = { topic: CreatorTopic; strategy: 'replace' | 'remove'; replacementId?: string } | null

function TopicLibrary() {
  const { message } = App.useApp()
  const [items, setItems] = useState<CreatorTopic[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [dialog, setDialog] = useState<TopicDialog>(null)
  const [archive, setArchive] = useState<ArchiveDialog>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ name: string }>()

  async function load() {
    setLoading(true)
    try {
      setItems((await creatorTopicsApi.list(deferredSearch, true)).items)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '主题库加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [deferredSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  function openDialog(next: TopicDialog) {
    setDialog(next)
    form.setFieldsValue({ name: next?.mode === 'rename' ? next.topic.name : '' })
  }

  async function submitTopic() {
    const { name } = await form.validateFields()
    if (!dialog) return
    setSaving(true)
    try {
      if (dialog.mode === 'create') await creatorTopicsApi.create(name.trim())
      else await creatorTopicsApi.update(dialog.topic.id, { name: name.trim() })
      message.success(dialog.mode === 'create' ? '主题已创建' : '主题名称已更新')
      setDialog(null)
      await load()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function toggle(topic: CreatorTopic, enabled: boolean) {
    try {
      await creatorTopicsApi.update(topic.id, { enabled })
      message.success(enabled ? '主题已启用' : '主题已停用')
      await load()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失败')
    }
  }

  async function archiveTopic() {
    if (!archive) return
    if (archive.topic.creator_count > 0 && archive.strategy === 'replace' && !archive.replacementId) {
      message.warning('请选择替换主题')
      return
    }
    setSaving(true)
    try {
      await creatorTopicsApi.archive(archive.topic.id, archive.topic.creator_count > 0 ? {
        strategy: archive.strategy,
        ...(archive.strategy === 'replace' ? { replacement_topic_id: archive.replacementId } : {}),
      } : {})
      message.success('主题已归档')
      setArchive(null)
      await load()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '归档失败')
    } finally {
      setSaving(false)
    }
  }

  const replacementOptions = items
    .filter((item) => item.enabled && !item.archived_at && item.id !== archive?.topic.id)
    .map((item) => ({ label: item.name, value: item.id }))

  const columns: ColumnsType<CreatorTopic> = [
    {
      title: '主题名称', dataIndex: 'name', key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name, topic) => <Space><Typography.Text strong>{name}</Typography.Text>{topic.archived_at ? <Tag>已归档</Tag> : null}</Space>,
    },
    {
      title: '关联作者', dataIndex: 'creator_count', key: 'creator_count', width: 120,
      sorter: (a, b) => a.creator_count - b.creator_count,
    },
    {
      title: '启用', key: 'enabled', width: 96,
      render: (_, topic) => <Switch checked={topic.enabled && !topic.archived_at} onChange={(value) => void toggle(topic, value)} />,
    },
    {
      title: '操作', key: 'actions', width: 180,
      render: (_, topic) => <Space>
        <Button type="link" onClick={() => openDialog({ mode: 'rename', topic })}>改名</Button>
        {!topic.archived_at ? <Button danger type="link" onClick={() => setArchive({ topic, strategy: 'replace' })}>归档</Button> : null}
      </Space>,
    },
  ]

  return <>
    <Card className="page-card">
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Input.Search
          aria-label="搜索主题"
          allowClear
          placeholder="搜索主题名称"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ width: 280 }}
        />
        <Button type="primary" onClick={() => openDialog({ mode: 'create' })}>新建主题</Button>
      </Space>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={items} pagination={false} scroll={{ x: 680 }} />
    </Card>
    <Modal
      title={dialog?.mode === 'rename' ? '修改主题名称' : '新建主题'}
      open={Boolean(dialog)}
      confirmLoading={saving}
      okText="保存"
      onOk={() => void submitTopic()}
      onCancel={() => setDialog(null)}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="主题名称" rules={[{ required: true, whitespace: true, message: '请输入主题名称' }]}>
          <Input maxLength={60} autoFocus />
        </Form.Item>
      </Form>
    </Modal>
    <Modal
      title={`归档“${archive?.topic.name || ''}”`}
      open={Boolean(archive)}
      confirmLoading={saving}
      okButtonProps={{ danger: true }}
      okText="确认归档"
      onOk={() => void archiveTopic()}
      onCancel={() => setArchive(null)}
      destroyOnClose
    >
      {archive && archive.topic.creator_count > 0 ? <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Paragraph>
          当前有 {archive.topic.creator_count} 位作者关联此主题。请选择批量处理方式，归档与关联变更会在同一事务完成。
        </Typography.Paragraph>
        <Radio.Group
          value={archive.strategy}
          onChange={(event) => setArchive({ ...archive, strategy: event.target.value, replacementId: undefined })}
        >
          <Space direction="vertical">
            <Radio value="replace">替换为另一个启用主题</Radio>
            <Radio value="remove">从全部作者移除</Radio>
          </Space>
        </Radio.Group>
        {archive.strategy === 'replace' ? <Select
          aria-label="选择替换主题"
          showSearch
          optionFilterProp="label"
          placeholder="选择替换主题"
          value={archive.replacementId}
          options={replacementOptions}
          onChange={(replacementId) => setArchive({ ...archive, replacementId })}
          style={{ width: '100%' }}
        /> : null}
      </Space> : <Typography.Paragraph>此主题没有关联作者，可以直接归档。</Typography.Paragraph>}
    </Modal>
  </>
}

function CreatorAssignments() {
  const { message } = App.useApp()
  const [topics, setTopics] = useState<CreatorTopic[]>([])
  const [creators, setCreators] = useState<CreatorTopicCreator[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(nextOffset = offset) {
    setLoading(true)
    try {
      const [topicResult, creatorResult] = await Promise.all([
        creatorTopicsApi.list('', false),
        creatorTopicsApi.creators(deferredSearch, nextOffset),
      ])
      setTopics(topicResult.items)
      setCreators(creatorResult.items)
      setTotal(creatorResult.total)
      setSelected(Object.fromEntries(creatorResult.items.map((creator) => [
        creator.user_id, creator.topics.map((topic) => topic.id),
      ])))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创作者关联加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setOffset(0)
    void load(0)
  }, [deferredSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  const topicOptions = useMemo(
    () => topics.map((topic) => ({ label: topic.name, value: topic.id })),
    [topics],
  )

  async function save(creator: CreatorTopicCreator) {
    setSaving(creator.user_id)
    try {
      const result = await creatorTopicsApi.saveCreator(creator.user_id, selected[creator.user_id] || [])
      setCreators((current) => current.map((item) => item.user_id === creator.user_id
        ? { ...item, topics: result.topics, profile_updated_at: result.profile_updated_at }
        : item))
      message.success(`@${creator.handle || creator.user_id} 的主题已保存`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(null)
    }
  }

  const columns: ColumnsType<CreatorTopicCreator> = [
    {
      title: '创作者', key: 'creator', width: 280,
      render: (_, creator) => <Space>
        <Avatar src={creator.avatar_url || undefined}>{(creator.nickname || creator.handle || 'P').slice(0, 1)}</Avatar>
        <div>
          <Typography.Text strong>{creator.nickname || '未命名频道'}</Typography.Text>
          <br />
          <Typography.Text type="secondary">@{creator.handle || '—'} · {creator.user_id}</Typography.Text>
        </div>
      </Space>,
    },
    {
      title: '主题（最多 3 个）', key: 'topics',
      render: (_, creator) => <Select
        mode="multiple"
        aria-label={`${creator.nickname || creator.handle} 的主题`}
        maxCount={3}
        value={selected[creator.user_id] || []}
        options={topicOptions}
        onChange={(value) => setSelected((current) => ({ ...current, [creator.user_id]: value }))}
        placeholder="选择主题"
        style={{ width: '100%', minWidth: 260 }}
      />,
    },
    {
      title: '操作', key: 'actions', width: 104,
      render: (_, creator) => <Button
        type="primary"
        loading={saving === creator.user_id}
        onClick={() => void save(creator)}
      >保存</Button>,
    },
  ]

  return <Card className="page-card">
    <Input.Search
      aria-label="搜索创作者"
      allowClear
      placeholder="按名称、handle 或 user_id 搜索"
      value={search}
      onChange={(event) => setSearch(event.target.value)}
      style={{ width: 360, maxWidth: '100%', marginBottom: 16 }}
    />
    <Table
      rowKey="user_id"
      loading={loading}
      columns={columns}
      dataSource={creators}
      scroll={{ x: 760 }}
      pagination={{
        current: Math.floor(offset / 50) + 1,
        pageSize: 50,
        total,
        showSizeChanger: false,
        onChange: (page) => {
          const nextOffset = (page - 1) * 50
          setOffset(nextOffset)
          void load(nextOffset)
        },
      }}
    />
  </Card>
}

export default function CreatorTopicsPage() {
  return <App>
    <div className="page-header">
      <div>
        <Typography.Title level={2}>创作者主题</Typography.Title>
        <Typography.Paragraph type="secondary">维护稳定主题库，并管理所有创作者的频道定位。</Typography.Paragraph>
      </div>
    </div>
    <Tabs items={[
      { key: 'library', label: '主题库', children: <TopicLibrary /> },
      { key: 'creators', label: '创作者关联', children: <CreatorAssignments /> },
    ]} />
  </App>
}
