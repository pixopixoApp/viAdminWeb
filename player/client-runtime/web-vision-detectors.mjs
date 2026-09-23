export const ONE_SHOT_VISION_TARGETS = Object.freeze([
  "hand_victory",
  "hand_thumb_up",
  "hand_thumb_down",
  "hand_open_palm",
  "hand_closed_fist",
  "hand_pointing_up",
  "hand_i_love_you",
  "face_smile",
  "face_wink_left",
  "face_wink_right",
  "face_blink",
  "face_mouth_open",
  "face_mouth_pucker",
  "face_brow_raise",
  "face_brow_furrow",
  "face_cheek_puff",
]);

export const CONTINUOUS_VISION_TARGET_PROFILES = Object.freeze({
  hand_finger_snap: "finger_snap_v1",
  hand_finger_gun_recoil: "finger_gun_recoil_v1",
});

export const CONTINUOUS_VISION_TARGETS = Object.freeze(
  Object.keys(CONTINUOUS_VISION_TARGET_PROFILES),
);

export const ALL_VISION_TARGETS = Object.freeze([
  ...ONE_SHOT_VISION_TARGETS,
  ...CONTINUOUS_VISION_TARGETS,
]);

// Mirrors Android CreatorVisionPreviewProfiles. These values are for Creator
// audition and the local acceptance lab; authored Runtime specs still own the
// final per-cue values they carry.
export const VISION_PREVIEW_PROFILES = Object.freeze({
  hand_victory: Object.freeze({ minConfidence: 0.82, stableForMs: 400 }),
  hand_thumb_up: Object.freeze({ minConfidence: 0.60, stableForMs: 250 }),
  hand_thumb_down: Object.freeze({ minConfidence: 0.82, stableForMs: 400 }),
  hand_open_palm: Object.freeze({ minConfidence: 0.55, stableForMs: 250 }),
  hand_closed_fist: Object.freeze({ minConfidence: 0.82, stableForMs: 400 }),
  hand_pointing_up: Object.freeze({ minConfidence: 0.55, stableForMs: 250 }),
  hand_i_love_you: Object.freeze({ minConfidence: 0.60, stableForMs: 250 }),
  face_smile: Object.freeze({ minConfidence: 0.50, stableForMs: 150 }),
  face_wink_left: Object.freeze({ minConfidence: 0.50, stableForMs: 150 }),
  face_wink_right: Object.freeze({ minConfidence: 0.50, stableForMs: 150 }),
  face_blink: Object.freeze({ minConfidence: 0.50, stableForMs: 150 }),
  face_mouth_open: Object.freeze({ minConfidence: 0.50, stableForMs: 150 }),
  face_mouth_pucker: Object.freeze({ minConfidence: 0.50, stableForMs: 150 }),
  face_brow_raise: Object.freeze({ minConfidence: 0.65, stableForMs: 250 }),
  face_brow_furrow: Object.freeze({ minConfidence: 0.50, stableForMs: 150 }),
  face_cheek_puff: Object.freeze({ minConfidence: 0.50, stableForMs: 150 }),
});

export const HAND_CATEGORY_BY_TARGET = Object.freeze({
  hand_victory: "Victory",
  hand_thumb_up: "Thumb_Up",
  hand_thumb_down: "Thumb_Down",
  hand_open_palm: "Open_Palm",
  hand_closed_fist: "Closed_Fist",
  hand_pointing_up: "Pointing_Up",
  hand_i_love_you: "ILoveYou",
});

const FACE_TARGETS = new Set(ONE_SHOT_VISION_TARGETS.filter((target) => target.startsWith("face_")));
const BROW_TARGETS = new Set(["face_brow_raise", "face_brow_furrow"]);
const ALL_TARGET_SET = new Set(ALL_VISION_TARGETS);
const FACE_OVAL = Object.freeze([
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
  379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
  234, 127, 162, 21, 54, 103, 67, 109,
]);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeVisionConfig(source = {}) {
  const target = typeof source.target === "string" ? source.target.trim() : "";
  if (!ALL_TARGET_SET.has(target)) throw new Error(`Unsupported vision target '${target || "missing"}'.`);
  const continuous = Object.hasOwn(CONTINUOUS_VISION_TARGET_PROFILES, target);
  const expectedProfile = CONTINUOUS_VISION_TARGET_PROFILES[target] || "";
  const detectorProfile = typeof source.detector_profile === "string"
    ? source.detector_profile.trim()
    : expectedProfile;
  if (continuous && detectorProfile !== expectedProfile) {
    throw new Error(`Vision target '${target}' requires detector profile '${expectedProfile}'.`);
  }
  return Object.freeze({
    target,
    family: FACE_TARGETS.has(target) ? "face" : "hand",
    continuous,
    detectorProfile,
    cameraFacing: source.camera_facing === "back" ? "back" : "front",
    showPreview: source.show_preview === true,
    minConfidence: clamp(
      finite(source.min_confidence, target.startsWith("face_") ? 0.72 : 0.82),
      0.5,
      0.99,
    ),
    stableForMs: clamp(Math.round(finite(source.stable_for_ms, 400)), 150, 3000),
  });
}

