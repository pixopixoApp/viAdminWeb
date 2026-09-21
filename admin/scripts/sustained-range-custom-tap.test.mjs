import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { transformWithEsbuild } from 'vite'

const interactionUrl = new URL('../src/types/interaction.ts', import.meta.url)
const interactionSource = await readFile(interactionUrl, 'utf8')
const transformed = await transformWithEsbuild(interactionSource, interactionUrl.pathname, {
  loader: 'ts',
  format: 'esm',
})
const encoded = Buffer.from(transformed.code).toString('base64')
const interaction = await import(`data:text/javascript;base64,${encoded}`)

const timelineUtilsUrl = new URL('../src/components/editor/timelineUtils.ts', import.meta.url)
const timelineUtilsSource = await readFile(timelineUtilsUrl, 'utf8')
const timelineUtilsTransformed = await transformWithEsbuild(
  timelineUtilsSource,
  timelineUtilsUrl.pathname,
  { loader: 'ts', format: 'esm' },
)
const timelineUtils = await import(
  `data:text/javascript;base64,${Buffer.from(timelineUtilsTransformed.code).toString('base64')}`
)

const entrySources = await Promise.all([
  readFile(new URL('../src/pages/AnnotatePage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/StoryEditPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/story-edit/ClipEditor.tsx', import.meta.url), 'utf8'),
])
const inspectorSource = await readFile(
  new URL('../src/components/editor/InteractionInspector.tsx', import.meta.url),
  'utf8',
)
const workspaceSource = await readFile(
  new URL('../src/components/editor/InteractionEditorWorkspace.tsx', import.meta.url),
  'utf8',
)
const classicEditorSource = await readFile(
  new URL('../src/components/editor/ClassicInteractionEditor.tsx', import.meta.url),
  'utf8',
)
const playerSource = await readFile(
  new URL('../src/components/PreviewPlayer.tsx', import.meta.url),
  'utf8',
)
const clientPreviewSource = await readFile(
  new URL('../src/components/editor/ClientRuntimePreview.tsx', import.meta.url),
  'utf8',
)

test('sustained ranges end at the earliest configured boundary', () => {
  const gate = { gesture: 'continuous_tap', gate_at_ms: 0, gate_end_ms: 8000 }
  assert.equal(interaction.sustainedPlaybackEndMs(gate, 5000, 10000), 5000)
  assert.equal(interaction.sustainedPlaybackEndMs(gate, 9000, 7000), 7000)
  assert.equal(
    interaction.sustainedPlaybackEndMs({ gesture: 'continuous_tap', gate_at_ms: 0 }, 5000, 10000),
    5000,
  )
})

test('gesture changes only preserve explicit ends between sustained interactions', () => {
  const continuousTap = { gesture: 'continuous_tap' }
  const continuousHold = { gesture: 'continuous_hold' }
  const tap = { gesture: 'tap' }
  const doubleTap = { gesture: 'double_tap' }

  assert.equal(
    interaction.shouldClearGateEndOnInteractionTypeChange(continuousTap, continuousHold),
    false,
  )
  assert.equal(
    interaction.shouldClearGateEndOnInteractionTypeChange(continuousTap, tap),
    true,
  )
  assert.equal(
    interaction.shouldClearGateEndOnInteractionTypeChange(tap, continuousTap),
    true,
  )
  assert.equal(
    interaction.shouldClearGateEndOnInteractionTypeChange(tap, doubleTap),
    true,
  )
  assert.equal(
    interaction.shouldClearGateEndOnInteractionTypeChange(tap, tap),
    false,
  )
  assert.equal(
    interaction.shouldClearGateEndOnInteractionTypeChange(
      { gesture: 'tap', custom_action: true },
      { gesture: 'tap', custom_action: false },
    ),
    true,
  )
})

test('custom tap count is operator-authored and clamped to one through ninety-nine', () => {
  assert.equal(interaction.AUTHORING_GESTURE_TYPES.includes('multi_tap'), true)
  assert.equal(interaction.enforceInteractionTypeRules({ gesture: 'multi_tap' }).tap_count, 3)
  assert.equal(interaction.enforceInteractionTypeRules({ gesture: 'multi_tap', tap_count: 0 }).tap_count, 1)
  assert.equal(interaction.enforceInteractionTypeRules({ gesture: 'multi_tap', tap_count: 120 }).tap_count, 99)
  assert.equal(interaction.enforceInteractionTypeRules({ gesture: 'tap', tap_count: 7 }).tap_count, undefined)
})

test('professional editor remains available to both authoring entries', () => {
  for (const source of [entrySources[0], entrySources[2]]) {
    assert.match(source, /InteractionEditorWorkspace/)
    assert.match(source, /InteractionInspector/)
  }
  assert.match(entrySources[1], /<ClipEditor/)
})

