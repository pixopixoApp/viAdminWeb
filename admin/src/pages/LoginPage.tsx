import { Button, Card, Form, Input, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../api'
import { useAuth } from '../auth'
import { BrandMark } from '../components/Brand'
import { BRAND_KICKER, BRAND_SLOGAN } from '../brand'

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
    <div className="auth-page">
      {contextHolder}
      <Card className="auth-card auth-card-split">
        <div className="auth-card-grid">
          <div className="auth-brand-panel">
            <div className="auth-brand-top">
              <BrandMark size={44} variant="dark" animated />
              <div className="auth-brand-text">
                <span className="auth-panel-wordmark">pixopixo</span>
                <span className="auth-kicker">{BRAND_KICKER}</span>
              </div>
            </div>
            <div>
              <div className="auth-panel-slogan">
                {BRAND_SLOGAN.replace(' Playable.', '')}{' '}
                <span className="auth-slogan-highlight">Playable.</span>
              </div>
              <div className="auth-panel-note">互动视频管理后台 · 内容审核与互动编排</div>
            </div>
          </div>
          <div className="auth-form-panel">
            <Typography.Title level={3} className="auth-form-title">
              登录管理后台
            </Typography.Title>
            <Typography.Paragraph type="secondary" className="auth-desc">
              内部管理后台，请使用账号登录
            </Typography.Paragraph>
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
              <Button type="primary" htmlType="submit" block size="large">
                登录
              </Button>
            </Form>
            <div className="auth-footer">PIXOPIXO · INTERNAL ADMIN</div>
          </div>
        </div>
      </Card>
    </div>
  )
}
