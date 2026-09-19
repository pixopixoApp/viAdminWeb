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
const playerSource = await readFile(
  new URL('../src/components/PreviewPlayer.tsx', import.meta.url),
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

test('custom tap count is operator-authored and clamped to one through ninety-nine', () => {
  assert.equal(interaction.AUTHORING_GESTURE_TYPES.includes('multi_tap'), true)
  assert.equal(interaction.enforceInteractionTypeRules({ gesture: 'multi_tap' }).tap_count, 3)
  assert.equal(interaction.enforceInteractionTypeRules({ gesture: 'multi_tap', tap_count: 0 }).tap_count, 1)
  assert.equal(interaction.enforceInteractionTypeRules({ gesture: 'multi_tap', tap_count: 120 }).tap_count, 99)
  assert.equal(interaction.enforceInteractionTypeRules({ gesture: 'tap', tap_count: 7 }).tap_count, undefined)
})

test('both authoring entries use the shared professional editor', () => {
  for (const source of entrySources) {
    assert.match(source, /InteractionEditorWorkspace/)
    assert.match(source, /InteractionInspector/)
  }
})

test('shared inspector distinguishes configured and effective ranges', () => {
  assert.match(inspectorSource, /期望结束/)
  assert.match(inspectorSource, /响应结束/)
  assert.match(inspectorSource, /实际结束：/)
  assert.match(inspectorSource, /目标点击次数/)
  assert.match(inspectorSource, /gate_end_ms/)
  assert.match(inspectorSource, /tap_count/)
})

test('workspace supports click and drag authoring with clipped range feedback', () => {
  assert.match(workspaceSource, /draggable=\{editing\}/)
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
})

test('timeline scrubs by frame and resolves occupied frames without a modal', () => {
  assert.equal(timelineUtils.snapToEditorFrame(1000), 990)
  assert.deepEqual(
    timelineUtils.nearestAvailableInteractionFrame(
      [{ gate_at_ms: 1000, gesture: 'tap' }],
      1000,
      2000,
    ),
    { requestedMs: 990, resolvedMs: 1023, shiftFrames: 1 },
  )
  assert.match(playerSource, /editor-time-ruler/)
  assert.match(playerSource, /onPointerDown=\{onRailPointerDown\}/)
  assert.match(playerSource, /按住左右拖动逐帧/)
})
