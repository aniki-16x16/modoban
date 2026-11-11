import assert from 'node:assert/strict'
import test from 'node:test'
import { GameController, GameEngine } from '../src/engine/index.ts'
import type { GameState } from '../src/engine/index.ts'
import { chapterOne } from '../src/levels/chapter-one.ts'
import { chapterFinaleRecovery, chapterOneSolutions, decode } from './fixtures/chapter-one-solutions.ts'
import { solve } from './helpers/solve.ts'

const level = chapterOne[4].definition
const position = (state: GameState, id: string) => state.entities.find(item => item.id === id)!.position
const boxedPlate = (state: GameState, id: string) => {
  const plate = level.mechanisms.find(item => item.id === id)!.position
  return state.entities.find(item => item.kind === 'box' && item.position?.x === plate.x && item.position.y === plate.y)?.id
}

test('05: the entrance teaches a row push and its dependent gate in one safe turn', () => {
  const engine = new GameEngine(level)
  const initial = engine.state
  for (const direction of ['up', 'down', 'left'] as const) assert.equal(engine.move(direction).accepted, false)
  engine.move('right')
  const before = engine.state
  const result = engine.move('right')
  assert.ok(result.accepted)
  const actions = result.trace.actions.filter(action => action.kind === 'door')
  assert.deepEqual(actions.map(action => action.sourceId), ['A', 'B'])
  const row = actions[0].changes.filter(change => change.kind === 'entity')
  assert.deepEqual(row.map(change => change.after.id), ['player', 'box-1', 'box-2'])
  assert.ok(row.every(change => change.after.position && change.before.position
    && change.after.position.y === change.before.position.y + 1))
  assert.equal(boxedPlate(engine.state, 'B'), 'box-2')
  assert.equal(engine.state.doors.find(door => door.id === 'B')!.extended, false)
  assert.ok(actions[1].dependsOn.includes(actions[0].id))
  assert.equal(engine.state.outcome.kind, 'playing')
  assert.deepEqual(position(engine.state, 'box-3'), position(initial, 'box-3'))
  assert.deepEqual(position(engine.state, 'box-4'), position(initial, 'box-4'))
  engine.undo()
  assert.equal(engine.state, before, 'One undo restores all three moved objects and the dependent gate')
})

test('05: different preparation and final placement orders complete all three causal chains', () => {
  assert.equal(level.width, 24)
  assert.equal(level.height, 16)
  assert.equal(level.entities.filter(item => item.kind === 'box').length, 4)
  assert.equal(level.mechanisms.length, 7)
  assert.equal(level.axes.length, 0)
  assert.ok(level.mechanisms.every(item => item.kind === 'pressure'))
  assert.ok(level.doors.every(item => item.initialExtended && item.inputs.length === 1 && item.inputs[0].kind === 'pressure'))
  const preparationStates = new Set<string>()
  const goalOrders = new Set<string>()
  for (const route of chapterOneSolutions[4]) {
    const engine = new GameEngine(level)
    const controller = new GameController(level)
    const initial = engine.state
    const chains: string[] = []
    const goalOrder: string[] = []
    let firstDHolder: string | undefined
    for (const direction of decode(route)) {
      const before = engine.state
      const result = engine.move(direction)
      assert.ok(result.accepted)
      assert.ok(engine.state.entities.every(item => item.position !== null), 'No destruction or sacrifice is needed')
      assert.equal(controller.input(direction), 'started')
      controller.advance(1000)
      assert.deepEqual(controller.state, engine.state)
      firstDHolder ??= boxedPlate(engine.state, 'D')
      for (const id of ['F', 'G']) if (boxedPlate(engine.state, id) && !goalOrder.includes(id)) goalOrder.push(id)
      const doorActions = result.trace.actions.filter(action => action.kind === 'door')
      const pushing = doorActions.find(action => action.changes.some(change => change.kind === 'entity'))
      if (!pushing) continue
      const chain = doorActions.map(action => action.sourceId).join('>')
      chains.push(chain)
      assert.equal(doorActions.length, 2, 'Each lesson/application is a legible two-door chain')
      assert.ok(doorActions[1].dependsOn.includes(pushing.id), 'The downstream gate must animate after the physical push')
      const moved = pushing.changes.filter(change => change.kind === 'entity')
      if (pushing.sourceId === 'C') {
        assert.equal(moved.filter(change => change.after.kind === 'box').length, 2)
        assert.equal(boxedPlate(engine.state, 'D'), 'box-4')
        preparationStates.add(JSON.stringify(position(engine.state, 'box-1')))
      }
      if (pushing.sourceId === 'D') {
        assert.equal(moved.length, 1)
        assert.equal(boxedPlate(engine.state, 'E'), 'box-1')
        assert.equal(engine.state.doors.find(door => door.id === 'E')!.extended, false)
      }
      const settled = engine.state
      assert.equal(engine.undo(), true)
      assert.equal(engine.state, before)
      engine.move(direction)
      assert.deepEqual(engine.state, settled, 'The whole chain must replay deterministically after one undo')
    }
    assert.deepEqual(chains, ['A>B', 'C>D', 'D>E'])
    assert.equal(firstDHolder, 'box-4')
    assert.equal(boxedPlate(engine.state, 'D'), 'box-3', 'The trailing crate takes over the opening made by the leading crate')
    assert.equal(engine.state.outcome.kind, 'won')
    assert.deepEqual(engine.state.pressures.filter(item => item.active).map(item => item.id).sort(), ['B', 'D', 'F', 'G'])
    goalOrders.add(goalOrder.join('>'))
    while (engine.canUndo) engine.undo()
    assert.equal(engine.state, initial)
    controller.reset()
    assert.deepEqual(controller.state, initial)
  }
  assert.equal(preparationStates.size, 2, 'Cargo can be staged before or after the main row stroke')
  assert.deepEqual(goalOrders, new Set(['F>G', 'G>F']))
})

test('05: the main row stroke is necessary even after the entrance has demonstrated it', () => {
  assert.equal(solve(level, (before, after) => !(position(before, 'box-3')?.y === 7
    && position(after, 'box-3')?.y === 8 && position(before, 'box-4')?.y === 8
    && position(after, 'box-4')?.y === 9)), null)
})

test('05: sealing the last room too early can be repaired by reopening the bridge, without undo or restart', () => {
  const engine = new GameEngine(level)
  for (const [index, direction] of decode(chapterFinaleRecovery).entries()) {
    assert.ok(engine.move(direction).accepted)
    assert.ok(engine.state.entities.every(item => item.position !== null))
    if (index === 115) {
      assert.equal(boxedPlate(engine.state, 'F'), 'box-1')
      assert.ok(position(engine.state, 'box-4')!.x < 15, 'The second delivery was left outside')
      assert.equal(engine.state.doors.find(door => door.id === 'E')!.extended, true)
    }
    if (index === 117) {
      assert.equal(boxedPlate(engine.state, 'F'), undefined)
      assert.equal(boxedPlate(engine.state, 'E'), 'box-1')
      assert.equal(engine.state.doors.find(door => door.id === 'E')!.extended, false)
    }
  }
  assert.equal(engine.state.outcome.kind, 'won')
})
