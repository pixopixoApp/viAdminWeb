(function installPixoWebVision(windowObject) {
  "use strict";

  const scriptUrl = windowObject.document.currentScript?.src
    || new URL("web-vision-session.js", windowObject.location.href).href;
  const workerUrl = new URL("web-vision-worker.mjs", scriptUrl).href;
  const WARM_STREAM_MS = 5000;
  const OPERATION_TIMEOUT_MS = 30000;
  const SUPPORTED_TARGETS = Object.freeze([
    "hand_victory", "hand_thumb_up", "hand_thumb_down", "hand_open_palm",
    "hand_closed_fist", "hand_pointing_up", "hand_i_love_you",
    "face_smile", "face_wink_left", "face_wink_right", "face_blink",
    "face_mouth_open", "face_mouth_pucker", "face_brow_raise",
    "face_brow_furrow", "face_cheek_puff", "hand_finger_snap",
    "hand_finger_gun_recoil",
  ]);
  const SUPPORTED_TARGET_SET = new Set(SUPPORTED_TARGETS);

  function status(value, extra) {
    return { status: value, ...(extra || {}) };
  }

  function cleanMessage(error) {
    return (error instanceof Error ? error.message : String(error || "Vision failed."))
      .slice(0, 160);
  }

  function capabilityError(error) {
    const name = String(error?.name || "");
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return status("denied", { reason: "camera_permission_denied" });
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return status("unavailable", { reason: "camera_not_found" });
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return status("unavailable", { reason: "camera_in_use" });
    }
    if (name === "OverconstrainedError") {
      return status("unavailable", { reason: "camera_constraints_unavailable" });
    }
    return status("error", { reason: "camera_error", message: cleanMessage(error) });
  }

  function withTimeout(promise, timeoutMs, message) {
    let timer = 0;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = windowObject.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]).finally(() => windowObject.clearTimeout(timer));
  }

  function activeVideoTrack(stream) {
    return stream?.getVideoTracks?.().find((track) => track.readyState !== "ended") || null;
  }

  function cameraConstraints(facing, deviceId) {
    return {
      audio: false,
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
        ...(deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: facing === "back" ? "environment" : "user" } }),
      },
    };
  }

  function createPreview() {
    let preview = windowObject.document.getElementById("pixo-web-vision-preview");
    if (preview) return preview;
    preview = windowObject.document.createElement("video");
    preview.id = "pixo-web-vision-preview";
    preview.className = "pixo-web-vision-preview";
    preview.autoplay = true;
    preview.muted = true;
    preview.playsInline = true;
    preview.disablePictureInPicture = true;
    preview.setAttribute("aria-label", "Live camera preview");
    preview.hidden = true;
    windowObject.document.body.append(preview);
    return preview;
  }

  class WebVisionSession {
    constructor({ onSignal } = {}) {
      this.onSignal = typeof onSignal === "function" ? onSignal : () => {};
      this.worker = null;
      this.workerReadyFamilies = new Set();
      this.initializationPromise = null;
      this.initializationResolve = null;
      this.initializationReject = null;
      this.startPromise = null;
      this.startResolve = null;
      this.startReject = null;
      this.stream = null;
      this.streamFacing = "front";
      this.selectedDeviceId = "";
      this.preview = null;
      this.activeConfig = null;
      this.sessionId = 0;
      this.frameInFlight = false;
      this.frameHandle = 0;
      this.frameMode = "";
      this.streamTimer = 0;
      this.disposed = false;
      this.inferenceSamples = [];
    }

    supported() {
      return windowObject.isSecureContext !== false
        && typeof windowObject.Worker === "function"
        && typeof windowObject.WebAssembly === "object"
        && typeof windowObject.createImageBitmap === "function"
        && typeof windowObject.navigator?.mediaDevices?.getUserMedia === "function";
    }

    ensureWorker() {
      if (this.worker) return this.worker;
      if (this.disposed) throw new Error("Vision session was disposed.");
      const worker = new Worker(workerUrl, { type: "module", name: "pixo-vision" });
      worker.addEventListener("message", (event) => this.handleWorkerMessage(event.data || {}));
      worker.addEventListener("error", (event) => this.handleWorkerError(event.error || event.message));
      this.worker = worker;
      return worker;
    }

    async prepare(targets) {
      if (!this.supported()) return status("unavailable", { reason: "vision_api_unavailable" });
      const requestedTargets = (Array.isArray(targets) ? targets : []).map(String);
      if (requestedTargets.some((target) => !SUPPORTED_TARGET_SET.has(target))) {
        return status("unavailable", { reason: "vision_target_unsupported" });
      }
      const families = [...new Set(requestedTargets.map((target) => (
        String(target).startsWith("face_") ? "face" : "hand"
      )))];
      if (!families.length) return status("granted");
      const missing = families.filter((family) => !this.workerReadyFamilies.has(family));
      if (!missing.length) return status("granted");
      if (this.initializationPromise) {
        const result = await this.initializationPromise;
        const remaining = families.filter((family) => !this.workerReadyFamilies.has(family));
        return remaining.length ? this.prepare(targets) : result;
      }
      const worker = this.ensureWorker();
      this.initializationPromise = new Promise((resolve, reject) => {
        this.initializationResolve = resolve;
        this.initializationReject = reject;
      });
      worker.postMessage({ type: "initialize", families: missing });
      try {
        await withTimeout(
          this.initializationPromise,
          OPERATION_TIMEOUT_MS,
          "Vision models took too long to initialize.",
        );
        return status("granted");
      } catch (error) {
        this.resetWorker();
        return status("unavailable", {
          reason: "vision_engine_load_failed",
          message: cleanMessage(error),
        });
      } finally {
        this.initializationPromise = null;
        this.initializationResolve = null;
        this.initializationReject = null;
      }
    }

    async requestPermission({ facing = "front", deviceId = "" } = {}) {
      if (!this.supported()) return status("unavailable", { reason: "vision_api_unavailable" });
      windowObject.clearTimeout(this.streamTimer);
      this.streamTimer = 0;
      const track = activeVideoTrack(this.stream);
      const activeDeviceId = String(track?.getSettings?.().deviceId || "");
      if (track && (!deviceId || activeDeviceId === deviceId) && this.streamFacing === facing) {
        return status("granted", { deviceId: activeDeviceId });
      }
      this.releaseStream();
      try {
        const streamPromise = windowObject.navigator.mediaDevices.getUserMedia(
          cameraConstraints(facing, deviceId),
        );
        const stream = await withTimeout(
          streamPromise,
          OPERATION_TIMEOUT_MS,
          "Camera permission request timed out.",
        ).catch((error) => {
          streamPromise.then((lateStream) => lateStream?.getTracks?.().forEach((item) => item.stop()))
            .catch(() => {});
          throw error;
        });
        const videoTrack = activeVideoTrack(stream);
        if (!videoTrack) {
          stream?.getTracks?.().forEach((item) => item.stop());
          return status("unavailable", { reason: "camera_not_found" });
        }
        this.stream = stream;
        this.streamFacing = facing;
        this.selectedDeviceId = String(videoTrack.getSettings?.().deviceId || deviceId || "");
        videoTrack.addEventListener?.("ended", () => {
          if (this.activeConfig) this.failActive("camera_disconnected", "The camera disconnected.");
        }, { once: true });
        return status("granted", { deviceId: this.selectedDeviceId });
      } catch (error) {
        return capabilityError(error);
      }
    }

    async start(config) {
      const target = String(config?.target || "");
      const prepared = await this.prepare([target]);
      if (prepared.status !== "granted") return prepared;
      const facing = config?.camera_facing === "back" ? "back" : "front";
      const permission = await this.requestPermission({
        facing,
        deviceId: String(config?.device_id
          || (activeVideoTrack(this.stream) && this.streamFacing === facing
            ? this.selectedDeviceId
            : "")
          || ""),
      });
      if (permission.status !== "granted") return permission;
      this.stopFrames();
      const sessionId = ++this.sessionId;
      this.activeConfig = { ...config, target, camera_facing: facing };
      this.inferenceSamples = [];
      const preview = this.preview || createPreview();
      this.preview = preview;
      preview.srcObject = this.stream;
      preview.hidden = config?.show_preview !== true;
      preview.dataset.facing = facing;
      try {
        await preview.play();
        await this.waitForVideoFrame(preview);
        const worker = this.ensureWorker();
        this.startPromise = new Promise((resolve, reject) => {
          this.startResolve = resolve;
          this.startReject = reject;
        });
        worker.postMessage({ type: "start", sessionId, config: this.activeConfig });
        await withTimeout(
          this.startPromise,
          OPERATION_TIMEOUT_MS,
          "Vision detector took too long to start.",
        );
        if (sessionId !== this.sessionId || !this.activeConfig) return status("stopped");
        this.scheduleFrame();
        return status("active", { target });
      } catch (error) {
        this.failActive("vision_start_failed", cleanMessage(error));
        return status("unavailable", {
          reason: "vision_start_failed",
          message: cleanMessage(error),
        });
      } finally {
        this.startPromise = null;
        this.startResolve = null;
        this.startReject = null;
      }
    }

    waitForVideoFrame(video) {
      if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();
      return withTimeout(new Promise((resolve, reject) => {
        const done = () => {
          video.removeEventListener("loadeddata", done);
          video.removeEventListener("error", failed);
          resolve();
        };
        const failed = () => {
          video.removeEventListener("loadeddata", done);
          video.removeEventListener("error", failed);
          reject(new Error("The camera did not provide a video frame."));
        };
        video.addEventListener("loadeddata", done, { once: true });
        video.addEventListener("error", failed, { once: true });
      }), 10000, "The camera did not provide a video frame.");
    }

    scheduleFrame() {
      if (!this.activeConfig || !this.preview || this.frameHandle) return;
      if (typeof this.preview.requestVideoFrameCallback === "function") {
        this.frameMode = "video";
        this.frameHandle = this.preview.requestVideoFrameCallback((_, metadata) => {
          this.frameHandle = 0;
          this.captureFrame(metadata?.mediaTime ? metadata.mediaTime * 1000 : performance.now());
        });
      } else {
        this.frameMode = "animation";
        this.frameHandle = windowObject.requestAnimationFrame((timestamp) => {
          this.frameHandle = 0;
          this.captureFrame(timestamp);
        });
      }
    }

    async captureFrame(timestampMs) {
      const sessionId = this.sessionId;
      if (!this.activeConfig || !this.preview || sessionId <= 0) return;
      if (this.frameInFlight || this.preview.readyState < 2) {
        this.scheduleFrame();
        return;
      }
      this.frameInFlight = true;
      try {
        const bitmap = await windowObject.createImageBitmap(this.preview);
        if (!this.activeConfig || sessionId !== this.sessionId) {
          bitmap.close?.();
          this.frameInFlight = false;
          return;
        }
        this.ensureWorker().postMessage({
          type: "frame",
          sessionId,
          timestampMs,
          bitmap,
        }, [bitmap]);
      } catch (error) {
        this.frameInFlight = false;
        this.failActive("vision_frame_failed", cleanMessage(error));
      }
    }

    handleWorkerMessage(message) {
      if (message.type === "initialized") {
        (message.families || []).forEach((family) => this.workerReadyFamilies.add(family));
        this.initializationResolve?.();
        return;
      }
      if (message.type === "started") {
        if (message.sessionId === this.sessionId) this.startResolve?.();
        return;
      }
      if (message.type === "frame") {
        if (message.sessionId !== this.sessionId || !this.activeConfig) return;
        this.frameInFlight = false;
        if (Number.isFinite(message.inferenceMs)) {
          this.inferenceSamples.push(message.inferenceMs);
          if (this.inferenceSamples.length > 60) this.inferenceSamples.shift();
        }
        if (message.signal?.kind === "matched" || message.signal?.kind === "activity") {
          this.onSignal({
            status: message.signal.kind,
            timestamp: Date.now(),
            target: this.activeConfig.target,
            ...(Number.isFinite(message.signal.confidence)
              ? { confidence: message.signal.confidence }
              : {}),
          });
        }
        this.scheduleFrame();
        return;
      }
      if (message.type === "error") {
        const error = new Error(message.message || "Vision worker failed.");
        if (this.initializationReject) this.initializationReject(error);
        else if (this.startReject) this.startReject(error);
        else if (!message.sessionId || message.sessionId === this.sessionId) {
          this.failActive("vision_runtime_error", error.message);
        }
      }
    }

    handleWorkerError(error) {
      const failure = error instanceof Error ? error : new Error(cleanMessage(error));
      this.initializationReject?.(failure);
      this.startReject?.(failure);
      if (this.activeConfig) this.failActive("vision_worker_error", failure.message);
    }

    stop({ releaseStream = false } = {}) {
      const stoppedSession = this.sessionId;
      this.sessionId += 1;
      this.stopFrames();
      this.worker?.postMessage({ type: "stop", sessionId: stoppedSession });
      this.activeConfig = null;
      if (this.preview) {
        this.preview.hidden = true;
        this.preview.srcObject = null;
      }
      windowObject.clearTimeout(this.streamTimer);
      if (releaseStream) this.releaseStream();
      else this.streamTimer = windowObject.setTimeout(() => this.releaseStream(), WARM_STREAM_MS);
      return status("stopped");
    }

    stopFrames() {
      if (this.frameHandle && this.preview) {
        if (this.frameMode === "video" && typeof this.preview.cancelVideoFrameCallback === "function") {
          this.preview.cancelVideoFrameCallback(this.frameHandle);
        } else {
          windowObject.cancelAnimationFrame(this.frameHandle);
        }
      }
      this.frameHandle = 0;
      this.frameMode = "";
      this.frameInFlight = false;
    }

    releaseStream() {
      windowObject.clearTimeout(this.streamTimer);
      this.streamTimer = 0;
      this.stream?.getTracks?.().forEach((track) => track.stop());
      this.stream = null;
    }

    failActive(reason, message) {
      if (!this.activeConfig) return;
      const target = this.activeConfig.target;
      this.onSignal({ status: "error", reason, message: String(message || reason).slice(0, 160), target });
      this.stop({ releaseStream: true });
    }

    resetWorker() {
      this.worker?.terminate();
      this.worker = null;
      this.workerReadyFamilies.clear();
      this.initializationPromise = null;
      this.initializationResolve = null;
      this.initializationReject = null;
      this.startPromise = null;
      this.startResolve = null;
      this.startReject = null;
    }

    suspend() {
      this.stop({ releaseStream: true });
      this.resetWorker();
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.stop({ releaseStream: true });
      try { this.worker?.postMessage({ type: "dispose" }); } catch { /* Worker already stopped. */ }
      this.resetWorker();
      this.preview?.remove();
      this.preview = null;
    }

    diagnostics() {
      const sorted = [...this.inferenceSamples].sort((left, right) => left - right);
      const percentile = sorted.length ? sorted[Math.floor((sorted.length - 1) * 0.95)] : 0;
      const average = sorted.length
        ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length
        : 0;
      return {
        samples: sorted.length,
        averageInferenceMs: average,
        p95InferenceMs: percentile,
        estimatedFps: average > 0 ? Math.min(30, 1000 / average) : 0,
      };
    }
  }

  windowObject.PixoWebVision = Object.freeze({
    createSession(options) {
      return new WebVisionSession(options);
    },
    workerUrl,
    supportedTargets: SUPPORTED_TARGETS,
  });
})(window);
