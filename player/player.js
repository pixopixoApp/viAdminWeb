import { createCameraInput } from './camera-input.js';
import {
  createKeyboardSimulator,
  createMicInput,
  createShakeInput,
  createTiltInput,
} from './sensor-input.js';
import {
  classifyPointerGesture,
  createCameraMotionDetector,
  createMicBlowDetector,
  createMicClapDetector,
  createMicLevelDetector,
  createMicQuietDetector,
  createCircleJudge,
  createEraseTracker,
  createHoldChargeJudge,
  createPinchJudge,
  createRapidTapJudge,
  createRotateDetector,
  createScrubController,
  createStillDetector,
  createSequenceJudge,
  createShakeDetector,
  createTiltDetector,
  createTiltPanController,
  describeCue,
  evaluatePointerInput,
  frameMotionEnergy,
  panOffsetPx,
  validatePlayableTimeline,
} from './player-core.js';

const video = document.querySelector('#video');
const stage = document.querySelector('#stage');
const surface = document.querySelector('#surface');
const feedbackLayer = document.querySelector('#feedback');
const gate = document.querySelector('#gate');
const cueIndex = document.querySelector('#cue-index');
const cueTitle = document.querySelector('#cue-title');
const cueDetail = document.querySelector('#cue-detail');
const continueButton = document.querySelector('#continue');
const startOverlay = document.querySelector('#start-overlay');
const endOverlay = document.querySelector('#end-overlay');
const replayButton = document.querySelector('#replay');
const capabilityDock = document.querySelector('#capability-dock');
const capabilityLabel = document.querySelector('#capability-label');
const cameraVideo = document.querySelector('#camera-video');
const enableSensorButton = document.querySelector('#enable-sensor');
const railFill = document.querySelector('#rail-fill');
const railMarkers = document.querySelector('#rail-markers');
const progress = document.querySelector('#progress');
const meta = document.querySelector('#meta');

const ESCALATE_EXTRA_MS = 4000;
const SWIPE_ROTATION = { right: '0deg', down: '90deg', left: '180deg', up: '-90deg' };

let timeline;
let nextIndex = 0;
let active = null;
let fallbackTimer = null;
let escalateTimer = null;
let pointerStart = null;
let previousTapAt = null;
let rapidTapJudge = null;
let eraseTracker = null;
let erasingPointerId = null;
let holdChargeJudge = null;
let holdChargeTimer = null;
let holdChargePointerId = null;
let pinchJudge = null;
const pinchPointers = new Map();
let circleJudge = null;
let circlePointerId = null;
let degradedHold = false;
const fog = document.querySelector('#fog');
const regionGlow = document.querySelector('#region-glow');

// 区域引导只给"动作发生在屏幕上"的手势;设备/麦克风/摄像头手势显示框
// 只会误导用户去戳屏幕。它们的 region 仅用作成功反馈的锚点。
const REGION_GLOW_SIGNALS = new Set([
  'pointer.tap', 'pointer.double_tap', 'pointer.hold', 'pointer.rapid_tap',
  'pointer.hold_charge', 'pointer.swipe', 'pointer.drag', 'pointer.scrub',
  'pointer.pinch', 'pointer.draw_circle',
]);

