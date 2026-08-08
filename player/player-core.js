const SUPPORTED_SIGNALS = new Set([
  'pointer.tap',
  'pointer.double_tap',
  'pointer.hold',
  'pointer.swipe',
  'pointer.drag',
  'camera.motion',
  'motion.tilt',
  'motion.shake',
  'microphone.level',
  'pointer.scrub',
  'pointer.rapid_tap',
  'pointer.erase',
  'microphone.blow',
  'microphone.clap',
  'microphone.quiet',
  'pointer.hold_charge',
  'pointer.pinch',
  'pointer.draw_circle',
  'motion.still',
  'motion.rotate',
]);

const DIRECTIONAL_SIGNALS = new Set([
  'pointer.swipe',
  'pointer.drag',
  'motion.tilt',
  'pointer.scrub',
]);

const DIRECTIONS = new Set(['left', 'right', 'up', 'down']);

function directionForDelta(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 36) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

export function validatePlayableTimeline(value) {
  if (!value || value.kind !== 'interaction_timeline' || !Array.isArray(value.interactions)) {
    throw new TypeError('Invalid Timeline');
  }
  if (value.sequences !== undefined) {
    if (!Array.isArray(value.sequences)) throw new TypeError('sequences must be an array');
    for (const [index, sequence] of value.sequences.entries()) {
      const label = `sequences[${index}]`;
      if (sequence?.kind !== 'tap_sequence') {
        throw new TypeError(`${label}.kind is unsupported by this Player`);
      }
      if (!Array.isArray(sequence.beats) || sequence.beats.length < 2) {
        throw new TypeError(`${label}.beats must contain at least two beats`);
      }
      let previousBeat = -1;
      for (const beat of sequence.beats) {
        if (!Number.isSafeInteger(beat?.at_ms) || beat.at_ms <= previousBeat) {
          throw new TypeError(`${label}.beats must be strictly increasing integers`);
        }
        previousBeat = beat.at_ms;
      }
      if (!Number.isSafeInteger(sequence.judge?.perfect_ms)
          || !Number.isSafeInteger(sequence.judge?.good_ms)
          || sequence.judge.perfect_ms <= 0
          || sequence.judge.good_ms <= sequence.judge.perfect_ms) {
        throw new TypeError(`${label}.judge windows are invalid`);
      }
    }
  }
  if (value.viewport !== undefined) {
    const viewport = value.viewport;
    if (viewport?.kind !== 'tilt_pan') {
      throw new TypeError('viewport.kind is unsupported by this Player');
    }
    if (!Number.isFinite(viewport.subject_anchor)
        || viewport.subject_anchor < 0
        || viewport.subject_anchor > 1) {
      throw new TypeError('viewport.subject_anchor must be in [0, 1]');
    }
    if (!Number.isFinite(viewport.max_tilt_degrees) || viewport.max_tilt_degrees <= 0) {
      throw new TypeError('viewport.max_tilt_degrees must be positive');
    }
  }
  let previousGateMs = -1;
  for (const [index, interaction] of value.interactions.entries()) {
    const label = `interactions[${index}]`;
    if (!Number.isSafeInteger(interaction?.gate_at_ms) || interaction.gate_at_ms < 0) {
      throw new TypeError(`${label}.gate_at_ms is invalid`);
    }
    if (interaction.gate_at_ms < previousGateMs) {
      throw new TypeError('Timeline interactions must be ordered by gate_at_ms');
    }
    previousGateMs = interaction.gate_at_ms;
    const signal = interaction.primary?.signal;
    if (!SUPPORTED_SIGNALS.has(signal)) {
      throw new TypeError(`${label}.primary.signal is unsupported by this Player`);
    }
    const direction = interaction.primary?.direction ?? null;
    if (signal === 'motion.tilt' && direction !== 'left' && direction !== 'right') {
      throw new TypeError(`${label}.primary.direction must be left or right for tilt`);
    }
    const directional = DIRECTIONAL_SIGNALS.has(signal);
    if (directional !== DIRECTIONS.has(direction)) {
      throw new TypeError(`${label}.primary.direction does not match its signal`);
    }
    if (interaction.fallback?.signal !== 'ui.continue'
        || !Number.isSafeInteger(interaction.fallback?.after_ms)
        || interaction.fallback.after_ms <= 0) {
      throw new TypeError(`${label}.fallback is unsupported by this Player`);
    }
  }
  return value;
}

