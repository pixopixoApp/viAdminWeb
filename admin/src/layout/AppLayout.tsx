import {
  IdcardOutlined,
  LaptopOutlined,
  LogoutOutlined,
  SettingOutlined,
  TeamOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { Button, Layout, Menu, Typography, theme } from 'antd'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api, clearToken } from '../api'
import { useAuth } from '../auth'

const { Header, Sider, Content } = Layout

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { me } = useAuth()
  const { token } = theme.useToken()
  const selected = location.pathname.startsWith('/runs/') || location.pathname === '/'
    ? '/'
    : location.pathname.startsWith('/accounts')
      ? '/accounts'
      : location.pathname

  const canStaff = me?.role === 'admin' || me?.role === 'manager'

  const menuItems = [
    {
      key: '/',
      icon: <VideoCameraOutlined />,
      label: <Link to="/">视频列表</Link>,
    },
    {
      key: '/accounts',
      icon: <IdcardOutlined />,
      label: <Link to="/accounts">账号管理</Link>,
    },
    ...(canStaff
      ? [
          {
            key: '/staff',
            icon: <TeamOutlined />,
            label: <Link to="/staff">人员管理</Link>,
          },
        ]
      : []),
    ...(me?.role === 'admin'
      ? [
          {
            key: '/settings',
            icon: <SettingOutlined />,
            label: <Link to="/settings">引擎配置</Link>,
          },
        ]
      : []),
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth={64}>
        <div style={{ color: '#fff', padding: '16px', fontWeight: 700, letterSpacing: 0.5 }}>
          ivadmin
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[selected]} items={menuItems} />
      </Sider>
      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingInline: 20,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Typography.Text type="secondary">
            <LaptopOutlined /> 互动视频管理后台
            {me ? ` · ${me.display_name || me.username}` : ''}
          </Typography.Text>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={async () => {
              try {
                await api('/api/v1/auth/logout', { method: 'POST' })
              } catch {
                /* ignore */
              }
              clearToken()
              navigate('/login')
            }}
          >
            退出
          </Button>
        </Header>
        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