function categoryScores(categories) {
  return Object.fromEntries((Array.isArray(categories) ? categories : []).flatMap((category) => {
    const name = String(category?.categoryName || category?.displayName || "").trim();
    return name ? [[name, finite(category?.score)]] : [];
  }));
}

export function faceBlendshapeScore(target, categories) {
  const scores = categoryScores(categories);
  const score = (name) => finite(scores[name]);
  const average = (...names) => names.reduce((sum, name) => sum + score(name), 0) / names.length;
  const leftEye = score("eyeBlinkLeft");
  const rightEye = score("eyeBlinkRight");
  switch (target) {
    case "face_smile": return average("mouthSmileLeft", "mouthSmileRight");
    case "face_wink_left": return leftEye;
    case "face_wink_right": return rightEye;
    case "face_blink": return Math.min(leftEye, rightEye);
    case "face_mouth_open": return score("jawOpen");
    case "face_mouth_pucker": return score("mouthPucker");
    case "face_brow_raise": return average("browOuterUpLeft", "browOuterUpRight");
    case "face_brow_furrow": return Math.max(score("browDownLeft"), score("browDownRight"));
    case "face_cheek_puff": return score("cheekPuff");
    default: return 0;
  }
}

export function eyebrowToEyeGap(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length <= 386) return null;
  const averageY = (...indexes) => {
    const values = indexes.map((index) => finite(landmarks[index]?.y, Number.NaN)).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const leftBrow = averageY(65, 66, 105);
  const rightBrow = averageY(295, 296, 334);
  const leftEye = averageY(159, 145);
  const rightEye = averageY(386, 374);
  if ([leftBrow, rightBrow, leftEye, rightEye].some((value) => value === null)) return null;
  const gap = ((leftEye - leftBrow) + (rightEye - rightBrow)) / 2;
  return gap > 0 ? gap : null;
}

export function faceOvalRatio(landmarks) {
  if (!Array.isArray(landmarks)) return null;
  const points = FACE_OVAL.map((index) => landmarks[index]).filter((point) => (
    Number.isFinite(point?.x) && Number.isFinite(point?.y)
  ));
  if (points.length < FACE_OVAL.length * 0.75) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const height = Math.max(...ys) - Math.min(...ys);
  if (height <= 0.0001) return null;
  return (Math.max(...xs) - Math.min(...xs)) / height;
}

class Vec3 {
  constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
  plus(other) { return new Vec3(this.x + other.x, this.y + other.y, this.z + other.z); }
  minus(other) { return new Vec3(this.x - other.x, this.y - other.y, this.z - other.z); }
  times(value) { return new Vec3(this.x * value, this.y * value, this.z * value); }
  div(value) { return new Vec3(this.x / value, this.y / value, this.z / value); }
  dot(other) { return this.x * other.x + this.y * other.y + this.z * other.z; }
  cross(other) {
    return new Vec3(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x,
    );
  }
  magnitude() { return Math.sqrt(this.dot(this)); }
  normalizedOrNull() {
    const length = this.magnitude();
    return Number.isFinite(length) && length > 0.00001 ? this.div(length) : null;
  }
  distanceTo(other) { return this.minus(other).magnitude(); }
  distanceToSegment(start, end) {
    const segment = end.minus(start);
    const lengthSquared = segment.dot(segment);
    if (lengthSquared <= 0.00001) return this.distanceTo(start);
    const progress = clamp(this.minus(start).dot(segment) / lengthSquared, 0, 1);
    return this.distanceTo(start.plus(segment.times(progress)));
  }
}

const vector = (point) => new Vec3(finite(point?.x), finite(point?.y), finite(point?.z));

