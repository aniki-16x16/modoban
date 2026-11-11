import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GameController, GameEngine, LevelValidationError, applyChanges,
  createAnimationPlan, motionEasings, parseLevel, sampleAnimation,
} from '../src/engine/index.ts'
import type {
  Direction, DoorDefinition, EntityDefinition, GameState, LevelDefinition,
  MechanismDefinition, Position, TurnTrace,
} from '../src/engine/index.ts'

const point = (x: number, y: number) => ({ x, y })
const player = (x = 0, y = 0): EntityDefinition => ({ id: 'player', kind: 'player', position: point(x, y) })
const box = (id: string, x: number, y: number, kind: 'box' | 'stone' = 'box'): EntityDefinition => ({ id, kind, position: point(x, y) })
const conveyor = (id: string, beltId: string, x: number, y: number, direction: Direction = 'right'): MechanismDefinition => ({ id, kind: 'conveyor', beltId, position: point(x, y), direction })
const hot = { id: 'hot', position: point(7, 0), initialPhase: 0, signals: [true] }
const axisInput = [{ kind: 'axis' as const, id: 'hot' }]

function door(id: string, x: number, y: number, direction: Direction = 'right', inputs = axisInput, initialExtended = false): DoorDefinition {
  return { id, position: point(x, y), direction, inputs, initialExtended }
}

function level(overrides: Partial<LevelDefinition> = {}): LevelDefinition {
  return {
    id: 'test', width: 8, height: 6, walls: [], exit: point(7, 5),
    entities: [player()], mechanisms: [], axes: [], doors: [], ...overrides,
  }
}

function entity(state: GameState, id: string) {
  const result = state.entities.find(item => item.id === id)
  assert.ok(result, `Missing entity ${id}`)
  return result
}

function move(engine: GameEngine, direction: Direction = 'down'): TurnTrace {
  const result = engine.move(direction)
  assert.equal(result.accepted, true)
  assert.ok(result.accepted)
  return result.trace
}

function assertInvariants(engine: GameEngine, state = engine.state) {
  const occupied = new Set(engine.level.axes.map(axis => `${axis.position.x},${axis.position.y}`))
  for (const item of state.entities) {
    if (!item.position) {
      assert.equal(item.conveyorId, null)
      continue
    }
    const key = `${item.position.x},${item.position.y}`
    assert.ok(!occupied.has(key), `Duplicate occupancy at ${key}`)
    assert.ok(item.position.x >= 0 && item.position.x < engine.level.width)
    assert.ok(item.position.y >= 0 && item.position.y < engine.level.height)
    assert.ok(!engine.level.walls.some(wall => wall.x === item.position!.x && wall.y === item.position!.y))
    occupied.add(key)
    if (item.conveyorId) {
      assert.ok(engine.level.mechanisms.some(mechanism => mechanism.kind === 'conveyor'
        && mechanism.beltId === item.conveyorId && mechanism.position.x === item.position!.x && mechanism.position.y === item.position!.y))
    }
  }
  state.doors.forEach((item, index) => {
    if (!item.extended) return
    const position = engine.level.doors[index].position
    const key = `${position.x},${position.y}`
    assert.ok(!occupied.has(key), `Door overlaps entity at ${key}`)
    occupied.add(key)
  })
  for (const pressure of state.pressures) {
    const position = engine.level.mechanisms.find(item => item.id === pressure.id)!.position
    assert.equal(pressure.active, state.entities.some(item => item.position?.x === position.x && item.position.y === position.y))
  }
  for (const axis of state.axes) {
    const locked = engine.level.mechanisms.some(mechanism => mechanism.kind === 'slot' && mechanism.axisId === axis.id
      && state.entities.some(item => item.kind !== 'player' && item.position?.x === mechanism.position.x && item.position.y === mechanism.position.y))
    assert.equal(axis.locked, locked)
  }
  engine.level.doors.forEach((definition, index) => {
    const allActive = definition.inputs.length > 0 && definition.inputs.every(input => {
      if (input.kind === 'pressure') return state.pressures.find(item => item.id === input.id)!.active
      const axis = state.axes.find(item => item.id === input.id)!
      return engine.level.axes.find(item => item.id === input.id)!.signals[axis.phase]
    })
    assert.equal(state.doors[index].targetExtended, definition.initialExtended !== allActive)
  })
}

test('valid movement commits one immutable turn; blocked movement preserves identity and undo history', () => {
  const engine = new GameEngine(level({ walls: [point(1, 0)] }))
  const initial = engine.state
  assert.deepEqual(engine.move('right'), { accepted: false, reason: 'blocked', state: initial })
  assert.equal(engine.state, initial)
  assert.equal(engine.canUndo, false)
  move(engine)
  assert.equal(engine.state.turn, 1)
  assert.deepEqual(entity(engine.state, 'player').position, point(0, 1))
  assert.deepEqual(entity(initial, 'player').position, point(0, 0))
  assert.throws(() => { Array.prototype.push.call(engine.state.entities, player()) }, TypeError)
  assert.equal(engine.undo(), true)
  assert.equal(engine.state, initial)
  assert.equal(engine.undo(), false)
})

