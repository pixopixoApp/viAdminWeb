import { Button, Card, Form, Input, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../api'
import { useAuth } from '../auth'

type LoginResp = {
  access_token: string
  username: string
  role: string
  display_name: string
  must_change_password: boolean
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
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
      <Card style={{ width: 380 }} title="登录 ivadmin">
        <Typography.Paragraph type="secondary">内部管理后台</Typography.Paragraph>
        <Form
          layout="vertical"
          onFinish={async (values) => {
            try {
              const data = await api<LoginResp>('/api/v1/auth/login', {
                method: 'POST',
                body: JSON.stringify(values),
              })
              setToken(data.access_token)
              await refresh()
              messageApi.success('登录成功')
              if (data.must_change_password) {
                navigate('/change-password', { replace: true })
              } else {
                navigate('/', { replace: true })
              }
            } catch (err) {
              messageApi.error(err instanceof Error ? err.message : '登录失败')
            }
          }}
        >
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  )
}
