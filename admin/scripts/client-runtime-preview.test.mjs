import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const runtimeRoot = new URL('../../player/client-runtime/', import.meta.url)

async function previewContext(draft) {
  const values = new Map([
    ['pixo-admin:draft:test', JSON.stringify(draft)],
  ])
  const context = {
    URLSearchParams,
    console,
    performance,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) { return setTimeout(callback, 0) },
    addEventListener() {},
    location: { search: '?experience=test' },
    document: {
      documentElement: { setAttribute() {} },
      getElementById() { return null },
    },
    sessionStorage: {
      getItem(key) { return values.get(key) || null },
      setItem(key, value) { values.set(key, String(value)) },
    },
  }
  context.window = context
  context.globalThis = context
  vm.createContext(context)
  vm.runInContext(
    await readFile(new URL('interaction-catalog.js', runtimeRoot), 'utf8'),
    context,
  )
  vm.runInContext(
    await readFile(new URL('admin-preview-host.js', runtimeRoot), 'utf8'),
    context,
  )
  return context
}

async function runtimeTesting() {
  const context = { console }
  context.window = context
  context.globalThis = context
  vm.createContext(context)
  vm.runInContext(
    await readFile(new URL('interaction-catalog.js', runtimeRoot), 'utf8'),
    context,
  )
  vm.runInContext(
    await readFile(new URL('runtime.js', runtimeRoot), 'utf8'),
    context,
  )
  return context.PixoRuntime.testing
}

test('admin preview pins the same immutable Runtime release as Web and Android', async () => {
  const config = JSON.parse(await readFile(
    new URL('runtime.config.json', runtimeRoot),
    'utf8',
  ))
  const lock = JSON.parse(await readFile(
    new URL('release-lock.json', runtimeRoot),
    'utf8',
  ))

  assert.equal(config.runtime_version, '0.35.1')
  assert.equal(lock.runtime_version, config.runtime_version)
  for (const [file, expected] of Object.entries(lock.files)) {
    const bytes = await readFile(new URL(file, runtimeRoot))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, file)
  }
})

test('admin preview compiles gates through the client interaction catalog', async () => {
  const context = await previewContext({
    itemId: 'draft-one',
    title: 'Draft one',
    mediaUrl: '/video.mp4',
    durationMs: 5000,
    gates: [
      {
        sourceIndex: 0,
        gesture: 'continuous_hold',
        gate_at_ms: 0,
        gate_end_ms: 8000,
      },
      {
        sourceIndex: 1,
        gesture: 'multi_tap',
        gate_at_ms: 3000,
        tap_count: 7,
      },
    ],
  })

  const spec = context.PixoAdminPreview.buildSpec(JSON.parse(
    context.sessionStorage.getItem('pixo-admin:draft:test'),
  ))
  const [hold, taps] = spec.body.video[0].interactions
  assert.equal(spec.body.experience_spec_version, '1.10')
  assert.equal(hold.active_until_ms, 3000)
  assert.equal(hold.detection.response_window_ms, 0)
  assert.equal(taps.detection.required_tap_count, 7)
  assert.equal('active_until_ms' in taps, false)
})

test('single-video preview waits indefinitely for ordinary interactions', async () => {
  const context = await previewContext({
    itemId: 'double-tap-draft',
    mediaUrl: '/video.mp4',
    durationMs: 5000,
    gates: [{
      sourceIndex: 0,
      gesture: 'double_tap',
      gate_at_ms: 1000,
    }],
  })

  const spec = context.PixoAdminPreview.buildSpec(JSON.parse(
    context.sessionStorage.getItem('pixo-admin:draft:test'),
  ))
  const interaction = spec.body.video[0].interactions[0]
  assert.equal(interaction.pause_video, true)
  assert.equal(interaction.detection.response_window_ms, 0)
  assert.deepEqual(JSON.parse(JSON.stringify(interaction.on_success)), { action: 'continue' })
  assert.deepEqual(JSON.parse(JSON.stringify(interaction.on_miss)), { action: 'continue' })
})

test('runtime refuses a legacy deadline when success and miss do the same thing', async () => {
  const testing = await runtimeTesting()
  const singleVideoCue = {
    type: 'double_tap',
    on_success: { action: 'continue' },
    on_miss: { action: 'continue' },
  }
  const storyCue = {
    type: 'double_tap',
    on_success: { action: 'jump_video', target_video_id: 'success' },
    on_miss: { action: 'jump_video', target_video_id: 'failure' },
  }

  assert.equal(testing.responseDeadlineForCue(singleVideoCue, 650), 0)
  assert.equal(testing.responseDeadlineForCue(storyCue, 5000), 5000)
})