for (const kind of ['box', 'stone'] as const) {
  test(`player can push one ${kind}, but cannot push a row`, () => {
    const engine = new GameEngine(level({ entities: [player(), box('first', 1, 0, kind), box('second', 3, 0)] }))
    move(engine, 'right')
    assert.deepEqual(entity(engine.state, 'first').position, point(2, 0))
    const before = engine.state
    assert.equal(engine.move('right').accepted, false)
    assert.equal(engine.state, before)
    assertInvariants(engine)
  })
}

test('a loaded board preserves initial placement, signals and phase until an effective action', () => {
  const engine = new GameEngine(level({
    axes: [hot], entities: [player(), box('box', 2, 2)],
    mechanisms: [conveyor('belt', 'A', 2, 2)], doors: [door('door', 4, 2)],
  }))
  assert.deepEqual(entity(engine.state, 'box').position, point(2, 2))
  assert.deepEqual(engine.state.doors[0], { id: 'door', extended: false, targetExtended: true })
  move(engine)
  assert.deepEqual(entity(engine.state, 'box').position, point(3, 2))
  assert.equal(engine.state.doors[0].extended, true)
})

test('logical belt ID permits exactly one transport while remaining on that belt', () => {
  const engine = new GameEngine(level({
    entities: [player(), box('box', 1, 2)],
    mechanisms: [conveyor('first', 'A', 1, 2), conveyor('second', 'A', 2, 2), conveyor('third', 'A', 3, 2)],
  }))
  move(engine)
  assert.deepEqual(entity(engine.state, 'box'), { id: 'box', kind: 'box', position: point(2, 2), conveyorId: 'A' })
  const after = engine.state
  engine.move('left')
  assert.equal(engine.state, after)
  assert.equal(entity(engine.state, 'box').conveyorId, 'A')
  move(engine)
  assert.deepEqual(entity(engine.state, 'box').position, point(3, 2))
})

test('pushing onto a belt immediately transports the box and then the player when space clears', () => {
  const engine = new GameEngine(level({
    entities: [player(0, 2), box('box', 1, 2)],
    mechanisms: [conveyor('one', 'A', 1, 2), conveyor('two', 'A', 2, 2), conveyor('three', 'A', 3, 2)],
  }))
  move(engine, 'right')
  assert.deepEqual(entity(engine.state, 'box').position, point(3, 2))
  assert.deepEqual(entity(engine.state, 'player').position, point(2, 2))
  assertInvariants(engine)
})

test('entering another logical belt transports again, then stops within its ID', () => {
  const engine = new GameEngine(level({
    entities: [player(), box('box', 1, 2, 'stone')],
    mechanisms: [conveyor('one', 'A', 1, 2), conveyor('two', 'B', 2, 2), conveyor('three', 'B', 3, 2)],
  }))
  const trace = move(engine)
  assert.deepEqual(entity(engine.state, 'box').position, point(3, 2))
  assert.equal(entity(engine.state, 'box').conveyorId, 'B')
  assert.equal(trace.actions.filter(action => action.kind === 'conveyor').length, 2)
})

test('leaving and reentering the same belt in one turn renews transport eligibility', () => {
  const engine = new GameEngine(level({
    axes: [hot], entities: [player(), box('box', 1, 2)],
    mechanisms: [conveyor('one', 'A', 1, 2), conveyor('two', 'A', 2, 1)],
    doors: [door('lift', 2, 2, 'up')],
  }))
  const trace = move(engine)
  assert.deepEqual(entity(engine.state, 'box').position, point(3, 1))
  assert.equal(entity(engine.state, 'box').conveyorId, null)
  assert.equal(trace.actions.filter(action => action.kind === 'conveyor').length, 2)
})

test('door motion entirely within one belt preserves its consumed marker', () => {
  const engine = new GameEngine(level({
    axes: [hot], entities: [player(), box('box', 2, 2)],
    mechanisms: [conveyor('one', 'A', 2, 2), conveyor('two', 'A', 3, 2), conveyor('three', 'A', 3, 1)],
    doors: [door('lift', 3, 2, 'up')],
  }))
  const trace = move(engine)
  assert.deepEqual(entity(engine.state, 'box').position, point(3, 1))
  assert.equal(entity(engine.state, 'box').conveyorId, 'A')
  assert.equal(trace.actions.filter(action => action.kind === 'conveyor').length, 1)
})

test('a blocked belt retries after a door retracts without consuming eligibility', () => {
  const engine = new GameEngine(level({
    axes: [hot], entities: [player(), box('box', 2, 2)],
    mechanisms: [conveyor('belt', 'A', 2, 2)], doors: [door('blocker', 3, 2, 'left', axisInput, true)],
  }))
  move(engine)
  assert.deepEqual(entity(engine.state, 'box').position, point(3, 2))
  assert.equal(engine.state.doors[0].extended, false)
})

