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
export const CAMERA_CONTINUOUS_TYPE = 'camera_continuous'
export const CONTINUOUS_BLOW_TYPE = 'mic_blow_continuous'
export const CONTINUOUS_BLOW_HINT = '持续吹气至目标音量以播放'
export const CONTINUOUS_VOICE_TYPE = 'mic_level_continuous'
export const CONTINUOUS_VOICE_HINT = '保持音调在目标范围内以播放'
export const CAMERA_CONTINUOUS_DEFAULT_TARGET = 'hand_finger_snap'
export const CAMERA_CONTINUOUS_TARGET_COPY: Record<string, {
  label: string
  hint: string
  detected: string
  simulate: string
  retry: string
  idlePrompt: string
  ariaLabel: string
  editorHelp: string
}> = {
  hand_finger_snap: {
    label: '持续弹指（拇指＋中指）',
    hint: '持续弹动拇指和中指以播放',
    detected: '已识别弹指',
    simulate: '模拟弹指',
    retry: '请再次模拟弹指',
    idlePrompt: '点击下方按钮模拟一次识别到的弹指',
    ariaLabel: '模拟持续弹指以播放，停止弹指 1100 毫秒后暂停',
    editorHelp: '真机由前置摄像头端侧识别弹指',
  },
  hand_finger_gun_recoil: {
    label: '持续手枪后坐力（拇指＋食指）',
    hint: '保持手枪手势并持续做后坐力动作以播放',
    detected: '已识别手枪手型或后坐力',
    simulate: '模拟后坐力',
    retry: '请再次模拟手枪手型或后坐力',
    idlePrompt: '点击下方按钮模拟一次手枪手型或后坐力识别',
    ariaLabel: '模拟手枪手型或持续后坐力以播放，停止动作 1100 毫秒后暂停',
    editorHelp: '真机由前置摄像头端侧识别手枪手型和后坐力',
  },
}

export function cameraContinuousTargetCopy(target?: string) {
  return CAMERA_CONTINUOUS_TARGET_COPY[target || CAMERA_CONTINUOUS_DEFAULT_TARGET]
    || CAMERA_CONTINUOUS_TARGET_COPY[CAMERA_CONTINUOUS_DEFAULT_TARGET]
}

export const CAMERA_CONTINUOUS_HINT = cameraContinuousTargetCopy().hint

export function isContinuousSwipe(value: { gesture?: string } | undefined | null) {
  return value?.gesture === CONTINUOUS_SWIPE_TYPE
}

export function isContinuousTap(value: { gesture?: string } | undefined | null) {
  return value?.gesture === CONTINUOUS_TAP_TYPE
}

export function isCameraContinuous(value: { gesture?: string } | undefined | null) {
  return value?.gesture === CAMERA_CONTINUOUS_TYPE
}

export function isContinuousBlow(value: { gesture?: string } | undefined | null) {
  return value?.gesture === CONTINUOUS_BLOW_TYPE
}

export function isContinuousVoice(value: { gesture?: string } | undefined | null) {
  return value?.gesture === CONTINUOUS_VOICE_TYPE
}

export function isSustainedPlaybackInteraction(
  value: { gesture?: string } | undefined | null,
) {
  return isContinuousSwipe(value) || isContinuousTap(value)
    || isCameraContinuous(value) || isContinuousBlow(value)
    || isContinuousVoice(value)
}

export function enforceInteractionTypeRules(value: Interaction): Interaction {
  if (!isSustainedPlaybackInteraction(value)) return value
  const next: Interaction = {
    ...value,
    pause_video: true,
    hint: isContinuousBlow(value)
      ? CONTINUOUS_BLOW_HINT
      : isContinuousVoice(value)
        ? CONTINUOUS_VOICE_HINT
      : isContinuousTap(value)
        ? CONTINUOUS_TAP_HINT
        : isCameraContinuous(value)
          ? cameraContinuousTargetCopy(value.vision?.target).hint
          : CONTINUOUS_SWIPE_HINT,
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
  camera_continuous: 'Continuous Camera Motion',
  tilt_left: 'Tilt Left',
  tilt_right: 'Tilt Right',
  shake: 'Shake',
  mic_level: 'Sound',
  mic_level_continuous: 'Continuous Voice',
  mic_blow: 'Blow',
  mic_blow_continuous: 'Continuous Blow',
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

export function gestureAuthoringLabel(value: string) {
  const label = GESTURE_LABEL[value] || value
  return value === CONTINUOUS_VOICE_TYPE ? `Sound › ${label}` : label
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
  vision?: VisionConfig
}
