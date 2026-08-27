import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudUploadOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  InputNumber,
  Modal,
  Radio,
  Space,
  Tag,
  Typography,
  Upload,
} from 'antd'
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  GESTURE_LABEL,
  isSustainedPlaybackInteraction,
  type Interaction,
} from '../../types/interaction'
import type {
  ClipMeta,
  SimpleStoryConfig,
  SimpleStoryRole,
  StoryState,
} from '../../types/run'

type Props = {
  story: StoryState
  config: SimpleStoryConfig
  interactions: Interaction[]
  editing: boolean
  uploadingRole: SimpleStoryRole | null
  uploadStatusText: string
  upgrading: boolean
  onUploadRole: (role: SimpleStoryRole, file: File) => Promise<boolean>
  onBranchInteractionChange: (index: number | null) => void
  onResponseWindowChange: (value: number) => void
  onFailureBehaviorChange: (value: SimpleStoryConfig['failure_behavior']) => void
  onNotice: (message: string) => void
  onUpgrade: () => void
}

type LocalRect = {
  left: number
  right: number
  top: number
  bottom: number
  centerX: number
  centerY: number
}

type ConnectorGeometry = {
  width: number
  height: number
  mainPath: string
  branchPath: string
  responsePath: string
  retryLinkPath: string
  retryPath: string
}

function localRect(element: HTMLElement, root: DOMRect): LocalRect {
  const rect = element.getBoundingClientRect()
  const left = rect.left - root.left
  const top = rect.top - root.top
  return {
    left,
    right: rect.right - root.left,
    top,
    bottom: rect.bottom - root.top,
    centerX: left + rect.width / 2,
    centerY: top + rect.height / 2,
  }
}

function point(value: number) {
  return Math.round(value * 10) / 10
}

function orthogonalPath(from: LocalRect, to: LocalRect) {
  const isBeside = to.left >= from.right - 1
    && to.top < from.bottom
    && to.bottom > from.top
  if (isBeside) {
    return `M ${point(from.right)} ${point(from.centerY)} H ${point(to.left)}`
  }
  const middleY = from.bottom + Math.max(8, (to.top - from.bottom) / 2)
  return [
    `M ${point(from.centerX)} ${point(from.bottom)}`,
    `V ${point(middleY)}`,
    `H ${point(to.centerX)}`,
    `V ${point(to.top)}`,
  ].join(' ')
}

const ROLE_INFO: Record<SimpleStoryRole, {
  title: string
  description: string
  icon: typeof PlayCircleOutlined
}> = {
  a: {
    title: '主片段 A',
    description: '故事从这里开始，可在下方添加多个互动',
    icon: PlayCircleOutlined,
  },
  b: {
    title: '成功片段 B',
    description: '挑战成功后播放，播完结束体验',
    icon: CheckCircleOutlined,
  },
  c: {
    title: '失败片段 C',
    description: '挑战失败后播放',
    icon: CloseCircleOutlined,
  },
}

function roleClip(
  story: StoryState,
  config: SimpleStoryConfig,
  role: SimpleStoryRole,
) {
  const clipId = config.roles[role]
  return clipId ? story.clip_meta.find((clip) => clip.clip_id === clipId) : undefined
}

function interactionName(interaction: Interaction, index: number) {
  const gesture = interaction.custom_action
    ? interaction.action_description || '自定义动作'
    : GESTURE_LABEL[interaction.gesture] || interaction.gesture
  return `互动 ${index + 1} · ${(interaction.gate_at_ms / 1000).toFixed(2)}s · ${gesture}`
}

function UploadNode({
  role,
  clip,
  editing,
  uploadingRole,
  onUploadRole,
}: {
  role: SimpleStoryRole
  clip?: ClipMeta
  editing: boolean
  uploadingRole: SimpleStoryRole | null
  onUploadRole: (role: SimpleStoryRole, file: File) => Promise<boolean>
}) {
  const info = ROLE_INFO[role]
  const Icon = info.icon
  const loading = uploadingRole === role
  const disabled = !editing || uploadingRole !== null
  return (
    <Upload
      className="simple-story-upload"
      accept="video/mp4,video/*"
      showUploadList={false}
      disabled={disabled}
      beforeUpload={(file) => {
        void onUploadRole(role, file)
        return false
      }}
    >
      <button
        type="button"
        disabled={disabled}
        className={`simple-story-node is-${role}${clip ? ' is-complete' : ''}`}
        aria-label={`${clip ? '替换' : '上传'}${info.title}`}
      >
        <span className="simple-story-node-role" aria-hidden="true">{role.toUpperCase()}</span>
        <span className="simple-story-node-icon"><Icon /></span>
        <span className="simple-story-node-content">
          <strong>{info.title}</strong>
          <small>{clip ? clip.source_filename : '点击上传视频'}</small>
          <span>{info.description}</span>
        </span>
        <span className="simple-story-node-action">
          <CloudUploadOutlined /> {loading ? '处理中' : clip ? '点击替换' : '点击上传'}
        </span>
      </button>
    </Upload>
  )
}