test('reverse movement on a belt is a valid turn even when the player returns to the starting cell', () => {
  const engine = new GameEngine(level({
    entities: [player(2, 2)], axes: [{ id: 'cycle', position: point(7, 1), initialPhase: 0, signals: [false, true] }],
    mechanisms: [conveyor('one', 'A', 1, 2), conveyor('two', 'A', 2, 2)],
  }))
  move(engine, 'left')
  assert.deepEqual(entity(engine.state, 'player').position, point(2, 2))
  assert.equal(engine.state.turn, 1)
  assert.equal(engine.state.axes[0].phase, 1)
})

test('memory order resolves conveyor contention without pushing the other object', () => {
  const mechanisms = [conveyor('left', 'A', 1, 2), conveyor('right', 'B', 3, 2, 'left')]
  const definition = level({ entities: [player(), box('left', 1, 2), box('right', 3, 2)], mechanisms })
  const first = new GameEngine(definition)
  const reversed = new GameEngine({ ...definition, mechanisms: [...mechanisms].reverse() })
  move(first)
  move(reversed)
  assert.deepEqual(entity(first.state, 'left').position, point(2, 2))
  assert.deepEqual(entity(first.state, 'right').position, point(3, 2))
  assert.deepEqual(entity(reversed.state, 'right').position, point(2, 2))
  assertInvariants(first)
  assertInvariants(reversed)
})

test('a conveyor-pressure-door chain responds in the same turn, including plate release and retraction', () => {
  const engine = new GameEngine(level({
    entities: [player(), box('box', 1, 2)],
    mechanisms: [conveyor('belt', 'A', 1, 2), { id: 'plate', kind: 'pressure', position: point(2, 2) }],
    doors: [{ id: 'door', position: point(2, 2), direction: 'up', initialExtended: false, inputs: [{ kind: 'pressure', id: 'plate' }] }],
  }))
  const trace = move(engine)
  assert.deepEqual(entity(engine.state, 'box').position, point(2, 1))
  assert.equal(engine.state.pressures[0].active, false)
  assert.equal(engine.state.doors[0].extended, false)
  assert.equal(trace.actions.filter(action => action.kind === 'door').length, 2)
})

test('a door pushes an entire row, and newly entered conveyors move objects immediately', () => {
  const engine = new GameEngine(level({
    axes: [hot], entities: [player(), box('one', 1, 2), box('two', 2, 2, 'stone')],
    mechanisms: [conveyor('belt', 'A', 3, 2)], doors: [door('door', 1, 2)],
  }))
  const trace = move(engine)
  assert.deepEqual(entity(engine.state, 'one').position, point(2, 2))
  assert.deepEqual(entity(engine.state, 'two').position, point(4, 2))
  assert.equal(trace.actions.filter(action => action.kind === 'door').length, 1)
  assertInvariants(engine)
})

test('blocked doors destroy the softest object; equal hardness chooses the nearest', () => {
  const engine = new GameEngine(level({
    axes: [hot], entities: [player(), box('stone', 1, 2, 'stone'), box('near', 2, 2), box('far', 3, 2)],
    walls: [point(4, 2)], doors: [door('door', 1, 2)],
  }))
  move(engine)
  assert.equal(entity(engine.state, 'near').position, null)
  assert.deepEqual(entity(engine.state, 'stone').position, point(2, 2))
  assert.deepEqual(entity(engine.state, 'far').position, point(3, 2))
  assertInvariants(engine)
})

test('player hardness wins over a nearer box; the complete door action is undoable after death', () => {
  const engine = new GameEngine(level({
    axes: [hot], entities: [player(2, 0), box('box', 1, 1), box('stone', 3, 1, 'stone')],
    walls: [point(4, 1)], doors: [door('door', 1, 1)],
  }))
  const before = engine.state
  move(engine)
  assert.deepEqual(engine.state.outcome, { kind: 'dead', entityId: 'player', doorId: 'door' })
  assert.equal(entity(engine.state, 'player').position, null)
  assert.deepEqual(entity(engine.state, 'box').position, point(2, 1))
  assert.equal(engine.state.doors[0].extended, true)
  assert.equal(engine.move('right').accepted, false)
  engine.undo()
  assert.equal(engine.state, before)
})

test('stone is destructible when it is the softest remaining candidate', () => {
  const engine = new GameEngine(level({
    axes: [hot], entities: [player(), box('stone', 1, 2, 'stone')],
    walls: [point(2, 2)], doors: [door('door', 1, 2)],
  }))
  move(engine)
  assert.equal(entity(engine.state, 'stone').position, null)
})

test('extended doors are indestructible and contention follows door storage order', () => {
  const first = door('first', 2, 2)
  const second = door('second', 2, 2, 'left')
  const engine = new GameEngine(level({ axes: [hot], doors: [first, second] }))
  move(engine)
  assert.deepEqual(engine.state.doors.map(item => item.extended), [true, false])
  move(engine)
  assert.deepEqual(engine.state.doors.map(item => item.extended), [true, false])
})

