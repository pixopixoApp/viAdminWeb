import type { Outcomes } from './outcome'

export type VisionConfig = {
  registry_version?: 'v1'
  target?: string
  camera_facing?: 'front' | 'back'
  show_preview?: boolean
  min_confidence?: number
  stable_for_ms?: number
}

export type VisionResolution = {
  target_source: 'ai' | 'fallback' | 'operator'
  fallback_reason?: 'missing' | 'unsupported'
  evidence?: string
}

export type Interaction = {
  gate_at_ms: number
  gate_end_ms?: number
  gesture: string
  hint?: string
  custom_action?: boolean
  action_description?: string
  gameplay_description?: string
  reaction_start_ms?: number
  reaction_end_ms?: number
  cue?: string
  outcomes?: Outcomes
  pause_video?: boolean
  vision?: VisionConfig
  vision_resolution?: VisionResolution
}

export const CONTINUOUS_SWIPE_TYPE = 'continuous_swipe'
export const CONTINUOUS_SWIPE_HINT = '持续往复滑动以播放'
export const CONTINUOUS_TAP_TYPE = 'continuous_tap'
export const CONTINUOUS_TAP_HINT = '持续点击以播放'

export function isContinuousSwipe(value: { gesture?: string } | undefined | null) {
  return value?.gesture === CONTINUOUS_SWIPE_TYPE
}

export function isContinuousTap(value: { gesture?: string } | undefined | null) {
  return value?.gesture === CONTINUOUS_TAP_TYPE
}

export function isSustainedPlaybackInteraction(
  value: { gesture?: string } | undefined | null,
) {
  return isContinuousSwipe(value) || isContinuousTap(value)
}

export function enforceInteractionTypeRules(value: Interaction): Interaction {
  if (!isSustainedPlaybackInteraction(value)) return value
  const next: Interaction = {
    ...value,
    pause_video: true,
    hint: isContinuousTap(value) ? CONTINUOUS_TAP_HINT : CONTINUOUS_SWIPE_HINT,
  }
  delete next.gate_end_ms
  delete next.outcomes
  return next
}

export const GESTURE_LABEL: Record<string, string> = {
  tap: '点击',
  double_tap: '双击',
  hold: '长按',
  swipe_left: '左滑',
  swipe_right: '右滑',
  swipe_up: '上滑',
  swipe_down: '下滑',
  drag_left: '左拖',
  drag_right: '右拖',
  drag_up: '上拖',
  drag_down: '下拖',
  camera_motion: '镜头动作',
  tilt_left: '左倾',
  tilt_right: '右倾',
  shake: '摇一摇',
  mic_level: '出声',
  mic_blow: '吹气',
  mic_clap: '拍手',
  mic_quiet: '安静',
  rapid_tap: '连点',
  erase: '擦除',
  hold_charge: '蓄力',
  pinch: '捏合',
  draw_circle: '画圈',
  hold_still: '静止',
  rotate: '转动',
  scrub_left: '左推进',
  scrub_right: '右推进',
  scrub_up: '上推进',
  scrub_down: '下推进',
  continuous_swipe: '连续滑动',
  continuous_tap: '持续点击',
}

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export function versionOptionLabel(label: string, version: string, published?: string | null) {
  return published && version === published ? `${label} - 已发布` : label
}

export type Gate = {
  gate_at_ms: number
  gesture?: string
  hint?: string
  cue?: string
  custom_action?: boolean
  action_description?: string
}
