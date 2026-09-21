(function installPixoAdminPreview(windowObject) {
  "use strict";

  const params = new URLSearchParams(windowObject.location.search);
  const experienceId = params.get("experience") || "admin-preview";
  const draftKey = `pixo-admin:draft:${experienceId}`;
  const runtimeKey = `pixo-game:experience:${experienceId}`;
  const sustainedTypes = new Set([
    "continuous_swipe",
    "continuous_tap",
    "continuous_hold",
    "camera_continuous",
    "mic_blow_continuous",
    "mic_level_continuous",
  ]);

  windowObject.document.documentElement.setAttribute("data-pixo-admin-preview", "true");
  // The authoring surface may explicitly advance a capability-blocked cue. The
  // Runtime checks this flag before exposing that preview-only escape hatch, so
  // the published browser and native clients keep their real input semantics.
  windowObject.__pixoRuntimeAuthoringSimulation = true;

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function finite(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function clean(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  function readDraft() {
    try {
      return JSON.parse(windowObject.sessionStorage.getItem(draftKey) || "null");
    } catch {
      return null;
    }
  }

  function activeRuntimeVideo() {
    return windowObject.document.querySelector(
      '.experience-video[data-pixo-video-layer="active"], '
        + '.experience-video[data-pixo-video-layer="incoming"]',
    ) || windowObject.document.getElementById("experience-video");
  }

  function canonicalGate(source, sourceIndex) {
    const gate = record(source);
    return {
      ...gate,
      sourceIndex: Number.isInteger(gate.sourceIndex) ? gate.sourceIndex : sourceIndex,
      gate_at_ms: Math.max(0, Math.round(finite(gate.gate_at_ms, 0))),
    };
  }

  function orderedGates(draft) {
    return (Array.isArray(draft?.gates) ? draft.gates : [])
      .map(canonicalGate)
      .sort((left, right) => left.gate_at_ms - right.gate_at_ms);
  }

  function visionDetection(type, gate) {
    const vision = record(gate.vision);
    const continuous = type === "camera_continuous";
    const target = clean(
      vision.target,
      continuous ? "hand_finger_snap" : "hand_victory",
    );
    if (continuous) {
      return {
        registry_version: "v1",
        target,
        camera_facing: vision.camera_facing === "back" ? "back" : "front",
        show_preview: vision.show_preview !== false,
        signal_kind: "pulse",
        detector_profile: target === "hand_finger_gun_recoil"
          ? "finger_gun_recoil_v1"
          : "finger_snap_v1",
      };
    }
    return {
      registry_version: "v1",
      target,
      camera_facing: vision.camera_facing === "back" ? "back" : "front",
      show_preview: vision.show_preview === true,
      min_confidence: Math.min(0.99, Math.max(0.5, finite(vision.min_confidence, 0.82))),
      stable_for_ms: Math.min(3000, Math.max(150, Math.round(finite(vision.stable_for_ms, 400)))),
    };
  }

  function interactionForGate(gate, nextGate, durationMs) {
    const catalog = windowObject.PixoInteractionCatalog;
    const type = catalog?.normalizeType?.(gate.gesture) || "tap";
    const guide = catalog?.get?.(type) || catalog?.get?.("tap");
    const detection = { ...record(guide?.detection) };
    if (type === "multi_tap") {
      detection.required_tap_count = Math.min(
        99,
        Math.max(1, Math.round(finite(gate.tap_count, 3))),
      );
    }
    if (type === "pinch") {
      detection.pinch_direction = gate.pinch_direction === "outward" ? "outward" : "inward";
    }
    if (type === "rotate" || type === "draw_circle") {
      detection.rotation_direction = gate.rotation_direction === "clockwise"
        ? "clockwise"
        : "counterclockwise";
    }
    if (type === "camera_motion" || type === "camera_continuous") {
      detection.vision = visionDetection(type, gate);
    }

    const sustained = sustainedTypes.has(type);
    const interaction = {
      id: `admin-${gate.sourceIndex}`,
      type,
      description: clean(
        gate.action_description,
        clean(gate.hint, clean(gate.cue, guide?.instruction || type)),
      ),
      offset_time_ms: gate.gate_at_ms,
      pause_video: sustained ? true : gate.pause_video !== false,
      detection,
      on_success: { action: "continue" },
      on_miss: { action: "continue" },
    };

    if (sustained) {
      const boundaries = [gate.gate_end_ms, nextGate?.gate_at_ms, durationMs]
        .map((value) => finite(value, NaN))
        .filter(Number.isFinite);
      if (boundaries.length) {
        const effectiveEnd = Math.min(...boundaries);
        if (effectiveEnd > gate.gate_at_ms) interaction.active_until_ms = effectiveEnd;
      }
    }
    return interaction;
  }

  function firstRelevantGateIndex(gates, options) {
    if (Number.isInteger(options?.selectedSourceIndex)) {
      const selected = gates.findIndex((gate) => gate.sourceIndex === options.selectedSourceIndex);
      if (selected >= 0) return selected;
    }
    const seekMs = finite(options?.seekMs, 0);
    const durationMs = finite(options?.durationMs, NaN);
    const activeRange = gates.findIndex((gate, index) => {
      if (!sustainedTypes.has(gate.gesture)) return false;
      const boundaries = [gate.gate_end_ms, gates[index + 1]?.gate_at_ms, durationMs]
        .map((value) => finite(value, NaN))
        .filter(Number.isFinite);
      const endMs = boundaries.length ? Math.min(...boundaries) : Infinity;
      return gate.gate_at_ms <= seekMs && seekMs < endMs;
    });
    if (activeRange >= 0) return activeRange;
    const upcoming = gates.findIndex((gate) => gate.gate_at_ms >= seekMs - 1);
    return upcoming < 0 ? gates.length : upcoming;
  }

  function buildSpec(draftValue, options) {
    const draft = record(draftValue);
    const allGates = orderedGates(draft);
    const durationMs = Math.max(0, finite(draft.durationMs, 0));
    const startIndex = options?.fromPlayhead
      ? firstRelevantGateIndex(allGates, { ...options, durationMs })
      : 0;
    const gates = allGates.slice(startIndex);
    const interactions = gates.map((gate, index) => (
      interactionForGate(gate, gates[index + 1], durationMs)
    ));
    return {
      head: { act: "video_detail", ver: "1.2", status: 0 },
      body: {
        item_id: clean(draft.itemId, "admin-preview"),
        title: clean(draft.title, "Client preview"),
        description: "Follow each cue to continue.",
        content_type: "runtime",
        experience_spec_version: "1.9",
        video: [{
          video_id: "admin-preview-video",
          title: clean(draft.title, "Client preview"),
          video: clean(draft.mediaUrl, ""),
          interactions,
        }],
      },
    };
  }

  async function waitForCurrentMedia() {
    const startedAt = windowObject.performance.now();
    while (windowObject.performance.now() - startedAt < 8000) {
      const state = windowObject.PixoRuntime?.getState?.();
      const video = activeRuntimeVideo();
      if (state?.mediaReady && !state.mediaSwapPending && video?.readyState >= 1) {
        return video;
      }
      await new Promise((resolve) => windowObject.setTimeout(resolve, 16));
    }
    throw new Error("Preview media metadata timed out.");
  }

  async function seekMedia(video, positionMs) {
    const durationMs = Number.isFinite(video.duration) ? video.duration * 1000 : Infinity;
    const targetMs = Math.max(0, Math.min(finite(positionMs, 0), durationMs));
    video.pause();
    if (Math.abs(video.currentTime * 1000 - targetMs) > 0.5) {
      await new Promise((resolve) => {
        const timeout = windowObject.setTimeout(resolve, 1200);
        video.addEventListener("seeked", () => {
          windowObject.clearTimeout(timeout);
          resolve();
        }, { once: true });
        video.currentTime = targetMs / 1000;
      });
    }
    video.pause();
    video.dispatchEvent(new Event("timeupdate"));
    await new Promise((resolve) => windowObject.requestAnimationFrame(resolve));
    return targetMs;
  }

  async function loadDraft(draftValue, options = {}) {
    if (!windowObject.PixoRuntime?.loadExperience) {
      throw new Error("Pixo client Runtime is not ready.");
    }
    const spec = buildSpec(draftValue);
    await windowObject.PixoRuntime.loadExperience(spec);
    if (Number.isFinite(Number(options.seekMs))) {
      await seekPosition(Number(options.seekMs), options.selectedSourceIndex);
    }
    return spec;
  }

  async function seekPosition(positionMs, selectedSourceIndex) {
    const video = await waitForCurrentMedia();
    const result = windowObject.PixoRuntime.seekExperience(positionMs, {
      ...(Number.isInteger(selectedSourceIndex)
        ? { cueId: `admin-${selectedSourceIndex}` }
        : {}),
      activateSustainedRange: true,
    });
    await seekMedia(video, result?.positionMs ?? positionMs);
    return result;
  }

  function previewPosition(positionMs) {
    const video = activeRuntimeVideo();
    if (!video) return 0;
    video.pause();
    const durationMs = Number.isFinite(video.duration) ? video.duration * 1000 : Infinity;
    const targetMs = Math.max(0, Math.min(finite(positionMs, 0), durationMs));
    video.currentTime = targetMs / 1000;
    return targetMs;
  }

  async function toggleTransport() {
    const video = activeRuntimeVideo();
    if (!video) return false;
    const playControl = windowObject.document.getElementById("play-control");
    if (playControl) playControl.click();
    await new Promise((resolve) => windowObject.requestAnimationFrame(resolve));
    return !video.paused && !video.ended;
  }

  async function simulateActiveInteraction() {
    const simulate = windowObject.PixoRuntime?.simulateActiveInteraction;
    if (typeof simulate !== "function") {
      return { status: "unavailable" };
    }
    return simulate();
  }

  function isTextEntry(target) {
    return target instanceof windowObject.HTMLElement
      && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
  }

  windowObject.addEventListener("keydown", (event) => {
    if ((event.code !== "Space" && event.key !== " ") || event.repeat) return;
    if (isTextEntry(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void toggleTransport();
  }, true);

  const initialDraft = readDraft();
  if (initialDraft) {
    windowObject.sessionStorage.setItem(runtimeKey, JSON.stringify(buildSpec(initialDraft)));
  }

  windowObject.PixoAdminPreview = Object.freeze({
    buildSpec,
    loadDraft,
    seekPosition,
    previewPosition,
    toggleTransport,
    simulateActiveInteraction,
    draftKey,
    runtimeKey,
  });
})(window);