test('crossing door actions recompute from the latest world state', () => {
  const up = door('up', 2, 2, 'up')
  const left = door('left', 2, 1, 'left')
  const definition = level({ axes: [hot], entities: [player(), box('box', 2, 2)], doors: [up, left] })
  const first = new GameEngine(definition)
  const reversed = new GameEngine({ ...definition, doors: [left, up] })
  move(first)
  move(reversed)
  assert.deepEqual(entity(first.state, 'box').position, point(1, 1))
  assert.equal(entity(reversed.state, 'box').position, null)
  assertInvariants(first)
  assertInvariants(reversed)
})

test('a door retracts without pulling and its mounting cell remains usable', () => {
  const engine = new GameEngine(level({
    axes: [hot], entities: [player(2, 2), box('box', 0, 2)],
    doors: [door('door', 1, 2, 'left', axisInput, true)],
  }))
  move(engine)
  assert.equal(engine.state.doors[0].extended, false)
  assert.deepEqual(entity(engine.state, 'box').position, point(0, 2))
})

for (const initialExtended of [false, true]) {
  test(`door AND inputs invert baseline ${initialExtended} without repeatedly toggling`, () => {
    const definition = level({
      entities: [player(1, 1)], axes: [hot],
      mechanisms: [{ id: 'plate', kind: 'pressure', position: point(1, 2) }],
      doors: [{ id: 'door', position: point(5, 2), direction: 'right', initialExtended,
        inputs: [{ kind: 'axis', id: 'hot' }, { kind: 'pressure', id: 'plate' }] }],
    })
    const engine = new GameEngine(definition)
    move(engine)
    assert.equal(engine.state.doors[0].extended, !initialExtended)
    assert.equal(engine.state.outcome.kind, 'playing')
    move(engine)
    assert.equal(engine.state.doors[0].extended, initialExtended)
  })
}

test('a door without inputs retains its initial state', () => {
  const engine = new GameEngine(level({ doors: [door('door', 5, 2, 'right', [], true)] }))
  move(engine)
  assert.equal(engine.state.doors[0].extended, true)
})

test('pushing stone into a slot stops the clock before this turn advances', () => {
  const engine = new GameEngine(level({
    entities: [player(1, 0), box('stone', 1, 1, 'stone')],
    axes: [{ id: 'cycle', position: point(2, 2), initialPhase: 0, signals: [false, true] }],
    mechanisms: [{ id: 'slot', kind: 'slot', position: point(1, 2), axisId: 'cycle' }],
  }))
  move(engine)
  assert.deepEqual(engine.state.axes[0], { id: 'cycle', phase: 0, locked: true })
  move(engine)
  assert.deepEqual(engine.state.axes[0], { id: 'cycle', phase: 1, locked: false })
})

test('player does not lock a slot; any box or stone in multiple slots locks their shared axis', () => {
  const engine = new GameEngine(level({
    entities: [player(0, 0), box('box', 1, 2)],
    axes: [{ id: 'cycle', position: point(1, 1), initialPhase: 0, signals: [false, true] }],
    mechanisms: [
      { id: 'first', kind: 'slot', position: point(0, 1), axisId: 'cycle' },
      { id: 'second', kind: 'slot', position: point(1, 2), axisId: 'cycle' },
    ],
  }))
  move(engine)
  assert.equal(engine.state.axes[0].locked, true)
  const onlyPlayer = new GameEngine(level({
    axes: [{ id: 'cycle', position: point(1, 1), initialPhase: 0, signals: [false, true] }],
    mechanisms: [{ id: 'slot', kind: 'slot', position: point(0, 1), axisId: 'cycle' }],
  }))
  move(onlyPlayer)
  assert.equal(onlyPlayer.state.axes[0].locked, false)
  assert.equal(onlyPlayer.state.axes[0].phase, 1)
})

test('destroying a slot occupant releases its axis; covering the slot with a door does not lock it', () => {
  const engine = new GameEngine(level({
    axes: [hot, { id: 'cycle', position: point(1, 3), initialPhase: 0, signals: [false, true] }],
    entities: [player(), box('box', 1, 2), box('stone', 2, 2, 'stone')],
    walls: [point(3, 2)], mechanisms: [{ id: 'slot', kind: 'slot', position: point(1, 2), axisId: 'cycle' }],
    doors: [door('door', 1, 2)],
  }))
  move(engine)
  assert.deepEqual(engine.state.axes[1], { id: 'cycle', phase: 0, locked: false })
  move(engine)
  assert.deepEqual(engine.state.axes[1], { id: 'cycle', phase: 1, locked: false })
})

test('destruction refreshes pressure signals before the next pending door executes', () => {
  const engine = new GameEngine(level({
    axes: [hot], entities: [player(), box('box', 1, 2)], walls: [point(2, 2)],
    mechanisms: [{ id: 'plate', kind: 'pressure', position: point(1, 2) }],
    doors: [door('crusher', 1, 2), { id: 'controlled', position: point(5, 2), direction: 'right', initialExtended: false, inputs: [{ kind: 'pressure', id: 'plate' }] }],
  }))
  const trace = move(engine)
  assert.equal(engine.state.pressures[0].active, false)
  assert.equal(engine.state.doors[1].extended, false)
  assert.ok(!trace.actions.some(action => action.sourceId === 'controlled'))
})

