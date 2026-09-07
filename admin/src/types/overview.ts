/** /api/v1/overview 后台概览接口类型 */

export type OverviewRuns = {
  total: number
  processing: number
  ready_unpublished: number
  published: number
  attention: number
  failed: number
}

export type OverviewManualUploads = {
  total: number
  active: number
}

export type OverviewAccountsAll = {
  total: number
  disabled: number
}

export type OverviewAccounts = {
  mine: number
  all: OverviewAccountsAll | null
}

export type OverviewStaff = {
  total: number
  enabled: number
  disabled: number
  operators: number
  managers: number
  admins: number
}

export type OverviewCounts = {
  pending?: number
  unused?: number
  active?: number
  total?: number
}

export type OverviewPublishedContent = {
  total: number
  pending: number
  approved: number
  rejected: number
}

export type OverviewSeedance = {
  total: number
  active: number
}

export type Overview = {
  generated_at: string
  role: string
  engine: { ready: boolean }
  runs: OverviewRuns
  manual_uploads: OverviewManualUploads | null
  accounts: OverviewAccounts
  staff: OverviewStaff | null
  moderation: OverviewCounts | null
  creator_applications: OverviewCounts | null
  creator_invites: OverviewCounts | null
  published_content: OverviewPublishedContent | null
  seedance: OverviewSeedance
}