test('manual annotation defaults to the classic editor and exposes expert mode', () => {
  assert.match(entrySources[0], /searchParams\.get\('mode'\) === 'expert'/)
  assert.match(entrySources[0], /if \(!expertMode\)/)
  assert.match(entrySources[0], /<ClassicInteractionEditor/)
  assert.match(entrySources[0], />\s*专家模式\s*</)
  assert.match(entrySources[0], />\s*返回基础模式\s*</)
  assert.match(classicEditorSource, /<PreviewPlayer/)
  assert.match(classicEditorSource, /usesRotationDirection/)
  assert.match(classicEditorSource, /期望结束/)
  assert.match(classicEditorSource, /自动：下一节点\/片尾/)
  assert.match(classicEditorSource, /把结束时间设为当前播放帧/)
  assert.match(classicEditorSource, /恢复自动/)
  assert.doesNotMatch(classicEditorSource, /自定义动作 <span/)
})

test('shared inspector distinguishes configured and effective ranges', () => {
  assert.match(inspectorSource, /期望结束/)
  assert.match(inspectorSource, /实际结束：/)
  assert.match(inspectorSource, /单点互动在当前帧触发，无需设置结束时间/)
  assert.match(inspectorSource, /shouldClearGateEndOnInteractionTypeChange/)
  assert.match(inspectorSource, /gate_end_ms: undefined/)
  assert.doesNotMatch(playerSource, /editor-create-end-handle/)
  assert.match(inspectorSource, /目标点击次数/)
  assert.match(inspectorSource, /gate_end_ms/)
  assert.match(inspectorSource, /tap_count/)
})

test('workspace supports click and drag authoring with clipped range feedback', () => {
  assert.match(workspaceSource, /draggable=\{editing && !hasChildren\}/)
  assert.match(workspaceSource, /application\/x-pixo-interaction/)
  assert.match(playerSource, /editor-interaction-overflow/)
  assert.match(playerSource, /beginGateDrag/)
  assert.match(playerSource, /onAddInteractionAt/)
})

test('interaction library is collapsible and defaults to the first group', () => {
  assert.match(workspaceSource, /<Collapse/)
  assert.match(workspaceSource, /accordion/)
  assert.match(workspaceSource, /defaultActiveKey=\{\['0'\]\}/)
  assert.match(workspaceSource, /interaction-library-option-copy/)
  assert.match(inspectorSource, /label: '持续互动'/)
  assert.match(inspectorSource, /SECONDARY_OPTIONS/)
  assert.match(workspaceSource, /interaction-library-secondary/)
  assert.match(workspaceSource, /option\.children/)
})

test('camera recognition targets are flat and unsupported custom actions are hidden', () => {
  assert.match(inspectorSource, /label: '摄像头识别'[\s\S]*flattenChildren: true/)
  assert.match(inspectorSource, /group\.flattenChildren && option\.children\?\.length/)
  assert.doesNotMatch(inspectorSource, /label: '其他'/)
  assert.doesNotMatch(inspectorSource, /label: '自定义动作', code: 'custom_action'/)
})

test('draw circle exposes and preserves clockwise and counterclockwise variants', () => {
  const clockwise = interaction.enforceInteractionTypeRules({
    gesture: 'draw_circle',
    rotation_direction: 'clockwise',
  })
  assert.equal(clockwise.rotation_direction, 'clockwise')
  assert.equal(
    interaction.enforceInteractionTypeRules({ gesture: 'draw_circle' }).rotation_direction,
    'counterclockwise',
  )
  assert.match(inspectorSource, /draw_circle'[\s\S]*顺时针画圆/)
  assert.match(inspectorSource, /draw_circle'[\s\S]*逆时针画圆/)
  assert.match(inspectorSource, /usesRotationDirection/)
})

test('timeline and main video scrub by frame while occupied frames are replaced', () => {
  assert.equal(timelineUtils.snapToEditorFrame(1000), 990)
  assert.match(playerSource, /editor-time-ruler/)
  assert.match(playerSource, /onPointerDown=\{onRailPointerDown\}/)
  assert.match(playerSource, /beginVideoScrub/)
  assert.match(playerSource, /is-frame-scrubbing/)
  assert.match(playerSource, /拖动时间轴或画面逐帧/)
  for (const source of entrySources.slice(0, 2)) {
    assert.match(source, /替换为/)
    assert.match(source, /existingIndex >= 0/)
    assert.doesNotMatch(source, /nearestAvailableInteractionFrame/)
  }
})

test('space remains a transport shortcut after adding another interaction', () => {
  assert.match(workspaceSource, /event\.currentTarget\.blur\(\)/)
  assert.match(playerSource, /addEventListener\('keydown', handleKeyDown, true\)/)
  assert.match(playerSource, /addEventListener\('keyup', handleKeyUp, true\)/)
  assert.match(clientPreviewSource, /selectedGateAtPlayhead/)
  assert.match(clientPreviewSource, /selectedGateAtPlayhead \? selectedSourceIndex : undefined/)
})