test('camera preview preserves the semantic client vision contract', async () => {
  const context = await previewContext({
    itemId: 'vision-draft',
    mediaUrl: '/video.mp4',
    gates: [{
      sourceIndex: 4,
      gesture: 'camera_motion',
      gate_at_ms: 1000,
      vision: {
        target: 'face_smile',
        camera_facing: 'front',
        show_preview: true,
        min_confidence: 0.6,
        stable_for_ms: 250,
      },
    }],
  })

  const spec = context.PixoAdminPreview.buildSpec(JSON.parse(
    context.sessionStorage.getItem('pixo-admin:draft:test'),
  ))
  const interaction = spec.body.video[0].interactions[0]
  assert.equal(interaction.id, 'admin-4')
  assert.deepEqual(JSON.parse(JSON.stringify(interaction.detection.vision)), {
    registry_version: 'v1',
    target: 'face_smile',
    camera_facing: 'front',
    show_preview: true,
    min_confidence: 0.6,
    stable_for_ms: 250,
  })
})

test('web vision frames use the monotonic callback clock across camera reattachment', async () => {
  const callbacks = []
  const context = {
    URL,
    console,
    location: { href: 'http://127.0.0.1:5174/player/client-runtime/index.html' },
    document: {
      currentScript: {
        src: 'http://127.0.0.1:5174/player/client-runtime/web-vision-session.js',
      },
    },
    navigator: { mediaDevices: { getUserMedia() {} } },
    WebAssembly: {},
    Worker: function Worker() {},
    createImageBitmap() {},
    setTimeout,
    clearTimeout,
    requestAnimationFrame() { return 1 },
    cancelAnimationFrame() {},
  }
  context.window = context
  context.globalThis = context
  vm.createContext(context)
  vm.runInContext(
    await readFile(new URL('web-vision-session.js', runtimeRoot), 'utf8'),
    context,
  )

  const session = context.PixoWebVision.createSession()
  const captured = []
  session.activeConfig = { target: 'hand_open_palm' }
  session.preview = {
    requestVideoFrameCallback(callback) {
      callbacks.push(callback)
      return callbacks.length
    },
  }
  session.captureFrame = (timestampMs) => captured.push(timestampMs)

  session.scheduleFrame()
  callbacks.shift()(5000, { mediaTime: 0 })
  session.scheduleFrame()
  callbacks.shift()(5033, { mediaTime: 0.033 })

  assert.deepEqual(captured, [5000, 5033])
})

test('web vision keeps its warm stream attached until it is actually released', async () => {
  const context = {
    URL,
    console,
    location: { href: 'http://127.0.0.1:5174/player/client-runtime/index.html' },
    document: {
      currentScript: {
        src: 'http://127.0.0.1:5174/player/client-runtime/web-vision-session.js',
      },
    },
    navigator: { mediaDevices: { getUserMedia() {} } },
    WebAssembly: {},
    Worker: function Worker() {},
    createImageBitmap() {},
    setTimeout,
    clearTimeout,
    requestAnimationFrame() { return 1 },
    cancelAnimationFrame() {},
  }
  context.window = context
  context.globalThis = context
  vm.createContext(context)
  vm.runInContext(
    await readFile(new URL('web-vision-session.js', runtimeRoot), 'utf8'),
    context,
  )

  let stopped = false
  const stream = {
    getTracks() {
      return [{ stop() { stopped = true } }]
    },
  }
  const session = context.PixoWebVision.createSession()
  session.stream = stream
  session.preview = { hidden: false, srcObject: stream }
  session.activeConfig = { target: 'hand_open_palm' }

  session.stop()
  assert.equal(session.preview.hidden, true)
  assert.equal(session.preview.srcObject, stream)
  assert.equal(stopped, false)

  session.releaseStream()
  assert.equal(stopped, true)
  assert.equal(session.preview.srcObject, null)
})

