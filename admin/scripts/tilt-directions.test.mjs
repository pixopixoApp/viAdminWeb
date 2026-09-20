import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTiltDetector,
  describeCue,
  validatePlayableTimeline,
} from '../../player/player-core.js'

const readings = Object.freeze({
  left: { gammaDegrees: -24, betaDegrees: 0 },
  right: { gammaDegrees: 24, betaDegrees: 0 },
  forward: { gammaDegrees: 0, betaDegrees: 24 },
  backward: { gammaDegrees: 0, betaDegrees: -24 },
})

test('tilt accepts all four directions and describes each direction', () => {
  for (const direction of Object.keys(readings)) {
    const timeline = {
      kind: 'interaction_timeline',
      interactions: [{
        gate_at_ms: 100,
        primary: { signal: 'motion.tilt', direction },
        fallback: { signal: 'ui.continue', after_ms: 1000 },
      }],
    }
    assert.equal(validatePlayableTimeline(timeline), timeline)
    assert.match(describeCue(timeline.interactions[0], 1).title, /倾斜手机/)
  }
})

test('tilt detectors use roll for left-right and pitch for forward-backward', () => {
  for (const [direction, reading] of Object.entries(readings)) {
    const detector = createTiltDetector({ direction, thresholdDegrees: 18, sustainMs: 100 })
    assert.equal(detector.update({ ...reading, atMs: 0 }).satisfied, false)
    assert.equal(detector.update({ ...reading, atMs: 100 }).satisfied, true)
  }

  const forward = createTiltDetector({ direction: 'forward', sustainMs: 1 })
  assert.throws(
    () => forward.update({ gammaDegrees: 30, atMs: 0 }),
    /betaDegrees must be finite/,
  )
})

test('tilt rejects noncanonical directions', () => {
  assert.throws(() => createTiltDetector({ direction: 'up' }), /forward, or backward/)
})
