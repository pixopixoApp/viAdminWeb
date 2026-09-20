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
  assert.equal(spec.body.experience_spec_version, '1.9')
  assert.equal(hold.active_until_ms, 3000)
  assert.equal(hold.detection.response_window_ms, 0)
  assert.equal(taps.detection.required_tap_count, 7)
  assert.equal('active_until_ms' in taps, false)
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
  assert.equal(spec.body.experience_spec_version, '1.9')
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
  assert.match(runtime, /当前电脑无法真实触发，请使用播放器旁的模拟触发按钮/)
  assert.match(webHost, /isAdminPreview \? 400 : 1500/)
  assert.match(preview, /detail\.name === 'gateBlocked'/)
  assert.match(player, /桌面端模拟/)
  assert.match(player, /点击模拟触发/)
  assert.match(player, /客户端引导已按真实效果显示/)
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
