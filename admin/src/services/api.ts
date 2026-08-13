import { api } from '../api'
import type {
  Account,
  AnnotateState,
  ClipMeta,
  EngineSettings,
  HtmlImport,
  Invite,
  ModelsResp,
  OutcomeAction,
  Outcomes,
  PickAccount,
  PlaybackMetrics,
  Report,
  Run,
  RunDetail,
  SaveStatus,
  Staff,
  StoryState,
  VersionInfo,
  SeedanceSettings,
  SeedanceSettingsPatch,
  SeedanceGenerateParams,
  SeedanceTask,
} from '../types'

export type {
  Account,
  AnnotateState,
  ClipMeta,
  EngineSettings,
  HtmlImport,
  Invite,
  ModelsResp,
  OutcomeAction,
  Outcomes,
  PickAccount,
  PlaybackMetrics,
  Report,
  Run,
  RunDetail,
  SaveStatus,
  Staff,
  StoryState,
  VersionInfo,
  SeedanceSettings,
  SeedanceSettingsPatch,
  SeedanceGenerateParams,
  SeedanceTask,
}

// ── Seedance（AI 生成视频）────────────────────────

const SEEDANCE_BASE = '/api/v1/seedance'

export function getSeedanceSettings() {
  return api<SeedanceSettings>(`${SEEDANCE_BASE}/api/settings`)
}