const DIRECTION_LABELS = Object.freeze({ left: '左', right: '右', up: '上', down: '下' });

// detail 只承载指令之外的增量信息(时长、权限、判定边界);没有增量就留空,Player 会隐藏该行。
const SIGNAL_HINTS = Object.freeze({
  'pointer.tap': { title: '轻触画面', detail: '' },
  'pointer.double_tap': { title: '双击画面', detail: '两下要快' },
  'pointer.hold': { title: '按住画面', detail: '按住半秒松开' },
  'pointer.swipe': { title: '向{dir}滑动', detail: '快速轻扫' },
  'pointer.drag': { title: '向{dir}拖动', detail: '按住慢拖' },
  'camera.motion': { title: '对镜头做动作', detail: '需要摄像头权限' },
  'motion.tilt': { title: '向{dir}倾斜手机', detail: '倾斜并保持' },
  'motion.shake': { title: '摇一摇手机', detail: '连摇三下' },
  'microphone.level': { title: '对着麦克风出声', detail: '需要麦克风权限' },
  'pointer.scrub': { title: '向{dir}拖动推进', detail: '画面跟手' },
  'pointer.rapid_tap': { title: '快速连点', detail: '' },
  'pointer.erase': { title: '来回擦拭', detail: '按住涂抹画面' },
  'microphone.blow': { title: '对麦克风吹气', detail: '持续吹半秒' },
  'microphone.clap': { title: '拍一下手', detail: '' },
  'microphone.quiet': { title: '保持安静', detail: '两秒不出声' },
  'pointer.hold_charge': { title: '按住蓄力', detail: '蓄满再松开' },
  'pointer.pinch': { title: '双指捏合', detail: '两指向中间收拢' },
  'pointer.draw_circle': { title: '画一个圈', detail: '一笔画完整圆' },
  'motion.still': { title: '保持手机静止', detail: '端稳一秒半' },
  'motion.rotate': { title: '转动手机', detail: '原地转个方向' },
});

export function describeCue(interaction, ordinal) {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new TypeError('ordinal must be a positive integer');
  }
  const signal = interaction?.primary?.signal;
  const direction = interaction?.primary?.direction ?? null;
  const directionLabel = DIRECTION_LABELS[direction] ?? '';
  const hint = SIGNAL_HINTS[signal] ?? null;
  const fill = (text) => text.replaceAll('{dir}', directionLabel);
  const cue = typeof interaction?.cue === 'string' && interaction.cue.trim() !== ''
    ? interaction.cue
    : null;
  return Object.freeze({
    index: String(ordinal).padStart(2, '0'),
    title: cue ?? (hint ? fill(hint.title) : '继续互动'),
    detail: hint ? fill(hint.detail) : '',
    direction,
  });
}

export function classifyPointerGesture({ dx, dy, durationMs }) {
  if (![dx, dy, durationMs].every(Number.isFinite) || durationMs < 0) {
    throw new TypeError('pointer gesture values must be finite and non-negative');
  }
  const direction = directionForDelta(dx, dy);
  const distance = Math.hypot(dx, dy);
  return Object.freeze({
    direction,
    distance,
    duration_ms: durationMs,
    is_tap: distance < 18 && durationMs < 500,
    is_hold: distance < 18 && durationMs >= 500,
    is_swipe: direction !== null && durationMs < 450,
    is_drag: direction !== null && durationMs >= 450,
  });
}

export function frameMotionEnergy(previous, current) {
  if (!Array.isArray(previous) && !ArrayBuffer.isView(previous)) {
    throw new TypeError('previous frame must be an array of luma samples');
  }
  if (!Array.isArray(current) && !ArrayBuffer.isView(current)) {
    throw new TypeError('current frame must be an array of luma samples');
  }
  if (previous.length === 0 || previous.length !== current.length) {
    throw new TypeError('frames must share the same non-zero sample count');
  }
  let total = 0;
  for (let index = 0; index < previous.length; index += 1) {
    total += Math.abs(current[index] - previous[index]);
  }
  return total / (previous.length * 255);
}

