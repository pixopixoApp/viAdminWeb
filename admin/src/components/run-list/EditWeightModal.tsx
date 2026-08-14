import { useEffect } from 'react'
import { Form, InputNumber, Modal, Typography } from 'antd'
import type { Run } from '../../types/run'

interface EditWeightModalProps {
  open: boolean
  run: Run | null
  onClose: () => void
  onSave: (weight: number) => Promise<void>
}

export default function EditWeightModal({
  open,
  run,
  onClose,
  onSave,
}: EditWeightModalProps) {
  const [form] = Form.useForm()
  const title = run?.title || run?.source_filename || ''

  useEffect(() => {
    if (open && run) {
      form.setFieldsValue({ weight: run.feed_weight ?? 0 })
    }
  }, [open, run, form])

  const handleOk = async () => {
    const values = await form.validateFields()
    await onSave(values.weight)
  }

  return (
    <Modal
      title="编辑权重"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="保存"
      width={420}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item>
          <Typography.Text type="secondary">内容：{title}</Typography.Text>
        </Form.Item>
        <Form.Item
          name="weight"
          label="Feed 权重"
          rules={[{ required: true, message: '请输入权重值' }]}
          extra="数值越大，Feed 位置越靠前"
        >
          <InputNumber min={0} max={1_000_000} step={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}