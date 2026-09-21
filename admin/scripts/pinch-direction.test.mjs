import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { transformWithEsbuild } from 'vite'

const url = new URL('../src/types/interaction.ts', import.meta.url)
const transformed = await transformWithEsbuild(await readFile(url, 'utf8'), url.pathname, { loader: 'ts', format: 'esm' })
const interaction = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`)
const { createPinchJudge, describeCue } = await import('../../player/player-core.js')

test('parent pinch has exactly two independently persisted directions', () => {
  assert.equal(interaction.normalizePinchDirection(undefined), 'inward')
  for (const direction of ['inward', 'outward']) {
    const normalized = interaction.enforceInteractionTypeRules({ gesture: 'pinch', pinch_direction: direction })
    assert.equal(normalized.gesture, 'pinch')
    assert.equal(normalized.pinch_direction, direction)
    assert.match(interaction.pinchDirectionCopy(direction).label, direction === 'inward' ? /Pinch-in/ : /Pinch-out/)
  }
  assert.equal(interaction.enforceInteractionTypeRules({ gesture: 'tap', pinch_direction: 'outward' }).pinch_direction, undefined)
})

test('both directions use loose travel but reject the opposite direction', () => {
  for (const direction of ['inward', 'outward']) {
    const judge = createPinchJudge({ direction })
    judge.begin(200)
    assert.equal(judge.update(200).done, false)
    assert.equal(judge.update(direction === 'inward' ? 206 : 194).done, false)
    assert.equal(judge.update(direction === 'inward' ? 194 : 206).done, true)
    const cue = describeCue({ primary: { signal: 'pointer.pinch', pinch_direction: direction } }, 1)
    assert.match(cue.title, direction === 'inward' ? /向内/ : /向外/)
  }
  assert.throws(() => createPinchJudge({ direction: 'both' }), /pinch_direction/)
})

test('direction guides reset invisibly and are present in every editor', async () => {
  const guide = await readFile(new URL('../src/components/PinchDirectionFields.tsx', import.meta.url), 'utf8')
  const inspector = await readFile(new URL('../src/components/editor/InteractionInspector.tsx', import.meta.url), 'utf8')
  assert.match(guide, /data-direction/)
  assert.match(guide, /prefers-reduced-motion/)
  assert.match(guide, /opacity:\s*0/)
  assert.match(inspector, /PinchDirectionFields/)
  assert.match(inspector, /pinchDirectionCopy/)
})
