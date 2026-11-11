import assert from 'node:assert/strict'
import test from 'node:test'
import { GameController, GameEngine } from '../src/engine/index.ts'
import type { GameState, LevelDefinition, Position } from '../src/engine/index.ts'
import { resolveTurn } from '../src/engine/simulation.ts'
import { chapterOne } from '../src/levels/chapter-one.ts'
import { chapterOneSolutions, decode } from './fixtures/chapter-one-solutions.ts'
import { solve, solveFrom, stateKey } from './helpers/solve.ts'

const same = (a: Position | null, b: Position) => a?.x === b.x && a.y === b.y
const boxAt = (state: GameState, position: Position) => state.entities.some(item => item.kind === 'box' && same(item.position, position))

function play(engine: GameEngine, route: string) {
  for (const direction of decode(route)) assert.ok(engine.move(direction).accepted, `Blocked ${direction} on turn ${engine.state.turn + 1}`)
}

function initialPushChoices(level: LevelDefinition, initial = new GameEngine(level).state) {
  const queue = [initial]
  const seen = new Set([stateKey(initial)])
  const choices = new Set<string>()
  for (let head = 0; head < queue.length; head += 1) {
    for (const direction of ['up', 'right', 'down', 'left'] as const) {
      const result = resolveTurn(level, queue[head], direction)
      if (!result.accepted) continue
      const changed = result.state.entities.find((entity, index) => entity.kind === 'box'
        && JSON.stringify(entity.position) !== JSON.stringify(queue[head].entities[index].position))
      if (changed) { choices.add(`${changed.id}:${direction}`); continue }
      const key = stateKey(result.state)
      if (!seen.has(key)) { seen.add(key); queue.push(result.state) }
    }
  }
  return choices
}