export function createSustainDetector({ threshold, sustainMs } = {}) {
  if (!Number.isFinite(threshold)) throw new TypeError('threshold must be finite');
  if (!Number.isFinite(sustainMs) || sustainMs <= 0) {
    throw new TypeError('sustainMs must be positive');
  }
  let activeSinceMs = null;
  let satisfied = false;
  return Object.freeze({
    update({ value, atMs }) {
      if (!Number.isFinite(value) || !Number.isFinite(atMs)) {
        throw new TypeError('value and atMs must be finite');
      }
      if (!satisfied) {
        if (value < threshold) activeSinceMs = null;
        else if (activeSinceMs === null) activeSinceMs = atMs;
        if (activeSinceMs !== null && atMs - activeSinceMs >= sustainMs) satisfied = true;
      }
      const progress = satisfied
        ? 1
        : (activeSinceMs === null ? 0 : Math.min(1, (atMs - activeSinceMs) / sustainMs));
      return Object.freeze({ satisfied, progress });
    },
  });
}

export function createCameraMotionDetector({ thresholdEnergy = 0.06, sustainMs = 600 } = {}) {
  if (!Number.isFinite(thresholdEnergy) || thresholdEnergy <= 0 || thresholdEnergy >= 1) {
    throw new TypeError('thresholdEnergy must be in (0, 1)');
  }
  const sustain = createSustainDetector({ threshold: thresholdEnergy, sustainMs });
  return Object.freeze({
    update({ energy, atMs }) {
      return sustain.update({ value: energy, atMs });
    },
  });
}

export function createTiltDetector({ direction, thresholdDegrees = 18, sustainMs = 400 } = {}) {
  if (direction !== 'left' && direction !== 'right') {
    throw new TypeError('direction must be left or right');
  }
  if (!Number.isFinite(thresholdDegrees) || thresholdDegrees <= 0) {
    throw new TypeError('thresholdDegrees must be positive');
  }
  const sign = direction === 'right' ? 1 : -1;
  const sustain = createSustainDetector({ threshold: thresholdDegrees, sustainMs });
  return Object.freeze({
    update({ gammaDegrees, atMs }) {
      if (!Number.isFinite(gammaDegrees)) throw new TypeError('gammaDegrees must be finite');
      return sustain.update({ value: gammaDegrees * sign, atMs });
    },
  });
}

export function createShakeDetector({
  thresholdMagnitude = 15,
  requiredPulses = 3,
  windowMs = 1500,
  refractoryMs = 150,
} = {}) {
  if (!Number.isFinite(thresholdMagnitude) || thresholdMagnitude <= 0) {
    throw new TypeError('thresholdMagnitude must be positive');
  }
  if (!Number.isSafeInteger(requiredPulses) || requiredPulses < 1) {
    throw new TypeError('requiredPulses must be a positive integer');
  }
  let pulses = [];
  let satisfied = false;
  return Object.freeze({
    update({ magnitude, atMs }) {
      if (!Number.isFinite(magnitude) || !Number.isFinite(atMs)) {
        throw new TypeError('magnitude and atMs must be finite');
      }
      if (!satisfied) {
        pulses = pulses.filter((pulseAt) => atMs - pulseAt <= windowMs);
        const lastPulse = pulses[pulses.length - 1];
        if (magnitude >= thresholdMagnitude
            && (lastPulse === undefined || atMs - lastPulse >= refractoryMs)) {
          pulses.push(atMs);
        }
        if (pulses.length >= requiredPulses) satisfied = true;
      }
      return Object.freeze({
        satisfied,
        progress: satisfied ? 1 : Math.min(1, pulses.length / requiredPulses),
      });
    },
  });
}

