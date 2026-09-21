# Pixo Native Bridge v1

Bridge v1 is the platform boundary between the shared Pixo Web Runtime and Android, iOS, or browser hosts.
The public API and payload semantics are normative; the private WebView message transport is not.

## Installation and version

Before an ExperienceSpec is loaded, `pixo-native-client.js` installs `window.PixoNative`:

```js
window.PixoNative = {
  version: 1,
  capabilities: {},
  getDeviceInfo,
  requestCapability,
  startMotion,
  stopMotion,
  startMicrophoneLevel,
  stopMicrophoneLevel,
  startCameraSignals,
  stopCameraSignals,
  vibrate,
  setMediaPlayback,
  shareExperience,
  on,
};
window.MotionCueNative = window.PixoNative; // temporary legacy compatibility alias
```

All commands return Promises. A command must resolve or reject within 15 seconds, except a user-facing
permission request, which may take up to 120 seconds. Starting a capability is idempotent for the
current WebView session. Stopping an inactive capability resolves with `status: "stopped"`.

`version` describes this contract, not the Android/iOS app version or Runtime version. The Runtime
must check that it falls inside the release manifest's supported Bridge range.

## Public methods

| Method | Result | Responsibility |
| --- | --- | --- |
| `getDeviceInfo()` | `DeviceInfo` | Return platform and supported native features. |
| `requestCapability(name)` | `CapabilityResult` | Request or inspect native authorization. |
| `startMotion()` | `OperationResult` | Begin normalized orientation/acceleration events. |
| `stopMotion()` | `OperationResult` | Stop all motion sampling for this Runtime. |
| `startMicrophoneLevel(config?)` | `OperationResult` | Begin normalized microphone events. `continuous_blow_v1` requests stable volume with echo cancellation when available; `continuous_voice_v1` requests minimally processed input for pitch estimation. |
| `stopMicrophoneLevel()` | `OperationResult` | Stop microphone capture and release native resources. |
| `startCameraSignals(config)` | `OperationResult` | Begin normalized camera telemetry. |
| `stopCameraSignals()` | `OperationResult` | Stop camera capture and release native resources. |
| `vibrate(style)` | `OperationResult` | Perform a best-effort haptic. |
| `setMediaPlayback(state)` | `OperationResult` | Apply host media play/mute/volume state. |
| `shareExperience()` | `OperationResult` | Present native share options or copy the canonical browser link for the hosted experience. |
| `on(name, handler)` | unsubscribe function | Subscribe to `motion`, `microphoneLevel`, or `cameraSignals`. |

The canonical logical RPC actions and envelopes are defined by `bridge-v1.schema.json`. Requests use:

```json
{
  "v": 1,
  "kind": "request",
  "id": "42",
  "method": "requestCapability",
  "params": { "name": "microphoneLevel" }
}
```

Responses use `kind: "response"` with the same `id`, `ok`, and either `result` or `error`. Capability
signals use `kind: "event"`, `name`, and `data`. Runtime-to-host telemetry uses
`kind: "runtime_event"` and `data`.

During Android migration, the shared client also includes `action = method` and `payload = params` on
request envelopes because the existing `JavascriptInterface` reads those names. These are explicitly
compatibility fields, not a second Bridge protocol. New native adapters must implement the canonical
`v/kind/method/params` fields.

A platform may use `JavascriptInterface`, `WKScriptMessageHandler`, or another private transport, but
it must preserve Promise completion, ordering within one capability stream, and the schema-visible
payloads.

## Status values

- `granted`: authorization is available; sampling may not have started.
- `denied`: the user or operating system denied authorization.
- `active`: sampling or the requested operation is active.
- `activity`: an on-device continuous detector emitted a liveness pulse.
- `matched`: an on-device one-shot detector matched its semantic target.
- `paused`: the host is inactive; no sampling or countdown should advance.
- `stopped`: the capability is no longer producing events.
- `preview`: the host intentionally disabled real interactive capabilities.
- `unavailable`: the device cannot provide the capability.
- `error`: an active operation failed.
- `played` / `applied`: haptic or media-control acknowledgement.
- `presented`: the native host displayed its share options.
- `copied`: the browser host copied the canonical experience link.
- `copy_failed`: the browser host could not write the link to the clipboard.

Permission denial and capability unavailability are Bridge capability results rather than gesture
samples. ExperienceSpec v1.0 maps both statuses uniformly: the active interaction falls back to
`hold` and preserves its original `on_success` and `on_miss` actions.

`vision` events with `status: activity` are ephemeral liveness pulses. They include only
`timestamp`, `target`, and optional aggregate `confidence`; raw camera frames and landmarks never
cross the Bridge. ExperienceSpec v1.3+ `camera_continuous` refreshes its authored idle lease on each
matching pulse and pauses playback when that lease expires.

## Event units

### `motion`