export class FingerSnapFeatureExtractor {
  constructor() { this.previous = null; }
  reset() { this.previous = null; }
  extract(timestampMs, landmarks) {
    if (!Array.isArray(landmarks) || landmarks.length < 21) return null;
    const wrist = vector(landmarks[0]);
    const indexMcp = vector(landmarks[5]);
    const middleMcp = vector(landmarks[9]);
    const ringMcp = vector(landmarks[13]);
    const pinkyMcp = vector(landmarks[17]);
    const palmScale = indexMcp.distanceTo(pinkyMcp);
    if (!Number.isFinite(palmScale) || palmScale < 0.015) return null;
    const palmCenter = wrist.plus(indexMcp).plus(middleMcp).plus(ringMcp).plus(pinkyMcp).div(5);
    const xAxis = pinkyMcp.minus(indexMcp).normalizedOrNull();
    if (!xAxis) return null;
    const palmForward = middleMcp.minus(wrist);
    const yAxis = palmForward.minus(xAxis.times(palmForward.dot(xAxis))).normalizedOrNull()
      || palmForward.normalizedOrNull();
    if (!yAxis || !xAxis.cross(yAxis).normalizedOrNull()) return null;
    const relative = (point) => {
      const centered = point.minus(palmCenter).div(palmScale);
      return new Vec3(centered.dot(xAxis), centered.dot(yAxis), 0);
    };
    const thumbIp = vector(landmarks[3]);
    const thumbTip = vector(landmarks[4]);
    const middlePip = vector(landmarks[10]);
    const middleDip = vector(landmarks[11]);
    const middleTip = vector(landmarks[12]);
    const contactRatio = Math.min(
      middleTip.distanceToSegment(thumbIp, thumbTip),
      thumbTip.distanceToSegment(middleDip, middleTip),
      thumbTip.distanceTo(middleTip),
    ) / palmScale;
    const relativeMiddleTip = relative(middleTip);
    const first = middleMcp.minus(middlePip).normalizedOrNull();
    const second = middleDip.minus(middlePip).normalizedOrNull();
    const middleFlexion = first && second
      ? clamp(1 - Math.acos(clamp(first.dot(second), -1, 1)) / Math.PI, 0, 1)
      : 0;
    const last = this.previous;
    const elapsedSeconds = last ? Math.max(0, timestampMs - last.timestampMs) / 1000 : null;
    const validElapsed = elapsedSeconds >= 0.005 && elapsedSeconds <= 0.25;
    const middleTipSpeed = last && validElapsed
      ? relativeMiddleTip.distanceTo(last.middleTip) / elapsedSeconds
      : 0;
    const separationSpeed = last && validElapsed
      ? Math.max(0, contactRatio - last.contactRatio) / elapsedSeconds
      : 0;
    const middleFlexionDelta = last && validElapsed ? middleFlexion - last.middleFlexion : 0;
    this.previous = { timestampMs, contactRatio, middleTip: relativeMiddleTip, middleFlexion };
    return { contactRatio, middleTipSpeed, separationSpeed, middleFlexion, middleFlexionDelta };
  }
}

