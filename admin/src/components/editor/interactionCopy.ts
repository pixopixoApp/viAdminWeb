export const ADMIN_GESTURE_LABEL_ZH: Record<string, string> = {
  tap: '单击',
  double_tap: '双击',
  multi_tap: '自定义点击次数',
  rapid_tap: '快速连点',
  hold: '长按',
  hold_charge: '长按蓄力',
  swipe_left: '向左滑动',
  swipe_right: '向右滑动',
  swipe_up: '向上滑动',
  swipe_down: '向下滑动',
  drag_left: '向左拖动',
  drag_right: '向右拖动',
  drag_up: '向上拖动',
  drag_down: '向下拖动',
  scrub_left: '向左擦动',
  scrub_right: '向右擦动',
  scrub_up: '向上擦动',
  scrub_down: '向下擦动',
  pinch: '双指捏合',
  draw_circle: '画圆',
  erase: '擦除',
  tilt_left: '向左倾斜',
  tilt_right: '向右倾斜',
  shake: '摇动设备',
  rotate: '旋转设备',
  hold_still: '保持静止',
  camera_motion: '摄像头动作识别',
  mic_level: '声音强度识别',
  mic_blow: '吹气识别',
  mic_clap: '拍手识别',
  mic_quiet: '安静识别',
  continuous_tap: '持续点击',
  continuous_hold: '持续按住',
  continuous_swipe: '持续滑动',
  camera_continuous: '持续摄像头识别',
  mic_continuous: '持续声音识别',
  mic_blow_continuous: '持续吹气',
  mic_level_continuous: '持续发声',
}

export function adminGestureLabel(value?: string) {
  return ADMIN_GESTURE_LABEL_ZH[value || ''] || value || '互动'
}

export function adminInteractionLabel(value: Interaction) {
  if (value.custom_action) return value.action_description || '自定义动作'
  if (isContinuousSound(value)) return adminGestureLabel('mic_continuous')
  return adminGestureLabel(value.gesture)
}
import type { Interaction } from '../../types/interaction'
import { isContinuousSound } from '../../types/interaction'