- `timestamp`: Unix time in milliseconds.
- `alpha`, `beta`, `gamma`: degrees using the Web Device Orientation convention.
- `acceleration_x/y/z`: linear acceleration in m/s² when available.
- `motion_score`, `shake_score`: normalized `0...100` values.

### `microphoneLevel`

- `timestamp`: Unix time in milliseconds.
- `rms`, `peak`: linear PCM amplitudes normalized to `0...1`.
- `rms_dbfs`, `peak_dbfs`: decibels relative to full scale.
- `score` and `volume_score`: the same normalized `0...100` loudness value.
- `instant_score`: unsmoothed short-window RMS score.
- `peak_score`: strongest short-window PCM peak mapped to `0...100`.
- `transient_score`: normalized onset score derived from peak rise and crest factor.
- `noise_score`: normalized noise-like score; hosts currently derive it from zero-crossing rate.
- `zero_crossing_rate`: short-window sign-change ratio in `0...1`.
- `low_frequency_ratio`: aggregate energy from `0...600 Hz` divided by total spectral energy.
- `pitch_hz`: estimated human-voice fundamental frequency; `0` means no stable pitch.
- `pitch_confidence`: periodic pitch clarity in `0...100`, independent of note height.
- `analysis_window_ms` and `emit_interval_ms`: native analysis and bridge delivery cadence.
- `audio_source`: diagnostic native capture source such as `unprocessed`, `voice_recognition`, or `mic`.
- `processing_profile`: active microphone profile (`legacy`, `continuous_blow_v1`, or `continuous_voice_v1`).
- `echo_canceler_available` and `echo_canceler_enabled`: playback-safe capture diagnostics.
- `status: "active"` must accompany samples.

All platforms use the same score mapping before emitting events: RMS dBFS `-60` maps to `0`, `-17`
maps to `100`, values are clamped, and light attack/release smoothing may be applied. The shared
Runtime owns tolerance, per-interaction classification, hysteresis, continuous-duration, success,
and miss decisions. New feature fields are optional so older Android/iOS/Web hosts remain compatible;
the Runtime falls back to `score` when a host does not provide them. Raw audio never crosses the
bridge.

For `continuous_blow_v1`, Android first tries `voice_communication` with system acoustic echo
cancellation enabled while leaving media volume, routing, and `AudioManager` mode unchanged. For
`continuous_voice_v1`, Android instead prioritizes `unprocessed` then `voice_recognition` without
echo cancellation so sustained vocal pitch is not progressively suppressed. Automatic gain control
and noise suppression stay disabled so authored thresholds remain predictable.

### `cameraSignals`

- `timestamp`: Unix time in milliseconds.
- `brightness`: normalized `0...1` average frame luminance.
- `motionLevel`: normalized `0...1` frame-difference telemetry.
- `faceCount`: non-negative integer.
- `faceCenter.x/y`: normalized `0...1` coordinates when a face is available.

Raw camera frames and raw audio samples never cross the JavaScript bridge. Semantic recognition must
declare its own capability; coarse camera motion must not be advertised as gesture or expression
recognition.

## Events from Runtime to host

The Runtime dispatches `pixo:runtime-event` as a DOM `CustomEvent`. The host forwards its `detail`
object to native code without changing `name`, cue identity, outcome, or Runtime version. Canonical
event names are `ready`, `mediaReady`, `started`, `gateOpened`, `gateResolved`, `segmentChanged`,
`gateFallback`, `resultActionDeferred`, `resultActionExecuted`, `replay`, `hostStateChanged`,
`playbackStateChanged`, `ended`, and `error`.

For ExperienceSpec v1.0, an interaction definition is identified by the tuple `itemId + videoId + cueId`.
Different video nodes may therefore reuse values such as `action_001`; the Runtime includes
all three fields in its events and hosts must preserve the tuple when correlating or reporting them.

Runtime emits `resultActionDeferred` when a `jump_video` or `end_experience` result using
`timing: video_end` is locked while the video tail is still playing. It emits
`resultActionExecuted` when any result action is applied. These events carry `outcome`,
`resultAction`, `targetVideoId`, `timing`, and `deferred`; the final event uses `deferred: true` when
it applies a previously locked result at media end.

## Lifecycle

When a card, WebView, scene, or app becomes inactive, the host dispatches:

```js
window.dispatchEvent(new CustomEvent("pixo:host-state", {
  detail: { active: false, allowAudio: false }
}));
```

It must also stop native sampling. On activation it emits `active: true`; the Runtime decides whether
to resume media, the remaining response window, or an unfinished capability. Background time must not
be counted as interaction time.

## Security

- Only trusted Runtime code may call the bridge.
- Hosts allow navigation and media origins explicitly and reject unknown RPC actions.
- ExperienceSpec is data and must not inject script, HTML, bridge methods, or executable URLs.
- Logs and analytics must not include raw microphone samples, camera frames, or permission prompts.