// 视频在 stage 内 contain 显示;region 分数坐标相对视频画面,需换算黑边。
function videoContentRect() {
  if (!video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(
    video.clientWidth / video.videoWidth,
    video.clientHeight / video.videoHeight,
  );
  const w = video.videoWidth * scale;
  const h = video.videoHeight * scale;
  return {
    x: video.offsetLeft + (video.clientWidth - w) / 2,
    y: video.offsetTop + (video.clientHeight - h) / 2,
    w,
    h,
  };
}

function regionCenter(interaction) {
  const content = videoContentRect();
  if (!content || !interaction?.region) return null;
  const region = interaction.region;
  return {
    x: content.x + (region.x + region.w / 2) * content.w,
    y: content.y + (region.y + region.h / 2) * content.h,
  };
}

function showRegionGlow(interaction) {
  const content = videoContentRect();
  if (!content || !interaction.region || !REGION_GLOW_SIGNALS.has(interaction.primary.signal)) {
    return;
  }
  const region = interaction.region;
  // 光晕比框本身大一圈,且不小于 96px 的触控下限
  const w = Math.max(region.w * content.w * 1.7, 96);
  const h = Math.max(region.h * content.h * 1.7, 96);
  regionGlow.style.width = `${w}px`;
  regionGlow.style.height = `${h}px`;
  regionGlow.style.left = `${content.x + (region.x + region.w / 2) * content.w - w / 2}px`;
  regionGlow.style.top = `${content.y + (region.y + region.h / 2) * content.h - h / 2}px`;
  regionGlow.classList.remove('spotlight');
  regionGlow.hidden = false;
}
const fogContext = fog.getContext('2d');

function showFog(region = null) {
  const rect = stage.getBoundingClientRect();
  fog.width = Math.round(rect.width);
  fog.height = Math.round(rect.height);
  fogContext.globalCompositeOperation = 'source-over';
  fogContext.fillStyle = 'rgba(220, 226, 214, 0.88)';
  const content = videoContentRect();
  if (region && content) {
    // 只雾目标区域:稍外扩 + 模糊边缘,不显生硬
    const pad = 14;
    fogContext.filter = 'blur(10px)';
    fogContext.fillRect(
      content.x + region.x * content.w - pad,
      content.y + region.y * content.h - pad,
      region.w * content.w + pad * 2,
      region.h * content.h + pad * 2,
    );
    fogContext.filter = 'none';
  } else {
    fogContext.fillRect(0, 0, fog.width, fog.height);
  }
  fog.classList.remove('clearing');
  fog.hidden = false;
}

function eraseFogAt(x, y) {
  fogContext.globalCompositeOperation = 'destination-out';
  fogContext.beginPath();
  fogContext.arc(x, y, Math.max(28, fog.width * 0.045), 0, Math.PI * 2);
  fogContext.fill();
}

function hideFog() {
  if (fog.hidden) return;
  fog.classList.add('clearing');
  setTimeout(() => { fog.hidden = true; }, 420);
}
let frameCallbackId = null;
let railFrameId = null;
let markers = [];
let capability = null;
let scrubController = null;
let scrubbingPointerId = null;
let panController = null;
let panSensorStarted = false;
let panHintDone = false;
let panHintTimer = null;
let sequenceRuntimes = [];
let liveSequence = null;
let seqTapDown = null;

const seqChip = document.querySelector('#seq-chip');
const beatField = document.querySelector('#beat-field');
const comboEl = document.querySelector('#combo');

const SEQ_LEAD_MS = 1200;
const RING_MAX_SCALE = 2.6;
const TAP_TOLERANCE_PX = 110;

// Deterministic scatter: quadrant rotation + a hash jitter from the beat
// time. No randomness — the same run always lays out the same field.
const SCATTER_ANCHORS = [[32, 36], [68, 46], [38, 62], [64, 30]];
function beatPosition(beat, index) {
  const [ax, ay] = SCATTER_ANCHORS[index % SCATTER_ANCHORS.length];
  const jx = ((beat.at_ms * 0.618034) % 1) * 16 - 8;
  const jy = ((beat.at_ms * 0.381966 + 0.25) % 1) * 14 - 7;
  return { xPct: ax + jx, yPct: ay + jy };
}

function buildSequenceRuntimes() {
  beatField.replaceChildren();
  sequenceRuntimes = (timeline.sequences ?? []).map((sequence) => ({
    def: sequence,
    judge: createSequenceJudge({
      beats: sequence.beats,
      perfectMs: sequence.judge.perfect_ms,
      goodMs: sequence.judge.good_ms,
    }),
    state: 'idle',
    start_ms: sequence.beats[0].at_ms - SEQ_LEAD_MS,
    end_ms: sequence.beats[sequence.beats.length - 1].at_ms + sequence.judge.good_ms + 400,
    positions: sequence.beats.map(beatPosition),
    circles: new Map(),
    combo: 0,
  }));
  liveSequence = null;
}

function beatPoint(runtime, index) {
  const rect = stage.getBoundingClientRect();
  const position = runtime.positions[index];
  return { x: (position.xPct / 100) * rect.width, y: (position.yPct / 100) * rect.height };
}

function renderCombo(runtime) {
  comboEl.hidden = runtime.combo < 2;
  comboEl.textContent = `x${runtime.combo}`;
}

function judgeFeedback(runtime, beatIndex, verdict, popPoint) {
  if (beatIndex !== null) {
    const circle = runtime.circles.get(beatIndex);
    if (circle) {
      if (verdict === 'miss') {
        circle.classList.add('circle-missed');
        setTimeout(() => circle.remove(), 260);
      } else {
        circle.classList.add('circle-hit');
        setTimeout(() => circle.remove(), 220);
      }
      runtime.circles.delete(beatIndex);
    }
  }
  if (verdict === 'miss') runtime.combo = 0;
  else runtime.combo += 1;
  renderCombo(runtime);
  verdictPop(verdict, popPoint);
}

// osu-style scattered circles: each beat owns a circle at its own spot;
// the approach ring scale is a pure function of media time, so pause,
// seek, and replay stay perfectly in sync with the beats.
function updateBeatField(runtime, mediaMs) {
  const { beats } = runtime.def;
  const goodMs = runtime.def.judge.good_ms;
  for (const [index, beat] of beats.entries()) {
    const remaining = beat.at_ms - mediaMs;
    const visible = remaining <= SEQ_LEAD_MS && mediaMs <= beat.at_ms + goodMs;
    let circle = runtime.circles.get(index);
    if (visible && !circle) {
      circle = document.createElement('div');
      circle.className = 'hit-circle';
      circle.innerHTML = '<span class="hit-core"></span><span class="approach-ring"></span>';
      const position = runtime.positions[index];
      circle.style.left = `${position.xPct}%`;
      circle.style.top = `${position.yPct}%`;
      beatField.append(circle);
      runtime.circles.set(index, circle);
    }
    if (circle && visible) {
      const scale = 1 + (RING_MAX_SCALE - 1) * Math.max(0, remaining) / SEQ_LEAD_MS;
      const ring = circle.querySelector('.approach-ring');
      ring.style.transform = `scale(${scale.toFixed(3)})`;
      ring.style.opacity = String(Math.min(1, 0.35 + 0.65 * (1 - Math.max(0, remaining) / SEQ_LEAD_MS)));
      circle.classList.toggle('window', Math.abs(remaining) <= goodMs);
    }
  }
}

function verdictPop(verdict, point) {
  const node = document.createElement('span');
  node.className = 'verdict-pop';
  node.dataset.v = verdict;
  node.textContent = verdict.toUpperCase();
  node.style.left = `${point.x}px`;
  node.style.top = `${point.y}px`;
  feedbackLayer.append(node);
  node.addEventListener('animationend', () => node.remove());
}

function updateSequences() {
  if (sequenceRuntimes.length === 0) return;
  const mediaMs = video.currentTime * 1000;
  for (const runtime of sequenceRuntimes) {
    if (runtime.state === 'idle' && mediaMs >= runtime.start_ms && mediaMs < runtime.end_ms) {
      runtime.state = 'live';
      liveSequence = runtime;
      dismissPanHint();
      seqChip.textContent = `${runtime.def.cue} × ${runtime.def.beats.length}`;
      seqChip.hidden = false;
      beatField.hidden = false;
      if (!active) surface.classList.add('active');
      // Count-in: rhythm needs anticipation. If the first beat is closer
      // than the approach lead (e.g. a sequence right at video start),
      // hold the video briefly so the first ring gets a full descent.
      if (!runtime.countedIn && runtime.def.beats[0].at_ms - mediaMs < SEQ_LEAD_MS) {
        runtime.countedIn = true;
        seqChip.textContent = `准备 · ${runtime.def.cue} × ${runtime.def.beats.length}`;
        video.pause();
        setTimeout(() => {
          seqChip.textContent = `${runtime.def.cue} × ${runtime.def.beats.length}`;
          void video.play();
        }, 1100);
      }
    }
    if (runtime.state !== 'live') continue;
    for (const missedIndex of runtime.judge.tick(mediaMs)) {
      judgeFeedback(runtime, missedIndex, 'miss', beatPoint(runtime, missedIndex));
    }
    updateBeatField(runtime, mediaMs);
    const summary = runtime.judge.summary();
    if (summary.done || mediaMs >= runtime.end_ms) {
      runtime.state = 'done';
      liveSequence = null;
      beatField.hidden = true;
      comboEl.hidden = true;
      beatField.replaceChildren();
      if (!active) surface.classList.remove('active');
      seqChip.textContent = `PERFECT ${summary.perfect} · GOOD ${summary.good} · MISS ${summary.miss + (summary.total - summary.judged)}`;
      setTimeout(() => { seqChip.hidden = true; }, 2500);
    }
  }
}

const panHint = document.querySelector('#pan-hint');

function showPanHint() {
  if (!panController || panHintDone) return;
  panHintDone = true;
  panHint.hidden = false;
  panHintTimer = setTimeout(() => { panHint.hidden = true; }, 3500);
}

function dismissPanHint() {
  if (panHint.hidden) return;
  clearTimeout(panHintTimer);
  panHint.hidden = true;
}

let lastPanOffset = null;

function panLoop() {
  if (!panController) return;
  const offset = panOffsetPx({
    tilt: panController.step(),
    viewportWidth: stage.clientWidth,
    videoWidth: video.clientWidth,
    subjectAnchor: timeline.viewport.subject_anchor,
  }).toFixed(2);
  if (offset !== lastPanOffset) {
    lastPanOffset = offset;
    video.style.transform = `translate3d(${offset}px, 0, 0)`;
  }
  requestAnimationFrame(panLoop);
}

function startPanSensor() {
  if (!panController || panSensorStarted) return;
  panSensorStarted = true;
  const input = createTiltInput({
    onReading: ({ gammaDegrees }) => {
      const tilt = panController.updateFromGamma(gammaDegrees);
      if (Math.abs(tilt) > 0.2) dismissPanHint();
    },
    onUnavailable: () => {}, // pointer drag remains as the pan fallback
  });
  void input.start();
}

function panPointerTarget(event) {
  const rect = stage.getBoundingClientRect();
  panController.setTarget(((event.clientX - rect.left) - rect.width / 2) / (rect.width / 2));
}

let panDown = null;
let panEngaged = false;

stage.addEventListener('pointerdown', (event) => {
  if (!panController || active) return;
  panDown = { id: event.pointerId, x: event.clientX };
  panEngaged = false;
});

stage.addEventListener('pointermove', (event) => {
  if (!panController || !panDown || panDown.id !== event.pointerId) return;
  if (!panEngaged && Math.abs(event.clientX - panDown.x) < 6) return;
  panEngaged = true;
  dismissPanHint();
  panPointerTarget(event);
});

for (const eventName of ['pointerup', 'pointercancel']) {
  stage.addEventListener(eventName, (event) => {
    if (!panDown || panDown.id !== event.pointerId) return;
    if (panEngaged && panController) panController.setTarget(0);
    panDown = null;
    panEngaged = false;
  });
}

function stopCapability() {
  capability?.stop();
  capability = null;
  scrubController = null;
  scrubbingPointerId = null;
  capabilityDock.hidden = true;
  cameraVideo.hidden = true;
  capabilityLabel.hidden = true;
  enableSensorButton.hidden = true;
  capabilityDock.style.setProperty('--progress', '0');
}

function showDock({ video = false, label = null } = {}) {
  capabilityDock.hidden = false;
  cameraVideo.hidden = !video;
  capabilityLabel.hidden = label === null;
  if (label !== null) capabilityLabel.textContent = label;
}

function dockCenter() {
  const dock = capabilityDock.getBoundingClientRect();
  const rect = stage.getBoundingClientRect();
  return {
    x: dock.left - rect.left + dock.width / 2,
    y: dock.top - rect.top + dock.height / 2,
  };
}

// 权限被拒或无硬件:玩法就地降级为"按住画面"替代触发(playbook 的
// 必须降级原则)。超时出现的继续按钮仍然是最终兜底。
function degradeCapability(interaction, hint) {
  if (active !== interaction) return;
  stopCapability();
  degradedHold = true;
  cueTitle.textContent = '按住画面继续';
  cueDetail.textContent = hint;
  cueDetail.hidden = false;
}

function applyDetector(interaction, status) {
  if (active !== interaction) return;
  capabilityDock.style.setProperty('--progress', status.progress.toFixed(3));
  if (status.satisfied) resolveActive(regionCenter(interaction) ?? dockCenter());
}

const CAPABILITIES = {
  'camera.motion': (interaction) => {
    const detector = createCameraMotionDetector();
    let previousFrame = null;
    const feed = ({ samples, energy, atMs }) => {
      let value = energy;
      if (value === undefined) {
        if (previousFrame === null) {
          previousFrame = samples;
          return;
        }
        value = frameMotionEnergy(previousFrame, samples);
        previousFrame = samples;
      }
      applyDetector(interaction, detector.update({ energy: value, atMs }));
    };
    const input = createCameraInput({
      videoElement: cameraVideo,
      onFrame: feed,
      onUnavailable: () => degradeCapability(interaction, '摄像头不可用'),
    });
    showDock({ video: true });
    return { input, feed, needsGesture: false };
  },
  'motion.tilt': (interaction) => {
    const detector = createTiltDetector({ direction: interaction.primary.direction });
    const feed = ({ gammaDegrees, atMs }) => applyDetector(
      interaction,
      detector.update({ gammaDegrees, atMs }),
    );
    const input = createTiltInput({
      onReading: feed,
      onUnavailable: () => degradeCapability(interaction, '此设备不支持倾斜感应'),
    });
    showDock({ label: interaction.primary.direction === 'left' ? '左倾' : '右倾' });
    return { input, feed, needsGesture: input.needsPermissionGesture };
  },
  'motion.shake': (interaction) => {
    const detector = createShakeDetector();
    const feed = ({ magnitude, atMs }) => applyDetector(
      interaction,
      detector.update({ magnitude, atMs }),
    );
    const input = createShakeInput({
      onReading: feed,
      onUnavailable: () => degradeCapability(interaction, '此设备不支持摇动感应'),
    });
    showDock({ label: '摇动' });
    return { input, feed, needsGesture: input.needsPermissionGesture };
  },
  'motion.still': (interaction) => {
    const detector = createStillDetector();
    const feed = ({ magnitude, atMs }) => applyDetector(
      interaction,
      detector.update({ magnitude, atMs }),
    );
    const input = createShakeInput({
      onReading: feed,
      onUnavailable: () => degradeCapability(interaction, '此设备不支持运动感应'),
    });
    showDock({ label: '端稳' });
    return { input, feed, needsGesture: input.needsPermissionGesture };
  },
  'motion.rotate': (interaction) => {
    const detector = createRotateDetector();
    const feed = ({ alphaDegrees, atMs }) => applyDetector(
      interaction,
      detector.update({ alphaDegrees, atMs }),
    );
    const input = createTiltInput({
      onReading: feed,
      onUnavailable: () => degradeCapability(interaction, '此设备不支持方向感应'),
    });
    showDock({ label: '转动' });
    return { input, feed, needsGesture: input.needsPermissionGesture };
  },
  'microphone.level': (interaction) => {
    const detector = createMicLevelDetector();
    const feed = ({ level, atMs }) => applyDetector(
      interaction,
      detector.update({ level, atMs }),
    );
    const input = createMicInput({
      onReading: feed,
      onUnavailable: () => degradeCapability(interaction, '麦克风不可用'),
    });
    showDock({ label: '出声' });
    return { input, feed, needsGesture: false };
  },
  'microphone.blow': (interaction) => {
    const detector = createMicBlowDetector();
    const feed = ({ level, lowRatio, atMs }) => applyDetector(
      interaction,
      detector.update({ level, lowRatio, atMs }),
    );
    const input = createMicInput({
      onReading: feed,
      onUnavailable: () => degradeCapability(interaction, '麦克风不可用'),
    });
    showDock({ label: '吹气' });
    return { input, feed, needsGesture: false };
  },
  'microphone.clap': (interaction) => {
    const detector = createMicClapDetector();
    const feed = ({ level, atMs }) => applyDetector(
      interaction,
      detector.update({ level, atMs }),
    );
    const input = createMicInput({
      onReading: feed,
      onUnavailable: () => degradeCapability(interaction, '麦克风不可用'),
    });
    showDock({ label: '拍手' });
    return { input, feed, needsGesture: false };
  },
  'microphone.quiet': (interaction) => {
    const detector = createMicQuietDetector();
    const feed = ({ level, atMs }) => applyDetector(
      interaction,
      detector.update({ level, atMs }),
    );
    const input = createMicInput({
      onReading: feed,
      onUnavailable: () => degradeCapability(interaction, '麦克风不可用'),
    });
    showDock({ label: '安静' });
    return { input, feed, needsGesture: false };
  },
  'pointer.scrub': (interaction) => {
    // 拖动行程按屏幕自适应:走完整个窗口需要拖过 stage 对应轴长的 ~70%,
    // 大屏不再一小下就冲到头;进度棘轮式保留,分段拖同样有效。
    const stageRect = stage.getBoundingClientRect();
    const horizontal = interaction.primary.direction === 'left'
      || interaction.primary.direction === 'right';
    scrubController = createScrubController({
      direction: interaction.primary.direction,
      startMs: interaction.gate_at_ms,
      endMs: interaction.reaction_end_ms,
      rangePx: Math.max(320, (horizontal ? stageRect.width : stageRect.height) * 0.7),
    });
    showDock({ label: '拖动' });
    return {
      input: { start() {}, stop() { scrubController = null; } },
      feed: null,
      needsGesture: false,
    };
  },
};

function startCapability(interaction) {
  const build = CAPABILITIES[interaction.primary.signal];
  if (!build) return;
  const built = build(interaction);
  capability = {
    signal: interaction.primary.signal,
    feed: built.feed,
    stop: () => built.input.stop(),
  };
  if (built.needsGesture) enableSensorButton.hidden = false;
  else void built.input.start();
  capability.start = () => built.input.start();
}

enableSensorButton.addEventListener('click', () => {
  enableSensorButton.hidden = true;
  void capability?.start?.();
});

function resetGate() {
  stopCapability();
  clearTimeout(fallbackTimer);
  clearTimeout(escalateTimer);
  fallbackTimer = null;
  escalateTimer = null;
  active = null;
  pointerStart = null;
  previousTapAt = null;
  rapidTapJudge = null;
  eraseTracker = null;
  erasingPointerId = null;
  holdChargeJudge = null;
  holdChargePointerId = null;
  clearInterval(holdChargeTimer);
  holdChargeTimer = null;
  pinchJudge = null;
  pinchPointers.clear();
  circleJudge = null;
  circlePointerId = null;
  degradedHold = false;
  regionGlow.hidden = true;
  regionGlow.classList.remove('spotlight');
  hideFog();
  gate.hidden = true;
  gate.classList.remove('nudge');
  continueButton.hidden = true;
  continueButton.dataset.state = 'normal';
  surface.classList.remove('active');
}

function renderProgress() {
  progress.textContent = `${nextIndex} / ${timeline.interactions.length}`;
  markers.forEach((marker, index) => {
    marker.dataset.state = index < nextIndex ? 'done' : (active && index === nextIndex ? 'active' : 'todo');
  });
}

function renderRail() {
  const durationMs = timeline?.media?.duration_ms;
  if (!durationMs) return;
  const ratio = Math.min(1, (video.currentTime * 1000) / durationMs);
  railFill.style.width = `${(ratio * 100).toFixed(3)}%`;
}

function trackRail() {
  renderRail();
  updateSequences();
  if (!video.paused && !video.ended) railFrameId = requestAnimationFrame(trackRail);
}

function spawnFeedback(interaction, point) {
  const signal = interaction.primary.signal;
  const node = document.createElement('span');
  if (signal === 'pointer.swipe' || signal === 'pointer.drag' || signal === 'pointer.scrub') {
    node.className = 'feedback-swipe';
    node.style.setProperty('--swipe-rotation', SWIPE_ROTATION[interaction.primary.direction] ?? '0deg');
  } else if (signal === 'pointer.hold') {
    node.className = 'feedback-hold';
  } else {
    node.className = 'feedback-tap';
  }
  node.style.left = `${point.x}px`;
  node.style.top = `${point.y}px`;
  feedbackLayer.append(node);
  node.addEventListener('animationend', () => node.remove());
}

function rejectFeedback() {
  gate.classList.remove('nudge');
  void gate.offsetWidth;
  gate.classList.add('nudge');
}

function resolveActive(point = null) {
  if (!active) return;
  if (point) spawnFeedback(active, point);
  nextIndex += 1;
  resetGate();
  renderProgress();
  void video.play();
}

function expose(interaction) {
  if (active) return;
  active = interaction;
  dismissPanHint();
  video.pause();
  const gateSeconds = interaction.gate_at_ms / 1000;
  if (Math.abs(video.currentTime - gateSeconds) > 0.01) video.currentTime = gateSeconds;
  const cueContent = describeCue(interaction, nextIndex + 1);
  cueIndex.textContent = cueContent.index;
  cueTitle.textContent = cueContent.title;
  cueDetail.textContent = cueContent.detail;
  cueDetail.hidden = cueContent.detail === '';
  if (interaction.primary.signal === 'pointer.rapid_tap') {
    rapidTapJudge = createRapidTapJudge();
    const start = rapidTapJudge.progress(performance.now());
    cueDetail.textContent = `0 / ${start.needed}`;
    cueDetail.hidden = false;
  }
  if (interaction.primary.signal === 'pointer.erase') {
    eraseTracker = createEraseTracker({ region: interaction.region ?? null });
    showFog(interaction.region ?? null);
    cueDetail.textContent = '0%';
    cueDetail.hidden = false;
  }
  showRegionGlow(interaction);
  if (interaction.primary.signal === 'pointer.hold_charge') {
    holdChargeJudge = createHoldChargeJudge();
    cueDetail.textContent = '0%';
    cueDetail.hidden = false;
  }
  if (interaction.primary.signal === 'pointer.pinch') {
    pinchJudge = createPinchJudge();
  }
  if (interaction.primary.signal === 'pointer.draw_circle') {
    circleJudge = createCircleJudge();
  }
  surface.setAttribute('aria-label', cueContent.title);
  gate.hidden = false;
  surface.classList.add('active');
  renderProgress();
  // The fallback timer is armed before the capability starts, so a capability
  // that fails to construct can never leave the gate without an unlock path.
  const afterMs = interaction.fallback?.after_ms;
  if (Number.isSafeInteger(afterMs) && afterMs > 0) {
    fallbackTimer = setTimeout(() => {
      if (active !== interaction) return;
      continueButton.hidden = false;
      continueButton.dataset.state = 'normal';
      escalateTimer = setTimeout(() => {
        if (active !== interaction) return;
        continueButton.dataset.state = 'escalated';
        if (!regionGlow.hidden) regionGlow.classList.add('spotlight');
      }, ESCALATE_EXTRA_MS);
    }, afterMs);
  }
  try {
    startCapability(interaction);
  } catch {
    degradeCapability(interaction, '互动能力初始化失败');
  }
}

function stagePoint(event) {
  const rect = stage.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

surface.addEventListener('pointerdown', (event) => {
  if (!active && liveSequence) {
    seqTapDown = { id: event.pointerId, x: event.clientX, y: event.clientY };
    surface.setPointerCapture(event.pointerId);
    return;
  }
  if (!active) return;
  if (holdChargeJudge !== null) {
    holdChargePointerId = event.pointerId;
    surface.setPointerCapture(event.pointerId);
    holdChargeJudge.down(performance.now());
    clearInterval(holdChargeTimer);
    holdChargeTimer = setInterval(() => {
      if (holdChargeJudge === null) return;
      const state = holdChargeJudge.progress(performance.now());
      cueDetail.textContent = `${Math.round(state.ratio * 100)}%`;
    }, 90);
    return;
  }
  if (pinchJudge !== null) {
    pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    surface.setPointerCapture(event.pointerId);
    if (pinchPointers.size === 2) {
      const [a, b] = [...pinchPointers.values()];
      pinchJudge.begin(Math.hypot(a.x - b.x, a.y - b.y));
    }
    return;
  }
  if (circleJudge !== null) {
    circlePointerId = event.pointerId;
    surface.setPointerCapture(event.pointerId);
    circleJudge.reset();
    circleJudge.add(event.clientX, event.clientY);
    return;
  }
  if (eraseTracker !== null) {
    erasingPointerId = event.pointerId;
    surface.setPointerCapture(event.pointerId);
    handleErase(event);
    return;
  }
  if (scrubController) {
    scrubbingPointerId = event.pointerId;
    scrubController.begin({ x: event.clientX, y: event.clientY });
    surface.setPointerCapture(event.pointerId);
    return;
  }
  pointerStart = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    at: performance.now(),
  };
  surface.setPointerCapture(event.pointerId);
});

let scrubSeekMs = null;

// pointermove fires far above the frame rate; coalesce seeks to one per frame.
function flushScrubSeek() {
  if (scrubSeekMs === null) return;
  video.currentTime = scrubSeekMs / 1000;
  scrubSeekMs = null;
  // seek 事件在快速连拖时并不保证逐次触发,进度条直接跟手画
  renderRail();
}

function handleErase(event) {
  if (eraseTracker === null) return;
  const rect = stage.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  eraseFogAt(x, y);
  const content = videoContentRect();
  const nx = content ? (x - content.x) / content.w : x / rect.width;
  const ny = content ? (y - content.y) / content.h : y / rect.height;
  const state = eraseTracker.mark(Math.min(1, Math.max(0, nx)), Math.min(1, Math.max(0, ny)));
  cueDetail.textContent = `${Math.round(state.ratio * 100)}%`;
  if (state.done) {
    const point = { x, y };
    eraseTracker = null;
    erasingPointerId = null;
    resolveActive(point);
  }
}

surface.addEventListener('pointermove', (event) => {
  if (active && eraseTracker !== null && erasingPointerId === event.pointerId) {
    handleErase(event);
    return;
  }
  if (active && pinchJudge !== null && pinchPointers.has(event.pointerId)) {
    pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchPointers.size === 2) {
      const [a, b] = [...pinchPointers.values()];
      const state = pinchJudge.update(Math.hypot(a.x - b.x, a.y - b.y));
      if (state.done) resolveActive(stagePoint(event));
    }
    return;
  }
  if (active && circleJudge !== null && circlePointerId === event.pointerId) {
    const state = circleJudge.add(event.clientX, event.clientY);
    if (state.done) resolveActive(stagePoint(event));
    return;
  }
  if (!active || !scrubController || scrubbingPointerId !== event.pointerId) return;
  const status = scrubController.move({ x: event.clientX, y: event.clientY });
  capabilityDock.style.setProperty('--progress', status.progress.toFixed(3));
  if (scrubSeekMs === null) requestAnimationFrame(flushScrubSeek);
  scrubSeekMs = status.media_ms;
  if (status.completed) {
    scrubSeekMs = null;
    video.currentTime = status.media_ms / 1000;
    scrubbingPointerId = null;
    resolveActive(stagePoint(event));
  }
});

