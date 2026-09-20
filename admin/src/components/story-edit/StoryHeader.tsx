import { SettingOutlined } from '@ant-design/icons'
import { Button, Popover, Space, Switch, Tag, Typography } from 'antd'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { SaveStatus } from '../../types/interaction'
import type { StoryEditorMode } from '../../types/run'
import FeedWeightInput from '../FeedWeightInput'

type Props = {
  title: string
  editing: boolean
  published: boolean
  editorMode: StoryEditorMode
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
  finalizeDisabled?: boolean
  onStartAnnotate: () => void
  forking: boolean
  publishOptionsLength: number
  onOpenPublish: () => void
  unpublishing: boolean
  onUnpublish: () => void
  versionControl?: ReactNode
}

export default function StoryHeader({
  title,
  editing,
  published,
  editorMode,
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
  finalizeDisabled = false,
  onStartAnnotate,
  forking,
  publishOptionsLength,
  onOpenPublish,
  unpublishing,
  onUnpublish,
  versionControl,
}: Props) {
  const settings = (
    <Space direction="vertical" size="middle" style={{ width: 280 }}>
      <div>
        <Typography.Text strong>推荐权重</Typography.Text>
        <div style={{ marginTop: 8 }}>
          <FeedWeightInput
            value={feedWeight}
            saving={weightSaving}
            onChange={(value) => void onSaveFeedWeight(value)}
          />
        </div>
      </div>
      <div>
        <Space size={8} wrap>
          <Typography.Text strong>教学视频</Typography.Text>
          <Switch
            checked={isTutorial}
            loading={tutorialSaving}
            onChange={(checked) => void onSaveTutorial(checked)}
          />
        </Space>
        <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
          全站至多一条教学视频。
        </Typography.Paragraph>
      </div>
    </Space>
  )

  return (
    <Space
      className="interaction-editor-pagebar"
      style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}
      wrap
    >
      <Space size="middle">
        <Link to="/">返回列表</Link>
        <div>
          <Typography.Title
            level={4}
            style={{ margin: 0 }}
            className="page-title"
            editable={editing ? {
              tooltip: '点击修改标题',
              onChange: (value) => void onSaveTitle(value),
              triggerType: ['text', 'icon'],
            } : false}
          >
            {title}
          </Typography.Title>
          <Typography.Text type="secondary">{saveLabel || ' '}</Typography.Text>
        </div>
        <Space size={4} wrap>
          <Tag color={published ? 'green' : 'blue'}>{published ? '已发布' : '待发布'}</Tag>
          <Tag>{editing ? '编辑中' : '已定稿'}</Tag>
          <Tag color="purple">{editorMode === 'simple_abc' ? 'ABC 简化故事' : '高级故事'}</Tag>
        </Space>
        {versionControl}
      </Space>
      <Space wrap>
        <Popover placement="bottomRight" trigger="click" title="内容设置" content={settings}>
          <Button icon={<SettingOutlined />}>内容设置</Button>
        </Popover>
        {saveStatus === 'error' ? (
          <Button size="small" onClick={() => void onRetrySave()}>
            重试保存
          </Button>
        ) : null}
        {editing ? (
          <Button
            type="primary"
            loading={finalizing}
            disabled={finalizeDisabled}
            title={finalizeDisabled ? '请先完成 A、互动、B、C 的配置' : undefined}
            onClick={() => void onFinalize()}
          >
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