export function createMicLevelDetector({ thresholdLevel = 0.12, sustainMs = 400 } = {}) {
  if (!Number.isFinite(thresholdLevel) || thresholdLevel <= 0 || thresholdLevel >= 1) {
    throw new TypeError('thresholdLevel must be in (0, 1)');
  }
  const sustain = createSustainDetector({ threshold: thresholdLevel, sustainMs });
  return Object.freeze({
    update({ level, atMs }) {
      return sustain.update({ value: level, atMs });
    },
  });
}

/**
 * Blow detection = sustained loudness whose energy is low-frequency
 * dominated. Voice and claps carry more mid/high spectrum, so the lowRatio
 * requirement is what separates "blowing at the mic" from talking near it.
 */
export function createMicBlowDetector({
  thresholdLevel = 0.08,
  minLowRatio = 0.55,
  sustainMs = 500,
} = {}) {
  if (!Number.isFinite(thresholdLevel) || thresholdLevel <= 0 || thresholdLevel >= 1) {
    throw new TypeError('thresholdLevel must be in (0, 1)');
  }
  if (!Number.isFinite(minLowRatio) || minLowRatio <= 0 || minLowRatio >= 1) {
    throw new TypeError('minLowRatio must be in (0, 1)');
  }
  const sustain = createSustainDetector({ threshold: 0.5, sustainMs });
  return Object.freeze({
    update({ level, lowRatio, atMs }) {
      const blowing = Number.isFinite(level) && Number.isFinite(lowRatio)
        && level >= thresholdLevel && lowRatio >= minLowRatio;
      return sustain.update({ value: blowing ? 1 : 0, atMs });
    },
  });
}

/**
 * Clap = a sharp transient: loudness jumps from quiet to loud between two
 * consecutive samples. Sustained sounds (talking, blowing) ramp or stay
 * high and never present the quiet-to-loud edge.
 */
export function createMicClapDetector({ thresholdLevel = 0.22, quietLevel = 0.08 } = {}) {
  if (!Number.isFinite(thresholdLevel) || thresholdLevel <= 0 || thresholdLevel >= 1) {
    throw new TypeError('thresholdLevel must be in (0, 1)');
  }
  if (!Number.isFinite(quietLevel) || quietLevel <= 0 || quietLevel >= thresholdLevel) {
    throw new TypeError('quietLevel must be in (0, thresholdLevel)');
  }
  let previousLevel = 0;
  let satisfied = false;
  return Object.freeze({
    update({ level, atMs }) {
      if (!Number.isFinite(level) || !Number.isFinite(atMs)) {
        throw new TypeError('level and atMs must be finite');
      }
      if (!satisfied && previousLevel < quietLevel && level >= thresholdLevel) satisfied = true;
      previousLevel = level;
      return Object.freeze({ satisfied, progress: satisfied ? 1 : 0 });
    },
  });
}

export function createMicQuietDetector({ maxLevel = 0.05, sustainMs = 2000 } = {}) {
  if (!Number.isFinite(maxLevel) || maxLevel <= 0 || maxLevel >= 1) {
    throw new TypeError('maxLevel must be in (0, 1)');
  }
  const sustain = createSustainDetector({ threshold: 0.5, sustainMs });
  return Object.freeze({
    update({ level, atMs }) {
      const quiet = Number.isFinite(level) && level <= maxLevel;
      return sustain.update({ value: quiet ? 1 : 0, atMs });
    },
  });
}

export const HOLD_CHARGE_MS = 1200;

/** Press-and-hold charging: release only counts once fully charged. */
export function createHoldChargeJudge({ chargeMs = HOLD_CHARGE_MS } = {}) {
  if (!Number.isSafeInteger(chargeMs) || chargeMs <= 0) {
    throw new TypeError('chargeMs must be a positive integer');
  }
  let heldSince = null;
  return Object.freeze({
    down(atMs) {
      if (!Number.isFinite(atMs)) throw new TypeError('atMs must be finite');
      heldSince = atMs;
    },
    progress(atMs) {
      if (!Number.isFinite(atMs)) throw new TypeError('atMs must be finite');
      if (heldSince === null) return { ratio: 0, charged: false };
      const ratio = Math.min(1, (atMs - heldSince) / chargeMs);
      return { ratio, charged: ratio >= 1 };
    },
    release(atMs) {
      if (!Number.isFinite(atMs)) throw new TypeError('atMs must be finite');
      const { charged } = this.progress(atMs);
      heldSince = null;
      return { charged };
    },
  });
}

