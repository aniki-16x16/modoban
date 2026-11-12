import assert from 'node:assert/strict'
import test from 'node:test'
import { GameEngine } from '../src/engine/index.ts'
import { allLevels } from '../src/levels/index.ts'
import { levelSolutions, decode } from './fixtures/level-solutions.ts'

for (const puzzle of allLevels) {
  test(`${puzzle.definition.id} ${puzzle.title}: the reference solution reaches the exit`, () => {
    const route = levelSolutions[puzzle.definition.id]
    assert.ok(route, `Missing reference solution for ${puzzle.definition.id}`)
    const engine = new GameEngine(puzzle.definition)
    for (const [index, direction] of decode(route).entries()) {
      assert.ok(engine.move(direction).accepted, `Move ${index + 1} (${direction}) is blocked`)
    }
    assert.equal(engine.state.outcome.kind, 'won')
  })
}