surface.addEventListener('pointerup', (event) => {
  if (seqTapDown && seqTapDown.id === event.pointerId) {
    const moved = Math.hypot(event.clientX - seqTapDown.x, event.clientY - seqTapDown.y);
    seqTapDown = null;
    if (moved < 12 && liveSequence) {
      const nowMs = video.currentTime * 1000;
      const tapAt = stagePoint(event);
      const candidate = liveSequence.judge.matchable(nowMs);
      if (candidate === null) {
        verdictPop('miss', tapAt);
      } else {
        const target = beatPoint(liveSequence, candidate.beat_index);
        const distance = Math.hypot(tapAt.x - target.x, tapAt.y - target.y);
        if (distance <= TAP_TOLERANCE_PX) {
          const { beat_index, verdict } = liveSequence.judge.tap(nowMs);
          judgeFeedback(liveSequence, beat_index, verdict, target);
        } else {
          // Right time, wrong place: stray tap, beat stays pending.
          verdictPop('miss', tapAt);
        }
      }
    }
    return;
  }
  if (erasingPointerId === event.pointerId) {
    erasingPointerId = null;
    return;
  }
  if (holdChargePointerId === event.pointerId && holdChargeJudge !== null) {
    holdChargePointerId = null;
    clearInterval(holdChargeTimer);
    holdChargeTimer = null;
    const { charged } = holdChargeJudge.release(performance.now());
    if (charged) resolveActive(stagePoint(event));
    else {
      cueDetail.textContent = '0%';
      rejectFeedback();
    }
    return;
  }
  if (pinchPointers.has(event.pointerId)) {
    pinchPointers.delete(event.pointerId);
    pinchJudge?.reset();
    return;
  }
  if (circlePointerId === event.pointerId) {
    circlePointerId = null;
    circleJudge?.reset();
    return;
  }
  if (scrubbingPointerId === event.pointerId) {
    scrubbingPointerId = null;
    scrubController?.end();
    return;
  }
  if (!active || !pointerStart || pointerStart.pointerId !== event.pointerId) return;
  const now = performance.now();
  const gesture = classifyPointerGesture({
    dx: event.clientX - pointerStart.x,
    dy: event.clientY - pointerStart.y,
    durationMs: now - pointerStart.at,
  });
  if (active.primary.signal === 'pointer.rapid_tap' && rapidTapJudge !== null) {
    pointerStart = null;
    if (!gesture.is_tap) return;
    const charge = rapidTapJudge.tap(now);
    cueDetail.textContent = `${charge.count} / ${charge.needed}`;
    spawnFeedback(active, stagePoint(event));
    if (charge.done) resolveActive(stagePoint(event));
    return;
  }
  if (degradedHold) {
    pointerStart = null;
    if (gesture.is_hold) resolveActive(stagePoint(event));
    else rejectFeedback();
    return;
  }
  const result = evaluatePointerInput(active, gesture, {
    nowMs: now,
    previousTapAtMs: previousTapAt,
  });
  previousTapAt = result.next_tap_at_ms;
  pointerStart = null;
  if (result.accepted) resolveActive(stagePoint(event));
  else if (result.next_tap_at_ms === null) rejectFeedback();
});

