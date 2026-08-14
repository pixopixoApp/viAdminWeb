import { message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
  type StatusFilter,
  type SourceFilter,
} from '../components/run-list'

export default function RunListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState<Run[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [defaultModel, setDefaultModel] = useState('')
  const [engineReady, setEngineReady] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(() => {
    const source = searchParams.get('source')
    return sourceOptions.some((option) => option.value === source)
      ? (source as SourceFilter)
      : 'pgc'
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [reviewRun, setReviewRun] = useState<Run | null>(null)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [weightRun, setWeightRun] = useState<Run | null>(null)
  const [weightModalOpen, setWeightModalOpen] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const selectSource = useCallback((value: SourceFilter) => {
    setSourceFilter(value)
    setPage(1)
    setSearchParams(value === 'pgc' ? {} : { source: value })
  }, [setSearchParams])

  const load = useCallback(async () => {
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
  }, [messageApi, statusFilter, sourceFilter, page, pageSize])

  useEffect(() => {
    void load()
  }, [load])

  const openUpload = useCallback(async () => {
    setOpen(true)
    if (!engineReady) return
    try {
      const data = await engineApi.getModels()
      setModels(data.items.map((i) => i.id))
      setDefaultModel(data.default)
    } catch (err) {
      messageApi.warning(err instanceof Error ? err.message : '模型列表加载失败')
      setModels([])
    }
  }, [engineReady, messageApi])

  const handleCreateStory = useCallback(async () => {
    try {
      const created = await storiesApi.create('')
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

  return (
    <>
      {contextHolder}
      <RunFilterBar
        total={total}
        sourceFilter={sourceFilter}
        statusFilter={statusFilter}
        engineReady={engineReady}
        isManualUpload={sourceFilter === 'manual_upload'}
        onSourceChange={selectSource}
        onStatusChange={(value) => { setStatusFilter(value); setPage(1) }}
        onCreateStory={handleCreateStory}
        onUpload={() => void openUpload()}
      />
      {sourceFilter !== 'manual_upload' ? (
        <RunTable
          rows={rows}
          loading={loading}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={(p, ps) => { setPage(p); setPageSize(ps) }}
          onReview={handleReview}
          onDelete={handleDelete}
          onEditWeight={handleEditWeight}
        />
      ) : (
        <HtmlImportsPage embedded />
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