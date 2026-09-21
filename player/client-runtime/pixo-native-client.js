(function bootstrapPixoNativeClient(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PixoNativeClient = api;
    const isBrowserHost = root.window === root || Boolean(root.document);
    if (isBrowserHost) api.installGlobal(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createPixoNativeClientModule() {
  "use strict";

  const BRIDGE_VERSION = 1;
  const DEFAULT_TIMEOUT_MS = 15000;
  const PERMISSION_TIMEOUT_MS = 120000;
  const CLIENT_MARKER = "__pixoNativeClientV1";

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function positiveTimeout(value, fallback) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function parseEnvelope(raw) {
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch (error) {
        return null;
      }
    }
    return isRecord(raw) ? raw : null;
  }

  function makeError(code, message, details) {
    const error = new Error(message);
    error.name = "PixoNativeError";
    error.code = code;
    if (details !== undefined) error.details = details;
    return error;
  }

  function normalizeExplicitTransport(transport) {
    if (typeof transport === "function") {
      return {
        name: "explicit",
        post: transport,
      };
    }
    if (transport && typeof transport.post === "function") {
      return {
        name: transport.name || "explicit",
        post: function postExplicit(envelope) {
          return transport.post(envelope);
        },
      };
    }
    return null;
  }

  /**
   * Detects the narrow, platform-owned transport. The shared client always sends an object to the
   * injectable iOS transport and JSON text to Android @JavascriptInterface transports.
   */
  function detectTransport(globalObject) {
    const host = globalObject || {};
    const injected = host.__pixoNativeTransport;
    if (injected && typeof injected.post === "function") {
      return {
        name: "injected",
        post: function postInjected(envelope) {
          return injected.post(envelope);
        },
      };
    }

    const pixoAndroidBridge = host.PixoNativeBridge;
    if (pixoAndroidBridge && typeof pixoAndroidBridge.post === "function") {
      return {
        name: "android-pixo",
        post: function postPixoAndroid(envelope) {
          return pixoAndroidBridge.post(JSON.stringify(envelope));
        },
      };
    }

    const legacyAndroidBridge = host.MotionCueNativeBridge;
    if (legacyAndroidBridge && typeof legacyAndroidBridge.post === "function") {
      return {
        name: "android-motioncue",
        post: function postLegacyAndroid(envelope) {
          return legacyAndroidBridge.post(JSON.stringify(envelope));
        },
      };
    }
    return null;
  }

  function createNativeClient(options) {
    const config = options || {};
    const globalObject = config.globalObject || (
      typeof globalThis !== "undefined" ? globalThis : {}
    );
    const explicitTransport = normalizeExplicitTransport(config.transport);
    const timeoutMs = positiveTimeout(config.timeoutMs, DEFAULT_TIMEOUT_MS);
    const timers = config.timers || {
      setTimeout: function schedule(callback, delay) {
        return globalObject.setTimeout(callback, delay);
      },
      clearTimeout: function cancel(handle) {
        return globalObject.clearTimeout(handle);
      },
    };
    const pending = new Map();
    const listeners = new Map();
    let sequence = 1;
    let disposed = false;

    function currentTransport() {
      return explicitTransport || detectTransport(globalObject);
    }

    function completePending(id, ok, result, errorPayload) {
      const entry = pending.get(String(id));
      if (!entry) return false;
      pending.delete(String(id));
      timers.clearTimeout(entry.timer);
      if (ok) {
        entry.resolve(result === undefined ? {} : result);
      } else {
        const details = errorPayload === undefined ? result : errorPayload;
        const message = isRecord(details) && typeof details.message === "string"
          ? details.message
          : `Native request '${entry.method}' failed.`;
        entry.reject(makeError("PIXO_NATIVE_REQUEST_FAILED", message, details));
      }
      return true;
    }

    function dispatchDomEvent(prefix, name, data) {
      if (!globalObject || typeof globalObject.dispatchEvent !== "function") return;
      if (typeof globalObject.CustomEvent !== "function") return;
      try {
        globalObject.dispatchEvent(new globalObject.CustomEvent(`${prefix}:${name}`, {
          detail: data,
        }));
      } catch (error) {
        // DOM event compatibility is best-effort; subscribed bridge handlers still receive data.
      }
    }

    function emitEvent(name, data, envelope) {
      const handlers = listeners.get(name);
      if (handlers) {
        Array.from(handlers).forEach(function notify(handler) {
          try {
            handler(data, envelope);
          } catch (error) {
            // A consumer callback must not prevent delivery to the remaining consumers.
          }
        });
      }
      dispatchDomEvent("pixo", name, data);
      dispatchDomEvent("motioncue", name, data);
    }

    function receive(rawEnvelope) {
      const envelope = parseEnvelope(rawEnvelope);
      if (!envelope || envelope.v !== BRIDGE_VERSION) return false;
      if (envelope.kind === "response" && envelope.id !== undefined) {
        return completePending(
          envelope.id,
          envelope.ok !== false,
          envelope.result,
          envelope.error,
        );
      }
      if (envelope.kind === "event" && typeof envelope.name === "string") {
        emitEvent(envelope.name, envelope.data || {}, envelope);
        return true;
      }
      return false;
    }

    function handleDirectTransportResult(id, result) {
      if (result === undefined || result === null) return;
      const envelope = parseEnvelope(result);
      if (envelope && envelope.kind) {
        receive(envelope);
        return;
      }
      completePending(id, true, result);
    }

    function request(method, params, requestOptions) {
      if (disposed) {
        return Promise.reject(makeError(
          "PIXO_NATIVE_DISPOSED",
          "Pixo native client has been disposed.",
        ));
      }
      if (typeof method !== "string" || !method.trim()) {
        return Promise.reject(makeError(
          "PIXO_NATIVE_INVALID_METHOD",
          "Native method must be a non-empty string.",
        ));
      }
      const transport = currentTransport();
      if (!transport) {
        return Promise.reject(makeError(
          "PIXO_NATIVE_TRANSPORT_UNAVAILABLE",
          "No Pixo native transport is available.",
        ));
      }

      const id = String(sequence++);
      const normalizedMethod = method.trim();
      const normalizedParams = isRecord(params) ? params : {};
      const envelope = {
        v: BRIDGE_VERSION,
        kind: "request",
        id,
        method: normalizedMethod,
        params: normalizedParams,
        // Android v1 compatibility. Existing Kotlin reads action/payload while newer hosts can use
        // the versioned method/params fields above.
        action: normalizedMethod,
        payload: normalizedParams,
      };
      const requestTimeoutMs = positiveTimeout(
        requestOptions && requestOptions.timeoutMs,
        timeoutMs,
      );

      return new Promise(function dispatchRequest(resolve, reject) {
        const timer = timers.setTimeout(function requestTimedOut() {
          if (!pending.delete(id)) return;
          reject(makeError(
            "PIXO_NATIVE_TIMEOUT",
            `Native request '${normalizedMethod}' timed out after ${requestTimeoutMs}ms.`,
            { id, method: normalizedMethod, timeoutMs: requestTimeoutMs },
          ));
        }, requestTimeoutMs);
        pending.set(id, {
          method: normalizedMethod,
          resolve,
          reject,
          timer,
        });

        try {
          const posted = transport.post(envelope);
          if (posted && typeof posted.then === "function") {
            posted.then(
              function transportResolved(result) {
                handleDirectTransportResult(id, result);
              },
              function transportRejected(error) {
                completePending(id, false, undefined, error);
              },
            );
          } else {
            handleDirectTransportResult(id, posted);
          }
        } catch (error) {
          completePending(id, false, undefined, error);
        }
      });
    }

    function notifyRuntimeEvent(detail) {
      if (disposed) return false;
      const transport = currentTransport();
      if (!transport) return false;
      const envelope = {
        v: BRIDGE_VERSION,
        kind: "runtime_event",
        data: isRecord(detail) ? detail : {},
      };
      try {
        const posted = transport.post(envelope);
        if (posted && typeof posted.catch === "function") {
          posted.catch(function ignoreRuntimeEventTransportFailure() {});
        }
        return true;
      } catch (error) {
        return false;
      }
    }

    function on(name, handler) {
      if (typeof name !== "string" || !name.trim() || typeof handler !== "function") {
        throw makeError(
          "PIXO_NATIVE_INVALID_LISTENER",
          "Native event subscriptions require a name and handler.",
        );
      }
      const normalizedName = name.trim();
      let handlers = listeners.get(normalizedName);
      if (!handlers) {
        handlers = new Set();
        listeners.set(normalizedName, handlers);
      }
      handlers.add(handler);
      return function unsubscribe() {
        const current = listeners.get(normalizedName);
        if (!current) return;
        current.delete(handler);
        if (!current.size) listeners.delete(normalizedName);
      };
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      pending.forEach(function rejectPending(entry, id) {
        timers.clearTimeout(entry.timer);
        entry.reject(makeError(
          "PIXO_NATIVE_DISPOSED",
          `Native request '${entry.method}' was cancelled because the client was disposed.`,
          { id, method: entry.method },
        ));
      });
      pending.clear();
      listeners.clear();
    }

    const capabilities = Object.freeze({
      motion: true,
      tilt: true,
      gyro: true,
      shake: true,
      orientation: true,
      microphoneLevel: true,
      cameraPermission: true,
      cameraSignals: true,
      vision: true,
      camera_motion: true,
      camera_continuous: true,
      camera_face: true,
      camera_brightness: true,
      haptics: true,
      deviceInfo: true,
      mediaControl: true,
      shareExperience: true,
    });

    return Object.freeze({
      version: BRIDGE_VERSION,
      bridgeVersion: BRIDGE_VERSION,
      capabilities,
      request,
      receive,
      on,
      dispose,
      hasTransport: function hasTransport() {
        return Boolean(currentTransport());
      },
      notifyRuntimeEvent,
      getDeviceInfo: function getDeviceInfo() {
        return request("deviceInfo");
      },
      requestCapability: function requestCapability(name) {
        return request("requestCapability", { name }, { timeoutMs: PERMISSION_TIMEOUT_MS });
      },
      startMotion: function startMotion() {
        return request("startMotion");
      },
      stopMotion: function stopMotion() {
        return request("stopMotion");
      },
      startMicrophoneLevel: function startMicrophoneLevel(configValue) {
        return request(
          "startMicrophoneLevel",
          isRecord(configValue) ? configValue : {},
        );
      },
      stopMicrophoneLevel: function stopMicrophoneLevel() {
        return request("stopMicrophoneLevel");
      },
      startCameraSignals: function startCameraSignals(configValue) {
        return request("startCameraSignals", isRecord(configValue) ? configValue : {});
      },
      stopCameraSignals: function stopCameraSignals() {
        return request("stopCameraSignals");
      },
      startVision: function startVision(configValue) {
        return request("startVision", isRecord(configValue) ? configValue : {});
      },
      stopVision: function stopVision() {
        return request("stopVision");
      },
      vibrate: function vibrate(style) {
        return request("haptic", { style: style || "light" });
      },
      setMediaPlayback: function setMediaPlayback(state) {
        return request("mediaControl", isRecord(state) ? state : {});
      },
      shareExperience: function shareExperience() {
        return request("shareExperience");
      },
      __pendingCount: function pendingCount() {
        return pending.size;
      },
      [CLIENT_MARKER]: true,
    });
  }

  function installRuntimeEventForwarder(host, client) {
    if (!host || typeof host.addEventListener !== "function") return;
    if (host.__pixoRuntimeEventForwarderInstalled) return;
    host.__pixoRuntimeEventForwarderInstalled = true;
    host.addEventListener("pixo:runtime-event", function forwardRuntimeEvent(event) {
      client.notifyRuntimeEvent(event && event.detail ? event.detail : {});
    });
  }

  function installGlobal(globalObject, options) {
    const host = globalObject || (
      typeof globalThis !== "undefined" ? globalThis : {}
    );
    if (host.PixoNative && host.PixoNative[CLIENT_MARKER]) {
      if (!host.MotionCueNative) host.MotionCueNative = host.PixoNative;
      installRuntimeEventForwarder(host, host.PixoNative);
      return host.PixoNative;
    }
    // Do not replace a bridge installed by an older production shell. Alias it so callers can
    // migrate names independently from native releases.
    if (!host.PixoNative && host.MotionCueNative && !host.MotionCueNative[CLIENT_MARKER]) {
      host.PixoNative = host.MotionCueNative;
      return host.PixoNative;
    }
    if (host.PixoNative && !host.PixoNative[CLIENT_MARKER]) {
      if (!host.MotionCueNative) host.MotionCueNative = host.PixoNative;
      return host.PixoNative;
    }

    const client = createNativeClient({
      ...(options || {}),
      globalObject: host,
    });
    host.PixoNative = client;
    host.MotionCueNative = client;
    host.__pixoNativeReceive = function receiveNativeEnvelope(envelope) {
      return client.receive(envelope);
    };
    host.__motionCueNativeResolve = function resolveLegacyRequest(id, ok, payload) {
      return client.receive({
        v: BRIDGE_VERSION,
        kind: "response",
        id: String(id),
        ok: ok !== false,
        ...(ok === false ? { error: payload } : { result: payload }),
      });
    };
    host.__motionCueNativeEmit = function emitLegacyEvent(name, detail) {
      return client.receive({
        v: BRIDGE_VERSION,
        kind: "event",
        name,
        data: detail || {},
      });
    };
    installRuntimeEventForwarder(host, client);
    return client;
  }

  return Object.freeze({
    BRIDGE_VERSION,
    DEFAULT_TIMEOUT_MS,
    PERMISSION_TIMEOUT_MS,
    detectTransport,
    createNativeClient,
    installGlobal,
  });
});
