import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Form, InputNumber, Modal, Progress, Space, Typography } from 'antd'
import type { Run } from '../../types/run'
import { getSeedInjectJob, seedInject, type SeedInjectJob } from '../../services/api'

interface SeedInjectModalProps {
  open: boolean
  run: Run | null
  onClose: () => void
}

const POLL_MS = 2000

type Phase = 'form' | 'running' | 'done'

/**
 * 后台手动给单个视频注入种子点赞/评论（仅 admin）。
 * 提交后异步入队，弹框轮询展示进度。
 */
export default function SeedInjectModal({ open, run, onClose }: SeedInjectModalProps) {
  const [form] = Form.useForm()
  const [phase, setPhase] = useState<Phase>('form')
  const [job, setJob] = useState<SeedInjectJob | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const stopPolling = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (open) {
      setPhase('form')
      setJob(null)
      setError(null)
      setSubmitting(false)
      form.resetFields()
      form.setFieldsValue({ likes: 10, comments: 1 })
    } else {
      stopPolling()
    }
    return stopPolling
  }, [open, form, stopPolling])

  const poll = useCallback(
    (videoId: string, jobId: string) => {
      stopPolling()
      timerRef.current = window.setInterval(async () => {
        try {
          const next = await getSeedInjectJob(videoId, jobId)
          setJob(next)
          if (next.status === 'done' || next.status === 'failed') {
            stopPolling()
            setPhase('done')
          }
        } catch {
          /* transient poll errors are ignored; keep polling */
        }
      }, POLL_MS)
    },
    [stopPolling],
  )

  const handleSubmit = async () => {
    if (!run) return
    const values = await form.validateFields()
    const likes = Number(values.likes || 0)
    const comments = Number(values.comments || 0)
    if (likes <= 0 && comments <= 0) {
      setError('点赞数和评论数至少填一个大于 0 的值')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await seedInject(run.id, { likes, comments })
      setJob(created)
      setPhase('running')
      poll(run.id, created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const title = run?.title || run?.source_filename || ''
  const likesPct = job && job.likes_target > 0
    ? Math.round((job.likes_done / job.likes_target) * 100)
    : 0
  const commentsPct = job && job.comments_target > 0
    ? Math.round((job.comments_done / job.comments_target) * 100)
    : 0

  return (
    <Modal
      title="注入种子互动"
      open={open}
      onCancel={onClose}
      onOk={phase === 'form' ? handleSubmit : onClose}
      okText={phase === 'form' ? '开始注入' : '关闭'}
      confirmLoading={submitting}
      width={460}
      destroyOnClose
      maskClosable={false}
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        内容：{title}
      </Typography.Paragraph>

      {phase === 'form' ? (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="将使用种子账号给该视频增加点赞与评论"
            description="每个种子账号对该视频最多点赞一次、评论一次；可用账号不足时按实际数量注入。评论由模型按视频玩法即时生成。"
          />
          {error ? (
            <Alert type="error" showIcon style={{ marginBottom: 12 }} message={error} />
          ) : null}
          <Form form={form} layout="vertical" preserve={false}>
            <Form.Item
              name="likes"
              label="增加点赞数"
              rules={[{ required: true, message: '请输入点赞数' }]}
            >
              <InputNumber min={0} max={100000} step={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="comments"
              label="增加评论数"
              rules={[{ required: true, message: '请输入评论数' }]}
              extra="评论较慢（每条会调用模型生成），数量大时请耐心等待后台完成"
            >
              <InputNumber min={0} max={100000} step={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        </>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Typography.Text>
              点赞 {job?.likes_done ?? 0}/{job?.likes_target ?? 0}
              {job && job.likes_failed > 0 ? `（失败 ${job.likes_failed}）` : ''}
            </Typography.Text>
            <Progress percent={likesPct} size="small" />
          </div>
          <div>
            <Typography.Text>
              评论 {job?.comments_done ?? 0}/{job?.comments_target ?? 0}
              {job && job.comments_failed > 0 ? `（失败 ${job.comments_failed}）` : ''}
            </Typography.Text>
            <Progress percent={commentsPct} size="small" />
          </div>
          {phase === 'running' ? (
            <Typography.Text type="secondary">后台执行中…可关闭本窗口，任务会继续</Typography.Text>
          ) : null}
          {phase === 'done' ? (
            <>
              <Alert
                type={job?.status === 'failed' ? 'error' : 'success'}
                showIcon
                message={
                  job?.status === 'failed'
                    ? `任务失败：${job?.error_message || '未知错误'}`
                    : '注入完成'
                }
              />
              {job?.error_message ? (
                <Typography.Text type="warning">{job.error_message}</Typography.Text>
              ) : null}
            </>
          ) : null}
        </Space>
      )}
    </Modal>
  )
}
