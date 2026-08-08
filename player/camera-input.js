const DEFAULT_SAMPLE_INTERVAL_MS = 100;
const DEFAULT_SAMPLE_WIDTH = 48;

export function createCameraInput({
  videoElement,
  onFrame,
  onUnavailable,
  sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  sampleWidth = DEFAULT_SAMPLE_WIDTH,
  mediaDevices = navigator.mediaDevices,
} = {}) {
  if (!videoElement) throw new TypeError('videoElement is required');
  if (typeof onFrame !== 'function') throw new TypeError('onFrame must be a function');
  if (typeof onUnavailable !== 'function') throw new TypeError('onUnavailable must be a function');

  let stream = null;
  let timer = null;
  let stopped = false;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  function sample() {
    if (stopped || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) return;
    const width = sampleWidth;
    const height = Math.max(1, Math.round(
      (videoElement.videoHeight / videoElement.videoWidth) * width,
    ));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.drawImage(videoElement, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    const luma = new Uint8ClampedArray(width * height);
    for (let index = 0; index < luma.length; index += 1) {
      const offset = index * 4;
      luma[index] = (data[offset] * 299 + data[offset + 1] * 587 + data[offset + 2] * 114) / 1000;
    }
    onFrame({ samples: luma, atMs: performance.now() });
  }

  async function start() {
    if (stopped) return;
    if (!mediaDevices?.getUserMedia) {
      onUnavailable('unsupported');
      return;
    }
    try {
      stream = await mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 } },
        audio: false,
      });
    } catch {
      onUnavailable('denied');
      return;
    }
    if (stopped) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
      return;
    }
    videoElement.srcObject = stream;
    try {
      await videoElement.play();
    } catch {
      onUnavailable('playback');
      stop();
      return;
    }
    timer = setInterval(sample, sampleIntervalMs);
  }

  function stop() {
    stopped = true;
    clearInterval(timer);
    timer = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    videoElement.srcObject = null;
  }

  return Object.freeze({ start, stop });
}