surface.addEventListener('pointercancel', () => {
  pointerStart = null;
  scrubbingPointerId = null;
  scrubController?.end();
});

continueButton.addEventListener('click', () => resolveActive());

function checkGate(mediaTimeSeconds = video.currentTime) {
  if (active || nextIndex >= timeline.interactions.length) return;
  const next = timeline.interactions[nextIndex];
  if (mediaTimeSeconds * 1000 >= next.gate_at_ms) expose(next);
}

function monitorPresentedFrames() {
  if (typeof video.requestVideoFrameCallback !== 'function' || video.paused || active) return;
  frameCallbackId = video.requestVideoFrameCallback((_now, metadata) => {
    frameCallbackId = null;
    checkGate(metadata.mediaTime);
    monitorPresentedFrames();
  });
}

let videoDown = null;
video.addEventListener('pointerdown', (event) => {
  videoDown = { x: event.clientX, y: event.clientY, at: performance.now() };
});
video.addEventListener('pointerup', (event) => {
  if (!videoDown) return;
  const still = Math.hypot(event.clientX - videoDown.x, event.clientY - videoDown.y) < 8
    && performance.now() - videoDown.at < 400;
  videoDown = null;
  if (!still || active || !startOverlay.hidden) return;
  if (video.paused) void video.play();
  else video.pause();
});

