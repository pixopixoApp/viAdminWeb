import { Button, Card, Form, InputNumber, Modal, Space, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import {
  getReferralRewardPolicy,
  saveReferralRewardPolicy,
  type ReferralRewardPolicy,
} from '../services/api'

type FormValues = {
  inviter_activation_reward_credits: number
  invitee_registration_reward_credits: number
}

export default function ReferralRewardsPage({ embedded = false }: { embedded?: boolean }) {
  const { me } = useAuth()
  const [form] = Form.useForm<FormValues>()
  const [policy, setPolicy] = useState<ReferralRewardPolicy | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const canEdit = me?.role === 'admin' || me?.role === 'manager'

  async function load() {
    setLoading(true)
    try {
      const data = await getReferralRewardPolicy()
      setPolicy(data)
      form.setFieldsValue(data)
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function confirmSave(values: FormValues) {
    if (!policy || !canEdit) return
    Modal.confirm({
      title: '确认修改邀请奖励？',
      content: (
        <Space direction="vertical" size={4}>
          <Typography.Text>
            邀请成功奖励：{policy.inviter_activation_reward_credits} → {values.inviter_activation_reward_credits}
          </Typography.Text>
          <Typography.Text>
            被邀请注册奖励：{policy.invitee_registration_reward_credits} → {values.invitee_registration_reward_credits}
          </Typography.Text>
        </Space>
      ),
      okText: '确认保存',
      cancelText: '取消',
      onOk: async () => {
        setSaving(true)
        try {
          const data = await saveReferralRewardPolicy(values)
          setPolicy(data)
          form.setFieldsValue(data)
          messageApi.success('邀请奖励已更新')
        } catch (error) {
          messageApi.error(error instanceof Error ? error.message : '保存失败')
          throw error
        } finally {
          setSaving(false)
        }
      },
    })
  }

  return (
    <>
      {contextHolder}
      {!embedded ? (
        <Typography.Title level={4} style={{ marginTop: 0 }} className="page-title">
          邀请奖励
        </Typography.Title>
      ) : null}
      <Typography.Paragraph type="secondary">
        新邀请关系会锁定保存时的奖励金额；修改不会影响已经注册的邀请关系。
        邀请奖励不控制创作权限；设置为 0 仅停止奖励，不关闭邀请链路。
      </Typography.Paragraph>
      <Card className="page-card" loading={loading}>
        <Form form={form} layout="vertical" onFinish={confirmSave} style={{ maxWidth: 480 }}>
          <Form.Item
            name="inviter_activation_reward_credits"
            label="邀请成功奖励"
            rules={[{ required: true, message: '请输入 0–1000 的整数' }]}
          >
            <InputNumber min={0} max={1000} precision={0} addonAfter="Credits" disabled={!canEdit} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="invitee_registration_reward_credits"
            label="被邀请注册奖励"
            rules={[{ required: true, message: '请输入 0–1000 的整数' }]}
          >
            <InputNumber min={0} max={1000} precision={0} addonAfter="Credits" disabled={!canEdit} style={{ width: '100%' }} />
          </Form.Item>
          {policy ? (
            <Typography.Paragraph type="secondary">
              最后修改：{policy.updated_by} · {new Date(policy.updated_at).toLocaleString()} · 版本 {policy.version}
            </Typography.Paragraph>
          ) : null}
          {canEdit ? (
            <Button type="primary" htmlType="submit" loading={saving}>保存</Button>
          ) : (
            <Typography.Text type="secondary">当前账号为只读权限。</Typography.Text>
          )}
        </Form>
      </Card>
    </>
  )
}
