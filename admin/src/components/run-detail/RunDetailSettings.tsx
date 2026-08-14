import { Descriptions, Space, Switch, Typography } from 'antd'
import FeedWeightInput from '../FeedWeightInput'

type Props = {
  feedWeight: number
  weightSaving: boolean
  onSaveFeedWeight: (n: number) => void
  isTutorial: boolean
  tutorialSaving: boolean
  onSaveTutorial: (b: boolean) => void
}

export default function RunDetailSettings({
  feedWeight,
  weightSaving,
  onSaveFeedWeight,
  isTutorial,
  tutorialSaving,
  onSaveTutorial,
}: Props) {
  return (
    <>
      <Descriptions.Item label="Feed 权重" span={2}>
        <FeedWeightInput
          value={feedWeight}
          saving={weightSaving}
          showLabel={false}
          onChange={onSaveFeedWeight}
        />
      </Descriptions.Item>
      <Descriptions.Item label="教学视频" span={2}>
        <Space size={8} wrap>
          <Switch
            checked={isTutorial}
            loading={tutorialSaving}
            onChange={onSaveTutorial}
          />
          <Typography.Text type="secondary">
            全站至多一条；未看时 Feed 置顶
          </Typography.Text>
        </Space>
      </Descriptions.Item>
    </>
  )
}