test('real loops are detected; fault and transport markers restore exactly on undo', () => {
  const engine = new GameEngine(level({
    entities: [player(), box('box', 2, 2)],
    mechanisms: [conveyor('A', 'A', 2, 2), conveyor('B', 'B', 3, 2, 'left')],
  }))
  const initial = engine.state
  const trace = move(engine)
  assert.equal(engine.state.outcome.kind, 'loop')
  assert.ok(trace.actions.some(action => action.kind === 'outcome'))
  engine.undo()
  assert.equal(engine.state, initial)
  const again = move(engine)
  assert.deepEqual(again, trace)
})

test('opposite arrows with one logical belt ID stop after one move instead of falsely reporting a loop', () => {
  const engine = new GameEngine(level({
    entities: [player(), box('box', 2, 2)],
    mechanisms: [conveyor('first', 'A', 2, 2), conveyor('second', 'A', 3, 2, 'left')],
  }))
  move(engine)
  assert.equal(engine.state.outcome.kind, 'playing')
  assert.equal(entity(engine.state, 'box').conveyorId, 'A')
})

test('blocked probes settle normally; victory is checked after the entire chain', () => {
  const engine = new GameEngine(level({ exit: point(1, 0) }))
  move(engine, 'right')
  assert.equal(engine.state.outcome.kind, 'won')
  assert.equal(engine.move('down').accepted, false)
  engine.undo()
  assert.equal(engine.state.outcome.kind, 'playing')
  const transient = new GameEngine(level({
    exit: point(1, 1), axes: [hot], entities: [player(0, 1)], doors: [door('door', 1, 1)],
  }))
  move(transient, 'right')
  assert.deepEqual(entity(transient.state, 'player').position, point(2, 1))
  assert.equal(transient.state.outcome.kind, 'playing')
})

test('action records replay the exact state, including destruction, signals, clocks and outcome', () => {
  const engine = new GameEngine(level({
    axes: [hot], entities: [player(), box('box', 1, 2)], walls: [point(2, 2)],
    mechanisms: [{ id: 'plate', kind: 'pressure', position: point(1, 2) }], doors: [door('door', 1, 2)],
  }))
  const trace = move(engine)
  let replay = trace.before
  for (const action of trace.actions) {
    assert.ok(action.dependsOn.every(id => id < action.id))
    replay = applyChanges(replay, action.changes)
  }
  assert.deepEqual(replay, trace.after)
  engine.reset()
  assert.deepEqual(engine.state, trace.before)
  assert.equal(engine.canUndo, false)
})

test('animation preserves conveyor-to-door causality and moves door and box together', () => {
  const engine = new GameEngine(level({
    entities: [player(), box('box', 1, 2)],
    mechanisms: [conveyor('belt', 'A', 1, 2), { id: 'plate', kind: 'pressure', position: point(2, 2) }],
    doors: [{ id: 'door', position: point(2, 2), direction: 'up', initialExtended: false, inputs: [{ kind: 'pressure', id: 'plate' }] }],
  }))
  const plan = createAnimationPlan(move(engine))
  const transport = plan.clips.find(clip => clip.action.kind === 'conveyor')!
  const extension = plan.clips.find(clip => clip.action.kind === 'door')!
  assert.equal(extension.startMs, transport.endMs)
  const during = sampleAnimation(plan, (extension.startMs + extension.endMs) / 2)
  assert.equal(during.entities.find(item => item.entityId === 'box')!.progress, 0.5)
  assert.equal(during.doors[0].progress, 0.5)
  assert.equal(during.state.pressures[0].active, true)
  assert.deepEqual(sampleAnimation(plan, plan.durationMs).state, engine.state)
})

test('independent actions can animate concurrently; shared space keeps dependencies', () => {
  const engine = new GameEngine(level({ axes: [hot], doors: [door('one', 3, 2), door('two', 5, 2)] }))
  const plan = createAnimationPlan(move(engine))
  const doors = plan.clips.filter(clip => clip.action.kind === 'door')
  assert.equal(doors[0].startMs, doors[1].startMs)
  assert.equal(doors[0].endMs, doors[1].endMs)
})

test('easing keeps a pushed box one cell ahead and preserves raw time progress', () => {
  const engine = new GameEngine(level({ entities: [player(), box('box', 1, 0)] }))
  const trace = move(engine, 'right')
  const expectedQuarter = [0.25, 0.4375, 0.578125, 0.0625]
  for (const [index, easing] of motionEasings.entries()) {
    const plan = createAnimationPlan(trace, { movementMs: 100, clockMs: 0, easing })
    const start = sampleAnimation(plan, 0).entities.find(item => item.entityId === 'player')!
    assert.deepEqual(start.position, point(0, 0))
    for (const elapsed of [1, 25, 50, 75, 99]) {
      const frame = sampleAnimation(plan, elapsed)
      const playerMotion = frame.entities.find(item => item.entityId === 'player')!
      const boxMotion = frame.entities.find(item => item.entityId === 'box')!
      assert.equal(playerMotion.progress, elapsed / 100)
      assert.ok(Math.abs(boxMotion.position.x - playerMotion.position.x - 1) < 1e-12)
      if (elapsed === 25) assert.equal(playerMotion.position.x, expectedQuarter[index])
    }
    assert.deepEqual(sampleAnimation(plan, plan.durationMs).state, engine.state)
  }
})

