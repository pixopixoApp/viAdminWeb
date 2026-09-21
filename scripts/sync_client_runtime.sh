#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WORKSPACE_DIR=$(CDPATH= cd -- "$REPO_DIR/.." && pwd)

ANDROID_RUNTIME_DIR=${PIXO_ANDROID_RUNTIME_DIR:-$WORKSPACE_DIR/.worktrees/pixo-android-sustained-ranges/pixo-runtime/src}
DEFAULT_WEBSITE_DIR=$WORKSPACE_DIR/.worktrees/pixo-website-sustained-ranges
if [ ! -d "$DEFAULT_WEBSITE_DIR" ]; then
  DEFAULT_WEBSITE_DIR=$WORKSPACE_DIR/archive/Pixo-website
fi
WEBSITE_DIR=${PIXO_WEBSITE_DIR:-$DEFAULT_WEBSITE_DIR}
OUTPUT_DIR=$REPO_DIR/player/client-runtime
VISION_PACKAGE_DIR=$WEBSITE_DIR/node_modules/@mediapipe/tasks-vision

require_file() {
  if [ ! -f "$1" ]; then
    echo "Missing client runtime source: $1" >&2
    exit 1
  fi
}

for file in \
  compatibility.js \
  interaction-catalog.js \
  motion-guidance.js \
  pixo-native-client.js \
  runtime.css \
  runtime.html \
  runtime.js
do
  require_file "$ANDROID_RUNTIME_DIR/$file"
done

for file in \
  web-host.js \
  web-microphone-meter.js \
  web-runtime.css \
  web-share.js \
  web-vision-detectors.mjs \
  web-vision-session.js \
  web-vision-worker.mjs
do
  require_file "$WEBSITE_DIR/game-src/$file"
done

require_file "$VISION_PACKAGE_DIR/vision_bundle.mjs"
require_file "$WEBSITE_DIR/vendor/pixo-runtime/runtime.config.json"
require_file "$WEBSITE_DIR/vendor/pixo-runtime/release-lock.json"
require_file "$WEBSITE_DIR/vendor/pixo-vision/models/face_landmarker.task"
require_file "$WEBSITE_DIR/vendor/pixo-vision/models/gesture_recognizer.task"

mkdir -p "$OUTPUT_DIR/fonts"
mkdir -p "$OUTPUT_DIR/contracts"
mkdir -p "$OUTPUT_DIR/vision/models"
mkdir -p "$OUTPUT_DIR/vision/wasm"

cp "$ANDROID_RUNTIME_DIR/compatibility.js" "$OUTPUT_DIR/compatibility.js"
cp "$ANDROID_RUNTIME_DIR/interaction-catalog.js" "$OUTPUT_DIR/interaction-catalog.js"
cp "$ANDROID_RUNTIME_DIR/motion-guidance.js" "$OUTPUT_DIR/motion-guidance.js"
cp "$ANDROID_RUNTIME_DIR/pixo-native-client.js" "$OUTPUT_DIR/pixo-native-client.js"
cp "$ANDROID_RUNTIME_DIR/runtime.css" "$OUTPUT_DIR/runtime.css"
cp "$ANDROID_RUNTIME_DIR/runtime.js" "$OUTPUT_DIR/runtime.js"
cp "$ANDROID_RUNTIME_DIR/runtime.html" "$OUTPUT_DIR/runtime.html"
cp "$ANDROID_RUNTIME_DIR/contracts/"* "$OUTPUT_DIR/contracts/"
cp "$WEBSITE_DIR/vendor/pixo-runtime/pixo-logo.png" "$OUTPUT_DIR/pixo-logo.png"
cp "$WEBSITE_DIR/vendor/pixo-runtime/runtime.config.json" "$OUTPUT_DIR/runtime.config.json"
cp "$WEBSITE_DIR/vendor/pixo-runtime/release-lock.json" "$OUTPUT_DIR/release-lock.json"
cp "$ANDROID_RUNTIME_DIR/fonts/"*.ttf "$OUTPUT_DIR/fonts/"
cp "$ANDROID_RUNTIME_DIR/runtime.html" "$OUTPUT_DIR/index.html"

perl -0pi -e "s~script-src 'self';~script-src 'self'; worker-src 'self' blob:;~" \
  "$OUTPUT_DIR/index.html"
perl -0pi -e 's~<title>Pixo Experience Runtime</title>~<title>Pixo Client Preview</title>~' \
  "$OUTPUT_DIR/index.html"
perl -0pi -e 's~<link rel="stylesheet" href="runtime.css">~<link rel="stylesheet" href="runtime.css">\n  <link rel="stylesheet" href="web-runtime.css">\n  <link rel="stylesheet" href="admin-preview.css">~' \
  "$OUTPUT_DIR/index.html"
perl -0pi -e 's~  <script src="compatibility.js" defer></script>\n  <script src="pixo-native-client.js" defer></script>\n  <script src="interaction-catalog.js" defer></script>\n  <script src="motion-guidance.js" defer></script>\n  <script src="runtime.js" defer></script>~  <script src="compatibility.js" defer></script>\n  <script src="web-microphone-meter.js" defer></script>\n  <script src="web-share.js" defer></script>\n  <script src="web-vision-session.js" defer></script>\n  <script src="interaction-catalog.js" defer></script>\n  <script src="admin-preview-host.js" defer></script>\n  <script src="web-host.js" defer></script>\n  <script src="pixo-native-client.js" defer></script>\n  <script src="motion-guidance.js" defer></script>\n  <script src="runtime.js" defer></script>~' \
  "$OUTPUT_DIR/index.html"

for file in \
  web-host.js \
  web-microphone-meter.js \
  web-runtime.css \
  web-share.js \
  web-vision-detectors.mjs \
  web-vision-session.js \
  web-vision-worker.mjs
do
  cp "$WEBSITE_DIR/game-src/$file" "$OUTPUT_DIR/$file"
done

cp "$VISION_PACKAGE_DIR/vision_bundle.mjs" "$OUTPUT_DIR/vision/vision_bundle.mjs"
cp "$VISION_PACKAGE_DIR/wasm/"*.js "$OUTPUT_DIR/vision/wasm/"
cp "$VISION_PACKAGE_DIR/wasm/"*.wasm "$OUTPUT_DIR/vision/wasm/"
cp "$WEBSITE_DIR/vendor/pixo-vision/models/"*.task "$OUTPUT_DIR/vision/models/"
cp "$WEBSITE_DIR/vendor/pixo-vision/THIRD_PARTY_LICENSES.txt" "$OUTPUT_DIR/vision/"
cp "$WEBSITE_DIR/vendor/pixo-vision/release-lock.json" "$OUTPUT_DIR/vision/"

echo "Client runtime synchronized into $OUTPUT_DIR"
