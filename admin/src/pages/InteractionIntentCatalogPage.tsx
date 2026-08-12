import { Tag, Typography } from 'antd'
import InteractionIntentCatalogCard from '../components/InteractionIntentCatalogCard'

export default function InteractionIntentCatalogPage() {
  return (
    <>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        创作意图召回目录 <Tag color="blue">新任务生效</Tag>
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        将运营常用的中英文创作表达映射到互动手势。目录按版本管理：先新建草稿、保存并校验，再激活；已完成的作品不会被改动。
      </Typography.Paragraph>
      <InteractionIntentCatalogCard />
    </>
  )
}