test('eased door displacement stays synchronized with its pushed entity', () => {
  const engine = new GameEngine(level({
    entities: [player(), box('box', 1, 2)],
    mechanisms: [conveyor('belt', 'A', 1, 2), { id: 'plate', kind: 'pressure', position: point(2, 2) }],
    doors: [{ id: 'door', position: point(2, 2), direction: 'up', initialExtended: false, inputs: [{ kind: 'pressure', id: 'plate' }] }],
  }))
  const plan = createAnimationPlan(move(engine), { easing: 'ease-out-cubic' })
  const clip = plan.clips.find(item => item.action.kind === 'door')!
  const frame = sampleAnimation(plan, clip.startMs + (clip.endMs - clip.startMs) / 4)
  const motion = frame.entities.find(item => item.entityId === 'box')!
  assert.equal(frame.doors[0].extension, 0.578125)
  assert.equal(motion.position.y, motion.from.y + (motion.to.y - motion.from.y) * frame.doors[0].extension)
})

test('derived AND targets wait for inputs that changed before the target became active', () => {
  const engine = new GameEngine(level({
    axes: [{ id: 'cycle', position: point(7, 1), initialPhase: 0, signals: [false, true] }],
    mechanisms: [{ id: 'plate', kind: 'pressure', position: point(0, 1) }],
    doors: [{ id: 'door', position: point(4, 2), direction: 'right', initialExtended: false,
      inputs: [{ kind: 'pressure', id: 'plate' }, { kind: 'axis', id: 'cycle' }] }],
  }))
  const animation = createAnimationPlan(move(engine))
  const playerClip = animation.clips.find(clip => clip.action.kind === 'player')!
  const clockClip = animation.clips.find(clip => clip.action.kind === 'clock')!
  assert.ok(clockClip.startMs >= playerClip.endMs)
  assertInvariants(engine, sampleAnimation(animation, 50).state)
  for (const clip of animation.clips) assertInvariants(engine, sampleAnimation(animation, clip.endMs).state)
})

test('slot occupancy changes sharing one axis remain ordered even if the first leaves its lock unchanged', () => {
  const engine = new GameEngine(level({
    axes: [hot, { id: 'cycle', position: point(3, 2), initialPhase: 0, signals: [false, true] }],
    entities: [player(), box('one', 2, 2), box('two', 4, 2)],
    mechanisms: [
      { id: 'first', kind: 'slot', position: point(2, 2), axisId: 'cycle' },
      { id: 'second', kind: 'slot', position: point(4, 2), axisId: 'cycle' },
    ],
    doors: [door('one', 2, 2, 'down'), door('two', 4, 2, 'up')],
  }))
  const animation = createAnimationPlan(move(engine))
  const doors = animation.clips.filter(clip => clip.action.kind === 'door')
  assert.ok(doors[1].startMs >= doors[0].endMs)
  for (const clip of animation.clips) assertInvariants(engine, sampleAnimation(animation, clip.endMs).state)
})

test('controller buffers only the latest direction and finishes the current animation within its budget', () => {
  const controller = new GameController(level({ entities: [player(2, 2)] }))
  assert.equal(controller.input('right'), 'started')
  assert.equal(controller.state.turn, 1)
  assert.equal(controller.frame().finished, false)
  assert.equal(controller.input('down'), 'buffered')
  assert.equal(controller.input('left'), 'buffered')
  assert.equal(controller.pendingDirection, 'left')
  controller.advance(32)
  assert.equal(controller.state.turn, 2)
  assert.deepEqual(entity(controller.state, 'player').position, point(2, 2))
  assert.equal(controller.pendingDirection, null)
  controller.advance(1000)
  assert.equal(controller.isAnimating, false)
  assert.equal(controller.state.turn, 2)
})

test('buffered invalid movement does not consume a turn; undo interrupts playback and pending input', () => {
  const controller = new GameController(level({ entities: [player(2, 2)], walls: [point(3, 1)] }))
  const initial = controller.state
  controller.input('right')
  controller.input('up')
  controller.advance(32)
  assert.equal(controller.state.turn, 1)
  assert.equal(controller.isAnimating, false)
  controller.input('down')
  controller.input('left')
  controller.undo()
  assert.equal(controller.pendingDirection, null)
  assert.equal(controller.isAnimating, false)
  controller.undo()
  assert.equal(controller.frame().state, initial)
  controller.advance(1000)
  assert.equal(controller.state, initial)
})