/** Two-finger pinch: done when the finger distance shrinks to the target ratio. */
export function createPinchJudge({ targetRatio = 0.6 } = {}) {
  if (!Number.isFinite(targetRatio) || targetRatio <= 0 || targetRatio >= 1) {
    throw new TypeError('targetRatio must be in (0, 1)');
  }
  let startDistance = null;
  return Object.freeze({
    begin(distance) {
      if (!Number.isFinite(distance) || distance <= 0) {
        throw new TypeError('distance must be positive');
      }
      startDistance = distance;
    },
    update(distance) {
      if (startDistance === null) return { ratio: 1, done: false };
      if (!Number.isFinite(distance) || distance <= 0) {
        throw new TypeError('distance must be positive');
      }
      const ratio = distance / startDistance;
      return { ratio, done: ratio <= targetRatio };
    },
    reset() {
      startDistance = null;
    },
  });
}

/**
 * One-stroke circle: accumulate the signed angle swept around the running
 * centroid of the stroke. 300 degrees of coverage counts as a circle, so
 * slightly open loops still pass.
 */
export function createCircleJudge({ minSweepDegrees = 300 } = {}) {
  if (!Number.isFinite(minSweepDegrees) || minSweepDegrees <= 90) {
    throw new TypeError('minSweepDegrees must exceed 90');
  }
  let points = [];
  return Object.freeze({
    add(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new TypeError('coordinates must be finite');
      }
      points.push({ x, y });
      if (points.length < 8) return { sweep: 0, done: false };
      const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      let sweep = 0;
      let previous = Math.atan2(points[0].y - cy, points[0].x - cx);
      for (let i = 1; i < points.length; i += 1) {
        const angle = Math.atan2(points[i].y - cy, points[i].x - cx);
        let delta = (angle - previous) * (180 / Math.PI);
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        sweep += delta;
        previous = angle;
      }
      return { sweep: Math.abs(sweep), done: Math.abs(sweep) >= minSweepDegrees };
    },
    reset() {
      points = [];
    },
  });
}

/**
 * Stillness = the acceleration magnitude staying near its own running
 * baseline. Judging deviation instead of the absolute value keeps the
 * detector agnostic to whether the device reports gravity-included data.
 */
export function createStillDetector({ maxDeviation = 0.6, sustainMs = 1500 } = {}) {
  if (!Number.isFinite(maxDeviation) || maxDeviation <= 0) {
    throw new TypeError('maxDeviation must be positive');
  }
  const sustain = createSustainDetector({ threshold: 0.5, sustainMs });
  let baseline = null;
  return Object.freeze({
    update({ magnitude, atMs }) {
      if (!Number.isFinite(magnitude)) throw new TypeError('magnitude must be finite');
      if (baseline === null) baseline = magnitude;
      const still = Math.abs(magnitude - baseline) <= maxDeviation;
      baseline = baseline * 0.9 + magnitude * 0.1;
      return sustain.update({ value: still ? 1 : 0, atMs });
    },
  });
}

/** Net compass-axis rotation (wrap-aware) reaching the target angle. */
export function createRotateDetector({ targetDegrees = 120 } = {}) {
  if (!Number.isFinite(targetDegrees) || targetDegrees <= 0) {
    throw new TypeError('targetDegrees must be positive');
  }
  let previous = null;
  let net = 0;
  let satisfied = false;
  return Object.freeze({
    update({ alphaDegrees, atMs }) {
      if (!Number.isFinite(atMs)) throw new TypeError('atMs must be finite');
      if (!Number.isFinite(alphaDegrees)) {
        return Object.freeze({ satisfied, progress: satisfied ? 1 : 0 });
      }
      if (previous !== null && !satisfied) {
        let delta = alphaDegrees - previous;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        net += delta;
        if (Math.abs(net) >= targetDegrees) satisfied = true;
      }
      previous = alphaDegrees;
      const progress = satisfied ? 1 : Math.min(1, Math.abs(net) / targetDegrees);
      return Object.freeze({ satisfied, progress });
    },
  });
}

