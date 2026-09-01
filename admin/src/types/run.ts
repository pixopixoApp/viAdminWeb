export type Run = {
  id: string
  status: string
  title?: string
  brief?: string | null
  description?: string | null
  source_filename: string
  source_bytes?: number
  duration_ms?: number
  width?: number
  height?: number
  model_name: string
  analysis_version?: string | null
  processing_mode?: 'ai' | 'manual'
  content_mode?: 'single' | 'story'
  published_version?: string | null
  published_user_id?: string | null
  published_user_nickname?: string | null
  published_user_enabled?: boolean | null
  feed_weight?: number
  is_tutorial?: boolean
  created_by_name?: string | null
  created_at: string
  updated_at?: string
  deleted_at?: string | null
  source?: 'pgc' | 'ugc' | 'manual_upload'
  content_type?: 'runtime' | 'html'
  review_status?: 'draft' | 'pending' | 'approved' | 'rejected'
  author_user_id?: string
  author_nickname?: string
  creation_status?: string
  cover_url?: string
  preview_url?: string
  distribution_enabled?: boolean
  has_run?: boolean
  seo?: {
    status: 'missing' | 'pending' | 'generating' | 'ready' | 'failed' | 'stale'
    slug?: string
    last_error?: string
  }
}

export type RunDetail = {
  run: {
    id: string
    status: string
    title?: string
    model_name: string
    error_message?: string
    analysis_version?: string | null
    published_version?: string | null
    published_user_id?: string | null
    published_user_nickname?: string | null
    published_user_enabled?: boolean | null
    content_mode?: 'single' | 'story'
    feed_weight?: number
    is_tutorial?: boolean
    description?: string | null
    cover_url?: string | null
    cover_media_object_id?: string | null
    cover_candidates_json?: string | null
  }
  media: Record<string, unknown>
  analysis_refine: {
    model?: string
    interactions?: Record<string, unknown>[]
  }
  gameplay: {
    dropped?: Record<string, unknown>[]
  }
  timeline?: {
    interactions?: {
      gate_at_ms: number
      gesture?: string
      cue?: string
      hint?: string
    }[]
  } | null
  next_version?: string | null
  versions?: string[]
  version_infos?: VersionInfo[]
  current_meta?: { kind?: string; note?: string; editing?: boolean }
  preview_qr_url?: string | null
}

export type VersionInfo = {
  version: string
  label: string
  kind: string
  note: string
  editing: boolean
  source_version?: string
}

export type PickAccount = {
  user_id: string
  nickname: string
  enabled: boolean
  avatar_url?: string
  avatar_absolute_url?: string
}

/** 发布到随机无归属账号的标记（与后端一致） */
export const RANDOM_USER_MARKER = 'random'

export type PlaybackMetrics = {
  video_id: string
  unique_view_count: number
  first_viewed_at?: string | null
  last_viewed_at?: string | null
  telemetry_event_count: number
  last_telemetry_at?: string | null
}

export type ClipMeta = {
  clip_id: string
  source_filename: string
  duration_ms?: number | null
  width?: number | null
  height?: number | null
}

export type ClipOnEnd =
  | { action: 'goto'; clip_id: string }
  | { action: 'end' }
  | { action: 'retry_previous_point' }

export type ClipBody = {
  timeline?: { interactions?: import('./interaction').Interaction[]; media?: { duration_ms?: number } }
  on_end?: ClipOnEnd
}

export type StoryEditorMode = 'simple_abc' | 'advanced'
export type SimpleStoryRole = 'a' | 'b' | 'c'

export type SimpleStoryPlacement =
  | { type: 'time'; at_ms: number }
  | { type: 'end' }

export type SimpleStoryInteraction = Pick<
  import('./interaction').Interaction,
  | 'gesture'
  | 'hint'
  | 'custom_action'
  | 'action_description'
  | 'gameplay_description'
  | 'vision'
  | 'vision_resolution'
>

export type SimpleStoryConfig = {
  roles: Partial<Record<SimpleStoryRole, string>>
  branch_interaction_index: number | null
  /** Legacy projection retained while old cached admin bundles roll out. */
  interaction?: SimpleStoryInteraction | null
  /** Legacy projection retained while old cached admin bundles roll out. */
  placement?: SimpleStoryPlacement
  response_window_ms: number
  failure_behavior: 'end' | 'retry_previous_point'
  complete: boolean
  issues: string[]
}

export type StoryState = {
  entry_clip_id: string
  clips: Record<string, ClipBody>
  clip_meta: ClipMeta[]
  version: string
  editing: boolean
  note: string
  label?: string
  editor_mode?: StoryEditorMode
  simple_config?: SimpleStoryConfig
  authoring?: Record<string, unknown>
  warnings?: string[]
}

export type AnnotateState = {
  version: string
  label: string
  editing: boolean
  note: string
  timeline: {
    interactions?: import('./interaction').Interaction[]
    media?: { duration_ms?: number; width?: number; height?: number }
  }
}

export type ModelsResp = { default: string; items: { id: string }[] }

export type EngineSettings = {
  ready: boolean
  dify_base_url: string
  model_base_url: string
  model_name_default: string
  dify_api_key: SecretField
  model_api_key: SecretField
}

export type SecretField = {
  set: boolean
  source: string
  value: string
  hint: string
}

export type HtmlImport = {
  id: string; status: string; source_filename: string; source_bytes: number; source_sha256: string
  item_id: string; entry: string
  entry_candidates: string[]; suggested_capabilities: string[]; required_capabilities: string[]
  title: string; description: string; author_user_id: string; package_version?: string | null
  html_url?: string | null; preview_qr_url?: string | null; qa_result?: {
    inspection?: { unsupported_features?: string[]; compatibility_warnings?: string[]; compatibility_profile?: string }
    playwright?: Record<string, unknown>; compatibility_profile?: string
    entry_auto_selected_from_multiple?: boolean
    ai?: { used?: boolean; calls?: number; derived_copy_modified?: boolean; history?: Array<{ call_number?: number; outcome?: string; summary?: string }> }
  } | null; processing?: {
    active?: boolean; stage: string; stage_index?: number; stage_total?: number
    progress_percent: number; detail?: string; attempt?: number; can_retry?: boolean
    retry_scope?: string | null; failed_stage?: string | null; skipped_stages?: string[]
    queued_at?: string | null; started_at?: string | null; heartbeat_at?: string | null; updated_at?: string | null
  } | null
  source_backup?: { status: string; progress_percent: number; can_retry?: boolean; error_message?: string; updated_at?: string | null } | null
  error_message: string; created_at: string; updated_at?: string
}

export const statusMeta: Record<string, { label: string; color: string }> = {
  ready: { label: '待发布', color: 'blue' },
  running: { label: '分析中', color: 'processing' },
  queued: { label: '排队中', color: 'default' },
  failed: { label: '分析失败', color: 'red' },
  no_interaction: { label: '未发现互动', color: 'orange' },
  no_playable_plan: { label: '方案不可播放', color: 'orange' },
}

export function parseClipOnEnd(raw: unknown): ClipOnEnd | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const edge = raw as { action?: string; clip_id?: string }
  if (edge.action === 'end') return { action: 'end' }
  if (edge.action === 'retry_previous_point') return { action: 'retry_previous_point' }
  if (edge.action === 'goto') {
    const clipId = typeof edge.clip_id === 'string' ? edge.clip_id.trim() : ''
    if (clipId) return { action: 'goto', clip_id: clipId }
  }
  return undefined
}