video.addEventListener('play', () => {
  startOverlay.hidden = true;
  endOverlay.hidden = true;
  monitorPresentedFrames();
  cancelAnimationFrame(railFrameId);
  railFrameId = requestAnimationFrame(trackRail);
});
video.addEventListener('timeupdate', () => {
  checkGate();
  updateSequences();
  // While playing the rail is driven by the trackRail rAF loop.
  if (video.paused) renderRail();
});
// Seeking repositions the story instead of replaying it: gates and
// sequences resync to the new time, so playback continues from the
// current frame - moments seeked past are skipped, seeking backwards
// re-arms them. Scrub gameplay (active) drives its own seeks and is
// exempt.
video.addEventListener('seeking', () => {
  if (active) return;
  const mediaMs = video.currentTime * 1000;
  nextIndex = timeline.interactions.findIndex((i) => i.gate_at_ms >= mediaMs);
  if (nextIndex === -1) nextIndex = timeline.interactions.length;
  buildSequenceRuntimes();
  for (const runtime of sequenceRuntimes) {
    if (mediaMs > runtime.start_ms) runtime.judge.tick(mediaMs); // 静默吞掉被跳过的拍
  }
  renderProgress();
});
video.addEventListener('pause', () => {
  if (frameCallbackId !== null && typeof video.cancelVideoFrameCallback === 'function') {
    video.cancelVideoFrameCallback(frameCallbackId);
    frameCallbackId = null;
  }
  cancelAnimationFrame(railFrameId);
  renderRail();
});
// 进度条:点击定位 + 按住拖动。拖动打断当前 gate(seek 重定位机制接管
// gate 游标),拖前在播放则松手续播。
const railTrack = document.querySelector('#rail-track');
let railDragging = false;
let railWasPlaying = false;
function railSeekFromEvent(event) {
  const durationMs = timeline?.media?.duration_ms;
  if (!durationMs) return;
  const rect = railTrack.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  video.currentTime = (ratio * durationMs) / 1000;
  renderRail();
}
railTrack.addEventListener('pointerdown', (event) => {
  if (!timeline) return;
  railDragging = true;
  railWasPlaying = !video.paused;
  if (active) resetGate();
  video.pause();
  railTrack.setPointerCapture(event.pointerId);
  railSeekFromEvent(event);
});
railTrack.addEventListener('pointermove', (event) => {
  if (railDragging) railSeekFromEvent(event);
});
railTrack.addEventListener('pointerup', () => {
  if (!railDragging) return;
  railDragging = false;
  if (railWasPlaying) void video.play();
});
railTrack.addEventListener('pointercancel', () => { railDragging = false; });

