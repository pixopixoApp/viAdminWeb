import { Avatar, Button, Card, Descriptions, Input, Modal, Select, Space, Tag, Typography } from 'antd'
import { QRCodeSVG } from 'qrcode.react'
import { RANDOM_USER_MARKER, type RunDetail, type VersionInfo, type PlaybackMetrics, type PickAccount } from '../../types/run'
import { versionOptionLabel } from '../../types/interaction'
import { formatServerTime } from '../../time'
import RunDetailSettings from './RunDetailSettings'

type Props = {
  data: RunDetail
  published: string | undefined
  businessStatus: string
  businessStatusColor: string
  generationStatus: { label: string; color: string }
  displayTitle: string
  publishOptions: VersionInfo[]
  publishVersion?: string
  publishUserId?: string
  pickAccounts: PickAccount[]
  pickLoading: boolean
  publishing: boolean
  publishOpen: boolean
  onPublish: () => void
  onPublishCancel: () => void
  onPublishVersionChange: (v: string) => void
  onPublishUserIdChange: (v: string) => void
  qrOpen: boolean
  qrUrl: string
  onQrClose: () => void
  metricsLoading: boolean
  playbackMetrics: PlaybackMetrics | null
  onRefreshMetrics: () => void
  versionInfos: VersionInfo[]
  currentVersion: string
  currentNote: string
  isManual: boolean
  busy: boolean
  switching: boolean
  onSwitchVersion: (v: string) => void
  weightSaving: boolean
  onSaveFeedWeight: (n: number) => void
  tutorialSaving: boolean
  onSaveTutorial: (b: boolean) => void
  reanalyzeOpen: boolean
  reanalyzeVersion: string
  reanalyzeModel: string
  reanalyzeBrief: string
  reanalyzeNote: string
  reanalyzing: boolean
  modelOptions: string[]
  modelsLoading: boolean
  onReanalyze: () => void
  onReanalyzeCancel: () => void
  onReanalyzeVersionChange: (v: string) => void
  onReanalyzeModelChange: (v: string) => void
  onReanalyzeBriefChange: (v: string) => void
  onReanalyzeNoteChange: (v: string) => void
}

