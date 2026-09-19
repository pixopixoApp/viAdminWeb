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

const editorSources = await Promise.all([
  readFile(new URL('../src/pages/AnnotatePage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/story-edit/ClipEditor.tsx', import.meta.url), 'utf8'),
])

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

test('both editors expose optional end time and custom tap count', () => {
  for (const source of editorSources) {
    assert.match(source, /可选结束 \(s\)/)
    assert.match(source, /实际结束：/)
    assert.match(source, /目标点击次数/)
    assert.match(source, /gate_end_ms/)
    assert.match(source, /tap_count/)
  }
})
