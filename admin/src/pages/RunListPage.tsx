import { message, Modal } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { runsApi, engineApi, storiesApi } from '../services/api'
import HtmlImportsPage from './HtmlImportsPage'
import { Run } from '../types/run'
import {
  RunFilterBar,
  RunTable,
  UploadRunModal,
  ReviewRunModal,
  EditWeightModal,
  sourceOptions,
  normalizeProcessStatus,
  isRetryable,
  type StatusFilter,
  type SourceFilter,
  type OwnStatusFilter,
  type ProcessStatusFilter,
} from '../components/run-list'

export default function RunListPage() {
  const navigate = useNavigate()
  const { me } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  // admin / manager 使用全量内容管理列表；operator 等角色只能看到自己创建的视频
  const manageAll = me?.role === 'admin' || me?.role === 'manager'
  const [rows, setRows] = useState<Run[]>([])
  // operator 等角色使用后端分页，total 取后端返回的总数用于翻页
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [defaultModel, setDefaultModel] = useState('')
  const [engineReady, setEngineReady] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [processStatusFilter, setProcessStatusFilter] = useState<ProcessStatusFilter>('all')
  const [ownStatusFilter, setOwnStatusFilter] = useState<OwnStatusFilter>('all')
  const [keyword, setKeyword] = useState('')
  const sourceParam = searchParams.get('source')
  const sourceFilter: SourceFilter = sourceOptions.some((option) => option.value === sourceParam) &&
    (sourceParam !== 'manual_upload' || manageAll)
    ? sourceParam as SourceFilter
    : 'pgc'
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [reviewRun, setReviewRun] = useState<Run | null>(null)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [weightRun, setWeightRun] = useState<Run | null>(null)
  const [weightModalOpen, setWeightModalOpen] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  // 前端叠加过滤：关键字 + 处理（生成）状态。审核状态与来源由后端粗筛。
  const visibleRows = useMemo(() => {
    let list = rows
    const kw = keyword.trim().toLowerCase()
    if (kw) {
      list = list.filter((row) =>
        (row.title || '').toLowerCase().includes(kw) ||
        (row.source_filename || '').toLowerCase().includes(kw),
      )
    }
    if (processStatusFilter !== 'all') {
      list = list.filter((row) => normalizeProcessStatus(row) === processStatusFilter)
    }
    return list
  }, [rows, keyword, processStatusFilter])

  // admin/manager 全量加载后在前端分页；operator 等角色由后端分页，总数用后端 total
  const tableTotal = manageAll ? visibleRows.length : total

  const selectSource = useCallback((value: SourceFilter) => {
    setPage(1)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value === 'pgc') next.delete('source')
      else next.set('source', value)
      return next
    })
  }, [setSearchParams])

  useEffect(() => {
    if (sourceParam === 'manual_upload' && !manageAll) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.delete('source')
        return next
      }, { replace: true })
    }
  }, [manageAll, setSearchParams, sourceParam])

  const load = useCallback(async () => {
    if (!manageAll) {
      setLoading(true)
      try {
        const [data, settings] = await Promise.all([
          runsApi.listOwn({ status_filter: ownStatusFilter, page, page_size: pageSize }),
          engineApi.getReady(),
        ])
        setRows(data.items)
        setTotal(data.total)
        setEngineReady(settings.ready)
      } catch (err) {
        messageApi.error(err instanceof Error ? err.message : '加载失败')
      } finally {
        setLoading(false)
      }
      return
    }
    if (sourceFilter === 'manual_upload') {
      setRows([])
      setTotal(0)
      return
    }
    setLoading(true)
    try {
      const [data, settings] = await Promise.all([
        runsApi.list({ source: sourceFilter, status: statusFilter }),
        engineApi.getReady(),
      ])
      setRows(data.items)
      setTotal(data.total)
      setEngineReady(settings.ready)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [manageAll, messageApi, statusFilter, ownStatusFilter, sourceFilter, page, pageSize])

  useEffect(() => {
    void load()
  }, [load])

  const openUpload = useCallback(async () => {
    setOpen(true)
    if (!engineReady) return
    try {
      const data = await engineApi.getModels()
      setDefaultModel(data.default)
      setModels(data.default ? [data.default] : [])
    } catch (err) {
      messageApi.warning(err instanceof Error ? err.message : '模型列表加载失败')
      setModels([])
    }
  }, [engineReady, messageApi])

  const handleCreateStory = useCallback(async () => {
    try {
      const created = await storiesApi.create('', 'simple_abc')
      messageApi.success('已创建故事')
      navigate(`/stories/${created.id}/${created.analysis_version || '0.0.1'}`)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '创建失败')
    }
  }, [messageApi, navigate])

  const handleReview = useCallback((run: Run) => {
    setReviewRun(run)
    setReviewModalOpen(true)
  }, [])

  const handleApprove = useCallback(async () => {
    if (!reviewRun) return
    try {
      await runsApi.review(reviewRun.id, 'approved')
      messageApi.success('已通过审核')
      setReviewModalOpen(false)
      setReviewRun(null)
      void load()
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : '审核失败')
    }
  }, [reviewRun, messageApi, load])

  const handleReject = useCallback(async () => {
    if (!reviewRun) return
    try {
      await runsApi.review(reviewRun.id, 'rejected')
      messageApi.success('已拒绝')
      setReviewModalOpen(false)
      setReviewRun(null)
      void load()
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : '审核失败')
    }
  }, [reviewRun, messageApi, load])

  const handleDelete = useCallback(async (run: Run) => {
    if (!window.confirm('确认下架并删除此发布内容？')) return
    try {
      await runsApi.delete(run.id)
      messageApi.success('已下架')
      void load()
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : '下架失败')
    }
  }, [messageApi, load])

  const handleTrash = useCallback((run: Run) => {
    Modal.confirm({
      title: '删除视频',
      content: `确定要将「${run.title || run.source_filename}」移入垃圾箱吗？删除后可在"垃圾箱"中查看，已发布的视频也会同步标记删除。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await runsApi.trash(run.id)
          messageApi.success('已移入垃圾箱')
          void load()
        } catch (e) {
          messageApi.error(e instanceof Error ? e.message : '删除失败')
        }
      },
    })
  }, [messageApi, load])

  const handleEditWeight = useCallback((run: Run) => {
    setWeightRun(run)
    setWeightModalOpen(true)
  }, [])

  const handleSaveWeight = useCallback(async (weight: number) => {
    if (!weightRun) return
    if (!weightRun.review_status) {
      messageApi.error('该内容暂无审核状态，无法设置权重')
      return
    }
    try {
      await runsApi.updateRunFeedWeight(weightRun.id, weight)
      setRows((current) => current.map((item) => item.id === weightRun.id ? { ...item, feed_weight: weight } : item))
      messageApi.success('权重已保存')
      setWeightModalOpen(false)
      setWeightRun(null)
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '权重保存失败')
    }
  }, [weightRun, messageApi])

  const handleUploadSuccess = useCallback((runId: string, analysisVersion: string | null | undefined, manual: boolean) => {
    setOpen(false)
    if (manual && analysisVersion) {
      navigate(`/runs/${runId}/annotate/${analysisVersion}`)
    } else {
      navigate(`/runs/${runId}`)
    }
  }, [navigate])

  const handleReanalyze = useCallback((run: Run) => {
    if (!isRetryable(run)) return
    Modal.confirm({
      title: '重新分析',
      content: `确认对「${run.title || run.source_filename}」重新发起分析？当前分析结果将基于新模型重新生成。`,
      okText: '加入分析队列',
      cancelText: '取消',
      onOk: async () => {
        try {
          await runsApi.reanalyze(run.id, {})
          messageApi.success('已加入分析队列')
          void load()
        } catch (e) {
          messageApi.error(e instanceof Error ? e.message : '重新分析失败')
        }
      },
    })
  }, [load, messageApi])

  return (
    <>
      {contextHolder}
      <RunFilterBar
        manageAll={manageAll}
        total={tableTotal}
        sourceFilter={sourceFilter}
        statusFilter={statusFilter}
        processStatusFilter={processStatusFilter}
        ownStatusFilter={ownStatusFilter}
        keyword={keyword}
        engineReady={engineReady}
        isManualUpload={sourceFilter === 'manual_upload'}
        onSourceChange={selectSource}
        onStatusChange={(value) => { setStatusFilter(value); setPage(1) }}
        onProcessStatusChange={(value) => { setProcessStatusFilter(value); setPage(1) }}
        onOwnStatusChange={(value) => { setOwnStatusFilter(value); setPage(1) }}
        onKeywordChange={(value) => { setKeyword(value); setPage(1) }}
        onCreateStory={handleCreateStory}
        onUpload={() => void openUpload()}
      />
      {manageAll && sourceFilter === 'manual_upload' ? (
        <HtmlImportsPage embedded />
      ) : (
        <RunTable
          manageAll={manageAll}
          rows={visibleRows}
          loading={loading}
          total={tableTotal}
          page={page}
          pageSize={pageSize}
          onPageChange={(p, ps) => { setPage(p); setPageSize(ps) }}
          onReview={handleReview}
          onDelete={handleDelete}
          onTrash={handleTrash}
          onEditWeight={handleEditWeight}
          onReanalyze={handleReanalyze}
        />
      )}
      <UploadRunModal
        open={open}
        models={models}
        defaultModel={defaultModel}
        engineReady={engineReady}
        onClose={() => setOpen(false)}
        onSuccess={(runId, analysisVersion, manual) => {
          setOpen(false)
          handleUploadSuccess(runId, analysisVersion, manual)
        }}
        messageApi={messageApi}
      />
      <ReviewRunModal
        open={reviewModalOpen}
        run={reviewRun}
        onClose={() => { setReviewModalOpen(false); setReviewRun(null) }}
        onApprove={handleApprove}
        onReject={handleReject}
      />
      <EditWeightModal
        open={weightModalOpen}
        run={weightRun}
        onClose={() => { setWeightModalOpen(false); setWeightRun(null) }}
        onSave={handleSaveWeight}
      />
    </>
  )
}
