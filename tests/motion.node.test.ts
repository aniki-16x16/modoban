import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultMotionSettings, playerScale } from '../src/motion.ts'
import type { EntityMotion } from '../src/engine/index.ts'

function motion(progress: number, vertical = false): EntityMotion {
  return { entityId: 'player', from: { x: 0, y: 0 }, to: vertical ? { x: 0, y: -1 } : { x: -1, y: 0 }, position: { x: 0, y: 0 }, actionId: 0, progress }
}

test('player deformation follows the travel axis, preserves area and recovers at clip boundaries', () => {
  assert.deepEqual(playerScale(undefined, defaultMotionSettings), { x: 1, y: 1 })
  for (const vertical of [false, true]) {
    for (const progress of [0, 1]) assert.deepEqual(playerScale(motion(progress, vertical), defaultMotionSettings), { x: 1, y: 1 })
    for (const progress of [0.1, 0.325, 0.65, 0.825, 0.95]) {
      const scale = playerScale(motion(progress, vertical), defaultMotionSettings)
      assert.ok(Math.abs(scale.x * scale.y - 1) < 1e-12)
      assert.deepEqual(playerScale(motion(progress, vertical), { stretch: 0, squash: 0 }), { x: 1, y: 1 })
    }
    const stretch = playerScale(motion(0.325, vertical), defaultMotionSettings)
    const squash = playerScale(motion(0.825, vertical), defaultMotionSettings)
    assert.ok((vertical ? stretch.y : stretch.x) > 1)
    assert.ok((vertical ? squash.y : squash.x) < 1)
  }
})
