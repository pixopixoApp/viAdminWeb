import { Button, Card, Form, Input, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth, type Me } from '../auth'

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { refresh, setMe } = useAuth()
  const [messageApi, contextHolder] = message.useMessage()

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(160deg, #f0f5ff 0%, #f5f5f5 45%, #e6f4ff 100%)',
      }}
    >
      {contextHolder}
      <Card style={{ width: 420 }} title="修改密码">
        <Typography.Paragraph type="secondary">
          首次登录或管理员重置后，需要设置新密码才能继续使用。
        </Typography.Paragraph>
        <Form
          layout="vertical"
          onFinish={async (values) => {
            if (values.new_password !== values.confirm_password) {
              messageApi.error('两次输入的新密码不一致')
              return
            }
            try {
              const me = await api<Me>('/api/v1/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({
                  current_password: values.current_password,
                  new_password: values.new_password,
                }),
              })
              setMe(me)
              await refresh()
              messageApi.success('密码已更新')
              navigate('/', { replace: true })
            } catch (err) {
              messageApi.error(err instanceof Error ? err.message : '修改失败')
            }
          }}
        >
          <Form.Item name="current_password" label="当前密码" rules={[{ required: true }]}>
            <Input.Password autoFocus />
          </Form.Item>
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true },
              {
                pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/,
                message: '至少 8 位，且包含字母和数字',
              },
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirm_password" label="确认新密码" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            保存并进入系统
          </Button>
        </Form>
      </Card>
    </div>
  )
}