export function saveSeedanceSettings(body: SeedanceSettingsPatch) {
  return api<SeedanceSettings>(`${SEEDANCE_BASE}/api/settings`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function uploadSeedanceVideo(file: File) {
  const form = new FormData()
  form.append('file', file, file.name)
  return api<{ file: string }>(`${SEEDANCE_BASE}/api/upload`, {
    method: 'POST',
    body: form,
  })
}

export function createSeedanceTask(body: SeedanceGenerateParams) {
  return api<{ task: SeedanceTask }>(`${SEEDANCE_BASE}/api/generate`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function listSeedanceTasks(limit = 100) {
  return api<{ tasks: SeedanceTask[] }>(`${SEEDANCE_BASE}/api/tasks?limit=${limit}`)
}

export function getSeedanceTask(taskId: string) {
  return api<{ task: SeedanceTask }>(`${SEEDANCE_BASE}/api/tasks/${taskId}`)
}

export function cancelSeedanceTask(taskId: string) {
  return api<{ task: SeedanceTask }>(`${SEEDANCE_BASE}/api/tasks/${taskId}/cancel`, {
    method: 'POST',
  })
}

export function deleteSeedanceTask(taskId: string) {
  return api<{ ok: boolean }>(`${SEEDANCE_BASE}/api/tasks/${taskId}`, { method: 'DELETE' })
}

export function seedanceFileUrl(path: string): string {
  return `${SEEDANCE_BASE}/${path.replace(/^\/+/, '')}`
}

export function seedanceVideoUrl(task: Pick<SeedanceTask, 'id' | 'video_file' | 'video_url'>): string {
  if (task.video_file) return seedanceFileUrl(`videos/${task.id}.mp4`)
  return task.video_url || ''
}

// ── Auth ──────────────────────────────────────────

export function login(username: string, password: string) {
  return api<{ access_token: string; username: string; role: string; display_name: string; must_change_password: boolean }>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function logout() {
  return api('/api/v1/auth/logout', { method: 'POST' })
}

export function getMe() {
  return api<import('../types/account').Staff & { display_name: string; must_change_password: boolean; role: string; status: string }>('/api/v1/auth/me')
}

export function changePassword(current_password: string, new_password: string) {
  return api<import('../types/account').Staff & { display_name: string; must_change_password: boolean; role: string }>('/api/v1/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password, new_password }),
  })
}

// ── Engine / Settings ─────────────────────────────

export function getEngineSettings() {
  return api<EngineSettings>('/api/v1/settings/engine')
}

export function saveEngineSettings(body: { model_base_url: string; model_name_default: string; model_api_key?: string }) {
  return api<EngineSettings>('/api/v1/settings/engine', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function getEngineReady() {
  return api<{ ready: boolean }>('/api/v1/settings/engine/ready')
}

export function getModels() {
  return api<ModelsResp>('/api/v1/models')
}

// ── Runs (Video Management) ───────────────────────

export type RunListParams = {
  source?: string
  status?: string
}

export function listRuns(params: RunListParams = {}) {
  const query = new URLSearchParams()
  if (params.source) query.set('source', params.source)
  if (params.status) query.set('status', params.status)
  return api<{ items: Run[]; total: number }>(`/api/v1/content-management?${query.toString()}`)
}

export function getRun(id: string) {
  return api<RunDetail>(`/api/v1/runs/${id}`)
}

export function createStory(title: string) {
  return api<{ id: string; analysis_version?: string }>('/api/v1/stories', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export type CreateRunUploadSessionParams = {
  filename: string
  content_type: string
  size_bytes: number
  sha256: string
  processing_mode: 'ai' | 'manual'
  model?: string
  brief?: string
  title?: string
}

export function createRunUploadSession(params: CreateRunUploadSessionParams) {
  return api<{ session_id: string; uploads: Array<{ url: string; fields: Record<string, string> }> }>('/api/v1/run-upload-sessions', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export function finalizeRunUpload(sessionId: string) {
  return api<Run>(`/api/v1/run-upload-sessions/${sessionId}/finalize`, { method: 'POST' })
}

export function reviewRun(id: string, status: 'approved' | 'rejected') {
  return api(`/api/v1/content-management/${id}/review`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

export function deleteRun(id: string) {
  return api(`/api/v1/content-management/${id}`, { method: 'DELETE' })
}

export function updateRunFeedWeight(id: string, feed_weight: number) {
  return api(`/api/v1/content-management/${id}/feed`, {
    method: 'PATCH',
    body: JSON.stringify({ feed_weight }),
  })
}

export function updateRunTitle(id: string, title: string) {
  return api<{ title: string }>(`/api/v1/runs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}

export function updateRunFeedWeightById(id: string, feed_weight: number) {
  return api<{ feed_weight?: number }>(`/api/v1/runs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ feed_weight }),
  })
}

export function updateRunTutorial(id: string, is_tutorial: boolean) {
  return api<{ is_tutorial?: boolean }>(`/api/v1/runs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_tutorial }),
  })
}

export function publishRun(id: string, version: string, user_id: string) {
  return api<{ id: string; version: string; ivapp: { updated?: boolean } }>(`/api/v1/runs/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify({ version, user_id }),
  })
}

export function unpublishRun(id: string) {
  return api(`/api/v1/runs/${id}/unpublish`, { method: 'POST' })
}

export function reanalyzeRun(id: string, body: { version?: string; model?: string; brief?: string; note?: string }) {
  return api(`/api/v1/runs/${id}/reanalyze`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function startAnnotate(id: string, source_version: string) {
  const requestId = crypto.randomUUID()
  return api<{ version: string }>(`/api/v1/runs/${id}/annotate/start`, {
    method: 'POST',
    headers: { 'Idempotency-Key': requestId },
    body: JSON.stringify({ source_version }),
  })
}

export function switchRunVersion(id: string, version: string) {
  return api(`/api/v1/runs/${id}/versions/current`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  })
}

export function getPlaybackMetrics(id: string) {
  return api<PlaybackMetrics>(`/api/v1/runs/${id}/metrics`)
}

// ── Annotate ──────────────────────────────────────

export function getAnnotateState(id: string, version: string) {
  return api<AnnotateState>(`/api/v1/runs/${id}/annotate/${version}`)
}

export function saveAnnotateState(id: string, version: string, timeline: unknown, note: string) {
  return api<AnnotateState>(`/api/v1/runs/${id}/annotate/${version}`, {
    method: 'PUT',
    body: JSON.stringify({ timeline, note }),
  })
}

export function finalizeAnnotate(id: string, version: string, timeline: unknown, note: string) {
  return api(`/api/v1/runs/${id}/annotate/${version}/finalize`, {
    method: 'POST',
    body: JSON.stringify({ timeline, note }),
  })
}

// ── Stories ───────────────────────────────────────

export function getStory(id: string, version?: string) {
  const query = version ? `?version=${encodeURIComponent(version)}` : ''
  return api<{ run: { title: string; published_version?: string | null; published_user_id?: string | null; analysis_version?: string | null; feed_weight?: number; is_tutorial?: boolean }; story: StoryState; version_infos?: VersionInfo[] }>(`/api/v1/stories/${id}${query}`)
}

export function getStoryRedirectVersion(id: string) {
  return api<{ run: { analysis_version?: string | null } }>(`/api/v1/stories/${id}`)
}

export function saveStory(id: string, body: { entry_clip_id: string; clips: unknown; note: string; version: string }) {
  return api<{ story: StoryState }>(`/api/v1/stories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function finalizeStory(id: string, version: string) {
  return api<{ story: StoryState; version_infos?: VersionInfo[] }>(`/api/v1/stories/${id}/finalize?version=${encodeURIComponent(version)}`, {
    method: 'POST',
  })
}

export function createStoryAnnotateVersion(id: string, source_version: string) {
  return api<{ version: string }>(`/api/v1/stories/${id}/versions`, {
    method: 'POST',
    body: JSON.stringify({ source_version }),
  })
}

export function createClipUploadSession(id: string, body: { filename: string; content_type: string; size_bytes: number; sha256: string }) {
  return api<{ session_id: string; uploads: Array<{ url: string; fields: Record<string, string> }> }>(`/api/v1/stories/${id}/clip-upload-sessions`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function finalizeClipUpload(id: string, sessionId: string) {
  return api<{ story: StoryState; clip: ClipMeta }>(`/api/v1/stories/${id}/clip-upload-sessions/${sessionId}/finalize`, { method: 'POST' })
}

// ── Accounts ──────────────────────────────────────

export type ListAccountsParams = { scope?: string; limit?: number; offset?: number; q?: string }

export function listAccounts(params: ListAccountsParams = {}) {
  const query = new URLSearchParams()
  if (params.scope) query.set('scope', params.scope)
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))
  if (params.q) query.set('q', params.q)
  return api<{ items: Account[]; total: number }>(`/api/v1/accounts?${query.toString()}`)
}

export function createAccount(body: Partial<Account>) {
  return api('/api/v1/accounts', { method: 'POST', body: JSON.stringify(body) })
}

export function deactivateAccount(userId: string) {
  return api(`/api/v1/accounts/${userId}/deactivate`, { method: 'POST' })
}

export function enableAccount(userId: string) {
  return api(`/api/v1/accounts/${userId}`, { method: 'PATCH', body: JSON.stringify({ enabled: true }) })
}

export function reassignAccount(userId: string, owner_staff_id: number) {
  return api(`/api/v1/accounts/${userId}/reassign`, { method: 'POST', body: JSON.stringify({ owner_staff_id }) })
}

export function getPickAccounts(limit = 100) {
  return api<{ items: PickAccount[] }>(`/api/v1/accounts/pick?limit=${limit}`)
}

export function uploadAccountAvatar(userId: string, formData: FormData) {
  return api(`/api/v1/accounts/${userId}/avatar`, { method: 'POST', body: formData })
}

// ── Staff ─────────────────────────────────────────

export function listStaff(page = 1, pageSize = 200) {
  return api<{ items: Staff[]; total: number }>(`/api/v1/staff?page=${page}&page_size=${pageSize}`)
}

export function createStaff(body: Partial<Staff> & { password: string }) {
  return api('/api/v1/staff', { method: 'POST', body: JSON.stringify(body) })
}

export function updateStaffStatus(id: number, status: string) {
  return api(`/api/v1/staff/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
}

export function resetStaffPassword(id: number, password: string) {
  return api(`/api/v1/staff/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) })
}

// ── Moderation ────────────────────────────────────

export type ListReportsParams = { limit?: number; offset?: number; status?: string; target_type?: string }

export function listReports(params: ListReportsParams = {}) {
  const query = new URLSearchParams()
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))
  if (params.status) query.set('status', params.status)
  if (params.target_type) query.set('target_type', params.target_type)
  return api<{ items: Report[]; total: number }>(`/api/v1/moderation/reports?${query.toString()}`)
}

export function decideReport(id: string, body: { status: 'actioned' | 'dismissed'; action: 'none' | 'remove_content' | 'disable_user'; resolution: string }) {
  return api(`/api/v1/moderation/reports/${id}/decision`, { method: 'POST', body: JSON.stringify(body) })
}

// ── Creator Invites ──────────────────────────────

export type ListInvitesParams = { limit?: number; offset?: number; status?: string; q?: string }

export function listInvites(params: ListInvitesParams = {}) {
  const query = new URLSearchParams()
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))
  if (params.status) query.set('status', params.status)
  if (params.q) query.set('q', params.q)
  return api<{ items: Invite[]; total: number }>(`/api/v1/creator-invites?${query.toString()}`)
}

export function createInvites(count: number) {
  return api<{ codes: string[] }>('/api/v1/creator-invites', { method: 'POST', body: JSON.stringify({ count }) })
}

export function revokeInvites(ids: number[]) {
  return api<{ revoked_ids: number[]; skipped_redeemed_ids: number[]; missing_ids: number[] }>('/api/v1/creator-invites/revoke', {
    method: 'POST',
    body: JSON.stringify({ invite_ids: ids }),
  })
}

export function revokeCreatorAccess(userId: string) {
  return api(`/api/v1/creator-access/${userId}/revoke`, { method: 'POST' })
}

// ── HTML Imports ──────────────────────────────────

export function listHtmlImports() {
  return api<{ items: HtmlImport[] }>('/api/v1/html-imports')
}

export function createHtmlImport(body: { filename: string; size_bytes: number; sha256: string }) {
  return api<{ import: HtmlImport; upload: { session_id: string; uploads: Array<{ client_ref: string; url: string; fields: Record<string, string> }> } }>('/api/v1/html-imports', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function finalizeHtmlImport(id: string, body: { session_id: string; manifest_hash: string }) {
  return api<{ import: HtmlImport }>(`/api/v1/html-imports/${id}/finalize-source`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateHtmlImport(id: string, body: { entry?: string; title?: string; description?: string; required_capabilities?: string[] }) {
  return api<HtmlImport>(`/api/v1/html-imports/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function prepareHtmlImport(id: string) {
  return api<{ import: HtmlImport; preview: string }>(`/api/v1/html-imports/${id}/prepare`, { method: 'POST' })
}

export function suggestHtmlImport(id: string) {
  return api<{ import: HtmlImport; suggestion_source: string }>(`/api/v1/html-imports/${id}/suggest`, { method: 'POST' })
}

export function publishHtmlImport(id: string) {
  return api(`/api/v1/html-imports/${id}/publish`, { method: 'POST' })
}

// ── Namespaced API objects ────────────────────────

export const authApi = {
  login,
  logout,
  getMe,
  changePassword,
}

export const engineApi = {
  getSettings: getEngineSettings,
  saveSettings: saveEngineSettings,
  getReady: getEngineReady,
  getModels,
}

export const runsApi = {
  list: listRuns,
  get: getRun,
  createRunUploadSession,
  finalizeRunUpload,
  review: reviewRun,
  delete: deleteRun,
  updateRunFeedWeight,
  updateRunTitle,
  updateRunFeedWeightById,
  updateRunTutorial,
  publish: publishRun,
  unpublish: unpublishRun,
  reanalyze: reanalyzeRun,
  startAnnotate,
  switchRunVersion,
  getMetrics: getPlaybackMetrics,
}

export const annotateApi = {
  getState: getAnnotateState,
  saveState: saveAnnotateState,
  finalize: finalizeAnnotate,
}

export const storiesApi = {
  create: createStory,
  get: getStory,
  getRedirectVersion: getStoryRedirectVersion,
  save: saveStory,
  finalize: finalizeStory,
  createAnnotateVersion: createStoryAnnotateVersion,
  createClipUploadSession,
  finalizeClipUpload,
}

export const accountsApi = {
  list: listAccounts,
  create: createAccount,
  deactivate: deactivateAccount,
  enable: enableAccount,
  reassign: reassignAccount,
  getPick: getPickAccounts,
  uploadAvatar: uploadAccountAvatar,
}

export const staffApi = {
  list: listStaff,
  create: createStaff,
  updateStatus: updateStaffStatus,
  resetPassword: resetStaffPassword,
}

export const moderationApi = {
  listReports: listReports,
  decideReport: decideReport,
}

export const invitesApi = {
  listInvites: listInvites,
  createInvites: createInvites,
  revokeInvites: revokeInvites,
  revokeCreatorAccess: revokeCreatorAccess,
}

export const htmlApi = {
  listHtmlImports: listHtmlImports,
  createHtmlImport: createHtmlImport,
  finalizeHtmlImport: finalizeHtmlImport,
  updateHtmlImport: updateHtmlImport,
  prepareHtmlImport: prepareHtmlImport,
  suggestHtmlImport: suggestHtmlImport,
  publishHtmlImport: publishHtmlImport,
}