test('browser host connects semantic vision to the web camera session', async () => {
  const calls = []
  const runtimeSignals = []
  const parentMessages = []
  let signalVision
  const session = {
    supported() {
      calls.push(['supported'])
      return true
    },
    requestPermission(options) {
      calls.push(['requestPermission', options])
      return Promise.resolve({ status: 'granted' })
    },
    prepare(targets) {
      calls.push(['prepare', targets])
      return Promise.resolve({ status: 'granted' })
    },
    start(config) {
      calls.push(['start', config])
      return Promise.resolve({ status: 'active' })
    },
    stop() {
      calls.push(['stop'])
      return { status: 'stopped' }
    },
    dispose() {
      calls.push(['dispose'])
    },
  }
  const documentElement = {
    clientHeight: 800,
    getAttribute(name) {
      return name === 'data-pixo-admin-preview' ? 'true' : null
    },
    setAttribute() {},
    style: { setProperty() {} },
  }
  const context = {
    URLSearchParams,
    console,
    location: {
      search: '?experience=vision-host-test',
      origin: 'http://127.0.0.1:5174',
    },
    document: {
      documentElement,
      getElementById() { return null },
      addEventListener() {},
      removeEventListener() {},
    },
    navigator: {
      mediaDevices: { getUserMedia() {} },
      vibrate() {},
    },
    sessionStorage: { getItem() { return null } },
    requestAnimationFrame() { return 1 },
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
    addEventListener() {},
    removeEventListener() {},
    PixoWebVision: {
      createSession(options) {
        signalVision = options.onSignal
        calls.push(['createSession'])
        return session
      },
    },
    __pixoNativeReceive(envelope) {
      runtimeSignals.push(envelope)
    },
  }
  context.window = context
  context.globalThis = context
  context.parent = {
    postMessage(message, origin) {
      parentMessages.push([message, origin])
    },
  }
  vm.createContext(context)
  vm.runInContext(
    await readFile(new URL('web-host.js', runtimeRoot), 'utf8'),
    context,
  )

  const transport = context.__pixoNativeTransport
  const permission = await transport.post({
    kind: 'request',
    method: 'requestCapability',
    params: { name: 'vision' },
  })
  assert.equal(permission.status, 'granted')
  const started = await transport.post({
    kind: 'request',
    method: 'startVision',
    params: {
      target: 'hand_open_palm',
      camera_facing: 'front',
      show_preview: true,
    },
  })
  assert.equal(started.status, 'active')
  assert.deepEqual(JSON.parse(JSON.stringify(
    calls.find((call) => call[0] === 'requestPermission'),
  )), [
    'requestPermission',
    { facing: 'front' },
  ])
  assert.deepEqual(JSON.parse(JSON.stringify(
    calls.find((call) => call[0] === 'prepare'),
  )), [
    'prepare',
    ['hand_open_palm'],
  ])
  assert.equal(parentMessages[0][0].state, 'loading')
  assert.equal(parentMessages[1][0].state, 'ready')

  signalVision({ status: 'matched', target: 'hand_open_palm', confidence: 0.91 })
  const matched = runtimeSignals.find((envelope) => envelope.data.status === 'matched')
  assert.equal(matched.name, 'vision')
  assert.equal(matched.data.target, 'hand_open_palm')
  assert.equal((await transport.post({
    kind: 'request',
    method: 'stopVision',
    params: {},
  })).status, 'stopped')
})

test('admin preview exposes and compiles forward and backward tilt', async () => {
  const context = await previewContext({
    itemId: 'pitch-draft',
    mediaUrl: '/video.mp4',
    gates: [
      { sourceIndex: 0, gesture: 'tilt_forward', gate_at_ms: 1000 },
      { sourceIndex: 1, gesture: 'tilt_backward', gate_at_ms: 2000 },
    ],
  })

  const spec = context.PixoAdminPreview.buildSpec(JSON.parse(
    context.sessionStorage.getItem('pixo-admin:draft:test'),
  ))
  assert.equal(spec.body.experience_spec_version, '1.10')
  assert.deepEqual(
    JSON.parse(JSON.stringify(spec.body.video[0].interactions.map((item) => item.type))),
    ['tilt_forward', 'tilt_backward'],
  )
  assert.equal(context.PixoInteractionCatalog.get('tilt_forward').direction, 'forward')
  assert.equal(context.PixoInteractionCatalog.get('tilt_backward').direction, 'backward')
})