// These three puzzles precede the gate-push lesson and must not require its mechanic.
for (const [index, puzzle] of chapterOne.slice(0, 3).entries()) {
  test(`${puzzle.number} ${puzzle.title}: alternative plans win using only taught rules`, () => {
    const level = puzzle.definition
    assert.equal(level.axes.length, 0)
    assert.ok(level.mechanisms.every(item => item.kind === 'pressure'))
    assert.ok(level.doors.every(item => item.initialExtended && item.inputs.length === 1 && item.inputs[0].kind === 'pressure'))
    assert.equal(level.entities.filter(item => item.kind === 'box').length, 2)
    const a = level.mechanisms.find(item => item.id === 'A')!.position
    const firstHolders = new Set<string>()
    const relayParking = new Set<string>()
    const b = level.mechanisms.find(item => item.id === 'B')!.position
    const c = level.mechanisms.find(item => item.id === 'C')!.position
    for (const route of chapterOneSolutions[index]) {
      const engine = new GameEngine(level)
      const initial = engine.state
      const controller = new GameController(level)
      let firstHolder: string | undefined
      let firstBHolder: string | undefined
      let previousBHolder: string | undefined
      let recordedParking = false
      const bDoorStates = [true]
      for (const direction of decode(route)) {
        const result = engine.move(direction)
        assert.ok(result.accepted)
        // Gate pushing/destruction has not been taught yet, so it cannot be needed here.
        for (const action of result.trace.actions) {
          assert.ok(action.kind !== 'door' || action.changes.every(change => change.kind !== 'entity'))
        }
        assert.equal(controller.input(direction), 'started')
        controller.advance(1000)
        assert.deepEqual(controller.frame().state, engine.state)
        assert.ok(engine.state.entities.every(item => item.position !== null))
        firstHolder ??= engine.state.entities.find(item => item.kind === 'box' && same(item.position, a))?.id
        if (index === 1) {
          const bHolder = engine.state.entities.find(item => item.kind === 'box' && same(item.position, b))?.id
          firstBHolder ??= bHolder
          if (previousBHolder && !bHolder && !recordedParking) {
            const replacement = engine.state.entities.find(item => item.kind === 'box' && item.id !== firstBHolder)!
            relayParking.add(`${replacement.position!.x},${replacement.position!.y}`)
            assert.ok(replacement.position!.x >= 8, 'The replacement crate must already be inside when the original leaves B')
            recordedParking = true
          }
          previousBHolder = bHolder
          const closed = engine.state.doors.find(item => item.id === 'B')!.extended
          if (bDoorStates.at(-1) !== closed) bDoorStates.push(closed)
        }
      }
      assert.ok(firstHolder)
      firstHolders.add(firstHolder)
      assert.equal(engine.state.outcome.kind, 'won')
      assert.equal(controller.frame().state.outcome.kind, 'won')
      const final = engine.state
      assert.equal(engine.state.pressures.find(item => item.id === 'A')!.active, false, 'The temporary switch must be recovered')
      assert.ok(engine.state.pressures.filter(item => item.id !== 'A').every(item => item.active))
      if (index === 1) {
        assert.ok(firstBHolder)
        assert.equal(engine.state.entities.find(item => item.kind === 'box' && same(item.position, c))!.id, firstBHolder)
        assert.notEqual(engine.state.entities.find(item => item.kind === 'box' && same(item.position, b))!.id, firstBHolder)
        assert.deepEqual(bDoorStates.slice(0, 3), [true, false, true], 'The outbound opening must close again')
        assert.ok(bDoorStates.length >= 4)
        assert.equal(bDoorStates.at(-1), false, 'The return gate must reopen; walking across B can also create brief extra pulses')
      }
      if (index === 2) {
        assert.equal(engine.state.entities.find(item => item.kind === 'box' && same(item.position, c))!.id, firstHolder,
          'The crate sent beyond C to A must return to C from the exit side')
      }
      const last = decode(route).at(-1)!
      assert.equal(engine.undo(), true)
      engine.move(last)
      assert.deepEqual(engine.state, final)
      while (engine.canUndo) engine.undo()
      assert.equal(engine.state, initial)
      controller.reset()
      assert.deepEqual(controller.state, initial)
    }
    if (index === 0 || index === 2) assert.equal(firstHolders.size, 2, 'Either crate can take the temporary switch assignment')
    if (index === 1) assert.deepEqual(relayParking, new Set(['9,8', '11,8']), '02 supports staging on either side of the shared stance')
  })

  if (index === 0 || index === 2) test(`${puzzle.number}: initial walking exposes several real crate choices`, () => {
    const choices = initialPushChoices(puzzle.definition)
    assert.ok(choices.size >= 4)
    assert.ok(new Set([...choices].map(choice => choice.split(':')[0])).size >= 2)
  })
}

test('01: the tempting immediate A placement jams both adjacent crates', () => {
  const engine = new GameEngine(chapterOne[0].definition)
  play(engine, 'dluu')
  const a = engine.level.mechanisms.find(item => item.id === 'A')!.position
  assert.ok(boxAt(engine.state, a))
  assert.ok(boxAt(engine.state, { x: a.x + 1, y: a.y }))
  assert.equal(solveFrom(engine.level, engine.state), null, 'This branch must fail for a real spatial reason')
  while (engine.canUndo) engine.undo()
  play(engine, chapterOneSolutions[0][0])
  assert.equal(engine.state.outcome.kind, 'won', 'Undo can recover from the wrong commitment')
})

test('02: the loading bay offers choices involving both crates after importing the replacement', () => {
  const engine = new GameEngine(chapterOne[1].definition)
  const replacementId = engine.state.entities.find(item => item.kind === 'box' && item.position!.x < 7)!.id
  let staged = false
  for (const direction of decode(chapterOneSolutions[1][1])) {
    assert.ok(engine.move(direction).accepted)
    const replacement = engine.state.entities.find(item => item.id === replacementId)!
    if (same(replacement.position, { x: 9, y: 8 })) { staged = true; break }
  }
  assert.ok(staged)
  const choices = initialPushChoices(engine.level, engine.state)
  assert.ok(choices.size >= 3)
  assert.equal(new Set([...choices].map(choice => choice.split(':')[0])).size, 2)
})

