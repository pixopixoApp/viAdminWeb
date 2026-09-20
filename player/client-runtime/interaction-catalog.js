(function installPixoInteractionCatalog(globalObject, factory) {
  "use strict";

  const catalog = factory();
  if (typeof module === "object" && module.exports) module.exports = catalog;
  if (globalObject) globalObject.PixoInteractionCatalog = catalog;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCatalog() {
  "use strict";

  const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;
  const TOUCH_PLACE = "middle_middle";
  const SENSOR_PLACE = "middle_bottom";

  function detection(defaults) {
    return Object.freeze({
      confidence_threshold: DEFAULT_CONFIDENCE_THRESHOLD,
      ...defaults,
    });
  }

  /** ExperienceSpec v1.0 keeps scheduling and gesture thresholds orthogonal. */
  const fieldSemantics = Object.freeze({
    offset_time_ms: Object.freeze({
      scope: "interaction",
      unit: "ms",
      role: "cue_offset",
      required: true,
      nullMeansMediaEnd: true,
      atLeastDurationMeansMediaEnd: true,
      description: "Required cue position. JSON null or a value at least as large as media duration activates after ended.",
    }),
    active_until_ms: Object.freeze({
      scope: "interaction",
      unit: "ms",
      role: "exclusive_sustained_range_end",
      required: false,
      description: "Optional exclusive media-time boundary for sustained playback; the next cue and media end remain hard upper bounds.",
    }),
    response_window_ms: Object.freeze({
      scope: "detection",
      unit: "ms",
      role: "total_response_window",
      toleranceScaled: false,
      zeroMeansNoDeadline: true,
      description: "Total time available after input is ready; 0 disables time-based expiry. An unresolved non-pausing in-video cue misses at the next cue or media end.",
    }),
    min_duration_ms: Object.freeze({
      scope: "detection",
      unit: "ms",
      role: "minimum_continuous_success_duration",
      toleranceScaled: true,
      description: "Minimum continuous duration for a sustained success condition.",
    }),
    idle_timeout_ms: Object.freeze({
      scope: "detection",
      unit: "ms",
      role: "continuous_input_idle_timeout",
      toleranceScaled: false,
      description: "Maximum time without qualifying sustained input before playback pauses.",
    }),
    required_tap_count: Object.freeze({
      scope: "detection",
      unit: "count",
      role: "tap_sequence_success_count",
      minimumInclusive: 1,
      maximumInclusive: 99,
      description: "Exact number of accepted taps required to complete a multi_tap cue.",
    }),
    confidence_threshold: Object.freeze({
      scope: "detection",
      unit: "ratio",
      role: "requirement_scale",
      minimumExclusive: 0,
      maximumInclusive: 1,
      description: "Canonical field for scaling success thresholds only; it never changes the response window.",
    }),
  });

  // Canonical wire values mirror mobile2.pen / 手势引导动画全集. Each entry also
  // declares the detection defaults consumed by protocol producers and Runtime.
  const entries = [
    { type: "tap", instruction: "Tap", icon: "hand-pointing", library: "phosphor", mechanic: "tap", animation: "tap", detection: detection({ response_window_ms: 500, place: TOUCH_PLACE }) },
    { type: "double_tap", instruction: "Double tap", icon: "hand-pointing", library: "phosphor", mechanic: "tap_sequence", animation: "double-tap", badgeText: "×2", detection: detection({ response_window_ms: 650, place: TOUCH_PLACE }) },
    { type: "rapid_tap", instruction: "Tap fast", icon: "hand-pointing", library: "phosphor", mechanic: "tap_sequence", animation: "rapid-tap", badgeText: "×3", detection: detection({ response_window_ms: 850, place: TOUCH_PLACE }) },
    { type: "multi_tap", instruction: "Tap the required number of times", icon: "hand-pointing", library: "phosphor", mechanic: "tap_sequence", animation: "multi-tap", badgeText: "×3", detection: detection({ response_window_ms: 0, required_tap_count: 3, place: TOUCH_PLACE }) },
    { type: "hold", instruction: "Hold", icon: "hand-pointing", library: "phosphor", mechanic: "hold", animation: "hold", detection: detection({ response_window_ms: 1200, min_duration_ms: 1000, place: TOUCH_PLACE }) },
    { type: "hold_still", instruction: "Hold still", icon: "smartphone", library: "lucide", mechanic: "motion", capability: "device_motion", animation: "hold-still", badgeIcon: "pause", detection: detection({ response_window_ms: 1200, min_duration_ms: 1000, max_motion_score: 20, place: SENSOR_PLACE }) },
    { type: "hold_charge", instruction: "Hold to charge", icon: "hand-pointing", library: "phosphor", mechanic: "hold", animation: "hold-charge", badgeIcon: "bolt", detection: detection({ response_window_ms: 1800, min_duration_ms: 1500, place: TOUCH_PLACE }) },
    { type: "swipe_left", instruction: "Swipe left", icon: "hand-pointing", library: "phosphor", mechanic: "swipe", animation: "swipe", direction: "left", trail: true, detection: detection({ response_window_ms: 800, min_distance_dp: 64, place: TOUCH_PLACE }) },
    { type: "swipe_right", instruction: "Swipe right", icon: "hand-pointing", library: "phosphor", mechanic: "swipe", animation: "swipe", direction: "right", trail: true, detection: detection({ response_window_ms: 800, min_distance_dp: 64, place: TOUCH_PLACE }) },
    { type: "swipe_up", instruction: "Swipe up", icon: "hand-pointing", library: "phosphor", mechanic: "swipe", animation: "swipe", direction: "up", trail: true, detection: detection({ response_window_ms: 800, min_distance_dp: 64, place: TOUCH_PLACE }) },
    { type: "swipe_down", instruction: "Swipe down", icon: "hand-pointing", library: "phosphor", mechanic: "swipe", animation: "swipe", direction: "down", trail: true, detection: detection({ response_window_ms: 800, min_distance_dp: 64, place: TOUCH_PLACE }) },
    { type: "drag_left", instruction: "Hold & drag left", icon: "hand-grabbing", library: "phosphor", mechanic: "drag", animation: "drag", direction: "left", badgeIcon: "arrow_left", detection: detection({ response_window_ms: 1200, min_distance_dp: 56, place: TOUCH_PLACE }) },
    { type: "drag_right", instruction: "Hold & drag right", icon: "hand-grabbing", library: "phosphor", mechanic: "drag", animation: "drag", direction: "right", badgeIcon: "arrow_right", detection: detection({ response_window_ms: 1200, min_distance_dp: 56, place: TOUCH_PLACE }) },
    { type: "drag_up", instruction: "Hold & drag up", icon: "hand-grabbing", library: "phosphor", mechanic: "drag", animation: "drag", direction: "up", badgeIcon: "arrow_up", detection: detection({ response_window_ms: 1200, min_distance_dp: 56, place: TOUCH_PLACE }) },
    { type: "drag_down", instruction: "Hold & drag down", icon: "hand-grabbing", library: "phosphor", mechanic: "drag", animation: "drag", direction: "down", badgeIcon: "arrow_down", detection: detection({ response_window_ms: 1200, min_distance_dp: 56, place: TOUCH_PLACE }) },
    { type: "scrub_left", instruction: "Scrub left", icon: "hand-grabbing", library: "phosphor", mechanic: "scrub", animation: "scrub", direction: "left", badgeIcon: "arrow_left", detection: detection({ response_window_ms: 1500, min_travel_dp: 96, place: TOUCH_PLACE }) },
    { type: "scrub_right", instruction: "Scrub right", icon: "hand-grabbing", library: "phosphor", mechanic: "scrub", animation: "scrub", direction: "right", badgeIcon: "arrow_right", detection: detection({ response_window_ms: 1500, min_travel_dp: 96, place: TOUCH_PLACE }) },
    { type: "scrub_up", instruction: "Scrub up", icon: "hand-grabbing", library: "phosphor", mechanic: "scrub", animation: "scrub", direction: "up", badgeIcon: "arrow_up", detection: detection({ response_window_ms: 1500, min_travel_dp: 96, place: TOUCH_PLACE }) },
    { type: "scrub_down", instruction: "Scrub down", icon: "hand-grabbing", library: "phosphor", mechanic: "scrub", animation: "scrub", direction: "down", badgeIcon: "arrow_down", detection: detection({ response_window_ms: 1500, min_travel_dp: 96, place: TOUCH_PLACE }) },
    { type: "continuous_swipe", instruction: "Swipe back and forth to play", icon: "hand-grabbing", library: "phosphor", mechanic: "continuous_swipe", lifecycle: "sustained", inputScope: "viewport", animation: "continuous-swipe", detection: detection({ response_window_ms: 0, min_travel_dp: 32, idle_timeout_ms: 500, place: TOUCH_PLACE }) },
    { type: "continuous_tap", instruction: "Keep tapping to play", icon: "hand-pointing", library: "phosphor", mechanic: "continuous_tap", lifecycle: "sustained", inputScope: "viewport", animation: "continuous-tap", detection: detection({ response_window_ms: 0, idle_timeout_ms: 500, place: TOUCH_PLACE }) },
    { type: "continuous_hold", instruction: "Press and hold to play", icon: "hand-pointing", library: "phosphor", mechanic: "continuous_hold", lifecycle: "sustained", inputScope: "viewport", animation: "continuous-hold", detection: detection({ response_window_ms: 0, place: TOUCH_PLACE }) },
    { type: "camera_continuous", instruction: "Keep performing the camera gesture to play", icon: "face", library: "material-symbols-rounded", mechanic: "camera_continuous", lifecycle: "sustained", inputScope: "camera", capability: "vision", animation: "camera", badgeIcon: "camera", detection: detection({ response_window_ms: 0, idle_timeout_ms: 1100, place: SENSOR_PLACE }) },
    { type: "pinch", instruction: "Pinch inward", icon: "pinch-in", library: "pixo-directional", mechanic: "pinch", inputScope: "viewport", animation: "pinch-in", detection: detection({ response_window_ms: 1200, min_scale_delta: 0.06, pinch_direction: "inward", place: TOUCH_PLACE }) },
    { type: "draw_circle", instruction: "Draw a circle", icon: "gesture", library: "material-symbols-rounded", mechanic: "draw", inputScope: "viewport", animation: "draw-circle", detection: detection({ response_window_ms: 1800, min_radius_dp: 24, max_closure_gap_dp: 28, place: TOUCH_PLACE }) },
    { type: "erase", instruction: "Rub to erase", icon: "eraser", library: "lucide", mechanic: "erase", animation: "erase", detection: detection({ response_window_ms: 1500, min_travel_dp: 100, place: TOUCH_PLACE }) },
    { type: "camera_motion", instruction: "Follow the prompt using the front camera", icon: "face", library: "material-symbols-rounded", mechanic: "camera", capability: "camera", animation: "camera", badgeIcon: "camera", detection: detection({ response_window_ms: 5000, min_motion_score: 45, place: SENSOR_PLACE }) },
    { type: "tilt_left", instruction: "Tilt left", icon: "smartphone", library: "lucide", mechanic: "motion", capability: "device_motion", animation: "tilt", direction: "left", badgeIcon: "arrow_left", rotation: 15, detection: detection({ response_window_ms: 1200, min_angle_deg: 15, place: SENSOR_PLACE }) },
    { type: "tilt_right", instruction: "Tilt right", icon: "smartphone", library: "lucide", mechanic: "motion", capability: "device_motion", animation: "tilt", direction: "right", badgeIcon: "arrow_right", rotation: -15, detection: detection({ response_window_ms: 1200, min_angle_deg: 15, place: SENSOR_PLACE }) },
    { type: "shake", instruction: "Shake your phone", icon: "smartphone", library: "lucide", mechanic: "motion", capability: "device_motion", animation: "shake", badgeIcon: "swap_horiz", detection: detection({ response_window_ms: 1500, min_shake_score: 60, place: SENSOR_PLACE }) },
    { type: "rotate", instruction: "Rotate your phone", icon: "smartphone", library: "lucide", mechanic: "motion", capability: "device_motion", animation: "rotate", badgeIcon: "rotate_right", detection: detection({ response_window_ms: 1800, min_angle_deg: 75, rotation_direction: "counterclockwise", place: SENSOR_PLACE }) },
    { type: "mic_level", instruction: "Make some noise", icon: "mic", library: "lucide", mechanic: "microphone", capability: "microphone", animation: "mic-level", detection: detection({ response_window_ms: 4000, min_duration_ms: 300, min_volume_score: 55, place: SENSOR_PLACE }) },
    { type: "mic_level_continuous", instruction: "Keep your voice in the target pitch range", icon: "mic", library: "lucide", mechanic: "microphone", lifecycle: "sustained", inputScope: "microphone", capability: "microphone", animation: "mic-level", detection: detection({ response_window_ms: 0, min_duration_ms: 160, min_volume_score: 45, idle_timeout_ms: 450, place: SENSOR_PLACE }) },
    { type: "mic_blow", instruction: "Blow at the mic", icon: "wind", library: "lucide", mechanic: "microphone", capability: "microphone", animation: "mic-blow", badgeIcon: "mic", detection: detection({ response_window_ms: 4000, min_duration_ms: 300, min_volume_score: 55, place: SENSOR_PLACE }) },
    { type: "mic_blow_continuous", instruction: "Keep blowing at the target volume to play", icon: "wind", library: "lucide", mechanic: "microphone", lifecycle: "sustained", inputScope: "microphone", capability: "microphone", animation: "mic-blow", badgeIcon: "mic", detection: detection({ response_window_ms: 0, min_duration_ms: 160, min_volume_score: 55, idle_timeout_ms: 450, place: SENSOR_PLACE }) },
    { type: "mic_clap", instruction: "Clap once", icon: "hands-clapping", library: "phosphor", mechanic: "microphone", capability: "microphone", animation: "mic-clap", detection: detection({ response_window_ms: 4000, min_volume_score: 55, place: SENSOR_PLACE }) },
    { type: "mic_quiet", instruction: "Stay quiet", icon: "volume-off", library: "material-symbols-rounded", mechanic: "microphone", capability: "microphone", animation: "mic-quiet", detection: detection({ response_window_ms: 4000, min_duration_ms: 1000, max_volume_score: 20, place: SENSOR_PLACE }) },
  ].map(function freezeEntry(entry) { return Object.freeze(entry); });

  const byType = new Map(entries.map(function indexEntry(entry) { return [entry.type, entry]; }));

  function normalizeType(value) {
    if (typeof value !== "string") return null;
    const canonical = value.trim();
    return byType.has(canonical) ? canonical : null;
  }

  function get(value) {
    const type = normalizeType(value);
    return type ? byType.get(type) || null : null;
  }

  const pinchGuides = Object.freeze({
    inward: Object.freeze({ ...get("pinch"), variant: "pinch_in", instruction: "Pinch inward", icon: "pinch-in", animation: "pinch-in" }),
    outward: Object.freeze({ ...get("pinch"), variant: "pinch_out", instruction: "Spread two fingers outward", icon: "pinch-out", animation: "pinch-out", detection: detection({ ...get("pinch").detection, pinch_direction: "outward" }) }),
  });

  return Object.freeze({
    version: "3.6.0",
    entries: Object.freeze(entries),
    types: Object.freeze(entries.map(function wireValues(entry) { return entry.type; })),
    fieldSemantics,
    normalizeType,
    get,
    pinchGuides,
  });
});
