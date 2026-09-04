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
  tap: 'Tap',
  double_tap: 'Double Tap',
  hold: 'Hold',
  swipe_left: 'Swipe Left',
  swipe_right: 'Swipe Right',
  swipe_up: 'Swipe Up',
  swipe_down: 'Swipe Down',
  drag_left: 'Drag Left',
  drag_right: 'Drag Right',
  drag_up: 'Drag Up',
  drag_down: 'Drag Down',
  camera_motion: 'Camera Motion',
  tilt_left: 'Tilt Left',
  tilt_right: 'Tilt Right',
  shake: 'Shake',
  mic_level: 'Sound',
  mic_blow: 'Blow',
  mic_clap: 'Clap',
  mic_quiet: 'Quiet',
  rapid_tap: 'Rapid Tap',
  erase: 'Erase',
  hold_charge: 'Hold & Charge',
  pinch: 'Pinch',
  draw_circle: 'Draw Circle',
  hold_still: 'Hold Still',
  rotate: 'Rotate',
  scrub_left: 'Scrub Left',
  scrub_right: 'Scrub Right',
  scrub_up: 'Scrub Up',
  scrub_down: 'Scrub Down',
  continuous_swipe: 'Continuous Swipe',
  continuous_tap: 'Continuous Tap',
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