video.addEventListener('ended', () => {
  endOverlay.hidden = false;
});

function replay() {
  resetGate();
  buildSequenceRuntimes();
  seqChip.hidden = true;
  beatField.hidden = true;
  comboEl.hidden = true;
  nextIndex = 0;
  endOverlay.hidden = true;
  video.currentTime = 0;
  renderProgress();
  renderRail();
  void video.play();
}

replayButton.addEventListener('click', replay);
endOverlay.addEventListener('click', replay);
// 整个开场遮罩都是开始按钮 - 点画面任意位置即可播放。
startOverlay.addEventListener('click', () => {
  startOverlay.hidden = true;
  startPanSensor();
  showPanHint();
  void video.play();
});

function buildMarkers() {
  const durationMs = timeline?.media?.duration_ms;
  railMarkers.replaceChildren();
  markers = timeline.interactions.map((interaction) => {
    const marker = document.createElement('span');
    marker.className = 'rail-marker';
    marker.dataset.state = 'todo';
    if (durationMs) marker.style.left = `${((interaction.gate_at_ms / durationMs) * 100).toFixed(3)}%`;
    railMarkers.append(marker);
    return marker;
  });
}

async function boot() {
  // Workspace serving exposes the run list at /; frozen bundles do not.
  if (/^\/runs\/[^/]+\/player\/$/u.test(location.pathname)) {
    document.querySelector('#back-link').hidden = false;
  }
  const params = new URLSearchParams(location.search);
  const runId = params.get('run');
  const timelineUrl = params.get('timeline')
    ?? (runId ? `/api/v1/runs/${runId}/media/timeline` : '../timeline.json');
  const videoUrl = params.get('video')
    ?? (runId ? `/api/v1/runs/${runId}/media/video` : '../original.mp4');
  if (runId) {
    document.querySelector('#back-link').hidden = false;
    document.querySelector('#back-link').href = `/runs/${runId}`;
    document.querySelector('#back-link').textContent = '← 返回详情';
  }
  timeline = validatePlayableTimeline(await fetch(timelineUrl, { credentials: 'include' }).then((response) => {
    if (!response.ok) throw new Error(`Timeline HTTP ${response.status}`);
    return response.json();
  }));
  video.src = videoUrl;
  meta.textContent = `${timeline.interactions.length} 个互动点 · ${timeline.schema_version ?? ''}`;
  if (timeline.viewport?.kind === 'tilt_pan') {
    stage.classList.add('pan');
    panController = createTiltPanController({
      maxTiltDegrees: timeline.viewport.max_tilt_degrees,
    });
    requestAnimationFrame(panLoop);
  }
  buildMarkers();
  buildSequenceRuntimes();
  renderProgress();
}

boot().catch((error) => {
  meta.textContent = `加载失败：${error.message}`;
  startOverlay.hidden = true;
});

if (new URLSearchParams(location.search).get('sim') === '1') {
  createKeyboardSimulator({
    onReading(reading) {
      if (reading.signal === 'motion.tilt' && panController) {
        panController.updateFromGamma(reading.gammaDegrees);
      }
      if (!capability || capability.signal !== reading.signal) return;
      capability.feed?.(reading);
    },
  }).start();
  meta.append(' · 模拟模式：←/→ 倾斜，S 摇动，M 出声，C 镜头动作');
}