export default function RunDetailPublish(props: Props) {
  const {
    data,
    published,
    businessStatus,
    businessStatusColor,
    generationStatus,
    displayTitle,
    publishOptions,
    publishVersion,
    publishUserId,
    pickAccounts,
    pickLoading,
    publishing,
    publishOpen,
    onPublish,
    onPublishCancel,
    onPublishVersionChange,
    onPublishUserIdChange,
    qrOpen,
    qrUrl,
    onQrClose,
    metricsLoading,
    playbackMetrics,
    onRefreshMetrics,
    versionInfos,
    currentVersion,
    currentNote,
    isManual,
    busy,
    switching,
    onSwitchVersion,
    weightSaving,
    onSaveFeedWeight,
    tutorialSaving,
    onSaveTutorial,
    reanalyzeOpen,
    reanalyzeVersion,
    reanalyzeModel,
    reanalyzeBrief,
    reanalyzeNote,
    reanalyzing,
    modelOptions,
    modelsLoading,
    onReanalyze,
    onReanalyzeCancel,
    onReanalyzeVersionChange,
    onReanalyzeModelChange,
    onReanalyzeBriefChange,
    onReanalyzeNoteChange,
  } = props

  return (
    <>
      <Card className="page-card" title="发布与推荐" size="small">
        <Descriptions column={2} size="small">
          <Descriptions.Item label="上架状态">
            <Tag color={businessStatusColor}>{businessStatus}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="生成状态">
            <Tag color={generationStatus.color}>{generationStatus.label}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="已发布版本">{published || '-'}</Descriptions.Item>
          <Descriptions.Item label="发布账号">
            {data.run.published_user_nickname || data.run.published_user_id || '-'}
            {data.run.published_user_enabled === false ? (
              <Tag color="orange" style={{ marginLeft: 8 }}>
                已停用
              </Tag>
            ) : null}
          </Descriptions.Item>
          <RunDetailSettings
            feedWeight={data.run.feed_weight ?? 0}
            weightSaving={weightSaving}
            onSaveFeedWeight={onSaveFeedWeight}
            isTutorial={Boolean(data.run.is_tutorial)}
            tutorialSaving={tutorialSaving}
            onSaveTutorial={onSaveTutorial}
          />
        </Descriptions>
      </Card>

      {published ? (
        <Card
          className="page-card"
          title="播放与分发数据"
          size="small"
          extra={
            <Button
              size="small"
              loading={metricsLoading}
              onClick={onRefreshMetrics}
            >
              刷新数据
            </Button>
          }
        >
          <Descriptions column={2} size="small">
            <Descriptions.Item label="有效播放人数">
              {metricsLoading && !playbackMetrics ? '加载中…' : playbackMetrics?.unique_view_count ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="最近有效播放">
              {playbackMetrics?.last_viewed_at
                ? formatServerTime(playbackMetrics.last_viewed_at)
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="首次有效播放">
              {playbackMetrics?.first_viewed_at
                ? formatServerTime(playbackMetrics.first_viewed_at)
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="运行事件数">
              {metricsLoading && !playbackMetrics ? '加载中…' : playbackMetrics?.telemetry_event_count ?? '—'}
            </Descriptions.Item>
          </Descriptions>
          <Typography.Paragraph type="secondary" style={{ margin: '12px 0 0' }}>
            有效播放人数只统计已登录用户在媒体实际开始播放后上报的去重记录；它用于 Feed 去重和播放计数。运行事件用于后续分析与技术排障，不作为播放量或推荐权重，也不会在此页下载逐条原始日志。
          </Typography.Paragraph>
        </Card>
      ) : null}

      <Card className="page-card" title="版本与素材" size="small">
        {versionInfos.length > 0 ? (
          <Space size="middle" wrap style={{ marginBottom: 16 }}>
            <Typography.Text type="secondary">查看版本</Typography.Text>
            <Select
              style={{ width: 200 }}
              value={currentVersion || undefined}
              loading={switching}
              options={versionInfos.map((v) => ({
                value: v.version,
                label: versionOptionLabel(v.label, v.version, published),
              }))}
              onChange={onSwitchVersion}
              disabled={busy}
            />
            <Typography.Text type="secondary">
              {isManual ? '人工标注' : 'AI 生成'}
              {currentNote ? ` · ${currentNote}` : ''}
            </Typography.Text>
          </Space>
        ) : null}
        <Descriptions column={2} size="small">
          <Descriptions.Item label="处理方式">{isManual ? '人工标注' : 'AI 生成'}</Descriptions.Item>
          <Descriptions.Item label="模型">{data.run.model_name}</Descriptions.Item>
          <Descriptions.Item label="当前版本">
            {versionInfos.find((v) => v.version === currentVersion)?.label || currentVersion || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="备注">{currentNote || '-'}</Descriptions.Item>
          <Descriptions.Item label="时长">
            {data.media.duration_ms != null
              ? `${(Number(data.media.duration_ms) / 1000).toFixed(2)}s`
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="分辨率">
            {data.media.width && data.media.height
              ? `${data.media.width}×${data.media.height}`
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="大小">
            {data.media.bytes != null
              ? `${(Number(data.media.bytes) / 1024 / 1024).toFixed(2)} MB`
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="SHA256">
            <Typography.Text code copyable={{ text: String(data.media.sha256 || '') }}>
              {data.media.sha256 ? `${String(data.media.sha256).slice(0, 16)}…` : '-'}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="创作要求" span={2}>
            {String(data.media.brief || '-')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Modal
        title={published ? '更新发布' : '发布视频'}
        open={publishOpen}
        onCancel={onPublishCancel}
        onOk={onPublish}
        confirmLoading={publishing}
        okButtonProps={{ disabled: !publishVersion || !publishUserId }}
        okText={published ? '确认更新' : '确认发布'}
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Typography.Text type="secondary">发布版本</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              placeholder="选择版本"
              value={publishVersion}
              options={publishOptions.map((v) => ({
                value: v.version,
                label: versionOptionLabel(v.label, v.version, published),
              }))}
              onChange={onPublishVersionChange}
            />
          </div>
          <div>
            <Typography.Text type="secondary">发布到</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              placeholder="选择 App 账号"
              loading={pickLoading}
              value={publishUserId}
              options={[
                {
                  value: RANDOM_USER_MARKER,
                  label: (
                    <Space size={6}>
                      <Avatar size={22}>🎲</Avatar>
                      <span>随机账号</span>
                    </Space>
                  ),
                  searchText: '随机',
                },
                ...pickAccounts.map((a) => ({
                  value: a.user_id,
                  label: (
                    <Space size={6}>
                      <Avatar size={22} src={a.avatar_absolute_url || undefined}>{a.nickname?.[0]}</Avatar>
                      <span>{a.nickname || a.user_id}</span>
                    </Space>
                  ),
                  searchText: a.nickname || a.user_id,
                })),
              ]}
              onChange={onPublishUserIdChange}
              showSearch
              filterOption={(input, option) =>
                String(option?.searchText || '')
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
            />
          </div>
          <Typography.Paragraph
            type="secondary"
            style={{ marginBottom: 0, padding: 12, background: '#f5f5f5', borderRadius: 6 }}
          >
            将《{displayTitle}》{publishVersion || '所选版本'}发布到所选 App 账号。
            Feed 权重：{data.run.feed_weight ?? 0}；教学视频：
            {data.run.is_tutorial ? '是' : '否'}（可在"发布与推荐"中修改）
          </Typography.Paragraph>
        </Space>
      </Modal>

      <Modal
        title="扫码预览"
        open={qrOpen}
        onCancel={onQrClose}
        footer={null}
        destroyOnClose
      >
        <Space direction="vertical" align="center" style={{ width: '100%' }} size="middle">
          {qrUrl ? <QRCodeSVG value={qrUrl} size={220} includeMargin /> : null}
          <Typography.Paragraph copyable style={{ marginBottom: 0, wordBreak: 'break-all' }}>
            {qrUrl}
          </Typography.Paragraph>
          <Typography.Text type="secondary">
            App 扫码后拉取详情并播放；微信等普通扫码只会打开链接看到 JSON。请用手机可访问的后台地址打开本页再扫。
          </Typography.Text>
        </Space>
      </Modal>

      <Modal
        title="重新分析"
        open={reanalyzeOpen}
        onCancel={onReanalyzeCancel}
        onOk={onReanalyze}
        confirmLoading={reanalyzing}
        okText="开始"
      >
        <Typography.Paragraph type="secondary">
          保留旧版本目录，在新版本目录中重跑。默认下一版由服务端建议。
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Typography.Text type="secondary">模型</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              showSearch
              loading={modelsLoading}
              value={reanalyzeModel || undefined}
              options={modelOptions.map((mid) => ({ value: mid, label: mid }))}
              onChange={onReanalyzeModelChange}
              placeholder="选择模型"
            />
          </div>
          <div>
            <Typography.Text type="secondary">Brief（创作者要求）</Typography.Text>
            <Input.TextArea
              style={{ marginTop: 4 }}
              rows={3}
              maxLength={500}
              showCount
              value={reanalyzeBrief}
              onChange={(e) => onReanalyzeBriefChange(e.target.value)}
              placeholder="可选，会发给分析模型"
            />
          </div>
          <div>
            <Typography.Text type="secondary">版本备注</Typography.Text>
            <Input
              style={{ marginTop: 4 }}
              maxLength={200}
              value={reanalyzeNote}
              onChange={(e) => onReanalyzeNoteChange(e.target.value)}
              placeholder="可选，仅展示在版本信息里"
            />
          </div>
          <Input
            addonBefore="版本"
            value={reanalyzeVersion}
            onChange={(e) => onReanalyzeVersionChange(e.target.value)}
            placeholder="0.0.2"
          />
        </Space>
      </Modal>
    </>
  )
}