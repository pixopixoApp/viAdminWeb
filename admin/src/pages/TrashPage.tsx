import { Button, Space, Table, Typography, message, Modal, Popconfirm } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { runsApi } from '../services/api'
import { formatServerTime } from '../time'
import type { Run } from '../types/run'
import CoverThumb from '../components/run-list/CoverThumb'

export default function TrashPage({ embedded = false, onTotalChange }: { embedded?: boolean; onTotalChange?: (total: number) => void }) {
  const { me } = useAuth()
  const manageAll = me?.role === 'admin' || me?.role === 'manager'
  const [rows, setRows] = useState<Run[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [batchBusy, setBatchBusy] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const [modalApi, modalContextHolder] = Modal.useModal()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await runsApi.listTrash(page, pageSize)
      setRows(data.items)
      setTotal(data.total)
      onTotalChange?.(data.total)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载垃圾箱失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, messageApi, onTotalChange])

  useEffect(() => {
    void load()
  }, [load])

  // 切换分页/刷新后清空选择，避免误操作已不可见的行
  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => rows.some((row) => row.id === id)))
  }, [rows])

  const afterRemoval = useCallback((removedFromPage: number) => {
    if (removedFromPage > 0 && rows.length === removedFromPage && page > 1) {
      setPage((p) => p - 1)
    } else {
      void load()
    }
  }, [rows.length, page, load])

  const handleRestore = useCallback(async (run: Run) => {
    try {
      await runsApi.restore(run.id)
      messageApi.success('已恢复')
      afterRemoval(1)
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : '恢复失败')
    }
  }, [messageApi, afterRemoval])

  const handlePurge = useCallback(async (run: Run) => {
    try {
      await runsApi.purge(run.id)
      messageApi.success('已彻底删除')
      afterRemoval(1)
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : '彻底删除失败')
    }
  }, [messageApi, afterRemoval])

  const runBatch = useCallback(async (
    ids: string[],
    action: (ids: string[]) => Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }>,
    successVerb: string,
  ) => {
    if (ids.length === 0) return
    setBatchBusy(true)
    try {
      const result = await action(ids)
      const ok = result.succeeded.length
      const failed = result.failed.length
      if (failed === 0) {
        messageApi.success(`已${successVerb} ${ok} 条`)
      } else if (ok === 0) {
        messageApi.error(`${successVerb}失败：${failed} 条。${result.failed[0]?.error ?? ''}`)
      } else {
        messageApi.warning(`已${successVerb} ${ok} 条，${failed} 条失败：${result.failed[0]?.error ?? ''}`)
      }
      setSelectedIds([])
      afterRemoval(ok)
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : `批量${successVerb}失败`)
    } finally {
      setBatchBusy(false)
    }
  }, [messageApi, afterRemoval])

  const handleBatchRestore = useCallback(() => {
    const ids = selectedIds
    if (ids.length === 0) return
    modalApi.confirm({
      title: '批量恢复视频',
      content: `确定要将选中的 ${ids.length} 个视频移出垃圾箱并恢复吗？`,
      okText: '恢复',
      cancelText: '取消',
      onOk: () => runBatch(ids, runsApi.batchRestore, '恢复'),
    })
  }, [selectedIds, modalApi, runBatch])

  const handleBatchPurge = useCallback(() => {
    const ids = selectedIds
    if (ids.length === 0) return
    modalApi.confirm({
      title: '批量彻底删除视频',
      content: `确定要彻底删除选中的 ${ids.length} 个视频吗？该操作不可恢复，将同时删除已发布内容及相关文件。`,
      okText: '彻底删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => runBatch(ids, runsApi.batchPurge, '彻底删除'),
    })
  }, [selectedIds, modalApi, runBatch])


  const columns: ColumnsType<Run> = [
    {
      title: '封面', key: 'cover', width: 88,
      render: (_, row) => (
        <CoverThumb
          coverUrl={row.cover_url}
          previewUrl={row.preview_url}
          contentType={row.content_type}
        />
      ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      render: (_t, row) => row.title || row.source_filename,
    },
    {
      title: '类型',
      key: 'content_mode',
      width: 90,
      render: (_, row) => (row.content_mode === 'story' ? '故事' : '单视频'),
    },
    {
      title: '状态',
      key: 'status',
      width: 130,
      render: (_, row) => row.published_version ? '已发布' : (row.status === 'ready' ? '就绪' : row.status),
    },
    {
      title: '删除时间',
      dataIndex: 'deleted_at',
      width: 180,
      render: (v?: string) => (v ? formatServerTime(v) : '-'),
    },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_, row) => (
        <Space>
          <Popconfirm
            title="恢复视频"
            description="确定要从此视频移出垃圾箱并恢复吗？"
            okText="恢复"
            cancelText="取消"
            onConfirm={() => handleRestore(row)}
          >
            <Button size="small" type="primary">恢复</Button>
          </Popconfirm>
          {manageAll ? (
            <Popconfirm
              title="彻底删除视频"
              description={
                <span>
                  确定要彻底删除「{row.title || row.source_filename}」吗？
                  <br />
                  该操作不可恢复，将同时删除已发布内容及相关文件。
                </span>
              }
              okText="彻底删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => handlePurge(row)}
            >
              <Button size="small" danger>彻底删除</Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ]

  return (
    <>
      {contextHolder}
      {modalContextHolder}
      {!embedded ? (
        <Typography.Title level={4} style={{ margin: '0 0 16px' }} className="page-title">
          垃圾箱 <Typography.Text type="secondary">({total})</Typography.Text>
        </Typography.Title>
      ) : null}
      {selectedIds.length > 0 ? (
        <Space style={{ marginBottom: 12 }} wrap>
          <Typography.Text type="secondary">已选 {selectedIds.length} 项</Typography.Text>
          <Button size="small" onClick={handleBatchRestore} loading={batchBusy}>批量恢复</Button>
          {manageAll ? (
            <Button size="small" danger onClick={handleBatchPurge} loading={batchBusy}>批量彻底删除</Button>
          ) : null}
          <Button size="small" type="link" onClick={() => setSelectedIds([])} disabled={batchBusy}>取消选择</Button>
        </Space>
      ) : null}
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys.map((key) => String(key))),
          getCheckboxProps: () => ({ disabled: batchBusy }),
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps) },
        }}
      />
    </>
  )
}
