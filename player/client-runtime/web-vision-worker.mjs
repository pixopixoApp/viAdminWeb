import {
  GestureRecognizer,
  FaceLandmarker,
  FilesetResolver,
} from "./vision/vision_bundle.mjs";
import {
  normalizeVisionConfig,
  VisionTargetDetector,
} from "./web-vision-detectors.mjs";

const workerScope = globalThis;
const baseUrl = new URL("./vision/", import.meta.url);
const modelUrls = Object.freeze({
  hand: new URL("models/gesture_recognizer.task", baseUrl).href,
  face: new URL("models/face_landmarker.task", baseUrl).href,
});

let filesetPromise = null;
let gestureRecognizer = null;
let faceLandmarker = null;
let gestureContinuousMode = null;
let faceTarget = "";
let detector = null;
let activeSessionId = 0;
let initializedFamilies = new Set();
let loaderSequence = 0;

function send(type, detail = {}, transfer = []) {
  workerScope.postMessage({ type, ...detail }, transfer);
}

function cleanError(error) {
  const message = error instanceof Error ? error.message : String(error || "Vision worker failed.");
  return message.slice(0, 160);
}

function fileset() {
  if (!filesetPromise) {
    // Module Workers must use MediaPipe's ESM loader. The classic loader keeps
    // ModuleFactory function-scoped when reached through dynamic import.
    filesetPromise = FilesetResolver.forVisionTasks(new URL("wasm/", baseUrl).href, true);
  }
  return filesetPromise;
}

async function taskFileset(label) {
  const resolved = await fileset();
  loaderSequence += 1;
  return {
    ...resolved,
    // Each task construction consumes and clears the SDK's global
    // ModuleFactory. A unique ESM URL re-evaluates the loader safely.
    wasmLoaderPath: `${resolved.wasmLoaderPath}?task=${label}-${loaderSequence}`,
  };
}

async function ensureHand(continuous = false) {
  if (gestureRecognizer && gestureContinuousMode === continuous) return;
  gestureRecognizer?.close?.();
  gestureRecognizer = null;
  const confidence = continuous ? 0.15 : 0.5;
  gestureRecognizer = await GestureRecognizer.createFromOptions(await taskFileset("hand"), {
    baseOptions: {
      modelAssetPath: modelUrls.hand,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: confidence,
    minHandPresenceConfidence: confidence,
    minTrackingConfidence: confidence,
  });
  gestureContinuousMode = continuous;
  initializedFamilies.add("hand");
}

async function ensureFace(target = "") {
  if (faceLandmarker && faceTarget === target) return;
  faceLandmarker?.close?.();
  faceLandmarker = null;
  faceLandmarker = await FaceLandmarker.createFromOptions(await taskFileset("face"), {
    baseOptions: {
      modelAssetPath: modelUrls.face,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.3,
    minFacePresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  });
  faceTarget = target;
  initializedFamilies.add("face");
}

async function initialize(families) {
  const requested = [...new Set(Array.isArray(families) ? families : [])]
    .filter((family) => family === "hand" || family === "face");
  for (const family of requested) {
    if (family === "hand") await ensureHand(false);
    if (family === "face") await ensureFace();
  }
  send("initialized", { families: [...initializedFamilies] });
}

async function start(sessionId, configValue) {
  const config = normalizeVisionConfig(configValue);
  if (config.family === "face") await ensureFace(config.target);
  else await ensureHand(config.continuous);
  activeSessionId = sessionId;
  detector = new VisionTargetDetector(configValue);
  send("started", { sessionId, target: config.target });
}

function detect(sessionId, bitmap, timestampMs) {
  try {
    if (!detector || sessionId !== activeSessionId) return;
    const startedAt = performance.now();
    const config = detector.config;
    const result = config.family === "face"
      ? faceLandmarker.detectForVideo(bitmap, timestampMs)
      : gestureRecognizer.recognizeForVideo(bitmap, timestampMs);
    const signal = config.family === "face"
      ? detector.face(timestampMs, result)
      : detector.hand(timestampMs, result);
    send("frame", {
      sessionId,
      target: config.target,
      inferenceMs: performance.now() - startedAt,
      signal,
    });
  } catch (error) {
    send("error", { sessionId, message: cleanError(error) });
  } finally {
    bitmap?.close?.();
  }
}

function stop(sessionId) {
  if (sessionId && sessionId !== activeSessionId) return;
  activeSessionId = 0;
  detector = null;
  send("stopped", { sessionId });
}

function dispose() {
  activeSessionId = 0;
  detector = null;
  gestureRecognizer?.close?.();
  faceLandmarker?.close?.();
  gestureRecognizer = null;
  faceLandmarker = null;
  gestureContinuousMode = null;
  faceTarget = "";
  initializedFamilies = new Set();
  loaderSequence = 0;
  close();
}

workerScope.addEventListener("message", (event) => {
  const message = event.data || {};
  Promise.resolve().then(async () => {
    if (message.type === "initialize") await initialize(message.families);
    else if (message.type === "start") await start(message.sessionId, message.config);
    else if (message.type === "frame") detect(message.sessionId, message.bitmap, message.timestampMs);
    else if (message.type === "stop") stop(message.sessionId);
    else if (message.type === "dispose") dispose();
  }).catch((error) => {
    message.bitmap?.close?.();
    send("error", { sessionId: message.sessionId || 0, message: cleanError(error) });
  });
});
