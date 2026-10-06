import { Card, Modal, Space, Switch, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import {
  getSocialSeedPreview,
  saveSocialSeedPreview,
  type SocialSeedPreviewSetting,
} from '../services/api'

export default function SocialSeedPreviewCard() {
  const { me } = useAuth()
  const [setting, setSetting] = useState<SocialSeedPreviewSetting | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const canEdit = me?.role === 'admin' || me?.role === 'manager'

  async function load() {
    setLoading(true)
    try {
      setSetting(await getSocialSeedPreview())
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '加载内部互动预览配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function requestChange(enabled: boolean) {
    if (!canEdit || !setting) return
    Modal.confirm({
      title: enabled ? '开启内部互动预览？' : '关闭内部互动预览？',
      content: enabled
        ? '公开界面将展示 social_seed 账号产生的点赞、评论及合并计数。仅限预上线验收。'
        : '公开界面将立即隐藏种子账号、种子评论和种子计数。',
      okText: enabled ? '确认开启' : '确认关闭',
      okButtonProps: enabled ? { danger: true } : undefined,
      cancelText: '取消',
      onOk: async () => {
        setSaving(true)
        try {
          const saved = await saveSocialSeedPreview(enabled)
          setSetting(saved)
          messageApi.success(enabled ? '内部互动预览已开启' : '内部互动预览已关闭')
        } catch (error) {
          messageApi.error(error instanceof Error ? error.message : '保存失败')
          throw error
        } finally {
          setSaving(false)
        }
      },
    })
  }

  return (
    <Card className="page-card" loading={loading} title="内部互动预览" style={{ marginTop: 16 }}>
      {contextHolder}
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space>
          <Switch
            checked={Boolean(setting?.enabled)}
            checkedChildren="已开启"
            unCheckedChildren="已关闭"
            loading={saving}
            disabled={!canEdit || !setting}
            onChange={requestChange}
          />
          {!canEdit ? <Typography.Text type="secondary">当前账号为只读权限。</Typography.Text> : null}
        </Space>
        {setting ? (
          <Typography.Text type="secondary">
            最后修改：{setting.updated_by} · {new Date(setting.updated_at).toLocaleString()} · 版本 {setting.version}
          </Typography.Text>
        ) : null}
      </Space>
    </Card>
  )
}
