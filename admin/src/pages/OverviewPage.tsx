import {
  AuditOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  ExclamationCircleOutlined,
  FileDoneOutlined,
  IdcardOutlined,
  KeyOutlined,
  LoadingOutlined,
  ReloadOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Row,
  Space,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { overviewApi } from '../services/api'
import type { Overview } from '../types/overview'

function StatCard({
  title,
  value,
  suffix,
  color,
  icon,
  loading,
}: {
  title: string
  value?: number | string
  suffix?: string
  color?: string
  icon?: React.ReactNode
  loading?: boolean
}) {
  return (
    <Card size="small" loading={loading}>
      <Statistic
        title={
          <Space size={6}>
            {icon}
            {title}
          </Space>
        }
        value={value ?? (loading ? '…' : '-')}
        suffix={suffix}
        valueStyle={color ? { color } : undefined}
      />
    </Card>
  )
}

export default function OverviewPage() {
  const { me } = useAuth()
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    try {
      const result = await overviewApi.get()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载概览失败')
      messageApi.error(err instanceof Error ? err.message : '加载概览失败')
    } finally {
      setLoading(false)
      setReloading(false)
    }
  }, [messageApi])

  useEffect(() => {
    void load()
  }, [load])

  const refresh = useCallback(() => {
    setReloading(true)
    void load()
  }, [load])

  const name = me?.display_name || me?.username || ''
  const hour = new Date().getHours()
  const greet = hour < 6 ? '夜深了' : hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好'

  // B: 待处理/快捷入口
  const todoItems: Array<{ key: string; label: string; value?: number; path: string; icon: React.ReactNode; color: string } | null> = [
    {
      key: 'pending_review',
      label: '待审核内容',
      value: data?.published_content?.pending,
      path: '/',
      icon: <AuditOutlined />,
      color: 'gold',
    },
    data?.moderation ? {
      key: 'moderation',
      label: '待处理举报',
      value: data.moderation.pending,
      path: '/moderation',
      icon: <SafetyCertificateOutlined />,
      color: 'volcano',
    } : null,
    data?.creator_applications ? {
      key: 'creator_app',
      label: '创作权限申请',
      value: data.creator_applications.pending,
      path: '/creator-applications',
      icon: <FileDoneOutlined />,
      color: 'blue',
    } : null,
    data?.creator_invites ? {
      key: 'creator_invite',
      label: '未兑换创作码',
      value: data.creator_invites.unused,
      path: '/creator-invites',
      icon: <KeyOutlined />,
      color: 'cyan',
    } : null,
    data?.runs ? {
      key: 'attention',
      label: '需关注视频',
      value: data.runs.attention,
      path: '/',
      icon: <WarningOutlined />,
      color: 'red',
    } : null,
    data?.seedance ? {
      key: 'seedance_active',
      label: 'AI生成中',
      value: data.seedance.active,
      path: '/seedance',
      icon: <ThunderboltOutlined />,
      color: 'purple',
    } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; value?: number; path: string; icon: React.ReactNode; color: string }>

  return (
    <>
      {contextHolder}
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
        <Space align="baseline">
          <Typography.Title level={4} style={{ margin: 0 }} className="page-title">
            概览
          </Typography.Title>
          {name ? (
            <Typography.Text type="secondary">{greet}，{name}</Typography.Text>
          ) : null}
        </Space>
        <Button icon={<ReloadOutlined />} loading={reloading} onClick={refresh}>
          刷新
        </Button>
      </Space>

      {error ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="部分数据未能加载"
          description={error}
          action={<Button size="small" onClick={refresh}>重试</Button>}
        />
      ) : null}

      {/* A: 关键数字 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={6} lg={4}>
          <StatCard title="处理中视频" value={data?.runs.processing} icon={<LoadingOutlined />} color="#1677ff" loading={loading} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <StatCard title="待发布" value={data?.runs.ready_unpublished} icon={<RocketOutlined />} color="#722ed1" loading={loading} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <StatCard title="已发布" value={data?.runs.published} icon={<CheckCircleOutlined />} color="#52c41a" loading={loading} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <StatCard title="处理失败" value={data?.runs.failed} icon={<ExclamationCircleOutlined />} color="#ff4d4f" loading={loading} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <StatCard title="我名下账号" value={data?.accounts.mine} icon={<IdcardOutlined />} loading={loading} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <StatCard title="视频总数" value={data?.runs.total} icon={<VideoCameraOutlined />} loading={loading} />
        </Col>
      </Row>

      {/* C: 系统健康 */}
      <Card
        size="small"
        title={
          <Space><span>系统健康</span>
            {loading ? <LoadingOutlined spin /> : (
              data?.engine.ready === false ? <Tag color="orange">引擎未配置</Tag> : <Tag color="green">正常</Tag>
            )}
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} lg={6}>
            <StatCard title="引擎状态" value={loading ? '…' : data?.engine.ready ? '就绪' : '未配置'} icon={<CloudUploadOutlined />} color={data?.engine.ready ? '#52c41a' : '#fa8c16'} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard title="AI生成任务(活跃)" value={data?.seedance.active} icon={<ThunderboltOutlined />} />
          </Col>
          {data?.manual_uploads ? (
            <>
              <Col xs={24} sm={12} lg={6}>
                <StatCard title="手动上传(进行中)" value={data.manual_uploads.active} icon={<CloudUploadOutlined />} />
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <StatCard title="手动上传(累计)" value={data.manual_uploads.total} icon={<CloudUploadOutlined />} />
              </Col>
            </>
          ) : null}
        </Row>
      </Card>

      {/* B: 待处理队列 */}
      <Card size="small" title="待处理队列" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          {todoItems.map((item) => (
            <Col xs={12} sm={8} md={6} lg={4} key={item.key}>
              <Link to={item.path}>
                <Card hoverable size="small">
                  <Statistic
                    title={<Space size={6}><span style={{ color: item.color }}>{item.icon}</span>{item.label}</Space>}
                    value={item.value ?? 0}
                    valueStyle={{ color: item.value ? item.color : undefined }}
                  />
                </Card>
              </Link>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 管理员专属模块概览 */}
      {data ? (
        <Row gutter={[12, 12]}>
          {data.published_content ? (
            <Col xs={24} md={12} xl={8}>
              <Card size="small" title={<Space><SafetyCertificateOutlined /> 已发布内容</Space>}>
                <Space size="large" wrap>
                  <Statistic title="全部" value={data.published_content.total} />
                  <Statistic title="待审核" value={data.published_content.pending} valueStyle={{ color: '#faad14' }} />
                  <Statistic title="已通过" value={data.published_content.approved} valueStyle={{ color: '#52c41a' }} />
                  <Statistic title="已拒绝" value={data.published_content.rejected} valueStyle={{ color: '#ff4d4f' }} />
                </Space>
              </Card>
            </Col>
          ) : null}
          {data.accounts.all ? (
            <Col xs={24} md={12} xl={8}>
              <Card size="small" title={<Space><IdcardOutlined /> 账号</Space>}>
                <Space size="large" wrap>
                  <Statistic title="全部" value={data.accounts.all.total} />
                  <Statistic title="停用" value={data.accounts.all.disabled} valueStyle={{ color: '#ff4d4f' }} />
                  <Statistic title="我名下" value={data.accounts.mine} />
                </Space>
              </Card>
            </Col>
          ) : null}
          {data.staff ? (
            <Col xs={24} md={12} xl={8}>
              <Card size="small" title={<Space><TeamOutlined /> 后台人员</Space>}>
                <Space size="large" wrap>
                  <Statistic title="全部" value={data.staff.total} />
                  <Statistic title="启用" value={data.staff.enabled} valueStyle={{ color: '#52c41a' }} />
                  <Statistic title="运营" value={data.staff.operators} />
                  <Statistic title="停用" value={data.staff.disabled} valueStyle={{ color: '#ff4d4f' }} />
                </Space>
              </Card>
            </Col>
          ) : null}
        </Row>
      ) : null}

      {data && !data.staff && !data.accounts.all && !data.published_content && !data.moderation && !data.creator_applications ? (
        <Divider plain>
          <Typography.Text type="secondary">当前账号（运营）仅展示本人相关数据，管理/审核功能请由管理员账号查看。</Typography.Text>
        </Divider>
      ) : null}
    </>
  )
}
