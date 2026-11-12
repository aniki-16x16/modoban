import assert from 'node:assert/strict'
import test from 'node:test'
import { GameController, GameEngine } from '../src/engine/index.ts'
import type { Direction } from '../src/engine/index.ts'
import { chapterTwo } from '../src/levels/chapter-two.ts'
import { chapterTwoStagingSolutions, chapterTwoSolutions } from './fixtures/chapter-two-solutions.ts'

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

const relayDefinition = chapterTwo[1].definition

for (const solution of chapterTwoStagingSolutions) {
  test(`2-02 候场: ${solution.name}`, () => {
    const engine = new GameEngine(relayDefinition)
    let visitedBay = false
    let prematureDelivery = false
    let protectedDuringClosure = false
    let clearedBridge = false
    let delivered = false
    for (const [index, step] of [...solution.route].entries()) {
      const result = engine.move(directions[step])
      assert.ok(result.accepted, `Move ${index + 1} is blocked`)
      assert.ok(result.state.entities.every(entity => entity.position !== null), 'The solution must not destroy an entity')
      const first = result.state.entities.find(entity => entity.id === 'box-1')!.position!
      const second = result.state.entities.find(entity => entity.id === 'box-2')!.position!
      visitedBay ||= first.x === solution.bay.x && first.y === solution.bay.y && second.x === 4 && second.y === 6
      prematureDelivery ||= first.x === 8 && first.y === 4 && second.x === 4 && second.y === 6
      clearedBridge ||= prematureDelivery && first.x !== 8 && !result.state.pressures.find(plate => plate.id === 'B')!.active
      for (const action of result.trace.actions) {
        if (action.kind !== 'door' || action.sourceId !== 'relay') continue
        delivered ||= action.changes.some(change => change.kind === 'entity' && change.after.id === 'box-1')
        protectedDuringClosure ||= action.changes.some(change => change.kind === 'door' && change.after.extended)
          && first.x === solution.bay.x && first.y === solution.bay.y && second.x < 8 && (second.x !== 4 || second.y !== 6)
      }
    }
    assert.equal(engine.state.outcome.kind, 'won')
    assert.ok(visitedBay, 'Staging must leave the route free before the second box leaves C')
    assert.ok(protectedDuringClosure, 'The first box must stay safe while the clock advances during the second delivery')
    assert.ok(delivered, 'The upper box must use the periodic door to leave the upper corridor')
    assert.equal(prematureDelivery, solution.recovered)
    assert.equal(clearedBridge, solution.recovered)
    assert.deepEqual(engine.state.entities.find(entity => entity.id === 'box-1')!.position, { x: 8, y: 4 })
    assert.deepEqual(engine.state.entities.find(entity => entity.id === 'box-2')!.position, { x: 11, y: 7 })
    assert.deepEqual(engine.state.pressures.filter(plate => plate.active).map(plate => plate.id), ['B', 'D'])
  })
}

test('2-02 候场: undo interrupts the final timed delivery and restores the box, clock, and linked doors', () => {
  const controller = new GameController(relayDefinition)
  const initial = controller.state
  let checkedDelivery = false
  for (const step of chapterTwoStagingSolutions[0].route) {
    const before = controller.state
    assert.equal(controller.input(directions[step]), 'started')
    const first = controller.state.entities.find(entity => entity.id === 'box-1')!.position!
    if (first.x === 8 && first.y === 4) {
      assert.equal(controller.state.axes[0].phase, 0)
      assert.equal(controller.state.doors.find(door => door.id === 'delivery')!.extended, false)
      assert.ok(controller.undo())
      assert.deepEqual(controller.frame().state, before)
      checkedDelivery = true
      break
    }
    controller.advance(10_000)
  }
  assert.ok(checkedDelivery)
  controller.reset()
  assert.deepEqual(controller.frame().state, initial)
})

test('2-02 候场: the second box must stage before D until the first box is allowed onto B', () => {
  const engine = new GameEngine(relayDefinition)
  let staged = false
  for (const step of chapterTwoStagingSolutions[0].route) {
    assert.ok(engine.move(directions[step]).accepted)
    const first = engine.state.entities.find(entity => entity.id === 'box-1')!.position!
    const second = engine.state.entities.find(entity => entity.id === 'box-2')!.position!
    const player = engine.state.entities.find(entity => entity.kind === 'player')!.position!
    if (first.x !== 9 || first.y !== 3 || second.x !== 11 || second.y !== 5 || player.x !== 11 || player.y !== 4) continue
    const before = engine.state
    assert.ok(before.doors.find(door => door.id === 'delivery')!.extended)
    assert.equal(engine.move('down').accepted, false)
    assert.strictEqual(engine.state, before)
    staged = true
    break
  }
  assert.ok(staged)
})

test('2-02 候场: parking just past C loses the pushing position when the second box leaves the plate', () => {
  const engine = new GameEngine(relayDefinition)
  const preparation = 'uuuuurdrrrrrrdrrrdrrullllldlurullllldlluurdd'
  for (const step of `${preparation}uurrddddllurruu`) assert.ok(engine.move(directions[step]).accepted)
  assert.deepEqual(engine.state.entities.find(entity => entity.id === 'box-1')!.position, { x: 7, y: 3 })
  assert.deepEqual(engine.state.entities.find(entity => entity.kind === 'player')!.position, { x: 6, y: 4 })
  assert.equal(engine.state.pressures.find(plate => plate.id === 'C')!.active, false)
  assert.ok(engine.state.doors.find(door => door.id === 'C')!.extended)
  const before = engine.state
  assert.equal(engine.move('up').accepted, false)
  assert.strictEqual(engine.state, before)
})
