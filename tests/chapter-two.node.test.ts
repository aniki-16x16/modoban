import assert from 'node:assert/strict'
import test from 'node:test'
import { GameController, GameEngine } from '../src/engine/index.ts'
import type { Direction } from '../src/engine/index.ts'
import { chapterTwo } from '../src/levels/chapter-two.ts'
import { chapterTwoSolutions } from './fixtures/chapter-two-solutions.ts'

const definition = chapterTwo[0].definition
const directions: Record<string, Direction> = { u: 'up', r: 'right', d: 'down', l: 'left' }

for (const solution of chapterTwoSolutions) {
  test(`2-01 合拍: ${solution.name}`, () => {
    const engine = new GameEngine(definition)
    let cargoLoaded = false
    for (const [index, step] of [...solution.route].entries()) {
      const result = engine.move(directions[step])
      assert.ok(result.accepted, `Move ${index + 1} is blocked`)
      assert.ok(result.state.entities.every(entity => entity.position !== null), 'The solution must not destroy an entity')
      cargoLoaded ||= result.trace.actions.some(action => action.kind === 'door' && action.sourceId === 'loader'
        && action.changes.some(change => change.kind === 'entity' && change.after.id === solution.cargo))
    }
    assert.equal(engine.state.outcome.kind, 'won')
    assert.ok(cargoLoaded, 'The periodic loader must turn the cargo into the vertical shaft')
    assert.deepEqual(engine.state.entities.find(entity => entity.id === solution.cargo)!.position, { x: 10, y: 4 })
    assert.ok(engine.state.pressures.filter(plate => plate.id !== 'A').every(plate => plate.active))
    assert.equal(engine.state.pressures.find(plate => plate.id === 'A')!.active, false)
  })
}

test('2-01 合拍: the safe entrance teaches the cycle and restores it on undo and reset', () => {
  const controller = new GameController(definition)
  const initial = controller.state
  controller.advance(10_000)
  assert.strictEqual(controller.state, initial)
  assert.equal(controller.input('left'), 'blocked')
  assert.strictEqual(controller.state, initial)
  for (const [direction, phase, extended] of [
    ['right', 1, true], ['right', 2, false], ['right', 3, false], ['down', 0, true],
  ] as const) {
    assert.equal(controller.input(direction), 'started')
    controller.advance(10_000)
    assert.equal(controller.frame().state.axes[0].phase, phase)
    assert.ok(controller.frame().state.doors.filter(door => door.id === 'entry' || door.id === 'loader').every(door => door.extended === extended))
  }
  assert.ok(controller.undo())
  assert.equal(controller.frame().state.axes[0].phase, 3)
  controller.reset()
  assert.deepEqual(controller.frame().state, initial)
})
