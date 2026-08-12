import { Typography } from 'antd'
import AppVersionPolicyCard from '../components/AppVersionPolicyCard'

export default function AppVersionPolicyPage() {
  return (
    <>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        App 更新策略
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        配置客户端检查更新时使用的版本、下载地址和更新说明。请先上传并验签安装包，再启用对应平台的策略。
      </Typography.Paragraph>
      <AppVersionPolicyCard />
    </>
  )
}
