export type ReportStatus = 'pending' | 'actioned' | 'dismissed'

export type Report = {
  id: string
  reporter_user_id: string
  reporter_label: string
  target_type: 'video' | 'user'
  target_id: string
  target_user_id?: string | null
  target_label: string
  reason: string
  details: string
  status: ReportStatus
  resolution: string
  reviewed_by: string
  created_at: string
}

export const reasonLabels: Record<string, string> = {
  spam: '垃圾或误导内容',
  harassment: '骚扰或欺凌',
  hate_or_violence: '仇恨或暴力',
  dangerous_acts: '危险行为',
  sexual_content: '裸露或色情内容',
  intellectual_property: '知识产权问题',
  other: '其他',
}

export type InviteStatus = 'unused' | 'redeemed' | 'revoked'

export type Invite = {
  id: number
  code_hint: string
  enabled: boolean
  status: InviteStatus
  redeemed_by_user_id?: string | null
  redeemed_by_label: string
  redeemed_at?: string | null
  created_at: string
}

export const inviteStatusMeta: Record<InviteStatus, { label: string; color: string }> = {
  unused: { label: '未兑换', color: 'green' },
  redeemed: { label: '已兑换', color: 'blue' },
  revoked: { label: '已销毁', color: 'default' },
}

export type CreatorApplicationStatus = 'pending' | 'invited' | 'approved' | 'rejected'

export type CreatorApplication = {
  user_id: string
  email: string
  message: string
  status: CreatorApplicationStatus
  invite_id?: number | null
  invite_code_hint: string
  invite_status?: InviteStatus | null
  invited_at?: string | null
  email_sent_at?: string | null
  last_error: string
  created_at: string
  updated_at: string
}

export type CreatorApplicationInviteResult = {
  user_id: string
  email: string
  status: 'sent' | 'skipped' | 'failed'
  application_status: string
  invite_id?: number | null
  invite_code_hint: string
  error: string
}

export type CreatorApplicationInviteResponse = {
  items: CreatorApplicationInviteResult[]
  sent_count: number
  skipped_count: number
  failed_count: number
}

export const creatorApplicationStatusMeta: Record<CreatorApplicationStatus, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'gold' },
  invited: { label: '已发码，待兑换', color: 'cyan' },
  approved: { label: '已开通', color: 'green' },
  rejected: { label: '已拒绝', color: 'default' },
}
