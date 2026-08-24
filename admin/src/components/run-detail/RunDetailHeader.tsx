import { Button, Card, Space, Tag, Typography } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthorizedImageUrl } from '../../hooks/useAuthorizedImageUrl'

type Props = {
  displayTitle: string
  filename?: string
  coverUrl?: string
  description?: string
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
  onSaveDescription: (v: string) => void
  onEditCover: () => void
  onPublish: () => void
  onQrOpen: () => void
  onStartAnnotate: () => void
  onReanalyze: () => void
  onUnpublish: () => void
}

export default function RunDetailHeader({
  displayTitle,
  filename,
  coverUrl,
  description,
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
  onSaveDescription,
  onEditCover,
  onPublish,
  onQrOpen,
  onStartAnnotate,
  onReanalyze,
  onUnpublish,
}: Props) {
  const [coverFailed, setCoverFailed] = useState(false)
  const displayCoverUrl = useAuthorizedImageUrl(coverUrl)
  const showCover = Boolean(displayCoverUrl) && !coverFailed
  return (
    <>
      <Space
        style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between', alignItems: 'flex-start' }}
        wrap
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 0 }}>
          <div className="run-detail-cover" onClick={onEditCover} title="编辑封面">
            {showCover ? (
              <img
                src={displayCoverUrl}
                alt=""
                className="run-detail-cover-img"
                onError={() => setCoverFailed(true)}
              />
            ) : (
              <div className="run-detail-cover-empty">无封面</div>
            )}
            <div className="run-detail-cover-edit">编辑封面</div>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
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
            <Typography.Paragraph
              type="secondary"
              ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
              style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}
              editable={{
                tooltip: '点击编辑作品简介',
                onChange: (v) => void onSaveDescription(v),
                triggerType: ['text', 'icon'],
              }}
            >
              {description || '添加作品简介'}
            </Typography.Paragraph>
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