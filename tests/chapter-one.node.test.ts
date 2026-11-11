import assert from 'node:assert/strict'
import test from 'node:test'
import { GameEngine } from '../src/engine/index.ts'
import { chapterOne } from '../src/levels/chapter-one.ts'
import { chapterOneSolutions, decode } from './fixtures/chapter-one-solutions.ts'

for (const puzzle of chapterOne) {
  test(`${puzzle.number} ${puzzle.title}: the reference solution reaches the exit`, () => {
    const route = chapterOneSolutions[puzzle.definition.id]
    assert.ok(route, `Missing reference solution for ${puzzle.definition.id}`)
    const engine = new GameEngine(puzzle.definition)
    for (const [index, direction] of decode(route).entries()) {
      assert.ok(engine.move(direction).accepted, `Move ${index + 1} (${direction}) is blocked`)
    }
    assert.equal(engine.state.outcome.kind, 'won')
  })
}
