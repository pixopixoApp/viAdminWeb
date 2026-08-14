export type Run = {
  id: string
  status: string
  title?: string
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
  source?: 'pgc' | 'ugc' | 'manual_upload'
  content_type?: 'runtime' | 'html'
  review_status?: 'pending' | 'approved' | 'rejected'
  author_user_id?: string
  author_nickname?: string
  creation_status?: string
  cover_url?: string
  preview_url?: string
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
}

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

export type ClipOnEnd = { action: 'goto'; clip_id: string }

export type ClipBody = {
  timeline?: { interactions?: import('./interaction').Interaction[]; media?: { duration_ms?: number } }
  on_end?: ClipOnEnd
}

export type StoryState = {
  entry_clip_id: string
  clips: Record<string, ClipBody>
  clip_meta: ClipMeta[]
  version: string
  editing: boolean
  note: string
  label?: string
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
  id: string; status: string; source_filename: string; item_id: string; entry: string
  entry_candidates: string[]; suggested_capabilities: string[]; required_capabilities: string[]
  title: string; description: string; author_user_id: string; package_version?: string | null
  html_url?: string | null; error_message: string; created_at: string
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
  if (edge.action !== 'goto') return undefined
  const clipId = typeof edge.clip_id === 'string' ? edge.clip_id.trim() : ''
  if (!clipId) return undefined
  return { action: 'goto', clip_id: clipId }
}