export function createTiltPanController({ maxTiltDegrees = 35, smoothing = 0.18 } = {}) {
  if (!Number.isFinite(maxTiltDegrees) || maxTiltDegrees <= 0) {
    throw new TypeError('maxTiltDegrees must be positive');
  }
  if (!Number.isFinite(smoothing) || smoothing <= 0 || smoothing > 1) {
    throw new TypeError('smoothing must be in (0, 1]');
  }
  let neutralGamma = null;
  let target = 0;
  let current = 0;
  return Object.freeze({
    // First reading calibrates neutral, so any resting grip reads as centered.
    updateFromGamma(gammaDegrees) {
      if (!Number.isFinite(gammaDegrees)) throw new TypeError('gammaDegrees must be finite');
      if (neutralGamma === null) neutralGamma = gammaDegrees;
      target = Math.min(1, Math.max(-1, (gammaDegrees - neutralGamma) / maxTiltDegrees));
      return target;
    },
    setTarget(tilt) {
      if (!Number.isFinite(tilt)) throw new TypeError('tilt must be finite');
      target = Math.min(1, Math.max(-1, tilt));
      return target;
    },
    step() {
      current += (target - current) * smoothing;
      return current;
    },
  });
}

export function panOffsetPx({ tilt, viewportWidth, videoWidth, subjectAnchor = 0.5 } = {}) {
  if (![tilt, viewportWidth, videoWidth].every(Number.isFinite)
      || viewportWidth <= 0 || videoWidth <= 0) {
    throw new TypeError('panOffsetPx requires finite tilt and positive dimensions');
  }
  if (!Number.isFinite(subjectAnchor) || subjectAnchor < 0 || subjectAnchor > 1) {
    throw new TypeError('subjectAnchor must be in [0, 1]');
  }
  if (videoWidth <= viewportWidth) return (viewportWidth - videoWidth) / 2;
  const minLeft = viewportWidth - videoWidth;
  const centeredLeft = Math.min(0, Math.max(
    minLeft,
    viewportWidth / 2 - videoWidth * subjectAnchor,
  ));
  const clamped = Math.min(1, Math.max(-1, tilt));
  if (clamped > 0) return centeredLeft - clamped * (centeredLeft - minLeft);
  return centeredLeft + Math.abs(clamped) * (0 - centeredLeft);
}

const SCRUB_AXES = Object.freeze({
  right: [1, 0],
  left: [-1, 0],
  down: [0, 1],
  up: [0, -1],
});

export function createScrubController({
  direction,
  startMs,
  endMs,
  rangePx = 240,
  completeAt = 0.98,
} = {}) {
  const axis = SCRUB_AXES[direction];
  if (!axis) throw new TypeError('direction must be left, right, up, or down');
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new TypeError('scrub media window requires endMs > startMs');
  }
  if (!Number.isFinite(rangePx) || rangePx <= 0) {
    throw new TypeError('rangePx must be positive');
  }
  if (!Number.isFinite(completeAt) || completeAt <= 0 || completeAt > 1) {
    throw new TypeError('completeAt must be in (0, 1]');
  }
  let origin = null;
  let progress = 0;
  let completed = false;
  const snapshot = () => Object.freeze({
    progress,
    completed,
    media_ms: startMs + progress * (endMs - startMs),
  });
  const assertPoint = ({ x, y } = {}) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError('scrub points require finite x and y');
    }
    return { x, y };
  };
  return Object.freeze({
    begin(point) {
      const { x, y } = assertPoint(point);
      origin = { x, y, base: progress };
      return snapshot();
    },
    move(point) {
      const { x, y } = assertPoint(point);
      if (origin === null || completed) return snapshot();
      const projected = (x - origin.x) * axis[0] + (y - origin.y) * axis[1];
      progress = Math.min(1, Math.max(0, origin.base + projected / rangePx));
      if (progress >= completeAt) {
        progress = 1;
        completed = true;
      }
      return snapshot();
    },
    // Progress ratchets across grabs: an early release keeps what was pulled.
    end() {
      origin = null;
      return snapshot();
    },
  });
}

