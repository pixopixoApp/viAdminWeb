import {
  IdcardOutlined,
  KeyOutlined,
  BulbOutlined,
  CloudDownloadOutlined,
  SettingOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  Html5Outlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import type { ReactElement } from 'react'

export type RoutePermission = 'public' | 'authenticated' | 'operator' | 'admin'

export type MenuItemConfig = {
  key: string
  icon: ReactElement
  label: string
  permission: RoutePermission
  path: string
}

export const menuConfig: MenuItemConfig[] = [
  {
    key: '/',
    path: '/',
    label: '视频列表',
    icon: <VideoCameraOutlined />,
    permission: 'authenticated',
  },
  {
    key: '/accounts',
    path: '/accounts',
    label: '账号管理',
    icon: <IdcardOutlined />,
    permission: 'authenticated',
  },
  {
    key: '/creator-invites',
    path: '/creator-invites',
    label: '创作兑换码',
    icon: <KeyOutlined />,
    permission: 'operator',
  },
  {
    key: '/moderation',
    path: '/moderation',
    label: '内容安全',
    icon: <SafetyCertificateOutlined />,
    permission: 'operator',
  },
  {
    key: '/html-imports',
    path: '/html-imports',
    label: 'HTML 内容',
    icon: <Html5Outlined />,
    permission: 'operator',
  },
  {
    key: '/staff',
    path: '/staff',
    label: '人员管理',
    icon: <TeamOutlined />,
    permission: 'operator',
  },
  {
    key: '/interaction-intents',
    path: '/interaction-intents',
    label: '创作意图目录',
    icon: <BulbOutlined />,
    permission: 'admin',
  },
  {
    key: '/app-versions',
    path: '/app-versions',
    label: 'App 更新策略',
    icon: <CloudDownloadOutlined />,
    permission: 'admin',
  },
  {
    key: '/settings',
    path: '/settings',
    label: '引擎配置',
    icon: <SettingOutlined />,
    permission: 'admin',
  },
]

export function hasMenuAccess(role: string | null | undefined, permission: RoutePermission): boolean {
  if (permission === 'public') return true
  if (permission === 'authenticated') return !!role
  if (permission === 'operator') return role === 'admin' || role === 'manager'
  if (permission === 'admin') return role === 'admin'
  return false
}

export function getAccessibleMenu(role: string | null | undefined) {
  return menuConfig.filter((item) => hasMenuAccess(role, item.permission))
}
