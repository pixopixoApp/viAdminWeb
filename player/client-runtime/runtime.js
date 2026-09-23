(function installPixoRuntime(globalObject, factory) {
  "use strict";

  const runtime = factory(globalObject);
  if (typeof module === "object" && module.exports) {
    module.exports = runtime;
  }
  if (globalObject) {
    globalObject.PixoRuntime = runtime;
    if (globalObject.__pixoPendingHostLayout) {
      runtime.setHostLayout(globalObject.__pixoPendingHostLayout);
      globalObject.__pixoPendingHostLayout = null;
    }
  }
  if (globalObject && globalObject.document) {
    const start = function startRuntime() {
      const pending = globalObject.__pixoPendingExperienceSpecJson;
      const hasPending = (typeof pending === "string" && pending.trim())
        || (pending && typeof pending === "object");
      const nativeHostWillInject = Boolean(
        globalObject.PixoNativeBridge
        || globalObject.MotionCueNativeBridge
        || globalObject.__pixoNativeTransport
        || (globalObject.PixoNative
          && typeof globalObject.PixoNative.hasTransport === "function"
          && globalObject.PixoNative.hasTransport()),
      );
      if (hasPending) globalObject.__pixoPendingExperienceSpecJson = null;
      const loadPromise = hasPending
        ? Promise.resolve(runtime.loadExperience(pending))
        : (globalObject.__pixoHostExperienceInjected
          ? Promise.resolve(null)
          : (nativeHostWillInject ? Promise.resolve(null) : runtime.loadLocalExperience()));
      loadPromise.catch(function reportBootstrapFailure(error) {
        if (!globalObject.__pixoHostExperienceInjected) runtime.showFatalError(error);
      });
    };
    if (globalObject.document.readyState === "loading") {
      globalObject.document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createPixoRuntime(host) {
  "use strict";

  const VERSION = "0.35.0";
  const EXPERIENCE_SPEC_VERSION = "1.10";
  const SUPPORTED_EXPERIENCE_SPEC_VERSIONS = new Set([
    "1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9",
    EXPERIENCE_SPEC_VERSION,
  ]);
  const USER_RELATIVE_TILT_SEMANTICS = "user_relative_v2";
  const LEGACY_TILT_SEMANTICS = "legacy_beta_v1";
  const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;
  const DEFAULT_RESPONSE_WINDOW_MS = 3000;
  const DEFAULT_LONG_PRESS_DURATION_MS = 700;
  const DEFAULT_SWIPE_WINDOW_MS = 1200;
  const DEFAULT_SWIPE_DISTANCE_DP = 64;
  const DEFAULT_DRAG_WINDOW_MS = 1200;
  const DEFAULT_DRAG_DISTANCE_DP = 56;
  const DEFAULT_SCRUB_WINDOW_MS = 1500;
  const DEFAULT_SCRUB_TRAVEL_DP = 96;
  const DEFAULT_CONTINUOUS_SWIPE_TRAVEL_DP = 32;
  const DEFAULT_CONTINUOUS_SWIPE_IDLE_TIMEOUT_MS = 500;
  const DEFAULT_CONTINUOUS_TAP_IDLE_TIMEOUT_MS = 500;
  const DEFAULT_CAMERA_CONTINUOUS_IDLE_TIMEOUT_MS = 1100;
  const DEFAULT_CONTINUOUS_BLOW_IDLE_TIMEOUT_MS = 450;
  const DEFAULT_CONTINUOUS_VOICE_IDLE_TIMEOUT_MS = 450;
  const MIN_CONTINUOUS_SWIPE_TURN_GRACE_MS = 500;
  const CONTINUOUS_SWIPE_PREACTIVATION_HISTORY_MS = 1200;
  const CONTINUOUS_SWIPE_POINTER_HISTORY_LIMIT = 96;
  const CONTINUOUS_SWIPE_LIVENESS_DP = 1;
  const DEFAULT_PINCH_WINDOW_MS = 1200;
  const DEFAULT_PINCH_SCALE_DELTA = 0.06;
  const PINCH_TRAVEL_DP = 6;
  const PINCH_NOISE_DP = 1.5;
  const PINCH_CANDIDATE_MS = 40;
  const DEFAULT_DRAW_WINDOW_MS = 1800;
  const DEFAULT_CIRCLE_RADIUS_DP = 24;
  const DEFAULT_CIRCLE_CLOSURE_GAP_DP = 28;
  const DEFAULT_ERASE_WINDOW_MS = 1500;
  const DEFAULT_ERASE_TRAVEL_DP = 100;
  const DEFAULT_MOTION_WINDOW_MS = 1500;
  const DEFAULT_MAX_MOTION_SCORE = 20;
  const DEFAULT_MIN_MOTION_SCORE = 45;
  const DEFAULT_MIN_TILT_ANGLE_DEG = 15;
  const DEFAULT_MIN_ROTATE_ANGLE_DEG = 75;
  const DEFAULT_MIN_SHAKE_SCORE = 60;
  const DEFAULT_MAX_VOLUME_SCORE = 20;
  const MIN_CIRCLE_ROTATION_DEG = 135;
  const CIRCLE_DIRECTION_CONSISTENCY = 0.55;
  const CIRCLE_PATH_SAMPLES = 32;
  const REQUIRED_REVERSALS = 2;
  const POINTER_JITTER_DP = 3;
  const CONTINUOUS_SWIPE_REVERSAL_COSINE = -0.5;
  const ERASE_FOG_MAX_DEVICE_PIXEL_RATIO = 2;
  const ERASE_FOG_MIN_BRUSH_RADIUS_DP = 30;
  const ERASE_FOG_MAX_BRUSH_RADIUS_DP = 64;
  const SWIPE_AXIS_DOMINANCE_RATIO = 0.75;
  const DEFAULT_VOICE_DURATION_MS = 500;
  const DEFAULT_MIN_VOLUME_SCORE = 40;
  const MIN_RESPONSE_WINDOW_MS = 250;
  const MAX_RESPONSE_WINDOW_MS = 60000;
  const INPUT_DEBOUNCE_MS = 250;
  const FEEDBACK_DURATION_MS = 720;
  const MEDIA_READY_TIMEOUT_MS = 8000;
  const MEDIA_LOAD_RETRY_DELAYS_MS = Object.freeze([400, 1200]);
  const VOICE_PERMISSION_TIMEOUT_MS = 120000;
  // Camera success is based only on semantic native Vision events.  Coarse frame/luma telemetry
  // is intentionally never accepted as a content-recognition success signal.
  const CAMERA_CONTENT_RECOGNITION_ENABLED = true;
  const VISION_TARGETS = new Set([
    "hand_victory", "hand_thumb_up", "hand_thumb_down", "hand_open_palm",
    "hand_closed_fist", "hand_pointing_up", "hand_i_love_you",
    "face_smile", "face_wink_left", "face_wink_right", "face_blink",
    "face_mouth_open", "face_mouth_pucker", "face_brow_raise",
    "face_brow_furrow", "face_cheek_puff",
  ]);
  const CAMERA_CONTINUOUS_TARGET_PROFILES = Object.freeze({
    hand_finger_snap: "finger_snap_v1",
    hand_finger_gun_recoil: "finger_gun_recoil_v1",
  });
  const CAMERA_CONTINUOUS_TARGETS = new Set(
    Object.keys(CAMERA_CONTINUOUS_TARGET_PROFILES),
  );
  // About 6 dB on the native fixed -60..-17 dBFS score. Once a clear sound starts,
  // the lower hold threshold preserves natural gaps between spoken syllables.
  const VOICE_HOLD_MARGIN_SCORE = 14;
  const CONTINUOUS_MICROPHONE_WINDOW_MS = 640;
  const CONTINUOUS_MICROPHONE_RECENT_EVIDENCE_MS = 320;
  const CONTINUOUS_MICROPHONE_MATCH_RATIO = 0.5;
  const CONTINUOUS_MICROPHONE_TOLERANCE_POINTS = 15;
  const CONTINUOUS_MICROPHONE_MEDIAN_WINDOW_MS = 200;
  const CONTINUOUS_MICROPHONE_SMOOTHING_TIME_MS = 350;
  const CONTINUOUS_VOICE_RELEASE_SMOOTHING_TIME_MS = 500;
  const CONTINUOUS_MICROPHONE_DEFAULT_SAMPLE_INTERVAL_MS = 50;
  const CONTINUOUS_MICROPHONE_SCORE_DEADBAND = 1;
  const CONTINUOUS_VOICE_FLOOR_DBFS = -82;
  const CONTINUOUS_VOICE_CEILING_DBFS = -28;
  const CONTINUOUS_VOICE_MINIMUM_PITCH_HZ = 80;
  const CONTINUOUS_VOICE_MAXIMUM_PITCH_HZ = 400;
  const SOUND_METER_HISTORY_SIZE = 36;
  const MIC_DETECTOR_PROFILES = Object.freeze({
    mic_blow: Object.freeze({
      noiseBoost: 0.45,
      minimumNoiseStartScore: 38,
      minimumNoiseHoldScore: 24,
    }),
    mic_blow_continuous: Object.freeze({
      interactionTargetScore: 85,
    }),
    mic_level_continuous: Object.freeze({
      pitchTargetScore: 50,
      pitchTolerancePoints: 32,
      minimumPitchConfidence: 50,
      interactionTargetScore: 62,
      fallbackInteractionTargetScore: 72,
      legacyInteractionTargetScore: 45,
      fallbackLegacyInteractionTargetScore: 58,
      minimumSignalToNoiseDb: 7,
      fallbackSignalToNoiseDb: 15,
    }),
    mic_clap: Object.freeze({
      minimumTransientScore: 44,
      transientThresholdRatio: 0.62,
      minimumInstantScore: 20,
      instantThresholdMargin: 45,
      minimumNoiseScore: 20,
      releaseInstantRatio: 0.52,
      releasePeakRatio: 0.72,
      minimumReleaseInstantScore: 12,
      minimumReleasePeakScore: 20,
      maximumReleaseMs: 260,
    }),
  });
  const MICROPHONE_AUDIO_SUPPRESSION_ATTRIBUTE = "data-pixo-microphone-audio-suppressed";
  const interactionCatalog = host && host.PixoInteractionCatalog
    ? host.PixoInteractionCatalog
    : (typeof require === "function" ? require("./interaction-catalog.js") : null);
  const motionGuidance = host && host.PixoMotionGuidance
    ? host.PixoMotionGuidance
    : (typeof require === "function" ? require("./motion-guidance.js") : null);
  if (!interactionCatalog) {
    throw new Error("Pixo interaction catalog must load before the Runtime.");
  }
  const KNOWN_TYPES = new Set(interactionCatalog.types);
  const RESULT_ACTIONS = new Set([
    "continue",
    "retry_previous_point",
    "restart_video",
    "jump_video",
    "end_experience",
  ]);
  const RESULT_ACTION_TIMINGS = new Set(["immediate", "video_end"]);
  const INTERACTION_PLACES = new Set([
    "left_top", "middle_top", "right_top",
    "left_middle", "middle_middle", "right_middle",
    "left_bottom", "middle_bottom", "right_bottom",
  ]);
  const INTERACTION_PLACE_ALIASES = Object.freeze({ middle: "middle_middle" });
  // gesture-anim-set(2).html / 手势引导动画全集 maps each protocol type
  // to the single visual rendered inside its real interaction region.
  const INTERACTION_ANIMATION_CLASS_BY_TYPE = Object.freeze({
    tap: "anim-tap",
    double_tap: "anim-dtap",
    rapid_tap: "anim-rtap",
    multi_tap: "anim-rtap",
    hold: "anim-hold",
    hold_still: "anim-still",
    hold_charge: "anim-charge",
    swipe_left: "anim-swipe",
    swipe_right: "anim-swipe",
    swipe_up: "anim-swipe",
    swipe_down: "anim-swipe",
    drag_left: "anim-drag",
    drag_right: "anim-drag",
    drag_up: "anim-drag",
    drag_down: "anim-drag",
    scrub_left: "anim-scrub",
    scrub_right: "anim-scrub",
    scrub_up: "anim-scrub",
    scrub_down: "anim-scrub",
    continuous_swipe: "anim-continuous-swipe",
    continuous_tap: "anim-continuous-tap",
    continuous_hold: "anim-hold",
    pinch: "anim-pinch",
    draw_circle: "anim-circle",
    erase: "anim-erase",
    camera_motion: "anim-cam",
    tilt_left: "anim-tilt",
    tilt_right: "anim-tilt",
    tilt_forward: "anim-pitch",
    tilt_backward: "anim-pitch",
    shake: "anim-shake",
    rotate: "anim-rot",
    mic_level: "anim-mic",
    mic_level_continuous: "anim-mic",
    mic_blow: "anim-blow",
    mic_blow_continuous: "anim-blow",
    mic_clap: "anim-clap",
    mic_quiet: "anim-quiet",
  });
  let domRuntime = null;
  let currentHostLayout = Object.freeze({
    interactionViewport: null,
    showPlaceGrid: false,
    showOnboardingScrim: false,
    hideInteractionCaption: false,
    completionActions: Object.freeze({ share: false }),
  });

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function positiveNumber(value, fallback, minimum, maximum) {
    if (!isFiniteNumber(value) || value <= 0) return fallback;
    return clamp(value, minimum, maximum);
  }

  /** A protocol value of 0 explicitly disables the response deadline. */
  function responseWindowNumber(value, fallback, minimum, maximum) {
    if (isFiniteNumber(value) && value >= 0) return value;
    if (isFiniteNumber(fallback) && fallback >= 0) return fallback;
    return DEFAULT_RESPONSE_WINDOW_MS;
  }

  function responseWindowAllowsElapsed(responseWindowMs, elapsedMs) {
    return isFiniteNumber(elapsedMs)
      && elapsedMs >= 0
      && (responseWindowMs === 0 || elapsedMs <= responseWindowMs);
  }

  /** Smaller values relax success thresholds; response windows are never scaled. */
  function normalizeConfidenceThreshold(value, fallback) {
    const safeFallback = isFiniteNumber(fallback) && fallback > 0 && fallback <= 1
      ? fallback
      : DEFAULT_CONFIDENCE_THRESHOLD;
    return isFiniteNumber(value) && value > 0 && value <= 1 ? value : safeFallback;
  }

  function normalizeInteractionPlace(value) {
    if (typeof value !== "string") return "middle_bottom";
    const place = value.trim().toLowerCase();
    if (INTERACTION_PLACE_ALIASES[place]) return INTERACTION_PLACE_ALIASES[place];
    if (INTERACTION_PLACES.has(place)) return place;
    if (place && host && host.document && host.console && typeof host.console.warn === "function") {
      host.console.warn(`[PixoRuntime] Unsupported interaction place '${place}', using middle_bottom.`);
    }
    return "middle_bottom";
  }

  function captionPlacementForPlace(value) {
    return normalizeInteractionPlace(value).endsWith("_bottom") ? "top" : "bottom";
  }

  function normalizeHostLayout(value) {
    const source = isRecord(value) ? value : {};
    const viewportSource = isRecord(source.interactionViewport)
      ? source.interactionViewport
      : null;
    const interactionViewport = viewportSource
      && ["top", "right", "bottom", "left"].every(function hasSafeInset(edge) {
        return isFiniteNumber(viewportSource[edge]) && viewportSource[edge] >= 0;
      })
      ? Object.freeze({
        top: viewportSource.top,
        right: viewportSource.right,
        bottom: viewportSource.bottom,
        left: viewportSource.left,
      })
      : null;
    const completionActionsSource = isRecord(source.completionActions)
      ? source.completionActions
      : {};
    return Object.freeze({
      interactionViewport,
      ...(isRecord(source.guidanceViewport) && ["top", "right", "bottom", "left"].every(edge => isFiniteNumber(source.guidanceViewport[edge]) && source.guidanceViewport[edge] >= 0)
        ? { guidanceViewport: Object.freeze({
          top: source.guidanceViewport.top, right: source.guidanceViewport.right,
          bottom: source.guidanceViewport.bottom, left: source.guidanceViewport.left,
        }) } : {}),
      showPlaceGrid: source.showPlaceGrid === true && interactionViewport !== null,
      showOnboardingScrim: source.showOnboardingScrim === true,
      hideInteractionCaption: source.hideInteractionCaption === true,
      completionActions: Object.freeze({
        share: completionActionsSource.share === true,
      }),
    });
  }

  function applyHostLayoutToDocument(layout) {
    if (!host || !host.document || !host.document.documentElement) return;
    const root = host.document.documentElement;
    const viewport = layout.interactionViewport;
    ["top", "right", "bottom", "left"].forEach(function applyInset(edge) {
      const property = `--pixo-interaction-${edge}`;
      if (viewport) root.style.setProperty(property, `${viewport[edge]}px`);
      else root.style.removeProperty(property);
    });
    root.setAttribute("data-pixo-interaction-viewport", viewport ? "ready" : "default");
    const guidanceViewport = layout.guidanceViewport || viewport;
    ["top", "right", "bottom", "left"].forEach(function applyGuidanceInset(edge) {
      const property = `--pixo-guidance-${edge}`;
      if (guidanceViewport) root.style.setProperty(property, `${guidanceViewport[edge]}px`);
      else root.style.removeProperty(property);
    });
    root.setAttribute("data-pixo-place-grid", layout.showPlaceGrid ? "visible" : "hidden");
    root.setAttribute(
      "data-pixo-onboarding-scrim",
      layout.showOnboardingScrim ? "visible" : "hidden",
    );
    root.setAttribute(
      "data-pixo-hide-interaction-caption",
      layout.hideInteractionCaption ? "true" : "false",
    );
    root.setAttribute(
      "data-pixo-completion-share",
      layout.completionActions.share ? "visible" : "hidden",
    );
  }

  function setHostLayout(value) {
    currentHostLayout = normalizeHostLayout(value);
    applyHostLayoutToDocument(currentHostLayout);
    if (domRuntime && typeof domRuntime.applyHostLayout === "function") {
      domRuntime.applyHostLayout(currentHostLayout);
    }
    return currentHostLayout;
  }

  function shouldToggleFeedPlayback(
    _presentation,
    _hostActive,
    _interactionActive,
    _replayScheduled,
  ) {
    // Playback is host/runtime-owned. A tap on non-interactive video content must remain inert;
    // standalone playback is still available through the explicit play control.
    return false;
  }

  function shouldWaitForActiveCueAtMediaEnd(active) {
    if (!isRecord(active) || active.resolved === true) return false;
    if (isSustainedPlaybackCue(active.cue)) return false;
    if (active.activatedAtMediaEnd === true) return true;
    if (active.pausedVideo === true) return true;
    return active.responseWindowMs > 0;
  }

  function shouldSupersedeUnlimitedPlayingCue(active, nextCue, positionMs) {
    const nextOffsetTimeMs = getOffsetTimeMs(nextCue);
    return isRecord(active)
      && active.resolved !== true
      && active.responseWindowMs === 0
      && active.pausedVideo === false
      && isRecord(nextCue)
      && isFiniteNumber(positionMs)
      && isFiniteNumber(nextOffsetTimeMs)
      && positionMs >= nextOffsetTimeMs;
  }

  function shouldCompleteSustainedPlaybackCue(active, nextCue, positionMs) {
    const boundaryMs = sustainedPlaybackEndMs(active, nextCue);
    return isRecord(active)
      && active.resolved !== true
      && isSustainedPlaybackCue(active.cue)
      && isFiniteNumber(positionMs)
      && isFiniteNumber(boundaryMs)
      && positionMs >= boundaryMs;
  }

  function sustainedPlaybackEndMs(active, nextCue) {
    if (!isRecord(active) || !isRecord(active.cue)) return null;
    const boundaries = [];
    if (isFiniteNumber(active.cue.active_until_ms)) {
      boundaries.push(active.cue.active_until_ms);
    }
    const nextOffsetTimeMs = isRecord(nextCue) ? getOffsetTimeMs(nextCue) : null;
    if (isFiniteNumber(nextOffsetTimeMs)) boundaries.push(nextOffsetTimeMs);
    return boundaries.length ? Math.min(...boundaries) : null;
  }

  // Kept for the public testing surface used by existing continuous-swipe tests.
  function shouldCompleteContinuousSwipeCue(active, nextCue, positionMs) {
    return isRecord(active)
      && isContinuousSwipeCue(active.cue)
      && shouldCompleteSustainedPlaybackCue(active, nextCue, positionMs);
  }

  function capabilityFailurePolicyForCue() {
    const capabilities = host && host.__pixoRuntimeHostCapabilities;
    return capabilities && capabilities.capabilityFailurePolicy === "block"
      ? "block"
      : "hold";
  }

  function permissionDeniedPolicyForCue(cue) {
    return capabilityFailurePolicyForCue(cue);
  }

  function cueStartsAtMediaEnd(cue, durationMs) {
    if (!isRecord(cue)) return false;
    const offsetTimeMs = getOffsetTimeMs(cue);
    if (offsetTimeMs === null) return true;
    return isFiniteNumber(offsetTimeMs)
      && isFiniteNumber(durationMs)
      && durationMs >= 0
      && offsetTimeMs >= Math.max(0, Math.round(durationMs));
  }

  function interactionAnimationClass(value) {
    const type = normalizeInteractionType(value);
    return type ? INTERACTION_ANIMATION_CLASS_BY_TYPE[type] || null : null;
  }

  // Backward-compatible testing/API alias.
  function gestureAnimationClass(value) {
    return interactionAnimationClass(value);
  }

  function normalizeInteractionType(value) {
    return interactionCatalog.normalizeType(value);
  }

  function isInteractionTypeDisabledByHost(value) {
    const capabilities = host && host.__pixoRuntimeHostCapabilities;
    const unsupportedTypes = capabilities && capabilities.unsupportedInteractionTypes;
    return Array.isArray(unsupportedTypes) && unsupportedTypes.includes(value);
  }

  function hostInteractionFallbackType(value) {
    const capabilities = host && host.__pixoRuntimeHostCapabilities;
    const fallbacks = capabilities && capabilities.interactionFallbacks;
    if (!isRecord(fallbacks)) return null;
    const sourceType = normalizeInteractionType(value);
    const targetType = normalizeInteractionType(sourceType && fallbacks[sourceType]);
    // Runtime currently exposes one deliberate accessibility fallback. Keeping the
    // accepted target narrow prevents a host from silently rewriting authored logic.
    return targetType === "hold" ? targetType : null;
  }

  function hasSupportedVisionDetection(detection, targets) {
    const supportedTargets = targets || VISION_TARGETS;
    return isRecord(detection)
      && isRecord(detection.vision)
      && typeof detection.vision.target === "string"
      && supportedTargets.has(detection.vision.target.trim());
  }

  function isRuntimeSupportedInteractionType(value, detection) {
    const type = normalizeInteractionType(value);
    return Boolean(type)
      && KNOWN_TYPES.has(type)
      && !isInteractionTypeDisabledByHost(type)
      && (!["camera_motion", "camera_continuous"].includes(type)
        || (CAMERA_CONTENT_RECOGNITION_ENABLED
        && hasSupportedVisionDetection(
          detection,
          type === "camera_continuous" ? CAMERA_CONTINUOUS_TARGETS : VISION_TARGETS,
        )));
  }

  function normalizeRuntimeInteractionType(value, detection) {
    const type = normalizeInteractionType(value);
    if (!type) return "tap";
    // A semantic camera cue must never silently become a hold cue.  Doing so hides a
    // malformed vision contract (or a temporarily unavailable camera) from both the
    // creator and the tester.  parseExperience() will validate its vision target and
    // report a protocol error when it is missing/invalid.
    if (["camera_motion", "camera_continuous"].includes(type)) return type;
    return isRuntimeSupportedInteractionType(type, detection) ? type : "hold";
  }

  function guideForInteractionType(value) {
    return interactionCatalog.get(value);
  }

  function interactionMechanic(cueOrType) {
    const cue = isRecord(cueOrType) ? cueOrType : null;
    const type = cue ? cue.type : cueOrType;
    const guide = guideForInteractionType(type);
    return guide ? guide.mechanic : "unsupported";
  }

  function isMicrophoneCue(cueOrType) {
    return interactionMechanic(cueOrType) === "microphone";
  }

  function shouldSuppressMediaAudioForCue(cue) {
    return isRecord(cue)
      && cue.pause_video === false
      && isMicrophoneCue(cue);
  }

  function isTapCue(cueOrType) {
    const mechanic = interactionMechanic(cueOrType);
    return mechanic === "tap" || mechanic === "tap_sequence";
  }

  function isTapSequenceCue(cueOrType) {
    return interactionMechanic(cueOrType) === "tap_sequence";
  }

  function isSwipeCue(cueOrType) {
    return interactionMechanic(cueOrType) === "swipe";
  }

  function isDragCue(cueOrType) {
    return interactionMechanic(cueOrType) === "drag";
  }

  function isScrubCue(cueOrType) {
    return interactionMechanic(cueOrType) === "scrub";
  }

  function isContinuousSwipeCue(cueOrType) {
    return interactionMechanic(cueOrType) === "continuous_swipe";
  }

  function isContinuousTapCue(cueOrType) {
    return interactionMechanic(cueOrType) === "continuous_tap";
  }

  function isContinuousHoldCue(cueOrType) {
    return interactionMechanic(cueOrType) === "continuous_hold";
  }

  function isCameraContinuousCue(cueOrType) {
    return interactionMechanic(cueOrType) === "camera_continuous";
  }

  function isContinuousBlowCue(cueOrType) {
    return normalizeInteractionType(
      isRecord(cueOrType) ? cueOrType.type : cueOrType,
    ) === "mic_blow_continuous";
  }

  function isContinuousVoiceCue(cueOrType) {
    return normalizeInteractionType(
      isRecord(cueOrType) ? cueOrType.type : cueOrType,
    ) === "mic_level_continuous";
  }

  function isContinuousMicrophoneCue(cueOrType) {
    return isContinuousBlowCue(cueOrType) || isContinuousVoiceCue(cueOrType);
  }

  function isSustainedPlaybackCue(cueOrType) {
    const guide = guideForInteractionType(
      isRecord(cueOrType) ? cueOrType.type : cueOrType,
    );
    return Boolean(guide) && guide.lifecycle === "sustained";
  }

  function isPinchCue(cueOrType) {
    return interactionMechanic(cueOrType) === "pinch";
  }

  function isFreeformPointerCue(cueOrType) {
    return isPinchCue(cueOrType) || isDrawCue(cueOrType);
  }

  function isDrawCue(cueOrType) {
    return interactionMechanic(cueOrType) === "draw";
  }

  function isEraseCue(cueOrType) {
    return interactionMechanic(cueOrType) === "erase";
  }

  function isPointerGestureCue(cueOrType) {
    return isSwipeCue(cueOrType)
      || isDragCue(cueOrType)
      || isScrubCue(cueOrType)
      || isContinuousSwipeCue(cueOrType)
      || isPinchCue(cueOrType)
      || isDrawCue(cueOrType)
      || isEraseCue(cueOrType);
  }

  function isHoldCue(cueOrType) {
    return interactionMechanic(cueOrType) === "hold";
  }

  function isMotionCue(cueOrType) {
    return interactionMechanic(cueOrType) === "motion";
  }

  function isCameraCue(cueOrType) {
    return interactionMechanic(cueOrType) === "camera"
      || isCameraContinuousCue(cueOrType);
  }

  function requiredTapCount(cueOrType) {
    const cue = isRecord(cueOrType) ? cueOrType : null;
    const type = normalizeInteractionType(cue ? cue.type : cueOrType);
    if (type === "double_tap") return 2;
    if (type === "rapid_tap") return 3;
    if (type === "multi_tap") {
      const count = cue && cue.detection ? cue.detection.required_tap_count : null;
      return Number.isInteger(count) && count >= 1 && count <= 99 ? count : 3;
    }
    return 1;
  }

  function getOffsetTimeMs(cue) {
    if (!isRecord(cue)) return 0;
    if (cue.offset_time_ms === null) return null;
    if (isFiniteNumber(cue.offset_time_ms)) return Math.max(0, cue.offset_time_ms);
    return 0;
  }

  function cueSortOffsetTimeMs(cue) {
    const offsetTimeMs = getOffsetTimeMs(cue);
    return offsetTimeMs === null ? Infinity : offsetTimeMs;
  }

  /** Tap windows begin at offset_time_ms and are never tolerance-scaled. */
  function calculateTapWindow(responseWindowMs, offsetTimeMs) {
    const durationMs = responseWindowNumber(
      responseWindowMs,
      DEFAULT_RESPONSE_WINDOW_MS,
      MIN_RESPONSE_WINDOW_MS,
      MAX_RESPONSE_WINDOW_MS,
    );
    const offsetMs = isFiniteNumber(offsetTimeMs) ? Math.max(0, offsetTimeMs) : 0;
    return Object.freeze({
      offsetMs,
      responseWindowMs: durationMs,
      startMs: offsetMs,
      endMs: durationMs === 0 ? Infinity : offsetMs + durationMs,
    });
  }

  /** response_window_ms limits time; confidence_threshold only relaxes distance. */
  function calculateSwipeRequirements(minDistanceDp, responseWindowMs, confidenceThreshold) {
    const baseDistanceDp = positiveNumber(
      minDistanceDp,
      DEFAULT_SWIPE_DISTANCE_DP,
      16,
      512,
    );
    const safeResponseWindowMs = responseWindowNumber(
      responseWindowMs,
      DEFAULT_SWIPE_WINDOW_MS,
      MIN_RESPONSE_WINDOW_MS,
      MAX_RESPONSE_WINDOW_MS,
    );
    const tolerance = normalizeConfidenceThreshold(
      confidenceThreshold,
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
    return Object.freeze({
      confidenceThreshold: tolerance,
      baseDistanceDp,
      effectiveMinDistanceDp: baseDistanceDp * tolerance,
      responseWindowMs: safeResponseWindowMs,
      axisDominanceRatio: SWIPE_AXIS_DOMINANCE_RATIO,
    });
  }

  function evaluateSwipeGesture(
    cueOrType,
    deltaX,
    deltaY,
    elapsedMs,
    requirements,
  ) {
    const guide = guideForInteractionType(
      isRecord(cueOrType) ? cueOrType.type : cueOrType,
    );
    const direction = guide && guide.mechanic === "swipe" ? guide.direction : null;
    const safeRequirements = isRecord(requirements)
      ? requirements
      : calculateSwipeRequirements(undefined, undefined, undefined);
    const horizontal = direction === "left" || direction === "right";
    const signedPrimaryDistanceDp = direction === "left"
      ? -deltaX
      : (direction === "right"
        ? deltaX
        : (direction === "up" ? -deltaY : deltaY));
    const crossAxisDistanceDp = Math.abs(horizontal ? deltaY : deltaX);
    const primaryDistanceDp = Math.max(0, signedPrimaryDistanceDp);
    const directionMatches = Boolean(direction) && signedPrimaryDistanceDp > 0;
    const distanceMatches = directionMatches
      && primaryDistanceDp >= safeRequirements.effectiveMinDistanceDp;
    const axisMatches = directionMatches
      && crossAxisDistanceDp <= primaryDistanceDp * safeRequirements.axisDominanceRatio;
    const durationMatches = responseWindowAllowsElapsed(
      safeRequirements.responseWindowMs,
      elapsedMs,
    );
    return Object.freeze({
      matches: directionMatches && distanceMatches && axisMatches && durationMatches,
      direction,
      primaryDistanceDp,
      crossAxisDistanceDp,
      elapsedMs,
      directionMatches,
      distanceMatches,
      axisMatches,
      durationMatches,
    });
  }

  function calculateDragRequirements(minDistanceDp, responseWindowMs, confidenceThreshold) {
    const requirements = calculateSwipeRequirements(
      positiveNumber(minDistanceDp, DEFAULT_DRAG_DISTANCE_DP, 8, 512),
      responseWindowNumber(responseWindowMs, DEFAULT_DRAG_WINDOW_MS, 100, MAX_RESPONSE_WINDOW_MS),
      confidenceThreshold,
    );
    return Object.freeze({ ...requirements });
  }

  function evaluateDragGesture(cueOrType, deltaX, deltaY, elapsedMs, requirements) {
    const guide = guideForInteractionType(
      isRecord(cueOrType) ? cueOrType.type : cueOrType,
    );
    if (!guide || guide.mechanic !== "drag") {
      return Object.freeze({ matches: false, direction: null });
    }
    const swipeEquivalent = `swipe_${guide.direction}`;
    return evaluateSwipeGesture(
      swipeEquivalent,
      deltaX,
      deltaY,
      elapsedMs,
      requirements || calculateDragRequirements(),
    );
  }

  function calculateScrubRequirements(
    minTravelDp,
    responseWindowMs,
    confidenceThreshold,
  ) {
    const baseTravelDp = positiveNumber(minTravelDp, DEFAULT_SCRUB_TRAVEL_DP, 16, 2048);
    const safeResponseWindowMs = responseWindowNumber(
      responseWindowMs,
      DEFAULT_SCRUB_WINDOW_MS,
      100,
      MAX_RESPONSE_WINDOW_MS,
    );
    const tolerance = normalizeConfidenceThreshold(
      confidenceThreshold,
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
    return Object.freeze({
      confidenceThreshold: tolerance,
      baseTravelDp,
      effectiveMinTravelDp: baseTravelDp * tolerance,
      responseWindowMs: safeResponseWindowMs,
      requiredReversals: REQUIRED_REVERSALS,
    });
  }

  function evaluateScrubGesture(
    cueOrType,
    deltaX,
    deltaY,
    travelDp,
    reversalCount,
    elapsedMs,
    requirements,
  ) {
    const guide = guideForInteractionType(
      isRecord(cueOrType) ? cueOrType.type : cueOrType,
    );
    const direction = guide && guide.mechanic === "scrub" ? guide.direction : null;
    const safe = isRecord(requirements)
      ? requirements
      : calculateScrubRequirements();
    const horizontal = direction === "left" || direction === "right";
    const signedPrimaryDistanceDp = direction === "left"
      ? -deltaX
      : (direction === "right"
        ? deltaX
        : (direction === "up" ? -deltaY : deltaY));
    const primaryDistanceDp = Math.max(0, signedPrimaryDistanceDp);
    const crossAxisDistanceDp = Math.abs(horizontal ? deltaY : deltaX);
    const directionMatches = Boolean(direction) && signedPrimaryDistanceDp > 0;
    const durationMatches = responseWindowAllowsElapsed(safe.responseWindowMs, elapsedMs);
    const travelMatches = isFiniteNumber(travelDp)
      && travelDp >= safe.effectiveMinTravelDp;
    const reversalsMatch = isFiniteNumber(reversalCount)
      && reversalCount >= safe.requiredReversals;
    const matches = directionMatches
      && durationMatches
      && travelMatches
      && reversalsMatch;
    return Object.freeze({
      matches,
      mode: matches ? "scrub" : null,
      direction,
      primaryDistanceDp,
      crossAxisDistanceDp,
      travelDp,
      reversalCount,
      elapsedMs,
      directionMatches,
      durationMatches,
      travelMatches,
      reversalsMatch,
    });
  }

  function calculateContinuousSwipeRequirements(
    minTravelDp,
    idleTimeoutMs,
    confidenceThreshold,
  ) {
    const baseTravelDp = positiveNumber(
      minTravelDp,
      DEFAULT_CONTINUOUS_SWIPE_TRAVEL_DP,
      8,
      160,
    );
    const tolerance = normalizeConfidenceThreshold(
      confidenceThreshold,
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
    const configuredIdleTimeoutMs = positiveNumber(
      idleTimeoutMs,
      DEFAULT_CONTINUOUS_SWIPE_IDLE_TIMEOUT_MS,
      100,
      500,
    );
    return Object.freeze({
      confidenceThreshold: tolerance,
      baseTravelDp,
      effectiveMinTravelDp: baseTravelDp * tolerance,
      // v1.0 content emitted 180ms and 360ms before turn-pause tuning. Keep
      // those contracts playable while allowing a natural held-finger turn.
      idleTimeoutMs: Math.max(
        MIN_CONTINUOUS_SWIPE_TURN_GRACE_MS,
        configuredIdleTimeoutMs,
      ),
      reversalCosine: CONTINUOUS_SWIPE_REVERSAL_COSINE,
      pointerJitterDp: POINTER_JITTER_DP,
    });
  }

  function evaluateContinuousSwipeReturn(
    firstDirectionX,
    firstDirectionY,
    returnX,
    returnY,
    requirements,
  ) {
    const safe = isRecord(requirements)
      ? requirements
      : calculateContinuousSwipeRequirements();
    const firstDistanceDp = Math.hypot(firstDirectionX, firstDirectionY);
    const returnDistanceDp = Math.hypot(returnX, returnY);
    const directionCosine = firstDistanceDp > 0 && returnDistanceDp > 0
      ? ((firstDirectionX * returnX) + (firstDirectionY * returnY))
        / (firstDistanceDp * returnDistanceDp)
      : 1;
    const distanceMatches = returnDistanceDp >= safe.effectiveMinTravelDp;
    const directionMatches = directionCosine <= safe.reversalCosine;
    return Object.freeze({
      matches: distanceMatches && directionMatches,
      firstDistanceDp,
      returnDistanceDp,
      directionCosine,
      distanceMatches,
      directionMatches,
    });
  }

  function normalizePinchDirection(value) {
    if (value === undefined || value === null) return "inward";
    if (value !== "inward" && value !== "outward") {
      throw new TypeError("pinch_direction must be inward or outward.");
    }
    return value;
  }

  function calculatePinchRequirements(minScaleDelta, responseWindowMs, confidenceThreshold, direction) {
    // Older published specs still request a 20% (or greater) contraction.
    // Apply the easy-input policy in the recognizer, not just new-cue defaults.
    const baseScaleDelta = Math.min(
      DEFAULT_PINCH_SCALE_DELTA,
      positiveNumber(minScaleDelta, DEFAULT_PINCH_SCALE_DELTA, 0.02, 0.9),
    );
    const safeResponseWindowMs = responseWindowNumber(
      responseWindowMs,
      DEFAULT_PINCH_WINDOW_MS,
      100,
      MAX_RESPONSE_WINDOW_MS,
    );
    const tolerance = normalizeConfidenceThreshold(
      confidenceThreshold,
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
    return Object.freeze({
      direction: normalizePinchDirection(direction),
      confidenceThreshold: tolerance,
      baseScaleDelta,
      effectiveMinScaleDelta: baseScaleDelta * tolerance,
      effectiveMinTravelDp: PINCH_TRAVEL_DP * tolerance,
      responseWindowMs: safeResponseWindowMs,
    });
  }

  function evaluatePinchGesture(startDistanceDp, currentDistanceDp, elapsedMs, requirements) {
    const safe = isRecord(requirements)
      ? requirements
      : calculatePinchRequirements();
    const validDistances = isFiniteNumber(startDistanceDp) && startDistanceDp > 0
      && isFiniteNumber(currentDistanceDp) && currentDistanceDp >= 0;
    const directionMultiplier = safe.direction === "outward" ? -1 : 1;
    const scaleDelta = validDistances
      ? directionMultiplier * (1 - (currentDistanceDp / startDistanceDp))
      : 0;
    const travelDp = validDistances ? directionMultiplier * (startDistanceDp - currentDistanceDp) : 0;
    // Either a small proportional movement in the chosen direction or a few pixels is enough,
    // independent of the initial spacing. Only sub-pixel jitter is excluded.
    const requiredTravelDp = validDistances
      ? Math.max(PINCH_NOISE_DP, Math.min(
        startDistanceDp * safe.effectiveMinScaleDelta,
        safe.effectiveMinTravelDp,
      ))
      : Infinity;
    const durationMatches = responseWindowAllowsElapsed(safe.responseWindowMs, elapsedMs);
    return Object.freeze({
      matches: validDistances && durationMatches && travelDp >= requiredTravelDp,
      scaleDelta,
      travelDp,
      requiredTravelDp,
      elapsedMs,
      durationMatches,
    });
  }

  function calculateCircleRequirements(
    minRadiusDp,
    maxClosureGapDp,
    responseWindowMs,
    confidenceThreshold,
    rotationDirection,
  ) {
    const baseMinRadiusDp = positiveNumber(minRadiusDp, DEFAULT_CIRCLE_RADIUS_DP, 4, 512);
    const baseMaxClosureGapDp = positiveNumber(
      maxClosureGapDp,
      DEFAULT_CIRCLE_CLOSURE_GAP_DP,
      4,
      512,
    );
    const safeResponseWindowMs = responseWindowNumber(
      responseWindowMs,
      DEFAULT_DRAW_WINDOW_MS,
      100,
      MAX_RESPONSE_WINDOW_MS,
    );
    const tolerance = normalizeConfidenceThreshold(
      confidenceThreshold,
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
    return Object.freeze({
      confidenceThreshold: tolerance,
      baseMinRadiusDp,
      // Radius and closure are legacy wire metadata, no longer success gates.
      effectiveMinRadiusDp: 0,
      baseMaxClosureGapDp,
      effectiveMaxClosureGapDp: Infinity,
      effectiveMinRotationDeg: MIN_CIRCLE_ROTATION_DEG * tolerance,
      minDirectionConsistency: CIRCLE_DIRECTION_CONSISTENCY,
      rotationDirection: rotationDirection === "clockwise" ? "clockwise" : "counterclockwise",
      responseWindowMs: safeResponseWindowMs,
    });
  }

  function normalizeAngleRadians(value) {
    let result = value;
    while (result > Math.PI) result -= Math.PI * 2;
    while (result < -Math.PI) result += Math.PI * 2;
    return result;
  }

  function resampleCirclePath(path) {
    const distances = [0];
    for (let index = 1; index < path.length; index += 1) {
      distances.push(distances[index - 1] + Math.hypot(
        path[index].x - path[index - 1].x,
        path[index].y - path[index - 1].y,
      ));
    }
    const travel = distances[distances.length - 1];
    if (!(travel > 0)) return [];
    let segment = 1;
    const samples = [];
    for (let index = 0; index < CIRCLE_PATH_SAMPLES; index += 1) {
      const distance = travel * index / (CIRCLE_PATH_SAMPLES - 1);
      while (segment < path.length - 1 && distances[segment] < distance) segment += 1;
      const length = distances[segment] - distances[segment - 1];
      const ratio = length > 0 ? (distance - distances[segment - 1]) / length : 0;
      samples.push({
        x: path[segment - 1].x + (path[segment].x - path[segment - 1].x) * ratio,
        y: path[segment - 1].y + (path[segment].y - path[segment - 1].y) * ratio,
      });
    }
    // Equal-distance samples and light smoothing prevent a slow section or
    // touch sampling jitter from dominating the shape's turning direction.
    return samples.map(function smoothPoint(point, index) {
      if (index === 0 || index === samples.length - 1) return point;
      return {
        x: (samples[index - 1].x + point.x * 2 + samples[index + 1].x) / 4,
        y: (samples[index - 1].y + point.y * 2 + samples[index + 1].y) / 4,
      };
    });
  }

  function evaluateCircleGesture(points, elapsedMs, requirements) {
    const safe = isRecord(requirements)
      ? requirements
      : calculateCircleRequirements();
    const rawPath = Array.isArray(points)
      ? points.filter(function validPoint(point) {
        return isRecord(point) && isFiniteNumber(point.x) && isFiniteNumber(point.y);
      })
      : [];
    const path = rawPath.length >= 5 ? resampleCirclePath(rawPath) : [];
    if (path.length < 5) {
      return Object.freeze({
        matches: false,
        radiusDp: 0,
        closureGapDp: Infinity,
        rotationDeg: 0,
        turningDeg: 0,
        directionConsistency: 0,
        elapsedMs,
      });
    }
    const center = path.reduce(function sumPoint(total, point) {
      return { x: total.x + point.x, y: total.y + point.y };
    }, { x: 0, y: 0 });
    center.x /= path.length;
    center.y /= path.length;
    const radii = path.map(function radiusForPoint(point) {
      return Math.hypot(point.x - center.x, point.y - center.y);
    });
    const radiusDp = radii.reduce(function sumRadius(total, radius) {
      return total + radius;
    }, 0) / radii.length;
    let signedRotationRadians = 0;
    for (let index = 1; index < path.length; index += 1) {
      const previous = Math.atan2(path[index - 1].y - center.y, path[index - 1].x - center.x);
      const current = Math.atan2(path[index].y - center.y, path[index].x - center.x);
      signedRotationRadians += normalizeAngleRadians(current - previous);
    }
    const rotationDeg = Math.abs(signedRotationRadians * 180 / Math.PI);
    let signedTurning = 0;
    let totalTurning = 0;
    let previousDirection = null;
    let twiceArea = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    path.forEach(function measurePoint(point, index) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
      const next = path[(index + 1) % path.length];
      // Relative coordinates keep the shape stable at any screen position.
      twiceArea += (point.x - center.x) * (next.y - center.y)
        - (next.x - center.x) * (point.y - center.y);
      if (index === 0) return;
      const dx = point.x - path[index - 1].x;
      const dy = point.y - path[index - 1].y;
      if (Math.hypot(dx, dy) < 1e-9) return;
      const direction = Math.atan2(dy, dx);
      if (previousDirection !== null) {
        const turn = normalizeAngleRadians(direction - previousDirection);
        signedTurning += turn;
        totalTurning += Math.abs(turn);
      }
      previousDirection = direction;
    });
    const span = Math.max(maxX - minX, maxY - minY);
    const turningDeg = Math.abs(signedTurning * 180 / Math.PI);
    const directionConsistency = totalTurning > 0 ? Math.abs(signedTurning) / totalTurning : 0;
    const areaRatio = span > 0 ? Math.abs(twiceArea) / (2 * span * span) : 0;
    const first = path[0];
    const last = path[path.length - 1];
    const closureGapDp = Math.hypot(last.x - first.x, last.y - first.y);
    const durationMatches = responseWindowAllowsElapsed(safe.responseWindowMs, elapsedMs);
    const radiusMatches = true;
    const closureMatches = true;
    const rotationMatches = turningDeg >= safe.effectiveMinRotationDeg;
    const rotationDirection = signedTurning >= 0 ? "clockwise" : "counterclockwise";
    const consistencyMatches = directionConsistency >= safe.minDirectionConsistency;
    const rotationDirectionMatches = rotationDirection === safe.rotationDirection;
    const directionMatches = consistencyMatches && rotationDirectionMatches;
    // This is a normalized shape/noise check, not a radius or aspect-ratio gate.
    // An open arc, oval or imperfect loop passes; a line/retraced line does not.
    const shapeMatches = span > PINCH_NOISE_DP && areaRatio >= 0.015;
    return Object.freeze({
      matches: durationMatches && rotationMatches && directionMatches && shapeMatches,
      radiusDp,
      closureGapDp,
      rotationDeg,
      turningDeg,
      directionConsistency,
      rotationDirection,
      expectedRotationDirection: safe.rotationDirection,
      rotationDirectionMatches,
      areaRatio,
      elapsedMs,
      durationMatches,
      radiusMatches,
      closureMatches,
      rotationMatches,
      directionMatches,
      shapeMatches,
    });
  }

  function calculateEraseRequirements(minTravelDp, responseWindowMs, confidenceThreshold) {
    const baseTravelDp = positiveNumber(minTravelDp, DEFAULT_ERASE_TRAVEL_DP, 16, 2048);
    const safeResponseWindowMs = responseWindowNumber(
      responseWindowMs,
      DEFAULT_ERASE_WINDOW_MS,
      100,
      MAX_RESPONSE_WINDOW_MS,
    );
    const tolerance = normalizeConfidenceThreshold(
      confidenceThreshold,
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
    return Object.freeze({
      confidenceThreshold: tolerance,
      baseTravelDp,
      effectiveMinTravelDp: baseTravelDp * tolerance,
      requiredReversals: REQUIRED_REVERSALS,
      responseWindowMs: safeResponseWindowMs,
    });
  }

  function evaluateEraseGesture(travelDp, reversalCount, elapsedMs, requirements) {
    const safe = isRecord(requirements)
      ? requirements
      : calculateEraseRequirements();
    const durationMatches = responseWindowAllowsElapsed(safe.responseWindowMs, elapsedMs);
    const travelMatches = isFiniteNumber(travelDp)
      && travelDp >= safe.effectiveMinTravelDp;
    const reversalsMatch = isFiniteNumber(reversalCount)
      && reversalCount >= safe.requiredReversals;
    return Object.freeze({
      matches: durationMatches && travelMatches && reversalsMatch,
      travelDp,
      reversalCount,
      elapsedMs,
      durationMatches,
      travelMatches,
      reversalsMatch,
    });
  }

  function angularDeltaDegrees(current, baseline) {
    if (!isFiniteNumber(current) || !isFiniteNumber(baseline)) return 0;
    let delta = current - baseline;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  }

  function calculateMotionRequirements(cueOrType, detection) {
    const cue = isRecord(cueOrType) ? cueOrType : null;
    const type = normalizeInteractionType(cue ? cue.type : cueOrType) || "";
    const source = isRecord(detection)
      ? detection
      : (cue && isRecord(cue.detection) ? cue.detection : {});
    const guide = guideForInteractionType(type);
    const defaults = guide && isRecord(guide.detection) ? guide.detection : {};
    const responseWindowMs = responseWindowNumber(
      source.response_window_ms,
      defaults.response_window_ms || DEFAULT_MOTION_WINDOW_MS,
      MIN_RESPONSE_WINDOW_MS,
      MAX_RESPONSE_WINDOW_MS,
    );
    const baseMinDurationMs = type === "hold_still"
      ? positiveNumber(
        source.min_duration_ms,
        defaults.min_duration_ms || 1000,
        100,
        MAX_RESPONSE_WINDOW_MS,
      )
      : 0;
    const tolerance = normalizeConfidenceThreshold(
      source.confidence_threshold,
      defaults.confidence_threshold || DEFAULT_CONFIDENCE_THRESHOLD,
    );
    const baseMaxMotionScore = positiveNumber(
      source.max_motion_score,
      DEFAULT_MAX_MOTION_SCORE,
      1,
      100,
    );
    const defaultAngle = type === "rotate"
      ? DEFAULT_MIN_ROTATE_ANGLE_DEG
      : DEFAULT_MIN_TILT_ANGLE_DEG;
    const baseMinAngleDeg = positiveNumber(source.min_angle_deg, defaultAngle, 1, 360);
    const baseMinShakeScore = positiveNumber(
      source.min_shake_score,
      DEFAULT_MIN_SHAKE_SCORE,
      1,
      100,
    );
    return Object.freeze({
      type,
      confidenceThreshold: tolerance,
      responseWindowMs,
      baseMinDurationMs,
      effectiveStableDurationMs: baseMinDurationMs * tolerance,
      baseMaxMotionScore,
      effectiveMaxMotionScore: Math.min(100, baseMaxMotionScore / tolerance),
      baseMinAngleDeg,
      effectiveMinAngleDeg: baseMinAngleDeg * tolerance,
      baseMinShakeScore,
      effectiveMinShakeScore: baseMinShakeScore * tolerance,
      requiredReversals: REQUIRED_REVERSALS,
    });
  }

  function calculateMotionSampleScore(previous, current) {
    if (!isRecord(previous) || !isRecord(current)) return 0;
    const elapsedMs = isFiniteNumber(current.timestamp) && isFiniteNumber(previous.timestamp)
      ? Math.max(8, current.timestamp - previous.timestamp)
      : 16;
    const angularTravelDeg = Math.hypot(
      angularDeltaDegrees(current.alpha, previous.alpha),
      angularDeltaDegrees(current.beta, previous.beta),
      angularDeltaDegrees(current.gamma, previous.gamma),
    );
    const angularVelocityDegPerSecond = angularTravelDeg * 1000 / elapsedMs;
    return clamp(angularVelocityDegPerSecond / 1.2, 0, 100);
  }

  function evaluateTiltGesture(cueOrType, baseline, current, requirements) {
    const type = normalizeInteractionType(isRecord(cueOrType) ? cueOrType.type : cueOrType);
    const safe = isRecord(requirements)
      ? requirements
      : calculateMotionRequirements(type);
    const rollDeltaDeg = angularDeltaDegrees(
      isRecord(current) ? current.gamma : undefined,
      isRecord(baseline) ? baseline.gamma : undefined,
    );
    const pitchDeltaDeg = angularDeltaDegrees(
      isRecord(current) ? current.beta : undefined,
      isRecord(baseline) ? baseline.beta : undefined,
    );
    // Web DeviceOrientation beta is positive when the top edge moves toward
    // the viewer. ExperienceSpec v1.10 names directions from the user's point
    // of view: forward pushes the top edge away; backward pulls it closer.
    // v1.9 retains the original beta-sign naming so already-published content
    // continues to perform the same physical movement.
    const userRelativeTilt = isRecord(cueOrType)
      ? cueOrType.tilt_semantics === USER_RELATIVE_TILT_SEMANTICS
      : true;
    const axisDeltaDeg = type === "tilt_forward" || type === "tilt_backward"
      ? pitchDeltaDeg
      : rollDeltaDeg;
    const signedAngleDeg = type === "tilt_left"
      ? -rollDeltaDeg
      : type === "tilt_right"
        ? rollDeltaDeg
        : type === "tilt_forward"
          ? (userRelativeTilt ? -pitchDeltaDeg : pitchDeltaDeg)
          : (type === "tilt_backward"
            ? (userRelativeTilt ? pitchDeltaDeg : -pitchDeltaDeg)
            : 0);
    return Object.freeze({
      matches: signedAngleDeg >= safe.effectiveMinAngleDeg,
      type,
      rollDeltaDeg,
      pitchDeltaDeg,
      axisDeltaDeg,
      signedAngleDeg,
    });
  }

  function rotationTravelDeltaDegrees(current, baseline, direction) {
    const delta = angularDeltaDegrees(current, baseline);
    return direction === "counterclockwise" ? -delta : delta;
  }

  function evaluateRotateGesture(rotationTravelDeg, requirements) {
    const safe = isRecord(requirements)
      ? requirements
      : calculateMotionRequirements("rotate");
    const travel = isFiniteNumber(rotationTravelDeg) ? rotationTravelDeg : 0;
    return Object.freeze({
      matches: travel >= safe.effectiveMinAngleDeg,
      rotationTravelDeg: travel,
    });
  }

  function evaluateShakeGesture(shakeScore, reversalCount, requirements) {
    const safe = isRecord(requirements)
      ? requirements
      : calculateMotionRequirements("shake");
    const score = isFiniteNumber(shakeScore) ? clamp(shakeScore, 0, 100) : 0;
    const reversals = isFiniteNumber(reversalCount) ? reversalCount : 0;
    return Object.freeze({
      matches: score >= safe.effectiveMinShakeScore
        && reversals >= safe.requiredReversals,
      shakeScore: score,
      reversalCount: reversals,
    });
  }

  function calculateCameraMotionScore(detail) {
    const source = isRecord(detail) ? detail : {};
    if (isFiniteNumber(source.motion_score)) return clamp(source.motion_score, 0, 100);
    if (isFiniteNumber(source.motionScore)) return clamp(source.motionScore, 0, 100);
    if (isFiniteNumber(source.motionLevel)) {
      // Native motionLevel is mean normalized luma delta. A 25% frame delta
      // represents the top of the useful gesture range, so calibrate it to 100.
      return clamp(source.motionLevel * 400, 0, 100);
    }
    return 0;
  }

  function calculateCameraRequirements(minMotionScore, responseWindowMs, confidenceThreshold) {
    const baseMinMotionScore = positiveNumber(
      minMotionScore,
      DEFAULT_MIN_MOTION_SCORE,
      1,
      100,
    );
    const baseResponseWindowMs = responseWindowNumber(
      responseWindowMs,
      5000,
      MIN_RESPONSE_WINDOW_MS,
      MAX_RESPONSE_WINDOW_MS,
    );
    const tolerance = normalizeConfidenceThreshold(
      confidenceThreshold,
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
    return Object.freeze({
      confidenceThreshold: tolerance,
      baseMinMotionScore,
      effectiveMinMotionScore: baseMinMotionScore * tolerance,
      responseWindowMs: baseResponseWindowMs,
      requiredConsecutiveFrames: 2,
    });
  }

  /** Effective sustained duration is min_duration_ms × confidence_threshold. */
  function calculateLongPressDuration(minDurationMs, confidenceThreshold) {
    const durationMs = positiveNumber(
      minDurationMs,
      DEFAULT_LONG_PRESS_DURATION_MS,
      100,
      MAX_RESPONSE_WINDOW_MS,
    );
    const tolerance = normalizeConfidenceThreshold(
      confidenceThreshold,
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
    return durationMs * tolerance;
  }

  /** Effective voice requirements are nominal minima × confidence_threshold. */
  function calculateVoiceRequirements(minVolumeScore, minDurationMs, confidenceThreshold) {
    const baseVolumeScore = isFiniteNumber(minVolumeScore) && minVolumeScore > 0
      ? clamp(minVolumeScore, 1, 100)
      : DEFAULT_MIN_VOLUME_SCORE;
    const baseDurationMs = positiveNumber(
      minDurationMs,
      DEFAULT_VOICE_DURATION_MS,
      100,
      MAX_RESPONSE_WINDOW_MS,
    );
    const tolerance = normalizeConfidenceThreshold(
      confidenceThreshold,
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
    return Object.freeze({
      confidenceThreshold: tolerance,
      baseVolumeScore,
      baseDurationMs,
      effectiveMinVolumeScore: baseVolumeScore * tolerance,
      effectiveDurationMs: baseDurationMs * tolerance,
    });
  }

  function calculateQuietRequirements(maxVolumeScore, minDurationMs, confidenceThreshold) {
    const baseMaxVolumeScore = positiveNumber(
      maxVolumeScore,
      DEFAULT_MAX_VOLUME_SCORE,
      1,
      100,
    );
    const baseDurationMs = positiveNumber(
      minDurationMs,
      DEFAULT_VOICE_DURATION_MS,
      100,
      MAX_RESPONSE_WINDOW_MS,
    );
    const tolerance = normalizeConfidenceThreshold(
      confidenceThreshold,
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
    return Object.freeze({
      confidenceThreshold: tolerance,
      baseMaxVolumeScore,
      effectiveMaxVolumeScore: Math.min(100, baseMaxVolumeScore / tolerance),
      baseDurationMs,
      effectiveDurationMs: baseDurationMs * tolerance,
    });
  }

  function calculateVoiceThresholds(effectiveMinVolumeScore) {
    const startScore = isFiniteNumber(effectiveMinVolumeScore)
      ? clamp(effectiveMinVolumeScore, 1, 100)
      : DEFAULT_MIN_VOLUME_SCORE;
    return Object.freeze({
      startScore,
      holdScore: Math.max(0, startScore - VOICE_HOLD_MARGIN_SCORE),
    });
  }

  /**
   * Current native hosts emit an input-normalized 0..100 score. Older hosts only expose
   * linear PCM amplitudes, so retain the historical -60..-17 dBFS mapping as a compatibility
   * fallback. Peak is diagnostic only: a handling click must not qualify as sustained sound.
   */
  function calculateVoiceScore(detail) {
    const source = isRecord(detail) ? detail : {};
    if (isFiniteNumber(source.score)) return clamp(source.score, 0, 100);
    if (isFiniteNumber(source.volume_score)) return clamp(source.volume_score, 0, 100);
    const rms = isFiniteNumber(source.rms)
      ? clamp(source.rms, 0, 1)
      : (isFiniteNumber(source.level) ? clamp(source.level, 0, 1) : 0);
    if (rms <= 0) return 0;
    const dbfs = 20 * Math.log10(Math.max(rms, 0.00001));
    return clamp(((dbfs + 60) / 43) * 100, 0, 100);
  }

  function calculateMicrophoneFeatures(detail) {
    const source = isRecord(detail) ? detail : {};
    const volumeScore = calculateVoiceScore(source);
    const instantScore = isFiniteNumber(source.instant_score)
      ? clamp(source.instant_score, 0, 100)
      : volumeScore;
    const peakScore = isFiniteNumber(source.peak_score)
      ? clamp(source.peak_score, 0, 100)
      : volumeScore;
    const transientScore = isFiniteNumber(source.transient_score)
      ? clamp(source.transient_score, 0, 100)
      : 0;
    const noiseScore = isFiniteNumber(source.noise_score)
      ? clamp(source.noise_score, 0, 100)
      : 0;
    const lowFrequencyRatio = isFiniteNumber(source.low_frequency_ratio)
      ? clamp(source.low_frequency_ratio, 0, 1)
      : 0;
    const pitchHz = isFiniteNumber(source.pitch_hz)
      ? clamp(source.pitch_hz, 0, 2000)
      : 0;
    const pitchConfidence = isFiniteNumber(source.pitch_confidence)
      ? clamp(source.pitch_confidence, 0, 100)
      : 0;
    return Object.freeze({
      volumeScore,
      instantScore,
      peakScore,
      transientScore,
      noiseScore,
      lowFrequencyRatio,
      pitchHz,
      pitchConfidence,
      rmsDbfs: isFiniteNumber(source.rms_dbfs)
        ? clamp(source.rms_dbfs, -96, 0)
        : null,
      processingProfile: typeof source.processing_profile === "string"
        ? source.processing_profile
        : "legacy",
      echoCancelerAvailable: source.echo_canceler_available === true,
      echoCancelerEnabled: source.echo_canceler_enabled === true,
      normalizationReady: source.normalization_ready !== false,
      calibrationProgress: isFiniteNumber(source.calibration_progress)
        ? clamp(source.calibration_progress, 0, 1)
        : 1,
      noiseFloorDbfs: isFiniteNumber(source.noise_floor_dbfs)
        ? source.noise_floor_dbfs
        : null,
      signalToNoiseDb: isFiniteNumber(source.signal_to_noise_db)
        ? source.signal_to_noise_db
        : null,
      hasTransientFeatures: isFiniteNumber(source.peak_score)
        && isFiniteNumber(source.transient_score),
      hasNoiseFeatures: isFiniteNumber(source.noise_score),
      hasLowFrequencyFeatures: isFiniteNumber(source.low_frequency_ratio),
      hasPitchFeatures: isFiniteNumber(source.pitch_hz)
        && isFiniteNumber(source.pitch_confidence),
    });
  }

  function calculateBlowScore(featuresOrDetail, cueOrType) {
    const features = isRecord(featuresOrDetail)
      && isFiniteNumber(featuresOrDetail.volumeScore)
      ? featuresOrDetail
      : calculateMicrophoneFeatures(featuresOrDetail);
    if (!features.hasNoiseFeatures) return features.volumeScore;
    const profile = isContinuousBlowCue(cueOrType)
      ? MIC_DETECTOR_PROFILES.mic_blow_continuous
      : MIC_DETECTOR_PROFILES.mic_blow;
    return clamp(
      features.volumeScore
        + features.noiseScore * profile.noiseBoost,
      0,
      100,
    );
  }

  function isBlowNoiseQualified(features, signalActive, cueOrType) {
    if (isContinuousBlowCue(cueOrType)) return true;
    if (!features.hasNoiseFeatures) return true;
    const profile = MIC_DETECTOR_PROFILES.mic_blow;
    const noiseThreshold = signalActive
      ? profile.minimumNoiseHoldScore
      : profile.minimumNoiseStartScore;
    const noiseQualified = features.noiseScore >= noiseThreshold;
    return noiseQualified;
  }

  function continuousMicrophoneTargetBand(
    targetScore,
    tolerancePoints = CONTINUOUS_MICROPHONE_TOLERANCE_POINTS,
  ) {
    const normalizedTargetScore = clamp(targetScore, 0, 100);
    const normalizedTolerancePoints = clamp(tolerancePoints, 0, 100);
    return Object.freeze({
      targetScore: normalizedTargetScore,
      tolerancePoints: normalizedTolerancePoints,
      minimumScore: clamp(
        normalizedTargetScore - normalizedTolerancePoints,
        0,
        100,
      ),
      maximumScore: clamp(
        normalizedTargetScore + normalizedTolerancePoints,
        0,
        100,
      ),
    });
  }

  function continuousVoiceTarget(features, activationThreshold) {
    const profile = MIC_DETECTOR_PROFILES.mic_level_continuous;
    const fallbackProfile = features.echoCancelerEnabled !== true;
    const normalizedDbfsAvailable = isFiniteNumber(features.rmsDbfs);
    const pitchAvailable = features.hasPitchFeatures === true;
    const targetScore = pitchAvailable
      ? profile.pitchTargetScore
      : (normalizedDbfsAvailable
        ? (fallbackProfile
          ? profile.fallbackInteractionTargetScore
          : profile.interactionTargetScore)
        : (fallbackProfile
          ? Math.max(
            activationThreshold,
            profile.fallbackLegacyInteractionTargetScore,
          )
          : Math.max(
            activationThreshold,
            profile.legacyInteractionTargetScore,
          )));
    return Object.freeze({
      ...continuousMicrophoneTargetBand(
        targetScore,
        pitchAvailable
          ? profile.pitchTolerancePoints
          : CONTINUOUS_MICROPHONE_TOLERANCE_POINTS,
      ),
      signalToNoiseDb: fallbackProfile
        ? profile.fallbackSignalToNoiseDb
        : profile.minimumSignalToNoiseDb,
      fallbackProfile,
      normalizedDbfsAvailable,
      pitchAvailable,
    });
  }

  function calculateContinuousVoiceScore(featuresOrDetail) {
    const features = isRecord(featuresOrDetail)
      && isFiniteNumber(featuresOrDetail.volumeScore)
      ? featuresOrDetail
      : calculateMicrophoneFeatures(featuresOrDetail);
    if (features.hasPitchFeatures) {
      if (!isFiniteNumber(features.signalToNoiseDb)) return 0;
      const profile = MIC_DETECTOR_PROFILES.mic_level_continuous;
      if (features.pitchConfidence < profile.minimumPitchConfidence) return 0;
      const minimumSignalToNoiseDb = features.echoCancelerEnabled === true
        ? profile.minimumSignalToNoiseDb
        : profile.fallbackSignalToNoiseDb;
      if (features.signalToNoiseDb < minimumSignalToNoiseDb) return 0;
      return clamp(
        Math.log(features.pitchHz / CONTINUOUS_VOICE_MINIMUM_PITCH_HZ)
          / Math.log(
            CONTINUOUS_VOICE_MAXIMUM_PITCH_HZ /
              CONTINUOUS_VOICE_MINIMUM_PITCH_HZ,
          ) * 100,
        0,
        100,
      );
    }
    if (!isFiniteNumber(features.rmsDbfs)) return features.volumeScore;
    return clamp(
      (features.rmsDbfs - CONTINUOUS_VOICE_FLOOR_DBFS)
        / (CONTINUOUS_VOICE_CEILING_DBFS - CONTINUOUS_VOICE_FLOOR_DBFS)
        * 100,
      0,
      100,
    );
  }

  function calculateContinuousBlowScore(featuresOrDetail) {
    const features = isRecord(featuresOrDetail)
      && isFiniteNumber(featuresOrDetail.volumeScore)
      ? featuresOrDetail
      : calculateMicrophoneFeatures(featuresOrDetail);
    return features.volumeScore;
  }

  function continuousBlowTarget(features) {
    const profile = MIC_DETECTOR_PROFILES.mic_blow_continuous;
    const fallbackProfile = features.echoCancelerEnabled !== true;
    return Object.freeze({
      ...continuousMicrophoneTargetBand(profile.interactionTargetScore),
      fallbackProfile,
    });
  }

  function isContinuousMicrophoneScoreInBand(score, target) {
    return isFiniteNumber(score)
      && isRecord(target)
      && score >= target.minimumScore
      && score <= target.maximumScore;
  }

  function isContinuousVoiceQualified(features, target, scoreOverride) {
    const score = isFiniteNumber(scoreOverride)
      ? scoreOverride
      : calculateContinuousVoiceScore(features);
    return isFiniteNumber(features.signalToNoiseDb)
      && isContinuousMicrophoneScoreInBand(score, target)
      && features.signalToNoiseDb >= target.signalToNoiseDb;
  }

  function evaluateContinuousMicrophoneEvidence(samples, now, options) {
    const source = Array.isArray(samples) ? samples : [];
    const settings = isRecord(options) ? options : {};
    const windowMs = positiveNumber(
      settings.windowMs,
      CONTINUOUS_MICROPHONE_WINDOW_MS,
      100,
      2000,
    );
    const cutoff = now - windowMs;
    const freshSamples = source.filter(function keepFreshSample(sample) {
      return sample && isFiniteNumber(sample.at) && sample.at >= cutoff;
    });
    const matchedCount = freshSamples.filter(function countMatched(sample) {
      return sample.matched === true;
    }).length;
    const matchRatio = freshSamples.length > 0
      ? matchedCount / freshSamples.length
      : 0;
    const firstSample = freshSamples[0];
    const latestMatch = [...freshSamples].reverse().find(function findMatch(sample) {
      return sample.matched === true;
    });
    const observedMs = firstSample ? Math.max(0, now - firstSample.at) : 0;
    const recentMatch = Boolean(latestMatch)
      && now - latestMatch.at <= CONTINUOUS_MICROPHONE_RECENT_EVIDENCE_MS;
    const minimumDurationMs = positiveNumber(
      settings.minimumDurationMs,
      DEFAULT_VOICE_DURATION_MS,
      100,
      MAX_RESPONSE_WINDOW_MS,
    );
    const qualified = matchedCount > 0
      && matchRatio >= CONTINUOUS_MICROPHONE_MATCH_RATIO
      && recentMatch
      && observedMs >= minimumDurationMs;
    const progress = Math.min(
      clamp(observedMs / minimumDurationMs, 0, 1),
      clamp(matchRatio / CONTINUOUS_MICROPHONE_MATCH_RATIO, 0, 1),
    );
    return Object.freeze({
      samples: freshSamples,
      qualified,
      progress,
      matchRatio,
      matchedCount,
      observedMs,
      recentMatch,
    });
  }

  function isClapOnset(features, threshold) {
    if (!features.hasTransientFeatures) return false;
    const profile = MIC_DETECTOR_PROFILES.mic_clap;
    const transientThreshold = Math.max(
      profile.minimumTransientScore,
      threshold * profile.transientThresholdRatio,
    );
    const instantThreshold = Math.max(
      profile.minimumInstantScore,
      threshold - profile.instantThresholdMargin,
    );
    return features.peakScore >= threshold
      && features.transientScore >= transientThreshold
      && features.instantScore >= instantThreshold
      && (!features.hasNoiseFeatures
        || features.noiseScore >= profile.minimumNoiseScore);
  }

  function isClapRelease(features, threshold) {
    const profile = MIC_DETECTOR_PROFILES.mic_clap;
    return features.instantScore <= Math.max(
      profile.minimumReleaseInstantScore,
      threshold * profile.releaseInstantRatio,
    ) && features.peakScore <= Math.max(
      profile.minimumReleasePeakScore,
      threshold * profile.releasePeakRatio,
    );
  }

  /** Remaining time for the total user-input window, independent from voice hold progress. */
  function calculateResponseWindowProgress(responseWindowMs, elapsedMs) {
    if (responseWindowMs === 0) {
      return Object.freeze({
        durationMs: 0,
        elapsedMs: isFiniteNumber(elapsedMs) ? Math.max(0, elapsedMs) : 0,
        remainingMs: Infinity,
        remainingRatio: 1,
        displaySeconds: Infinity,
      });
    }
    const durationMs = positiveNumber(
      responseWindowMs,
      DEFAULT_RESPONSE_WINDOW_MS,
      MIN_RESPONSE_WINDOW_MS,
      MAX_RESPONSE_WINDOW_MS,
    );
    const safeElapsedMs = isFiniteNumber(elapsedMs)
      ? clamp(elapsedMs, 0, durationMs)
      : 0;
    const remainingMs = durationMs - safeElapsedMs;
    return Object.freeze({
      durationMs,
      elapsedMs: safeElapsedMs,
      remainingMs,
      remainingRatio: remainingMs / durationMs,
      displaySeconds: Math.ceil(remainingMs / 100) / 10,
    });
  }

  function successResumeDelayMs() {
    // Success feedback owns its own display timer. Keeping playback serialized
    // behind that timer makes every paused non-microphone cue feel unresponsive.
    return 0;
  }

  function normalizeResultAction(value, ownerLabel, outcome, ownerKind) {
    const kind = ownerKind || "Interaction";
    if (!isRecord(value)) {
      throw new TypeError(
        `${kind} '${ownerLabel}' requires ${outcome} to be an Action object.`,
      );
    }
    const action = typeof value.action === "string" ? value.action.trim() : "";
    if (!RESULT_ACTIONS.has(action)) {
      throw new TypeError(
        `${kind} '${ownerLabel}' ${outcome}.action must be one of: ${[...RESULT_ACTIONS].join(", ")}.`,
      );
    }
    const expectedFields = action === "jump_video"
      ? new Set(["action", "target_video_id", "timing"])
      : (action === "end_experience"
        ? new Set(["action", "timing"])
        : new Set(["action"]));
    const unexpectedFields = Object.keys(value).filter(function findUnexpectedActionField(name) {
      return !expectedFields.has(name);
    });
    const missingFields = [...expectedFields].filter(function findMissingActionField(name) {
      return !hasOwnField(value, name);
    });
    if (unexpectedFields.length || missingFields.length) {
      const details = [
        missingFields.length ? `missing ${missingFields.join(", ")}` : "",
        unexpectedFields.length ? `unexpected ${unexpectedFields.join(", ")}` : "",
      ].filter(Boolean).join("; ");
      throw new TypeError(
        `${kind} '${ownerLabel}' ${outcome} has invalid fields for action '${action}': ${details}.`,
      );
    }
    if (action === "jump_video") {
      const targetVideoId = typeof value.target_video_id === "string"
        ? value.target_video_id.trim()
        : "";
      if (!targetVideoId) {
        throw new TypeError(
          `${kind} '${ownerLabel}' ${outcome}.target_video_id must be a non-empty video_id.`,
        );
      }
      if (typeof value.timing !== "string"
        || !RESULT_ACTION_TIMINGS.has(value.timing.trim())) {
        throw new TypeError(
          `${kind} '${ownerLabel}' ${outcome}.timing must be 'immediate' or 'video_end'.`,
        );
      }
      return {
        action,
        target_video_id: targetVideoId,
        timing: value.timing.trim(),
      };
    }
    if (action === "end_experience") {
      if (typeof value.timing !== "string"
        || !RESULT_ACTION_TIMINGS.has(value.timing.trim())) {
        throw new TypeError(
          `${kind} '${ownerLabel}' ${outcome}.timing must be 'immediate' or 'video_end'.`,
        );
      }
      return { action, timing: value.timing.trim() };
    }
    return { action };
  }

  function normalizeCue(cue, index) {
    if (!isRecord(cue)) {
      throw new TypeError(`Interaction at index ${index} must be an object.`);
    }
    const source = cue;
    const cueLabel = typeof source.id === "string" && source.id.trim()
      ? source.id.trim()
      : "";
    if (!cueLabel) {
      throw new TypeError(`Interaction at index ${index} requires a non-empty id.`);
    }
    if (hasOwnField(source, "miss_behavior")
      || hasOwnField(source, "max_replays")
      || hasOwnField(source, "transition")) {
      throw new TypeError(
        `Interaction '${cueLabel}' uses removed pre-v1.0 routing fields.`,
      );
    }
    const rejectedTopLevelFields = ["offect_time", "offset_time", "response_window_ms", "direction"]
      .filter(function rejectedTopLevelField(name) {
        return hasOwnField(source, name);
      });
    if (rejectedTopLevelFields.length) {
      throw new TypeError(
        `Interaction '${cueLabel}' uses removed field(s): ${rejectedTopLevelFields.join(", ")}.`,
      );
    }
    const rawType = typeof source.type === "string" ? source.type.trim() : "";
    const canonicalType = normalizeInteractionType(rawType);
    if (!canonicalType) {
      throw new TypeError(
        `Interaction '${cueLabel}' has unknown v1.0 type '${rawType || "<missing>"}'.`,
      );
    }
    const type = normalizeRuntimeInteractionType(canonicalType, source.detection);
    const guide = guideForInteractionType(type);
    const downgraded = type !== canonicalType;
    if (downgraded) {
      if (host && host.console && typeof host.console.warn === "function") {
        host.console.warn(
          `[PixoRuntime] Interaction type '${canonicalType}' is unavailable on this host; loading it as hold.`,
        );
      }
    }
    const normalizedDescription = typeof source.description === "string"
      ? source.description.trim()
      : "";
    // Never tell users to use a capability that this build will not activate.
    const description = downgraded
      ? String(guide.instruction || "Hold to continue")
      : (normalizedDescription || String(guide.instruction || type));
    if (!normalizedDescription && host && host.console && typeof host.console.warn === "function") {
      host.console.warn(
        `[PixoRuntime] Interaction '${cueLabel}' has no description; using '${description}'.`,
      );
    }
    if (typeof source.pause_video !== "boolean") {
      throw new TypeError(`Interaction '${cueLabel}' requires boolean pause_video.`);
    }
    if (!hasOwnField(source, "offset_time_ms")) {
      throw new TypeError(
        `Interaction '${cueLabel}' requires offset_time_ms; the field must not be omitted.`,
      );
    }
    const offsetTimeMs = source.offset_time_ms;
    if (offsetTimeMs !== null
      && (!isFiniteNumber(offsetTimeMs) || offsetTimeMs < 0)) {
      throw new TypeError(
        `Interaction '${cueLabel}' offset_time_ms must be a non-negative finite number or null.`,
      );
    }
    const hasActiveUntil = hasOwnField(source, "active_until_ms");
    const activeUntilMs = hasActiveUntil ? source.active_until_ms : null;
    if (hasActiveUntil && (!isFiniteNumber(activeUntilMs)
      || offsetTimeMs === null || activeUntilMs <= offsetTimeMs)) {
      throw new TypeError(
        `Interaction '${cueLabel}' active_until_ms must be greater than offset_time_ms.`,
      );
    }
    if (!isRecord(source.detection)) {
      throw new TypeError(`Interaction '${cueLabel}' requires detection.`);
    }
    const detectionSource = source.detection;
    if (hasOwnField(detectionSource, "tolerance_factor")) {
      throw new TypeError(
        `Interaction '${cueLabel}' must use detection.confidence_threshold.`,
      );
    }
    if (!isFiniteNumber(detectionSource.confidence_threshold)
      || detectionSource.confidence_threshold <= 0
      || detectionSource.confidence_threshold > 1) {
      throw new TypeError(
        `Interaction '${cueLabel}' requires detection.confidence_threshold in (0, 1].`,
      );
    }
    if (!isFiniteNumber(detectionSource.response_window_ms)
      || detectionSource.response_window_ms < 0) {
      throw new TypeError(
        `Interaction '${cueLabel}' requires non-negative detection.response_window_ms.`,
      );
    }
    if (typeof detectionSource.place !== "string"
      || !INTERACTION_PLACES.has(detectionSource.place.trim())) {
      throw new TypeError(
        `Interaction '${cueLabel}' requires a canonical detection.place.`,
      );
    }
    const detectionDefaults = guide.detection;
    const allowedDetectionFields = new Set(Object.keys(detectionDefaults));
    if (["camera_motion", "camera_continuous"].includes(type)) {
      allowedDetectionFields.add("vision");
    }
    const unsupportedDetectionFields = Object.keys(detectionSource)
      .filter(function unsupportedDetectionField(name) {
        return !allowedDetectionFields.has(name);
      });
    if (unsupportedDetectionFields.length
      && host
      && host.console
      && typeof host.console.warn === "function") {
      host.console.warn(
        `[PixoRuntime] Interaction '${cueLabel}' ignored unused ${type} detection field(s): ${unsupportedDetectionFields.join(", ")}.`,
      );
    }
    const compatibleDetectionSource = Object.fromEntries(
      Object.entries(detectionSource).filter(function compatibleDetectionField(entry) {
        return allowedDetectionFields.has(entry[0]);
      }),
    );
    const mergedDetection = {
      ...detectionDefaults,
      ...compatibleDetectionSource,
    };
    const responseWindowMs = responseWindowNumber(
      mergedDetection.response_window_ms,
      detectionDefaults.response_window_ms,
      0,
      MAX_RESPONSE_WINDOW_MS,
    );
    const normalizedDetection = {
      ...mergedDetection,
      confidence_threshold: mergedDetection.confidence_threshold,
      response_window_ms: responseWindowMs,
      place: compatibleDetectionSource.place.trim(),
    };
    if (isSustainedPlaybackCue(type)) {
      if (unsupportedDetectionFields.length) {
        throw new TypeError(
          `Interaction '${cueLabel}' ${type} has unsupported detection field(s): ${unsupportedDetectionFields.join(", ")}.`,
        );
      }
      if (offsetTimeMs === null) {
        throw new TypeError(
          `Interaction '${cueLabel}' ${type} must start before media end.`,
        );
      }
      if (source.pause_video !== true) {
        throw new TypeError(
          `Interaction '${cueLabel}' ${type} requires pause_video=true.`,
        );
      }
      if (responseWindowMs !== 0) {
        throw new TypeError(
          `Interaction '${cueLabel}' ${type} requires detection.response_window_ms=0.`,
        );
      }
      const sustainedPlace = isCameraContinuousCue(type) || isContinuousMicrophoneCue(type)
        ? "middle_bottom"
        : "middle_middle";
      if (normalizedDetection.place !== sustainedPlace) {
        throw new TypeError(
          `Interaction '${cueLabel}' ${type} requires detection.place='${sustainedPlace}'.`,
        );
      }
    }
    if (isContinuousSwipeCue(type)) {
      normalizedDetection.min_travel_dp = positiveNumber(
        mergedDetection.min_travel_dp,
        detectionDefaults.min_travel_dp,
        8,
        160,
      );
      normalizedDetection.idle_timeout_ms = positiveNumber(
        mergedDetection.idle_timeout_ms,
        detectionDefaults.idle_timeout_ms,
        100,
        500,
      );
    }
    if (isContinuousTapCue(type)) {
      if (mergedDetection.idle_timeout_ms !== DEFAULT_CONTINUOUS_TAP_IDLE_TIMEOUT_MS) {
        throw new TypeError(
          `Interaction '${cueLabel}' continuous_tap requires detection.idle_timeout_ms=500.`,
        );
      }
      normalizedDetection.idle_timeout_ms = DEFAULT_CONTINUOUS_TAP_IDLE_TIMEOUT_MS;
    }
    if (type === "multi_tap") {
      if (!Number.isInteger(mergedDetection.required_tap_count)
        || mergedDetection.required_tap_count < 1
        || mergedDetection.required_tap_count > 99) {
        throw new TypeError(
          `Interaction '${cueLabel}' multi_tap requires detection.required_tap_count in [1, 99].`,
        );
      }
      normalizedDetection.required_tap_count = mergedDetection.required_tap_count;
    }
    if (isCameraContinuousCue(type)) {
      if (mergedDetection.idle_timeout_ms !== DEFAULT_CAMERA_CONTINUOUS_IDLE_TIMEOUT_MS) {
        throw new TypeError(
          `Interaction '${cueLabel}' camera_continuous requires detection.idle_timeout_ms=1100.`,
        );
      }
      normalizedDetection.idle_timeout_ms = DEFAULT_CAMERA_CONTINUOUS_IDLE_TIMEOUT_MS;
    }
    if (isContinuousBlowCue(type)) {
      if (mergedDetection.idle_timeout_ms !== DEFAULT_CONTINUOUS_BLOW_IDLE_TIMEOUT_MS) {
        throw new TypeError(
          `Interaction '${cueLabel}' mic_blow_continuous requires detection.idle_timeout_ms=450.`,
        );
      }
      normalizedDetection.idle_timeout_ms = DEFAULT_CONTINUOUS_BLOW_IDLE_TIMEOUT_MS;
    }
    if (isContinuousVoiceCue(type)) {
      if (mergedDetection.idle_timeout_ms !== DEFAULT_CONTINUOUS_VOICE_IDLE_TIMEOUT_MS) {
        throw new TypeError(
          `Interaction '${cueLabel}' mic_level_continuous requires detection.idle_timeout_ms=450.`,
        );
      }
      if (mergedDetection.min_duration_ms !== 160 || mergedDetection.min_volume_score !== 45) {
        throw new TypeError(
          `Interaction '${cueLabel}' mic_level_continuous requires min_duration_ms=160 and min_volume_score=45.`,
        );
      }
      normalizedDetection.idle_timeout_ms = DEFAULT_CONTINUOUS_VOICE_IDLE_TIMEOUT_MS;
    }
    if (type === "camera_motion") {
      const vision = compatibleDetectionSource.vision;
      if (!hasSupportedVisionDetection({ vision })) {
        throw new TypeError(`Interaction '${cueLabel}' requires a supported detection.vision.target.`);
      }
      const cameraFacing = vision.camera_facing === "back" ? "back" : "front";
      const minConfidence = Number(vision.min_confidence);
      const stableForMs = Number(vision.stable_for_ms);
      normalizedDetection.vision = {
        registry_version: "v1",
        target: vision.target.trim(),
        camera_facing: cameraFacing,
        show_preview: vision.show_preview === true,
        min_confidence: isFiniteNumber(minConfidence) && minConfidence >= 0.5 && minConfidence <= 0.99
          ? minConfidence : 0.82,
        stable_for_ms: isFiniteNumber(stableForMs) && stableForMs >= 150 && stableForMs <= 3000
          ? Math.round(stableForMs) : 400,
      };
    }
    if (isCameraContinuousCue(type)) {
      const vision = compatibleDetectionSource.vision;
      if (!hasSupportedVisionDetection({ vision }, CAMERA_CONTINUOUS_TARGETS)) {
        throw new TypeError(
          `Interaction '${cueLabel}' requires a supported camera_continuous target.`,
        );
      }
      const target = vision.target.trim();
      const detectorProfile = CAMERA_CONTINUOUS_TARGET_PROFILES[target];
      if (vision.signal_kind !== undefined && vision.signal_kind !== "pulse") {
        throw new TypeError(
          `Interaction '${cueLabel}' camera_continuous signal_kind does not match target.`,
        );
      }
      if (vision.detector_profile !== undefined
        && vision.detector_profile !== detectorProfile) {
        throw new TypeError(
          `Interaction '${cueLabel}' camera_continuous detector_profile does not match target.`,
        );
      }
      normalizedDetection.vision = {
        registry_version: "v1",
        target,
        camera_facing: vision.camera_facing === "back" ? "back" : "front",
        show_preview: vision.show_preview !== false,
        signal_kind: "pulse",
        detector_profile: detectorProfile,
      };
    }
    if (hasOwnField(detectionDefaults, "min_duration_ms")) {
      normalizedDetection.min_duration_ms = positiveNumber(
        mergedDetection.min_duration_ms,
        detectionDefaults.min_duration_ms,
        100,
        MAX_RESPONSE_WINDOW_MS,
      );
      if (responseWindowMs !== 0 && normalizedDetection.min_duration_ms > responseWindowMs) {
        throw new RangeError(
          `Interaction '${cueLabel}' min_duration_ms cannot exceed response_window_ms.`,
        );
      }
    }
    if (type === "rotate" || type === "draw_circle") {
      if (!["clockwise", "counterclockwise"].includes(mergedDetection.rotation_direction)) {
        throw new TypeError(
          `Interaction '${cueLabel}' ${type} requires detection.rotation_direction to be clockwise or counterclockwise.`,
        );
      }
      normalizedDetection.rotation_direction = mergedDetection.rotation_direction;
    }
    if (type === "pinch") {
      normalizedDetection.pinch_direction = normalizePinchDirection(mergedDetection.pinch_direction);
    }
    const onSuccess = normalizeResultAction(source.on_success, cueLabel, "on_success");
    const onMiss = normalizeResultAction(source.on_miss, cueLabel, "on_miss");
    if (isSustainedPlaybackCue(type)
      && (onSuccess.action !== "continue" || onMiss.action !== "continue")) {
      throw new TypeError(
        `Interaction '${cueLabel}' ${type} requires continue for on_success and on_miss.`,
      );
    }
    return {
      ...source,
      id: cueLabel,
      type,
      description,
      guide,
      offset_time_ms: offsetTimeMs,
      active_until_ms: hasActiveUntil ? activeUntilMs : null,
      pause_video: source.pause_video,
      detection: normalizedDetection,
      on_success: onSuccess,
      on_miss: onMiss,
    };
  }

  function retryPreviousPointTargetMs(cues, cueIndex) {
    if (!Array.isArray(cues) || cueIndex <= 0) return 0;
    const previousOffset = getOffsetTimeMs(cues[cueIndex - 1]);
    return isFiniteNumber(previousOffset) ? previousOffset : 0;
  }
  function parseExperience(input) {
    let parsed = input;
    if (typeof input === "string") {
      parsed = JSON.parse(input);
    }
    if (!isRecord(parsed)) {
      throw new TypeError("Experience must be a JSON object or a JSON object string.");
    }
    return parsed;
  }

  function hasOwnField(record, name) {
    return isRecord(record) && Object.prototype.hasOwnProperty.call(record, name);
  }

  function validateInteractionOrder(cues, videoId) {
    let previousOffset = -1;
    let mediaEndCueCount = 0;
    cues.forEach(function validateCueOrder(cue, cueIndex) {
      const offset = getOffsetTimeMs(cue);
      if (offset === null) {
        mediaEndCueCount += 1;
        if (cueIndex !== cues.length - 1) {
          throw new TypeError(
            `Video '${videoId}' media-end interaction '${cue.id}' must be the final interactions[] entry.`,
          );
        }
        return;
      }
      if (offset < previousOffset) {
        throw new TypeError(
          `Video '${videoId}' interactions[] must be ordered by offset_time_ms.`,
        );
      }
      if (isFiniteNumber(cue.active_until_ms)) {
        if (!isSustainedPlaybackCue(cue)) {
          throw new TypeError(
            `Video '${videoId}' interaction '${cue.id}' may not use active_until_ms.`,
          );
        }
        if (cue.active_until_ms <= offset) {
          throw new TypeError(
            `Video '${videoId}' sustained interaction '${cue.id}' has an empty range.`,
          );
        }
        const nextOffset = cueIndex + 1 < cues.length
          ? getOffsetTimeMs(cues[cueIndex + 1])
          : null;
        if (isFiniteNumber(nextOffset) && cue.active_until_ms > nextOffset) {
          throw new TypeError(
            `Video '${videoId}' sustained interaction '${cue.id}' exceeds its next interaction.`,
          );
        }
      }
      if (isSustainedPlaybackCue(cue) && cueIndex + 1 < cues.length) {
        const nextOffset = getOffsetTimeMs(cues[cueIndex + 1]);
        if (isFiniteNumber(nextOffset) && nextOffset <= offset) {
          throw new TypeError(
            `Video '${videoId}' sustained interaction '${cue.id}' must end at a later interaction.`,
          );
        }
      }
      previousOffset = offset;
    });
    if (mediaEndCueCount > 1) {
      throw new TypeError(
        `Video '${videoId}' may declare at most one media-end interaction.`,
      );
    }
  }

  function actionTargetVideoId(action) {
    return isRecord(action) && action.action === "jump_video"
      ? action.target_video_id
      : null;
  }

  function isTimedStoryBranchCue(cue) {
    if (!isRecord(cue) || !isRecord(cue.detection)
      || !isFiniteNumber(cue.detection.response_window_ms)
      || cue.detection.response_window_ms <= 0 || isSustainedPlaybackCue(cue)) return false;
    const successTarget = actionTargetVideoId(cue.on_success);
    const missTarget = actionTargetVideoId(cue.on_miss);
    return Boolean(successTarget && missTarget && successTarget !== missTarget);
  }

  function resultActionsDiffer(cue) {
    if (!isRecord(cue) || !isRecord(cue.on_success) || !isRecord(cue.on_miss)) {
      return false;
    }
    return ["action", "target_video_id", "timing"].some(function differs(field) {
      return (cue.on_success[field] || null) !== (cue.on_miss[field] || null);
    });
  }

  function responseDeadlineForCue(cue, configuredMs) {
    if (!resultActionsDiffer(cue) || isSustainedPlaybackCue(cue)) return 0;
    return configuredMs;
  }

  function extractExperience(input) {
    const raw = parseExperience(input);
    const body = isRecord(raw.body) ? raw.body : null;
    if (!body) {
      throw new TypeError("ExperienceSpec requires a body object.");
    }
    if (Array.isArray(body.items)) {
      throw new TypeError(
        "Feed body.items[] must be unwrapped to one selected item before Runtime loading.",
      );
    }
    const specVersion = typeof body.experience_spec_version === "string"
      ? body.experience_spec_version.trim()
      : "1.0";
    if (!SUPPORTED_EXPERIENCE_SPEC_VERSIONS.has(specVersion)) {
      throw new TypeError(`Unsupported ExperienceSpec version '${specVersion}'.`);
    }
    if (typeof body.item_id !== "string" || !body.item_id.trim()) {
      throw new TypeError(`ExperienceSpec v${specVersion} requires a non-empty body.item_id.`);
    }
    if (!Array.isArray(body.video) || !body.video.length) {
      throw new TypeError(`ExperienceSpec v${specVersion} requires body.video to be a non-empty array.`);
    }
    const itemId = body.item_id.trim();
    const sourceEntries = body.video;
    const videoIds = sourceEntries.map(function requireVideoId(entry, segmentIndex) {
      if (!isRecord(entry)) {
        throw new TypeError(
          `Item '${itemId}' video at index ${segmentIndex} must be an object.`,
        );
      }
      if (typeof entry.video_id !== "string" || !entry.video_id.trim()) {
        throw new TypeError(
          `Item '${itemId}' video at index ${segmentIndex} requires a non-empty video_id.`,
        );
      }
      return entry.video_id.trim();
    });
    if (new Set(videoIds).size !== videoIds.length) {
      throw new TypeError(`Item '${itemId}' video_id values must be unique.`);
    }
    const videoIdSet = new Set(videoIds);
    const segments = sourceEntries.map(function normalizeSegment(entry, segmentIndex) {
      const videoId = videoIds[segmentIndex];
      if (hasOwnField(entry, "transition")) {
        throw new TypeError(
          `Video '${videoId}' uses removed v1.0 field transition; put every interaction in interactions[].`,
        );
      }
      if (typeof entry.video !== "string" || !entry.video.trim()) {
        throw new TypeError(`Video '${videoId}' requires a non-empty video URL.`);
      }
      if (!Array.isArray(entry.interactions)) {
        throw new TypeError(`Video '${videoId}' requires interactions[].`);
      }
      if (specVersion === "1.0" && hasOwnField(entry, "on_end")) {
        throw new TypeError(
          `Video '${videoId}' uses ExperienceSpec v1.1 field on_end in a v1.0 payload.`,
        );
      }
      const onEnd = hasOwnField(entry, "on_end")
        ? normalizeResultAction(entry.on_end, videoId, "on_end", "Video")
        : null;
      const cues = entry.interactions.map(function normalizeInteraction(interaction, interactionIndex) {
        const cue = {
          ...normalizeCue(interaction, interactionIndex),
          runtime_key: typeof interaction.id === "string" ? interaction.id.trim() : "",
        };
        if (cue.type === "tilt_forward" || cue.type === "tilt_backward") {
          cue.tilt_semantics = specVersion === "1.10"
            ? USER_RELATIVE_TILT_SEMANTICS
            : LEGACY_TILT_SEMANTICS;
        }
        return cue;
      });
      if (!["1.7", "1.8", "1.9", "1.10"].includes(specVersion) && cues.some(function outwardPinch(cue) {
        return cue.type === "pinch" && cue.detection.pinch_direction === "outward";
      })) throw new TypeError("Outward pinch requires ExperienceSpec v1.7.");
      if (!["1.8", "1.9", "1.10"].includes(specVersion) && cues.some(function v18Range(cue) {
        return isFiniteNumber(cue.active_until_ms);
      })) throw new TypeError("active_until_ms requires ExperienceSpec v1.8.");
      if (!["1.8", "1.9", "1.10"].includes(specVersion) && cues.some(function v18TouchType(cue) {
        return cue.type === "continuous_hold" || cue.type === "multi_tap";
      })) throw new TypeError("continuous_hold and multi_tap require ExperienceSpec v1.8.");
      if (!["1.9", "1.10"].includes(specVersion) && cues.some(function v19PitchType(cue) {
        return cue.type === "tilt_forward" || cue.type === "tilt_backward";
      })) throw new TypeError("tilt_forward and tilt_backward require ExperienceSpec v1.9 or later.");
      if (specVersion === "1.0" && cues.some(isContinuousSwipeCue)) {
        throw new TypeError(
          `Video '${videoId}' uses continuous_swipe in an ExperienceSpec v1.0 payload.`,
        );
      }
      if (!["1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10"].includes(specVersion)
        && cues.some(isContinuousTapCue)) {
        throw new TypeError(
          `Video '${videoId}' uses continuous_tap in an ExperienceSpec v${specVersion} payload.`,
        );
      }
      if (!["1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10"].includes(specVersion)
        && cues.some(isCameraContinuousCue)) {
        throw new TypeError(
          `Video '${videoId}' uses camera_continuous in an ExperienceSpec v${specVersion} payload.`,
        );
      }
      if (specVersion === "1.3" && cues.some(function requiresV14(cue) {
        return isCameraContinuousCue(cue)
          && cue.detection.vision.target === "hand_finger_gun_recoil";
      })) {
        throw new TypeError(
          `Video '${videoId}' uses hand_finger_gun_recoil in an ExperienceSpec v1.3 payload.`,
        );
      }
      if (!["1.5", "1.6", "1.7", "1.8", "1.9", "1.10"].includes(specVersion) && cues.some(isContinuousBlowCue)) {
        throw new TypeError(
          `Video '${videoId}' uses mic_blow_continuous in an ExperienceSpec v${specVersion} payload.`,
        );
      }
      if (!["1.6", "1.7", "1.8", "1.9", "1.10"].includes(specVersion) && cues.some(isContinuousVoiceCue)) {
        throw new TypeError(
          `Video '${videoId}' uses mic_level_continuous in an ExperienceSpec v${specVersion} payload.`,
        );
      }
      const interactionIds = cues.map(function interactionId(cue) { return cue.id; });
      if (new Set(interactionIds).size !== interactionIds.length) {
        throw new TypeError(
          `Video '${videoId}' interaction ids must be unique within that video.`,
        );
      }
      validateInteractionOrder(cues, videoId);
      return {
        index: segmentIndex,
        id: videoId,
        raw: entry,
        videoUrl: entry.video.trim(),
        title: String(entry.title || body.title || raw.title || "Interactive video"),
        description: String(entry.description || body.description || "Follow each cue to continue."),
        cues,
        onEnd,
      };
    });
    segments.forEach(function validateActionTargets(segment) {
      segment.cues.forEach(function validateCueTargets(cue) {
        ["on_success", "on_miss"].forEach(function validateOutcomeTarget(outcome) {
          const target = actionTargetVideoId(cue[outcome]);
          if (target !== null && !videoIdSet.has(target)) {
            throw new TypeError(
              `Item '${itemId}' video '${segment.id}' interaction '${cue.id}' ${outcome} targets unknown video '${target}'.`,
            );
          }
        });
      });
      const endTarget = actionTargetVideoId(segment.onEnd);
      if (endTarget !== null && !videoIdSet.has(endTarget)) {
        throw new TypeError(
          `Item '${itemId}' video '${segment.id}' on_end targets unknown video '${endTarget}'.`,
        );
      }
    });
    segments.forEach(function validateRetryOrigin(segment) {
      if (!segment.onEnd || segment.onEnd.action !== "retry_previous_point") return;
      const hasInteractionOrigin = segments.some(function hasOriginCandidate(candidate) {
        return candidate.cues.some(function cueTargetsRetrySegment(cue) {
          return [cue.on_success, cue.on_miss].some(function targetsRetrySegment(action) {
            return actionTargetVideoId(action) === segment.id;
          });
        });
      });
      if (!hasInteractionOrigin) {
        throw new TypeError(
          `Video '${segment.id}' on_end retry_previous_point requires an incoming interaction jump_video.`,
        );
      }
    });
    const firstSegment = segments[0];
    const hasExplicitRouting = segments.some(function segmentHasRoute(segment) {
      return Boolean(segment.onEnd) || segment.cues.some(function cueHasRoute(cue) {
        return ["on_success", "on_miss"].some(function outcomeHasRoute(outcome) {
          return ["jump_video", "end_experience"].includes(cue[outcome].action);
        });
      });
    });
    return {
      raw,
      head: isRecord(raw.head) ? raw.head : {},
      body,
      itemId,
      videoEntries: sourceEntries,
      segments,
      hasExplicitRouting,
      segmentIndexById: Object.fromEntries(segments.map(function mapSegmentId(segment) {
        return [segment.id, segment.index];
      })),
      totalCueCount: segments.reduce(function sumCues(total, segment) {
        return total + segment.cues.length;
      }, 0),
      videoEntry: firstSegment.raw,
      title: String(body.title || raw.title || firstSegment.title),
      description: String(body.description || firstSegment.description),
      videoUrl: firstSegment.videoUrl,
      cues: firstSegment.cues,
      specVersion,
    };
  }
  function getDomRuntime() {
    if (!host || !host.document) {
      throw new Error("Pixo Runtime DOM is unavailable in this environment.");
    }
    if (!domRuntime) domRuntime = createDomRuntime(host.document, host);
    return domRuntime;
  }

  function loadExperience(input) {
    const experience = extractExperience(input);
    if (!host || !host.document) return experience;
    return getDomRuntime().load(experience);
  }

  function seekExperience(positionMs, options) {
    if (!host || !host.document) {
      throw new Error("Experience seeking requires a browser environment.");
    }
    return getDomRuntime().seek(positionMs, options);
  }

  async function loadLocalExperience() {
    if (!host || !host.document) {
      throw new Error("Local experience loading requires a browser environment.");
    }
    if (host.__pixoHostExperienceInjected) return null;
    const response = await host.fetch("experience_local.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load local experience (${response.status}).`);
    const raw = await response.text();
    if (host.__pixoHostExperienceInjected) return null;
    return loadExperience(raw);
  }

  function showFatalError(error) {
    if (!host || !host.document) return;
    getDomRuntime().showFatal(error);
  }

  function destroy() {
    if (!domRuntime) return;
    domRuntime.destroy();
    domRuntime = null;
  }

  function getState() {
    return domRuntime ? domRuntime.getState() : { phase: "unmounted", version: VERSION };
  }

  function simulateActiveInteraction() {
    if (!domRuntime) return { status: "unavailable" };
    return domRuntime.simulateActiveInteraction();
  }

  function createDomRuntime(documentObject, windowObject) {
    const elements = {
      app: documentObject.getElementById("pixo-app"),
      video: documentObject.getElementById("experience-video"),
      videoStandbyA: documentObject.getElementById("experience-video-standby-a"),
      videoStandbyB: documentObject.getElementById("experience-video-standby-b"),
      title: documentObject.getElementById("experience-title"),
      playControl: documentObject.getElementById("play-control"),
      timelineFill: documentObject.getElementById("timeline-fill"),
      timelineMarkers: documentObject.getElementById("timeline-markers"),
      currentTime: documentObject.getElementById("current-time"),
      durationTime: documentObject.getElementById("duration-time"),
      eraseFogLayer: documentObject.getElementById("erase-fog-layer"),
      placeGrid: documentObject.getElementById("interaction-place-grid"),
      caption: documentObject.getElementById("interaction-caption"),
      interactionLayer: documentObject.getElementById("interaction-layer"),
      cueTitle: documentObject.getElementById("cue-title"),
      cueInstruction: documentObject.getElementById("cue-instruction"),
      tapCount: documentObject.getElementById("tap-count"),
      interactionGestureVisual: documentObject.getElementById("interaction-gesture-visual"),
      interactionTarget: documentObject.getElementById("interaction-target"),
      interactionLabel: documentObject.getElementById("interaction-label"),
      soundMeter: documentObject.getElementById("sound-meter"),
      soundMeterLabel: documentObject.getElementById("sound-meter-label"),
      soundMeterTargetBand: documentObject.getElementById("sound-meter-target-band"),
      soundMeterThresholdLabel: documentObject.getElementById("sound-meter-threshold-label"),
      soundMeterCurve: documentObject.getElementById("sound-meter-curve"),
      soundMeterCurrent: documentObject.getElementById("sound-meter-current"),
      voiceDebug: documentObject.getElementById("voice-debug"),
      holdMeterFill: documentObject.getElementById("hold-meter-fill"),
      cueProgressFill: documentObject.getElementById("cue-progress-fill"),
      cueCountdown: documentObject.getElementById("cue-countdown"),
      cueCountdownTime: documentObject.getElementById("cue-countdown-time"),
      cueCountdownFill: documentObject.getElementById("cue-countdown-fill"),
      startPanel: documentObject.getElementById("start-panel"),
      startTitle: documentObject.getElementById("start-title"),
      startDescription: documentObject.getElementById("start-description"),
      startButton: documentObject.getElementById("start-button"),
      completionPanel: documentObject.getElementById("completion-panel"),
      completionSummary: documentObject.getElementById("completion-summary"),
      shareButton: documentObject.getElementById("share-button"),
      replayButton: documentObject.getElementById("replay-button"),
      liveRegion: documentObject.getElementById("live-region"),
      alertRegion: documentObject.getElementById("alert-region"),
      feedback: documentObject.getElementById("feedback"),
      feedbackText: documentObject.getElementById("feedback-text"),
    };

    const initialHostMode = ["active", "prewarm", "paused"].includes(
      windowObject.__motionCueHostPlaybackMode,
    )
      ? windowObject.__motionCueHostPlaybackMode
      : (windowObject.__motionCueHostShouldPlay === false ? "paused" : "active");
    const state = {
      phase: "idle",
      experience: null,
      cueStates: new Map(),
      active: null,
      activationSequence: 0,
      started: false,
      destroyed: false,
      hostMode: initialHostMode,
      hostActive: initialHostMode === "active",
      resumePlaybackOnHostActive: false,
      authoringTransportPaused: false,
      pendingReplayTargetMs: null,
      pendingReplayMediaGeneration: -1,
      pendingSegmentStartMs: 0,
      segmentStartPending: false,
      replayScheduled: false,
      replayTimer: 0,
      segmentIndex: 0,
      mediaGeneration: 0,
      mediaReadyGeneration: -1,
      mediaPhase: "empty",
      expectedMediaUrl: "",
      pendingMediaSwap: null,
      pendingMediaActivationTimer: 0,
      mediaLoadWatchdogTimer: 0,
      mediaSwapSequence: 0,
      mediaEndDeferred: false,
      pendingResultAction: null,
      retryOrigin: null,
      completedCueCount: 0,
      frameId: 0,
      feedbackTimer: 0,
      sharePending: false,
      shareRequestToken: 0,
      inputDebounceUntil: 0,
      continuousPointerTracker: {
        pointerId: null,
        down: false,
        lastX: 0,
        lastY: 0,
        samples: [],
      },
    };

    const guidance = motionGuidance
      ? motionGuidance.create(documentObject, windowObject, elements.app, elements.caption)
      : null;
    documentObject.documentElement.setAttribute("data-pixo-guidance", guidance ? "spatial" : "legacy");

    function guidanceInsets() {
      if (currentHostLayout.guidanceViewport) return currentHostLayout.guidanceViewport;
      if (currentHostLayout.interactionViewport) return currentHostLayout.interactionViewport;
      return { top: 88, right: 16, bottom: 92, left: 16 };
    }

    function setCueProgressWidth(value) {
      elements.cueProgressFill.style.width = value;
      if (state.active) state.active.guidanceProgress = clamp(parseFloat(value) / 100, 0, 1);
    }

    function updateGuidance() {
      const active = state.active;
      if (!guidance || !active || active.resolved || !state.hostActive) return;
      const authoringSimulationAvailable = active.capabilityBlocked
        && host.__pixoRuntimeAuthoringSimulation === true;
      const now = performance.now();
      const points = Array.from(active.guidancePointers.values());
      let progress = active.guidanceProgress;
      if (isHoldCue(active.cue)) {
        progress = active.holdPointerId !== null
          ? clamp((now - active.holdStart) / active.longPressDurationMs, 0, 1) : 0;
      }
      const elapsed = active.responseElapsedMs + (active.deadlineTimer ? Math.max(0, now - active.deadlineStartedAt) : 0);
      const remainingMs = active.responseTimerInitialized && active.responseWindowMs > 0
        ? Math.max(0, active.responseWindowMs - elapsed) : null;
      const preparing = isMicrophoneCue(active.cue)
        ? !active.microphoneStarted || active.guidanceCalibrating
        : isCameraCue(active.cue) ? !active.cameraStarted : isMotionCue(active.cue) ? !active.motionStarted : false;
      guidance.render({
        points, path: active.guidancePath, origin: active.guidanceOrigin,
        lastPoint: active.guidanceLastPoint, progress, count: active.tapCount,
        hasInput: active.guidanceHasInput, driving: active.continuousDriving,
        continuousPhase: active.continuousPhase,
        preparing: preparing && !authoringSimulationAvailable,
        calibrating: active.guidanceCalibrating && !authoringSimulationAvailable,
        blocked: active.capabilityBlocked && !authoringSimulationAvailable,
        retryReady: active.cameraRetryReady && !authoringSimulationAvailable,
        level: active.guidanceLevel, meter: active.guidanceMeter,
        remainingMs, durationMs: active.responseWindowMs,
      }, now);
    }

    function trackGuidancePointer(active, event, phase) {
      if (!guidance || !active || !state.hostActive || active.resolved
        || isMicrophoneCue(active.cue) || isMotionCue(active.cue) || isCameraCue(active.cue)
        || !isFiniteNumber(event.clientX) || !isFiniteNumber(event.clientY)) return;
      const point = { x: event.clientX, y: event.clientY };
      if (phase === "down") {
        if (active.guidancePointers.has(event.pointerId)) return;
        if (isPinchCue(active.cue) && active.guidancePointers.size >= 2) return;
        if ((isSwipeCue(active.cue) || isDragCue(active.cue) || isScrubCue(active.cue)
          || isDrawCue(active.cue) || isEraseCue(active.cue) || isContinuousSwipeCue(active.cue))
          && active.guidancePointers.size > 0) return;
        if (active.guidancePointers.size === 0) {
          active.guidanceOrigin = point; active.guidancePath = [point];
        }
        active.guidancePointers.set(event.pointerId, point);
        active.guidanceHasInput = true;
      } else if (phase === "move") {
        if (!active.guidancePointers.has(event.pointerId)) return;
        active.guidancePointers.set(event.pointerId, point);
        active.guidancePath.push(point);
        if (active.guidancePath.length > 96) active.guidancePath.shift();
      } else {
        if (!active.guidancePointers.has(event.pointerId)) return;
        active.guidancePointers.delete(event.pointerId);
        if (event.type === "pointercancel") {
          active.guidanceProgress = 0; active.guidancePath = [];
        }
      }
      active.guidanceLastPoint = point;
      updateGuidance();
    }

    const legacyMediaCompositor = Boolean(
      windowObject.PixoWebCompatibility
      && windowObject.PixoWebCompatibility.legacyMediaCompositor,
    );
    const videoPlayers = legacyMediaCompositor
      ? [elements.video]
      : [elements.video, elements.videoStandbyA, elements.videoStandbyB];
    const videoRecords = new Map(videoPlayers.map(function createVideoRecord(video) {
      return [video, {
        url: "",
        ready: false,
        failed: false,
        loading: false,
        retryAttempt: 0,
        retryTimer: 0,
        retrying: false,
      }];
    }));

    function currentSegment() {
      if (!state.experience || !Array.isArray(state.experience.segments)) return null;
      return state.experience.segments[state.segmentIndex] || null;
    }

    function currentCues() {
      const segment = currentSegment();
      return segment && Array.isArray(segment.cues) ? segment.cues : [];
    }

    function cueKey(cue) {
      return cue && (cue.runtime_key || cue.id);
    }

    function firstPendingCue() {
      return currentCues().find(function findPendingCue(cue) {
        return state.cueStates.get(cueKey(cue)) === "pending";
      }) || null;
    }

    function isCurrentMediaReady() {
      return state.mediaPhase === "ready"
        && state.mediaReadyGeneration === state.mediaGeneration;
    }

    // A zero-offset cue owns playback from the first renderable video frame.
    // Keep it pending (and playback blocked) until Runtime can synchronously
    // activate it from the matching media generation.
    function isZeroOffsetCueAwaitingActivation() {
      if (state.active || !state.started || !state.experience) return false;
      const cue = firstPendingCue();
      return Boolean(cue) && getOffsetTimeMs(cue) === 0;
    }

    function playbackBlockedByInteraction() {
      return state.replayScheduled
        || isZeroOffsetCueAwaitingActivation()
        || Boolean(
          state.active
          && state.active.pausedVideo
          && (!isSustainedPlaybackCue(state.active.cue)
            || state.active.continuousDriving !== true),
        );
    }

    function requireElements() {
      const missing = Object.keys(elements).filter(function findMissing(key) { return !elements[key]; });
      if (missing.length) throw new Error(`Pixo Runtime markup is incomplete: ${missing.join(", ")}`);
    }

    function safeMediaUrl(value) {
      if (typeof value !== "string" || !value.trim()) throw new Error("Experience video URL is missing.");
      const url = new URL(value, documentObject.baseURI);
      if (!["file:", "https:", "http:", "blob:", "content:"].includes(url.protocol)) {
        throw new Error(`Unsupported video URL protocol: ${url.protocol}`);
      }
      return url.href;
    }

    function formatTime(milliseconds) {
      const seconds = Math.max(0, Math.floor(milliseconds / 1000));
      const minutes = Math.floor(seconds / 60);
      return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
    }

    function announce(message, assertive) {
      const region = assertive ? elements.alertRegion : elements.liveRegion;
      region.textContent = "";
      windowObject.requestAnimationFrame(function announceOnFrame() {
        region.textContent = message;
      });
    }

    function emitRuntimeEvent(name, detail) {
      if (typeof windowObject.CustomEvent !== "function") return;
      const segment = currentSegment();
      const media = elements && elements.video ? elements.video : null;
      const positionMs = media && Number.isFinite(Number(media.currentTime))
        ? Math.max(0, Number(media.currentTime) * 1000)
        : null;
      const durationMs = media && Number.isFinite(Number(media.duration))
        ? Math.max(0, Number(media.duration) * 1000)
        : null;
      windowObject.dispatchEvent(new windowObject.CustomEvent("pixo:runtime-event", {
        detail: {
          name,
          version: VERSION,
          specVersion: state.experience ? state.experience.specVersion : null,
          itemId: state.experience ? state.experience.itemId : null,
          videoId: segment ? segment.id : null,
          positionMs,
          durationMs,
          mediaPaused: media ? media.paused : null,
          ...(detail || {}),
        },
      }));
    }

    function markMediaLoading() {
      state.mediaReadyGeneration = -1;
      state.mediaPhase = "loading";
      elements.app.setAttribute("aria-busy", "true");
    }

    function setVideoLayer(video, layer) {
      if (!video) return;
      video.dataset.pixoVideoLayer = layer;
      if (layer === "active" || layer === "incoming") {
        video.removeAttribute("aria-hidden");
      } else {
        video.setAttribute("aria-hidden", "true");
      }
    }

    function normalizedVideoSource(video) {
      if (!video) return "";
      const source = String(video.currentSrc || video.src || "");
      if (!source) return "";
      try {
        return new URL(source, documentObject.baseURI).href;
      } catch (error) {
        return "";
      }
    }

    function videoRecordMatchesSource(video, record) {
      return Boolean(record && record.url)
        && normalizedVideoSource(video) === record.url;
    }

    function clearPendingMediaActivation() {
      if (state.pendingMediaActivationTimer) {
        windowObject.clearTimeout(state.pendingMediaActivationTimer);
        state.pendingMediaActivationTimer = 0;
      }
    }

    function clearMediaLoadWatchdog() {
      if (!state.mediaLoadWatchdogTimer) return;
      windowObject.clearTimeout(state.mediaLoadWatchdogTimer);
      state.mediaLoadWatchdogTimer = 0;
    }

    function clearVideoRetry(record) {
      if (!record) return;
      if (record.retryTimer) windowObject.clearTimeout(record.retryTimer);
      record.retryTimer = 0;
      record.retrying = false;
    }

    function resetVideoRetry(record) {
      clearVideoRetry(record);
      record.retryAttempt = 0;
    }

    function mediaFailureDetail(video, record, reason) {
      const mediaError = video && video.error;
      return {
        mediaFailureReason: reason,
        mediaErrorCode: mediaError && Number.isFinite(Number(mediaError.code))
          ? Number(mediaError.code)
          : 0,
        mediaNetworkState: video && Number.isFinite(Number(video.networkState))
          ? Number(video.networkState)
          : null,
        mediaReadyState: video && Number.isFinite(Number(video.readyState))
          ? Number(video.readyState)
          : null,
        mediaRetryCount: record ? record.retryAttempt : 0,
      };
    }

    function mediaFailureTargetsCurrentGeneration(video, record) {
      if (!video || !record || state.destroyed || !videoRecordMatchesSource(video, record)) {
        return false;
      }
      const pending = state.pendingMediaSwap;
      return video === elements.video || Boolean(
        pending
        && pending.video === video
        && pending.mediaGeneration === state.mediaGeneration
        && pending.mediaUrl === record.url,
      );
    }

    function retryOrFailCurrentMedia(video, reason) {
      const record = videoRecords.get(video);
      if (!mediaFailureTargetsCurrentGeneration(video, record)) return false;
      clearMediaLoadWatchdog();
      if (record.retrying || record.retryTimer) return true;

      const retryIndex = record.retryAttempt;
      if (retryIndex < MEDIA_LOAD_RETRY_DELAYS_MS.length) {
        const delayMs = MEDIA_LOAD_RETRY_DELAYS_MS[retryIndex];
        const mediaGeneration = state.mediaGeneration;
        const mediaUrl = record.url;
        record.retryAttempt += 1;
        record.failed = false;
        record.loading = true;
        record.retrying = true;
        state.mediaPhase = "retrying";
        elements.app.setAttribute("aria-busy", "true");
        emitRuntimeEvent("mediaRetry", {
          ...mediaFailureDetail(video, record, reason),
          delayMs,
          mediaGeneration,
          videoId: currentSegment() ? currentSegment().id : null,
        });
        record.retryTimer = windowObject.setTimeout(function retryMediaLoad() {
          record.retryTimer = 0;
          if (state.destroyed
            || mediaGeneration !== state.mediaGeneration
            || record.url !== mediaUrl
            || !mediaFailureTargetsCurrentGeneration(video, record)) {
            record.retrying = false;
            return;
          }
          try {
            video.pause();
            video.removeAttribute("src");
            video.load();
            video.src = mediaUrl;
            record.failed = false;
            record.loading = true;
            video.load();
          } catch (error) {
            record.retrying = false;
            retryOrFailCurrentMedia(video, "reload_exception");
            return;
          }
          record.retrying = false;
          armMediaLoadWatchdog(mediaGeneration);
        }, delayMs);
        return true;
      }

      clearVideoRetry(record);
      clearPendingMediaActivation();
      state.pendingMediaSwap = null;
      showFatal(
        new Error("The experience video could not be loaded after retrying."),
        mediaFailureDetail(video, record, reason),
      );
      return true;
    }

    function armMediaLoadWatchdog(mediaGeneration) {
      clearMediaLoadWatchdog();
      state.mediaLoadWatchdogTimer = windowObject.setTimeout(function mediaLoadTimedOut() {
        state.mediaLoadWatchdogTimer = 0;
        if (state.destroyed
          || mediaGeneration !== state.mediaGeneration
          || isCurrentMediaReady()) return;
        const pending = state.pendingMediaSwap;
        retryOrFailCurrentMedia(pending ? pending.video : elements.video, "media_ready_timeout");
      }, MEDIA_READY_TIMEOUT_MS);
    }

    function configureVideoPlayer(video, mediaUrl, standby) {
      const record = videoRecords.get(video);
      if (!record) return;
      const sourceMatches = record.url === mediaUrl
        && normalizedVideoSource(video) === mediaUrl;
      if (sourceMatches && record.ready && !record.failed) {
        resetVideoRetry(record);
        setVideoLayer(video, standby ? "standby" : "active");
        if (!standby && video === elements.video) {
          const mediaGeneration = state.mediaGeneration;
          windowObject.setTimeout(function restoreReusedMediaReadiness() {
            if (state.destroyed
              || video !== elements.video
              || mediaGeneration !== state.mediaGeneration
              || !videoRecordMatchesSource(video, record)) return;
            handleMediaReady();
          }, 0);
        }
        return;
      }
      if (sourceMatches && record.loading && !record.failed) {
        setVideoLayer(video, standby ? "standby" : "active");
        return;
      }
      video.pause();
      resetVideoRetry(record);
      setVideoLayer(video, standby ? "standby" : "active");
      video.preload = "auto";
      if (standby) {
        video.muted = true;
        video.defaultMuted = true;
        video.setAttribute("muted", "");
      }
      record.url = mediaUrl;
      record.ready = false;
      record.failed = false;
      record.loading = true;
      if (!sourceMatches) video.src = mediaUrl;
      video.load();
    }

    function mediaEventMatchesCurrentGeneration() {
      if (!state.expectedMediaUrl) return false;
      return normalizedVideoSource(elements.video) === state.expectedMediaUrl;
    }

    function upcomingSegmentIndexes() {
      const segment = currentSegment();
      if (!segment || !state.experience) return [];
      const naturalNextIndex = state.segmentIndex + 1;
      const targetIds = segment.cues.flatMap(function cueTargets(cue) {
        return [cue.on_success, cue.on_miss]
          .map(actionTargetVideoId)
          .filter(Boolean);
      });
      const endTargetId = actionTargetVideoId(segment.onEnd);
      if (endTargetId) targetIds.push(endTargetId);
      const explicitIndexes = targetIds
        .map(function mapTarget(targetId) {
          return state.experience.segmentIndexById[targetId];
        })
        .filter(Number.isInteger);
      const candidates = naturalNextIndex < state.experience.segments.length
        ? [naturalNextIndex, ...explicitIndexes]
        : explicitIndexes;
      return candidates.filter(function uniqueTarget(targetIndex, index, targets) {
        return targets.indexOf(targetIndex) === index;
      });
    }

    function preloadUpcomingSegmentMedia() {
      if (
        !state.experience ||
        state.destroyed ||
        state.pendingMediaSwap ||
        state.hostMode !== "active"
      ) return;
      // One standby covers the natural successor; two also cover explicit result targets.
      const desiredUrls = upcomingSegmentIndexes()
        .map(function segmentMediaUrl(segmentIndex) {
          return safeMediaUrl(state.experience.segments[segmentIndex].videoUrl);
        })
        .filter(function uniqueUrl(mediaUrl, index, urls) {
          return urls.indexOf(mediaUrl) === index;
        })
        .slice(0, Math.max(0, videoPlayers.length - 1));
      if (!desiredUrls.length) return;

      const standbyPlayers = videoPlayers.filter(function availableStandby(video) {
        return video !== elements.video
          && video.dataset.pixoVideoLayer !== "incoming"
          && video.dataset.pixoVideoLayer !== "retiring";
      });
      const assignments = new Map();
      const reservedPlayers = new Set();

      desiredUrls.forEach(function preserveMatchingPreload(mediaUrl) {
        const matchingPlayer = standbyPlayers.find(function findMatching(video) {
          const record = videoRecords.get(video);
          return !reservedPlayers.has(video) && record && record.url === mediaUrl;
        });
        if (!matchingPlayer) return;
        assignments.set(mediaUrl, matchingPlayer);
        reservedPlayers.add(matchingPlayer);
      });
      desiredUrls.forEach(function assignRemainingPreload(mediaUrl) {
        if (assignments.has(mediaUrl)) return;
        const availablePlayer = standbyPlayers.find(function findAvailable(video) {
          return !reservedPlayers.has(video);
        });
        if (!availablePlayer) return;
        assignments.set(mediaUrl, availablePlayer);
        reservedPlayers.add(availablePlayer);
      });
      assignments.forEach(function startPreload(video, mediaUrl) {
        configureVideoPlayer(video, mediaUrl, true);
      });
    }

    function settleVideoSwap(previousVideo, nextVideo, swapSequence) {
      windowObject.requestAnimationFrame(function waitForIncomingComposition() {
        windowObject.requestAnimationFrame(function finishVideoSwap() {
          if (state.destroyed
            || state.mediaSwapSequence !== swapSequence
            || elements.video !== nextVideo) return;
          setVideoLayer(nextVideo, "active");
          if (previousVideo !== nextVideo) {
            setVideoLayer(previousVideo, "standby");
            const previousRecord = videoRecords.get(previousVideo);
            if (previousRecord) {
              previousRecord.ready = false;
              previousRecord.failed = false;
              previousRecord.loading = false;
            }
            try {
              previousVideo.currentTime = 0;
            } catch (error) {
              // A failed rewind is harmless; the player will be reloaded before reuse.
            }
          }
          preloadUpcomingSegmentMedia();
        });
      });
    }

    function activatePreparedVideo(video, mediaGeneration) {
      const pending = state.pendingMediaSwap;
      const record = videoRecords.get(video);
      if (!pending
        || pending.video !== video
        || pending.mediaGeneration !== mediaGeneration
        || mediaGeneration !== state.mediaGeneration
        || pending.mediaUrl !== state.expectedMediaUrl
        || !record
        || !record.ready
        || record.failed
        || !videoRecordMatchesSource(video, record)) return false;

      clearPendingMediaActivation();
      const previousVideo = elements.video;
      const previousMuted = Boolean(previousVideo.muted);
      const previousDefaultMuted = Boolean(previousVideo.defaultMuted);
      const previousVolume = isFiniteNumber(previousVideo.volume)
        ? previousVideo.volume
        : 1;
      const previousHadMutedAttribute = previousVideo.hasAttribute("muted");
      previousVideo.pause();

      video.muted = previousMuted;
      video.defaultMuted = previousDefaultMuted;
      video.volume = previousVolume;
      if (previousHadMutedAttribute) video.setAttribute("muted", "");
      else video.removeAttribute("muted");

      state.pendingMediaSwap = null;
      state.mediaSwapSequence += 1;
      const swapSequence = state.mediaSwapSequence;
      setVideoLayer(previousVideo, "retiring");
      setVideoLayer(video, "incoming");
      elements.video = video;
      handleMediaReady();
      positionMarkers();
      updateTimeline();
      updatePlayState();
      settleVideoSwap(previousVideo, video, swapSequence);
      return true;
    }

    function queuePreparedVideoActivation(video, mediaGeneration) {
      if (state.pendingMediaActivationTimer) return;
      state.pendingMediaActivationTimer = windowObject.setTimeout(function activateOnTaskBoundary() {
        state.pendingMediaActivationTimer = 0;
        activatePreparedVideo(video, mediaGeneration);
      }, 0);
    }

    function prepareCurrentSegmentMedia(preserveCurrentFrame) {
      const segment = currentSegment();
      if (!segment) throw new Error("Experience video segment is missing.");
      clearPendingMediaActivation();
      state.pendingMediaSwap = null;
      state.mediaSwapSequence += 1;
      state.mediaGeneration += 1;
      state.expectedMediaUrl = safeMediaUrl(segment.videoUrl);
      state.segmentStartPending = true;
      state.mediaEndDeferred = false;
      markMediaLoading();

      const currentVideo = elements.video;
      videoPlayers.forEach(function resetTransientVideoLayer(video) {
        if (video === currentVideo) setVideoLayer(video, "active");
        else if (video.dataset.pixoVideoLayer !== "standby") setVideoLayer(video, "standby");
      });
      const canPreserveCurrentFrame = preserveCurrentFrame === true
        && normalizedVideoSource(currentVideo).length > 0;
      if (!canPreserveCurrentFrame) {
        configureVideoPlayer(currentVideo, state.expectedMediaUrl, false);
        armMediaLoadWatchdog(state.mediaGeneration);
        return state.mediaGeneration;
      }

      currentVideo.pause();
      // Never clear the outgoing source here. Its last rendered frame remains
      // visible until the prepared target has produced loadeddata/canplay.
      const standbyPlayers = videoPlayers.filter(function findStandby(video) {
        return video !== currentVideo;
      });
      const targetVideo = standbyPlayers.find(function findReadyMatch(video) {
        const record = videoRecords.get(video);
        return record
          && record.url === state.expectedMediaUrl
          && record.ready
          && !record.failed;
      }) || standbyPlayers.find(function findLoadingMatch(video) {
        const record = videoRecords.get(video);
        return record && record.url === state.expectedMediaUrl;
      }) || standbyPlayers[0];
      if (!targetVideo) {
        configureVideoPlayer(currentVideo, state.expectedMediaUrl, false);
        armMediaLoadWatchdog(state.mediaGeneration);
        return state.mediaGeneration;
      }

      state.pendingMediaSwap = {
        video: targetVideo,
        mediaUrl: state.expectedMediaUrl,
        mediaGeneration: state.mediaGeneration,
      };
      configureVideoPlayer(targetVideo, state.expectedMediaUrl, true);
      const targetRecord = videoRecords.get(targetVideo);
      if (targetRecord && targetRecord.ready && !targetRecord.failed) {
        queuePreparedVideoActivation(targetVideo, state.mediaGeneration);
      }
      armMediaLoadWatchdog(state.mediaGeneration);
      return state.mediaGeneration;
    }

    function handleMediaReady() {
      if (!state.experience || state.destroyed) return;
      if (!mediaEventMatchesCurrentGeneration()) return;
      if (isCurrentMediaReady()) return;
      clearMediaLoadWatchdog();
      const durationMs = Number(elements.video.duration || 0) * 1000;
      try {
        const mediaEndCueIndexes = currentCues()
          .map(function mediaEndCueIndex(cue, index) {
            return cueStartsAtMediaEnd(cue, durationMs) ? index : -1;
          })
          .filter(function validIndex(index) { return index >= 0; });
        if (mediaEndCueIndexes.length > 1) {
          throw new TypeError(
            `Video '${currentSegment().id}' may declare at most one media-end interaction.`,
          );
        }
        if (mediaEndCueIndexes.length === 1
          && mediaEndCueIndexes[0] !== currentCues().length - 1) {
          throw new TypeError(
            `Video '${currentSegment().id}' media-end interaction must be the final interactions[] entry.`,
          );
        }
      } catch (error) {
        showFatal(error);
        return;
      }
      const mediaGeneration = state.mediaGeneration;
      state.mediaReadyGeneration = mediaGeneration;
      state.mediaPhase = "ready";
      const allowEndedPlayback = state.segmentStartPending;
      if (state.segmentStartPending) {
        const durationMs = Number(elements.video.duration || 0) * 1000;
        const targetMs = Math.min(
          state.pendingSegmentStartMs,
          durationMs > 0 ? Math.max(0, durationMs - 1) : state.pendingSegmentStartMs,
        );
        elements.video.currentTime = targetMs / 1000;
      }
      state.pendingSegmentStartMs = 0;
      state.segmentStartPending = false;
      elements.app.setAttribute("aria-busy", "false");
      emitRuntimeEvent("mediaReady", {
        segmentIndex: state.segmentIndex,
        mediaGeneration,
        videoId: currentSegment() ? currentSegment().id : null,
      });
      if (elements.video.dataset.pixoVideoLayer === "active") {
        preloadUpcomingSegmentMedia();
      }
      if (mediaGeneration !== state.mediaGeneration || !state.hostActive || !state.started) return;
      requestPlaybackIfAllowed(null, allowEndedPlayback);
    }

    function handleVideoReady(video) {
      const record = videoRecords.get(video);
      if (!record || !videoRecordMatchesSource(video, record)) return;
      resetVideoRetry(record);
      record.ready = true;
      record.failed = false;
      record.loading = false;
      const pending = state.pendingMediaSwap;
      if (pending
        && pending.video === video
        && pending.mediaGeneration === state.mediaGeneration
        && pending.mediaUrl === record.url) {
        queuePreparedVideoActivation(video, pending.mediaGeneration);
        return;
      }
      if (video === elements.video) handleMediaReady();
    }

    function handleVideoError(video) {
      const record = videoRecords.get(video);
      if (!record || state.destroyed || !videoRecordMatchesSource(video, record)) return;
      if (record.retrying || record.retryTimer) return;
      if (record) {
        record.ready = false;
        record.failed = true;
        record.loading = false;
      }
      retryOrFailCurrentMedia(video, "media_element_error");
    }

    function showFeedback(message, tone, assertive, durationMs, animationName, placement) {
      windowObject.clearTimeout(state.feedbackTimer);
      elements.feedbackText.textContent = message;
      elements.feedback.dataset.tone = tone || "neutral";
      elements.feedback.dataset.animation = animationName || "default";
      elements.feedback.hidden = false;
      elements.feedback.dataset.spatial = placement ? "true" : "false";
      if (placement) {
        elements.feedback.style.left = `${placement.x}px`;
        elements.feedback.style.top = `${placement.y}px`;
        elements.feedbackText.textContent = tone === "success" ? "" : "Try again";
      } else {
        elements.feedback.style.removeProperty("left");
        elements.feedback.style.removeProperty("top");
      }
      announce(placement ? tone === "success" ? "Interaction complete" : "Try again" : message, Boolean(assertive));
      state.feedbackTimer = windowObject.setTimeout(function hideFeedback() {
        elements.feedback.hidden = true;
      }, placement && tone === "success" ? 220 : durationMs || FEEDBACK_DURATION_MS);
    }

    function showCapabilityFeedback(message, tone, assertive, durationMs) {
      if (!guidance) {
        showFeedback(message, tone, assertive, durationMs);
        return;
      }
      windowObject.clearTimeout(state.feedbackTimer);
      elements.feedbackText.textContent = message;
      elements.feedback.hidden = true;
      updateGuidance();
      announce(message, Boolean(assertive));
    }

    function setSharePending(pending) {
      state.sharePending = pending === true;
      elements.shareButton.disabled = state.sharePending;
      if (state.sharePending) elements.shareButton.setAttribute("aria-busy", "true");
      else elements.shareButton.removeAttribute("aria-busy");
    }

    function applyRuntimeHostLayout(layout) {
      if (guidance) guidance.resize(guidanceInsets());
      const shareVisible = Boolean(layout && layout.completionActions.share);
      elements.shareButton.hidden = !shareVisible;
      if (!shareVisible && state.sharePending) {
        state.shareRequestToken += 1;
        setSharePending(false);
      }
    }

    async function handleCompletionShare() {
      if (state.sharePending || elements.shareButton.hidden) return;
      const nativeBridge = windowObject.PixoNative || windowObject.MotionCueNative;
      if (!nativeBridge || typeof nativeBridge.shareExperience !== "function") {
        showFeedback("Sharing isn't available right now.", "miss", true, 2400);
        return;
      }
      const requestToken = state.shareRequestToken + 1;
      state.shareRequestToken = requestToken;
      setSharePending(true);
      try {
        const result = await nativeBridge.shareExperience();
        if (state.destroyed || requestToken !== state.shareRequestToken) return;
        const status = isRecord(result) ? result.status : null;
        if (status === "copied") {
          showFeedback("Link copied", "success", false, 2200);
        } else if (status === "presented") {
          announce("Share options opened.", false);
        } else if (status === "copy_failed") {
          showFeedback("Couldn't copy the link. Try again.", "miss", true, 2600);
        } else {
          showFeedback("Sharing isn't available right now.", "miss", true, 2400);
        }
      } catch (error) {
        if (state.destroyed || requestToken !== state.shareRequestToken) return;
        const failureCode = error && error.details && error.details.code;
        const message = failureCode === "copy_failed"
          ? "Couldn't copy the link. Try again."
          : "Sharing isn't available right now.";
        showFeedback(message, "miss", true, 2600);
      } finally {
        if (!state.destroyed && requestToken === state.shareRequestToken) {
          setSharePending(false);
        }
      }
    }

    function haptic(style) {
      const nativeBridge = windowObject.PixoNative || windowObject.MotionCueNative;
      if (!nativeBridge || typeof nativeBridge.vibrate !== "function") return;
      Promise.resolve(nativeBridge.vibrate(style || "light")).catch(function ignoreHapticFailure() {});
    }

    function markerFor(runtimeKey) {
      return Array.from(elements.timelineMarkers.children).find(function findMarker(marker) {
        return marker.dataset.cueKey === runtimeKey;
      }) || null;
    }

    function setCueState(cue, status) {
      const runtimeKey = cueKey(cue);
      state.cueStates.set(runtimeKey, status);
      const marker = markerFor(runtimeKey);
      if (marker) marker.dataset.status = status;
    }

    function renderMarkers() {
      elements.timelineMarkers.replaceChildren();
      if (!currentSegment()) return;
      currentCues().forEach(function renderMarker(cue) {
        const marker = documentObject.createElement("span");
        marker.className = "timeline-marker";
        marker.dataset.cueId = cue.id;
        marker.dataset.cueKey = cueKey(cue);
        marker.dataset.status = state.cueStates.get(cueKey(cue)) || "pending";
        marker.setAttribute("aria-hidden", "true");
        elements.timelineMarkers.appendChild(marker);
      });
      positionMarkers();
    }

    function positionMarkers() {
      const durationMs = Number(elements.video.duration || 0) * 1000;
      if (!currentSegment() || durationMs <= 0) return;
      currentCues().forEach(function positionMarker(cue) {
        const marker = markerFor(cueKey(cue));
        if (!marker) return;
        const offsetTimeMs = getOffsetTimeMs(cue);
        marker.style.left = offsetTimeMs === null
          ? "100%"
          : `${clamp((offsetTimeMs / durationMs) * 100, 0, 100)}%`;
      });
    }

    function pinchGuideSvg(direction, className) {
      const outward = direction === "outward";
      const arrows = outward
        ? '<path d="M15 15h-5v5m0-5 7 7M33 33h5v-5m0 5-7-7"/>'
        : '<path d="M13 13l7 7m-5 0h5v-5M35 35l-7-7m5 0h-5v5"/>';
      return `<svg class="${className}" data-pinch-direction="${outward ? "outward" : "inward"}" viewBox="0 0 48 48" aria-hidden="true"><g class="pinch-arrows">${arrows}</g><g class="pinch-finger pinch-finger-a"><circle cx="16" cy="16" r="4"/><path d="M16 20v5"/></g><g class="pinch-finger pinch-finger-b"><circle cx="32" cy="32" r="4"/><path d="M32 36v5"/></g></svg>`;
    }

    const ICON_MARKUP = Object.freeze({
      "pinch-in": pinchGuideSvg("inward", "__CLASS__"),
      "pinch-out": pinchGuideSvg("outward", "__CLASS__"),
      "hand-tap": '<svg class="__CLASS__" viewBox="0 0 256 256" aria-hidden="true"><path d="M56,76a60,60,0,0,1,120,0,8,8,0,0,1-16,0,44,44,0,0,0-88,0,8,8,0,1,1-16,0Zm140,44a27.9,27.9,0,0,0-13.36,3.39A28,28,0,0,0,144,106.7V76a28,28,0,0,0-56,0v80l-3.82-6.13a28,28,0,0,0-48.41,28.17l29.32,50A8,8,0,1,0,78.89,220L49.6,170a12,12,0,1,1,20.78-12l.14.23,18.68,30A8,8,0,0,0,104,184V76a12,12,0,0,1,24,0v68a8,8,0,1,0,16,0V132a12,12,0,0,1,24,0v20a8,8,0,0,0,16,0v-4a12,12,0,0,1,24,0v36c0,21.61-7.1,36.3-7.16,36.42a8,8,0,0,0,3.58,10.73A7.9,7.9,0,0,0,208,232a8,8,0,0,0,7.16-4.42c.37-.73,8.85-18,8.85-43.58V148A28,28,0,0,0,196,120Z"/></svg>',
      "hand-pointing": '<svg class="__CLASS__" viewBox="0 0 256 256" aria-hidden="true"><path d="M196,88a27.86,27.86,0,0,0-13.35,3.39A28,28,0,0,0,144,74.7V44a28,28,0,0,0-56,0v80l-3.82-6.13A28,28,0,0,0,35.73,146l4.67,8.23C74.81,214.89,89.05,240,136,240a88.1,88.1,0,0,0,88-88V116A28,28,0,0,0,196,88Zm12,64a72.08,72.08,0,0,1-72,72c-37.63,0-47.84-18-81.68-77.68l-4.69-8.27,0-.05A12,12,0,0,1,54,121.61a11.88,11.88,0,0,1,6-1.6,12,12,0,0,1,10.41,6,1.76,1.76,0,0,0,.14.23l18.67,30A8,8,0,0,0,104,152V44a12,12,0,0,1,24,0v68a8,8,0,0,0,16,0V100a12,12,0,0,1,24,0v20a8,8,0,0,0,16,0v-4a12,12,0,0,1,24,0Z"/></svg>',
      "hand-grabbing": '<svg class="__CLASS__" viewBox="0 0 256 256" aria-hidden="true"><path d="M188,80a27.79,27.79,0,0,0-13.36,3.4,28,28,0,0,0-46.64-11A28,28,0,0,0,80,92v20H68a28,28,0,0,0-28,28v12a88,88,0,0,0,176,0V108A28,28,0,0,0,188,80Zm12,72a72,72,0,0,1-144,0V140a12,12,0,0,1,12-12H80v24a8,8,0,0,0,16,0V92a12,12,0,0,1,24,0v28a8,8,0,0,0,16,0V92a12,12,0,0,1,24,0v28a8,8,0,0,0,16,0V108a12,12,0,0,1,24,0Z"/></svg>',
      "hands-clapping": '<svg class="__CLASS__" viewBox="0 0 256 256" aria-hidden="true"><path d="M160.22,24V8a8,8,0,0,1,16,0V24a8,8,0,0,1-16,0ZM196.1,41a7.91,7.91,0,0,0,4.17,1.17,8,8,0,0,0,6.84-3.83l8-13.11a8,8,0,0,0-13.68-8.33l-8,13.1A8,8,0,0,0,196.1,41Zm47.51,12.59a8,8,0,0,0-10.08-5.16l-15.06,4.85a8,8,0,0,0,2.46,15.62,8.15,8.15,0,0,0,2.46-.39l15.05-4.85A8,8,0,0,0,243.61,53.55ZM217,97.58a80.22,80.22,0,0,1-10.22,94c-.34,1.73-.72,3.46-1.19,5.18A80.17,80.17,0,0,1,58.77,216L23.5,155a26,26,0,0,1,19.24-38.79l-3-5.2a26,26,0,0,1,19.2-38.78L58.24,71A26,26,0,0,1,95.47,36.53,26.06,26.06,0,0,1,140.3,37l12.26,21.2A26.07,26.07,0,0,1,195.81,61ZM109.07,55l0,0h0l25,43.17a26,26,0,0,1,17.33-10L126.42,45a10,10,0,1,0-17.35,10ZM72.12,63l6.46,11.17a26.05,26.05,0,0,1,17.32-10L89.45,53A10,10,0,1,0,72.12,63Zm111.54,81-20.22-35a10,10,0,0,0-17.74,9.25L158.3,140a8,8,0,0,1-13.87,8l-36.5-63A10,10,0,1,0,90.58,95l26.05,45a8,8,0,0,1-13.87,8L71,93h0l0,0a10,10,0,0,0-17.33,10l35.22,61A8,8,0,0,1,75,172L54.72,137a10,10,0,0,0-17.34,10l35.27,61a64.12,64.12,0,0,0,117.42-15.44A63.52,63.52,0,0,0,183.66,144Zm19.41-38.42L181.93,69A10,10,0,0,0,164.55,79l33,57.05A80.2,80.2,0,0,1,207,161.51,64.23,64.23,0,0,0,203.07,105.58Z"/></svg>',
      smartphone: '<svg class="__CLASS__" data-outline="true" viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>',
      eraser: '<svg class="__CLASS__" data-outline="true" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"/><path d="m5.082 11.09 8.828 8.828"/></svg>',
      wind: '<svg class="__CLASS__" data-outline="true" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/></svg>',
      mic: '<svg class="__CLASS__" data-outline="true" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/></svg>',
      pinch: '<svg class="__CLASS__" viewBox="0 -960 960 960" aria-hidden="true"><path d="M593-40q-24 0-46-9t-39-26L332-252q-12-12-11-29.5t13-29.5q16-16 37.5-21.5t42.5.5l66 19v-327q0-17 11.5-28.5T520-680q17 0 28.5 11.5T560-640v380q0 20-16 32t-35 7l-46-13 102 102q5 5 12.5 8.5T593-120h167q33 0 56.5-23.5T840-200v-160q0-17 11.5-28.5T880-400q17 0 28.5 11.5T920-360v160q0 66-47 113T760-40H593ZM380-818 142-580h68q13 0 21.5 8.5T240-550q0 13-8.5 21.5T210-520H80q-17 0-28.5-11.5T40-560v-130q0-13 8.5-21.5T70-720q13 0 21.5 8.5T100-690v68l238-238h-68q-13 0-21.5-8.5T240-890q0-13 8.5-21.5T270-920h130q17 0 28.5 11.5T440-880v130q0 13-8.5 21.5T410-720q-13 0-21.5-8.5T380-750v-68Zm260 298q17 0 28.5 11.5T680-480v120q0 17-11.5 28.5T640-320q-17 0-28.5-11.5T600-360v-120q0-17 11.5-28.5T640-520Zm120 40q17 0 28.5 11.5T800-440v80q0 17-11.5 28.5T760-320q-17 0-28.5-11.5T720-360v-80q0-17 11.5-28.5T760-480Z"/></svg>',
      gesture: '<svg class="__CLASS__" viewBox="0 -960 960 960" aria-hidden="true"><path d="M554-120q-54 0-91-37t-37-89q0-76 61.5-137.5T641-460q-3-36-18-54.5T582-533q-30 0-65 25t-83 82q-78 93-114.5 121T241-277q-51 0-86-38t-35-92q0-54 23.5-110.5T223-653q19-26 28-44t9-29q0-7-2.5-10.5T250-740q-5 0-12 3t-15 11q-15 14-34.5 15T155-724q-15-16-15.5-37.5T155-797q24-21 48-32t47-11q46 0 78 32t32 80q0 29-15 64t-50 84q-38 54-56.5 95T220-413q0 17 5.5 26.5T241-377q10 0 17.5-5.5T286-409q13-14 31-34.5t44-50.5q63-75 114-107t107-32q67 0 110 45t49 123h49q21 0 35.5 14.5T840-415q0 21-14.5 35.5T790-365h-49q-8 112-58.5 178.5T554-120Zm2-100q32 0 54-36.5T640-358q-46 11-80 43.5T526-250q0 14 8 22t22 8Z"/></svg>',
      face: '<svg class="__CLASS__" viewBox="0 -960 960 960" aria-hidden="true"><path d="M360-390q-21 0-35.5-14.5T310-440q0-21 14.5-35.5T360-490q21 0 35.5 14.5T410-440q0 21-14.5 35.5T360-390Zm240 0q-21 0-35.5-14.5T550-440q0-21 14.5-35.5T600-490q21 0 35.5 14.5T650-440q0 21-14.5 35.5T600-390ZM480-160q134 0 227-93t93-227q0-24-3-46.5T786-570q-21 5-42 7.5t-44 2.5q-91 0-172-39T390-708q-32 78-91.5 135.5T160-486v6q0 134 93 227t227 93Zm0 80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/></svg>',
      "volume-off": '<svg class="__CLASS__" viewBox="0 -960 960 960" aria-hidden="true"><path d="M671-177q-11 7-22 13t-23 11q-15 7-30.5 0T574-176q-6-15 1.5-29.5T598-227q7-3 13-6.5t12-7.5L480-368v111q0 27-24.5 37.5T412-228L280-360H160q-17 0-28.5-11.5T120-400v-160q0-17 11.5-28.5T160-600h88L84-764q-11-11-11-28t11-28q11-11 28-11t28 11l680 680q11 11 11 28t-11 28q-11 11-28 11t-28-11l-93-93Zm89-304q0-83-44-151.5T598-735q-15-7-22-21.5t-2-29.5q6-16 21.5-23t31.5 0q97 43 155 131t58 197q0 33-6 65.5T817-353q-8 22-24.5 27.5t-30.5.5q-14-5-22.5-18t-.5-30q11-26 16-52.5t5-55.5ZM591-623q33 21 51 63t18 80v10q0 5-1 10-2 13-14 17t-22-6l-51-51q-6-6-9-13.5t-3-15.5v-77q0-12 10.5-17.5t20.5.5ZM400-354v-94l-72-72H200v80h114l86 86Z"/></svg>',
    });

    const BADGE_ICON_MARKUP = Object.freeze({
      arrow_left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2Z"/></svg>',
      arrow_right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4-1.42 1.41L16.17 11H4v2h12.17l-5.59 5.59L12 20l8-8-8-8Z"/></svg>',
      arrow_up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 1.41 1.42L11 7.83V20h2V7.83l5.59 5.59L20 12l-8-8-8 8Z"/></svg>',
      arrow_down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 12-1.41-1.42L13 16.17V4h-2v12.17l-5.59-5.59L4 12l8 8 8-8Z"/></svg>',
      pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>',
      bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.4 0 .62.19.4.66C12.97 17.53 11 21 11 21Z"/></svg>',
      camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/></svg>',
      swap_horiz: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7-4 4 4 4v-3h7v-2H7V7Zm10 2V6l4 4-4 4v-3h-7V9h7Z"/></svg>',
      rotate_right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.55 5.55 11 1v3.07A8 8 0 1 0 19.93 13h-2.02A6 6 0 1 1 11 6.09V10l4.55-4.45Z"/></svg>',
      mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5.3-3a5.3 5.3 0 0 1-10.6 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-1.7Z"/></svg>',
      star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.83l-5.5 2.89 1.05-6.12L3.1 9.27l6.15-.9L12 2.8Z"/></svg>',
    });

    function iconMarkup(name, className) {
      const template = ICON_MARKUP[name] || ICON_MARKUP.gesture;
      return template.replace("__CLASS__", className || "gesture-glyph");
    }

    function gestureMotionVector(direction, magnitude) {
      if (direction === "left") return { x: -magnitude, y: 0 };
      if (direction === "right") return { x: magnitude, y: 0 };
      if (direction === "up") return { x: 0, y: -magnitude };
      if (direction === "down") return { x: 0, y: magnitude };
      return { x: 0, y: 0 };
    }

    function guideRingMarkup(radius, extraClass) {
      return `<svg class="gesture-ring ${extraClass || ""}" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="${radius}"/></svg>`;
    }

    function guideBadgeMarkup(guide) {
      if (guide.badgeText) return `<span class="gesture-badge">${guide.badgeText}</span>`;
      if (!guide.badgeIcon) return "";
      return `<span class="gesture-badge">${BADGE_ICON_MARKUP[guide.badgeIcon] || ""}</span>`;
    }

    function guideRippleMarkup(count) {
      return Array.from({ length: count }, function renderRipple(_, index) {
        return `<span class="gesture-ripple rip${index + 1}"></span>`;
      }).join("");
    }

    function renderGestureVisual(targetElement, guide) {
      const resolvedGuide = guide || {
        type: "mic_quiet",
        icon: "gesture",
        animation: "quiet",
        instruction: "Interaction unavailable",
      };
      const type = normalizeInteractionType(resolvedGuide.type) || "mic_quiet";
      const animationClass = interactionAnimationClass(type) || "anim-quiet";
      const swipeVector = gestureMotionVector(resolvedGuide.direction, 30);
      const dragVector = gestureMotionVector(resolvedGuide.direction, 20);
      const scrubVector = gestureMotionVector(resolvedGuide.direction, 1);
      const motionVector = animationClass === "anim-swipe" ? swipeVector : dragVector;
      const startMultiplier = animationClass === "anim-swipe" ? -0.6 : -0.5;
      targetElement.className = `gesture-visual interaction-gesture-visual ${animationClass}`;
      targetElement.dataset.interactionType = type;
      if (type === "draw_circle") {
        targetElement.dataset.rotationDirection = resolvedGuide.rotation_direction === "clockwise"
          ? "clockwise"
          : "counterclockwise";
      } else {
        delete targetElement.dataset.rotationDirection;
      }
      targetElement.style.setProperty("--guide-tx", `${motionVector.x}px`);
      targetElement.style.setProperty("--guide-ty", `${motionVector.y}px`);
      targetElement.style.setProperty("--guide-start-x", `${motionVector.x * startMultiplier}px`);
      targetElement.style.setProperty("--guide-start-y", `${motionVector.y * startMultiplier}px`);
      targetElement.style.setProperty("--guide-ux", String(scrubVector.x));
      targetElement.style.setProperty("--guide-uy", String(scrubVector.y));
      [6, 12, 14, 20].forEach(function setScrubVector(distance) {
        targetElement.style.setProperty(`--guide-scrub-${distance}-x`, `${scrubVector.x * distance}px`);
        targetElement.style.setProperty(`--guide-scrub-${distance}-y`, `${scrubVector.y * distance}px`);
      });
      targetElement.style.setProperty("--guide-rot", resolvedGuide.direction === "left" ? "-15deg" : "15deg");
      const legacyPitch = resolvedGuide.tilt_semantics === LEGACY_TILT_SEMANTICS;
      targetElement.style.setProperty(
        "--guide-pitch",
        resolvedGuide.direction === "forward"
          ? (legacyPitch ? "28deg" : "-28deg")
          : (legacyPitch ? "-28deg" : "28deg"),
      );
      targetElement.style.setProperty(
        "--guide-rotation",
        resolvedGuide.rotation_direction === "counterclockwise" ? "-90deg" : "90deg",
      );

      const tapFamily = type === "tap" || type === "double_tap"
        || type === "rapid_tap" || type === "multi_tap" || type === "continuous_tap";
      const iconName = tapFamily ? "hand-tap" : resolvedGuide.icon;
      const glyph = iconMarkup(iconName, "gesture-glyph");
      const badge = guideBadgeMarkup(resolvedGuide);
      let markup = `${glyph}${badge}`;
      switch (type) {
        case "pinch": {
          markup = iconMarkup(resolvedGuide.icon, "gesture-pinch-guide");
          break;
        }
        case "tap":
          markup = `${guideRippleMarkup(1)}${glyph}`;
          break;
        case "double_tap":
          markup = `${guideRippleMarkup(2)}${glyph}${badge}`;
          break;
        case "rapid_tap":
          markup = `${guideRippleMarkup(3)}${glyph}${badge}`;
          break;
        case "multi_tap":
          markup = `${guideRippleMarkup(3)}${glyph}<span class="gesture-badge">×${requiredTapCount(state.active && state.active.cue || type)}</span>`;
          break;
        case "continuous_tap":
          markup = `${guideRippleMarkup(3)}${glyph}`;
          break;
        case "hold":
        case "continuous_hold":
        case "hold_still":
        case "hold_charge":
          markup = `${guideRingMarkup(45)}${glyph}${badge}`;
          break;
        case "swipe_left":
        case "swipe_right":
        case "swipe_up":
        case "swipe_down":
          markup = `${iconMarkup(iconName, "gesture-glyph g2")}${iconMarkup(iconName, "gesture-glyph g1")}${glyph}`;
          break;
        case "continuous_swipe":
          markup = `${glyph}<span class="gesture-continuous-track" aria-hidden="true"></span>`;
          break;
        case "draw_circle":
          markup = `${guideRingMarkup(30, "gesture-trace-ring")}<span class="gesture-orbit"><i></i></span>${glyph}`;
          break;
        case "erase":
          markup = `${glyph}<span class="gesture-fog"></span>`;
          break;
        case "camera_motion":
          markup = `${iconMarkup(resolvedGuide.icon, "gesture-glyph gesture-face")}${badge}`;
          break;
        case "mic_level":
        case "mic_level_continuous":
          markup = `${guideRippleMarkup(2)}${glyph}`;
          break;
        case "mic_blow":
        case "mic_blow_continuous":
          markup = '<span class="gesture-puff p1"></span><span class="gesture-puff p2"></span><span class="gesture-puff p3"></span>' + `${glyph}${badge}`;
          break;
        case "mic_clap":
          markup = `${glyph}<span class="gesture-spark">${BADGE_ICON_MARKUP.star}</span>`;
          break;
        case "mic_quiet":
          markup = '<span class="gesture-shrink s1"></span><span class="gesture-shrink s2"></span>' + glyph;
          break;
        default:
          break;
      }
      targetElement.innerHTML = markup;
    }

    function renderInteractionAnimation(guide) {
      renderGestureVisual(elements.interactionGestureVisual, guide);
    }

    function cueCopy(cue) {
      const guide = cue.type === "pinch"
        ? interactionCatalog.pinchGuides[normalizePinchDirection(cue.detection.pinch_direction)]
        : cue.guide || guideForInteractionType(cue.type);
      if (!guide) {
        return { guide: null, title: cue.description || "Interaction unavailable", instruction: "Interaction unavailable", label: "Continue" };
      }
      const isSemanticVisionCue = ["camera_motion", "camera_continuous"].includes(cue.type)
        && isRecord(cue.detection)
        && isRecord(cue.detection.vision)
        && typeof cue.detection.vision.target === "string";
      const authoredVisionPrompt = String(cue.description || "").trim();
      return {
        guide,
        // mobile2/03: protocol description is the first line; catalog copy is the second line.
        title: String(cue.description || guide.instruction),
        // A semantic camera target must never be replaced by the catalog's generic
        // camera copy (for example, "Wave at the camera"). The authored prompt is
        // the product contract and tells the participant the exact static pose or
        // expression that the on-device model will recognize.
        instruction: isSemanticVisionCue && authoredVisionPrompt
          ? authoredVisionPrompt
          : guide.instruction,
        label: isSemanticVisionCue && authoredVisionPrompt
          ? authoredVisionPrompt
          : guide.instruction,
      };
    }

    const countdownMotionPreference = typeof windowObject.matchMedia === "function"
      ? windowObject.matchMedia("(prefers-reduced-motion: reduce)") : null;

    function clearCueCountdown() {
      elements.cueCountdown.hidden = true;
      delete elements.caption.dataset.countdown;
      delete elements.cueCountdown.dataset.urgent;
      elements.cueCountdownTime.textContent = "";
      elements.cueCountdownFill.style.transform = "scaleX(0)";
    }

    function updateCueCountdown() {
      const active = state.active;
      if (!active || !activeMatches(active.activationId)
        || !active.responseTimerInitialized || !isTimedStoryBranchCue(active.cue)) {
        if (!elements.cueCountdown.hidden) clearCueCountdown();
        return;
      }
      // Read the same monotonic clock and accumulated elapsed time as the outcome timer.
      // A paused video is not a paused operation window; an inactive host is.
      const runningElapsedMs = active.deadlineTimer
        ? Math.max(0, performance.now() - active.deadlineStartedAt) : 0;
      const progress = calculateResponseWindowProgress(
        active.responseWindowMs, active.responseElapsedMs + runningElapsedMs,
      );
      const timeText = `${progress.displaySeconds.toFixed(1)}s`;
      if (elements.cueCountdownTime.textContent !== timeText) {
        elements.cueCountdownTime.textContent = timeText;
      }
      // Reduced motion uses discrete tenths instead of continuously moving the line.
      const ratio = countdownMotionPreference && countdownMotionPreference.matches
        ? Math.min(1, progress.displaySeconds * 1000 / progress.durationMs)
        : progress.remainingRatio;
      const transform = `scaleX(${ratio})`;
      if (elements.cueCountdownFill.style.transform !== transform) {
        elements.cueCountdownFill.style.transform = transform;
      }
      const urgent = progress.remainingMs <= 1000 ? "true" : "false";
      if (elements.cueCountdown.dataset.urgent !== urgent) elements.cueCountdown.dataset.urgent = urgent;
      if (elements.caption.dataset.countdown !== "true") elements.caption.dataset.countdown = "true";
      if (elements.cueCountdown.hidden) elements.cueCountdown.hidden = false;
    }

    function setCueUiVisible(visible) {
      if (!visible) clearCueCountdown();
      if (!visible) elements.tapCount.hidden = true;
      elements.caption.hidden = !visible;
      elements.interactionLayer.hidden = !visible;
      if (guidance) {
        if (!visible) guidance.hide();
        else guidance.setVisible(state.hostActive);
      }
      documentObject.documentElement.setAttribute(
        "data-pixo-freeform-gesture",
        visible && state.active && isFreeformPointerCue(state.active.cue) ? "true" : "false",
      );
    }

    function renderActiveCue(cue) {
      clearCueCountdown();
      const copy = cueCopy(cue);
      const interactionPlace = normalizeInteractionPlace(cue.detection && cue.detection.place);
      elements.interactionLayer.dataset.place = interactionPlace;
      elements.interactionLayer.dataset.interactionType = cue.type;
      elements.placeGrid.dataset.activePlace = interactionPlace;
      elements.interactionTarget.dataset.place = interactionPlace;
      elements.interactionTarget.dataset.interactionType = cue.type;
      elements.interactionTarget.dataset.debugLabel = `${interactionPlace} · ${cue.type}`;
      elements.interactionTarget.dataset.continuousDriving = "false";
      elements.soundMeter.dataset.inBand = "false";
      elements.soundMeter.dataset.driving = "false";
      elements.caption.dataset.interactionType = cue.type;
      elements.caption.dataset.captionPlacement = captionPlacementForPlace(interactionPlace);
      elements.cueTitle.textContent = copy.title;
      elements.cueInstruction.textContent = copy.instruction;
      elements.tapCount.hidden = cue.type !== "multi_tap";
      elements.tapCount.textContent = cue.type === "multi_tap"
        ? `0 / ${requiredTapCount(cue)}`
        : "";
      elements.interactionLabel.textContent = copy.label;
      renderInteractionAnimation(
        cue.type === "rotate" || cue.type === "draw_circle"
          ? { ...copy.guide, rotation_direction: cue.detection.rotation_direction }
          : cue.type === "tilt_forward" || cue.type === "tilt_backward"
            ? { ...copy.guide, tilt_semantics: cue.tilt_semantics }
          : copy.guide,
      );
      if (guidance) guidance.show(cue, guidanceInsets(), performance.now());
      elements.caption.dataset.voiceQualified = "false";
      elements.soundMeter.hidden = !isContinuousMicrophoneCue(cue);
      if (isContinuousMicrophoneCue(cue)) resetSoundMeter(state.active);
      const matrixDebug = isMicrophoneCue(cue)
        && state.experience
        && state.experience.head
        && String(state.experience.head.ssid || "").startsWith("pixo-interaction-matrix");
      elements.voiceDebug.hidden = !matrixDebug;
      if (matrixDebug) {
        const requirements = calculateVoiceRequirements(
          cue.detection.min_volume_score,
          cue.detection.min_duration_ms,
          cue.detection.confidence_threshold,
        );
        elements.voiceDebug.textContent = `Score -- / ${Math.round(requirements.effectiveMinVolumeScore)} · Hold 0 / ${Math.round(requirements.effectiveDurationMs)}ms`;
      }
      const accessibleGuide = guidance && guidance.getModel();
      const accessiblePrompt = accessibleGuide
        ? `${accessibleGuide.copy}. ${accessibleGuide.description}`
        : `${copy.title}. ${copy.instruction}`;
      elements.interactionTarget.setAttribute("aria-label", accessiblePrompt);
      elements.interactionTarget.setAttribute("aria-describedby", "cue-instruction");
      elements.interactionTarget.disabled = false;
      elements.holdMeterFill.style.height = "0%";
      elements.interactionTarget.style.setProperty("--voice-level", ".24");
      setCueUiVisible(true);
      announce(accessiblePrompt, false);
    }

    function eraseFogBounds() {
      const canvas = elements.eraseFogLayer;
      const rect = typeof canvas.getBoundingClientRect === "function"
        ? canvas.getBoundingClientRect()
        : null;
      const root = documentObject.documentElement || {};
      const fallbackWidth = Number(
        canvas.clientWidth || root.clientWidth || windowObject.innerWidth || 360,
      );
      const fallbackHeight = Number(
        canvas.clientHeight || root.clientHeight || windowObject.innerHeight || 640,
      );
      return {
        left: rect && isFiniteNumber(rect.left) ? rect.left : 0,
        top: rect && isFiniteNumber(rect.top) ? rect.top : 0,
        width: rect && rect.width > 0 ? rect.width : Math.max(1, fallbackWidth),
        height: rect && rect.height > 0 ? rect.height : Math.max(1, fallbackHeight),
      };
    }

    function drawEraseFogBase(context, width, height) {
      context.save();
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.clearRect(0, 0, width, height);

      const base = context.createLinearGradient(0, 0, width, height);
      base.addColorStop(0, "rgba(224, 235, 235, .72)");
      base.addColorStop(0.48, "rgba(195, 215, 217, .66)");
      base.addColorStop(1, "rgba(232, 235, 224, .70)");
      context.fillStyle = base;
      context.fillRect(0, 0, width, height);

      const clouds = [
        [0.08, 0.10, 0.42, "rgba(255, 255, 248, .24)"],
        [0.82, 0.18, 0.38, "rgba(171, 201, 205, .18)"],
        [0.34, 0.42, 0.46, "rgba(248, 248, 238, .20)"],
        [0.88, 0.58, 0.44, "rgba(165, 198, 202, .16)"],
        [0.16, 0.78, 0.48, "rgba(247, 248, 239, .20)"],
        [0.68, 0.92, 0.40, "rgba(178, 204, 204, .18)"],
      ];
      const span = Math.max(width, height);
      clouds.forEach(function drawCloud(cloud) {
        const x = cloud[0] * width;
        const y = cloud[1] * height;
        const radius = cloud[2] * span;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, cloud[3]);
        gradient.addColorStop(0.64, cloud[3].replace(/\.[0-9]+\)$/, ".06)"));
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
      });

      context.lineWidth = 0.8;
      for (let index = 0; index < 34; index += 1) {
        const x = ((index * 47) % 101) / 100 * width;
        const y = ((index * 67 + 13) % 103) / 102 * height;
        const radius = 1.5 + (index % 5) * 0.65;
        context.beginPath();
        context.ellipse(x, y, radius * 0.72, radius, 0, 0, Math.PI * 2);
        context.fillStyle = "rgba(244, 250, 248, .12)";
        context.fill();
        context.strokeStyle = "rgba(105, 139, 143, .10)";
        context.stroke();
      }
      context.restore();
    }

    function eraseFogBrushRadius(width, height) {
      return clamp(
        Math.min(width, height) * 0.075,
        ERASE_FOG_MIN_BRUSH_RADIUS_DP,
        ERASE_FOG_MAX_BRUSH_RADIUS_DP,
      );
    }

    function renderEraseFogSegment(context, width, height, segment) {
      const fromX = segment.fromX * width;
      const fromY = segment.fromY * height;
      const toX = segment.toX * width;
      const toY = segment.toY * height;
      const radius = eraseFogBrushRadius(width, height);
      context.save();
      context.globalCompositeOperation = "destination-out";
      context.globalAlpha = 1;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = radius * 1.72;
      context.shadowBlur = radius * 0.62;
      context.shadowColor = "rgba(0, 0, 0, .96)";
      context.strokeStyle = "rgba(0, 0, 0, .94)";
      context.beginPath();
      context.moveTo(fromX, fromY);
      context.lineTo(toX, toY);
      context.stroke();
      context.beginPath();
      context.arc(toX, toY, radius * 0.72, 0, Math.PI * 2);
      context.fillStyle = "rgba(0, 0, 0, .96)";
      context.fill();
      context.restore();
    }

    function paintEraseFog(active) {
      const canvas = elements.eraseFogLayer;
      if (!active || !isEraseCue(active.cue) || typeof canvas.getContext !== "function") {
        return false;
      }
      const context = canvas.getContext("2d");
      if (!context) return false;
      const bounds = eraseFogBounds();
      const ratio = clamp(
        Number(windowObject.devicePixelRatio || 1),
        1,
        ERASE_FOG_MAX_DEVICE_PIXEL_RATIO,
      );
      const pixelWidth = Math.max(1, Math.round(bounds.width * ratio));
      const pixelHeight = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      active.eraseFogWidth = bounds.width;
      active.eraseFogHeight = bounds.height;
      drawEraseFogBase(context, bounds.width, bounds.height);
      active.eraseFogStrokes.forEach(function replayEraseStroke(segment) {
        renderEraseFogSegment(context, bounds.width, bounds.height, segment);
      });
      active.eraseFogInitialized = true;
      return true;
    }

    function showEraseFog(active) {
      if (!active || !isEraseCue(active.cue)) return;
      active.eraseFogStrokes = [];
      active.eraseFogLastPoint = null;
      active.eraseFogInitialized = false;
      elements.eraseFogLayer.hidden = false;
      elements.app.dataset.eraseActive = "true";
      if (!paintEraseFog(active)) {
        active.eraseFogFrame = windowObject.requestAnimationFrame(function retryEraseFogPaint() {
          active.eraseFogFrame = 0;
          if (activeMatches(active.activationId)) paintEraseFog(active);
        });
      }
    }

    function hideEraseFog(active) {
      if (active && active.eraseFogFrame) {
        windowObject.cancelAnimationFrame(active.eraseFogFrame);
        active.eraseFogFrame = 0;
      }
      const canvas = elements.eraseFogLayer;
      if (typeof canvas.getContext === "function") {
        const context = canvas.getContext("2d");
        if (context) context.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
      }
      canvas.hidden = true;
      delete elements.app.dataset.eraseActive;
      if (active) {
        active.eraseFogInitialized = false;
        active.eraseFogLastPoint = null;
        active.eraseFogStrokes = [];
      }
    }

    function normalizedEraseFogPoint(event) {
      const bounds = eraseFogBounds();
      return {
        x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
        y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
      };
    }

    function drawEraseFogToPointer(active, event) {
      if (!active || !isEraseCue(active.cue)) return;
      if (!active.eraseFogInitialized) paintEraseFog(active);
      const point = normalizedEraseFogPoint(event);
      const previous = active.eraseFogLastPoint || point;
      const segment = {
        fromX: previous.x,
        fromY: previous.y,
        toX: point.x,
        toY: point.y,
      };
      active.eraseFogStrokes.push(segment);
      active.eraseFogLastPoint = point;
      const context = typeof elements.eraseFogLayer.getContext === "function"
        ? elements.eraseFogLayer.getContext("2d")
        : null;
      if (context && active.eraseFogWidth > 0 && active.eraseFogHeight > 0) {
        renderEraseFogSegment(
          context,
          active.eraseFogWidth,
          active.eraseFogHeight,
          segment,
        );
      }
    }

    function handleViewportResize() {
      if (guidance) guidance.resize(guidanceInsets());
      const active = state.active;
      if (active && isEraseCue(active.cue) && !elements.eraseFogLayer.hidden) {
        paintEraseFog(active);
      }
    }

    function updatePlayState() {
      const playing = !elements.video.paused && !elements.video.ended;
      elements.app.dataset.playing = String(playing);
      elements.playControl.setAttribute("aria-label", playing ? "Pause video" : "Play video");
    }

    function updateTimeline() {
      const durationMs = Number(elements.video.duration || 0) * 1000;
      const positionMs = Number(elements.video.currentTime || 0) * 1000;
      const ratio = durationMs > 0 ? clamp(positionMs / durationMs, 0, 1) : 0;
      elements.timelineFill.style.width = `${ratio * 100}%`;
      elements.currentTime.textContent = formatTime(positionMs);
      elements.durationTime.textContent = formatTime(durationMs);
      if (state.active) updateActiveProgress(positionMs);
    }

    function updateActiveProgress(positionMs) {
      const active = state.active;
      if (!active || active.resolved) return;
      if (isHoldCue(active.cue)) {
        if (active.holdPointerId !== null && active.holdStart) {
          const holdRatio = (performance.now() - active.holdStart) / active.longPressDurationMs;
          elements.holdMeterFill.style.height = `${clamp(holdRatio, 0, 1) * 100}%`;
        }
      }
    }

    function nativeStopMicrophone() {
      const nativeBridge = windowObject.PixoNative || windowObject.MotionCueNative;
      if (!nativeBridge || typeof nativeBridge.stopMicrophoneLevel !== "function") return;
      Promise.resolve(nativeBridge.stopMicrophoneLevel()).catch(function ignoreStopFailure() {});
    }

    function nativeStopMotion() {
      const nativeBridge = windowObject.PixoNative || windowObject.MotionCueNative;
      if (!nativeBridge || typeof nativeBridge.stopMotion !== "function") return;
      Promise.resolve(nativeBridge.stopMotion()).catch(function ignoreStopFailure() {});
    }

    function nativeStopCamera() {
      const nativeBridge = windowObject.PixoNative || windowObject.MotionCueNative;
      if (!nativeBridge) return;
      const stop = typeof nativeBridge.stopVision === "function"
        ? nativeBridge.stopVision
        : nativeBridge.stopCameraSignals;
      if (typeof stop !== "function") return;
      Promise.resolve(stop.call(nativeBridge)).catch(function ignoreStopFailure() {});
    }

    function enforceMicrophoneMediaAudioSuppression(active) {
      if (!active || !active.mediaAudioState) return;
      elements.video.setAttribute(MICROPHONE_AUDIO_SUPPRESSION_ATTRIBUTE, "true");
      elements.video.muted = true;
      elements.video.defaultMuted = true;
      elements.video.setAttribute("muted", "");
      if (typeof elements.video.volume === "number") elements.video.volume = 0;
    }

    function suppressMicrophoneMediaAudio(active) {
      if (!active || !shouldSuppressMediaAudioForCue(active.cue)) return false;
      if (!active.mediaAudioState) {
        active.mediaAudioState = {
          muted: Boolean(elements.video.muted),
          defaultMuted: Boolean(elements.video.defaultMuted),
          hadMutedAttribute: elements.video.hasAttribute("muted"),
          volume: isFiniteNumber(elements.video.volume) ? elements.video.volume : 1,
        };
      }
      enforceMicrophoneMediaAudioSuppression(active);
      return true;
    }

    function restoreMicrophoneMediaAudio(active) {
      if (!active || !active.mediaAudioState) return;
      const previous = active.mediaAudioState;
      active.mediaAudioState = null;
      elements.video.removeAttribute(MICROPHONE_AUDIO_SUPPRESSION_ATTRIBUTE);
      elements.video.defaultMuted = previous.defaultMuted;
      if (previous.hadMutedAttribute) elements.video.setAttribute("muted", "");
      else elements.video.removeAttribute("muted");
      elements.video.muted = previous.muted;
      if (typeof elements.video.volume === "number") elements.video.volume = previous.volume;
    }

    function enforceActiveMicrophoneMediaAudioSuppression() {
      enforceMicrophoneMediaAudioSuppression(state.active);
    }

    function cleanupActiveResources(active) {
      if (!active) return;
      active.guidancePointers.clear();
      active.guidancePath = [];
      active.guidanceProgress = 0;
      clearCueCountdown();
      windowObject.clearTimeout(active.deadlineTimer);
      active.deadlineTimer = 0;
      windowObject.clearTimeout(active.holdTimer);
      windowObject.clearTimeout(active.permissionTimer);
      windowObject.clearTimeout(active.cameraRetryTimer);
      windowObject.clearTimeout(active.continuousIdleTimer);
      windowObject.clearTimeout(active.continuousTapFeedbackTimer);
      active.voiceRequestToken += 1;
      active.capabilityRequestToken += 1;
      active.voicePermissionPending = false;
      active.voiceStartPending = false;
      if (typeof active.offMicrophone === "function") active.offMicrophone();
      if (typeof active.offMotion === "function") active.offMotion();
      if (typeof active.offCamera === "function") active.offCamera();
      if (active.microphoneStarted || isMicrophoneCue(active.cue)) nativeStopMicrophone();
      if (active.motionStarted || isMotionCue(active.cue)) nativeStopMotion();
      if (active.cameraStarted || isCameraCue(active.cue)) nativeStopCamera();
      active.offMicrophone = null;
      active.offMotion = null;
      active.offCamera = null;
      restoreMicrophoneMediaAudio(active);
      resetHold(active);
      resetSwipe(active);
      stopSustainedPlaybackDriving(active, "cleanup");
      resetContinuousSwipePointer(active);
      resetPointerGesture(active);
      hideEraseFog(active);
      active.deadlineStartedAt = 0;
      elements.placeGrid.removeAttribute("data-active-place");
      elements.interactionLayer.removeAttribute("data-interaction-type");
      documentObject.documentElement.setAttribute("data-pixo-freeform-gesture", "false");
      elements.interactionTarget.removeAttribute("data-debug-label");
      elements.interactionTarget.removeAttribute("data-continuous-driving");
      if (elements.interactionTarget.classList) {
        elements.interactionTarget.classList.remove("continuous-tap-pulse");
      }
    }

    function activeMatches(activationId) {
      return Boolean(state.active)
        && !state.active.resolved
        && state.active.activationId === activationId
        && state.active.mediaGeneration === state.mediaGeneration;
    }

    function activateReadyCueAtCurrentPosition() {
      if (!state.hostActive
        || !state.started
        || !isCurrentMediaReady()
        || state.active
        || state.replayScheduled
        || elements.video.ended) return false;
      findNextCue(Number(elements.video.currentTime || 0) * 1000);
      return Boolean(state.active);
    }

    function nativeHostAllowsPlayback() {
      const transport = windowObject.PixoNativeBridge || windowObject.MotionCueNativeBridge;
      if (!transport || typeof transport.hostPlaybackAllowed !== "function") return true;
      try {
        return transport.hostPlaybackAllowed() === true;
      } catch (error) {
        // Browser previews and older hosts have no synchronous lifecycle gate.
        return true;
      }
    }

    function requestPlaybackIfAllowed(onFailure, allowEnded) {
      if (!state.started || state.pendingMediaSwap) return false;
      if (state.authoringTransportPaused) return false;
      if (elements.video.ended && allowEnded !== true) return false;
      // Android updates the native bridge before its asynchronous JS lifecycle event. Consulting
      // that volatile flag closes the small race where an `ended` task could open and play the
      // next segment while the card or app was already becoming inactive.
      if (!state.hostActive || !nativeHostAllowsPlayback()) {
        state.resumePlaybackOnHostActive = true;
        return false;
      }
      if (isCurrentMediaReady()) activateReadyCueAtCurrentPosition();
      if (playbackBlockedByInteraction()) {
        if (!elements.video.paused) elements.video.pause();
        state.resumePlaybackOnHostActive = false;
        return false;
      }
      state.resumePlaybackOnHostActive = false;
      if (!elements.video.paused) return true;
      const playResult = elements.video.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(typeof onFailure === "function"
          ? onFailure
          : function ignorePlayFailure() {});
      }
      return true;
    }

    function resumeAfterFeedback(active, delayMs) {
      if (!active.pausedVideo || elements.video.ended || !state.started) return;
      const mediaGeneration = active.mediaGeneration;
      const resumeVideo = function resumeVideo() {
        if (mediaGeneration !== state.mediaGeneration
          || state.active
          || !state.started
          || elements.video.ended) return;
        requestPlaybackIfAllowed();
      };
      const resolvedDelayMs = isFiniteNumber(delayMs)
        ? Math.max(0, delayMs)
        : FEEDBACK_DURATION_MS;
      if (resolvedDelayMs === 0) {
        resumeVideo();
        return;
      }
      windowObject.setTimeout(resumeVideo, resolvedDelayMs);
    }

    function successText(cue) {
      const feedback = isRecord(cue.feedback) ? cue.feedback : {};
      return String(feedback.success_text || cue.success_feedback || "Interaction complete");
    }

    function missText(cue) {
      const feedback = isRecord(cue.feedback) ? cue.feedback : {};
      return String(feedback.miss_text || cue.miss_feedback || "Cue missed");
    }

    function feedbackConfig(cue) {
      const feedback = isRecord(cue.feedback) ? cue.feedback : {};
      const authoredDurationMs = feedback.animation_duration_ms;
      return {
        animation: typeof feedback.animation === "string" ? feedback.animation : "default",
        durationMs: isSustainedPlaybackCue(cue) && authoredDurationMs === 0
          ? 0
          : positiveNumber(authoredDurationMs, FEEDBACK_DURATION_MS, 100, 5000),
        vibrate: feedback.vibrate === true,
        soundEffect: typeof feedback.sound_effect === "string" ? feedback.sound_effect : null,
      };
    }

    function recordCurrentSegmentCompleted() {
      const completedSegment = currentSegment();
      state.completedCueCount += completedSegment ? completedSegment.cues.length : 0;
      return completedSegment;
    }

    function finishExperience(detail) {
      if (!elements.video.paused) elements.video.pause();
      state.phase = "ended";
      state.mediaPhase = "ended";
      state.mediaEndDeferred = false;
      state.pendingResultAction = null;
      state.retryOrigin = null;
      state.pendingSegmentStartMs = 0;
      state.segmentStartPending = false;
      state.resumePlaybackOnHostActive = false;
      setCueUiVisible(false);
      elements.completionPanel.hidden = false;
      const totalCueCount = state.experience ? state.experience.totalCueCount : state.completedCueCount;
      elements.completionSummary.textContent = `Completed ${totalCueCount} interaction point${totalCueCount === 1 ? "" : "s"}.`;
      updatePlayState();
      announce("Experience complete.", true);
      emitRuntimeEvent("ended", detail || {});
    }

    function openSegment(nextSegmentIndex, detail, playbackOptions) {
      const previousSegment = currentSegment();
      const options = isRecord(playbackOptions) ? playbackOptions : {};
      windowObject.clearTimeout(state.replayTimer);
      state.replayTimer = 0;
      state.replayScheduled = false;
      state.pendingReplayTargetMs = null;
      state.pendingReplayMediaGeneration = -1;
      state.pendingSegmentStartMs = isFiniteNumber(options.startAtMs)
        ? Math.max(0, options.startAtMs)
        : 0;
      state.resumePlaybackOnHostActive = false;
      state.mediaEndDeferred = false;
      state.pendingResultAction = null;
      cleanupActiveResources(state.active);
      state.active = null;
      state.segmentIndex = nextSegmentIndex;
      state.cueStates.clear();
      const nextSegment = currentSegment();
      if (!nextSegment) throw new Error(`Video index ${nextSegmentIndex} is unavailable.`);
      const restoredCueStates = isRecord(options.cueStates) ? options.cueStates : {};
      currentCues().forEach(function initializeNextSegmentCue(cue) {
        const restored = restoredCueStates[cueKey(cue)];
        state.cueStates.set(cueKey(cue), typeof restored === "string" ? restored : "pending");
      });
      setCueUiVisible(false);
      elements.completionPanel.hidden = true;
      if (!detail || detail.preserveFeedback !== true) elements.feedback.hidden = true;
      elements.timelineFill.style.width = "0%";
      elements.currentTime.textContent = "0:00";
      elements.durationTime.textContent = "0:00";
      elements.title.textContent = nextSegment.title;
      prepareCurrentSegmentMedia(true);
      renderMarkers();
      state.phase = state.hostActive ? "playing" : "inactive";
      elements.app.dataset.runtimeState = state.phase;
      requestPlaybackIfAllowed(function showSegmentPlayFailure() {
        showFeedback("Tap play to continue the experience.", "neutral", false, 1200);
      });
      announce(`Continuing to video ${nextSegmentIndex + 1}.`, false);
      emitRuntimeEvent("segmentChanged", {
        segmentIndex: nextSegmentIndex,
        segmentCount: state.experience.segments.length,
        cueCount: nextSegment.cues.length,
        videoId: nextSegment.id,
        previousVideoId: previousSegment ? previousSegment.id : null,
        ...(detail || {}),
      });
    }

    function markPendingCuesSkipped() {
      currentCues().forEach(function closeRemainingCue(cue) {
        if (state.cueStates.get(cueKey(cue)) === "pending") {
          setCueState(cue, "skipped");
        }
      });
    }

    function emitResultActionEvent(name, action, context, deferred) {
      emitRuntimeEvent(name, {
        cueId: context && context.cueId || null,
        segmentIndex: state.segmentIndex,
        outcome: context && context.outcome || null,
        source: context && context.source || null,
        resultAction: action.action,
        targetVideoId: action.target_video_id || null,
        timing: action.timing || null,
        deferred: deferred === true,
      });
    }

    function scheduleRetryPreviousPoint(active) {
      const targetMs = retryPreviousPointTargetMs(currentCues(), active.index);
      const mediaGeneration = active.mediaGeneration;
      setCueState(active.cue, "pending");
      elements.video.pause();
      state.mediaEndDeferred = false;
      state.replayScheduled = true;
      state.pendingReplayMediaGeneration = -1;
      windowObject.clearTimeout(state.replayTimer);
      state.replayTimer = windowObject.setTimeout(function retryCurrentInteraction() {
        state.replayTimer = 0;
        if (!state.started || mediaGeneration !== state.mediaGeneration) {
          state.replayScheduled = false;
          return;
        }
        if (!state.hostActive) {
          state.pendingReplayTargetMs = targetMs;
          state.pendingReplayMediaGeneration = mediaGeneration;
          return;
        }
        state.replayScheduled = false;
        elements.video.currentTime = targetMs / 1000;
        requestPlaybackIfAllowed(null, true);
      }, FEEDBACK_DURATION_MS);
    }

    function restartCurrentVideo() {
      windowObject.clearTimeout(state.replayTimer);
      state.replayTimer = 0;
      state.replayScheduled = false;
      state.pendingReplayTargetMs = null;
      state.pendingReplayMediaGeneration = -1;
      state.pendingSegmentStartMs = 0;
      state.mediaEndDeferred = false;
      state.pendingResultAction = null;
      state.retryOrigin = null;
      currentCues().forEach(function resetCue(cue) {
        setCueState(cue, "pending");
      });
      elements.video.currentTime = 0;
      state.phase = state.hostActive ? "playing" : "inactive";
      elements.app.dataset.runtimeState = state.phase;
      requestPlaybackIfAllowed(null, true);
    }

    function captureRetryOrigin(active) {
      if (!active || !Number.isInteger(active.index)) return;
      const segment = currentSegment();
      if (!segment) return;
      state.retryOrigin = {
        segmentIndex: state.segmentIndex,
        videoId: segment.id,
        cueIndex: active.index,
        cueId: active.cue && active.cue.id || null,
        cueStates: Object.fromEntries(state.cueStates),
      };
    }

    function retryFromRouteOrigin() {
      const origin = state.retryOrigin;
      if (!origin || !state.experience || !Number.isInteger(origin.segmentIndex)) {
        showFatal(new Error(
          "video.on_end retry_previous_point has no originating interaction route.",
        ));
        return "failed";
      }
      const targetSegment = state.experience.segments[origin.segmentIndex];
      if (!targetSegment || !Number.isInteger(origin.cueIndex)) {
        showFatal(new Error("The originating interaction route is unavailable."));
        return "failed";
      }
      const restoredCueStates = {};
      targetSegment.cues.forEach(function restoreOriginCueState(cue, cueIndex) {
        if (cueIndex >= origin.cueIndex) {
          restoredCueStates[cueKey(cue)] = "pending";
          return;
        }
        const previousState = origin.cueStates && origin.cueStates[cueKey(cue)];
        restoredCueStates[cueKey(cue)] = previousState && previousState !== "pending"
          ? previousState
          : "resolved";
      });
      const targetMs = retryPreviousPointTargetMs(targetSegment.cues, origin.cueIndex);
      state.retryOrigin = null;
      openSegment(
        origin.segmentIndex,
        {
          reason: "retry_previous_point",
          resultAction: "retry_previous_point",
          retryCueId: origin.cueId,
          retryTargetMs: targetMs,
        },
        { startAtMs: targetMs, cueStates: restoredCueStates },
      );
      return "retrying";
    }

    function executeResultAction(action, context, options) {
      const segment = currentSegment();
      if (!segment || !state.experience || !isRecord(action)) return false;
      const forceImmediate = Boolean(options && options.forceImmediate);
      const fromVideoEnd = Boolean(options && options.fromVideoEnd);
      if (["jump_video", "end_experience"].includes(action.action)
        && action.timing === "video_end"
        && !forceImmediate
        && !elements.video.ended) {
        state.pendingResultAction = {
          segmentIndex: state.segmentIndex,
          mediaGeneration: state.mediaGeneration,
          action,
          cueId: context && context.cueId || null,
          outcome: context && context.outcome || null,
          source: context && context.source || null,
        };
        state.mediaEndDeferred = false;
        markPendingCuesSkipped();
        emitResultActionEvent("resultActionDeferred", action, context, true);
        return "deferred";
      }

      const wasDeferred = Boolean(options && options.deferred);
      state.pendingResultAction = null;
      state.mediaEndDeferred = false;
      emitResultActionEvent("resultActionExecuted", action, context, wasDeferred);

      if (action.action === "continue") {
        if (fromVideoEnd) return "natural";
        if (elements.video.ended || context && context.mediaEndedWhileWaiting) {
          handleEnded();
        } else if (context && context.active) {
          resumeAfterFeedback(context.active, successResumeDelayMs());
        }
        return "continued";
      }
      if (action.action === "retry_previous_point") {
        if (fromVideoEnd) return retryFromRouteOrigin();
        if (context && context.active) scheduleRetryPreviousPoint(context.active);
        return "retrying";
      }
      if (action.action === "restart_video") {
        restartCurrentVideo();
        return "restarted";
      }

      recordCurrentSegmentCompleted();
      if (action.action === "end_experience") {
        finishExperience({
          videoId: segment.id,
          resultAction: action.action,
          outcome: context && context.outcome || null,
          source: context && context.source || null,
        });
        return "ended";
      }
      if (action.action === "jump_video") {
        const nextSegmentIndex = state.experience.segmentIndexById[action.target_video_id];
        if (!Number.isInteger(nextSegmentIndex)) {
          throw new Error(`Result action target '${action.target_video_id}' is unavailable.`);
        }
        if (context && context.active) captureRetryOrigin(context.active);
        openSegment(nextSegmentIndex, {
          reason: "result_action",
          resultAction: action.action,
          resultTiming: action.timing,
          resultOutcome: context && context.outcome || null,
          resultSource: context && context.source || null,
          preserveFeedback: Boolean(context && context.cueId),
        });
        return "jumped";
      }
      throw new Error(`Unsupported result action '${action.action}'.`);
    }

    function resolveOutcome(outcome, source) {
      const active = state.active;
      if (!active || active.resolved) return false;
      if (outcome === "success" && performance.now() < state.inputDebounceUntil) return false;
      state.authoringTransportPaused = false;
      const mediaEndedWhileWaiting = elements.video.ended && state.mediaEndDeferred;
      const guidancePlacement = guidance && guidance.getPlacement();
      active.resolved = true;
      cleanupActiveResources(active);
      setCueState(active.cue, outcome === "success" ? "resolved" : "missed");
      state.active = null;
      setCueUiVisible(false);
      if (outcome === "success") {
        state.inputDebounceUntil = performance.now() + INPUT_DEBOUNCE_MS;
      }
      const feedback = feedbackConfig(active.cue);
      showFeedback(
        outcome === "success" ? successText(active.cue) : missText(active.cue),
        outcome === "success" ? "success" : "miss",
        true,
        outcome === "success" ? feedback.durationMs : 1100,
        feedback.animation,
        guidancePlacement,
      );
      if (outcome === "success" && feedback.vibrate) haptic("success");
      const action = outcome === "success" ? active.cue.on_success : active.cue.on_miss;
      emitRuntimeEvent("gateResolved", {
        cueId: active.cue.id,
        segmentIndex: state.segmentIndex,
        outcome: outcome === "miss" && source === "timeout" ? "timeout" : outcome,
        source,
        feedback,
        resultAction: action.action,
        targetVideoId: action.target_video_id || null,
        timing: action.timing || null,
      });
      const actionResult = executeResultAction(action, {
        active,
        cueId: active.cue.id,
        outcome,
        source,
        mediaEndedWhileWaiting,
      });
      if (actionResult === "deferred") {
        resumeAfterFeedback(active, successResumeDelayMs());
      }
      return true;
    }

    function resolveSuccess(source) {
      return resolveOutcome("success", source);
    }

    function completeSustainedPlaybackCue(source) {
      const active = state.active;
      if (!active || active.resolved || !isSustainedPlaybackCue(active.cue)) return false;
      active.resolved = true;
      stopSustainedPlaybackDriving(active, source);
      cleanupActiveResources(active);
      setCueState(active.cue, "resolved");
      state.active = null;
      state.mediaEndDeferred = false;
      setCueUiVisible(false);
      const feedback = feedbackConfig(active.cue);
      const action = active.cue.on_success;
      emitRuntimeEvent("gateResolved", {
        cueId: active.cue.id,
        segmentIndex: state.segmentIndex,
        outcome: "success",
        source,
        feedback,
        resultAction: action.action,
        targetVideoId: action.target_video_id || null,
        timing: action.timing || null,
      });
      executeResultAction(action, {
        active,
        cueId: active.cue.id,
        outcome: "success",
        source,
        mediaEndedWhileWaiting: elements.video.ended,
      });
      return true;
    }

    function degradeCueToHold(active, reason) {
      if (!active || active.resolved) return false;
      const previousType = active.cue.type;
      const originalDetection = active.cue.detection;
      const responseWindowMs = originalDetection.response_window_ms;
      const fallbackDurationMs = isFiniteNumber(originalDetection.min_duration_ms)
        && originalDetection.min_duration_ms > 0
        ? originalDetection.min_duration_ms
        : (responseWindowMs > 0 ? Math.min(1000, responseWindowMs) : 1000);
      cleanupActiveResources(active);
      const holdGuide = guideForInteractionType("hold");
      active.cue = {
        ...active.cue,
        type: "hold",
        guide: holdGuide,
        detection: {
          ...holdGuide.detection,
          confidence_threshold: originalDetection.confidence_threshold,
          response_window_ms: responseWindowMs,
          min_duration_ms: fallbackDurationMs,
          place: originalDetection.place,
        },
        fallback_from_type: previousType,
      };
      active.pausedVideo = active.cue.pause_video !== false;
      active.longPressNominalDurationMs = fallbackDurationMs;
      active.longPressDurationMs = calculateLongPressDuration(
        fallbackDurationMs,
        active.cue.detection.confidence_threshold,
      );
      active.responseElapsedMs = 0;
      active.responseTimerInitialized = false;
      active.responseWindowMs = responseWindowMs;
      renderActiveCue(active.cue);
      armWallDeadline(active, active.responseWindowMs);
      emitRuntimeEvent("gateFallback", {
        cueId: active.cue.id,
        segmentIndex: state.segmentIndex,
        fromType: previousType,
        toType: "hold",
        reason,
      });
      const fallbackMessage = reason === "host_declared_fallback"
        ? "Camera recognition is available in the Pixo app. Hold to continue on the web."
        : (reason === "permission_denied"
          ? "Permission was not granted. Hold to continue."
          : "This device input is unavailable. Hold to continue.");
      if (reason === "host_declared_fallback" && !guidance) {
        showFeedback(fallbackMessage, "neutral", false, 3200);
      }
      if (guidance) {
        elements.feedbackText.textContent = fallbackMessage;
        elements.feedback.hidden = true;
        updateGuidance();
      }
      announce(fallbackMessage, true);
      return true;
    }

    function blockCueForCapability(active, reason) {
      if (!active || active.resolved || active.capabilityBlocked) return false;
      active.capabilityBlocked = true;
      active.pendingCapabilityFailure = null;
      cleanupActiveResources(active);
      if (!elements.video.paused) elements.video.pause();
      setCueState(active.cue, "blocked");
      const message = host.__pixoRuntimeAuthoringSimulation === true
        ? "当前电脑无法真实触发，请使用播放器旁的模拟触发按钮。"
        : "This interaction is not available on this device. Open it in the Pixo app.";
      showCapabilityFeedback(message, "miss", true, 10000);
      emitRuntimeEvent("gateBlocked", {
        cueId: active.cue.id,
        segmentIndex: state.segmentIndex,
        type: active.cue.type,
        reason,
      });
      return true;
    }

    function resolveOrDeferCapabilityFailure(reason) {
      const active = state.active;
      if (!active || active.resolved) return false;
      if (active.capabilityBlocked) return true;
      if (!state.hostActive) {
        active.pendingCapabilityFailure = reason;
        return true;
      }
      active.pendingCapabilityFailure = null;
      if (capabilityFailurePolicyForCue(active.cue) === "block") {
        return blockCueForCapability(active, reason);
      }
      if (isCameraCue(active.cue)) return retryCameraInsteadOfFallback(active, reason);
      return degradeCueToHold(active, reason);
    }

    function resolveSkipped(reason) {
      const active = state.active;
      if (!active || active.resolved) return false;
      if ([
        "permission_denied",
        "capability_unavailable",
        "camera_content_recognition_unavailable",
      ].includes(reason)) {
        return resolveOrDeferCapabilityFailure(reason);
      }
      return resolveMiss(reason);
    }

    // CameraX may need a short moment to release the previous analyzer before the
    // following cue can bind it again.  Keep the semantic gate in place and retry;
    // never turn a visual-recognition test into a long-press fallback.
    function retryCameraInsteadOfFallback(active, reason) {
      if (!active
        || active.resolved
        || active.capabilityBlocked
        || !isCameraCue(active.cue)) return false;
      active.capabilityStartPending = false;
      active.cameraStarted = false;
      // Native emits an event and resolves the matching RPC.  They describe the same failed
      // start; preserve the retry the first signal already scheduled.
      if (active.cameraRetryScheduled) return true;
      windowObject.clearTimeout(active.cameraRetryTimer);
      active.cameraRetryTimer = 0;

      if (reason === "permission_denied") {
        active.cameraRetryReady = true;
        showCapabilityFeedback("Camera permission is required. Enable it, then tap to retry.", "miss", true, 2600);
        return true;
      }

      const attempt = (active.cameraRetryCount || 0) + 1;
      active.cameraRetryCount = attempt;
      if (attempt <= 6) {
        active.cameraRetryScheduled = true;
        const delayMs = Math.min(900, 180 * attempt);
        showCapabilityFeedback("Reconnecting to the front camera…", "neutral", false, delayMs);
        active.cameraRetryTimer = windowObject.setTimeout(function retryVisionCamera() {
          if (!activeMatches(active.activationId) || !state.hostActive) return;
          active.cameraRetryTimer = 0;
          active.cameraRetryScheduled = false;
          armCamera(active);
        }, delayMs);
        return true;
      }

      active.cameraRetryReady = true;
      showCapabilityFeedback("The front camera is not ready. Tap to try again.", "miss", true, 2600);
      return true;
    }

    function resolveSupersededUnlimitedCue(reason) {
      return resolveMiss(reason);
    }

    function resolveMiss(reason) {
      return resolveOutcome("miss", reason);
    }

    function scheduleWallDeadline(active, remainingMs) {
      active.deadlineStartedAt = performance.now();
      active.deadlineTimer = windowObject.setTimeout(function expireActiveCue() {
        if (activeMatches(active.activationId)) resolveMiss("timeout");
      }, remainingMs);
      updateCueCountdown();
    }

    function armWallDeadline(active, durationMs) {
      const effectiveDurationMs = responseDeadlineForCue(active.cue, durationMs);
      active.responseWindowMs = effectiveDurationMs;
      active.responseElapsedMs = 0;
      active.responseTimerInitialized = true;
      windowObject.clearTimeout(active.deadlineTimer);
      active.deadlineTimer = 0;
      active.deadlineStartedAt = 0;
      if (!active.inputReadyEmitted) {
        active.inputReadyEmitted = true;
        emitRuntimeEvent("gateInputReady", {
          cueId: active.cue.id,
          activationId: active.activationId,
          segmentIndex: state.segmentIndex,
          responseWindowMs: effectiveDurationMs,
        });
      }
      if (effectiveDurationMs === 0) return;
      scheduleWallDeadline(active, effectiveDurationMs);
    }

    function freezeWallDeadline(active) {
      if (!active
        || !active.responseTimerInitialized
        || active.responseWindowMs === 0
        || !active.deadlineTimer) return;
      const elapsed = Math.max(0, performance.now() - active.deadlineStartedAt);
      active.responseElapsedMs = Math.min(
        active.responseWindowMs,
        active.responseElapsedMs + elapsed,
      );
      active.deadlineStartedAt = 0;
      windowObject.clearTimeout(active.deadlineTimer);
      active.deadlineTimer = 0;
      updateCueCountdown();
    }

    function resumeWallDeadline(active) {
      if (!active
        || !active.responseTimerInitialized
        || active.responseWindowMs === 0
        || active.deadlineTimer) return;
      const remainingMs = Math.max(0, active.responseWindowMs - active.responseElapsedMs);
      if (remainingMs === 0) {
        windowObject.setTimeout(function expireResumedCue() {
          if (activeMatches(active.activationId)) resolveMiss("timeout");
        }, 0);
        return;
      }
      scheduleWallDeadline(active, remainingMs);
    }

    function installMicrophoneListener(nativeBridge, activationId) {
      const handler = function handleNativeLevel(detail) {
        handleVoiceLevel(detail || {}, activationId);
      };
      if (typeof nativeBridge.on === "function") {
        return nativeBridge.on("microphoneLevel", handler);
      }
      const eventHandler = function handleMicrophoneEvent(event) { handler(event.detail); };
      windowObject.addEventListener("motioncue:microphoneLevel", eventHandler);
      return function removeMicrophoneEvent() {
        windowObject.removeEventListener("motioncue:microphoneLevel", eventHandler);
      };
    }

    function installCapabilityListener(nativeBridge, eventName, activationId, handler) {
      const guardedHandler = function handleCapabilitySignal(detail) {
        if (activeMatches(activationId)) handler(detail || {}, activationId);
      };
      if (typeof nativeBridge.on === "function") {
        return nativeBridge.on(eventName, guardedHandler);
      }
      const domEventName = `motioncue:${eventName}`;
      const eventHandler = function handleCapabilityEvent(event) {
        guardedHandler(event.detail);
      };
      windowObject.addEventListener(domEventName, eventHandler);
      return function removeCapabilityEvent() {
        windowObject.removeEventListener(domEventName, eventHandler);
      };
    }

    function handleMotionSignal(detail, activationId) {
      if (!activeMatches(activationId)) return;
      if (!state.hostActive) return;
      const active = state.active;
      if (["denied", "unavailable", "stopped", "error"].includes(detail.status)) {
        resolveSkipped(detail.status === "denied" ? "permission_denied" : "capability_unavailable");
        return;
      }
      if (!active.motionStarted) return;
      active.guidanceHasInput = true;
      const sample = {
        timestamp: isFiniteNumber(detail.timestamp) ? detail.timestamp : performance.now(),
        alpha: isFiniteNumber(detail.alpha) ? detail.alpha : 0,
        beta: isFiniteNumber(detail.beta) ? detail.beta : 0,
        gamma: isFiniteNumber(detail.gamma) ? detail.gamma : 0,
      };
      const now = performance.now();
      if (!active.motionBaseline) {
        active.motionBaseline = sample;
        active.motionPrevious = sample;
        active.motionStableSince = now;
        return;
      }
      const previous = active.motionPrevious;
      const sampleScore = isFiniteNumber(detail.motion_score)
        ? clamp(detail.motion_score, 0, 100)
        : calculateMotionSampleScore(previous, sample);
      active.motionPrevious = sample;

      if (active.cue.type === "hold_still") {
        if (sampleScore <= active.motionRequirements.effectiveMaxMotionScore) {
          if (!active.motionStableSince) active.motionStableSince = now;
          const elapsed = now - active.motionStableSince;
          setCueProgressWidth(`${clamp(
            elapsed / active.motionRequirements.effectiveStableDurationMs,
            0,
            1,
          ) * 100}%`);
          if (elapsed >= active.motionRequirements.effectiveStableDurationMs) {
            resolveSuccess("hold_still");
          }
        } else {
          active.motionStableSince = 0;
          setCueProgressWidth("0%");
        }
        return;
      }

      if (["tilt_left", "tilt_right", "tilt_forward", "tilt_backward"].includes(active.cue.type)) {
        const evaluation = evaluateTiltGesture(
          active.cue,
          active.motionBaseline,
          sample,
          active.motionRequirements,
        );
        const ratio = evaluation.signedAngleDeg
          / active.motionRequirements.effectiveMinAngleDeg;
        setCueProgressWidth(`${clamp(ratio, 0, 1) * 100}%`);
        if (evaluation.matches) resolveSuccess(active.cue.type);
        return;
      }

      if (active.cue.type === "rotate") {
        active.motionRotationTravelDeg += rotationTravelDeltaDegrees(
          sample.alpha,
          previous.alpha,
          active.cue.detection.rotation_direction,
        );
        const evaluation = evaluateRotateGesture(
          active.motionRotationTravelDeg,
          active.motionRequirements,
        );
        const ratio = evaluation.rotationTravelDeg
          / active.motionRequirements.effectiveMinAngleDeg;
        setCueProgressWidth(`${clamp(ratio, 0, 1) * 100}%`);
        if (evaluation.matches) resolveSuccess("rotate");
        return;
      }

      if (active.cue.type === "shake") {
        const betaStep = angularDeltaDegrees(sample.beta, previous.beta);
        const gammaStep = angularDeltaDegrees(sample.gamma, previous.gamma);
        const angularStep = Math.abs(betaStep) >= Math.abs(gammaStep) ? betaStep : gammaStep;
        const accelerationAxes = [
          detail.acceleration_x,
          detail.acceleration_y,
          detail.acceleration_z,
        ].filter(isFiniteNumber);
        const accelerationStep = accelerationAxes.reduce(function dominantAxis(current, value) {
          return Math.abs(value) > Math.abs(current) ? value : current;
        }, 0);
        const hasAcceleration = accelerationAxes.length > 0;
        const dominantStep = hasAcceleration ? accelerationStep : angularStep;
        const minimumStep = hasAcceleration ? 0.5 : 1;
        const stepSign = Math.abs(dominantStep) >= minimumStep ? Math.sign(dominantStep) : 0;
        if (stepSign && active.motionLastShakeSign && stepSign !== active.motionLastShakeSign) {
          active.motionShakeReversals += 1;
        }
        if (stepSign) active.motionLastShakeSign = stepSign;
        const accelerationScore = isFiniteNumber(detail.shake_score)
          ? clamp(detail.shake_score, 0, 100)
          : (isFiniteNumber(detail.acceleration_magnitude)
            ? clamp(detail.acceleration_magnitude * (100 / 12), 0, 100)
            : sampleScore);
        active.motionShakePeakScore = Math.max(
          active.motionShakePeakScore,
          accelerationScore,
        );
        const evaluation = evaluateShakeGesture(
          active.motionShakePeakScore,
          active.motionShakeReversals,
          active.motionRequirements,
        );
        const scoreRatio = active.motionShakePeakScore
          / active.motionRequirements.effectiveMinShakeScore;
        const reversalRatio = active.motionShakeReversals
          / active.motionRequirements.requiredReversals;
        setCueProgressWidth(`${clamp(
          Math.min(scoreRatio, reversalRatio),
          0,
          1,
        ) * 100}%`);
        if (evaluation.matches) resolveSuccess("shake");
      }
    }

    async function armMotion(active) {
      const nativeBridge = windowObject.PixoNative || windowObject.MotionCueNative;
      if (!nativeBridge
        || typeof nativeBridge.requestCapability !== "function"
        || typeof nativeBridge.startMotion !== "function") {
        resolveSkipped("capability_unavailable");
        return;
      }
      if (active.capabilityStartPending || active.motionStarted || !state.hostActive) return;
      const activationId = active.activationId;
      const requestToken = ++active.capabilityRequestToken;
      active.capabilityStartPending = true;
      try {
        const permission = await nativeBridge.requestCapability("motion");
        if (!activeMatches(activationId) || requestToken !== active.capabilityRequestToken) return;
        if (!permission || !["granted", "active"].includes(permission.status)) {
          active.capabilityStartPending = false;
          resolveOrDeferCapabilityFailure(permission && permission.status === "denied"
            ? "permission_denied"
            : "capability_unavailable");
          return;
        }
        if (!state.hostActive) {
          active.capabilityStartPending = false;
          return;
        }
        if (typeof active.offMotion !== "function") {
          active.offMotion = installCapabilityListener(
            nativeBridge,
            "motion",
            activationId,
            handleMotionSignal,
          );
        }
        const startResult = await nativeBridge.startMotion();
        active.capabilityStartPending = false;
        if (!activeMatches(activationId) || requestToken !== active.capabilityRequestToken) return;
        if (!state.hostActive) return;
        if (!startResult || startResult.status !== "active") {
          resolveOrDeferCapabilityFailure("capability_unavailable");
          return;
        }
        active.motionStarted = true;
        if (!active.responseTimerInitialized) {
          armWallDeadline(active, active.responseWindowMs);
        }
      } catch (error) {
        active.capabilityStartPending = false;
        if (activeMatches(activationId) && requestToken === active.capabilityRequestToken) {
          resolveOrDeferCapabilityFailure("capability_unavailable");
        }
      }
    }

    function handleVisionSignal(detail, activationId) {
      if (!activeMatches(activationId)) return;
      if (!state.hostActive) return;
      const active = state.active;
      if (detail.status === "stopped") {
        // A stopped event is also emitted while the preceding cue releases CameraX.
        // It is not an interaction miss and must not advance or degrade this cue.
        return;
      }
      if (["denied", "unavailable", "error"].includes(detail.status)) {
        const fatalVisionFailure = detail.status === "error"
          && String(detail.reason || "").startsWith("vision_");
        if (fatalVisionFailure) {
          // Reopening the same browser stream cannot recover a detector/worker
          // failure. Block once and offer the authoring simulation instead of
          // repeatedly flashing and reacquiring the camera preview.
          resolveOrDeferCapabilityFailure("capability_unavailable");
          return;
        }
        retryCameraInsteadOfFallback(
          active,
          detail.status === "denied" ? "permission_denied" : "capability_unavailable",
        );
        return;
      }
      if (detail.status === "active" && !active.cameraStarted) {
        active.cameraStarted = true;
        active.cameraRetryCount = 0;
        active.cameraRetryScheduled = false;
        active.cameraRetryReady = false;
        if (!active.responseTimerInitialized) {
          armWallDeadline(active, active.cameraRequirements.responseWindowMs);
        }
      }
      if (!active.cameraStarted) return;
      if (detail.status === "matched"
        && detail.target === active.cue.detection.vision.target) {
        setCueProgressWidth("100%");
        resolveSuccess("camera_motion");
      }
      if (detail.status === "activity"
        && isCameraContinuousCue(active.cue)
        && detail.target === active.cue.detection.vision.target) {
        active.guidanceHasInput = true;
        startSustainedPlaybackDriving(active, "vision_activity");
      }
    }

    async function armCamera(active) {
      const nativeBridge = windowObject.PixoNative || windowObject.MotionCueNative;
      if (!nativeBridge
        || typeof nativeBridge.requestCapability !== "function"
        || typeof nativeBridge.startVision !== "function") {
        retryCameraInsteadOfFallback(active, "capability_unavailable");
        return;
      }
      if (active.capabilityStartPending || active.cameraStarted || !state.hostActive) return;
      const activationId = active.activationId;
      const requestToken = ++active.capabilityRequestToken;
      active.cameraRetryReady = false;
      active.capabilityStartPending = true;
      try {
        const permission = await nativeBridge.requestCapability("vision");
        if (!activeMatches(activationId) || requestToken !== active.capabilityRequestToken) return;
        if (!permission || !["granted", "active"].includes(permission.status)) {
          active.capabilityStartPending = false;
          resolveOrDeferCapabilityFailure(permission && permission.status === "denied"
            ? "permission_denied"
            : "capability_unavailable");
          return;
        }
        if (!state.hostActive) {
          active.capabilityStartPending = false;
          return;
        }
        if (typeof active.offCamera !== "function") {
          active.offCamera = installCapabilityListener(
            nativeBridge,
            "vision",
            activationId,
            handleVisionSignal,
          );
        }
        const startResult = await nativeBridge.startVision(active.cue.detection.vision);
        active.capabilityStartPending = false;
        if (!activeMatches(activationId) || requestToken !== active.capabilityRequestToken) return;
        if (!state.hostActive || active.capabilityBlocked) return;
        if (!startResult || startResult.status !== "active") {
          retryCameraInsteadOfFallback(active, startResult && startResult.status === "denied"
            ? "permission_denied"
            : "capability_unavailable");
          return;
        }
        active.cameraStarted = true;
        if (!active.responseTimerInitialized) {
          armWallDeadline(active, active.cameraRequirements.responseWindowMs);
        }
      } catch (error) {
        active.capabilityStartPending = false;
        if (activeMatches(activationId) && requestToken === active.capabilityRequestToken) {
          retryCameraInsteadOfFallback(active, "capability_unavailable");
        }
      }
    }

    function skipUnsupportedCameraCue(active) {
      const activationId = active.activationId;
      windowObject.setTimeout(function skipCameraContentRecognition() {
        if (!activeMatches(activationId) || !state.hostActive) return;
        resolveSkipped("camera_content_recognition_unavailable");
      }, 250);
    }

    function continuousMicrophoneMeterProfile(active, features) {
      if (isContinuousBlowCue(active.cue)) {
        const target = continuousBlowTarget(
          features || { echoCancelerEnabled: true },
        );
        return Object.freeze({
          label: "Blow volume",
          ...target,
          displayScore: active.continuousMicrophoneScore,
        });
      }
      const sourceFeatures = features || {
        echoCancelerEnabled: true,
        hasPitchFeatures: true,
      };
      const target = continuousVoiceTarget(
        sourceFeatures,
        active.voiceActivationThreshold,
      );
      return Object.freeze({
        label: "Voice pitch",
        ...target,
        displayScore: active.continuousMicrophoneScore,
      });
    }

    function smoothContinuousMicrophoneScore(active, rawScore, now) {
      const sampleAt = isFiniteNumber(now) ? now : performance.now();
      active.continuousMicrophoneRawSamples.push({
        at: sampleAt,
        score: clamp(rawScore, 0, 100),
      });
      const cutoff = sampleAt - CONTINUOUS_MICROPHONE_MEDIAN_WINDOW_MS;
      active.continuousMicrophoneRawSamples = active.continuousMicrophoneRawSamples.filter(
        function keepRecentScore(sample) {
          return sample.at >= cutoff;
        },
      );
      const sortedScores = active.continuousMicrophoneRawSamples
        .map(function mapScore(sample) { return sample.score; })
        .sort(function sortScores(left, right) { return left - right; });
      const middleIndex = Math.floor(sortedScores.length / 2);
      const medianScore = sortedScores.length % 2 === 0
        ? (sortedScores[middleIndex - 1] + sortedScores[middleIndex]) / 2
        : sortedScores[middleIndex];
      const previous = isFiniteNumber(active.continuousMicrophoneScore)
        ? active.continuousMicrophoneScore
        : 0;
      const previousAt = isFiniteNumber(active.continuousMicrophoneScoreAt)
        ? active.continuousMicrophoneScoreAt
        : null;
      const elapsedMs = previousAt === null
        ? CONTINUOUS_MICROPHONE_DEFAULT_SAMPLE_INTERVAL_MS
        : clamp(
          sampleAt - previousAt,
          1,
          CONTINUOUS_MICROPHONE_SMOOTHING_TIME_MS * 2,
        );
      const targetScore = Math.abs(medianScore - previous)
        <= CONTINUOUS_MICROPHONE_SCORE_DEADBAND
        ? previous
        : medianScore;
      const smoothingTimeMs = isContinuousVoiceCue(active.cue)
        && targetScore < previous
        ? CONTINUOUS_VOICE_RELEASE_SMOOTHING_TIME_MS
        : CONTINUOUS_MICROPHONE_SMOOTHING_TIME_MS;
      const alpha = 1 - Math.exp(-elapsedMs / smoothingTimeMs);
      active.continuousMicrophoneScore = clamp(
        previous + (targetScore - previous) * alpha,
        0,
        100,
      );
      active.continuousMicrophoneScoreAt = sampleAt;
      return active.continuousMicrophoneScore;
    }

    function soundMeterCurvePoints(history) {
      const values = Array.isArray(history) && history.length > 0 ? history : [0];
      const divisor = Math.max(1, values.length - 1);
      return values.map(function mapSoundLevel(score, index) {
        const x = index / divisor * 100;
        const y = 100 - clamp(score, 0, 100);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      }).join(" ");
    }

    function resetSoundMeter(active) {
      if (!active || !isContinuousMicrophoneCue(active.cue)) {
        elements.soundMeter.hidden = true;
        return;
      }
      active.soundMeterHistory = Array(SOUND_METER_HISTORY_SIZE).fill(0);
      active.continuousMicrophoneRawSamples = [];
      active.continuousMicrophoneScore = 0;
      active.continuousMicrophoneScoreAt = null;
      const profile = continuousMicrophoneMeterProfile(active, null);
      active.guidanceMeter = { minimum: profile.minimumScore, maximum: profile.maximumScore, score: 0, history: active.soundMeterHistory, pitch: profile.pitchAvailable };
      elements.soundMeter.hidden = false;
      elements.soundMeter.dataset.inBand = "false";
      elements.soundMeter.dataset.driving = "false";
      elements.soundMeterLabel.textContent = profile.label;
      elements.soundMeterTargetBand.style.bottom = `${profile.minimumScore}%`;
      elements.soundMeterTargetBand.style.height = `${Math.max(
        3,
        profile.maximumScore - profile.minimumScore,
      )}%`;
      elements.soundMeterThresholdLabel.textContent = "Target";
      elements.soundMeterCurve.setAttribute(
        "points",
        soundMeterCurvePoints(active.soundMeterHistory),
      );
      elements.soundMeterCurrent.style.bottom = "0%";
    }

    function renderSoundMeter(active, features, inBand) {
      if (!active || !isContinuousMicrophoneCue(active.cue)) return;
      const profile = continuousMicrophoneMeterProfile(active, features);
      const score = clamp(profile.displayScore, 0, 100);
      active.guidanceMeter = { minimum: profile.minimumScore, maximum: profile.maximumScore, score, history: active.soundMeterHistory, pitch: profile.pitchAvailable };
      active.soundMeterHistory.push(score);
      if (active.soundMeterHistory.length > SOUND_METER_HISTORY_SIZE) {
        active.soundMeterHistory.splice(
          0,
          active.soundMeterHistory.length - SOUND_METER_HISTORY_SIZE,
        );
      }
      elements.soundMeterLabel.textContent = profile.label;
      elements.soundMeterTargetBand.style.bottom = `${profile.minimumScore}%`;
      elements.soundMeterTargetBand.style.height = `${Math.max(
        3,
        profile.maximumScore - profile.minimumScore,
      )}%`;
      elements.soundMeterThresholdLabel.textContent = "Target";
      elements.soundMeterCurve.setAttribute(
        "points",
        soundMeterCurvePoints(active.soundMeterHistory),
      );
      elements.soundMeterCurrent.style.bottom = `${score}%`;
      elements.soundMeter.dataset.inBand = String(inBand);
      elements.soundMeter.dataset.driving = String(active.continuousDriving === true);
    }

    function recordContinuousMicrophoneEvidence(
      active,
      now,
      matched,
    ) {
      const signalStarted = active.voiceSignalActive || active.continuousDriving;
      const hasPriorMatch = active.continuousMicrophoneSamples.some(
        function hasMatch(sample) { return sample.matched === true; },
      );
      if (!signalStarted && matched && !hasPriorMatch) {
        active.continuousMicrophoneSamples = [];
      }
      active.continuousMicrophoneSamples.push({ at: now, matched });
      const evidence = evaluateContinuousMicrophoneEvidence(
        active.continuousMicrophoneSamples,
        now,
        {
          minimumDurationMs: active.voiceRequirements.effectiveDurationMs,
        },
      );
      active.continuousMicrophoneSamples = evidence.samples;
      return evidence;
    }

    function resetVoiceDetection(active) {
      if (!active) return;
      const thresholds = calculateVoiceThresholds(
        active.voiceRequirements.effectiveMinVolumeScore,
      );
      active.voiceActivationThreshold = thresholds.startScore;
      active.voiceHoldThreshold = thresholds.holdScore;
      active.voiceSignalActive = false;
      active.voiceAboveSince = 0;
      active.voiceQuietSince = 0;
      active.voiceSawLowSample = true;
      active.voiceClapCandidateSince = 0;
      active.continuousMicrophoneSamples = [];
      elements.interactionLabel.textContent = active.cue.type === "mic_quiet"
        ? "Stay quiet"
        : (active.cue.type === "mic_clap" ? "Clap once" : "Use the mic");
      setCueProgressWidth("0%");
      elements.caption.dataset.voiceQualified = "false";
      if (isContinuousMicrophoneCue(active.cue)) resetSoundMeter(active);
      if (!elements.voiceDebug.hidden) {
        if (isContinuousMicrophoneCue(active.cue)) {
          const profile = continuousMicrophoneMeterProfile(active, null);
          elements.voiceDebug.textContent = `Ready · Target ${Math.round(
            profile.targetScore,
          )} ±${profile.tolerancePoints}`;
        } else {
          elements.voiceDebug.textContent = `Ready · Start ${Math.round(thresholds.startScore)} · Hold ${Math.round(thresholds.holdScore)}`;
        }
      }
    }

    async function armVoice(active) {
      const nativeBridge = windowObject.PixoNative || windowObject.MotionCueNative;
      if (!nativeBridge
        || typeof nativeBridge.requestCapability !== "function"
        || typeof nativeBridge.startMicrophoneLevel !== "function") {
        resolveSkipped("capability_unavailable");
        return;
      }
      if (active.voicePermissionPending || active.voiceStartPending || active.microphoneStarted) return;
      const activationId = active.activationId;
      let permission = active.voicePermissionResult;
      if (!permission) {
        const permissionToken = ++active.voiceRequestToken;
        active.voicePermissionPending = true;
        active.permissionTimer = windowObject.setTimeout(function permissionTimedOut() {
          if (activeMatches(activationId) && permissionToken === active.voiceRequestToken) {
            resolveOrDeferCapabilityFailure("capability_unavailable");
          }
        }, VOICE_PERMISSION_TIMEOUT_MS);
        try {
          permission = await nativeBridge.requestCapability("microphoneLevel");
        } catch (error) {
          permission = { status: "denied" };
        }
        active.voicePermissionPending = false;
        if (!activeMatches(activationId) || permissionToken !== active.voiceRequestToken) return;
        windowObject.clearTimeout(active.permissionTimer);
        active.permissionTimer = 0;
        active.voicePermissionResult = permission;
      }

      if (!activeMatches(activationId)) return;
      if (!permission || !["granted", "active"].includes(permission.status)) {
        resolveOrDeferCapabilityFailure(
          permission && permission.status === "denied"
            ? "permission_denied"
            : "capability_unavailable",
        );
        return;
      }
      if (!state.hostActive) return;

      const startToken = ++active.voiceRequestToken;
      active.voiceStartPending = true;
      try {
        active.offMicrophone = installMicrophoneListener(nativeBridge, activationId);
        const startResult = await nativeBridge.startMicrophoneLevel(
          isContinuousBlowCue(active.cue)
            ? { processing_profile: "continuous_blow_v1" }
            : (isContinuousVoiceCue(active.cue)
              ? { processing_profile: "continuous_voice_v1" }
              : undefined),
        );
        active.voiceStartPending = false;
        if (!activeMatches(activationId)
          || startToken !== active.voiceRequestToken) return;
        if (!startResult || !["granted", "active"].includes(startResult.status)) {
          resolveOrDeferCapabilityFailure(
            startResult && startResult.status === "denied"
              ? "permission_denied"
              : "capability_unavailable",
          );
          return;
        }
        if (!state.hostActive) return;
        active.microphoneStarted = true;
        resetVoiceDetection(active);
        const pendingMicrophoneDetails = active.pendingMicrophoneDetails.slice();
        active.pendingMicrophoneDetails.length = 0;
        if (active.responseTimerInitialized) {
          resumeWallDeadline(active);
        } else {
          armWallDeadline(active, active.cue.detection.response_window_ms);
        }
        pendingMicrophoneDetails.forEach(function processPendingMicrophoneDetail(detail) {
          if (activeMatches(activationId)) handleVoiceLevel(detail, activationId);
        });
      } catch (error) {
        active.voiceStartPending = false;
        if (activeMatches(activationId)
          && startToken === active.voiceRequestToken) {
          resolveOrDeferCapabilityFailure("permission_denied");
        }
      }
    }

    function handleVoiceLevel(detail, activationId) {
      if (!activeMatches(activationId)) return;
      const active = state.active;
      if (["denied", "unavailable", "stopped", "error"].includes(detail.status)) {
        resolveOrDeferCapabilityFailure(
          detail.status === "denied"
            ? "permission_denied"
            : "capability_unavailable",
        );
        return;
      }
      if (!active.microphoneStarted) {
        if (active.voiceStartPending) {
          active.pendingMicrophoneDetails.push(detail);
          if (active.pendingMicrophoneDetails.length > 4) {
            active.pendingMicrophoneDetails.shift();
          }
        }
        return;
      }
      const features = calculateMicrophoneFeatures(detail);
      active.guidanceCalibrating = !features.normalizationReady;
      if (!features.normalizationReady) {
        active.voiceSignalActive = false;
        active.voiceAboveSince = 0;
        active.voiceQuietSince = 0;
        active.voiceSawLowSample = true;
        active.voiceClapCandidateSince = 0;
        elements.caption.dataset.voiceQualified = "false";
        setCueProgressWidth("0%");
        elements.interactionTarget.style.setProperty("--voice-level", "0.2");
        if (isContinuousMicrophoneCue(active.cue)) {
          active.continuousMicrophoneSamples = [];
          resetSoundMeter(active);
        }
        if (!elements.voiceDebug.hidden) {
          elements.voiceDebug.textContent = `Calibrating microphone · ${Math.round(
            features.calibrationProgress * 100,
          )}%`;
        }
        return;
      }
      active.guidanceHasInput = true;
      active.guidanceLevel = features.volumeScore / 100;
      const volumeScore = features.volumeScore;
      const requirements = active.voiceRequirements;
      const blowCue = active.cue.type === "mic_blow" || isContinuousBlowCue(active.cue);
      const continuousBlowCue = isContinuousBlowCue(active.cue);
      const continuousVoiceCue = isContinuousVoiceCue(active.cue);
      const now = performance.now();
      const rawDetectorScore = continuousBlowCue
        ? calculateContinuousBlowScore(features)
        : (continuousVoiceCue
          ? calculateContinuousVoiceScore(features)
          : (blowCue ? calculateBlowScore(features, active.cue) : volumeScore));
      const detectorScore = isContinuousMicrophoneCue(active.cue)
        ? smoothContinuousMicrophoneScore(active, rawDetectorScore, now)
        : rawDetectorScore;
      const visualLevel = requirements.baseVolumeScore > 0
        ? clamp(detectorScore / requirements.baseVolumeScore, 0.2, 1)
        : 1;
      elements.interactionTarget.style.setProperty("--voice-level", String(visualLevel));

      if (active.cue.type === "mic_quiet") {
        const quiet = volumeScore <= active.quietRequirements.effectiveMaxVolumeScore;
        elements.caption.dataset.voiceQualified = String(quiet);
        if (quiet) {
          if (!active.voiceQuietSince) active.voiceQuietSince = now;
          const elapsed = now - active.voiceQuietSince;
          setCueProgressWidth(`${clamp(
            elapsed / active.quietRequirements.effectiveDurationMs,
            0,
            1,
          ) * 100}%`);
          if (elapsed >= active.quietRequirements.effectiveDurationMs) {
            resolveSuccess("quiet");
          }
        } else {
          active.voiceQuietSince = 0;
          setCueProgressWidth("0%");
        }
        return;
      }

      if (active.cue.type === "mic_clap") {
        const threshold = active.voiceRequirements.effectiveMinVolumeScore;
        if (features.hasTransientFeatures) {
          const profile = MIC_DETECTOR_PROFILES.mic_clap;
          const candidateAge = active.voiceClapCandidateSince
            ? now - active.voiceClapCandidateSince
            : 0;
          if (active.voiceClapCandidateSince
            && candidateAge <= profile.maximumReleaseMs
            && isClapRelease(features, threshold)) {
            elements.caption.dataset.voiceQualified = "true";
            setCueProgressWidth("100%");
            resolveSuccess("clap");
            return;
          }
          if (active.voiceClapCandidateSince && candidateAge > profile.maximumReleaseMs) {
            active.voiceClapCandidateSince = 0;
          }
          if (!active.voiceClapCandidateSince && isClapOnset(features, threshold)) {
            active.voiceClapCandidateSince = now;
          }
          const candidateActive = active.voiceClapCandidateSince > 0;
          elements.caption.dataset.voiceQualified = String(candidateActive);
          setCueProgressWidth(`${clamp(
            features.peakScore / threshold,
            0,
            1,
          ) * 100}%`);
          return;
        }
        const isHigh = volumeScore >= threshold;
        if (!isHigh) active.voiceSawLowSample = true;
        elements.caption.dataset.voiceQualified = String(isHigh);
        setCueProgressWidth(`${clamp(volumeScore / threshold, 0, 1) * 100}%`);
        if (isHigh && active.voiceSawLowSample && !active.voiceSignalActive) {
          active.voiceSignalActive = true;
          resolveSuccess("clap");
        } else if (!isHigh) {
          active.voiceSignalActive = false;
        }
        return;
      }

      const voiceTarget = continuousVoiceCue
        ? continuousVoiceTarget(
          features,
          active.voiceActivationThreshold,
        )
        : null;
      const blowTarget = continuousBlowCue
        ? continuousBlowTarget(features)
        : null;
      const continuousTarget = voiceTarget || blowTarget;
      const threshold = continuousTarget
        ? continuousTarget.targetScore
        : (active.voiceSignalActive
          ? active.voiceHoldThreshold
          : active.voiceActivationThreshold);
      const scoreInBand = continuousTarget
        ? isContinuousMicrophoneScoreInBand(detectorScore, continuousTarget)
        : detectorScore >= threshold;
      const noiseQualified = !blowCue
        || isBlowNoiseQualified(features, active.voiceSignalActive, active.cue);
      const voiceQualified = !voiceTarget
        || isContinuousVoiceQualified(features, voiceTarget, detectorScore);
      const instantQualified = scoreInBand
        && noiseQualified
        && voiceQualified;
      const continuousMicrophoneCue = isContinuousMicrophoneCue(active.cue);
      const continuousEvidence = continuousMicrophoneCue
        ? recordContinuousMicrophoneEvidence(
          active,
          now,
          instantQualified,
        )
        : null;
      const signalQualified = continuousEvidence
        ? continuousEvidence.qualified
        : instantQualified;
      if (continuousMicrophoneCue) {
        renderSoundMeter(active, features, instantQualified);
      }
      if (signalQualified) {
        elements.caption.dataset.voiceQualified = "true";
        if (!active.voiceSignalActive) {
          active.voiceSignalActive = true;
          active.voiceAboveSince = continuousEvidence
            ? now - requirements.effectiveDurationMs
            : now;
        }
        const elapsed = continuousEvidence
          ? requirements.effectiveDurationMs
          : now - active.voiceAboveSince;
        if (!elements.voiceDebug.hidden) {
          const rmsDbfs = isFiniteNumber(detail.rms_dbfs)
            ? `${detail.rms_dbfs.toFixed(1)} dBFS`
            : "-- dBFS";
          const lowFrequency = features.hasLowFrequencyFeatures
            ? ` · Low ${features.lowFrequencyRatio.toFixed(2)}`
            : "";
          const pitch = continuousVoiceCue && features.hasPitchFeatures
            ? ` · Pitch ${features.pitchHz.toFixed(0)}Hz/${Math.round(
              features.pitchConfidence,
            )}`
            : "";
          const signalToNoise = continuousVoiceCue && isFiniteNumber(features.signalToNoiseDb)
            ? ` · SNR ${features.signalToNoiseDb.toFixed(1)}dB`
            : "";
          const echoCanceler = isContinuousMicrophoneCue(active.cue)
            ? ` · AEC ${features.echoCancelerEnabled ? "on" : "off"}`
            : "";
          const audioSource = typeof detail.audio_source === "string"
            ? ` · ${detail.audio_source}`
            : "";
          const evidence = continuousEvidence
            ? ` · Window ${Math.round(continuousEvidence.matchRatio * 100)}%`
            : "";
          const scoreSummary = continuousTarget
            ? `Score ${Math.round(detectorScore)} · Target ${Math.round(
              continuousTarget.targetScore,
            )} ±${continuousTarget.tolerancePoints} · ${instantQualified ? "In band" : "Outside"}`
            : `Signal ${Math.round(detectorScore)} / ${Math.round(threshold)}`;
          const duration = continuousTarget
            ? ""
            : ` · Hold ${Math.round(Math.min(
              elapsed,
              requirements.effectiveDurationMs,
            ))} / ${Math.round(requirements.effectiveDurationMs)}ms`;
          elements.voiceDebug.textContent = `${scoreSummary} · ${rmsDbfs}${signalToNoise}${pitch}${lowFrequency}${echoCanceler}${audioSource}${evidence}${duration}`;
        }
        const ratio = clamp(elapsed / requirements.effectiveDurationMs, 0, 1);
        setCueProgressWidth(`${ratio * 100}%`);
        if (elapsed >= requirements.effectiveDurationMs) {
          if (isContinuousBlowCue(active.cue)) {
            startSustainedPlaybackDriving(active, "continuous_blow");
          } else if (continuousVoiceCue) {
            startSustainedPlaybackDriving(active, "continuous_voice");
          } else {
            resolveSuccess(active.cue.type === "mic_blow" ? "blow" : "intentional_sound");
          }
        }
      } else {
        elements.caption.dataset.voiceQualified = "false";
        if (!isContinuousMicrophoneCue(active.cue) || !active.continuousDriving) {
          active.voiceSignalActive = false;
          active.voiceAboveSince = 0;
        }
        if (!elements.voiceDebug.hidden) {
          const rmsDbfs = isFiniteNumber(detail.rms_dbfs)
            ? `${detail.rms_dbfs.toFixed(1)} dBFS`
            : "-- dBFS";
          const lowFrequency = features.hasLowFrequencyFeatures
            ? ` · Low ${features.lowFrequencyRatio.toFixed(2)}`
            : "";
          const pitch = continuousVoiceCue && features.hasPitchFeatures
            ? ` · Pitch ${features.pitchHz.toFixed(0)}Hz/${Math.round(
              features.pitchConfidence,
            )}`
            : "";
          const signalToNoise = continuousVoiceCue && isFiniteNumber(features.signalToNoiseDb)
            ? ` · SNR ${features.signalToNoiseDb.toFixed(1)}dB`
            : "";
          const echoCanceler = isContinuousMicrophoneCue(active.cue)
            ? ` · AEC ${features.echoCancelerEnabled ? "on" : "off"}`
            : "";
          const audioSource = typeof detail.audio_source === "string"
            ? ` · ${detail.audio_source}`
            : "";
          const evidence = continuousEvidence
            ? ` · Window ${Math.round(continuousEvidence.matchRatio * 100)}%`
            : "";
          const scoreSummary = continuousTarget
            ? `Score ${Math.round(detectorScore)} · Target ${Math.round(
              continuousTarget.targetScore,
            )} ±${continuousTarget.tolerancePoints} · ${instantQualified ? "In band" : "Outside"}`
            : `Signal ${Math.round(detectorScore)} / ${Math.round(threshold)}`;
          elements.voiceDebug.textContent = `Ready · ${scoreSummary} · ${rmsDbfs}${signalToNoise}${pitch}${lowFrequency}${echoCanceler}${audioSource}${evidence}`;
        }
        if (!continuousMicrophoneCue || !active.continuousDriving) {
          setCueProgressWidth(continuousEvidence
            ? `${continuousEvidence.progress * 100}%`
            : "0%");
        }
      }
    }

    function activateCue(index) {
      if (state.active || !state.experience || !state.started || !isCurrentMediaReady()) return false;
      const cue = currentCues()[index];
      if (!cue || state.cueStates.get(cueKey(cue)) !== "pending") return false;
      const pausedVideo = cue.pause_video !== false;
      const activatedAtMediaEnd = Boolean(
        elements.video.ended
        && cueStartsAtMediaEnd(cue, Number(elements.video.duration || 0) * 1000),
      );
      const active = {
        cue,
        index,
        mediaGeneration: state.mediaGeneration,
        activationId: `${state.segmentIndex}:${cueKey(cue)}:${++state.activationSequence}`,
        resolved: false,
        pausedVideo,
        activatedAtMediaEnd,
        deadlineTimer: 0,
        permissionTimer: 0,
        holdTimer: 0,
        holdPointerId: null,
        tapCount: 0,
        guidancePointers: new Map(),
        guidancePath: [],
        guidanceOrigin: null,
        guidanceLastPoint: null,
        guidanceProgress: 0,
        guidanceHasInput: false,
        guidanceLevel: 0,
        guidanceMeter: null,
        guidanceCalibrating: false,
        tapSequenceStartedAt: 0,
        swipePointerId: null,
        swipeStartX: 0,
        swipeStartY: 0,
        swipeStartedAt: 0,
        continuousPointerId: null,
        continuousCaptureTarget: null,
        continuousPhase: "idle",
        continuousAnchorX: 0,
        continuousAnchorY: 0,
        continuousDirectionX: 0,
        continuousDirectionY: 0,
        continuousTurnX: 0,
        continuousTurnY: 0,
        continuousLastX: 0,
        continuousLastY: 0,
        continuousDriving: false,
        continuousHoldKeyboardActive: false,
        continuousIdleTimer: 0,
        continuousTapFeedbackTimer: 0,
        continuousPlayRequestToken: 0,
        authoringSimulationDriving: false,
        gesturePointers: new Map(),
        gesturePointerId: null,
        gestureCaptureTarget: null,
        gestureStartX: 0,
        gestureStartY: 0,
        gestureLastX: 0,
        gestureLastY: 0,
        gestureStartedAt: 0,
        gestureTravelDp: 0,
        gestureReversalsX: 0,
        gestureReversalsY: 0,
        gestureLastSignX: 0,
        gestureLastSignY: 0,
        gesturePath: [],
        eraseFogFrame: 0,
        eraseFogInitialized: false,
        eraseFogWidth: 0,
        eraseFogHeight: 0,
        eraseFogStrokes: [],
        eraseFogLastPoint: null,
        eraseStartedAt: 0,
        eraseAccumulatedTravelDp: 0,
        eraseAccumulatedReversals: 0,
        pinchStartDistanceDp: 0,
        pinchStartedAt: 0,
        pinchQualified: false,
        pinchCandidateStartedAt: null,
        circleQualified: false,
        offMicrophone: null,
        microphoneStarted: false,
        voiceRequestToken: 0,
        voicePermissionPending: false,
        voicePermissionResult: null,
        voiceStartPending: false,
        voiceActivationThreshold: 0,
        voiceHoldThreshold: 0,
        voiceSignalActive: false,
        voiceAboveSince: 0,
        voiceQuietSince: 0,
        voiceSawLowSample: false,
        voiceClapCandidateSince: 0,
        continuousMicrophoneSamples: [],
        continuousMicrophoneRawSamples: [],
        continuousMicrophoneScore: 0,
        continuousMicrophoneScoreAt: null,
        soundMeterHistory: [],
        pendingMicrophoneDetails: [],
        capabilityRequestToken: 0,
        capabilityStartPending: false,
        pendingCapabilityFailure: null,
        capabilityBlocked: false,
        offMotion: null,
        motionStarted: false,
        motionBaseline: null,
        motionPrevious: null,
        motionStableSince: 0,
        motionRotationTravelDeg: 0,
        motionShakePeakScore: 0,
        motionShakeReversals: 0,
        motionLastShakeSign: 0,
        offCamera: null,
        cameraStarted: false,
        cameraRetryTimer: 0,
        cameraRetryCount: 0,
        cameraRetryScheduled: false,
        cameraRetryReady: false,
        cameraQualifiedFrames: 0,
        mediaAudioState: null,
        deadlineStartedAt: 0,
        responseElapsedMs: 0,
        responseTimerInitialized: false,
        inputReadyEmitted: false,
        responseWindowMs: responseDeadlineForCue(
          cue,
          cue.detection.response_window_ms,
        ),
        tapWindow: calculateTapWindow(
          cue.detection.response_window_ms,
          cue.offset_time_ms,
        ),
        swipeRequirements: calculateSwipeRequirements(
          cue.detection.min_distance_dp,
          cue.detection.response_window_ms,
          cue.detection.confidence_threshold,
        ),
        dragRequirements: calculateDragRequirements(
          cue.detection.min_distance_dp,
          cue.detection.response_window_ms,
          cue.detection.confidence_threshold,
        ),
        scrubRequirements: calculateScrubRequirements(
          cue.detection.min_travel_dp,
          cue.detection.response_window_ms,
          cue.detection.confidence_threshold,
        ),
        continuousSwipeRequirements: calculateContinuousSwipeRequirements(
          cue.detection.min_travel_dp,
          cue.detection.idle_timeout_ms,
          cue.detection.confidence_threshold,
        ),
        continuousIdleTimeoutMs: isContinuousHoldCue(cue)
          ? 0
          : isContinuousTapCue(cue)
            ? DEFAULT_CONTINUOUS_TAP_IDLE_TIMEOUT_MS
            : isCameraContinuousCue(cue)
            ? DEFAULT_CAMERA_CONTINUOUS_IDLE_TIMEOUT_MS
            : isContinuousBlowCue(cue)
              ? DEFAULT_CONTINUOUS_BLOW_IDLE_TIMEOUT_MS
              : isContinuousVoiceCue(cue)
                ? DEFAULT_CONTINUOUS_VOICE_IDLE_TIMEOUT_MS
              : calculateContinuousSwipeRequirements(
                cue.detection.min_travel_dp,
                cue.detection.idle_timeout_ms,
                cue.detection.confidence_threshold,
              ).idleTimeoutMs,
        pinchRequirements: calculatePinchRequirements(
          cue.detection.min_scale_delta,
          cue.detection.response_window_ms,
          cue.detection.confidence_threshold,
          cue.detection.pinch_direction,
        ),
        circleRequirements: calculateCircleRequirements(
          cue.detection.min_radius_dp,
          cue.detection.max_closure_gap_dp,
          cue.detection.response_window_ms,
          cue.detection.confidence_threshold,
          cue.detection.rotation_direction,
        ),
        eraseRequirements: calculateEraseRequirements(
          cue.detection.min_travel_dp,
          cue.detection.response_window_ms,
          cue.detection.confidence_threshold,
        ),
        longPressNominalDurationMs: cue.detection.min_duration_ms,
        longPressDurationMs: calculateLongPressDuration(
          cue.detection.min_duration_ms,
          cue.detection.confidence_threshold,
        ),
        motionRequirements: calculateMotionRequirements(cue),
        cameraRequirements: calculateCameraRequirements(
          cue.detection.min_motion_score,
          cue.detection.response_window_ms,
          cue.detection.confidence_threshold,
        ),
        voiceRequirements: calculateVoiceRequirements(
          cue.detection.min_volume_score,
          cue.detection.min_duration_ms,
          cue.detection.confidence_threshold,
        ),
        quietRequirements: calculateQuietRequirements(
          cue.detection.max_volume_score,
          cue.detection.min_duration_ms,
          cue.detection.confidence_threshold,
        ),
      };
      state.active = active;
      suppressMicrophoneMediaAudio(active);
      setCueState(cue, "active");
      if (pausedVideo && !elements.video.paused) elements.video.pause();
      renderActiveCue(cue);
      if (isEraseCue(cue)) showEraseFog(active);
      emitRuntimeEvent("gateOpened", {
        cueId: cue.id,
        activationId: active.activationId,
        type: cue.type,
        description: String(cue.description || cue.guide && cue.guide.instruction || ""),
        instruction: cue.guide ? cue.guide.instruction : "Interaction unavailable",
        segmentIndex: state.segmentIndex,
        interactionIndex: currentCues().indexOf(cue),
        offsetTimeMs: cue.offset_time_ms,
        responseWindowMs: active.responseWindowMs,
        place: cue.detection.place,
        pauseVideo: cue.pause_video,
      });
      const hostFallbackType = hostInteractionFallbackType(cue.type);
      if (hostFallbackType) {
        windowObject.setTimeout(function applyHostDeclaredFallback() {
          if (activeMatches(active.activationId)) {
            degradeCueToHold(active, "host_declared_fallback");
          }
        }, 250);
      } else if (isInteractionTypeDisabledByHost(cue.type)) {
        windowObject.setTimeout(function resolveHostUnsupportedCue() {
          if (activeMatches(active.activationId)) {
            resolveOrDeferCapabilityFailure("capability_unavailable");
          }
        }, 250);
      } else if (!KNOWN_TYPES.has(cue.type)) {
        windowObject.setTimeout(function skipUnknownCue() {
          if (activeMatches(active.activationId)) resolveSkipped("unknown_type");
        }, 250);
      } else if (isMicrophoneCue(cue)) {
        armVoice(active);
      } else if (isCameraCue(cue)) {
        armCamera(active);
      } else if (isMotionCue(cue)) {
        armMotion(active);
      } else if (isTapCue(cue)) {
        armWallDeadline(active, active.responseWindowMs);
      } else if (isSustainedPlaybackCue(cue)) {
        armWallDeadline(active, 0);
        if (isContinuousSwipeCue(cue)) {
          // A finger may already be moving when the playhead reaches this cue.
          // Adopt and replay its recent path so the gate does not require an
          // artificial lift/re-touch boundary.
          adoptTrackedContinuousPointer(active);
        }
      } else {
        armWallDeadline(active, active.responseWindowMs);
      }
      return true;
    }

    function findNextCue(positionMs) {
      if (!state.experience || !isCurrentMediaReady()) return false;
      const cues = currentCues();
      const durationMs = Number(elements.video.duration || 0) * 1000;
      for (let index = 0; index < cues.length; index += 1) {
        const cue = cues[index];
        if (state.cueStates.get(cueKey(cue)) !== "pending") continue;
        if (cueStartsAtMediaEnd(cue, durationMs)) continue;
        if (positionMs >= cue.offset_time_ms) {
          activateCue(index);
          return Boolean(state.active);
        }
      }
      return false;
    }

    function nextPendingCueAfter(active) {
      if (!active) return null;
      const cues = currentCues();
      for (let index = active.index + 1; index < cues.length; index += 1) {
        const cue = cues[index];
        if (state.cueStates.get(cueKey(cue)) === "pending") return cue;
      }
      return null;
    }

    function startFrameLoop() {
      if (state.destroyed || !state.hostActive || state.frameId) return;
      state.frameId = windowObject.requestAnimationFrame(frame);
    }

    function stopFrameLoop() {
      if (!state.frameId) return;
      windowObject.cancelAnimationFrame(state.frameId);
      state.frameId = 0;
    }

    function frame() {
      state.frameId = 0;
      if (state.destroyed || !state.hostActive) return;
      updateTimeline();
      updateCueCountdown();
      updateGuidance();
      if (state.started && !elements.video.ended && isCurrentMediaReady()) {
        let positionMs = Number(elements.video.currentTime || 0) * 1000;
        const nextCue = nextPendingCueAfter(state.active);
        if (shouldCompleteSustainedPlaybackCue(state.active, nextCue, positionMs)) {
          const boundaryMs = sustainedPlaybackEndMs(state.active, nextCue);
          if (isFiniteNumber(boundaryMs) && positionMs > boundaryMs) {
            if (!elements.video.paused) elements.video.pause();
            elements.video.currentTime = boundaryMs / 1000;
            positionMs = boundaryMs;
          }
          completeSustainedPlaybackCue("range_end");
        }
        const activeAfterBoundary = state.active;
        const nextCueAfterBoundary = nextPendingCueAfter(activeAfterBoundary);
        if (shouldSupersedeUnlimitedPlayingCue(
          activeAfterBoundary,
          nextCueAfterBoundary,
          positionMs,
        )) {
          resolveSupersededUnlimitedCue("next_cue_reached");
        }
        if (!state.active && !state.replayScheduled && !state.pendingResultAction) {
          findNextCue(positionMs);
        }
      }
      startFrameLoop();
    }

    function resetExperienceForReplay() {
      cleanupActiveResources(state.active);
      windowObject.clearTimeout(state.replayTimer);
      state.active = null;
      state.replayTimer = 0;
      state.replayScheduled = false;
      state.pendingReplayTargetMs = null;
      state.pendingReplayMediaGeneration = -1;
      state.pendingSegmentStartMs = 0;
      state.mediaEndDeferred = false;
      state.pendingResultAction = null;
      state.retryOrigin = null;
      state.resumePlaybackOnHostActive = false;
      state.started = true;
      state.cueStates.clear();
      state.segmentIndex = 0;
      state.completedCueCount = 0;
      state.phase = state.hostActive ? "playing" : "inactive";
      const firstSegment = currentSegment();
      currentCues().forEach(function resetCue(cue) {
        state.cueStates.set(cueKey(cue), "pending");
      });
      renderMarkers();
      setCueUiVisible(false);
      elements.completionPanel.hidden = true;
      elements.app.dataset.runtimeState = state.phase;
      elements.title.textContent = firstSegment ? firstSegment.title : state.experience.title;
      prepareCurrentSegmentMedia(true);
      requestPlaybackIfAllowed();
      emitRuntimeEvent("replay", {});
    }

    function handleTargetClick(event) {
      const active = state.active;
      if (!active || active.resolved || performance.now() < state.inputDebounceUntil) return;
      if (isContinuousTapCue(active.cue)) {
        event.preventDefault();
        if (event.detail === 0) renewContinuousTap(active, "accessibility_click");
        return;
      }
      if (isContinuousHoldCue(active.cue)) {
        event.preventDefault();
        return;
      }
      if (isContinuousSwipeCue(active.cue)) {
        if (event.detail === 0) {
          announce("Swipe back and forth continuously to play.", true);
        }
        return;
      }
      if (event.detail === 0) {
        resolveSuccess("accessibility_click");
        return;
      }
      if (!isTapCue(active.cue)) return;
      event.preventDefault();
      const now = performance.now();
      if (!active.tapSequenceStartedAt) active.tapSequenceStartedAt = now;
      if (active.tapWindow.responseWindowMs !== 0
        && now - active.tapSequenceStartedAt > active.tapWindow.responseWindowMs) {
        active.tapCount = 0;
        active.tapSequenceStartedAt = now;
      }
      active.tapCount += 1;
      active.guidanceHasInput = true;
      const requiredCount = requiredTapCount(active.cue);
      if (active.cue.type === "multi_tap") {
        elements.tapCount.textContent = `${Math.min(active.tapCount, requiredCount)} / ${requiredCount}`;
      }
      setCueProgressWidth(`${clamp(
        active.tapCount / requiredCount,
        0,
        1,
      ) * 100}%`);
      if (active.tapCount >= requiredCount) {
        resolveSuccess(active.cue.type);
      }
    }

    function resetHold(active) {
      windowObject.clearTimeout(active.holdTimer);
      releaseInteractionPointer(active.holdPointerId);
      active.holdPointerId = null;
      active.holdStart = 0;
      active.guidancePointers.clear();
      elements.holdMeterFill.style.height = "0%";
    }

    function captureInteractionPointer(pointerId, targetElement) {
      const target = targetElement || elements.interactionTarget;
      if (typeof target.setPointerCapture !== "function") return;
      try {
        target.setPointerCapture(pointerId);
      } catch (error) {
        // Synthetic/accessibility pointer events may not own a platform pointer capture.
      }
    }

    function releaseInteractionPointer(pointerId, targetElement) {
      const target = targetElement || elements.interactionTarget;
      if (pointerId === null
        || typeof target.releasePointerCapture !== "function") return;
      try {
        if (typeof target.hasPointerCapture !== "function"
          || target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId);
        }
      } catch (error) {
        // Pointer capture may already have been released by pointerup/pointercancel.
      }
    }

    function resetSwipe(active) {
      if (!active) return;
      releaseInteractionPointer(active.swipePointerId);
      active.swipePointerId = null;
      active.swipeStartX = 0;
      active.swipeStartY = 0;
      active.swipeStartedAt = 0;
    }

    function pointerPoint(event) {
      if (!event || !isFiniteNumber(event.clientX) || !isFiniteNumber(event.clientY)) {
        return null;
      }
      return { x: event.clientX, y: event.clientY };
    }

    function trimContinuousPointerHistory(tracker, now) {
      const cutoff = now - CONTINUOUS_SWIPE_PREACTIVATION_HISTORY_MS;
      let firstFreshIndex = tracker.samples.findIndex(function findFreshSample(sample) {
        return sample.at >= cutoff;
      });
      if (firstFreshIndex < 0) firstFreshIndex = tracker.samples.length;
      // Preserve one point immediately before the window so a stroke that
      // crosses the cutoff still has a usable direction vector.
      if (firstFreshIndex > 1) tracker.samples.splice(0, firstFreshIndex - 1);
      if (tracker.samples.length > CONTINUOUS_SWIPE_POINTER_HISTORY_LIMIT) {
        tracker.samples.splice(
          0,
          tracker.samples.length - CONTINUOUS_SWIPE_POINTER_HISTORY_LIMIT,
        );
      }
    }

    function trackContinuousPointerDown(event) {
      const tracker = state.continuousPointerTracker;
      const point = pointerPoint(event);
      if (!point || event.isPrimary === false || event.pointerId === null
        || event.pointerId === undefined) return false;
      if (tracker.down && tracker.pointerId !== event.pointerId) return false;
      const now = performance.now();
      tracker.pointerId = event.pointerId;
      tracker.down = true;
      tracker.lastX = point.x;
      tracker.lastY = point.y;
      tracker.samples = [{ x: point.x, y: point.y, at: now }];
      return true;
    }

    function trackContinuousPointerMove(event) {
      const tracker = state.continuousPointerTracker;
      const point = pointerPoint(event);
      if (!point || !tracker.down || tracker.pointerId !== event.pointerId) return false;
      const now = performance.now();
      const rawDistance = Math.hypot(point.x - tracker.lastX, point.y - tracker.lastY);
      tracker.lastX = point.x;
      tracker.lastY = point.y;
      const previousSample = tracker.samples[tracker.samples.length - 1];
      if (rawDistance > 0 && (!previousSample || Math.hypot(
        point.x - previousSample.x,
        point.y - previousSample.y,
      ) >= CONTINUOUS_SWIPE_LIVENESS_DP)) {
        tracker.samples.push({ x: point.x, y: point.y, at: now });
      }
      trimContinuousPointerHistory(tracker, now);
      return true;
    }

    function trackContinuousPointerEnd(event) {
      const tracker = state.continuousPointerTracker;
      if (!tracker.down || tracker.pointerId !== event.pointerId) return false;
      tracker.pointerId = null;
      tracker.down = false;
      tracker.samples = [];
      return true;
    }

    function resetContinuousSwipeQualifier(active, anchorX, anchorY, nextPhase) {
      if (!active) return;
      const hasPointer = active.continuousPointerId !== null;
      active.continuousPhase = hasPointer && nextPhase === "resume_leg"
        ? "resume_leg"
        : (hasPointer ? "first_leg" : "idle");
      active.continuousAnchorX = isFiniteNumber(anchorX) ? anchorX : active.continuousLastX;
      active.continuousAnchorY = isFiniteNumber(anchorY) ? anchorY : active.continuousLastY;
      active.continuousDirectionX = 0;
      active.continuousDirectionY = 0;
      active.continuousTurnX = active.continuousAnchorX;
      active.continuousTurnY = active.continuousAnchorY;
      setCueProgressWidth("0%");
    }

    function stopSustainedPlaybackDriving(active, source) {
      if (!active || !isSustainedPlaybackCue(active.cue)) return false;
      windowObject.clearTimeout(active.continuousIdleTimer);
      active.continuousIdleTimer = 0;
      active.continuousPlayRequestToken += 1;
      const wasDriving = active.continuousDriving === true;
      active.continuousDriving = false;
      elements.caption.dataset.continuousDriving = "false";
      elements.interactionTarget.dataset.continuousDriving = "false";
      if (isContinuousMicrophoneCue(active.cue)) {
        elements.soundMeter.dataset.driving = "false";
      }
      if (wasDriving && !elements.video.paused) elements.video.pause();
      if (wasDriving) {
        emitRuntimeEvent("playbackStateChanged", {
          playbackState: "paused",
          reason: active.cue.type,
          cueId: active.cue.id,
          source: source || "stopped",
        });
      }
      updateGuidance();
      return wasDriving;
    }

    function stopContinuousSwipeDriving(active, source) {
      return stopSustainedPlaybackDriving(active, source);
    }

    function resetContinuousSwipePointer(active) {
      if (!active) return;
      windowObject.clearTimeout(active.continuousIdleTimer);
      active.continuousIdleTimer = 0;
      releaseInteractionPointer(
        active.continuousPointerId,
        active.continuousCaptureTarget,
      );
      active.continuousPointerId = null;
      active.continuousCaptureTarget = null;
      active.continuousLastX = 0;
      active.continuousLastY = 0;
      resetContinuousSwipeQualifier(active, 0, 0);
    }

    function armSustainedPlaybackIdle(active) {
      windowObject.clearTimeout(active.continuousIdleTimer);
      active.continuousIdleTimer = 0;
      if (isContinuousHoldCue(active.cue) || active.authoringSimulationDriving) return;
      active.continuousIdleTimer = windowObject.setTimeout(function pauseOnSustainedIdle() {
        if (!activeMatches(active.activationId)
          || active.continuousDriving !== true) return;
        if (isContinuousSwipeCue(active.cue) && active.continuousPointerId === null) return;
        stopSustainedPlaybackDriving(active, "idle_timeout");
        if (isContinuousMicrophoneCue(active.cue)) {
          active.voiceSignalActive = false;
          active.voiceAboveSince = 0;
          active.continuousMicrophoneSamples = [];
          elements.soundMeter.dataset.inBand = "false";
        }
        if (isContinuousSwipeCue(active.cue)) {
          resetContinuousSwipeQualifier(
            active,
            active.continuousLastX,
            active.continuousLastY,
            "resume_leg",
          );
        } else {
          setCueProgressWidth("0%");
        }
        updateGuidance();
      }, active.continuousIdleTimeoutMs);
    }

    function startSustainedPlaybackDriving(active, source) {
      if (!activeMatches(active.activationId) || !state.hostActive) return false;
      if (active.continuousDriving) {
        armSustainedPlaybackIdle(active);
        return true;
      }
      active.continuousDriving = true;
      if (isContinuousSwipeCue(active.cue)) active.continuousPhase = "qualified";
      elements.caption.dataset.continuousDriving = "true";
      elements.interactionTarget.dataset.continuousDriving = "true";
      if (isContinuousMicrophoneCue(active.cue)) {
        elements.soundMeter.dataset.driving = "true";
      }
      setCueProgressWidth("100%");
      state.authoringTransportPaused = false;
      const requestToken = ++active.continuousPlayRequestToken;
      const playbackRequested = requestPlaybackIfAllowed(function handleSustainedPlayFailure() {
        if (!activeMatches(active.activationId)
          || active.continuousPlayRequestToken !== requestToken) return;
        stopSustainedPlaybackDriving(active, "playback_rejected");
        if (isContinuousSwipeCue(active.cue)) {
          resetContinuousSwipeQualifier(
            active,
            active.continuousLastX,
            active.continuousLastY,
          );
        }
      });
      if (!playbackRequested) {
        active.continuousDriving = false;
        elements.caption.dataset.continuousDriving = "false";
        elements.interactionTarget.dataset.continuousDriving = "false";
        if (isContinuousMicrophoneCue(active.cue)) {
          elements.soundMeter.dataset.driving = "false";
        }
        if (isContinuousSwipeCue(active.cue)) {
          resetContinuousSwipeQualifier(
            active,
            active.continuousLastX,
            active.continuousLastY,
          );
        }
        updateGuidance();
        return false;
      }
      emitRuntimeEvent("playbackStateChanged", {
        playbackState: "playing",
        reason: active.cue.type,
        cueId: active.cue.id,
        source: source || "input_qualified",
      });
      armSustainedPlaybackIdle(active);
      updateGuidance();
      return true;
    }

    function armContinuousSwipeIdle(active) {
      armSustainedPlaybackIdle(active);
    }

    function startContinuousSwipeDriving(active, source) {
      return startSustainedPlaybackDriving(active, source);
    }

    function pulseContinuousTapFeedback(active) {
      windowObject.clearTimeout(active.continuousTapFeedbackTimer);
      if (!elements.interactionTarget.classList) return;
      elements.interactionTarget.classList.remove("continuous-tap-pulse");
      // Restart the short feedback animation without retaining derived React/native state.
      void elements.interactionTarget.offsetWidth;
      elements.interactionTarget.classList.add("continuous-tap-pulse");
      active.continuousTapFeedbackTimer = windowObject.setTimeout(function clearTapPulse() {
        elements.interactionTarget.classList.remove("continuous-tap-pulse");
        active.continuousTapFeedbackTimer = 0;
      }, 160);
    }

    function renewContinuousTap(active, source) {
      if (!active || active.resolved || !isContinuousTapCue(active.cue)) return false;
      pulseContinuousTapFeedback(active);
      return startSustainedPlaybackDriving(active, source || "tap");
    }

    function updateContinuousSwipe(active, event, successSource) {
      const currentX = event.clientX;
      const currentY = event.clientY;
      const stepDistance = Math.hypot(
        currentX - active.continuousLastX,
        currentY - active.continuousLastY,
      );
      if (active.continuousDriving) {
        // Qualification still ignores normal pointer jitter, but once playback
        // is running even a small real move is useful liveness at a slow turn.
        if (stepDistance >= CONTINUOUS_SWIPE_LIVENESS_DP) {
          active.continuousLastX = currentX;
          active.continuousLastY = currentY;
          armContinuousSwipeIdle(active);
        }
        return;
      }
      if (stepDistance < active.continuousSwipeRequirements.pointerJitterDp) return;
      active.continuousLastX = currentX;
      active.continuousLastY = currentY;

      const requirements = active.continuousSwipeRequirements;
      if (active.continuousPhase === "resume_leg") {
        const resumeDistance = Math.hypot(
          currentX - active.continuousAnchorX,
          currentY - active.continuousAnchorY,
        );
        setCueProgressWidth(`${clamp(
          resumeDistance / requirements.effectiveMinTravelDp,
          0,
          1,
        ) * 100}%`);
        if (resumeDistance >= requirements.effectiveMinTravelDp) {
          startContinuousSwipeDriving(active, successSource);
        }
        return;
      }
      if (active.continuousPhase === "first_leg") {
        const firstX = currentX - active.continuousAnchorX;
        const firstY = currentY - active.continuousAnchorY;
        const firstDistance = Math.hypot(firstX, firstY);
        setCueProgressWidth(`${clamp(
          firstDistance / requirements.effectiveMinTravelDp,
          0,
          1,
        ) * 50}%`);
        if (firstDistance >= requirements.effectiveMinTravelDp) {
          active.continuousDirectionX = firstX;
          active.continuousDirectionY = firstY;
          active.continuousTurnX = currentX;
          active.continuousTurnY = currentY;
          active.continuousPhase = "return_leg";
        }
        return;
      }
      if (active.continuousPhase !== "return_leg") return;

      const fromTurnX = currentX - active.continuousTurnX;
      const fromTurnY = currentY - active.continuousTurnY;
      const forwardProjection = (fromTurnX * active.continuousDirectionX)
        + (fromTurnY * active.continuousDirectionY);
      if (forwardProjection > 0) {
        active.continuousDirectionX = currentX - active.continuousAnchorX;
        active.continuousDirectionY = currentY - active.continuousAnchorY;
        active.continuousTurnX = currentX;
        active.continuousTurnY = currentY;
        return;
      }
      const evaluation = evaluateContinuousSwipeReturn(
        active.continuousDirectionX,
        active.continuousDirectionY,
        fromTurnX,
        fromTurnY,
        requirements,
      );
      setCueProgressWidth(`${50 + (clamp(
        evaluation.returnDistanceDp / requirements.effectiveMinTravelDp,
        0,
        1,
      ) * 50)}%`);
      if (evaluation.matches) startContinuousSwipeDriving(active, successSource);
    }

    function beginContinuousSwipePointer(active, event, captureTarget) {
      const point = pointerPoint(event);
      if (!active || active.resolved || !point || event.isPrimary === false
        || event.pointerId === null || event.pointerId === undefined
        || active.continuousPointerId !== null) return false;
      if (typeof event.preventDefault === "function") event.preventDefault();
      stopContinuousSwipeDriving(active, "pointer_restart");
      active.continuousPointerId = event.pointerId;
      active.continuousCaptureTarget = captureTarget
        || event.currentTarget
        || elements.interactionTarget;
      active.continuousLastX = point.x;
      active.continuousLastY = point.y;
      resetContinuousSwipeQualifier(active, point.x, point.y);
      captureInteractionPointer(event.pointerId, active.continuousCaptureTarget);
      return true;
    }

    function adoptTrackedContinuousPointer(active) {
      const tracker = state.continuousPointerTracker;
      if (!active || !tracker.down || tracker.pointerId === null) return false;
      const now = performance.now();
      trimContinuousPointerHistory(tracker, now);
      let samples = tracker.samples.filter(function recentSample(sample) {
        return sample.at >= now - CONTINUOUS_SWIPE_PREACTIVATION_HISTORY_MS;
      });
      const latestSample = samples[samples.length - 1];
      const hasRecentMotion = Boolean(latestSample)
        && now - latestSample.at <= active.continuousSwipeRequirements.idleTimeoutMs;
      if (hasRecentMotion) {
        let uninterruptedStart = 0;
        for (let index = samples.length - 1; index > 0; index -= 1) {
          if (samples[index].at - samples[index - 1].at
            > active.continuousSwipeRequirements.idleTimeoutMs) {
            uninterruptedStart = index;
            break;
          }
        }
        samples = samples.slice(uninterruptedStart);
      } else {
        samples = [];
      }
      const first = samples[0] || { x: tracker.lastX, y: tracker.lastY };
      const adopted = beginContinuousSwipePointer(active, {
        pointerId: tracker.pointerId,
        isPrimary: true,
        clientX: first.x,
        clientY: first.y,
        preventDefault() {},
      }, elements.interactionTarget);
      if (!adopted) return false;
      if (!hasRecentMotion) {
        active.continuousLastX = tracker.lastX;
        active.continuousLastY = tracker.lastY;
        resetContinuousSwipeQualifier(active, tracker.lastX, tracker.lastY);
        return true;
      }
      samples.slice(1).forEach(function replayTrackedPointer(sample) {
        updateContinuousSwipe(active, {
          clientX: sample.x,
          clientY: sample.y,
        }, "pre_activation_motion");
      });
      const remainingDistance = Math.hypot(
        tracker.lastX - active.continuousLastX,
        tracker.lastY - active.continuousLastY,
      );
      if (remainingDistance > 0) {
        updateContinuousSwipe(active, {
          clientX: tracker.lastX,
          clientY: tracker.lastY,
        }, "pre_activation_motion");
      }
      return true;
    }

    function endContinuousSwipePointer(active, event) {
      if (!active || !isContinuousSwipeCue(active.cue)
        || active.continuousPointerId !== event.pointerId) return false;
      if (typeof event.preventDefault === "function") event.preventDefault();
      stopContinuousSwipeDriving(
        active,
        event.type === "pointercancel" ? "pointer_cancel" : "pointer_up",
      );
      resetContinuousSwipePointer(active);
      return true;
    }

    function beginContinuousHoldPointer(active, event) {
      if (!active || active.resolved || !isContinuousHoldCue(active.cue)
        || event.isPrimary === false || active.continuousPointerId !== null) return false;
      if (typeof event.preventDefault === "function") event.preventDefault();
      active.continuousPointerId = event.pointerId;
      active.continuousCaptureTarget = event.currentTarget || elements.interactionTarget;
      captureInteractionPointer(event.pointerId, active.continuousCaptureTarget);
      return startSustainedPlaybackDriving(active, "hold_down");
    }

    function endContinuousHoldPointer(active, event) {
      if (!active || !isContinuousHoldCue(active.cue)
        || active.continuousPointerId !== event.pointerId) return false;
      if (typeof event.preventDefault === "function") event.preventDefault();
      stopSustainedPlaybackDriving(
        active,
        event.type === "pointercancel" ? "hold_cancel" : "hold_up",
      );
      resetContinuousSwipePointer(active);
      return true;
    }

    function handleWindowPointerDown(event) {
      trackContinuousPointerDown(event);
      const active = state.active;
      if (active && state.hostActive && !active.resolved && isFreeformPointerCue(active.cue)) {
        // Full-screen gestures must not consume the existing player controls.
        const control = event.target && typeof event.target.closest === "function"
          ? event.target.closest("button, a, input, select, textarea, [role='button']")
          : null;
        if (control && control !== elements.interactionTarget) return;
        handlePointerDown(event);
        return;
      }
      if (!active || active.resolved || !isContinuousSwipeCue(active.cue)
        || performance.now() < state.inputDebounceUntil) return;
      beginContinuousSwipePointer(active, event, elements.interactionTarget);
    }

    function handleWindowPointerMove(event) {
      trackContinuousPointerMove(event);
      const active = state.active;
      if (active && state.hostActive && !active.resolved && isFreeformPointerCue(active.cue)) {
        handlePointerMove(event);
        return;
      }
      if (!active || active.resolved || !isContinuousSwipeCue(active.cue)
        || active.continuousPointerId !== event.pointerId) return;
      if (typeof event.preventDefault === "function") event.preventDefault();
      updateContinuousSwipe(active, event);
    }

    function handleWindowPointerEnd(event) {
      const active = state.active;
      if (active && state.hostActive && !active.resolved && isFreeformPointerCue(active.cue)) {
        handlePointerEnd(event);
      }
      endContinuousSwipePointer(state.active, event);
      trackContinuousPointerEnd(event);
    }

    function resetPointerGesture(active) {
      if (!active) return;
      if (active.gesturePointers instanceof Map) {
        active.gesturePointers.forEach(function releaseTrackedPointer(_, pointerId) {
          releaseInteractionPointer(pointerId);
        });
        active.gesturePointers.clear();
      }
      releaseInteractionPointer(active.gesturePointerId, active.gestureCaptureTarget);
      active.gesturePointerId = null;
      active.gestureCaptureTarget = null;
      active.gestureStartX = 0;
      active.gestureStartY = 0;
      active.gestureLastX = 0;
      active.gestureLastY = 0;
      active.gestureStartedAt = 0;
      active.gestureTravelDp = 0;
      active.gestureReversalsX = 0;
      active.gestureReversalsY = 0;
      active.gestureLastSignX = 0;
      active.gestureLastSignY = 0;
      active.gesturePath = [];
      active.eraseFogLastPoint = null;
      active.pinchStartDistanceDp = 0;
      active.pinchStartedAt = 0;
      active.pinchQualified = false;
      active.pinchCandidateStartedAt = null;
      active.circleQualified = false;
    }

    function startTrackedGesture(active, event) {
      active.gesturePointerId = event.pointerId;
      active.gestureStartX = event.clientX;
      active.gestureStartY = event.clientY;
      active.gestureLastX = event.clientX;
      active.gestureLastY = event.clientY;
      active.gestureStartedAt = performance.now();
      active.gestureTravelDp = 0;
      active.gestureReversalsX = 0;
      active.gestureReversalsY = 0;
      active.gestureLastSignX = 0;
      active.gestureLastSignY = 0;
      active.gesturePath = [{ x: event.clientX, y: event.clientY }];
      active.gestureCaptureTarget = isFreeformPointerCue(active.cue)
        ? elements.interactionTarget
        : (event.currentTarget || elements.interactionTarget);
      captureInteractionPointer(event.pointerId, active.gestureCaptureTarget);
      if (isEraseCue(active.cue)) {
        if (!active.eraseStartedAt) active.eraseStartedAt = performance.now();
        drawEraseFogToPointer(active, event);
      }
    }

    function updateTrackedGesture(active, event) {
      const stepX = event.clientX - active.gestureLastX;
      const stepY = event.clientY - active.gestureLastY;
      const stepDistance = Math.hypot(stepX, stepY);
      if (stepDistance <= 0) return;
      active.gestureTravelDp += stepDistance;
      if (Math.abs(stepX) >= POINTER_JITTER_DP) {
        const signX = Math.sign(stepX);
        if (active.gestureLastSignX && signX !== active.gestureLastSignX) {
          active.gestureReversalsX += 1;
        }
        active.gestureLastSignX = signX;
      }
      if (Math.abs(stepY) >= POINTER_JITTER_DP) {
        const signY = Math.sign(stepY);
        if (active.gestureLastSignY && signY !== active.gestureLastSignY) {
          active.gestureReversalsY += 1;
        }
        active.gestureLastSignY = signY;
      }
      active.gestureLastX = event.clientX;
      active.gestureLastY = event.clientY;
      if (isDrawCue(active.cue) || stepDistance >= 1) {
        active.gesturePath.push({ x: event.clientX, y: event.clientY });
        if (isDrawCue(active.cue) && active.gesturePath.length > 512) {
          active.gesturePath = active.gesturePath.filter(function retainSample(_, index, path) {
            return index % 2 === 0 || index === path.length - 1;
          });
        }
      }
    }

    function pointerDistance(points) {
      if (!(points instanceof Map) || points.size < 2) return 0;
      const pair = Array.from(points.values()).slice(0, 2);
      return Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
    }

    function preventNativeBrowserInteraction(event) {
      if (event && event.cancelable) event.preventDefault();
    }

    function clearNativeBrowserSelection() {
      const selection = windowObject.getSelection && windowObject.getSelection();
      if (selection && selection.rangeCount) selection.removeAllRanges();
    }

    function handlePointerDown(event) {
      const active = state.active;
      if (!active || active.resolved) return;
      if (performance.now() < state.inputDebounceUntil) return;
      if (isFreeformPointerCue(active.cue)) {
        if (!state.hostActive) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (isDrawCue(active.cue) && event.isPrimary === false) return;
      }
      if (!state.hostActive || event.pointerType === "mouse" && event.button !== 0) return;
      if (isContinuousTapCue(active.cue) && event.isPrimary === false) return;
      trackGuidancePointer(active, event, "down");
      if (isContinuousTapCue(active.cue)) {
        if (event.isPrimary === false) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        renewContinuousTap(active, "tap");
        return;
      }
      if (isContinuousHoldCue(active.cue)) {
        beginContinuousHoldPointer(active, event);
        return;
      }
      if (isContinuousSwipeCue(active.cue)) {
        beginContinuousSwipePointer(active, event);
        return;
      }
      if (isCameraCue(active.cue) && active.cameraRetryReady) {
        event.preventDefault();
        active.cameraRetryReady = false;
        active.cameraRetryCount = 0;
        armCamera(active);
        return;
      }
      if (isSwipeCue(active.cue)) {
        if (active.swipePointerId !== null) return;
        event.preventDefault();
        resetSwipe(active);
        active.swipePointerId = event.pointerId;
        active.swipeStartX = event.clientX;
        active.swipeStartY = event.clientY;
        active.swipeStartedAt = performance.now();
        captureInteractionPointer(event.pointerId);
        return;
      }
      if (isPinchCue(active.cue)) {
        event.preventDefault();
        // A window capture listener and the target listener see the same event.
        // Never reset the two-finger baseline on the bubbling duplicate.
        if (active.gesturePointers.has(event.pointerId)) return;
        if (active.gesturePointers.size >= 2
          && !active.gesturePointers.has(event.pointerId)) return;
        active.gesturePointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        captureInteractionPointer(event.pointerId);
        if (active.gesturePointers.size === 2) {
          active.pinchStartDistanceDp = pointerDistance(active.gesturePointers);
          active.pinchStartedAt = performance.now();
          active.pinchCandidateStartedAt = null;
        }
        return;
      }
      if (isDragCue(active.cue)
        || isScrubCue(active.cue)
        || isDrawCue(active.cue)
        || isEraseCue(active.cue)) {
        if (active.gesturePointerId !== null) return;
        event.preventDefault();
        resetPointerGesture(active);
        startTrackedGesture(active, event);
        return;
      }
      if (!isHoldCue(active.cue)) return;
      event.preventDefault();
      resetHold(active);
      trackGuidancePointer(active, event, "down");
      active.holdPointerId = event.pointerId;
      active.holdStart = performance.now();
      active.holdOriginX = event.clientX;
      active.holdOriginY = event.clientY;
      captureInteractionPointer(event.pointerId);
      active.holdTimer = windowObject.setTimeout(function completeHold() {
        if (activeMatches(active.activationId) && active.holdPointerId === event.pointerId) {
          resolveSuccess("hold");
        }
      }, active.longPressDurationMs);
    }

    function handlePointerMove(event) {
      trackGuidancePointer(state.active, event, "move");
      const active = state.active;
      if (active
        && isContinuousSwipeCue(active.cue)
        && active.continuousPointerId === event.pointerId) {
        event.preventDefault();
        updateContinuousSwipe(active, event);
        return;
      }
      if (active && isSwipeCue(active.cue) && active.swipePointerId === event.pointerId) {
        event.preventDefault();
        return;
      }
      if (active && isPinchCue(active.cue) && active.gesturePointers.has(event.pointerId)) {
        event.preventDefault();
        active.gesturePointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (active.gesturePointers.size === 2 && active.pinchStartDistanceDp > 0) {
          const evaluation = evaluatePinchGesture(
            active.pinchStartDistanceDp,
            pointerDistance(active.gesturePointers),
            performance.now() - active.pinchStartedAt,
            active.pinchRequirements,
          );
          if (evaluation.matches) {
            if (active.pinchCandidateStartedAt === null) {
              active.pinchCandidateStartedAt = performance.now();
            }
            // Two fingers moving together are reported in separate events.
            // Do not latch the brief contraction between those two updates.
            if (performance.now() - active.pinchCandidateStartedAt >= PINCH_CANDIDATE_MS) {
              active.pinchQualified = true;
            }
          } else {
            active.pinchCandidateStartedAt = null;
          }
          setCueProgressWidth(`${clamp(
            active.pinchQualified ? 1 : evaluation.travelDp / evaluation.requiredTravelDp,
            0,
            1,
          ) * 100}%`);
        }
        return;
      }
      if (active
        && active.gesturePointerId === event.pointerId
        && (isDragCue(active.cue)
          || isScrubCue(active.cue)
          || isDrawCue(active.cue)
          || isEraseCue(active.cue))) {
        event.preventDefault();
        if (isEraseCue(active.cue)) drawEraseFogToPointer(active, event);
        updateTrackedGesture(active, event);
        if (isDrawCue(active.cue)) {
          const evaluation = evaluateCircleGesture(
            active.gesturePath,
            performance.now() - active.gestureStartedAt,
            active.circleRequirements,
          );
          active.circleQualified = active.circleQualified || evaluation.matches;
          const progress = active.circleQualified ? 1
            : (evaluation.shapeMatches && evaluation.directionMatches
              ? evaluation.turningDeg / active.circleRequirements.effectiveMinRotationDeg
              : 0);
          setCueProgressWidth(`${clamp(progress, 0, 1) * 100}%`);
          return;
        }
        const requirements = isDragCue(active.cue)
          ? active.dragRequirements
          : (isScrubCue(active.cue)
            ? active.scrubRequirements
            : (isEraseCue(active.cue) ? active.eraseRequirements : active.circleRequirements));
        const effectiveTravelDp = isEraseCue(active.cue)
          ? active.eraseAccumulatedTravelDp + active.gestureTravelDp
          : active.gestureTravelDp;
        const progressValue = effectiveTravelDp / (
            requirements.effectiveMinTravelDp || requirements.effectiveMinDistanceDp
          );
        setCueProgressWidth(`${clamp(progressValue, 0, 1) * 100}%`);
        return;
      }
      if (!active || !isHoldCue(active.cue) || active.holdPointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - active.holdOriginX, event.clientY - active.holdOriginY);
      if (distance > 48) {
        resetHold(active);
        return;
      }
      const ratio = clamp((performance.now() - active.holdStart) / active.longPressDurationMs, 0, 1);
      elements.holdMeterFill.style.height = `${ratio * 100}%`;
    }

    function handlePointerEnd(event) {
      trackGuidancePointer(state.active, event, "end");
      const active = state.active;
      if (endContinuousHoldPointer(active, event)) return;
      if (endContinuousSwipePointer(active, event)) return;
      if (active && isSwipeCue(active.cue) && active.swipePointerId === event.pointerId) {
        event.preventDefault();
        const activationId = active.activationId;
        const evaluation = event.type === "pointercancel"
          ? null
          : evaluateSwipeGesture(
            active.cue,
            event.clientX - active.swipeStartX,
            event.clientY - active.swipeStartY,
            performance.now() - active.swipeStartedAt,
            active.swipeRequirements,
          );
        resetSwipe(active);
        if (evaluation && evaluation.matches && activeMatches(activationId)) {
          // Resolve after pointerup so this same pointer stream can never fall through
          // to the feed pager when gateResolved re-enables global scrolling.
          resolveSuccess(active.cue.type);
        }
        return;
      }
      if (active && isPinchCue(active.cue) && active.gesturePointers.has(event.pointerId)) {
        event.preventDefault();
        const activationId = active.activationId;
        if (event.type === "pointercancel") {
          resetPointerGesture(active);
          setCueProgressWidth("0%");
          return;
        }
        active.gesturePointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        const evaluation = active.gesturePointers.size !== 2
          ? null
          : evaluatePinchGesture(
            active.pinchStartDistanceDp,
            pointerDistance(active.gesturePointers),
            performance.now() - active.pinchStartedAt,
            active.pinchRequirements,
          );
        const qualified = active.pinchQualified || Boolean(evaluation && evaluation.matches);
        active.pinchQualified = qualified;
        active.gesturePointers.delete(event.pointerId);
        releaseInteractionPointer(event.pointerId);
        // Drain both fingers before unlocking the feed pager; a held second
        // finger must not turn the end of a successful pinch into a page swipe.
        if (active.gesturePointers.size > 0) return;
        resetPointerGesture(active);
        if (!qualified) setCueProgressWidth("0%");
        if (qualified && activeMatches(activationId)) resolveSuccess("pinch");
        return;
      }
      if (active
        && active.gesturePointerId === event.pointerId
        && (isDragCue(active.cue)
          || isScrubCue(active.cue)
          || isDrawCue(active.cue)
          || isEraseCue(active.cue))) {
        event.preventDefault();
        const activationId = active.activationId;
        let evaluation = null;
        if (event.type !== "pointercancel") {
          if (isEraseCue(active.cue)) drawEraseFogToPointer(active, event);
          updateTrackedGesture(active, event);
          const deltaX = event.clientX - active.gestureStartX;
          const deltaY = event.clientY - active.gestureStartY;
          const elapsedMs = performance.now() - active.gestureStartedAt;
          if (isDragCue(active.cue)) {
            evaluation = evaluateDragGesture(
              active.cue,
              deltaX,
              deltaY,
              elapsedMs,
              active.dragRequirements,
            );
          } else if (isScrubCue(active.cue)) {
            const direction = active.cue.guide && active.cue.guide.direction;
            const reversals = direction === "left" || direction === "right"
              ? active.gestureReversalsX
              : active.gestureReversalsY;
            evaluation = evaluateScrubGesture(
              active.cue,
              deltaX,
              deltaY,
              active.gestureTravelDp,
              reversals,
              elapsedMs,
              active.scrubRequirements,
            );
          } else if (isDrawCue(active.cue)) {
            evaluation = evaluateCircleGesture(
              active.gesturePath,
              elapsedMs,
              active.circleRequirements,
            );
          } else {
            const currentReversals = Math.max(
              active.gestureReversalsX,
              active.gestureReversalsY,
            );
            evaluation = evaluateEraseGesture(
              active.eraseAccumulatedTravelDp + active.gestureTravelDp,
              active.eraseAccumulatedReversals + currentReversals,
              active.eraseStartedAt
                ? performance.now() - active.eraseStartedAt
                : elapsedMs,
              active.eraseRequirements,
            );
          }
        }
        const successSource = active.cue.type;
        if (isEraseCue(active.cue) && (!evaluation || !evaluation.matches)) {
          active.eraseAccumulatedTravelDp += active.gestureTravelDp;
          active.eraseAccumulatedReversals += Math.max(
            active.gestureReversalsX,
            active.gestureReversalsY,
          );
        }
        const qualified = event.type !== "pointercancel"
          && (Boolean(evaluation && evaluation.matches)
            || (isDrawCue(active.cue) && active.circleQualified));
        resetPointerGesture(active);
        if (!qualified && isDrawCue(active.cue)) setCueProgressWidth("0%");
        if (qualified && activeMatches(activationId)) {
          resolveSuccess(successSource);
        }
        return;
      }
      if (!active || !isHoldCue(active.cue) || active.holdPointerId !== event.pointerId) return;
      resetHold(active);
    }

    function handleTargetKeyDown(event) {
      const active = state.active;
      if (!active || active.resolved || !isContinuousHoldCue(active.cue)
        || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      if (event.repeat || active.continuousHoldKeyboardActive) return;
      active.continuousHoldKeyboardActive = true;
      startSustainedPlaybackDriving(active, "keyboard_hold_down");
    }

    function handleTargetKeyUp(event) {
      const active = state.active;
      if (!active || !isContinuousHoldCue(active.cue)
        || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      if (!active.continuousHoldKeyboardActive) return;
      active.continuousHoldKeyboardActive = false;
      stopSustainedPlaybackDriving(active, "keyboard_hold_up");
    }

    function showBrowserStartPrompt() {
      // Android owns playback policy and retries through its host lifecycle. A transient
      // WebView play() rejection must not replace the experience with a browser-only gate.
      // The H5 host uses __pixoNativeTransport, so it still gets this user-gesture fallback.
      if (windowObject.PixoNativeBridge || windowObject.MotionCueNativeBridge) return;
      if (!state.experience || elements.video.ended) return;
      elements.startTitle.textContent = state.experience.title;
      elements.startDescription.textContent = "Tap to start, then follow each cue.";
      elements.startButton.textContent = "Start experience";
      elements.startButton.hidden = false;
      elements.startPanel.hidden = false;
    }

    function handleStart() {
      if (!state.experience) return;
      state.authoringTransportPaused = false;
      const firstStart = !state.started;
      if (firstStart) {
        state.started = true;
        state.phase = state.hostActive ? "playing" : "inactive";
      }
      elements.startPanel.hidden = true;
      elements.app.dataset.runtimeState = state.phase;
      requestPlaybackIfAllowed(function showPlayFailure() {
        showBrowserStartPrompt();
        showFeedback("Tap play to start the video.", "neutral", false, 1200);
      });
      if (firstStart) emitRuntimeEvent("started", {});
    }

    function handlePlayControl() {
      if (!state.hostActive || !nativeHostAllowsPlayback()) {
        announce("This experience is currently inactive.", true);
        return;
      }
      if (state.replayScheduled) {
        announce("Preparing the previous point.", false);
        return;
      }
      if (elements.video.ended) {
        resetExperienceForReplay();
        return;
      }
      if (playbackBlockedByInteraction()) {
        announce(
          state.active && isSustainedPlaybackCue(state.active.cue)
            ? (isContinuousTapCue(state.active.cue)
              ? "Keep tapping the video to play."
              : "Swipe back and forth continuously to play.")
            : "Complete the current interaction first.",
          true,
        );
        return;
      }
      if (!state.started) {
        handleStart();
      } else if (elements.video.paused) {
        state.authoringTransportPaused = false;
        Promise.resolve(elements.video.play())
          .then(function reportUserResume() {
            emitRuntimeEvent("playbackStateChanged", {
              playbackState: "playing",
              reason: "user",
            });
          })
          .catch(function ignorePlayFailure() {});
      } else {
        state.authoringTransportPaused = true;
        elements.video.pause();
        emitRuntimeEvent("playbackStateChanged", {
          playbackState: "paused",
          reason: "user",
        });
      }
    }

    function handleEnded() {
      if (state.replayScheduled || ["ended", "failed"].includes(state.phase)) return;
      if (state.active && isSustainedPlaybackCue(state.active.cue)) {
        completeSustainedPlaybackCue("media_end");
        return;
      }
      const pendingAction = state.pendingResultAction;
      if (pendingAction
        && pendingAction.segmentIndex === state.segmentIndex
        && pendingAction.mediaGeneration === state.mediaGeneration) {
        executeResultAction(
          pendingAction.action,
          {
            cueId: pendingAction.cueId,
            outcome: pendingAction.outcome,
            source: pendingAction.source,
            mediaEndedWhileWaiting: true,
          },
          { forceImmediate: true, deferred: true },
        );
        return;
      }
      state.pendingResultAction = null;
      const durationMs = Number(elements.video.duration || 0) * 1000;
      if (state.active
        && state.active.responseWindowMs === 0
        && state.active.pausedVideo === false
        && state.active.activatedAtMediaEnd !== true) {
        resolveMiss("media_ended");
        return;
      }
      if (shouldWaitForActiveCueAtMediaEnd(state.active)) {
        state.mediaEndDeferred = true;
        state.phase = "waiting";
        elements.app.dataset.runtimeState = "waiting";
        updatePlayState();
        announce("Complete the current interaction to continue.", false);
        return;
      }
      state.mediaEndDeferred = false;
      cleanupActiveResources(state.active);
      state.active = null;
      const mediaEndCueIndex = currentCues().findIndex(function findMediaEndCue(cue) {
        return state.cueStates.get(cueKey(cue)) === "pending"
          && cueStartsAtMediaEnd(cue, durationMs);
      });
      if (mediaEndCueIndex >= 0) {
        const mediaEndCue = currentCues()[mediaEndCueIndex];
        if (isSustainedPlaybackCue(mediaEndCue)) {
          showFatal(new Error(
            `Interaction '${mediaEndCue.id}' ${mediaEndCue.type} must start before media end.`,
          ));
          return;
        }
        state.mediaEndDeferred = true;
        activateCue(mediaEndCueIndex);
        if (state.active) {
          state.phase = "waiting";
          elements.app.dataset.runtimeState = "waiting";
          updatePlayState();
          announce("Complete the current interaction to continue.", false);
          return;
        }
      }
      const segment = currentSegment();
      if (segment && segment.onEnd) {
        const result = executeResultAction(
          segment.onEnd,
          { source: "video_end", mediaEndedWhileWaiting: true },
          { forceImmediate: true, fromVideoEnd: true },
        );
        if (result !== "natural") return;
      }
      recordCurrentSegmentCompleted();
      const nextSegmentIndex = state.segmentIndex + 1;
      if (state.experience && nextSegmentIndex < state.experience.segments.length) {
        openSegment(nextSegmentIndex, { reason: "linear" });
        return;
      }
      finishExperience({});
    }

    function pauseVoiceForHost(active) {
      if (!active || !isMicrophoneCue(active.cue)) return;
      if (!active.voicePermissionPending) active.voiceRequestToken += 1;
      active.voiceStartPending = false;
      if (typeof active.offMicrophone === "function") active.offMicrophone();
      active.offMicrophone = null;
      resetVoiceDetection(active);
      active.microphoneStarted = false;
      nativeStopMicrophone();
      elements.interactionTarget.style.setProperty("--voice-level", ".24");
    }

    function handleHostState(event) {
      const detail = event && event.detail ? event.detail : {};
      const declaredMode = typeof detail.state === "string" ? detail.state : "";
      const nextMode = ["active", "prewarm", "paused"].includes(declaredMode)
        ? declaredMode
        : (detail.active === false ? (detail.prewarm === true ? "prewarm" : "paused") : "active");
      const nextActive = nextMode === "active";
      if (nextMode === state.hostMode && nextActive === state.hostActive) return;
      const wasActive = state.hostActive;
      state.hostMode = nextMode;
      if (!nextActive) {
        if (wasActive) {
          state.resumePlaybackOnHostActive = state.started
            && ((!elements.video.paused && !elements.video.ended)
              || isZeroOffsetCueAwaitingActivation());
        }
        state.hostActive = false;
        if (guidance) guidance.setVisible(false);
        if (state.active) {
          state.active.guidancePointers.clear();
          state.active.guidancePath = [];
          state.active.guidanceProgress = 0;
        }
        stopFrameLoop();
        elements.video.pause();
        if (state.active) {
          freezeWallDeadline(state.active);
          if (isSustainedPlaybackCue(state.active.cue)) {
            stopSustainedPlaybackDriving(state.active, "host_inactive");
          }
          if (isContinuousSwipeCue(state.active.cue)) {
            resetContinuousSwipePointer(state.active);
          }
          if (isHoldCue(state.active.cue)) resetHold(state.active);
          if (isPointerGestureCue(state.active.cue)) {
            resetSwipe(state.active);
            resetPointerGesture(state.active);
          }
          pauseVoiceForHost(state.active);
          if (isCameraCue(state.active.cue)) {
            // Android tears down CameraX whenever the card/app becomes inactive. Force an
            // explicit semantic-vision reacquire after host activation; never retain a camera.
            // Keep an in-flight capability request latched, though. The first Android permission
            // dialog temporarily deactivates the host, and clearing this flag would issue a
            // duplicate request on resume and turn the still-pending permission into a false
            // camera-unavailable retry loop.
            state.active.cameraStarted = false;
          }
        }
        state.phase = "inactive";
        elements.app.dataset.runtimeState = "inactive";
        emitRuntimeEvent("hostStateChanged", { active: false, state: nextMode });
        return;
      }

      state.hostActive = true;
      if (guidance) guidance.setVisible(true);
      startFrameLoop();
      state.phase = state.started ? "playing" : "ready";
      elements.app.dataset.runtimeState = state.phase;
      const shouldResumePlayback = state.resumePlaybackOnHostActive;
      let shouldRequestPlayback = shouldResumePlayback;
      let allowEndedPlayback = false;
      if (isCurrentMediaReady()) activateReadyCueAtCurrentPosition();
      if (isCurrentMediaReady()) preloadUpcomingSegmentMedia();
      if (state.active && state.active.pendingCapabilityFailure) {
        const deferredFailure = state.active.pendingCapabilityFailure;
        state.active.pendingCapabilityFailure = null;
        resolveSkipped(deferredFailure);
      }
      if (state.active && state.active.capabilityBlocked) {
        shouldRequestPlayback = false;
      } else if (state.active) {
        if (!KNOWN_TYPES.has(state.active.cue.type)) {
          resolveSkipped("unknown_type");
        } else if (isMicrophoneCue(state.active.cue)) {
          suppressMicrophoneMediaAudio(state.active);
          armVoice(state.active);
        } else if (isMotionCue(state.active.cue)) {
          if (state.active.responseTimerInitialized) resumeWallDeadline(state.active);
          if (!state.active.motionStarted) armMotion(state.active);
        } else if (isCameraCue(state.active.cue)) {
          if (state.active.responseTimerInitialized) resumeWallDeadline(state.active);
          if (!state.active.cameraStarted) armCamera(state.active);
        } else {
          resumeWallDeadline(state.active);
        }
      } else if (state.pendingReplayTargetMs !== null) {
        const replayTarget = state.pendingReplayTargetMs;
        const replayMediaGeneration = state.pendingReplayMediaGeneration;
        state.pendingReplayTargetMs = null;
        state.pendingReplayMediaGeneration = -1;
        if (replayMediaGeneration === state.mediaGeneration) {
          state.replayScheduled = false;
          elements.video.currentTime = replayTarget / 1000;
          shouldRequestPlayback = true;
          allowEndedPlayback = true;
        } else {
          state.replayScheduled = false;
        }
      }
      if (shouldRequestPlayback) requestPlaybackIfAllowed(null, allowEndedPlayback);
      else state.resumePlaybackOnHostActive = false;
      updateGuidance();
      emitRuntimeEvent("hostStateChanged", { active: true, state: nextMode });
    }

    function load(experience) {
      requireElements();
      if (!Array.isArray(experience.segments) || !experience.segments.length) {
        throw new Error("Experience must contain at least one body.video entry.");
      }
      cleanupActiveResources(state.active);
      windowObject.clearTimeout(state.replayTimer);
      state.active = null;
      state.replayTimer = 0;
      state.replayScheduled = false;
      state.pendingReplayTargetMs = null;
      state.pendingReplayMediaGeneration = -1;
      state.pendingSegmentStartMs = 0;
      state.mediaEndDeferred = false;
      state.pendingResultAction = null;
      state.retryOrigin = null;
      state.resumePlaybackOnHostActive = false;
      state.authoringTransportPaused = false;
      state.experience = experience;
      state.segmentIndex = 0;
      state.completedCueCount = 0;
      state.phase = state.hostActive ? "playing" : "inactive";
      state.started = true;
      state.cueStates.clear();
      const firstSegment = currentSegment();
      currentCues().forEach(function initializeCue(cue) {
        state.cueStates.set(cueKey(cue), "pending");
      });
      prepareCurrentSegmentMedia(false);
      elements.title.textContent = firstSegment.title;
      elements.startTitle.textContent = experience.title;
      elements.startDescription.textContent = experience.description;
      elements.startButton.hidden = false;
      elements.startPanel.hidden = true;
      elements.completionPanel.hidden = true;
      setCueUiVisible(false);
      windowObject.clearTimeout(state.feedbackTimer);
      elements.feedback.hidden = true;
      elements.app.dataset.runtimeState = state.phase;
      renderMarkers();
      emitRuntimeEvent("ready", {
        cueCount: experience.totalCueCount,
        segmentCount: experience.segments.length,
        title: experience.title,
      });
      requestPlaybackIfAllowed(showBrowserStartPrompt);
      emitRuntimeEvent("started", { automatic: true });
      return experience;
    }

    function seek(positionMs, options) {
      if (!state.experience || !currentSegment()) {
        throw new Error("Experience must be loaded before seeking.");
      }
      if (!isCurrentMediaReady()) {
        throw new Error("Experience media must be ready before seeking.");
      }

      const settings = isRecord(options) ? options : {};
      const durationMs = Number(elements.video.duration || 0) * 1000;
      const targetMs = clamp(
        isFiniteNumber(positionMs) ? positionMs : 0,
        0,
        durationMs > 0 ? durationMs : Number.MAX_SAFE_INTEGER,
      );
      const selectedCueId = typeof settings.cueId === "string" ? settings.cueId : null;
      const cues = currentCues();
      let activationIndex = selectedCueId
        ? cues.findIndex(function findSelectedCue(cue) { return cue.id === selectedCueId; })
        : -1;

      if (activationIndex < 0 && settings.activateSustainedRange !== false) {
        activationIndex = cues.findIndex(function findSustainedRange(cue, index) {
          if (!isSustainedPlaybackCue(cue)) return false;
          const startMs = getOffsetTimeMs(cue);
          if (!isFiniteNumber(startMs) || targetMs < startMs) return false;
          const boundaries = [];
          if (isFiniteNumber(cue.active_until_ms)) boundaries.push(cue.active_until_ms);
          const nextStartMs = getOffsetTimeMs(cues[index + 1]);
          if (isFiniteNumber(nextStartMs)) boundaries.push(nextStartMs);
          const endMs = boundaries.length ? Math.min(...boundaries) : durationMs;
          return !isFiniteNumber(endMs) || targetMs < endMs;
        });
      }

      cleanupActiveResources(state.active);
      windowObject.clearTimeout(state.replayTimer);
      state.active = null;
      state.replayTimer = 0;
      state.replayScheduled = false;
      state.pendingReplayTargetMs = null;
      state.pendingReplayMediaGeneration = -1;
      state.pendingResultAction = null;
      state.retryOrigin = null;
      state.mediaEndDeferred = false;
      state.resumePlaybackOnHostActive = false;
      state.authoringTransportPaused = true;
      state.started = true;
      state.phase = state.hostActive ? "playing" : "inactive";
      elements.video.pause();
      elements.video.currentTime = targetMs / 1000;
      elements.startPanel.hidden = true;
      elements.completionPanel.hidden = true;
      elements.feedback.hidden = true;
      setCueUiVisible(false);

      cues.forEach(function resetCueForSeek(cue, index) {
        const cueStartMs = getOffsetTimeMs(cue);
        const skipped = index !== activationIndex
          && isFiniteNumber(cueStartMs)
          && cueStartMs <= targetMs;
        state.cueStates.set(cueKey(cue), skipped ? "skipped" : "pending");
      });
      renderMarkers();
      if (activationIndex >= 0) activateCue(activationIndex);
      elements.video.pause();
      updateTimeline();
      updatePlayState();
      elements.app.dataset.runtimeState = state.phase;
      emitRuntimeEvent("seeked", {
        positionMs: targetMs,
        cueId: activationIndex >= 0 ? cues[activationIndex].id : null,
        source: "authoring",
      });
      return {
        positionMs: targetMs,
        cueId: activationIndex >= 0 ? cues[activationIndex].id : null,
      };
    }

    function showFatal(error, detail) {
      clearMediaLoadWatchdog();
      state.phase = "failed";
      const message = error && error.message ? error.message : "Unable to load this experience.";
      setCueUiVisible(false);
      if (elements.app) {
        elements.app.dataset.runtimeState = "failed";
        elements.app.setAttribute("aria-busy", "false");
      }
      if (elements.startPanel) elements.startPanel.hidden = false;
      if (elements.startTitle) elements.startTitle.textContent = "Experience unavailable";
      if (elements.startDescription) elements.startDescription.textContent = message;
      if (elements.startButton) elements.startButton.hidden = true;
      if (elements.alertRegion) announce(message, true);
      emitRuntimeEvent("error", { message, ...(detail || {}) });
    }

    function getStateSnapshot() {
      return {
        version: VERSION,
        phase: state.phase,
        started: state.started,
        hostMode: state.hostMode,
        hostActive: state.hostActive,
        itemId: state.experience ? state.experience.itemId : null,
        segmentIndex: state.segmentIndex,
        segmentCount: state.experience ? state.experience.segments.length : 0,
        specVersion: state.experience ? state.experience.specVersion : null,
        hasExplicitRouting: Boolean(state.experience && state.experience.hasExplicitRouting),
        videoId: currentSegment() ? currentSegment().id : null,
        mediaGeneration: state.mediaGeneration,
        mediaPhase: state.mediaPhase,
        mediaReady: isCurrentMediaReady(),
        mediaSwapPending: Boolean(state.pendingMediaSwap),
        activeMediaElementId: elements.video ? elements.video.id : null,
        preloadedMediaCount: videoPlayers.filter(function countReadyStandby(video) {
          const record = videoRecords.get(video);
          return video !== elements.video && Boolean(record && record.ready && !record.failed);
        }).length,
        activeCueId: state.active ? state.active.cue.id : null,
        activeInteractionType: state.active ? state.active.cue.type : null,
        activeActivationId: state.active ? state.active.activationId : null,
        activeCuePausesVideo: Boolean(state.active && state.active.pausedVideo),
        activeCapabilityBlocked: Boolean(state.active && state.active.capabilityBlocked),
        authoringSimulationDriving: Boolean(
          state.active && state.active.authoringSimulationDriving,
        ),
        authoringTransportPaused: state.authoringTransportPaused,
        continuousSwipeDriving: Boolean(
          state.active
          && isContinuousSwipeCue(state.active.cue)
          && state.active.continuousDriving,
        ),
        continuousSwipePhase: state.active && isContinuousSwipeCue(state.active.cue)
          ? state.active.continuousPhase
          : null,
        continuousTapDriving: Boolean(
          state.active
          && isContinuousTapCue(state.active.cue)
          && state.active.continuousDriving,
        ),
        sustainedPlaybackDriving: Boolean(
          state.active
          && isSustainedPlaybackCue(state.active.cue)
          && state.active.continuousDriving,
        ),
        continuousSwipePointerTracked: state.continuousPointerTracker.down,
        playbackBlockedByInteraction: playbackBlockedByInteraction(),
        completionShareVisible: !elements.shareButton.hidden,
        sharePending: state.sharePending,
        microphoneMediaAudioSuppressed: Boolean(state.active && state.active.mediaAudioState),
        microphoneDetector: "typed_pcm_features_v2",
        microphoneCalibrationComplete: null,
        microphoneBaselineScore: null,
        microphoneActivationThreshold: state.active
          ? state.active.voiceActivationThreshold
          : null,
        microphoneHoldThreshold: state.active ? state.active.voiceHoldThreshold : null,
        microphoneReadyForInput: Boolean(state.active && state.active.microphoneStarted),
        microphoneSignalActive: Boolean(state.active && state.active.voiceSignalActive),
        cueStates: Object.fromEntries(state.cueStates),
        replayScheduled: state.replayScheduled,
        pendingResultOutcome: state.pendingResultAction
          ? state.pendingResultAction.outcome
          : null,
        pendingResultAction: state.pendingResultAction
          ? state.pendingResultAction.action.action
          : null,
        pendingResultTargetVideoId: state.pendingResultAction
          ? state.pendingResultAction.action.target_video_id || null
          : null,
        pendingResultTiming: state.pendingResultAction
          ? state.pendingResultAction.action.timing || null
          : null,
        retryOriginVideoId: state.retryOrigin ? state.retryOrigin.videoId : null,
        retryOriginCueId: state.retryOrigin ? state.retryOrigin.cueId : null,
      };
    }

    function simulateActiveInteraction() {
      if (host.__pixoRuntimeAuthoringSimulation !== true) {
        return { status: "disabled" };
      }
      const active = state.active;
      if (!active || active.resolved || !active.capabilityBlocked) {
        return { status: "unavailable" };
      }

      active.capabilityBlocked = false;
      active.pendingCapabilityFailure = null;
      active.authoringSimulationDriving = isSustainedPlaybackCue(active.cue);
      setCueState(active.cue, "active");
      updateGuidance();

      if (active.authoringSimulationDriving) {
        const started = startSustainedPlaybackDriving(active, "authoring_simulation");
        if (!started) {
          active.authoringSimulationDriving = false;
          active.capabilityBlocked = true;
          setCueState(active.cue, "blocked");
          updateGuidance();
          return { status: "unavailable" };
        }
        emitRuntimeEvent("gateSimulationStarted", {
          cueId: active.cue.id,
          segmentIndex: state.segmentIndex,
          type: active.cue.type,
          sustained: true,
        });
        return { status: "driving", cueId: active.cue.id };
      }

      // An explicit operator action should not inherit the short anti-double-input
      // debounce from a previously completed cue.
      state.inputDebounceUntil = 0;
      const cueId = active.cue.id;
      return {
        status: resolveSuccess("authoring_simulation") ? "resolved" : "unavailable",
        cueId,
      };
    }

    function destroyRuntime() {
      if (state.destroyed) return;
      state.destroyed = true;
      state.shareRequestToken += 1;
      setSharePending(false);
      cleanupActiveResources(state.active);
      stopFrameLoop();
      windowObject.clearTimeout(state.replayTimer);
      windowObject.clearTimeout(state.feedbackTimer);
      clearPendingMediaActivation();
      clearMediaLoadWatchdog();
      state.pendingMediaSwap = null;
      state.mediaSwapSequence += 1;
      videoPlayers.forEach(function releaseVideoPlayer(video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
        const record = videoRecords.get(video);
        if (record) {
          clearVideoRetry(record);
          record.url = "";
          record.ready = false;
          record.failed = false;
          record.loading = false;
        }
      });
      state.mediaGeneration += 1;
      state.mediaReadyGeneration = -1;
      state.mediaPhase = "destroyed";
      state.expectedMediaUrl = "";
      windowObject.removeEventListener("pixo:host-state", handleHostState);
      windowObject.removeEventListener("resize", handleViewportResize);
      windowObject.removeEventListener("pointerdown", handleWindowPointerDown, true);
      windowObject.removeEventListener("pointermove", handleWindowPointerMove, true);
      windowObject.removeEventListener("pointerup", handleWindowPointerEnd, true);
      windowObject.removeEventListener("pointercancel", handleWindowPointerEnd, true);
      ["contextmenu", "selectstart", "dragstart", "gesturestart", "gesturechange", "gestureend"]
        .forEach(function removeNativeBrowserGuard(eventName) {
          documentObject.removeEventListener(eventName, preventNativeBrowserInteraction, true);
        });
      documentObject.removeEventListener("selectionchange", clearNativeBrowserSelection, true);
      state.continuousPointerTracker.pointerId = null;
      state.continuousPointerTracker.down = false;
      state.continuousPointerTracker.samples = [];
      setCueUiVisible(false);
      state.active = null;
      state.pendingResultAction = null;
      state.retryOrigin = null;
      state.pendingSegmentStartMs = 0;
      state.experience = null;
      state.phase = "destroyed";
      if (guidance) guidance.destroy();
    }

    applyHostLayoutToDocument(currentHostLayout);
    requireElements();
    applyRuntimeHostLayout(currentHostLayout);
    videoPlayers.forEach(function initializeVideoPlayer(video, index) {
      setVideoLayer(video, index === 0 ? "active" : "standby");
      video.preload = "auto";
      if (index > 0) {
        video.muted = true;
        video.defaultMuted = true;
        video.setAttribute("muted", "");
      }
    });
    elements.startButton.addEventListener("click", handleStart);
    elements.shareButton.addEventListener("click", handleCompletionShare);
    elements.replayButton.addEventListener("click", resetExperienceForReplay);
    elements.playControl.addEventListener("click", handlePlayControl);
    elements.interactionTarget.addEventListener("click", handleTargetClick);
    elements.interactionTarget.addEventListener("keydown", handleTargetKeyDown);
    elements.interactionTarget.addEventListener("keyup", handleTargetKeyUp);
    elements.interactionTarget.addEventListener("pointerdown", handlePointerDown);
    elements.interactionTarget.addEventListener("pointermove", handlePointerMove);
    elements.interactionTarget.addEventListener("pointerup", handlePointerEnd);
    elements.interactionTarget.addEventListener("pointercancel", handlePointerEnd);
    elements.eraseFogLayer.addEventListener("pointerdown", handlePointerDown);
    elements.eraseFogLayer.addEventListener("pointermove", handlePointerMove);
    elements.eraseFogLayer.addEventListener("pointerup", handlePointerEnd);
    elements.eraseFogLayer.addEventListener("pointercancel", handlePointerEnd);
    windowObject.addEventListener("pointerdown", handleWindowPointerDown, {
      capture: true,
      passive: false,
    });
    windowObject.addEventListener("pointermove", handleWindowPointerMove, {
      capture: true,
      passive: false,
    });
    windowObject.addEventListener("pointerup", handleWindowPointerEnd, {
      capture: true,
      passive: false,
    });
    windowObject.addEventListener("pointercancel", handleWindowPointerEnd, {
      capture: true,
      passive: false,
    });
    ["contextmenu", "selectstart", "dragstart", "gesturestart", "gesturechange", "gestureend"]
      .forEach(function installNativeBrowserGuard(eventName) {
        documentObject.addEventListener(eventName, preventNativeBrowserInteraction, {
          capture: true,
          passive: false,
        });
      });
    documentObject.addEventListener("selectionchange", clearNativeBrowserSelection, true);

    function installVideoEventListeners(video) {
      video.addEventListener("loadedmetadata", function metadataLoaded() {
        if (video !== elements.video) return;
        positionMarkers();
        updateTimeline();
      });
      video.addEventListener("loadeddata", function videoLoadedData() {
        handleVideoReady(video);
      });
      video.addEventListener("canplay", function videoCanPlay() {
        handleVideoReady(video);
      });
      video.addEventListener("play", function activeVideoPlayed() {
        if (video === elements.video) {
          if (state.authoringTransportPaused) {
            video.pause();
            return;
          }
          updatePlayState();
          emitRuntimeEvent("mediaPlaybackStateChanged", {
            playbackState: "playing",
          });
        }
      });
      video.addEventListener("pause", function activeVideoPaused() {
        if (video === elements.video) {
          updatePlayState();
          emitRuntimeEvent("mediaPlaybackStateChanged", {
            playbackState: "paused",
          });
        }
      });
      video.addEventListener("waiting", function activeVideoWaiting() {
        if (video === elements.video && !video.paused) {
          emitRuntimeEvent("mediaBufferingChanged", { buffering: true });
        }
      });
      video.addEventListener("playing", function activeVideoPlaying() {
        if (video === elements.video) {
          emitRuntimeEvent("mediaBufferingChanged", { buffering: false });
        }
      });
      video.addEventListener("volumechange", function activeVideoVolumeChanged() {
        if (video === elements.video) enforceActiveMicrophoneMediaAudioSuppression();
      });
      video.addEventListener("ended", function activeVideoEnded() {
        if (video === elements.video) handleEnded();
      });
      video.addEventListener("error", function videoFailed() {
        handleVideoError(video);
      });
    }

    videoPlayers.forEach(function observeVideoPlayer(video) {
      installVideoEventListeners(video);
    });
    windowObject.addEventListener("pixo:host-state", handleHostState);
    windowObject.addEventListener("resize", handleViewportResize);
    startFrameLoop();

    return Object.freeze({
      load,
      seek,
      showFatal,
      getState: getStateSnapshot,
      simulateActiveInteraction,
      applyHostLayout: applyRuntimeHostLayout,
      destroy: destroyRuntime,
    });
  }

  const testing = Object.freeze({
    VERSION,
    EXPERIENCE_SPEC_VERSION,
    RESULT_ACTIONS,
    RESULT_ACTION_TIMINGS,
    DEFAULT_CONFIDENCE_THRESHOLD,
    DEFAULT_RESPONSE_WINDOW_MS,
    VOICE_HOLD_MARGIN_SCORE,
    CONTINUOUS_MICROPHONE_WINDOW_MS,
    CONTINUOUS_MICROPHONE_RECENT_EVIDENCE_MS,
    CONTINUOUS_MICROPHONE_MATCH_RATIO,
    CONTINUOUS_MICROPHONE_TOLERANCE_POINTS,
    CONTINUOUS_MICROPHONE_MEDIAN_WINDOW_MS,
    CONTINUOUS_MICROPHONE_SMOOTHING_TIME_MS,
    MIC_DETECTOR_PROFILES,
    CAMERA_CONTENT_RECOGNITION_ENABLED,
    VISION_TARGETS,
    CAMERA_CONTINUOUS_TARGETS,
    CAMERA_CONTINUOUS_TARGET_PROFILES,
    interactionCatalog,
    normalizeHostLayout,
    normalizeConfidenceThreshold,
    normalizeInteractionPlace,
    captionPlacementForPlace,
    normalizeInteractionType,
    isInteractionTypeDisabledByHost,
    isRuntimeSupportedInteractionType,
    normalizeRuntimeInteractionType,
    responseWindowNumber,
    responseWindowAllowsElapsed,
    guideForInteractionType,
    interactionAnimationClass,
    gestureAnimationClass,
    interactionMechanic,
    isTapCue,
    isTapSequenceCue,
    isSwipeCue,
    isDragCue,
    isScrubCue,
    isContinuousSwipeCue,
    isContinuousTapCue,
    isContinuousHoldCue,
    isContinuousBlowCue,
    isContinuousVoiceCue,
    isContinuousMicrophoneCue,
    isSustainedPlaybackCue,
    isPinchCue,
    isDrawCue,
    isEraseCue,
    isPointerGestureCue,
    isHoldCue,
    isMotionCue,
    isCameraCue,
    requiredTapCount,
    MICROPHONE_AUDIO_SUPPRESSION_ATTRIBUTE,
    shouldSuppressMediaAudioForCue,
    shouldToggleFeedPlayback,
    shouldWaitForActiveCueAtMediaEnd,
    shouldSupersedeUnlimitedPlayingCue,
    shouldCompleteContinuousSwipeCue,
    shouldCompleteSustainedPlaybackCue,
    sustainedPlaybackEndMs,
    capabilityFailurePolicyForCue,
    permissionDeniedPolicyForCue,
    cueStartsAtMediaEnd,
    getOffsetTimeMs,
    calculateTapWindow,
    calculateSwipeRequirements,
    evaluateSwipeGesture,
    calculateDragRequirements,
    evaluateDragGesture,
    calculateScrubRequirements,
    evaluateScrubGesture,
    calculateContinuousSwipeRequirements,
    evaluateContinuousSwipeReturn,
    calculatePinchRequirements,
    normalizePinchDirection,
    evaluatePinchGesture,
    calculateCircleRequirements,
    evaluateCircleGesture,
    calculateEraseRequirements,
    evaluateEraseGesture,
    angularDeltaDegrees,
    rotationTravelDeltaDegrees,
    calculateMotionRequirements,
    calculateMotionSampleScore,
    evaluateTiltGesture,
    evaluateRotateGesture,
    evaluateShakeGesture,
    calculateCameraMotionScore,
    calculateCameraRequirements,
    calculateLongPressDuration,
    calculateVoiceRequirements,
    calculateQuietRequirements,
    calculateVoiceThresholds,
    calculateVoiceScore,
    calculateMicrophoneFeatures,
    calculateBlowScore,
    calculateContinuousBlowScore,
    continuousMicrophoneTargetBand,
    continuousBlowTarget,
    isBlowNoiseQualified,
    continuousVoiceTarget,
    calculateContinuousVoiceScore,
    isContinuousMicrophoneScoreInBand,
    isContinuousVoiceQualified,
    evaluateContinuousMicrophoneEvidence,
    isClapOnset,
    isClapRelease,
    calculateResponseWindowProgress,
    isTimedStoryBranchCue,
    resultActionsDiffer,
    responseDeadlineForCue,
    successResumeDelayMs,
    normalizeResultAction,
    normalizeCue,
    retryPreviousPointTargetMs,
    actionTargetVideoId,
    parseExperience,
    extractExperience,
  });

  return Object.freeze({
    version: VERSION,
    interactionCatalog,
    setHostLayout,
    loadExperience,
    seekExperience,
    loadLocalExperience,
    showFatalError,
    getState,
    simulateActiveInteraction,
    destroy,
    testing,
  });
});