test('terminal results discard movement input, while zero-duration playback and reset remain usable', () => {
  const controller = new GameController(level({ exit: point(1, 0) }))
  controller.input('right')
  assert.equal(controller.input('down'), 'finished')
  assert.equal(controller.pendingDirection, null)
  controller.advance(1000)
  assert.equal(controller.state.outcome.kind, 'won')
  controller.reset()
  assert.equal(controller.state.turn, 0)
  const instant = new GameController(level(), { movementMs: 0, clockMs: 0, doorMs: 0 })
  instant.input('right')
  assert.equal(instant.isAnimating, false)
  assert.deepEqual(entity(instant.frame().state, 'player').position, point(1, 0))
})

test('bad movement directions and playback times are rejected without mutation', () => {
  const controller = new GameController(level())
  const before = controller.state
  assert.throws(() => controller.input('diagonal' as Direction), RangeError)
  assert.throws(() => new GameEngine(level()).move('diagonal' as Direction), RangeError)
  assert.throws(() => controller.advance(-1), RangeError)
  assert.throws(() => new GameController(level(), { finishWithinMs: 0 }), RangeError)
  assert.throws(() => new GameController(level(), { movementMs: NaN }), RangeError)
  assert.equal(controller.state, before)
})

test('level validation rejects malformed data, invalid references and overlapping occupancy', () => {
  const cases: unknown[] = [
    null,
    level({ width: 0 }),
    level({ walls: [point(1, 1), point(1, 1)] }),
    level({ entities: [] }),
    level({ entities: [player(), { ...player(1, 0), id: 'other' }] }),
    level({ entities: [player(), box('box', 0, 0)] }),
    level({ entities: [player(), box('box', 9, 0)] }),
    level({ mechanisms: [conveyor('one', 'A', 1, 1), conveyor('two', 'B', 1, 1)] }),
    level({ mechanisms: [conveyor('one', 'A', 7, 5)] }),
    level({ mechanisms: [{ id: 'slot', kind: 'slot', position: point(2, 2), axisId: 'missing' }] }),
    level({ axes: [{ id: 'bad', position: point(7, 1), initialPhase: 1, signals: [false] }] }),
    level({ doors: [door('bad', 0, 0, 'left', [], true)] }),
    level({ doors: [door('unknown', 2, 2)] }),
    level({ axes: [hot], doors: [door('one', 2, 2, 'left', [], true), door('two', 2, 2, 'right', [], true)] }),
  ]
  for (const value of cases) assert.throws(() => parseLevel(value), LevelValidationError)
})

test('level definitions are detached from caller objects and retain memory order', () => {
  const definition = structuredClone(level({ axes: [hot], doors: [door('z', 2, 2), door('a', 2, 2, 'left')] }))
  const engine = new GameEngine(definition)
  assert.deepEqual(engine.level.doors.map(item => item.id), ['z', 'a'])
  const mutableDoors = definition.doors as DoorDefinition[]
  mutableDoors.reverse()
  move(engine)
  assert.equal(engine.state.doors[0].extended, true)
  assert.equal(engine.state.doors[1].extended, false)
})

test('cycle bases block walking, pushing, and conveying without changing their position', () => {
  const axis = (x: number, y: number) => ({ id: 'cycle', position: point(x, y), initialPhase: 0, signals: [false, true] })
  const walking = new GameEngine(level({ axes: [axis(1, 0)] }))
  const initial = walking.state
  assert.equal(walking.move('right').accepted, false)
  assert.strictEqual(walking.state, initial)
  move(walking)
  assert.equal(walking.state.axes[0].phase, 1)
  assert.deepEqual(walking.level.axes[0].position, point(1, 0))

  const pushing = new GameEngine(level({ axes: [axis(2, 1)], entities: [player(0, 1), box('box', 1, 1)] }))
  assert.equal(pushing.move('right').accepted, false)
  assert.deepEqual(entity(pushing.state, 'box').position, point(1, 1))

  const conveying = new GameEngine(level({ axes: [axis(2, 2)], entities: [player(), box('box', 1, 2)], mechanisms: [conveyor('belt', 'A', 1, 2)] }))
  move(conveying)
  assert.deepEqual(entity(conveying.state, 'box').position, point(1, 2))
  assertInvariants(conveying)
})

test('a cycle base is a fixed obstacle to a door pushing a box', () => {
  const engine = new GameEngine(level({
    axes: [{ ...hot, position: point(3, 2) }], entities: [player(), box('box', 2, 2)], doors: [door('pusher', 2, 2)],
  }))
  move(engine)
  assert.equal(entity(engine.state, 'box').position, null)
  assert.deepEqual(engine.level.axes[0].position, point(3, 2))
  assert.equal(engine.state.doors[0].extended, true)
  assertInvariants(engine)
  assert.ok(engine.undo())
  assert.deepEqual(entity(engine.state, 'box').position, point(2, 2))
})