export class FingerSnapDetector {
  constructor(thresholds = {}) {
    this.thresholds = {
      contactEnterRatio: 0.62,
      contactExitRatio: 0.85,
      middleTipSpeed: 1.8,
      separationSpeed: 3,
      releaseWindowMs: 300,
      minimumEventIntervalMs: 180,
      missingHandResetMs: 250,
      ...thresholds,
    };
    this.reset();
  }
  reset() {
    this.phase = "WAITING_FOR_CONTACT";
    this.consecutiveContactFrames = 0;
    this.lastCloseContactMs = null;
    this.lastEventMs = null;
    this.lastHandMs = null;
  }
  accept(timestampMs, observation) {
    this.lastHandMs = timestampMs;
    const isLoadedPose = observation.contactRatio <= this.thresholds.contactEnterRatio || (
      observation.contactRatio <= 1.2 && observation.middleFlexion >= 0.35
    );
    const canEmit = this.lastEventMs === null
      || timestampMs - this.lastEventMs >= this.thresholds.minimumEventIntervalMs;
    if (this.phase === "WAITING_FOR_CONTACT") {
      this.updateContactFrames(isLoadedPose);
      if (this.consecutiveContactFrames >= 1 && canEmit) {
        this.phase = "ARMED";
        this.lastCloseContactMs = timestampMs;
      }
      return false;
    }
    if (this.phase === "ARMED") {
      if (isLoadedPose) this.lastCloseContactMs = timestampMs;
      const recentlyLoaded = this.lastCloseContactMs !== null
        && timestampMs - this.lastCloseContactMs <= this.thresholds.releaseWindowMs;
      const rapidMiddleExtension = observation.middleTipSpeed >= this.thresholds.middleTipSpeed
        && observation.middleFlexionDelta <= -0.03;
      // Keep the legacy class/target name for published specs. Product semantics are a forward
      // middle-finger flick, so palm-directed finger snaps must not pass on separation alone.
      const rapidRelease = rapidMiddleExtension
        && observation.separationSpeed >= this.thresholds.separationSpeed;
      const separated = observation.contactRatio >= this.thresholds.contactExitRatio;
      if (separated && rapidRelease && recentlyLoaded && canEmit) {
        this.phase = "WAITING_FOR_REARM";
        this.consecutiveContactFrames = 0;
        this.lastEventMs = timestampMs;
        return true;
      }
      const expired = this.lastCloseContactMs !== null
        && timestampMs - this.lastCloseContactMs > this.thresholds.releaseWindowMs;
      if (separated && expired) {
        this.phase = "WAITING_FOR_CONTACT";
        this.consecutiveContactFrames = 0;
        this.lastCloseContactMs = null;
      }
      return false;
    }
    this.updateContactFrames(isLoadedPose);
    if (this.consecutiveContactFrames >= 1 && canEmit) {
      this.phase = "ARMED";
      this.lastCloseContactMs = timestampMs;
    }
    return false;
  }
  onNoHand(timestampMs) {
    const missing = this.lastHandMs === null
      || timestampMs - this.lastHandMs >= this.thresholds.missingHandResetMs;
    if (missing) {
      this.phase = "WAITING_FOR_CONTACT";
      this.consecutiveContactFrames = 0;
      this.lastCloseContactMs = null;
    }
    return false;
  }
  updateContactFrames(contact) {
    this.consecutiveContactFrames = contact ? 1 : 0;
  }
}

function pointDistance(first, second) {
  return Math.sqrt(
    (finite(first?.x) - finite(second?.x)) ** 2
    + (finite(first?.y) - finite(second?.y)) ** 2
    + (finite(first?.z) - finite(second?.z)) ** 2,
  );
}

export class FingerGunRecoilFeatureExtractor {
  extract(landmarks) {
    if (!Array.isArray(landmarks) || landmarks.length < 21) return null;
    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    const middleMcp = landmarks[9];
    const ringMcp = landmarks[13];
    const pinkyMcp = landmarks[17];
    const palmScale = Math.max(pointDistance(indexMcp, pinkyMcp), pointDistance(wrist, middleMcp));
    if (!Number.isFinite(palmScale) || palmScale < 0.015) return null;
    const extension = (start, joint1, joint2, tip) => {
      const chain = pointDistance(start, joint1) + pointDistance(joint1, joint2) + pointDistance(joint2, tip);
      return chain > 0.00001 ? clamp(pointDistance(start, tip) / chain, 0, 1) : 0;
    };
    const fingerExtension = (mcp) => extension(
      landmarks[mcp], landmarks[mcp + 1], landmarks[mcp + 2], landmarks[mcp + 3],
    );
    const thumbExtension = extension(landmarks[1], landmarks[2], landmarks[3], landmarks[4]);
    const indexExtension = fingerExtension(5);
    const middleExtension = fingerExtension(9);
    const ringExtension = fingerExtension(13);
    const pinkyExtension = fingerExtension(17);
    const indexTip = landmarks[8];
    const barrelX = finite(indexTip.x) - finite(indexMcp.x);
    const barrelY = finite(indexTip.y) - finite(indexMcp.y);
    const barrelZ = finite(indexTip.z) - finite(indexMcp.z);
    const barrelLength = Math.sqrt(barrelX ** 2 + barrelY ** 2 + barrelZ ** 2);
    const nonVerticalLength = Math.hypot(barrelX, barrelZ);
    const barrelNonVerticalRatio = barrelLength > 0.00001 ? nonVerticalLength / barrelLength : 0;
    const thumbSpread = pointDistance(landmarks[4], indexMcp) / palmScale;
    const curled = [middleExtension, ringExtension, pinkyExtension];
    const isFingerGun = thumbExtension >= 0.5
      && indexExtension >= 0.52
      && curled.filter((value) => value <= 0.95).length >= 2
      && Math.max(...curled) <= 0.98
      && thumbSpread >= 0.18
      && barrelNonVerticalRatio >= 0.08;
    const palmCenterY = [wrist, indexMcp, middleMcp, ringMcp, pinkyMcp]
      .reduce((sum, point) => sum + finite(point.y), 0) / 5;
    const barrelElevationDeg = Math.atan2(-barrelY, nonVerticalLength) * 180 / Math.PI;
    return {
      isFingerGun,
      palmCenterY,
      palmScale,
      barrelElevationDeg,
      thumbExtension,
      indexExtension,
      middleExtension,
      ringExtension,
      pinkyExtension,
      barrelNonVerticalRatio,
      thumbSpread,
    };
  }
}