test('02: keeping B permanently open cannot win, so 01-style monotonic opening is insufficient', () => {
  const level = chapterOne[1].definition
  assert.equal(solve(level, (before, after) => before.doors.find(item => item.id === 'B')!.extended
    || !after.doors.find(item => item.id === 'B')!.extended), null)
})

test('02: the outside crate must eventually take over B', () => {
  const level = chapterOne[1].definition
  const outsideCrateId = level.entities.find(item => item.kind === 'box' && item.position.x < 7)!.id
  const b = level.mechanisms.find(item => item.id === 'B')!.position
  assert.equal(solve(level, (_before, after) => !same(after.entities.find(item => item.id === outsideCrateId)!.position, b)), null)
})

test('02: delivering C while leaving the other crate outside strands the return route', () => {
  const engine = new GameEngine(chapterOne[1].definition)
  play(engine, 'uuruuurrrrddduuullllddddddrrrruuuu')
  const a = engine.level.mechanisms.find(item => item.id === 'A')!.position
  const b = engine.level.mechanisms.find(item => item.id === 'B')!.position
  const c = engine.level.mechanisms.find(item => item.id === 'C')!.position
  assert.ok(boxAt(engine.state, a))
  assert.ok(!boxAt(engine.state, b))
  assert.ok(boxAt(engine.state, c))
  assert.equal(engine.state.doors.find(item => item.id === 'A')!.extended, false, 'An open outbound gate does not guarantee an accessible return path')
  assert.equal(solveFrom(engine.level, engine.state), null)
  while (engine.canUndo) engine.undo()
  play(engine, chapterOneSolutions[1][0])
  assert.equal(engine.state.outcome.kind, 'won')
})

test('01: safely stepping on and off the plate demonstrates the rule before committing the crate', () => {
  const engine = new GameEngine(chapterOne[0].definition)
  const boxesBefore = engine.state.entities.filter(item => item.kind === 'box')
  play(engine, 'dlluuru')
  assert.equal(engine.state.pressures.find(item => item.id === 'A')!.active, true)
  assert.equal(engine.state.doors.find(item => item.id === 'A')!.extended, false)
  assert.ok(engine.move('down').accepted)
  assert.equal(engine.state.pressures.find(item => item.id === 'A')!.active, false)
  assert.equal(engine.state.doors.find(item => item.id === 'A')!.extended, true)
  assert.equal(engine.state.outcome.kind, 'playing')
  assert.deepEqual(engine.state.entities.filter(item => item.kind === 'box'), boxesBefore)
})

test('03: C must be filled from the exit side, even when all engine actions are available', () => {
  const level = chapterOne[2].definition
  const c = level.mechanisms.find(item => item.id === 'C')!.position
  assert.equal(solve(level, (before, after) => !before.entities.some(entity => entity.kind === 'box'
    && same(entity.position, { x: c.x + 1, y: c.y })
    && same(after.entities.find(item => item.id === entity.id)!.position, c))), null,
  'Forward deliveries alone must not solve the puzzle; at least one crate has to pass C and return from the right')
})

test('03: filling both exit switches from the entrance opens the doors but seals the player outside', () => {
  const engine = new GameEngine(chapterOne[2].definition)
  play(engine, 'luulurrrrrrlllddlulurrr')
  for (const id of ['B', 'C']) {
    assert.ok(boxAt(engine.state, engine.level.mechanisms.find(item => item.id === id)!.position))
    assert.equal(engine.state.doors.find(item => item.id === id)!.extended, false)
  }
  assert.equal(engine.state.outcome.kind, 'playing')
  assert.equal(solveFrom(engine.level, engine.state), null, 'Open exit doors do not resolve the blocked walking route')
  while (engine.canUndo) engine.undo()
  play(engine, chapterOneSolutions[2][0])
  assert.equal(engine.state.outcome.kind, 'won')
})