test('cycle bases require distinct free map cells and brake slots must be adjacent', () => {
  const axis = { id: 'cycle', position: point(1, 1), initialPhase: 0, signals: [false, true, false, true] }
  const valid = level({ axes: [axis] })
  const cases: unknown[] = [
    { ...valid, axes: [{ id: 'cycle', initialPhase: 0, signals: [true] }] },
    { ...valid, axes: [{ ...axis, position: point(8, 1) }] },
    { ...valid, axes: [axis, { ...axis, id: 'second' }] },
    { ...valid, walls: [point(1, 1)] },
    { ...valid, exit: point(1, 1) },
    { ...valid, entities: [player(1, 1)] },
    { ...valid, doors: [door('door', 1, 1, 'right', [], false)] },
    { ...valid, mechanisms: [{ id: 'plate', kind: 'pressure', position: point(1, 1) }] },
    { ...valid, mechanisms: [{ id: 'slot', kind: 'slot', position: point(2, 2), axisId: 'cycle' }] },
    { ...valid, mechanisms: [{ id: 'slot', kind: 'slot', position: point(4, 1), axisId: 'cycle' }] },
  ]
  for (const value of cases) assert.throws(() => parseLevel(value), LevelValidationError)
  const parsed = parseLevel({ ...valid, mechanisms: [{ id: 'slot', kind: 'slot', position: point(2, 1), axisId: 'cycle' }] })
  assert.deepEqual(parsed.axes[0].signals, axis.signals, 'Every phase retains its independently configured output')
})

test('long chains have no fixed animation cap and buffered input can shorten their presentation', () => {
  const mechanisms = Array.from({ length: 60 }, (_, index) => conveyor(`tile-${index}`, `belt-${index}`, index + 1, 1))
  const controller = new GameController(level({
    width: 70, height: 3, exit: point(69, 2),
    entities: [player(), box('box', 1, 1)], mechanisms,
  }))
  controller.input('down')
  assert.deepEqual(entity(controller.state, 'box').position, point(61, 1))
  assert.ok(controller.animation!.durationMs >= 5400)
  controller.input('down')
  controller.advance(32)
  assert.equal(controller.state.turn, 2)
  assert.deepEqual(entity(controller.state, 'player').position, point(0, 2))
  controller.advance(1000)
  assert.equal(controller.isAnimating, false)
})

test('initial exit placement wins immediately and reset restores the same initial result', () => {
  const engine = new GameEngine(level({ exit: point(0, 0) }))
  assert.equal(engine.state.outcome.kind, 'won')
  assert.equal(engine.move('right').accepted, false)
  assert.equal(engine.reset().outcome.kind, 'won')
})

test('generated small boards preserve occupancy, deterministic replay and animation dependencies', () => {
  let seed = 51927
  function random(maximum: number) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % maximum
  }
  const directions: Direction[] = ['up', 'right', 'down', 'left']
  for (let board = 0; board < 24; board += 1) {
    const positions: Position[] = []
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 6; x += 1) {
        if ((x !== 0 || y !== 0) && (x !== 5 || y !== 4)) positions.push(point(x, y))
      }
    }
    const take = () => positions.splice(random(positions.length), 1)[0]
    const entities: EntityDefinition[] = [player()]
    for (let index = 0; index < 4; index += 1) {
      entities.push({ id: `object-${index}`, kind: index % 2 === 0 ? 'box' : 'stone', position: take() })
    }
    const available: Position[] = []
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 6; x += 1) if (x !== 5 || (y !== 4 && y !== 2)) available.push(point(x, y))
    }
    const ground = () => available.splice(random(available.length), 1)[0]
    const mechanisms: MechanismDefinition[] = []
    for (let index = 0; index < 5; index += 1) {
      const position = ground()
      mechanisms.push(conveyor(`conveyor-${index}`, `belt-${index % 2}`, position.x, position.y, directions[random(4)]))
    }
    mechanisms.push({ id: 'plate', kind: 'pressure', position: ground() })
    mechanisms.push({ id: 'slot', kind: 'slot', position: point(5, 2), axisId: 'cycle' })
    const doors = []
    for (let index = 0; index < 3; index += 1) {
      const position = point(random(6), random(5))
      doors.push(door(`door-${index}`, position.x, position.y, directions[random(4)]))
    }
    const definition = level({
      width: 7, height: 5, exit: point(5, 4), entities, mechanisms, doors,
      axes: [{ ...hot, position: point(6, 0) }, { id: 'cycle', position: point(6, 2), initialPhase: random(3), signals: [false, true, false] }],
    })
    const engine = new GameEngine(definition)
    for (let step = 0; step < 12; step += 1) {
      if (engine.state.outcome.kind !== 'playing') engine.undo()
      const previous = engine.state
      const direction = directions[random(4)]
      const result = engine.move(direction)
      assertInvariants(engine)
      if (!result.accepted) {
        assert.equal(engine.state, previous)
        continue
      }
      let replay = result.trace.before
      for (const action of result.trace.actions) replay = applyChanges(replay, action.changes)
      assert.deepEqual(replay, engine.state)
      const animation = createAnimationPlan(result.trace)
      for (const clip of animation.clips) {
        assertInvariants(engine, sampleAnimation(animation, clip.endMs).state)
        for (const dependency of clip.action.dependsOn) {
          assert.ok(animation.clips[dependency].endMs <= clip.startMs)
        }
      }
      engine.undo()
      assert.equal(engine.state, previous)
      const repeated = engine.move(direction)
      assert.deepEqual(repeated, result)
    }
  }
})
