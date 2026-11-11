import assert from 'node:assert/strict'
import test from 'node:test'
import { GameController, GameEngine } from '../src/engine/index.ts'
import type { GameState } from '../src/engine/index.ts'
import { chapterOne } from '../src/levels/chapter-one.ts'
import { chapterOneSolutions, decode } from './fixtures/chapter-one-solutions.ts'
import { solve, solveFrom } from './helpers/solve.ts'

const level = chapterOne[3].definition
const position = (state: GameState, id: string) => state.entities.find(item => item.id === id)!.position
const door = (state: GameState, id: string) => state.doors.find(item => item.id === id)!

function play(engine: GameEngine, route: string) {
  for (const direction of decode(route)) assert.ok(engine.move(direction).accepted)
}

test('04: the only entrance teaches a safe, undoable gate push before any crate puzzle', () => {
  const engine = new GameEngine(level)
  const initial = engine.state
  for (const direction of ['up', 'down', 'left'] as const) assert.equal(engine.move(direction).accepted, false)
  assert.ok(engine.move('right').accepted)
  const onPlate = engine.state
  assert.equal(door(onPlate, 'A').extended, false)
  const result = engine.move('right')
  assert.ok(result.accepted)
  assert.deepEqual(position(engine.state, 'player'), { x: 3, y: 2 })
  const pushes = result.trace.actions.filter(action => action.kind === 'door')
    .flatMap(action => action.changes.filter(change => change.kind === 'entity'))
  assert.equal(pushes.length, 1)
  assert.equal(pushes[0].after.id, 'player')
  assert.deepEqual(pushes[0].before.position, { x: 3, y: 1 })
  assert.deepEqual(pushes[0].after.position, { x: 3, y: 2 })
  assert.equal(engine.state.outcome.kind, 'playing')
  assert.deepEqual(engine.state.entities.filter(item => item.kind === 'box'), initial.entities.filter(item => item.kind === 'box'))
  engine.undo()
  assert.equal(engine.state, onPlate)
  engine.undo()
  assert.equal(engine.state, initial)
})

test('04: either temporary withdrawal teaches one-box ejection, then retraction for the pushing stance', () => {
  assert.equal(level.axes.length, 0)
  assert.equal(level.entities.filter(item => item.kind === 'box').length, 2)
  assert.ok(level.mechanisms.every(item => item.kind === 'pressure'))
  assert.ok(level.doors.every(item => item.initialExtended && item.inputs.length === 1 && item.inputs[0].kind === 'pressure'))
  const temporaryRows = new Set<number>()
  for (const route of chapterOneSolutions[3]) {
    const engine = new GameEngine(level)
    const controller = new GameController(level)
    const initial = engine.state
    const pushedByDoors: string[] = []
    let ejected = false
    let reopened = false
    let waitingTurns = 0
    for (const direction of decode(route)) {
      const before = engine.state
      const result = engine.move(direction)
      assert.ok(result.accepted)
      assert.equal(controller.input(direction), 'started')
      controller.advance(1000)
      assert.deepEqual(controller.state, engine.state)
      assert.ok(engine.state.entities.every(item => item.position !== null), 'Destruction is not part of this lesson')
      if (ejected && !reopened) {
        assert.deepEqual(position(engine.state, 'box-1'), { x: 8, y: 4 }, 'Holding the door extended does not push again, and retracting it does not pull')
        waitingTurns += 1
        if (!door(engine.state, 'B').extended) reopened = true
      }
      for (const action of result.trace.actions.filter(item => item.kind === 'door')) {
        const changes = action.changes.filter(change => change.kind === 'entity')
        assert.ok(changes.length <= 1, 'Pushing a row has not been taught')
        for (const change of changes) {
          pushedByDoors.push(`${action.sourceId}:${change.after.id}`)
          if (action.sourceId === 'B') {
            assert.deepEqual(change.before.position, { x: 8, y: 3 })
            assert.deepEqual(change.after.position, { x: 8, y: 4 })
            assert.equal(door(engine.state, 'B').extended, true)
            temporaryRows.add(position(engine.state, 'box-2')!.y)
            ejected = true
          }
        }
      }
      if (position(before, 'box-1')?.y === 4 && position(engine.state, 'box-1')?.y === 5) {
        assert.ok(reopened, 'The player must reclaim the gate cell before continuing the delivery')
      }
    }
    assert.deepEqual(pushedByDoors, ['A:player', 'B:box-1'], 'Show the principle first, then let the player apply it to a crate')
    assert.ok(reopened && waitingTurns >= 2)
    assert.equal(engine.state.outcome.kind, 'won')
    assert.deepEqual(engine.state.pressures.filter(item => item.active).map(item => item.id).sort(), ['C', 'D'])
    while (engine.canUndo) engine.undo()
    assert.equal(engine.state, initial)
    controller.reset()
    assert.deepEqual(controller.state, initial)
  }
  assert.deepEqual(temporaryRows, new Set([5, 7]), 'The control crate can be withdrawn to either side of its plate')
})

test('04: the top crate cannot be delivered without the gate ejecting it from the wall', () => {
  assert.equal(solve(level, (before, after) => !(position(before, 'box-1')?.x === 8
    && position(before, 'box-1')?.y === 3 && position(after, 'box-1')?.y === 4)), null)
})

test('04: firing the gate is insufficient without reopening it afterwards', () => {
  assert.equal(solve(level, (before, after) => !(position(before, 'box-1') !== null
    && position(before, 'box-1')!.y >= 4 && door(before, 'B').extended && !door(after, 'B').extended)), null)
})

test('04: committing the control crate to the final plate too early prevents the second opening', () => {
  const engine = new GameEngine(level)
  play(engine, chapterOneSolutions[3][0].slice(0, 19) + 'lldldldd')
  assert.deepEqual(position(engine.state, 'box-1'), { x: 8, y: 4 })
  assert.deepEqual(position(engine.state, 'box-2'), { x: 3, y: 8 })
  assert.equal(door(engine.state, 'B').extended, true)
  assert.equal(door(engine.state, 'D').extended, false)
  assert.equal(solveFrom(level, engine.state), null)
  while (engine.canUndo) engine.undo()
  play(engine, chapterOneSolutions[3][0])
  assert.equal(engine.state.outcome.kind, 'won')
})
