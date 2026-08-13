import { Modal, Space, Typography } from 'antd'
import type { Run } from '../../types/run'

interface ReviewRunModalProps {
  open: boolean
  run: Run | null
  onClose: () => void
  onApprove: () => Promise<void>
  onReject: () => Promise<void>
}

export default function ReviewRunModal({
  open,
  run,
  onClose,
  onApprove,
  onReject,
}: ReviewRunModalProps) {
  const title = run?.title || run?.source_filename || ''

  return (
    <Modal
      title="审核内容"
      open={open}
      onCancel={onClose}
      okText="通过"
      cancelText="拒绝"
      okButtonProps={{ danger: false }}
      cancelButtonProps={{ danger: true }}
      onOk={onApprove}
      confirmLoading={false}
      width={480}
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Typography.Text>
          确定要通过以下内容的审核吗？
        </Typography.Text>
        <Typography.Text strong>{title}</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          通过后内容将标记为「已发布」状态。
        </Typography.Text>
      </Space>
    </Modal>
  )
}