test('admin preview exposes a guarded capability simulation bridge', async () => {
  const context = await previewContext({
    itemId: 'simulation-draft',
    mediaUrl: '/video.mp4',
    gates: [],
  })
  let simulationCount = 0
  context.PixoRuntime = {
    simulateActiveInteraction() {
      simulationCount += 1
      return { status: 'resolved', cueId: 'admin-2' }
    },
  }

  assert.equal(context.__pixoRuntimeAuthoringSimulation, true)
  const result = await context.PixoAdminPreview.simulateActiveInteraction()
  assert.equal(result.status, 'resolved')
  assert.equal(result.cueId, 'admin-2')
  assert.equal(simulationCount, 1)
})

test('blocked desktop capabilities preserve guidance and use explicit authoring simulation', async () => {
  const runtime = await readFile(new URL('runtime.js', runtimeRoot), 'utf8')
  const guidance = await readFile(new URL('motion-guidance.js', runtimeRoot), 'utf8')
  const webHost = await readFile(new URL('web-host.js', runtimeRoot), 'utf8')
  const preview = await readFile(
    new URL('../src/components/editor/ClientRuntimePreview.tsx', import.meta.url),
    'utf8',
  )
  const previewHost = await readFile(new URL('admin-preview-host.js', runtimeRoot), 'utf8')
  const player = await readFile(
    new URL('../src/components/PreviewPlayer.tsx', import.meta.url),
    'utf8',
  )

  assert.match(guidance, /Unavailable here/)
  assert.match(runtime, /authoringSimulationAvailable/)
  assert.match(runtime, /blocked: active\.capabilityBlocked && !authoringSimulationAvailable/)
  assert.match(runtime, /function simulateActiveInteraction\(\)/)
  assert.match(runtime, /return domRuntime\.simulateActiveInteraction\(\)/)
  assert.match(runtime, /authoring_simulation/)
  assert.match(runtime, /fatalVisionFailure/)
  assert.match(runtime, /active\.capabilityBlocked[\s\S]*!isCameraCue\(active\.cue\)/)
  assert.match(runtime, /当前电脑无法真实触发，请使用播放器旁的模拟触发按钮/)
  assert.match(webHost, /isAdminPreview \? 400 : 1500/)
  assert.match(webHost, /PixoWebVision/)
  assert.match(webHost, /case "startVision"/)
  assert.match(preview, /detail\.name === 'gateBlocked'/)
  assert.match(preview, /suppressSimulationUntilPlaybackRef/)
  assert.match(preview, /detail\.name === 'seeked'/)
  assert.match(preview, /detail\.name === 'gateSimulationStarted'[\s\S]*onSimulationChange\(null\)/)
  assert.doesNotMatch(preview, /state === 'ready'\) setFrameReadyVersion/)
  assert.match(preview, /function activeRuntimeVideo/)
  assert.match(previewHost, /function activeRuntimeVideo/)
  assert.match(previewHost, /data-pixo-video-layer="incoming"/)
  assert.match(player, /桌面端模拟/)
  assert.match(player, /点击模拟触发/)
  assert.match(player, /客户端引导已按真实效果显示/)
  assert.match(player, /setClientSimulation\(null\)[\s\S]*simulateInteraction\(\)/)
})

test('vendored browser models match the pinned Web Vision release', async () => {
  const release = JSON.parse(await readFile(
    new URL('vision/release-lock.json', runtimeRoot),
    'utf8',
  ))
  for (const [name, expected] of Object.entries(release.models)) {
    const bytes = await readFile(new URL(`vision/models/${name}`, runtimeRoot))
    assert.equal(bytes.length, expected.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256)
  }
})

test('workspace copy and second-based control row stay removed', async () => {
  const workspace = await readFile(
    new URL('../src/components/editor/InteractionEditorWorkspace.tsx', import.meta.url),
    'utf8',
  )
  const player = await readFile(
    new URL('../src/components/PreviewPlayer.tsx', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(workspace, /点击添加到当前帧，也可以拖到时间轴。/)
  assert.match(player, /annotate && !workspace/)
  assert.match(player, /ClientRuntimePreview/)
})

test('workspace is locked to the real client experience without a mode switch', async () => {
  const player = await readFile(
    new URL('../src/components/PreviewPlayer.tsx', import.meta.url),
    'utf8',
  )
  const styles = await readFile(
    new URL('../src/styles.css', import.meta.url),
    'utf8',
  )

  assert.match(player, /const clientInteractionEnabled = true/)
  assert.doesNotMatch(player, /预览操作模式/)
  assert.doesNotMatch(player, /画面定位/)
  assert.doesNotMatch(player, /setClientInteractionEnabled/)
  assert.doesNotMatch(styles, /\.client-preview-mode/)
})