export function evaluatePointerInput(interaction, gesture, {
  nowMs,
  previousTapAtMs = null,
} = {}) {
  if (!Number.isFinite(nowMs)) throw new TypeError('nowMs must be finite');
  const signal = interaction?.primary?.signal;
  const wantedDirection = interaction?.primary?.direction ?? null;
  if (signal === 'pointer.tap') {
    return { accepted: gesture.is_tap, next_tap_at_ms: null };
  }
  if (signal === 'pointer.double_tap') {
    if (!gesture.is_tap) return { accepted: false, next_tap_at_ms: null };
    const paired = Number.isFinite(previousTapAtMs)
      && nowMs >= previousTapAtMs
      && nowMs - previousTapAtMs <= 420;
    return { accepted: paired, next_tap_at_ms: paired ? null : nowMs };
  }
  if (signal === 'pointer.hold') {
    return { accepted: gesture.is_hold, next_tap_at_ms: null };
  }
  if (signal === 'pointer.swipe') {
    return {
      accepted: gesture.is_swipe && gesture.direction === wantedDirection,
      next_tap_at_ms: null,
    };
  }
  if (signal === 'pointer.drag') {
    return {
      accepted: gesture.is_drag && gesture.direction === wantedDirection,
      next_tap_at_ms: null,
    };
  }
  return { accepted: false, next_tap_at_ms: null };
}

export const RAPID_TAP = Object.freeze({ count: 10, window_ms: 3000 });
export const ERASE = Object.freeze({ cols: 10, rows: 6, target_ratio: 0.6 });

/**
 * Wipe-to-clear coverage over a cell grid. Marking is idempotent per cell;
 * completion is reaching the target coverage ratio. Coordinates are
 * fractions of the stage (0..1), so the tracker is layout-agnostic.
 */
export function createEraseTracker({
  cols = ERASE.cols,
  rows = ERASE.rows,
  targetRatio = ERASE.target_ratio,
  region = null,
} = {}) {
  if (!Number.isSafeInteger(cols) || cols < 2 || !Number.isSafeInteger(rows) || rows < 2) {
    throw new TypeError('cols and rows must be integers >= 2');
  }
  if (!Number.isFinite(targetRatio) || targetRatio <= 0 || targetRatio > 1) {
    throw new TypeError('targetRatio must be in (0, 1]');
  }
  // region 限定时,只有中心落在框内的格子计入分母与命中——雾只盖目标,
  // 目标外的涂抹不推进进度。
  const inRegion = (col, row) => {
    if (!region) return true;
    const cx = (col + 0.5) / cols;
    const cy = (row + 0.5) / rows;
    return cx >= region.x && cx <= region.x + region.w
      && cy >= region.y && cy <= region.y + region.h;
  };
  const marked = new Set();
  let total = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (inRegion(col, row)) total += 1;
    }
  }
  if (total === 0) total = cols * rows;
  return Object.freeze({
    mark(xRatio, yRatio) {
      if (!Number.isFinite(xRatio) || !Number.isFinite(yRatio)) {
        throw new TypeError('mark requires finite ratios');
      }
      if (xRatio >= 0 && xRatio <= 1 && yRatio >= 0 && yRatio <= 1) {
        const col = Math.min(cols - 1, Math.floor(xRatio * cols));
        const row = Math.min(rows - 1, Math.floor(yRatio * rows));
        if (inRegion(col, row)) marked.add(row * cols + col);
      }
      const ratio = marked.size / total;
      return { ratio, done: ratio >= targetRatio };
    },
    progress() {
      const ratio = marked.size / total;
      return { ratio, done: ratio >= targetRatio };
    },
  });
}

/**
 * Charge-up tapping: a rolling window over tap timestamps. Taps older than
 * the window fall out, so slowing down loses charge - reaching the target
 * count inside one window completes the gate. Pure state machine.
 */
