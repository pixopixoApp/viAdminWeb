(function installPixoBrowserHost(windowObject) {
  "use strict";

  const params = new URLSearchParams(windowObject.location.search);
  const experienceId = params.get("experience");
  const storageKey = experienceId ? `pixo-game:experience:${experienceId}` : "";
  const motionTypes = new Set([
    "hold_still",
    "tilt_left",
    "tilt_right",
    "tilt_forward",
    "tilt_backward",
    "shake",
    "rotate",
  ]);
  const WEB_MOTION_INTERACTIONS_ENABLED = true;
  const isAdminPreview = windowObject.document.documentElement
    .getAttribute("data-pixo-admin-preview") === "true";
  // The editor must surface its simulation control before a short authored
  // response window can expire. Real web experiences retain the more tolerant
  // sensor warm-up interval.
  const MOTION_SAMPLE_TIMEOUT_MS = isAdminPreview ? 400 : 1500;
  windowObject.__pixoRuntimeHostCapabilities = Object.freeze({
    unsupportedInteractionTypes: Object.freeze(
      WEB_MOTION_INTERACTIONS_ENABLED ? [] : [...motionTypes],
    ),
    interactionFallbacks: Object.freeze({}),
    capabilityFailurePolicy: "block",
  });
  const DEFAULT_INTERACTION_BOTTOM_INSET = 168;
  const GUIDANCE_VIEWPORT = Object.freeze({
    top: 16,
    right: 16,
    bottom: 24,
    left: 16,
  });

  windowObject.document.documentElement.setAttribute("data-pixo-presentation", "feed");
  windowObject.document.documentElement.setAttribute("data-pixo-web-host", "true");
  windowObject.document.documentElement.style.setProperty("--pixo-host-bottom-inset", "0px");

  let lastInteractionBottomInset = -1;
  let hostLayoutFrame = 0;

  function applyBrowserHostLayout() {
    hostLayoutFrame = 0;
    const root = windowObject.document.documentElement;
    const caption = windowObject.document.getElementById("interaction-caption");
    const rootHeight = root.clientHeight || windowObject.innerHeight;
    let bottomInset = DEFAULT_INTERACTION_BOTTOM_INSET;
    if (caption && !caption.hidden) {
      const rect = caption.getBoundingClientRect();
      if (rect.height > 0 && rect.top > 0) {
        bottomInset = Math.ceil(rootHeight - rect.top + 10);
      }
    }
    bottomInset = Math.round(clamp(
      bottomInset,
      120,
      Math.max(120, rootHeight * 0.45),
    ));
    if (bottomInset === lastInteractionBottomInset) return;
    lastInteractionBottomInset = bottomInset;
    const layout = {
      interactionViewport: {
        top: 0,
        right: 0,
        bottom: bottomInset,
        left: 0,
      },
      // Spatial guidance owns its caption inside the playing surface. Keep it
      // independent from the legacy footer calculation above so caption
      // movement cannot recursively shrink the guide or its touch surface.
      guidanceViewport: GUIDANCE_VIEWPORT,
      showPlaceGrid: false,
      completionActions: {
        share: Boolean(experienceId),
      },
    };
    if (windowObject.PixoRuntime?.setHostLayout) {
      windowObject.PixoRuntime.setHostLayout(layout);
    } else {
      windowObject.__pixoPendingHostLayout = layout;
    }
  }

  function scheduleBrowserHostLayout() {
    if (hostLayoutFrame) return;
    hostLayoutFrame = windowObject.requestAnimationFrame(applyBrowserHostLayout);
  }

  applyBrowserHostLayout();
  const captionNode = windowObject.document.getElementById("interaction-caption");
  if (captionNode) {
    new MutationObserver(scheduleBrowserHostLayout).observe(captionNode, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(scheduleBrowserHostLayout).observe(captionNode);
    }
  }
  windowObject.addEventListener("resize", scheduleBrowserHostLayout);

  let experienceSpec = null;
  if (storageKey) {
    try {
      const raw = windowObject.sessionStorage.getItem(storageKey);
      if (raw) {
        experienceSpec = JSON.parse(raw);
        windowObject.__pixoPendingExperienceSpecJson = raw;
      }
    } catch {
      experienceSpec = null;
    }
  }

  const interactionTypes = new Set(
    experienceSpec?.body?.video?.flatMap((video) =>
      Array.isArray(video?.interactions)
        ? video.interactions.map((interaction) => interaction?.type)
        : [],
    ).filter(Boolean) ?? [],
  );
  const needsMotion = WEB_MOTION_INTERACTIONS_ENABLED
    && [...interactionTypes].some((type) => motionTypes.has(type));

  let motionPermissionPromise = null;
  let motionActive = false;
  let motionSampleTimeout = 0;
  let motionSampleObserved = false;
  let orientationSample = { alpha: 0, beta: 0, gamma: 0 };
  let previousMotionMagnitude = 0;
  let lastMotionSampleAt = 0;
  let microphoneStream = null;
  let audioContext = null;
  let audioSource = null;
  let analyser = null;
  let microphoneFrame = 0;
  let microphoneActive = false;
  let microphoneMeter = null;
  let microphoneProcessingProfile = "legacy";

  function now() {
    return Date.now();
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function emit(name, data) {
    const receive = windowObject.__pixoNativeReceive
      || windowObject.PixoNative?.receive;
    if (typeof receive !== "function") return;
    receive({
      v: 1,
      kind: "event",
      name,
      data,
    });
  }

  function status(value, extra) {
    return { status: value, ...(extra || {}) };
  }

  async function requestMotionPermission() {
    if (!needsMotion) return status("unavailable");
    if (motionPermissionPromise) return motionPermissionPromise;
    motionPermissionPromise = (async function resolveMotionPermission() {
      try {
        const permissionRequests = [];
        if (typeof windowObject.DeviceMotionEvent?.requestPermission === "function") {
          permissionRequests.push(windowObject.DeviceMotionEvent.requestPermission());
        }
        if (typeof windowObject.DeviceOrientationEvent?.requestPermission === "function") {
          permissionRequests.push(windowObject.DeviceOrientationEvent.requestPermission());
        }
        if (permissionRequests.length) {
          const values = await Promise.all(permissionRequests);
          return status(values.every((value) => value === "granted") ? "granted" : "denied");
        }
        if ("DeviceMotionEvent" in windowObject || "DeviceOrientationEvent" in windowObject) {
          return status("granted");
        }
        return status("unavailable");
      } catch {
        return status("denied");
      }
    })();
    return motionPermissionPromise;
  }

  if (needsMotion) {
    const primeMotionPermission = function primeMotionPermission() {
      requestMotionPermission();
      windowObject.document.removeEventListener("click", primeMotionPermission, true);
    };
    windowObject.document.addEventListener("click", primeMotionPermission, true);
  }

  function handleOrientation(event) {
    const hasSensorSample = [event.alpha, event.beta, event.gamma].some(Number.isFinite);
    if (!hasSensorSample) return;
    motionSampleObserved = true;
    windowObject.clearTimeout(motionSampleTimeout);
    motionSampleTimeout = 0;
    orientationSample = {
      alpha: Number.isFinite(event.alpha) ? event.alpha : 0,
      beta: Number.isFinite(event.beta) ? event.beta : 0,
      gamma: Number.isFinite(event.gamma) ? event.gamma : 0,
    };
    if (!motionActive) return;
    const sampleAt = now();
    if (sampleAt - lastMotionSampleAt < 32) return;
    lastMotionSampleAt = sampleAt;
    emit("motion", {
      status: "active",
      timestamp: sampleAt,
      ...orientationSample,
      motion_score: 0,
      shake_score: 0,
    });
  }

  function handleDeviceMotion(event) {
    if (!motionActive) return;
    const sampleAt = now();
    if (sampleAt - lastMotionSampleAt < 32) return;
    lastMotionSampleAt = sampleAt;
    const acceleration = event.acceleration || event.accelerationIncludingGravity || {};
    const hasSensorSample = [acceleration.x, acceleration.y, acceleration.z].some(Number.isFinite);
    if (!hasSensorSample) return;
    motionSampleObserved = true;
    windowObject.clearTimeout(motionSampleTimeout);
    motionSampleTimeout = 0;
    const x = Number.isFinite(acceleration.x) ? acceleration.x : 0;
    const y = Number.isFinite(acceleration.y) ? acceleration.y : 0;
    const z = Number.isFinite(acceleration.z) ? acceleration.z : 0;
    const magnitude = Math.sqrt((x * x) + (y * y) + (z * z));
    const delta = Math.abs(magnitude - previousMotionMagnitude);
    previousMotionMagnitude = magnitude;
    emit("motion", {
      status: "active",
      timestamp: sampleAt,
      ...orientationSample,
      acceleration_x: x,
      acceleration_y: y,
      acceleration_z: z,
      acceleration_magnitude: magnitude,
      motion_score: clamp(delta * 12, 0, 100),
      shake_score: clamp(delta * 14, 0, 100),
    });
  }

  async function startMotion() {
    const permission = await requestMotionPermission();
    if (!["granted", "active"].includes(permission.status)) return permission;
    if (!motionActive) {
      motionActive = true;
      motionSampleObserved = false;
      windowObject.addEventListener("deviceorientation", handleOrientation);
      windowObject.addEventListener("devicemotion", handleDeviceMotion);
      windowObject.clearTimeout(motionSampleTimeout);
      motionSampleTimeout = windowObject.setTimeout(function motionSampleTimedOut() {
        motionSampleTimeout = 0;
        if (!motionActive || motionSampleObserved) return;
        stopMotion();
        emit("motion", {
          status: "unavailable",
          reason: "no_sensor_samples",
          timestamp: now(),
        });
      }, MOTION_SAMPLE_TIMEOUT_MS);
    }
    return status("active");
  }

  function stopMotion() {
    motionActive = false;
    motionSampleObserved = false;
    windowObject.clearTimeout(motionSampleTimeout);
    motionSampleTimeout = 0;
    windowObject.removeEventListener("deviceorientation", handleOrientation);
    windowObject.removeEventListener("devicemotion", handleDeviceMotion);
    return status("stopped");
  }

  async function ensureMicrophone() {
    if (microphoneStream?.active) return status("granted");
    if (!windowObject.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      return status("unavailable");
    }
    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
        video: false,
      });
      return status("granted");
    } catch (error) {
      return status(error?.name === "NotAllowedError" ? "denied" : "unavailable");
    }
  }

  function sampleMicrophone() {
    if (!microphoneActive || !analyser) return;
    const values = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(values);
    const microphoneApi = windowObject.PixoWebMicrophone;
    if (!microphoneMeter || !microphoneApi?.analyzeFloatPcm) {
      stopMicrophone();
      return;
    }
    const pcm = microphoneApi.analyzeFloatPcm(values, audioContext?.sampleRate);
    const reading = microphoneMeter.update(
      pcm.rms,
      pcm.peak,
      pcm.zeroCrossingRate,
    );
    emit("microphoneLevel", {
      status: "active",
      timestamp: now(),
      rms: reading.rms,
      peak: reading.peak,
      rms_dbfs: reading.rmsDbfs,
      peak_dbfs: reading.peakDbfs,
      instant_score: reading.instantScore,
      peak_score: reading.peakScore,
      transient_score: reading.transientScore,
      noise_score: reading.noiseScore,
      zero_crossing_rate: reading.zeroCrossingRate,
      score: reading.score,
      volume_score: reading.score,
      noise_floor_dbfs: reading.noiseFloorDbfs,
      peak_noise_floor_dbfs: reading.peakNoiseFloorDbfs,
      signal_to_noise_db: reading.signalToNoiseDb,
      peak_signal_to_noise_db: reading.peakSignalToNoiseDb,
      peak_rise_db: reading.peakRiseDb,
      normalization_ready: reading.normalizationReady,
      calibration_progress: reading.calibrationProgress,
      pitch_hz: pcm.pitchHz,
      pitch_confidence: pcm.pitchConfidence,
      analysis_window_ms: Math.round(
        values.length / Math.max(1, audioContext?.sampleRate || 16_000) * 1000,
      ),
      emit_interval_ms: 50,
      audio_source: "web_audio",
      sample_rate_hz: audioContext?.sampleRate || 16_000,
      processing_profile: microphoneProcessingProfile,
      echo_canceler_available: false,
      echo_canceler_enabled: false,
      detector: "web_normalized_v2",
    });
    microphoneFrame = windowObject.setTimeout(sampleMicrophone, 50);
  }

  async function startMicrophone(config = {}) {
    microphoneProcessingProfile = typeof config.processing_profile === "string"
      ? config.processing_profile
      : "legacy";
    const permission = await ensureMicrophone();
    if (!["granted", "active"].includes(permission.status)) return permission;
    if (microphoneActive) return status("active");
    try {
      const AudioContextConstructor = windowObject.AudioContext || windowObject.webkitAudioContext;
      const MicrophoneMeter = windowObject.PixoWebMicrophone?.MicrophoneLevelMeter;
      if (typeof AudioContextConstructor !== "function" || typeof MicrophoneMeter !== "function") {
        return status("unavailable");
      }
      audioContext = audioContext || new AudioContextConstructor();
      if (audioContext.state === "suspended") await audioContext.resume();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      audioSource = audioContext.createMediaStreamSource(microphoneStream);
      audioSource.connect(analyser);
      microphoneMeter = new MicrophoneMeter();
      microphoneActive = true;
      sampleMicrophone();
      return status("active");
    } catch {
      stopMicrophone();
      return status("unavailable");
    }
  }

  function stopMicrophone() {
    microphoneActive = false;
    windowObject.clearTimeout(microphoneFrame);
    microphoneFrame = 0;
    try {
      audioSource?.disconnect();
      analyser?.disconnect();
    } catch {
      // Audio nodes may already be disconnected.
    }
    microphoneStream?.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
    audioSource = null;
    analyser = null;
    microphoneMeter = null;
    microphoneProcessingProfile = "legacy";
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    return status("stopped");
  }

  async function requestCapability(name) {
    const normalized = String(name || "").toLowerCase();
    if (["motion", "orientation", "tilt", "gyro", "shake"].includes(normalized)) {
      return requestMotionPermission();
    }
    if (normalized.includes("microphone")) return ensureMicrophone();
    if (normalized.includes("camera")) return status("unavailable");
    if (["haptics", "deviceinfo", "mediacontrol"].includes(normalized)) {
      return status("granted");
    }
    return status("unavailable");
  }

  function haptic(style) {
    const durations = {
      light: 12,
      medium: 22,
      heavy: 36,
      success: [18, 35, 30],
    };
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(durations[style] || durations.light);
    }
    return status("played");
  }

  function mediaControl(stateValue) {
    const media = windowObject.document.getElementById("experience-video");
    if (!media) return status("unavailable");
    if (typeof stateValue?.muted === "boolean") media.muted = stateValue.muted;
    if (Number.isFinite(stateValue?.volume)) {
      media.volume = clamp(stateValue.volume, 0, 1);
    }
    if (stateValue?.playing === true) media.play().catch(() => {});
    if (stateValue?.playing === false) media.pause();
    return status("applied");
  }

  windowObject.__pixoNativeTransport = {
    name: "pixo-browser-host",
    async post(envelope) {
      if (!envelope || envelope.kind === "runtime_event") {
        if (envelope?.data && windowObject.parent !== windowObject) {
          windowObject.parent.postMessage(
            { type: "pixo-runtime-event", detail: envelope.data },
            windowObject.location.origin,
          );
        }
        return null;
      }
      const method = envelope.method || envelope.action;
      const paramsValue = envelope.params || envelope.payload || {};
      switch (method) {
        case "deviceInfo":
          return {
            platform: "web",
            bridgeVersion: 1,
            runtimeHost: "browser",
            capabilities: {
              motion: needsMotion,
              microphoneLevel: Boolean(navigator.mediaDevices?.getUserMedia),
              cameraSignals: false,
              haptics: typeof navigator.vibrate === "function",
              mediaControl: true,
              shareExperience: Boolean(experienceId),
            },
          };
        case "requestCapability":
          return requestCapability(paramsValue.name);
        case "startMotion":
          return startMotion();
        case "stopMotion":
          return stopMotion();
        case "startMicrophoneLevel":
          return startMicrophone(paramsValue);
        case "stopMicrophoneLevel":
          return stopMicrophone();
        case "startCameraSignals":
          return status("unavailable");
        case "stopCameraSignals":
          return status("stopped");
        case "haptic":
          return haptic(paramsValue.style);
        case "mediaControl":
          return mediaControl(paramsValue);
        case "shareExperience":
          if (!experienceId || !windowObject.PixoWebShare?.copyExperienceShareLink) {
            return status("unavailable");
          }
          return windowObject.PixoWebShare.copyExperienceShareLink(
            windowObject,
            experienceId,
          );
        default:
          throw new Error(`Unsupported browser host action: ${method}`);
      }
    },
  };

  function cleanup() {
    windowObject.cancelAnimationFrame(hostLayoutFrame);
    windowObject.removeEventListener("resize", scheduleBrowserHostLayout);
    stopMotion();
    stopMicrophone();
  }

  windowObject.addEventListener("pagehide", cleanup, { once: true });
})(window);
