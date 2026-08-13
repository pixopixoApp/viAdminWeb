import { Button, Card, Space, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'

type Props = {
  displayTitle: string
  filename?: string
  errorMessage?: string
  businessStatus: string
  businessStatusColor: string
  generationStatus: { label: string; color: string }
  publishedAccountDisabled?: boolean
  publishVisible: boolean
  actionDisabled: boolean
  canPlay: boolean
  qrUrl: string
  annotating: boolean
  annotateDisabled: boolean
  engineReady: boolean
  reanalyzeDisabled: boolean
  unpublishing: boolean
  published: boolean
  onSaveTitle: (v: string) => void
  onPublish: () => void
  onQrOpen: () => void
  onStartAnnotate: () => void
  onReanalyze: () => void
  onUnpublish: () => void
}

export default function RunDetailHeader({
  displayTitle,
  filename,
  errorMessage,
  businessStatus,
  businessStatusColor,
  generationStatus,
  publishedAccountDisabled,
  publishVisible,
  actionDisabled,
  canPlay,
  qrUrl,
  annotating,
  annotateDisabled,
  engineReady,
  reanalyzeDisabled,
  unpublishing,
  published,
  onSaveTitle,
  onPublish,
  onQrOpen,
  onStartAnnotate,
  onReanalyze,
  onUnpublish,
}: Props) {
  return (
    <>
      <Space
        style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between', alignItems: 'flex-start' }}
        wrap
      >
        <div>
          <Typography.Title
            level={4}
            style={{ margin: 0 }}
            editable={{
              tooltip: '点击修改标题',
              onChange: (v) => void onSaveTitle(v),
              triggerType: ['text', 'icon'],
            }}
          >
            {displayTitle}
          </Typography.Title>
          <Typography.Text type="secondary">
            <Link to="/">返回列表</Link>
            {filename ? ` · 文件 ${filename}` : ''}
          </Typography.Text>
          <div style={{ marginTop: 10 }}>
            <Tag color={businessStatusColor}>{businessStatus}</Tag>
            <Tag color={generationStatus.color}>{generationStatus.label}</Tag>
            {publishedAccountDisabled ? (
              <Tag color="orange">发布账号已停用</Tag>
            ) : null}
          </div>
        </div>
        <Space wrap>
          {publishVisible ? (
            <Button type="primary" disabled={actionDisabled} onClick={onPublish}>
              {published ? '更新发布' : '发布'}
            </Button>
          ) : null}
          <Button disabled={!canPlay || !qrUrl} onClick={onQrOpen}>
            扫码预览
          </Button>
          <Button
            disabled={annotateDisabled}
            loading={annotating}
            onClick={onStartAnnotate}
          >
            手动标注
          </Button>
          <Button disabled={reanalyzeDisabled || !engineReady} onClick={onReanalyze}>
            重新分析
          </Button>
          {published ? (
            <Button danger loading={unpublishing} onClick={onUnpublish}>
              下架
            </Button>
          ) : null}
        </Space>
      </Space>

      {errorMessage ? (
        <Card className="page-card" title="错误" size="small">
          <Typography.Text type="danger">{errorMessage}</Typography.Text>
        </Card>
      ) : null}
    </>
  )
}