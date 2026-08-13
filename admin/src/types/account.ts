export type Account = {
  user_id: string
  nickname: string
  avatar_url: string
  avatar_absolute_url: string
  enabled: boolean
  source: string
  owner_staff_id?: number | null
  owner_staff_name?: string | null
  created_at?: string | null
}

export type Staff = {
  id: number
  username: string
  display_name: string
  role: string
  status: string
  must_change_password: boolean
  run_count: number
  last_login_at?: string | null
  created_at?: string | null
}

export const roleLabel: Record<string, string> = {
  admin: '超级管理员',
  manager: '管理员',
  operator: '运营',
}
