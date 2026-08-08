const SENSOR_SILENCE_TIMEOUT_MS = 1500;

function listenOrTimeout({ eventName, onReading, onUnavailable, map }) {
  let sawReading = false;
  let stopped = false;
  const handler = (event) => {
    const reading = map(event);
    if (reading === null) return;
    sawReading = true;
    onReading({ ...reading, atMs: performance.now() });
  };
  window.addEventListener(eventName, handler);
  const silenceTimer = setTimeout(() => {
    if (!sawReading && !stopped) onUnavailable('no-sensor');
  }, SENSOR_SILENCE_TIMEOUT_MS);
  return () => {
    stopped = true;
    clearTimeout(silenceTimer);
    window.removeEventListener(eventName, handler);
  };
}

async function requestMotionPermission(permissionApi) {
  if (typeof permissionApi?.requestPermission !== 'function') return 'granted';
  try {
    return await permissionApi.requestPermission();
  } catch {
    return 'denied';
  }
}

export function createTiltInput({ onReading, onUnavailable } = {}) {
  if (typeof onReading !== 'function') throw new TypeError('onReading must be a function');
  if (typeof onUnavailable !== 'function') throw new TypeError('onUnavailable must be a function');
  let cleanup = null;
  return Object.freeze({
    // iOS requires this to run inside a user-gesture handler.
    needsPermissionGesture: typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function',
    async start() {
      if (typeof DeviceOrientationEvent === 'undefined') {
        onUnavailable('unsupported');
        return;
      }
      if (await requestMotionPermission(DeviceOrientationEvent) !== 'granted') {
        onUnavailable('denied');
        return;
      }
      cleanup = listenOrTimeout({
        eventName: 'deviceorientation',
        onReading,
        onUnavailable,
        map: (event) => (Number.isFinite(event.gamma)
          ? {
            gammaDegrees: event.gamma,
            ...(Number.isFinite(event.alpha) ? { alphaDegrees: event.alpha } : {}),
          }
          : null),
      });
    },
    stop() {
      cleanup?.();
      cleanup = null;
    },
  });
}

export function createShakeInput({ onReading, onUnavailable } = {}) {
  if (typeof onReading !== 'function') throw new TypeError('onReading must be a function');
  if (typeof onUnavailable !== 'function') throw new TypeError('onUnavailable must be a function');
  let cleanup = null;
  return Object.freeze({
    needsPermissionGesture: typeof DeviceMotionEvent !== 'undefined'
      && typeof DeviceMotionEvent.requestPermission === 'function',
    async start() {
      if (typeof DeviceMotionEvent === 'undefined') {
        onUnavailable('unsupported');
        return;
      }
      if (await requestMotionPermission(DeviceMotionEvent) !== 'granted') {
        onUnavailable('denied');
        return;
      }
      cleanup = listenOrTimeout({
        eventName: 'devicemotion',
        onReading,
        onUnavailable,
        map: (event) => {
          const acceleration = event.acceleration ?? event.accelerationIncludingGravity;
          if (!acceleration) return null;
          const { x, y, z } = acceleration;
          if (![x, y, z].every(Number.isFinite)) return null;
          return { magnitude: Math.hypot(x, y, z) };
        },
      });
    },
    stop() {
      cleanup?.();
      cleanup = null;
    },
  });
}

export function createMicInput({
  onReading,
  onUnavailable,
  sampleIntervalMs = 100,
  mediaDevices = navigator.mediaDevices,
} = {}) {
  if (typeof onReading !== 'function') throw new TypeError('onReading must be a function');
  if (typeof onUnavailable !== 'function') throw new TypeError('onUnavailable must be a function');
  let stream = null;
  let audioContext = null;
  let timer = null;
  let stopped = false;
  return Object.freeze({
    needsPermissionGesture: false,
    async start() {
      if (stopped) return;
      if (!mediaDevices?.getUserMedia) {
        onUnavailable('unsupported');
        return;
      }
      try {
        stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        onUnavailable('denied');
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
        return;
      }
      audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const spectrum = new Uint8Array(analyser.frequencyBinCount);
      // 吹气是低频为主的宽带噪声:低频段能量占比是与说话/环境声区分的主特征。
      const binHz = audioContext.sampleRate / analyser.fftSize;
      const lowBins = Math.max(1, Math.round(600 / binHz));
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let index = 0; index < samples.length; index += 1) {
          sum += samples[index] * samples[index];
        }
        analyser.getByteFrequencyData(spectrum);
        let lowEnergy = 0;
        let totalEnergy = 0;
        for (let index = 0; index < spectrum.length; index += 1) {
          totalEnergy += spectrum[index];
          if (index < lowBins) lowEnergy += spectrum[index];
        }
        onReading({
          level: Math.sqrt(sum / samples.length),
          lowRatio: totalEnergy > 0 ? lowEnergy / totalEnergy : 0,
          atMs: performance.now(),
        });
      }, sampleIntervalMs);
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      timer = null;
      void audioContext?.close();
      audioContext = null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
    },
  });
}

/**
 * Desktop walkthrough aid (?sim=1): maps keys onto synthetic sensor readings so
 * every capability can be exercised without real hardware.
 * Arrow left/right = tilt, S = shake pulse, M (hold) = mic level, C (hold) = camera motion.
 */
export function createKeyboardSimulator({ onReading } = {}) {
  if (typeof onReading !== 'function') throw new TypeError('onReading must be a function');
  const held = new Set();
  let timer = null;
  const emitHeld = () => {
    const atMs = performance.now();
    if (held.has('ArrowLeft')) onReading({ signal: 'motion.tilt', gammaDegrees: -30, atMs });
    if (held.has('ArrowRight')) onReading({ signal: 'motion.tilt', gammaDegrees: 30, atMs });
    if (held.has('KeyM')) onReading({ signal: 'microphone.level', level: 0.5, atMs });
    if (held.has('KeyC')) onReading({ signal: 'camera.motion', energy: 0.2, atMs });
  };
  const onKeyDown = (event) => {
    if (event.code === 'KeyS') {
      onReading({ signal: 'motion.shake', magnitude: 25, atMs: performance.now() });
      return;
    }
    held.add(event.code);
  };
  const onKeyUp = (event) => held.delete(event.code);
  return Object.freeze({
    start() {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      timer = setInterval(emitHeld, 100);
    },
    stop() {
      clearInterval(timer);
      timer = null;
      held.clear();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    },
  });
}