export class FingerGunRecoilDetector {
  constructor(thresholds = {}) {
    this.thresholds = {
      poseStableMs: 30,
      poseGraceMs: 1500,
      upwardPalmWidths: 0.1,
      barrelRiseDeg: 6,
      recoilWindowMs: 1000,
      minimumEventIntervalMs: 180,
      returnPalmWidths: 0.12,
      returnBarrelDeg: 6,
      missingPoseResetMs: 900,
      ...thresholds,
    };
    this.reset();
  }
  reset() {
    this.phase = "WAITING_FOR_POSE";
    this.poseSinceMs = null;
    this.lastPoseMs = null;
    this.lastHandMs = null;
    this.lastEventMs = null;
    this.baseline = null;
    this.armedAtMs = null;
    this.peakUpwardPalmWidths = 0;
    this.peakBarrelRiseDeg = 0;
  }
  accept(timestampMs, observation) {
    this.lastHandMs = timestampMs;
    if (observation.isFingerGun) this.lastPoseMs = timestampMs;
    else {
      const latched = this.phase !== "WAITING_FOR_POSE"
        && this.lastPoseMs !== null
        && timestampMs - this.lastPoseMs <= this.thresholds.poseGraceMs;
      if (!latched) return this.onPoseMissing(timestampMs);
    }
    const canEmit = this.lastEventMs === null
      || timestampMs - this.lastEventMs >= this.thresholds.minimumEventIntervalMs;
    if (this.phase === "WAITING_FOR_POSE") {
      if (this.poseSinceMs === null) this.poseSinceMs = timestampMs;
      if (timestampMs - this.poseSinceMs >= this.thresholds.poseStableMs && canEmit) {
        this.baseline = observation;
        this.armedAtMs = timestampMs;
        this.lastEventMs = timestampMs;
        this.phase = "ARMED";
        return true;
      }
      return false;
    }
    if (this.phase === "ARMED") {
      if (this.baseline === null || this.armedAtMs === null
          || timestampMs - this.armedAtMs > this.thresholds.recoilWindowMs) {
        this.baseline = observation;
        this.armedAtMs = timestampMs;
      }
      const [upward, rise] = this.recoilMotion(observation);
      if (canEmit && (upward >= this.thresholds.upwardPalmWidths || rise >= this.thresholds.barrelRiseDeg)) {
        this.lastEventMs = timestampMs;
        this.peakUpwardPalmWidths = upward;
        this.peakBarrelRiseDeg = rise;
        this.phase = "WAITING_FOR_RETURN";
        return true;
      }
      return false;
    }
    const [upward, rise] = this.recoilMotion(observation);
    this.peakUpwardPalmWidths = Math.max(this.peakUpwardPalmWidths, upward);
    this.peakBarrelRiseDeg = Math.max(this.peakBarrelRiseDeg, rise);
    const reversed = this.peakUpwardPalmWidths - upward >= this.thresholds.returnPalmWidths
      || this.peakBarrelRiseDeg - rise >= this.thresholds.returnBarrelDeg;
    if (reversed || (upward <= this.thresholds.returnPalmWidths && rise <= this.thresholds.returnBarrelDeg)) {
      this.baseline = observation;
      this.armedAtMs = timestampMs;
      this.peakUpwardPalmWidths = 0;
      this.peakBarrelRiseDeg = 0;
      this.phase = "ARMED";
    }
    return false;
  }
  onNoHand(timestampMs) {
    const missing = this.lastHandMs === null
      || timestampMs - this.lastHandMs >= this.thresholds.missingPoseResetMs;
    if (missing) this.resetForMissingPose();
    return false;
  }
  onPoseMissing(timestampMs) {
    this.poseSinceMs = null;
    const missing = this.lastPoseMs === null
      || timestampMs - this.lastPoseMs >= this.thresholds.missingPoseResetMs;
    if (missing) this.resetForMissingPose();
    return false;
  }
  resetForMissingPose() {
    this.phase = "WAITING_FOR_POSE";
    this.poseSinceMs = null;
    this.lastPoseMs = null;
    this.baseline = null;
    this.armedAtMs = null;
    this.peakUpwardPalmWidths = 0;
    this.peakBarrelRiseDeg = 0;
  }
  recoilMotion(observation) {
    if (!this.baseline) return [0, 0];
    return [
      (this.baseline.palmCenterY - observation.palmCenterY) / Math.max(this.baseline.palmScale, 0.00001),
      observation.barrelElevationDeg - this.baseline.barrelElevationDeg,
    ];
  }
}

