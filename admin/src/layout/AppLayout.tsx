import {
  IdcardOutlined,
  KeyOutlined,
  LogoutOutlined,
  BulbOutlined,
  CloudDownloadOutlined,
  SettingOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  Html5Outlined,
  VideoCameraOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons'
import { Button, Layout, Menu, Switch, Tooltip, Typography, theme } from 'antd'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api, clearToken } from '../api'
import { useAuth } from '../auth'
import { BrandMark } from '../components/Brand'
import { useTheme } from '../theme'

const { Header, Sider, Content } = Layout

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { me } = useAuth()
  const { token } = theme.useToken()
  const { mode, toggle } = useTheme()
  const dark = mode === 'dark'
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
            key: '/creator-invites',
            icon: <KeyOutlined />,
            label: <Link to="/creator-invites">创作兑换码</Link>,
          },
          {
            key: '/moderation',
            icon: <SafetyCertificateOutlined />,
            label: <Link to="/moderation">内容安全</Link>,
          },
          {
            key: '/html-imports',
            icon: <Html5Outlined />,
            label: <Link to="/html-imports">HTML 内容</Link>,
          },
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
            key: '/interaction-intents',
            icon: <BulbOutlined />,
            label: <Link to="/interaction-intents">创作意图目录</Link>,
          },
          {
            key: '/app-versions',
            icon: <CloudDownloadOutlined />,
            label: <Link to="/app-versions">App 更新策略</Link>,
          },
          {
            key: '/settings',
            icon: <SettingOutlined />,
            label: <Link to="/settings">引擎配置</Link>,
          },
        ]
      : []),
  ]

  return (
    <Layout className="app-shell" style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth={64}>
        <div className="sider-brand">
          <Link to="/" className="sider-brand-link" title="pixopixo 管理后台">
            <BrandMark size={30} variant={dark ? 'dark' : 'light'} className="sider-brand-mark" />
            <span className="sider-brand-text">
              <span className="sider-brand-name">pixopixo</span>
              <span className="sider-brand-kicker">ADMIN</span>
            </span>
          </Link>
        </div>
        <Menu theme={dark ? 'dark' : 'light'} mode="inline" selectedKeys={[selected]} items={menuItems} />
      </Sider>
      <Layout className="app-main">
        <Header
          className="app-header"
          style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}
        >
          <div className="app-header-title">
            <span className="app-header-live" />
            <Typography.Text strong>互动视频管理后台</Typography.Text>
            {me ? (
              <>
                <span className="app-header-divider" />
                <Typography.Text type="secondary">
                  {me.display_name || me.username}
                </Typography.Text>
              </>
            ) : null}
          </div>
          <div className="app-header-actions">
            <Tooltip title={dark ? '切换到浅色模式' : '切换到深色模式'}>
              <Switch
                checked={dark}
                checkedChildren={<MoonOutlined />}
                unCheckedChildren={<SunOutlined />}
                onChange={toggle}
              />
            </Tooltip>
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
          </div>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
