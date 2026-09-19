import {
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons'
import { Button, Layout, Menu, Switch, Tooltip, Typography, theme } from 'antd'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { clearToken } from '../api'
import { useAuth } from '../auth'
import { BrandMark } from '../components/Brand'
import { useTheme } from '../theme'
import { getAccessibleMenu } from '../config/routes'

const { Header, Sider, Content } = Layout

export function selectedMenuKey(pathname: string): string {
  // HTML imports now live under 视频列表 > 手动上传. Keep the legacy path
  // associated with 视频列表 while its redirect is resolving.
  if (
    pathname === '/' ||
    pathname === '/html-imports' ||
    pathname.startsWith('/runs/') ||
    pathname.startsWith('/stories') ||
    pathname.startsWith('/content/')
  ) {
    return '/'
  }
  return pathname
}

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { me } = useAuth()
  const { token } = theme.useToken()
  const { mode, toggle } = useTheme()
  const dark = mode === 'dark'
  const selected = selectedMenuKey(location.pathname)
  const immersiveEditor = location.pathname.startsWith('/stories/')
    || /^\/runs\/[^/]+\/annotate\//.test(location.pathname)

  const menuItems = getAccessibleMenu(me?.role).map((item) => ({
    key: item.key,
    icon: item.icon,
    label: <Link to={item.path}>{item.label}</Link>,
  }))

  return (
    <Layout className={`app-shell${immersiveEditor ? ' app-shell-editor' : ''}`} style={{ minHeight: '100vh' }}>
      {!immersiveEditor ? <Sider className="app-sider" width={232} breakpoint="lg" collapsedWidth={64}>
        <div className="sider-brand">
          <Link to="/" className="sider-brand-link" title="pixopixo 管理后台">
            <BrandMark size={30} variant={dark ? 'dark' : 'light'} className="sider-brand-mark" />
            <span className="sider-brand-text">
              <span className="sider-brand-name">pixopixo</span>
              <span className="sider-brand-kicker">ADMIN</span>
            </span>
          </Link>
        </div>
        <Menu className="app-nav" theme={dark ? 'dark' : 'light'} mode="inline" selectedKeys={[selected]} items={menuItems} />
      </Sider> : null}
      <Layout className="app-main">
        {!immersiveEditor ? <Header
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
                  await authApi.logout()
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
        </Header> : null}
        <Content className={`app-content${immersiveEditor ? ' app-content-editor' : ''}`}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
