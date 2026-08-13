import { Button, Space, Switch, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import type { SaveStatus } from '../../types/interaction'
import FeedWeightInput from '../FeedWeightInput'

type Props = {
  title: string
  editing: boolean
  published: boolean
  saveLabel: string
  saveStatus: SaveStatus
  feedWeight: number
  weightSaving: boolean
  isTutorial: boolean
  tutorialSaving: boolean
  onSaveTitle: (v: string) => void
  onSaveFeedWeight: (n: number) => void
  onSaveTutorial: (b: boolean) => void
  onRetrySave: () => void
  onFinalize: () => void
  finalizing: boolean
  onStartAnnotate: () => void
  forking: boolean
  publishOptionsLength: number
  onOpenPublish: () => void
  unpublishing: boolean
  onUnpublish: () => void
}

export default function StoryHeader({
  title,
  editing,
  published,
  saveLabel,
  saveStatus,
  feedWeight,
  weightSaving,
  isTutorial,
  tutorialSaving,
  onSaveTitle,
  onSaveFeedWeight,
  onSaveTutorial,
  onRetrySave,
  onFinalize,
  finalizing,
  onStartAnnotate,
  forking,
  publishOptionsLength,
  onOpenPublish,
  unpublishing,
  onUnpublish,
}: Props) {
  return (
    <Space
      style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between', alignItems: 'flex-start' }}
      wrap
    >
      <div>
        <Typography.Title
          level={4}
          style={{ margin: 0 }}
          className="page-title"
          editable={
            editing
              ? {
                  tooltip: '点击修改标题',
                  onChange: (v) => void onSaveTitle(v),
                  triggerType: ['text', 'icon'],
                }
              : false
          }
        >
          {title}
        </Typography.Title>
        <Typography.Text type="secondary">
          <Link to="/">返回列表</Link>
          {saveLabel ? ` · ${saveLabel}` : ''}
        </Typography.Text>
        <div style={{ marginTop: 10 }}>
          <Tag color={published ? 'green' : 'blue'}>{published ? '已发布' : '待发布'}</Tag>
          <Tag>{editing ? '编辑中' : '已定稿'}</Tag>
          <Tag color="purple">故事</Tag>
        </div>
        <div style={{ marginTop: 10 }}>
          <FeedWeightInput
            value={feedWeight}
            saving={weightSaving}
            onChange={(n) => void onSaveFeedWeight(n)}
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <Space size={8} wrap>
            <Typography.Text type="secondary">教学视频</Typography.Text>
            <Switch
              checked={isTutorial}
              loading={tutorialSaving}
              onChange={(checked) => void onSaveTutorial(checked)}
            />
            <Typography.Text type="secondary">全站至多一条</Typography.Text>
          </Space>
        </div>
      </div>
      <Space wrap>
        {saveStatus === 'error' ? (
          <Button size="small" onClick={() => void onRetrySave()}>
            重试保存
          </Button>
        ) : null}
        {editing ? (
          <Button type="primary" loading={finalizing} onClick={() => void onFinalize()}>
            定稿
          </Button>
        ) : (
          <>
            <Button loading={forking} onClick={() => void onStartAnnotate()}>
              手动标注
            </Button>
            {publishOptionsLength > 0 ? (
              <Button type="primary" onClick={() => void onOpenPublish()}>
                {published ? '更新发布' : '发布'}
              </Button>
            ) : null}
            {published ? (
              <Button danger loading={unpublishing} onClick={() => void onUnpublish()}>
                下架
              </Button>
            ) : null}
          </>
        )}
      </Space>
    </Space>
  )
}