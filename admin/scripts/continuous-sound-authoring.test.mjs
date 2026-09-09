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

const soundFieldsSource = await readFile(
  new URL('../src/components/SoundInteractionFields.tsx', import.meta.url),
  'utf8',
)
const clipEditorSource = await readFile(
  new URL('../src/components/story-edit/ClipEditor.tsx', import.meta.url),
  'utf8',
)
const annotatePageSource = await readFile(
  new URL('../src/pages/AnnotatePage.tsx', import.meta.url),
  'utf8',
)

test('continuous sound is one primary authoring interaction', () => {
  const types = interaction.AUTHORING_GESTURE_TYPES

  assert.equal(types.filter((value) => value === 'mic_continuous').length, 1)
  assert.equal(types.includes('mic_blow_continuous'), false)
  assert.equal(types.includes('mic_level_continuous'), false)
  assert.equal(interaction.gestureAuthoringLabel('mic_continuous'), 'Continuous Sound')
  assert.equal(interactionSource.includes('Sound ›'), false)
})

test('sound targets map to stable runtime interaction types', () => {
  assert.deepEqual(interaction.continuousSoundInteractionPatch('blow_volume'), {
    gesture: 'mic_blow_continuous',
    hint: '持续吹气至目标音量以播放',
    pause_video: true,
  })
  assert.deepEqual(interaction.continuousSoundInteractionPatch('voice_pitch'), {
    gesture: 'mic_level_continuous',
    hint: '保持音调在目标范围内以播放',
    pause_video: true,
  })
})

test('both editors require the continuous sound target step', () => {
  assert.match(soundFieldsSource, /第二步：选择具体识别方式（必选）/)
  assert.match(interactionSource, /持续吹气（识别音量）/)
  assert.match(interactionSource, /持续发声（识别音调）/)

  for (const source of [clipEditorSource, annotatePageSource]) {
    assert.match(source, /AUTHORING_GESTURE_TYPES/)
    assert.match(source, /CONTINUOUS_SOUND_AUTHORING_TYPE/)
    assert.match(source, /isContinuousSound\(selected\)/)
    assert.match(source, /<SoundInteractionFields/)
  }
})
