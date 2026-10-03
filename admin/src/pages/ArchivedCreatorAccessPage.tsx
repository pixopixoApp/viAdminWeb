import { Alert, Space, Tabs, Typography } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import CreatorApplicationsPage from './CreatorApplicationsPage'
import CreatorInvitesPage from './CreatorInvitesPage'

export default function ArchivedCreatorAccessPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const activeKey = location.pathname.endsWith('/creator-invites')
    ? 'creator-invites'
    : 'creator-applications'

  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <div>
      <Typography.Title level={4} style={{ margin: 0 }} className="page-title">已归档功能</Typography.Title>
      <Typography.Text type="secondary">创作资格机制已停用，当前登录用户可直接创作。</Typography.Text>
    </div>
    <Alert type="info" showIcon message="以下数据仅供历史查询，不能再创建、审批、发码、拒绝或撤销。" />
    <Tabs activeKey={activeKey} onChange={(key) => navigate(`/archived/${key}`)} items={[
      { key: 'creator-applications', label: '资格申请历史', children: <CreatorApplicationsPage /> },
      { key: 'creator-invites', label: '创作访问码历史', children: <CreatorInvitesPage /> },
    ]} />
  </Space>
}