export class VisionTargetDetector {
  constructor(configValue) {
    this.config = normalizeVisionConfig(configValue);
    this.reset();
  }
  reset() {
    this.matched = false;
    this.qualifiedSinceMs = null;
    this.browBaseline = null;
    this.browSamples = 0;
    this.cheekBaseline = null;
    this.cheekSamples = 0;
    this.calibrationUntilMs = null;
    this.snapExtractor = new FingerSnapFeatureExtractor();
    this.snapDetector = new FingerSnapDetector();
    this.recoilExtractor = new FingerGunRecoilFeatureExtractor();
    this.recoilDetector = new FingerGunRecoilDetector();
  }
  score(timestampMs, value) {
    if (this.matched || this.config.continuous) return null;
    const confidence = clamp(finite(value), 0, 1);
    if (confidence < this.config.minConfidence) {
      this.qualifiedSinceMs = null;
      return null;
    }
    if (this.qualifiedSinceMs === null) this.qualifiedSinceMs = timestampMs;
    if (timestampMs - this.qualifiedSinceMs < this.config.stableForMs) return null;
    this.matched = true;
    return { kind: "matched", confidence };
  }
  hand(timestampMs, result) {
    const landmarks = result?.landmarks?.[0];
    if (this.config.target === "hand_finger_snap") {
      if (!Array.isArray(landmarks) || landmarks.length < 21) {
        this.snapExtractor.reset();
        this.snapDetector.onNoHand(timestampMs);
        return null;
      }
      const points = landmarks.map((point) => ({ x: point.x, y: point.y, z: 0 }));
      const observation = this.snapExtractor.extract(timestampMs, points);
      const pulse = observation
        ? this.snapDetector.accept(timestampMs, observation)
        : this.snapDetector.onNoHand(timestampMs);
      return pulse ? { kind: "activity" } : null;
    }
    if (this.config.target === "hand_finger_gun_recoil") {
      const observation = this.recoilExtractor.extract(landmarks);
      const pulse = observation
        ? this.recoilDetector.accept(timestampMs, observation)
        : this.recoilDetector.onNoHand(timestampMs);
      return pulse ? { kind: "activity" } : null;
    }
    const category = result?.gestures?.[0]?.[0];
    const expected = HAND_CATEGORY_BY_TARGET[this.config.target];
    const observed = String(category?.categoryName || category?.displayName || "");
    return this.score(timestampMs, observed === expected ? finite(category?.score) : 0);
  }
  face(timestampMs, result) {
    const landmarks = result?.faceLandmarks?.[0];
    const categories = result?.faceBlendshapes?.[0]?.categories;
    let value = faceBlendshapeScore(this.config.target, categories);
    if (BROW_TARGETS.has(this.config.target)) {
      const gap = eyebrowToEyeGap(landmarks);
      value = this.calibratedRatio(timestampMs, gap, "brow", value, 0.08,
        this.config.target === "face_brow_furrow");
    } else if (this.config.target === "face_cheek_puff") {
      value = this.calibratedRatio(timestampMs, faceOvalRatio(landmarks), "cheek", 0, 0.06, false);
    }
    return this.score(timestampMs, value);
  }
  calibratedRatio(timestampMs, current, kind, fallback, fullScale, invert) {
    if (this.calibrationUntilMs === null) this.calibrationUntilMs = timestampMs + 700;
    const baselineKey = kind === "brow" ? "browBaseline" : "cheekBaseline";
    const samplesKey = kind === "brow" ? "browSamples" : "cheekSamples";
    if (Number.isFinite(current) && timestampMs < this.calibrationUntilMs) {
      const samples = this[samplesKey];
      this[baselineKey] = ((this[baselineKey] || 0) * samples + current) / (samples + 1);
      this[samplesKey] = samples + 1;
      return 0;
    }
    const baseline = this[baselineKey];
    if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline <= 0.0001) return fallback;
    const relative = (current - baseline) / baseline;
    return clamp((invert ? -relative : relative) / fullScale, 0, 1);
  }
}