export function createRapidTapJudge({ count = RAPID_TAP.count, windowMs = RAPID_TAP.window_ms } = {}) {
  if (!Number.isSafeInteger(count) || count < 2) {
    throw new TypeError('count must be an integer >= 2');
  }
  if (!Number.isSafeInteger(windowMs) || windowMs <= 0) {
    throw new TypeError('windowMs must be a positive integer');
  }
  let taps = [];
  return Object.freeze({
    tap(nowMs) {
      if (!Number.isFinite(nowMs)) throw new TypeError('nowMs must be finite');
      taps = taps.filter((at) => nowMs - at < windowMs);
      taps.push(nowMs);
      return { count: taps.length, needed: count, done: taps.length >= count };
    },
    progress(nowMs) {
      if (!Number.isFinite(nowMs)) throw new TypeError('nowMs must be finite');
      const live = taps.filter((at) => nowMs - at < windowMs).length;
      return { count: live, needed: count, done: live >= count };
    },
  });
}

/**
 * Rhythm judgment over a beat list. Media time drives everything: taps are
 * judged against the nearest pending beat, and beats whose good-window has
 * passed become misses. Pure and latch-free apart from per-beat verdicts.
 */
export function createSequenceJudge({ beats, perfectMs = 120, goodMs = 300 } = {}) {
  if (!Array.isArray(beats) || beats.length < 2) {
    throw new TypeError('beats must contain at least two entries');
  }
  if (!Number.isSafeInteger(perfectMs) || !Number.isSafeInteger(goodMs)
      || perfectMs <= 0 || goodMs <= perfectMs) {
    throw new TypeError('judge windows require 0 < perfectMs < goodMs');
  }
  const state = beats.map((beat) => {
    if (!Number.isSafeInteger(beat?.at_ms)) throw new TypeError('beats require integer at_ms');
    return { at_ms: beat.at_ms, verdict: null };
  });
  return Object.freeze({
    tap(atMs) {
      if (!Number.isFinite(atMs)) throw new TypeError('atMs must be finite');
      let best = null;
      for (const [index, beat] of state.entries()) {
        if (beat.verdict !== null) continue;
        const distance = Math.abs(beat.at_ms - atMs);
        if (distance > goodMs) continue;
        if (best === null || distance < best.distance) best = { index, distance };
      }
      if (best === null) return Object.freeze({ beat_index: null, verdict: 'miss' });
      const verdict = best.distance <= perfectMs ? 'perfect' : 'good';
      state[best.index].verdict = verdict;
      return Object.freeze({ beat_index: best.index, verdict });
    },
    tick(atMs) {
      if (!Number.isFinite(atMs)) throw new TypeError('atMs must be finite');
      const missed = [];
      for (const [index, beat] of state.entries()) {
        if (beat.verdict === null && atMs > beat.at_ms + goodMs) {
          beat.verdict = 'miss';
          missed.push(index);
        }
      }
      return missed;
    },
    summary() {
      const counts = { perfect: 0, good: 0, miss: 0 };
      let judged = 0;
      for (const beat of state) {
        if (beat.verdict === null) continue;
        judged += 1;
        counts[beat.verdict] += 1;
      }
      return Object.freeze({ ...counts, judged, total: state.length, done: judged === state.length });
    },
    nextPendingAt(atMs) {
      const pending = state.find((beat) => beat.verdict === null && beat.at_ms + goodMs >= atMs);
      return pending ? pending.at_ms : null;
    },
    // The beat a tap at atMs would consume (nearest pending inside the good
    // window), without consuming it — lets the player add a spatial check.
    matchable(atMs) {
      if (!Number.isFinite(atMs)) throw new TypeError('atMs must be finite');
      let best = null;
      for (const [index, beat] of state.entries()) {
        if (beat.verdict !== null) continue;
        const distance = Math.abs(beat.at_ms - atMs);
        if (distance > goodMs) continue;
        if (best === null || distance < best.distance) best = { index, distance, at_ms: beat.at_ms };
      }
      return best === null ? null : Object.freeze({ beat_index: best.index, at_ms: best.at_ms });
    },
  });
}