export default function SimpleStoryEditor({
  story,
  config,
  interactions,
  editing,
  uploadingRole,
  uploadStatusText,
  upgrading,
  onUploadRole,
  onBranchInteractionChange,
  onResponseWindowChange,
  onFailureBehaviorChange,
  onNotice,
  onUpgrade,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftBranchIndex, setDraftBranchIndex] = useState<number | null>(null)
  const [connectorGeometry, setConnectorGeometry] = useState<ConnectorGeometry | null>(null)
  const flowRef = useRef<HTMLElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const challengeRef = useRef<HTMLDivElement>(null)
  const responseRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLDivElement>(null)
  const failureRef = useRef<HTMLDivElement>(null)
  const retryRef = useRef<HTMLDivElement>(null)
  const retryArrowId = `simple-story-retry-arrow-${useId().replace(/:/g, '')}`
  const clips = useMemo(() => ({
    a: roleClip(story, config, 'a'),
    b: roleClip(story, config, 'b'),
    c: roleClip(story, config, 'c'),
  }), [story, config])
  const branchIndex = config.branch_interaction_index
  const branchInteraction = branchIndex == null ? null : interactions[branchIndex] || null
  const branchConfigured = Boolean(
    branchInteraction && !isSustainedPlaybackInteraction(branchInteraction),
  )
  const retryEnabled = config.failure_behavior === 'retry_previous_point'

  useLayoutEffect(() => {
    const flow = flowRef.current
    const main = mainRef.current
    const challenge = challengeRef.current
    const response = responseRef.current
    const success = successRef.current
    const failure = failureRef.current
    const retry = retryRef.current
    if (!flow || !main || !challenge || !response || !success || !failure || !retry) return

    let frame = 0
    const measure = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const root = flow.getBoundingClientRect()
        const mainBox = localRect(main, root)
        const challengeBox = localRect(challenge, root)
        const responseBox = localRect(response, root)
        const successBox = localRect(success, root)
        const failureBox = localRect(failure, root)
        const retryBox = localRect(retry, root)
        const width = point(root.width)
        const height = point(root.height)
        const compact = width < 720

        const mainMiddleY = mainBox.bottom
          + Math.max(8, (challengeBox.top - mainBox.bottom) / 2)
        const mainPath = [
          `M ${point(mainBox.centerX)} ${point(mainBox.bottom)}`,
          `V ${point(mainMiddleY)}`,
          `H ${point(challengeBox.centerX)}`,
          `V ${point(challengeBox.top)}`,
        ].join(' ')

        let branchPath = ''
        if (!compact) {
          const resultTop = Math.min(successBox.top, failureBox.top)
          const responseIsBelow = responseBox.top >= challengeBox.bottom - 1
          const branchFloor = responseIsBelow
            ? responseBox.bottom + 18
            : challengeBox.bottom
          const branchRoom = Math.max(24, resultTop - branchFloor)
          const splitY = branchFloor + Math.min(46, Math.max(24, branchRoom * 0.42))
          branchPath = [
            `M ${point(challengeBox.centerX)} ${point(challengeBox.bottom)} V ${point(splitY)}`,
            `M ${point(successBox.centerX)} ${point(splitY)} H ${point(failureBox.centerX)}`,
            `M ${point(successBox.centerX)} ${point(splitY)} V ${point(successBox.top)}`,
            `M ${point(failureBox.centerX)} ${point(splitY)} V ${point(failureBox.top)}`,
          ].join(' ')
        }

        const responsePath = compact ? '' : orthogonalPath(challengeBox, responseBox)
        const retryLinkPath = compact ? '' : orthogonalPath(failureBox, retryBox)
        let retryPath = ''
        const retryIsBesideFailure = retryBox.left >= failureBox.right - 1
        if (retryEnabled && !compact && retryIsBesideFailure) {
          const startX = retryBox.centerX
          const startY = retryBox.bottom
          const endX = challengeBox.right - Math.min(76, challengeBox.right - challengeBox.centerX)
          const endY = challengeBox.bottom + 1
          const controlX = Math.min(width - 18, Math.max(startX + 54, retryBox.right + 30))
          const lowerY = Math.min(
            height - 18,
            Math.max(startY + 44, failureBox.bottom + 58),
          )
          retryPath = [
            `M ${point(startX)} ${point(startY)}`,
            `C ${point(controlX)} ${point(lowerY)}`,
            `${point(controlX)} ${point(endY + 76)}`,
            `${point(endX)} ${point(endY)}`,
          ].join(' ')
        }

        const next = {
          width,
          height,
          mainPath,
          branchPath,
          responsePath,
          retryLinkPath,
          retryPath,
        }
        setConnectorGeometry((previous) => (
          previous && JSON.stringify(previous) === JSON.stringify(next) ? previous : next
        ))
      })
    }

    const observer = new ResizeObserver(measure)
    ;[flow, main, challenge, response, success, failure, retry].forEach((element) => {
      observer.observe(element)
    })
    window.addEventListener('resize', measure)
    measure()
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [retryEnabled])

  function openBranchPicker() {
    if (!interactions.length) {
      onNotice('请在下方为主片段 A 添加互动节点后再配置挑战节点')
      return
    }
    const eligible = interactions
      .map((interaction, index) => ({ interaction, index }))
      .filter(({ interaction }) => !isSustainedPlaybackInteraction(interaction))
    if (!eligible.length) {
      onNotice('持续播放类互动不能作为分支挑战，请先在下方添加其他互动节点')
      return
    }
    const initial = branchConfigured
      ? branchIndex
      : eligible[eligible.length - 1].index
    if (!branchConfigured) onBranchInteractionChange(initial)
    setDraftBranchIndex(initial)
    setPickerOpen(true)
  }

  const draftHasLaterInteractions =
    draftBranchIndex != null && draftBranchIndex < interactions.length - 1

  return (
    <Card
      className="page-card simple-story-workbench"
      title="简化分支流程"
      extra={(
        <Space>
          <Tag color={config.complete ? 'success' : 'warning'}>
            {config.complete ? '配置完整' : '待完善'}
          </Tag>
          {editing ? (
            <Button size="small" loading={upgrading} onClick={onUpgrade}>
              升级到高级模式
            </Button>
          ) : null}
        </Space>
      )}
    >
      <Typography.Paragraph type="secondary" className="simple-story-intro">
        点击 A、B、C 卡片直接上传或替换视频；点击分支挑战选择 A 中负责跳转的互动。
      </Typography.Paragraph>

      <section ref={flowRef} className="simple-story-flow" aria-label="A 成功失败分支流程">
        {connectorGeometry ? (
          <svg
            className="simple-story-connector-layer"
            viewBox={`0 0 ${connectorGeometry.width} ${connectorGeometry.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <marker
                id={retryArrowId}
                viewBox="0 0 10 10"
                markerWidth="7"
                markerHeight="7"
                refX="8"
                refY="5"
                orient="auto"
              >
                <path className="simple-story-retry-arrow" d="M 0 0 L 10 5 L 0 10 Z" />
              </marker>
            </defs>
            <path className="is-structure" d={connectorGeometry.mainPath} />
            {connectorGeometry.branchPath ? (
              <path className="is-structure" d={connectorGeometry.branchPath} />
            ) : null}
            {connectorGeometry.responsePath ? (
              <path className="is-setting" d={connectorGeometry.responsePath} />
            ) : null}
            {connectorGeometry.retryLinkPath ? (
              <path className="is-setting" d={connectorGeometry.retryLinkPath} />
            ) : null}
            {connectorGeometry.retryPath ? (
              <path
                className="is-retry"
                d={connectorGeometry.retryPath}
                markerEnd={`url(#${retryArrowId})`}
              />
            ) : null}
          </svg>
        ) : null}

        <div className="simple-story-center-row is-main-row">
          <div ref={mainRef} className="simple-story-flow-a">
            <UploadNode
              role="a"
              clip={clips.a}
              editing={editing}
              uploadingRole={uploadingRole}
              onUploadRole={onUploadRole}
            />
          </div>
        </div>

        <div className="simple-story-center-row is-challenge-row">
          <div ref={challengeRef} className="simple-story-challenge">
            <button
              type="button"
              disabled={!editing}
              className={`simple-story-node is-interaction${branchConfigured ? ' is-complete' : ''}`}
              onClick={openBranchPicker}
            >
              <span className="simple-story-node-role" aria-hidden="true"><ThunderboltOutlined /></span>
              <span className="simple-story-node-icon"><ThunderboltOutlined /></span>
              <span className="simple-story-node-content">
                <strong>分支挑战</strong>
                <small>
                  {branchInteraction
                    ? interactionName(branchInteraction, branchIndex || 0)
                    : '点击选择主片段 A 中的互动节点'}
                </small>
                <span>成功播放 B，失败播放 C</span>
              </span>
              <span className="simple-story-node-action">
                {branchConfigured ? '点击更换' : '待配置'}
              </span>
            </button>
          </div>

          <div
            ref={responseRef}
            className="simple-story-side-setting is-response"
            role="group"
            aria-label="用户响应时间设置"
          >
            <span>用户响应时间</span>
            <InputNumber
              min={0.1}
              max={60}
              step={0.5}
              precision={1}
              addonAfter="秒"
              aria-label="用户响应时间（秒）"
              disabled={!editing}
              value={Number((config.response_window_ms / 1000).toFixed(1))}
              onChange={(value) => onResponseWindowChange(
                Math.max(100, Math.round(Number(value || 0.1) * 1000)),
              )}
            />
            <small>仅作用于分支挑战节点</small>
          </div>
        </div>

        <div className="simple-story-results-row">
          <div className="simple-story-results">
            <div className="simple-story-result-slot is-success">
              <span className="simple-story-result-label">成功</span>
              <div ref={successRef} className="simple-story-result-node">
                <UploadNode
                  role="b"
                  clip={clips.b}
                  editing={editing}
                  uploadingRole={uploadingRole}
                  onUploadRole={onUploadRole}
                />
              </div>
            </div>
            <div className="simple-story-result-slot is-failure">
              <span className="simple-story-result-label">失败</span>
              <div ref={failureRef} className="simple-story-result-node">
                <UploadNode
                  role="c"
                  clip={clips.c}
                  editing={editing}
                  uploadingRole={uploadingRole}
                  onUploadRole={onUploadRole}
                />
              </div>
            </div>
          </div>

          <div
            ref={retryRef}
            className="simple-story-side-setting is-retry"
            role="group"
            aria-label="失败片段播放完成后的行为"
          >
            <Checkbox
              checked={retryEnabled}
              disabled={!editing}
              onChange={(event) => onFailureBehaviorChange(
                event.target.checked ? 'retry_previous_point' : 'end',
              )}
            >
              失败后重试
            </Checkbox>
            <small>{retryEnabled ? 'C 播完返回挑战前' : 'C 播完结束体验'}</small>
          </div>
        </div>
      </section>

      {uploadingRole && uploadStatusText ? (
        <Typography.Text className="simple-story-upload-status" type="secondary" aria-live="polite">
          {uploadStatusText}
        </Typography.Text>
      ) : null}

      {!config.complete && config.issues.length ? (
        <Alert
          className="simple-story-issues"
          type="warning"
          showIcon
          role="alert"
          message="完成以下内容后即可定稿"
          description={(
            <ul>{config.issues.slice(0, 5).map((issue) => <li key={issue}>{issue}</li>)}</ul>
          )}
        />
      ) : null}

      <Modal
        title="选择分支挑战节点"
        open={pickerOpen}
        okText="确认选择"
        cancelText="取消"
        okButtonProps={{
          disabled:
            draftBranchIndex == null ||
            isSustainedPlaybackInteraction(interactions[draftBranchIndex]),
        }}
        onCancel={() => setPickerOpen(false)}
        onOk={() => {
          onBranchInteractionChange(draftBranchIndex)
          setPickerOpen(false)
        }}
      >
        <Typography.Paragraph type="secondary">
          A 可包含多个互动，但只有一个互动负责成功 / 失败分支。持续滑动或持续点击仍可正常使用，但不能承担分支。
        </Typography.Paragraph>
        <Radio.Group
          className="simple-story-interaction-picker"
          value={draftBranchIndex}
          onChange={(event) => setDraftBranchIndex(event.target.value)}
        >
          {interactions.map((interaction, index) => {
            const continuous = isSustainedPlaybackInteraction(interaction)
            return (
              <Radio key={`${interaction.gate_at_ms}-${index}`} value={index} disabled={continuous}>
                <span>{interactionName(interaction, index)}</span>
                {continuous ? <Tag>持续播放类不可选</Tag> : null}
              </Radio>
            )
          })}
        </Radio.Group>
        {draftHasLaterInteractions ? (
          <Alert
            type="warning"
            showIcon
            message="该互动之后还有节点"
            description="分支挑战完成后会立即离开 A，因此时间轴中更晚的互动不会被执行。"
          />
        ) : null}
      </Modal>
    </Card>
  )
}
